import { createContext, useContext } from 'react';
import type {
  ItemProgress,
  LearnerPreferences,
  ProgressSummary,
  SessionKind,
} from '@hangyul-ganada/shared-types';

import type { PracticePlan } from '../domain/plan';
import type { Mistake } from '../domain/mistakes';
import type { ExerciseMode } from '../domain/review';
import type { ReviewSummary, TodaysPractice } from '../domain/review';
import type { DailyPlan, DayProgress } from '../domain/vocabularyDay';
import type { LevelTestResult } from '../domain/levelTestTypes';
import type { LearnerState, RecordAttemptInput, RecordReviewInput } from './types';

export interface LearnerContextValue {
  state: LearnerState;
  /** False until the stored profile has been read. */
  ready: boolean;
  summary: ProgressSummary;
  /** Letters the learner has met. Drives which words are offered. */
  knownLetters: ReadonlySet<string>;
  setPreferences: (patch: Partial<LearnerPreferences>) => void;
  /**
   * Stores a finished Vocabulary Level Test result.
   *
   * Its own action rather than a `setPreferences` patch, because a level is not
   * a preference and because the separation is the point: this writes one field
   * on the settings row and touches nothing in progress, memory, sessions or
   * the streak. A learner who sits the test five times has changed nothing
   * about what the app will teach them next.
   */
  saveLevelTestResult: (result: LevelTestResult) => void;
  startSession: (kind: SessionKind, lessonId: string | null, targetCount: number) => string;
  completeSession: (sessionId: string) => void;
  recordAttempt: (input: RecordAttemptInput) => void;
  /** Records that the learner played this item's pronunciation. */
  recordHeard: (kind: ItemProgress['kind'], itemKey: string, recognitionRequired?: boolean) => void;
  /** Measured foreground study time, in milliseconds. See `useStudyClock`. */
  recordStudyTime: (ms: number) => void;
  /** Records that the item's introduction step was shown. */
  /** The learner watched this character being written, all the way through. */
  recordDemoSeen: (
    kind: ItemProgress['kind'],
    itemKey: string,
    recognitionRequired?: boolean,
  ) => void;
  recordIntroduced: (kind: ItemProgress['kind'], itemKey: string) => void;
  /** Records a recognition answer — picking the character out of look-alikes. */
  recordRecognition: (kind: ItemProgress['kind'], itemKey: string, correct: boolean) => void;
  progressFor: (kind: ItemProgress['kind'], itemKey: string) => ItemProgress | undefined;
  /**
   * Folds one review exercise into the learner's memory of an item.
   *
   * Separate from `recordAttempt`, which moves the *mastery* ladder. A review
   * changes how well something is remembered and must never change whether it
   * was learned — see section 55 of the brief, and `domain/memory.ts`.
   */
  recordReview: (input: RecordReviewInput) => void;
  /** Bookmarks or un-bookmarks a word. */
  toggleSaved: (kind: ItemProgress['kind'], itemKey: string) => void;
  isSaved: (kind: ItemProgress['kind'], itemKey: string) => boolean;
  /** The counts the Review screen shows. */
  reviewSummary: ReviewSummary;
  /** The plan the home screen offers for today. */
  practice: TodaysPractice;
  /**
   * The one resolved review plan a screen may show and a session may run.
   *
   * Resolving, rather than counting. Every item in the returned plan has
   * already been proved to produce a question, so a screen that prints
   * `plan.count` and a session that runs `plan.items` cannot disagree — which
   * is the bug this replaced. See `domain/plan.ts`.
   */
  practicePlan: (options?: {
    mode?: ExerciseMode;
    savedOnly?: boolean;
    mistakesOnly?: boolean;
  }) => PracticePlan;
  /**
   * The wrong-answer notebook: unresolved mistakes, most recent first.
   *
   * Collected automatically from every answer — §35, the learner never saves
   * one — and filtered to the ones still going wrong. See `domain/mistakes.ts`
   * for why a fixed mistake stops appearing here without being forgotten.
   */
  mistakes: Mistake[];
  /** Removes one notebook entry. The learner saying "I am done with this". */
  clearMistake: (id: string) => void;
  /**
   * Today's vocabulary plan, created on first read and then persisted.
   *
   * Idempotent within a day: reading it twice returns the same plan, and a
   * learner who left at 4 / 10 finds 4 / 10 and the same remaining words.
   */
  vocabularyDay: DailyPlan;
  vocabularyProgressToday: DayProgress;
  /** Records that a word finished every step today's plan scheduled for it. */
  completeDailyWord: (wordId: string) => void;
  /** Throws today's plan away and builds the next one. The optional top-up. */
  /** Adds `extra` words to today without changing the goal or what is done. */
  extendVocabularyDay: (extra: number) => void;
  reset: () => Promise<void>;
}

/**
 * Kept in its own module so `LearnerProvider.tsx` exports only a component.
 * A file that exports both a component and a hook opts out of React Fast
 * Refresh, which means every edit to the store reloads the whole app and drops
 * whatever the learner had drawn.
 */
export const LearnerContext = createContext<LearnerContextValue | null>(null);

export function useLearner(): LearnerContextValue {
  const ctx = useContext(LearnerContext);
  if (!ctx) throw new Error('useLearner must be used inside <LearnerProvider>');
  return ctx;
}
