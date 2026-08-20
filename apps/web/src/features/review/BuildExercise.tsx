import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../ui/Button';
import { FeedbackState } from '../../ui/FeedbackState';
import { LocalizedText } from '../../ui/LocalizedText';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { hapticPass, hapticRetry, hapticSelection } from '../../native/haptics';
import type { Exercise } from './exercises';
import styles from './BuildExercise.module.css';

/**
 * Put the word together, syllable by syllable.
 *
 * ## Why this exists
 *
 * Every other vocabulary question is a choice between four finished answers.
 * Six of them, ten times a session, and the audit's largest single finding was
 * that it reads as one screen shown over and over — a learner does not remember
 * six question types, they remember four rectangles.
 *
 * This is the one that is shaped differently, and not only decorated
 * differently. The learner is given a meaning and a tray of syllables and has
 * to *assemble* 사과 out of 사 and 과. That is a different thing to know from
 * "which of these four is 사과": it is the knowledge you need before you can
 * write the word, type it, or say it without having seen it first.
 *
 * ## Still taps, never a canvas
 *
 * Vocabulary is never handwritten in this product and this does not change
 * that — §63, and the assertion in `journey.spec.ts` that no word screen
 * contains a drawing surface. Tapping tiles is the gentlest form of the
 * "limited keyboard recall" the brief asks for: the alphabet is provided, so it
 * is recall with the pieces on the table rather than production from nothing.
 *
 * ## What happens when it is wrong
 *
 * The same as everywhere else in this app: the answer is shown, and the only
 * action is to continue. There is no retry, because a retry on a question whose
 * answer is now on screen is copying — and `ChoiceExercise` made that decision
 * first, for the same reason.
 */
export function BuildExercise({
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
    hintLevel: number;
    responseMs: number;
  }) => void;
  onContinue: () => void;
  isLast: boolean;
}) {
  const { t } = useTranslation(['learning', 'common']);
  const tiles = exercise.tiles ?? [];
  const target = exercise.korean ?? '';

  /** Tile ids in the order they were tapped. */
  const [picked, setPicked] = useState<string[]>([]);
  const [level, setLevel] = useState(0);
  const [settled, setSettled] = useState<boolean | null>(null);
  const startedAt = useRef(Date.now());

  const key = `${exercise.candidate.itemKey}:${exercise.mode}`;
  useEffect(() => {
    setPicked([]);
    setLevel(0);
    setSettled(null);
    startedAt.current = Date.now();
  }, [key]);

  const spelled = picked
    .map((id) => tiles.find((tile) => tile.id === id)?.syllable ?? '')
    .join('');

  /*
   * Answered when the tray has produced a word of the right length.
   *
   * Length rather than a Check button, because the learner already knows when
   * they have finished — the word is either as long as it should be or it is
   * not — and a button that says "I have finished tapping" is a button that
   * exists to be tapped. Getting it wrong is not punished by a lost attempt:
   * the tiles can be taken back until the last one lands.
   */
  useEffect(() => {
    if (settled !== null) return;
    const syllableCount = [...target].length;
    if (picked.length < syllableCount) return;
    const correct = spelled === target;
    setSettled(correct);
    if (correct) hapticPass();
    else hapticRetry();
    onAnswered({
      correct,
      chosen: spelled,
      hintLevel: level,
      responseMs: Date.now() - startedAt.current,
    });
    // `onAnswered` is a fresh closure each render and re-running this would
    // report the same answer twice; `settled` is the guard that makes it safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, settled]);

  const take = (id: string) => {
    if (settled !== null || picked.includes(id)) return;
    hapticSelection();
    setPicked((current) => [...current, id]);
  };

  const putBack = (id: string) => {
    if (settled !== null) return;
    hapticSelection();
    setPicked((current) => current.filter((other) => other !== id));
  };

  const shown = exercise.hints.slice(0, level);

  return (
    <div className={styles.exercise}>
      <p className={styles.prompt}>{t(`learning:${exercise.promptKey}`)}</p>

      <div className={styles.stimulus}>
        <LocalizedText
          as="p"
          locale={exercise.meaningLocale ?? 'en'}
          className={styles.meaning}
        >
          {exercise.meaning ?? ''}
        </LocalizedText>
        {/*
          The sound, only once the answer is in.

          Playing the word first would say it aloud, and the whole question is
          whether the learner can spell what they mean without being told.
        */}
        {exercise.audioId && settled !== null && (
          <SpeakerButton audioId={exercise.audioId} label={target} size="md" />
        )}
      </div>

      {/*
        The slots the word is being built in.

        Fixed to the number of syllables the word has, so the shape of the
        answer is visible from the start — a learner who can see three slots
        knows they are looking for three syllables, which is information the
        word itself would give them if it were written down.
      */}
      <div
        className={`${styles.slots} ${
          settled === true ? styles.right : settled === false ? styles.wrong : ''
        }`}
        lang="ko"
        dir="ltr"
        style={{ fontFamily }}
      >
        {[...target].map((_, index) => {
          const id = picked[index];
          const tile = id ? tiles.find((candidate) => candidate.id === id) : undefined;
          return tile ? (
            <button
              key={tile.id}
              type="button"
              className={styles.slotFilled}
              onClick={() => putBack(tile.id)}
              disabled={settled !== null}
              aria-label={t('learning:review.buildRemove', { syllable: tile.syllable })}
            >
              {tile.syllable}
            </button>
          ) : (
            <span key={`empty-${index}`} className={styles.slotEmpty} aria-hidden="true" />
          );
        })}
      </div>

      <div className={styles.tray} role="group" aria-label={t('learning:review.buildTray')}>
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className={styles.tile}
            onClick={() => take(tile.id)}
            disabled={settled !== null || picked.includes(tile.id)}
            lang="ko"
            dir="ltr"
            style={{ fontFamily }}
          >
            {tile.syllable}
          </button>
        ))}
      </div>

      {settled === null ? (
        exercise.hints.length > 0 ? (
          <div className={styles.hintBlock}>
            {shown.map((step) => (
              <p
                key={step.key}
                className={step.strength === 'answer' ? styles.hintAnswer : styles.hintLine}
              >
                {t(`learning:${step.key}`, { ...step.values, answer: target })}
              </p>
            ))}
            {level < exercise.hints.length && (
              <button
                type="button"
                className={styles.hint}
                onClick={() => setLevel((current) => current + 1)}
              >
                {t(
                  exercise.hints[level]!.strength === 'answer'
                    ? 'learning:review.showAnswer'
                    : level === 0
                      ? 'learning:review.showHint'
                      : 'learning:review.showMoreHint',
                )}
              </button>
            )}
          </div>
        ) : null
      ) : (
        <FeedbackState
          status={settled ? 'correct' : 'incorrect'}
          headline={settled ? t('learning:review.right') : t('learning:review.notQuite')}
          actions={
            <Button size="md" onClick={onContinue}>
              {isLast ? t('vocabulary:session.finish') : t('vocabulary:session.next')}
            </Button>
          }
        >
          {!settled && (
            <p className={styles.answer} lang="ko" dir="ltr" style={{ fontFamily }}>
              {target}
            </p>
          )}
        </FeedbackState>
      )}
    </div>
  );
}
