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
