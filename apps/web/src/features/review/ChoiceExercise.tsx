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
  const heardOnly =
    exercise.mode === 'listen' ||
    exercise.mode === 'listenMeaning' ||
    exercise.mode === 'distinguish';

  /*
   * The accommodation, per question and not per profile.
   *
   * A learner who cannot use the recording presses *Can't use audio?* and the
   * clip is replaced by an equivalent visual prompt for this question only —
   * see `SoundFreeVariant`. Reset on `key` with everything else, so it is a
   * choice about the question in front of them rather than a mode they have to
   * remember they are in and later find their way out of.
   *
   * It is deliberately not remembered. The setting it replaces was remembered,
   * and the cost was that nobody who had not already found it could ever turn
   * it on — which is the defect this fixes. A control that is present on every
   * question that needs it does not need to be sticky to be findable.
   */
  const [soundFree, setSoundFree] = useState(false);
  useEffect(() => setSoundFree(false), [key]);

  const variant = soundFree ? exercise.soundFree : undefined;
  /** The question as it is actually being asked. */
  const asked: Exercise = variant
    ? { ...exercise, ...variant, audioId: undefined, meaning: undefined, sentence: undefined }
    : exercise;

  const audioIsTheQuestion = heardOnly && !variant;
  useEntryAudio(key, asked.audioId, { enabled: audioIsTheQuestion });

  const correct = picked !== null && picked === asked.answerId;

  const choose = (id: string) => {
    if (picked !== null) return;
    setPicked(id);
    const right = id === asked.answerId;
    if (right) hapticPass();
    else hapticRetry();
    onAnswered({
      correct: right,
      chosen: id,
      hintLevel: level,
      responseMs: Date.now() - startedAt.current,
    });
  };

  const answer = asked.options?.find((option) => option.id === asked.answerId);
  /*
   * What the reveal rung actually reveals.
   *
   * Taken from the option marked correct rather than passed down separately, so
   * the sentence that gives the answer away and the button that is about to be
   * highlighted cannot disagree about what the answer is.
   */
  const answerValues = {
    answer: answer?.korean ?? answer?.label ?? asked.korean ?? '',
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
      <p className={styles.prompt}>{t(`learning:${asked.promptKey}`)}</p>

      <div className={styles.stimulus}>
        {asked.meaning ? (
          /*
           * The prompt is a meaning, and the answers are Korean — the harder
           * direction. Rendered in the learner's own language and marked as
           * such, so a right-to-left interface lays it out correctly while the
           * Korean options below stay left-to-right.
           */
          <LocalizedText
            as="p"
            locale={asked.meaningLocale ?? 'en'}
            className={styles.meaningPrompt}
          >
            {asked.meaning}
          </LocalizedText>
        ) : asked.sentence ? (
          <p className={styles.sentence} lang="ko" dir="ltr" style={{ fontFamily }}>
            {asked.sentence.before}
            <span className={styles.blank} aria-label={t('learning:review.blank')}>
              {' '.repeat(Math.max(2, asked.sentence.target.length * 2))}
            </span>
            {asked.sentence.after}
          </p>
        ) : asked.korean ? (
          <p className={styles.korean} lang="ko" dir="ltr" style={{ fontFamily }}>
            {asked.korean}
          </p>
        ) : variant?.romanization ? (
          /*
           * The clip, written down.
           *
           * `lang="en"` and left-to-right: a Revised Romanization is Latin text
           * about Korean — not the learner's own language and not Korean — and
           * it has to keep its direction inside a right-to-left interface.
           */
          <p className={styles.romanizationPrompt} lang="en" dir="ltr">
            {variant.romanization}
          </p>
        ) : null}
        {/*
          Nothing stands in for the sound when the sound is the question.

          There used to be a 44px 🔊 here, directly above the button that plays
          the clip — the same action said twice, once as a control and once as a
          decoration, in an emoji that belongs to no part of this product's
          drawing. It was `aria-hidden`, so it was not even labelling anything;
          it was filling the space where a prompt would go.

          The space does not need filling. The question is the line of text
          above, the action is the one button below it, and a learner who sees a
          single obvious control does not have to work out which of two things
          to press. See `SpeakerButton`, whose `lg` size is 52px, carries the
          app's own vector icon, and already changes state while it plays.
        */}

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
        {asked.audioId && (audioIsTheQuestion || picked !== null) && (
          <SpeakerButton
            audioId={asked.sentence?.audioId ?? asked.audioId}
            label={asked.korean ?? asked.sentence?.target ?? ''}
            size={asked.mode === 'listen' ? 'lg' : 'md'}
          />
        )}
      </div>

      {/*
        The way past a question made of sound, for somebody who cannot hear it.

        Offered only while the question is still open, only on the two letter
        exercises whose whole prompt is a clip, and only where the builder could
        produce an honest substitute. A quiet text button rather than a
        prominent one: most learners never need it, and it must not read as the
        expected way to answer.

        One way, deliberately. Once pressed the question stays visual for as long
        as it is on screen; offering a way back would make it a toggle, and a
        toggle on a question is one more thing to decide about before answering.
      */}
      {picked === null && !soundFree && exercise.soundFree && (
        <button
          type="button"
          className={styles.soundFreeSwitch}
          onClick={() => setSoundFree(true)}
        >
          {t('learning:review.cannotUseAudio')}
        </button>
      )}

      {/*
        The shape of the answers follows what the answers are. See the note on
        `.optionsGrid`: a Korean word belongs in a tile, a meaning belongs in a
        row, and a gap-fill's candidates belong on one line under the sentence
        they have to be read into. Three layouts, decided by the question rather
        than rotated for variety.
      */}
      <div
        className={`${styles.options} ${optionLayout(asked)}`}
        role="group"
        aria-label={t('learning:review.optionsLabel')}
      >
        {asked.options?.map((option) => {
          const isAnswer = option.id === asked.answerId;
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
