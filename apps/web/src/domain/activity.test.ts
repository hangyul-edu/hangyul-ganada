import { describe, expect, it } from 'vitest';
import type { DailyActivity } from '@hangyul-ganada/shared-types';

import {
  IDLE_GAP_MS,
  MAX_ITEMS_PER_DAY,
  MAX_STRETCH_MS,
  MIN_ATTEMPTS_FOR_ACCURACY,
  activityInsights,
  activitySeries,
  availableRanges,
  calendarMonth,
  emptyDay,
  recordActivity,
  recordStudyTime,
  streakSummary,
  weekStart,
  weeklyReport,
  type ActivityMap,
} from './activity';
import { dateKey } from './progress';

/**
 * The learner's record of showing up.
 *
 * Every number on the Activity screen comes from here, and the screen's whole
 * value is that a learner can believe it. So the tests are mostly about the
 * ways a statistic can be *plausible and wrong*: time that counts a lunch
 * break, a streak that survives a gap, an accuracy computed from three
 * attempts, a chart that hides the days nothing happened.
 */

const T = (iso: string) => new Date(iso);

function build(entries: Array<[string, Partial<ReturnType<typeof emptyDay>>]>): ActivityMap {
  const out: ActivityMap = {};
  for (const [date, patch] of entries) {
    out[date] = { ...emptyDay(date, `${date}T19:00:00.000Z`), ...patch };
  }
  return out;
}

describe('recording activity', () => {
  it('starts a day at zero minutes, because nothing preceded the first event', () => {
    const row = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: true, review: false },
      T('2026-08-16T10:00:00.000Z'),
    );
    expect(row.date).toBe('2026-08-16');
    expect(row.attempts).toBe(1);
    expect(row.passes).toBe(1);
    expect(row.active_ms).toBe(0);
  });

  it('counts the gap between two attempts as study time', () => {
    const first = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: true, review: false },
      T('2026-08-16T10:00:00.000Z'),
    );
    const second = recordActivity(
      first,
      { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: false, review: false },
      T('2026-08-16T10:00:30.000Z'),
    );
    expect(second.active_ms).toBe(30_000);
    expect(second.attempts).toBe(2);
    expect(second.passes).toBe(1);
  });

  it('does not count a lunch break as studying', () => {
    // The failure this guards: a learner who leaves the app open for three
    // hours has not studied for three hours, and a screen that says so is
    // worse than one that says nothing.
    const first = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: true, review: false },
      T('2026-08-16T10:00:00.000Z'),
    );
    const later = recordActivity(
      first,
      { type: 'attempt', itemKey: 'character:ㄴ', kind: 'character', passed: true, review: false },
      T('2026-08-16T13:00:00.000Z'),
    );
    expect(later.active_ms).toBe(IDLE_GAP_MS);
  });

  it('separates completions from attempts', () => {
    let row = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: true, review: false },
      T('2026-08-16T10:00:00.000Z'),
    );
    row = recordActivity(row, { type: 'completed', kind: 'character' }, T('2026-08-16T10:00:10Z'));
    row = recordActivity(row, { type: 'completed', kind: 'word' }, T('2026-08-16T10:00:20Z'));
    expect(row.attempts).toBe(1);
    expect(row.characters_learned).toBe(1);
    expect(row.words_learned).toBe(1);
  });

  it('counts review attempts separately without double-counting them', () => {
    const row = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: true, review: true },
      T('2026-08-16T10:00:00.000Z'),
    );
    expect(row.attempts).toBe(1);
    expect(row.reviews).toBe(1);
  });

  it('caps how many distinct items one day can track', () => {
    let row = recordActivity(
      undefined,
      { type: 'attempt', itemKey: 'character:seed', kind: 'character', passed: true, review: false },
      T('2026-08-16T10:00:00.000Z'),
    );
    for (let i = 0; i < MAX_ITEMS_PER_DAY + 50; i += 1) {
      row = recordActivity(
        row,
        { type: 'attempt', itemKey: `character:x${i}`, kind: 'character', passed: true, review: false },
        T('2026-08-16T10:00:00.000Z'),
      );
    }
    expect(Object.keys(row.items).length).toBe(MAX_ITEMS_PER_DAY);
    // Attempts are still counted in full — only the per-item breakdown is
    // bounded, so the totals stay true however long the day was.
    expect(row.attempts).toBe(MAX_ITEMS_PER_DAY + 51);
  });

  it('never mutates the row it was given', () => {
    const before = emptyDay('2026-08-16', '2026-08-16T10:00:00.000Z');
    const snapshot = JSON.stringify(before);
    recordActivity(
      before,
      { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: true, review: false },
      T('2026-08-16T10:01:00.000Z'),
    );
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('streaks', () => {
  const now = T('2026-08-16T12:00:00.000Z');

  it('is empty for a learner with no history', () => {
    expect(streakSummary([], now)).toEqual({ current: 0, longest: 0, totalDays: 0 });
  });

  it('counts consecutive days up to today', () => {
    const summary = streakSummary(['2026-08-14', '2026-08-15', '2026-08-16'], now);
    expect(summary.current).toBe(3);
    expect(summary.longest).toBe(3);
    expect(summary.totalDays).toBe(3);
  });

  it('does not break a streak just because today has not happened yet', () => {
    // Someone who practises every evening should not open the app at breakfast
    // and be told their streak is zero.
    expect(streakSummary(['2026-08-14', '2026-08-15'], now).current).toBe(2);
  });

  it('breaks after a missed day', () => {
    expect(streakSummary(['2026-08-10', '2026-08-11'], now).current).toBe(0);
  });

  it('remembers the longest run even after it ends', () => {
    const summary = streakSummary(
      ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-08-16'],
      now,
    );
    expect(summary.current).toBe(1);
    expect(summary.longest).toBe(4);
    expect(summary.totalDays).toBe(5);
  });

  it('ignores duplicate dates', () => {
    expect(streakSummary(['2026-08-16', '2026-08-16'], now).totalDays).toBe(1);
  });

  it('counts a run that crosses a month boundary', () => {
    const summary = streakSummary(['2026-07-30', '2026-07-31', '2026-08-01'], now);
    expect(summary.longest).toBe(3);
  });
});

describe('the activity series', () => {
  const now = T('2026-08-16T12:00:00.000Z');

  it('fills in the days nothing happened', () => {
    // The zeroes are the point: a chart drawn only from the days with data
    // shows a learner practising every single day, which is the opposite of
    // what a consistency chart is for.
    const points = activitySeries(
      build([
        ['2026-08-14', { attempts: 10, active_ms: 600_000 }],
        ['2026-08-16', { attempts: 4, active_ms: 300_000 }],
      ]),
      7,
      now,
    );
    expect(points).toHaveLength(7);
    expect(points.at(-1)).toMatchObject({ date: '2026-08-16', attempts: 4, minutes: 5 });
    expect(points.find((p) => p.date === '2026-08-15')).toMatchObject({ attempts: 0, minutes: 0 });
  });

  it('returns nothing at all for a learner with no history', () => {
    expect(activitySeries({}, 7, now)).toEqual([]);
  });

  it('only offers ranges the learner has history for', () => {
    expect(availableRanges({}, now)).toEqual([7]);
    expect(availableRanges(build([['2026-08-15', {}]]), now)).toEqual([7]);
    expect(availableRanges(build([['2026-08-01', {}]]), now)).toEqual([7, 30]);
    expect(availableRanges(build([['2026-06-01', {}]]), now)).toEqual([7, 30, 90]);
    expect(availableRanges(build([['2026-01-01', {}]]), now)).toEqual([7, 30, 90, 0]);
  });
});

describe('the calendar', () => {
  const now = T('2026-08-16T12:00:00.000Z');

  it('lays August 2026 out under a Monday-first grid', () => {
    const month = calendarMonth({}, 2026, 7, now);
    // 1 August 2026 was a Saturday: five blanks, then the 1st.
    expect(month.cells.slice(0, 5).every((cell) => cell === null)).toBe(true);
    expect(month.cells[5]).toMatchObject({ date: '2026-08-01' });
    expect(month.cells.filter(Boolean)).toHaveLength(31);
  });

  it('marks days after today as future rather than as missed', () => {
    const month = calendarMonth({}, 2026, 7, now);
    const cells = month.cells.filter(Boolean) as Array<{ date: string; future: boolean }>;
    expect(cells.find((c) => c.date === '2026-08-16')!.future).toBe(false);
    expect(cells.find((c) => c.date === '2026-08-17')!.future).toBe(true);
  });

  it('bands intensity on attempts, on an absolute scale', () => {
    // Absolute rather than relative to the learner's own best day: a scale
    // that rescales itself makes a good week look identical to a bad one.
    const month = calendarMonth(
      build([
        ['2026-08-03', { attempts: 1 }],
        ['2026-08-04', { attempts: 9 }],
        ['2026-08-05', { attempts: 20 }],
        ['2026-08-06', { attempts: 60 }],
      ]),
      2026,
      7,
      now,
    );
    const level = (date: string) =>
      (month.cells.filter(Boolean) as Array<{ date: string; level: number }>).find(
        (c) => c.date === date,
      )!.level;
    expect(level('2026-08-02')).toBe(0);
    expect(level('2026-08-03')).toBe(1);
    expect(level('2026-08-04')).toBe(2);
    expect(level('2026-08-05')).toBe(3);
    expect(level('2026-08-06')).toBe(4);
  });
});

describe('insights', () => {
  const now = T('2026-08-16T12:00:00.000Z');

  it('withholds an accuracy figure until it would mean something', () => {
    // Three attempts and one miss is not "67% accurate"; it is a learner who
    // has barely started.
    const thin = activityInsights(build([['2026-08-16', { attempts: 3, passes: 2 }]]), {}, now);
    expect(thin.accuracy).toBeNull();

    const enough = activityInsights(
      build([['2026-08-16', { attempts: MIN_ATTEMPTS_FOR_ACCURACY, passes: 16 }]]),
      {},
      now,
    );
    expect(enough.accuracy).toBeCloseTo(16 / MIN_ATTEMPTS_FOR_ACCURACY, 10);
  });

  it('finds the most practised letter and word separately', () => {
    const insights = activityInsights(
      build([
        ['2026-08-15', { items: { 'character:ㅓ': 5, 'character:ㄱ': 2, 'word:apple': 3 } }],
        ['2026-08-16', { items: { 'character:ㅓ': 4, 'word:apple': 1, 'word:tree': 9 } }],
      ]),
      {},
      now,
    );
    expect(insights.mostPractisedCharacter).toEqual({ itemKey: 'ㅓ', attempts: 9 });
    expect(insights.mostPractisedWord).toEqual({ itemKey: 'tree', attempts: 9 });
  });

  it('reports nothing rather than zero when there is no history', () => {
    const insights = activityInsights({}, {}, now);
    expect(insights.mostPractisedCharacter).toBeNull();
    expect(insights.mostPractisedWord).toBeNull();
    expect(insights.accuracy).toBeNull();
    expect(insights.learnedThisWeek).toBe(0);
  });

  it('counts this week from the last seven days, not from the calendar week', () => {
    const insights = activityInsights(
      build([
        ['2026-08-16', { characters_learned: 2, words_learned: 1 }],
        ['2026-08-11', { characters_learned: 4 }],
        ['2026-08-01', { characters_learned: 99 }],
      ]),
      {},
      now,
    );
    expect(insights.learnedThisWeek).toBe(7);
  });
});

/**
 * Measured study time.
 *
 * The inference from event gaps is still there and still bounded, but it is no
 * longer the whole story: `useStudyClock` measures foreground time directly and
 * folds it in through `recordStudyTime`. These are the properties that make the
 * number on the Activity screen trustworthy.
 */
describe('measured study time', () => {
  const at = '2026-03-01T10:00:00.000Z';
  const now = new Date(at);

  it('adds measured time to the day it happened on', () => {
    const activity = recordStudyTime({}, { at, ms: 30_000 }, now);
    expect(activity[dateKey(now)]!.active_ms).toBe(30_000);
  });

  it('accumulates across flushes rather than replacing', () => {
    let activity = recordStudyTime({}, { at, ms: 15_000 }, now);
    activity = recordStudyTime(activity, { at, ms: 15_000 }, now);
    activity = recordStudyTime(activity, { at, ms: 7_500 }, now);
    expect(activity[dateKey(now)]!.active_ms).toBe(37_500);
  });

  it('refuses a stretch longer than one flush could produce', () => {
    // A device whose clock jumps, or a tab restored from a frozen state. A day
    // claiming eleven hours is a worse failure than one claiming slightly too
    // few minutes, so the outlier is clamped rather than trusted.
    const activity = recordStudyTime({}, { at, ms: 11 * 3_600_000 }, now);
    expect(activity[dateKey(now)]!.active_ms).toBe(MAX_STRETCH_MS);
  });

  it('ignores zero and negative stretches without creating a day', () => {
    expect(recordStudyTime({}, { at, ms: 0 }, now)).toEqual({});
    expect(recordStudyTime({}, { at, ms: -5_000 }, now)).toEqual({});
  });

  it('leaves the rest of the day alone', () => {
    const day = recordActivity(undefined, { type: 'attempt', itemKey: 'character:ㄱ', kind: 'character', passed: true, review: false }, now);
    const activity = recordStudyTime({ [dateKey(now)]: day }, { at, ms: 20_000 }, now);
    const updated = activity[dateKey(now)]!;
    expect(updated.attempts).toBe(day.attempts);
    expect(updated.passes).toBe(day.passes);
    expect(updated.active_ms).toBe(day.active_ms + 20_000);
  });
});

/**
 * The weekly summary.
 *
 * The numbers are simple sums; what needs pinning is the *boundaries* — which
 * days belong to which week — and the one judgement the summary makes, which is
 * when a comparison is worth showing at all.
 */
describe('weekly summary', () => {
  const day = (date: string, patch: Partial<DailyActivity> = {}): DailyActivity => ({
    ...emptyDay(date, `${date}T09:00:00.000Z`),
    attempts: 10,
    passes: 9,
    active_ms: 10 * 60_000,
    ...patch,
  });

  it('starts the week on Monday, like the calendar above it', () => {
    // 2026-03-04 is a Wednesday; 2026-03-08 is the Sunday that ends the week.
    expect(weekStart(new Date('2026-03-04T12:00:00'))).toBe('2026-03-02');
    expect(weekStart(new Date('2026-03-08T23:00:00'))).toBe('2026-03-02');
    expect(weekStart(new Date('2026-03-09T00:30:00'))).toBe('2026-03-09');
  });

  it('counts only the days inside the week', () => {
    const activity: ActivityMap = {
      '2026-03-01': day('2026-03-01'), // the Sunday before
      '2026-03-02': day('2026-03-02'),
      '2026-03-04': day('2026-03-04'),
      '2026-03-09': day('2026-03-09'), // the Monday after
    };
    const report = weeklyReport(activity, new Date('2026-03-05T12:00:00'));
    expect(report.thisWeek.daysStudied).toBe(2);
    expect(report.thisWeek.minutes).toBe(20);
  });

  it('compares with the week before, in both directions', () => {
    const activity: ActivityMap = {
      '2026-02-24': day('2026-02-24', { active_ms: 40 * 60_000, characters_learned: 5 }),
      '2026-03-03': day('2026-03-03', { active_ms: 15 * 60_000, characters_learned: 1 }),
    };
    const report = weeklyReport(activity, new Date('2026-03-05T12:00:00'));
    expect(report.minutesChange).toBe(-25);
    expect(report.learnedChange).toBe(-4);
    expect(report.comparable).toBe(true);
  });

  it('does not compare against a week the learner was not here for', () => {
    // Someone in their first week must not be told they are up 100%.
    const report = weeklyReport({ '2026-03-03': day('2026-03-03') }, new Date('2026-03-05T12:00:00'));
    expect(report.comparable).toBe(false);
  });

  it('names the busiest day, and names none when there was none', () => {
    const activity: ActivityMap = {
      '2026-03-02': day('2026-03-02', { active_ms: 5 * 60_000 }),
      '2026-03-04': day('2026-03-04', { active_ms: 22 * 60_000 }),
    };
    const report = weeklyReport(activity, new Date('2026-03-05T12:00:00'));
    expect(report.thisWeek.busiestDay).toEqual({ date: '2026-03-04', minutes: 22 });
    expect(report.lastWeek.busiestDay).toBeNull();
  });

  it('withholds an accuracy that would be noise', () => {
    const activity: ActivityMap = {
      '2026-03-03': day('2026-03-03', { attempts: 3, passes: 2 }),
    };
    const report = weeklyReport(activity, new Date('2026-03-05T12:00:00'));
    expect(report.thisWeek.accuracy).toBeNull();
  });
});
