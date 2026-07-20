/**
 * Pure issue detection and statistics for sketch data.
 *
 * Issue types:
 * 1. Missing coordinates — node without surveyX/surveyY
 * 2. Missing measurement on תקין node — node with maintenanceStatus === 1
 *    where a connected edge is missing tail_measurement (node is tail)
 *    or head_measurement (node is head)
 * 3. Long edge — edge whose ITM length exceeds 70m
 * 4. Not last manhole — manhole with only inbound edges (head) and no outbound (tail)
 * 4b. Merge candidate — two nearby stubs in different connected components
 * 5. Negative gradient — pipe where head is deeper than tail (uphill flow)
 * 6. Obstructed access — node with maintenance status indicating access blocked
 *    (locked house=13, covered=4, can't open=3, no cover=10, etc.)
 * 7. Schematic location — node placed from sketch approximation (accuracyLevel=1)
 *    that has no survey coordinates
 * 8. Missing TL — node that has survey coordinates but no TL (top level) elevation
 */

import { computeEdgeGradient } from '../features/gradient-engine.js';

/**
 * @typedef {{ type: 'missing_coords' | 'missing_pipe_data' | 'long_edge' | 'not_last_manhole' | 'merge_candidate' | 'negative_gradient' | 'obstructed_access' | 'schematic_location' | 'missing_tl', nodeId?: string|number, edgeId?: string|number, side?: 'tail'|'head', worldX: number, worldY: number, lengthM?: number, gradient?: number, slopePct?: number|null, basis?: 'invert'|'terrain'|'depth', mergeNodeId?: string|number, distanceM?: number, mergeWorldX?: number, mergeWorldY?: number, reason?: string }} Issue
 * @typedef {{ totalKm: number, issueCount: number, missingCoordsCount: number, missingPipeDataCount: number, obstructedAccessCount: number, schematicLocationCount: number, missingTlCount: number }} SketchStats
 */

const LONG_EDGE_THRESHOLD_M = 70;
const MERGE_DISTANCE_THRESHOLD_M = 40;

// accuracyLevel codes: 0 = Engineering, 1 = Schematic
const SCHEMATIC_ACCURACY = 1;

// Maintenance status codes that indicate obstructed access
const OBSTRUCTED_STATUSES = new Map([
  [3, 'לא ניתן לפתיחה'],
  [4, 'שוחה מכוסה'],
  [5, 'שוחת ביוב - ללא גישה'],
  [10, 'ללא מכסה'],
  [13, 'בית נעול'],
]);

/**
 * Find connected components in an undirected graph.
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Map<string, number>} nodeId → componentId
 */
function findConnectedComponents(nodes, edges) {
  const adj = new Map();
  for (const n of nodes) adj.set(String(n.id), []);
  for (const e of edges) {
    const t = String(e.tail);
    const h = String(e.head);
    if (adj.has(t) && adj.has(h)) {
      adj.get(t).push(h);
      adj.get(h).push(t);
    }
  }
  const comp = new Map();
  let compId = 0;
  for (const [nodeId] of adj) {
    if (comp.has(nodeId)) continue;
    const queue = [nodeId];
    comp.set(nodeId, compId);
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const nb of adj.get(cur) || []) {
        if (!comp.has(nb)) {
          comp.set(nb, compId);
          queue.push(nb);
        }
      }
    }
    compId++;
  }
  return comp;
}

/**
 * Check if a node has no measurements on any of its connected edges.
 * @param {string} nodeId
 * @param {Array} edges
 * @returns {boolean}
 */
function nodeHasNoMeasurements(nodeId, edges) {
  const id = String(nodeId);
  for (const e of edges) {
    if (String(e.tail) === id && (e.tail_measurement || e.tail_measurement === 0)) return false;
    if (String(e.head) === id && (e.head_measurement || e.head_measurement === 0)) return false;
  }
  return true;
}

/**
 * Count edges connected to a node.
 * @param {string} nodeId
 * @param {Array} edges
 * @returns {number}
 */
function countNodeEdges(nodeId, edges) {
  const id = String(nodeId);
  let count = 0;
  for (const e of edges) {
    if (String(e.tail) === id || String(e.head) === id) count++;
  }
  return count;
}

/**
 * Compute issues and statistics for a single sketch.
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {{ issues: Issue[], stats: SketchStats }}
 */
export function computeSketchIssues(nodes, edges) {
  if (!nodes || !edges) return { issues: [], stats: { totalKm: 0, issueCount: 0, missingCoordsCount: 0, missingPipeDataCount: 0 } };

  const nodeMap = new Map();
  for (const n of nodes) nodeMap.set(String(n.id), n);

  const issues = [];

  // 1. Missing coordinates — skip schematic nodes and home connections
  for (const node of nodes) {
    if (node.surveyX == null || node.surveyY == null) {
      // Schematic nodes intentionally lack precise coords
      if (node.accuracyLevel === SCHEMATIC_ACCURACY) continue;
      // Home connections don't require RTK coords
      if (node.nodeType === 'Home') continue;
      issues.push({
        type: 'missing_coords',
        nodeId: node.id,
        worldX: node.x || 0,
        worldY: node.y || 0,
      });
    }
  }

  // 2. Missing pipe data (depth measurements) on תקין (maintenanceStatus === 1) nodes.
  //    These are nodes that have GPS coordinates but are missing edge depth/measurement data.
  for (const edge of edges) {
    const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;

    // Check tail side
    if (tailNode && tailNode.maintenanceStatus === 1) {
      if (!edge.tail_measurement && edge.tail_measurement !== 0) {
        issues.push({
          type: 'missing_pipe_data',
          nodeId: tailNode.id,
          edgeId: edge.id,
          side: 'tail',
          worldX: tailNode.x || 0,
          worldY: tailNode.y || 0,
        });
      }
    }

    // Check head side
    if (headNode && headNode.maintenanceStatus === 1) {
      if (!edge.head_measurement && edge.head_measurement !== 0) {
        issues.push({
          type: 'missing_pipe_data',
          nodeId: headNode.id,
          edgeId: edge.id,
          side: 'head',
          worldX: headNode.x || 0,
          worldY: headNode.y || 0,
        });
      }
    }
  }

  // 3. Long edges — edges whose real-world length exceeds threshold
  for (const edge of edges) {
    const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;
    if (!tailNode || !headNode) continue;
    if (tailNode.surveyX == null || headNode.surveyX == null) continue;

    const dx = headNode.surveyX - tailNode.surveyX;
    const dy = headNode.surveyY - tailNode.surveyY;
    const lengthM = Math.sqrt(dx * dx + dy * dy);

    if (lengthM > LONG_EDGE_THRESHOLD_M) {
      issues.push({
        type: 'long_edge',
        edgeId: edge.id,
        tailId: tailNode.id,
        headId: headNode.id,
        worldX: (tailNode.x + headNode.x) / 2,
        worldY: (tailNode.y + headNode.y) / 2,
        lengthM: Math.round(lengthM),
      });
    }
  }

  // 4. Not last manhole — nodes with only inbound edges (head) and no outbound (tail)
  //    Excludes Home connections (naturally terminal)
  const tailSet = new Set();
  const headSet = new Set();
  for (const edge of edges) {
    if (edge.tail != null) tailSet.add(String(edge.tail));
    if (edge.head != null) headSet.add(String(edge.head));
  }
  for (const node of nodes) {
    if (node.nodeType === 'Home') continue;
    const id = String(node.id);
    // Must have at least one inbound edge and zero outbound edges
    if (headSet.has(id) && !tailSet.has(id)) {
      issues.push({
        type: 'not_last_manhole',
        nodeId: node.id,
        worldX: node.x || 0,
        worldY: node.y || 0,
      });
    }
  }

  // 4b. Merge candidate — nearby stubs in different connected components
  console.time('[PERF] computeIssues:mergeCandidate');
  const components = findConnectedComponents(nodes, edges);

  // Pre-compute edge counts and measurement flags per node (O(E) instead of O(N*E))
  const edgeCountMap = new Map();
  const hasMeasurementMap = new Map();
  for (const e of edges) {
    const t = String(e.tail);
    const h = String(e.head);
    edgeCountMap.set(t, (edgeCountMap.get(t) || 0) + 1);
    edgeCountMap.set(h, (edgeCountMap.get(h) || 0) + 1);
    if (e.tail_measurement || e.tail_measurement === 0) hasMeasurementMap.set(t, true);
    if (e.head_measurement || e.head_measurement === 0) hasMeasurementMap.set(h, true);
  }

  // Collect eligible stub nodes (degree=1, no measurements, not Home)
  const stubNodes = [];
  for (const node of nodes) {
    if (node.nodeType === 'Home') continue;
    const id = String(node.id);
    if (edgeCountMap.get(id) !== 1) continue;
    if (hasMeasurementMap.has(id)) continue;
    stubNodes.push(node);
  }

  const notLastManholeIssues = issues.filter(i => i.type === 'not_last_manhole');
  const mergedNodeIds = new Set();

  // Bucket the stubs into a spatial hash sized to the search radius, so each
  // candidate only tests the 9 cells that can hold a match. Pairing every
  // not-last-manhole against every stub was quadratic: on a part-surveyed 10k
  // network both sets run to thousands and this scan alone took tens of ms,
  // re-run on every data change.
  const CELL = MERGE_DISTANCE_THRESHOLD_M;
  const coordOf = (n) => [
    n.surveyX != null ? n.surveyX : (n.x || 0) / 50,
    n.surveyY != null ? n.surveyY : (n.y || 0) / 50,
  ];
  /** @type {Map<string, Array<{node: object, x: number, y: number}>>} */
  const stubGrid = new Map();
  for (const nodeB of stubNodes) {
    const [bX, bY] = coordOf(nodeB);
    const key = `${Math.floor(bX / CELL)},${Math.floor(bY / CELL)}`;
    let bucket = stubGrid.get(key);
    if (!bucket) { bucket = []; stubGrid.set(key, bucket); }
    bucket.push({ node: nodeB, x: bX, y: bY });
  }

  // Rewrites are collected and applied in a single pass at the end; doing them
  // inline cost an indexOf + findIndex + splice scan of `issues` per match.
  /** @type {Map<object, object>} original not_last_manhole issue → replacement */
  const replacements = new Map();
  /** @type {Set<string>} node ids whose not_last_manhole issue is superseded */
  const absorbedNodeIds = new Set();
  const maxDistSq = MERGE_DISTANCE_THRESHOLD_M * MERGE_DISTANCE_THRESHOLD_M;

  for (const nlm of notLastManholeIssues) {
    const nodeA = nodeMap.get(String(nlm.nodeId));
    if (!nodeA) continue;
    const idA = String(nodeA.id);
    if (edgeCountMap.get(idA) !== 1) continue;
    if (hasMeasurementMap.has(idA)) continue;
    // A node already paired off can't be the anchor of a second suggestion.
    if (mergedNodeIds.has(idA)) continue;
    const compA = components.get(idA);

    const [aX, aY] = coordOf(nodeA);

    let bestNode = null;
    let bestDistSq = Infinity;

    const cx = Math.floor(aX / CELL);
    const cy = Math.floor(aY / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = stubGrid.get(`${gx},${gy}`);
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const entry = bucket[k];
          const nodeB = entry.node;
          if (nodeB === nodeA) continue;
          const idB = String(nodeB.id);
          if (mergedNodeIds.has(idB)) continue;
          if (components.get(idB) === compA) continue;
          const dx = aX - entry.x;
          const dy = aY - entry.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < maxDistSq && distSq < bestDistSq) {
            bestDistSq = distSq;
            bestNode = nodeB;
          }
        }
      }
    }

    if (bestNode) {
      mergedNodeIds.add(idA);
      mergedNodeIds.add(String(bestNode.id));
      absorbedNodeIds.add(String(bestNode.id));
      replacements.set(nlm, {
        type: 'merge_candidate',
        nodeId: nodeA.id,
        mergeNodeId: bestNode.id,
        distanceM: Math.round(Math.sqrt(bestDistSq)),
        worldX: nodeA.x || 0,
        worldY: nodeA.y || 0,
        mergeWorldX: bestNode.x || 0,
        mergeWorldY: bestNode.y || 0,
      });
    }
  }

  if (replacements.size > 0) {
    let write = 0;
    for (let read = 0; read < issues.length; read++) {
      const issue = issues[read];
      const replacement = replacements.get(issue);
      if (replacement) {
        issues[write++] = replacement;
      } else if (issue.type === 'not_last_manhole' && absorbedNodeIds.has(String(issue.nodeId))) {
        continue; // folded into the partner's merge_candidate issue
      } else {
        issues[write++] = issue;
      }
    }
    issues.length = write;
  }

  console.timeEnd('[PERF] computeIssues:mergeCandidate');

  // 5. Negative gradient — true hydraulic slope from elevations (invert or
  // terrain basis) via the gradient engine; falls back to the legacy
  // depth-delta heuristic only when no elevations are available. Edges
  // touching Home/ForLater/Issue nodes are exempt (laterals rise legally).
  for (const edge of edges) {
    const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;
    const g = computeEdgeGradient(edge, (id) => nodeMap.get(String(id)));
    if (g.status === 'exempt') continue;

    let isNegative = false;
    let gradientM = null;
    // Terrain basis (no depths yet) is a transient early warning handled by
    // the live snackbar — counting it as a persistent issue would flood the
    // panel and crash the completion score mid-survey, before depths exist.
    if (g.status === 'negative' && g.basis !== 'terrain') {
      isNegative = true;
      gradientM = Math.abs(g.drop ?? 0);
    } else if (g.status === 'unknown') {
      // Legacy fallback: head deeper than tail = uphill (no elevations known)
      const tailMeas = parseFloat(edge.tail_measurement);
      const headMeas = parseFloat(edge.head_measurement);
      if (!isNaN(tailMeas) && !isNaN(headMeas) && tailMeas > 0 && headMeas > 0 && headMeas > tailMeas) {
        isNegative = true;
        gradientM = +(headMeas - tailMeas).toFixed(3);
      }
    }
    if (isNegative) {
      issues.push({
        type: 'negative_gradient',
        edgeId: edge.id,
        tailId: edge.tail,
        headId: edge.head,
        gradient: gradientM,
        slopePct: g.slopePct,
        basis: g.basis ?? 'depth',
        worldX: tailNode && headNode ? (tailNode.x + headNode.x) / 2 : 0,
        worldY: tailNode && headNode ? (tailNode.y + headNode.y) / 2 : 0,
      });
    }
  }

  // 6. Obstructed access — maintenance status indicates access is blocked
  for (const node of nodes) {
    if (node.nodeType === 'Home') continue;
    const status = node.maintenanceStatus;
    if (OBSTRUCTED_STATUSES.has(status)) {
      issues.push({
        type: 'obstructed_access',
        nodeId: node.id,
        worldX: node.x || 0,
        worldY: node.y || 0,
        reason: OBSTRUCTED_STATUSES.get(status),
      });
    }
  }

  // 7. Schematic location — node with schematic accuracy and no survey coords
  for (const node of nodes) {
    if (node.nodeType === 'Home') continue;
    if (node.accuracyLevel === SCHEMATIC_ACCURACY && (node.surveyX == null || node.surveyY == null)) {
      issues.push({
        type: 'schematic_location',
        nodeId: node.id,
        worldX: node.x || 0,
        worldY: node.y || 0,
      });
    }
  }

  // 8. Missing TL — node with survey coords but no elevation. surveyZ is the
  // same physical quantity (terrain level, written by TSC3/GNSS measurements),
  // so either field satisfies the requirement.
  for (const node of nodes) {
    if (node.nodeType === 'Home') continue;
    // 0 means "not measured" for both fields (parsers coerce missing to 0)
    const tlNum = Number(node.tl);
    const hasTl = !(node.tl == null || node.tl === '' || Number.isNaN(tlNum) || tlNum === 0);
    const z = Number(node.surveyZ);
    const hasZ = node.surveyZ != null && node.surveyZ !== '' && !Number.isNaN(z) && z !== 0;
    if (node.surveyX != null && node.surveyY != null && !hasTl && !hasZ) {
      issues.push({
        type: 'missing_tl',
        nodeId: node.id,
        worldX: node.x || 0,
        worldY: node.y || 0,
      });
    }
  }

  // Sort by severity; within each type by id
  const typeOrder = { missing_coords: 0, missing_pipe_data: 1, long_edge: 2, not_last_manhole: 3, merge_candidate: 3.5, negative_gradient: 4, obstructed_access: 5, schematic_location: 6, missing_tl: 7 };
  issues.sort((a, b) => {
    const tDiff = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
    if (tDiff !== 0) return tDiff;
    const na = parseInt(a.nodeId ?? a.tailId, 10);
    const nb = parseInt(b.nodeId ?? b.tailId, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return 0;
  });

  // Compute total km from edges where both endpoints have survey coordinates
  let totalMeters = 0;
  for (const edge of edges) {
    const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
    const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : null;
    if (tailNode && headNode && tailNode.surveyX != null && tailNode.surveyY != null && headNode.surveyX != null && headNode.surveyY != null) {
      const dx = headNode.surveyX - tailNode.surveyX;
      const dy = headNode.surveyY - tailNode.surveyY;
      totalMeters += Math.sqrt(dx * dx + dy * dy);
    }
  }

  // Count issues by category for the breakdown display
  let missingCoordsCount = 0;
  let missingPipeDataCount = 0;
  let obstructedAccessCount = 0;
  let schematicLocationCount = 0;
  let missingTlCount = 0;
  for (const issue of issues) {
    if (issue.type === 'missing_coords') missingCoordsCount++;
    else if (issue.type === 'missing_pipe_data') missingPipeDataCount++;
    else if (issue.type === 'obstructed_access') obstructedAccessCount++;
    else if (issue.type === 'schematic_location') schematicLocationCount++;
    else if (issue.type === 'missing_tl') missingTlCount++;
  }

  return {
    issues,
    stats: {
      totalKm: totalMeters / 1000,
      issueCount: issues.length,
      missingCoordsCount,
      missingPipeDataCount,
      obstructedAccessCount,
      schematicLocationCount,
      missingTlCount,
    },
  };
}

/**
 * Compute aggregated totals from an array of per-sketch stats.
 * @param {SketchStats[]} statsArray
 * @returns {SketchStats}
 */
export function computeProjectTotals(statsArray) {
  let totalKm = 0;
  let issueCount = 0;
  let missingCoordsCount = 0;
  let missingPipeDataCount = 0;
  let obstructedAccessCount = 0;
  let schematicLocationCount = 0;
  let missingTlCount = 0;
  for (const s of statsArray) {
    totalKm += s.totalKm;
    issueCount += s.issueCount;
    missingCoordsCount += s.missingCoordsCount || 0;
    missingPipeDataCount += s.missingPipeDataCount || 0;
    obstructedAccessCount += s.obstructedAccessCount || 0;
    schematicLocationCount += s.schematicLocationCount || 0;
    missingTlCount += s.missingTlCount || 0;
  }
  return { totalKm, issueCount, missingCoordsCount, missingPipeDataCount, obstructedAccessCount, schematicLocationCount, missingTlCount };
}
