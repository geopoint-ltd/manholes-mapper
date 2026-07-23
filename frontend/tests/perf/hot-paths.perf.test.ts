/**
 * Performance regression budgets for the interaction hot paths that scale with
 * node count — the ones that made large networks (me_rakat, 10k target) lag.
 *
 * These run in the default Vitest suite (`npm run test:run`), so every commit
 * and the CI `unit` job enforce them, with no browser.
 *
 * ── Why these assertions don't flake on slow CI ──
 * Timing is machine-dependent, so absolute-ms budgets here carry huge headroom
 * (tens of × over the current cost) and exist only as a coarse "it's obviously
 * broken again" backstop. The precise guard is the SCALING RATIO between a small
 * (2.5k) and a large (10k) network measured in the SAME run on the SAME machine:
 *   - linear work (map lookup, single O(E) pass) grows ~4× when the graph is 4×.
 *   - the regressions we're guarding against were O(E·N) / O(N²): ~16× or worse.
 * A ratio ceiling well between those two (≈8×) separates them regardless of how
 * fast the runner is. The old code these tests would catch:
 *   - findEdgeAt with nodes.find() per edge: ~80ms at 10k (vs ~0.3ms now).
 *   - computeSketchIssues brute-force merge scan: ~240ms at 9k (vs ~7ms now).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

import { buildPerfNetwork } from '../fixtures/perf-network';

// pointer-handlers pulls heavy UI siblings at import that findEdgeAt/findNodeAt
// never touch (they use only S + geometry). Stub them so the import resolves in
// jsdom; shared-state, geometry and constants stay REAL so we exercise the real
// hit-test code against a real populated state.
vi.mock('../../src/field-stepper/field-stepper.js', () => ({ openFieldStepper: vi.fn() }));
vi.mock('../../src/dom/dom-utils.js', () => ({ commitIdInputIfFocused: vi.fn() }));
vi.mock('../../src/state/placement-mode.js', () => ({ isRapidPlacement: () => false }));
vi.mock('../../src/legacy/wizard-helpers.js', () => ({ wizardIsRTKFixed: () => false }));

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });
  }
});

const SMALL = 2500;
const LARGE = 10000;

// Median of `reps` timed calls (median resists GC / scheduler blips better than mean).
function medianMs(fn: () => void, reps: number): number {
  fn(); // warm JIT + caches
  const t: number[] = [];
  for (let i = 0; i < reps; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  t.sort((x, y) => x - y);
  return t[Math.floor(reps / 2)];
}

describe('perf: interaction hot paths scale with node count', () => {
  it('computeSketchIssues stays linear-ish (guards the O(N²) merge scan)', async () => {
    const { computeSketchIssues } = await import('../../src/project/sketch-issues.js');
    const small = buildPerfNetwork(SMALL);
    const large = buildPerfNetwork(LARGE);

    // Correctness guard alongside the budget: the function must actually produce
    // results (a no-op would trivially be "fast").
    expect(computeSketchIssues(large.nodes, large.edges).issues.length).toBeGreaterThan(0);

    const smallMs = medianMs(() => computeSketchIssues(small.nodes, small.edges), 5);
    const largeMs = medianMs(() => computeSketchIssues(large.nodes, large.edges), 5);

    // Coarse backstop (current ~7ms; the old quadratic scan was ~240ms at 9k).
    expect(largeMs).toBeLessThan(80);
    // Scaling guard: 4× the graph must not cost ~16× the time.
    expect(largeMs).toBeLessThan(smallMs * 8 + 5);
  });

  it('findEdgeAt is O(E), not O(E·N) (guards the per-edge node rescan)', async () => {
    const { S } = await import('../../src/legacy/shared-state.js');
    const { findEdgeAt } = await import('../../src/legacy/pointer-handlers.js');

    const loadState = (net: ReturnType<typeof buildPerfNetwork>) => {
      S.nodes = net.nodes;
      S.edges = net.edges;
      S.nodeMap = new Map();
      S._nodeMapDirty = true;
      S.autoSizeEnabled = false;
      S.viewScale = 1;
      S.sizeScale = 1;
    };

    const small = buildPerfNetwork(SMALL);
    const large = buildPerfNetwork(LARGE);

    // Tap right on a mid-network edge so the call does real distance work, not an
    // early-out on an empty region. Sanity-check it actually resolves an edge.
    loadState(large);
    const mid = large.nodes[Math.floor(large.nodes.length / 2)];
    expect(findEdgeAt(mid.x + 3, mid.y, 8)).toBeTruthy();

    const largeMs = medianMs(() => findEdgeAt(mid.x + 3, mid.y, 8), 15);

    loadState(small);
    const midS = small.nodes[Math.floor(small.nodes.length / 2)];
    const smallMs = medianMs(() => findEdgeAt(midS.x + 3, midS.y, 8), 15);

    // Coarse backstop (current ~0.3ms; the old O(E·N) scan was ~80ms at 10k).
    expect(largeMs).toBeLessThan(15);
    // 4× the edges must cost roughly 4×, not the ~16× of a nested scan.
    expect(largeMs).toBeLessThan(smallMs * 8 + 2);
  });

  it('findNodeAt stays cheap per tap', async () => {
    const { S } = await import('../../src/legacy/shared-state.js');
    const { findNodeAt } = await import('../../src/legacy/pointer-handlers.js');

    const large = buildPerfNetwork(LARGE);
    S.nodes = large.nodes;
    S.autoSizeEnabled = false;
    S.viewScale = 1;
    S.sizeScale = 1;

    const target = large.nodes[Math.floor(large.nodes.length / 2)];
    expect(findNodeAt(target.x, target.y)).toBeTruthy();

    const largeMs = medianMs(() => findNodeAt(target.x, target.y), 15);
    // A single linear scan of 10k nodes; generous ceiling, current ~0.05ms.
    expect(largeMs).toBeLessThan(10);
  });
});
