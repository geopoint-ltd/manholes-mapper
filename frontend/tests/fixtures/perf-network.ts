/**
 * Deterministic large-network fixture for performance regression tests.
 *
 * Builds an N-node sewer network shaped like real field data (me_rakat): manhole
 * chains laid along a street grid, ITM survey coordinates, ~2/3 of nodes fully
 * measured, a sprinkling of Drainage/Home types. The output is fully
 * deterministic for a given `nNodes` (no Math.random), so timings and issue
 * counts are reproducible run to run.
 *
 * Shared by the Vitest hot-path budgets (tests/perf/) and the Playwright browser
 * latency spec (tests/e2e/perf-latency.spec.ts) so both measure the same graph.
 */

export interface PerfNode {
  id: string;
  x: number;
  y: number;
  surveyX: number | null;
  surveyY: number | null;
  tl: number | null;
  nodeType: string;
  maintenanceStatus: number;
  accuracyLevel: number;
  material: string;
  coverDiameter: string;
  access: number;
  hasCoordinates: boolean;
  _hidden: boolean;
  measurements: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface PerfEdge {
  id: string;
  tail: string;
  head: string;
  material: string;
  edge_type: string;
  line_diameter: string;
  tail_measurement: string;
  head_measurement: string;
  engineeringStatus: number;
  maintenanceStatus: number;
  direction_source: string;
  [key: string]: unknown;
}

export interface PerfNetwork {
  nodes: PerfNode[];
  edges: PerfEdge[];
}

const MATERIALS = ['בטון', 'פי. וי. סי. לפי ת"י 884', 'פוליאתילן'];

// World-coord mapping observed in real me_rakat data: x ≈ surveyX - 12156.24,
// y ≈ -(surveyY - 544584.17).
const toX = (e: number) => e - 12156.24;
const toY = (n: number) => -(n - 544584.17);

/**
 * Build a network of exactly `nNodes` manholes joined into street chains.
 * Chains of 100 alternate vertical/horizontal so the graph spreads in 2D
 * (spatial-grid and merge-scan behaviour depends on real spread, not a line).
 */
export function buildPerfNetwork(nNodes: number): PerfNetwork {
  const SPACING = 40;
  const BASE_E = 250000;
  const BASE_N = 744000;
  const PER_STREET = 100;

  const nodes: PerfNode[] = [];
  const edges: PerfEdge[] = [];
  let made = 0;
  let ei = 0;

  for (let s = 0; made < nNodes; s++) {
    const vertical = s % 2 === 0;
    const lane = Math.floor(s / 2);
    let prevId: string | null = null;
    for (let i = 0; i < PER_STREET && made < nNodes; i++) {
      const e = vertical ? BASE_E + lane * 3 * SPACING : BASE_E + i * SPACING;
      const n = vertical ? BASE_N + i * SPACING : BASE_N + lane * 3 * SPACING + 20;
      const id = `S${s}_${i + 1}`;
      const complete = made % 3 !== 0; // 2/3 fully measured, 1/3 stubs
      nodes.push({
        id,
        x: toX(e),
        y: toY(n),
        surveyX: e,
        surveyY: n,
        tl: complete ? 100 + (made % 20) : null,
        nodeType: made % 29 === 0 ? 'Drainage' : made % 31 === 0 ? 'Home' : 'Manhole',
        maintenanceStatus: 1,
        accuracyLevel: 0,
        material: MATERIALS[made % 3],
        coverDiameter: '65',
        access: 4,
        hasCoordinates: true,
        _hidden: false,
        measurements: complete
          ? [{ ts: '2026-07-01T08:00:00.000Z', easting: e, northing: n, elevation: 100 + (made % 50), source: 'tsc3' }]
          : [],
      });
      if (prevId) {
        edges.push({
          id: `E${ei++}`,
          tail: prevId,
          head: id,
          material: MATERIALS[made % 3],
          edge_type: 'קו ראשי',
          line_diameter: '200',
          tail_measurement: complete ? '1.35' : '',
          head_measurement: complete ? '1.10' : '',
          engineeringStatus: 1,
          maintenanceStatus: 0,
          direction_source: 'user',
        });
      }
      prevId = id;
      made++;
    }
  }

  return { nodes, edges };
}

/** Wrap a network as a full sketch payload for window.__setActiveSketchData(). */
export function buildPerfSketch(nNodes: number) {
  const { nodes, edges } = buildPerfNetwork(nNodes);
  return {
    nodes,
    edges,
    nextNodeId: nNodes + 1,
    creationDate: '2026-07-01T06:00:00.000Z',
    sketchId: 'sk_perf_fixture',
    sketchName: 'PERF-FIXTURE',
    projectId: null,
    inputFlowConfig: null,
    lastEditedBy: 'perf-fixture',
    lastEditX: null,
    lastEditY: null,
  };
}
