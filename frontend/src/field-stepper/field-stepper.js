/**
 * field-stepper.js
 *
 * Full-screen, one-field-per-screen data entry overlay for a single node
 * (Manhole/Drainage/Home) + its connected edge depths — the ~10-12 tap
 * replacement for the ~24-26 tap legacy wizard drawer (see the field-data
 * stepper investigation report for the tap-cost breakdown).
 *
 * Additive only: does not remove or alter details-panel.js/renderDetails();
 * the legacy drawer keeps working unchanged. This overlay is a second,
 * independent way to fill the same node fields.
 *
 * Reads/writes shared state through the legacy S/F bridge (src/legacy/shared-state.js)
 * the same way other extracted modules do; imports directly from the other
 * already-extracted ES modules (wizard-helpers, field-history, input-flow-engine,
 * constants, snackbar, i18n) instead of round-tripping through F where a direct
 * import is available.
 *
 * Exports:
 *   - initFieldStepper()               — build the overlay DOM once (call at app init)
 *   - openFieldStepper(node, opts)     — open the stepper for a node
 *   - closeFieldStepper()              — close it
 *   - isFieldStepperOpen()             — whether the overlay is currently open
 *   - getOpenStepperNodeId()           — id of the node currently open, or null
 *   - notifyStepperOfExternalNodeUpdate(node, pointName) — TSC3 arrival hook:
 *       opens fresh if closed, does a targeted (non-hijacking) header/value
 *       refresh if the SAME node is open, or queues a switch-to chip via the
 *       snackbar system if a DIFFERENT node is open.
 *
 * Also exposes window.__openFieldStepper for non-module callers.
 */
import './field-stepper.css';

import { S, F } from '../legacy/shared-state.js';
import {
  NODE_MATERIAL_OPTIONS,
  NODE_ACCESS_OPTIONS,
  NODE_ACCURACY_OPTIONS,
  NODE_MAINTENANCE_OPTIONS,
  NODE_COVER_DIAMETERS,
  EDGE_MATERIAL_OPTIONS,
  EDGE_LINE_DIAMETERS,
  EDGE_TYPE_OPTIONS,
  getOptionLabel,
} from '../state/constants.js';
import {
  wizardGetVisibleTabs,
  wizardIsFieldFilled,
  wizardIsRTKFixed,
  WIZARD_TAB_DEFS,
} from '../legacy/wizard-helpers.js';
import { getSortedOptions, trackFieldUsage } from '../legacy/field-history.js';
import {
  evaluateRules,
  applyActions,
  normalizeEntityForRules,
} from '../utils/input-flow-engine.js';
import { showSnackbar } from '../ui/snackbar.js';
import { computeEdgeGradient } from '../features/gradient-engine.js';
import { findEdgeBetween } from '../features/connection-suggest.js';
import { isRTL } from '../i18n.js';

const t = (...args) => (typeof window.t === 'function' ? window.t(...args) : args[0]);
const esc = (s) =>
  typeof window.escapeHtml === 'function'
    ? window.escapeHtml(s)
    : String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
/** Isolate an LTR token (node id) inside RTL text — see sketch-side-panel.js's ltrToken. */
const ltrToken = (s) => `<bdi dir="ltr">${esc(s)}</bdi>`;

const NODE_TYPE_ICONS = { Manhole: 'album', Home: 'home', Drainage: 'water_drop' };

// ── Module-local DOM refs + state ───────────────────────────────────────────
let overlayEl = null;
let typeIconEl = null;
let typeLabelEl = null;
let idEl = null;
let dotsEl = null;
let currentValueEl = null;
let bodyEl = null;
let navEl = null;

let currentNode = null;
let fieldOrderCache = [];
let currentIndex = 0;
/** Fields the user explicitly skipped without setting a value this session. */
let skippedFields = new Set();
/**
 * Sticky dead-end flag: true for the whole session once a node was opened with
 * maintenance_status unset. Keeps maintenance_status pinned at the front of the
 * field order even after it's answered — otherwise the natural wizard order puts
 * accuracy_level BEFORE maintenance_status, and advanceAfterSet's idx+1 jump
 * silently skips a field the user was never shown (see computeFieldOrder()).
 */
let deadEndUnlockActive = false;
/** Debounce window (ms) after a chip-driven screen swap — see handleChipSelect(). */
let chipTapGuardUntil = 0;
/** Handle of the currently visible "switch to it" TSC3 queue snackbar, if any. */
let tsc3QueueSnackbar = null;
/**
 * Pending connection decisions — set by tsc3-handlers when terrain can't
 * auto-decide (flat / missing Z / long jump / uphill existing edge). Keyed
 * per node id: rapid ambiguous shots each keep their own undecided record
 * (a single slot would let shot B silently discard shot A's never-shown
 * decision — a topology hole with no feedback). While an entry exists for
 * the open node, a CONNECT screen is prepended to the stepper sequence.
 * Cleared on decision; kept on close so reopening the node re-offers it.
 * Map<nodeId, { sketchId, suggestion }>
 */
const pendingConnects = new Map();

// ── Per-field chip configuration ────────────────────────────────────────────
const filterEnabled = (list) => (list || []).filter((o) => o?.enabled !== false);

const CHIP_FIELD_CONFIG = {
  accuracy_level: {
    options: () => filterEnabled(S.adminConfig?.nodes?.options?.accuracy_level ?? NODE_ACCURACY_OPTIONS),
    valueOf: (opt) => Number(opt.code),
    isSelected: (node, val) => Number(node.accuracyLevel) === val,
    apply: (node, val) => { node.accuracyLevel = val; },
  },
  maintenance_status: {
    options: () => filterEnabled(S.adminConfig?.nodes?.options?.maintenance_status ?? NODE_MAINTENANCE_OPTIONS),
    valueOf: (opt) => Number(opt.code),
    isSelected: (node, val) => Number(node.maintenanceStatus) === val,
    apply: (node, val) => { node.maintenanceStatus = val; },
    afterApply: () => F.computeNodeTypes(),
  },
  material: {
    options: () => filterEnabled(S.adminConfig?.nodes?.options?.material ?? NODE_MATERIAL_OPTIONS),
    valueOf: (opt) => opt.label,
    isSelected: (node, val) => node.material === val,
    apply: (node, val) => { node.material = val; },
  },
  cover_diameter: {
    // No admin-configurable option list for cover diameter (matches wizard-helpers.js
    // buildWizardFieldHTML, which also reads NODE_COVER_DIAMETERS directly).
    options: () => NODE_COVER_DIAMETERS.map((d) => ({ code: d, label: d })),
    valueOf: (opt) => opt.label,
    isSelected: (node, val) => {
      const cur = node.coverDiameter === '' || node.coverDiameter == null ? NODE_COVER_DIAMETERS[0] : String(node.coverDiameter);
      return cur === val;
    },
    apply: (node, val) => { node.coverDiameter = val === NODE_COVER_DIAMETERS[0] ? '' : val; },
    shouldTrack: (node) => node.coverDiameter !== '',
  },
  access: {
    options: () => filterEnabled(S.adminConfig?.nodes?.options?.access ?? NODE_ACCESS_OPTIONS),
    valueOf: (opt) => Number(opt.code),
    isSelected: (node, val) => Number(node.access) === val,
    apply: (node, val) => { node.access = val; },
  },
};

// ── Engine + wizard gating helpers ──────────────────────────────────────────

/** Mirrors details-panel.js's RTK-fixed auto-set-accuracy-to-0 side effect. */
function forceRtkAccuracy(node) {
  if (wizardIsRTKFixed(node) && node.accuracyLevel !== 0) {
    node.accuracyLevel = 0;
    F.saveToStorage();
  }
}

/**
 * Always applies the current rule results to the entity — mirrors the
 * unconditional evaluateRules+applyActions call details-panel.js runs right
 * after its accuracy_level/maintenance_status change handlers set a new value.
 */
function applyEngineRulesUnconditional(node) {
  const ruleResults = evaluateRules(S.currentInputFlowConfig, 'nodes', normalizeEntityForRules(node));
  const updated = applyActions(node, ruleResults, S.adminConfig?.nodes?.defaults || {});
  Object.assign(node, updated);
  return ruleResults;
}

/**
 * Eager fill_value application — mirrors renderDetails()'s guarded apply so a
 * project's fill_value rules take effect the moment the node is (re)opened,
 * not only right after the triggering field itself was changed.
 */
function applyEngineRulesEagerFillIfChanged(node) {
  const ruleResults = evaluateRules(S.currentInputFlowConfig, 'nodes', normalizeEntityForRules(node));
  if (ruleResults.fillValues && ruleResults.fillValues.size > 0) {
    const propMap = {
      accuracy_level: 'accuracyLevel',
      maintenance_status: 'maintenanceStatus',
      cover_diameter: 'coverDiameter',
      material: 'material',
      access: 'access',
      engineering_status: 'nodeEngineeringStatus',
    };
    let hasChanges = false;
    for (const [field, value] of ruleResults.fillValues) {
      if (node[propMap[field] || field] !== value) { hasChanges = true; break; }
    }
    if (hasChanges) {
      const updated = applyActions(node, ruleResults, S.adminConfig?.nodes?.defaults || {});
      Object.assign(node, updated);
      F.saveToStorage();
    }
  }
}

/**
 * Compute the ordered, gated field list for the stepper.
 *
 * Starts from wizard-helpers.js's hardcoded WIZARD_CLOSED_MAINT/WIZARD_NO_COVER_MAINT
 * gating (kept intact — the legacy drawer still relies on it), then ALSO removes
 * any field the per-project input-flow rule engine disables for the current node
 * state. The engine previously had zero effect on the wizard (report item #10);
 * here its restrictions always win in addition to the hardcoded ones, so an
 * admin-configured rule that disables a field actually hides it in the stepper.
 *
 * When maintenance_status is unset (0, the "dead-end"), maintenance_status is
 * moved to the front of the order so it is always presented as the first step
 * — see the explainer rendered on that screen in renderFieldScreen(). This
 * front-move is STICKY for the whole stepper session (deadEndUnlockActive,
 * set in openFieldStepper): once the user answers maintenance, the recomputed
 * order must keep it at index 0, or the natural wizard order (accuracy_level
 * first) would put an unshown field before the just-answered one and
 * advanceAfterSet's idx+1 jump would silently skip it.
 */
function computeFieldOrder(node) {
  forceRtkAccuracy(node);
  let order = node.nodeType === 'Home' ? ['maintenance_status', 'note'] : wizardGetVisibleTabs(node);
  const ruleResults = evaluateRules(S.currentInputFlowConfig, 'nodes', normalizeEntityForRules(node));
  order = order.filter((key) => !ruleResults.disabled.has(key));
  if ((deadEndUnlockActive || Number(node.maintenanceStatus) === 0) && order.includes('maintenance_status')) {
    order = ['maintenance_status', ...order.filter((k) => k !== 'maintenance_status')];
  }
  return order;
}

function pickStartIndex(order, startField) {
  if (startField) {
    const idx = order.indexOf(startField);
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < order.length; i++) {
    if (!wizardIsFieldFilled(currentNode, order[i])) return i;
  }
  return order.length; // everything filled -> straight to the depths screen
}

// ── CONNECT screen state helpers ────────────────────────────────────────────

/** Whether the open node has a pending connection decision (valid this sketch). */
function hasConnectScreen() {
  if (!currentNode) return false;
  const entry = pendingConnects.get(String(currentNode.id));
  return !!entry && entry.sketchId === (S.currentSketchId ?? null);
}

/** The open node's pending suggestion (callers must have checked hasConnectScreen). */
function currentConnectSuggestion() {
  return pendingConnects.get(String(currentNode.id)).suggestion;
}

/**
 * A pending suggestion can go stale between shots (node deleted, edge created
 * another way, sketch switched). Returns false when it should be dropped.
 */
function validatePendingConnect() {
  if (!hasConnectScreen()) return false;
  const s = currentConnectSuggestion();
  const byId = (id) => S.nodes.find((n) => String(n.id) === String(id));
  if (s.kind === 'flip-offer') {
    return S.edges.some((e) => String(e.id) === String(s.edgeId));
  }
  return !!(byId(s.tail) && byId(s.head)) && !findEdgeBetween(S.edges, s.tail, s.head);
}

/**
 * TSC3-arrival hook (spec §B3/B4): store the connection decision for a node so
 * the stepper opens on the CONNECT screen. Pass a falsy suggestion to clear.
 * When the replaced entry's CONNECT screen is on screen right now (re-measure
 * refreshed the evidence), re-render so stale cards can't act on old data.
 */
export function setPendingConnectSuggestion(nodeId, suggestion) {
  const id = String(nodeId);
  const connectVisible =
    isFieldStepperOpen() &&
    currentNode &&
    String(currentNode.id) === id &&
    getScreenSequence()[currentIndex] === 'CONNECT';
  if (suggestion) {
    pendingConnects.set(id, { sketchId: S.currentSketchId ?? null, suggestion });
  } else {
    pendingConnects.delete(id);
  }
  if (connectVisible) render();
}

/** Pending suggestion for a node (this sketch), or null — for tsc3-handlers' re-measure refresh. */
export function getPendingConnectSuggestion(nodeId) {
  const entry = pendingConnects.get(String(nodeId));
  return entry && entry.sketchId === (S.currentSketchId ?? null) ? entry.suggestion : null;
}

function getScreenSequence() {
  return [...(hasConnectScreen() ? ['CONNECT'] : []), ...fieldOrderCache, 'DEPTHS', 'COMPLETION'];
}

// ── Navigation ───────────────────────────────────────────────────────────────

function goNext() {
  const seq = getScreenSequence();
  currentIndex = Math.min(seq.length - 1, currentIndex + 1);
  render();
}

function goBack() {
  currentIndex = Math.max(0, currentIndex - 1);
  render();
}

function advanceAfterSet(justSetKey) {
  const node = currentNode;
  fieldOrderCache = computeFieldOrder(node);
  const idx = fieldOrderCache.indexOf(justSetKey);
  // A still-pending CONNECT screen occupies seq[0] — shift field indices past it.
  const offset = hasConnectScreen() ? 1 : 0;
  currentIndex = (idx >= 0 ? idx + 1 : fieldOrderCache.length) + offset;
  render();
}

function handleChipSelect(fieldKey, opt) {
  const node = currentNode;
  const config = CHIP_FIELD_CONFIG[fieldKey];
  const val = config.valueOf(opt);
  config.apply(node, val);
  F.updateNodeTimestamp(node);
  const shouldTrack = config.shouldTrack ? config.shouldTrack(node) : true;
  if (shouldTrack) trackFieldUsage('nodes', fieldKey, val);
  applyEngineRulesUnconditional(node);
  config.afterApply?.(node);
  F.saveToStorage();
  F.scheduleDraw();
  advanceAfterSet(fieldKey);
}

// ── Rendering ────────────────────────────────────────────────────────────────

function currentValueText(fieldKey, node) {
  if (fieldKey === 'note') {
    const val = (node.note || '').trim();
    return val || null;
  }
  if (!wizardIsFieldFilled(node, fieldKey)) return null;
  // material/cover_diameter store the display label itself as the value, so
  // getOptionLabel(value) is correct regardless of admin option overrides.
  if (fieldKey === 'material') return getOptionLabel(node.material);
  if (fieldKey === 'cover_diameter') return getOptionLabel(node.coverDiameter);
  // accuracy_level/maintenance_status/access store a numeric code — look it
  // up against the SAME (possibly admin-overridden) option list the chip
  // grid itself renders, so a project's custom label text stays consistent.
  const config = CHIP_FIELD_CONFIG[fieldKey];
  if (!config) return null;
  const current = node.accuracyLevel != null && fieldKey === 'accuracy_level' ? node.accuracyLevel
    : fieldKey === 'maintenance_status' ? node.maintenanceStatus
    : node.access;
  const opt = config.options().find((o) => Number(o.code) === Number(current));
  return opt ? getOptionLabel(opt) : null;
}

function renderHeader() {
  const node = currentNode;
  const ntKey = (node.nodeType || 'Manhole').toLowerCase();
  const rawKey = 'nodeTypeLabel.' + ntKey;
  let typeLabel = t(rawKey);
  if (typeLabel === rawKey) typeLabel = t('nodeTypeLabel.manhole');
  typeIconEl.textContent = NODE_TYPE_ICONS[node.nodeType] || NODE_TYPE_ICONS.Manhole;
  typeLabelEl.textContent = typeLabel;
  idEl.textContent = String(node.id);

  const seq = getScreenSequence();
  const activeKey = seq[currentIndex];
  dotsEl.innerHTML = '';
  if (hasConnectScreen()) {
    const dot = document.createElement('span');
    dot.className =
      'field-stepper-dot field-stepper-dot--stage' + (activeKey === 'CONNECT' ? ' field-stepper-dot--current' : '');
    dotsEl.appendChild(dot);
  }
  fieldOrderCache.forEach((key) => {
    const dot = document.createElement('span');
    const filled = key === 'note' ? !!(node.note && node.note.trim()) : wizardIsFieldFilled(node, key);
    dot.className =
      'field-stepper-dot' +
      (filled ? ' field-stepper-dot--filled' : '') +
      (activeKey === key ? ' field-stepper-dot--current' : '');
    dotsEl.appendChild(dot);
  });
  ['DEPTHS', 'COMPLETION'].forEach((stage) => {
    const dot = document.createElement('span');
    dot.className = 'field-stepper-dot field-stepper-dot--stage' + (activeKey === stage ? ' field-stepper-dot--current' : '');
    dotsEl.appendChild(dot);
  });
  dotsEl.setAttribute('aria-label', t('stepper.stepOf', currentIndex + 1, seq.length));
}

function renderCurrentValueLine() {
  const seq = getScreenSequence();
  const key = seq[currentIndex];
  if (key === 'DEPTHS' || key === 'COMPLETION' || key === 'CONNECT') {
    currentValueEl.hidden = true;
    currentValueEl.innerHTML = '';
    return;
  }
  const val = currentValueText(key, currentNode);
  currentValueEl.hidden = false;
  currentValueEl.innerHTML =
    `<span class="field-stepper-current-value-label">${esc(t('stepper.currentValueLabel'))}:</span> ` +
    (val
      ? `<span class="field-stepper-current-value-val">${esc(val)}</span>`
      : `<span class="field-stepper-current-value-empty">${esc(t('stepper.noValueYet'))}</span>`);
}

function renderNav(kind, fieldKeyForSkip) {
  navEl.innerHTML = '';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'field-stepper-nav-btn field-stepper-nav-btn--back';
  backBtn.innerHTML = `<span class="material-icons" aria-hidden="true">${isRTL(S.currentLang) ? 'arrow_forward' : 'arrow_back'}</span><span>${esc(t('stepper.back'))}</span>`;
  backBtn.disabled = currentIndex === 0;
  backBtn.addEventListener('click', goBack);
  navEl.appendChild(backBtn);

  const fwdBtn = document.createElement('button');
  fwdBtn.type = 'button';
  fwdBtn.className = 'field-stepper-nav-btn field-stepper-nav-btn--forward';
  const label = kind === 'next' ? t('stepper.next') : t('stepper.skip');
  fwdBtn.innerHTML = `<span>${esc(label)}</span><span class="material-icons" aria-hidden="true">${isRTL(S.currentLang) ? 'arrow_back' : 'arrow_forward'}</span>`;
  fwdBtn.addEventListener('click', () => {
    if (kind === 'skip' && fieldKeyForSkip && !wizardIsFieldFilled(currentNode, fieldKeyForSkip)) {
      skippedFields.add(fieldKeyForSkip);
    }
    goNext();
  });
  navEl.appendChild(fwdBtn);
}

function renderChipGrid(fieldKey) {
  const node = currentNode;
  const config = CHIP_FIELD_CONFIG[fieldKey];
  const grid = document.createElement('div');
  grid.className = 'field-stepper-chip-grid';
  const sorted = getSortedOptions('nodes', fieldKey, config.options());
  sorted.forEach((opt) => {
    const val = config.valueOf(opt);
    const selected = config.isSelected(node, val);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'field-stepper-chip' + (selected ? ' field-stepper-chip--selected' : '');
    btn.textContent = getOptionLabel(opt);
    btn.addEventListener('click', () => handleChipSelect(fieldKey, opt));
    grid.appendChild(btn);
  });
  return grid;
}

function renderFieldScreen(fieldKey) {
  const node = currentNode;
  const def = WIZARD_TAB_DEFS[fieldKey];
  bodyEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'field-stepper-field-header';
  header.innerHTML = `<span class="material-icons" aria-hidden="true">${def.icon}</span><span>${esc(t(def.labelKey))}</span>`;
  bodyEl.appendChild(header);

  if (fieldKey === 'maintenance_status' && Number(node.maintenanceStatus) === 0) {
    const explainer = document.createElement('div');
    explainer.className = 'field-stepper-explainer';
    explainer.innerHTML = `<span class="material-icons" aria-hidden="true">lock_open</span><span>${esc(t('stepper.deadEndExplainer'))}</span>`;
    bodyEl.appendChild(explainer);
  }

  if (fieldKey === 'note') {
    const ta = document.createElement('textarea');
    ta.className = 'field-stepper-textarea';
    ta.rows = 5;
    ta.dir = 'auto';
    ta.placeholder = t('labels.notePlaceholder');
    ta.value = node.note || '';
    ta.addEventListener('input', (ev) => {
      node.note = ev.target.value;
      F.updateNodeTimestamp(node);
      F.debouncedSaveToStorage();
      renderCurrentValueLine();
    });
    bodyEl.appendChild(ta);
    renderNav('next', null);
  } else {
    bodyEl.appendChild(renderChipGrid(fieldKey));
    renderNav('skip', fieldKey);
  }
}

function buildEdgeDetailsChips(container, edge) {
  container.innerHTML = '';
  const rows = [
    {
      historyField: 'edge_type',
      labelKey: 'labels.edgeType',
      show: S.adminConfig?.edges?.include?.edge_type !== false,
      options: filterEnabled(S.adminConfig?.edges?.options?.edge_type ?? EDGE_TYPE_OPTIONS),
      valueOf: (opt) => opt.label,
      isSelected: (val) => edge.edge_type === val,
      apply: (val) => { edge.edge_type = val; },
    },
    {
      historyField: 'material',
      labelKey: 'labels.edgeMaterial',
      show: true,
      options: filterEnabled(S.adminConfig?.edges?.options?.material ?? EDGE_MATERIAL_OPTIONS),
      valueOf: (opt) => opt.label,
      isSelected: (val) => edge.material === val,
      apply: (val) => { edge.material = val; },
    },
    {
      historyField: 'line_diameter',
      labelKey: 'labels.lineDiameter',
      show: S.adminConfig?.edges?.include?.line_diameter !== false,
      options: filterEnabled(S.adminConfig?.edges?.options?.line_diameter ?? EDGE_LINE_DIAMETERS.map((d) => ({ code: d, label: d }))),
      valueOf: (opt) => String(opt.code),
      isSelected: (val) => String(edge.line_diameter || '') === val,
      apply: (val) => { edge.line_diameter = val; },
    },
  ];

  rows.forEach((row) => {
    if (!row.show) return;
    const section = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'field-stepper-edge-detail-label';
    label.textContent = t(row.labelKey);
    section.appendChild(label);
    const grid = document.createElement('div');
    grid.className = 'field-stepper-chip-grid field-stepper-chip-grid--compact';
    getSortedOptions('edges', row.historyField, row.options).forEach((opt) => {
      const val = row.valueOf(opt);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'field-stepper-chip field-stepper-chip--compact' + (row.isSelected(val) ? ' field-stepper-chip--selected' : '');
      btn.textContent = getOptionLabel(opt);
      btn.addEventListener('click', () => {
        row.apply(val);
        if (val !== '') trackFieldUsage('edges', row.historyField, val);
        F.saveToStorage();
        F.scheduleDraw();
        grid.querySelectorAll('.field-stepper-chip').forEach((c) => c.classList.remove('field-stepper-chip--selected'));
        btn.classList.add('field-stepper-chip--selected');
      });
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    container.appendChild(section);
  });
}

/**
 * Depths summary screen — for EACH connected edge, both tail_measurement AND
 * head_measurement are editable here regardless of which endpoint this node
 * is, killing the legacy select-each-endpoint round-trip (only the relevant
 * side was ever shown per node in the old connected-lines panel).
 *
 * The input handler mirrors details-panel.js's depth-input handler exactly:
 * sanitize digits+dot, set the edge measurement field, F.computeNodeTypes(),
 * F.debouncedSaveToStorage(), F.scheduleDraw(), gradient engine notify, and
 * emit measurement:filled on the empty->filled transition.
 */
function renderDepthsScreen() {
  const node = currentNode;
  bodyEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'field-stepper-field-header';
  header.innerHTML = `<span class="material-icons" aria-hidden="true">straighten</span><span>${esc(t('stepper.depthsTitle'))}</span>`;
  bodyEl.appendChild(header);

  const connectedEdges = S.edges.filter((e) => String(e.tail) === String(node.id) || String(e.head) === String(node.id));

  if (connectedEdges.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'field-stepper-empty';
    empty.textContent = t('stepper.depthsNone');
    bodyEl.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'field-stepper-edge-list';
    const arrow = isRTL(S.currentLang) ? '←' : '→';

    connectedEdges.forEach((e, idx) => {
      const isTail = String(e.tail) === String(node.id);
      const otherId = isTail ? e.head : e.tail;
      const card = document.createElement('div');
      card.className = 'field-stepper-edge-card';
      card.innerHTML = `
        <div class="field-stepper-edge-header">${arrow} ${ltrToken(otherId != null ? String(otherId) : '—')}</div>
        <div class="field-stepper-depth-row">
          <div class="field-stepper-depth-field">
            <label>${esc(t('stepper.depthTail'))}</label>
            <input type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" class="field-stepper-depth-input" data-edge-idx="${idx}" data-depth="tail" value="${esc(e.tail_measurement || '')}" placeholder="${esc(t('labels.optional'))}" dir="ltr" />
            <div class="field-stepper-depth-warning" data-edge-idx="${idx}" data-depth="tail"></div>
          </div>
          <div class="field-stepper-depth-field">
            <label>${esc(t('stepper.depthHead'))}</label>
            <input type="text" inputmode="decimal" pattern="[0-9]*\\.?[0-9]*" class="field-stepper-depth-input" data-edge-idx="${idx}" data-depth="head" value="${esc(e.head_measurement || '')}" placeholder="${esc(t('labels.optional'))}" dir="ltr" />
            <div class="field-stepper-depth-warning" data-edge-idx="${idx}" data-depth="head"></div>
          </div>
        </div>
        <button type="button" class="field-stepper-edge-expander" data-edge-idx="${idx}">
          <span class="material-icons" aria-hidden="true">tune</span><span>${esc(t('stepper.edgeDetailsToggle'))}</span>
        </button>
        <div class="field-stepper-edge-details" data-edge-idx="${idx}" hidden></div>
      `;
      list.appendChild(card);
    });
    bodyEl.appendChild(list);

    connectedEdges.forEach((e, idx) => {
      ['tail', 'head'].forEach((side) => {
        const input = list.querySelector(`.field-stepper-depth-input[data-edge-idx="${idx}"][data-depth="${side}"]`);
        const warnEl = list.querySelector(`.field-stepper-depth-warning[data-edge-idx="${idx}"][data-depth="${side}"]`);
        if (!input) return;
        input.addEventListener('input', (ev) => {
          const raw = String(ev.target.value || '');
          const sanitized = raw.replace(/[^0-9.]/g, '').replace(/\.(?=.*\.)/g, '');
          if (sanitized !== raw) ev.target.value = sanitized;
          const prop = side === 'tail' ? 'tail_measurement' : 'head_measurement';
          const wasEmpty = !e[prop];
          e[prop] = sanitized;
          F.computeNodeTypes();
          F.debouncedSaveToStorage();
          F.scheduleDraw();
          window.__gradientEngine?.onDepthChanged(e);
          if (wasEmpty && sanitized) {
            window.menuEvents?.emit('measurement:filled', { edgeId: e.id, side });
          }
          const num = parseFloat(sanitized);
          if (warnEl) warnEl.textContent = Number.isFinite(num) && (num > 15 || num < 0) ? t('stepper.depthRangeWarning') : '';
        });
      });

      const expanderBtn = list.querySelector(`.field-stepper-edge-expander[data-edge-idx="${idx}"]`);
      const detailsEl = list.querySelector(`.field-stepper-edge-details[data-edge-idx="${idx}"]`);
      if (expanderBtn && detailsEl) {
        expanderBtn.addEventListener('click', () => {
          const willOpen = detailsEl.hidden;
          detailsEl.hidden = !willOpen;
          if (willOpen && !detailsEl.dataset.built) {
            buildEdgeDetailsChips(detailsEl, e);
            detailsEl.dataset.built = '1';
          }
        });
      }
    });
  }

  renderNav('next', null);
}

// ── CONNECT screen (spec §B3/B3a/B3b/B4b) ───────────────────────────────────

/** Decision made (or suggestion gone) — drop the screen and land on the first unfilled field. */
function resolveConnect() {
  // Delete only the open node's own record — other nodes' undecided
  // suggestions (arrived while this screen was up) must survive.
  pendingConnects.delete(String(currentNode.id));
  fieldOrderCache = computeFieldOrder(currentNode);
  currentIndex = pickStartIndex(fieldOrderCache, null);
  render();
}

/**
 * One tappable flow-direction card: "104 → 105" + slope verdict for that
 * orientation. Terrain slope is recomputed per card so swapping shows the
 * consequence (downhill ✓ vs uphill ⚠) before the user commits.
 */
function connectDirCard(tailId, headId, { recommended = false, unverified = false, onPick }) {
  const byId = (id) => S.nodes.find((n) => String(n.id) === String(id));
  const g = computeEdgeGradient(
    { tail: tailId, head: headId, tail_measurement: '', head_measurement: '' },
    byId,
    S.coordinateScale ?? 50,
  );
  const arrow = isRTL(S.currentLang) ? '←' : '→';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className =
    'field-stepper-connect-card' + (recommended ? ' field-stepper-connect-card--recommended' : '');
  let badge = '';
  if (recommended) badge = `<span class="field-stepper-connect-badge">${esc(t('stepper.connectRecommended'))}</span>`;
  else if (unverified) badge = `<span class="field-stepper-connect-badge field-stepper-connect-badge--warn">${esc(t('stepper.connectUnverified'))}</span>`;
  let slope = '';
  if (g.slopePct != null) {
    const pct = Math.abs(g.slopePct).toFixed(1);
    slope =
      g.drop >= 0
        ? `<span class="field-stepper-connect-slope field-stepper-connect-slope--ok">${esc(t('stepper.connectSlopeOk', pct))}</span>`
        : `<span class="field-stepper-connect-slope field-stepper-connect-slope--up">${esc(t('stepper.connectSlopeUp', pct))}</span>`;
  }
  btn.innerHTML = `
    <span class="field-stepper-connect-dir">${ltrToken(String(tailId))} ${arrow} ${ltrToken(String(headId))}</span>
    <span class="field-stepper-connect-meta">${badge}${slope}</span>
  `;
  btn.addEventListener('click', onPick);
  return btn;
}

function renderConnectScreen() {
  const s = currentConnectSuggestion();
  bodyEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'field-stepper-field-header';
  header.innerHTML = `<span class="material-icons" aria-hidden="true">account_tree</span><span>${esc(t('stepper.connectTitle'))}</span>`;
  bodyEl.appendChild(header);

  const explain = document.createElement('div');
  explain.className = 'field-stepper-explainer';

  if (s.kind === 'flip-offer') {
    // Existing pair-edge runs uphill: offer the flip, but "keep" stays primary —
    // reversing committed data must be the deliberate choice (spec §6.4).
    const edge = S.edges.find((e) => String(e.id) === String(s.edgeId));
    const pct = s.evidence?.slopePct != null ? Math.abs(s.evidence.slopePct).toFixed(1) : '';
    // ids passed plain-escaped: the i18n string wraps the tail → head fragment
    // in LRI/PDI isolates itself (gradient.* convention)
    explain.innerHTML = `<span class="material-icons" aria-hidden="true">swap_vert</span><span>${esc(t('stepper.connectFlipQuestion', String(edge.tail), String(edge.head), pct))}</span>`;
    bodyEl.appendChild(explain);

    const grid = document.createElement('div');
    grid.className = 'field-stepper-connect-list';
    const keepBtn = document.createElement('button');
    keepBtn.type = 'button';
    keepBtn.className = 'field-stepper-connect-card field-stepper-connect-card--recommended';
    keepBtn.innerHTML = `<span class="field-stepper-connect-dir">${esc(t('stepper.connectKeep'))}</span>`;
    keepBtn.addEventListener('click', resolveConnect);
    grid.appendChild(keepBtn);
    const flipBtn = document.createElement('button');
    flipBtn.type = 'button';
    flipBtn.className = 'field-stepper-connect-card';
    flipBtn.innerHTML = `<span class="field-stepper-connect-dir">${esc(t('stepper.connectFlip'))}</span>`;
    flipBtn.addEventListener('click', () => {
      F.reverseEdge(s.edgeId, { directionSource: 'terrain' });
      resolveConnect();
    });
    grid.appendChild(flipBtn);
    bodyEl.appendChild(grid);
    renderNav('skip', null);
    return;
  }

  // 'ask' — direction decision for a not-yet-created edge
  const otherId = s.tail === String(currentNode.id) ? s.head : s.tail;
  const dz = s.evidence?.deltaZ != null ? Math.abs(s.evidence.deltaZ).toFixed(2) : null;
  const lenM = s.evidence?.lengthM != null ? Math.round(s.evidence.lengthM) : null;
  let reasonHtml = `<span>${esc(t('stepper.connectQuestion', String(otherId)))}</span>`;
  if (s.reason === 'flat') reasonHtml += `<span class="field-stepper-connect-reason">${esc(t('stepper.connectFlat', dz ?? '0.00'))}</span>`;
  else if (s.reason === 'no-z') reasonHtml += `<span class="field-stepper-connect-reason">${esc(t('stepper.connectNoZ'))}</span>`;
  else if (s.reason === 'far') reasonHtml += `<span class="field-stepper-connect-reason">${esc(t('stepper.connectFar', lenM ?? '?'))}</span>`;
  explain.innerHTML = `<span class="material-icons" aria-hidden="true">route</span><span class="field-stepper-connect-question">${reasonHtml}</span>`;
  bodyEl.appendChild(explain);

  const pick = (tailId, headId, viaRecommended) => () => {
    // Provenance: accepted terrain recommendation → 'terrain'; chronological
    // fallback (missing Z) → 'chronological'; any other explicit pick → 'user'.
    const directionSource =
      viaRecommended && s.preselect && s.hasZ ? 'terrain'
      : s.hasZ === false && tailId === s.tail ? 'chronological'
      : 'user';
    F.createEdge(tailId, headId, { directionSource });
    resolveConnect();
  };

  const grid = document.createElement('div');
  grid.className = 'field-stepper-connect-list';
  const unverified = s.hasZ === false;
  // 'far': "no connection" is the primary card (spec §C2) — the downhill
  // direction keeps its slope badge but must not compete as a second primary.
  grid.appendChild(connectDirCard(s.tail, s.head, { recommended: s.preselect && s.reason !== 'far', unverified, onPick: pick(s.tail, s.head, true) }));
  grid.appendChild(connectDirCard(s.head, s.tail, { onPick: pick(s.head, s.tail, false) }));

  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.className =
    'field-stepper-connect-card field-stepper-connect-card--none' +
    (s.reason === 'far' ? ' field-stepper-connect-card--recommended' : '');
  noneBtn.innerHTML = `<span class="field-stepper-connect-dir">${esc(t('stepper.connectNone'))}</span>`;
  noneBtn.addEventListener('click', resolveConnect);
  if (s.reason === 'far') grid.prepend(noneBtn);
  else grid.appendChild(noneBtn);
  bodyEl.appendChild(grid);

  renderNav('skip', null);
}

function renderCompletionScreen() {
  const node = currentNode;
  bodyEl.innerHTML = '';

  const total = fieldOrderCache.length;
  const filledCount = fieldOrderCache.filter((key) => wizardIsFieldFilled(node, key)).length;
  const pct = total > 0 ? Math.round((filledCount / total) * 100) : 100;

  const wrap = document.createElement('div');
  wrap.className = 'field-stepper-completion';
  wrap.innerHTML = `
    <div class="field-stepper-completion-title">${esc(t('stepper.completionTitle'))}</div>
    <div class="field-stepper-completion-icon material-icons" aria-hidden="true">${pct === 100 ? 'task_alt' : 'checklist'}</div>
    <div class="field-stepper-completion-percent">${pct}%</div>
    <div class="field-stepper-completion-summary">${esc(t('stepper.completionSummary', pct, filledCount, total))}</div>
    ${skippedFields.size > 0 ? `<div class="field-stepper-completion-skipped">${esc(t('stepper.completionSkipped', skippedFields.size))}</div>` : ''}
  `;
  bodyEl.appendChild(wrap);

  const buttons = document.createElement('div');
  buttons.className = 'field-stepper-completion-buttons';

  const saveNextBtn = document.createElement('button');
  saveNextBtn.type = 'button';
  saveNextBtn.className = 'field-stepper-nav-btn field-stepper-nav-btn--primary';
  saveNextBtn.innerHTML = `<span class="material-icons" aria-hidden="true">skip_next</span><span>${esc(t('stepper.saveNext'))}</span>`;
  saveNextBtn.addEventListener('click', () => {
    F.saveToStorage();
    const next = F.findNextIncompleteNode(node);
    closeFieldStepper();
    if (next) {
      S.selectedNode = next;
      S.selectedEdge = null;
      S.__wizardActiveTab = null;
      F.centerOnNode(next);
      F.renderDetails();
      F.scheduleDraw();
    } else {
      F.showToast(t('toasts.allNodesComplete'));
    }
  });
  buttons.appendChild(saveNextBtn);

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'field-stepper-nav-btn field-stepper-nav-btn--secondary';
  doneBtn.innerHTML = `<span class="material-icons" aria-hidden="true">check</span><span>${esc(t('stepper.doneClose'))}</span>`;
  doneBtn.addEventListener('click', () => closeFieldStepper());
  buttons.appendChild(doneBtn);

  bodyEl.appendChild(buttons);

  navEl.innerHTML = '';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'field-stepper-nav-btn field-stepper-nav-btn--back';
  backBtn.innerHTML = `<span class="material-icons" aria-hidden="true">${isRTL(S.currentLang) ? 'arrow_forward' : 'arrow_back'}</span><span>${esc(t('stepper.back'))}</span>`;
  backBtn.addEventListener('click', goBack);
  navEl.appendChild(backBtn);
}

function render() {
  const seq = getScreenSequence();
  const key = seq[currentIndex];
  renderHeader();
  renderCurrentValueLine();
  if (key === 'CONNECT') renderConnectScreen();
  else if (key === 'DEPTHS') renderDepthsScreen();
  else if (key === 'COMPLETION') renderCompletionScreen();
  else renderFieldScreen(key);
}

// ── DOM bootstrap ────────────────────────────────────────────────────────────

function ensureOverlay() {
  if (overlayEl) return;
  overlayEl = document.createElement('div');
  overlayEl.id = 'fieldStepperOverlay';
  overlayEl.className = 'field-stepper-overlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.innerHTML = `
    <div class="field-stepper-header">
      <div class="field-stepper-header-main">
        <span class="material-icons field-stepper-type-icon" aria-hidden="true"></span>
        <span class="field-stepper-type-label"></span>
        <bdi class="field-stepper-id" dir="ltr"></bdi>
      </div>
      <div class="field-stepper-progress"></div>
      <button type="button" class="field-stepper-close" aria-label="${esc(t('stepper.closeAria'))}">
        <span class="material-icons" aria-hidden="true">close</span>
      </button>
    </div>
    <div class="field-stepper-current-value" hidden></div>
    <div class="field-stepper-body"></div>
    <div class="field-stepper-nav"></div>
  `;
  document.body.appendChild(overlayEl);

  typeIconEl = overlayEl.querySelector('.field-stepper-type-icon');
  typeLabelEl = overlayEl.querySelector('.field-stepper-type-label');
  idEl = overlayEl.querySelector('.field-stepper-id');
  dotsEl = overlayEl.querySelector('.field-stepper-progress');
  currentValueEl = overlayEl.querySelector('.field-stepper-current-value');
  bodyEl = overlayEl.querySelector('.field-stepper-body');
  navEl = overlayEl.querySelector('.field-stepper-nav');

  overlayEl.querySelector('.field-stepper-close').addEventListener('click', closeFieldStepper);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && isFieldStepperOpen()) closeFieldStepper();
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Build the overlay DOM once. Call at app init (main-entry.js), like initCustomSelect(). */
export function initFieldStepper() {
  ensureOverlay();
}

/**
 * Open the full-screen stepper for a node.
 * @param {object} node - The node to fill in.
 * @param {{ startField?: string }} [opts] - Optional field key to jump straight to.
 */
export function openFieldStepper(node, opts = {}) {
  if (window.__sketchReadOnly) {
    F.showToast(t('toasts.sketchReadOnly'), 'warning', 2500);
    return;
  }
  if (!node) return;
  ensureOverlay();
  currentNode = node;
  skippedFields = new Set();
  applyEngineRulesEagerFillIfChanged(node);
  fieldOrderCache = computeFieldOrder(node);
  // Stale connection suggestions (edge created meanwhile, node gone, sketch
  // switched) are dropped here — the CONNECT screen only ever shows live ones.
  if (hasConnectScreen() && !validatePendingConnect()) pendingConnects.delete(String(node.id));
  currentIndex = hasConnectScreen() ? 0 : pickStartIndex(fieldOrderCache, opts.startField);
  overlayEl.classList.add('open');
  render();
}

export function closeFieldStepper() {
  if (overlayEl) overlayEl.classList.remove('open');
  currentNode = null;
}

export function isFieldStepperOpen() {
  return !!(overlayEl && overlayEl.classList.contains('open'));
}

export function getOpenStepperNodeId() {
  return isFieldStepperOpen() && currentNode ? String(currentNode.id) : null;
}

/**
 * TSC3 arrival hook (see tsc3-handlers.js handleTSC3PointReceived). Never
 * hijacks focus away from a node the worker is already mid-entry on:
 *  - stepper closed            -> open fresh at the first unfilled field
 *  - stepper open on same node -> targeted header/current-value refresh only
 *                                 (no full body re-render — preserves the
 *                                 worker's scroll position and chip screen)
 *  - stepper open on other node -> queue a compact, actionable switch-to
 *                                 snackbar instead of stealing the screen
 */
export function notifyStepperOfExternalNodeUpdate(node, pointName) {
  if (!node) return;
  if (!isFieldStepperOpen()) {
    openFieldStepper(node);
    return;
  }
  if (currentNode && String(currentNode.id) === String(node.id)) {
    renderHeader();
    renderCurrentValueLine();
    return;
  }
  showSnackbar({
    message: t('stepper.tsc3QueuedBody', pointName),
    variant: 'info',
    channel: 'stepper-tsc3-queue',
    duration: 6000,
    actions: [{ label: t('stepper.tsc3QueuedAction'), primary: true, onClick: () => openFieldStepper(node) }],
  });
}

if (typeof window !== 'undefined') {
  window.__openFieldStepper = openFieldStepper;
}
