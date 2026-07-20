/**
 * Unit tests for the append-only per-node measurement history
 * (frontend/src/utils/measurement-history.js).
 *
 * Covers: entry normalization, append + double-fire dedupe, cap behavior
 * (original shot preserved), legacy backfill, sanitation, and the sync-conflict
 * history merge.
 */
import { describe, it, expect } from 'vitest';
import {
  MEASUREMENT_HISTORY_CAP,
  buildMeasurementEntry,
  appendMeasurement,
  backfillMeasurementFromNode,
  sanitizeMeasurements,
  mergeMeasurementHistories,
} from '../../src/utils/measurement-history.js';

const shot = (overrides: Record<string, unknown> = {}) => ({
  source: 'tsc3',
  easting: 219345.123456,
  northing: 631200.654321,
  elevation: 42.879,
  precision: 0.02,
  fixQuality: 4,
  measuredAt: 1750000000000,
  measuredBy: 'worker@geopoint.me',
  raw: 'MH-12,219345.123456,631200.654321,42.879',
  ...overrides,
});

describe('buildMeasurementEntry', () => {
  it('keeps full float precision on coordinates', () => {
    const e = buildMeasurementEntry(shot());
    expect(e!.easting).toBe(219345.123456);
    expect(e!.northing).toBe(631200.654321);
    expect(e!.elevation).toBe(42.879);
  });

  it('returns null without a usable position', () => {
    expect(buildMeasurementEntry(shot({ easting: null }))).toBeNull();
    expect(buildMeasurementEntry(shot({ northing: 'abc' }))).toBeNull();
    expect(buildMeasurementEntry(null)).toBeNull();
  });

  it('defaults source to unknown and nulls optional fields', () => {
    const e = buildMeasurementEntry({ easting: 200000, northing: 640000 });
    expect(e!.source).toBe('unknown');
    expect(e!.elevation).toBeNull();
    expect(e!.precision).toBeNull();
    expect(e!.measuredBy).toBeNull();
    expect(e!.raw).toBeNull();
  });

  it('truncates oversized raw lines', () => {
    const e = buildMeasurementEntry(shot({ raw: 'x'.repeat(500) }));
    expect(e!.raw!.length).toBe(200);
  });
});

describe('appendMeasurement', () => {
  it('appends entries in order', () => {
    const node: any = { id: '1' };
    appendMeasurement(node, shot({ measuredAt: 1 }));
    appendMeasurement(node, shot({ measuredAt: 2, easting: 219346 }));
    expect(node.measurements).toHaveLength(2);
    expect(node.measurements[0].measuredAt).toBe(1);
    expect(node.measurements[1].easting).toBe(219346);
  });

  it('skips an exact duplicate of the last entry (double-fire guard)', () => {
    const node: any = { id: '1' };
    appendMeasurement(node, shot());
    appendMeasurement(node, shot());
    expect(node.measurements).toHaveLength(1);
  });

  it('skips a duplicate anywhere in the history, not just the last slot', () => {
    const node: any = { id: '1' };
    appendMeasurement(node, shot({ measuredAt: 1 }));
    appendMeasurement(node, shot({ measuredAt: 2 }));
    appendMeasurement(node, shot({ measuredAt: 1 }));
    expect(node.measurements).toHaveLength(2);
  });

  it('appends a re-measure of the same coords at a different time', () => {
    const node: any = { id: '1' };
    appendMeasurement(node, shot({ measuredAt: 1 }));
    appendMeasurement(node, shot({ measuredAt: 2 }));
    expect(node.measurements).toHaveLength(2);
  });

  it('caps history keeping the first (original) entry and the recent tail', () => {
    const node: any = { id: '1' };
    for (let i = 0; i < MEASUREMENT_HISTORY_CAP + 10; i++) {
      appendMeasurement(node, shot({ measuredAt: i + 1 }));
    }
    expect(node.measurements).toHaveLength(MEASUREMENT_HISTORY_CAP);
    expect(node.measurements[0].measuredAt).toBe(1);
    expect(node.measurements[node.measurements.length - 1].measuredAt).toBe(MEASUREMENT_HISTORY_CAP + 10);
  });

  it('ignores unusable entries without touching the node', () => {
    const node: any = { id: '1' };
    expect(appendMeasurement(node, { source: 'tsc3' })).toBeNull();
    expect(node.measurements ?? []).toHaveLength(0);
  });
});

describe('backfillMeasurementFromNode', () => {
  it('reconstructs the pre-history shot from node fields', () => {
    const node: any = {
      id: '7',
      surveyX: 219000.5,
      surveyY: 630000.25,
      surveyZ: 12.5,
      measure_precision: 0.02,
      gnssFixQuality: 4,
      measuredAt: 123,
      measuredBy: 'legacy-user',
      measure_source: 'tsc3',
    };
    backfillMeasurementFromNode(node);
    expect(node.measurements).toHaveLength(1);
    expect(node.measurements[0]).toMatchObject({
      source: 'tsc3',
      easting: 219000.5,
      northing: 630000.25,
      elevation: 12.5,
      note: 'backfilled-from-node',
    });
  });

  it('treats surveyZ=0 as not-measured (elevation null)', () => {
    const node: any = { id: '7', surveyX: 219000, surveyY: 630000, surveyZ: 0 };
    backfillMeasurementFromNode(node);
    expect(node.measurements[0].elevation).toBeNull();
    expect(node.measurements[0].source).toBe('legacy');
  });

  it('is a no-op when a history already exists or coords are missing', () => {
    const withHistory: any = { id: '1', surveyX: 219000, surveyY: 630000, measurements: [buildMeasurementEntry(shot())] };
    backfillMeasurementFromNode(withHistory);
    expect(withHistory.measurements).toHaveLength(1);

    const noCoords: any = { id: '2' };
    backfillMeasurementFromNode(noCoords);
    expect(noCoords.measurements).toBeUndefined();
  });
});

describe('sanitizeMeasurements', () => {
  it('drops non-array values', () => {
    const node: any = { id: '1', measurements: 'garbage' };
    sanitizeMeasurements(node);
    expect(node.measurements).toBeUndefined();
  });

  it('filters malformed entries and removes empty arrays', () => {
    const good = buildMeasurementEntry(shot());
    const node: any = { id: '1', measurements: [good, null, { source: 'x' }, 42] };
    sanitizeMeasurements(node);
    expect(node.measurements).toEqual([good]);

    const allBad: any = { id: '2', measurements: [null] };
    sanitizeMeasurements(allBad);
    expect(allBad.measurements).toBeUndefined();
  });
});

describe('mergeMeasurementHistories', () => {
  it('unions local entries into server nodes without duplicates, sorted by time', () => {
    const a = buildMeasurementEntry(shot({ measuredAt: 1 }));
    const b = buildMeasurementEntry(shot({ measuredAt: 2, easting: 219400 }));
    const c = buildMeasurementEntry(shot({ measuredAt: 3, easting: 219500 }));

    const localNodes = [{ id: '1', measurements: [a, b] }];
    const serverNodes = [{ id: '1', surveyX: 219500, measurements: [b, c] }];

    const merged = mergeMeasurementHistories(localNodes, serverNodes);
    expect(merged).toHaveLength(1);
    expect(merged[0].surveyX).toBe(219500);
    expect(merged[0].measurements.map((m: any) => m.measuredAt)).toEqual([1, 2, 3]);
  });

  it('leaves server nodes untouched when the local side has no history', () => {
    const serverNode = { id: '1', surveyX: 5 };
    const merged = mergeMeasurementHistories([{ id: '1' }], [serverNode]);
    expect(merged[0]).toBe(serverNode);
  });

  it('keeps server-only nodes and ignores local-only nodes (server wins structure)', () => {
    const merged = mergeMeasurementHistories(
      [{ id: 'local-only', measurements: [buildMeasurementEntry(shot())] }],
      [{ id: 'server-only' }],
    );
    expect(merged.map((n: any) => n.id)).toEqual(['server-only']);
  });

  it('does not graft history onto a server node re-created under the same id', () => {
    const merged = mergeMeasurementHistories(
      [{ id: '5', createdAt: '2026-01-01T00:00:00Z', measurements: [buildMeasurementEntry(shot())] }],
      [{ id: '5', createdAt: '2026-07-01T00:00:00Z' }],
    );
    expect(merged[0].measurements).toBeUndefined();
  });

  it('still merges when createdAt matches or is absent on either side', () => {
    const entry = buildMeasurementEntry(shot());
    const sameCreated = mergeMeasurementHistories(
      [{ id: '5', createdAt: 'x', measurements: [entry] }],
      [{ id: '5', createdAt: 'x' }],
    );
    expect(sameCreated[0].measurements).toHaveLength(1);

    const noCreated = mergeMeasurementHistories(
      [{ id: '5', measurements: [entry] }],
      [{ id: '5' }],
    );
    expect(noCreated[0].measurements).toHaveLength(1);
  });
});
