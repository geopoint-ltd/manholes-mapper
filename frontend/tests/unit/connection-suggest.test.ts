/**
 * Unit tests for connection-suggest — the Z-aware chain-connection decision
 * that replaced blind chronological auto-connect (spec: docs/SMART_MEASUREMENT_WIZARD.md §B).
 *
 * suggestChainConnection() is pure: nodes/edges in, one suggestion out.
 */
import { describe, it, expect } from 'vitest';
import {
  suggestChainConnection,
  findEdgeBetween,
  FLAT_TOL_M,
  LONG_EDGE_THRESHOLD_M,
} from '../../src/features/connection-suggest.js';

/** ITM-ish node factory: 1m grid around a fixed origin. */
function node(id: string, opts: Record<string, unknown> = {}) {
  return {
    id,
    nodeType: 'Manhole',
    hasCoordinates: true,
    surveyX: 178000,
    surveyY: 650000,
    surveyZ: 100,
    x: 100,
    y: 100,
    ...opts,
  };
}

function edge(tail: string, head: string, opts: Record<string, unknown> = {}) {
  return { id: `${tail}-${head}`, tail, head, tail_measurement: '', head_measurement: '', ...opts };
}

describe('suggestChainConnection — tier decision', () => {
  it('returns none without a previous node', () => {
    expect(suggestChainConnection(node('2'), null).kind).toBe('none');
  });

  it('returns none when prev === new', () => {
    const n = node('2');
    expect(suggestChainConnection(n, n).kind).toBe('none');
  });

  it('downhill shot: AUTO with tail = previous (higher) node', () => {
    const prev = node('101', { surveyZ: 100.5 });
    const next = node('102', { surveyX: 178030, surveyZ: 100.0 });
    const s = suggestChainConnection(next, prev, { edges: [] });
    expect(s.kind).toBe('auto');
    expect(s.tail).toBe('101');
    expect(s.head).toBe('102');
    expect(s.evidence.slopePct).toBeGreaterThan(0);
  });

  it('uphill shot: AUTO but direction FLIPPED — tail = new (higher) node', () => {
    const prev = node('101', { surveyZ: 100.0 });
    const next = node('102', { surveyX: 178030, surveyZ: 100.45 });
    const s = suggestChainConnection(next, prev, { edges: [] });
    expect(s.kind).toBe('auto');
    expect(s.tail).toBe('102');
    expect(s.head).toBe('101');
  });

  it('flat pair (|ΔZ| ≤ tolerance): ASK, chronological order offered, no preselect', () => {
    const prev = node('101', { surveyZ: 100.0 });
    const next = node('102', { surveyX: 178030, surveyZ: 100.0 + FLAT_TOL_M });
    const s = suggestChainConnection(next, prev, { edges: [] });
    expect(s.kind).toBe('ask');
    expect(s.reason).toBe('flat');
    expect(s.tail).toBe('101');
    expect(s.head).toBe('102');
    expect(s.preselect).toBe(false);
  });

  it('missing elevation (parser Z=0 sentinel): ASK unverified chronological', () => {
    const prev = node('101', { surveyZ: 100.0 });
    const next = node('102', { surveyX: 178030, surveyZ: 0 });
    const s = suggestChainConnection(next, prev, { edges: [] });
    expect(s.kind).toBe('ask');
    expect(s.reason).toBe('no-z');
    expect(s.hasZ).toBe(false);
    expect(s.tail).toBe('101');
    expect(s.preselect).toBe(false);
  });

  it('missing elevation AND far: reason far but hasZ stays false (unverified badge + chronological provenance survive)', () => {
    const prev = node('101', { surveyZ: 100.0 });
    const next = node('102', { surveyX: 178000 + LONG_EDGE_THRESHOLD_M + 50, surveyZ: 0 });
    const s = suggestChainConnection(next, prev, { edges: [] });
    expect(s.kind).toBe('ask');
    expect(s.reason).toBe('far');
    expect(s.hasZ).toBe(false);
    expect(s.preselect).toBe(false);
  });

  it('long jump with clear Z: ASK reason far, downhill direction preselected', () => {
    const prev = node('101', { surveyZ: 101.0 });
    const next = node('102', {
      surveyX: 178000 + LONG_EDGE_THRESHOLD_M + 50,
      surveyZ: 100.0,
    });
    const s = suggestChainConnection(next, prev, { edges: [] });
    expect(s.kind).toBe('ask');
    expect(s.reason).toBe('far');
    expect(s.hasZ).toBe(true);
    expect(s.tail).toBe('101');
    expect(s.preselect).toBe(true);
  });

  it('long jump AND flat: far wins as reason, still no preselect... direction stays chronological', () => {
    const prev = node('101', { surveyZ: 100.0 });
    const next = node('102', {
      surveyX: 178000 + LONG_EDGE_THRESHOLD_M + 50,
      surveyZ: 100.02,
    });
    const s = suggestChainConnection(next, prev, { edges: [] });
    expect(s.kind).toBe('ask');
    expect(s.reason).toBe('far');
    expect(s.preselect).toBe(false);
  });

  it('already connected, direction fine: silent exists (kills the edgeExists ping-pong)', () => {
    const prev = node('101', { surveyZ: 100.5 });
    const next = node('102', { surveyX: 178030, surveyZ: 100.0 });
    const s = suggestChainConnection(next, prev, { edges: [edge('101', '102')] });
    expect(s.kind).toBe('exists');
  });

  it('already connected but the edge runs uphill: flip-offer with the edge id', () => {
    const prev = node('101', { surveyZ: 100.0 });
    const next = node('102', { surveyX: 178030, surveyZ: 100.45 });
    // existing edge points 101→102, i.e. uphill along flow
    const s = suggestChainConnection(next, prev, { edges: [edge('101', '102')] });
    expect(s.kind).toBe('flip-offer');
    expect(s.edgeId).toBe('101-102');
    expect(s.tail).toBe('101');
    expect(s.head).toBe('102');
  });

  it('dangling edges do not count as a connection between the pair', () => {
    const prev = node('101', { surveyZ: 100.5 });
    const next = node('102', { surveyX: 178030, surveyZ: 100.0 });
    const dangling = { id: 'd1', tail: '101', head: null, isDangling: true };
    const s = suggestChainConnection(next, prev, { edges: [dangling] });
    expect(s.kind).toBe('auto');
  });

  it('new Home next to a Manhole: AUTO lateral locked Home→main, even uphill', () => {
    const prev = node('101', { surveyZ: 100.0 });
    const home = node('H-1', { nodeType: 'Home', surveyX: 178010, surveyZ: 100.8 });
    const s = suggestChainConnection(home, prev, { edges: [] });
    expect(s.kind).toBe('auto-home');
    expect(s.tail).toBe('H-1');
    expect(s.head).toBe('101');
  });

  it('previous node is a Home: lateral still points Home→new main', () => {
    const home = node('H-1', { nodeType: 'Home', surveyZ: 100.8 });
    const next = node('102', { surveyX: 178010, surveyZ: 100.0 });
    const s = suggestChainConnection(next, home, { edges: [] });
    expect(s.kind).toBe('auto-home');
    expect(s.tail).toBe('H-1');
    expect(s.head).toBe('102');
  });

  it('Home next to Drainage (cross-system): stays silent', () => {
    const prev = node('D-1', { nodeType: 'Drainage', surveyZ: 100.0 });
    const home = node('H-1', { nodeType: 'Home', surveyX: 178010, surveyZ: 100.8 });
    expect(suggestChainConnection(home, prev, { edges: [] }).kind).toBe('none');
  });

  it('Home pair already connected: dedup wins over the Home lock', () => {
    const prev = node('101', { surveyZ: 100.0 });
    const home = node('H-1', { nodeType: 'Home', surveyX: 178010, surveyZ: 100.8 });
    const s = suggestChainConnection(home, prev, { edges: [edge('H-1', '101')] });
    // Home edges are gradient-exempt → never negative → silent exists
    expect(s.kind).toBe('exists');
  });
});

describe('findEdgeBetween', () => {
  it('matches either orientation, skips dangling', () => {
    const edges = [
      { id: 'd', tail: 'a', head: null, isDangling: true },
      edge('b', 'a'),
    ];
    expect(findEdgeBetween(edges, 'a', 'b')?.id).toBe('b-a');
    expect(findEdgeBetween(edges, 'a', 'c')).toBeNull();
  });
});
