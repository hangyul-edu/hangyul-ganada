import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { getWord } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
import { pronunciationOf } from '../data/pronunciation';
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
  const { state, practicePlan, toggleSaved } = useLearner();
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
    const rows: VocabularyWord[] = [];
    for (const key of state.settings.saved_items) {
      if (!key.startsWith('word:')) continue;
      const word = getWord(key.slice('word:'.length));
      if (word) rows.push(word);
    }
    return rows.reverse();
  }, [state.settings.saved_items]);

  /** What the scheduler thinks of each saved word. Only used to order by need. */
  const weakest = useMemo(() => {
    const out = new Map<string, number>();
    for (const word of saved) {
      const item = state.memory[`word:${word.id}`];
      const states = Object.values(item?.skills ?? {}).filter(Boolean);
      out.set(word.id, states.length === 0 ? 0 : Math.min(...states.map((s) => s!.stability_days)));
    }
    return out;
  }, [saved, state.memory]);

  const shown = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const matched = needle
      ? saved.filter((word) => {
          const meaning = wordCopy(word, locale).value.meaning.toLowerCase();
          return word.word.includes(needle) || meaning.includes(needle);
        })
      : saved;

    if (order === 'alphabetical') return [...matched].sort((a, b) => a.word.localeCompare(b.word));
    // "Needs work first" is the weakest memory first, and an unpractised word
    // counts as weakest — it is the one the learner knows least about.
    if (order === 'needed') {
      return [...matched].sort((a, b) => (weakest.get(a.id) ?? 0) - (weakest.get(b.id) ?? 0));
    }
    return matched;
  }, [saved, deferredQuery, locale, order, weakest]);

  const plan = useMemo(() => practicePlan({ savedOnly: true }), [practicePlan]);

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
        {plan.count > 0 && (
          <Button
            size="lg"
            fullWidth
            onClick={() => navigate('/review/session?set=saved', { state: { plan } })}
          >
            {t('vocabulary:saved.review', { count: plan.count })}
          </Button>
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
          {shown.map((word) => {
            const copy = wordCopy(word, locale);
            return (
              <li key={word.id}>
                <Card padding="md" className={styles.row}>
                  <button
                    type="button"
                    className={styles.rowMain}
                    onClick={() => navigate(`/words/word/${word.id}`)}
                  >
                    <span className={styles.rowWord} lang="ko" dir="ltr">
                      {word.word}
                    </span>
                    <span className={styles.rowText}>
                      <LocalizedText as="span" locale={copy.locale} className={styles.rowMeaning}>
                        {copy.value.meaning}
                      </LocalizedText>
                      <span className={styles.rowSub} lang="ko-Latn-fonipa" dir="ltr">
                        {pronunciationOf(word)}
                      </span>
                    </span>
                    <ChevronRightIcon size={18} />
                  </button>
                  <SpeakerButton audioId={word.audio.word} label={word.word} size="sm" tone="plain" />
                  <button
                    type="button"
                    className={styles.rowAction}
                    onClick={() => toggleSaved('word', word.id)}
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
