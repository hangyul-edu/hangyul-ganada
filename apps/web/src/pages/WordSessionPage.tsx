import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { usePronunciation } from '../audio/PronunciationContext';
import { wordCopy } from '../data/wordCopy';
import { getFont } from '../data/fonts';
import { scheduleSteps } from '../domain/vocabularyDay';
import { ChoiceExercise } from '../features/review/ChoiceExercise';
import { WordIntro } from '../features/learning/WordIntro';
import { buildDailyQuestions } from '../features/vocabulary/dailyQuestions';
import { SessionCompleteModal } from '../features/session/SessionCompleteModal';
import { useStudyClock } from '../features/session/useStudyClock';
import { useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { FocusScreen } from '../ui/FocusScreen';
import { Badge } from '../ui/Chip';
import { ProgressBar } from '../ui/Progress';
import styles from './SessionPage.module.css';

/**
 * Today's vocabulary, as a short set of questions.
 *
 * ```
 * 엄마  meet it ─┐
 *               ├─▶ a different word ─▶ 엄마 again, from memory ─▶ …
 * 학교  meet it ─┘
 * ```
 *
 * ## What this replaced
 *
 * A lesson that showed a word and then handed the learner a canvas, once per
 * syllable. Learning 학교 meant drawing 학, then drawing 교, and being graded on
 * both. That is a *letter* exercise wearing a word's name: the shapes had
 * already been taught, and the thing the learner came for — what 학교 means, how
 * it sounds, when it is used — was the part they got least of.
 *
 * It is gone, along with the canvas, the per-syllable grader and the
 * carousel that held them. Vocabulary is seen, heard, chosen and recognised.
 * Nowhere in this file, and nowhere reachable from it, is there a pen.
 *
 * ## One session, and the learner did not have to choose it
 *
 * There is no lesson id in the route. The old screen was reached by picking a
 * category and then a numbered set out of five hundred, which is two decisions
 * before any Korean. This screen runs *today's plan* — see
 * `domain/vocabularyDay.ts` — and the only decision the learner made was how
 * many words a day they wanted.
 *
 * ## Leaving is safe
 *
 * The plan is persisted and the questions are rebuilt from it, so closing the
 * app at four of ten and coming back gives four of ten and the six words that
 * were left. The queue is rebuilt from the *stored* plan on every mount rather
 * than held in a ref, which is what makes that true without a save-on-exit.
 */
export function WordSessionPage() {
  const navigate = useNavigate();
  const {
    state,
    vocabularyDay,
    vocabularyProgressToday,
    completeDailyWord,
    recordReview,
    recordHeard,
    recordIntroduced,
    recordRecognition,
    startSession,
    completeSession,
    isSaved,
    toggleSaved,
  } = useLearner();
  const { t } = useTranslation(['vocabulary', 'learning', 'common']);
  const { locale } = useLocale();
  const { preload } = usePronunciation();

  const font = getFont(state.settings.selected_font_id);
  const meaningOf = useCallback(
    (word: Parameters<typeof wordCopy>[0]) => {
      const copy = wordCopy(word, locale);
      return { value: copy.value.meaning, locale: copy.locale };
    },
    [locale],
  );

  /**
   * The sitting's shape, frozen on mount; its wording, live.
   *
   * Two different lifetimes, and separating them is what makes both correct:
   *
   * * **The steps are frozen.** The stored plan changes as words are completed,
   *   and a queue recomputed from it would shorten under the learner — the
   *   progress bar would run backwards every time they got something right.
   *   Frozen on mount and rebuilt from the *stored* plan, so leaving and coming
   *   back resumes exactly where this stopped.
   * * **The questions are not.** They are rebuilt whenever the interface
   *   language changes, so switching to 日本語 mid-session re-renders the
   *   meanings, the options and the prompts instead of leaving a half-Japanese
   *   question on screen. The queue's *length* and order cannot change, because
   *   answerability does not depend on language — see `canAsk`.
   */
  const steps = useRef<ReturnType<typeof scheduleSteps> | null>(null);
  steps.current ??= scheduleSteps(vocabularyDay);
  const queue = useMemo(
    () => buildDailyQuestions(steps.current!, meaningOf),
    [meaningOf],
  );

  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  /** Words finished *in this sitting*, for the closing card. Not the day's total. */
  const [wordsDone, setWordsDone] = useState(0);
  const sessionId = useRef<string | null>(null);

  useStudyClock(!finished);

  if (sessionId.current === null && queue.length > 0) {
    sessionId.current = startSession('vocabulary', null, queue.length);
  }

  const current = queue[index];

  // The next two words' clips, while the learner is still on this one.
  useEffect(() => {
    preload(
      queue
        .slice(index, index + 3)
        .flatMap((question) => [question.word.audio.word, question.word.audio.example]),
    );
  }, [preload, queue, index]);

  useEffect(() => {
    if (current) recordIntroduced('word', current.word.id);
  }, [current, recordIntroduced]);

  const advance = useCallback(() => {
    // Counting the word happens here rather than on the answer, so a word is
    // credited once the learner has *seen the result* — and exactly once,
    // because `completeWord` ignores a repeat.
    if (current?.completesWord) {
      completeDailyWord(current.word.id);
      setWordsDone((n) => n + 1);
      /*
       * …and it moves the mastery ladder, not only the day's counter.
       *
       * Two different facts about a word live in two different places: the
       * day's plan records that it was *done today*, and the progress row
       * records that it has been *learned* — see `domain/mastery.ts`. Without
       * this, a learner could finish the day's ten words and have the Letters
       * and Activity screens report that they had learned none, because the
       * only thing that used to advance a word was writing it, and words are
       * not written any more.
       *
       * `recordRecognition` is the right rung: understanding a word is what
       * these questions test, and with `WORD_RULES` a word that has been heard
       * and understood is finished.
       */
      recordRecognition('word', current.word.id, true);
    }
    if (index + 1 >= queue.length) {
      if (sessionId.current) completeSession(sessionId.current);
      setFinished(true);
      return;
    }
    setIndex((n) => n + 1);
  }, [current, index, queue.length, completeDailyWord, completeSession, recordRecognition]);

  const leave = () => navigate('/words');

  if (!current) {
    /*
     * Nothing to do, and it is said here rather than by navigating somewhere.
     *
     * Reachable only by opening the session route directly on a finished day —
     * the Words screen does not offer a button that leads here when the plan is
     * empty, which is the whole point of resolving the plan before drawing the
     * button. This is the backstop, not the design.
     */
    return (
      <FocusScreen
        resetKey="words-empty"
        header={<AppHeader title={t('vocabulary:today.title')} onBack={leave} transparent />}
        footer={
          <Button size="lg" fullWidth onClick={leave}>
            {t('common:actions.done')}
          </Button>
        }
      >
        <div className={styles.body}>
          <p className={styles.promptLabel}>{t('vocabulary:today.allDone')}</p>
        </div>
      </FocusScreen>
    );
  }

  const isLast = index + 1 >= queue.length;

  /*
   * Meeting a word has one action and it belongs in the safe footer. A question
   * keeps its own Continue inside the feedback card, beside the answer it is
   * about — see `ui/FocusScreen.tsx` for why those two are not pinned together.
   */
  const footer = current.step === 'intro' ? (
    <Button size="lg" fullWidth onClick={advance}>
      {isLast ? t('learning:session.finish') : t('vocabulary:intro.next')}
    </Button>
  ) : null;

  return (
    <FocusScreen
      resetKey={`${index}:${current.word.id}:${current.step}`}
      header={
        <>
          <AppHeader
            title={t('vocabulary:today.title')}
            onBack={leave}
            action={
              /*
               * Words finished, not questions asked, and not "the word you are
               * on".
               *
               * It reads the store rather than a local tally. Both used to be
               * added together — `done + wordsDone` — which double-counted
               * every word, because `completeDailyWord` writes to the store and
               * the store is where `done` comes from. Finishing three words
               * showed six of ten.
               *
               * It is also deliberately *completed* rather than in-progress.
               * The session interleaves, so by the fourth question a learner
               * has met three words and finished none; a counter that guessed
               * at "the current word" would disagree with the Words screen the
               * learner just came from. This is the same number, on both
               * screens, meaning the same thing. See §25.
               */
              <Badge tone="primary" filled numeric>
                {t('learning:session.counter', {
                  current: vocabularyProgressToday.done,
                  total: vocabularyProgressToday.total,
                })}
              </Badge>
            }
            transparent
          />
          <div className={styles.progressRow}>
            <ProgressBar
              value={queue.length === 0 ? 1 : index / queue.length}
              label={t('vocabulary:today.progressAria')}
            />
          </div>
        </>
      }
      footer={footer}
    >
      <div className={styles.body}>
        {current.step === 'intro' ? (
          <WordIntro
            word={current.word}
            fontFamily={font.font_family}
            onHeard={() => recordHeard('word', current.word.id, true)}
            saved={isSaved('word', current.word.id)}
            onToggleSaved={() => toggleSaved('word', current.word.id)}
          />
        ) : current.exercise ? (
          <ChoiceExercise
            key={`${current.word.id}-${current.step}-${index}`}
            exercise={current.exercise}
            fontFamily={font.font_family}
            isLast={isLast}
            onAnswered={(result) => {
              recordReview({
                kind: 'word',
                item_key: current.word.id,
                skill: current.exercise!.candidate.skill,
                mode: current.exercise!.mode,
                passed: result.correct,
                score: result.correct ? 1 : 0,
                hint_used: result.hintUsed,
                response_ms: result.responseMs,
                ...(!result.correct ? { confused_with: result.chosen } : {}),
                session_id: sessionId.current,
              });
            }}
            onContinue={advance}
          />
        ) : null}
      </div>

      <SessionCompleteModal
        open={finished}
        onClose={leave}
        onContinue={leave}
        title={
          vocabularyProgressToday.complete || wordsDone > 0
            ? t('vocabulary:today.completeTitle')
            : t('learning:complete.title')
        }
        detail={t('vocabulary:today.completeDetail', { count: wordsDone })}
        /*
         * Words, and the day's goal — the same fraction as the badge above and
         * the card on the Words screen.
         *
         * This was `firstTry / queue.length`, which put "6 / 20" next to "10
         * words learned" and left the learner with two numbers about one
         * session and no way to reconcile them. The twenty was questions asked
         * and the six was answers got right first time — scheduler detail,
         * accurate, and not a thing anybody can act on at the end of a session.
         */
        passed={vocabularyProgressToday.done}
        total={vocabularyProgressToday.total}
      />
    </FocusScreen>
  );
}
