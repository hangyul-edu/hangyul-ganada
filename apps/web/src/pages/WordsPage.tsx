import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import {
  VOCABULARY_CATEGORIES,
  getLessonWords,
  lessonsInCategory,
  searchWords,
  usesKnownLetters,
  wordsByCategory,
} from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
import { levelProgress } from '../domain/progress';
import { useFormatters, useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Badge } from '../ui/Chip';
import { Card } from '../ui/Card';
import { LocalizedText } from '../ui/LocalizedText';
import { Modal } from '../ui/Modal';
import { ProgressBar } from '../ui/Progress';
import { CheckIcon, ChevronRightIcon, SearchIcon } from '../ui/icons';
import styles from './WordsPage.module.css';

/** How many of a category's new letters the heads-up shows before counting. */
const AHEAD_LETTERS_SHOWN = 10;

/** Enough results to be useful; more than a phone screen can review at once. */
const MAX_RESULTS = 40;

/**
 * The vocabulary, browsed the way a learner thinks about it.
 *
 * **Everything on this screen is open.** All 2,504 words, from the first launch,
 * in any order, as many times as the learner likes. This is a paid app that has
 * already been bought; gating word 40 behind word 39 would be a retention
 * mechanic borrowed from products that still had something to sell.
 *
 * ## Why there are no levels here any more
 *
 * The screen used to be a row of chips reading Level 1 … Level 8, and under each
 * one a stack of numbered sets. Both halves of that were the app talking to
 * itself. "Level 5" cannot be acted on — a learner cannot want level 5 — and it
 * invites a question the product should never have to field: level 5 by whose
 * measure? Meanwhile someone who wanted to learn animal words had no way to find
 * them short of scrolling five hundred entries.
 *
 * So the structure is now semantic: seventeen categories, every word in exactly
 * one, ordered inside each by the same measured score that used to *be* the
 * levels. Animals opens on 개 and 새. The levels still exist, still order the
 * words, and are never shown.
 *
 * ## Finding a word you already have in mind
 *
 * Search sits above the categories rather than replacing them, and looks in both
 * the Korean and the learner's own language, because a beginner types "apple"
 * far more often than 사과 — that is the whole reason they are here.
 */
export function WordsPage() {
  const { state, knownLetters } = useLearner();
  const { t } = useTranslation(['vocabulary', 'common']);
  const { locale } = useLocale();
  const format = useFormatters();

  const [category, setCategory] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Typing stays responsive while a 2,504-word scan runs behind it.
  const deferredQuery = useDeferredValue(query);

  const categories = useMemo(
    () =>
      VOCABULARY_CATEGORIES.map((entry) => {
        const words = wordsByCategory(entry.id);
        return {
          ...entry,
          // The first few words, as a peek inside. A grid of English category
          // names is a table of contents; three Korean words is the thing the
          // learner is actually choosing between — and they are the words they
          // would meet first, because the category is ordered that way.
          sample: words.slice(0, 3).map((word) => word.word),
          progress: levelProgress(state.progress, words),
          // Letters this category needs that the learner has not met. A note on
          // the category, never a condition on it.
          newLetters: entry.required_jamo.filter((jamo) => !knownLetters.has(jamo)),
        };
      }),
    [state.progress, knownLetters],
  );

  const results = useMemo(
    () =>
      deferredQuery.trim()
        ? searchWords(
            deferredQuery,
            (word) => wordCopy(word, locale).value.meaning,
            MAX_RESULTS,
          )
        : [],
    [deferredQuery, locale],
  );

  const selected = category ? categories.find((entry) => entry.id === category) : null;
  const searching = deferredQuery.trim().length > 0;

  return (
    <div className={styles.page}>
      <AppHeader title={t('vocabulary:title')} />

      <div className={styles.body}>
        <p className={styles.intro}>{t('vocabulary:blurb')}</p>

        <div className={styles.controls}>
          <div className={styles.searchRow}>
            <SearchIcon size={18} />
            <input
              type="search"
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('vocabulary:search.placeholder')}
              aria-label={t('vocabulary:search.label')}
              autoComplete="off"
            />
          </div>

          {/*
            A button that opens a sheet, not a native <select>. The list is one
            row per category with a count and a progress figure on each, which a
            platform dropdown cannot show — and on Android a native select over
            a WebView is a grey system list that belongs to a different app.
          */}
          <button
            type="button"
            className={styles.categoryButton}
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
          >
            <span className={styles.categoryButtonLabel}>{t('vocabulary:category.label')}</span>
            <span className={styles.categoryButtonValue}>
              {category
                ? t(`vocabulary:categories.${category}`)
                : t('vocabulary:category.all')}
            </span>
            <ChevronRightIcon size={18} />
          </button>
        </div>

        {searching ? (
          <SearchResults
            query={deferredQuery}
            results={results}
            locale={locale}
            progress={state.progress}
          />
        ) : selected ? (
          <>
            <header className={styles.categoryHead}>
              <div>
                <h2 className={styles.categoryTitle}>
                  {t(`vocabulary:categories.${selected.id}`)}
                </h2>
                <p className={styles.categoryBlurb}>
                  {t('vocabulary:category.count', { count: selected.word_count })}
                </p>
              </div>
              <span className={`${styles.categoryCount} hg-numeric`}>
                {format.fraction(selected.progress.done, selected.progress.total)}
              </span>
            </header>

            <ProgressBar
              value={selected.progress.ratio}
              label={t('vocabulary:category.progressAria', {
                category: t(`vocabulary:categories.${selected.id}`),
              })}
              size="sm"
            />

            {/* A heads-up and a shortcut — not a barrier. Every set below opens
                whether or not the learner takes this route first. */}
            {selected.newLetters.length > 0 && (
              <Card padding="md" className={styles.ahead}>
                <div className={styles.aheadText}>
                  <p className={styles.aheadTitle}>
                    {t('vocabulary:ahead.title', { count: selected.newLetters.length })}
                  </p>
                  <p className={styles.aheadBody}>{t('vocabulary:ahead.body')}</p>
                  <p className={styles.aheadLetters} lang="ko" dir="ltr">
                    {selected.newLetters.slice(0, AHEAD_LETTERS_SHOWN).map((jamo) => (
                      <span key={jamo}>{jamo}</span>
                    ))}
                    {selected.newLetters.length > AHEAD_LETTERS_SHOWN && (
                      <span className={styles.aheadMore}>
                        {t('vocabulary:ahead.more', {
                          count: selected.newLetters.length - AHEAD_LETTERS_SHOWN,
                        })}
                      </span>
                    )}
                  </p>
                </div>
                <Link to="/letters" className={styles.aheadCta}>
                  {t('vocabulary:ahead.cta')}
                  <ChevronRightIcon size={16} />
                </Link>
              </Card>
            )}

            <ul className={styles.list}>
              {lessonsInCategory(selected.id).map((lesson) => {
                const lessonWords = getLessonWords(lesson);
                const done = levelProgress(state.progress, lessonWords);
                const comfortable = lessonWords.every((w) => usesKnownLetters(w, knownLetters));
                const title = t('vocabulary:lesson.title', { index: lesson.set_index });

                return (
                  <li key={lesson.id}>
                    <Link to={`/words/${lesson.id}`} className={styles.rowLink}>
                      <Card padding="md" className={styles.row}>
                        <div className={styles.rowHead}>
                          <div className={styles.rowText}>
                            <div className={styles.rowTitleRow}>
                              <h3 className={styles.rowTitle}>{title}</h3>
                              {done.ratio === 1 ? (
                                <Badge tone="primary">{t('vocabulary:lesson.done')}</Badge>
                              ) : (
                                !comfortable && (
                                  <Badge tone="neutral">{t('vocabulary:lesson.newLetters')}</Badge>
                                )
                              )}
                            </div>
                            <p className={styles.rowWords} lang="ko" dir="ltr">
                              {lessonWords.map((word) => (
                                <span
                                  key={word.id}
                                  className={
                                    state.progress[`word:${word.id}`]?.stage === 'learned'
                                      ? styles.wordDone
                                      : styles.word
                                  }
                                >
                                  {word.word}
                                </span>
                              ))}
                            </p>
                          </div>
                          <ChevronRightIcon size={20} />
                        </div>

                        <div className={styles.rowFoot}>
                          <ProgressBar
                            value={done.ratio}
                            label={t('common:progress.lesson', { name: title })}
                            size="sm"
                          />
                          <span className={`${styles.rowCount} hg-numeric`}>
                            {format.fraction(done.done, done.total)}
                          </span>
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          /* All categories: the map of the vocabulary, with how far through
             each one the learner is. */
          <ul className={styles.categoryGrid}>
            {categories.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={styles.categoryCard}
                  onClick={() => setCategory(entry.id)}
                >
                  <span className={styles.categoryCardTitle}>
                    {t(`vocabulary:categories.${entry.id}`)}
                  </span>
                  <span className={styles.categoryCardSample} lang="ko" dir="ltr">
                    {entry.sample.join(' · ')}
                  </span>
                  <span className={`${styles.categoryCardCount} hg-numeric`}>
                    {format.fraction(entry.progress.done, entry.word_count)}
                  </span>
                  <ProgressBar
                    value={entry.progress.ratio}
                    label={t('vocabulary:category.progressAria', {
                      category: t(`vocabulary:categories.${entry.id}`),
                    })}
                    size="sm"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        variant="sheet"
        title={t('vocabulary:category.pick')}
      >
        <ul className={styles.pickerList}>
          <li>
            <PickerRow
              label={t('vocabulary:category.all')}
              detail={t('vocabulary:category.count', { count: 2504 })}
              selected={category === null}
              onClick={() => {
                setCategory(null);
                setPickerOpen(false);
              }}
            />
          </li>
          {categories.map((entry) => (
            <li key={entry.id}>
              <PickerRow
                label={t(`vocabulary:categories.${entry.id}`)}
                detail={format.fraction(entry.progress.done, entry.word_count)}
                selected={category === entry.id}
                onClick={() => {
                  setCategory(entry.id);
                  setPickerOpen(false);
                }}
              />
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function PickerRow({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.pickerRow} ${selected ? styles.pickerSelected : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className={styles.pickerLabel}>{label}</span>
      <span className={`${styles.pickerDetail} hg-numeric`}>{detail}</span>
      {selected && <CheckIcon size={16} />}
    </button>
  );
}

/**
 * What a search turns up.
 *
 * Each result links to the set the word lives in rather than to the word alone,
 * because there is no single-word screen and there should not be: a word is
 * learned in a session with its sound, its meaning and its sentence, and a page
 * showing it in isolation would be a dictionary entry — which is the thing this
 * product deliberately is not.
 */
function SearchResults({
  query,
  results,
  locale,
  progress,
}: {
  query: string;
  results: Array<{ word: VocabularyWord; lessonId: string }>;
  locale: string;
  progress: Record<string, { stage: string } | undefined>;
}) {
  const { t } = useTranslation('vocabulary');

  if (results.length === 0) {
    return (
      <p className={styles.empty} role="status">
        {t('search.none', { query })}
      </p>
    );
  }

  return (
    <>
      <p className={styles.resultCount} role="status">
        {t('search.count', { count: results.length })}
      </p>
      <ul className={styles.results}>
        {results.map(({ word, lessonId }) => {
          const copy = wordCopy(word, locale);
          return (
            <li key={word.id}>
              <Link to={`/words/${lessonId}`} className={styles.resultLink}>
                <Card padding="md" className={styles.result}>
                  <span className={styles.resultWord} lang="ko" dir="ltr">
                    {word.word}
                  </span>
                  <LocalizedText
                    as="span"
                    locale={copy.locale}
                    className={styles.resultMeaning}
                  >
                    {copy.value.meaning}
                  </LocalizedText>
                  {progress[`word:${word.id}`]?.stage === 'learned' && (
                    <Badge tone="primary">{t('lesson.done')}</Badge>
                  )}
                  <ChevronRightIcon size={18} />
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
