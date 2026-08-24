import raw from './generated/cloze.json';

/**
 * The gap-fill questions, decided at build time and read here.
 *
 * ## Why the browser stopped building these
 *
 * It built them badly, and it built them differently from the Level Test, so
 * the same defects had to be found and fixed twice. Three things were wrong at
 * once in the runtime version, all of them visible on a real device:
 *
 * **The blank did not match the options.** `splitSentence` looked for the
 * headword's stem inside the sentence, so 만들다 in 빵을 만들어요 blanked only
 * 만들 and left 어요 on the screen — and then offered 만들다, 사다, 가다 and
 * 있다 as the four choices. The learner was asked to put a dictionary form into
 * a slot that needed a stem, and three of the four could not be put anywhere.
 *
 * **Nothing knew about the particle.** ____가 있어요 with 돈 among the options
 * needs 돈이, and no code on this path had anything to say about that.
 *
 * **Nothing knew what the words were.** ___을 안 마셔요 offered 여자, so the
 * sentence a learner could compose was 여자를 안 마셔요.
 *
 * All three were already solved in `scripts/content/build_level_test.mjs`,
 * which conjugates every option into the answer's own form, checks the
 * particle, refuses a person noun in an object slot that would read badly, and
 * refuses the frame outright when more than one option could be right. So that
 * builder now writes its work out and this reads it. One place decides what a
 * valid gap-fill is.
 *
 * ## What a missing entry means
 *
 * That the word's sentence did not survive the rules — most often because the
 * frame accepts too many answers. There are 2,844 taught words and a few
 * hundred entries here, and that ratio is the point: a good teaching example is
 * not automatically a good question, and the session simply asks something else
 * about that word.
 */
export interface Cloze {
  /** The sentence before the gap. */
  before: string;
  /** The answer, in the exact surface form the sentence needs. */
  target: string;
  /** The sentence after the gap. */
  after: string;
  /** Which conjugated form the gap takes, or `noun`. */
  form: string;
  /** Four options, each already in that same form. */
  options: { id: string; surface: string }[];
}

const WORDS = (raw as { words: Record<string, Cloze> }).words;

/** The validated gap-fill for a word, or nothing if it has none. */
export function clozeFor(wordId: string): Cloze | undefined {
  return WORDS[wordId];
}

/** How many taught words can be asked this way. For QA and the report. */
export function clozeCount(): number {
  return Object.keys(WORDS).length;
}
