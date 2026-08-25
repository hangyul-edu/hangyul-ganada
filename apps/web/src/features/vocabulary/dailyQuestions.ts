import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { getWord } from '../../data/vocabulary';
import type { Skill } from '../../domain/memory';
import type { ExerciseMode } from '../../domain/review';
import { MIN_MATCH_SIZE, type ScheduledStep, type WordStep } from '../../domain/vocabularyDay';
import { buildExercise, type Exercise, type MeaningOf } from '../review/exercises';
import type { Label } from '../review/hints';

/**
 * Turning today's plan into the questions on the screen.
 *
 * `domain/vocabularyDay.ts` decides *which* words and *in what order*; this
 * decides what each of its steps looks like. The split is the same one the
 * review side already has, and for the same reason: the scheduling rules are
 * pure and testable without a renderer, and the rendering rules need a corpus
 * and a language.
 *
 * ## Every question here is a tap, and none of them is a clip
 *
 * There is no writing step and there is no code path that could produce one.
 * The same is now true of listening: `WordStep` has no `listen` or
 * `listenMeaning` member, so the table below cannot name one and this function
 * cannot build one. The audio a word carries is still played — by `intro`, by
 * Word Detail, by the example sentence — it is simply never the question.
 *
 * `buildExercise` refuses to build a `write` question for a word at all, and
 * nothing below asks it for one — the two together are what §35 means by
 * "search the complete application": the exercise cannot be constructed, so it
 * cannot appear from any route.
 *
 * ## Skills, and why the daily session records them
 *
 * A daily question is a review exercise that happens to have been scheduled by
 * the calendar rather than by the forgetting curve. Recording it against the
 * same per-skill memory is what lets tomorrow's plan know that today's 엄마 went
 * well — without it the two systems would each keep half a picture and the
 * "weak words" the plan promises to include would never be identified.
 */

/** What each step tests, and how it is asked. */
const STEP_EXERCISE: Record<Exclude<WordStep, 'intro'>, { mode: ExerciseMode; skill: Skill }> = {
  /** Korean shown, meaning chosen. The easiest check, and the first. */
  meaning: { mode: 'read', skill: 'meaning_recognition' },
  /** A meaning, four Korean words. The same skill, from the harder side. */
  produce: { mode: 'produce', skill: 'meaning_recognition' },
  /** The word's own sentence with a gap in it. */
  context: { mode: 'context', skill: 'sentence_comprehension' },
  /**
   * Assembled from its own syllables.
   *
   * Recorded against `meaning_recognition`, the same skill as `produce`, and
   * for the same reason: it is that skill asked from the hardest side. Giving
   * it a skill of its own would split one memory in two and make a word look
   * weaker than it is because the learner has met it in only one of them.
   */
  build: { mode: 'build', skill: 'meaning_recognition' },
  /**
   * Four words and four meanings, paired.
   *
   * `meaning_recognition` again, and it belongs there: pairing a word with its
   * meaning is the same knowledge `meaning` and `produce` ask for, with the
   * pressure that every choice narrows the others. A skill of its own would
   * split one memory three ways and make a word look weaker for having been
   * met in more forms.
   *
   * The `mode` is unused — a grid is not a `buildExercise` question and does
   * not go through it — and is set to the mode it is closest to rather than to
   * a placeholder, so nothing downstream that switches on mode is handed a
   * value it has no branch for.
   */
  match: { mode: 'read', skill: 'meaning_recognition' },
};

/** One row of a matching grid. */
export interface MatchPair {
  wordId: string;
  korean: string;
  meaning: string;
  meaningLocale: string;
}

export interface DailyQuestion {
  /** The word this asks about. For a `match` grid, the first of its words. */
  word: VocabularyWord;
  step: WordStep;
  /** True when answering this finishes `word` for today. */
  completesWord: boolean;
  /**
   * Every word this question finishes today.
   *
   * `[word.id]` or `[]` for a single-word step, and up to four ids for a
   * matching grid. The session credits from this rather than from
   * `completesWord`, which is what keeps a grid that finishes three words from
   * moving the day's counter by one — or by four.
   */
  completes: string[];
  /** The pairs to lay out. Only for `match`. */
  pairs?: MatchPair[];
  /** Absent for `intro` and `match`, neither of which is a `buildExercise`. */
  exercise: Exercise | null;
}

/**
 * Builds every question in the plan, dropping the ones that cannot be asked.
 *
 * A step is dropped when the corpus cannot support it — a word with no example
 * has no gap-fill, a gap-fill whose distractors would all fit is not a
 * question. Dropping happens *here*, before the session starts, so the session
 * never has to skip a question mid-flight and the counter never has to change
 * under the learner. This is the same discipline `domain/plan.ts` applies to
 * review, and it exists for the same reason: a screen may only promise a number
 * it has already resolved.
 *
 * A word whose every question is dropped keeps its `intro`, which is still
 * worth doing — meeting a word is the teaching — and still counts for the day.
 */
export function buildDailyQuestions(
  steps: readonly ScheduledStep[],
  meaningOf: MeaningOf,
  label: Label = (key) => key,
): DailyQuestion[] {
  const out: DailyQuestion[] = [];

  for (const [index, scheduled] of steps.entries()) {
    const word = getWord(scheduled.wordId);
    if (!word) continue;

    if (scheduled.step === 'intro') {
      out.push({
        word,
        step: 'intro',
        completesWord: scheduled.completesWord,
        completes: scheduled.completes,
        exercise: null,
      });
      continue;
    }

    if (scheduled.step === 'match') {
      /*
       * A grid is only as good as the meanings in it.
       *
       * A word whose meaning the current language pack cannot supply is left
       * out rather than shown with an English one beside three translated ones,
       * and if that takes the grid under `MIN_MATCH_SIZE` the whole question is
       * dropped. `repairCompletion` then re-credits the words that were in it,
       * so nothing is lost from the day's count — the learner simply does not
       * meet a matching puzzle with two rows in it.
       */
      const members = (scheduled.group ?? [word.id])
        .map((id) => getWord(id))
        .filter((member): member is VocabularyWord => Boolean(member));
      /*
        One language in the grid, not just one meaning per row.

        Dropping a member with *no* meaning was half the rule. The other half is
        that a member whose meaning resolved through a different fallback than
        the rest puts one English row beside three Tamil ones — the same
        mixed-language question §6 is about, in a shape that is easier to miss
        because every individual row looks fine. The taught word sets the
        language and the rest of the grid has to match it.
      */
      const gridLocale = meaningOf(word).locale;
      const pairs: MatchPair[] = [];
      for (const member of members) {
        const copy = meaningOf(member);
        if (!copy.value || copy.locale !== gridLocale) continue;
        pairs.push({
          wordId: member.id,
          korean: member.word,
          meaning: copy.value,
          meaningLocale: copy.locale,
        });
      }
      if (pairs.length < MIN_MATCH_SIZE) continue;
      out.push({
        word,
        step: 'match',
        completesWord: scheduled.completesWord,
        completes: scheduled.completes.filter((id) => pairs.some((pair) => pair.wordId === id)),
        pairs,
        exercise: null,
      });
      continue;
    }

    /*
     * The step that was planned, or spelling, or nothing.
     *
     * A word can fail to produce its planned question for two quite different
     * reasons, and only one of them is a reason to say nothing about the word.
     *
     * The corpus reason: 빵을 ___어요 has no valid gap-fill, because more than
     * one of its options fits the frame. That word genuinely cannot be asked
     * *that* way and the frame is refused at build time — see `data/cloze.ts`.
     *
     * The **language** reason, which is the one this fallback is for: a learner
     * whose interface is Hindi has meanings for a hundred of the 2,916 taught
     * words, `strictMeaning` correctly refuses to mix languages in one question,
     * and so `meaning`, `produce` and `match` cannot be built for the other
     * 2,816. Combined with a gap-fill the corpus also refused, a level-1 sitting
     * in Hindi came out as **ten introduction cards and no questions at all** —
     * the session-complete card said *0 शब्द सीखा*, zero words learned, which is
     * exactly what had happened.
     *
     * `build` is the answer, and it is a better one than a patch. Assembling
     * 학교 from 학, 교 and two decoy syllables needs no translation, no example
     * sentence and no distractor pool: it is a question about Korean spelling,
     * asked in Korean, and the twenty-two partial locales can have it today
     * rather than when their packs are written. It is already one of the steps
     * a familiar word owes, so nothing new is introduced — it is offered
     * earlier, to the learners who would otherwise be asked nothing.
     *
     * Order matters. The planned step is tried first and always wins, so no
     * learner in a complete language sees a different sitting because of this.
     */
    /*
     * The planned step, then every other askable shape, in a fixed order.
     *
     * The chain used to be *planned step, then `build`, then nothing*, and the
     * gap mattered for retries: a retry step is chosen by preference rather
     * than from the plan, so it can name an exercise this word cannot support
     * — a `context` for a word whose sentence has no valid gap-fill — and with
     * only `build` behind it, a one-syllable word fell through both and the
     * question was silently dropped. A dropped retry is a word that stays owed
     * with nothing left to ask, which is the stuck-at-9/10 class. Any word
     * that was ever asked has at least one buildable shape, and this chain
     * reaches it.
     */
    const candidates: Exclude<WordStep, 'intro' | 'match'>[] = [];
    for (const step of [scheduled.step, 'build', 'meaning', 'produce', 'context'] as const) {
      if (!candidates.includes(step)) candidates.push(step);
    }

    let built: { step: Exclude<WordStep, 'intro' | 'match'>; exercise: Exercise } | null = null;
    for (const step of candidates) {
      const spec = STEP_EXERCISE[step];
      const exercise = buildExercise(
        {
          kind: 'word',
          itemKey: word.id,
          skill: spec.skill,
          mode: spec.mode,
          // The daily session is not the scheduler, and these fields are the
          // scheduler's reasoning. They are filled with neutral values rather
          // than invented ones: nothing downstream reads them for a daily
          // question, and a fabricated priority would be a number that looked
          // like evidence.
          priority: 0,
          recall: 0,
          partner: null,
          intervene: false,
          need: 'due',
        },
        meaningOf,
        // The position, so a learner who leaves and returns gets the options in
        // the same places. A reshuffle on resume makes progress unreadable.
        index + 1,
        label,
      );
      if (exercise) {
        built = { step, exercise };
        break;
      }
    }
    if (!built) continue;

    out.push({
      word,
      step: built.step,
      completesWord: scheduled.completesWord,
      completes: scheduled.completes,
      exercise: built.exercise,
    });
  }

  return repairCompletion(out);
}

/**
 * Re-marks which question finishes each word, after any were dropped.
 *
 * `completesWord` was decided by the scheduler against the steps it planned. If
 * a word's last step turned out to be unaskable, the flag would sit on a
 * question that is no longer in the list and the word would never be counted —
 * a learner would answer everything and watch the day's counter stay at 4 / 10.
 *
 * So the flag is recomputed from what actually survived: the last surviving
 * question for each word completes it.
 */
function repairCompletion(questions: DailyQuestion[]): DailyQuestion[] {
  /*
   * Every word each question touches, which for a grid is all four of them.
   *
   * Taken from the pairs rather than from `completes`, because the question is
   * "where was this word last asked about", and a grid asks about a word
   * whether or not it is the step that finishes it.
   */
  const touches = (question: DailyQuestion): string[] =>
    question.pairs ? question.pairs.map((pair) => pair.wordId) : [question.word.id];

  const last = new Map<string, number>();
  questions.forEach((question, index) => {
    for (const id of touches(question)) last.set(id, index);
  });

  return questions.map((question, index) => {
    const completes = touches(question).filter((id) => last.get(id) === index);
    return { ...question, completes, completesWord: completes.includes(question.word.id) };
  });
}

/**
 * The word ids pressing Continue on this screen credits to the day.
 *
 * The one place the crediting rule is written, read by both `advance` (which
 * does the crediting) and `isLast` (which predicts it for the button label), so
 * the two can never disagree about whether the session is over.
 *
 * - A question credits the words it completes **that were answered correctly**
 *   — per word, because a matching grid answers about four at once and can be
 *   right about three of them.
 * - An introduction credits whatever `completes` carries. For a word with any
 *   askable question that is nothing (§26 — viewing is not learning). For a
 *   word with none — a partial-locale learner meeting a one-syllable word the
 *   pack has no meaning for — `repairCompletion` makes the intro the word's
 *   whole obligation, and refusing to credit it would leave the day stuck one
 *   short with nothing left to answer.
 */
export function creditsFor(
  question: DailyQuestion | undefined,
  answered: { correct: readonly string[]; wrong: readonly string[] } | null,
): string[] {
  if (!question) return [];
  if (question.step === 'intro') return [...question.completes];
  if (!answered) return [];
  return question.completes.filter((id) => answered.correct.includes(id));
}

/**
 * Whether the daily session can ask this word anything **in this language**.
 *
 * `canAsk` on the review side deliberately uses a stub meaning, because review
 * answerability is structural. The daily session is not so lucky: a partial
 * locale has meanings for its core band only, `strictMeaning` correctly
 * refuses the rest, and a *review* word — one with no introduction left to
 * credit it — that also has no gap-fill and cannot be assembled (one syllable,
 * or five) has no question at all. Scheduled anyway, it stays owed forever and
 * the learner's day sticks at 9/10 with nothing left to answer. The plan
 * builder threads this probe through `DayRequest.canPractise` so such a word
 * is simply not scheduled for consolidation today.
 *
 * It probes with the very builder the session uses, so it cannot drift from
 * what the session can actually show.
 */
export function canPractise(word: VocabularyWord, meaningOf: MeaningOf): boolean {
  for (const step of ['meaning', 'context', 'build'] as const) {
    const spec = STEP_EXERCISE[step];
    const exercise = buildExercise(
      {
        kind: 'word',
        itemKey: word.id,
        skill: spec.skill,
        mode: spec.mode,
        priority: 0,
        recall: 0,
        partner: null,
        intervene: false,
        need: 'due',
      },
      meaningOf,
      1,
    );
    if (exercise) return true;
  }
  return false;
}
