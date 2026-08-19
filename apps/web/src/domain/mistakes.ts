import type { ItemProgress } from '@hangyul-ganada/shared-types';

import type { Skill } from './memory';
import { memoryKey } from './memory';
import type { ExerciseMode } from './review';

/**
 * The wrong-answer notebook: what the learner actually got wrong.
 *
 * ## Why this is not the review scheduler, and not saved words
 *
 * Three things that look alike from a distance and answer different questions,
 * and the product keeps them apart on purpose (§41):
 *
 * | | Whose decision | What it means |
 * | --- | --- | --- |
 * | **Saved word** | the learner's | *I want to keep this* |
 * | **Review** | the system's | *this is fading and needs reinforcing* |
 * | **Mistake** | neither — it is a *fact* | *I answered this wrong* |
 *
 * A mistake is the only one of the three that is a record of something that
 * happened. The scheduler already reads it — a lapse shortens an interval — but
 * a learner cannot open the scheduler and ask "what did I get wrong?", and that
 * is a question people genuinely have and act on. So it is kept as a list they
 * can read, in their own terms, rather than only as a number inside a model.
 *
 * ## One row per item, not one per wrong answer
 *
 * Missing 엄마 three times is one thing to fix, not three things to read. The
 * row therefore accumulates: `wrongCount` goes up, `lastAt` moves, and the
 * *most recent* question is what the notebook shows, because that is the one
 * the learner remembers being surprised by.
 *
 * Storing every attempt separately was the alternative and it produces a
 * notebook that is longest for the learner having the hardest time — a list of
 * forty rows, thirty of which are the same five words.
 *
 * ## Mistakes are meant to be finished with
 *
 * §39: a wrong answer is not a permanent mark. Answer the item correctly
 * `RECOVERY_STREAK` times and it leaves the active list. The row is kept —
 * "what I used to get wrong" is worth being able to look at, and the count of
 * how often it happened is what makes the scheduler treat the item as
 * genuinely difficult — but it stops occupying the screen that exists for
 * things still going wrong.
 */

export interface Mistake {
  /** `${kind}:${itemKey}` — the same key the memory model uses. */
  id: string;
  kind: ItemProgress['kind'];
  itemKey: string;
  /** How it was asked the last time it was missed. */
  mode: ExerciseMode;
  skill: Skill;
  /**
   * What the learner picked instead, where the exercise had options.
   *
   * The id of the wrong choice, not its text: the text is a translation and
   * would be stale in the notebook the moment the interface language changed.
   */
  chose: string | null;
  /** The id of the right answer, for the same reason. */
  answer: string;
  firstAt: string;
  lastAt: string;
  /** How many times this item has been answered wrong, ever. */
  wrongCount: number;
  /**
   * Correct answers in a row since the last mistake.
   *
   * The recovery counter, and it resets to zero on every new mistake. See
   * `RECOVERY_STREAK`.
   */
  correctSince: number;
}

/**
 * Corrects in a row before a mistake is considered fixed.
 *
 * Two, not one. One correct answer straight after being shown the right one is
 * substantially a memory of the last ten seconds; the second comes after the
 * item has been away and something else has been in the learner's head, which
 * is the first evidence that anything was actually learned. It is the same
 * argument the review scheduler's rescue gap is built on.
 */
export const RECOVERY_STREAK = 2;

export type MistakeMap = Record<string, Mistake>;

export interface MistakeOutcome {
  kind: ItemProgress['kind'];
  itemKey: string;
  skill: Skill;
  mode: ExerciseMode;
  passed: boolean;
  /** The wrong option's id, when there was one. */
  chose?: string | undefined;
  /** The right option's id. */
  answer: string;
}

/**
 * Folds one answer into the notebook.
 *
 * Returns the row to persist, or `null` when nothing needs writing — a correct
 * answer to an item that was never wrong is not a notebook entry, and §58 says
 * so explicitly. Pure, and takes `now`, so the recovery rules are testable
 * rather than something to be observed over a week.
 */
export function applyAnswer(
  previous: Mistake | undefined,
  outcome: MistakeOutcome,
  now: Date,
): Mistake | null {
  const stamp = now.toISOString();
  const id = memoryKey(outcome.kind, outcome.itemKey);

  if (outcome.passed) {
    // Nothing to record. Getting something right is the normal case and the
    // notebook is not a log of normal cases.
    if (!previous) return null;
    return { ...previous, correctSince: previous.correctSince + 1 };
  }

  if (!previous) {
    return {
      id,
      kind: outcome.kind,
      itemKey: outcome.itemKey,
      mode: outcome.mode,
      skill: outcome.skill,
      chose: outcome.chose ?? null,
      answer: outcome.answer,
      firstAt: stamp,
      lastAt: stamp,
      wrongCount: 1,
      correctSince: 0,
    };
  }

  return {
    ...previous,
    // The latest way it went wrong replaces the old one: that is the question
    // the learner has just been surprised by, and the one worth showing.
    mode: outcome.mode,
    skill: outcome.skill,
    chose: outcome.chose ?? null,
    answer: outcome.answer,
    lastAt: stamp,
    wrongCount: previous.wrongCount + 1,
    correctSince: 0,
  };
}

/** Whether this mistake has been answered right enough times to be done with. */
export function isRecovered(mistake: Mistake): boolean {
  return mistake.correctSince >= RECOVERY_STREAK;
}

export interface MistakeFilter {
  /** `null` for everything. */
  kind?: ItemProgress['kind'] | null;
  /** Include mistakes the learner has since fixed. */
  includeRecovered?: boolean;
}

/**
 * The notebook, most recently missed first.
 *
 * Recency rather than frequency, because the learner is looking for the thing
 * that just went wrong. Frequency is on the row, as a count, for the ones that
 * keep happening.
 */
export function listMistakes(mistakes: MistakeMap, filter: MistakeFilter = {}): Mistake[] {
  return Object.values(mistakes)
    .filter((mistake) => {
      if (filter.kind && mistake.kind !== filter.kind) return false;
      if (!filter.includeRecovered && isRecovered(mistake)) return false;
      return true;
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** How many mistakes are still unresolved. The number the tab shows. */
export function unresolvedCount(mistakes: MistakeMap): number {
  return listMistakes(mistakes).length;
}

/**
 * How much a past mistake should raise an item's review priority.
 *
 * Bounded, and deliberately not proportional to the count. §29: a wrong answer
 * should bring an item back, and it should not sentence the learner to being
 * asked it forever. Four mistakes and forty produce the same urgency, because
 * after four the app already knows this is a hard one and asking more often is
 * not what fixes it.
 *
 * Recovery cancels it. An item answered right twice since its last mistake is
 * no longer a mistake, and carrying the boost past that point is how a
 * notebook turns into a punishment.
 */
export function mistakeUrgency(mistake: Mistake | undefined): number {
  if (!mistake || isRecovered(mistake)) return 0;
  return Math.min(1, 0.5 + mistake.wrongCount * 0.25);
}
