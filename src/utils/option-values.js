// Recovery for option values that were truncated by unescaped HTML attributes.
//
// Option labels are stored on nodes/edges as the label text itself. Until the
// details drawer escaped its markup, a label containing a double quote — e.g.
// `פי. וי. סי. לפי ת"י 884` — was emitted as
//   <option value="פי. וי. סי. לפי ת"י 884">
// so the browser parsed the value as everything before the quote. Picking that
// option stored the truncated text, which then matched no option on the next
// render and silently fell back to the first entry ("לא ידוע").
//
// Sketches captured before the escaping fix still hold those truncated values,
// so repair them on load. The match is deliberately narrow: a stored value is
// only upgraded when exactly one known label extends it with a double quote at
// precisely the cut point, which is the exact signature of the truncation.

import {
  EDGE_MATERIAL_OPTIONS,
  EDGE_TYPE_OPTIONS,
  NODE_MATERIAL_OPTIONS,
} from '../state/constants.js';

/**
 * Resolve a stored option value back to its full label when it looks truncated.
 * @param {unknown} stored - Value read from a saved sketch
 * @param {Array<string|{label?:string}>} options - Known options for the field
 * @returns {unknown} The full label when recoverable, otherwise `stored` unchanged
 */
export function restoreTruncatedOptionValue(stored, options) {
  if (typeof stored !== 'string' || stored === '') return stored;
  if (!Array.isArray(options)) return stored;
  const labels = options
    .map((o) => (o && typeof o === 'object' ? o.label : o))
    .filter((label) => typeof label === 'string');
  // An exact hit is already correct — never rewrite a value the user can pick.
  if (labels.includes(stored)) return stored;
  const prefix = stored + '"';
  const candidates = labels.filter((label) => label.startsWith(prefix));
  return candidates.length === 1 ? candidates[0] : stored;
}

/**
 * Pick the option list for a field, preferring the admin-configured list.
 * @param {object} adminConfig
 * @param {'nodes'|'edges'} scope
 * @param {string} key
 * @param {Array} fallback
 * @returns {Array}
 */
function optionsFor(adminConfig, scope, key, fallback) {
  const configured = adminConfig?.[scope]?.options?.[key];
  return Array.isArray(configured) && configured.length ? configured : fallback;
}

/**
 * Repair truncated option values across a loaded sketch, in place.
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {object} adminConfig
 */
export function repairTruncatedOptionValues(nodes, edges, adminConfig) {
  const nodeMaterials = optionsFor(adminConfig, 'nodes', 'material', NODE_MATERIAL_OPTIONS);
  const edgeMaterials = optionsFor(adminConfig, 'edges', 'material', EDGE_MATERIAL_OPTIONS);
  const edgeTypes = optionsFor(adminConfig, 'edges', 'edge_type', EDGE_TYPE_OPTIONS);
  if (Array.isArray(nodes)) {
    nodes.forEach((node) => {
      if (!node) return;
      node.material = restoreTruncatedOptionValue(node.material, nodeMaterials);
    });
  }
  if (Array.isArray(edges)) {
    edges.forEach((edge) => {
      if (!edge) return;
      edge.material = restoreTruncatedOptionValue(edge.material, edgeMaterials);
      edge.edge_type = restoreTruncatedOptionValue(edge.edge_type, edgeTypes);
    });
  }
}

/**
 * Repair option labels inside a saved admin config, in place.
 *
 * The settings screen rendered each label into `<input value="...">`, so saving
 * settings wrote the truncated label back into the config and corrupted the
 * option list itself. Only restore a label when the built-in option with the
 * same code extends it at a double quote, so deliberate renames are untouched.
 *
 * @param {object} adminConfig
 */
export function repairTruncatedAdminLabels(adminConfig) {
  const defaults = [
    ['nodes', 'material', NODE_MATERIAL_OPTIONS],
    ['edges', 'material', EDGE_MATERIAL_OPTIONS],
    ['edges', 'edge_type', EDGE_TYPE_OPTIONS],
  ];
  defaults.forEach(([scope, key, builtIn]) => {
    const options = adminConfig?.[scope]?.options?.[key];
    if (!Array.isArray(options)) return;
    options.forEach((option) => {
      if (!option || typeof option.label !== 'string') return;
      const original = builtIn.find((o) => String(o.code) === String(option.code));
      if (!original || typeof original.label !== 'string') return;
      if (original.label === option.label) return;
      if (original.label.startsWith(option.label + '"')) option.label = original.label;
    });
    const currentDefault = adminConfig?.[scope]?.defaults?.[key];
    if (typeof currentDefault === 'string') {
      adminConfig[scope].defaults[key] = restoreTruncatedOptionValue(currentDefault, options);
    }
  });
}
