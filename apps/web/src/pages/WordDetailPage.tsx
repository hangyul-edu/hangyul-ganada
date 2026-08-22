import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { getFont } from '../data/fonts';
import { useDictionaryEntry } from '../data/useDictionary';
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
          fontFamily={font.font_family}
        />

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

        <OtherMeanings word={word} />
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
 * What else this spelling can mean, from the dictionary, collapsed.
 *
 * ## Why the card above says only one thing
 *
 * A learning card teaches one sense — `senseId` names which — and the card is
 * built around that promise: the meaning, the example, the picture and the four
 * multiple-choice options all describe 차 the car. Adding "or tea" to the
 * meaning line is how 103 glosses ended up teaching two things at once, which
 * gave a learner asked what 차 means two right answers and one button.
 *
 * But the other senses are real, and a learner who has just met 차 in a café
 * needs somewhere to find them. Here, below everything the card promises,
 * behind a disclosure, plainly attributed to the dictionary rather than to the
 * course. Open it and the app is answering a question; leave it shut and the
 * card still teaches one thing.
 *
 * ## Why it costs nothing to have
 *
 * Nothing is fetched until the disclosure is opened — `useDictionaryEntry` is
 * given `null` until then — so a learner reading the example sentence does not
 * pay for a dictionary they did not ask for, and the 25 words with a written
 * definition are unaffected either way.
 *
 * Absent entirely when the dictionary has nothing more to say, which is the
 * common case: a heading promising other meanings and then listing the one
 * already on the card is worse than no heading.
 */
function OtherMeanings({ word }: { word: VocabularyWord }) {
  const { t } = useTranslation('vocabulary');
  const [open, setOpen] = useState(false);
  const { entry, state } = useDictionaryEntry(open ? word.word : null);

  /*
    The taught sense, removed from the list of others.

    Matched on the gloss rather than on `senseId`, because the two ids are built
    from different glosses — `word_cha#car` from the hand-written English, and
    `dict_cha#car` from Wiktionary's — and they agree often enough to be
    tempting and not often enough to rely on. Comparing the short glosses
    catches the duplicate when there is one and shows an extra line when there
    is not, which is the failure worth having.
  */
  const taught = wordCopy(word, 'en').value.meaning.toLowerCase();
  const isTaughtSense = (sense: { shortGloss: string }) =>
    taught.includes(sense.shortGloss.toLowerCase());
  const senses = entry?.senses ?? [];
  const others = senses.filter((sense) => !isTaughtSense(sense));

  /*
    Extra sentences for the sense this card actually teaches.

    The same gloss comparison, read the other way round. A dictionary sense that
    matches the taught gloss is dropped from "other meanings" because it is not
    other — and that makes its examples examples *of the taught sense*, which is
    the one place they can be shown on this card without breaking the promise
    the card makes. 419 words gain 581 of them.

    The alternative was tried and rejected. Harvesting extra sentences from
    other corpus entries' examples looks free — 2,581 graded, translated
    sentences already sitting there — and produces sense-wrong examples at a
    rate that would undo the gloss work: filtered to unambiguous surface forms
    it still files 주사를 맞았어요, getting an injection, under 맞다 meaning
    "to be right", and matches 열다 inside 여자는 through a real propositive
    ending. See the note in the commit that added senseId.
  */
  const more = senses.filter(isTaughtSense).flatMap((sense) => sense.examples);

  const nothing = state === 'ready' && others.length === 0 && more.length === 0;

  return (
    <details
      className={styles.block}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      {/*
        The label promises both halves, because both are behind it.

        It read "Other meanings" and opened on a *More examples* heading, which
        is a disclosure under-describing its own contents — a learner deciding
        whether to tap it was being told about the smaller half.
      */}
      <summary className={styles.blockTitle}>{t('dictionary.moreFromDictionary')}</summary>
      {state === 'loading' && <p className={styles.note}>{t('dictionary.searching')}</p>}
      {state === 'unavailable' && <p className={styles.note}>{t('dictionary.unavailable')}</p>}
      {nothing && <p className={styles.note}>{t('dictionary.onlyMeaning')}</p>}

      {more.length > 0 && (
        <>
          <h3 className={styles.blockSubtitle}>{t('dictionary.moreExamples')}</h3>
          <ul className={styles.dictionaryExamples}>
            {more.map((example) => (
              <li key={example.korean}>
                <span lang="ko" dir="ltr">
                  {example.korean}
                </span>
                {example.translation && (
                  <span className={styles.exampleTranslation}>{example.translation}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          {more.length > 0 && (
            <h3 className={styles.blockSubtitle}>{t('dictionary.otherMeaningsPrompt')}</h3>
          )}
          <ul className={styles.otherMeanings}>
            {others.map((sense) => (
              <li key={sense.senseId}>
                <span className={styles.otherPartOfSpeech}>
                  {t(`partOfSpeech.${sense.partOfSpeech}`, { defaultValue: sense.partOfSpeech })}
                </span>{' '}
                {sense.gloss}
                {sense.examples.length > 0 && (
                  <ul className={styles.dictionaryExamples}>
                    {sense.examples.map((example) => (
                      <li key={example.korean}>
                        <span lang="ko" dir="ltr">
                          {example.korean}
                        </span>
                        {example.translation && (
                          <span className={styles.exampleTranslation}>{example.translation}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {entry && (others.length > 0 || more.length > 0) && (
        <p className={styles.note}>
          {t('dictionary.source', { name: 'Wiktionary', license: entry.source.license })}
        </p>
      )}
    </details>
  );
}
