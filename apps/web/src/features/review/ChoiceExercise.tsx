import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useEntryAudio } from '../../audio/useEntryAudio';
import { Button } from '../../ui/Button';
import { FeedbackState } from '../../ui/FeedbackState';
import { LocalizedText } from '../../ui/LocalizedText';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { hapticPass, hapticRetry, hapticSelection } from '../../native/haptics';
import type { Exercise } from './exercises';
import styles from './ChoiceExercise.module.css';

/**
 * One multiple-choice review question.
 *
 * Four modes share this component — read, listen, distinguish and context —
 * because they are the same interaction with a different prompt, and giving
 * each its own screen would give each its own subtly different answer
 * behaviour. What differs is only what sits above the options.
 *
 * ## What the learner is not told
 *
 * Not that this is a "listening exercise", not which skill it measures, not
 * that it was chosen because their listening is weak. That is the scheduler's
 * reasoning, and a learner who is told their listening is weak starts avoiding
 * listening. They are told what to do and whether they did it.
 *
 * ## Help is not failure
 *
 * The hint button shows the meaning rather than the answer, and taking it does
 * not mark the question wrong — it reduces how much the success is worth. See
 * `applyReview`: a learner who needed help remembered less strongly, and the
 * honest thing is to record that rather than either ignoring it or punishing
 * them for asking.
 */
export function ChoiceExercise({
  exercise,
  fontFamily,
  onAnswered,
  onContinue,
  isLast,
}: {
  exercise: Exercise;
  fontFamily: string;
  onAnswered: (result: {
    correct: boolean;
    chosen: string;
    hintUsed: boolean;
    responseMs: number;
  }) => void;
  onContinue: () => void;
  isLast: boolean;
}) {
  const { t } = useTranslation(['learning', 'common']);
  const [picked, setPicked] = useState<string | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const startedAt = useRef(Date.now());

  const key = `${exercise.candidate.itemKey}:${exercise.mode}`;
  useEffect(() => {
    setPicked(null);
    setHintShown(false);
    startedAt.current = Date.now();
  }, [key]);

  /*
   * A question whose prompt is a sound plays itself.
   *
   * `listen` shows no Korean at all and `distinguish` shows two letters and
   * asks which one was said: in both, the clip *is* the question, and a learner
   * who does not realise the speaker is the prompt is looking at a screen with
   * no question on it.
   *
   * `read` and `context` are deliberately silent. There the Korean is on
   * screen and the sound would hand over the answer — which is also why the
   * speaker button on those two only appears once an answer has been given.
   */
  const audioIsTheQuestion = exercise.mode === 'listen' || exercise.mode === 'distinguish';
  useEntryAudio(key, exercise.audioId, { enabled: audioIsTheQuestion });

  const correct = picked !== null && picked === exercise.answerId;

  const choose = (id: string) => {
    if (picked !== null) return;
    setPicked(id);
    const right = id === exercise.answerId;
    if (right) hapticPass();
    else hapticRetry();
    onAnswered({
      correct: right,
      chosen: id,
      hintUsed: hintShown,
      responseMs: Date.now() - startedAt.current,
    });
  };

  const answer = exercise.options?.find((option) => option.id === exercise.answerId);

  return (
    <div className={styles.exercise}>
      <p className={styles.prompt}>{t(`learning:${exercise.promptKey}`)}</p>

      <div className={styles.stimulus}>
        {exercise.sentence ? (
          <p className={styles.sentence} lang="ko" dir="ltr" style={{ fontFamily }}>
            {exercise.sentence.before}
            <span className={styles.blank} aria-label={t('learning:review.blank')}>
              {' '.repeat(Math.max(2, exercise.sentence.target.length * 2))}
            </span>
            {exercise.sentence.after}
          </p>
        ) : exercise.korean ? (
          <p className={styles.korean} lang="ko" dir="ltr" style={{ fontFamily }}>
            {exercise.korean}
          </p>
        ) : (
          <span className={styles.listenMark} aria-hidden="true">
            🔊
          </span>
        )}

        {/*
          Replay for the questions the sound belongs to, and the answer's sound
          afterwards for the ones it would have given away. Playing the example
          sentence before the blank is filled reads the missing word aloud; so
          does playing a letter's sound when the options *are* its sound.
        */}
        {exercise.audioId && (audioIsTheQuestion || picked !== null) && (
          <SpeakerButton
            audioId={exercise.sentence?.audioId ?? exercise.audioId}
            label={exercise.korean ?? exercise.sentence?.target ?? ''}
            size={exercise.mode === 'listen' ? 'lg' : 'md'}
          />
        )}
      </div>

      <div
        className={`${styles.options} ${exercise.options && exercise.options.length <= 2 ? styles.optionsPair : ''}`}
        role="group"
        aria-label={t('learning:review.optionsLabel')}
      >
        {exercise.options?.map((option) => {
          const isAnswer = option.id === exercise.answerId;
          const isPicked = option.id === picked;
          const tone =
            picked === null
              ? ''
              : isAnswer
                ? styles.right
                : isPicked
                  ? styles.wrong
                  : styles.dimmed;
          return (
            <button
              key={option.id}
              type="button"
              className={`${styles.option} ${tone}`}
              onClick={() => {
                hapticSelection();
                choose(option.id);
              }}
              disabled={picked !== null}
              lang={option.korean ? 'ko' : undefined}
            >
              {option.korean && (
                <span className={styles.optionKorean} style={{ fontFamily }} dir="ltr">
                  {option.korean}
                </span>
              )}
              {option.label && (
                <LocalizedText
                  as="span"
                  locale={option.labelLocale ?? 'en'}
                  className={styles.optionLabel}
                >
                  {option.label}
                </LocalizedText>
              )}
            </button>
          );
        })}
      </div>

      {picked === null ? (
        <button type="button" className={styles.hint} onClick={() => setHintShown(true)}>
          {hintShown ? (
            <LocalizedText as="span" locale={exercise.hintLocale ?? 'en'}>
              {exercise.hint ?? ''}
            </LocalizedText>
          ) : (
            t('learning:review.showHint')
          )}
        </button>
      ) : (
        <FeedbackState
          status={correct ? 'correct' : 'incorrect'}
          headline={
            correct
              ? t('learning:review.right')
              : t('learning:review.notQuite')
          }
          actions={
            <Button size="md" onClick={onContinue}>
              {isLast ? t('learning:session.finish') : t('learning:session.next')}
            </Button>
          }
        >
          {!correct && answer && (
            <p>
              {answer.korean ? (
                <span lang="ko" dir="ltr" className={styles.answerKorean}>
                  {answer.korean}
                </span>
              ) : null}
              {answer.label && (
                <LocalizedText as="span" locale={answer.labelLocale ?? 'en'}>
                  {answer.label}
                </LocalizedText>
              )}
            </p>
          )}
        </FeedbackState>
      )}
    </div>
  );
}
