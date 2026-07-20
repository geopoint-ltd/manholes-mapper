/**
 * TSC5 field-workflow scenarios (640x360 landscape, touch, RTL).
 *
 * Simulates the two core field workflows on Trimble TSC5-class hardware:
 *   A. surveying new manholes + connecting pipes (tap counts, wizard cost)
 *   B. re-measuring an existing manhole via the TSC3 bridge (live mock WS;
 *      self-skips when scripts/mock-tsc3 is not running — `npm run mock:tsc3`)
 * plus mis-tap hazard probes and regression guards for the field-UX fixes:
 *   - GPS capture button reachable once GNSS is tracking
 *   - touch jitter gate: <22px wobble cannot wipe a measurement; deliberate
 *     drags still apply the replace-on-drag rule; undo restores the full
 *     measurement snapshot
 *   - selecting a node neither pops the soft keyboard nor leaves the node
 *     hidden behind the sidebar (touch auto-pan)
 *   - no raw i18n key in the sidebar title
 *
 * Audit-style: findings land in test-results/tsc5-scenario-findings.json for
 * friction tracking; hard assertions cover the fixed behaviors above.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockAuthUser, gotoCanvasReady, dismissHomePanel } from './helpers';
import * as fs from 'fs';

test.use({ contextOptions: { reducedMotion: 'reduce' } });
test.describe.configure({ timeout: 180_000 });

// The TSC5 geometry (640x360 @ DPR2, touch, no keyboard) now comes from the
// dedicated `TSC5` project in playwright.config.ts rather than a per-file
// test.use override, so every other spec can opt into the same field device.
// Running this one anywhere else would either lose that geometry (desktop) or
// swap in Pixel-5 portrait emulation (Mobile Chrome).
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'TSC5', 'field-geometry spec — runs on the TSC5 project');
});

// ── Metrics collector ────────────────────────────────────────────────────────
const findings: Record<string, any> = {};
function record(key: string, value: any) {
  findings[key] = value;
  console.log(`FINDING ${key}: ${JSON.stringify(value)}`);
}

test.afterAll(async () => {
  // `findings` is module scope, so it holds only the tests this worker ran.
  // Under fullyParallel every worker used to write the same path and the last
  // one to finish won — most of the findings silently vanished. One file per
  // worker keeps them all.
  const idx = test.info().parallelIndex;
  fs.writeFileSync(`test-results/tsc5-scenario-findings-${idx}.json`, JSON.stringify(findings, null, 2));
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function setup(page: Page) {
  await mockAuthUser(page);
  await page.addInitScript(() => {
    localStorage.clear();
    // native confirm() appears in delete/undo paths — auto-accept
    window.confirm = () => true;
    // TSC3 WS address prompt
    window.prompt = () => 'localhost:8765';
  });
  await gotoCanvasReady(page);
  await dismissHomePanel(page);
  // Deterministic view
  await page.waitForFunction(() => typeof (window as any).__setViewState === 'function', { timeout: 10000 });
}

/** Canvas center in page coords */
async function canvasCenter(page: Page) {
  const box = await page.locator('#graphCanvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, box };
}

let tapCount = 0;
async function tap(page: Page, x: number, y: number) {
  tapCount++;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(150);
}
async function tapEl(page: Page, sel: string) {
  tapCount++;
  await page.locator(sel).tap();
  await page.waitForTimeout(150);
}

async function sketch(page: Page) {
  return page.evaluate(() => {
    const d = (window as any).__getActiveSketchData?.();
    return {
      nodes: (d?.nodes ?? []).map((n: any) => ({
        id: n.id, x: Math.round(n.x), y: Math.round(n.y), type: n.nodeType,
        surveyX: n.surveyX, surveyY: n.surveyY, surveyZ: n.surveyZ,
        fixQuality: n.gnssFixQuality, precision: n.measure_precision,
      })),
      edges: (d?.edges ?? []).map((e: any) => ({
        tail: e.tail, head: e.head, dangling: !!(e.danglingHead || e.danglingTail || e.headX !== undefined || e.tailX !== undefined),
        raw: Object.keys(e).filter(k => k.startsWith('dangl') || k === 'headX' || k === 'tailX'),
      })),
    };
  });
}

/** Screen position of a node by id (world→screen via view state) */
async function nodeScreenPos(page: Page, id: string) {
  return page.evaluate((nid) => {
    const d = (window as any).__getActiveSketchData?.();
    const n = d?.nodes?.find((n: any) => String(n.id) === String(nid));
    if (!n) return null;
    const vs = (window as any).getViewState?.();
    const canvas = document.getElementById('graphCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    // viewTranslate is already in CSS px — resizeCanvas() does ctx.scale(dpr,dpr)
    // so draw coordinates are logical, and screenToWorld() inverts against
    // e.offsetX/Y directly. No DPR term belongs here; dividing by one made every
    // computed position half-right at DPR 2 and the taps missed their nodes.
    // screen(css) = world*viewScale*stretch + viewTranslate + rect.origin
    const sx = n.x * vs.viewScale * vs.viewStretchX + vs.viewTranslate.x + rect.left;
    const sy = n.y * vs.viewScale * vs.viewStretchY + vs.viewTranslate.y + rect.top;
    return { sx, sy };
  }, id);
}

async function sidebarState(page: Page) {
  return page.evaluate(() => ({
    open: !document.getElementById('unifiedSidebar')?.classList.contains('collapsed'),
    detailsActive: document.getElementById('us-panel-details')?.classList.contains('active') ?? false,
    title: document.getElementById('sidebarTitle')?.textContent?.trim() ?? '',
  }));
}

/** Snapshot of the full-screen field stepper (field-stepper/field-stepper.js). */
async function stepperState(page: Page) {
  return page.evaluate(() => {
    const el = document.getElementById('fieldStepperOverlay');
    return {
      open: !!el?.classList.contains('open'),
      idLabel: el?.querySelector('.field-stepper-id')?.textContent?.trim() ?? '',
      typeLabel: el?.querySelector('.field-stepper-type-label')?.textContent?.trim() ?? '',
    };
  });
}

/** Dismiss the stepper via its close button, counting the tap it costs. */
async function closeStepper(page: Page) {
  await tapEl(page, '#fieldStepperOverlay .field-stepper-close');
  await expect(page.locator('#fieldStepperOverlay.open')).toHaveCount(0);
}

// ═════════════════════════════════════════════════════════════════════════════
// Placement model: since the field-stepper redesign (pointer-handlers.js:468,
// "close the create-edit gap") tapping empty canvas in node mode creates the
// node AND opens the full-screen stepper on it — create == edit. Laying out a
// run of manholes therefore costs 1 tap to place + 1 tap to dismiss per node.
// The budgets below pin that cost: they are the regression gate on "seamless",
// so a redesign that changes them has to change them deliberately.
test('scenario A: survey 3 new manholes + 2 pipes (tap count + wizard cost)', async ({ page }) => {
  await setup(page);
  const { cx, cy } = await canvasCenter(page);
  tapCount = 0;

  // Place 3 manholes spread horizontally (default mode is node)
  const pts = [ { x: cx - 200, y: cy - 30 }, { x: cx - 40, y: cy - 30 }, { x: cx + 120, y: cy - 30 } ];
  const placement: any[] = [];
  for (const p of pts) {
    await tap(page, p.x, p.y);
    const st = await stepperState(page);
    placement.push(st);
    expect(st.open, 'placing a manhole opens the field stepper on it (create == edit)').toBe(true);
    // must be dismissed before the next manhole can be tapped in — otherwise
    // the overlay swallows the tap and the placement is silently lost
    await closeStepper(page);
  }
  record('A.placementScreens', placement);
  let s = await sketch(page);
  record('A.nodesAfter3Placements', { taps: tapCount, nodes: s.nodes.length, tapsPerManhole: tapCount / 3 });
  expect(s.nodes.length, 'each tap on empty canvas places exactly one manhole').toBe(3);
  expect(tapCount, '3 manholes = 3 place taps + 3 stepper dismissals').toBe(6);
  const [idA, idB, idC] = s.nodes.map(n => n.id);

  // Where placement leaves the UI once the stepper is dismissed
  record('A.detailsAfterPlacement', await sidebarState(page));

  // Switch to edge mode + connect A-B, B-C.
  // Positions are re-read immediately before every tap: selecting a node can
  // auto-pan the view (the "node must not hide behind the sidebar" fix), which
  // silently invalidates any coordinate captured earlier. A surveyor taps what
  // is on screen *now*; so does this test.
  await tapEl(page, '#utEdgeBtn');
  const tapNode = async (id: string) => {
    const p = await nodeScreenPos(page, id);
    if (!p) throw new Error(`node ${id} has no screen position`);
    await tap(page, p.sx, p.sy);
  };
  await tapNode(idA);
  await tapNode(idB);
  // Chaining: B stays armed as the next tail, so C completes the second edge
  await tapNode(idC);
  s = await sketch(page);
  const chainWorked = s.edges.length === 2;
  record('A.chainAfterBC', { edges: s.edges.length, chainWorked, edgeList: s.edges });
  expect(chainWorked, 'edge chaining: head stays armed as next tail (A,B,C → 2 edges)').toBe(true);
  record('A.totalTapsFor3Nodes2Pipes', { taps: tapCount, nodes: s.nodes.length, edges: s.edges.length });
  expect(s.edges.length).toBe(2);
  // 6 placement (3 place + 3 dismiss) + 1 mode switch + 3 chained edge taps
  expect(tapCount, '3 manholes + 2 pipes in 10 taps').toBe(10);

  // The chain is still armed on C — the on-screen cancel chip must be
  // visible (keyboard-less TSC5 has no Escape) and must end the chain
  const chainChip = page.locator('#edgeChainCancelBtn');
  await expect(chainChip, 'chain-cancel chip visible while a tail is armed').toBeVisible();
  await page.screenshot({ path: 'test-results/tsc5-scnA-network.png' });
  await chainChip.tap();
  await page.waitForTimeout(200);
  await expect(chainChip, 'chip hides after cancelling the chain').toBeHidden();
  expect((await sketch(page)).edges.length, 'cancel creates no extra edges').toBe(2);

  // ── Wizard cost: set cover diameter on fresh node A ──
  await tapEl(page, '#utNodeBtn'); // back to node mode
  const wizardTapsStart = tapCount;
  const pA = await nodeScreenPos(page, idA);
  await tap(page, pA!.sx, pA!.sy); // select
  await page.waitForTimeout(400);
  const sb = await sidebarState(page);
  record('A.tapNodeOpensDetails', sb);

  // FIX VERIFICATION (auto-focus): selecting an existing node must NOT focus
  // a text input (which pops the soft keyboard over half of a 360px screen)
  const focusState = await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    return { id: ae?.id ?? '', tag: ae?.tagName?.toLowerCase() ?? '' };
  });
  record('A.focusAfterSelect', focusState);
  expect(['input', 'textarea', 'select'], 'no form field focused on select (keyboard stays down)').not.toContain(focusState.tag);

  // walk the wizard: record what tabs/fields exist at each step
  const wizardWalk: any[] = [];
  const stepState = () => page.evaluate(() => ({
    tabs: [...document.querySelectorAll('[data-wizard-tab]')].map(t => t.getAttribute('data-wizard-tab')),
    activeTab: document.querySelector('[data-wizard-tab].active')?.getAttribute('data-wizard-tab') ?? null,
    visibleSelects: [...document.querySelectorAll('#us-panel-details select')].filter(s => (s as HTMLElement).offsetParent !== null).map(s => s.id),
  }));
  wizardWalk.push({ step: 'after-select', ...(await stepState()) });

  // accuracy (if present)
  const acc = page.locator('#accuracyLevelSelect');
  if (await acc.count() > 0 && await acc.isVisible().catch(() => false)) {
    tapCount += 2; // open + choose (native select == 2 touch interactions)
    await acc.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(300);
    wizardWalk.push({ step: 'after-accuracy', ...(await stepState()) });
  }
  // maintenance
  const maint = page.locator('#nodeMaintenanceStatusSelect');
  if (await maint.count() > 0 && await maint.isVisible().catch(() => false)) {
    const options = await maint.locator('option').allTextContents();
    wizardWalk.push({ step: 'maintenance-options', options });
    tapCount += 2;
    await maint.selectOption({ index: 1 }).catch(() => {});
    await page.waitForTimeout(300);
    wizardWalk.push({ step: 'after-maintenance', ...(await stepState()) });
  }
  // cover tab now?
  const coverTab = page.locator('[data-wizard-tab="cover_diameter"]');
  if (await coverTab.count() > 0) {
    await coverTab.tap().catch(() => {}); tapCount++;
    await page.waitForTimeout(300);
    const cov = page.locator('#coverDiameterSelect');
    if (await cov.isVisible().catch(() => false)) {
      tapCount += 2;
      await cov.selectOption({ index: 1 }).catch(() => {});
    }
    wizardWalk.push({ step: 'after-cover', ...(await stepState()) });
  }
  record('A.wizardWalk', wizardWalk);
  record('A.tapsToSetCoverDiameterOnFreshNode', tapCount - wizardTapsStart);

  // occlusion: with sidebar open, which of the 3 nodes are still tappable?
  const occlusion = await page.evaluate((ids) => {
    const d = (window as any).__getActiveSketchData?.();
    const vs = (window as any).getViewState?.();
    const canvas = document.getElementById('graphCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return ids.map((nid: string) => {
      const n = d.nodes.find((n: any) => String(n.id) === String(nid));
      // CSS-px view transform — see nodeScreenPos(); no DPR term belongs here
      const sx = n.x * vs.viewScale * vs.viewStretchX + vs.viewTranslate.x + rect.left;
      const sy = n.y * vs.viewScale * vs.viewStretchY + vs.viewTranslate.y + rect.top;
      const top = document.elementFromPoint(sx, sy);
      return { id: nid, coveredBy: top?.closest('#unifiedSidebar') ? 'sidebar' : (top?.id || top?.tagName || 'canvas') };
    });
  }, [idA, idB, idC] as any);
  record('A.nodeOcclusionWhileSidebarOpen', occlusion);
  // FIX VERIFICATION (auto-pan): the node being edited must not sit hidden
  // behind the sidebar after a touch select
  const selectedCover = occlusion.find((o: any) => String(o.id) === String(idA));
  expect(selectedCover?.coveredBy, 'edited node panned out from behind the sidebar').not.toBe('sidebar');
  await page.screenshot({ path: 'test-results/tsc5-scnA-editing.png' });

  // keyboard/viewport: focus a numeric input in the edge form
  record('A.persisted', await page.evaluate(() => {
    const raw = localStorage.getItem('graphSketch');
    if (!raw) return { present: false };
    const p = JSON.parse(raw);
    return { present: true, nodes: p.nodes?.length, edges: p.edges?.length };
  }));
});

// ═════════════════════════════════════════════════════════════════════════════
test('mis-tap hazards: select-miss, edge-miss, drag jitter', async ({ page }) => {
  await setup(page);
  const { cx, cy } = await canvasCenter(page);

  // Seed 2 nodes, one carrying survey data at Float quality (5)
  await page.evaluate(() => {
    (window as any).__setActiveSketchData({
      nodes: [
        { id: '1', x: 300, y: 300, nodeType: 'node', surveyX: 178500, surveyY: 650200, surveyZ: 100.5, gnssFixQuality: 5, measure_precision: 0.08 },
        { id: '2', x: 500, y: 300, nodeType: 'node' },
      ],
      edges: [],
    });
    (window as any).__scheduleDraw?.();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).zoomToFit?.());
  await page.waitForTimeout(300);

  // HAZARD 1: node mode, try to select node 1 but miss by N px → new node?
  for (const missPx of [15, 25]) {
    const p1 = await nodeScreenPos(page, '1');
    const before = (await sketch(page)).nodes.length;
    await tap(page, p1!.sx + missPx, p1!.sy + missPx);
    const after = (await sketch(page)).nodes.length;
    // A miss that creates a node also throws the full-screen stepper over the
    // sketch — that overlay, not the phantom node, is what actually costs the
    // surveyor time, so record it alongside the node count.
    const strayStepper = (await stepperState(page)).open;
    record(`H1.selectMissBy${missPx}px`, {
      result: after > before ? 'CREATED A NEW NODE (destructive miss)' : (await sidebarState(page)).open ? 'selected node (forgiving hit radius)' : 'nothing',
      nodesBefore: before, nodesAfter: after, openedStepper: strayStepper,
    });
    // FIX VERIFICATION (create clearance): a near-miss must never mint a
    // phantom manhole on top of the one the worker was reaching for, and must
    // never bury the sketch under the stepper that creation opens.
    expect(after, `mis-tap by ${missPx}px created a phantom node`).toBe(before);
    expect(strayStepper, `mis-tap by ${missPx}px opened the stepper`).toBe(false);

    // cleanup: dismiss the stepper first — it is modal and would swallow every
    // later probe in this test — then undo the accidental node
    if (strayStepper) await closeStepper(page);
    if (after > before) { await page.evaluate(() => (document.getElementById('undoBtn') as HTMLElement)?.click()); await page.waitForTimeout(200); }
  }

  // HAZARD 2: edge mode — arm tail on node 1, then miss node 2 by 30px
  await tapEl(page, '#utEdgeBtn');
  const p1 = await nodeScreenPos(page, '1'); const p2 = await nodeScreenPos(page, '2');
  await tap(page, p1!.sx, p1!.sy); // arm tail
  await tap(page, p2!.sx + 30, p2!.sy + 30); // miss head
  const s2 = await sketch(page);
  record('H2.edgeHeadMissBy30px', {
    edges: s2.edges,
    interpretation: s2.edges.length > 0 ? 'DANGLING EDGE silently created by the miss' : 'miss was a no-op',
  });
  // stray tap on empty canvas in edge mode (no tail armed)
  const beforeStray = (await sketch(page)).edges.length;
  await tap(page, cx, cy - 80);
  await tap(page, cx + 60, cy - 80);
  const afterStray = (await sketch(page)).edges;
  record('H2.strayEmptyTapsInEdgeMode', { edgesBefore: beforeStray, edgesAfter: afterStray.length, edges: afterStray });
  await page.screenshot({ path: 'test-results/tsc5-hazard-danglings.png' });

  // FIX VERIFICATION (chain end): after a CHAINED edge, an empty tap ends the
  // chain quietly — no dangling edge minted, chip hides. Reset the sketch
  // first (the stray-tap probe leaves a dangling edge whose geometry would
  // make "empty ground" ambiguous) and mode-round-trip to clear pending state.
  await page.evaluate(() => {
    (window as any).__setActiveSketchData({
      nodes: [
        // Same shape as the original seed — H3 below drags node 1 and needs
        // its Float-quality measurement intact
        { id: '1', x: 300, y: 300, nodeType: 'node', surveyX: 178500, surveyY: 650200, surveyZ: 100.5, gnssFixQuality: 5, measure_precision: 0.08 },
        { id: '2', x: 500, y: 300, nodeType: 'node' },
      ],
      edges: [],
    });
    (window as any).__scheduleDraw?.();
  });
  await page.waitForTimeout(300);
  // Close the sidebar (opened by the earlier select probes) — it overlays the
  // inline-start canvas band and would swallow taps on node 1 after zoomToFit
  await page.evaluate(() => {
    const sb = document.getElementById('unifiedSidebar');
    if (sb && !sb.classList.contains('collapsed')) {
      (document.getElementById('unifiedSidebarCollapseBtn') as HTMLElement)?.click();
    }
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).zoomToFit?.());
  await page.waitForTimeout(300);
  await tapEl(page, '#utNodeBtn');
  await tapEl(page, '#utEdgeBtn');
  const q1 = await nodeScreenPos(page, '1');
  const q2 = await nodeScreenPos(page, '2');
  await tap(page, q1!.sx, q1!.sy); // arm tail (explicit)
  await tap(page, q2!.sx, q2!.sy); // edge 1-2 created, tail chained to 2
  const edgesAfterChain = (await sketch(page)).edges.length;
  expect(edgesAfterChain, 'chained edge 1-2 created').toBe(1);
  // Guaranteed-empty point: both nodes sit on one horizontal line, so a spot
  // well above the midpoint is clear of both node radii and the edge line
  const emptyX = (q1!.sx + q2!.sx) / 2;
  const emptyY = Math.max(80, q1!.sy - 110);
  await tap(page, emptyX, emptyY); // empty ground → chain ends
  const edgesAfterEmptyTap = (await sketch(page)).edges.length;
  record('H4.chainEndsOnEmptyTap', { edgesAfterChain, edgesAfterEmptyTap });
  expect(edgesAfterEmptyTap, 'empty tap ends the chain without minting a dangling edge').toBe(edgesAfterChain);
  await expect(page.locator('#edgeChainCancelBtn'), 'chip hides when the chain ends').toBeHidden();

  // HAZARD 3: touch-drag node 1 by ~8px — does it wipe survey data / demote fixQuality?
  const preDrag = (await sketch(page)).nodes.find(n => n.id === '1');
  await tapEl(page, '#utNodeBtn');
  const p1b = await nodeScreenPos(page, '1');
  await page.evaluate(async ({ x, y }) => {
    const canvas = document.getElementById('graphCanvas')!;
    const mk = (type: string, cx2: number, cy2: number) => {
      const t = new Touch({ identifier: 1, target: canvas, clientX: cx2, clientY: cy2 });
      canvas.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    };
    mk('touchstart', x, y);
    await new Promise(r => setTimeout(r, 80));
    mk('touchmove', x + 4, y + 4);
    await new Promise(r => setTimeout(r, 40));
    mk('touchmove', x + 8, y + 8);
    await new Promise(r => setTimeout(r, 40));
    mk('touchend', x + 8, y + 8);
  }, { x: p1b!.sx, y: p1b!.sy });
  await page.waitForTimeout(300);
  const postDrag = (await sketch(page)).nodes.find(n => n.id === '1');
  record('H3.dragJitter8pxOnFloatQualityNode', {
    before: { surveyX: preDrag?.surveyX, fixQuality: preDrag?.fixQuality, precision: preDrag?.precision },
    after: { surveyX: postDrag?.surveyX, fixQuality: postDrag?.fixQuality, precision: postDrag?.precision },
    surveyDataWiped: preDrag?.surveyX != null && postDrag?.surveyX == null,
  });
  // FIX VERIFICATION (touch jitter gate): an 8px glove smear must be a NO-OP —
  // measurement intact, node not moved
  expect(postDrag?.surveyX, '8px jitter must not wipe surveyX').toBe(178500);
  expect(postDrag?.fixQuality, '8px jitter must not demote fix quality').toBe(5);

  // A DELIBERATE drag (>22px) must still apply the replace-on-drag product
  // rule (wipe non-RTK measurement) — and undo must restore the FULL snapshot
  const p1c = await nodeScreenPos(page, '1');
  await page.evaluate(async ({ x, y }) => {
    const canvas = document.getElementById('graphCanvas')!;
    const mk = (type: string, cx2: number, cy2: number) => {
      const t = new Touch({ identifier: 2, target: canvas, clientX: cx2, clientY: cy2 });
      canvas.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    };
    mk('touchstart', x, y);
    await new Promise(r => setTimeout(r, 80));
    for (const step of [10, 20, 30, 40]) {
      mk('touchmove', x + step, y + step);
      await new Promise(r => setTimeout(r, 40));
    }
    mk('touchend', x + 40, y + 40);
  }, { x: p1c!.sx, y: p1c!.sy });
  await page.waitForTimeout(300);
  const postDeliberate = (await sketch(page)).nodes.find(n => n.id === '1');
  record('H3b.deliberateDragWipes', {
    surveyX: postDeliberate?.surveyX, fixQuality: postDeliberate?.fixQuality,
    wiped: postDeliberate?.surveyX == null,
  });
  expect(postDeliberate?.surveyX, 'deliberate drag still replaces the measurement (product rule)').toBeFalsy();

  // Undo must restore the FULL measurement (touch undo-parity fix)
  await page.evaluate(() => (document.getElementById('undoBtn') as HTMLElement)?.click());
  await page.waitForTimeout(300);
  const restored = (await sketch(page)).nodes.find(n => n.id === '1');
  record('H3fix.undoRestoresMeasurement', {
    surveyX: restored?.surveyX, surveyZ: restored?.surveyZ, fixQuality: restored?.fixQuality,
    fullyRestored: restored?.surveyX === 178500 && restored?.surveyZ === 100.5 && restored?.fixQuality === 5,
  });
  expect(restored?.surveyX, 'undo restores surveyX').toBe(178500);
  expect(restored?.surveyZ, 'undo restores surveyZ (was lost before the fix)').toBe(100.5);
  expect(restored?.fixQuality, 'undo restores gnssFixQuality (was lost before the fix)').toBe(5);
});

// ═════════════════════════════════════════════════════════════════════════════
test('disputed behaviors: measurement rail, capture button, custom select, 1-vs-2-tap', async ({ page }) => {
  await setup(page);

  await page.evaluate(() => {
    (window as any).__setActiveSketchData({
      nodes: [ { id: '1', x: 300, y: 300, nodeType: 'node' }, { id: '2', x: 520, y: 300, nodeType: 'node' } ],
      edges: [ { tail: '1', head: '2' } ],
    });
    (window as any).__scheduleDraw?.();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).zoomToFit?.());
  await page.waitForTimeout(300);

  // D1: select the edge (edge mode, tap midpoint) → measurement rail visible?
  await tapEl(page, '#utEdgeBtn');
  const p1 = await nodeScreenPos(page, '1'); const p2 = await nodeScreenPos(page, '2');
  await tap(page, (p1!.sx + p2!.sx) / 2, (p1!.sy + p2!.sy) / 2);
  await page.waitForTimeout(500);
  record('D1.measurementRail', await page.evaluate(() => {
    const rail = document.querySelector('.measurement-rail');
    const tail = document.querySelector('.measurement-rail__input--tail');
    return {
      railInDom: !!rail,
      railVisible: rail ? (rail as HTMLElement).offsetParent !== null : false,
      tailInputVisible: tail ? (tail as HTMLElement).offsetParent !== null : false,
      edgeSelected: document.getElementById('sidebarTitle')?.textContent?.trim() || null,
    };
  }));
  record('D1.edgeSelectedDetails', await sidebarState(page));

  // D2: GNSS capture button — connect mock GNSS, wait, check #utCaptureBtn
  await page.evaluate(() => (window as any).__gnssConnection?.connectMock?.());
  await page.waitForTimeout(2500);
  const d2 = await page.evaluate(() => {
    const ut = document.getElementById('utCaptureBtn');
    const fab = document.getElementById('gpsCaptureFab');
    const conn = (window as any).__gnssState;
    return {
      gnssConnected: conn?.connectionState ?? 'unknown',
      hasPosition: !!(conn?.position),
      utCaptureHidden: ut?.classList.contains('hidden') ?? null,
      utCaptureVisible: ut ? (ut as HTMLElement).offsetParent !== null : null,
      legacyFabVisible: fab ? (fab as HTMLElement).offsetParent !== null : null,
    };
  });
  record('D2.captureButtonAfterMockGnssConnected', d2);
  // FIX VERIFICATION: with GNSS connected, the unified capture button must be reachable
  expect(d2.gnssConnected, 'mock GNSS connected').toBe('connected');
  expect(d2.utCaptureHidden, 'capture button un-hidden once tracking').toBe(false);
  expect(d2.utCaptureVisible, 'capture button visible in toolbar').toBe(true);

  // D3: custom select vs native picker on coarse pointer — tap a select in details
  await tapEl(page, '#utNodeBtn');
  const pn = await nodeScreenPos(page, '1');
  await tap(page, pn!.sx, pn!.sy);
  await page.waitForTimeout(400);
  record('D3.coarsePointerEnv', await page.evaluate(() => ({
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    customSheetInDom: !!document.querySelector('.custom-select-sheet, .cs-sheet, [class*="custom-select"]'),
  })));

  // D4: 1 tap or 2 to open details (touch)? — re-run cleanly on node 2
  // deselect first by re-tapping node 1 (per map), then close observation:
  const sbBefore = await sidebarState(page);
  const pn2 = await nodeScreenPos(page, '2');
  await tap(page, pn2!.sx, pn2!.sy);
  await page.waitForTimeout(400);
  const sbAfter1 = await sidebarState(page);
  record('D4.tapsToOpenDetailsOnTouch', {
    sidebarBeforeTap: sbBefore.open,
    afterOneTap: sbAfter1,
    verdict: sbAfter1.open && sbAfter1.detailsActive ? '1 tap (touch)' : 'needs more taps',
  });
  // FIX VERIFICATION: no raw i18n key may leak into the sidebar title
  expect(sbAfter1.title, 'localized title, not a raw i18n key').not.toContain('nodeTypeLabel.');
});

// ═════════════════════════════════════════════════════════════════════════════
test('scenario B: TSC3 — re-measure existing manhole + new point (live mock bridge)', async ({ page, request }) => {
  // requires scripts/mock-tsc3 server on ws:8765 + http:3001 (started outside)
  const up = await request.get('http://localhost:3001/api/status').then(r => r.ok()).catch(() => false);
  test.skip(!up, 'mock TSC3 server not running');

  await setup(page);
  await page.evaluate(() => {
    (window as any).__setActiveSketchData({
      nodes: [
        { id: 'MH-001', x: 300, y: 300, nodeType: 'node', surveyX: 178000, surveyY: 650000, surveyZ: 99.0, gnssFixQuality: 4 },
        { id: 'MH-002', x: 500, y: 300, nodeType: 'node' },
      ],
      edges: [ { tail: 'MH-001', head: 'MH-002' } ],
    });
    (window as any).__scheduleDraw?.();
  });
  await page.waitForTimeout(300);

  // Connect the app to the mock TSC3 over WebSocket (prompt stubbed to localhost:8765)
  await page.evaluate(() => (window as any).menuEvents?.emit('connectSurveyWebSocket'));
  await page.waitForTimeout(2500);
  const connState = await page.evaluate(() => document.getElementById('surveyConnectionBadge')?.textContent?.trim() ?? document.getElementById('toast')?.textContent?.trim() ?? 'unknown');
  record('B.tsc3ConnectionState', connState);

  // RE-MEASURE: send existing point name with NEW coords — expect silent overwrite, 0 app taps
  tapCount = 0;
  await request.post('http://localhost:3001/api/send-point', {
    data: { pointName: 'MH-001', easting: 178510.55, northing: 650210.77, elevation: 102.33 },
  });
  await page.waitForTimeout(1500);
  const afterRemeasure = (await sketch(page)).nodes.find(n => n.id === 'MH-001');
  record('B.remeasureExisting', {
    appTapsNeeded: tapCount,
    surveyX: afterRemeasure?.surveyX, surveyY: afterRemeasure?.surveyY, surveyZ: afterRemeasure?.surveyZ,
    fixQuality: afterRemeasure?.fixQuality, precision: afterRemeasure?.precision,
    updated: Math.abs((afterRemeasure?.surveyX ?? 0) - 178510.55) < 0.01,
    confirmationShown: await page.evaluate(() => document.getElementById('toast')?.textContent?.trim() ?? ''),
  });
  await page.screenshot({ path: 'test-results/tsc5-scnB-remeasure.png' });

  // NEW POINT: unknown name → type dialog should appear; pick manhole
  await request.post('http://localhost:3001/api/send-point', {
    data: { pointName: 'MH-003', easting: 178530.0, northing: 650230.0, elevation: 101.0 },
  });
  await page.waitForTimeout(1200);
  const dlg = page.locator('#surveyNodeTypeDialog');
  const dlgVisible = await dlg.isVisible().catch(() => false);
  record('B.newPointDialogAppeared', dlgVisible);
  if (dlgVisible) {
    await page.screenshot({ path: 'test-results/tsc5-scnB-typedialog.png' });
    record('B.autoConnectDefault', await page.evaluate(() => (document.getElementById('surveyAutoConnectCheckbox') as HTMLInputElement)?.checked ?? null));
    await page.locator('#surveyNodeTypeDialog .survey-type-btn').first().tap();
    await page.waitForTimeout(800);
  }
  const final = await sketch(page);
  const autoConnectedToLast = final.edges.some(e => (e.tail === 'MH-001' && e.head === 'MH-003') || (e.tail === 'MH-003' && e.head === 'MH-001'));
  record('B.afterNewPoint', {
    nodes: final.nodes.map(n => n.id),
    edges: final.edges.map(e => `${e.tail}->${e.head}`),
    autoConnectedToLast,
  });
  // FIX VERIFICATION (auto-connect): with the checkbox on, the new point must
  // chain to the most recently SHOT node — including a re-measured one
  if (dlgVisible) {
    expect(autoConnectedToLast, 'new survey point auto-connects to the last shot node').toBe(true);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Touch-target audit. Field crews work gloved on a 640x360 panel: a control
// under the 44px WCAG 2.5.5 / Material minimum is a mis-tap generator, and one
// sitting beneath the sidebar is unreachable whatever its size. Emulation
// cannot tell us how sunlight or gloves feel, but it can tell us the geometry
// is at least physically tappable.
const MIN_TOUCH_PX = 44;

/**
 * Measure every visible interactive control inside `sel`.
 *
 * `offscreen` (scrolled out of its own scroll container, or outside the
 * viewport) is kept distinct from `reachable:false`. A chip below the fold of a
 * scrolling list is fine — you scroll to it — but elementFromPoint at its
 * centre reports whatever is painted there instead, which would otherwise look
 * identical to a control genuinely buried under another element.
 */
async function auditTouchTargets(page: Page, sel: string) {
  return page.evaluate((rootSel) => {
    const root = document.querySelector(rootSel);
    if (!root) return { present: false, controls: [] as any[] };
    const scrollParent = (el: Element): Element | null => {
      let p = el.parentElement;
      while (p) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) return p;
        p = p.parentElement;
      }
      return null;
    };
    const q = 'button, select, [role="button"], a[href], input:not([type="hidden"])';
    const controls = [...root.querySelectorAll(q)].flatMap((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.opacity === '0') return [];
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const clip = scrollParent(el)?.getBoundingClientRect();
      const offscreen =
        cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight ||
        (!!clip && (cy < clip.top || cy > clip.bottom || cx < clip.left || cx > clip.right));
      const top = offscreen ? null : document.elementFromPoint(cx, cy);
      const hit = offscreen ? null : !!top && (top === el || el.contains(top) || top.contains(el));
      return [{
        id: el.id || String((el as HTMLElement).className || '').split(' ')[0] || el.tagName,
        w: Math.round(r.width),
        h: Math.round(r.height),
        offscreen,
        reachable: hit,
        occludedBy: hit === false ? (top?.id || String((top as HTMLElement)?.className || '') || top?.tagName || 'nothing') : null,
      }];
    });
    return { present: true, controls };
  }, sel);
}

test('touch targets: field controls are >=44px and unoccluded at 640x360', async ({ page }) => {
  await setup(page);

  const toolbar = await auditTouchTargets(page, '#unifiedToolbar');
  record('T.toolbar', toolbar);
  expect(toolbar.present, '#unifiedToolbar rendered at TSC5 geometry').toBe(true);
  expect(toolbar.controls.length, 'toolbar exposes controls').toBeGreaterThan(0);

  const undersized = toolbar.controls.filter((c) => c.w < MIN_TOUCH_PX || c.h < MIN_TOUCH_PX);
  // `reachable === false` only — null means offscreen/scrolled, which is not a defect
  const unreachable = toolbar.controls.filter((c) => c.reachable === false);
  record('T.toolbarUndersized', undersized);
  record('T.toolbarUnreachable', unreachable);
  expect(undersized, `toolbar controls below ${MIN_TOUCH_PX}px: ${JSON.stringify(undersized)}`).toEqual([]);
  expect(unreachable, `toolbar controls not on top at their own centre: ${JSON.stringify(unreachable)}`).toEqual([]);

  // The stepper is the other surface a worker taps all day — measure it on a
  // freshly placed manhole, where it opens by itself.
  const { cx, cy } = await canvasCenter(page);
  await tap(page, cx, cy);
  await expect(page.locator('#fieldStepperOverlay.open')).toHaveCount(1);
  const stepper = await auditTouchTargets(page, '#fieldStepperOverlay');
  record('T.stepper', stepper);
  const stepperUndersized = stepper.controls.filter((c) => c.w < MIN_TOUCH_PX || c.h < MIN_TOUCH_PX);
  const stepperUnreachable = stepper.controls.filter((c) => c.reachable === false);
  record('T.stepperUndersized', stepperUndersized);
  record('T.stepperUnreachable', stepperUnreachable);
  const offscreen = stepper.controls.filter((c) => c.offscreen);
  record('T.stepperOffscreen', { count: offscreen.length, total: stepper.controls.length });
  await page.screenshot({ path: 'test-results/tsc5-touch-targets.png' });
  expect(stepperUndersized, `stepper controls below ${MIN_TOUCH_PX}px: ${JSON.stringify(stepperUndersized)}`).toEqual([]);
  expect(stepperUnreachable, `stepper controls not on top at their own centre: ${JSON.stringify(stepperUnreachable)}`).toEqual([]);
  // The longest answer list we ship (maintenance status, 15 options) has to fit
  // the 640x360 panel outright. It used to run ~34px past the fold, hiding a
  // whole row of chips behind the nav bar with nothing to suggest they existed.
  expect(offscreen, `answer chips below the fold: ${JSON.stringify(offscreen)}`).toEqual([]);
});

// ═════════════════════════════════════════════════════════════════════════════
test('rapid placement: one tap per manhole, no stepper', async ({ page }) => {
  await setup(page);
  const { cx, cy } = await canvasCenter(page);

  // Toggle it on the way a worker would: through the node-mode flyout
  await tapEl(page, '#utNodeBtn');
  await tapEl(page, '#utRapidPlaceBtn');
  await expect(page.locator('#utRapidPlaceBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#utNodeBtn'), 'mode button badges the sticky state').toHaveClass(/ut-btn--rapid/);
  await page.locator('#utNodeBtn').tap(); // close the flyout
  await page.waitForTimeout(250);

  tapCount = 0;
  const pts = [{ x: cx - 200, y: cy - 30 }, { x: cx - 40, y: cy - 30 }, { x: cx + 120, y: cy - 30 }];
  for (const p of pts) {
    await tap(page, p.x, p.y);
    expect((await stepperState(page)).open, 'rapid placement must not open the stepper').toBe(false);
  }
  const s = await sketch(page);
  record('R.rapidPlacement', { taps: tapCount, nodes: s.nodes.length, tapsPerManhole: tapCount / (s.nodes.length || 1) });
  expect(s.nodes.length, 'three taps, three manholes').toBe(3);
  expect(tapCount, 'rapid placement costs one tap per manhole').toBe(3);

  // The choice must survive a reload — a surveyor who set it at the start of a
  // run should not silently lose it to a refresh.
  expect(await page.evaluate(() => localStorage.getItem('graphSketch.rapidPlacement'))).toBe('1');
});
