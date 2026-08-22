import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { getWord } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
import { SessionSize } from '../features/review/SessionSize';
import { defaultSessionSize } from '../features/review/sessionSizes';
import { useDictionaryGlosses } from '../data/useDictionary';
import { useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { HangyulMascot } from '../ui/HangyulMascot';
import { LocalizedText } from '../ui/LocalizedText';
import { SpeakerButton } from '../ui/SpeakerButton';
import { ChevronRightIcon, SearchIcon } from '../ui/icons';
import styles from './ListPage.module.css';

/** How the list can be ordered. Three, because a fourth would need a menu. */
type Order = 'recent' | 'alphabetical' | 'needed';

/**
 * One saved row, of the two kinds a saved list can now hold.
 *
 * A **taught** word has a card, a recording, a hand-written meaning and a place
 * in the curriculum. A **dictionary** word has a headword and, once the index
 * is in memory, a short gloss. They live on one list because the learner made
 * one list; they are separate types because the app must never hand the second
 * kind to something that assumes the first.
 */
type SavedEntry =
  | { kind: 'word'; key: string; word: VocabularyWord }
  | { kind: 'dict'; key: string; headword: string };

/**
 * The words the learner chose to keep.
 *
 * ## Why this screen had to exist
 *
 * Saving a word already worked — there is a bookmark on every word card, and it
 * persisted, and the review scheduler could be pointed at it. What there was
 * not was anywhere to *look*. The list existed as a number on the Review screen
 * and as a query parameter; a learner who saved 사과 had no way to see 사과
 * again except by meeting it in a session. That is a feature which technically
 * works and practically does not.
 *
 * ## Saving is not reviewing
 *
 * §41 and §42, and the distinction is worth keeping sharp because the three
 * lists in this product look alike from a distance:
 *
 * * A **saved word** is the learner saying *I want to keep this*.
 * * A **review** is the system saying *this is fading*.
 * * A **mistake** is a record that *this went wrong*.
 *
 * So saving a word does not enrol it in every future review session — that is
 * how a "save" button becomes a punishment. It puts the word on this screen,
 * where the learner can find it, and it gives them a button that reviews *these
 * words* when they want to. The scheduler treats saved status as a small
 * priority signal and nothing more.
 */
export function SavedWordsPage() {
  const navigate = useNavigate();
  const { state, practicePlan, toggleSaved, toggleSavedHeadword } = useLearner();
  const { t } = useTranslation(['vocabulary', 'learning', 'common']);
  const { locale } = useLocale();

  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<Order>('recent');
  const deferredQuery = useDeferredValue(query);

  /**
   * The saved list, resolved to words.
   *
   * `saved_items` holds memory keys and is append-ordered, so the *stored*
   * order is oldest first — reversed here because the word somebody saved a
   * minute ago is the one they have come to look at.
   */
  const saved = useMemo(() => {
    const rows: SavedEntry[] = [];
    for (const key of state.settings.saved_items) {
      if (key.startsWith('word:')) {
        const word = getWord(key.slice('word:'.length));
        if (word) rows.push({ kind: 'word', key, word });
        continue;
      }
      /*
        A word the app does not teach — §42.

        Saved from the dictionary, so there is no card, no recording and no
        difficulty. It is still a word the learner asked to keep, and a Saved
        words screen that silently dropped it would be a bookmark that did not
        work.
      */
      if (key.startsWith('dict:')) {
        rows.push({ kind: 'dict', key, headword: key.slice('dict:'.length) });
      }
    }
    return rows.reverse();
  }, [state.settings.saved_items]);

  const dictionaryHeadwords = useMemo(
    () => saved.filter((row) => row.kind === 'dict').map((row) => row.headword),
    [saved],
  );
  const glosses = useDictionaryGlosses(dictionaryHeadwords);

  /** The Korean of a row, whichever kind it is. */
  const headwordOf = useCallback(
    (row: SavedEntry) => (row.kind === 'word' ? row.word.word : row.headword),
    [],
  );
  /** What it means, in the learner's language where the app has one. */
  const meaningOf = useCallback(
    (row: SavedEntry) =>
      row.kind === 'word'
        ? wordCopy(row.word, locale).value.meaning
        : (glosses.get(row.headword)?.shortGloss ?? ''),
    [locale, glosses],
  );

  /** What the scheduler thinks of each saved word. Only used to order by need. */
  const weakest = useMemo(() => {
    const out = new Map<string, number>();
    for (const row of saved) {
      const item = row.kind === 'word' ? state.memory[`word:${row.word.id}`] : undefined;
      const states = Object.values(item?.skills ?? {}).filter(Boolean);
      out.set(row.key, states.length === 0 ? 0 : Math.min(...states.map((s) => s!.stability_days)));
    }
    return out;
  }, [saved, state.memory]);

  const shown = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const matched = needle
      ? saved.filter(
          (row) =>
            headwordOf(row).includes(needle) || meaningOf(row).toLowerCase().includes(needle),
        )
      : saved;

    if (order === 'alphabetical') {
      return [...matched].sort((a, b) => headwordOf(a).localeCompare(headwordOf(b)));
    }
    // "Needs work first" is the weakest memory first, and an unpractised word
    // counts as weakest — it is the one the learner knows least about.
    if (order === 'needed') {
      return [...matched].sort((a, b) => (weakest.get(a.key) ?? 0) - (weakest.get(b.key) ?? 0));
    }
    return matched;
  }, [saved, deferredQuery, order, weakest, headwordOf, meaningOf]);

  /*
    The session the learner asked for, not the one the scheduler would have run.

    `savedOnly` narrows the pool to the saved list and `size` is the learner's
    choice from the control below — so "5" produces five questions rather than
    five being a hint. See `features/review/SessionSize`.
  */
  const [size, setSize] = useState<number | null>(null);
  const full = useMemo(() => practicePlan({ savedOnly: true }), [practicePlan]);
  const chosen = size ?? defaultSessionSize(full.count);
  const plan = useMemo(
    () => practicePlan({ savedOnly: true, size: Math.max(1, chosen) }),
    [practicePlan, chosen],
  );

  if (saved.length === 0) {
    return (
      <div className={styles.page}>
        <AppHeader title={t('vocabulary:saved.title')} onBack={() => navigate('/words')} />
        <div className={`${styles.body} ${styles.bodyEmpty}`}>
          {/*
            §20: a friendly empty state that says how words get here, not a
            zero. "0" with nothing beside it reads as something being broken.
          */}
          <Card tone="warm" padding="lg" className={styles.empty}>
            <HangyulMascot mood="happy" size={64} />
            <p className={styles.emptyTitle}>{t('vocabulary:saved.emptyTitle')}</p>
            <p className={styles.emptyBody}>{t('vocabulary:saved.emptyBody')}</p>
            <Link to="/words" className={styles.emptyLink}>
              {t('vocabulary:saved.emptyCta')}
              <ChevronRightIcon size={16} />
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader title={t('vocabulary:saved.title')} onBack={() => navigate('/words')} />

      <div className={styles.body}>
        {/*
          Reviewing the saved list is one button, and it runs the same quiz
          engine everything else does — §19. A separate set of question types
          for saved words would be a second product to maintain and a different
          experience for no reason.
        */}
        {full.count > 0 && (
          <div className={styles.practice}>
            <SessionSize available={full.count} value={chosen} onChange={setSize} />
            <Button
              size="lg"
              fullWidth
              data-testid="practice-saved"
              onClick={() => navigate('/review/session?set=saved', { state: { plan } })}
            >
              {t('vocabulary:saved.review', { count: plan.count })}
            </Button>
          </div>
        )}
        {full.count === 0 && (
          /*
            Saved, but not yet quizzable.

            A word saved straight from the dictionary has a headword and a gloss
            and no distractor pool, so there is no fair question to build from
            it — see §43. Saying so is better than a practice button that opens
            an empty session, and better than silently hiding the button.
          */
          <p className={styles.note} role="status">
            {t('vocabulary:saved.notPractisable')}
          </p>
        )}

        <div className={styles.searchRow}>
          <SearchIcon size={18} />
          <input
            type="search"
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('vocabulary:saved.searchPlaceholder')}
            aria-label={t('vocabulary:saved.searchLabel')}
            autoComplete="off"
          />
        </div>

        <div className={styles.chips} role="group" aria-label={t('vocabulary:saved.orderLabel')}>
          {(['recent', 'alphabetical', 'needed'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`${styles.chip} ${order === option ? styles.chipOn : ''}`}
              onClick={() => setOrder(option)}
              aria-pressed={order === option}
            >
              {t(`vocabulary:saved.order.${option}`)}
            </button>
          ))}
        </div>

        <p className={styles.count} role="status">
          {t('vocabulary:saved.count', { count: shown.length })}
        </p>

        <ul className={styles.list}>
          {shown.map((row) => {
            const copy = row.kind === 'word' ? wordCopy(row.word, locale) : null;
            const meaning = meaningOf(row);
            const hit = row.kind === 'dict' ? glosses.get(row.headword) : undefined;
            const open = () =>
              row.kind === 'word'
                ? navigate(`/words/word/${row.word.id}`)
                : navigate(`/words/dictionary/${encodeURIComponent(row.headword)}`);
            return (
              <li key={row.key}>
                <Card padding="md" className={styles.row}>
                  <button type="button" className={styles.rowMain} onClick={open}>
                    <span className={styles.rowWord} lang="ko" dir="ltr">
                      {headwordOf(row)}
                    </span>
                    <span className={styles.rowText}>
                      {copy ? (
                        <LocalizedText as="span" locale={copy.locale} className={styles.rowMeaning}>
                          {copy.value.meaning}
                        </LocalizedText>
                      ) : (
                        <span className={styles.rowMeaning}>{meaning}</span>
                      )}
                      {/* Revised Romanisation, the same reading aid the word's
                          own page shows. It used to be IPA here too. */}
                      <span className={styles.rowSub} lang="ko-Latn" dir="ltr">
                        {row.kind === 'word' ? row.word.romanization : (hit?.romanization ?? '')}
                      </span>
                    </span>
                    <ChevronRightIcon size={18} />
                  </button>
                  {/*
                    Only a taught word has a recording. A dictionary headword is
                    text, and a speaker button that plays nothing is worse than
                    no speaker button.
                  */}
                  {row.kind === 'word' && (
                    <SpeakerButton
                      audioId={row.word.audio.word}
                      label={row.word.word}
                      size="sm"
                      tone="plain"
                    />
                  )}
                  <button
                    type="button"
                    className={styles.rowAction}
                    onClick={() =>
                      row.kind === 'word'
                        ? toggleSaved('word', row.word.id)
                        : toggleSavedHeadword(row.headword)
                    }
                  >
                    {t('vocabulary:saved.remove')}
                  </button>
                </Card>
              </li>
            );
          })}
        </ul>

        {shown.length === 0 && (
          <p className={styles.none} role="status">
            {t('vocabulary:saved.noMatch', { query: deferredQuery })}
          </p>
        )}
      </div>
    </div>
  );
}
