/**
 * Korean particles that agree with the word in front of them.
 *
 * ## The thing this fixes
 *
 * Korean chooses between 은/는, 이/가, 을/를 and 이에요/예요 by whether the word
 * before them ends in a consonant. A sentence with a placeholder in it cannot
 * know which, so translated interfaces write "은(는)" and hope — and the
 * learner reads "마디은(는) 마디라는 뜻이에요", which is exactly the register of
 * a machine-translated app. Korean products do not write that. They pick.
 *
 * So a Korean bundle can write:
 *
 * ```json
 * "answer": "{{word, eunneun}} “{{meaning}}”이라는 뜻이에요."
 * ```
 *
 * and get 마디는 and 사람은, each spelled the way a person would.
 *
 * ## Letters are named, not spelled
 *
 * A jamo is read by its name, and the name is what the particle agrees with: ㄱ
 * is 기역, which ends in ㄱ, so it takes 이에요; ㅏ is 아, which does not, so it
 * takes 예요. Reading the codepoint would get every consonant wrong, so the
 * twenty-four names are here. They are the same names the curriculum teaches;
 * `data.test.ts` asserts the two agree, because a second copy of a table is
 * only safe while something checks it.
 */

/** Every particle pair the interface uses, keyed by how a bundle writes it. */
const PAIRS: Record<string, [afterConsonant: string, afterVowel: string]> = {
  '은/는': ['은', '는'],
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '과/와': ['과', '와'],
  '으로/로': ['으로', '로'],
  '이에요/예요': ['이에요', '예요'],
  '이라는/라는': ['이라는', '라는'],
};

/** The formatter name a Korean bundle writes, and the pair it stands for. */
export const PARTICLES: Record<string, string> = {
  eunneun: '은/는',
  iga: '이/가',
  eulreul: '을/를',
  gwawa: '과/와',
  euro: '으로/로',
  ieyo: '이에요/예요',
  iraneun: '이라는/라는',
};

/** What each letter is called, because that is what the particle hears. */
const LETTER_NAMES: Record<string, string> = {
  ㄱ: '기역', ㄲ: '쌍기역', ㄴ: '니은', ㄷ: '디귿', ㄸ: '쌍디귿', ㄹ: '리을',
  ㅁ: '미음', ㅂ: '비읍', ㅃ: '쌍비읍', ㅅ: '시옷', ㅆ: '쌍시옷', ㅇ: '이응',
  ㅈ: '지읒', ㅉ: '쌍지읒', ㅊ: '치읓', ㅋ: '키읔', ㅌ: '티읕', ㅍ: '피읖',
  ㅎ: '히읗',
  ㅏ: '아', ㅐ: '애', ㅑ: '야', ㅒ: '얘', ㅓ: '어', ㅔ: '에', ㅕ: '여', ㅖ: '예',
  ㅗ: '오', ㅘ: '와', ㅙ: '왜', ㅚ: '외', ㅛ: '요', ㅜ: '우', ㅝ: '워', ㅞ: '웨',
  ㅟ: '위', ㅠ: '유', ㅡ: '으', ㅢ: '의', ㅣ: '이',
};

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;

/**
 * Whether the last sound of `text` is a consonant.
 *
 * `null` when the answer is unknowable — a word ending in a Latin letter or a
 * digit — so the caller can fall back rather than guess.
 */
export function endsInConsonant(text: string): boolean | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const last = LETTER_NAMES[trimmed.at(-1)!] ?? trimmed;
  const code = last.codePointAt(last.length - 1) ?? 0;
  if (code < SYLLABLE_BASE || code > SYLLABLE_LAST) return null;
  // The final consonant is the remainder after the initial and the medial.
  // 0 means the syllable ends in its vowel: 마디 → 디 → no final.
  const final = (code - SYLLABLE_BASE) % 28;
  // ㄹ counts as a consonant for every pair here. 으로/로 is the one that does
  // not, and it is spelled 로 after ㄹ as well as after a vowel — 서울로, not
  // 서울으로.
  return final !== 0;
}

/**
 * `("마디", "은/는")` → `"마디는"`.
 *
 * An unknown pair, or a word whose last sound cannot be read, returns the word
 * with the pair written out — which is the "은(는)" behaviour, kept as the
 * fallback it always should have been rather than the default.
 */
export function withParticle(text: string, pair: string): string {
  const forms = PAIRS[pair];
  if (!forms) return `${text}${pair}`;
  const consonant = endsInConsonant(text);
  if (consonant === null) return `${text}${forms[0]}(${forms[1]})`;
  if (pair === '으로/로') {
    const code = (text.trim().codePointAt(text.trim().length - 1) ?? 0) - SYLLABLE_BASE;
    const final = code >= 0 ? code % 28 : 0;
    // 8 is ㄹ. 서울로, 지하철로 — the vowel form, after the one consonant that
    // behaves like one.
    return `${text}${final === 0 || final === 8 ? forms[1] : forms[0]}`;
  }
  return `${text}${consonant ? forms[0] : forms[1]}`;
}
