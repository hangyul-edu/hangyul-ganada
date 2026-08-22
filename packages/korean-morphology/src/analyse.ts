import { compose, decompose, FINALS, VOWELS } from './hangul';
import { conjugate, FORMS, type Form } from './conjugate';
import { classify, stemOf, type ConjugationClass } from './classes';

/**
 * A conjugated form in, the dictionary form out.
 *
 * ## Why there is no index
 *
 * The obvious way to look up 먹었어요 is to precompute every form of every
 * headword and search the result. For 26,675 headwords that is a map of some
 * eighty thousand strings, built on a phone, held in memory, and rebuilt every
 * time the dictionary grows.
 *
 * This does it the other way round: it *guesses* the dictionary form from the
 * shape of the word, and then **conjugates the guess back** and requires the
 * result to be the word that was typed. A guess that does not round-trip is
 * discarded, so the analysis is exact rather than approximate, and the whole
 * thing costs about six hundred string comparisons — microseconds, no memory,
 * and no index to keep in step with the corpus.
 *
 * The caller supplies `isHeadword`, so a guess also has to be a word the
 * dictionary actually has. 걸어요 round-trips from both 걷다 (walk) and 걸다
 * (hang), and both are real, so both are returned — in the dictionary's own
 * frequency order, by the caller. That is the right answer: the learner is the
 * one who knows which they meant.
 *
 * ## What it does not do
 *
 * Anything but verbs and adjectives. Nouns do not inflect in the way this is
 * about — 학교에서 is 학교 plus a particle, and stripping particles is a
 * different job with different failure modes, done in `dictionary.ts` where the
 * index can confirm the result in one lookup.
 */

/** A dictionary form the typed word could be. */
export interface Analysis {
  /** 먹다 */
  lemma: string;
  /** Which form the typed word is: `pastPolite` for 먹었어요. */
  form: Form;
  /** verb or adjective, whichever made the round trip work. */
  partOfSpeech: 'verb' | 'adjective';
}

/**
 * Ways the last syllable of a stem may have been changed by conjugation.
 *
 * Each is the *inverse* of a rule in `conjugate.ts`, and none of them has to be
 * right: a repair that produces a word which does not conjugate back to the
 * input is thrown away a few lines later. That is why the list can be generous
 * — the cost of a wrong guess is one string comparison, and the cost of a
 * missing one is a learner who cannot look up 들었어요.
 */
function repairs(prefix: string): string[] {
  if (!prefix) return [];
  const out = new Set<string>();

  /*
   * Two passes, because conjugation changes the last syllable twice.
   *
   * The past tense puts ㅆ inside the syllable the ending already merged with:
   * 하 becomes 해 becomes 했. So the ㅆ comes off first, and then the vowel is
   * un-merged — otherwise 했 has to be recognised in one step and every vowel
   * rule needs a past-tense twin.
   */
  const bases = new Set<string>([prefix]);
  const last = prefix[prefix.length - 1]!;
  const parts = decompose(last);
  if (parts && FINALS[parts.final] === 'ㅆ') {
    bases.add(prefix.slice(0, -1) + compose(parts.initial, parts.medial, 0));
  }

  for (const base of bases) {
    out.add(base);
    const tail = base[base.length - 1]!;
    const head = base.slice(0, -1);
    const at = decompose(tail);
    if (!at) continue;
    const { initial, medial, final } = at;
    const vowel = VOWELS[medial]!;

    // ㄹ was a ㄷ: 들 → 듣, 걸 → 걷. And ㅂ was a ㄹ: 삽니다 → 살.
    if (FINALS[final] === 'ㄹ') {
      out.add(head + compose(initial, medial, FINALS.indexOf('ㄷ')));
      // 몰 → 모르, 불 → 부르: the 르 doubled its ㄹ onto the syllable before.
      out.add(head + compose(initial, medial, 0) + '르');
    }
    if (FINALS[final] === 'ㅂ') out.add(head + compose(initial, medial, FINALS.indexOf('ㄹ')));
    if (FINALS[final] === 'ㄴ') out.add(head + compose(initial, medial, FINALS.indexOf('ㄹ')));

    if (final === 0) {
      // A final dropped before the vowel ending: 나 → 낫, 도 → 돕, 지 → 짓.
      for (const restored of ['ㅅ', 'ㅂ', 'ㅎ', 'ㄷ', 'ㄹ']) {
        out.add(head + compose(initial, medial, FINALS.indexOf(restored)));
      }
      /*
       * And the vowel itself, un-merged.
       *
       * Every entry here is the inverse of one line of `CONTRACTIONS` in
       * `conjugate.ts`: 보 + 아 → 봐, so 봐 may have been 보. ㅡ is in the list
       * twice because it drops to either 아 or 어 depending on the syllable
       * before it — 바빠 from 바쁘, 써 from 쓰.
       */
      const UNMERGE: Record<string, string[]> = {
        ㅘ: ['ㅗ'],
        ㅝ: ['ㅜ'],
        ㅕ: ['ㅣ', 'ㅕ'],
        ㅐ: ['ㅏ', 'ㅐ'],
        ㅔ: ['ㅔ'],
        ㅙ: ['ㅚ'],
        ㅏ: ['ㅏ', 'ㅡ'],
        ㅓ: ['ㅓ', 'ㅡ'],
      };
      for (const restored of UNMERGE[vowel] ?? []) {
        out.add(head + compose(initial, VOWELS.indexOf(restored), 0));
      }
      // 그래 → 그렇: the ㅎ-irregulars front their vowel as well as dropping ㅎ.
      for (const [fronted, plain] of [
        ['ㅐ', 'ㅏ'],
        ['ㅔ', 'ㅓ'],
        ['ㅒ', 'ㅑ'],
        ['ㅖ', 'ㅕ'],
      ] as const) {
        if (vowel === fronted) {
          out.add(head + compose(initial, VOWELS.indexOf(plain), FINALS.indexOf('ㅎ')));
        }
      }
    }
    out.add(`${base}르`);
  }

  /*
   * The five demonstratives, by name.
   *
   * 그렇 + 어 → 그래 is not the ㅎ-irregular rule — the rule would give 그레 —
   * so no inverse of the rule can find it. See the same table in `conjugate.ts`.
   */
  const DEMONSTRATIVE: Record<string, string> = {
    그래: '그렇',
    이래: '이렇',
    저래: '저렇',
    어때: '어떻',
    아무래: '아무렇',
  };
  for (const base of [...bases]) {
    const found = DEMONSTRATIVE[base];
    if (found) out.add(found);
  }
  return [...out];
}

const PARTS_OF_SPEECH = ['verb', 'adjective'] as const;

/** Which classes a caller may force, for a homograph the dictionary knows about. */
export type Override = ConjugationClass;

/**
 * Every dictionary form the typed word could be an inflection of.
 *
 * `isHeadword` decides what counts as a word. Without it every plausible
 * reconstruction would be offered, including the ones that are not Korean.
 */
export function analyse(
  surface: string,
  isHeadword: (lemma: string) => boolean,
  options: { forms?: readonly Form[] } = {},
): Analysis[] {
  const typed = surface.trim();
  if (typed.length < 2 || !/^[가-힣\s]+$/.test(typed)) return [];
  // Already a dictionary form: nothing to analyse, and 먹다 must not be reported
  // as an inflection of itself.
  if (stemOf(typed) && isHeadword(typed)) return [];

  const wanted = options.forms ?? FORMS;
  const seen = new Set<string>();
  const out: Analysis[] = [];

  /*
   * 겠 is a modal infix, and a learner types it.
   *
   * 먹겠습니다 is 먹다 with -겠- between the stem and the ending: it carries
   * intention or supposition, not tense, and it can sit inside almost any
   * ending. It is deliberately **not** a `Form` — the conjugation panel shows
   * the five or six shapes a beginner needs and 먹겠습니다 is not one of them —
   * but somebody who met it in a shop and typed it into search must land on
   * 먹다 rather than on nothing.
   *
   * So it is peeled off here and the remainder analysed as itself. Anything
   * that is a real inflection with 겠 in it is a real inflection without it,
   * which is what makes this sound rather than a special case per ending.
   */
  const withoutModal = typed.replace(/겠(?=(습니다|어요|아요|여요|다|지만|고)$)/, '');
  if (withoutModal !== typed) {
    return analyse(withoutModal, isHeadword, options);
  }

  // The typed word may be several eojeol — 먹을 거예요 — so the prefix walk runs
  // over the whole string and the space is simply another character.
  for (let cut = 1; cut <= typed.length; cut += 1) {
    for (const stem of repairs(typed.slice(0, cut))) {
      const lemma = `${stem}다`;
      if (seen.has(lemma) || !isHeadword(lemma)) continue;
      seen.add(lemma);
      for (const partOfSpeech of PARTS_OF_SPEECH) {
        const form = wanted.find(
          (candidate) => conjugate(lemma, candidate, { partOfSpeech }) === typed,
        );
        if (form) {
          out.push({ lemma, form, partOfSpeech });
          break;
        }
      }
    }
  }
  return out;
}

/**
 * The same question asked of one word, for a caller that already knows the
 * lemma and wants to know whether the surface belongs to it.
 */
export function formOf(
  lemma: string,
  surface: string,
  partOfSpeech: 'verb' | 'adjective',
): Form | null {
  return FORMS.find((form) => conjugate(lemma, form, { partOfSpeech }) === surface) ?? null;
}

export { classify };
