/**
 * measurement-history.js
 *
 * Append-only per-node field measurement history.
 *
 * Every field measurement (TSC3 shot, GNSS capture, coordinate import) appends
 * an entry to `node.measurements` instead of only overwriting the "active"
 * surveyX/surveyY/surveyZ fields. Node objects are persisted verbatim into the
 * sketches.nodes JSONB column (there is no node-level field whitelist client or
 * server side), so the history reaches the database with no schema change.
 *
 * The active measurement remains surveyX/surveyY/surveyZ + measure_precision /
 * gnssFixQuality / measuredAt / measuredBy — nothing downstream changes.
 *
 * Entry shape (numbers kept at full float precision, never rounded):
 *   {
 *     source:      'tsc3' | 'gnss' | 'import' | 'legacy' | 'unknown',
 *     easting:     ITM easting (m),
 *     northing:    ITM northing (m),
 *     elevation:   ITM elevation (m) or null when not measured (0 is the
 *                  app-wide "not measured" sentinel on surveyZ; history stores
 *                  null instead so a genuine 0.000 m elevation stays distinct),
 *     precision:   horizontal precision (m) or null,
 *     precisionV:  vertical precision (m) or null,
 *     fixQuality:  GNSS fix quality or null,
 *     hdop:        HDOP or null,
 *     satellites:  satellite count or null,
 *     measuredAt:  epoch ms or null,
 *     measuredBy:  username/email or null,
 *     raw:         raw device line (TSC3) or null,
 *     note:        provenance note (e.g. 'fix-quality-migration') or null,
 *   }
 */

export const MEASUREMENT_HISTORY_CAP = 20;

const RAW_LINE_MAX_LENGTH = 200;

function finiteOrNull(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Normalize arbitrary input into a well-formed history entry.
 * Returns null when the entry has no usable position.
 */
export function buildMeasurementEntry(data) {
  if (!data || typeof data !== 'object') return null;
  const easting = finiteOrNull(data.easting);
  const northing = finiteOrNull(data.northing);
  if (easting == null || northing == null) return null;

  const entry = {
    source: typeof data.source === 'string' && data.source ? data.source : 'unknown',
    easting,
    northing,
    elevation: finiteOrNull(data.elevation),
    precision: finiteOrNull(data.precision),
    precisionV: finiteOrNull(data.precisionV),
    fixQuality: finiteOrNull(data.fixQuality),
    hdop: finiteOrNull(data.hdop),
    satellites: finiteOrNull(data.satellites),
    measuredAt: finiteOrNull(data.measuredAt),
    measuredBy: typeof data.measuredBy === 'string' && data.measuredBy ? data.measuredBy : null,
    raw: typeof data.raw === 'string' && data.raw ? data.raw.slice(0, RAW_LINE_MAX_LENGTH) : null,
    note: typeof data.note === 'string' && data.note ? data.note : null,
  };
  return entry;
}

function entryKey(e) {
  return `${e.source}|${e.measuredAt}|${e.easting}|${e.northing}|${e.elevation}`;
}

/**
 * Append a measurement entry to node.measurements.
 * Skips exact duplicates of ANY existing entry (double-fire guard, and repeated
 * migration/backfill runs after a history merge reordered entries).
 * When the history exceeds `cap`, the FIRST entry (original shot) is kept and
 * the middle is trimmed, so both the original and the recent tail survive.
 * @returns the appended (or matching existing) entry, or null if unusable.
 */
export function appendMeasurement(node, data, { cap = MEASUREMENT_HISTORY_CAP } = {}) {
  if (!node) return null;
  const entry = buildMeasurementEntry(data);
  if (!entry) return null;

  if (!Array.isArray(node.measurements)) node.measurements = [];
  const key = entryKey(entry);
  const existing = node.measurements.find((e) => e && entryKey(e) === key);
  if (existing) return existing;

  node.measurements.push(entry);
  if (node.measurements.length > cap) {
    node.measurements = [
      node.measurements[0],
      ...node.measurements.slice(node.measurements.length - (cap - 1)),
    ];
  }
  return entry;
}

/**
 * Reconstruct the pre-history active measurement as the first history entry.
 * Call BEFORE overwriting surveyX/Y/Z on a node that predates the history
 * feature, so its original shot is not erased by the first re-measure.
 * No-op when a history already exists or the node has no survey coordinates.
 */
export function backfillMeasurementFromNode(node) {
  if (!node) return null;
  if (Array.isArray(node.measurements) && node.measurements.length > 0) return null;
  if (node.surveyX == null || node.surveyY == null) return null;
  return appendMeasurement(node, {
    source: node.measure_source || 'legacy',
    easting: node.surveyX,
    northing: node.surveyY,
    // surveyZ === 0 is the app-wide "not measured" sentinel
    elevation: Number(node.surveyZ) ? node.surveyZ : null,
    precision: node.measure_precision,
    fixQuality: node.gnssFixQuality,
    hdop: node.gnssHdop,
    measuredAt: node.measuredAt,
    measuredBy: node.measuredBy,
    note: 'backfilled-from-node',
  });
}

/**
 * Drop a malformed measurements value (anything but an array of objects).
 */
export function sanitizeMeasurements(node) {
  if (!node || node.measurements == null) return;
  if (!Array.isArray(node.measurements)) {
    delete node.measurements;
    return;
  }
  node.measurements = node.measurements.filter(
    (e) => e && typeof e === 'object' && finiteOrNull(e.easting) != null && finiteOrNull(e.northing) != null,
  );
  if (node.measurements.length === 0) delete node.measurements;
}

/**
 * Union local measurement histories into server nodes after a sync conflict
 * where the server version wins. Everything else stays the server's; only the
 * append-only measurements arrays are merged (by entry identity), so field
 * shots recorded locally are never lost to a conflict resolution.
 * @returns a new nodes array based on serverNodes.
 */
export function mergeMeasurementHistories(localNodes, serverNodes, { cap = MEASUREMENT_HISTORY_CAP } = {}) {
  const localById = new Map();
  (Array.isArray(localNodes) ? localNodes : []).forEach((n) => {
    if (n && n.id != null) localById.set(String(n.id), n);
  });

  return (Array.isArray(serverNodes) ? serverNodes : []).map((serverNode) => {
    if (!serverNode || serverNode.id == null) return serverNode;
    const localNode = localById.get(String(serverNode.id));
    const localMs = Array.isArray(localNode?.measurements) ? localNode.measurements : [];
    if (localMs.length === 0) return serverNode;
    // Identity guard: a node deleted and re-created under the same id gets a
    // fresh createdAt — grafting the old node's history onto it would be wrong.
    if (localNode.createdAt && serverNode.createdAt && localNode.createdAt !== serverNode.createdAt) {
      return serverNode;
    }

    const serverMs = Array.isArray(serverNode.measurements) ? serverNode.measurements : [];
    const seen = new Set();
    const merged = [];
    [...serverMs, ...localMs].forEach((raw) => {
      const e = buildMeasurementEntry(raw);
      if (!e) return;
      const key = entryKey(e);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(e);
    });
    merged.sort((a, b) => (a.measuredAt ?? 0) - (b.measuredAt ?? 0));
    const capped = merged.length > cap
      ? [merged[0], ...merged.slice(merged.length - (cap - 1))]
      : merged;
    return { ...serverNode, measurements: capped };
  });
}
