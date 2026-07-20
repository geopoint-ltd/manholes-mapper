/**
 * FULL NETWORK AUDIT — builds a complete manhole/pipe network on TSC5 geometry
 * (640x360 landscape, touch) using the TSC3 emulator bridge, while recording:
 *   - a full-session VIDEO (video:'on', real motion — no reducedMotion) for
 *     later flicker analysis,
 *   - UX findings + timings (test-results/full-network-audit-findings.json)
 *     that feed the easibility-score report.
 *
 * Network built (flow = edge direction tail→head, elevations in meters).
 * Shots arrive in chain order 101→102→103→104→105, but auto-connect is
 * Z-aware (connection-suggest, spec docs/SMART_MEASUREMENT_WIZARD.md §B2):
 * every edge is created higher-Z → lower-Z, so the DELIBERATE uphill shot
 * MH-104 (104.55, shot right after MH-103 at 104.10) must come out FLIPPED:
 *
 *   MH-101(105.00) → MH-102(104.60) → MH-103(104.10) ← MH-104(104.55) → MH-105(103.80)
 *                                        └→ BR-201(103.60) → BR-202(103.10)
 *                                                             HM-301(104.00, Home) → MH-105
 *
 *   Because the direction is Z-corrected at creation time, NO terrain
 *   gradient alert may fire for MH-104 — the app fixed the arrow instead of
 *   warning about it. The invert-basis alert path is exercised in Phase 6 by
 *   entering depths that make the invert RISE along the corrected direction.
 *   HM-301 is a Home lateral: locked Home→main, gradient-exempt.
 *
 * Modes:
 *   baseline            — records observations only (no smart-layer asserts)
 *   AUDIT_EXPECT_SMART=1 — additionally asserts the gradient engine + snackbar
 *
 * Requires scripts/mock-tsc3 running (npm run mock:tsc3 — WS:8765, HTTP:3001);
 * self-skips otherwise. Run from frontend/:
 *   npx playwright test tests/e2e/full-network-audit.spec.ts --project=chromium
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { mockAuthUser, gotoCanvasReady, dismissHomePanel } from './helpers';
import * as fs from 'fs';

const MOCK = 'http://localhost:3001';
const EXPECT_SMART = process.env.AUDIT_EXPECT_SMART === '1';
// NOT test-results/: Playwright auto-cleans its outputDir at run start, which
// would destroy the previous mode's findings/screenshots between runs.
const OUT_DIR = 'audit-results';

test.use({
  viewport: { width: 640, height: 360 },
  hasTouch: true,
  // Full video, real animations — the recording is the flicker-analysis input.
  video: 'on',
});
test.describe.configure({ timeout: 300_000 });

// TSC5-geometry spec: brings its own 640x360 touch context; Pixel-5 emulation
// only skews the coordinate math (same guard as tsc5-field-workflows.spec.ts).
test.skip(({ isMobile }) => isMobile, 'runs on the desktop chromium project with its own TSC5 touch context');

// ── Findings collector ───────────────────────────────────────────────────────
const findings: Record<string, any> = { mode: EXPECT_SMART ? 'smart' : 'baseline', notes: [] };
function record(key: string, value: any) {
  findings[key] = value;
  console.log(`FINDING ${key}: ${JSON.stringify(value)}`);
}
function note(area: string, severity: 'info' | 'minor' | 'major', text: string, data?: any) {
  findings.notes.push({ area, severity, text, ...(data !== undefined ? { data } : {}) });
  console.log(`NOTE [${severity}] ${area}: ${text}`);
}

test.afterAll(async () => {
  // afterAll also runs in the skipped Mobile Chrome project — an empty
  // skeleton must never clobber the desktop run's findings.
  if (Object.keys(findings).length <= 2 && findings.notes.length === 0) return;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    `${OUT_DIR}/full-network-audit-findings-${findings.mode}.json`,
    JSON.stringify(findings, null, 2),
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function setup(page: Page) {
  // SAFETY NET, registered FIRST so it is matched LAST (Playwright matches the
  // most recently registered route first): the Vite dev server proxies any
  // unmatched /api call to PRODUCTION — nothing from this spec may escape.
  await page.route('**/api/**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await mockAuthUser(page);
  await page.addInitScript(() => {
    localStorage.clear();
    window.confirm = () => true;
    // TSC3 WS address prompt → mock bridge
    window.prompt = () => 'localhost:8765';
  });
  await gotoCanvasReady(page);
  await dismissHomePanel(page);
  await page.waitForFunction(() => typeof (window as any).__setViewState === 'function', { timeout: 10_000 });
}

async function sketch(page: Page) {
  return page.evaluate(() => {
    const d = (window as any).__getActiveSketchData?.();
    return {
      nodes: (d?.nodes ?? []).map((n: any) => ({
        id: String(n.id), x: Math.round(n.x), y: Math.round(n.y), type: n.nodeType,
        surveyX: n.surveyX, surveyY: n.surveyY, surveyZ: n.surveyZ,
      })),
      edges: (d?.edges ?? []).map((e: any) => ({
        id: String(e.id), tail: String(e.tail), head: String(e.head),
        tailMeas: e.tail_measurement, headMeas: e.head_measurement,
      })),
    };
  });
}

/** Center the view on a node at a comfortable tap scale (translate is in canvas backing px). */
async function centerOn(page: Page, id: string, scale = 0.8) {
  await page.evaluate(([nid, sc]) => {
    const d = (window as any).__getActiveSketchData?.();
    const n = d?.nodes?.find((n: any) => String(n.id) === String(nid));
    if (!n) return;
    const canvas = document.getElementById('graphCanvas') as HTMLCanvasElement;
    const st = (window as any).__getStretch?.() ?? { x: 1, y: 1 };
    (window as any).__setViewState(sc, canvas.width / 2 - sc * st.x * n.x, canvas.height / 2 - sc * st.y * n.y);
    (window as any).__scheduleDraw?.();
  }, [id, scale] as [string, number]);
  await page.waitForTimeout(250);
}

/** Screen (css px) position of a node by id. */
async function nodeScreenPos(page: Page, id: string) {
  return page.evaluate((nid) => {
    const d = (window as any).__getActiveSketchData?.();
    const n = d?.nodes?.find((n: any) => String(n.id) === String(nid));
    if (!n) return null;
    const vs = (window as any).getViewState?.();
    const canvas = document.getElementById('graphCanvas') as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const sx = (n.x * vs.viewScale * vs.viewStretchX + vs.viewTranslate.x) / dpr + rect.left;
    const sy = (n.y * vs.viewScale * vs.viewStretchY + vs.viewTranslate.y) / dpr + rect.top;
    return { sx, sy };
  }, id);
}

/** Snapshot of everything the user could currently see as feedback. */
async function feedbackState(page: Page) {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#snackbarContainer .snackbar-item'));
    const toast = document.getElementById('toast');
    const engine = (window as any).__gradientEngine;
    return {
      snackbars: items.map((el) => ({
        kind: el.getAttribute('data-kind'),
        variant: el.getAttribute('data-variant'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      })),
      toastText: toast?.classList.contains('show') ? (toast.textContent || '').trim() : '',
      engineAlerts: engine?.getAlerts ? engine.getAlerts().map((a: any) => ({
        edgeId: String(a.edgeId), status: a.status, basis: a.basis, slopePct: a.slopePct,
      })) : null,
    };
  });
}

/**
 * The field stepper opens fullscreen on the first TSC3 shot (and stays open —
 * later shots queue a switch-to snackbar instead of hijacking). Canvas taps
 * land on the overlay while it's up, so phases that tap nodes close it first.
 */
async function closeStepperIfOpen(page: Page) {
  await page.evaluate(() => {
    const overlay = document.getElementById('fieldStepperOverlay');
    if (overlay?.classList.contains('open')) {
      (overlay.querySelector('.field-stepper-close') as HTMLElement | null)?.click();
    }
  });
  await page.waitForTimeout(200);
}

interface ShotResult { dialogLatencyMs: number | null; appliedMs: number; taps: number }

/**
 * Send one survey point through the emulator and wait until the app applied it
 * (node exists with the sent elevation). For new points a node-type dialog is
 * expected; re-shoots apply silently.
 */
async function shootPoint(
  page: Page,
  request: APIRequestContext,
  p: { pointName: string; easting: number; northing: number; elevation: number },
  dialogType: 'Manhole' | 'Home' | 'Drainage' | null,
): Promise<ShotResult> {
  const t0 = Date.now();
  const res = await request.post(`${MOCK}/api/send-point`, { data: p });
  expect(res.ok(), `mock accepted ${p.pointName}`).toBe(true);

  let dialogLatencyMs: number | null = null;
  let taps = 0;
  if (dialogType) {
    await page.locator('#surveyNodeTypeDialog').waitFor({ state: 'visible', timeout: 8_000 });
    dialogLatencyMs = Date.now() - t0;
    await page.locator(`#surveyNodeTypeDialog .survey-type-btn[data-type="${dialogType}"]`).tap();
    taps = 1;
  }
  await page.waitForFunction(
    ([name, elev]) => {
      const d = (window as any).__getActiveSketchData?.();
      const n = d?.nodes?.find((n: any) => String(n.id) === String(name));
      return !!n && typeof n.surveyZ === 'number' && Math.abs(n.surveyZ - (elev as number)) < 0.001;
    },
    [p.pointName, p.elevation] as [string, number],
    { timeout: 8_000 },
  );
  const appliedMs = Date.now() - t0;
  await page.waitForTimeout(400); // let feedback (toast/snackbar/highlight) render for the video
  return { dialogLatencyMs, appliedMs, taps };
}

/**
 * Enter a pipe depth. The node details panel only exposes the selected node's
 * OWN side of each connected edge (you measure depth at the manhole you stand
 * at), so entering both depths of one pipe forces selecting both endpoints.
 */
async function enterDepthAtNode(page: Page, nodeId: string, edgeId: string, side: 'tail' | 'head', value: string) {
  const input = page.locator(`[id="edgeMeasure_${edgeId}_${side}"]`);
  // Idempotent select: tapping an already-selected node toggles it off, so only
  // tap when the input is not already on screen; retry once for animation races.
  if (!(await input.isVisible().catch(() => false))) {
    await centerOn(page, nodeId, 0.8);
    const pos = await nodeScreenPos(page, nodeId);
    expect(pos, `node ${nodeId} on screen`).not.toBeNull();
    await page.touchscreen.tap(pos!.sx, pos!.sy);
    const appeared = await input.waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
    if (!appeared) {
      // A toast may sit over the node (real field hazard — recorded as a UX
      // note); dismiss any visible snackbars and retry the selection tap.
      await page.evaluate(() =>
        document.querySelectorAll('#snackbarContainer .snackbar-close').forEach((b) => (b as HTMLElement).click()),
      );
      await page.waitForTimeout(500);
      await page.touchscreen.tap(pos!.sx, pos!.sy);
      await input.waitFor({ state: 'visible', timeout: 5_000 });
    }
  }
  await input.scrollIntoViewIfNeeded({ timeout: 10_000 });
  await input.fill(value);
  await page.waitForTimeout(350);
}

// ═════════════════════════════════════════════════════════════════════════════
test('full network build via TSC3 emulator: UX audit + gradient intelligence', async ({ page, request }) => {
  const up = await request.get(`${MOCK}/api/status`).then((r) => r.ok()).catch(() => false);
  test.skip(!up, 'mock TSC3 server not running (npm run mock:tsc3)');
  await request.post(`${MOCK}/api/clear-history`).catch(() => {});

  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await setup(page);

  // ── Phase 1: connect to the TSC3 emulator ─────────────────────────────────
  // Delta-based: a bystander client (e.g. a real device on the same mock)
  // must not make this pass vacuously — require OUR connection to appear.
  const clientsBefore =
    (await request.get(`${MOCK}/api/status`).then((r) => r.json())).connectedClients ?? 0;
  const tConn = Date.now();
  await page.evaluate(() => (window as any).menuEvents?.emit('connectSurveyWebSocket'));
  await expect
    .poll(async () => (await request.get(`${MOCK}/api/status`).then((r) => r.json())).connectedClients, {
      timeout: 10_000,
    })
    .toBeGreaterThan(clientsBefore);
  const connectMs = Date.now() - tConn;
  const badge = await page.evaluate(() => document.getElementById('surveyConnectionBadge')?.textContent?.trim() ?? '');
  record('connect', { connectMs, badge });
  if (!badge) note('connect', 'minor', 'No visible connection badge text after TSC3 WebSocket connect');

  // ── Phase 2: main line MH-101..MH-105 (MH-104 = deliberate uphill) ───────
  const MAIN: Array<{ pointName: string; easting: number; northing: number; elevation: number }> = [
    { pointName: 'MH-101', easting: 178000, northing: 650000, elevation: 105.0 },
    { pointName: 'MH-102', easting: 178020, northing: 650000, elevation: 104.6 },
    { pointName: 'MH-103', easting: 178040, northing: 650000, elevation: 104.1 },
    { pointName: 'MH-104', easting: 178060, northing: 650000, elevation: 104.55 }, // NEGATIVE gradient
    { pointName: 'MH-105', easting: 178080, northing: 650000, elevation: 103.8 },
  ];
  const shots: Record<string, ShotResult> = {};
  for (const p of MAIN) {
    shots[p.pointName] = await shootPoint(page, request, p, 'Manhole');

    if (p.pointName === 'MH-102') {
      const fb = await feedbackState(page);
      record('feedback.afterValidSegment', fb);
      if (EXPECT_SMART) {
        expect(fb.snackbars.filter((s) => s.kind === 'gradient-negative'), 'no false alert on a valid downhill segment').toHaveLength(0);
      }
    }
    if (p.pointName === 'MH-104') {
      const fb = await feedbackState(page);
      record('feedback.atUphillShotMoment', fb);
      await page.screenshot({ path: `${OUT_DIR}/audit-uphill-shot-moment.png` });
      const flipped = (await sketch(page)).edges.some((e) => e.tail === 'MH-104' && e.head === 'MH-103');
      record('uphillShotFlipped', flipped);
      if (EXPECT_SMART) {
        // The uphill shot must be FIXED at creation (edge created MH-104→MH-103),
        // not warned about: no terrain gradient alert, no gradient snackbar.
        expect(flipped, 'auto-connect created the uphill edge Z-corrected (MH-104→MH-103)').toBe(true);
        expect(fb.engineAlerts, 'gradient engine present and exposing alerts').not.toBeNull();
        expect(
          fb.engineAlerts!.some((a: any) => a.status === 'negative'),
          'no gradient alert — the direction was corrected instead',
        ).toBe(false);
        expect(
          fb.snackbars.some((s) => s.kind === 'gradient-negative'),
          'no negative-gradient snackbar for a Z-corrected connection',
        ).toBe(false);
      } else {
        const warned =
          fb.snackbars.some((s) => s.kind === 'gradient-negative') ||
          /שיפוע|gradient/i.test(fb.toastText);
        record('baseline.uphillHandled', { flipped, warned });
        if (!flipped && !warned) {
          note('smartness', 'major',
            'MH-104 measured 0.45m ABOVE the upstream manhole along shot order — app neither corrected the direction nor warned at measurement time');
        }
      }
    }
  }

  // ── Phase 3: branch off MH-103 (re-shoot to re-anchor, then two points) ──
  shots['MH-103-reshoot'] = await shootPoint(page, request, { pointName: 'MH-103', easting: 178040, northing: 650000, elevation: 104.1 }, null);
  shots['BR-201'] = await shootPoint(page, request, { pointName: 'BR-201', easting: 178040, northing: 650020, elevation: 103.6 }, 'Manhole');
  shots['BR-202'] = await shootPoint(page, request, { pointName: 'BR-202', easting: 178040, northing: 650040, elevation: 103.1 }, 'Manhole');

  // ── Phase 4: home connection off MH-105 (uphill but Home ⇒ exempt) ───────
  shots['MH-105-reshoot'] = await shootPoint(page, request, { pointName: 'MH-105', easting: 178080, northing: 650000, elevation: 103.8 }, null);
  shots['HM-301'] = await shootPoint(page, request, { pointName: 'HM-301', easting: 178085, northing: 650005, elevation: 104.0 }, 'Home');
  const fbHome = await feedbackState(page);
  record('feedback.afterHomeConnection', fbHome);
  if (EXPECT_SMART) {
    expect(
      fbHome.engineAlerts!.filter((a: any) => a.status === 'negative'),
      'no gradient alerts anywhere: the uphill segment was Z-corrected and Home laterals are exempt',
    ).toHaveLength(0);
  }
  record('shots', shots);

  // The stepper stays open from the first shot (later arrivals queue) — close
  // it so the network screenshot and Phase 6's canvas taps see the canvas.
  await closeStepperIfOpen(page);

  // A rapid shot session builds a snackbar QUEUE: dismissing the 3 visible
  // ones just pops queued ones into their place, so mid-screen nodes stay
  // buried on 640×360. Real field hazard — recorded, then bypassed (this spec
  // audits depth entry, not toast layering).
  note('feedback', 'major',
    'Snackbar stack (max 3) + waiting queue keeps the canvas center covered for many seconds after a rapid shot session — node taps land on toasts, and dismissing only surfaces the next queued toast');
  await page.addStyleTag({ content: '#snackbarContainer, #snackbarContainer * { pointer-events: none !important; }' });

  // ── Phase 5: network shape assertions ────────────────────────────────────
  const net = await sketch(page);
  record('network', {
    nodes: net.nodes.map((n) => `${n.id}(${n.type},z=${n.surveyZ})`),
    edges: net.edges.map((e) => `${e.tail}->${e.head}`),
  });
  expect(net.nodes, 'all 8 surveyed points became nodes').toHaveLength(8);
  expect(net.edges, 'auto-connect chained all 7 pipes').toHaveLength(7);
  // Z-aware directions: every arrow points downhill regardless of shot order
  // (MH-104 flipped; HM-301 is the locked Home→main lateral).
  for (const [tail, head] of [
    ['MH-101', 'MH-102'], ['MH-102', 'MH-103'], ['MH-104', 'MH-103'], ['MH-104', 'MH-105'],
    ['MH-103', 'BR-201'], ['BR-201', 'BR-202'], ['HM-301', 'MH-105'],
  ]) {
    expect(
      net.edges.some((e) => e.tail === tail && e.head === head),
      `edge ${tail}->${head} exists with correct (Z-aware) flow direction`,
    ).toBe(true);
  }
  expect(
    net.edges.some((e) => e.tail === 'MH-103' && e.head === 'MH-104'),
    'the blind chronological MH-103->MH-104 arrow must NOT exist',
  ).toBe(false);
  await page.evaluate(() => (window as any).zoomToFit?.());
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/audit-full-network.png` });

  // ── Phase 6: depth measurements via the details panel ────────────────────
  // Bad edge MH-104→MH-103 (the Z-corrected arrow): depths chosen so the
  // INVERT rises along flow even though terrain falls —
  //   inverts 104.55-1.80=102.75 → 104.10-1.20=102.90 (RISES → negative, invert basis)
  // Good edge MH-101→MH-102: inverts 105.00-1.20=103.80 → 104.60-1.10=103.50 (falls → ok)
  const badEdge = net.edges.find((e) => e.tail === 'MH-104' && e.head === 'MH-103')!;
  const tSelect = Date.now();
  await enterDepthAtNode(page, 'MH-104', badEdge.id, 'tail', '1.80');
  const sidebarOpen = await page.evaluate(
    () => !document.getElementById('unifiedSidebar')?.classList.contains('collapsed'),
  );
  record('depthEntry.selectNode', { sidebarOpen, msToFirstDepthEntered: Date.now() - tSelect });
  expect(sidebarOpen, 'tapping a node opens the details sidebar').toBe(true);
  await enterDepthAtNode(page, 'MH-103', badEdge.id, 'head', '1.20');
  note('depth-entry', 'minor',
    'Entering both depths of one pipe requires selecting each endpoint node in turn (panel exposes only the selected node\'s side) — a per-pipe context switch in the field');
  await page.waitForTimeout(600);
  const fbDepth = await feedbackState(page);
  record('feedback.afterBadDepthEntry', fbDepth);
  await page.screenshot({ path: `${OUT_DIR}/audit-depth-entry.png` });
  if (EXPECT_SMART) {
    expect(
      fbDepth.engineAlerts!.some((a: any) => String(a.edgeId) === badEdge.id && a.basis === 'invert' && a.status === 'negative'),
      'entering depths refined the alert to invert-level basis, immediately',
    ).toBe(true);
  } else {
    const warned = fbDepth.snackbars.length > 0 || /שיפוע|gradient/i.test(fbDepth.toastText);
    record('baseline.depthEntryWarned', warned);
    if (!warned) {
      note('smartness', 'major',
        'Depths entered give an invert level RISING along flow (102.75 → 102.90) — no immediate feedback at entry time');
    }
  }

  // Positive control: correct depths on a good edge must not alert.
  const goodEdge = net.edges.find((e) => e.tail === 'MH-101' && e.head === 'MH-102')!;
  await enterDepthAtNode(page, 'MH-101', goodEdge.id, 'tail', '1.20');
  await enterDepthAtNode(page, 'MH-102', goodEdge.id, 'head', '1.10');
  await page.waitForTimeout(600);
  if (EXPECT_SMART) {
    const fbGood = await feedbackState(page);
    expect(
      fbGood.engineAlerts!.filter((a: any) => String(a.edgeId) === goodEdge.id && a.status === 'negative'),
      'correct depths on a downhill pipe produce no alert',
    ).toHaveLength(0);
  }

  // ── Phase 7: what does the issues engine know? ───────────────────────────
  const issues = await page.evaluate(() => {
    const d = (window as any).__getActiveSketchData?.();
    const res = (window as any).__computeSketchIssues?.(d?.nodes ?? [], d?.edges ?? []);
    return (res?.issues ?? []).map((i: any) => ({
      type: i.type, edgeId: i.edgeId ? String(i.edgeId) : undefined, nodeId: i.nodeId,
      gradient: i.gradient, slopePct: i.slopePct, basis: i.basis,
    }));
  });
  record('issuesEngine', issues);
  const negIssues = issues.filter((i: any) => i.type === 'negative_gradient');
  if (EXPECT_SMART) {
    expect(
      negIssues.some((i: any) => i.edgeId === badEdge.id && typeof i.slopePct === 'number'),
      'issues engine reports a true slope-based negative_gradient for the bad edge',
    ).toBe(true);
  } else if (negIssues.length === 0) {
    note('smartness', 'major',
      'Issues engine (depth-delta heuristic) does NOT flag MH-103→MH-104: tail depth 1.50 > head depth 1.20 masks the rising invert because elevations are ignored');
  }

  // ── Phase 8: flicker probe — pan/zoom sweep + sidebar + heatmap toggles ──
  await page.evaluate(() => (window as any).zoomToFit?.());
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const canvas = document.getElementById('graphCanvas') as HTMLCanvasElement;
    const vs = (window as any).getViewState();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // zoom pulse in/out around the current center, then a horizontal pan sweep
    for (let i = 0; i < 24; i++) {
      const k = 1 + 0.35 * Math.sin((i / 24) * Math.PI * 2);
      const sc = vs.viewScale * k;
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const wx = (cx - vs.viewTranslate.x) / (vs.viewScale * vs.viewStretchX);
      const wy = (cy - vs.viewTranslate.y) / (vs.viewScale * vs.viewStretchY);
      (window as any).__setViewState(sc, cx - sc * vs.viewStretchX * wx, cy - sc * vs.viewStretchY * wy);
      (window as any).__scheduleDraw?.();
      await sleep(60);
    }
    for (let i = 0; i < 16; i++) {
      (window as any).__setViewState(vs.viewScale, vs.viewTranslate.x + Math.sin((i / 16) * Math.PI * 2) * 120, vs.viewTranslate.y);
      (window as any).__scheduleDraw?.();
      await sleep(60);
    }
    (window as any).__setViewState(vs.viewScale, vs.viewTranslate.x, vs.viewTranslate.y);
    (window as any).__scheduleDraw?.();
  });
  // heatmap on/off (completeness recolor) — a classic full-canvas restyle
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.body.classList.toggle('heatmap-active'));
    await page.waitForTimeout(700);
  }
  // sidebar open/close transition
  await page.evaluate(() => (window as any).closeSidebar?.());
  await page.waitForTimeout(500);
  record('flickerProbe', 'zoom pulse x24, pan sweep x16, heatmap toggle x2, sidebar close — inspect video');

  record('consoleErrors', consoleErrors.slice(0, 20));
  await page.screenshot({ path: `${OUT_DIR}/audit-final.png` });
});
