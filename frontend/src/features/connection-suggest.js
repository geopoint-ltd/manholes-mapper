/**
 * connection-suggest.js — Z-aware connection suggestion for a new survey node.
 *
 * Replaces the blind chronological auto-connect (prev → new regardless of
 * elevation) with a tiered decision. Sewage flows downhill: when both nodes
 * carry a real elevation and the difference is unambiguous, the edge direction
 * is higher-Z → lower-Z. When terrain can't decide (flat, missing Z, long
 * jump), the decision is escalated to the field stepper's CONNECT screen
 * instead of guessing.
 *
 * Pure logic — no S/F access. Callers pass state in, get one suggestion out.
 * Spec: docs/SMART_MEASUREMENT_WIZARD.md §B (B2/B3/B4/B8) + §C2.
 *
 * Suggestion kinds:
 *   'none'       — nothing to do (no prev, incompatible pair): zero UI.
 *   'exists'     — pair already connected and not uphill: suppress silently.
 *                  This (not a toast) is what kills the edgeExists ping-pong.
 *   'flip-offer' — pair already connected but the edge runs uphill: offer to
 *                  reverse it ("keep as is" stays the safe default).
 *   'auto'       — unambiguous ΔZ: create higher→lower silently (undoable).
 *   'auto-home'  — new Home next to a Manhole: lateral is locked Home→main,
 *                  gradient-exempt, never asked.
 *   'ask'        — CONNECT screen decision, with `reason`:
 *                  'flat'  — |ΔZ| ≤ FLAT_TOL_M: never guess, equal choices.
 *                  'no-z'  — an elevation is missing: chronological fallback,
 *                            offered but marked unverified.
 *                  'far'   — > LONG_EDGE_THRESHOLD_M from the previous node:
 *                            probably a new run; "no connection" is primary.
 */
import { computeEdgeGradient, edgeLengthM, elevationOf } from './gradient-engine.js';

/** |ΔZ| at or below this (m) is "flat" — terrain must not decide direction. */
export const FLAT_TOL_M = 0.05;
/** Beyond this distance (m) the chain default is "start a new run". */
export const LONG_EDGE_THRESHOLD_M = 70;

/** Non-dangling edge between the two ids, either direction. */
export function findEdgeBetween(edges, aId, bId) {
  const a = String(aId);
  const b = String(bId);
  return (
    (edges || []).find(
      (e) =>
        !e.isDangling &&
        e.tail != null &&
        e.head != null &&
        ((String(e.tail) === a && String(e.head) === b) ||
          (String(e.tail) === b && String(e.head) === a)),
    ) || null
  );
}

/** Terrain evidence for a hypothetical tail→head edge (depths ignored). */
function terrainEvidence(tailNode, headNode, coordinateScale) {
  const g = computeEdgeGradient(
    { tail: tailNode.id, head: headNode.id, tail_measurement: '', head_measurement: '' },
    (id) => (String(id) === String(tailNode.id) ? tailNode : headNode),
    coordinateScale,
  );
  return { deltaZ: g.drop, slopePct: g.slopePct, lengthM: g.lengthM, status: g.status };
}

/**
 * Decide how (and whether) to connect a freshly measured node to the previous
 * chain node.
 *
 * @param {Object} newNode  — the node the shot just landed on
 * @param {Object} prevNode — the chain node (S.lastSurveyNodeId resolved), or null
 * @param {{ edges?: Array, coordinateScale?: number }} ctx
 * @returns {Object} suggestion (see module docblock)
 */
export function suggestChainConnection(newNode, prevNode, { edges = [], coordinateScale = 50 } = {}) {
  const none = { kind: 'none' };
  if (!newNode || !prevNode) return none;
  const newId = String(newNode.id);
  const prevId = String(prevNode.id);
  if (newId === prevId) return none;

  // Dedup runs first (spec B4): an existing edge suppresses every other card.
  const existing = findEdgeBetween(edges, newId, prevId);
  if (existing) {
    const g = computeEdgeGradient(
      existing,
      (id) => (String(id) === newId ? newNode : String(id) === prevId ? prevNode : undefined),
      coordinateScale,
    );
    if (g.status === 'negative') {
      return {
        kind: 'flip-offer',
        edgeId: existing.id,
        tail: String(existing.tail),
        head: String(existing.head),
        evidence: { deltaZ: g.drop, slopePct: g.slopePct, lengthM: g.lengthM },
      };
    }
    return { kind: 'exists' };
  }

  // Home lateral (spec B8): locked Home→main, gradient-exempt, never asked.
  // Only auto-wire against a Manhole — a Home chained onto Drainage (storm)
  // or another Home is a cross-system/odd pair; stay silent rather than guess.
  const newIsHome = newNode.nodeType === 'Home';
  const prevIsHome = prevNode.nodeType === 'Home';
  if (newIsHome || prevIsHome) {
    const homeNode = newIsHome ? newNode : prevNode;
    const mainNode = newIsHome ? prevNode : newNode;
    if (mainNode.nodeType !== 'Manhole' || (newIsHome && prevIsHome)) return none;
    return { kind: 'auto-home', tail: String(homeNode.id), head: String(mainNode.id) };
  }

  const zNew = elevationOf(newNode);
  const zPrev = elevationOf(prevNode);
  const lengthM = edgeLengthM(prevNode, newNode, coordinateScale);
  const far = lengthM != null && lengthM > LONG_EDGE_THRESHOLD_M;

  // Missing elevation → chronological order offered, but never auto-created
  // and explicitly marked unverified (spec B3b / A4: AUTO tier disabled).
  // hasZ travels separately from reason: a far+missing-Z shot reports 'far'
  // (the stronger warning) but must keep its unverified badge and record
  // 'chronological' provenance when the fallback direction is accepted.
  if (zNew == null || zPrev == null) {
    return {
      kind: 'ask',
      reason: far ? 'far' : 'no-z',
      hasZ: false,
      tail: prevId,
      head: newId,
      preselect: false,
      evidence: { deltaZ: null, slopePct: null, lengthM },
    };
  }

  const downTail = zPrev >= zNew ? prevNode : newNode;
  const downHead = downTail === prevNode ? newNode : prevNode;
  const evidence = terrainEvidence(downTail, downHead, coordinateScale);

  // Flat: guessing a flow direction from ≤5cm of terrain noise creates
  // confidently-wrong arrows — always ask (spec B3a).
  if (Math.abs(zPrev - zNew) <= FLAT_TOL_M) {
    return {
      kind: 'ask',
      reason: far ? 'far' : 'flat',
      hasZ: true,
      tail: prevId,
      head: newId,
      preselect: false,
      evidence,
    };
  }

  if (far) {
    return {
      kind: 'ask',
      reason: 'far',
      hasZ: true,
      tail: String(downTail.id),
      head: String(downHead.id),
      preselect: true,
      evidence,
    };
  }

  return {
    kind: 'auto',
    tail: String(downTail.id),
    head: String(downHead.id),
    evidence,
  };
}
