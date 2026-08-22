import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { productName } from '../config/product';
import { CURRICULUM_UNITS } from '../data/characters';
import { weeklyReport } from '../domain/activity';
import {
  alphabetProgress,
  dailyProgress,
  knownLetters,
  nextLesson,
} from '../domain/progress';
import { resolveContent, useFormatters, useLocale } from '../i18n';
import { formatDuration } from '../i18n/duration';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CircularProgress, ProgressBar } from '../ui/Progress';
import { HangyulMascot } from '../ui/HangyulMascot';
import { LocalizedText } from '../ui/LocalizedText';
import { QuoteOfTheSession } from '../ui/QuoteOfTheSession';
import { ChevronRightIcon, FireIcon, LetterIcon, WordIcon } from '../ui/icons';
import { LEVELS } from '../domain/levelTest';
import { levelBand } from '../domain/vocabularyLevel';
import styles from './HomePage.module.css';

/**
 * Letters learned before the app suggests trying some words.
 *
 * Six vowels and five consonants — the end of unit 2. Unit 3 is *Putting them
 * together*, and eleven letters is thirty readable syllables, which is the
 * point at which a word on a card is something to read rather than a picture to
 * memorise. See `readyForWords` in `HomePage`.
 */
const READY_FOR_WORDS = 11;

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
  const { summary, state, vocabularyProgressToday } = useLearner();
  const { t } = useTranslation(['home', 'common', 'vocabulary', 'learning', 'activity', 'levelTest']);
  const { locale } = useLocale();
  const format = useFormatters();

  const now = new Date();
  const daily = dailyProgress(state.progress, summary.daily_target, now);
  const alphabet = alphabetProgress(state.progress);
  const dayComplete = daily.done >= daily.total;

  /*
   * There is no review plan on this screen any more.
   *
   * Home used to resolve one and draw a card from it. The bottom navigation has
   * a Review tab on every screen in the app; a card on the home screen offering
   * the same session was the home screen pointing at the tab bar. The plan
   * itself is unchanged and lives where it always did — `domain/plan.ts`, read
   * by the Review screen, which is the screen whose job it is.
   */

  /** The learner's level, if they have asked for one. Null until they do. */
  const level = state.settings.level_test;

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

  /**
   * The lesson to continue, or `null` once the alphabet is finished.
   *
   * `null` is the case this screen used to have no answer for. `nextLesson`
   * fell back to the last lesson, so a learner who had finished all forty
   * letters was shown the chapter they had just completed under a button
   * reading *Continue* — tap it, arrive at a lesson with every letter green,
   * come back, be offered it again. The one moment in this product that is
   * unambiguously an achievement, rendered as a dead end.
   *
   * Finishing now has its own card, and its button goes to the thing that
   * genuinely comes next: today's words.
   */
  /**
   * Whether to point the learner at the words, once, on the card they are
   * already looking at.
   *
   * Nothing in this product ever said *when* to start vocabulary. Both tracks
   * are permanently available from the tab bar, neither mentions the other, and
   * a beginner reasonably assumes the alphabet has to be finished first — forty
   * letters before a single useful word, which is not what the curriculum
   * intends and not how anyone learns a language.
   *
   * `READY_FOR_WORDS` is the point at which reading a word stops being
   * guesswork: six vowels and five consonants, which is the end of unit 2 and
   * the thirty syllables unit 3 is about. It is a suggestion and not a gate —
   * the Words tab has always been open and still is, and this changes one line
   * of caption on a card that was already there rather than adding a banner,
   * a modal or a section to dismiss.
   *
   * The count is `knownLetters` — letters *introduced* — and not the learned
   * count the card above it shows. That is the same distinction
   * `usesKnownLetters` already draws when it decides which words to offer, and
   * for the same reason: a learner who has met ㅂ in a lesson can read 바다
   * whether or not their handwriting has passed yet. Gating a suggestion on
   * handwriting would hold back exactly the learner who is finding the writing
   * hard and would most benefit from something else to do.
   *
   * It stops as soon as they take it up. `words_learned > 0` means they found
   * the words on their own or followed this, and either way the card goes back
   * to reporting the day.
   */
  const readyForWords =
    knownLetters(state.progress).size >= READY_FOR_WORDS && summary.words_learned === 0;

  const lesson = nextLesson(state.progress);
  const unit = lesson ? CURRICULUM_UNITS.find((u) => u.lesson_ids.includes(lesson.id)) : undefined;
  const lessonTitle = lesson ? resolveContent(lesson.translations, locale) : null;
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
          There is no Review card here any more, and that is the change.

          Home had two of them: a "today's practice" card with a count and a
          Start button, and further down a row linking to the Review screen. The
          bottom navigation has a Review tab on every screen in the app, and it
          is the third of five. A learner who wants to review taps Review; a
          card on the home screen offering the same action is the home screen
          telling them where the tab bar is.

          What the space is used for instead is the one thing the tab bar cannot
          say: where their vocabulary is, and whether the words they are being
          given match it. See the level card below.
        */}
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

        {lesson && lessonTitle ? (
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
        ) : (
          /*
            The alphabet is finished.

            A real end state, not a re-offer of the last chapter. It says the
            thing that happened, and its button goes to what actually comes
            next — the day's words — with the day's own count on it, because
            the letters-a-day goal is a goal there is nothing left to spend on.

            The letters are still one tap away in the row below and on the
            Letters screen, so this closes nothing off; it stops the screen
            pretending there is a chapter left to open.
          */
          <Card tone="featured" padding="lg" className={styles.featured} data-testid="alphabet-done">
            <div className={styles.featuredTop}>
              <div className={styles.featuredText}>
                <p className={styles.featuredUnit}>{t('home:finished.badge')}</p>
                <h2 className={styles.featuredTitle}>{t('home:finished.title')}</h2>
                <p className={styles.featuredSubtitle}>
                  {t('home:finished.body', { count: alphabet.total })}
                </p>
                <p className={styles.featuredGoal}>
                  {t('home:finished.goal')}{' '}
                  <strong className="hg-numeric">
                    {format.fraction(
                      vocabularyProgressToday.done,
                      vocabularyProgressToday.total,
                    )}
                  </strong>
                </p>
              </div>
              {/*
                No ring on this card.

                The lesson card's ring measures the day and belongs there. Here
                it measured the day's *words* and printed "0 %" beside the words
                "You can read Hangul" — a headline saying finished and a dial
                saying nothing done, on the same line. The fraction above says
                the same thing without contradicting the sentence next to it.
              */}
            </div>

            <Button size="lg" fullWidth onClick={() => navigate('/words')}>
              {t('home:finished.cta')}
            </Button>
          </Card>
        )}

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
            caption={
              readyForWords ? t('home:quick.wordsReady') : t('home:quick.wordsCaption')
            }
            suggested={readyForWords}
            progress={vocabularyProgressToday.ratio}
          />
        </div>

        {/*
          The learner's vocabulary level, which is what this space is for now.

          Before the test it is an invitation with a reason attached — *find
          your level and get words that match it* — and it is the only place in
          the product that asks. After the test it is a number, a band and a way
          back to it. No ring, no badge, no progress towards the next level:
          this is a measurement somebody asked for, not a game they are playing.
        */}
        <Link to="/me/level-test" className={styles.levelRow} data-testid="home-level">
          <Card padding="md" className={styles.levelCard}>
            <span className={styles.levelText}>
              <span className={styles.levelTitle}>{t('levelTest:home.title')}</span>
              {level ? (
                <span className={styles.levelValue}>
                  <span className="hg-numeric">
                    {t('levelTest:home.value', { level: level.level, levels: LEVELS })}
                  </span>
                  <span className={styles.levelBand}>
                    {t(`levelTest:bands.${levelBand(level.level)}`)}
                  </span>
                </span>
              ) : (
                <span className={styles.levelInvite}>{t('levelTest:home.invite')}</span>
              )}
            </span>
            <span className={styles.levelCta}>
              {level ? t('levelTest:home.retake') : t('levelTest:home.cta')}
            </span>
            <ChevronRightIcon size={20} />
          </Card>
        </Link>

        {/*
          The day's words are the Words card above, and nothing else.

          A second row sat here — "Today's words · 10 left today" — directly
          under a card reading "Words 0/10 · today's words", pointing at the
          same screen. Two ways of writing one fraction, one under the other,
          on the first screen anybody sees.

          What used to be here before either of them was a suggested *set*:
          "Animals · 개 · 새 · 고양이". Choosing a set was never a decision
          anybody could make well, and it is not a decision they have to make
          any more.
        */}
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
  suggested = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  meta: string;
  /** Says what the number counts. A bare fraction is not a measurement. */
  caption: string;
  progress: number;
  /**
   * Draws the caption in the accent colour instead of the tertiary one.
   *
   * The card is otherwise identical — same size, same position, same
   * navigation. This is a suggestion, not a state change, and it should read
   * like one.
   */
  suggested?: boolean;
}) {
  return (
    <Link to={to} className={styles.quickLink}>
      <Card padding="md" className={styles.quickCard}>
        <span className={styles.quickIcon}>{icon}</span>
        <span className={styles.quickLabel}>{label}</span>
        <span className={`${styles.quickMeta} hg-numeric`}>{meta}</span>
        <span className={`${styles.quickCaption} ${suggested ? styles.quickSuggest : ''}`}>
          {caption}
        </span>
        <ProgressBar value={progress} label={caption} size="sm" />
      </Card>
    </Link>
  );
}
