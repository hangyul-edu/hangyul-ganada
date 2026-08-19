import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { getFont } from '../data/fonts';
import { VOCABULARY, getWord } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
import { pronunciationOf } from '../data/pronunciation';
import { splitSentence } from '../features/review/exercises';
import { useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Card } from '../ui/Card';
import { LocalizedText } from '../ui/LocalizedText';
import { SaveButton } from '../ui/SaveButton';
import { SpeakerButton } from '../ui/SpeakerButton';
import { NotFoundBody } from './NotFoundPage';
import styles from './WordDetailPage.module.css';

/**
 * One word, in as much depth as is actually useful.
 *
 * ## Why this exists when the quiz deliberately does not show it
 *
 * A quiz screen has one job and everything on it competes for the two seconds a
 * learner spends there. So the questions carry a word, a sound and four
 * options, and nothing else — no part of speech, no notation, no second
 * example. That is right for answering and wrong for *looking something up*,
 * which is a thing people also want to do and were being denied.
 *
 * The split is the whole design: **shallow where you are working, deep where
 * you are asking**. Everything a learner-facing dictionary entry should have
 * lives here and only here, one tap from the word wherever it appears.
 *
 * ## What is deliberately still not here
 *
 * No picture (§48, and the reason is the same as it always was: a picture gives
 * the meaning away before any Korean has been read). No frequency band, no
 * difficulty number, no usefulness rating — those decide what the app *offers*
 * and a learner cannot act on any of them. And no writing practice: a word is
 * never handwritten anywhere in this product.
 */
export function WordDetailPage() {
  const { wordId } = useParams<{ wordId: string }>();
  const word = wordId ? getWord(wordId) : undefined;
  if (!word) return <NotFoundBody messageKey="notFound.word" />;
  return <WordDetail word={word} />;
}

function WordDetail({ word }: { word: VocabularyWord }) {
  const navigate = useNavigate();
  const { state, isSaved, toggleSaved } = useLearner();
  const { t } = useTranslation(['vocabulary', 'common']);
  const { locale } = useLocale();

  const font = getFont(state.settings.selected_font_id);
  const copy = wordCopy(word, locale);
  const sentence = word.example
    ? splitSentence(word.example, word.surface_form ?? word.word)
    : null;

  /**
   * A few words from the same corner of the language.
   *
   * "Related" only in the sense the data can actually support — same category,
   * near it in usefulness — and labelled as that rather than as synonyms. §4
   * asks for synonyms and antonyms *only when accurate*, and this corpus does
   * not record them; inventing them from a category would put a false claim
   * under every word rather than admitting one absence.
   */
  const nearby = useMemo(
    () =>
      VOCABULARY.filter(
        (other) => other.id !== word.id && other.category === word.category,
      )
        .sort(
          (a, b) =>
            Math.abs(a.difficulty_score - word.difficulty_score) -
            Math.abs(b.difficulty_score - word.difficulty_score),
        )
        .slice(0, 4),
    [word],
  );

  const saved = isSaved('word', word.id);

  return (
    <div className={styles.page}>
      <AppHeader title={t('vocabulary:detail.title')} onBack={() => navigate(-1)} />

      <div className={styles.body}>
        <Card tone="featured" padding="lg" className={styles.head}>
          <div className={styles.headRow}>
            <p
              className={styles.word}
              style={{ fontFamily: font.font_family }}
              lang="ko"
              dir="ltr"
              data-testid="detail-headword"
            >
              {word.word}
            </p>
            <SpeakerButton audioId={word.audio.word} label={word.word} size="lg" />
          </div>

          {/*
            The pronunciation, in IPA.

            Under the word rather than beside it, because it is reference and
            the word is the subject. Marked `lang` so a screen reader does not
            try to read the symbols as the interface language, and given its own
            label because a row of unfamiliar symbols with nothing to say what
            they are is worse than no row at all.
          */}
          <p className={styles.pronunciation}>
            <span className={styles.pronunciationLabel}>{t('vocabulary:detail.pronunciation')}</span>
            <span className={styles.ipa} lang="ko-Latn-fonipa" dir="ltr">
              {pronunciationOf(word)}
            </span>
          </p>

          <LocalizedText as="p" locale={copy.locale} className={styles.meaning}>
            {copy.value.meaning}
          </LocalizedText>

          <p className={styles.partOfSpeech}>
            {t(`vocabulary:partOfSpeech.${word.part_of_speech}`, {
              defaultValue: word.part_of_speech,
            })}
          </p>

          <SaveButton
            saved={saved}
            onToggle={() => toggleSaved('word', word.id)}
            label={word.word}
          />
        </Card>

        {/*
          The fuller explanation, where the gloss alone would mislead.

          Conditional, and absent on most words — which is what makes it worth
          reading when it appears. A definition under every word would be a
          paragraph a learner scrolls past.
        */}
        {copy.value.definition && (
          <section className={styles.block} aria-labelledby="detail-definition">
            <h2 id="detail-definition" className={styles.blockTitle}>
              {t('vocabulary:detail.definition')}
            </h2>
            <LocalizedText as="p" locale={copy.locale} className={styles.blockBody}>
              {copy.value.definition}
            </LocalizedText>
          </section>
        )}

        {sentence && word.example && (
          <section className={styles.block} aria-labelledby="detail-example">
            <h2 id="detail-example" className={styles.blockTitle}>
              {t('vocabulary:intro.example')}
            </h2>
            <div className={styles.exampleRow}>
              <p className={styles.exampleKo} style={{ fontFamily: font.font_family }} lang="ko" dir="ltr">
                {sentence.before}
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
              <LocalizedText as="p" locale={copy.locale} className={styles.blockBody}>
                {copy.value.example_translation}
              </LocalizedText>
            )}
            {word.surface_form && (
              <p className={styles.note}>
                {t('vocabulary:intro.surfaceNote', {
                  headword: word.word,
                  form: word.surface_form,
                })}
              </p>
            )}
          </section>
        )}

        {/* How it is said, where that differs from how it is written. */}
        {word.spoken && word.sound_pattern && (
          <section className={styles.block} aria-labelledby="detail-sound">
            <h2 id="detail-sound" className={styles.blockTitle}>
              {t('vocabulary:intro.howItSounds')}
            </h2>
            <p className={styles.spoken} lang="ko" dir="ltr" style={{ fontFamily: font.font_family }}>
              {word.spoken}
            </p>
            <p className={styles.note}>
              {t(`vocabulary:sound.${word.sound_pattern}`, {
                word: word.word,
                spoken: word.spoken,
              })}
            </p>
          </section>
        )}

        {copy.value.cultural_note && (
          <section className={styles.block} aria-labelledby="detail-usage">
            <h2 id="detail-usage" className={styles.blockTitle}>
              {t('vocabulary:detail.usage')}
            </h2>
            <LocalizedText as="p" locale={copy.locale} className={styles.blockBody}>
              {copy.value.cultural_note}
            </LocalizedText>
          </section>
        )}

        {nearby.length > 0 && (
          <section className={styles.block} aria-labelledby="detail-nearby">
            <h2 id="detail-nearby" className={styles.blockTitle}>
              {t('vocabulary:detail.nearby')}
            </h2>
            <ul className={styles.nearby}>
              {nearby.map((other) => (
                <li key={other.id}>
                  <button
                    type="button"
                    className={styles.nearbyRow}
                    onClick={() => navigate(`/words/word/${other.id}`, { replace: true })}
                  >
                    <span className={styles.nearbyWord} lang="ko" dir="ltr">
                      {other.word}
                    </span>
                    <LocalizedText
                      as="span"
                      locale={wordCopy(other, locale).locale}
                      className={styles.nearbyMeaning}
                    >
                      {wordCopy(other, locale).value.meaning}
                    </LocalizedText>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
