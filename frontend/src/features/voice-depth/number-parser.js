/**
 * number-parser.js — spoken depth → decimal string
 *
 * Pure, DOM-free, import-free. Turns a speech transcript (from ANY recognizer —
 * the browser Web Speech API today, an on-device recognizer later) into the
 * measurement string the app stores in edge.tail_measurement / head_measurement.
 *
 * This is the one part of voice depth entry that must be provably correct, so it
 * is isolated here with an exhaustive unit-test file (tests/unit/number-parser.test.ts)
 * and was hardened against a 90-case adversarial sweep (2026-07-23).
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
 *  - Recognizers may return DIGITS ("1.5"), WORDS ("one point five"), or any mix
 *    ("1 נקודה 45"). All are handled, per language.
 *  - The spoken decimal word is often normalized by the recognizer into a literal
 *    "." — sometimes glued to a word («אחד. ארבע חמש», field bug 2026-07-23).
 *  - Consecutive single-digit words CONCATENATE («ארבע חמש» = 45, never 4+5=9);
 *    tens/hundreds/teens stay additive («עשרים ושלוש» = 23, «אחת עשרה» = 11).
 *  - A unit-first idiom states cm after the metre word: «מטר ארבעים» = 1.40,
 *    "one meter forty five" = 1.45. Without the unit, digit-then-tens order means
 *    the same thing («אחד ארבעים» = 1.40) — Hebrew/English cardinals put tens
 *    first («ארבעים ואחד» = 41), so units-then-tens is never a cardinal. Arabic
 *    cardinals are units-first WITH the و clitic («واحد وأربعين» = 41), so the
 *    juxtaposition rule only fires when the tens word carries no clitic.
 *  - Centimetre utterances («מאה חמישים» = 1.50 m) are NEVER silently divided;
 *    they surface a second candidate and the caller must confirm.
 *  - Sign words (minus/מינוס/ناقص) poison the parse — a negated or garbled phrase
 *    must not fabricate a plausible depth. Likewise a bare unit («מטר» alone) and
 *    clitic-only fragments («וחצי» alone) return null: silent data corruption is
 *    worse than a re-prompt.
 *  - Output goes through the app's own sanitizer so it is byte-identical in shape
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
/**
 * Arabic orthography varies wildly in ASR output: hamza-carrier alefs (أ إ آ),
 * ta-marbuta vs ha (خمسة/خمسه), harakat diacritics, tatweel stretching. Collapse
 * all of it so one lexicon entry matches every spelling. Applied to lexicon keys
 * at build time too, so both sides meet in the same normal form.
 */
function normalizeArabic(s) {
  return s
    .replace(/[ً-ْٰ]/g, '') // harakat + dagger alef
    .replace(/ـ/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function normalize(input) {
  return (
    String(input || '')
      .normalize('NFKC')
      // Eastern-Arabic (٠-٩) and Persian/Urdu (۰-۹) digits → ASCII
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[٫]/g, '.') // ٫ Arabic decimal separator
      .replace(/[٬،؛]/g, ' ') // ٬ ، ؛ → space
      .replace(/[׳״'"]/g, '') // Hebrew geresh/gershayim, quotes (so the cm/m abbreviations match)
      .replace(/[,]/g, '.')
      .replace(/[‒-―−]/g, ' ') // dashes → space (never part of a number)
      // Recognizers glue digits onto words when speech is fast — split every
      // letter↔digit boundary so the pieces tokenize separately.
      .replace(/(\d)(?=\p{L})/gu, '$1 ')
      .replace(/(\p{L})(?=\d)/gu, '$1 ')
      // The SPOKEN decimal word often arrives as a literal "." glued to a word
      // (field bug 2026-07-23). Keep dots between two digits (2.45); split every
      // other dot into its own token so the word path reads it as the decimal
      // marker. Re-padding an already-padded dot is harmless — whitespace
      // collapses below.
      .replace(/(?<!\d)\./g, ' . ')
      .replace(/\.(?!\d)/g, ' . ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// ── Step 2: unit lexicon ──────────────────────────────────────────────────────
const UNIT_WORDS = {
  he: { m: ['מטר', 'מטרים', 'מ'], cm: ['סמ', 'סנטימטר', 'סנטימטרים'] },
  ar: { m: ['متر', 'أمتار', 'امتار'].map(normalizeArabic), cm: ['سم', 'سنتيمتر', 'سنتيمترات'].map(normalizeArabic) },
  en: { m: ['meter', 'metre', 'meters', 'metres', 'm'], cm: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'] },
};

/** Words that poison the whole parse — a negated phrase must never yield a depth. */
const SIGN_WORDS = new Set(['minus', 'negative', 'מינוס', normalizeArabic('ناقص'), normalizeArabic('سالب')]);

/** Is this token any unit word in the given family? Returns 'm' | 'cm' | null. */
function unitKind(tok, fam) {
  const lex = UNIT_WORDS[fam] || UNIT_WORDS.en;
  if (lex.cm.includes(tok)) return 'cm';
  if (lex.m.includes(tok)) return 'm';
  return null;
}

// ── Value-word lexicons ───────────────────────────────────────────────────────
// Units 0–19, tens 20–90, hundreds. Hebrew carries both grammatical genders,
// which surveyors mix freely; Arabic carries MSA + Levantine/urban colloquial
// forms (keys normalized like the input).
const WORDS = {
  he: {
    units: {
      אפס: 0, אחד: 1, אחת: 1, שתיים: 2, שניים: 2, שני: 2, שתי: 2,
      שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
      שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9,
      עשר: 10, עשרה: 10,
    },
    tens: { עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90 },
    hundreds: { מאה: 100, מאתיים: 200, מאות: 100 },
    point: ['נקודה', 'נקדה'],
    half: ['חצי', 'וחצי'],
    quarter: ['רבע', 'ורבע'],
    and: ['ו'],
    clitic: 'ו',
  },
  ar: {
    units: {
      صفر: 0, واحد: 1, واحدة: 1, اثنين: 2, اثنان: 2, تنين: 2, اتنين: 2,
      ثلاثة: 3, تلاتة: 3, أربعة: 4, اربعة: 4, خمسة: 5, ستة: 6,
      سبعة: 7, ثمانية: 8, تمانية: 8, تسعة: 9, عشرة: 10, عشر: 10,
    },
    tens: { عشرين: 20, ثلاثين: 30, تلاتين: 30, أربعين: 40, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, ثمانين: 80, تسعين: 90 },
    hundreds: { مئة: 100, مائة: 100, مية: 100 },
    point: ['فاصلة', 'نقطة', 'فاصله', 'نقطه'],
    half: ['نص', 'نصف', 'ونص', 'ونصف'],
    quarter: ['ربع', 'وربع'],
    and: ['و'],
    clitic: 'و',
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
    clitic: null,
  },
};

// Normalize the Arabic lexicon keys once so lookups meet the normalized input.
for (const table of ['units', 'tens', 'hundreds']) {
  const src = WORDS.ar[table];
  const out = {};
  for (const [k, v] of Object.entries(src)) out[normalizeArabic(k)] = v;
  WORDS.ar[table] = out;
}
WORDS.ar.point = WORDS.ar.point.map(normalizeArabic);
WORDS.ar.half = WORDS.ar.half.map(normalizeArabic);
WORDS.ar.quarter = WORDS.ar.quarter.map(normalizeArabic);

/**
 * Look up one token's numeric meaning. Handles the attached Hebrew ו / Arabic و
 * "and" clitic («וחמש», «وخمسة») by retrying without it — the recognizer glues it
 * to the word, it never arrives as a separate token. The clitic is reported so
 * grammar rules can distinguish «ארבעים וחמש» (45) from bare juxtaposition.
 */
function lookupToken(tok, lex) {
  const tryOne = (t) => {
    if (t in lex.hundreds) return { kind: 'hundreds', v: lex.hundreds[t] };
    if (t in lex.tens) return { kind: 'tens', v: lex.tens[t] };
    if (t in lex.units) return { kind: 'units', v: lex.units[t] };
    if (/^\d+$/.test(t)) return { kind: 'digits', v: parseInt(t, 10), len: t.length, literal: t };
    return null;
  };
  let hit = tryOne(tok);
  if (!hit && tok.length > 1 && (tok.startsWith('ו') || tok.startsWith('و'))) {
    const h = tryOne(tok.slice(1));
    if (h) hit = { ...h, clitic: true };
  }
  return hit;
}

/** Resolve every value token in a list to its hit; non-numeric tokens are dropped. */
function hitsOf(tokens, lex) {
  const hits = [];
  for (const tok of tokens) {
    if (tok === '.' || lex.and.includes(tok)) continue;
    const h = lookupToken(tok, lex);
    if (h) hits.push(h);
  }
  return hits;
}

/** Is this a single spoken digit 0–9 (unit word, or one-character digit token)? */
function isSingleDigit(h) {
  return (h.kind === 'units' || h.kind === 'digits') && h.v <= 9 && (h.len == null || h.len === 1);
}

/**
 * Reduce hits to a single integer.
 *  - DIGIT SEQUENCE: two or more hits that are ALL single digits concatenate —
 *    «ארבע חמש» / "four five" is 45, never 4+5=9 (field bug 2026-07-23).
 *  - ADDITIVE: anything with tens/hundreds/teens — «מאה חמישים» → 150,
 *    "twenty three" → 23, «אחת עשרה» → 11, «תשע מאות תשעים ותשע» → 999.
 * Returns null when no hit is present.
 */
function hitsToInt(hits) {
  if (hits.length === 0) return null;
  if (hits.length >= 2 && hits.every(isSingleDigit)) {
    return parseInt(hits.map((h) => String(h.v)).join(''), 10);
  }
  let total = 0;
  let cur = 0;
  for (const h of hits) {
    if (h.kind === 'hundreds') {
      cur = (cur === 0 ? 1 : cur) * h.v;
      total += cur;
      cur = 0;
    } else {
      cur += h.v;
    }
  }
  return total + cur;
}

/** Is this token a decimal marker — the spoken word, or the literal "." recognizers emit for it? */
function isPointToken(t, lex) {
  return t === '.' || lex.point.includes(t);
}

/**
 * Fraction candidates for the tokens after the decimal marker. Digit tokens keep
 * their LITERAL string («נקודה 05» → .05, never .5); when word tokens are
 * involved, both the digit-by-digit and place-value readings are offered
 * («נקודה חמישים» → .50).
 */
function fractionCandidates(fracToks, lex) {
  if (!fracToks || fracToks.length === 0) return [];
  const meaningful = fracToks.filter((t) => t !== '.' && !lex.and.includes(t));
  if (meaningful.length === 0) return [];
  const out = new Set();

  const allDigitTokens = meaningful.every((t) => /^\d+$/.test(t));
  if (allDigitTokens) {
    // The recognizer already committed to digits — keep them verbatim.
    out.add(meaningful.join('').slice(0, 3));
    return [...out];
  }

  // (a) digit-by-digit: every token maps to exactly one digit
  const digits = meaningful.map((t) => {
    if (/^\d$/.test(t)) return t;
    const h = lookupToken(t, lex);
    return h && isSingleDigit(h) ? String(h.v) : null;
  });
  if (digits.every((d) => d !== null) && digits.length > 0) {
    out.add(digits.join('').slice(0, 3));
  }

  // (b) place-value: the whole run reduces to an integer ("fifty" → 50 → .50)
  const asInt = hitsToInt(hitsOf(meaningful, lex));
  if (asInt !== null) out.add(String(asInt).slice(0, 3));

  return [...out];
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

  let norm = normalize(raw);
  if (fam === 'ar') norm = normalizeArabic(norm);
  if (!norm) return empty;

  // Dual counted-noun: «مترين» is "two metres" with no numeral word at all —
  // the most natural way a Levantine speaker says 2 m.
  if (fam === 'ar') norm = norm.replace(/(^|\s)مترين(?=\s|$)/g, '$1 2 متر ').replace(/\s+/g, ' ').trim();

  const rawTokens = norm.split(' ').filter(Boolean);

  // A negated or garbled phrase must never fabricate a depth.
  if (rawTokens.some((t) => SIGN_WORDS.has(t))) return empty;

  // Strip trailing auto-punctuation («אחד נקודה ארבע חמש.») — a final dot with
  // nothing after it is sentence punctuation, not a second decimal marker.
  while (rawTokens.length > 1 && rawTokens[rawTokens.length - 1] === '.') rawTokens.pop();

  // Locate the unit (position matters) and classify.
  let unit = null;
  let mUnitIdx = -1;
  rawTokens.forEach((t, i) => {
    const k = unitKind(t, fam);
    if (k === 'cm') unit = 'cm';
    else if (k === 'm') {
      if (unit !== 'cm') unit = 'm';
      if (mUnitIdx === -1) mUnitIdx = i;
    }
  });

  // Fraction shorthands. Word order matters: «מטר וחצי» = 1.5 but «חצי מטר» = 0.5.
  const fracIdx = rawTokens.findIndex((t) => lex.half.includes(t) || lex.quarter.includes(t));
  const fracTok = fracIdx === -1 ? null : rawTokens[fracIdx];
  const isHalf = fracTok !== null && lex.half.includes(fracTok);
  const fracAdd = fracTok === null ? 0 : isHalf ? 0.5 : 0.25;
  const fracIsCliticOnly =
    fracTok !== null && lex.clitic !== null && fracTok.startsWith(lex.clitic);

  // Value tokens: everything that is not a unit or a fraction shorthand.
  const tokens = rawTokens.filter(
    (t) => unitKind(t, fam) === null && !lex.half.includes(t) && !lex.quarter.includes(t)
  );

  // ── Fast path: exactly one numeric token, no number words, no decimal marker ──
  // A metre unit only blocks this path when numeric tokens FOLLOW it — "1.5 m"
  // is fast-path, "1 m 45" belongs to the unit-position grammar below.
  const isValueTok = (t) => unitKind(t, fam) === null && !lex.half.includes(t) && !lex.quarter.includes(t);
  const numsAfterUnit =
    mUnitIdx !== -1 && hitsOf(rawTokens.slice(mUnitIdx + 1).filter(isValueTok), lex).length > 0;
  const numMatches = norm.match(/\d+(?:\.\d+)?/g) || [];
  const hasWordNums = tokens.some(
    (t) => isPointToken(t, lex) || lookupToken(t, lex) !== null
  );
  if (numMatches.length === 1 && !hasWordNums && !numsAfterUnit) {
    const hadDot = numMatches[0].includes('.');
    const v = parseFloat(numMatches[0]) + fracAdd;
    const expanded = expandCm([{ v, dec: hadDot || fracAdd !== 0 }], unit, hadDot, fracAdd);
    return finalizeMany(expanded, unit, raw);
  }

  // ── Unit-position grammar: [int?] METRE [cm-number] ─────────────────────────
  // «מטר ארבעים» = 1.40, "one meter forty five" = 1.45, "1 m 45" = 1.45.
  // The metre word splits whole metres from the centimetre remainder.
  if (mUnitIdx !== -1 && unit === 'm') {
    const isValueTok = (t) => unitKind(t, fam) === null && !lex.half.includes(t) && !lex.quarter.includes(t);
    const beforeToks = rawTokens.slice(0, mUnitIdx).filter(isValueTok);
    const afterToks = rawTokens.slice(mUnitIdx + 1).filter(isValueTok);
    const afterHits = hitsOf(afterToks, lex);
    const hasPoint = tokens.some((t) => isPointToken(t, lex));
    if (afterHits.length > 0 && !hasPoint) {
      const cmVal = hitsToInt(afterHits);
      if (cmVal !== null && cmVal >= 1 && cmVal <= 99) {
        const beforeVal = hitsToInt(hitsOf(beforeToks, lex));
        const metres = beforeVal === null ? 1 : beforeVal;
        const v = metres + cmVal / 100 + fracAdd;
        return finalizeMany([{ v, dec: true }], unit, raw);
      }
    }
  }

  // ── Word path: [integer] [point] [fraction] ─────────────────────────────────
  // A decimal-digit token surviving to here means the recognizer closed a number
  // early and more followed ("1.4 5" → 1.45). Split it into digit / marker /
  // digit tokens so the trailing piece concatenates onto the fraction. Also
  // resolves redundant-point spelling "1.4.5" → first dot is THE point → 1.45.
  const wordToks = tokens.flatMap((t) =>
    /^[\d.]+$/.test(t) && t.includes('.') ? t.split(/(\.)/).filter(Boolean) : [t]
  );
  const pointIdx = wordToks.findIndex((t) => isPointToken(t, lex));
  const intToks = pointIdx === -1 ? wordToks : wordToks.slice(0, pointIdx);
  const fracToks = pointIdx === -1 ? null : wordToks.slice(pointIdx + 1);
  const hadExplicitPoint = fracToks !== null;

  const intHits = hitsOf(intToks, lex);
  const intVal = hitsToInt(intHits);
  const fracs = fractionCandidates(fracToks, lex);

  // Implicit 1 metre («מטר וחצי») — ONLY when a fraction actually follows the
  // unit. A bare «מטר» is a truncated utterance: inventing 1.00 m would write a
  // plausible wrong depth into a survey record. Null → re-prompt.
  const fracAfterUnit = fracIdx !== -1 && mUnitIdx !== -1 && fracIdx > mUnitIdx;
  const metreImpliesOne = unit === 'm' && intVal === null && fracAfterUnit && fracAdd > 0;

  if (intVal === null && fracs.length === 0 && !metreImpliesOne) {
    if (fracAdd > 0) {
      // A clitic-only fragment («וחצי» alone) continues a head that never
      // arrived. Guessing its base fabricates data — null → re-prompt.
      if (fracIsCliticOnly && unit === null) return empty;
      // Bare «חצי» / "half" / «חצי מטר» — half a metre.
      return finalizeMany([{ v: fracAdd, dec: true }], unit, raw);
    }
    return empty;
  }

  const baseInt = intVal === null ? (metreImpliesOne ? 1 : 0) : intVal;
  const candSet = [];

  // Digit-then-tens juxtaposition: «אחד ארבעים» / "one forty (five)" = 1.40 /
  // 1.45. Units-then-tens is never a cardinal in Hebrew/English (those put tens
  // first), and Arabic cardinals carry the و clitic — so a clitic-free tens word
  // after a single digit means "metres . centimetres". Preferred reading; the
  // concat/additive readings stay as tap-away alternatives.
  let juxtaFired = false;
  if (!hadExplicitPoint && fracAdd === 0 && unit === null) {
    const h = intHits;
    const juxta =
      (h.length === 2 && isSingleDigit(h[0]) && h[1].kind === 'tens' && !h[1].clitic) ||
      (h.length === 3 && isSingleDigit(h[0]) && h[1].kind === 'tens' && !h[1].clitic && isSingleDigit(h[2]));
    if (juxta) {
      juxtaFired = true;
      const cm = h[1].v + (h.length === 3 ? h[2].v : 0);
      candSet.push({ v: h[0].v + cm / 100, dec: true }); // 1.45 — the intended reading
      candSet.push({ v: h[0].v * 100 + cm, dec: false }); // 145 — the literal alternative
    }
  }

  if (fracs.length > 0) {
    for (const f of fracs) candSet.push({ v: parseFloat(`${baseInt}.${f}`) + fracAdd, dec: true });
  } else if (!juxtaFired) {
    // The additive reading ("one forty five" → 46) is nonsense once the
    // juxtaposition rule has fired — suppress it rather than offer junk.
    candSet.push({ v: baseInt + fracAdd, dec: fracAdd !== 0 });
  }

  return finalizeMany(expandCm(candSet, unit, hadExplicitPoint, fracAdd), unit, raw);
}

/**
 * Centimetre heuristic, shared by the digit fast path and the word path: an
 * integer > 15 with no explicit decimal is suspect — «מאה חמישים» → 150 and a
 * bare "145" are almost certainly 1.50 m / 1.45 m. Offer BOTH readings,
 * cm-interpretation first; NEVER silently divide. An explicit cm unit divides
 * unambiguously. An explicit METRE unit does not block the expansion — "145
 * meters" is absurd as a depth, so the in-range reading still leads.
 */
function expandCm(candSet, unit, hadExplicitPoint, fracAdd) {
  const expanded = [];
  for (const c of candSet) {
    if (unit === 'cm') {
      const m = c.v / 100;
      expanded.push({ v: m, dec: !Number.isInteger(m), note: 'cm' });
    } else if (!hadExplicitPoint && fracAdd === 0 && !c.dec && c.v > DEPTH_MAX_M && Number.isInteger(c.v)) {
      const m = c.v / 100;
      expanded.push({ v: m, dec: !Number.isInteger(m), note: 'cm?' }); // preferred: reads as cm
      expanded.push({ v: c.v, dec: false, note: 'raw' });
    } else {
      expanded.push(c);
    }
  }
  return expanded;
}

/** Multi-candidate finalize: dedupe, rank plausible-first. */
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
 * Render a JS number as a measurement string. Preserves decimal-ness (1.5 stays
 * "1.5") and avoids float dust like 2.4499999 by rounding to 2 dp — depths are
 * recorded to ~0.05.
 */
function normalizeValueString(v, hadDecimal) {
  if (!Number.isFinite(v)) return '';
  const rounded = Math.round(v * 100) / 100;
  let s = String(rounded);
  if (hadDecimal && !s.includes('.')) s += '.0';
  return s;
}
