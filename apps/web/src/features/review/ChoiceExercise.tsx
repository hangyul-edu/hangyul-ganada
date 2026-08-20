import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useEntryAudio } from '../../audio/useEntryAudio';
import { Button } from '../../ui/Button';
import { FeedbackState } from '../../ui/FeedbackState';
import { LocalizedText } from '../../ui/LocalizedText';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { hapticPass, hapticRetry, hapticSelection } from '../../native/haptics';
import { usableHints } from './hints';
import type { Exercise } from './exercises';
import styles from './ChoiceExercise.module.css';

/**
 * One multiple-choice review question.
 *
 * Five modes share this component — read, produce, listen, distinguish and
 * context — because they are the same interaction with a different prompt, and
 * giving each its own screen would give each its own subtly different answer
 * behaviour. What differs is only what sits above the options.
 *
 * ## There is no retry button here, and that is the point
 *
 * A selection question is answered once: the choice is made, the right answer
 * is shown, and the only action is to continue. The writing screens have a
 * *try again* button because there is ink on a canvas that can be redrawn;
 * offering the same words after a multiple-choice question — "다시 써 보기",
 * write it again — described an action the learner had not taken and could not
 * take. See §41. The single action below is Continue in every mode.
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
    /** Rungs of the hint ladder taken before answering. 0 is unaided. */
    hintLevel: number;
    responseMs: number;
  }) => void;
  onContinue: () => void;
  isLast: boolean;
}) {
  const { t } = useTranslation(['learning', 'common']);
  const [picked, setPicked] = useState<string | null>(null);
  /** How many rungs of the ladder have been taken. 0 is unaided. */
  const [level, setLevel] = useState(0);
  const startedAt = useRef(Date.now());

  const key = `${exercise.candidate.itemKey}:${exercise.mode}`;
  useEffect(() => {
    setPicked(null);
    setLevel(0);
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
  /*
   * Which questions the clip *is* the question for. §6: the learner must never
   * have to press a speaker before they can answer.
   *
   * `listenMeaning` belongs here for the same reason `listen` does — nothing on
   * screen says which word is being asked about, so without the clip there is
   * no question. Adding a listening type and forgetting this line would produce
   * a screen with four meanings on it and no way to tell what for.
   */
  const audioIsTheQuestion =
    exercise.mode === 'listen' ||
    exercise.mode === 'listenMeaning' ||
    exercise.mode === 'distinguish';
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
      hintLevel: level,
      responseMs: Date.now() - startedAt.current,
    });
  };

  const answer = exercise.options?.find((option) => option.id === exercise.answerId);
  /*
   * What the reveal rung actually reveals.
   *
   * Taken from the option marked correct rather than passed down separately, so
   * the sentence that gives the answer away and the button that is about to be
   * highlighted cannot disagree about what the answer is.
   */
  const answerValues = {
    answer: answer?.korean ?? answer?.label ?? exercise.korean ?? '',
  };

  /*
   * The ladder, audited against this question's own answer as it will read.
   *
   * A rung is a translation key and the words around the interpolated value
   * belong to the translation, so whether it gives the answer away is a
   * property of the rendered string and of nothing the exercise builder can
   * see. `usableHints` renders each one with this component's `t` and drops any
   * that hands the answer over. See the note on that function.
   */
  const hints = usableHints(
    exercise.hints,
    (step) => t(`learning:${step.key}`, { ...step.values, ...answerValues }),
    answerValues.answer,
  );
  const shown = hints.slice(0, level);

  return (
    <div className={styles.exercise}>
      <p className={styles.prompt}>{t(`learning:${exercise.promptKey}`)}</p>

      <div className={styles.stimulus}>
        {exercise.meaning ? (
          /*
           * The prompt is a meaning, and the answers are Korean — the harder
           * direction. Rendered in the learner's own language and marked as
           * such, so a right-to-left interface lays it out correctly while the
           * Korean options below stay left-to-right.
           */
          <LocalizedText
            as="p"
            locale={exercise.meaningLocale ?? 'en'}
            className={styles.meaningPrompt}
          >
            {exercise.meaning}
          </LocalizedText>
        ) : exercise.sentence ? (
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
        {/*
          The sound, once the answer is out.

          Never before it on `produce`: the learner is being asked to find the
          Korean from its meaning, and playing the word first says it aloud.
        */}
        {exercise.audioId && (audioIsTheQuestion || picked !== null) && (
          <SpeakerButton
            audioId={exercise.sentence?.audioId ?? exercise.audioId}
            label={exercise.korean ?? exercise.sentence?.target ?? ''}
            size={exercise.mode === 'listen' ? 'lg' : 'md'}
          />
        )}
      </div>

      {/*
        The shape of the answers follows what the answers are. See the note on
        `.optionsGrid`: a Korean word belongs in a tile, a meaning belongs in a
        row, and a gap-fill's candidates belong on one line under the sentence
        they have to be read into. Three layouts, decided by the question rather
        than rotated for variety.
      */}
      <div
        className={`${styles.options} ${optionLayout(exercise)}`}
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
        /*
         * One control that gets stronger, not a row of them.
         *
         * The first press says what kind of thing the answer is; the second
         * narrows it; the last gives it up and says so. A learner who is stuck
         * presses again rather than choosing between four kinds of help, and
         * the label changes so they know what the next press will cost.
         *
         * A question with no honest help — nothing can be said about "which of
         * these two letters made this sound" that is not the answer — renders
         * no button at all, rather than a button that reveals an empty line.
         */
        hints.length > 0 ? (
          <div className={styles.hintBlock}>
            {shown.map((step) => (
              <p
                key={step.key}
                className={step.strength === 'answer' ? styles.hintAnswer : styles.hintLine}
              >
                {step.strength === 'answer'
                  ? t(`learning:${step.key}`, { ...step.values, ...answerValues })
                  : t(`learning:${step.key}`, step.values)}
              </p>
            ))}
            {level < hints.length && (
              <button
                type="button"
                className={styles.hint}
                onClick={() => setLevel((current) => current + 1)}
              >
                {t(
                  hints[level]!.strength === 'answer'
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
          status={correct ? 'correct' : 'incorrect'}
          headline={
            correct
              ? t('learning:review.right')
              : t('learning:review.notQuite')
          }
          actions={
            <Button size="md" onClick={onContinue}>
              {/*
                "Next", not "Next letter".

                This component asks about letters *and* words — in review, and
                in the daily vocabulary session — and it borrowed the letter
                lesson's label, so answering a question about 학교 offered a
                button that said "Next letter". The letter lesson keeps its
                specific wording, because there the next thing genuinely is a
                letter and naming it is better than "Next".
              */}
              {isLast ? t('learning:session.finish') : t('learning:session.continue')}
            </Button>
          }
        >
          {/*
            The answer, in one line, and no more than that.

            §42: a simple mistake gets the correct answer and stops. It used to
            render the Korean and the meaning as two bare fragments side by
            side, which reads as a label with no sentence around it; where both
            exist they are now one sentence, and in Korean that sentence takes
            the right particle — 엄마는, 사람은 — because 엄마은 is the kind of
            error a learner will notice in a language-learning app.
          */}
          {!correct && answer && (
            <p>
              {answer.korean && answer.label ? (
                <LocalizedText as="span" locale={answer.labelLocale ?? 'en'}>
                  {t('learning:review.answerIs', {
                    word: answer.korean,
                    meaning: answer.label,
                  })}
                </LocalizedText>
              ) : (
                <>
                  {answer.korean && (
                    <span lang="ko" dir="ltr" className={styles.answerKorean}>
                      {answer.korean}
                    </span>
                  )}
                  {answer.label && (
                    <LocalizedText as="span" locale={answer.labelLocale ?? 'en'}>
                      {answer.label}
                    </LocalizedText>
                  )}
                </>
              )}
            </p>
          )}
        </FeedbackState>
      )}
    </div>
  );
}

/**
 * Which of the three option layouts this question wants.
 *
 * Two options is always the pair — that mode exists to compare them. Otherwise
 * it turns on whether the options are Korean: Korean words are short and go in
 * tiles, meanings are phrases and go in rows, and a gap-fill puts its Korean on
 * one line so the sentence stays visible above it.
 */
function optionLayout(exercise: Exercise): string {
  const options = exercise.options ?? [];
  if (options.length <= 2) return styles.optionsPair!;
  if (exercise.mode === 'context') return styles.optionsChips!;
  return options.every((option) => option.korean) ? styles.optionsGrid! : '';
}
