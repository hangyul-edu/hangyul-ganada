import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HangulCharacter } from '@hangyul-ganada/shared-types';

import { usePronunciation } from '../../audio/PronunciationContext';
import { useEntryAudio } from '../../audio/useEntryAudio';
import { Button } from '../../ui/Button';
import { FeedbackState } from '../../ui/FeedbackState';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { recognitionOptions } from './lookAlikes';
import styles from './RecognitionStep.module.css';

/**
 * "Which one is this?"
 *
 * Writing a character proves you can copy a shape. Picking it out of three
 * near-identical shapes proves you can *read* it, which is the skill the whole
 * product is for — and it is the step that catches the learner who has been
 * tracing ㅑ while thinking it is ㅏ.
 *
 * The question is asked from the sound, not from the shape. That distinction
 * is the whole exercise: printing the syllable in the prompt would let a
 * learner match ㅏ inside 아 without reading anything, which is a shape-matching
 * game with a Korean skin on it. So the prompt is a speaker button, with the
 * romanisation under it for anyone whose sound is off — Latin letters name the
 * answer without drawing it.
 *
 * Wrong answers are the letters that are actually confusable with the right one
 * (see `lookAlikes.ts`), never filler.
 *
 * The prompt plays itself when the learner arrives. See `useEntryAudio`.
 */
export function RecognitionStep({
  character,
  fontFamily,
  seed,
  onAnswered,
  onContinue,
}: {
  character: HangulCharacter;
  fontFamily: string;
  /** Fixes the option order, so a retry is the same question. */
  seed: number;
  onAnswered: (correct: boolean) => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation(['learning', 'handwriting']);
  const { play } = usePronunciation();
  const [picked, setPicked] = useState<string | null>(null);

  const options = useMemo(
    // Asked by sound, so a letter that sounds identical to this one is not
    // offered as a wrong answer: 애 and 에 are one sound, and asking which one
    // was said is a coin toss dressed as a question. See `lookAlikes.ts`.
    () => recognitionOptions(character.character, seed, 4, true),
    [character.character, seed],
  );

  const spoken = character.sound_example ?? character.character;

  /*
   * The question is a sound, so the sound plays on arrival.
   *
   * Without it the screen reads as three letters and an unexplained button, and
   * the first thing the learner has to work out is the interface rather than
   * the Korean. Answering does not replay it and neither does getting it wrong;
   * "Hear it again" and the speaker are how a learner asks for more.
   */
  useEntryAudio(character.character, character.audio.sound);
  const correct = picked === character.character;

  const choose = (option: string) => {
    if (picked !== null) return;
    setPicked(option);
    onAnswered(option === character.character);
  };

  const retry = () => setPicked(null);

  return (
    <div className={styles.step}>
      <div className={styles.prompt}>
        <p className={styles.question}>{t('learning:recognition.question')}</p>
        <div className={styles.promptSound}>
          <SpeakerButton audioId={character.audio.sound} label={spoken} size="lg" />
          <span className={styles.promptRoman}>{character.romanization}</span>
        </div>
      </div>

      <div
        className={styles.options}
        role="group"
        aria-label={t('learning:recognition.optionsAria')}
      >
        {options.map((option) => {
          const state =
            picked === null
              ? ''
              : option === character.character
                ? styles.optionCorrect
                : option === picked
                  ? styles.optionWrong
                  : styles.optionDimmed;
          return (
            <button
              key={option}
              type="button"
              className={`${styles.option} ${state}`}
              style={{ fontFamily }}
              onClick={() => choose(option)}
              disabled={picked !== null}
              lang="ko"
              aria-label={t('learning:recognition.optionAria', { character: option })}
            >
              {option}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        /*
          Two words, and the way on — §16, §17, §21.

          This block produced the two worst strings in the product. The
          headline read `handwriting:feedback.correct.headline`, and that key
          **does not exist**: the handwriting bundle has `correct.perfect` and
          `correct.scored` and never had a `headline`. `parseMissingKeyHandler`
          turned the missing path into its last segment, capitalised — so every
          learner who answered correctly, in all thirty-two languages, was
          congratulated by the word **"Headline"**. The safety net that exists
          to stop a dotted path reaching a learner had produced something that
          looks like real copy instead, which is why nobody noticed.

          Under it sat "맞아요, 고예요." — telling somebody who has just tapped
          the tile marked 고 that the answer is 고. The screen narrating itself
          back at the learner.

          Both are gone. The verdict is the shared one every other answer in
          the product uses, and there is nothing beneath it.
        */
        <FeedbackState
          status={correct ? 'correct' : 'incorrect'}
          headline={t(correct ? 'common:verdict.correct' : 'common:verdict.incorrect')}
          actions={
            correct ? (
              <Button size="md" onClick={onContinue}>
                {t('learning:session.next')}
              </Button>
            ) : (
              <>
                <Button
                  size="md"
                  variant="ghost"
                  onClick={() => void play(character.audio.sound)}
                >
                  {t('learning:recognition.hearAgain')}
                </Button>
                <Button size="md" onClick={retry}>
                  {/*
                    "Try again", not "Write it again".

                    This read `handwriting:feedback.retry`, which in Korean is
                    다시 쓰기 — *write* it again — under a question whose only
                    action is picking one of four letters. The learner is being
                    told to do something they were never asked to do and cannot
                    do here. The retry verb has to match the question type; see
                    §41.
                  */}
                  {t('learning:recognition.tryAgain')}
                </Button>
              </>
            )
          }
        />
      )}
    </div>
  );
}
