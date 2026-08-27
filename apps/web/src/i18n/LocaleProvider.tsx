import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { createI18n } from './config';
import { LocaleContext, type LocaleContextValue } from './LocaleContext';
import {
  DEFAULT_LOCALE,
  describeLocale,
  directionOf,
  sortLocales,
  type LocaleDescriptor,
} from './locales';
import {
  readStoredContentLocale,
  readStoredLocale,
  resolveLocale,
  suggestLocaleFromBrowser,
  writeStoredContentLocale,
  writeStoredLocale,
  type LocaleSource,
} from './preference';
import { AVAILABLE_LOCALES, hasLocaleResources, loadLocaleResources } from './resources';
import { hasLetterCopy, loadLetterCopy } from '../data/letterCopy';
import { WORD_COPY_LOCALES, hasWordCopy, loadWordCopy } from '../data/wordCopy';
import { contentLocale as resolveContentLocale, isBorrowedContent } from './contentLocale';

export interface LocaleProviderProps {
  children: ReactNode;
  /**
   * The preference stored in the learner's local profile. Wins over the device
   * mirror —
   * see the precedence table in `preference.ts`.
   */
  profileLocale?: string | null;
  /** Called when the learner picks a language, so it can be saved to the profile. */
  onLocaleChange?: (locale: string) => void;
  /** Fires after the document language changes, for reloading localized server data. */
  onLocaleApplied?: (locale: string) => void;
}

/**
 * Owns the active language.
 *
 * Language changes here are a state update, not a reload: i18next swaps the
 * resource bundle, every subscribed component re-renders, and the document's
 * `lang`/`dir` attributes follow. Nothing unmounts, so a learner who changes
 * language mid-session keeps the character they were writing.
 */
export function LocaleProvider({
  children,
  profileLocale = null,
  onLocaleChange,
  onLocaleApplied,
}: LocaleProviderProps) {
  const initial = useMemo(
    () => resolveLocale({ profileLocale, storedLocale: readStoredLocale() }),
    // Only the first resolution seeds state; later profile changes are handled
    // by the effect below, which must not fight a choice made since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [locale, setLocaleState] = useState(initial.locale);
  const [source, setSource] = useState<LocaleSource>(initial.source);
  const i18n = useRef(createI18n(initial.locale)).current;
  const chosenHere = useRef(false);

  const available = useMemo(
    () => sortLocales(AVAILABLE_LOCALES.map(describeLocale)),
    [],
  );

  const suggestion = useMemo(() => suggestLocaleFromBrowser(), []);

  /**
   * Bumped when a language's word copy finishes loading.
   *
   * Word meanings live in a per-locale file that is fetched rather than
   * bundled — see `data/wordCopy.ts` — so they cannot arrive in the same tick
   * as the interface strings, which are.
   *
   * The interface does **not** wait for them. Holding the whole language change
   * until a hundred kilobytes has been fetched would freeze the screen on the
   * exact tap where a learner is least sure they pressed the right thing, and
   * on a slow connection it would freeze it for seconds. So the language
   * changes immediately, word meanings fall back to English for the moment in
   * between — marked as a fallback, the way every other piece of unavailable
   * content is — and this counter re-renders the tree when the pack lands.
   */
  const [copyLoaded, setCopyLoaded] = useState(0);

  /**
   * Which language the learner asked to read *word meanings* in.
   *
   * Null for almost everybody: it is only a question at all for the
   * twenty-two interface languages the curriculum has no meanings for. See
   * `contentLocale.ts` for why the answer is one resolved language rather than
   * a per-word fallback.
   */
  const [contentChoice, setContentChoice] = useState<string | null>(() =>
    readStoredContentLocale(),
  );

  const loadCopy = useCallback((next: string) => {
    // Two packs, one counter. The letters are small and the words are not, so
    // they land at different moments; either one arriving is a reason to
    // re-render, and neither is a reason to make the other wait.
    if (!hasLetterCopy(next)) {
      void loadLetterCopy(next).then(() => setCopyLoaded((n) => n + 1));
    }
    /*
      The *content* locale, not the interface one.

      Loading `ta` here would ask for a pack the corpus does not have, fail
      quietly, and leave every Tamil word card resolving to English one gloss at
      a time — which was the shape of the mixed-language quiz bug. The language
      meanings are read in is decided once, in `contentLocale`, and this loads
      that one.
    */
    /*
      Ask for the learner's own language first, then for whatever the meanings
      will actually be read in.

      Both, and in that order, because `WORD_COPY_LOCALES` is filled from the
      corpus manifest and on a cold start it is still empty here — so resolving
      against it answers "English" for everybody, including a Korean learner
      whose pack exists. `loadWordCopy` awaits the manifest itself and resolves
      to nothing for a language the curriculum has no copy for, so asking for
      `ta` costs a no-op and asking for `ko` is the difference between Korean
      meanings and English ones.

      The counter bumps after either resolves, which re-runs the resolution with
      a populated list.
    */
    if (!hasWordCopy(next)) {
      void loadWordCopy(next).then(() => setCopyLoaded((n) => n + 1));
    }
    const forMeanings = resolveContentLocale(next, WORD_COPY_LOCALES, readStoredContentLocale());
    if (forMeanings !== next && !hasWordCopy(forMeanings)) {
      void loadWordCopy(forMeanings).then(() => setCopyLoaded((n) => n + 1));
    }
  }, []);

  /**
   * Puts a language's interface strings in front of i18next before switching.
   *
   * Only English is bundled — see `resources.ts` for the 300 kB that bought —
   * so every other language is a fetch, and the fetch has to finish *before*
   * `changeLanguage`. Switching first would render one frame of `humanizeKey`
   * output: `Continue`, `Skip This One`, a screen of title-cased key leaves.
   *
   * A language already in memory resolves in the same tick, so going back to a
   * language is instant and re-rendering does no work.
   */
  const ensureStrings = useCallback(
    async (next: string): Promise<boolean> => {
      if (hasLocaleResources(next) && i18n.hasResourceBundle(next, 'common')) return false;
      const bundles = await loadLocaleResources(next);
      for (const [namespace, bundle] of Object.entries(bundles)) {
        // `deep`/`overwrite` false: a bundle added twice must not merge into
        // itself, and nothing may overwrite what is already there.
        i18n.addResourceBundle(next, namespace, bundle, false, false);
      }
      return true;
    },
    [i18n],
  );

  const apply = useCallback(
    async (next: string, nextSource: LocaleSource) => {
      loadCopy(next);
      const arrived = await ensureStrings(next);
      if (i18n.language !== next) {
        await i18n.changeLanguage(next);
      } else if (arrived) {
        /*
         * The instance was *created* in this language and its strings have only
         * now landed. There is no language to change, so `changeLanguage` would
         * do nothing — including firing the event `useTranslation` subscribes
         * to. Every component that re-renders for some other reason picks up
         * the new strings anyway, because `t` reads the store when it is
         * called; every component that does not keeps the English it resolved
         * on the first frame.
         *
         * That is not hypothetical. It is what left the bottom navigation
         * reading Home / Letters / Words under a fully Arabic home screen: the
         * tab bar is the one piece of chrome with no reason to re-render.
         */
        i18n.emit('languageChanged', next);
      }
      setLocaleState(next);
      setSource(nextSource);
    },
    [ensureStrings, i18n, loadCopy],
  );

  /*
   * The first language, which is the one case that cannot wait for an effect.
   *
   * `resolveLocale` answers synchronously from `localStorage`, so by the first
   * render we know a Thai learner wants Thai — but the strings are a fetch away
   * and React has already painted English. Rather than gate the whole app on a
   * network round trip, the fetch is started here and applied when it lands:
   * the learner sees English for the length of one small file and then their
   * own language, which is the same trade the word packs already make.
   *
   * English learners — the default — take neither the fetch nor the swap.
   */
  useEffect(() => {
    loadCopy(initial.locale);
    if (initial.locale !== DEFAULT_LOCALE) void apply(initial.locale, initial.source);
    // Once, for the locale the app started in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A profile preference arriving after hydration takes over — unless the
   * learner has already chosen something in this session, in which case their
   * explicit action is the more recent intent and stands.
   */
  useEffect(() => {
    if (chosenHere.current || !profileLocale) return;
    const resolved = resolveLocale({ profileLocale, storedLocale: readStoredLocale() });
    if (resolved.locale !== locale) void apply(resolved.locale, resolved.source);
  }, [profileLocale, locale, apply]);

  // The document has to agree with the app, for screen readers, hyphenation,
  // font selection, and every `:dir()` rule in the stylesheets.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', locale);
    root.setAttribute('dir', directionOf(locale));
    onLocaleApplied?.(locale);
  }, [locale, onLocaleApplied]);

  const setLocale = useCallback(
    async (next: string) => {
      chosenHere.current = true;
      // Persisted before the interface changes, so a reload mid-transition
      // cannot leave the learner back in the previous language.
      writeStoredLocale(next);
      onLocaleChange?.(next);
      await apply(next, 'stored');
    },
    [apply, onLocaleChange],
  );

  /*
    Recomputed when the corpus lands, because `WORD_COPY_LOCALES` is filled from
    the corpus manifest rather than compiled in — before it arrives the honest
    answer is English, and one re-render later it is the learner's language.
  */
  const activeContentLocale = useMemo(
    () => resolveContentLocale(locale, WORD_COPY_LOCALES, contentChoice),
    // `copyLoaded` is the signal that a pack or the manifest has arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, contentChoice, copyLoaded],
  );

  /*
    Tell the offline worker which language to finish downloading.

    The worker precaches band 1 in every language and stops there; the rest of
    the corpus follows whichever language meanings are actually read in, and it
    is the only party that cannot work that out for itself — the choice lives in
    app storage a worker cannot see, and it is not the interface language. See
    `cacheLanguage` in `public/sw.js`.

    Deliberately tolerant of every way this can be unavailable: no worker in the
    browser, no controller yet on a first visit, a native shell that registers
    none at all. Each of those means the learner fetches a band online the first
    time they reach it, which is what happens today.
  */
  useEffect(() => {
    navigator.serviceWorker?.ready
      .then((registration) => {
        registration.active?.postMessage({ type: 'corpus-locale', locale: activeContentLocale });
      })
      .catch(() => {
        /* Offline completion is unavailable; the app is not. */
      });
  }, [activeContentLocale]);

  const setContentLocale = useCallback(
    (next: string | null) => {
      writeStoredContentLocale(next);
      setContentChoice(next);
      const forMeanings = resolveContentLocale(locale, WORD_COPY_LOCALES, next);
      if (!hasWordCopy(forMeanings)) {
        void loadWordCopy(forMeanings).then(() => setCopyLoaded((n) => n + 1));
      } else {
        setCopyLoaded((n) => n + 1);
      }
    },
    [locale],
  );

  /** The languages a learner may choose meanings in, named in their own script. */
  const contentLocales = useMemo(
    () =>
      WORD_COPY_LOCALES.map((code) => describeLocale(code)).sort((a, b) =>
        a.englishName.localeCompare(b.englishName),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [copyLoaded],
  );

  const descriptor = useMemo<LocaleDescriptor>(() => describeLocale(locale), [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      descriptor,
      direction: descriptor.direction,
      source,
      available,
      setLocale,
      suggestion,
      contentLocale: activeContentLocale,
      contentIsBorrowed: isBorrowedContent(locale, activeContentLocale),
      contentLocales,
      setContentLocale,
    }),
    [
      locale,
      descriptor,
      source,
      available,
      setLocale,
      suggestion,
      activeContentLocale,
      contentLocales,
      setContentLocale,
    ],
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </I18nextProvider>
  );
}

export { DEFAULT_LOCALE };
