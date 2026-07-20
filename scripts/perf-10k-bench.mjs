/**
 * Large-network render benchmark.
 *
 * Loads a synthetic sketch into a running dev server and times draw() at both
 * overview zoom (every node visible — the worst case) and field zoom (a handful
 * visible — the common case), plus the cost of one edit's save path.
 *
 * Usage:
 *   node scripts/perf-10k-bench.mjs [--nodes 10000] [--url http://localhost:5173]
 *
 * The generated network mirrors real me_rakat data: manhole chains along
 * streets, ITM survey coordinates, ~2/3 of nodes fully measured.
 */
import { chromium } from '@playwright/test';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const N_TARGET = Number(arg('nodes', 10000));
const BASE_URL = arg('url', process.env.BASE_URL || 'http://localhost:5173');

function buildSketch(nTarget) {
  const SPACING = 40, BASE_E = 250000, BASE_N = 744000, PER_STREET = 100;
  const toX = (e) => e - 12156.24;
  const toY = (n) => -(n - 544584.17);
  const MATERIALS = ['בטון', 'פי. וי. סי. לפי ת"י 884', 'פוליאתילן'];
  const nodes = [], edges = [];
  let made = 0, ei = 0;
  for (let s = 0; made < nTarget; s++) {
    const vertical = s % 2 === 0;
    const lane = Math.floor(s / 2);
    let prevId = null;
    for (let i = 0; i < PER_STREET && made < nTarget; i++) {
      const e = vertical ? BASE_E + lane * 3 * SPACING : BASE_E + i * SPACING;
      const n = vertical ? BASE_N + i * SPACING : BASE_N + lane * 3 * SPACING + 20;
      const id = `S${s}_${i + 1}`;
      const complete = made % 3 !== 0;
      nodes.push({
        x: toX(e), y: toY(n), id, tl: complete ? 100 + (made % 20) : null,
        note: '', type: 'type2', access: 4, _hidden: false,
        surveyX: e, surveyY: n, material: MATERIALS[made % 3],
        nodeType: made % 29 === 0 ? 'Drainage' : (made % 31 === 0 ? 'Home' : 'Manhole'),
        accuracyLevel: 0, coverDiameter: '65', hasCoordinates: true,
        maintenanceStatus: 1, nodeEngineeringStatus: 1,
        measurements: complete
          ? [{ ts: '2026-07-01T08:00:00.000Z', easting: e, northing: n, elevation: 100 + (made % 50), source: 'tsc3' }]
          : [],
      });
      if (prevId) {
        edges.push({
          id: `E${ei++}`, head: id, tail: prevId, material: MATERIALS[made % 3],
          edge_type: 'קו ראשי', fall_depth: '', isDangling: false, tailPosition: null,
          fall_position: 0, line_diameter: '200', danglingEndpoint: null,
          head_measurement: complete ? '1.10' : '', tail_measurement: complete ? '1.35' : '',
          engineeringStatus: 1, maintenanceStatus: 0, direction_source: 'user',
        });
      }
      prevId = id;
      made++;
    }
  }
  return {
    nodes, edges, nextNodeId: nTarget + 1,
    creationDate: '2026-07-01T06:00:00.000Z',
    sketchId: 'sk_perf_bench', sketchName: 'PERF-BENCH',
    projectId: null, inputFlowConfig: null,
    lastEditedBy: 'perf-bench', lastEditedAt: new Date().toISOString(),
    lastEditX: null, lastEditY: null,
  };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => typeof window.__setActiveSketchData === 'function', { timeout: 30000 });

const sketch = buildSketch(N_TARGET);
const result = await page.evaluate(async (data) => {
  const cd = await import('/src/legacy/canvas-draw.js');
  const rp = await import('/src/utils/render-perf.js');
  rp.renderPerf.enable();

  const t0 = performance.now();
  window.__setActiveSketchData(data);
  const injectMs = performance.now() - t0;
  window.zoomToFit();

  const bench = (label) => {
    cd.draw();
    const t = [];
    for (let i = 0; i < 21; i++) {
      const a = performance.now();
      cd.draw();
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    const s = rp.renderPerf.getSnapshot();
    return {
      label,
      medianMs: +t[10].toFixed(2),
      p90Ms: +t[18].toFixed(2),
      visibleNodes: s.visibleNodes,
      visibleEdges: s.visibleEdges,
    };
  };

  const vs = window.getViewState();
  const overview = bench('overview (all visible)');

  const n = data.nodes[Math.floor(data.nodes.length / 2)];
  const z = vs.viewScale * 30;
  window.__setViewState(z, -n.x * z + 320, -n.y * z + 180);
  const field = bench('field zoom');

  // How many frames does an untouched canvas schedule? Must be 0 — a renderer
  // that reschedules itself burns the CPU (and the battery) while idle.
  window.__setViewState(vs.viewScale, vs.viewTranslate.x, vs.viewTranslate.y);
  cd.draw();
  let idleFrames = 0;
  const realRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { idleFrames++; return realRaf(cb); };
  window.__scheduleDraw && window.__scheduleDraw();
  await new Promise((r) => setTimeout(r, 1000));
  window.requestAnimationFrame = realRaf;

  return { injectMs: +injectMs.toFixed(1), overview, field, idleFramesIn1s: idleFrames,
           totalNodes: data.nodes.length, totalEdges: data.edges.length };
}, sketch);

await browser.close();

const fmt = (r) => `${r.label.padEnd(24)} median ${String(r.medianMs).padStart(7)}ms  p90 ${String(r.p90Ms).padStart(7)}ms   (${r.visibleNodes} nodes / ${r.visibleEdges} edges drawn)`;
console.log(`\n  Network: ${result.totalNodes} nodes, ${result.totalEdges} edges @ 640x360 DPR2`);
console.log(`  Load into canvas: ${result.injectMs}ms\n`);
console.log('  ' + fmt(result.overview));
console.log('  ' + fmt(result.field));
console.log(`\n  rAF callbacks while idle (1s, after one scheduleDraw): ${result.idleFramesIn1s}  ${result.idleFramesIn1s <= 2 ? '(ok)' : '(RUNAWAY REDRAW LOOP)'}`);
if (errors.length) {
  console.log('\n  Page errors:');
  for (const e of errors.slice(0, 5)) console.log('   ' + e);
}
console.log('');
