import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { EvaluationResult } from '@hangyul-ganada/handwriting-core';

import { getFont, textFamily } from '../data/fonts';
import { strictMeaning, wordCopy } from '../data/wordCopy';
import { getWord } from '../data/vocabulary';
import type { PracticePlan } from '../domain/plan';
import { insertRescue, sessionOutcome, type ExerciseMode } from '../domain/review';
import { ChoiceExercise } from '../features/review/ChoiceExercise';
import { buildExercise } from '../features/review/exercises';
import { SessionCompleteModal } from '../features/session/SessionCompleteModal';
import { useStudyClock } from '../features/session/useStudyClock';
import { PracticeCanvasCard } from '../features/writing/PracticeCanvasCard';
import { gradingFor } from '../features/writing/useEvaluator';
import { useEntryAudio } from '../audio/useEntryAudio';
import { hapticPass, hapticRetry } from '../native/haptics';
import { useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { FeedbackState } from '../ui/FeedbackState';
import { FocusScreen } from '../ui/FocusScreen';
import { Badge } from '../ui/Chip';
import { Button } from '../ui/Button';
import { LocalizedText } from '../ui/LocalizedText';
import { ProgressBar } from '../ui/Progress';
import { SpeakerButton } from '../ui/SpeakerButton';
import { NotFoundBody } from './NotFoundPage';
import styles from './SessionPage.module.css';

/**
 * A review sitting.
 *
 * ## The queue is *received*, not built
 *
 * The Review screen resolves a plan and hands it over through the router's
 * state. This screen runs it. That is the whole of the fix for a screen that
 * promised eight questions and opened on "not found": there is no second
 * computation to disagree with the first.
 *
 * A plan is resolved here only when one did not arrive — a deep link, a
 * refresh, a shared URL. Every item in a plan has already been proved to
 * produce a question, so the render below has no "and if this one cannot be
 * asked" branch to fall down.
 *
 * ## The queue is built once and then edited
 *
 * Built once, because recomputing it as the learner works means passing an item
 * shortens the list under them and the progress bar goes backwards while they
 * are doing well. Edited, because one thing has to be able to change it: a
 * failed item is put back into the queue two exercises later rather than being
 * asked again immediately.
 *
 * That gap is the point. Re-asking the identical question the moment it is
 * missed tests whether the learner can remember an answer they were shown four
 * seconds ago, which is not a thing worth knowing — and it is what makes review
 * feel like being told off. Two exercises later they have had to hold it across
 * something else, which is the thing that was being asked in the first place.
 *
 * ## Failing a review does not un-learn anything
 *
 * `recordReview` writes to the memory row. The mastery ladder — the thing that
 * says this letter was learned — is not touched. A learner who misses ㄱ today
 * has a weaker memory of ㄱ and has still learned ㄱ, and the Letters screen
 * still shows it finished. See `domain/memory.ts`.
 */
export function ReviewSessionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { state, practicePlan, recordReview, recordHeard, startSession, completeSession } =
    useLearner();
  const location = useLocation();
  const { t } = useTranslation(['learning', 'handwriting', 'common', 'vocabulary']);
  const { locale, contentLocale } = useLocale();

  const mode = params.get('mode') as ExerciseMode | null;
  const set = params.get('set');
  const savedOnly = set === 'saved';
  const mistakesOnly = set === 'mistakes';

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
   * The plan, taken from the navigation that opened this screen.
   *
   * Frozen on mount, for the reason in the note above, and *received* rather
   * than rebuilt: the count on the Review screen and the questions here are the
   * same object. Falling back to a fresh resolution covers the routes that
   * arrive without one, which is the only case where two computations exist at
   * all — and there is only ever one of them per visit.
   */
  const initial = useRef<PracticePlan | null>(null);
  if (initial.current === null) {
    const handed = (location.state as { plan?: PracticePlan } | null)?.plan;
    initial.current =
      handed && Array.isArray(handed.items)
        ? handed
        : practicePlan({
            ...(mode ? { mode } : {}),
            ...(savedOnly ? { savedOnly } : {}),
            ...(mistakesOnly ? { mistakesOnly } : {}),
          });
  }

  const [queue, setQueue] = useState(initial.current.items);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<
    Array<{
      candidate: (typeof queue)[number];
      passed: boolean;
      hintLevel: number;
      recovery: boolean;
    }>
  >([]);
  const [finished, setFinished] = useState(false);
  const failedOnce = useRef(new Set<string>());
  const sessionId = useRef<string | null>(null);
  const writeResult = useRef<EvaluationResult | null>(null);
  const [writeStatus, setWriteStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');

  useStudyClock(!finished);

  if (sessionId.current === null && queue.length > 0) {
    sessionId.current = startSession('review', null, queue.length);
  }

  const candidate = queue[index];
  const exercise = useMemo(
    () => (candidate ? buildExercise(candidate, meaningOf, index + 1, label) : null),
    [candidate, meaningOf, index, label],
  );

  const advance = useCallback(() => {
    setWriteStatus('idle');
    writeResult.current = null;
    if (index + 1 >= queue.length) {
      if (sessionId.current) completeSession(sessionId.current);
      setFinished(true);
      return;
    }
    setIndex((n) => n + 1);
  }, [index, queue.length, completeSession]);

  const record = useCallback(
    (
      passed: boolean,
      score: number,
      extra: { hintLevel?: number; responseMs?: number; chosen?: string },
    ) => {
      if (!candidate) return;
      const key = `${candidate.kind}:${candidate.itemKey}:${candidate.skill}`;
      const recovery = failedOnce.current.has(key);
      recordReview({
        kind: candidate.kind,
        item_key: candidate.itemKey,
        skill: candidate.skill,
        mode: candidate.mode,
        passed,
        score,
        // Both, deliberately. `hint_used` is what every row written before the
        // ladder existed says, and dropping it would make the old rows read as
        // unaided; `hint_level` is what the memory model actually weighs.
        hint_used: (extra.hintLevel ?? 0) > 0,
        hint_level: extra.hintLevel ?? 0,
        ...(extra.responseMs !== undefined ? { response_ms: extra.responseMs } : {}),
        // Which wrong answer was chosen, so the confusion matrix learns what
        // this learner actually mixes this up with rather than what the design
        // assumed they would.
        ...(!passed && extra.chosen ? { confused_with: extra.chosen } : {}),
        recovery,
        session_id: sessionId.current,
      });
      setResults((prev) => [
        ...prev,
        { candidate, passed, hintLevel: extra.hintLevel ?? 0, recovery },
      ]);

      if (!passed && !recovery) {
        failedOnce.current.add(key);
        // Back into the queue, a couple of exercises further on.
        setQueue((prev) => insertRescue(prev, index, candidate));
      }
    },
    [candidate, index, recordReview],
  );

  /*
   * The writing question is dictation: "write what you hear".
   *
   * Nothing on that screen shows the Korean — the romanisation and the meaning
   * are there, the glyph is not — so the clip is the prompt and it plays on
   * arrival. The multiple-choice modes decide this for themselves inside
   * `ChoiceExercise`, which is why this is guarded on the mode.
   */
  useEntryAudio(
    candidate ? `${candidate.kind}:${candidate.itemKey}:${index}` : null,
    exercise?.audioId,
    { enabled: exercise?.mode === 'write', onPlayed: () => candidate && recordHeard(candidate.kind, candidate.itemKey) },
  );

  const handleWritten = useCallback(
    (evaluation: EvaluationResult) => {
      writeResult.current = evaluation;
      setWriteStatus(evaluation.passed ? 'correct' : 'incorrect');
      if (evaluation.passed) hapticPass();
      else hapticRetry();
      record(evaluation.passed, evaluation.score, {});
    },
    [record],
  );

  /*
   * Nothing to do — said here, rather than as "not found".
   *
   * Reachable now only by opening this route directly on a day with nothing
   * due: the Review screen does not draw a button that leads here when the plan
   * it resolved is empty. It used to be reachable on *every* path, because
   * availability was recomputed after Start and could disagree with the number
   * that had just been shown.
   */
  if (queue.length === 0) {
    return (
      <FocusScreen
        resetKey="review-empty"
        header={
          <AppHeader
            title={t('learning:review.sessionTitle')}
            onBack={() => navigate('/review')}
            transparent
          />
        }
        footer={
          <Button size="lg" fullWidth onClick={() => navigate('/review')}>
            {t('common:actions.done')}
          </Button>
        }
      >
        <div className={styles.body}>
          <p className={styles.promptLabel}>{t('learning:review.nothingDue')}</p>
        </div>
      </FocusScreen>
    );
  }

  /*
   * A question that cannot be built is skipped, not fatal.
   *
   * Every item in a resolved plan has already been proved answerable, so this
   * is unreachable by construction. It is here because the failure it replaces
   * — one unbuildable question turning the whole session into a 404 — is the
   * exact bug this page was rewritten for, and a backstop that advances is
   * strictly better than one that gives up.
   */
  if (!candidate || !exercise) {
    return <NotFoundBody messageKey="notFound.review" />;
  }

  const outcome = sessionOutcome(results, state.memory, new Date());
  const isLast = index + 1 >= queue.length;
  const word = candidate.kind === 'word' ? getWord(candidate.itemKey) : undefined;
  const copy = word ? wordCopy(word, contentLocale) : null;

  return (
    <FocusScreen
      // One review question. The position rather than the item, because a
      // missed item comes back later in the same sitting and that is a new
      // screen too.
      resetKey={`${index}:${candidate.itemKey}`}
      header={
        <>
          <AppHeader
            title={t('learning:review.sessionTitle')}
            onBack={() => navigate('/review')}
            action={
              <Badge tone="primary" filled numeric>
                {t('learning:session.counter', { current: index + 1, total: queue.length })}
              </Badge>
            }
            transparent
          />
          <div className={styles.progressRow}>
            <ProgressBar value={index / queue.length} label={t('common:progress.review')} />
          </div>
        </>
      }
    >
      <div className={styles.body}>
        {exercise.mode === 'write' ? (
          <>
            <header className={styles.prompt}>
              <p className={styles.promptLabel}>{t(`learning:${exercise.promptKey}`)}</p>
              <div className={styles.promptChar}>
                <span className={styles.promptRoman}>{exercise.romanization}</span>
                <SpeakerButton
                  audioId={exercise.audioId}
                  label={exercise.korean ?? ''}
                  size="lg"
                  onPlayed={() => recordHeard(candidate.kind, candidate.itemKey)}
                />
              </div>
              {copy && (
                <LocalizedText locale={copy.locale} className={styles.promptHint}>
                  {copy.value.meaning}
                </LocalizedText>
              )}
            </header>

            <PracticeCanvasCard
              key={`${candidate.itemKey}-${index}`}
              character={exercise.writeTarget ?? ''}
              /*
                `font_family`, not `textFamily` — the mask the evaluator grades
                against is built from this string, and Gaegu's graded face is
                one step from a false-rejection cliff. See `text_family` in
                `shared-types`: reading and grading part company at this prop.
              */
              fontFamily={font.font_family}
              fontWeight={font.weight}
              glyphScale={font.glyph_scale}
              grading={gradingFor(font)}
              /*
                The model is on the paper here exactly as it is in a lesson. A
                review is a reminder, not an exam: the learner is here because
                this has not been written for a while, and taking the model away
                would turn "let's keep this fresh" into "prove you still know
                it".
              */
              showGrid={state.settings.show_grid}
              showCenterCrosshair={state.settings.show_center_crosshair}
              status={writeStatus}
              locked={writeStatus === 'correct'}
              resultShown={writeStatus !== 'idle'}
              onEvaluated={handleWritten}
            />

            {/*
              The same minimum a lesson shows — §8, §9.

              This screen kept the praise card after the lesson lost it, which
              is the half of a change that gets missed: handwriting is graded in
              two places and only one of them was edited. A learner reviewing ㄱ
              met "That's it!" here after it had stopped appearing where they
              first learned it.

              Correct is the way on. Wrong is the one sentence that says what to
              change, and the way on — a review sitting moves forward either
              way, because the scheduler has already recorded the answer and
              re-asking inside the sitting would be teaching, not reviewing.
            */}
            {writeStatus !== 'idle' && (
              <div className={styles.after}>
                {/*
                  The same two words as the lesson — §40.

                  The correct branch here was `hg-sr-only` too, so a review
                  sitting had the same hole as a first lesson: the learner
                  writes, something happens, and the only thing on screen is a
                  Next button. One verdict component, one pair of strings, one
                  answer to "was I right", wherever the writing happened.
                */}
                <FeedbackState
                  status={writeStatus === 'correct' ? 'correct' : 'incorrect'}
                  headline={t(
                    writeStatus === 'correct'
                      ? 'common:verdict.correct'
                      : 'common:verdict.incorrect',
                  )}
                  actions={
                    <Button size="md" onClick={advance}>
                      {isLast ? t('learning:session.finish') : t('learning:session.next')}
                    </Button>
                  }
                />
              </div>
            )}
          </>
        ) : (
          <ChoiceExercise
            key={`${candidate.itemKey}-${candidate.skill}-${index}`}
            exercise={exercise}
            fontFamily={textFamily(font)}
            isLast={isLast}
            onAnswered={(result) =>
              record(result.correct, result.correct ? 1 : 0, {
                hintLevel: result.hintLevel,
                responseMs: result.responseMs,
                chosen: result.chosen,
              })
            }
            onContinue={advance}
          />
        )}
      </div>

      <SessionCompleteModal
        open={finished}
        onClose={() => navigate('/review')}
        onContinue={() => navigate('/review')}
        title={t('learning:review.completeTitle')}
        /*
          What improved and what will return — both read off the scheduler's
          real state rather than counted from the session, so the screen cannot
          promise a return that will not happen.
        */
        detail={t('learning:review.outcome', {
          practised: outcome.practised,
          firstTry: outcome.firstTry,
          comingBack: outcome.comingBack,
        })}
        passed={outcome.firstTry}
        total={outcome.practised}
      />
    </FocusScreen>
  );
}
