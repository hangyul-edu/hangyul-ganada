import { describe, expect, it } from 'vitest';

import { dateKey, dayOrdinal } from './progress';

/**
 * The number that makes tomorrow's vocabulary different from today's.
 *
 * `dayIndex` is the only day-varying input to `pickNewWords`, so whatever
 * supplies it decides whether Today's Vocabulary is a daily plan or the same
 * ten words forever. It used to be `settings.active_days.length` — the count of
 * days the learner had *practised* on — which does not move for a learner who
 * opens the app and finishes nothing, and that is the defect these pin shut.
 *
 * The properties worth asserting are the two the plan depends on: it must not
 * move within a local day, and it must move across one.
 */
describe('the day the plan is rotated by', () => {
  it('does not move within a local calendar day', () => {
    const morning = new Date(2026, 4, 14, 0, 0, 1);
    const night = new Date(2026, 4, 14, 23, 59, 59);
    expect(dayOrdinal(morning)).toBe(dayOrdinal(night));
    expect(dateKey(morning)).toBe(dateKey(night));
  });

  it('moves by exactly one across midnight', () => {
    const before = new Date(2026, 4, 14, 23, 59, 59);
    const after = new Date(2026, 4, 15, 0, 0, 1);
    expect(dayOrdinal(after) - dayOrdinal(before)).toBe(1);
  });

  it('advances whether or not the learner practised', () => {
    /*
      The regression this file exists for. Nothing about `dayOrdinal` can
      depend on learner state — it takes a date and nothing else — so a learner
      who abandons thirty days running still gets thirty different numbers.
    */
    const start = new Date(2026, 4, 1, 9);
    const seen = new Set<number>();
    for (let i = 0; i < 30; i += 1) {
      seen.add(dayOrdinal(new Date(2026, 4, 1 + i, 9)));
    }
    expect(seen.size).toBe(30);
    expect(Math.max(...seen) - Math.min(...seen)).toBe(29);
    expect(dayOrdinal(start)).toBe(Math.min(...seen));
  });

  it('counts a 23-hour and a 25-hour day as one day each', () => {
    /*
      Spring forward and fall back. The arithmetic is done on the *local*
      Y/M/D lifted into UTC, never on elapsed milliseconds, so a DST day is one
      day even though it is not 24 hours long. Doing it in milliseconds is how
      a learner in a DST zone gets two plans on one Sunday, or none.
    */
    for (const [y, m, d] of [
      [2026, 2, 8], // US spring forward, 23 hours
      [2026, 10, 1], // US fall back, 25 hours
      [2026, 2, 29], // EU spring forward
    ] as const) {
      const before = new Date(y, m, d - 1, 12);
      const on = new Date(y, m, d, 12);
      const after = new Date(y, m, d + 1, 12);
      expect(dayOrdinal(on) - dayOrdinal(before)).toBe(1);
      expect(dayOrdinal(after) - dayOrdinal(on)).toBe(1);
    }
  });

  it('is monotonic across a month and a year boundary', () => {
    const days = [
      new Date(2026, 0, 31, 12),
      new Date(2026, 1, 1, 12),
      new Date(2026, 11, 31, 12),
      new Date(2027, 0, 1, 12),
    ];
    for (let i = 1; i < days.length; i += 1) {
      expect(dayOrdinal(days[i]!)).toBeGreaterThan(dayOrdinal(days[i - 1]!));
    }
    expect(dayOrdinal(new Date(2026, 1, 1, 12)) - dayOrdinal(new Date(2026, 0, 31, 12))).toBe(1);
    expect(dayOrdinal(new Date(2027, 0, 1, 12)) - dayOrdinal(new Date(2026, 11, 31, 12))).toBe(1);
  });

  it('agrees with the day key it has to stay in step with', () => {
    /*
      `planIsCurrent` decides "is this today's plan" from `dateKey`, and the
      rotation decides "which words" from `dayOrdinal`. If the two ever
      disagreed about where a day starts, a plan could be judged current while
      being rebuilt from a different day's rotation.
    */
    const seen = new Map<string, number>();
    for (let i = 0; i < 400; i += 1) {
      const at = new Date(2026, 0, 1 + i, 6);
      const key = dateKey(at);
      const ordinal = dayOrdinal(at);
      expect(seen.has(key) ? seen.get(key) : ordinal).toBe(ordinal);
      seen.set(key, ordinal);
    }
    expect(seen.size).toBe(400);
    expect(new Set(seen.values()).size).toBe(400);
  });
});
