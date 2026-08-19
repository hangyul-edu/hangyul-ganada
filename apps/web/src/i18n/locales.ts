/**
 * The locale registry.
 *
 * One place that knows what a locale *is* — its code, how it names itself, how
 * it is named in English, and which way it reads. Nothing else in the app may
 * hold a list of languages; components ask this module.
 *
 * The registry is not a whitelist of "the languages we support". Any valid
 * BCP-47 tag resolves: `describeLocale('yo-NG')` returns a usable descriptor
 * built from `Intl.DisplayNames` even though nobody has written a Yoruba
 * translation yet. The curated table exists so the common cases have
 * hand-checked endonyms and so script/region variants that `Intl` names poorly
 * (Chinese, Portuguese) read the way a speaker expects.
 *
 * What we *ship* translations for is a separate question, answered by
 * `AVAILABLE_LOCALES` in `resources.ts` — the difference between
 * internationalization support and translation coverage.
 */

export type TextDirection = 'ltr' | 'rtl';

export interface LocaleDescriptor {
  /** Canonical BCP-47 tag, e.g. "en", "pt-BR", "zh-Hans". */
  code: string;
  /** The language's name in itself. What a picker shows. */
  nativeName: string;
  /** The language's name in English. Used for search and for QA. */
  englishName: string;
  direction: TextDirection;
}

/** The source language, and the fallback nothing may fall past. */
export const DEFAULT_LOCALE = 'en';

/**
 * Base language subtags that read right-to-left.
 *
 * Kept as data rather than derived, because `Intl.Locale.prototype.getTextInfo`
 * is not available everywhere the app runs (Safari lagged it for years, and
 * jsdom does not implement it at all). Where it *is* available it is consulted
 * first, so a language missing from this list still gets the right answer.
 *
 * This is a table of linguistic facts, not a list of languages on offer. No
 * right-to-left language currently ships a translation — Arabic was withdrawn —
 * but the direction handling stays, here and in `global.css`, because it is
 * correct and because removing it would have to be rebuilt from scratch the day
 * a Hebrew or Persian bundle arrives.
 */
const RTL_LANGUAGES = new Set([
  'ar', // Arabic
  'arc', // Aramaic
  'ckb', // Central Kurdish
  'dv', // Divehi
  'fa', // Persian
  'he', // Hebrew
  'ks', // Kashmiri
  'nqo', // N'Ko
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
]);

/**
 * Hand-checked descriptors.
 *
 * Only endonyms live here. Adding a language to this table does **not** make it
 * selectable — shipping a resource bundle under `src/locales/<code>/` does.
 *
 * Arabic is deliberately absent from both. It is still described correctly if
 * some stored preference names it, because `describeLocale` falls back to
 * `Intl.DisplayNames` for any valid tag; what it is not is an entry a learner
 * can pick.
 */
const CURATED: readonly LocaleDescriptor[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', direction: 'ltr' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', direction: 'ltr' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', direction: 'ltr' },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)', direction: 'ltr' },
  { code: 'zh-TW', nativeName: '繁體中文', englishName: 'Chinese (Traditional)', direction: 'ltr' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', direction: 'ltr' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', direction: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', direction: 'ltr' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', direction: 'ltr' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', direction: 'ltr' },
  { code: 'pt-PT', nativeName: 'Português (Portugal)', englishName: 'Portuguese (Portugal)', direction: 'ltr' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', direction: 'ltr' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', direction: 'ltr' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish', direction: 'ltr' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', direction: 'ltr' },
  { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian', direction: 'ltr' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', direction: 'ltr' },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', direction: 'ltr' },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai', direction: 'ltr' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', direction: 'ltr' },
  { code: 'ms', nativeName: 'Bahasa Melayu', englishName: 'Malay', direction: 'ltr' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', direction: 'ltr' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', direction: 'ltr' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', direction: 'ltr' },
  { code: 'mn', nativeName: 'Монгол', englishName: 'Mongolian', direction: 'ltr' },
  { code: 'ne', nativeName: 'नेपाली', englishName: 'Nepali', direction: 'ltr' },
  { code: 'my', nativeName: 'မြန်မာ', englishName: 'Burmese', direction: 'ltr' },
  { code: 'km', nativeName: 'ភាសាខ្មែរ', englishName: 'Khmer', direction: 'ltr' },
  { code: 'tl', nativeName: 'Filipino', englishName: 'Filipino', direction: 'ltr' },
  { code: 'sv', nativeName: 'Svenska', englishName: 'Swedish', direction: 'ltr' },
  { code: 'nb', nativeName: 'Norsk bokmål', englishName: 'Norwegian Bokmål', direction: 'ltr' },
  { code: 'da', nativeName: 'Dansk', englishName: 'Danish', direction: 'ltr' },
  { code: 'fi', nativeName: 'Suomi', englishName: 'Finnish', direction: 'ltr' },
  { code: 'cs', nativeName: 'Čeština', englishName: 'Czech', direction: 'ltr' },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek', direction: 'ltr' },
  { code: 'ro', nativeName: 'Română', englishName: 'Romanian', direction: 'ltr' },
  { code: 'hu', nativeName: 'Magyar', englishName: 'Hungarian', direction: 'ltr' },
  { code: 'sw', nativeName: 'Kiswahili', englishName: 'Swahili', direction: 'ltr' },
  { code: 'he', nativeName: 'עברית', englishName: 'Hebrew', direction: 'rtl' },
  { code: 'fa', nativeName: 'فارسی', englishName: 'Persian', direction: 'rtl' },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu', direction: 'rtl' },
];

const BY_CODE = new Map(CURATED.map((entry) => [entry.code.toLowerCase(), entry]));

/** True for any syntactically valid BCP-47 language tag. */
export function isValidLocale(code: string): boolean {
  if (!code) return false;
  try {
    return Intl.getCanonicalLocales(code).length === 1;
  } catch {
    return false;
  }
}

/**
 * Canonical casing for a tag: `EN-us` → `en-US`.
 *
 * Returns the input untouched when it is not a valid tag, so callers can decide
 * what to do about that rather than being handed a silently different string.
 */
export function canonicalizeLocale(code: string): string {
  try {
    return Intl.getCanonicalLocales(code)[0] ?? code;
  } catch {
    return code;
  }
}

/** The base language subtag: `pt-BR` → `pt`. */
export function baseLanguage(code: string): string {
  return canonicalizeLocale(code).split('-')[0]!.toLowerCase();
}

export function directionOf(code: string): TextDirection {
  // Ask the platform first — it knows about languages this file has never heard
  // of, and it is right about script-tagged variants like `az-Arab`.
  try {
    const info = (
      new Intl.Locale(canonicalizeLocale(code)) as Intl.Locale & {
        getTextInfo?: () => { direction: string };
        textInfo?: { direction: string };
      }
    );
    const direction = info.getTextInfo?.().direction ?? info.textInfo?.direction;
    if (direction === 'rtl' || direction === 'ltr') return direction;
  } catch {
    /* fall through to the table */
  }
  return RTL_LANGUAGES.has(baseLanguage(code)) ? 'rtl' : 'ltr';
}

export function isRtl(code: string): boolean {
  return directionOf(code) === 'rtl';
}

function displayName(code: string, inLocale: string): string | undefined {
  try {
    const names = new Intl.DisplayNames([inLocale], { type: 'language' });
    const resolved = names.of(code);
    // `Intl` echoes the tag back when it has no name for it; that is not a name.
    return resolved && resolved.toLowerCase() !== code.toLowerCase() ? resolved : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Metadata for any locale, curated or not.
 *
 * Unknown-but-valid tags are described from `Intl.DisplayNames`, so the app can
 * render a language nobody anticipated without a code change. An invalid tag
 * still gets a descriptor rather than throwing — a bad stored preference must
 * degrade to something displayable, not crash the settings screen.
 */
export function describeLocale(code: string): LocaleDescriptor {
  const canonical = canonicalizeLocale(code);
  const curated = BY_CODE.get(canonical.toLowerCase()) ?? BY_CODE.get(baseLanguage(canonical));
  if (curated && curated.code.toLowerCase() === canonical.toLowerCase()) return curated;

  return {
    code: canonical,
    nativeName: displayName(canonical, canonical) ?? curated?.nativeName ?? canonical,
    englishName: displayName(canonical, DEFAULT_LOCALE) ?? curated?.englishName ?? canonical,
    direction: directionOf(canonical),
  };
}

/**
 * The lookup order for a locale, most specific first, always ending at English.
 *
 * `pt-BR` → `['pt-BR', 'pt', 'en']`. This is the chain i18next is configured
 * with and the same chain the curriculum content resolver uses, so a UI string
 * and a word's meaning never disagree about where to look next.
 */
export function fallbackChain(code: string): string[] {
  const canonical = canonicalizeLocale(code);
  const chain: string[] = [];
  const parts = canonical.split('-');
  for (let i = parts.length; i > 0; i -= 1) {
    const candidate = parts.slice(0, i).join('-');
    if (!chain.includes(candidate)) chain.push(candidate);
  }
  if (!chain.includes(DEFAULT_LOCALE)) chain.push(DEFAULT_LOCALE);
  return chain;
}

/**
 * Picks the best available locale for a request.
 *
 * `requested` is tried down its own fallback chain before the next candidate is
 * considered, so a learner asking for `pt-BR` gets `pt` rather than jumping
 * straight past Portuguese to English.
 */
export function negotiateLocale(
  requested: string | null | undefined,
  available: readonly string[],
): string {
  if (!requested || !isValidLocale(requested)) return DEFAULT_LOCALE;
  const pool = new Map(available.map((code) => [code.toLowerCase(), code]));
  const base = baseLanguage(requested);

  // English ships in every build, and it is the *last* resort rather than a
  // step in the chain — so it is skipped here and applied at the end.
  // Otherwise a request for `es-419` against {en, es-ES} would stop at English
  // and never notice we have Spanish.
  for (const candidate of fallbackChain(requested)) {
    if (candidate === DEFAULT_LOCALE && base !== DEFAULT_LOCALE) continue;
    const hit = pool.get(candidate.toLowerCase());
    if (hit) return hit;
  }

  // A sibling regional variant of the same language: `es-419` → `es-ES`.
  for (const code of available) {
    if (baseLanguage(code) === base) return code;
  }
  return DEFAULT_LOCALE;
}

/** Sorts descriptors by their English name, so a picker is stably ordered. */
export function sortLocales(locales: readonly LocaleDescriptor[]): LocaleDescriptor[] {
  return [...locales].sort((a, b) => a.englishName.localeCompare(b.englishName, DEFAULT_LOCALE));
}

/**
 * Matches a locale against a search term.
 *
 * Native name, English name and the tag itself are all searchable, because a
 * learner may look for "Korean", "한국어" or "ko" depending on which language
 * they can currently read.
 */
export function localeMatches(locale: LocaleDescriptor, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    locale.nativeName.toLowerCase().includes(needle) ||
    locale.englishName.toLowerCase().includes(needle) ||
    locale.code.toLowerCase().includes(needle)
  );
}
