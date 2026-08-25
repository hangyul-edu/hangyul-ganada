import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import type { DictionaryHit } from '../data/dictionary';
import {
  type DictionaryState,
  type InflectionHit,
  useDictionarySearch,
} from '../data/useDictionary';
import { VOCABULARY_CATEGORIES, corpusReady, searchWords, wordsByCategory } from '../data/vocabulary';
import { useCorpusMemo } from '../data/useCorpus';
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

/**
 * How many dictionary hits sit under the taught ones.
 *
 * Fewer than the corpus gets, deliberately. This half of the list is a
 * reference shelf, not a syllabus, and a long tail of it under every search
 * would bury the words the learner is actually being taught.
 */
const MAX_DICTIONARY_RESULTS = 12;

/**
 * The sizes of a second helping.
 *
 * Small, and all of them finishable in one more sitting. There is no "keep
 * going until you stop" option, on purpose.
 */
const EXTRA_WORDS = [5, 10, 20] as const;

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
  const { locale, contentLocale } = useLocale();
  const format = useFormatters();

  const [query, setQuery] = useState('');
  /** Whether the finished card is showing its how-many-more choices. */
  const [more, setMore] = useState(false);
  // Typing stays responsive while the corpus scan runs behind it. At ten
  // thousand rows the scan is still a fraction of a frame; deferring it means
  // that stays true on a slow phone without a worker or an index.
  const deferredQuery = useDeferredValue(query);
  /*
    This screen is the one that reads the corpus *whole*.

    Everything else in the app works on a plan that named its words, so a
    partly-loaded corpus is invisible to it. Browsing and search are the two
    places where "what is in the corpus" is the question being asked, so they
    are the two places that have to notice a band arriving — and, until the last
    one has, say so rather than answer short. See `data/corpus.ts`.
  */
  const results = useCorpusMemo(
    () =>
      deferredQuery.trim()
        ? searchWords(deferredQuery, (word) => wordCopy(word, contentLocale).value.meaning, MAX_RESULTS)
        : [],
    [deferredQuery, locale],
  );
  const searching = deferredQuery.trim().length > 0;

  /*
    The other half of the answer.

    The corpus holds the 2,581 words the app teaches; the dictionary holds seven
    thousand it merely knows. Someone who half-remembers 나가다 and searches for
    it is asking a question, and "no matches" was a wrong answer to it — the
    word exists, it is simply not on the syllabus.

    Fetched only from here, and only once somebody types. See `useDictionary`.
  */
  const dictionary = useDictionarySearch(deferredQuery, MAX_DICTIONARY_RESULTS);

  const categories = useCorpusMemo(
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
                {/*
                  The percentage, beside the fraction and only once there is one
                  to read. It is the figure that carries the extra study: a
                  learner who did twelve of a goal of ten sees 120%, where the
                  fraction alone reads as an odd 12 / 10 and the ring is simply
                  full.
                */}
                {day.done > 0 && (
                  <span className={styles.todayPercent} data-testid="today-percent">
                    {format.percentOver(day.percent / 100)}
                  </span>
                )}
              </p>
              {/*
                One line, and only when it says something the fraction does not.
                A learner part-way through is told they can pick up where they
                left off; one who has finished is told so and left alone. There
                is no third line explaining the scheduler.

                The rule was written here and then broken on the line below it:
                the third state said "A short set of 10 words." under a fraction
                reading 0/10, which is the ten twice in forty vertical pixels
                and nothing else. A learner opening the card has the title, the
                fraction and the button; there is nothing left to tell them.
              */}
              {(day.complete || day.done > 0) && (
                <p className={styles.todayBlurb}>
                  {day.complete
                    ? t('vocabulary:today.doneBlurb')
                    : t('vocabulary:today.resumeBlurb')}
                </p>
              )}
              {/*
                That the words were chosen for this learner, said once and
                quietly.

                Personalisation the learner cannot see is personalisation they
                do not get the benefit of — they need to know that today's ten
                are theirs rather than everybody's, or a word they find easy
                reads as the app being simple rather than as the app being
                right. One line, no explanation of how, and nothing at all
                before they have a level: an app that has not measured anything
                should not imply that it has.
              */}
              {state.settings.level_test && (
                <p className={styles.todayLevel} data-testid="today-level">
                  {t('vocabulary:today.tunedTo', { level: state.settings.level_test.level })}
                </p>
              )}
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
              {/*
                The offer, and then how much.

                Two taps rather than one, and the second is the point: "a little
                more" used to mean whatever the scheduler felt like, which is the
                app deciding how long the learner stays. Five, ten or twenty is
                the learner deciding, and the size they pick is the size they
                get. None of it moves the goal — see `extendDay`.
              */}
              {more ? (
                <div className={styles.todayMoreOptions} role="group" aria-label={t('vocabulary:today.moreLabel')}>
                  {EXTRA_WORDS.map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={styles.todayMoreOption}
                      onClick={() => {
                        extendVocabularyDay(count);
                        setMore(false);
                        navigate('/words/today');
                      }}
                    >
                      {t('vocabulary:today.moreCount', { count })}
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" className={styles.todayMore} onClick={() => setMore(true)}>
                  {t('vocabulary:today.more')}
                </button>
              )}
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
          <SearchResults
            query={deferredQuery}
            results={results}
            /* Meanings, so the *content* locale — see `i18n/contentLocale.ts`. */
            locale={contentLocale}
            dictionary={dictionary}
          />
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
  dictionary,
}: {
  query: string;
  results: Array<{ word: VocabularyWord }>;
  locale: string;
  dictionary: { hits: DictionaryHit[]; state: DictionaryState; inflections: InflectionHit[] };
}) {
  const { t } = useTranslation('vocabulary');

  /*
    A word the app teaches is never also offered as a dictionary entry.

    Both halves would match 차, and two rows for one word is a choice a learner
    should not have to make — especially when one leads to a hand-written card
    with a picture and a recording and the other to a bare gloss. The taught
    card wins; the dictionary's *other* senses of 차 are on that card, under
    Other meanings, where they belong.
  */
  const taught = new Set(results.map(({ word }) => word.word));
  const extra = dictionary.hits.filter((hit) => !taught.has(hit.headword));

  /*
    What a learner types is usually not what a dictionary contains.

    Korean never writes the dictionary form in a sentence, so somebody who saw
    먹었어요 and wanted to know what it was got "nothing matches" — from a
    dictionary that has 먹다 and 26,674 other words. The analyser turns the
    typed form back into the words it could be (see `analyseInflection`) and
    this row says so out loud before opening one: **먹었어요 → 먹다**. A learner
    should be able to see the connection, not just be silently redirected.
  */
  const inflections = dictionary.inflections;

  if (results.length === 0 && extra.length === 0 && inflections.length === 0) {
    /*
      Four states, and each of them says a different true thing.

      "Nothing matches" is a claim, and it is only true once both halves have
      arrived and neither is still working. Said while band 3 of the corpus is
      in flight it tells a learner the product does not teach a word it
      certainly teaches; said while the dictionary index is downloading it is
      simply early. And it used to be said when the dictionary had *failed* to
      download, which is the worst of the four: a learner offline in a train
      was told their word does not exist, when what happened is that the
      reference half of the app could not be fetched. `unavailable` is a state
      the hook has always had and this screen never rendered.
    */
    const message = !corpusReady()
      ? t('search.loading')
      : dictionary.state === 'loading'
        ? t('dictionary.searching')
        : dictionary.state === 'unavailable'
          ? t('dictionary.unavailable')
          : t('search.none', { query });
    return (
      <p className={styles.empty} role="status">
        {message}
      </p>
    );
  }

  return (
    <>
      {inflections.length > 0 && (
        <ul className={styles.inflections}>
          {inflections.map((found) => (
            <li key={found.lemma}>
              <Link
                to={`/words/dictionary/${encodeURIComponent(found.lemma)}`}
                className={styles.inflection}
                data-testid="inflection-hit"
              >
                <span className={styles.inflectionFrom} lang="ko" dir="ltr">
                  {query.trim()}
                </span>
                <span className={styles.inflectionArrow} aria-hidden="true">
                  →
                </span>
                <span className={styles.inflectionTo} lang="ko" dir="ltr">
                  {found.lemma}
                </span>
                <span className={styles.inflectionGloss}>{found.hit.shortGloss}</span>
                <ChevronRightIcon size={18} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {results.length + extra.length > 0 && (
        <p className={styles.resultCount} role="status">
          {t('search.count', { count: results.length + extra.length })}
        </p>
      )}
      {/*
        One list, taught words first.

        It used to be two, under a heading that said the lower half was
        "reference only, not part of your daily practice". That sentence is
        true and it is the wrong screen for it: somebody who has typed a word
        into a search box wants to know whether the word is there, not which of
        the app's two corpora it came from. Splitting the answer in half made
        them read a paragraph to find out.

        The distinction has not been dropped — it is made where it matters, on
        the entry itself, which opens with exactly that line. Here the rows
        differ by where they lead, which is the only difference a learner acts
        on: a taught word opens its card, a dictionary word opens its entry.
      */}
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

      {extra.length > 0 && (
        <>
          <ul className={styles.results}>
            {extra.map((hit) => (
              <li key={hit.headword}>
                <Card padding="md" className={styles.result}>
                  <Link
                    to={`/words/dictionary/${encodeURIComponent(hit.headword)}`}
                    className={styles.resultMain}
                  >
                    <span className={styles.resultWord} lang="ko" dir="ltr">
                      {hit.headword}
                    </span>
                    <span className={styles.resultMeaning}>{hit.shortGloss}</span>
                    <ChevronRightIcon size={18} />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {dictionary.state === 'unavailable' && (
        <p className={styles.dictionaryNote} role="status">
          {t('dictionary.unavailable')}
        </p>
      )}
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
 * Every word in the category is reachable. Rendering starts at a page-sized
 * batch and grows as the learner approaches the bottom — an implementation
 * detail the screen never mentions, because "Showing 120 of 200" is a fact
 * about the DOM and not about the category. The one number shown is the size
 * of the category itself.
 */
export function WordCategoryPage({ category }: { category: string }) {
  const { t } = useTranslation(['vocabulary', 'common']);
  const { contentLocale } = useLocale();
  const { isSaved, toggleSaved } = useLearner();

  const words = useMemo(() => wordsByCategory(category), [category]);
  const [renderCount, setRenderCount] = useState(CATEGORY_BATCH);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Grow the list before the learner reaches its end. The sentinel sits under
  // the last rendered card; a viewport-margin of two screens means the next
  // batch is usually in the DOM before the scroll arrives, so the growth is
  // invisible. Falls back to rendering everything where IntersectionObserver
  // does not exist (old WebViews, some test environments) — a long list is
  // slower than a grown one, but every word is still there.
  useEffect(() => {
    if (renderCount >= words.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      setRenderCount(words.length);
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRenderCount((count) => Math.min(count + CATEGORY_BATCH, words.length));
        }
      },
      { rootMargin: '200% 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [renderCount, words.length]);

  const shown = words.slice(0, renderCount);

  return (
    <div className={styles.page}>
      <AppHeader title={t(`vocabulary:categories.${category}`)} />
      <div className={styles.body}>
        <p className={styles.categoryNote}>
          {t('vocabulary:category.count', { count: words.length })}
        </p>
        <ul className={styles.results}>
          {shown.map((word) => {
            const copy = wordCopy(word, contentLocale);
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
        {renderCount < words.length && <div ref={sentinelRef} aria-hidden="true" />}
      </div>
    </div>
  );
}

/**
 * How many category words are rendered per growth step.
 *
 * The list grows seamlessly as the learner scrolls (see the observer in
 * `WordCategoryPage`), so this number is about frame budget, not about how
 * much of the category a learner may see — they can always reach all of it.
 */
const CATEGORY_BATCH = 120;

/** Reads the category out of the route. Kept apart so the page stays testable. */
export function WordCategoryRoute() {
  const { category } = useParams<{ category: string }>();
  if (!category || !VOCABULARY_CATEGORIES.some((entry) => entry.id === category)) {
    return <NotFoundBody messageKey="notFound.wordLesson" />;
  }
  return <WordCategoryPage category={category} />;
}
