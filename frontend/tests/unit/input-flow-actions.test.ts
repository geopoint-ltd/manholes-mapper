/**
 * Unit tests for applyActions edge-field key alignment
 * (frontend/src/utils/input-flow-engine.js).
 *
 * Regression guard: rule-driven nullify/fill previously wrote camelCase keys
 * (fallDepth, tailMeasurement, headMeasurement, edgeType, notes) that no edge
 * or node code reads — edges store snake_case (fall_depth, tail_measurement,
 * head_measurement, edge_type) and nodes store `note`.
 */
import { describe, it, expect } from 'vitest';
import { applyActions } from '../../src/utils/input-flow-engine.js';

describe('applyActions edge fields', () => {
  it('nullifies fall_depth on the snake_case key edges actually use', () => {
    const edge = { id: 'e1', fall_depth: 2.5 };
    const out = applyActions(edge, { nullified: ['fall_depth'], fillValues: null });
    expect(out.fall_depth).toBe('');
    expect((out as any).fallDepth).toBeUndefined();
  });

  it('fills edge measurement fields on snake_case keys', () => {
    const edge = { id: 'e1', tail_measurement: '', head_measurement: '', edge_type: 'old' };
    const out = applyActions(edge, {
      nullified: [],
      fillValues: [
        ['tail_measurement', '1.20'],
        ['head_measurement', '1.55'],
        ['edge_type', 'main'],
        ['fall_depth', '0.4'],
      ],
    });
    expect(out.tail_measurement).toBe('1.20');
    expect(out.head_measurement).toBe('1.55');
    expect(out.edge_type).toBe('main');
    expect(out.fall_depth).toBe('0.4');
    expect((out as any).tailMeasurement).toBeUndefined();
    expect((out as any).headMeasurement).toBeUndefined();
  });

  it('writes notes actions to the node field `note`', () => {
    const node = { id: '1', note: 'keep' };
    const nulled = applyActions(node, { nullified: ['notes'], fillValues: null });
    expect(nulled.note).toBe('');
    const filled = applyActions(node, { nullified: [], fillValues: [['notes', 'hello']] });
    expect(filled.note).toBe('hello');
  });
});
