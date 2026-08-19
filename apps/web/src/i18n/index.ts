/** The localization surface. Nothing outside `src/i18n` imports i18next directly. */
export { LocaleProvider } from './LocaleProvider';
export { useLocale, type LocaleContextValue } from './LocaleContext';
export { useFormatters, type Formatters } from './format';
export {
  DEFAULT_LOCALE,
  baseLanguage,
  canonicalizeLocale,
  describeLocale,
  directionOf,
  fallbackChain,
  isRtl,
  isValidLocale,
  localeMatches,
  negotiateLocale,
  sortLocales,
  type LocaleDescriptor,
  type TextDirection,
} from './locales';
export {
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  resolveLocale,
  suggestLocaleFromBrowser,
  writeStoredLocale,
  type LocaleResolution,
  type LocaleSource,
} from './preference';
export { AVAILABLE_LOCALES, NAMESPACES, type Namespace } from './resources';
export {
  pickContent,
  resolveContent,
  translatedLocales,
  type ResolvedContent,
} from './content';
