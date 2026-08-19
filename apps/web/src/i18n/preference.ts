/**
 * Which language the interface speaks, and why.
 *
 * The precedence is fixed and deliberate:
 *
 *   1. a stored profile preference (from the learner profile / API)
 *   2. an explicit local preference (this device, chosen by the learner)
 *   3. **the device's own language**, when we ship it
 *   4. English
 *
 * ## Why the device language moved into the list
 *
 * It used to be excluded on purpose, and the argument was that a default which
 * changes depending on where you are standing is a default nobody can reason
 * about. That is true, and it was answering the wrong question.
 *
 * The person this rule decides for is somebody who has just installed a Korean
 * *beginner's* app and speaks neither Korean nor, necessarily, English. Under
 * the old rule their first screen was in English, and the way out was a
 * settings screen labelled — in English — "Language". Reasoning about the
 * default is not something they were in a position to do; reading it was not
 * either. A learner whose phone is in Japanese gets Japanese, which is not a
 * guess: it is the one piece of evidence the device actually has about what
 * they read.
 *
 * The concern the old rule was protecting against is real and narrow — a
 * Korean-speaking device getting a Korean interface — and it is not a problem.
 * Korean is a shipped interface language precisely because Korean speakers use
 * this app to learn the writing system; the *content* stays Korean either way.
 *
 * Rule 2 still wins, so a learner who has ever chosen is never overridden, and
 * `source` still records whether they chose — which is what stops the
 * suggestion nudge from pestering somebody who has made up their mind.
 */
import { AVAILABLE_LOCALES } from './resources';
import { DEFAULT_LOCALE, baseLanguage, isValidLocale, negotiateLocale } from './locales';

/** Where the device-level choice is stored. */
export const LOCALE_STORAGE_KEY = 'hangyul_ganada:locale';

/** The pre-rename key, read once so an existing learner keeps their language. */
const LEGACY_LOCALE_STORAGE_KEY = 'hangyul-start:locale';

export type LocaleSource = 'account' | 'stored' | 'device' | 'default';

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
  /**
   * What the device says it reads, most preferred first.
   *
   * Injected rather than read here, so the precedence is testable without a
   * browser and so a caller can pass a platform locale on native where
   * `navigator.languages` is the WebView's rather than the system's.
   */
  deviceLanguages?: readonly string[];
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
  deviceLanguages = readDeviceLanguages(),
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

  /*
   * Rule 3: the device, but only when we actually ship what it asks for.
   *
   * `negotiateLocale` returns English both for "you asked for English" and for
   * "we have nothing like what you asked for", so a bare call cannot tell a
   * match from a miss. The candidate is therefore checked against the available
   * list before it is accepted, and a device set to a language we do not ship
   * falls through to rule 4 — labelled `default`, not `device`, so the
   * suggestion nudge still knows nobody has chosen anything.
   */
  for (const candidate of deviceLanguages) {
    if (!candidate || !isValidLocale(candidate)) continue;
    const negotiated = negotiateLocale(candidate, available);
    if (!matches(candidate, negotiated)) continue;
    return { locale: negotiated, source: 'device' };
  }

  return { locale: DEFAULT_LOCALE, source: 'default' };
}

/** Whether a negotiated result is genuinely the language that was asked for. */
function matches(requested: string, negotiated: string): boolean {
  return baseLanguage(requested) === baseLanguage(negotiated);
}

/**
 * What the device says it reads, most preferred first.
 *
 * Guarded because this runs during the first render on every platform the app
 * ships to, including a server-side render and a test environment where
 * `navigator` may not exist at all.
 */
export function readDeviceLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages ?? (navigator.language ? [navigator.language] : []);
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
