import { createContext, useContext } from 'react';

import type { LocaleDescriptor, TextDirection } from './locales';
import type { LocaleSource } from './preference';

export interface LocaleContextValue {
  /** The active BCP-47 tag. Always one the app has resources for. */
  locale: string;
  descriptor: LocaleDescriptor;
  direction: TextDirection;
  /** Which precedence rule produced the active locale. */
  source: LocaleSource;
  /** Every locale that ships a translation, sorted by English name. */
  available: LocaleDescriptor[];
  /**
   * Switches language at runtime: no reload, no remount, and the choice is
   * persisted before this resolves.
   */
  setLocale: (locale: string) => Promise<void>;
  /**
   * A language the browser suggests we offer, or null. Never applied
   * automatically — English stays the default until the learner chooses.
   */
  suggestion: string | null;
  /**
   * The language *word meanings* are shown in.
   *
   * Equal to `locale` for the ten languages the curriculum has meanings for,
   * and a resolved second language for the other twenty-two. Every screen that
   * glosses a Korean word reads this rather than `locale`, which is what stops
   * a Tamil question from being answered with English choices. See
   * `i18n/contentLocale.ts`.
   */
  contentLocale: string;
  /** True when `contentLocale` is not the language the interface is in. */
  contentIsBorrowed: boolean;
  /** The languages the corpus has meanings in, sorted by English name. */
  contentLocales: LocaleDescriptor[];
  /** Chooses which of `contentLocales` to read meanings in. Null clears it. */
  setContentLocale: (locale: string | null) => void;
}

/**
 * Kept apart from the provider component so `LocaleProvider.tsx` exports only a
 * component and stays eligible for React Fast Refresh.
 */
export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
