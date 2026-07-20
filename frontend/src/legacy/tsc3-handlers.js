/**
 * tsc3-handlers.js
 *
 * Extracted TSC3 Survey Controller integration from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * Call initTSC3Handlers() once from main.js (after F registry is populated)
 * to wire tsc3Connection callbacks and menu event handlers.
 */

import { S, F } from './shared-state.js';
import { tsc3Connection } from '../survey/tsc3-connection-manager.js';
import { gnssConnection } from '../gnss/index.js';
import { initSurveyNodeTypeDialog, openSurveyNodeTypeDialog, getSurveyAutoConnect } from '../survey/survey-node-type-dialog.js';
import { openDevicePickerDialog } from '../survey/device-picker-dialog.js';
import { initSketchSidePanel } from '../project/sketch-side-panel.js';
import { menuEvents } from '../menu/menu-events.js';
import { saveCoordinatesToStorage } from '../utils/coordinates.js';
import { appendMeasurement, backfillMeasurementFromNode } from '../utils/measurement-history.js';
import { STORAGE_KEYS } from '../state/persistence.js';
import { notifyStepperOfExternalNodeUpdate, setPendingConnectSuggestion, getPendingConnectSuggestion } from '../field-stepper/field-stepper.js';
import { suggestChainConnection } from '../features/connection-suggest.js';
import { showSnackbar } from '../ui/snackbar.js';

// Convenience wrappers
const t = (...args) => F.t(...args);

/**
 * Handle an incoming survey point from the TSC3 connection manager.
 * @param {string} pointName - Point name/ID
 * @param {{ easting: number, northing: number, elevation: number }} coords - ITM coordinates
 * @param {boolean} isNew - Whether this is a new node (no existing match)
 * @param {string} nodeType - 'Manhole', 'Home', or 'Drainage'
 */
export function handleTSC3PointReceived(pointName, coords, isNew, nodeType) {
  let node;

  if (isNew) {
    // Create a new node at canvas center; applyCoordinatesIfEnabled() will immediately
    // reposition it to the correct world coordinates once the survey data is applied below.
    node = F.createNode(S.canvas.width / 2, S.canvas.height / 2);
    // Override the auto-generated ID with the survey point name
    node.id = String(pointName);
    node.nodeType = nodeType || 'Manhole';
  } else {
    node = S.nodes.find(n => String(n.id) === String(pointName));
    if (!node) return;
  }

  // Preserve manual float coords before overwriting with TSC3 survey data
  if (node.gnssFixQuality === 6 && node.surveyX != null && node.surveyY != null) {
    node.manual_x = node.surveyX;
    node.manual_y = node.surveyY;
  }

  // Nodes measured before the history feature existed: reconstruct their
  // current shot as the first history entry so this re-measure doesn't erase it.
  backfillMeasurementFromNode(node);

  // Store survey coordinates on the node (TSC3 = RTK Fixed)
  node.hasCoordinates = true;
  node._hidden = false;
  node.surveyX = coords.easting;
  node.surveyY = coords.northing;
  node.surveyZ = coords.elevation;
  // Terrain level: same physical quantity the issue engine checks as node.tl.
  // The parser coerces a missing elevation to 0 — writing tl=0 would silently
  // suppress missing_tl detection, so only store real elevations.
  if (Number(coords.elevation)) node.tl = coords.elevation;
  node.measure_precision = 0.02; // TSC3 RTK nominal precision (meters) — the wire format carries no accuracy column
  node.gnssFixQuality = 4; // TSC3 delivers RTK Fixed coordinates
  node.measure_source = 'tsc3';
  // Measurement metadata
  node.measuredAt = Date.now();
  const tscAuthUser = window.authGuard?.getAuthState?.()?.user;
  node.measuredBy = tscAuthUser?.name || tscAuthUser?.email || null;

  // Append-only history: every field shot is kept, re-measures included.
  appendMeasurement(node, {
    source: 'tsc3',
    easting: coords.easting,
    northing: coords.northing,
    elevation: Number(coords.elevation) ? coords.elevation : null,
    precision: 0.02,
    fixQuality: 4,
    measuredAt: node.measuredAt,
    measuredBy: node.measuredBy,
    raw: coords.raw || null,
  });

  // Update coordinatesMap
  S.coordinatesMap.set(String(pointName), {
    x: coords.easting,
    y: coords.northing,
    z: coords.elevation,
  });
  saveCoordinatesToStorage(S.coordinatesMap);

  // Auto-enable coordinates if not already on
  if (!S.coordinatesEnabled) {
    S.coordinatesEnabled = true;
    F.saveCoordinatesEnabled(S.coordinatesEnabled);
  }

  // Apply coordinates to reposition nodes on canvas
  F.applyCoordinatesIfEnabled();

  // Z-aware auto-connect to the previous survey node (spec: docs/SMART_MEASUREMENT_WIZARD.md §B).
  // Unambiguous terrain → edge created higher-Z→lower-Z silently (undoable
  // snackbar below); ambiguous → the decision rides the field stepper's
  // CONNECT screen instead of a blind chronological guess.
  const prevSurveyNodeId = S.lastSurveyNodeId;
  let autoConnectedEdge = null;
  let autoConnectEvidence = null;
  if (isNew && S.surveyAutoConnect && prevSurveyNodeId) {
    const prevNode = S.nodes.find((n) => String(n.id) === String(prevSurveyNodeId));
    const suggestion = suggestChainConnection(node, prevNode, {
      edges: S.edges,
      coordinateScale: S.coordinateScale,
    });
    if (suggestion.kind === 'auto') {
      autoConnectedEdge = F.createEdge(suggestion.tail, suggestion.head, { directionSource: 'terrain' });
      autoConnectEvidence = suggestion.evidence || null;
    } else if (suggestion.kind === 'auto-home') {
      autoConnectedEdge = F.createEdge(suggestion.tail, suggestion.head, { directionSource: 'user' });
    } else if (suggestion.kind === 'ask' || suggestion.kind === 'flip-offer') {
      setPendingConnectSuggestion(node.id, suggestion);
    }
    // 'exists' / 'none': silently nothing — an already-connected pair must
    // never re-surface as a toast (the old edgeExists ping-pong).
  } else if (!isNew) {
    // Re-measure with an undecided CONNECT suggestion for this node: the Z
    // just changed, so the stored evidence (and possibly the whole tier) is
    // stale. Recompute against the same pair; a now-decisive Z demotes to a
    // preselected ask (not silent AUTO — the user was already being asked).
    const stale = getPendingConnectSuggestion(node.id);
    if (stale && (stale.kind === 'ask' || stale.kind === 'flip-offer')) {
      const otherId = stale.kind === 'flip-offer'
        ? null // flip-offer re-validates via its edge below
        : String(stale.tail) === String(node.id) ? stale.head : stale.tail;
      const otherNode = otherId != null ? S.nodes.find((n) => String(n.id) === String(otherId)) : null;
      if (stale.kind === 'ask' && otherNode) {
        const fresh = suggestChainConnection(node, otherNode, {
          edges: S.edges,
          coordinateScale: S.coordinateScale,
        });
        if (fresh.kind === 'ask' || fresh.kind === 'flip-offer') {
          setPendingConnectSuggestion(node.id, fresh);
        } else if (fresh.kind === 'auto' || fresh.kind === 'auto-home') {
          setPendingConnectSuggestion(node.id, {
            kind: 'ask', reason: 'terrain', hasZ: true,
            tail: fresh.tail, head: fresh.head, preselect: true,
            evidence: fresh.evidence || null,
          });
        } else {
          setPendingConnectSuggestion(node.id, null);
        }
      } else if (stale.kind === 'ask') {
        setPendingConnectSuggestion(node.id, null); // pair node gone
      }
    }
  }
  // Track the most recent surveyed node for chaining. Re-measures count too:
  // a surveyor who just re-shot an existing manhole expects the next new
  // point to connect to it — tracking only new points left auto-connect
  // silently dead after any name-match update.
  // Home nodes normally never take the pointer (a house lateral is a dead
  // end — the next shot chains to the main line, not to the house), EXCEPT
  // when there is no pointer yet: a session that opens with a Home shot must
  // still offer that lateral to the first main-line shot that follows.
  if (node.nodeType !== 'Home' || !S.lastSurveyNodeId) S.lastSurveyNodeId = node.id;

  // Smart check: gradients of every pipe touching this node, the moment the
  // measurement lands (negative-gradient alerts fire from the engine).
  const gradientResults = window.__gradientEngine?.onMeasurementApplied(node.id) || [];

  // Select the node and update UI
  S.selectedNode = node;
  S.selectedEdge = null;
  F.renderDetails();
  F.computeNodeTypes();
  F.saveToStorage();
  F.scheduleDraw();

  // Field stepper: never hijack a worker mid-entry on a different node.
  // Opens fresh if closed, does a targeted header/value-only refresh if this
  // same node is already open in the stepper, or queues a non-focus-stealing
  // switch-to snackbar if a different node is open.
  notifyStepperOfExternalNodeUpdate(node, pointName);

  // Auto zoom/recenter after new survey points
  if (isNew) {
    const surveyNodes = S.nodes.filter(n => n.hasCoordinates);
    if (surveyNodes.length >= 2) {
      F.zoomToFit();
    } else {
      F.recenterView();
    }
  }

  // Measurement confirmation (Wolt-style: say what happened, with the numbers).
  // Skip the success message when this shot raised a gradient problem on ANY
  // touched pipe — the engine's alert is on screen and must not compete.
  // Applies uniformly to new shots and re-measures.
  const anyGradientProblem = gradientResults.some(
    (g) => g && (g.status === 'negative' || g.status === 'low'),
  );
  const elevText = Number(coords.elevation) ? Number(coords.elevation).toFixed(2) : '?';
  const typeKey = `nodeTypeLabel.${String(node.nodeType || 'Manhole').toLowerCase()}`;
  const rawLabel = t(typeKey);
  const typeLabel = rawLabel && rawLabel !== typeKey ? rawLabel : node.nodeType;
  if (!anyGradientProblem) {
    if (isNew && autoConnectedEdge) {
      // Auto-connect happened: one numbers-rich snackbar carrying the
      // measurement, the created connection, AND an Undo action (the edge was
      // created without asking — the escape hatch must be right there).
      const g = autoConnectEvidence || window.__gradientEngine?.compute(autoConnectedEdge) || {};
      const parts = [];
      if (g.slopePct != null) parts.push(t('survey.slopePart', Math.abs(g.slopePct).toFixed(1)));
      if (g.lengthM != null) parts.push(t('survey.lengthPart', Math.round(g.lengthM)));
      const edgeRef = autoConnectedEdge;
      showSnackbar({
        message:
          (t('survey.measuredNew', typeLabel, pointName, elevText) || `${typeLabel} ${pointName} measured`) +
          ' • ' +
          t('survey.autoConnected', String(edgeRef.tail), String(edgeRef.head)) +
          (parts.length ? ' • ' + parts.join(' • ') : ''),
        variant: 'success',
        kind: 'auto-connect',
        // Default success duration (2.4s) is too short for the ONLY inline
        // escape hatch of a silently created edge — touch can't hover-pause.
        duration: 8000,
        actions: [
          {
            label: t('survey.autoConnectUndo'),
            onClick: () => {
              if (S.edges.includes(edgeRef)) F.deleteEdgeShared(edgeRef, true, true);
            },
          },
        ],
      });
    } else if (isNew) {
      let slopeSuffix = '';
      if (prevSurveyNodeId) {
        // Either orientation: the chain edge may point new→prev when terrain
        // decided the direction on an earlier shot.
        const chainEdge = S.edges.find(
          (e) =>
            !e.isDangling &&
            ((String(e.tail) === String(prevSurveyNodeId) && String(e.head) === String(node.id)) ||
              (String(e.tail) === String(node.id) && String(e.head) === String(prevSurveyNodeId))),
        );
        const g = chainEdge ? window.__gradientEngine?.compute(chainEdge) : null;
        if (g?.status === 'ok' && g.slopePct != null) slopeSuffix = t('survey.slopeToPrev', g.slopePct.toFixed(1)) || '';
      }
      F.showToast((t('survey.measuredNew', typeLabel, pointName, elevText) || `${typeLabel} ${pointName} measured`) + slopeSuffix, 'success');
    } else {
      F.showToast(t('survey.measuredAgain', pointName, elevText) || `Point ${pointName} updated`, 'success');
    }
  }
}

/**
 * Initialize TSC3 integration: wire tsc3Connection callbacks, menu event handlers,
 * and init dialog/panel DOM. Must be called after F registry is populated.
 */
export function initTSC3Handlers() {
  // Initialize dialog DOM
  initSurveyNodeTypeDialog();

  // Initialize sketch side panel for project-canvas mode
  initSketchSidePanel();

  // Wire tsc3Connection callbacks
  tsc3Connection._getNodes = () => S.nodes;
  tsc3Connection._showToast = (msg) => F.showToast(msg);
  tsc3Connection._t = (path, ...args) => t(path, ...args);
  tsc3Connection._openTypeDialog = (pointName, coords, onChoose, onCancel, tFn) => {
    openSurveyNodeTypeDialog(pointName, coords, (type) => {
      S.surveyAutoConnect = getSurveyAutoConnect();
      onChoose(type);
    }, onCancel, tFn, { autoConnect: S.surveyAutoConnect });
  };
  tsc3Connection._onPointUpdate = (pointName, coords, isNew, nodeType) => {
    handleTSC3PointReceived(pointName, coords, isNew, nodeType);
  };

  // Wire persistent connection state badge
  tsc3Connection.onConnectionChange = ({ connected, name, type }) => {
    const badge = document.getElementById('surveyConnectionBadge');
    if (!badge) return;
    badge.style.display = connected ? 'flex' : 'none';
    badge.title = connected && name ? name : '';
    // Glyph must match the transport: WS bridge is not Bluetooth
    const glyph = badge.querySelector('.material-icons');
    if (glyph) glyph.textContent = type === 'ws' ? 'wifi' : 'bluetooth_connected';
  };

  // TSC3 menu event handlers
  menuEvents.on('connectSurveyBluetooth', async () => {
    const devices = await tsc3Connection.getPairedDevices();
    const surveyDevices = devices.filter(d => d.isSurvey);

    if (surveyDevices.length === 1) {
      F.showToast(t('survey.connecting') || 'Connecting...');
      await tsc3Connection.connectBluetooth(surveyDevices[0].address);
    } else if (devices.length > 0) {
      const chosen = await openDevicePickerDialog(devices, t);
      if (chosen) {
        F.showToast(t('survey.connecting') || 'Connecting...');
        await tsc3Connection.connectBluetooth(chosen.address);
      }
    } else {
      F.showToast(t('survey.noDevicesFound') || 'No devices found');
    }
  });

  menuEvents.on('connectSurveyWebSocket', () => {
    const savedAddr = localStorage.getItem(STORAGE_KEYS.tsc3WsAddress) || 'localhost:8765';
    const input = prompt('WebSocket host:port', savedAddr);
    if (!input) return;
    localStorage.setItem(STORAGE_KEYS.tsc3WsAddress, input);
    const parts = input.split(':');
    const host = parts[0] || 'localhost';
    const port = parseInt(parts[1], 10) || 8765;
    F.showToast(t('survey.connecting') || 'Connecting...');
    tsc3Connection.connectWebSocket(host, port);
  });

  menuEvents.on('disconnectSurvey', async () => {
    await tsc3Connection.disconnect();
  });

  // TMM (Trimble Mobile Manager) connection handler
  menuEvents.on('connectTMM', async () => {
    F.showToast(t('tmm.connecting') || 'Connecting to TMM...');
    const success = await gnssConnection.connectTMM();
    if (success) {
      F.setLiveMeasureMode(true);
      F.showToast(t('tmm.connected') || 'TMM Connected');
    } else {
      F.showToast(t('tmm.portNotFound') || 'TMM server not found. Make sure TMM is running.');
    }
  });
}
