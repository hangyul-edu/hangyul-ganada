/**
 * i18next setup.
 *
 * One instance, created once, configured here and nowhere else. Components use
 * `useTranslation` and never reach for the instance directly.
 */
import i18n, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { PARTICLES, withParticle } from './josa';
import { DEFAULT_LOCALE, fallbackChain } from './locales';
import { AVAILABLE_LOCALES, DEFAULT_NAMESPACE, NAMESPACES, RESOURCES } from './resources';

/**
 * A last-resort rendering for a key with no translation anywhere.
 *
 * This should be unreachable: English is complete and English is the end of
 * every fallback chain, and `npm run i18n:check` fails the build if a key is
 * missing from it. It exists because the one thing a learner must never see is
 * `handwriting.feedback.correct` where a sentence should be — so if the
 * impossible happens, they get "Correct" rather than a dotted path.
 */
function humanizeKey(key: string): string {
  const leaf = key.split('.').pop() ?? key;
  const words = leaf
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function createI18n(initialLocale: string = DEFAULT_LOCALE): I18n {
  const instance = i18n.createInstance();

  void instance.use(initReactI18next).init({
    resources: RESOURCES,
    lng: initialLocale,
    // Ends at English for every locale, and walks the region → language chain
    // on the way: pt-BR → pt → en.
    fallbackLng: (code: string) => fallbackChain(code || DEFAULT_LOCALE),
    supportedLngs: [...new Set([...AVAILABLE_LOCALES, DEFAULT_LOCALE])],
    // A locale must not silently borrow a sibling region's strings; the
    // fallback chain above is the only path between locales.
    load: 'currentOnly',
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    // An empty string in a bundle means "not translated yet", so it must fall
    // through to the next locale rather than render as nothing.
    returnEmptyString: false,
    interpolation: {
      // React escapes for us; double-escaping turns an apostrophe into &#39;.
      escapeValue: false,
    },
    parseMissingKeyHandler: humanizeKey,
    debug: false,
    // i18next prints a vendor notice on first init. Suppressed because it fires
    // once per test file and once per dev reload, and drowns the console output
    // this project actually needs to read.
    showSupportNotice: false,
  });

  /*
   * `{{word, eunneun}}` — the Korean particle that agrees with the word in
   * front of it. One formatter per pair, named rather than parameterised: the
   * parameter would be a slash-separated pair of Hangul syllables, and
   * i18next's format parser reads a parenthesised argument as a number.
   *
   * Registered on the instance rather than reached for inside a component,
   * because the choice belongs to the sentence and the sentence lives in the
   * Korean bundle. Every other language ignores them.
   */
  for (const [name, pair] of Object.entries(PARTICLES)) {
    instance.services.formatter?.add(name, (value) => withParticle(String(value), pair));
  }

  return instance;
}

export { humanizeKey };
