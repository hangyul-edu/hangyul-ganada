import type { ActivityEvent, DailyActivity, ItemProgress } from '@hangyul-ganada/shared-types';

import { dateKey } from './progress';

/**
 * The learner's own history, and every figure the Activity screen reads.
 *
 * Everything here is pure and takes the clock as an argument, so a streak that
 * spans a month can be tested in a millisecond and a bug in it can be
 * reproduced rather than waited for.
 *
 * ## What is recorded, and what is not
 *
 * One row per local calendar day the app was used, pre-aggregated — see
 * `DailyActivity` for why a day is the unit rather than an event. Nothing here
 * leaves the device: there is no account to attach it to and no server to send
 * it to, and the screen it feeds is the learner's private record rather than a
 * dashboard anyone else will ever read.
 */

/**
 * The longest gap between two events that still counts as studying.
 *
 * ## What this is now for
 *
 * Study time used to be *inferred* entirely from the gaps between recorded
 * events, because there was no foreground timer. That undercounted by design:
 * the last attempt before the app closed contributed nothing, because nothing
 * followed it to measure against, so a five-minute session that ended on a
 * correct letter reported four.
 *
 * There is a timer now — `useStudyClock` measures foreground time on the
 * screens where studying actually happens, and stops when the app is
 * backgrounded or the phone is locked. That is the authoritative figure.
 *
 * This cap survives as the bound on time inferred *between* two events on the
 * same screen, which is still how a session's first moments are accounted for
 * before the first flush. Ninety seconds is comfortably longer than reading a
 * character's introduction and writing it, and far shorter than a break.
 */
export const IDLE_GAP_MS = 90_000;

/**
 * A stretch of measured foreground time, in milliseconds.
 *
 * Folded into a day exactly like an event is, so there is one path into
 * `active_ms` and one place to reason about it.
 */
export interface StudyStretch {
  /** When the stretch ended, ISO. The day it lands in is this day. */
  at: string;
  ms: number;
}

/**
 * The most one flush may add.
 *
 * A guard, not a policy. `useStudyClock` flushes every fifteen seconds and on
 * every visibility change, so a legitimate stretch is never longer than that
 * plus a moment — but a device whose clock jumps, or a tab restored from a
 * frozen state, can produce a nonsense interval, and a day that claims eleven
 * hours of study is worse than one that claims slightly too few minutes.
 */
export const MAX_STRETCH_MS = 120_000;

/** Adds measured foreground time to a day. */
export function recordStudyTime(
  activity: ActivityMap,
  stretch: StudyStretch,
  now: Date,
): ActivityMap {
  const ms = Math.min(Math.max(0, Math.round(stretch.ms)), MAX_STRETCH_MS);
  if (ms === 0) return activity;
  const date = dateKey(now);
  const row = activity[date] ?? emptyDay(date, stretch.at);
  return {
    ...activity,
    [date]: { ...row, active_ms: row.active_ms + ms, last_at: stretch.at },
  };
}

/**
 * How many distinct items one day may track individually.
 *
 * Only used for "most practised", which needs counts rather than completeness.
 * A day with more than this many distinct items keeps the ones already being
 * counted and stops adding new keys, so the row cannot grow without bound.
 */
export const MAX_ITEMS_PER_DAY = 200;

export type ActivityMap = Record<string, DailyActivity>;

export function emptyDay(date: string, at: string): DailyActivity {
  return {
    date,
    first_at: at,
    last_at: at,
    active_ms: 0,
    attempts: 0,
    passes: 0,
    characters_learned: 0,
    words_learned: 0,
    reviews: 0,
    items: {},
  };
}

/**
 * Folds one event into a day.
 *
 * Pure: returns a new row and never mutates the one passed in, so the caller
 * can persist exactly what it put into React state.
 */
export function recordActivity(
  previous: DailyActivity | undefined,
  event: ActivityEvent,
  now: Date,
): DailyActivity {
  const at = now.toISOString();
  const date = dateKey(now);
  const row = previous ?? emptyDay(date, at);

  const sinceLast = now.getTime() - Date.parse(row.last_at);
  const gap = Number.isFinite(sinceLast) && sinceLast > 0 ? Math.min(sinceLast, IDLE_GAP_MS) : 0;

  const next: DailyActivity = {
    ...row,
    last_at: at,
    // The first event of a day has nothing before it to measure against, which
    // is why a one-attempt day reads as 0 minutes rather than as a guess.
    active_ms: row.active_ms + (previous ? gap : 0),
    items: { ...row.items },
  };

  if (event.type === 'attempt') {
    next.attempts += 1;
    if (event.passed) next.passes += 1;
    if (event.review) next.reviews += 1;
    const seen = next.items[event.itemKey];
    if (seen !== undefined) next.items[event.itemKey] = seen + 1;
    else if (Object.keys(next.items).length < MAX_ITEMS_PER_DAY) next.items[event.itemKey] = 1;
  } else if (event.kind === 'character') {
    next.characters_learned += 1;
  } else {
    next.words_learned += 1;
  }

  return next;
}

// --- Streaks -----------------------------------------------------------------

export interface StreakSummary {
  /** Consecutive days ending today or yesterday. */
  current: number;
  /** The longest run the learner has ever managed. */
  longest: number;
  /** Every day with any recorded practice. */
  totalDays: number;
}

/**
 * Streak figures from a set of dates.
 *
 * `current` allows the run to end *yesterday*: a learner who has not opened the
 * app yet today has not broken anything, and a streak that resets at midnight
 * punishes people for the hour they happen to practise. `longest` is a plain
 * historical maximum and never shrinks.
 */
export function streakSummary(dates: readonly string[], now: Date): StreakSummary {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return { current: 0, longest: 0, totalDays: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    run = isNextDay(unique[i - 1]!, unique[i]!) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const days = new Set(unique);
  const cursor = new Date(now);
  if (!days.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dateKey(cursor))) return { current: 0, longest, totalDays: unique.length };
  }
  let current = 0;
  while (days.has(dateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, longest, totalDays: unique.length };
}

function isNextDay(earlier: string, later: string): boolean {
  const previous = new Date(`${earlier}T00:00:00`);
  previous.setDate(previous.getDate() + 1);
  return dateKey(previous) === later;
}

// --- Series and calendars ----------------------------------------------------

export type ActivityRange = 7 | 30 | 90 | 0;

export interface ActivityPoint {
  date: string;
  minutes: number;
  attempts: number;
  learned: number;
}

/**
 * A continuous run of days, gaps included.
 *
 * The zeroes matter: a chart drawn only from the days with data would show a
 * learner practising every single day, which is the opposite of what a
 * consistency chart is for.
 */
export function activitySeries(
  activity: ActivityMap,
  range: ActivityRange,
  now: Date,
): ActivityPoint[] {
  const recorded = Object.keys(activity).sort();
  if (recorded.length === 0) return [];

  const end = new Date(now);
  const start = new Date(now);
  if (range === 0) {
    const first = new Date(`${recorded[0]}T00:00:00`);
    start.setTime(first.getTime());
  } else {
    start.setDate(start.getDate() - (range - 1));
  }

  const points: ActivityPoint[] = [];
  const cursor = new Date(start);
  // A guard rather than a limit: 'All' on a very old profile should not build a
  // hundred thousand points for a chart 340 px wide.
  const MAX_POINTS = 800;
  while (cursor <= end && points.length < MAX_POINTS) {
    const key = dateKey(cursor);
    const row = activity[key];
    points.push({
      date: key,
      minutes: row ? Math.round(row.active_ms / 60_000) : 0,
      attempts: row?.attempts ?? 0,
      learned: row ? row.characters_learned + row.words_learned : 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

/** Ranges worth offering, given how much history exists. */
export function availableRanges(activity: ActivityMap, now: Date): ActivityRange[] {
  const recorded = Object.keys(activity).sort();
  if (recorded.length === 0) return [7];
  const span = daysBetween(recorded[0]!, dateKey(now)) + 1;
  // A "3 months" tab on a profile four days old is a tab that shows the same
  // chart as the one beside it with more empty space.
  const ranges: ActivityRange[] = [7];
  if (span > 7) ranges.push(30);
  if (span > 30) ranges.push(90);
  if (span > 90) ranges.push(0);
  return ranges;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00`);
  const b = Date.parse(`${to}T00:00:00`);
  return Math.round((b - a) / 86_400_000);
}

export interface CalendarCell {
  date: string;
  /** 0 for nothing, 1–4 for how busy the day was. Drives the tint. */
  level: 0 | 1 | 2 | 3 | 4;
  minutes: number;
  attempts: number;
  /** After today: rendered as an empty slot, never as a missed day. */
  future: boolean;
}

export interface CalendarMonth {
  year: number;
  /** 0-indexed, as `Date` uses. */
  month: number;
  /** Leading blanks so the first day lands under its weekday, then the days. */
  cells: Array<CalendarCell | null>;
}

/**
 * One month, laid out for a Monday-first grid.
 *
 * Monday-first because the app's audience is worldwide and Monday-first is the
 * ISO-8601 week; the header labels come from `Intl` in the interface language,
 * so the column names are the learner's own.
 */
export function calendarMonth(
  activity: ActivityMap,
  year: number,
  month: number,
  now: Date,
): CalendarMonth {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // getDay() is Sunday-first; shift so Monday is 0.
  const leading = (first.getDay() + 6) % 7;
  const today = dateKey(now);

  const cells: Array<CalendarCell | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dateKey(new Date(year, month, day));
    const row = activity[key];
    const minutes = row ? Math.round(row.active_ms / 60_000) : 0;
    cells.push({
      date: key,
      level: intensity(row),
      minutes,
      attempts: row?.attempts ?? 0,
      future: key > today,
    });
  }
  return { year, month, cells };
}

/**
 * How busy a day was, on a four-step scale.
 *
 * Banded on *attempts* rather than on minutes, because attempts are counted
 * exactly and minutes are inferred. The bands are absolute rather than relative
 * to the learner's own best day: a scale that rescales itself makes a good week
 * look identical to a bad one.
 */
function intensity(row: DailyActivity | undefined): CalendarCell['level'] {
  if (!row || row.attempts === 0) return 0;
  if (row.attempts < 5) return 1;
  if (row.attempts < 15) return 2;
  if (row.attempts < 30) return 3;
  return 4;
}

// --- Insights ----------------------------------------------------------------

export interface ActivityInsights {
  /** Item key and attempt count, or null when nothing has been practised. */
  mostPractisedCharacter: { itemKey: string; attempts: number } | null;
  mostPractisedWord: { itemKey: string; attempts: number } | null;
  /** Passes ÷ attempts over the whole history. Null under `MIN_ATTEMPTS`. */
  accuracy: number | null;
  /** Items that reached `learned` in the last seven days. */
  learnedThisWeek: number;
  totalAttempts: number;
  totalMinutes: number;
}

/**
 * Below this, an accuracy percentage is noise dressed as a statistic.
 *
 * Three attempts and one miss is not "67% accurate"; it is a learner who has
 * barely started. The screen shows nothing rather than something wrong.
 */
export const MIN_ATTEMPTS_FOR_ACCURACY = 20;

export function activityInsights(
  activity: ActivityMap,
  progress: Record<string, ItemProgress>,
  now: Date,
): ActivityInsights {
  const rows = Object.values(activity);
  const attempts = rows.reduce((n, row) => n + row.attempts, 0);
  const passes = rows.reduce((n, row) => n + row.passes, 0);

  const perItem = new Map<string, number>();
  for (const row of rows) {
    for (const [key, count] of Object.entries(row.items)) {
      perItem.set(key, (perItem.get(key) ?? 0) + count);
    }
  }

  // The item keys in the activity log are progress keys (`character:ㄱ`), so
  // the kind is read off the key rather than looked up in a second table.
  const best = (kind: string) => {
    let winner: { itemKey: string; attempts: number } | null = null;
    for (const [key, count] of perItem) {
      if (!key.startsWith(`${kind}:`)) continue;
      if (!winner || count > winner.attempts) {
        winner = { itemKey: key.slice(kind.length + 1), attempts: count };
      }
    }
    return winner;
  };

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const from = dateKey(weekAgo);
  const learnedThisWeek = rows
    .filter((row) => row.date >= from)
    .reduce((n, row) => n + row.characters_learned + row.words_learned, 0);

  void progress;
  return {
    mostPractisedCharacter: best('character'),
    mostPractisedWord: best('word'),
    accuracy: attempts >= MIN_ATTEMPTS_FOR_ACCURACY ? passes / attempts : null,
    learnedThisWeek,
    totalAttempts: attempts,
    totalMinutes: Math.round(rows.reduce((n, row) => n + row.active_ms, 0) / 60_000),
  };
}

// --- The week ----------------------------------------------------------------

/**
 * What the learner did this week, and how that compares with last week.
 *
 * ## Why a week, when there is already a calendar and a streak
 *
 * They answer different questions. The calendar says *when* — it is a record.
 * The streak says *whether you showed up* — it is a habit meter, and it says
 * nothing about how much was done. Neither answers the one a learner actually
 * asks after a fortnight: **is this going anywhere?**
 *
 * A week is the smallest window where that question has an answer. A day is
 * noise: everyone has a day where nothing happened. A month is too slow to
 * act on — by the time it tells you that you have drifted, you have drifted for
 * a month.
 *
 * ## The comparison is the point
 *
 * Twenty-two minutes means nothing on its own. Twenty-two minutes when last
 * week was fifty-five means something, and so does the reverse. So every figure
 * carries its previous-week counterpart, and the screen shows the difference
 * rather than making the learner remember.
 *
 * ## What it does not do
 *
 * There is no target, no grade and no streak to protect here. A quieter week is
 * reported as a quieter week — not as a failure, not with an exhortation. This
 * is a record of what happened, and a learner who reads that they did less and
 * decides that was right is a learner the product has served properly.
 */
export interface WeekSummary {
  /** Local date of the Monday this week began. */
  start: string;
  /** Local date of the Sunday it ends on — in the future for the current week. */
  end: string;
  daysStudied: number;
  minutes: number;
  attempts: number;
  passes: number;
  charactersLearned: number;
  wordsLearned: number;
  /** Passes ÷ attempts, or null under `MIN_ATTEMPTS_FOR_ACCURACY`. */
  accuracy: number | null;
  /** The day with the most study time, or null for a week with none. */
  busiestDay: { date: string; minutes: number } | null;
}

export interface WeeklyReport {
  thisWeek: WeekSummary;
  lastWeek: WeekSummary;
  /** Minutes this week minus last week. Negative is a quieter week. */
  minutesChange: number;
  /** Items learned this week minus last week. */
  learnedChange: number;
  /** False until the learner has a previous week to be compared with. */
  comparable: boolean;
}

/**
 * The Monday of the week `date` falls in, as a local date key.
 *
 * Monday rather than Sunday because the calendar grid already starts there —
 * two definitions of "this week" in one screen is how a summary comes to
 * disagree with the chart above it.
 */
export function weekStart(date: Date): string {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  // getDay(): 0 is Sunday. Monday-first means Sunday is six days into the week.
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return dateKey(start);
}

function addDaysKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function summarise(activity: ActivityMap, start: string): WeekSummary {
  const end = addDaysKey(start, 6);
  const rows = Object.values(activity).filter((row) => row.date >= start && row.date <= end);

  const attempts = rows.reduce((n, row) => n + row.attempts, 0);
  const passes = rows.reduce((n, row) => n + row.passes, 0);
  const busiest = rows.reduce<DailyActivity | null>(
    (best, row) => (!best || row.active_ms > best.active_ms ? row : best),
    null,
  );

  return {
    start,
    end,
    // A day with a row is a day the learner opened the app and did something;
    // `recordActivity` and `recordStudyTime` are the only things that make one.
    daysStudied: rows.length,
    minutes: Math.round(rows.reduce((n, row) => n + row.active_ms, 0) / 60_000),
    attempts,
    passes,
    charactersLearned: rows.reduce((n, row) => n + row.characters_learned, 0),
    wordsLearned: rows.reduce((n, row) => n + row.words_learned, 0),
    accuracy: attempts >= MIN_ATTEMPTS_FOR_ACCURACY ? passes / attempts : null,
    busiestDay:
      busiest && busiest.active_ms > 0
        ? { date: busiest.date, minutes: Math.round(busiest.active_ms / 60_000) }
        : null,
  };
}

export function weeklyReport(activity: ActivityMap, now: Date): WeeklyReport {
  const start = weekStart(now);
  const previousStart = addDaysKey(start, -7);
  const thisWeek = summarise(activity, start);
  const lastWeek = summarise(activity, previousStart);

  return {
    thisWeek,
    lastWeek,
    minutesChange: thisWeek.minutes - lastWeek.minutes,
    learnedChange:
      thisWeek.charactersLearned +
      thisWeek.wordsLearned -
      (lastWeek.charactersLearned + lastWeek.wordsLearned),
    // Comparing against a week the learner was not here for would report a
    // triumphant increase to someone who has simply installed the app.
    comparable: lastWeek.daysStudied > 0,
  };
}
