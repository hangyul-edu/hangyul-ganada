/**
 * Resolving *learning content* against a locale.
 *
 * This is the counterpart to i18next, and the distinction matters more here
 * than anywhere else in the app:
 *
 * - **Target content** is Korean and stays Korean. 가, 한글, 사과 are what the
 *   learner is studying. Nothing in this module touches them.
 * - **Explanatory content** — what a letter sounds like, what a word means, a
 *   mnemonic, an example's translation — is *about* the Korean, and belongs in
 *   the learner's language.
 *
 * So curriculum records carry a `LocalizedMap` of their explanatory fields, and
 * this resolver walks the same fallback chain i18next uses. A UI string and a
 * word's meaning therefore never disagree about where to look next.
 */
import type { LocalizedMap } from '@hangyul-ganada/shared-types';

import { DEFAULT_LOCALE, fallbackChain } from './locales';

export interface ResolvedContent<T> {
  value: T;
  /** The locale the value actually came from. */
  locale: string;
  /** True when the requested locale had no translation and something else was used. */
  isFallback: boolean;
}

/**
 * Picks the best translation for `locale`, reporting which one it used.
 *
 * The `isFallback` flag is not decoration: it is what the translation-coverage
 * report counts, and it lets a screen mark untranslated explanatory text so a
 * learner knows the English is a stand-in rather than a mistake.
 */
export function resolveContent<T>(map: LocalizedMap<T>, locale: string): ResolvedContent<T> {
  for (const candidate of fallbackChain(locale)) {
    const hit = map[candidate];
    if (hit !== undefined) {
      return { value: hit, locale: candidate, isFallback: candidate !== locale };
    }
  }
  // Unreachable: `en` is required by the type and terminates every chain.
  return { value: map.en, locale: DEFAULT_LOCALE, isFallback: true };
}

/** The common case: the value alone. */
export function pickContent<T>(map: LocalizedMap<T>, locale: string): T {
  return resolveContent(map, locale).value;
}

/** Locales a record actually carries a translation for. */
export function translatedLocales(map: LocalizedMap<unknown>): string[] {
  return Object.keys(map).sort();
}
