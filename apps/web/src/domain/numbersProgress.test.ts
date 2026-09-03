import { describe, expect, it } from 'vitest';
import type { NumberLesson, NumbersEvent, NumbersLessonProgress } from '@hangyul-ganada/shared-types';

import { NUMBER_LESSONS, getNumberLesson, numberLessonItems } from '../data/numbers';
import { masteryExercises, practiceExercises } from '../features/numbers/exercises';
import {
  MASTERY_PASS,
  REVIEW_INTERVAL_DAYS,
  applyNumbersEvent,
  blankLessonProgress,
  isComplete,
  isReviewDue,
  lessonActivityProgress,
  lessonStatus,
  repairLessonProgress,
  resumePhase,
  unitComplete,
} from './numbersProgress';

/**
 * The Numbers progress model, exercised as learning journeys.
 *
 * Each journey is a sequence of events a real learner produces, run through the
 * pure reducer, and then the *derived* status is asserted. The point of testing
 * journeys rather than fields is that the defect this model replaces was not a
 * wrong field — it was a screen that concluded "complete" from a sequence of
 * events that did not justify it. So the assertions are about what the screen
 * would be allowed to say.
 */

const T0 = new Date('2026-09-01T09:00:00Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const lessonOf = (id: string): NumberLesson => {
  const lesson = getNumberLesson(id);
  if (!lesson) throw new Error(`no lesson ${id}`);
  return lesson;
};

/** Runs events in order, one minute apart. */
function run(lesson: NumberLesson, events: NumbersEvent[], start = blankLessonProgress(lesson.id, T0)) {
  let record = start;
  events.forEach((event, i) => {
    record = applyNumbersEvent(record, lesson, event, at(i + 1));
  });
  return record;
}

const open: NumbersEvent = { type: 'lesson_opened' };
const readAll = (lesson: NumberLesson): NumbersEvent[] =>
  lesson.explanation.map((step) => ({ type: 'explanation_viewed', step: step.text }));
const viewAll = (lesson: NumberLesson): NumbersEvent[] =>
  lesson.item_ids.map((item_id) => ({ type: 'example_viewed', item_id }));

/** Practice, answered by a policy; the exercises are the real generated ones. */
function practice(lesson: NumberLesson, attempt: number, policy: (i: number) => boolean): NumbersEvent[] {
  const events: NumbersEvent[] = practiceExercises(lesson, attempt).map((ex, i) => ({
    type: 'exercise_attempted',
    exercise_id: ex.id,
    item_id: ex.item_id,
    correct: policy(i),
    phase: 'practice',
  }));
  events.push({ type: 'practice_completed' });
  return events;
}

/** The mastery check, answered by a policy. */
function mastery(lesson: NumberLesson, attempt: number, policy: (i: number) => boolean): NumbersEvent[] {
  const exercises = masteryExercises(lesson, attempt);
  const events: NumbersEvent[] = exercises.map((ex, i) => ({
    type: 'exercise_attempted',
    exercise_id: ex.id,
    item_id: ex.item_id,
    correct: policy(i),
    phase: 'mastery',
  }));
  const correct = exercises.filter((_, i) => policy(i)).length;
  events.push({ type: 'mastery_completed', correct, total: exercises.length });
  return events;
}

const fullJourney = (lesson: NumberLesson, attempt = 0): NumbersEvent[] => [
  open,
  ...readAll(lesson),
  ...viewAll(lesson),
  ...practice(lesson, attempt, () => true),
  ...mastery(lesson, attempt, () => true),
];

const status = (record: NumbersLessonProgress | undefined, lesson: NumberLesson) =>
  lessonStatus(record, lesson, { reviewDue: isReviewDue(record, at(0)) });

const sino = lessonOf('num-lesson-sino-basics');
const native = lessonOf('num-lesson-native-basics');
const counters = lessonOf('num-lesson-counters');

describe('Numbers journeys', () => {
  it('J01 · a fresh install has every lesson available and none complete', () => {
    /*
     * Both halves matter and they are opposite failures. Every lesson open is
     * the access rule — a new learner can go straight to prices or to age.
     * None complete is the completion rule — being able to open eighteen
     * lessons must not read as having done any of them.
     */
    for (const lesson of NUMBER_LESSONS) {
      expect(status(undefined, lesson), lesson.id).toBe('available');
      expect(isComplete(blankLessonProgress(lesson.id, T0), lesson), lesson.id).toBe(false);
    }
  });

  it('J02 · opening a lesson makes it "opened", never complete', () => {
    const record = run(sino, [open]);
    expect(status(record, sino)).toBe('not_started');
    expect(isComplete(record, sino)).toBe(false);
    expect(record.completed_at).toBeNull();
    expect(resumePhase(record, sino)).toBe('explain');
  });

  it('J03 · reading one explanation step is "in progress" and resumes at the next step', () => {
    const record = run(sino, [open, { type: 'explanation_viewed', step: sino.explanation[0]!.text }]);
    expect(status(record, sino)).toBe('in_progress');
    expect(resumePhase(record, sino)).toBe('explain');
    expect(lessonActivityProgress(record, sino)).toEqual({
      done: 1,
      total: sino.explanation.length + sino.item_ids.length + 2,
    });
  });

  it('J04 · reading every step resumes at the examples', () => {
    const record = run(sino, [open, ...readAll(sino)]);
    expect(resumePhase(record, sino)).toBe('examples');
    expect(isComplete(record, sino)).toBe(false);
  });

  it('J05 · viewing every example resumes at practice', () => {
    const record = run(sino, [open, ...readAll(sino), ...viewAll(sino)]);
    expect(resumePhase(record, sino)).toBe('practice');
    expect(isComplete(record, sino)).toBe(false);
  });

  it('J06 · practice answered entirely wrong is still "in progress" and not complete', () => {
    const record = run(sino, [open, ...readAll(sino), ...viewAll(sino), ...practice(sino, 0, () => false)]);
    expect(record.attempts.incorrect).toBeGreaterThan(0);
    expect(record.attempts.correct).toBe(0);
    expect(status(record, sino)).toBe('in_progress');
    expect(isComplete(record, sino)).toBe(false);
    expect(resumePhase(record, sino)).toBe('mastery');
  });

  it('J07 · practice answered entirely right is still not complete — mastery is owed', () => {
    const record = run(sino, [open, ...readAll(sino), ...viewAll(sino), ...practice(sino, 0, () => true)]);
    expect(isComplete(record, sino)).toBe(false);
    expect(resumePhase(record, sino)).toBe('mastery');
  });

  it('J08 · a failed mastery check leaves the lesson in progress with the attempt counted', () => {
    const record = run(sino, [
      open, ...readAll(sino), ...viewAll(sino), ...practice(sino, 0, () => true),
      ...mastery(sino, 0, () => false),
    ]);
    expect(record.mastery?.passed).toBe(false);
    expect(record.mastery_attempts).toBe(1);
    expect(status(record, sino)).toBe('in_progress');
    expect(isComplete(record, sino)).toBe(false);
  });

  it('J09 · a mastery pass with every item answered right completes the lesson', () => {
    const record = run(sino, fullJourney(sino));
    expect(record.completed_at).not.toBeNull();
    expect(status(record, sino)).toBe('mastered');
    expect(resumePhase(record, sino)).toBe('summary');
  });

  it('J10 · a mastery pass at the threshold with every item right at least once is "completed", not "mastered"', () => {
    // Fail the last question only, on a lesson where every item is asked more
    // than once? Mastery covers each item once first, so fail a *repeat*:
    // pick the first repeated item's later question.
    const exercises = masteryExercises(sino, 0);
    const seen = new Set<string>();
    let repeatIndex = -1;
    exercises.forEach((ex, i) => {
      if (repeatIndex === -1 && seen.has(ex.item_id)) repeatIndex = i;
      seen.add(ex.item_id);
    });
    if (repeatIndex === -1) return; // every question is a distinct item; nothing to fail safely
    const total = exercises.length;
    expect((total - 1) / total).toBeGreaterThanOrEqual(MASTERY_PASS);
    const record = run(sino, [
      open, ...readAll(sino), ...viewAll(sino), ...practice(sino, 0, () => true),
      ...mastery(sino, 0, (i) => i !== repeatIndex),
    ]);
    expect(record.mastery?.passed).toBe(true);
    expect(isComplete(record, sino)).toBe(true);
    expect(status(record, sino)).toBe('completed');
  });

  it('J11 · a mastery pass in which one item was never answered right does not complete', () => {
    const exercises = masteryExercises(counters, 0);
    // Fail every question about one item, pass the rest.
    const victim = exercises[0]!.item_id;
    const events = [
      open, ...readAll(counters), ...viewAll(counters), ...practice(counters, 0, () => true),
      ...mastery(counters, 0, (i) => exercises[i]!.item_id !== victim),
    ];
    const record = run(counters, events);
    const failedShare = exercises.filter((e) => e.item_id === victim).length / exercises.length;
    if (1 - failedShare >= MASTERY_PASS) {
      expect(record.mastery?.passed).toBe(true);
      expect(isComplete(record, counters)).toBe(false);
      expect(record.items[victim]?.mastered_at).toBeNull();
    } else {
      expect(record.mastery?.passed).toBe(false);
      expect(isComplete(record, counters)).toBe(false);
    }
  });

  it('J12 · leaving mid-practice and returning resumes at practice with the attempts kept', () => {
    const partial = practiceExercises(sino, 0).slice(0, 3).map<NumbersEvent>((ex) => ({
      type: 'exercise_attempted', exercise_id: ex.id, item_id: ex.item_id, correct: true, phase: 'practice',
    }));
    const record = run(sino, [open, ...readAll(sino), ...viewAll(sino), ...partial]);
    expect(record.attempts.total).toBe(3);
    expect(resumePhase(record, sino)).toBe('practice');
    expect(status(record, sino)).toBe('in_progress');
  });

  it('J13 · an interrupted mastery check (no result event) is not a pass', () => {
    const exercises = masteryExercises(sino, 0);
    const events = exercises.map<NumbersEvent>((ex) => ({
      type: 'exercise_attempted', exercise_id: ex.id, item_id: ex.item_id, correct: true, phase: 'mastery',
    }));
    const record = run(sino, [open, ...readAll(sino), ...viewAll(sino), ...practice(sino, 0, () => true), ...events]);
    expect(record.mastery).toBeNull();
    expect(isComplete(record, sino)).toBe(false);
    expect(resumePhase(record, sino)).toBe('mastery');
  });

  it('J14 · retaking mastery with a better score raises completed to mastered', () => {
    const exercises = masteryExercises(sino, 0);
    const seen = new Set<string>();
    let repeatIndex = -1;
    exercises.forEach((ex, i) => { if (repeatIndex === -1 && seen.has(ex.item_id)) repeatIndex = i; seen.add(ex.item_id); });
    if (repeatIndex === -1) return;
    const first = run(sino, [
      open, ...readAll(sino), ...viewAll(sino), ...practice(sino, 0, () => true),
      ...mastery(sino, 0, (i) => i !== repeatIndex),
    ]);
    expect(status(first, sino)).toBe('completed');
    const second = run(sino, mastery(sino, 1, () => true), first);
    expect(second.mastery_attempts).toBe(2);
    expect(status(second, sino)).toBe('mastered');
  });

  it('J15 · retaking mastery with a worse score never lowers a pass', () => {
    const first = run(sino, fullJourney(sino));
    const second = run(sino, mastery(sino, 1, () => false), first);
    expect(second.mastery?.passed).toBe(true);
    expect(second.mastery?.correct).toBe(first.mastery?.correct);
    expect(second.completed_at).toBe(first.completed_at);
    expect(status(second, sino)).toBe('mastered');
  });

  it('J16 · a completed lesson becomes review-due after the interval and clears when reviewed', () => {
    const done = run(sino, fullJourney(sino));
    const later = new Date(Date.parse(done.completed_at!) + (REVIEW_INTERVAL_DAYS + 1) * 86_400_000);
    expect(isReviewDue(done, at(0))).toBe(false);
    expect(isReviewDue(done, later)).toBe(true);
    expect(lessonStatus(done, sino, { reviewDue: true })).toBe('review_due');
    const reviewed = applyNumbersEvent(done, sino, { type: 'review_completed', item_id: sino.item_ids[0]!, correct: true }, later);
    expect(isReviewDue(reviewed, later)).toBe(false);
    expect(reviewed.completed_at).toBe(done.completed_at);
  });

  it('J17 · a lesson whose prerequisites are unfinished is open, not locked', () => {
    /*
     * This test used to assert the opposite, and the product used to do it: a
     * lesson whose prerequisites were unfinished was `locked` and its row was
     * not a link. The reasoning was real — 두 시 is unexplainable without the
     * counting forms — and it is an argument about *order*, not about access.
     * Somebody who has just been asked their age in Korean should be able to go
     * and find out how to answer.
     *
     * So the rule is now that a lesson's status is a fact about its own record
     * and nothing else. `native` still declares `sino` as a prerequisite — the
     * recommended order is still in the data, and the Continue button on the
     * list reads it — and a learner with no record at all can still open it.
     */
    expect(native.prerequisites).toContain(sino.id);
    expect(lessonStatus(undefined, native, { reviewDue: false })).toBe('available');
    expect(lessonStatus(run(native, [open]), native, { reviewDue: false })).toBe('not_started');

    // And a finished record still reads as finished, as it always did.
    const record = run(native, fullJourney(native));
    expect(['completed', 'mastered']).toContain(lessonStatus(record, native, { reviewDue: false }));
  });

  it('J18 · an open lesson is available, not started, and not complete', () => {
    /*
     * The property that matters most in a course with no locks: removing the
     * gate must not be mistaken for granting the lesson. `available` is a
     * statement about a door, not about a learner.
     */
    expect(status(undefined, native)).toBe('available');
    expect(unitComplete([native], {})).toBe(false);
    // Opening it is still not starting it, and starting it is still not
    // finishing it.
    expect(status(run(native, [open]), native)).toBe('not_started');
    expect(unitComplete([native], { [native.id]: run(native, [open]) })).toBe(false);
  });

  it('J19 · a module is complete only when every lesson in it is', () => {
    const module = NUMBER_LESSONS.filter((l) => l.module === 'mod-systems');
    const records: Record<string, NumbersLessonProgress> = {};
    for (const lesson of module.slice(0, -1)) records[lesson.id] = run(lesson, fullJourney(lesson));
    expect(unitComplete(module, records)).toBe(false);
    const last = module[module.length - 1]!;
    records[last.id] = run(last, fullJourney(last));
    expect(unitComplete(module, records)).toBe(true);
  });

  it('J20 · every lesson in the curriculum can be completed by a diligent learner', () => {
    for (const lesson of NUMBER_LESSONS) {
      const record = run(lesson, fullJourney(lesson));
      expect(isComplete(record, lesson), `${lesson.id} cannot be completed`).toBe(true);
      expect(numberLessonItems(lesson).every((i) => record.items[i.id]?.mastered_at)).toBe(true);
    }
  });

  it('J21 · repeated events are idempotent where they are facts', () => {
    const once = run(sino, [open, ...readAll(sino), ...viewAll(sino)]);
    const twice = run(sino, [open, open, ...readAll(sino), ...readAll(sino), ...viewAll(sino), ...viewAll(sino)]);
    expect(twice.explanation_steps_viewed).toEqual(once.explanation_steps_viewed);
    expect(twice.examples_viewed).toEqual(once.examples_viewed);
    expect(lessonActivityProgress(twice, sino)).toEqual(lessonActivityProgress(once, sino));
  });
});

describe('Numbers negative tests — the ways completion must not be earned', () => {
  it('N1 · unlock is not completion: an available lesson contributes nothing to a module', () => {
    const module = NUMBER_LESSONS.filter((l) => l.module === 'mod-systems');
    expect(unitComplete(module, {})).toBe(false);
    for (const lesson of module) expect(status(undefined, lesson)).toBe('available');
  });

  it('N2 · mounting the route (lesson_opened) cannot complete or start a lesson', () => {
    const record = run(sino, [open, open, open]);
    expect(record.started_at).toBeNull();
    expect(record.completed_at).toBeNull();
    expect(lessonActivityProgress(record, sino).done).toBe(0);
    expect(status(record, sino)).toBe('not_started');
  });

  it('N3 · a record under a letter or vocabulary id is rejected, not adopted', () => {
    for (const id of ['ㄱ', 'character:ㄱ', 'word:사과', 'num-lesson-does-not-exist', '']) {
      const repaired = repairLessonProgress(
        { ...run(sino, fullJourney(sino)), lesson_id: id },
        getNumberLesson(id),
        at(0),
      );
      expect(repaired, `${id} was adopted`).toBeNull();
    }
  });

  it('N4 · a stored completed_at with no evidence behind it is cleared on repair', () => {
    const forged: NumbersLessonProgress = { ...blankLessonProgress(sino.id, T0), completed_at: at(5).toISOString() };
    const repaired = repairLessonProgress(forged, sino, at(9))!;
    expect(repaired.completed_at).toBeNull();
    expect(status(repaired, sino)).toBe('available');

    // …and one with all the flags set but no per-item mastery is cleared too.
    const flags: NumbersLessonProgress = {
      ...blankLessonProgress(sino.id, T0),
      opened_at: T0.toISOString(),
      started_at: T0.toISOString(),
      explanation_steps_viewed: sino.explanation.map((step) => step.text),
      examples_viewed: [...sino.item_ids],
      practice_completed_at: T0.toISOString(),
      mastery: { taken_at: T0.toISOString(), correct: 8, total: 8, passed: true },
      completed_at: T0.toISOString(),
    };
    expect(repairLessonProgress(flags, sino, at(9))!.completed_at).toBeNull();
  });

  it('N5 · the denominator is the lesson\'s own activities, and modules count lessons', () => {
    const { total } = lessonActivityProgress(undefined, counters);
    expect(total).toBe(counters.explanation.length + counters.item_ids.length + 2);
    // A lesson with more items is not "more complete" for the same steps read.
    const a = run(sino, [open, ...readAll(sino)]);
    const b = run(counters, [open, ...readAll(counters)]);
    expect(lessonActivityProgress(a, sino).done).toBe(sino.explanation.length);
    expect(lessonActivityProgress(b, counters).done).toBe(counters.explanation.length);
  });

  it('N6 · a stale snapshot applied after a repair cannot restore a cleared completion', () => {
    // Simulates the old build's write landing after the new build's repair:
    // whatever the snapshot claims, the repair re-derives from evidence.
    const forged: NumbersLessonProgress = { ...blankLessonProgress(sino.id, T0), completed_at: at(5).toISOString() };
    const first = repairLessonProgress(forged, sino, at(9))!;
    const stale = { ...forged, updated_at: at(1).toISOString() };
    const second = repairLessonProgress(stale, sino, at(10))!;
    expect(first.completed_at).toBeNull();
    expect(second.completed_at).toBeNull();
    // and the reducer never writes completed_at from a stale claim either
    const applied = applyNumbersEvent({ ...second, completed_at: null }, sino, open, at(11));
    expect(applied.completed_at).toBeNull();
  });
});
