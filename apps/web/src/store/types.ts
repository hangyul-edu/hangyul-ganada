import type {
  AttemptScore,
  DailyActivity,
  ItemProgress,
  LearningSession,
  PracticeMode,
  SessionKind,
} from '@hangyul-ganada/shared-types';

import type { MemoryMap, Skill } from '../domain/memory';
import type { MistakeMap } from '../domain/mistakes';
import type { ExerciseMode } from '../domain/review';
import type { AttemptRecord } from '../storage/repositories';
import type { StoredSettings } from '../storage/schema';

/** Everything Hangyul ganada knows about the learner, in memory. */
export interface LearnerState {
  settings: StoredSettings;
  /** Keyed by `${kind}:${item_key}`. */
  progress: Record<string, ItemProgress>;
  sessions: LearningSession[];
  /** Daily learning roll-ups, keyed by `YYYY-MM-DD`. Feeds the Activity screen. */
  activity: Record<string, DailyActivity>;
  schema_version: number;
  /**
   * Which engine the data is in, and whether it is actually keeping anything.
   *
   * `durable` is not the driver's own claim — it is the result of a real
   * write/read/erase round trip made against that driver on launch. See
   * `storage/capability.ts`. `checked` is false until that round trip has
   * finished, and nothing may warn the learner about their progress before it
   * has: the pre-hydration placeholder is an in-memory store, so a screen that
   * reads `durable` too early sees `false` on a perfectly healthy install.
   */
  storage: { engine: string; durable: boolean; checked: boolean };
  /** Rows dropped on load because they were unreadable. Surfaced in Settings. */
  recovered: number;
  /** Per-item, per-skill memory. Keyed by `${kind}:${item_key}`. */
  memory: MemoryMap;
  /** Recent review exercises, oldest first. Bounded; see `AttemptRepository`. */
  attempts: AttemptRecord[];
  /**
   * The wrong-answer notebook, keyed by `${kind}:${item_key}`.
   *
   * One row per item ever missed, recovered rows included — the notebook screen
   * filters them out, and the scheduler needs the history to know which items
   * this learner finds genuinely hard. See `domain/mistakes.ts`.
   */
  mistakes: MistakeMap;
}

export interface RecordAttemptInput {
  kind: ItemProgress['kind'];
  item_key: string;
  session_id: string | null;
  mode: PracticeMode;
  font_id: string;
  evaluator_id: string;
  result: AttemptScore;
  /** True when the lesson flow includes a recognition check for this item. */
  recognition_required?: boolean;
  /** True when the attempt was made inside a review session. */
  review?: boolean;
}

/** One review exercise, as the session screen reports it. */
export interface RecordReviewInput {
  kind: ItemProgress['kind'];
  item_key: string;
  skill: Skill;
  mode: ExerciseMode;
  passed: boolean;
  /** 0..1. The evaluator score for writing; 1 or 0 for a choice. */
  score: number;
  hint_used?: boolean;
  response_ms?: number;
  /** What was chosen instead, for a wrong multiple-choice answer. */
  confused_with?: string;
  /** True when this item had already been failed earlier in the sitting. */
  recovery?: boolean;
  session_id?: string | null;
}

export type { SessionKind };
