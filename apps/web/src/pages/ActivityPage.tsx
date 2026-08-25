import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { getWord } from '../data/vocabulary';
import {
  activityInsights,
  weeklyReport,
  activitySeries,
  availableRanges,
  calendarMonth,
  learningStreak,
  type ActivityRange,
} from '../domain/activity';
import { weeklyInsights } from '../domain/review';
import { useFormatters, useLocale } from '../i18n';
import { formatDuration } from '../i18n/duration';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Card } from '../ui/Card';
import { HangyulMascot } from '../ui/HangyulMascot';
import { ScrollRow } from '../ui/ScrollRow';
import { Chip } from '../ui/Chip';
import { ChevronLeftIcon, ChevronRightIcon, FireIcon } from '../ui/icons';
import styles from './ActivityPage.module.css';

/**
 * The learner's own record of showing up.
 *
 * ## Why this screen exists
 *
 * Tapping the streak used to open Settings, which answered a question nobody
 * had asked. A streak is a claim — *you have practised seven days running* —
 * and a learner who is being asked to believe it deserves to be able to look at
 * the evidence. This is the evidence.
 *
 * ## Everything here is local, and every number is real
 *
 * There is no account and no server; the figures come from the daily roll-ups
 * in `domain/activity.ts`, which are written as the learner practises and never
 * leave the device. Nothing on this page is estimated except study time, which
 * is inferred from the gaps between recorded events and is *deliberately* an
 * underestimate — see `IDLE_GAP_MS`.
 *
 * Where there is not enough data for a figure to mean anything, the figure is
 * absent rather than zero. An accuracy of "0%" on a learner's first day is a
 * lie about their handwriting; showing nothing is the truth.
 */
export function ActivityPage() {
  const navigate = useNavigate();
  const { state } = useLearner();
  const { t } = useTranslation(['activity', 'common']);
  const { locale } = useLocale();
  const format = useFormatters();

  const now = useMemo(() => new Date(), []);
  const activity = state.activity;
  const hasHistory = Object.keys(activity).length > 0;

  const ranges = useMemo(() => availableRanges(activity, now), [activity, now]);
  const [range, setRange] = useState<ActivityRange>(7);
  const effectiveRange = ranges.includes(range) ? range : ranges[0]!;

  const [month, setMonth] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));
  const [selected, setSelected] = useState<string | null>(null);

  // The same function Home's chip reads through — see `learningStreak` for
  // the one definition of a streak day.
  const streak = useMemo(
    () => learningStreak(activity, state.settings.active_days, now),
    [activity, state.settings.active_days, now],
  );
  const series = useMemo(
    () => activitySeries(activity, effectiveRange, now),
    [activity, effectiveRange, now],
  );
  const calendar = useMemo(
    () => calendarMonth(activity, month.year, month.month, now),
    [activity, month, now],
  );
  const insights = useMemo(
    () => activityInsights(activity, state.progress, now),
    [activity, state.progress, now],
  );
  const week = useMemo(() => weeklyReport(activity, now), [activity, now]);

  /*
   * The scheduler's own observations, from the attempt log.
   *
   * Recomputed from `state.attempts` rather than stored, so a claim on this
   * screen is always about the last seven days as of now — and so there is no
   * second copy of it to fall out of step with the memory rows.
   */
  const memoryNotes = useMemo(
    () =>
      weeklyInsights(
        state.memory,
        state.attempts.map((attempt) => ({
          skill: attempt.skill,
          passed: attempt.passed,
          hintUsed: attempt.hint_used,
          at: attempt.at,
        })),
        now,
      ),
    [state.memory, state.attempts, now],
  );

  const mostPractisedWord = insights.mostPractisedWord
    ? (getWord(insights.mostPractisedWord.itemKey)?.word ?? null)
    : null;

  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(month.year, month.month, 1),
      ),
    [locale, month],
  );
  const day = selected ? activity[selected] : undefined;

  // The first month with anything in it: paging back past it is paging through
  // months the learner did not have the app.
  const earliest = useMemo(() => Object.keys(activity).sort()[0], [activity]);
  const atEarliest =
    !earliest || `${month.year}-${String(month.month + 1).padStart(2, '0')}` <= earliest.slice(0, 7);
  const atLatest = month.year === now.getFullYear() && month.month === now.getMonth();

  const shiftMonth = (delta: number) => {
    setSelected(null);
    setMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  return (
    <div className={styles.page}>
      <AppHeader title={t('activity:title')} onBack={() => navigate('/')} />

      <div className={styles.body}>
        {!hasHistory ? (
          /*
           * Day one.
           *
           * Not an empty chart with zeroes in it: a learner who has practised
           * nothing has not failed at anything, and a dashboard of noughts on
           * the first screen they open is the app telling them so. One warm
           * sentence and a way back to the lesson.
           */
          <Card tone="warm" padding="lg" className={styles.empty}>
            <HangyulMascot mood="happy" size={56} />
            <p className={styles.emptyTitle}>{t('activity:empty.title')}</p>
            <p className={styles.emptyBody}>{t('activity:empty.body')}</p>
          </Card>
        ) : (
          <>
            <Card tone="featured" padding="lg" className={styles.streakCard}>
              <div className={styles.streakLead}>
                <span className={styles.streakFlame}>
                  <FireIcon size={22} />
                </span>
                <span className={`${styles.streakValue} hg-numeric`}>
                  {format.number(streak.current)}
                </span>
                {/* The unit alone. `common:units.day` bakes the number into the
                    string, which beside a 34 px numeral reads as "3 3 days". */}
                <span className={styles.streakUnit}>
                  {t('activity:streak.unit', { count: streak.current })}
                </span>
              </div>
              <p className={styles.streakCaption}>{t('activity:streak.caption')}</p>
              <div className={styles.streakStats}>
                <Stat
                  label={t('activity:streak.longest')}
                  value={t('common:units.day', { count: streak.longest })}
                />
                <Stat
                  label={t('activity:streak.totalDays')}
                  value={t('common:units.day', { count: streak.totalDays })}
                />
                <Stat
                  label={t('activity:streak.totalTime')}
                  value={formatDuration(insights.totalMinutes, t)}
                />
              </div>
            </Card>

            {/*
              This week, before the chart.
              *
              The chart is a record and the calendar is a record; this is the
              only part of the screen that answers "is this going anywhere",
              which is the question a learner two weeks in is actually asking.
              It goes above them because an answer belongs before the evidence.
            */}
            <section className={styles.section} aria-labelledby="activity-week">
              <div className={styles.sectionHead}>
                <h2 id="activity-week" className={styles.sectionTitle}>
                  {t('activity:week.title')}
                </h2>
                <p className={styles.sectionNote}>
                  {t('activity:week.range', {
                    from: format.date(new Date(`${week.thisWeek.start}T00:00:00`), {
                      day: 'numeric',
                      month: 'short',
                    }),
                  })}
                </p>
              </div>
              <Card padding="lg">
                <div className={styles.weekGrid}>
                  <Stat
                    label={t('activity:week.days')}
                    value={t('activity:week.daysValue', { count: week.thisWeek.daysStudied })}
                  />
                  <Stat
                    label={t('activity:week.time')}
                    value={formatDuration(week.thisWeek.minutes, t)}
                  />
                  <Stat
                    label={t('activity:week.learned')}
                    value={format.number(
                      week.thisWeek.charactersLearned + week.thisWeek.wordsLearned,
                    )}
                  />
                  {week.thisWeek.accuracy !== null && (
                    <Stat
                      label={t('activity:week.accuracy')}
                      value={format.percent(week.thisWeek.accuracy)}
                    />
                  )}
                </div>
                {/*
                  The comparison, and only when there is one to make. A learner
                  in their first week is not told they are up 100%.
                */}
                {week.comparable && (
                  <p className={styles.weekChange}>
                    {week.minutesChange === 0
                      ? t('activity:week.same')
                      : t(
                          week.minutesChange > 0 ? 'activity:week.moreThanLast' : 'activity:week.lessThanLast',
                          { minutes: Math.abs(week.minutesChange) },
                        )}
                  </p>
                )}
                {week.thisWeek.daysStudied === 0 && (
                  <p className={styles.weekChange}>{t('activity:week.quiet')}</p>
                )}
              </Card>
            </section>

            <section className={styles.section} aria-labelledby="activity-chart">
              <div className={styles.sectionHead}>
                <h2 id="activity-chart" className={styles.sectionTitle}>
                  {t('activity:chart.title')}
                </h2>
              </div>
              {/* Only ranges the learner has history for: a "3 months" tab on a
                  four-day-old profile is the same chart with more empty space. */}
              <ScrollRow className={styles.ranges} role="group" aria-label={t('activity:chart.rangeAria')}>
                {ranges.map((option) => (
                  <Chip
                    key={option}
                    selected={option === effectiveRange}
                    onClick={() => setRange(option)}
                  >
                    {t(`activity:chart.range.${option}`)}
                  </Chip>
                ))}
              </ScrollRow>
              <ActivityChart
                points={series}
                label={t('activity:chart.aria')}
                emptyLabel={t('activity:chart.noneYet')}
                formatMinutes={(n) => t('activity:units.minute', { count: n })}
                locale={locale}
                onSelect={(date) => {
                  setSelected(date);
                  const picked = new Date(`${date}T00:00:00`);
                  setMonth({ year: picked.getFullYear(), month: picked.getMonth() });
                }}
                selected={selected}
              />
            </section>

            <section className={styles.section} aria-labelledby="activity-calendar">
              <div className={styles.sectionHead}>
                <h2 id="activity-calendar" className={styles.sectionTitle}>
                  {monthLabel}
                </h2>
                <div className={styles.monthNav}>
                  <button
                    type="button"
                    className={styles.monthButton}
                    onClick={() => shiftMonth(-1)}
                    disabled={atEarliest}
                    aria-label={t('activity:calendar.previous')}
                  >
                    <ChevronLeftIcon size={18} />
                  </button>
                  <button
                    type="button"
                    className={styles.monthButton}
                    onClick={() => shiftMonth(1)}
                    disabled={atLatest}
                    aria-label={t('activity:calendar.next')}
                  >
                    <ChevronRightIcon size={18} />
                  </button>
                </div>
              </div>

              <div className={styles.calendar} role="grid" aria-label={monthLabel}>
                <div className={styles.weekdays} role="row">
                  {weekdays.map((name, i) => (
                    <abbr key={i} className={styles.weekday} title={name.long} role="columnheader">
                      {name.short}
                    </abbr>
                  ))}
                </div>
                <div className={styles.days}>
                  {calendar.cells.map((cell, i) =>
                    cell === null ? (
                      <span key={`pad-${i}`} className={styles.pad} aria-hidden="true" />
                    ) : (
                      <button
                        key={cell.date}
                        type="button"
                        role="gridcell"
                        className={[
                          styles.day,
                          styles[`level${cell.level}`],
                          cell.future ? styles.future : '',
                          selected === cell.date ? styles.daySelected : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        disabled={cell.future}
                        aria-pressed={selected === cell.date}
                        aria-label={t('activity:calendar.dayAria', {
                          date: formatDate(cell.date, locale),
                          count: cell.attempts,
                        })}
                        onClick={() => setSelected((prev) => (prev === cell.date ? null : cell.date))}
                      >
                        <span aria-hidden="true">{Number(cell.date.slice(-2))}</span>
                      </button>
                    ),
                  )}
                </div>
                <div className={styles.legend} aria-hidden="true">
                  <span>{t('activity:calendar.less')}</span>
                  {[0, 1, 2, 3, 4].map((level) => (
                    <span key={level} className={`${styles.swatch} ${styles[`level${level}`]}`} />
                  ))}
                  <span>{t('activity:calendar.more')}</span>
                </div>
              </div>
            </section>

            {selected && (
              <section className={styles.section} aria-labelledby="activity-day">
                <h2 id="activity-day" className={styles.sectionTitle}>
                  {formatDate(selected, locale)}
                </h2>
                {day && day.attempts + day.characters_learned + day.words_learned > 0 ? (
                  <Card padding="md" className={styles.dayCard}>
                    <dl className={styles.dayStats}>
                      <DayStat
                        label={t('activity:day.time')}
                        value={formatDuration(Math.round(day.active_ms / 60_000), t)}
                      />
                      <DayStat
                        label={t('activity:day.attempts')}
                        value={format.number(day.attempts)}
                      />
                      <DayStat
                        label={t('activity:day.correct')}
                        value={format.number(day.passes)}
                      />
                      <DayStat
                        label={t('activity:day.charactersLearned')}
                        value={format.number(day.characters_learned)}
                      />
                      <DayStat
                        label={t('activity:day.wordsLearned')}
                        value={format.number(day.words_learned)}
                      />
                      {day.reviews > 0 && (
                        <DayStat
                          label={t('activity:day.reviews')}
                          value={format.number(day.reviews)}
                        />
                      )}
                    </dl>
                    {/* What was actually practised, in Korean, so the day is a
                        memory rather than a row of counters. */}
                    {practisedGlyphs(day.items).length > 0 && (
                      <p className={styles.dayItems} lang="ko" dir="ltr">
                        {practisedGlyphs(day.items).map((glyph) => (
                          <span key={glyph}>{glyph}</span>
                        ))}
                      </p>
                    )}
                  </Card>
                ) : (
                  <Card padding="md" className={styles.dayCard}>
                    <p className={styles.dayEmpty}>{t('activity:day.nothing')}</p>
                  </Card>
                )}
              </section>
            )}

            {(insights.mostPractisedCharacter || insights.accuracy !== null) && (
              <section className={styles.section} aria-labelledby="activity-insights">
                <h2 id="activity-insights" className={styles.sectionTitle}>
                  {t('activity:insights.title')}
                </h2>
                <ul className={styles.insights}>
                  {insights.mostPractisedCharacter && (
                    <Insight
                      label={t('activity:insights.mostPractisedCharacter')}
                      value={insights.mostPractisedCharacter.itemKey}
                      korean
                    />
                  )}
                  {/* Only when the id still resolves. A word retired from the
                      curriculum between releases would otherwise render as a
                      dash beside a label, which is a row that says nothing. */}
                  {mostPractisedWord && (
                    <Insight
                      label={t('activity:insights.mostPractisedWord')}
                      value={mostPractisedWord}
                      korean
                    />
                  )}
                  {insights.accuracy !== null && (
                    <Insight
                      label={t('activity:insights.accuracy')}
                      value={format.percent(insights.accuracy)}
                    />
                  )}
                  {insights.learnedThisWeek > 0 && (
                    <Insight
                      label={t('activity:insights.thisWeek')}
                      value={t('activity:insights.learnedCount', {
                        count: insights.learnedThisWeek,
                      })}
                    />
                  )}
                </ul>
              </section>
            )}

            {/*
              What the scheduler noticed this week.
              
              Separate from the counts above because it is a different kind of
              claim: those are arithmetic over what happened, these are
              statements about the learner's memory, and each one is shown only
              where there is enough evidence to make it. See `weeklyInsights` —
              "listening is your strongest practice type" off the back of two
              listening exercises is not an insight, it is an algorithm
              generating sentences.
            */}
            {memoryNotes.length > 0 && (
              <section className={styles.section} aria-labelledby="activity-memory">
                <h2 id="activity-memory" className={styles.sectionTitle}>
                  {t('activity:memory.title')}
                </h2>
                <ul className={styles.memoryNotes}>
                  {memoryNotes.map((note) => (
                    <li key={note.key} className={styles.memoryNote}>
                      {t(`activity:memory.${note.key}`, {
                        ...note.params,
                        skill: note.params.skill
                          ? t(`activity:memory.skill.${String(note.params.skill)}`)
                          : undefined,
                      })}
                    </li>
                  ))}
                </ul>
              </section>
            )}

          </>
        )}
      </div>
    </div>
  );
}

// --- Pieces ------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function DayStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.dayStat}>
      <dt className={styles.dayStatLabel}>{label}</dt>
      <dd className={`${styles.dayStatValue} hg-numeric`}>{value}</dd>
    </div>
  );
}

function Insight({ label, value, korean }: { label: string; value: string; korean?: boolean }) {
  return (
    <li className={styles.insight}>
      <span className={styles.insightLabel}>{label}</span>
      <span className={styles.insightValue} {...(korean ? { lang: 'ko', dir: 'ltr' } : {})}>
        {value}
      </span>
    </li>
  );
}

/**
 * The activity chart.
 *
 * Bars rather than a line, and hand-drawn from divs rather than pulled from a
 * charting library: the whole chart is one value per day on a scale that starts
 * at zero, which is thirty lines of CSS and no dependency. It also means it
 * inherits the app's own radii and colours instead of arriving with an admin
 * dashboard's.
 *
 * Every bar is a button. Tapping one selects that day, which is the same
 * selection the calendar makes — a chart you can only look at is a picture.
 */
function ActivityChart({
  points,
  label,
  emptyLabel,
  formatMinutes,
  locale,
  selected,
  onSelect,
}: {
  points: Array<{ date: string; minutes: number; attempts: number }>;
  label: string;
  emptyLabel: string;
  formatMinutes: (n: number) => string;
  locale: string;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const peak = Math.max(1, ...points.map((p) => p.attempts));
  if (points.every((p) => p.attempts === 0)) {
    return <p className={styles.chartEmpty}>{emptyLabel}</p>;
  }

  return (
    <div className={styles.chart} role="group" aria-label={label}>
      {points.map((point) => (
        <button
          key={point.date}
          type="button"
          className={`${styles.bar} ${selected === point.date ? styles.barSelected : ''}`}
          onClick={() => onSelect(point.date)}
          aria-pressed={selected === point.date}
          aria-label={`${formatDate(point.date, locale)}: ${formatMinutes(point.minutes)}`}
          title={formatDate(point.date, locale)}
        >
          {/*
            Scaled against the busiest day in view rather than an absolute
            ceiling, so a quiet week is still readable. A floor of 3% keeps a
            day with one attempt visible instead of indistinguishable from a
            day with none.
          */}
          <span
            className={styles.barFill}
            style={{ height: `${Math.max(3, (point.attempts / peak) * 100)}%` }}
          />
        </button>
      ))}
    </div>
  );
}

// --- Formatting --------------------------------------------------------------


function formatDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(
    new Date(`${date}T00:00:00`),
  );
}

/**
 * Weekday initials in the learner's own language, Monday first.
 *
 * From `Intl` rather than a hardcoded list: "M T W T F S S" is wrong in every
 * language but English, and a calendar with English column headings inside a
 * Japanese interface is the kind of detail that makes a paid app feel ported.
 */
function weekdayLabels(locale: string): Array<{ short: string; long: string }> {
  const shortFormat = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const longFormat = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(2024, 0, 1 + i);
    return { short: shortFormat.format(day), long: longFormat.format(day) };
  });
}

/** The Korean characters practised that day, most-practised first, capped. */
function practisedGlyphs(items: Record<string, number>): string[] {
  return Object.entries(items)
    .filter(([key]) => key.startsWith('character:'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([key]) => key.slice('character:'.length));
}
