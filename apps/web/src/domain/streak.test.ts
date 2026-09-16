/**
 * The streak, defined once and held to it.
 *
 * The rule is in `isQualifyingDay`: a streak day is a local calendar day with
 * at least one **answered question or completed item**. The first such day is
 * Day 1 — never Day 0 — and a day with only measured time on a session screen
 * is study time, not a streak day. `learningStreak` is the only read path;
 * Home, the Activity screen, My Learning and the weekly summary all call it
 * with the same two stores, so no two screens can disagree.
 *
 * These fixtures pin the definition, the day-boundary arithmetic, and the
 * cases the product rule names: same-day repeats, the following day, a missed
 * day, duplicates, time-zone and DST moves, future-dated and back-dated rows,
 * and the store shapes an existing learner may carry.
 */
import { describe, expect, it } from 'vitest';
import type { DailyActivity } from '@hangyul-ganada/shared-types';

import {
  isQualifyingDay,
  learningStreak,
  qualifyingDays,
  recordActivity,
  recordStudyTime,
  streakSummary,
  weeklyReport,
} from './activity';
import { dateKey } from './progress';

/** Noon local time, so a ±1-day step never crosses a DST boundary mid-test. */
const T0 = new Date(2026, 7, 26, 12, 0, 0);

function daysAgo(n: number, base: Date = T0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return d;
}

function key(n: number): string {
  return dateKey(daysAgo(n));
}

/** An activity map holding one study-time-only row per named day. */
function viewedOn(...dates: string[]): Record<string, DailyActivity> {
  const map: Record<string, DailyActivity> = {};
  for (const date of dates) {
    const at = `${date}T10:00:00.000Z`;
    Object.assign(map, recordStudyTime(map, { at, ms: 60_000 }, new Date(`${date}T10:00:00`)));
  }
  return map;
}

/** An activity map holding one answered-question row per named day. */
function answeredOn(...dates: string[]): Record<string, DailyActivity> {
  const map: Record<string, DailyActivity> = {};
  for (const date of dates) {
    map[date] = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: false, review: false },
      new Date(`${date}T10:00:00`),
    );
  }
  return map;
}

describe('what a qualifying day is', () => {
  it('an answered question, right or wrong, qualifies', () => {
    const wrong = answeredOn(key(0))[key(0)]!;
    expect(wrong.attempts).toBe(1);
    expect(wrong.passes).toBe(0);
    expect(isQualifyingDay(wrong)).toBe(true);
  });

  it('a completed letter, word or Numbers lesson qualifies', () => {
    for (const kind of ['character', 'word', 'number'] as const) {
      const row = recordActivity(undefined, { type: 'completed', kind }, T0);
      expect(isQualifyingDay(row)).toBe(true);
    }
  });

  it('time on a session screen with nothing answered does not', () => {
    const row = viewedOn(key(0))[key(0)]!;
    expect(row.active_ms).toBe(60_000);
    expect(isQualifyingDay(row)).toBe(false);
    expect(learningStreak(viewedOn(key(0)), [], T0)).toMatchObject({ current: 0, status: 'never' });
  });
});

describe('the streak arithmetic', () => {
  it('is nothing before the first learning day and Day 1 after it', () => {
    expect(learningStreak({}, [], T0)).toEqual({ current: 0, longest: 0, totalDays: 0, status: 'never' });
    expect(learningStreak({}, [key(0)], T0)).toMatchObject({ current: 1, status: 'active' });
    expect(learningStreak(answeredOn(key(0)), [], T0)).toMatchObject({ current: 1, status: 'active' });
  });

  it('several answers on one day are one day', () => {
    let row = answeredOn(key(0))[key(0)]!;
    for (let i = 0; i < 5; i += 1) {
      row = recordActivity(
        row,
        { type: 'attempt', itemKey: 'word:word_gada', kind: 'word', passed: true, review: false },
        daysAgo(0),
      );
    }
    expect(row.attempts).toBe(6);
    expect(learningStreak({ [key(0)]: row }, [key(0), key(0)], T0)).toMatchObject({
      current: 1,
      totalDays: 1,
    });
  });

  it('the following day is Day 2, then 3, then 7', () => {
    expect(learningStreak({}, [key(1), key(0)], T0).current).toBe(2);
    expect(learningStreak({}, [key(2), key(1), key(0)], T0).current).toBe(3);
    const week = [6, 5, 4, 3, 2, 1, 0].map(key);
    expect(learningStreak({}, week, T0)).toMatchObject({ current: 7, longest: 7, totalDays: 7 });
  });

  it('a missed day ends the run, and the next learning day starts again at 1', () => {
    // Studied on days -3 and -2, missed -1, nothing yet today: lapsed.
    expect(learningStreak({}, [key(3), key(2)], T0)).toMatchObject({
      current: 0,
      longest: 2,
      status: 'lapsed',
    });
    // Then learned today: a new run of one, and the record is kept.
    expect(learningStreak({}, [key(3), key(2), key(0)], T0)).toMatchObject({
      current: 1,
      longest: 2,
      totalDays: 3,
      status: 'active',
    });
  });

  it('survives a day the learner has not practised yet', () => {
    // Practised up to yesterday, nothing today: still alive at 2.
    expect(learningStreak({}, [key(2), key(1)], T0).current).toBe(2);
  });

  it('uses the local calendar day across midnight', () => {
    const beforeMidnight = new Date(2026, 7, 24, 23, 59, 0);
    const afterMidnight = new Date(2026, 7, 25, 0, 1, 0);
    expect(dateKey(beforeMidnight)).toBe('2026-08-24');
    expect(dateKey(afterMidnight)).toBe('2026-08-25');
    const days = [dateKey(beforeMidnight), dateKey(afterMidnight)];
    expect(learningStreak({}, days, afterMidnight).current).toBe(2);
  });

  it('reads the same the next morning as the night before', () => {
    const evening = new Date(2026, 7, 24, 22, 30, 0);
    const nextMorning = new Date(2026, 7, 25, 8, 0, 0);
    const days = [dateKey(daysAgo(1, evening)), dateKey(evening)];
    expect(learningStreak({}, days, evening).current).toBe(2);
    expect(learningStreak({}, days, nextMorning).current).toBe(2);
  });

  it('a duplicated day key is one day', () => {
    expect(streakSummary([key(1), key(1), key(0), key(0)], T0)).toMatchObject({
      current: 2,
      totalDays: 2,
    });
  });

  it('a DST transition neither splits a day nor skips one', () => {
    // Europe/Berlin springs forward on 2026-03-29; the run spans it. Keys are
    // local dates, so 23:30 on the 28th and 03:30 on the 29th are two days
    // exactly as they are anywhere else, whatever the wall clock did between.
    const before = new Date(2026, 2, 28, 23, 30, 0);
    const after = new Date(2026, 2, 29, 3, 30, 0);
    const next = new Date(2026, 2, 30, 12, 0, 0);
    const days = [dateKey(before), dateKey(after), dateKey(next)];
    expect(new Set(days).size).toBe(3);
    expect(learningStreak({}, days, next).current).toBe(3);
    // And the autumn change, where an hour repeats.
    const fallA = new Date(2026, 9, 24, 12, 0, 0);
    const fallB = new Date(2026, 9, 25, 2, 30, 0);
    const fallC = new Date(2026, 9, 26, 12, 0, 0);
    expect(learningStreak({}, [dateKey(fallA), dateKey(fallB), dateKey(fallC)], fallC).current).toBe(3);
  });

  it('a time-zone move that repeats or skips a local day does not double-count or lose one', () => {
    // Flying east: the same local date can be written twice — one day.
    expect(learningStreak({}, [key(1), key(0), key(0)], T0)).toMatchObject({ current: 2, totalDays: 2 });
    // Flying west across the date line: a local day may be missing between
    // two recorded ones — that is a missed day, and the run is honest about
    // it rather than papering over the gap.
    expect(learningStreak({}, [key(2), key(0)], T0)).toMatchObject({ current: 1, longest: 1 });
  });

  it('a future-dated row cannot inflate the current run', () => {
    // A device whose clock was wrong wrote tomorrow. The run is counted back
    // from today, so the stray day is neither today nor yesterday and adds
    // nothing to `current`; it remains in the history as one day.
    const tomorrow = dateKey(daysAgo(-1));
    expect(learningStreak({}, [key(0), tomorrow], T0)).toMatchObject({ current: 1, totalDays: 2 });
  });

  it('a back-dated row is history, not today', () => {
    const summary = learningStreak({}, [key(30)], T0);
    expect(summary).toMatchObject({ current: 0, longest: 1, totalDays: 1, status: 'lapsed' });
  });
});

describe('one rule for every store and every screen', () => {
  it('a day recorded only in active_days still counts — an existing learner’s history', () => {
    const activeDays = [2, 1, 0].map(key);
    expect(learningStreak({}, activeDays, T0).current).toBe(3);
    expect(qualifyingDays({}, activeDays).sort()).toEqual([...activeDays].sort());
  });

  it('a day recorded only as an answered row still counts — a lost settings write', () => {
    expect(learningStreak(answeredOn(key(1), key(0)), [], T0).current).toBe(2);
  });

  it('a study-time-only day between two learning days is a gap, on every screen', () => {
    const activity = { ...answeredOn(key(2), key(0)), ...viewedOn(key(1)) };
    const streak = learningStreak(activity, [key(2), key(0)], T0);
    expect(streak).toMatchObject({ current: 1, longest: 1, totalDays: 2 });
    expect(qualifyingDays(activity, []).sort()).toEqual([key(2), key(0)].sort());
  });

  it('the weekly summary counts learning days by the same rule', () => {
    // Monday 2026-08-24 to Sunday 2026-08-30; T0 is Wednesday the 26th.
    const activity = { ...answeredOn('2026-08-24', '2026-08-26'), ...viewedOn('2026-08-25') };
    const report = weeklyReport(activity, T0);
    expect(report.thisWeek.daysStudied).toBe(2);
    // The viewing is still study time.
    expect(report.thisWeek.minutes).toBe(1);
  });

  it('every kind of answered question counts alike', () => {
    const letterDay = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:ㅏ', kind: 'character', passed: true, review: false },
      daysAgo(3),
    );
    const wordDay = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'word:word_gada', kind: 'word', passed: false, review: false },
      daysAgo(2),
    );
    const reviewDay = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'word:word_gada', kind: 'word', passed: true, review: true },
      daysAgo(1),
    );
    const numbersDay = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'number:num-lesson-1:num-1', kind: 'number', passed: true, review: false },
      daysAgo(0),
    );
    const activity = {
      [letterDay.date]: letterDay,
      [wordDay.date]: wordDay,
      [reviewDay.date]: reviewDay,
      [numbersDay.date]: numbersDay,
    };
    expect(learningStreak(activity, [], T0).current).toBe(4);
  });
});
