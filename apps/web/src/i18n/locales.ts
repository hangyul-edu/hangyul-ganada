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
 * hand-checked endonyms, so script/region variants that `Intl` names poorly
 * (Chinese, Portuguese, Uzbek) read the way a speaker expects, and so a search
 * for "Mandarin" or "Tagalog" finds the language it names.
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
  /**
   * Other names a learner might search for. Never displayed.
   *
   * Somebody looking for Chinese types "Mandarin"; somebody looking for
   * Spanish types "Castellano"; somebody looking for Filipino types "Tagalog".
   * Lower-case and unaccented, because the matcher folds both.
   */
  aliases?: readonly string[];
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
 * This is a table of linguistic facts, not a list of languages on offer — but
 * one of them is now on offer: Arabic ships, so `dir="rtl"` is a live path
 * through every screen rather than a provision for a future bundle. Hebrew,
 * Persian and Urdu are described correctly if something names them.
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
 * Hand-checked descriptors, one per language the picker offers.
 *
 * ## What being in this table means
 *
 * It means the endonym, the English name and the direction have been checked
 * by hand rather than taken from `Intl.DisplayNames`, which is right about most
 * languages and wrong in ways that matter about a few: it renders Chinese as
 * "中文（简体）" with fullwidth brackets, Filipino as "Filipino" only in some
 * ICU builds, and Uzbek in Cyrillic on platforms whose CLDR predates the
 * script change.
 *
 * It does **not** by itself make a language selectable. A locale appears in the
 * picker when `src/locales/<code>/` ships a resource bundle —
 * `AVAILABLE_LOCALES` in `resources.ts` — and that separation is the honest
 * one: this table is internationalisation *support*, the bundles are
 * translation *coverage*, and conflating them is how a language ends up
 * offered and half-translated.
 *
 * ## Aliases
 *
 * A learner looking for their language types whatever name they know it by,
 * and that is frequently neither the endonym nor the English name: *Mandarin*,
 * *Castellano*, *Tagalog*, *Farsi*, *Bahasa*. Native and English names are
 * searched already; `aliases` covers the third case. They are search keys only
 * and are never displayed.
 *
 * ## Regional codes
 *
 * Only where the region changes the content. `pt-BR` is here and plain `pt` is
 * not, because the Portuguese in this product is Brazilian and saying so is
 * more use to a reader in Lisbon than a `pt` label that is not quite theirs.
 * `zh-CN` likewise names the script the bundle is written in.
 */
const CURATED: readonly LocaleDescriptor[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', direction: 'ltr' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', direction: 'ltr', aliases: ['hangugeo', 'hangul', 'corean'] },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', direction: 'rtl', aliases: ['arabi', 'arabic'] },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', direction: 'ltr', aliases: ['bangla'] },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)', direction: 'ltr', aliases: ['mandarin', 'zhongwen', 'putonghua', 'simplified'] },
  { code: 'cs', nativeName: 'Čeština', englishName: 'Czech', direction: 'ltr', aliases: ['cestina', 'czechia'] },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', direction: 'ltr', aliases: ['holland', 'hollands', 'flemish', 'vlaams'] },
  { code: 'fr', nativeName: 'Français', englishName: 'French', direction: 'ltr', aliases: ['francais'] },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', direction: 'ltr', aliases: ['germany'] },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek', direction: 'ltr', aliases: ['ellinika', 'hellenic'] },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', direction: 'ltr', aliases: ['hindustani'] },
  { code: 'hu', nativeName: 'Magyar', englishName: 'Hungarian', direction: 'ltr', aliases: ['magyarul'] },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', direction: 'ltr', aliases: ['bahasa', 'indonesia'] },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', direction: 'ltr', aliases: ['italy'] },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', direction: 'ltr', aliases: ['nihongo', 'nippon'] },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish', direction: 'ltr', aliases: ['polska'] },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', direction: 'ltr', aliases: ['portugues', 'brasil', 'brazil', 'brazilian'] },
  { code: 'ro', nativeName: 'Română', englishName: 'Romanian', direction: 'ltr', aliases: ['romana', 'moldovan'] },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', direction: 'ltr', aliases: ['russkiy', 'russia'] },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', direction: 'ltr', aliases: ['espanol', 'castellano', 'castilian'] },
  { code: 'sv', nativeName: 'Svenska', englishName: 'Swedish', direction: 'ltr', aliases: ['sverige'] },
  { code: 'fil', nativeName: 'Filipino', englishName: 'Filipino', direction: 'ltr', aliases: ['tagalog', 'pilipino', 'philippines'] },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', direction: 'ltr', aliases: ['tamizh'] },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', direction: 'ltr', aliases: ['telegu'] },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai', direction: 'ltr', aliases: ['siamese'] },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', direction: 'ltr', aliases: ['turkce', 'turkiye'] },
  { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian', direction: 'ltr', aliases: ['ukrainska', 'ukraine'] },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', direction: 'ltr', aliases: ['tieng viet', 'vietnam'] },
  { code: 'uz', nativeName: 'O‘zbekcha', englishName: 'Uzbek', direction: 'ltr', aliases: ['ozbekcha', 'uzbekistan'] },
  { code: 'kk', nativeName: 'Қазақ тілі', englishName: 'Kazakh', direction: 'ltr', aliases: ['qazaq', 'kazakhstan'] },
  { code: 'ky', nativeName: 'Кыргызча', englishName: 'Kyrgyz', direction: 'ltr', aliases: ['kyrgyzcha', 'kirghiz', 'kyrgyzstan'] },
  { code: 'mn', nativeName: 'Монгол хэл', englishName: 'Mongolian', direction: 'ltr', aliases: ['mongol', 'mongolia'] },

  /*
   * Below the line: described correctly if something names them, never offered.
   *
   * A stored preference, a browser language or a deep link can carry any tag at
   * all, and `describeLocale` has to answer for it. These are the ones worth
   * hand-checking because `Intl` names them poorly or because they are the
   * likely neighbours of a language above — `pt` and `pt-PT` next to `pt-BR`,
   * `zh-TW` next to `zh-CN`, `tl` next to `fil`.
   */
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', direction: 'ltr' },
  { code: 'pt-PT', nativeName: 'Português (Portugal)', englishName: 'Portuguese (Portugal)', direction: 'ltr' },
  { code: 'zh-TW', nativeName: '繁體中文', englishName: 'Chinese (Traditional)', direction: 'ltr' },
  { code: 'tl', nativeName: 'Tagalog', englishName: 'Tagalog', direction: 'ltr' },
  { code: 'ms', nativeName: 'Bahasa Melayu', englishName: 'Malay', direction: 'ltr' },
  { code: 'ne', nativeName: 'नेपाली', englishName: 'Nepali', direction: 'ltr' },
  { code: 'my', nativeName: 'မြန်မာ', englishName: 'Burmese', direction: 'ltr' },
  { code: 'km', nativeName: 'ភាសាខ្មែរ', englishName: 'Khmer', direction: 'ltr' },
  { code: 'nb', nativeName: 'Norsk bokmål', englishName: 'Norwegian Bokmål', direction: 'ltr' },
  { code: 'da', nativeName: 'Dansk', englishName: 'Danish', direction: 'ltr' },
  { code: 'fi', nativeName: 'Suomi', englishName: 'Finnish', direction: 'ltr' },
  { code: 'sw', nativeName: 'Kiswahili', englishName: 'Swahili', direction: 'ltr' },
  { code: 'he', nativeName: 'עברית', englishName: 'Hebrew', direction: 'rtl' },
  { code: 'fa', nativeName: 'فارسی', englishName: 'Persian', direction: 'rtl', aliases: ['farsi', 'dari'] },
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
 * Folds a string to something two spellings of the same word can both match.
 *
 * Case, accents and the punctuation inside a name — the apostrophe in
 * *O‘zbekcha*, the hyphen in *Tiếng Việt* typed as *tieng-viet* — all
 * disappear, so `français` is found by "francais", `Čeština` by "cestina",
 * `Türkçe` by "turkce" and `Español` by "espanol". A learner searching for
 * their own language on a keyboard that cannot type its diacritics is not an
 * edge case; for most of these languages it is the normal case.
 *
 * NFD splits a letter from its accent and the range strips the accents, which
 * is why this is four lines rather than a table of substitutions. Scripts with
 * no case and no accents — Thai, Korean, Arabic — pass through untouched and
 * match exactly, which is what they need.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019'`´ʻ_-]/g, '');
}

/**
 * Matches a locale against a search term.
 *
 * Native name, English name, the aliases and the tag itself are all searchable,
 * because a learner may look for "Korean", "한국어", "hangugeo" or "ko"
 * depending on which language they can currently read and which name they know
 * it by. Everything is folded first — see `fold`.
 *
 * Spaces in the query are treated as separate requirements rather than as
 * literal text, so "chinese simplified" and "simplified chinese" both find
 * 简体中文, and "viet" finds Tiếng Việt however it was typed.
 */
export function localeMatches(locale: LocaleDescriptor, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    locale.nativeName,
    locale.englishName,
    locale.code,
    ...(locale.aliases ?? []),
  ]
    .map(fold)
    .join(' ');
  return terms.every((term) => haystack.includes(term));
}
