import type { HangulCharacter, VocabularyWord } from '@hangyul-ganada/shared-types';
import { FORMS, conjugate, stemOf } from '@hangyul-ganada/korean-morphology';

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
 * One control, two rungs:
 *
 * | press | what it gives | what it costs |
 * | --- | --- | --- |
 * | **힌트 보기** | the word used in a real sentence | almost nothing |
 * | **정답 보기** | the answer | the recall is gone |
 *
 * ### Why the middle rung went
 *
 * There were three, and the first of them was a classification: *"사람과
 * 가족에 나오는 명사예요"* — it's a noun, from People & Family. It is safe, it
 * is accurate, and it is worthless, for a reason built into the questions
 * themselves: good distractors share a category with the answer *on purpose*.
 * Asked what 하다 means against *to go*, *to stay*, *to do* and *to be late*,
 * being told it is a verb from Everyday Actions rules out nothing at all. The
 * learner spent a press, read a sentence about grammar, and was exactly where
 * they started — and then had to press again to get anywhere, which is what the
 * *힌트 더 보기* stage existed for.
 *
 * So the ladder is the one rung that was doing the work, and then the answer.
 * A sentence is how a person actually recovers a word they half know; it is the
 * only help here that is neither empty nor the answer; and where the answer is
 * the Korean word rather than its meaning, the word comes out of the sentence
 * and the situation around it stays — see `exampleWithGap`.
 *
 * Category and part of speech have not been deleted from the product. They are
 * on the word card, where a learner reading about a word wants them, and they
 * are in the data that picks distractors. They are simply not offered as help
 * to somebody who is stuck.
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

/** What stands in for the word in an example the learner must not be handed. */
export const GAP = '____';

/**
 * The word's own example sentence with the word taken out of it.
 *
 * ## Why a sentence with a hole in it is the right hint
 *
 * The hint ladder is one rung of help and then the answer, and for a word
 * question the rung is the word used in a sentence — which is how a person
 * actually recovers a word they half know. That works unaltered when the answer
 * is the *meaning*: the sentence is Korean, the options are not, and reading
 * 사과를 먹어요 cannot tell you which English word to pick.
 *
 * It is the answer itself when the question runs the other way. Asked which
 * Korean word means *apple*, a learner shown 사과를 먹어요 has not been helped,
 * they have been told. So on those questions the target comes out and the
 * sentence around it — the particle, the verb, the situation — stays, which is
 * exactly the part that carries the meaning.
 *
 * ## Why this is not a string replace
 *
 * The headword is a dictionary form and the sentence is not. 만들다 appears as
 * 만들어요, 예쁘다 as 예뻐요, 돈 as 돈이 — so `example.replace(word, GAP)` finds
 * nothing for most of the corpus and, where it does find something, leaves the
 * ending behind: `____어요` still shows the stem.
 *
 * Korean is spaced between eojeol, and a word plus everything glued to it is
 * exactly one eojeol. So the unit removed is the whole eojeol that *starts*
 * with the word, one of its conjugated forms, its stem, or a prefix of its stem
 * — longest first, so 만들어요 is matched by 만들 and not by 만. Requiring the
 * eojeol to start with the needle is what stops a common syllable blanking an
 * unrelated word in the middle of the sentence.
 *
 * Returns null when no eojeol matches, and the caller then has no sentence to
 * show. Measured over the shipping corpus that is the right answer for a small
 * number of entries whose example uses a compound or a synonym rather than the
 * headword — and `hints.test.ts` pins the rate, so a change that quietly makes
 * it common fails rather than degrading the ladder in silence.
 */
export function exampleWithGap(
  example: string,
  word: string,
  /**
   * The form the sentence actually writes, where the corpus recorded one.
   *
   * `surface_form` is authored data — 쉽다's sentence says 쉬워요, and the entry
   * says so. Tried before anything derived, because a ㅂ-irregular cannot be
   * recognised from its spelling: 입다 is regular and 쉽다 is not, and the
   * conjugator is right to refuse to guess. Four adjectives in the corpus —
   * 쉽다, 춥다, 덥다, 곱다 — are exactly that case.
   */
  surface?: string | null,
): string | null {
  const stem = stemOf(word) || word;

  /*
   * Longest needle first, and the conjugated forms before the trimmed stems.
   *
   * A regular verb's stem survives inflection — 만들다 is 만들어요 — so a prefix
   * match finds it. An irregular one's does not: 듣다 becomes 들어요, 돕다
   * becomes 도와요, 모르다 becomes 몰라요, 크다 becomes 커요. Sixty-four of the
   * corpus's examples are exactly that, and no amount of prefix-trimming
   * reaches them, because the syllable that changed is the one a prefix keeps.
   *
   * `conjugate` already knows all of it — it is what the word card's own
   * conjugation table is drawn from — so the forms are asked for rather than
   * guessed at. `infinitive` is in `FORMS` and matters most: it is the stem the
   * polite ending attaches to, so it is the prefix of nearly every inflected
   * shape a teaching sentence uses.
   */
  const needles = [...(surface ? [surface] : []), word, stem];
  for (const form of FORMS) {
    const inflected = conjugate(word, form);
    if (inflected) needles.push(inflected);
  }
  for (let length = stem.length - 1; length >= Math.max(1, stem.length - 2); length -= 1) {
    needles.push(stem.slice(0, length));
  }
  /*
   * Longest first, except that the authored surface form keeps its place at the
   * head of the queue: it is the only needle that is a *fact* about this
   * sentence rather than a candidate spelling, so it wins even when something
   * derived happens to be longer.
   */
  const [first, ...derived] = needles;
  derived.sort((a, b) => b.length - a.length);
  needles.length = 0;
  needles.push(first!, ...derived);

  const parts = example.split(/(\s+)/);
  for (const needle of needles) {
    if (!needle) continue;
    const hits = parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) => !/^\s+$/.test(part) && part.startsWith(needle));
    if (hits.length === 0) continue;
    const out = [...parts];
    /*
     * Every occurrence, not the first.
     *
     * 자기's example is 자기 일은 자기가 해요 — the word twice — and blanking one
     * of them leaves the other sitting in the sentence as the answer. There is
     * no such thing as a partly removed target.
     */
    for (const { index } of hits) {
      // Trailing punctuation stays. Blanking 사과를. as a whole would take the
      // full stop with it and leave a sentence that does not end.
      const tail = out[index]!.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? '';
      out[index] = GAP + tail;
    }
    return out.join('');
  }
  return null;
}

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
/**
 * The rungs for one word question.
 *
 * `mode` decides what may be said, because what gives the answer away depends
 * entirely on which direction the question runs: the word's own sentence is
 * safe help when the learner is choosing a *meaning* and is the answer itself
 * when they are choosing the Korean word.
 *
 * There is no `answer` parameter any more. The old ladder needed one — its
 * first rung named the word's category, and a category can *be* a meaning in
 * some language: 배우다 is *học* in Vietnamese and its category renders as
 * *Học tập & Công việc*. That rung is gone. The remaining safety check happens
 * where it always ultimately did, on the finished sentence a learner would have
 * read — see `usableHints`, which the components call with the answer in hand.
 */
export function wordHints(word: VocabularyWord, mode: ExerciseMode): HintStep[] {
  const sentence = word.example;

  /*
   * The same sentence, with the word taken out, for the questions whose answer
   * *is* the word. Computed once: it is a search over the sentence, and three
   * of the six modes want it.
   */
  const gapped = sentence ? exampleWithGap(sentence, word.word, word.surface_form) : null;
  const inSentence = (text: string): HintStep => ({
    strength: 'light',
    key: 'review.hint.inSentence',
    values: { sentence: text },
  });

  switch (mode) {
    case 'read':
    case 'listenMeaning': {
      /*
       * The answer is the meaning, so the Korean sentence is safe whole.
       *
       * On `read` the learner can already see the word and the sentence adds
       * context; on `listenMeaning` it also shows the spelling, which is more
       * help and is still not the answer — the answer is in their own language
       * and this is in Korean.
       */
      const reveal: HintStep = { strength: 'answer', key: 'review.hint.reveal' };
      return sentence ? [inSentence(sentence), reveal] : [reveal];
    }

    case 'produce':
    case 'context':
    case 'build': {
      /*
       * The answer is the Korean word, so the sentence goes on the screen with
       * the word missing from it.
       *
       * `context` is a gap-fill already, and this is a *second* sentence with a
       * second gap — the word's own teaching example rather than the question's
       * frame. Two contexts for one word is how the word gets recalled.
       *
       * `build` has the syllables on screen and nothing to narrow, so a
       * sentence is the only honest help there is: it cannot say which order
       * they go in, and it can remind the learner what the word is for.
       */
      const reveal: HintStep = { strength: 'answer', key: 'review.hint.reveal' };
      return gapped ? [inSentence(gapped), reveal] : [reveal];
    }

    case 'listen': {
      /*
       * The clip is the question and the word is the answer, so the sentence
       * comes with the gap in it too.
       *
       * Where there is no sentence to gap, the first rung is an invitation to
       * hear it again — a *told* rather than a control, since the speaker is
       * already on screen and the point is that using it costs nothing.
       */
      const reveal: HintStep = { strength: 'answer', key: 'review.hint.revealWord' };
      return gapped
        ? [inSentence(gapped), reveal]
        : [{ strength: 'light', key: 'review.hint.replay' }, reveal];
    }

    case 'write':
    case 'distinguish':
      return [];
  }
}

/**
 * The rungs for one letter question. Two, like the word ladder.
 *
 * The help is a word the learner has already met that begins with this letter —
 * 가방 for ㄱ — which is the letter equivalent of a sentence: concrete, and it
 * makes them do the recovering. Printing "g" instead does the work for them,
 * which is what the very first version of this did on a question whose options
 * were `g`, `n`, `d`, `m`.
 *
 * Where the letter has no honest example — a syllable's own sound example is
 * itself, so 부's is 부 — the rung is what the question can still bear: its
 * family on a reading question, an invitation to replay on a listening one.
 * "It's a consonant" is weak, and on a question whose four options are all
 * consonants `usableHints` drops it and the ladder is the reveal alone. That is
 * the right outcome: a hint that rules nothing out is worse than no hint,
 * because it costs a press to learn nothing.
 */
export function characterHints(
  meta: HangulCharacter,
  mode: ExerciseMode,
  label: Label,
): HintStep[] {
  const example: HintStep | null =
    meta.sound_example && meta.sound_example !== meta.character
      ? {
          strength: 'light',
          key: 'review.hint.letterExample',
          values: { word: meta.sound_example },
        }
      : null;

  const family: HintStep = {
    strength: 'light',
    key: 'review.hint.letterFamily',
    values: { family: label(`learning:letterGroup.${meta.group}`) },
    // "It's a consonant" over four consonants is the letter version of the
    // category hint the word ladder just lost. See `helps`.
    about: { group: meta.group },
  };

  switch (mode) {
    case 'read':
      // The options are romanisations, so the romanisation is the answer.
      return [example ?? family, { strength: 'answer', key: 'review.hint.reveal' }];

    case 'listen':
    case 'distinguish':
      return [
        example ?? { strength: 'light', key: 'review.hint.replay' },
        { strength: 'answer', key: 'review.hint.revealLetter' },
      ];

    case 'write':
      /*
       * The answer is a shape drawn on a canvas, and the romanisation is not
       * that shape. Telling a learner the sound of the letter they are being
       * asked to write is the one place the very first hint was doing its job.
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
