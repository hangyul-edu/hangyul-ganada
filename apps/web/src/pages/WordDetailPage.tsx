import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { getFont } from '../data/fonts';
import { relationsOf } from '../data/relations';
import { getWord } from '../data/vocabulary';
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
   * The dictionary's own synonyms and antonyms for this word — or nothing.
   *
   * This is the whole of what the screen now says about other words. It used to
   * carry a section headed *비슷한 낱말* built from the four nearest words in
   * the same category, which under 고기 listed 사과, 음식, 먹다 and 우유: the
   * food shelf, under a heading claiming a dictionary had found them alike. See
   * `data/relations.ts` for why that is worse than an empty space.
   *
   * Most words have neither, and then neither heading appears. Nothing is
   * substituted in — the page is simply shorter, which is the right shape for a
   * page with nothing true to add.
   */
  const relations = useMemo(() => relationsOf(word.id), [word.id]);

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

          Conditional, and today absent on every word: the build used to fill it
          with the dictionary's other senses, which put "phylum" under 문 and
          "graveyard" under 산, so it now emits nothing and the section waits for
          copy somebody wrote. See §7 of docs/LOCALIZATION_NATIVE_REVIEW.md.

          Kept rather than deleted because the slot is the right shape — a
          fuller explanation belongs under a word whose gloss alone would
          mislead, and it has to be absent from the rest or it becomes a
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

        {/*
          Two lists of words, each under the name of the relation it actually is.

          Chips rather than the old two-column rows with a meaning beside every
          entry. A synonym is read as *the other way to say this*, which the word
          itself answers; a definition next to each one turned three related
          words into three more things to read and pushed the example sentence
          off the screen. The meaning is one tap away, where a learner who wants
          it will look for it.
        */}
        {relations.synonyms.length > 0 && (
          <RelationBlock
            id="detail-synonyms"
            title={t('vocabulary:detail.synonyms')}
            words={relations.synonyms}
            onOpen={(id) => navigate(`/words/word/${id}`, { replace: true })}
          />
        )}
        {relations.antonyms.length > 0 && (
          <RelationBlock
            id="detail-antonyms"
            title={t('vocabulary:detail.antonyms')}
            words={relations.antonyms}
            onOpen={(id) => navigate(`/words/word/${id}`, { replace: true })}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One typed relation, as a row of tappable words.
 *
 * Rendered only by a caller that has already found the list non-empty — an
 * empty relation must produce no heading at all, not a heading over nothing.
 */
function RelationBlock({
  id,
  title,
  words,
  onOpen,
}: {
  id: string;
  title: string;
  words: VocabularyWord[];
  onOpen: (wordId: string) => void;
}) {
  return (
    <section className={styles.block} aria-labelledby={id}>
      <h2 id={id} className={styles.blockTitle}>
        {title}
      </h2>
      <ul className={styles.relations}>
        {words.map((other) => (
          <li key={other.id}>
            {/*
              Every word here ships — `relationsOf` drops the ones that do not —
              so this always lands on a real entry. `replace` so that following
              three synonyms in a row does not build a back stack the learner
              has to unwind one page at a time.
            */}
            <button
              type="button"
              className={styles.relationChip}
              onClick={() => onOpen(other.id)}
              lang="ko"
              dir="ltr"
            >
              {other.word}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
