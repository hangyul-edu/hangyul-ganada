import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { VOCABULARY_CATEGORIES, searchWords, wordsByCategory } from '../data/vocabulary';
import { wordCopy } from '../data/wordCopy';
import { useFormatters, useLocale } from '../i18n';
import { useLearner } from '../store/LearnerContext';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { HangyulMascot } from '../ui/HangyulMascot';
import { LocalizedText } from '../ui/LocalizedText';
import { CircularProgress } from '../ui/Progress';
import { ChevronRightIcon, SearchIcon } from '../ui/icons';
import { NotFoundBody } from './NotFoundPage';
import styles from './WordsPage.module.css';

/** Enough results to be useful; more than a phone screen can review at once. */
const MAX_RESULTS = 40;

/** How many words a category card previews. Three is a taste, not a table. */
const SAMPLE = 3;

/**
 * Vocabulary: today's goal, and two ways to look things up.
 *
 * ## What this screen is not any more
 *
 * It was a browser. Seventeen categories, each a stack of numbered sets, each
 * set six words — and the way to study was to pick a category, pick a set, and
 * start writing syllables. Every learner made two decisions before meeting any
 * Korean, and the decisions were between things they had no basis to choose
 * between. "Set 13" is not a thing anybody can want.
 *
 * The corpus behind it is about to be four times larger. Scaling that screen up
 * would have meant a list of ten thousand words, which is not a curriculum —
 * it is a dictionary with a progress bar, and it tells a beginner that they have
 * ten thousand things to do.
 *
 * ## What it is
 *
 * ```
 * 오늘의 어휘
 * 3 / 10
 * [ 이어 학습하기 ]
 * ```
 *
 * One number and one button. The number is *words finished today*, the button
 * runs today's plan, and neither requires the learner to choose anything. Ten
 * thousand words sit behind it and none of them is on screen, because the size
 * of the corpus is the product's problem and not the learner's.
 *
 * ## Categories and search are still here, one tap down
 *
 * Depth without complexity means the depth has to be reachable — somebody who
 * wants the food words, or who half-remembers a word and wants to find it,
 * must be able to. So both are on this screen and both are *below* the day's
 * card: a secondary tool with a heading over it, not the way in.
 */
export function WordsPage() {
  const navigate = useNavigate();
  const { vocabularyProgressToday, extendVocabularyDay, state } = useLearner();
  const savedCount = state.settings.saved_items.filter((key) => key.startsWith('word:')).length;
  const { t } = useTranslation(['vocabulary', 'common']);
  const { locale } = useLocale();
  const format = useFormatters();

  const [query, setQuery] = useState('');
  // Typing stays responsive while the corpus scan runs behind it. At ten
  // thousand rows the scan is still a fraction of a frame; deferring it means
  // that stays true on a slow phone without a worker or an index.
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(
    () =>
      deferredQuery.trim()
        ? searchWords(deferredQuery, (word) => wordCopy(word, locale).value.meaning, MAX_RESULTS)
        : [],
    [deferredQuery, locale],
  );
  const searching = deferredQuery.trim().length > 0;

  const categories = useMemo(
    () =>
      VOCABULARY_CATEGORIES.map((entry) => ({
        ...entry,
        // The first few words, as a peek inside. A grid of category names is a
        // table of contents; three Korean words is the thing being chosen
        // between — and they are the words this category would open on.
        sample: wordsByCategory(entry.id)
          .slice(0, SAMPLE)
          .map((word) => word.word),
      })),
    [],
  );

  const day = vocabularyProgressToday;

  return (
    <div className={styles.page}>
      <AppHeader title={t('vocabulary:title')} />

      <div className={styles.body}>
        {/*
          The day, above everything. It is the answer to "what do I do", and on
          a phone the answer has to be reachable without a scroll.
        */}
        <Card tone="featured" padding="lg" className={styles.today} data-testid="today-card">
          <div className={styles.todayTop}>
            <div className={styles.todayText}>
              <h2 className={styles.todayTitle}>{t('vocabulary:today.title')}</h2>
              <p className={styles.todayCount}>
                <strong className="hg-numeric">{format.fraction(day.done, day.total)}</strong>
              </p>
              {/*
                One line, and only when it says something the fraction does not.
                A learner part-way through is told they can pick up where they
                left off; one who has finished is told so and left alone. There
                is no third line explaining the scheduler.
              */}
              <p className={styles.todayBlurb}>
                {day.complete
                  ? t('vocabulary:today.doneBlurb')
                  : day.done > 0
                    ? t('vocabulary:today.resumeBlurb')
                    : t('vocabulary:today.startBlurb', { count: day.total })}
              </p>
            </div>
            {/*
              The ring appears once there is something to show.

              A 0% gauge on a first launch is a large, precise picture of having
              done nothing — §61's "do not turn goals into pressure", drawn at
              92 pixels. The fraction beside it already says 0 / 10 without
              making a graphic of it, and the moment the learner finishes one
              word the ring arrives with something in it.
            */}
            {day.done > 0 && (
              <CircularProgress
                value={day.ratio}
                label={t('vocabulary:today.progressAria')}
                size={84}
              />
            )}
          </div>

          {day.complete ? (
            /*
             * Finished, and not pushed into another one.
             *
             * The offer is deliberately quiet and deliberately optional: a goal
             * that is immediately replaced by a second goal is not a goal. See
             * §61 — this system exists to make starting easy, not to keep
             * somebody going until they stop.
             */
            <div className={styles.todayDone}>
              <HangyulMascot mood="cheer" size={28} />
              <span>{t('vocabulary:today.completeTitle')}</span>
              <button
                type="button"
                className={styles.todayMore}
                onClick={() => {
                  extendVocabularyDay();
                  navigate('/words/today');
                }}
              >
                {t('vocabulary:today.more')}
              </button>
            </div>
          ) : (
            <Button size="lg" fullWidth onClick={() => navigate('/words/today')}>
              {day.done > 0 ? t('vocabulary:today.resume') : t('vocabulary:today.start')}
            </Button>
          )}
        </Card>

        {/*
          Saved words, where a learner would look for them: on the vocabulary
          screen, beside search. It is also on Review, because a saved word is
          something you revisit as well as something you collect.
        */}
        <Link to="/words/saved" className={styles.savedLink}>
          <span>{t('vocabulary:saved.title')}</span>
          <span className={`${styles.savedLinkCount} hg-numeric`}>{savedCount}</span>
          <ChevronRightIcon size={18} />
        </Link>

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

        {searching ? (
          <SearchResults query={deferredQuery} results={results} locale={locale} />
        ) : (
          <section aria-labelledby="browse-heading">
            <h2 id="browse-heading" className={styles.sectionTitle}>
              {t('vocabulary:browse.title')}
            </h2>
            <ul className={styles.categoryGrid}>
              {categories.map((entry) => (
                <li key={entry.id}>
                  <Link to={`/words/category/${entry.id}`} className={styles.categoryCard}>
                    <span className={styles.categoryCardTitle}>
                      {t(`vocabulary:categories.${entry.id}`)}
                    </span>
                    <span className={styles.categoryCardSample} lang="ko" dir="ltr">
                      {entry.sample.join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * What a search turns up.
 *
 * A word and what it means, and nothing else — no set to join, no lesson to
 * open. Search answers "what does this mean", which is a complete answer; the
 * way to *learn* a word is the daily session, and sending someone from a search
 * result into a six-word writing lesson was the old screen's way of pretending
 * otherwise.
 */
function SearchResults({
  query,
  results,
  locale,
}: {
  query: string;
  results: Array<{ word: VocabularyWord }>;
  locale: string;
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
        {results.map(({ word }) => {
          const copy = wordCopy(word, locale);
          return (
            <li key={word.id}>
              <Card padding="md" className={styles.result}>
                <Link to={`/words/word/${word.id}`} className={styles.resultMain}>
                  <span className={styles.resultWord} lang="ko" dir="ltr">
                    {word.word}
                  </span>
                  <LocalizedText as="span" locale={copy.locale} className={styles.resultMeaning}>
                    {copy.value.meaning}
                  </LocalizedText>
                  <ChevronRightIcon size={18} />
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * One category, browsed.
 *
 * A flat list of its words with their meanings — no sets, no numbers, no
 * progress bar per chunk. It is a reference view: somebody who wants to see the
 * food words sees the food words. Studying still happens in the daily session,
 * which is why there is no "start this category" button here to compete with
 * the day's goal.
 *
 * Capped, because a category of two thousand words is a scroll nobody finishes
 * and a DOM nobody should build. The cap is stated rather than silent.
 */
export function WordCategoryPage({ category }: { category: string }) {
  const { t } = useTranslation(['vocabulary', 'common']);
  const { locale } = useLocale();
  const { isSaved, toggleSaved } = useLearner();

  const words = useMemo(() => wordsByCategory(category), [category]);
  const shown = words.slice(0, CATEGORY_LIMIT);

  return (
    <div className={styles.page}>
      <AppHeader title={t(`vocabulary:categories.${category}`)} />
      <div className={styles.body}>
        <p className={styles.categoryNote}>
          {words.length > CATEGORY_LIMIT
            ? t('vocabulary:browse.showing', { shown: shown.length, total: words.length })
            : t('vocabulary:category.count', { count: words.length })}
        </p>
        <ul className={styles.results}>
          {shown.map((word) => {
            const copy = wordCopy(word, locale);
            const saved = isSaved('word', word.id);
            return (
              <li key={word.id}>
                <Card padding="md" className={styles.result}>
                  {/*
                    The card body is the link, and Save is its sibling.

                    Not a click handler on the card with `stopPropagation` on
                    the button: that shape puts a control inside a control, and
                    it is the arrangement where a mis-tap on the edge of Save
                    navigates away from the list a learner was working down.
                    Two siblings cannot do that to each other — there is nothing
                    to propagate to — and the link is a real anchor, so it can
                    be tabbed to, opened in a new tab, and read by a screen
                    reader as the destination it is.
                  */}
                  <Link to={`/words/word/${word.id}`} className={styles.resultMain}>
                    <span className={styles.resultWord} lang="ko" dir="ltr">
                      {word.word}
                    </span>
                    <LocalizedText as="span" locale={copy.locale} className={styles.resultMeaning}>
                      {copy.value.meaning}
                    </LocalizedText>
                  </Link>
                  <button
                    type="button"
                    className={styles.saveToggle}
                    onClick={() => toggleSaved('word', word.id)}
                    aria-pressed={saved}
                  >
                    {saved ? t('common:actions.saved') : t('common:actions.save')}
                  </button>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * How many of a category's words are rendered.
 *
 * A hard cap rather than pagination or virtualisation, because this is a
 * secondary screen and the honest answer to "show me two thousand words" is
 * that nobody reads two thousand words. The count above the list says what was
 * shown and what was not, so the cap is visible rather than a silent truncation
 * that reads as "this is all of them".
 */
const CATEGORY_LIMIT = 120;

/** Reads the category out of the route. Kept apart so the page stays testable. */
export function WordCategoryRoute() {
  const { category } = useParams<{ category: string }>();
  if (!category || !VOCABULARY_CATEGORIES.some((entry) => entry.id === category)) {
    return <NotFoundBody messageKey="notFound.wordLesson" />;
  }
  return <WordCategoryPage category={category} />;
}
