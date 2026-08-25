/**
 * The streak, defined once and held to it.
 *
 * These cases exist because the product shipped two streak calculations over
 * two different day stores: Home read `settings.active_days` (written by
 * practice events) and the Activity screen read the activity map (written by
 * the study clock as well). A learner whose day held study time but no
 * completed attempt was a day ahead on one screen — photographed as "4 days"
 * on Home under "7 days in a row" one tap away.
 *
 * `learningStreak` is now the only read path, and its definition of a streak
 * day is: any recorded study activity — an attempt, a completed item, or
 * measured session time. These fixtures pin the definition, the day-boundary
 * arithmetic, and the invariant that the two screens can never disagree
 * because they call the same function with the same inputs.
 */
import { describe, expect, it } from 'vitest';
import type { DailyActivity } from '@hangyul-ganada/shared-types';

import { learningStreak, recordActivity, recordStudyTime, studyDays } from './activity';
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

/** An activity map holding one study-time row per named day. */
function activityOn(...dates: string[]): Record<string, DailyActivity> {
  const map: Record<string, DailyActivity> = {};
  for (const date of dates) {
    const at = `${date}T10:00:00.000Z`;
    const grown = recordStudyTime(map, { at, ms: 60_000 }, new Date(`${date}T10:00:00`));
    Object.assign(map, grown);
  }
  return map;
}

describe('the streak definition', () => {
  it('is zero before the first study day and one after it', () => {
    expect(learningStreak({}, [], T0).current).toBe(0);
    expect(learningStreak({}, [key(0)], T0).current).toBe(1);
    expect(learningStreak(activityOn(key(0)), [], T0).current).toBe(1);
  });

  it('counts two and seven consecutive days', () => {
    expect(learningStreak({}, [key(1), key(0)], T0).current).toBe(2);
    const week = [6, 5, 4, 3, 2, 1, 0].map(key);
    const summary = learningStreak({}, week, T0);
    expect(summary.current).toBe(7);
    expect(summary.longest).toBe(7);
    expect(summary.totalDays).toBe(7);
  });

  it('survives a day the learner has not practised yet, and dies on a missed yesterday', () => {
    // Practised up to yesterday, nothing today: still alive.
    expect(learningStreak({}, [key(2), key(1)], T0).current).toBe(2);
    // Missed yesterday: the run is over even though the day before was studied.
    expect(learningStreak({}, [key(3), key(2)], T0).current).toBe(0);
    // The longest run is history and never shrinks.
    expect(learningStreak({}, [key(3), key(2)], T0).longest).toBe(2);
  });

  it('uses the local calendar day across midnight', () => {
    // 23:59 and 00:01 are different local days one minute apart.
    const beforeMidnight = new Date(2026, 7, 24, 23, 59, 0);
    const afterMidnight = new Date(2026, 7, 25, 0, 1, 0);
    expect(dateKey(beforeMidnight)).toBe('2026-08-24');
    expect(dateKey(afterMidnight)).toBe('2026-08-25');
    // Studying just before and just after midnight is a two-day streak.
    const days = [dateKey(beforeMidnight), dateKey(afterMidnight)];
    expect(learningStreak({}, days, afterMidnight).current).toBe(2);
  });

  it('reads the same the next morning as the night before', () => {
    // Close the app after an evening session; reopen next day before studying.
    const evening = new Date(2026, 7, 24, 22, 30, 0);
    const nextMorning = new Date(2026, 7, 25, 8, 0, 0);
    const days = [dateKey(daysAgo(1, evening)), dateKey(evening)];
    expect(learningStreak({}, days, evening).current).toBe(2);
    expect(learningStreak({}, days, nextMorning).current).toBe(2);
  });

  it('counts several practices in one day as one day', () => {
    const activity = activityOn(key(0));
    const twice = recordStudyTime(
      activity,
      { at: daysAgo(0).toISOString(), ms: 120_000 },
      daysAgo(0),
    );
    expect(learningStreak(twice, [key(0), key(0)], T0).current).toBe(1);
    expect(learningStreak(twice, [key(0)], T0).totalDays).toBe(1);
  });

  it('counts letter-only, vocabulary-only and review-only practice alike', () => {
    // Whatever the learner practised, the day counts once. The three kinds
    // land through the same `trackActivity` path into `active_days`; this
    // pins that no kind is special-cased out of the streak.
    const letterDay = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:ㅏ', kind: 'character', passed: true, review: false },
      daysAgo(2),
    );
    const wordDay = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'word:word_gada', kind: 'word', passed: false, review: false },
      daysAgo(1),
    );
    const reviewDay = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'word:word_gada', kind: 'word', passed: true, review: true },
      daysAgo(0),
    );
    const activity = {
      [letterDay.date]: letterDay,
      [wordDay.date]: wordDay,
      [reviewDay.date]: reviewDay,
    };
    expect(learningStreak(activity, [], T0).current).toBe(3);
  });
});

describe('the one-truth invariant', () => {
  it('a day recorded only as study time still counts — the Home/Activity split', () => {
    // The photographed defect: three days held study time but no completed
    // attempt. active_days knew four days; the activity map knew seven.
    const activeDays = [6, 5, 4, 3].map(key);
    const activity = activityOn(...[6, 5, 4, 3, 2, 1, 0].map(key));
    const summary = learningStreak(activity, activeDays, T0);
    // Both screens read this one number now, and it is seven.
    expect(summary.current).toBe(7);
  });

  it('a legacy day recorded only in active_days still counts', () => {
    // History from before the activity map existed lives only in
    // active_days. The union keeps it.
    const activeDays = [2, 1, 0].map(key);
    const activity = activityOn(key(0));
    expect(learningStreak(activity, activeDays, T0).current).toBe(3);
    expect(studyDays(activity, activeDays).sort()).toEqual([2, 1, 0].map(key).sort());
  });

  it('the day set is a union with no duplicates', () => {
    const activity = activityOn(key(1), key(0));
    const days = studyDays(activity, [key(1), key(0)]);
    expect(days.length).toBe(2);
  });
});
