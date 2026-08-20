import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { productName } from '../config/product';
import { CURRICULUM_UNITS } from '../data/characters';
import { weeklyReport } from '../domain/activity';
import {
  alphabetProgress,
  dailyProgress,
  nextLesson,
} from '../domain/progress';
import { resolveContent, useFormatters, useLocale } from '../i18n';
import { formatDuration } from '../i18n/duration';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Badge } from '../ui/Chip';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CircularProgress, ProgressBar } from '../ui/Progress';
import { HangyulMascot } from '../ui/HangyulMascot';
import { LocalizedText } from '../ui/LocalizedText';
import { QuoteOfTheSession } from '../ui/QuoteOfTheSession';
import { ChevronRightIcon, FireIcon, LetterIcon, ReviewIcon, WordIcon } from '../ui/icons';
import styles from './HomePage.module.css';

/**
 * Home.
 *
 * Brand, then straight into the lesson. The first row is the Hangyul logo and
 * the streak — who this is and how you are doing — and the row under it is the
 * thing the learner opened the app to do. There is no greeting banner in
 * between: "Welcome to Hangyul ganada" over a subtitle cost a third of the
 * first screen to tell someone the name of the app they had just tapped.
 *
 * One question, answered above the fold: *what do I do next?* Everything here
 * is either the answer (the featured card and its single primary button) or
 * evidence that the answer is worth acting on (the day's goal, the two
 * curriculum bars, the review count).
 *
 * Each bar measures one thing and says which — see `domain/progress.ts`, where
 * every figure on this screen is defined. The vocabulary bar counts every word
 * in the curriculum, because every word in the curriculum is open — but it says
 * so as a bar and not as a headline number; see the words card below.
 */
export function HomePage() {
  const navigate = useNavigate();
  const { summary, state, practicePlan, vocabularyProgressToday } = useLearner();
  const { t } = useTranslation(['home', 'common', 'vocabulary', 'learning', 'activity']);
  const { locale } = useLocale();
  const format = useFormatters();

  const now = new Date();
  const daily = dailyProgress(state.progress, summary.daily_target, now);
  const alphabet = alphabetProgress(state.progress);
  const dayComplete = daily.done >= daily.total;

  /**
   * The review plan, resolved before the card that describes it is drawn.
   *
   * Home used to print three lines — "8 to review, 6 letters to finish, 3
   * useful words" — assembled from three different estimates, none of which was
   * the thing its button opened. The middle line counted characters left in a
   * lesson and the button went to review; the last line counted a suggestion
   * the button could not reach at all.
   *
   * There is now one plan and the card says what is in it. See `domain/plan.ts`
   * and §47.
   */
  const review = useMemo(() => practicePlan(), [practicePlan]);

  /**
   * This week, in one line.
   *
   * Home already answers "what do I do next"; this is the only thing on it that
   * answers "am I actually doing it", and it is a line rather than a card
   * because that question deserves an honest answer and not a third of the
   * screen. The full comparison lives on the Activity screen, which is where
   * this links.
   */
  const week = useMemo(() => weeklyReport(state.activity, new Date()), [state.activity]);

  const lesson = nextLesson(state.progress);
  const unit = CURRICULUM_UNITS.find((u) => u.lesson_ids.includes(lesson.id));
  const lessonTitle = resolveContent(lesson.translations, locale);
  const started = summary.total_attempts > 0;

  return (
    <div className={styles.page}>
      <AppHeader
        variant="brand"
        title={productName(locale)}
        action={
          /* Straight to the learner's activity record. It used to open
             Settings, which answered a question nobody had asked. */
          <Link to="/me/activity" className={styles.streak} aria-label={t('home:streak.aria')}>
            <FireIcon size={15} />
            <span className="hg-numeric">
              {t('common:units.day', { count: summary.streak_days })}
            </span>
          </Link>
        }
      />

      <div className={styles.body}>
        {dayComplete && started && (
          <div className={styles.celebrate}>
            <HangyulMascot mood="cheer" size={24} />
            <span>{t('home:celebrate')}</span>
          </div>
        )}

        {/*
          Today's practice.
          
          One plan, in the order it should be done: the memories most at risk
          first, then the lesson in progress, then a little vocabulary. It is
          the answer to "what do I do next" stated as a list rather than left
          for the learner to assemble from three cards.

          Shown only once there is something to say. On a first launch there is
          no practice to have — the featured card below is the whole answer, and
          a plan reading "0 reviews, 0 letters" would be a worse first screen.
        */}
        {/*
          Today's practice: one thing, its size, and the button that starts it.

          Shown only when there is a resolved review plan to start, and it says
          that plan's own count. The plan itself travels with the navigation, so
          the number on this card and the questions the learner gets are the
          same object — the Review screen does exactly the same thing.
        */}
        {review.count > 0 && (
          <Card padding="md" className={styles.plan}>
            <h2 className={styles.planTitle}>{t('home:practice.title')}</h2>
            <p className={styles.planBody}>
              {t('home:practice.reviews', { count: review.count })}
            </p>
            <Button
              size="md"
              fullWidth
              onClick={() => navigate('/review/session', { state: { plan: review } })}
            >
              {t('home:practice.cta')}
            </Button>
          </Card>
        )}

        {/*
          What this app is for, once, to a learner who has never used it.
          
          A first-time visitor used to arrive at a lesson card with no statement
          of the proposition anywhere on the screen — Unit 1, a progress ring at
          zero, and a button. That reads as the middle of something.
          
          One sentence, and it leaves the moment there is any progress at all.
          Not a carousel, not three screens, not a dismissable banner with a
          close button to think about: `started` is the same signal the rest of
          this screen already uses, so nothing has to be remembered or stored,
          and a learner who comes back tomorrow gets the space back.
        */}
        {!started && <p className={styles.purpose}>{t('home:purpose')}</p>}

        <Card tone="featured" padding="lg" className={styles.featured}>
          <div className={styles.featuredTop}>
            <div className={styles.featuredText}>
              {unit && (
                <p className={styles.featuredUnit}>
                  {t('learning:units.badge', { index: unit.index })}
                </p>
              )}
              <LocalizedText as="h2" locale={lessonTitle.locale} className={styles.featuredTitle}>
                {lessonTitle.value.title}
              </LocalizedText>
              <p className={styles.featuredSubtitle} lang="ko" dir="ltr">
                {lesson.subtitle}
              </p>
              <p className={styles.featuredGoal}>
                {t('home:dailyGoal')}{' '}
                <strong className="hg-numeric">{format.fraction(daily.done, daily.total)}</strong>
              </p>
            </div>
            <CircularProgress
              value={daily.ratio}
              label={t('home:dailyGoalAria', { done: daily.done, total: daily.total })}
              size={92}
            />
          </div>

          <Button size="lg" fullWidth onClick={() => navigate(`/letters/${lesson.id}`)}>
            {started ? t('home:cta.continue') : t('home:cta.start')}
          </Button>
        </Card>

        {/* Only once there is a week to report. A learner on their first day is
            not shown "0 days, 0 minutes", which is true and discouraging and
            tells them nothing they did not know. */}
        {week.thisWeek.daysStudied > 0 && (
          <Link to="/me/activity" className={styles.weekRow}>
            <span className={styles.weekLabel}>{t('activity:week.title')}</span>
            <span className={styles.weekValue}>
              {t('activity:week.daysValue', { count: week.thisWeek.daysStudied })}
              <span className={styles.weekDot} aria-hidden="true">
                ·
              </span>
              {formatDuration(week.thisWeek.minutes, t)}
            </span>
            <ChevronRightIcon size={16} />
          </Link>
        )}

        <div className={styles.quickRow}>
          <QuickCard
            to="/letters"
            icon={<LetterIcon size={26} />}
            label={t('home:quick.letters')}
            meta={format.fraction(alphabet.done, alphabet.total)}
            caption={t('home:quick.lettersCaption')}
            progress={alphabet.ratio}
          />
          <QuickCard
            to="/words"
            icon={<WordIcon size={26} />}
            label={t('home:quick.words')}
            /*
              Today, not the catalogue.

              This read `12` against a bar measuring progress through the whole
              corpus. With ten thousand words behind the app that bar is a line
              that never moves and the number is a reminder of how much is left
              — the precise thing §22 says never to put in front of a beginner.
              What a learner can act on is the day: three of ten, and a bar that
              fills before they go to bed. The letters card keeps its own
              fraction, because 40 is a number somebody can picture finishing.
            */
            meta={format.fraction(vocabularyProgressToday.done, vocabularyProgressToday.total)}
            caption={t('home:quick.wordsCaption')}
            progress={vocabularyProgressToday.ratio}
          />
        </div>

        <Link to="/review" className={styles.reviewRow}>
          <Card padding="md" className={styles.reviewCard}>
            <span className={styles.reviewIcon}>
              <ReviewIcon size={22} />
            </span>
            <span className={styles.reviewText}>
              <span className={styles.reviewTitle}>{t('home:review.title')}</span>
              {/* The resolved plan's count, the same one the Review screen
                  shows and the same one its Start button runs. */}
              <span className={styles.reviewMeta}>
                {review.count > 0
                  ? t('home:review.count', { count: review.count })
                  : t('home:review.empty')}
              </span>
            </span>
            {review.count > 0 && (
              <Badge tone="primary" filled numeric>
                {format.number(review.count)}
              </Badge>
            )}
            <ChevronRightIcon size={20} />
          </Card>
        </Link>

        {/*
          Vocabulary, as today rather than as a catalogue.

          What used to sit here was a suggested *set*: "Animals · 개 · 새 · 고양이",
          which the learner tapped to open six words and start drawing
          syllables. Choosing a set was never a decision anybody could make well,
          and it is not a decision they have to make any more.
        */}
        {!vocabularyProgressToday.complete && (
          <Link to="/words" className={styles.lessonRow}>
            <span className={styles.lessonInfo}>
              <span className={styles.lessonTitle}>{t('vocabulary:today.title')}</span>
              <span className={styles.lessonSubtitle}>
                {t('vocabulary:today.remaining', {
                  count: Math.max(
                    0,
                    vocabularyProgressToday.total - vocabularyProgressToday.done,
                  ),
                })}
              </span>
            </span>
            <ChevronRightIcon size={18} />
          </Link>
        )}
      </div>

      {/*
        Ends the page, and absorbs the leftover height on a screen the content
        does not fill — see `.foot` in the stylesheet.

        A quotation rather than a fact about the catalogue. "All 2,832 words are
        open" was true, and the learner had read it the first time; the last
        thing on the screen they close the app from is better spent on the
        reason to open it again tomorrow.
      */}
      <div className={styles.foot}>
        <QuoteOfTheSession />
      </div>
    </div>
  );
}

function QuickCard({
  to,
  icon,
  label,
  meta,
  caption,
  progress,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  meta: string;
  /** Says what the number counts. A bare fraction is not a measurement. */
  caption: string;
  progress: number;
}) {
  return (
    <Link to={to} className={styles.quickLink}>
      <Card padding="md" className={styles.quickCard}>
        <span className={styles.quickIcon}>{icon}</span>
        <span className={styles.quickLabel}>{label}</span>
        <span className={`${styles.quickMeta} hg-numeric`}>{meta}</span>
        <span className={styles.quickCaption}>{caption}</span>
        <ProgressBar value={progress} label={caption} size="sm" />
      </Card>
    </Link>
  );
}
