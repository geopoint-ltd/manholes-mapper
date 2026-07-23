/**
 * Browser latency regression gate for large networks.
 *
 * Loads a 10,000-node network into the real app and measures the canvas render
 * path at TSC5 field geometry (640×360 DPR2 — what the surveyors actually hold).
 * Runs in the CI `e2e` job on every push to dev.
 *
 * The load-bearing assertions are machine-INDEPENDENT invariants that no CI-runner
 * jitter can flip, and that each catch a specific bug this suite was born from:
 *
 *   1. ALL nodes drawn — draw() must render every visible node, not a truncated
 *      prefix. The renderer this replaced restarted its time-slice from index 0
 *      each frame and only ever drew its first slice (~2,600 of 10,000).
 *   2. NO idle redraw loop — after one scheduleDraw(), an untouched canvas must
 *      settle. The old renderer rescheduled itself forever, pinning the CPU.
 *
 * The millisecond budgets are coarse backstops with generous headroom over the
 * measured cost (~8ms overview), so a slow runner doesn't cause a false failure
 * but a return to tens-of-ms rendering still trips the gate.
 */
import { test, expect } from '@playwright/test';

import { buildPerfSketch } from '../fixtures/perf-network';

const NODES = 10000;

// Rendering a 10k network + measuring 20 frames comfortably fits, but give it room.
test.setTimeout(90_000);

test('10k-node network renders within budget, fully, with no idle redraw loop', async ({ page }, testInfo) => {
  // Field geometry is the point of this gate; the other projects would only add
  // noise and triple the run. (npx playwright test runs all configured projects.)
  test.skip(testInfo.project.name !== 'TSC5', 'latency gate runs at TSC5 field geometry only');

  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // 'networkidle' is unreliable here: the app holds a live websocket / polls for
  // sync, so the network never goes fully idle. The real readiness signal is the
  // canvas bridge being installed, which we wait on explicitly below. The dev
  // server auto-signs-in as dev-user, so there's no login flow to clear.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).__setActiveSketchData === 'function', { timeout: 30_000 });

  const sketch = buildPerfSketch(NODES);

  const result = await page.evaluate(async (data) => {
    // These run in the page against the Vite dev server, which serves /src/*
    // directly. The indirection through a variable keeps tsc from trying to
    // resolve these runtime-only browser paths at compile time.
    const importMod = (p: string) => import(p);
    const cd: any = await importMod('/src/legacy/canvas-draw.js');
    const rp: any = await importMod('/src/utils/render-perf.js');
    rp.renderPerf.enable();

    const w = window as any;
    w.__setActiveSketchData(data);
    w.zoomToFit();

    const benchDraw = () => {
      cd.draw();
      const t: number[] = [];
      for (let i = 0; i < 21; i++) {
        const a = performance.now();
        cd.draw();
        t.push(performance.now() - a);
      }
      t.sort((x, y) => x - y);
      return { medianMs: t[10], p90Ms: t[18] };
    };

    // Overview: every node in view — the worst case.
    const overview = benchDraw();
    const snap = rp.renderPerf.getSnapshot() as any;

    // Field zoom: a handful of nodes — the common case.
    const vs = w.getViewState();
    const n = data.nodes[Math.floor(data.nodes.length / 2)];
    const z = vs.viewScale * 30;
    w.__setViewState(z, -n.x * z + 320, -n.y * z + 180);
    const field = benchDraw();

    // Idle-loop probe: back to a static overview, fire one scheduleDraw(), and
    // count rAF callbacks over ~1s. A settled canvas yields ~1 (the one we asked
    // for); a self-rescheduling renderer yields dozens.
    w.__setViewState(vs.viewScale, vs.viewTranslate.x, vs.viewTranslate.y);
    cd.draw();
    let idleFrames = 0;
    const realRaf = window.requestAnimationFrame.bind(window);
    (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => { idleFrames++; return realRaf(cb); };
    w.__scheduleDraw && w.__scheduleDraw();
    await new Promise((r) => setTimeout(r, 1000));
    (window as any).requestAnimationFrame = realRaf;

    return {
      overview,
      field,
      visibleNodes: snap.visibleNodes,
      visibleEdges: snap.visibleEdges,
      totalNodes: data.nodes.length,
      idleFrames,
    };
  }, sketch);

  // eslint-disable-next-line no-console
  console.log('[perf] ' + JSON.stringify(result));

  expect(pageErrors, 'no page errors while rendering 10k nodes').toEqual([]);

  // ── Machine-independent invariants (the real gate) ──
  expect(result.visibleNodes, 'every visible node must be drawn, not a truncated slice')
    .toBe(result.totalNodes);
  expect(result.idleFrames, 'canvas must settle after one scheduleDraw (no runaway redraw loop)')
    .toBeLessThanOrEqual(3);

  // ── Coarse timing backstops (generous headroom over ~8ms overview / ~4ms field) ──
  expect(result.overview.medianMs, 'overview frame median').toBeLessThan(40);
  expect(result.field.medianMs, 'field-zoom frame median').toBeLessThan(20);
});
