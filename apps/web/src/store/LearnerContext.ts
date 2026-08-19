import { createContext, useContext } from 'react';
import type {
  ItemProgress,
  LearnerPreferences,
  ProgressSummary,
  SessionKind,
} from '@hangyul-ganada/shared-types';

import type { ReviewSummary, TodaysPractice } from '../domain/review';
import type { LearnerState, RecordAttemptInput, RecordReviewInput } from './types';

export interface LearnerContextValue {
  state: LearnerState;
  /** False until the stored profile has been read. */
  ready: boolean;
  summary: ProgressSummary;
  /** Letters the learner has met. Drives which words are offered. */
  knownLetters: ReadonlySet<string>;
  setPreferences: (patch: Partial<LearnerPreferences>) => void;
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
