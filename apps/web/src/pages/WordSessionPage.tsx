import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '../ui/ConfirmDialog';

import { usePronunciation } from '../audio/PronunciationContext';
import { strictMeaning, type wordCopy } from '../data/wordCopy';
import { getFont, textFamily } from '../data/fonts';
import { retrySteps, scheduleSteps, type WordStep } from '../domain/vocabularyDay';
import { BuildExercise } from '../features/review/BuildExercise';
import { ChoiceExercise } from '../features/review/ChoiceExercise';
import { WordIntro } from '../features/learning/WordIntro';
import { buildDailyQuestions } from '../features/vocabulary/dailyQuestions';
import { MatchExercise } from '../features/vocabulary/MatchExercise';
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
    ready,
    placementStatus,
    skipPlacement,
  } = useLearner();
  const { t } = useTranslation(['vocabulary', 'learning', 'levelTest', 'common']);
  const { locale } = useLocale();
  const { preload } = usePronunciation();

  const font = getFont(state.settings.selected_font_id);
  /*
    Strict: the learner's own language, or nothing.

    §35 and §37. `wordCopy` walks a fallback chain, which is right for reading a
    word card and wrong for asking a question — a Tamil learner offered four
    English choices cannot answer, and the app looked as though it had not
    noticed. `strictMeaning` returns null when this language has no meaning for
    the word, `buildExercise` refuses to build a question whose options are not
    all present, and the word is simply not asked about today.

    The cost is real and deliberate: a locale with no pack has no vocabulary
    questions rather than English ones. A smaller coherent lesson beats a
    mixed-language lesson.
  */
  const meaningOf = useCallback(
    (word: Parameters<typeof wordCopy>[0]) => ({
      value: strictMeaning(word, locale) ?? '',
      locale,
    }),
    [locale],
  );

  /**
   * A hint's localised fragments — a part of speech, a category, a letter family.
   *
   * Threaded in rather than resolved inside `buildExercise`, because that module
   * is pure and testable and importing `t` into it would make it neither. The
   * default in `buildExercise` is the identity function, which is fine for the
   * structural checks that use it and is *not* fine here: without this, the hint
   * on screen read "It's a vocabulary:partOfSpeech.verb", which is what it read
   * the first time this was opened in a browser.
   */
  const label = useCallback((key: string) => t(key), [t]);

  /**
   * The sitting's shape, frozen once; its wording, live.
   *
   * Two different lifetimes, and separating them is what makes both correct:
   *
   * * **The steps are frozen.** The stored plan changes as words are completed,
   *   and a queue recomputed from it would shorten under the learner — the
   *   progress bar would run backwards every time they got something right.
   *   Frozen once and rebuilt from the *stored* plan on the next visit, so
   *   leaving and coming back resumes exactly where this stopped.
   * * **The questions are not.** They are rebuilt whenever the interface
   *   language changes, so switching to 日本語 mid-session re-renders the
   *   meanings, the options and the prompts instead of leaving a half-Japanese
   *   question on screen. The queue's *length* and order cannot change, because
   *   answerability does not depend on language — see `canAsk`.
   *
   * ## "Frozen once" means once there is something to freeze
   *
   * It used to mean *on the first render*, and the difference is not academic.
   *
   * The plan comes from the store, and the store is read asynchronously. Until
   * that read lands, `vocabularyDay` is an empty placeholder — deliberately, so
   * that nothing can persist an empty plan over a real one. Freezing the queue
   * from the first render therefore froze *zero questions*, and the session
   * opened on its own "nothing to do today" backstop with a full day of words
   * sitting in the database behind it.
   *
   * It was intermittent in the worst way: on a small profile the read lands
   * before the first paint and the session is fine, and it only fails once the
   * profile is big enough for hydration to lose the race. So the freeze waits
   * for `ready`, and the queue is state rather than a ref because the component
   * has to re-render when it finally arrives.
   */
  const [steps, setSteps] = useState<ReturnType<typeof scheduleSteps> | null>(null);
  useEffect(() => {
    if (steps === null && ready) setSteps(scheduleSteps(vocabularyDay));
  }, [ready, steps, vocabularyDay]);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  /**
   * How the current question was answered, read by `advance`.
   *
   * The two are separate events — `record` fires on the answer, `advance` when
   * the learner presses on — and the day's counter moves in the second. Before
   * this it moved unconditionally, so a wrong answer completed the word and a
   * learner could finish 10/10 having missed two of them. §24, §25.
   */
  const [answeredCorrectly, setAnsweredCorrectly] = useState<boolean | null>(null);
  /**
   * Which question each word was missed on, this sitting only.
   *
   * Used to ask a different one on the retry — §27. Not persisted: losing it on
   * a reload costs the learner nothing, because the *word* is still owed either
   * way and that fact lives in the plan.
   */
  const missed = useRef<Map<string, WordStep>>(new Map());
  /** Retry questions, appended when a pass ends with words still owed. */
  const [retries, setRetries] = useState<ReturnType<typeof buildDailyQuestions>>([]);
  /** Words finished *in this sitting*, for the closing card. Not the day's total. */
  const [wordsDone, setWordsDone] = useState(0);
  const firstPass = useMemo(
    () => (steps === null ? [] : buildDailyQuestions(steps, meaningOf, label)),
    [steps, meaningOf, label],
  );
  /*
    The first pass, then whatever is still owed.

    §26 and §29: a session does not end at 8/10 having quietly dropped two words
    the learner got wrong. They go to the back and come round again, as a
    *different* question about the same taught sense, until they are answered or
    the learner leaves. Leaving is fine — the plan remembers what is owed, so
    tomorrow's first screen is today's unfinished word.
  */
  const queue = useMemo(() => [...firstPass, ...retries], [firstPass, retries]);

  const sessionId = useRef<string | null>(null);

  useStudyClock(!finished);

  /*
   * The session row is opened once, in an effect rather than during the render.
   *
   * It used to sit in the render body, which worked only because the queue was
   * non-empty on the first render — so the write happened during React's very
   * first pass and nothing complained. Now that the queue arrives with the
   * store, the same line would be calling into the learner store *while*
   * rendering this component, which React warns about and is entitled to
   * misbehave over.
   */
  useEffect(() => {
    if (sessionId.current === null && queue.length > 0) {
      sessionId.current = startSession('vocabulary', null, queue.length);
    }
  }, [queue.length, startSession]);

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
    //
    // `completes` rather than `completesWord`, because a matching grid finishes
    // as many as four words in one screen and every one of them has to move the
    // day's counter, the mastery ladder and the activity row exactly once. A
    // single-word question puts one id in here or none, so there is one path
    // for both kinds and no branch to forget. See `ScheduledStep.completes`.
    /*
      Only a correct answer completes a word — §24, §25.

      `answeredCorrectly` is null for a step that asks nothing: the introduction
      card, which teaches and moves on. §23 is explicit that meeting a word is
      not finishing it, so an intro credits nothing and a learner who reads all
      ten introductions and answers nothing still reads 0/10.
    */
    const passed = answeredCorrectly === true;
    if (answeredCorrectly === false && current) {
      // Remember *how* it was missed, so the retry asks something else.
      missed.current.set(current.word.id, current.step);
    }
    for (const wordId of passed ? (current?.completes ?? []) : []) {
      completeDailyWord(wordId);
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
      recordRecognition('word', wordId, true);
    }
    setAnsweredCorrectly(null);

    if (index + 1 >= queue.length) {
      /*
        The pass is over. Anything still owed comes round again — §26, §29.

        Read off the plan rather than off a list this component keeps, which is
        what makes it survive a reload: `completed` is persisted and a word is
        only in it once answered correctly, so "what is left" is always
        derivable and can never disagree with the bar above it. The words just
        credited are included, because `completeDailyWord` has already written
        them and this reads the result.
      */
      const owed = retrySteps(
        { ...vocabularyDay, completed: [...vocabularyDay.completed, ...(passed ? (current?.completes ?? []) : [])] },
        missed.current,
      );
      const next = buildDailyQuestions(owed, meaningOf, label);
      if (next.length > 0) {
        setRetries((previous) => [...previous, ...next]);
        setIndex((n) => n + 1);
        return;
      }
      if (sessionId.current) completeSession(sessionId.current);
      setFinished(true);
      return;
    }
    setIndex((n) => n + 1);
  }, [
    current,
    index,
    queue.length,
    completeDailyWord,
    completeSession,
    recordRecognition,
    answeredCorrectly,
    vocabularyDay,
    meaningOf,
    label,
  ]);

  const leave = () => navigate('/words');

  /*
   * The store has not answered yet, so there is nothing to say about the day.
   *
   * Not the "nothing to do" card below: that is a statement, and stating it
   * before the plan has been read is how a learner with ten words waiting was
   * told they had none. The header and the footer are the session's own
   * furniture and are drawn anyway, so this is a blank body for a fraction of a
   * second rather than a loading screen.
   */
  /*
    Before the first word, once: would you like words that match your level?

    §13. A learner who has never been placed is taught from Level 1, which is a
    sensible default and is not the same thing as knowing their level. This is
    the one moment where asking is worth an interruption — they have just
    committed to studying vocabulary, and the answer changes every word they
    are about to be shown.

    Three properties, and each is a `FAIL` line in §65 if it slips:

    * **Not mandatory.** The second answer starts them immediately, at Level 1.
    * **Asked once.** Declining is recorded, and `placementStatus` never returns
      to `untested`. A prompt that comes back every day is not a recommendation.
    * **Not shown to somebody who has been placed.** `assessed` skips it, so a
      learner who sat the test is never asked to prove it again.

    It is the app's own confirmation dialog rather than a bespoke modal: the
    shape — a question, a line of context, two answers — is exactly what that
    component is, and a second modal implementation would be a second set of
    focus-trap and escape-key bugs.

    Gated on `ready`, because before the profile has been read every learner
    looks untested — the defaults say so. Without it, somebody who was assessed
    months ago opens today's words and sees a prompt asking whether they would
    like to be assessed, for as long as IndexedDB takes to answer.
  */
  if (ready && placementStatus === 'untested') {
    return (
      <FocusScreen
        resetKey="words-placement"
        header={<AppHeader title={t('vocabulary:today.title')} onBack={leave} transparent />}
      >
        <ConfirmDialog
          open
          title={t('levelTest:placement.title')}
          body={t('levelTest:placement.body')}
          confirmLabel={t('levelTest:placement.take')}
          cancelLabel={t('levelTest:placement.start')}
          onConfirm={() => navigate('/me/level-test')}
          onCancel={skipPlacement}
          confirmTestId="placement-take"
          cancelTestId="placement-skip"
        />
      </FocusScreen>
    );
  }

  if (steps === null) {
    return (
      <FocusScreen
        resetKey="words-loading"
        header={<AppHeader title={t('vocabulary:today.title')} onBack={leave} transparent />}
      >
        <div />
      </FocusScreen>
    );
  }

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
        {current.step === 'match' && current.pairs ? (
          /*
           * The one screen that asks about four words at once.
           *
           * It reports one result per word rather than one per screen, so the
           * per-skill memory learns something about each of them — which is the
           * whole point of a group exercise, and the thing that would be lost
           * by recording a single "the grid went well".
           */
          <MatchExercise
            key={`match-${index}`}
            pairs={current.pairs}
            fontFamily={textFamily(font)}
            isLast={isLast}
            onAnswered={(results) => {
              for (const result of results) {
                recordReview({
                  kind: 'word',
                  item_key: result.wordId,
                  skill: 'meaning_recognition',
                  mode: 'read',
                  passed: result.correct,
                  score: result.correct ? 1 : 0,
                  hint_used: false,
                  hint_level: 0,
                  response_ms: result.responseMs,
                  session_id: sessionId.current,
                });
              }
            }}
            onContinue={advance}
          />
        ) : current.step === 'intro' ? (
          <WordIntro
            word={current.word}
            fontFamily={textFamily(font)}
            onHeard={() => recordHeard('word', current.word.id, true)}
            saved={isSaved('word', current.word.id)}
            onToggleSaved={() => toggleSaved('word', current.word.id)}
          />
        ) : current.exercise ? (
          (() => {
            /*
             * Two components, one recording path.
             *
             * `build` is a different screen — a tray of syllables rather than
             * four options — and it reports the same result object, so what is
             * written to the learner's memory does not depend on which
             * component asked. Splitting the recording as well as the rendering
             * is how one of them ends up quietly not counting.
             */
            const record = (result: {
              correct: boolean;
              chosen: string;
              hintLevel: number;
              responseMs: number;
            }) => {
              setAnsweredCorrectly(result.correct);
              return recordReview({
                kind: 'word',
                item_key: current.word.id,
                skill: current.exercise!.candidate.skill,
                mode: current.exercise!.mode,
                passed: result.correct,
                score: result.correct ? 1 : 0,
                hint_used: result.hintLevel > 0,
                hint_level: result.hintLevel,
                response_ms: result.responseMs,
                ...(!result.correct ? { confused_with: result.chosen } : {}),
                session_id: sessionId.current,
              });
            };

            const shared = {
              key: `${current.word.id}-${current.step}-${index}`,
              exercise: current.exercise!,
              fontFamily: textFamily(font),
              isLast,
              onAnswered: record,
              onContinue: advance,
            };

            return current.exercise!.mode === 'build' ? (
              <BuildExercise {...shared} />
            ) : (
              <ChoiceExercise {...shared} />
            );
          })()
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
