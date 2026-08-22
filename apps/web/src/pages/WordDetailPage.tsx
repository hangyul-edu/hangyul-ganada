import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { getFont, textFamily } from '../data/fonts';
import { useDictionaryEntry } from '../data/useDictionary';
import { usableExamples } from '../data/exampleQuality';
import { relationsOf } from '../data/relations';
import { Conjugation } from '../features/vocabulary/Conjugation';
import { getWord } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
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
  const { contentLocale } = useLocale();

  const font = getFont(state.settings.selected_font_id);
  const copy = wordCopy(word, contentLocale);
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
              style={{ fontFamily: textFamily(font) }}
              lang="ko"
              dir="ltr"
              data-testid="detail-headword"
            >
              {word.word}
            </p>
            <SpeakerButton audioId={word.audio.word} label={word.word} size="lg" />
          </div>

          {/*
            The word in Roman letters — 국어의 로마자 표기법, the official system.

            This line used to be IPA: `자리 [tɕa.ɾi]`. It was correct, it was
            precise, and it was aimed at somebody who is not the customer. A
            beginner three days into Hangul cannot read ɕ or ɾ, so the one row
            on the card whose job is *help me say this* was a row of symbols
            they had to skip — and worse, the two learners who tried to sound it
            out got a worse answer than *jari* would have given them.

            Roman letters, no brackets. The brackets belonged to the notation
            that has gone: they say "this is a transcription, not a spelling",
            which matters for IPA and reads as clutter around *jari*. The
            recording, one tap up and to the right, is still what teaches the
            sound; this is what lets them read it back.

            `lang="ko-Latn"` — Korean in Latin script — so a screen reader reads
            it as a romanisation rather than as a word in the interface
            language, and `dir="ltr"` so it stays left-to-right inside an Arabic
            or Hebrew page.
          */}
          <p className={styles.pronunciation}>
            <span className={styles.pronunciationLabel}>{t('vocabulary:detail.romanization')}</span>
            <span className={styles.romanization} lang="ko-Latn" dir="ltr" data-testid="detail-romanization">
              {word.romanization}
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

          On 25 words of 2,581, in all ten languages. It used to be on 784 and
          in English only, filled by the build with the dictionary's second and
          third senses — which is how "phylum" ended up under 문 and "graveyard"
          under 산. That is gone; this is written, and written only for the
          words where one line genuinely is not enough: 오빠 and 형 are the same
          brother seen from different speakers, 차 is a car and also tea, 하다 is
          how most Korean verbs are built.

          Absent from the other 2,556 on purpose. A paragraph under every word
          is a paragraph a learner scrolls past, and the section is worth
          reading precisely because it does not always appear. See §7 of
          docs/LOCALIZATION_NATIVE_REVIEW.md.
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
              <p className={styles.exampleKo} style={{ fontFamily: textFamily(font) }} lang="ko" dir="ltr">
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

        {/*
          How it is written in a sentence — the same panel the dictionary shows.

          A taught card needs this as much as a dictionary entry does, and for
          the same reason: the card says 먹다 and every sentence the learner will
          ever read says something else. One component, so the two screens
          cannot drift into showing different tables for the same word.
        */}
        <Conjugation
          lemma={word.word}
          partOfSpeech={word.part_of_speech}
          fontFamily={textFamily(font)}
        />

        {/* How it is said, where that differs from how it is written. */}
        {word.spoken && word.sound_pattern && (
          <section className={styles.block} aria-labelledby="detail-sound">
            <h2 id="detail-sound" className={styles.blockTitle}>
              {t('vocabulary:intro.howItSounds')}
            </h2>
            <p className={styles.spoken} lang="ko" dir="ltr" style={{ fontFamily: textFamily(font) }}>
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

        <TaughtSenseExamples word={word} />
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


/**
 * A second and third example of the sense this card teaches — and nothing else.
 *
 * ## What this used to be, and why it is gone
 *
 * It was "More from the dictionary": a disclosure that fetched the upstream
 * entry and listed every sense of the headword under it. On 발 that produced
 * *leg*, *Counter: steps*, *a blind or screen*, *strands of noodles*, and
 * *rounds of ammunition* — five true statements about the Korean word 발 and
 * five things a beginner who looked up "foot" did not ask for.
 *
 * The argument for it was that the senses are real and a learner who met 차 in
 * a café needs somewhere to find them. The argument against it is what it
 * looked like: a page that opens on one clear meaning and then unfolds into raw
 * lexicography reads as *less* trustworthy, not more complete. A product that
 * shows six senses because six exist is showing its data, not teaching.
 *
 * Dictionary *search* is untouched — 30,059 headwords, and the full entry is
 * still what a search result opens. What changed is that a **taught card**
 * stopped borrowing the dictionary's other senses. One card, one sense, which
 * is the promise the rest of this screen already made.
 *
 * ## What survives, because it earns its place
 *
 * The extra example sentences — and only the ones belonging to the sense the
 * card teaches. A learner who has read 저는 커피를 마셔요 once benefits from
 * seeing the same word in two more real sentences; that is §11, and it is the
 * half of the old block that was ever pedagogy rather than inventory.
 *
 * They are matched to the taught sense by gloss and shown in the open, under
 * the primary example, rather than behind a disclosure — a thing worth reading
 * should not need a tap, and a thing that needs hiding should not ship.
 */
function TaughtSenseExamples({ word }: { word: VocabularyWord }) {
  const { t } = useTranslation('vocabulary');
  const { contentLocale } = useLocale();
  const { entry } = useDictionaryEntry(word.word);

  /*
    The taught sense, matched on the gloss.

    Not on `senseId`: the two ids are built from different glosses —
    `word_cha#car` from the hand-written English and `dict_cha#car` from
    Wiktionary's — and they agree often enough to be tempting and not often
    enough to rely on. Comparing the short glosses finds the right sense when
    there is one and finds nothing when there is not, and finding nothing is the
    correct outcome: no examples is better than an example of another sense.
  */
  const taught = wordCopy(word, 'en').value.meaning;
  const candidates = (entry?.senses ?? [])
    .filter((sense) => taught.toLowerCase().includes(sense.shortGloss.toLowerCase()))
    .flatMap((sense) => sense.examples);
  /*
    And then the quality filter, which throws most of them away.

    Measured over the first 500 taught words: 261 candidate sentences, 100 fit
    to show. The rest carry wikitext that survived the parse, are fragments
    rather than sentences, explain an idiom instead of translating it, run
    longer than a beginner can read, or are filed under the taught gloss while
    demonstrating another sense — 술을 먹다, *to drink wine*, under 먹다 meaning
    *to eat*. See `data/exampleQuality.ts`; every rule there was written against
    a sentence that had shipped.
  */
  const extra = usableExamples(candidates, {
    taughtGloss: taught,
    skip: word.example,
    limit: 2,
  });

  if (extra.length === 0) return null;

  return (
    <section className={styles.block} aria-labelledby="detail-more-examples">
      <h2 id="detail-more-examples" className={styles.blockTitle}>
        {t('dictionary.moreExamples')}
      </h2>
      <ul className={styles.dictionaryExamples}>
        {extra.map((example) => (
          <li key={example.korean}>
            <span lang="ko" dir="ltr">
              {example.korean}
            </span>
            {example.translation && (
              <LocalizedText as="span" locale={contentLocale} className={styles.exampleTranslation}>
                {example.translation}
              </LocalizedText>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
