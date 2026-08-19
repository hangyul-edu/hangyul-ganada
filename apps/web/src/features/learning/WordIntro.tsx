import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { usePronunciation } from '../../audio/PronunciationContext';
import { useEntryAudio } from '../../audio/useEntryAudio';
import { useLocale } from '../../i18n';
import { wordCopy } from '../../data/wordCopy';
import { LocalizedText } from '../../ui/LocalizedText';
import { SaveButton } from '../../ui/SaveButton';
import { ReportProblem } from '../../ui/ReportProblem';
import { SpeakerButton } from '../../ui/SpeakerButton';
import { splitSentence } from '../review/exercises';
import styles from './WordIntro.module.css';

/**
 * Meeting a word.
 *
 * ```
 * WORD  →  SOUND  →  MEANING  →  REAL CONTEXT  →  SOUND IN CONTEXT  →  WRITING
 * ```
 *
 * That order is the product's claim about how a word is learned, and every
 * decision on this screen follows from it.
 *
 * ## What was here before, and why it went
 *
 * A picture, a frequency chip, a part-of-speech chip, and a line explaining
 * which feature of the difficulty model put the word where it is. Four things
 * competing with the sentence, none of which a learner can act on:
 *
 * * **The picture** gave the meaning away before any reading happened, which
 *   made the word feel learned without any Korean having been read. It is gone
 *   from the product entirely — data, assets, pipeline and all.
 * * **"Placed here mainly by the letters it is spelled with"** was the ranking
 *   engine explaining itself. It invites the one question the app should never
 *   have to field: placed there by whom?
 * * **The frequency band** is a fact about a subtitle corpus, not about this
 *   word today.
 *
 * What replaced them is the sentence, which is the thing that actually teaches:
 * where the word goes, which particle it takes, and what Korean sounds like
 * with it in.
 *
 * ## The two notes
 *
 * Both are conditional, and both are absent on most words — which is what makes
 * them worth reading when they appear.
 *
 * * **How it sounds** appears where spelling and pronunciation genuinely
 *   diverge. 학교 is written with ㄱ and said with ㄲ, and a learner sounding it
 *   out is doing exactly what they were taught and getting it wrong.
 * * **The surface form** appears where the sentence writes the word
 *   differently: 먹다 on the card, 먹어요 in the sentence. It says "this is
 *   still the word you just met" and stops there. It is not a conjugation table
 *   and must not become one.
 */
export function WordIntro({
  word,
  fontFamily,
  onHeard,
  saved,
  onToggleSaved,
}: {
  word: VocabularyWord;
  fontFamily: string;
  onHeard: () => void;
  saved: boolean;
  onToggleSaved: () => void;
}) {
  const { t } = useTranslation(['vocabulary', 'common']);
  const { locale } = useLocale();
  const { preload } = usePronunciation();
  const copy = wordCopy(word, locale);
  const sentence = word.example
    ? splitSentence(word.example, word.surface_form ?? word.word)
    : null;

  useEffect(() => {
    preload([word.audio.word, word.audio.example]);
  }, [preload, word.audio.word, word.audio.example]);

  // The word says itself once, on arrival — this is the screen where a learner
  // meets it, and the sound is half of what there is to meet.
  useEntryAudio(word.id, word.audio.word, { onPlayed: onHeard });

  return (
    <div className={styles.intro}>
      <div className={styles.card}>
        <div className={styles.wordRow}>
          <p
            className={styles.word}
            style={{ fontFamily }}
            lang="ko"
            dir="ltr"
            data-testid="word-headword"
          >
            {word.word}
          </p>
          <SpeakerButton audioId={word.audio.word} label={word.word} size="lg" onPlayed={onHeard} />
        </div>

        <LocalizedText
          as="p"
          locale={copy.locale}
          className={styles.meaning}
          data-testid="word-meaning"
        >
          {copy.value.meaning}
        </LocalizedText>

        {/*
          The part of speech, and only where it changes what the learner does
          with the word. "verb" tells them the sentence below will not write it
          the way this card does; "noun" tells them nothing they cannot see.
        */}
        {(word.part_of_speech === 'verb' || word.part_of_speech === 'adjective') && (
          <p className={styles.partOfSpeech}>
            {t(`vocabulary:partOfSpeech.${word.part_of_speech}`)}
          </p>
        )}

        <SaveButton saved={saved} onToggle={onToggleSaved} label={word.word} />
      </div>

      {sentence && word.example && (
        <section className={styles.example} aria-labelledby="example-heading">
          <h3 id="example-heading" className={styles.exampleLabel}>
            {t('vocabulary:intro.example')}
          </h3>
          <div className={styles.exampleRow}>
            <p className={styles.exampleKo} style={{ fontFamily }} lang="ko" dir="ltr">
              {sentence.before}
              {/* Restrained, deliberately: a weight change and a soft underline
                  rather than a colour, because colouring a third of the sentence
                  orange makes the sentence about the colour. */}
              <strong className={styles.target}>{sentence.target}</strong>
              {sentence.after}
            </p>
            <SpeakerButton
              audioId={word.audio.example}
              label={word.example}
              size="md"
              tone="plain"
            />
          </div>
          {copy.value.example_translation && (
            <LocalizedText locale={copy.locale} className={styles.exampleGloss}>
              {copy.value.example_translation}
            </LocalizedText>
          )}

          {word.surface_form && (
            <p className={styles.surface}>
              <span lang="ko" dir="ltr" className={styles.surfaceForms}>
                {word.word} → {word.surface_form}
              </span>
              <span>
                {t('vocabulary:intro.surfaceNote', {
                  headword: word.word,
                  form: word.surface_form,
                })}
              </span>
            </p>
          )}
        </section>
      )}

      {word.spoken && word.sound_pattern && (
        <section className={styles.sound} aria-labelledby="sound-heading">
          <h3 id="sound-heading" className={styles.soundLabel}>
            {t('vocabulary:intro.howItSounds')}
          </h3>
          <p className={styles.spoken} lang="ko" dir="ltr" style={{ fontFamily }}>
            {word.spoken}
          </p>
          <p className={styles.soundWhy}>
            {t(`vocabulary:sound.${word.sound_pattern}`, {
              word: word.word,
              spoken: word.spoken,
            })}
          </p>
        </section>
      )}

      {/*
        The primary action is not here: it is in the session's `FocusScreen`
        footer, which is the one region that reserves the system navigation bar.
        See `ui/FocusScreen.tsx`. This stays at the end of the scrolling content,
        which is still below the action and still where it cannot be mistaken
        for one. It renders nothing at all when no support address is
        configured — see `ReportProblem`.
      */}
      <ReportProblem itemId={word.id} korean={word.word} />
    </div>
  );
}
