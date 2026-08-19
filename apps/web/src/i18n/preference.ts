/**
 * Which language the interface speaks, and why.
 *
 * The precedence is fixed and deliberate:
 *
 *   1. an stored profile preference (from the learner profile / API)
 *   2. an explicit local preference (this device, chosen by the learner)
 *   3. English
 *
 * The browser's locale is **not** in that list. It is used to *suggest* a
 * language during onboarding and nothing more. A learner opening the app from
 * Seoul gets English until they say otherwise, because this product's audience
 * is people learning Korean, not people who already read it — and because a
 * default that changes depending on where you happen to be standing is a
 * default nobody can reason about.
 */
import { AVAILABLE_LOCALES } from './resources';
import { DEFAULT_LOCALE, isValidLocale, negotiateLocale } from './locales';

/** Where the device-level choice is stored. */
export const LOCALE_STORAGE_KEY = 'hangyul_ganada:locale';

/** The pre-rename key, read once so an existing learner keeps their language. */
const LEGACY_LOCALE_STORAGE_KEY = 'hangyul-start:locale';

export type LocaleSource = 'account' | 'stored' | 'default';

export interface LocaleResolution {
  locale: string;
  source: LocaleSource;
}

export interface ResolveLocaleInput {
  /** The learner's account-level preference, when there is an account. */
  profileLocale?: string | null;
  /** What was last chosen on this device. */
  storedLocale?: string | null;
  /** Locales that ship a translation. Defaults to everything bundled. */
  available?: readonly string[];
}

/**
 * Applies the precedence rules above.
 *
 * Each candidate is negotiated against what is actually available, so a stored
 * `pt-BR` still resolves when only `pt` ships — and a preference for a language
 * we have since dropped falls through to the next rule rather than to a blank
 * interface.
 */
export function resolveLocale({
  profileLocale,
  storedLocale,
  available = AVAILABLE_LOCALES,
}: ResolveLocaleInput): LocaleResolution {
  for (const [value, source] of [
    [profileLocale, 'account'],
    [storedLocale, 'stored'],
  ] as const) {
    // An invalid stored value is corruption, not a choice — fall through to the
    // next rule rather than handing a junk tag to i18next.
    if (!value || !isValidLocale(value)) continue;
    // The result may still be English, when the learner asked for a language we
    // do not ship yet. `source` records that they *did* choose, which is what
    // stops the browser-language nudge from pestering someone who has already
    // made up their mind.
    return { locale: negotiateLocale(value, available), source };
  }
  return { locale: DEFAULT_LOCALE, source: 'default' };
}

export function readStoredLocale(): string | null {
  try {
    return (
      window.localStorage.getItem(LOCALE_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY)
    );
  } catch {
    // Private mode. The session still works; the choice just will not persist.
    return null;
  }
}

export function writeStoredLocale(locale: string): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * A language worth *offering*, based on where the browser says the learner is.
 *
 * Returns null when the suggestion would be English (already the default) or
 * when the browser's language is one we do not ship. Callers use this for an
 * onboarding nudge — never to change the interface on their own.
 */
export function suggestLocaleFromBrowser(
  navigatorLanguages: readonly string[] = typeof navigator === 'undefined'
    ? []
    : (navigator.languages ?? [navigator.language]),
  available: readonly string[] = AVAILABLE_LOCALES,
): string | null {
  for (const candidate of navigatorLanguages) {
    if (!candidate || !isValidLocale(candidate)) continue;
    const negotiated = negotiateLocale(candidate, available);
    if (negotiated !== DEFAULT_LOCALE) return negotiated;
  }
  return null;
}
