import type { HangulCharacter, VocabularyWord } from '@hangyul-ganada/shared-types';

import { toSyllables } from '../../data/jamo';
import type { ExerciseMode } from '../../domain/review';

/**
 * Help that is help, not the answer.
 *
 * ## The bug this module exists to remove
 *
 * The old hint was one line of code repeated in six places: `hint: copy.value`
 * — the word's meaning. On "what does 사과 mean?", with four meanings to choose
 * between, pressing *Hint* printed **apple**. That is not a hint, it is the
 * answer, and handing it over destroys the only thing the question was for.
 * Retrieval is the exercise; a question you are told the answer to has not been
 * practised, it has been read. The same line did the same thing on the letter
 * questions, where the hint was the romanisation and the options *were*
 * romanisations.
 *
 * ## The rule
 *
 * ```
 * A hint helps a learner reason toward the answer.
 * An answer tells them what it is.
 * The first press must never be the second.
 * ```
 *
 * ## The ladder
 *
 * One control, three rungs, each stronger than the last:
 *
 * | rung     | what it gives                              | what it costs        |
 * | -------- | ------------------------------------------ | -------------------- |
 * | `light`  | the kind of thing it is — part of speech,   | almost nothing       |
 * |          | category, a replay, a sentence with the     |                      |
 * |          | target still blank                          |                      |
 * | `strong` | narrows it — the first syllable, the letter | some                  |
 * |          | a familiar word starts with                 |                      |
 * | `answer` | tells them                                  | the recall is gone   |
 *
 * The learner presses the same button; it gets stronger. Four buttons for four
 * levels of help would put more chrome on the screen than the question has, and
 * a learner who is stuck is the last person to hand a menu to.
 *
 * ## Nothing here is scored as a failure
 *
 * Asking for help is not getting it wrong, and a product that punishes the ask
 * teaches people not to ask. What changes is how much the success is worth as
 * *evidence*: unaided recall says the memory is there, recall after being told
 * the category says less, and recall after being told the answer says nothing
 * at all. `domain/memory.ts` reads the rung and weakens the evidence
 * accordingly — see `INITIAL_STABILITY` and `HINT_BASE` there, which own the
 * numbers because what a piece of evidence is worth is a property of the memory
 * model rather than of the copy on the button.
 *
 * ## Why the copy is not written here
 *
 * A rung carries a translation key and its values, never a finished sentence.
 * Ten languages need ten sentences, and a hint assembled from fragments in code
 * — "noun" + " · " + "Food & Drink" — reads like a database row in every one of
 * them. The component translates; this decides *what to say*.
 */

export type HintStrength = 'light' | 'strong' | 'answer';

export interface HintStep {
  strength: HintStrength;
  /** Key under `learning:review.hint.*`. */
  key: string;
  /**
   * Interpolation values, already in the language they belong to.
   *
   * Korean stays Korean — a first syllable is the target language and is not
   * translated. Anything in the learner's language is resolved by `label`
   * before it gets here, because this module has no `t`.
   */
  values?: Record<string, string>;
  /**
   * What this rung *asserts about the answer*, for deciding whether it helps.
   *
   * A hint has to be two things and only one of them was being checked. Safe —
   * it must not contain the answer, which `usableHints` has always enforced.
   * And **useful** — it must rule something out. "It's a verb" over four verbs
   * is perfectly safe and tells a learner nothing; they spend a rung of help
   * and are exactly where they were.
   *
   * So a rung that classifies the answer says which properties it is
   * classifying by, and `usableHints` drops it when every option on screen
   * already shares them. Rungs that are not classifications — a replay, a first
   * syllable, an example sentence — have no `about` and are never dropped on
   * these grounds, because they narrow things a property table cannot describe.
   */
  about?: Record<string, string>;
}

/** The rung a level number maps to. 0 is unaided. */
export function strengthAt(level: number): HintStrength | null {
  if (level <= 0) return null;
  if (level === 1) return 'light';
  if (level === 2) return 'strong';
  return 'answer';
}

/**
 * Whether a piece of copy hands `answer` over, read the way a learner reads it.
 *
 * Three rules, because a lexical test is only as good as its idea of "the
 * answer appears here", and the naive one — substring — is wrong in both
 * directions:
 *
 * ```
 *   "It's the first letter of 따."   ← ㄸ romanises to "tt",
 *              ▲▲                       which is inside "le**tt**er"
 *   "…로 시작해요"                    ← contains 시작, which is a taught word
 * ```
 *
 * * **Korean, more than one syllable — substring.** Korean is written without
 *   spaces between a word and its particles, so 시작 genuinely *is* given away
 *   by "…로 시작해요".
 * * **Korean, one syllable — a token on its own.** Every Korean sentence
 *   contains common syllables; only a quoted or isolated one is a giveaway.
 * * **Latin, more than one letter — a token on its own.** So "tt" no longer
 *   matches inside "letter", and a hint that actually printed "tt" still would.
 *
 * A one-letter romanisation cannot be checked this way at all — ㅏ is "a", and
 * "a" is an article in four of the ten interface languages. Those are covered
 * by reading them; there are nine.
 *
 * Exported because `wordHints` uses it to censor its own category hint and
 * `hints.test.ts` uses it to audit every hint in every language. One
 * implementation, deliberately: a second copy in the test would be a second
 * opinion about what counts as giving the answer away, and the day the two
 * disagreed the test would be certifying a rule the product does not follow.
 */
/**
 * Scripts that do not put spaces between words.
 *
 * Whole-token matching is the right test for a language that separates its
 * words and completely useless for one that does not: a Thai sentence splits
 * into one token, so `tokens.includes(answer)` is false however plainly the
 * answer is sitting in the middle of it. That is not a hypothetical — 음료수 is
 * *เครื่องดื่ม* and its category renders as *อาหารและเครื่องดื่ม*, which
 * contains the answer and was being shown as a hint.
 *
 * Korean was already handled here. Thai, Japanese, Chinese, Lao and Khmer were
 * not, and they have the same property.
 */
const UNSPACED = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u0e00-\u0eff\u1780-\u17ff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;

export function revealsAnswer(text: string, answer: string): boolean {
  /*
   * `\p{M}` is in the keep-set, and leaving it out made this function blind in
   * a third of the interface languages.
   *
   * A Bengali vowel sign is a combining mark, not a letter: টাকা is ট + া + ক +
   * া, and only the two consonants are `\p{L}`. Dropping marks *everywhere*
   * turned the needle into টক, while the token trim below drops them only at
   * the edges and turned the same word into টাক — so the two never matched and
   * the guard reported safe. 돈's category hint reads "টাকা ও কেনাকাটা-এর কিছু"
   * and the answer is টাকা; in English the identical hint was caught.
   *
   * Every abugida in the 32 is affected the same way — Bengali, Devanagari,
   * Telugu, Tamil — which is to say the leak guard was working in the scripts
   * that write their vowels as letters and nowhere else. Marks are part of the
   * word, so they stay; NFC first, so a decomposed answer still matches a
   * composed hint.
   */
  const strip = (value: string) =>
    value.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');
  const needle = strip(answer);
  if (needle.length === 0) return false;

  const tokens = text
    .normalize('NFC')
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, ''));

  if (UNSPACED.test(answer)) {
    return needle.length > 1 ? strip(text).includes(needle) : tokens.includes(needle);
  }

  /*
   * A spaced language: the answer as a whole word, or as the tail of a compound.
   *
   * The tail case is German and its relatives. 사다 is *kaufen* and its category
   * renders as *Geld und Einkaufen*; the tokens do not match and a learner
   * scanning the options for something that looks like the hint finds it
   * immediately. Four letters is the floor, which is long enough that a shared
   * ending is a shared morpheme rather than two words that happen to rhyme.
   */
  if (needle.length <= 1) return false;
  if (tokens.includes(needle)) return true;
  return needle.length >= 4 && tokens.some((token) => token !== needle && token.endsWith(needle));
}

/**
 * The ladder with any rung that gives the answer away taken out of it.
 *
 * ## Why this is not `wordHints`' job
 *
 * `wordHints` chooses *what to say* and never sees the sentence a learner
 * reads: the rungs are i18n keys, and the words around the interpolated value
 * belong to the translation. That is where the last two reveals were hiding,
 * and neither is a mistake in any translation:
 *
 * ```
 *   이렇게, meaning in de   →  "so"
 *   review.hint.inSentence  →  "So wird es benutzt: 이렇게 써 보세요."
 *                               ▲▲
 * ```
 *
 * The German is a correct rendering of "Here's how it's used", the Korean
 * sentence is safe, the answer is a real gloss, and the collision exists only
 * once the three are put together — in Spanish and Portuguese too, because
 * *así* and *assim* open the same sentence. There is nothing to fix upstream
 * except by picking lead-ins that avoid every gloss in ten languages, which is
 * not a rule anybody could keep.
 *
 * So the check moves to where the text finally exists. `render` is the
 * component's own `t` applied to a step, so what is audited is the exact string
 * the learner would have seen.
 *
 * ## What it does when it drops one
 *
 * Nothing. The rung is gone and the ladder is shorter, which is the right
 * trade: a hint that hands over the answer is worse than a missing hint, and
 * the reveal rung is never dropped, so the learner can always get out. The
 * ladder is renumbered by position, so pressing *hint* still walks it in order.
 */
export function usableHints(
  steps: HintStep[],
  render: (step: HintStep) => string,
  answer?: string,
  /**
   * The properties of every option on screen, in the same shape as `about`.
   *
   * Omitted where the caller cannot resolve them — the tile exercise has no
   * options — and then only the safety filter runs, which is the behaviour
   * this function has always had.
   */
  options?: ReadonlyArray<Record<string, string>>,
): HintStep[] {
  return steps.filter((step) => {
    if (step.strength === 'answer') return true;
    if (answer && revealsAnswer(render(step), answer)) return false;
    return helps(step, options);
  });
}

/**
 * Whether a classifying rung rules anything out, given what is on screen.
 *
 * True when at least one option differs from the answer on a property the rung
 * names. With nothing to compare against — no options passed, or the rung
 * classifies nothing — it is kept: this filter exists to remove hints that are
 * provably useless, not to remove every hint it cannot vouch for.
 */
function helps(step: HintStep, options?: ReadonlyArray<Record<string, string>>): boolean {
  if (!step.about || !options?.length) return true;
  const keys = Object.keys(step.about);
  if (keys.length === 0) return true;
  return options.some((option) =>
    keys.some((key) => option[key] !== undefined && option[key] !== step.about![key]),
  );
}

/** Localises an i18n key. The component's `t`, passed in. */
export type Label = (key: string) => string;

/**
 * The rungs for one word question.
 *
 * `mode` decides what may be said, because what gives the answer away depends
 * entirely on which direction the question runs. The meaning is a safe hint
 * when the learner is choosing a *Korean word* and is the answer itself when
 * they are choosing a meaning — the old code used it for both.
 */
export function wordHints(
  word: VocabularyWord,
  mode: ExerciseMode,
  label: Label,
  /**
   * The meaning in the learner's language, where that is the answer.
   *
   * Passed in so the hint can check itself. A category name is written in the
   * learner's language and a meaning is too, so the two can collide — and they
   * do: 배우다 is *học* in Vietnamese and its category is *Học tập & Công việc*,
   * so a Vietnamese learner asked what 배우다 means was being handed the answer
   * by a hint that is perfectly safe in the other nine languages. Nothing about
   * the word, the category or the English could have predicted it.
   */
  answer?: string,
): HintStep[] {
  const pos = label(`vocabulary:partOfSpeech.${word.part_of_speech}`);
  const category = label(`vocabulary:categories.${word.category}`);
  /*
   * The category, unless naming it gives the meaning away in this language.
   *
   * Falls back to the part of speech alone, which is weaker help and is still
   * help. The alternative — renaming the category — would be fixing a correct
   * translation to work around a collision with one word out of 2,581.
   */
  const kind: HintStep =
    answer && revealsAnswer(category, answer)
      ? {
          strength: 'light',
          key: 'review.hint.kindOnly',
          values: { pos },
          about: { pos: word.part_of_speech },
        }
      : {
          strength: 'light',
          key: 'review.hint.kind',
          values: { pos, category },
          about: { pos: word.part_of_speech, category: word.category },
        };

  /*
   * The first syllable, but only when there is a second one to withhold.
   *
   * 사과 → "사…" leaves real work: three of the four options start elsewhere,
   * and the learner still has to know which fruit. 물 → "물…" *is* 물. A
   * one-syllable word therefore gets the initial letter of its romanisation
   * instead, which narrows without spelling it.
   */
  const syllables = toSyllables(word.word);
  const opening: HintStep =
    syllables.length > 1
      ? { strength: 'strong', key: 'review.hint.startsWith', values: { start: syllables[0]! } }
      : {
          strength: 'strong',
          key: 'review.hint.startsWithSound',
          values: { sound: word.romanization.slice(0, 1) },
        };

  const reveal: HintStep = { strength: 'answer', key: 'review.hint.reveal' };

  switch (mode) {
    case 'read':
    case 'listenMeaning':
      /*
       * The answer is the meaning, so nothing here may be the meaning.
       *
       * The first rung says what kind of thing it is. That is genuinely weak,
       * and deliberately so — but it is weaker than it looks, because good
       * distractors share a category with the answer on purpose. Asked what
       * 하다 means against *to go*, *to stay*, *to do* and *to be late*, being
       * told it is a verb from Everyday Actions rules nothing out. That is not
       * a bug in the hint; it is what a plausible distractor set costs, and it
       * is why there is a second rung.
       *
       * The second rung is the word in a sentence. Context is how a person
       * actually works out a word they half-know, it is the only help here that
       * is not either useless or the answer, and it cannot leak: the sentence
       * is Korean and the answer is not. On `read` the learner can already see
       * the word, so the sentence adds only context; on `listenMeaning` it also
       * shows the spelling, which is why it is the strong rung and not the
       * light one.
       */
      return word.example
        ? [kind, { strength: 'strong', key: 'review.hint.inSentence', values: { sentence: word.example } }, reveal]
        : [kind, reveal];

    case 'produce':
      // The meaning is the prompt and the Korean is the answer, so the word's
      // own opening is exactly the right narrowing hint.
      return [kind, opening, reveal];

    case 'listen':
      /*
       * The clip is the question. The honest first help is to hear it again —
       * the learner is being asked to catch a sound, and more of the sound is
       * more of the question, not less of it.
       *
       * `review.hint.replay` is a *told*, not a control: the speaker is already
       * on screen and the point is to say that using it is allowed and costs
       * nothing much. §36's accessibility fallback is the third rung, which
       * shows the word and is marked as a reveal.
       */
      return [
        { strength: 'light', key: 'review.hint.replay' },
        opening,
        { strength: 'answer', key: 'review.hint.revealWord' },
      ];

    case 'context':
      /*
       * A gap-fill. The sentence's meaning is the help; the target's meaning is
       * the answer, so the translation is shown with the gap still in it.
       *
       * That is the whole distinction §3.5 draws, and it is worth stating
       * because the two are one field apart in the data: `example_translation`
       * is safe, the word's own `meaning` is not.
       */
      return [
        {
          strength: 'light',
          key: 'review.hint.kindOnly',
          values: { pos },
          about: { pos: word.part_of_speech },
        },
        opening,
        reveal,
      ];

    case 'build':
      /*
       * The tiles are already on screen, so there is nothing to narrow.
       *
       * A hint here can only be about *order* — and the only order hint that is
       * not the answer is which syllable comes first, which for a two-syllable
       * word is half the answer and for a three-syllable word is most of it. So
       * the ladder is the kind of word, and then the reveal.
       */
      return [kind, reveal];

    case 'write':
    case 'distinguish':
      return [];
  }
}

/** The rungs for one letter question. */
export function characterHints(
  meta: HangulCharacter,
  mode: ExerciseMode,
  label: Label,
): HintStep[] {
  const family: HintStep = {
    strength: 'light',
    key: 'review.hint.letterFamily',
    values: { family: label(`learning:letterGroup.${meta.group}`) },
    // "It's a consonant" over four consonants is the letter version of the same
    // empty hint. See `helps`.
    about: { group: meta.group },
  };

  /*
   * A word the learner has met that begins with this letter.
   *
   * The strong rung for every letter question, and the reason it is strong
   * rather than an answer: 가방 contains ㄱ, so a learner who reads it can
   * recover the sound — but recovering it is the exercise, and they have to do
   * the recovering. Printing "g" does the work for them, which is what the old
   * hint did on the very question whose options were `g`, `n`, `d`, `m`.
   */
  /*
   * Absent where the example *is* the item.
   *
   * A syllable's own sound example is itself — 부's is 부 — so "it's the first
   * letter of 부" on a question about 부 is a sentence that says nothing, on the
   * screen where the learner has just admitted they are stuck. Where there is
   * no honest example the ladder is one rung shorter, which is better than a
   * rung that wastes a press.
   */
  const example: HintStep | null =
    meta.sound_example && meta.sound_example !== meta.character
      ? {
          strength: 'strong',
          key: 'review.hint.letterExample',
          values: { word: meta.sound_example },
        }
      : null;

  switch (mode) {
    case 'read':
      // The options are romanisations, so the romanisation is the answer.
      return [family, ...(example ? [example] : []), { strength: 'answer', key: 'review.hint.reveal' }];

    case 'listen':
    case 'distinguish':
      return [
        { strength: 'light', key: 'review.hint.replay' },
        ...(example ? [example] : []),
        { strength: 'answer', key: 'review.hint.revealLetter' },
      ];

    case 'write':
      /*
       * The answer is a shape drawn on a canvas, and the romanisation is not
       * that shape. Telling a learner the sound of the letter they are being
       * asked to write is the one place the old hint was doing its job, and it
       * stays — as the light rung, because it genuinely does not give the
       * stroke order away.
       */
      return [
        { strength: 'light', key: 'review.hint.letterSound', values: { sound: meta.romanization } },
        { strength: 'answer', key: 'review.hint.revealStrokes' },
      ];

    case 'produce':
    case 'listenMeaning':
    case 'context':
    case 'build':
      return [];
  }
}
