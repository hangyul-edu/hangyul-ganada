import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { VOCABULARY } from '../../data/vocabulary';

/**
 * Wrong answers for "what does this word mean?".
 *
 * ## Why this is not four random words
 *
 * A reading question is only a reading question if the wrong answers are ones a
 * learner might plausibly pick. Offering 사과 ("apple") against "to run", "on
 * Tuesday" and "quickly" tests nothing: three of the four can be eliminated
 * without looking at the Korean at all, because only one of them is a thing.
 * The learner scores, learns nothing, and the product has told them they can
 * read.
 *
 * So distractors are drawn from words that could be the answer:
 *
 * 1. **Same part of speech.** A noun's alternatives are nouns. This is what
 *    stops the grammatical shape of the English giving the answer away.
 * 2. **Similar difficulty.** Within a level or two, so the alternatives are
 *    words this learner has plausibly met.
 * 3. **Look-alikes first.** A word that shares its first syllable, or differs
 *    from the target by one letter, is offered ahead of an unrelated one —
 *    because 물 / 불 / 풀 is exactly the distinction reading Hangul consists of,
 *    and a learner who is pattern-matching on shape rather than reading is
 *    caught here or nowhere.
 *
 * ## Two questions, two opposite rules
 *
 * The above is right for *meaning* questions and precisely wrong for *context*
 * ones, which is how this shipped:
 *
 * ```
 * 저 ___ 는 의사예요.        [ 남자 ]  [ 여자 ]  [ 사람 ]  [ 학생 ]
 * ```
 *
 * Every option is a noun of similar difficulty, which is exactly what the rules
 * above ask for — and every option is *correct*. That man is a doctor, that
 * woman is a doctor, that person is a doctor. The learner is marked wrong for
 * an answer the sentence supports, and no hint can repair it, because the
 * question does not have one answer to hint at.
 *
 * A gap-fill is a comprehension question, so its wrong answers have to be words
 * the sentence *cannot* take. `contextOptions` therefore inverts the rule:
 * same part of speech, so the grammar gives nothing away, and a **different
 * semantic category**, so only one option can be meant. See below.
 *
 * ## Deterministic
 *
 * `seed` fixes the order, so a retry asks the same question with the options in
 * the same places. A learner who gets it wrong and sees the answers reshuffle
 * cannot tell whether they learned something or just guessed differently.
 */

const OPTION_COUNT = 4;

/** Words a learner might confuse with this one, most confusable first. */
function candidates(word: VocabularyWord): VocabularyWord[] {
  const sameShape: VocabularyWord[] = [];
  const sameKind: VocabularyWord[] = [];

  for (const other of VOCABULARY) {
    if (other.id === word.id) continue;
    if (other.part_of_speech !== word.part_of_speech) continue;
    if (Math.abs(other.difficulty_level - word.difficulty_level) > 2) continue;

    if (looksAlike(word.word, other.word)) sameShape.push(other);
    else sameKind.push(other);
  }
  return [...sameShape, ...sameKind];
}

/**
 * Whether two Korean words are close enough to be mistaken for each other.
 *
 * Same length and differing in at most one syllable — 물 / 불, 사과 / 사과할,
 * 가방 / 가장. Cheap, and it catches the confusions that matter without needing
 * an edit-distance table over 2,504 words.
 */
function looksAlike(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) differences += 1;
    if (differences > 1) return false;
  }
  return differences === 1;
}

/** A small deterministic shuffle. Same seed, same order, every time. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = (seed || 1) >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Reads a word's meaning in whatever language the question is being asked in.
 *
 * Optional throughout this module, and that is a deliberate compromise. Two
 * words with the same gloss offered together — 크다 and 커다랗게 both showing
 * "big" — is one question with two right answers, and only the caller knows
 * which language is on screen. Where it is supplied, such a pair is excluded;
 * where it is not, the structural rules still apply and `answerable.test.ts`
 * holds the gloss property separately.
 */
export type MeaningLookup = (word: VocabularyWord) => string;

/** Two glosses that a learner would read as the same answer. */
function sameMeaning(a: string, b: string): boolean {
  const normalise = (text: string) =>
    text
      .toLowerCase()
      .replace(/^(to |a |an |the )/, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return normalise(a) === normalise(b);
}

/**
 * Fills a question up to `OPTION_COUNT`, in pool order, refusing duplicates.
 *
 * Shared by both question types so that "never offer the same answer twice"
 * cannot be true of one of them and false of the other.
 */
function take(
  word: VocabularyWord,
  pools: ReadonlyArray<readonly VocabularyWord[]>,
  meaningOf?: MeaningLookup,
): VocabularyWord[] {
  const chosen: VocabularyWord[] = [];
  const taken = new Set([word.id]);
  const target = meaningOf?.(word);

  for (const pool of pools) {
    for (const candidate of pool) {
      if (chosen.length >= OPTION_COUNT - 1) return chosen;
      if (taken.has(candidate.id)) continue;
      if (target !== undefined && sameMeaning(target, meaningOf!(candidate))) continue;
      if (
        meaningOf &&
        chosen.some((already) => sameMeaning(meaningOf(already), meaningOf(candidate)))
      ) {
        continue;
      }
      taken.add(candidate.id);
      chosen.push(candidate);
    }
  }
  return chosen;
}

/**
 * The options for one reading question: the word plus three alternatives.
 *
 * Returns words rather than strings, because the caller needs each one's
 * meaning in the learner's own language and that is loaded per locale.
 */
export function readingOptions(
  word: VocabularyWord,
  seed: number,
  meaningOf?: MeaningLookup,
): VocabularyWord[] {
  // A part of speech with almost no members — there are ten numerals — can run
  // out of same-kind candidates. Falling back to any other word is better than
  // asking a two-option question, and it is rare enough not to shape the
  // exercise.
  const chosen = take(word, [candidates(word), VOCABULARY], meaningOf);
  return shuffle([word, ...chosen], seed);
}

/**
 * The options for one gap-fill: the word plus three the sentence cannot take.
 *
 * The inverse of `readingOptions`, for the reason set out at the top of this
 * file. Three rules, and each one removes a way for a second answer to be
 * defensible:
 *
 * 1. **Same part of speech.** Otherwise the sentence's grammar answers it — a
 *    slot that needs a verb offered one verb and three nouns is not a question.
 * 2. **A different semantic category, sharing no tags.** This is the one that
 *    fixes 남자 / 여자: both are People & Family, so neither can be the other's
 *    distractor. A sentence about a person now offers a place, a food and a
 *    feeling, exactly one of which it can mean.
 * 3. **Not present in the sentence already.** A word the sentence contains
 *    elsewhere reads as a second gap.
 *
 * Where the corpus cannot satisfy this — a category with few members, an
 * unusual part of speech — it returns fewer than four options, and the caller
 * drops the question rather than padding it. A question with three options is
 * still answerable; a question with two right answers is not, and the whole
 * point of this function is that the second one never ships.
 */
export function contextOptions(
  word: VocabularyWord,
  sentence: string,
  seed: number,
  meaningOf?: MeaningLookup,
): VocabularyWord[] {
  const tags = new Set([word.category, ...word.category_tags]);
  const pool = VOCABULARY.filter((other) => {
    if (other.id === word.id) return false;
    if (other.part_of_speech !== word.part_of_speech) return false;
    // Rule 2, both directions: neither may be filed or tagged where the other
    // is. Checking one direction lets a broadly-tagged word slip through.
    if (tags.has(other.category)) return false;
    if (other.category_tags.some((tag) => tags.has(tag))) return false;
    // Rule 3.
    if (sentence.includes(other.word)) return false;
    return true;
  }).sort((a, b) => a.difficulty_score - b.difficulty_score);

  const chosen = take(word, [pool], meaningOf);
  return shuffle([word, ...chosen], seed);
}

/** How many options a question must have before it is worth asking. */
export const MIN_OPTIONS = OPTION_COUNT;
