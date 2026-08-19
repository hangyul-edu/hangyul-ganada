import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { EvaluationResult } from '@hangyul-ganada/handwriting-core';

import { getFont } from '../data/fonts';
import { wordCopy } from '../data/wordCopy';
import { getWord } from '../data/vocabulary';
import { buildSession, insertRescue, sessionOutcome, type ExerciseMode } from '../domain/review';
import { ChoiceExercise } from '../features/review/ChoiceExercise';
import { buildExercise } from '../features/review/exercises';
import { SessionCompleteModal } from '../features/session/SessionCompleteModal';
import { useStudyClock } from '../features/session/useStudyClock';
import { PracticeCanvasCard } from '../features/writing/PracticeCanvasCard';
import { feedbackFor } from '../features/writing/feedback';
import { gradingFor } from '../features/writing/useEvaluator';
import { useEntryAudio } from '../audio/useEntryAudio';
import { hapticPass, hapticRetry } from '../native/haptics';
import { useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { FocusScreen } from '../ui/FocusScreen';
import { Badge } from '../ui/Chip';
import { Button } from '../ui/Button';
import { FeedbackState } from '../ui/FeedbackState';
import { LocalizedText } from '../ui/LocalizedText';
import { ProgressBar } from '../ui/Progress';
import { SpeakerButton } from '../ui/SpeakerButton';
import { NotFoundBody } from './NotFoundPage';
import styles from './SessionPage.module.css';

/**
 * A review sitting.
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
  const { state, recordReview, recordHeard, startSession, completeSession } = useLearner();
  const { t } = useTranslation(['learning', 'handwriting', 'common', 'vocabulary']);
  const { locale } = useLocale();

  const mode = params.get('mode') as ExerciseMode | null;
  const savedOnly = params.get('set') === 'saved';

  const font = getFont(state.settings.selected_font_id);
  const meaningOf = useCallback(
    (word: Parameters<typeof wordCopy>[0]) => {
      const copy = wordCopy(word, locale);
      return { value: copy.value.meaning, locale: copy.locale };
    },
    [locale],
  );

  // Frozen on mount. See the note above.
  const initial = useRef<ReturnType<typeof buildSession> | null>(null);
  if (initial.current === null) {
    initial.current = buildSession(state.progress, state.memory, new Date(), {
      ...(mode ? { mode } : {}),
      ...(savedOnly ? { only: new Set(state.settings.saved_items) } : {}),
    });
  }

  const [queue, setQueue] = useState(initial.current);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<
    Array<{ candidate: (typeof queue)[number]; passed: boolean; hintUsed: boolean; recovery: boolean }>
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
    () => (candidate ? buildExercise(candidate, meaningOf, index + 1) : null),
    [candidate, meaningOf, index],
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
    (passed: boolean, score: number, extra: { hintUsed?: boolean; responseMs?: number; chosen?: string }) => {
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
        hint_used: extra.hintUsed ?? false,
        ...(extra.responseMs !== undefined ? { response_ms: extra.responseMs } : {}),
        // Which wrong answer was chosen, so the confusion matrix learns what
        // this learner actually mixes this up with rather than what the design
        // assumed they would.
        ...(!passed && extra.chosen ? { confused_with: extra.chosen } : {}),
        recovery,
        session_id: sessionId.current,
      });
      setResults((prev) => [...prev, { candidate, passed, hintUsed: extra.hintUsed ?? false, recovery }]);

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

  if (queue.length === 0 || !candidate || !exercise) {
    return <NotFoundBody messageKey="notFound.review" />;
  }

  const outcome = sessionOutcome(results, state.memory, new Date());
  const isLast = index + 1 >= queue.length;
  const feedback =
    writeResult.current && exercise.writeTarget
      ? feedbackFor(writeResult.current, exercise.writeTarget)
      : null;
  const word = candidate.kind === 'word' ? getWord(candidate.itemKey) : undefined;
  const copy = word ? wordCopy(word, locale) : null;

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
                <span className={styles.promptRoman}>{exercise.hint}</span>
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
              fontFamily={font.font_family}
              fontWeight={font.weight}
              grading={gradingFor(font)}
              /*
                The light guide, the same as ordinary practice. A review is a
                reminder, not an exam: the learner is here because this has not
                been written for a while, and taking the model away would turn
                "let's keep this fresh" into "prove you still know it".
              */
              guide="light"
              showGrid={state.settings.show_grid}
              showCenterCrosshair={state.settings.show_center_crosshair}
              status={writeStatus}
              locked={writeStatus === 'correct'}
              resultShown={writeStatus !== 'idle'}
              onEvaluated={handleWritten}
            />

            {feedback && writeStatus !== 'idle' && (
              <FeedbackState
                status={writeStatus === 'correct' ? 'correct' : 'incorrect'}
                headline={t(`handwriting:${feedback.headlineKey}`)}
                actions={
                  <Button size="md" onClick={advance}>
                    {isLast ? t('learning:session.finish') : t('learning:session.next')}
                  </Button>
                }
              >
                <p>{t(`handwriting:${feedback.detailKey}`, feedback.detailParams)}</p>
              </FeedbackState>
            )}
          </>
        ) : (
          <ChoiceExercise
            key={`${candidate.itemKey}-${candidate.skill}-${index}`}
            exercise={exercise}
            fontFamily={font.font_family}
            isLast={isLast}
            onAnswered={(result) =>
              record(result.correct, result.correct ? 1 : 0, {
                hintUsed: result.hintUsed,
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
