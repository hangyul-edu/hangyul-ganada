import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { getWord } from '../../data/vocabulary';
import type { Skill } from '../../domain/memory';
import type { ExerciseMode } from '../../domain/review';
import type { ScheduledStep, WordStep } from '../../domain/vocabularyDay';
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
 * ## Every question here is a tap
 *
 * There is no writing step and there is no code path that could produce one.
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
  /** A clip, four words. */
  listen: { mode: 'listen', skill: 'listening_recognition' },
  /** A clip, four meanings. Hearing it is not the same as understanding it. */
  listenMeaning: { mode: 'listenMeaning', skill: 'listening_recognition' },
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
};

export interface DailyQuestion {
  /** The word this asks about. */
  word: VocabularyWord;
  step: WordStep;
  /** True when answering this finishes the word for today. */
  completesWord: boolean;
  /** Absent for `intro`, which is a card rather than a question. */
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
      out.push({ word, step: 'intro', completesWord: scheduled.completesWord, exercise: null });
      continue;
    }

    const spec = STEP_EXERCISE[scheduled.step];
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
    if (!exercise) continue;

    out.push({ word, step: scheduled.step, completesWord: scheduled.completesWord, exercise });
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
  const last = new Map<string, number>();
  questions.forEach((question, index) => last.set(question.word.id, index));
  return questions.map((question, index) => ({
    ...question,
    completesWord: last.get(question.word.id) === index,
  }));
}
