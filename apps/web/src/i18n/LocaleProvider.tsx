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
  readStoredLocale,
  resolveLocale,
  suggestLocaleFromBrowser,
  writeStoredLocale,
  type LocaleSource,
} from './preference';
import { AVAILABLE_LOCALES } from './resources';
import { hasWordCopy, loadWordCopy } from '../data/wordCopy';

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
  const [, setCopyLoaded] = useState(0);
  const loadCopy = useCallback((next: string) => {
    if (hasWordCopy(next)) return;
    void loadWordCopy(next).then(() => setCopyLoaded((n) => n + 1));
  }, []);

  const apply = useCallback(
    async (next: string, nextSource: LocaleSource) => {
      loadCopy(next);
      if (i18n.language !== next) await i18n.changeLanguage(next);
      setLocaleState(next);
      setSource(nextSource);
    },
    [i18n, loadCopy],
  );

  // The initial locale is resolved synchronously so the first render is already
  // in the right language; its word copy is fetched here, on the same path as
  // every later change.
  useEffect(() => {
    loadCopy(initial.locale);
  }, [initial.locale, loadCopy]);

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
    }),
    [locale, descriptor, source, available, setLocale, suggestion],
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
    </I18nextProvider>
  );
}

export { DEFAULT_LOCALE };
