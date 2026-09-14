/**
 * Text normalisation for the policy evaluator.
 *
 * The pipeline the policy document names, in order:
 *
 *   Unicode normalisation → zero-width and control removal → case folding →
 *   homoglyph folding in mixed-script tokens → spacing and punctuation
 *   normalisation → (matching)
 *
 * Two forms come out of it. `norm` keeps word boundaries and is what token,
 * phrase and pattern matching read. `compact` has every space and punctuation
 * mark removed and is what substring matching reads — it is the form in which
 * 섹 스, 섹.스, 섹-스 and ｓｅｘ all collapse onto the term that names them.
 *
 * The Python port in `scripts/content/child_safety.py` implements exactly this
 * and the shared fixtures hold the two to the same answers.
 */

/** Zero-width, joiner, BOM, soft hyphen, variation selectors, C0/C1 controls. */
const INVISIBLE = /[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD\uFE00-\uFE0F\u180E\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Letters, digits and combining marks in any script — a Thai vowel or a Devanagari matra is part of its word. */
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

/** Characters that mask a letter inside a word: f*ck, s.e.x, s-e-x, s_e_x, s(e)x. */
const MASK = /[*#.\-_·•~^+()[\]{}]/;

let leetTable: Record<string, string> = {};

/**
 * Cyrillic and Greek letters that print like Latin ones. They are folded only
 * inside a token that mixes scripts (sеx with a Cyrillic е, fuсk with a
 * Cyrillic с): a word written wholly in Cyrillic or Greek is a real word in
 * its own language and is left exactly as it is.
 */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j', ѕ: 's', һ: 'h', ԁ: 'd', ԛ: 'q', ԝ: 'w', ѵ: 'v', к: 'k', т: 't', м: 'm', в: 'b', н: 'h', ё: 'e',
  α: 'a', ο: 'o', ε: 'e', ρ: 'p', χ: 'x', υ: 'y', ν: 'v', ι: 'i', κ: 'k', τ: 't', η: 'n', β: 'b',
};
const LATIN = /[a-z]/;
const CYRILLIC_OR_GREEK = /[\u0370-\u03ff\u0400-\u04ff]/;
function foldHomoglyphs(token: string): string {
  if (!LATIN.test(token) || !CYRILLIC_OR_GREEK.test(token)) return token;
  let out = '';
  for (const ch of token) out += HOMOGLYPHS[ch] ?? ch;
  return out;
}

/** Installed once from the policy so the module has no import cycle. */
export function configureLeet(table: Record<string, string>): void {
  leetTable = table;
}

/**
 * Undo common obfuscation inside one token.
 *
 * Only tokens that contain at least one letter are touched, so a price or a
 * year is left alone; inside such a token leet digits and symbols become the
 * letters they stand for and masking characters are dropped.
 */
function deobfuscate(token: string): string {
  if (!/\p{L}/u.test(token)) return token;
  // Only the core is rewritten; punctuation that ends a token is a boundary,
  // not a mask, and `sex!` has to stay a token that ends in x.
  const match = /^([^\p{L}\p{N}\p{M}]*)(.*?)([^\p{L}\p{N}\p{M}]*)$/su.exec(token);
  if (!match) return token;
  const [, lead = '', core = '', trail = ''] = match;
  let out = '';
  for (const ch of core) {
    if (MASK.test(ch)) continue;
    out += leetTable[ch] ?? ch;
  }
  return lead + out + trail;
}

/**
 * Join a run of single letters separated by spaces or masks: `s e x` → `sex`,
 * and `s e l f - h a r m` → `selfharm` (a mask between two spelled letters is
 * part of the run, not a word boundary).
 *
 * Three or more single letters in a row, so an initialism such as `a b` or a
 * list of Hangul consonants `ㄱ ㄴ ㄷ` is not folded — the Hangul lesson lists
 * jamo one per token, and folding them would make `ㅂ ㅅ` read as an
 * abbreviation it is not.
 */
function joinSpelledOut(text: string): string {
  return text.replace(/(?:^|(?<=\s))((?:[a-z](?:\s|\s?[*#.\-_]\s?){1,3}){2,}[a-z])(?=\s|$)/g, (run) => run.replace(/[\s*#.\-_]/g, ''));
}

/**
 * Compose a run of compatibility jamo into syllables: ㅅㅔㄱㅅㅡ → 섹스.
 *
 * Korean can be "spelled out" letter by letter with the compatibility block
 * (U+3131–U+3163), which is how a term is hidden from a syllable-level match.
 * A run is composed only where it reads as syllables — an initial, a medial,
 * an optional final — and a run that does not (ㅂㅅ, or a lesson's ㄱㄴㄷ) is
 * left exactly as it was, so the profanity abbreviations the policy names as
 * jamo still match as jamo.
 */
const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNGSEONG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONGSEONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
function composeJamo(text: string): string {
  return text.replace(/[\u3131-\u3163]{2,}/g, (run) => {
    let out = '';
    let i = 0;
    const chars = [...run];
    while (i < chars.length) {
      const l = CHOSEONG.indexOf(chars[i]!);
      const v = i + 1 < chars.length ? JUNGSEONG.indexOf(chars[i + 1]!) : -1;
      if (l < 0 || v < 0) {
        out += chars[i];
        i += 1;
        continue;
      }
      let t = 0;
      // A final is taken only if the letter after it is not a medial: ㅅㅔㄱㅅㅡ
      // reads 섹스, not 세 + ㄱㅅ.
      if (i + 2 < chars.length) {
        const candidate = JONGSEONG.indexOf(chars[i + 2]!);
        const next = i + 3 < chars.length ? JUNGSEONG.indexOf(chars[i + 3]!) : -1;
        if (candidate > 0 && next < 0) t = candidate;
      }
      out += String.fromCharCode(0xac00 + (l * 21 + v) * 28 + t);
      i += t > 0 ? 3 : 2;
    }
    return out;
  });
}

/**
 * A conjoining initial left after a syllable with no final becomes that
 * syllable's final: 세ᄀ스 → 섹스. NFKC leaves it there when the text arrived
 * as conjoining jamo (or as 세ㄱ스, an open syllable with its final spelled
 * out), because a letter from the initials block never composes as a final.
 * An initial with no final form (ㄸ ㅃ ㅉ), or one that is followed by a
 * medial, is left alone.
 */
const CONJOINING_CHOSEONG = 0x1100;
function closeSyllables(text: string): string {
  return text.replace(/([\uac00-\ud7a3])([\u1100-\u1112])(?![\u1161-\u1175])/g, (whole, syllable: string, initial: string) => {
    const code = syllable.charCodeAt(0) - 0xac00;
    if (code % 28 !== 0) return whole;
    const t = JONGSEONG.indexOf(CHOSEONG[initial.charCodeAt(0) - CONJOINING_CHOSEONG]!);
    if (t <= 0) return whole;
    return String.fromCharCode(0xac00 + code + t);
  });
}

export interface Normalized {
  /** Case-folded, invisible characters removed, whitespace collapsed, tokens de-obfuscated. */
  norm: string;
  /**
   * `norm` with punctuation removed and runs of single-syllable Hangul tokens
   * joined (섹 스 → 섹스), but the spaces between real words kept — so 복도
   * 박물관 does not contain 도박.
   */
  compact: string;
  /** `norm` with every non-letter, non-digit character removed, spaces included. */
  flat: string;
}

export function normalize(input: string): Normalized {
  // Invisible characters go first so a zero-width joiner cannot split a
  // spelled-out run; the run is composed before NFKC, which would otherwise
  // turn the compatibility letters into conjoining jamo and compose only the
  // initial and medial (세ᄀ스), leaving the final loose.
  let text = composeJamo(input.replace(INVISIBLE, ''));
  text = closeSyllables(text.normalize('NFKC'));
  text = text.toLowerCase();
  text = text.replace(/\s+/g, ' ').trim();
  text = text
    .split(' ')
    .map((token) => deobfuscate(foldHomoglyphs(token)))
    .join(' ');
  text = joinSpelledOut(text);
  return { norm: text, compact: compactOf(text), flat: flatOf(text) };
}

function flatOf(text: string): string {
  let out = '';
  for (const ch of text) if (WORD_CHAR.test(ch)) out += ch;
  return out;
}

/**
 * Punctuation gone, word spaces kept, and a run of two or more single-syllable
 * Hangul tokens joined into one word. 섹 스 하 다 is an evasion; 복도 박물관 is
 * two words.
 *
 * A run of single syllables is also joined to the syllable word that follows
 * it: 섹 스하다, 자 살하고 and 마 약을 are the two-character terms split once
 * with their ending left attached, which neither the run rule nor the flat
 * form (three characters and up) used to see. The join is forward only — a
 * single syllable never attaches to the word before it — because 날씨 방
 * would otherwise contain 씨방. Measured over every Korean surface the app
 * ships (84,038 strings on 2026-09-15) the forward join adds no finding.
 */
function compactOf(text: string): string {
  const tokens = text
    .split(' ')
    .map((raw) => ({ flat: flatOf(raw), closed: /[^\p{L}\p{N}\p{M}]$/u.test(raw) }))
    .filter((token) => token.flat);
  const out: string[] = [];
  let run: string[] = [];
  // A syllable that ended in punctuation (자, 살펴봐요) closes its run: the
  // comma is a boundary, and the forward join must not read 자살 there.
  let closed = false;
  const flush = () => {
    if (run.length >= 2) out.push(run.join(''));
    else out.push(...run);
    run = [];
  };
  for (const token of tokens) {
    if (token.flat.length === 1 && isHangulTerm(token.flat)) {
      if (closed) flush();
      run.push(token.flat);
      closed = token.closed;
      continue;
    }
    if (run.length && !closed && /^[가-힣]/.test(token.flat) && run.every((s) => /^[가-힣]$/.test(s))) {
      out.push(run.join('') + token.flat);
      run = [];
      continue;
    }
    flush();
    out.push(token.flat);
    closed = false;
  }
  flush();
  return out.join(' ');
}

/** The compact and flat forms of a policy term — the same reduction the text gets. */
export function compactTerm(term: string): { compact: string; flat: string } {
  const lowered = term.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return { compact: compactOf(lowered), flat: flatOf(lowered) };
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether a string is Korean script (syllables or compatibility jamo). */
export function isHangulTerm(term: string): boolean {
  return /[가-힣ㄱ-ㅎㅏ-ㅣ\u1100-\u11ff\u3130-\u318f]/.test(term);
}
