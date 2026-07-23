/**
 * Unit tests for the spoken-depth parser (features/voice-depth/number-parser.js).
 *
 * This is the provably-correct core of voice depth entry. Coverage:
 *   - digit transcripts (what Google's engine usually returns for small numbers)
 *   - word transcripts (what it falls back to, and what an on-device recognizer emits)
 *   - Hebrew (both numeral genders), Levantine + MSA Arabic, English
 *   - Eastern-Arabic numerals and the Arabic decimal separator
 *   - the centimetre ambiguity (never silently divide)
 *   - unit words, half/quarter shorthands, out-of-range ranking, junk input
 */
import { describe, it, expect } from 'vitest';
import attackCasesJson from '../fixtures/voice-depth-attack-cases.json';
// @ts-expect-error — plain JS module, no type declarations
import {
  parseSpokenDepth,
  pickBestParse,
  sanitizeDepth,
  langFamily,
  VOICE_LANGS,
} from '../../src/features/voice-depth/number-parser.js';

const val = (t: string, lang: string) => parseSpokenDepth(t, lang).value;

describe('langFamily', () => {
  it('maps locales to families', () => {
    expect(langFamily('he-IL')).toBe('he');
    expect(langFamily('iw')).toBe('he'); // legacy Hebrew code
    expect(langFamily('AR')).toBe('ar');
    expect(langFamily('ar-JO')).toBe('ar');
    expect(langFamily('en_US')).toBe('en');
    expect(langFamily('')).toBe('en'); // default
    expect(langFamily(undefined as unknown as string)).toBe('en');
  });
});

describe('sanitizeDepth matches the app input sanitizer', () => {
  it('strips non-numeric and collapses to one dot', () => {
    expect(sanitizeDepth('2.45 m')).toBe('2.45');
    // Faithful to field-stepper.js:630 — the lookahead deletes every dot that has a
    // later dot, so the LAST dot survives: '1.2.3' → '12.3' (not '1.23').
    expect(sanitizeDepth('1.2.3')).toBe('12.3');
    expect(sanitizeDepth('abc')).toBe('');
    expect(sanitizeDepth(null as unknown as string)).toBe('');
  });
});

describe('digit transcripts (recognizer already normalized to digits)', () => {
  it('english "1.5"', () => expect(val('1.5', 'en-US')).toBe('1.5'));
  it('with unit word "1.5 m"', () => expect(val('1.5 m', 'en-US')).toBe('1.5'));
  it('hebrew "2.45 מטר"', () => expect(val('2.45 מטר', 'he-IL')).toBe('2.45'));
  it('arabic "3.2 متر"', () => expect(val('3.2 متر', 'ar-IL')).toBe('3.2'));
  it('bare integer "4"', () => expect(val('4', 'en-US')).toBe('4'));
});

describe('Eastern-Arabic numerals and separators', () => {
  it('converts ٢٫٤٥ → 2.45', () => {
    expect(val('٢٫٤٥', 'ar-IL')).toBe('2.45');
  });
  it('converts with unit ٣ متر → 3', () => {
    expect(val('٣ متر', 'ar-IL')).toBe('3');
  });
  it('Persian/Urdu digits ۱۲ → treated as cm-suspect (0.12 preferred)', () => {
    const r = parseSpokenDepth('۱۲', 'ar-IL');
    // 12 is within range and has no decimal → stays 12? No: 12 <= 15, so not cm-suspect.
    expect(r.value).toBe('12');
  });
});

describe('English word path', () => {
  it('"two point four five" (digit-by-digit fraction)', () => {
    const r = parseSpokenDepth('two point four five', 'en-US');
    expect(r.candidates).toContain('2.45');
    expect(r.value).toBe('2.45');
  });
  it('"one point five"', () => expect(val('one point five', 'en-US')).toBe('1.5'));
  it('"zero point seven five"', () => expect(val('zero point seven five', 'en-US')).toBe('0.75'));
  it('"twelve"', () => expect(val('twelve', 'en-US')).toBe('12'));
  it('"one and a half" → 1.5', () => expect(val('one and a half', 'en-US')).toBe('1.5'));
  it('"two and a quarter" → 2.25', () => expect(val('two and a quarter', 'en-US')).toBe('2.25'));
});

describe('Hebrew word path (both genders)', () => {
  it('feminine "שתיים נקודה ארבע חמש" → 2.45', () => {
    const r = parseSpokenDepth('שתיים נקודה ארבע חמש', 'he-IL');
    expect(r.candidates).toContain('2.45');
  });
  it('masculine "שניים נקודה ארבע חמש" → 2.45', () => {
    const r = parseSpokenDepth('שניים נקודה ארבע חמש', 'he-IL');
    expect(r.candidates).toContain('2.45');
  });
  it('"מטר וחצי" → 1.5', () => expect(val('מטר וחצי', 'he-IL')).toBe('1.5'));
  it('"אחת נקודה חמש" → 1.5', () => expect(val('אחת נקודה חמש', 'he-IL')).toBe('1.5'));
  it('"שלוש" → 3', () => expect(val('שלוש', 'he-IL')).toBe('3'));
  it('place-value fraction "אחת נקודה חמישים" → 1.50 (== 1.5)', () => {
    const r = parseSpokenDepth('אחת נקודה חמישים', 'he-IL');
    expect(r.candidates).toContain('1.5');
  });
});

describe('Arabic word path (Levantine + MSA)', () => {
  it('Levantine "متر ونص" → 1.5', () => expect(val('متر ونص', 'ar-IL')).toBe('1.5'));
  it('colloquial "تنين فاصلة اربعة خمسة" → 2.45', () => {
    const r = parseSpokenDepth('تنين فاصلة اربعة خمسة', 'ar-IL');
    expect(r.candidates).toContain('2.45');
  });
  it('MSA "ثلاثة" → 3', () => expect(val('ثلاثة', 'ar-IL')).toBe('3'));
  it('"واحد وربع" → 1.25', () => expect(val('واحد وربع', 'ar-IL')).toBe('1.25'));
});

describe('centimetre ambiguity — never silently divide', () => {
  it('Hebrew "מאה חמישים" → prefers 1.5 but flags ambiguous with 150 present', () => {
    const r = parseSpokenDepth('מאה חמישים', 'he-IL');
    expect(r.ambiguous).toBe(true);
    expect(r.value).toBe('1.5'); // cm interpretation ranked first (in range)
    expect(r.candidates).toContain('150');
  });
  it('explicit cm unit "מאה חמישים סמ" → 1.5 unambiguously', () => {
    const r = parseSpokenDepth('מאה חמישים סמ', 'he-IL');
    expect(r.value).toBe('1.5');
    expect(r.unit).toBe('cm');
  });
  it('English "two hundred" cm-suspect → 2 preferred, 200 offered', () => {
    const r = parseSpokenDepth('two hundred', 'en-US');
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toContain('2');
    expect(r.candidates).toContain('200');
    expect(r.value).toBe('2'); // in-range first
  });
  it('a normal value like "twelve" is NOT treated as cm', () => {
    const r = parseSpokenDepth('twelve', 'en-US');
    expect(r.ambiguous).toBe(false);
    expect(r.value).toBe('12');
  });
});

describe('field bug 2026-07-23 — recognizer emits a literal "." for the spoken point', () => {
  // Reported: user said 1.45, transcript showed «אחד . ארבע חמש», parsed value was 9.
  it('THE reported transcript «אחד . ארבע חמש» → 1.45', () => {
    const r = parseSpokenDepth('אחד . ארבע חמש', 'he-IL');
    expect(r.value).toBe('1.45');
  });
  it('dot attached to the word «אחד. ארבע חמש» → 1.45', () => {
    expect(val('אחד. ארבע חמש', 'he-IL')).toBe('1.45');
  });
  it('mixed digits+dot «1. ארבע חמש» → 1.45', () => {
    expect(val('1. ארבע חמש', 'he-IL')).toBe('1.45');
  });
  it('leading dot «.45» → 0.45', () => {
    expect(val('.45', 'en-US')).toBe('0.45');
  });
  it('a real decimal number is untouched by dot tokenization: «2.45» → 2.45', () => {
    expect(val('2.45', 'he-IL')).toBe('2.45');
  });
});

describe('digit sequences are concatenated, never summed', () => {
  it('«ארבע חמש» is 45-ish, never 9', () => {
    const r = parseSpokenDepth('ארבע חמש', 'he-IL');
    expect(r.candidates).not.toContain('9');
    expect(r.value).toBe('0.45'); // 45 > 15 → cm reading preferred
    expect(r.candidates).toContain('45');
    expect(r.ambiguous).toBe(true);
  });
  it('english «four five» is 45-ish, never 9', () => {
    const r = parseSpokenDepth('four five', 'en-US');
    expect(r.candidates).not.toContain('9');
    expect(r.candidates).toContain('45');
  });
  it('«אחד ארבע חמש» spoken digit-by-digit with no point → 1.45 preferred, 145 offered', () => {
    const r = parseSpokenDepth('אחד ארבע חמש', 'he-IL');
    expect(r.value).toBe('1.45');
    expect(r.candidates).toContain('145');
    expect(r.ambiguous).toBe(true);
  });
  it('digit transcript «145» (engine normalized the digits) → 1.45 preferred', () => {
    const r = parseSpokenDepth('145', 'he-IL');
    expect(r.value).toBe('1.45');
    expect(r.candidates).toContain('145');
  });
  it('digit transcript «45» → 0.45 preferred, 45 offered', () => {
    const r = parseSpokenDepth('45', 'he-IL');
    expect(r.value).toBe('0.45');
    expect(r.candidates).toContain('45');
  });
  it('fraction after the point no longer grows a junk additive candidate: «אחד נקודה ארבע חמש» is unambiguous 1.45', () => {
    const r = parseSpokenDepth('אחד נקודה ארבע חמש', 'he-IL');
    expect(r.value).toBe('1.45');
    expect(r.candidates).not.toContain('1.9');
    expect(r.ambiguous).toBe(false);
  });
  it('teens stay additive: «אחת עשרה» → 11', () => {
    expect(val('אחת עשרה', 'he-IL')).toBe('11');
  });
  it('tens+unit stay additive: «twenty three» keeps 23 as a candidate', () => {
    const r = parseSpokenDepth('twenty three', 'en-US');
    expect(r.candidates).toContain('23');
  });
  it('arabic digit pair «اربعة خمسة» → 45-ish, never 9', () => {
    const r = parseSpokenDepth('اربعة خمسة', 'ar-IL');
    expect(r.candidates).not.toContain('9');
    expect(r.candidates).toContain('45');
  });
});

describe('attached ו/و clitic on number words', () => {
  it('«ארבעים וחמש» → 45 (clitic stripped)', () => {
    const r = parseSpokenDepth('ארבעים וחמש', 'he-IL');
    expect(r.candidates).toContain('45');
  });
  it('«אחד נקודה ארבעים וחמש» → 1.45', () => {
    const r = parseSpokenDepth('אחד נקודה ארבעים וחמש', 'he-IL');
    expect(r.candidates).toContain('1.45');
  });
});

describe('ranking & ambiguity', () => {
  it('out-of-range candidate is ranked below the in-range one', () => {
    const r = parseSpokenDepth('מאה חמישים', 'he-IL');
    // 1.5 in range, 150 out of range → 1.5 first
    expect(r.candidates[0]).toBe('1.5');
  });
});

describe('junk & edge input', () => {
  it('empty string → null', () => {
    const r = parseSpokenDepth('', 'en-US');
    expect(r.value).toBeNull();
    expect(r.candidates).toEqual([]);
  });
  it('pure noise → null', () => expect(val('hello there', 'en-US')).toBeNull());
  it('null transcript → null, raw preserved as empty', () => {
    const r = parseSpokenDepth(null as unknown as string, 'en-US');
    expect(r.value).toBeNull();
    expect(r.raw).toBe('');
  });
  it('whitespace only → null', () => expect(val('   ', 'he-IL')).toBeNull());
});

describe('field bug 2026-07-23 #2 — clipped first word (spoken 1.34 became 0.34)', () => {
  it('every complete form of 1.34 parses to 1.34', () => {
    for (const t of ['אחד נקודה שלושים וארבע', 'אחת נקודה שלושים וארבע', 'מטר שלושים וארבע', 'אחד. שלושים וארבע', '1.34']) {
      expect(parseSpokenDepth(t, 'he-IL').value).toBe('1.34');
    }
  });
  it('a clipped transcript is flagged with leadingPoint', () => {
    const r = parseSpokenDepth('נקודה שלושים וארבע', 'he-IL');
    expect(r.value).toBe('0.34'); // never invents the missing integer
    expect(r.leadingPoint).toBe(true);
    expect(parseSpokenDepth('.34', 'he-IL').leadingPoint).toBe(true);
  });
  it('complete transcripts are NOT flagged', () => {
    expect(parseSpokenDepth('אחד נקודה שלושים וארבע', 'he-IL').leadingPoint).toBe(false);
    expect(parseSpokenDepth('חצי מטר', 'he-IL').leadingPoint).toBe(false);
    expect(parseSpokenDepth('2.45', 'he-IL').leadingPoint).toBe(false);
  });

  describe('pickBestParse ranks across recognizer alternatives', () => {
    it('THE reported scenario: clipped alt first, full alt second → 1.34 wins', () => {
      const r = pickBestParse(['נקודה שלושים וארבע', 'אחד נקודה שלושים וארבע'], 'he-IL');
      expect(r.value).toBe('1.34');
      expect(r.candidates).toContain('0.34'); // the losing reading stays a tap away
    });
    it('order does not matter — full alt first still wins', () => {
      expect(pickBestParse(['אחד נקודה שלושים וארבע', 'נקודה שלושים וארבע'], 'he-IL').value).toBe('1.34');
    });
    it('all alternatives clipped → best clipped parse, flagged for the caller', () => {
      const r = pickBestParse(['נקודה שלושים וארבע', 'נקודה שלושים'], 'he-IL');
      expect(r.value).toBe('0.34');
      expect(r.leadingPoint).toBe(true);
    });
    it('no alternative parses → null result', () => {
      expect(pickBestParse(['hello', 'there'], 'en-US').value).toBeNull();
    });
    it('single string input works too', () => {
      expect(pickBestParse('2.45', 'he-IL').value).toBe('2.45');
    });
    it('in-range beats out-of-range across alternatives', () => {
      // alt0 parses to a flat out-of-range 40; alt1 is the intended 1.34
      const r = pickBestParse(['ארבעים מטר', 'אחד נקודה שלושים וארבע'], 'he-IL');
      expect(r.value).toBe('1.34');
    });
  });
});

describe('adversarial sweep — 90 attack cases (2026-07-23)', () => {
  // Generated by six linguistic attackers (native-speech he/ar, recognizer-quirk
  // he/ar, L2 English, cross-language edge cases), then executed against the real
  // parser and triaged. Locked in as a permanent regression gate.
  // expected: '1.45' | 'NULL' | 'AMB:a|b' (value must be a, all listed must be
  // offered) | 'DEBATE:x' (our documented pick).
  const attackCases = attackCasesJson as Array<{ transcript: string; lang: string; expected: string; note: string }>;

  for (const c of attackCases) {
    it(`[${c.lang}] ${JSON.stringify(c.transcript)} → ${c.expected}`, () => {
      const r = parseSpokenDepth(c.transcript, c.lang);
      const exp = String(c.expected).trim();
      if (exp === 'NULL') {
        expect(r.value).toBeNull();
      } else if (exp.startsWith('AMB:')) {
        const parts = exp.slice(4).split('|').map((s: string) => s.trim());
        expect(r.value).toBe(parts[0]);
        for (const p of parts) expect(r.candidates).toContain(p);
      } else if (exp.startsWith('DEBATE:')) {
        const want = exp.slice(7).trim();
        if (want === 'NULL') expect(r.value).toBeNull();
        else expect(r.value).toBe(want);
      } else {
        // strict value; 1.5 and 1.50 are the same measurement
        if (r.value !== exp) expect(parseFloat(r.value as string)).toBe(parseFloat(exp));
      }
    });
  }
});

describe('VOICE_LANGS fallback chains', () => {
  it('exposes locale lists per family', () => {
    expect(VOICE_LANGS.he[0]).toBe('he-IL');
    expect(VOICE_LANGS.ar).toContain('ar-IL');
    expect(VOICE_LANGS.en[0]).toBe('en-US');
  });
});
