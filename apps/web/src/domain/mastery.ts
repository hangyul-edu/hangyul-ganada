import type { ItemProgress, MasteryStage, PracticeMode } from '@hangyul-ganada/shared-types';
import { MASTERY_ORDER } from '@hangyul-ganada/shared-types';

import { blankProgress } from '../storage/schema';

/**
 * What it means to have learned something.
 *
 * Opening a screen is not learning. Neither is playing a sound. So a character
 * walks a ladder, and each rung is earned by doing something different:
 *
 * ```
 * unseen → introduced → written → learned
 *            ↑ met it    ↑ wrote   ↑ heard it, watched it written,
 *              and heard   it over   wrote it, and picked it out
 *              it read     a guide   of its look-alikes
 * ```
 *
 * ## Why there is no rung for writing from memory
 *
 * There used to be, and it was the last one: a blank box, no guide, produce the
 * character. It was removed from the product. A beginner who met their first
 * Korean letter ninety seconds earlier cannot recall a shape they have never
 * once recalled, and being unable to was not evidence of anything except that
 * the step came too early. Hangul handwriting is learned by writing the letter
 * correctly, with a model in front of you — not by being examined on it.
 *
 * ## Why there is no *second* writing rung either
 *
 * There was one of those too: write it over the guide, then write it again over
 * a fainter copy of the same guide. It is gone, and it was not replaced by
 * anything.
 *
 * The second attempt was never a different skill. It asked for the identical
 * movement with less ink on the paper, so the only thing it could measure was
 * whether the learner was willing to do it twice — and the answer, for someone
 * meeting forty letters, is a lesson that takes twice as long for the same
 * learning. One guided attempt is the rung. `traced` and `practised` survive as
 * *stage names* only because old profiles are written in them; nothing produces
 * a profile that stops at `traced` any more.
 *
 * ## The ladder only ever goes up
 *
 * A letter you once wrote correctly is a letter you once wrote correctly,
 * including on a day you get it wrong. That day sets `needs_review`, which is a
 * statement about now rather than a demotion. Demoting progress for a bad
 * attempt teaches learners to stop attempting.
 *
 * ## Words do not have a writing rung at all
 *
 * They used to: a word was learned by writing each of its syllables. That is
 * gone from the product — vocabulary is met, heard, understood and recognised,
 * and never handwritten. See `domain/vocabularyDay.ts` for the rungs a word walks
 * instead, and `WORD_RULES` below for why a word's completion no longer asks
 * this function about ink.
 */

export const STAGE_RANK: Record<MasteryStage, number> = MASTERY_ORDER.reduce(
  (acc, stage, index) => {
    acc[stage] = index;
    return acc;
  },
  {} as Record<MasteryStage, number>,
);

export function atLeast(stage: MasteryStage, minimum: MasteryStage): boolean {
  return STAGE_RANK[stage] >= STAGE_RANK[minimum];
}

/** Never lets a stage move backwards. The single rule the ladder depends on. */
function advance(current: MasteryStage, candidate: MasteryStage): MasteryStage {
  return STAGE_RANK[candidate] > STAGE_RANK[current] ? candidate : current;
}

export interface AttemptOutcome {
  passed: boolean;
  score: number;
  /** Which guide was on the paper. Both show the character; one is fainter. */
  mode: PracticeMode;
}

/**
 * How long until an item comes back in Review.
 *
 * Deliberately a short, legible ladder rather than a full spaced-repetition
 * scheduler. A beginner working through forty letters does not need SM-2; they
 * need the thing they just got wrong to come back soon, and the thing they have
 * written correctly four times to stop nagging them.
 */
const REVIEW_INTERVAL_DAYS = [1, 3, 7, 21] as const;

/**
 * What the schedule knows about an item besides how many times it has passed.
 *
 * Both fields are already on every progress row; nothing new is stored.
 */
export interface ReviewSignals {
  /** The score of the attempt that just passed, 0..1. */
  score?: number | null;
  /** How many times this item has ever been failed. */
  fails?: number;
}

/**
 * Confidence, from the score of the attempt that earned the interval.
 *
 * A pass that scraped the bar and a pass that was almost perfect are the same
 * event to a streak counter and are not the same event to a learner. The one
 * they barely got should come back sooner, because the next attempt is a coin
 * toss; the one they nailed should not, because asking again tomorrow is the
 * app wasting their time on something they know.
 *
 * The pass mark is 0.90, so 0.90 leaves the base interval alone, a perfect
 * trace stretches it by a bit under half, and anything below the bar cannot
 * reach here because it did not pass.
 */
function confidenceFactor(score: number | null | undefined): number {
  if (score === null || score === undefined) return 1;
  return Math.min(1.4, Math.max(0.7, 1 + (score - 0.9) * 4));
}

/**
 * How much an item's own history shortens its interval.
 *
 * An item that has been failed four times is not the same as one that has never
 * been failed, even when both have just passed twice in a row — and a fixed
 * ladder cannot tell them apart, so the hard one drifts out to three weeks
 * beside the easy one. Each past failure pulls the interval in, to a floor of
 * 40%: history informs the schedule, it does not sentence an item to being
 * asked forever.
 */
function difficultyFactor(fails: number | undefined): number {
  return Math.max(0.4, 1 / (1 + (fails ?? 0) * 0.4));
}

export function reviewIntervalDays(successStreak: number, signals: ReviewSignals = {}): number {
  const index = Math.min(successStreak, REVIEW_INTERVAL_DAYS.length - 1);
  const base = REVIEW_INTERVAL_DAYS[Math.max(0, index)]!;
  const days = base * confidenceFactor(signals.score) * difficultyFactor(signals.fails);
  // Never less than a day: an item that comes back within the same session is
  // not a review, it is the same question again.
  return Math.max(1, Math.round(days));
}

function addDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export interface CharacterMasteryRules {
  /** Whether the lesson flow can offer a recognition check for this item. */
  recognitionRequired: boolean;
  /**
   * Whether this item has a stroke-order demonstration to watch.
   *
   * True for letters and syllables. False for words, which are written out of
   * letters whose stroke order was demonstrated when those letters were taught —
   * asking a learner to watch 사과 be written before they may finish it would be
   * asking them to watch something they have already seen twice.
   */
  demoRequired: boolean;
  /**
   * Whether finishing this item requires having written it.
   *
   * True for letters and syllables, whose whole point is forming the shape.
   * **False for words**, and that is a product decision rather than a tuning
   * one: vocabulary is never handwritten anywhere in this app. A word is
   * finished by being met, heard and understood — see `domain/vocabulary.ts`.
   */
  writingRequired: boolean;
}

const DEFAULT_RULES: CharacterMasteryRules = {
  recognitionRequired: false,
  demoRequired: false,
  writingRequired: true,
};

/**
 * Whether this row has done everything its kind asks for.
 *
 * One function, called from every place that can move an item forward, so
 * "learned" cannot come to mean two different things depending on which event
 * happened last.
 */
function isComplete(row: ItemProgress, rules: CharacterMasteryRules): boolean {
  /*
   * Hearing is recorded, and it is not a gate.
   *
   * It used to be the first line of this function — `if (!row.heard) return
   * false` — and it is the reason a learner could finish ten words and be told
   * they had learned none. `heard` is set from `useEntryAudio`'s `onPlayed`,
   * which fires only when a clip *actually played*, and on the web a clip
   * played on arrival at a screen is an autoplay: every desktop browser blocks
   * it until the page has been interacted with, and some block it for the whole
   * session. So the rung was not "has the learner heard this" but "did this
   * browser let the sound out", and a learner who was never allowed to hear
   * anything could never complete anything. Nothing on any screen said so.
   *
   * What is left gates on things the learner actually did — watched the
   * demonstration, wrote it, recognised it — none of which a browser policy can
   * silently withhold. `heard` is still recorded and still feeds the review
   * scheduler; it simply no longer decides whether the work counted.
   */
  if (rules.demoRequired && !row.demo_seen) return false;
  // One guided pass, whichever guide it was written over. Which one is a
  // presentation choice the learner makes in Settings, not a second rung.
  if (rules.writingRequired && row.trace_passes + row.practice_passes === 0) return false;
  if (rules.recognitionRequired && row.recognition_passes === 0) return false;
  return true;
}

/**
 * Applies one writing attempt to a progress row.
 *
 * Pure, and takes `now` rather than reading the clock, so the review schedule
 * is testable rather than something that has to be observed for three weeks.
 */
export function applyAttempt(
  previous: ItemProgress | undefined,
  input: {
    kind: ItemProgress['kind'];
    itemKey: string;
    outcome: AttemptOutcome;
    rules?: CharacterMasteryRules;
  },
  now: Date,
): ItemProgress {
  const stamp = now.toISOString();
  const row = previous ?? blankProgress(input.kind, input.itemKey, stamp);
  const { passed, mode, score } = input.outcome;
  const rules = input.rules ?? DEFAULT_RULES;

  const trace_passes = row.trace_passes + (passed && mode === 'trace' ? 1 : 0);
  const practice_passes = row.practice_passes + (passed && mode === 'practice' ? 1 : 0);

  let stage = advance(row.stage, 'introduced');
  // One writing pass is the writing rung, whichever guide was on the paper, so
  // both modes land on the same stage. `traced` is now only ever reached by a
  // profile written before the second rung was removed.
  if (passed) stage = advance(stage, 'practised');

  const next: ItemProgress = {
    ...row,
    stage,
    attempts: row.attempts + 1,
    passes: row.passes + (passed ? 1 : 0),
    fails: row.fails + (passed ? 0 : 1),
    trace_passes,
    practice_passes,
    learned: false,
    // A failed attempt puts the item in Review; a pass takes it out. This is a
    // statement about the learner's current state, not a score.
    needs_review: !passed,
    last_score: score,
    last_attempted_at: stamp,
    learned_at: row.learned_at,
    review_due_at: passed
      ? addDays(now, reviewIntervalDays(trace_passes + practice_passes, { score, fails: row.fails }))
      : stamp,
  };

  if (isComplete(next, rules)) next.stage = advance(next.stage, 'learned');
  next.learned = next.stage === 'learned';
  if (next.learned && !next.learned_at) next.learned_at = stamp;
  return next;
}

/** Records that the learner played this item's pronunciation. */
export function applyHeard(
  previous: ItemProgress | undefined,
  input: { kind: ItemProgress['kind']; itemKey: string; rules?: CharacterMasteryRules },
  now: Date,
): ItemProgress {
  const stamp = now.toISOString();
  const row = previous ?? blankProgress(input.kind, input.itemKey, stamp);
  if (row.heard && row.stage !== 'unseen') return row;

  const next: ItemProgress = { ...row, heard: true, stage: advance(row.stage, 'introduced') };
  if (isComplete(next, input.rules ?? DEFAULT_RULES)) next.stage = advance(next.stage, 'learned');
  next.learned = next.stage === 'learned';
  if (next.learned && !next.learned_at) next.learned_at = stamp;
  return next;
}

/**
 * Records that the learner watched the character being written.
 *
 * Called when the demonstration finishes a full pass, not when the screen
 * opens: watching is a rung on the ladder and has to be earned like the others.
 */
export function applyDemoSeen(
  previous: ItemProgress | undefined,
  input: { kind: ItemProgress['kind']; itemKey: string; rules?: CharacterMasteryRules },
  now: Date,
): ItemProgress {
  const stamp = now.toISOString();
  const row = previous ?? blankProgress(input.kind, input.itemKey, stamp);
  if (row.demo_seen) return row;

  const next: ItemProgress = { ...row, demo_seen: true, stage: advance(row.stage, 'introduced') };
  if (isComplete(next, input.rules ?? DEFAULT_RULES)) next.stage = advance(next.stage, 'learned');
  next.learned = next.stage === 'learned';
  if (next.learned && !next.learned_at) next.learned_at = stamp;
  return next;
}

/** Records that the item was seen — the introduction step of a lesson. */
export function applyIntroduced(
  previous: ItemProgress | undefined,
  input: { kind: ItemProgress['kind']; itemKey: string },
  now: Date,
): ItemProgress {
  const stamp = now.toISOString();
  const row = previous ?? blankProgress(input.kind, input.itemKey, stamp);
  if (row.stage !== 'unseen') return row;
  return { ...row, stage: 'introduced', first_seen_at: row.first_seen_at ?? stamp };
}

/** Records a recognition answer — picking the character out of look-alikes. */
export function applyRecognition(
  previous: ItemProgress | undefined,
  input: {
    kind: ItemProgress['kind'];
    itemKey: string;
    correct: boolean;
    rules?: CharacterMasteryRules;
  },
  now: Date,
): ItemProgress {
  const stamp = now.toISOString();
  const row = previous ?? blankProgress(input.kind, input.itemKey, stamp);
  if (!input.correct) {
    return { ...row, needs_review: true, review_due_at: stamp, last_attempted_at: stamp };
  }

  const next: ItemProgress = {
    ...row,
    recognition_passes: row.recognition_passes + 1,
    stage: advance(row.stage, 'introduced'),
    needs_review: false,
    last_attempted_at: stamp,
  };
  if (isComplete(next, input.rules ?? DEFAULT_RULES)) next.stage = advance(next.stage, 'learned');
  next.learned = next.stage === 'learned';
  if (next.learned && !next.learned_at) next.learned_at = stamp;
  return next;
}

/**
 * What the learner still has to do for this item, in order.
 *
 * Drives both the lesson flow and the "what's left?" line under a character, so
 * the two can never tell different stories.
 */
export type MasteryRequirement = 'hear' | 'watch' | 'write' | 'recognise';

export function remainingRequirements(
  row: ItemProgress | undefined,
  rules: CharacterMasteryRules,
): MasteryRequirement[] {
  const missing: MasteryRequirement[] = [];
  if (!row?.heard) missing.push('hear');
  if (rules.demoRequired && !row?.demo_seen) missing.push('watch');
  if (rules.writingRequired && (!row || row.trace_passes + row.practice_passes === 0)) {
    missing.push('write');
  }
  if (rules.recognitionRequired && (!row || row.recognition_passes === 0)) {
    missing.push('recognise');
  }
  return missing;
}
