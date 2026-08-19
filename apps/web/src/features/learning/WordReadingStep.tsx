import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { wordCopy } from '../../data/wordCopy';
import { useLocale } from '../../i18n';
import { Button } from '../../ui/Button';
import { FeedbackState } from '../../ui/FeedbackState';
import { LocalizedText } from '../../ui/LocalizedText';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { readingOptions } from './wordOptions';
import styles from './WordReadingStep.module.css';

/**
 * "What does this say?"
 *
 * ## The step the word curriculum was missing
 *
 * A learner could finish a word by reading its meaning, hearing it, and
 * writing its syllables — all of which are things done *while the answer is on
 * screen*. None of them asks the question the product exists to answer: put
 * this in front of me tomorrow with no gloss and no sound, can I read it?
 *
 * So this is the last step of a word, and it is deliberately bare. The Korean,
 * alone, at reading size. No gloss, no romanisation, and the speaker
 * button only appears *after* an answer, because hearing 사과 is the answer to
 * "what does this say" for anyone who has met the word — the exercise would be
 * a listening test wearing a reading test's clothes.
 *
 * ## Wrong answers are the ones a learner would actually pick
 *
 * See `wordOptions.ts`. They share the target's part of speech and are close to
 * it in difficulty, and words one letter apart are preferred — 물 against 불 and
 * 풀 — because telling those apart *is* reading Hangul.
 *
 * ## Getting it wrong is not a failure
 *
 * It shows the answer, offers the sound, and lets the learner try the same
 * question again. The attempt is recorded as a recognition miss, which marks
 * the word for review; nothing is taken away, and the ladder in
 * `domain/mastery.ts` never goes down.
 */
export function WordReadingStep({
  word,
  fontFamily,
  seed,
  onAnswered,
  onContinue,
}: {
  word: VocabularyWord;
  fontFamily: string;
  /** Fixes the option order, so a retry is the same question. */
  seed: number;
  onAnswered: (correct: boolean) => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation(['learning', 'handwriting', 'vocabulary']);
  const { locale } = useLocale();
  const [picked, setPicked] = useState<string | null>(null);

  const options = useMemo(() => readingOptions(word, seed), [word, seed]);
  const correct = picked === word.id;

  const choose = (id: string) => {
    if (picked !== null) return;
    setPicked(id);
    onAnswered(id === word.id);
  };

  return (
    <div className={styles.step}>
      <div className={styles.prompt}>
        <p className={styles.question}>{t('learning:reading.question')}</p>
        {/* The Korean never mirrors, whatever the interface language does. */}
        <p className={styles.word} style={{ fontFamily }} lang="ko" dir="ltr">
          {word.word}
        </p>
      </div>

      <div className={styles.options} role="group" aria-label={t('learning:reading.optionsAria')}>
        {options.map((option) => {
          const copy = wordCopy(option, locale);
          const state =
            picked === null
              ? ''
              : option.id === word.id
                ? styles.optionCorrect
                : option.id === picked
                  ? styles.optionWrong
                  : styles.optionDimmed;
          return (
            <button
              key={option.id}
              type="button"
              className={`${styles.option} ${state}`}
              onClick={() => choose(option.id)}
              disabled={picked !== null}
              lang={copy.locale}
            >
              {copy.value.meaning}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <FeedbackState
          status={correct ? 'correct' : 'incorrect'}
          headline={
            correct
              ? t('handwriting:feedback.correct.headline')
              : t('learning:reading.wrongHeadline')
          }
          actions={
            correct ? (
              <Button size="md" onClick={onContinue}>
                {t('learning:session.next')}
              </Button>
            ) : (
              <Button size="md" onClick={() => setPicked(null)}>
                {t('handwriting:feedback.retry')}
              </Button>
            )
          }
        >
          <div className={styles.answer}>
            <LocalizedText locale={wordCopy(word, locale).locale}>
              {t('learning:reading.answer', {
                word: word.word,
                meaning: wordCopy(word, locale).value.meaning,
              })}
            </LocalizedText>
            {/* Offered now rather than in the prompt: hearing the word is a
                reward and a correction, not a way to skip the reading. */}
            <SpeakerButton audioId={word.audio.word} label={word.word} size="md" />
          </div>
        </FeedbackState>
      )}
    </div>
  );
}
