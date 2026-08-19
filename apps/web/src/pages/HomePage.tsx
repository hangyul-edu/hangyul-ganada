import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { productName } from '../config/product';
import { CURRICULUM_UNITS } from '../data/characters';
import { weeklyReport } from '../domain/activity';
import { VOCABULARY_LESSONS, getLessonWords, usesKnownLetters } from '../data/vocabulary';
import {
  alphabetProgress,
  dailyProgress,
  levelProgress,
  nextLesson,
  vocabularyProgress,
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
  const { summary, state, reviewSummary, practice, knownLetters } = useLearner();
  const { t } = useTranslation(['home', 'common', 'vocabulary', 'learning', 'activity']);
  const { locale } = useLocale();
  const format = useFormatters();

  const now = new Date();
  const daily = dailyProgress(state.progress, summary.daily_target, now);
  const alphabet = alphabetProgress(state.progress);
  const vocabulary = vocabularyProgress(state.progress);
  const dayComplete = daily.done >= daily.total;

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

  /**
   * The word set to suggest.
   *
   * A recommendation, and only that. The first unfinished set whose letters the
   * learner has already met — or, if they are ahead of their letters
   * everywhere, simply the first unfinished set, because every set is open and
   * suggesting nothing would be worse than suggesting something ambitious.
   */
  const unfinished = VOCABULARY_LESSONS.filter(
    (candidate) => levelProgress(state.progress, getLessonWords(candidate)).ratio < 1,
  );
  const suggestedWordLesson =
    unfinished.find((candidate) =>
      getLessonWords(candidate).every((word) => usesKnownLetters(word, knownLetters)),
    ) ?? unfinished[0];

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
        {!practice.empty && (
          <Card padding="md" className={styles.plan}>
            <h2 className={styles.planTitle}>{t('home:practice.title')}</h2>
            <ul className={styles.planList}>
              {practice.reviews > 0 && (
                <li>{t('home:practice.reviews', { count: practice.reviews })}</li>
              )}
              {practice.lettersLeft > 0 && (
                <li>{t('home:practice.letters', { count: practice.lettersLeft })}</li>
              )}
              <li>{t('home:practice.words', { count: practice.words })}</li>
            </ul>
            <Button
              size="md"
              fullWidth
              onClick={() =>
                navigate(practice.reviews > 0 ? '/review/session' : `/letters/${lesson.id}`)
              }
            >
              {t('home:practice.cta')}
            </Button>
          </Card>
        )}

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
              The count, not the fraction.

              This read `0 / 2,581`, and the bar underneath it still measures
              against the whole curriculum because that is what the bar is for.
              But the *number* is the one a learner reads first, and on day
              three `12 / 2,581` says "2,569 to go" far louder than it says
              "twelve learned". The letters card keeps its fraction: 40 is a
              number a beginner can picture finishing, and 2,581 is not.
            */
            meta={format.number(vocabulary.done)}
            caption={t('home:quick.wordsCaption')}
            progress={vocabulary.ratio}
          />
        </div>

        <Link to="/review" className={styles.reviewRow}>
          <Card padding="md" className={styles.reviewCard}>
            <span className={styles.reviewIcon}>
              <ReviewIcon size={22} />
            </span>
            <span className={styles.reviewText}>
              <span className={styles.reviewTitle}>{t('home:review.title')}</span>
              <span className={styles.reviewMeta}>
                {reviewSummary.total > 0
                  ? t('home:review.count', { count: reviewSummary.total })
                  : t('home:review.empty')}
              </span>
            </span>
            {reviewSummary.total > 0 && (
              <Badge tone="primary" filled numeric>
                {format.number(reviewSummary.total)}
              </Badge>
            )}
            <ChevronRightIcon size={20} />
          </Card>
        </Link>

        {suggestedWordLesson && (
          <section className={styles.upNext} aria-labelledby="up-next-heading">
            {/*
              "214 words use only letters you have met" was a true sentence and
              it was the ranking engine talking about itself. A learner cannot
              act on it, and it invites the question it cannot answer — which
              214? So the words themselves are the answer, and the heading is
              what they are for.
            */}
            <h2 id="up-next-heading" className={styles.sectionTitle}>
              {t('home:upNext.title')}
            </h2>
            <Link to={`/words/${suggestedWordLesson.id}`} className={styles.lessonRow}>
              <span className={styles.lessonInfo}>
                {/* Named by what it is about. "Set 3" told the learner where
                    it sat in a list they had never seen; "Animals" tells them
                    what they are about to spend five minutes on. */}
                <span className={styles.lessonTitle}>
                  {t(`vocabulary:categories.${suggestedWordLesson.category}`)}
                </span>
                <span className={styles.lessonSubtitle} lang="ko" dir="ltr">
                  {suggestedWordLesson.subtitle}
                </span>
              </span>
              <ChevronRightIcon size={18} />
            </Link>
          </section>
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
