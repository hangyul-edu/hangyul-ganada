/**
 * Text normalisation for the policy evaluator.
 *
 * The pipeline the policy document names, in order:
 *
 *   Unicode normalisation → zero-width and control removal → case folding →
 *   spacing and punctuation normalisation → (matching)
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

/** Characters that mask a letter inside a word: f*ck, s.e.x, s-e-x, s_e_x. */
const MASK = /[*#.\-_·•~^+]/;

let leetTable: Record<string, string> = {};

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
 * Join a run of single letters separated by spaces or masks: `s e x` → `sex`.
 *
 * Three or more single letters in a row, so an initialism such as `a b` or a
 * list of Hangul consonants `ㄱ ㄴ ㄷ` is not folded — the Hangul lesson lists
 * jamo one per token, and folding them would make `ㅂ ㅅ` read as an
 * abbreviation it is not.
 */
function joinSpelledOut(text: string): string {
  return text.replace(/(?:^|(?<=\s))((?:[a-z]\s){2,}[a-z])(?=\s|$)/g, (run) => run.replace(/\s/g, ''));
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
  let text = input.normalize('NFKC').replace(INVISIBLE, '');
  text = text.toLowerCase();
  text = text.replace(/\s+/g, ' ').trim();
  text = text
    .split(' ')
    .map((token) => deobfuscate(token))
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
 */
function compactOf(text: string): string {
  const tokens = text
    .split(' ')
    .map((token) => flatOf(token))
    .filter(Boolean);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) out.push(run.join(''));
    else out.push(...run);
    run = [];
  };
  for (const token of tokens) {
    if (token.length === 1 && isHangulTerm(token)) {
      run.push(token);
      continue;
    }
    flush();
    out.push(token);
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
