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
 * The options for one reading question: the word plus three alternatives.
 *
 * Returns words rather than strings, because the caller needs each one's
 * meaning in the learner's own language and that is loaded per locale.
 */
export function readingOptions(word: VocabularyWord, seed: number): VocabularyWord[] {
  const pool = candidates(word);
  const chosen: VocabularyWord[] = [];
  const takenMeanings = new Set([word.id]);

  for (const candidate of pool) {
    if (chosen.length >= OPTION_COUNT - 1) break;
    if (takenMeanings.has(candidate.id)) continue;
    takenMeanings.add(candidate.id);
    chosen.push(candidate);
  }

  // A part of speech with almost no members — there are ten numerals — can run
  // out of same-kind candidates. Falling back to any other word is better than
  // asking a two-option question, and it is rare enough not to shape the
  // exercise.
  if (chosen.length < OPTION_COUNT - 1) {
    for (const other of VOCABULARY) {
      if (chosen.length >= OPTION_COUNT - 1) break;
      if (takenMeanings.has(other.id)) continue;
      takenMeanings.add(other.id);
      chosen.push(other);
    }
  }

  return shuffle([word, ...chosen], seed);
}
