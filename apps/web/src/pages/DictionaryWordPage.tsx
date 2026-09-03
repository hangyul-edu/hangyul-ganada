import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { getFont, textFamily } from '../data/fonts';
import type { DictionarySense } from '../data/dictionary';
import { useDictionaryEntry } from '../data/useDictionary';
import { findWordByHeadword } from '../data/vocabulary';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Card } from '../ui/Card';
import { NotFoundBody } from './NotFoundPage';
import { Conjugation } from '../features/vocabulary/Conjugation';
import { BookmarkIcon } from '../ui/icons';
import styles from './DictionaryWordPage.module.css';

/**
 * A word the app knows but does not teach.
 *
 * ## Why it is a different screen from Word Detail
 *
 * They look similar and they promise different things. `WordDetailPage` is a
 * card the app stands behind: the meaning was written by a person in the
 * learner's language, the recording was checked, the example was graded, and
 * the word is on a schedule that will bring it back until it sticks. This page
 * is a lookup. The gloss is Wiktionary's English, there is no recording, no
 * translation into the interface language, and nothing here will ever be
 * scheduled or counted.
 *
 * Collapsing the two would have been less code and a worse promise — a learner
 * cannot tell curated from scraped by looking, so the app has to tell them.
 * Hence the note at the top and the attribution at the bottom, on every entry.
 *
 * ## Progressive disclosure
 *
 * Dictionary entries are long in a way learning cards are not: 나가다 has eight
 * senses and 가다 has more. The first sense — the one the frequency ranking
 * says is meant — is open; the rest are behind a disclosure that states how
 * many there are. A learner looking up a word they met once gets an answer in
 * one line, and a learner reading properly gets everything, and neither pays
 * for the other.
 */
export function DictionaryWordPage() {
  const params = useParams<{ headword: string }>();
  const headword = params.headword ? decodeURIComponent(params.headword) : null;
  const navigate = useNavigate();
  const { t } = useTranslation(['vocabulary', 'common']);
  const { state, toggleSavedHeadword, isSavedHeadword } = useLearner();
  const { entry, state: status } = useDictionaryEntry(headword);
  const saved = isSavedHeadword(entry?.headword ?? headword ?? '');
  const font = getFont(state.settings.selected_font_id);

  /*
    A learner who lands here for a word that *is* taught gets the real card.

    Reachable by typing the path, by a stale link, or by a saved bookmark from
    before a word was promoted into the corpus. Sending them to the better of
    the two screens is strictly kinder than showing them the thin one.
  */
  const taught = headword ? findWordByHeadword(headword) : undefined;
  if (taught) {
    navigate(`/words/word/${taught.id}`, { replace: true });
    return null;
  }

  if (!headword) return <NotFoundBody messageKey="notFound.word" />;

  return (
    <div className={styles.page}>
      <AppHeader title={t('vocabulary:dictionary.title')} />

      <div className={styles.body}>
        {status === 'loading' && (
          <p className={styles.status} role="status">
            {t('vocabulary:dictionary.searching')}
          </p>
        )}

        {status === 'unavailable' && (
          <p className={styles.status} role="status">
            {t('vocabulary:dictionary.unavailable')}
          </p>
        )}

        {status === 'ready' && !entry && <NotFoundBody messageKey="notFound.word" />}

        {entry && (
          <>
            <Card tone="featured" padding="lg" className={styles.head}>
              <p
                className={styles.word}
                style={{ fontFamily: textFamily(font) }}
                lang="ko"
                dir="ltr"
                data-testid="dictionary-headword"
              >
                {entry.headword}
              </p>
              <p className={styles.romanization} lang="ko-Latn" dir="ltr">
                {entry.romanization}
              </p>
              <p className={styles.note}>{t('vocabulary:dictionary.note')}</p>
              {/*
                Saving a word the app does not teach.

                §42: a learner who looks up 귀족 should be able to keep it. It
                goes on the same Saved words list as a taught card, under the
                taught card's key when there is one — so 사과 saved here and 사과
                saved from its lesson are one bookmark rather than two.
              */}
              <button
                type="button"
                className={styles.save}
                onClick={() => toggleSavedHeadword(entry.headword)}
                aria-pressed={saved}
                data-testid="dictionary-save"
              >
                <BookmarkIcon size={18} filled={saved} />
                {saved ? t('vocabulary:dictionary.saved') : t('vocabulary:dictionary.save')}
              </button>
            </Card>

            <Sense sense={entry.senses[0]!} />

            {/*
              How the word is actually written in a sentence.

              After the primary sense and before the other ones, because that is
              the order somebody reads in: what it means, how it appears, and
              then what else it can mean. See `features/vocabulary/Conjugation`.
            */}
            <Conjugation
              lemma={entry.headword}
              partOfSpeech={entry.senses[0]!.partOfSpeech}
              fontFamily={textFamily(font)}
            />

            {entry.senses.length > 1 && (
              <details className={styles.more}>
                <summary className={styles.moreSummary}>
                  {t('vocabulary:dictionary.otherMeanings', { count: entry.senses.length - 1 })}
                </summary>
                {entry.senses.slice(1).map((sense) => (
                  <Sense key={sense.senseId} sense={sense} />
                ))}
              </details>
            )}

            {/*
              Attribution, on every entry rather than once in the legal screen.

              CC BY-SA 4.0 asks for the source to be credited where the material
              is used, and this is where it is used. It is also the honest
              answer to "where did this come from", which a learner comparing a
              thin dictionary gloss against a hand-written card deserves.
            */}
            <p className={styles.source}>
              {t('vocabulary:dictionary.source', {
                name: entry.source.id === 'en-wiktionary' ? 'Wiktionary' : entry.source.id,
                license: entry.source.license,
              })}{' '}
              <a href={entry.source.url} target="_blank" rel="noreferrer noopener">
                {entry.headword}
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Sense({ sense }: { sense: DictionarySense }) {
  const { t } = useTranslation('vocabulary');
  return (
    <section className={styles.sense}>
      <p className={styles.partOfSpeech}>
        {t(`partOfSpeech.${sense.partOfSpeech}`, { defaultValue: sense.partOfSpeech })}
      </p>
      <p className={styles.gloss}>{sense.gloss}</p>
      {sense.labels && sense.labels.length > 0 && (
        <p className={styles.labels}>{sense.labels.join(' · ')}</p>
      )}
      {sense.examples.length > 0 && (
        <ul className={styles.examples}>
          {sense.examples.map((example) => (
            <li key={example.korean}>
              <span lang="ko" dir="ltr">
                {example.korean}
              </span>
              {example.translation && <span className={styles.translation}>{example.translation}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
