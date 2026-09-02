import type {
  NumbersEvent,
  NumbersItemEvidence,
  NumbersLessonProgress,
  NumbersLessonStatus,
  NumberLesson,
} from '@hangyul-ganada/shared-types';



/**
 * Numbers progress: what happened, and what that makes the lesson.
 *
 * ## The rule this module enforces, in one place
 *
 * A lesson is **complete** when, and only when, all of the following hold:
 *
 * 1. every explanation step has been viewed;
 * 2. every item's example has been viewed;
 * 3. the guided practice has been finished (every practice exercise answered,
 *    right or wrong — practice is where mistakes are allowed);
 * 4. a mastery check has been **passed**: at least `MASTERY_PASS` of its
 *    questions right, *and* every item in the lesson answered correctly at
 *    least once during a mastery check.
 *
 * Nothing else completes a lesson. Opening it does not. Reading everything and
 * attempting nothing does not. Answering every question wrong and reaching the
 * last screen does not — that was the shipped defect. Reordering the curriculum
 * does not, because the record is keyed by lesson id and holds item ids, never
 * positions. A wrong answer during mastery does not *un*-complete a lesson that
 * completed earlier: `completed_at` is written once and never cleared.
 *
 * ## Why the record is evidence and the status is derived
 *
 * If the record held a `completed: boolean`, every code path that could set it
 * would be a place completion could be granted wrongly, and the first
 * implementation had exactly that: a screen transition set it. Here the record
 * holds only what the learner did, and `lessonStatus` reads it. To fabricate a
 * completion you would have to fabricate the evidence for it, which is a much
 * harder thing to do by accident.
 */

/** The share of mastery questions that must be right. */
export const MASTERY_PASS = 0.8;

/**
 * Days after completion (or after the last review) before a lesson is
 * `review_due`. A week: long enough that the review is a memory test and not a
 * repeat, short enough that a course finished in a fortnight has its first
 * module due before its last is done.
 */
export const REVIEW_INTERVAL_DAYS = 7;

/** A record for a lesson nobody has opened. */
export function blankLessonProgress(lessonId: string, now: Date): NumbersLessonProgress {
  return {
    schema: 1,
    lesson_id: lessonId,
    opened_at: null,
    started_at: null,
    explanation_steps_viewed: [],
    examples_viewed: [],
    practice_completed_at: null,
    mastery: null,
    mastery_attempts: 0,
    reviewed_at: null,
    items: {},
    attempts: { total: 0, correct: 0, incorrect: 0 },
    completed_at: null,
    updated_at: now.toISOString(),
  };
}

function itemEvidence(record: NumbersLessonProgress, itemId: string): NumbersItemEvidence {
  return record.items[itemId] ?? { correct: 0, incorrect: 0, mastered_at: null };
}

/**
 * Applies one event. Pure, and idempotent where the event is a fact rather
 * than a count: viewing an explanation twice records it once, attempting an
 * exercise twice records two attempts.
 *
 * `completed_at` is decided *here*, after the event is applied, by asking
 * `isComplete` of the new record. It is the only place the field is written.
 */
export function applyNumbersEvent(
  record: NumbersLessonProgress,
  lesson: NumberLesson,
  event: NumbersEvent,
  now: Date,
): NumbersLessonProgress {
  const stamp = now.toISOString();
  let next: NumbersLessonProgress = { ...record, updated_at: stamp };

  switch (event.type) {
    case 'lesson_opened':
      next.opened_at = record.opened_at ?? stamp;
      break;
    case 'explanation_viewed':
      if (!record.explanation_steps_viewed.includes(event.step)) {
        next.explanation_steps_viewed = [...record.explanation_steps_viewed, event.step];
      }
      next.started_at = record.started_at ?? stamp;
      break;
    case 'example_viewed':
      if (!record.examples_viewed.includes(event.item_id)) {
        next.examples_viewed = [...record.examples_viewed, event.item_id];
      }
      next.started_at = record.started_at ?? stamp;
      break;
    case 'exercise_attempted': {
      const before = itemEvidence(record, event.item_id);
      const after: NumbersItemEvidence = {
        correct: before.correct + (event.correct ? 1 : 0),
        incorrect: before.incorrect + (event.correct ? 0 : 1),
        mastered_at:
          before.mastered_at ?? (event.correct && event.phase === 'mastery' ? stamp : null),
      };
      next.items = { ...record.items, [event.item_id]: after };
      next.attempts = {
        total: record.attempts.total + 1,
        correct: record.attempts.correct + (event.correct ? 1 : 0),
        incorrect: record.attempts.incorrect + (event.correct ? 0 : 1),
      };
      next.started_at = record.started_at ?? stamp;
      break;
    }
    case 'practice_completed':
      next.practice_completed_at = record.practice_completed_at ?? stamp;
      break;
    case 'mastery_completed': {
      const passed = event.total > 0 && event.correct / event.total >= MASTERY_PASS;
      const result = { taken_at: stamp, correct: event.correct, total: event.total, passed };
      // Keep the best result, so a later worse attempt cannot lower a pass —
      // and a later better one can raise `completed` to `mastered`.
      const better =
        record.mastery === null ||
        (result.passed && !record.mastery.passed) ||
        (result.passed === record.mastery.passed &&
          result.correct / Math.max(1, result.total) >
            record.mastery.correct / Math.max(1, record.mastery.total));
      next.mastery = better ? result : record.mastery;
      next.mastery_attempts = record.mastery_attempts + 1;
      break;
    }
    case 'review_completed': {
      // Review is evidence about *memory*, not about completion. It updates the
      // item's tallies and nothing else here; the scheduler owns due dates.
      const before = itemEvidence(record, event.item_id);
      next.items = {
        ...record.items,
        [event.item_id]: {
          ...before,
          correct: before.correct + (event.correct ? 1 : 0),
          incorrect: before.incorrect + (event.correct ? 0 : 1),
        },
      };
      next.reviewed_at = stamp;
      break;
    }
  }

  if (next.completed_at === null && isComplete(next, lesson)) {
    next = { ...next, completed_at: stamp };
  }
  return next;
}

/** Exactly the four conditions in the module header. */
export function isComplete(record: NumbersLessonProgress, lesson: NumberLesson): boolean {
  if (record.completed_at !== null) return true;
  const steps = lesson.explanation;
  if (steps.some((step) => !record.explanation_steps_viewed.includes(step))) return false;
  if (lesson.item_ids.some((id) => !record.examples_viewed.includes(id))) return false;
  if (record.practice_completed_at === null) return false;
  if (record.mastery === null || !record.mastery.passed) return false;
  if (lesson.item_ids.some((id) => itemEvidence(record, id).mastered_at === null)) return false;
  return true;
}

/**
 * How far through the required activities the learner is, as a fraction.
 *
 * For the progress ring on a lesson card. Counts *required activities*
 * (explanation steps + examples + practice + mastery) rather than items, and the
 * label beside it says so — an unexplained percentage is the thing this
 * replaces.
 */
export function lessonActivityProgress(
  record: NumbersLessonProgress | undefined,
  lesson: NumberLesson,
): { done: number; total: number } {
  const total = lesson.explanation.length + lesson.item_ids.length + 2;
  if (!record) return { done: 0, total };
  let done = lesson.explanation.filter((s) => record.explanation_steps_viewed.includes(s)).length;
  done += lesson.item_ids.filter((id) => record.examples_viewed.includes(id)).length;
  if (record.practice_completed_at) done += 1;
  if (record.mastery?.passed) done += 1;
  return { done: Math.min(done, total), total };
}

/**
 * The derived status.
 *
 * `reviewDue` is an input because it is a fact about the memory scheduler
 * rather than about this record, and this function should not have to know
 * where that lives.
 *
 * `prerequisitesComplete` used to be a second input and it returned `locked`.
 * Both are gone. A learner opening the Numbers course can open any lesson in
 * it — see `NumbersLessonStatus` for why — and what the recommended order
 * survives as is the Continue button on the list, which is a suggestion a
 * learner can ignore rather than a door they cannot open.
 */
export function lessonStatus(
  record: NumbersLessonProgress | undefined,
  lesson: NumberLesson,
  context: { reviewDue: boolean },
): NumbersLessonStatus {
  if (record && (record.completed_at !== null || isComplete(record, lesson))) {
    if (context.reviewDue) return 'review_due';
    if (record.mastery && record.mastery.passed && record.mastery.correct === record.mastery.total) {
      return 'mastered';
    }
    return 'completed';
  }
  if (!record || record.opened_at === null) return 'available';
  if (record.started_at === null) return 'not_started';
  return 'in_progress';
}

/**
 * Whether a completed lesson is due for review.
 *
 * Measured from the later of completion and the last review, never from
 * `updated_at`: opening the lesson touches `updated_at`, and opening a lesson
 * must not be a way of making its review disappear.
 */
export function isReviewDue(record: NumbersLessonProgress | undefined, now: Date): boolean {
  if (!record || record.completed_at === null) return false;
  const since = Math.max(
    Date.parse(record.completed_at),
    record.reviewed_at ? Date.parse(record.reviewed_at) : 0,
  );
  if (!Number.isFinite(since)) return false;
  return now.getTime() - since >= REVIEW_INTERVAL_DAYS * 86_400_000;
}

/** A unit is complete only when every lesson in it is. Never from unlock state. */
export function unitComplete(
  lessons: readonly NumberLesson[],
  records: Record<string, NumbersLessonProgress | undefined>,
): boolean {
  return lessons.length > 0 && lessons.every((l) => {
    const r = records[l.id];
    return r !== undefined && (r.completed_at !== null || isComplete(r, l));
  });
}

/**
 * Where to resume a lesson that was left part-way.
 *
 * Read from the evidence, not from a stored "current screen": the screen a
 * learner left on is a fact about the UI, and the thing they still owe is a
 * fact about the record. If the two disagree the record wins.
 */
export type LessonPhase = 'objective' | 'explain' | 'examples' | 'practice' | 'mastery' | 'summary';

export function resumePhase(
  record: NumbersLessonProgress | undefined,
  lesson: NumberLesson,
): LessonPhase {
  if (!record || record.opened_at === null) return 'objective';
  if (record.completed_at !== null || isComplete(record, lesson)) return 'summary';
  if (lesson.explanation.some((s) => !record.explanation_steps_viewed.includes(s))) return 'explain';
  if (lesson.item_ids.some((id) => !record.examples_viewed.includes(id))) return 'examples';
  if (record.practice_completed_at === null) return 'practice';
  return 'mastery';
}

/**
 * Repairs a stored record, or rejects it.
 *
 * Applied on every read, and by the migration. A record is kept only if it
 * names a lesson, has the current schema, and every field parses; counters are
 * defaulted, and — the important one — **a `completed_at` with no qualifying
 * evidence behind it is cleared.** That is how a false completion written by an
 * earlier build is downgraded rather than trusted: the evidence has to support
 * the claim, or the claim goes and the evidence stays.
 */
export function repairLessonProgress(
  candidate: unknown,
  lesson: NumberLesson | undefined,
  now: Date,
): NumbersLessonProgress | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Partial<NumbersLessonProgress>;
  if (typeof row.lesson_id !== 'string' || !row.lesson_id) return null;
  if (!lesson) return null; // an id the curriculum no longer knows

  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

  const items: Record<string, NumbersItemEvidence> = {};
  if (row.items && typeof row.items === 'object') {
    for (const [id, ev] of Object.entries(row.items)) {
      if (!lesson.item_ids.includes(id) || !ev || typeof ev !== 'object') continue;
      const e = ev as Partial<NumbersItemEvidence>;
      items[id] = { correct: num(e.correct), incorrect: num(e.incorrect), mastered_at: str(e.mastered_at) };
    }
  }

  const masteryRaw = row.mastery && typeof row.mastery === 'object' ? row.mastery : null;
  const mastery = masteryRaw
    ? (() => {
        const m = masteryRaw as Partial<NonNullable<NumbersLessonProgress['mastery']>>;
        const total = num(m.total);
        const correct = Math.min(num(m.correct), total);
        return {
          taken_at: str(m.taken_at) ?? now.toISOString(),
          correct,
          total,
          passed: total > 0 && correct / total >= MASTERY_PASS,
        };
      })()
    : null;

  const repaired: NumbersLessonProgress = {
    schema: 1,
    lesson_id: row.lesson_id,
    opened_at: str(row.opened_at),
    started_at: str(row.started_at),
    explanation_steps_viewed: list(row.explanation_steps_viewed).filter((s) => lesson.explanation.includes(s)),
    examples_viewed: list(row.examples_viewed).filter((id) => lesson.item_ids.includes(id)),
    practice_completed_at: str(row.practice_completed_at),
    mastery,
    mastery_attempts: num(row.mastery_attempts),
    reviewed_at: str(row.reviewed_at),
    items,
    attempts: {
      total: num(row.attempts?.total),
      correct: num(row.attempts?.correct),
      incorrect: num(row.attempts?.incorrect),
    },
    completed_at: str(row.completed_at),
    updated_at: str(row.updated_at) ?? now.toISOString(),
  };

  // The claim must be backed by the evidence, or the claim goes.
  if (repaired.completed_at !== null) {
    const probe = { ...repaired, completed_at: null };
    if (!isComplete(probe, lesson)) repaired.completed_at = null;
  }
  return repaired;
}
