/**
 * number-parser.js — spoken depth → decimal string
 *
 * Pure, DOM-free, import-free. Turns a speech transcript (from ANY recognizer —
 * the browser Web Speech API today, an on-device recognizer later) into the
 * measurement string the app stores in edge.tail_measurement / head_measurement.
 *
 * This is the one part of voice depth entry that must be provably correct, so it
 * is isolated here with an exhaustive unit-test file (tests/unit/number-parser.test.ts).
 *
 * Contract:
 *   parseSpokenDepth(transcript, lang) -> {
 *     value:      string | null   // best candidate, sanitized like typed input, or null
 *     candidates: string[]        // ranked, de-duplicated; value === candidates[0]
 *     unit:       'm' | 'cm' | null
 *     raw:        string          // the transcript as received
 *     ambiguous:  boolean         // true when >1 plausible candidate — caller must force a tap
 *   }
 *
 * Design notes:
 *  - Recognizers may return DIGITS ("1.5", "1.5 מטר") or WORDS ("one point five",
 *    "מטר וחצי"). Both are handled, per language.
 *  - Depths are 0–15 m (≈0–1500 cm), so the grammar only needs [hundreds][tens][units]
 *    plus a decimal marker and the "half"/"quarter" fractions surveyors actually say.
 *  - Centimetre utterances ("מאה חמישים" = 1.50 m) are NEVER silently divided; they
 *    surface a second candidate and the caller must confirm. See the cm heuristic.
 *  - Output is passed through the app's own sanitizer so it is byte-identical in shape
 *    to keyboard input (field-stepper.js:630).
 */

/** The plausible physical range for a pipe depth in metres (field-stepper.js:643). */
export const DEPTH_MIN_M = 0;
export const DEPTH_MAX_M = 15;

/** The exact sanitizer the typed-input handlers use — keep in lockstep. */
export function sanitizeDepth(s) {
  return String(s == null ? '' : s)
    .replace(/[^0-9.]/g, '')
    .replace(/\.(?=.*\.)/g, ''); // collapse to a single decimal point
}

/** Supported dictation locales, in fallback order per language family. */
export const VOICE_LANGS = {
  he: ['he-IL'],
  ar: ['ar-IL', 'ar-JO', 'ar'],
  en: ['en-US', 'en-GB', 'en'],
};

/** Normalize any locale-ish string ('he-IL', 'AR', 'en_US') to 'he' | 'ar' | 'en'. */
export function langFamily(lang) {
  const l = String(lang || '').toLowerCase();
  if (l.startsWith('he') || l.startsWith('iw')) return 'he';
  if (l.startsWith('ar')) return 'ar';
  return 'en';
}

// ── Step 1: Unicode normalization (all languages, unconditional) ──────────────
function normalize(input) {
  return String(input || '')
    .normalize('NFKC')
    // Eastern-Arabic (٠-٩) and Persian/Urdu (۰-۹) digits → ASCII
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫]/g, '.') // ٫ Arabic decimal separator
    .replace(/[٬،؛]/g, ' ') // ٬ ، ؛ → space
    .replace(/[׳״'"]/g, '') // Hebrew geresh/gershayim, quotes (ס"מ → סמ)
    .replace(/[,]/g, '.')
    .replace(/[‒-―−]/g, ' ') // dashes → space (never part of a number)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Step 2: unit lexicon ──────────────────────────────────────────────────────
const UNIT_WORDS = {
  he: { m: ['מטר', 'מטרים', 'מ'], cm: ['סמ', 'סנטימטר', 'סנטימטרים'] },
  ar: { m: ['متر', 'أمتار', 'امتار'], cm: ['سم', 'سنتيمتر', 'سنتيمترات'] },
  en: { m: ['meter', 'metre', 'meters', 'metres', 'm'], cm: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'] },
};

/** Strip unit words, returning { text, unit }. cm wins over m if both appear. */
function extractUnit(text, fam) {
  const lex = UNIT_WORDS[fam] || UNIT_WORDS.en;
  let unit = null;
  let out = ` ${text} `;
  // Longest-first so 'סנטימטר' is removed before 'מ', 'centimeter' before 'm'.
  const all = [
    ...lex.cm.map((w) => ({ w, u: 'cm' })),
    ...lex.m.map((w) => ({ w, u: 'm' })),
  ].sort((a, b) => b.w.length - a.w.length);
  for (const { w, u } of all) {
    const re = new RegExp(`(^|\\s)${escapeRe(w)}(?=\\s|$)`, 'g');
    if (re.test(out)) {
      if (u === 'cm') unit = 'cm';
      else if (unit !== 'cm') unit = 'm';
      out = out.replace(re, ' ');
    }
  }
  return { text: out.replace(/\s+/g, ' ').trim(), unit };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Is this token any unit word (m or cm) in the given family? */
function isUnitWord(tok, fam) {
  const lex = UNIT_WORDS[fam] || UNIT_WORDS.en;
  return lex.m.includes(tok) || lex.cm.includes(tok);
}

// ── Step 4 lexicons: additive value words, per language ───────────────────────
// Units 0–19, tens 20–90, hundreds. Hebrew carries both grammatical genders,
// which surveyors mix freely; Arabic carries MSA + Levantine colloquial forms.
const WORDS = {
  he: {
    units: {
      אפס: 0, אחד: 1, אחת: 1, שתיים: 2, שניים: 2, שני: 2, שתי: 2,
      שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
      שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9,
      עשר: 10, עשרה: 10,
    },
    tens: { עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90 },
    hundreds: { מאה: 100, מאתיים: 200 },
    point: ['נקודה', 'נקדה'],
    half: ['חצי', 'וחצי'],
    quarter: ['רבע', 'ורבע'],
    and: ['ו'],
  },
  ar: {
    units: {
      صفر: 0, واحد: 1, واحدة: 1, اثنين: 2, اثنان: 2, تنين: 2,
      ثلاثة: 3, تلاتة: 3, أربعة: 4, اربعة: 4, خمسة: 5, ستة: 6,
      سبعة: 7, ثمانية: 8, تمانية: 8, تسعة: 9, عشرة: 10,
    },
    tens: { عشرين: 20, ثلاثين: 30, تلاتين: 30, أربعين: 40, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, ثمانين: 80, تسعين: 90 },
    hundreds: { مئة: 100, مائة: 100, مية: 100 },
    point: ['فاصلة', 'نقطة', 'فاصله'],
    half: ['نص', 'نصف', 'ونص', 'ونصف'],
    quarter: ['ربع', 'وربع'],
    and: ['و'],
  },
  en: {
    units: {
      zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
      ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    },
    tens: { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 },
    hundreds: { hundred: 100 },
    point: ['point', 'dot'],
    half: ['half'],
    quarter: ['quarter'],
    and: ['and', 'a'],
  },
};

/**
 * Reduce a run of value words to a single integer using additive semantics with a
 * hundreds multiplier: "מאה חמישים" → 150, "one hundred" → 100, "twenty three" → 23.
 * Returns null when no value word is present.
 */
function wordsToInt(tokens, lex) {
  let total = 0;
  let cur = 0;
  let seen = false;
  for (const tokRaw of tokens) {
    const tok = tokRaw;
    if (lex.and.includes(tok)) continue;
    if (tok in lex.hundreds) {
      seen = true;
      cur = (cur === 0 ? 1 : cur) * lex.hundreds[tok];
      total += cur;
      cur = 0;
    } else if (tok in lex.tens) {
      seen = true;
      cur += lex.tens[tok];
    } else if (tok in lex.units) {
      seen = true;
      cur += lex.units[tok];
    } else if (/^\d+$/.test(tok)) {
      seen = true;
      cur += parseInt(tok, 10);
    } else {
      // unknown token — ignore, keep scanning
    }
  }
  total += cur;
  return seen ? total : null;
}

/** Split token list on the first decimal-marker word; returns [intToks, fracToks|null]. */
function splitOnPoint(tokens, lex) {
  const i = tokens.findIndex((t) => lex.point.includes(t));
  if (i === -1) return [tokens, null];
  return [tokens.slice(0, i), tokens.slice(i + 1)];
}

/**
 * Interpret the fraction half. Two conventions coexist:
 *  - place-value words: "נקודה חמישים" / "point fifty" → .50
 *  - digit sequence:    "point four five" / "ארבע חמש" → .45
 * We compute both and let the caller see them via candidates when they differ.
 */
function fractionCandidates(fracToks, lex) {
  if (!fracToks || fracToks.length === 0) return [];
  const out = new Set();

  // (a) digit-by-digit: every token is a single 0–9 unit word or ASCII digit
  const digits = fracToks.map((t) => tokenDigit(t, lex)).filter((d) => d !== null);
  if (digits.length === fracToks.length && digits.length > 0) {
    out.add(digits.join('').slice(0, 3));
  }

  // (b) place-value: the whole run reduces to an integer ("fifty" → 50 → .50)
  const asInt = wordsToInt(fracToks, lex);
  if (asInt !== null) out.add(String(asInt).slice(0, 3));

  return [...out];
}

/** A token that stands for exactly one digit 0–9 (unit word ≤9, or ASCII digit). */
function tokenDigit(tok, lex) {
  if (/^\d$/.test(tok)) return tok;
  if (tok in lex.units && lex.units[tok] <= 9) return String(lex.units[tok]);
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
/**
 * @param {string} transcript
 * @param {string} lang  'he' | 'ar' | 'en' or any locale ('he-IL', 'en-US', ...)
 */
export function parseSpokenDepth(transcript, lang) {
  const raw = String(transcript == null ? '' : transcript);
  const fam = langFamily(lang);
  const lex = WORDS[fam];
  const empty = { value: null, candidates: [], unit: null, raw, ambiguous: false };

  const norm = normalize(raw);
  if (!norm) return empty;

  // Positions in the ORIGINAL stream, before anything is stripped — word order
  // distinguishes "מטר וחצי"/"متر ونص" (1.5) from "חצי מטר"/"نص متر" (0.5).
  const rawTokens = norm.split(' ').filter(Boolean);
  const unitIdxRaw = rawTokens.findIndex((t) => isUnitWord(t, fam));
  const fracIdxRaw = rawTokens.findIndex((t) => lex.half.includes(t) || lex.quarter.includes(t));

  const { text, unit } = extractUnit(norm, fam);

  // half / quarter shorthands may attach to an integer: "מטר וחצי" (1.5), "וחצי" (.5)
  const tokensAll = text.split(' ').filter(Boolean);
  const isHalf = tokensAll.some((t) => lex.half.includes(t));
  const isQuarter = !isHalf && tokensAll.some((t) => lex.quarter.includes(t));
  const fracAdd = isHalf ? 0.5 : isQuarter ? 0.25 : 0;
  const tokens = tokensAll.filter((t) => !lex.half.includes(t) && !lex.quarter.includes(t));

  // ── Fast path: exactly one numeric token, no number words, no fraction words ──
  const numMatches = text.match(/\d+(?:\.\d+)?/g) || [];
  const hasWordNums = tokens.some(
    (t) => t in lex.units || t in lex.tens || t in lex.hundreds || lex.point.includes(t)
  );
  if (numMatches.length === 1 && !hasWordNums) {
    let v = parseFloat(numMatches[0]) + fracAdd;
    return finalize(v, numMatches[0].includes('.'), unit, raw);
  }

  // ── Word path: [integer] [point] [fraction] ───────────────────────────────────
  const [intToks, fracToks] = splitOnPoint(tokens, lex);
  const intVal = wordsToInt(intToks, lex);
  const hadExplicitPoint = fracToks !== null;
  const fracs = fractionCandidates(fracToks, lex);

  // A metre unit with no spoken count denotes 1 metre, but only when the fraction
  // (if any) FOLLOWS the unit — "מטר וחצי" = 1.5, whereas "חצי מטר" = 0.5.
  const metreImpliesOne =
    unit === 'm' &&
    intVal === null &&
    (fracIdxRaw === -1 || (unitIdxRaw !== -1 && fracIdxRaw > unitIdxRaw));

  if (intVal === null && fracs.length === 0 && fracAdd === 0 && !metreImpliesOne) {
    // nothing numeric at all
    return empty;
  }

  const baseInt = intVal === null ? (metreImpliesOne ? 1 : 0) : intVal;
  const candSet = [];

  if (fracs.length > 0) {
    for (const f of fracs) candSet.push({ v: parseFloat(`${baseInt}.${f}`) + fracAdd, dec: true });
  } else {
    candSet.push({ v: baseInt + fracAdd, dec: fracAdd !== 0 });
  }

  // ── Centimetre heuristic: an integer >15 with no explicit decimal is suspect ──
  // "מאה חמישים" → 150 → almost certainly 1.50 m. Offer BOTH, cm-interpretation
  // first, and mark ambiguous so the caller forces a confirming tap.
  const expanded = [];
  for (const c of candSet) {
    if (unit === 'cm') {
      const m = c.v / 100;
      expanded.push({ v: m, dec: !Number.isInteger(m), note: 'cm' });
    } else if (unit == null && !hadExplicitPoint && fracAdd === 0 && c.v > DEPTH_MAX_M && Number.isInteger(c.v)) {
      const m = c.v / 100;
      expanded.push({ v: m, dec: !Number.isInteger(m), note: 'cm?' }); // preferred: reads as cm
      expanded.push({ v: c.v, dec: false, note: 'raw' });
    } else {
      expanded.push(c);
    }
  }

  return finalizeMany(expanded, unit, raw);
}

/** Single-value finalize (fast path). */
function finalize(value, hadDecimal, unit, raw) {
  let v = value;
  if (unit === 'cm') v = v / 100;
  const s = normalizeValueString(v, hadDecimal || unit === 'cm');
  const clean = sanitizeDepth(s);
  return { value: clean || null, candidates: clean ? [clean] : [], unit, raw, ambiguous: false };
}

/** Multi-candidate finalize (word path): dedupe, rank plausible-first. */
function finalizeMany(cands, unit, raw) {
  const seen = new Set();
  const ranked = [];
  for (const c of cands) {
    const s = sanitizeDepth(normalizeValueString(c.v, c.dec));
    if (!s || seen.has(s)) continue;
    seen.add(s);
    const num = parseFloat(s);
    ranked.push({ s, inRange: num >= DEPTH_MIN_M && num <= DEPTH_MAX_M });
  }
  // In-range candidates first (stable within each group).
  ranked.sort((a, b) => Number(b.inRange) - Number(a.inRange));
  const candidates = ranked.map((r) => r.s);
  return {
    value: candidates[0] || null,
    candidates,
    unit,
    raw,
    ambiguous: candidates.length > 1,
  };
}

/**
 * Render a JS number as a measurement string. Preserves a trailing single decimal
 * digit's zero (1.5 stays "1.5"; 1.50 already collapsed by parseFloat is fine — the
 * app treats "1.5" and "1.50" as equal). Avoids float dust like 2.4499999.
 */
function normalizeValueString(v, hadDecimal) {
  if (!Number.isFinite(v)) return '';
  // round to 2 dp (depths are recorded to ~0.05) without trailing-zero noise
  const rounded = Math.round(v * 100) / 100;
  let s = String(rounded);
  if (hadDecimal && !s.includes('.')) s += '.0';
  return s;
}
