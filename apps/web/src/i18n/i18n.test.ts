import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ALL_CHARACTERS, LETTER_LESSONS } from '../data/characters';
import { VOCABULARY } from '../data/vocabulary';
import { loadWordCopy, wordCopy } from '../data/wordCopy';
import { PRODUCT, productName } from '../config/product';
import { createI18n } from './config';
import { pickContent, resolveContent } from './content';
import {
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
} from './locales';
import {
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  resolveLocale,
  suggestLocaleFromBrowser,
  writeStoredLocale,
} from './preference';
import { AVAILABLE_LOCALES, NAMESPACES, RESOURCES } from './resources';

describe('locale registry', () => {
  it('accepts any well-formed BCP-47 tag, not just the ones we ship', () => {
    for (const tag of ['en', 'ko', 'pt-BR', 'zh-Hant-TW', 'sw', 'yo-NG', 'arn']) {
      expect(isValidLocale(tag), tag).toBe(true);
    }
  });

  it('rejects things that are not language tags', () => {
    for (const tag of ['', 'english_us', 'en--US', '  ', '!!']) {
      expect(isValidLocale(tag), tag).toBe(false);
    }
  });

  it('canonicalizes case so pt-br and pt-BR are one locale', () => {
    expect(canonicalizeLocale('pt-br')).toBe('pt-BR');
    expect(canonicalizeLocale('ZH-hant-tw')).toBe('zh-Hant-TW');
    expect(baseLanguage('pt-BR')).toBe('pt');
  });

  it('describes a language we have never translated into', () => {
    // The architecture supports any language; translation coverage is separate.
    const swahili = describeLocale('sw');
    expect(swahili.code).toBe('sw');
    expect(swahili.englishName.toLowerCase()).toContain('swahili');
    expect(swahili.direction).toBe('ltr');
  });

  it('knows which languages read right to left', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('he')).toBe(true);
    expect(isRtl('fa-IR')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('ko')).toBe(false);
    expect(directionOf('ar')).toBe('rtl');
  });

  it('gives every shipped locale a native name in its own script', () => {
    for (const code of AVAILABLE_LOCALES) {
      const entry = describeLocale(code);
      expect(entry.nativeName, code).toBeTruthy();
      expect(entry.englishName, code).toBeTruthy();
    }
    expect(describeLocale('ko').nativeName).toBe('한국어');
    expect(describeLocale('he').nativeName).toBe('עברית');
  });

  it('does not offer Arabic', () => {
    // Withdrawn as a supported interface language. The registry must not list
    // it and no bundle may ship for it — the two halves of "selectable".
    expect(AVAILABLE_LOCALES).not.toContain('ar');
    expect(sortLocales(AVAILABLE_LOCALES.map(describeLocale)).map((l) => l.code)).not.toContain(
      'ar',
    );
    // Describing a tag is not the same as offering it: a stored preference
    // naming Arabic must still render rather than crash the settings screen.
    expect(describeLocale('ar').direction).toBe('rtl');
  });

  it('searches by native name, English name and tag', () => {
    const korean = describeLocale('ko');
    expect(localeMatches(korean, 'Korean')).toBe(true);
    expect(localeMatches(korean, '한국')).toBe(true);
    expect(localeMatches(korean, 'ko')).toBe(true);
    expect(localeMatches(korean, 'Portuguese')).toBe(false);
    expect(localeMatches(korean, '')).toBe(true);
  });
});

describe('fallback chain', () => {
  it('walks specific → general → English', () => {
    expect(fallbackChain('pt-BR')).toEqual(['pt-BR', 'pt', 'en']);
    expect(fallbackChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh', 'en']);
  });

  it('does not repeat English', () => {
    expect(fallbackChain('en')).toEqual(['en']);
    expect(fallbackChain('en-GB')).toEqual(['en-GB', 'en']);
  });

  it('negotiates down to the base language before giving up', () => {
    expect(negotiateLocale('pt-BR', ['en', 'pt'])).toBe('pt');
  });

  it('prefers a sibling regional variant over English', () => {
    expect(negotiateLocale('es-419', ['en', 'es-ES'])).toBe('es-ES');
  });

  it('lands on English when nothing matches', () => {
    expect(negotiateLocale('th', ['en', 'ko'])).toBe(DEFAULT_LOCALE);
  });
});

describe('default locale and precedence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('gives a fresh learner their device language when we ship it', () => {
    // The rule that matters most for a beginner: somebody who has just
    // installed a Korean app and reads Japanese should not have to find their
    // way out of an English settings screen. See §55.
    expect(resolveLocale({ deviceLanguages: ['ja-JP', 'en'] })).toEqual({
      locale: 'ja',
      source: 'device',
    });
    expect(resolveLocale({ deviceLanguages: ['pt-BR'] }).locale).toBe('pt-BR');
    expect(resolveLocale({ deviceLanguages: ['zh-CN'] }).locale).toBe('zh-CN');
  });

  it('falls back to English when the device language is one we do not ship', () => {
    const resolved = resolveLocale({ deviceLanguages: ['is-IS', 'fo-FO'] });
    expect(resolved).toEqual({ locale: 'en', source: 'default' });
  });

  it('gives a fresh learner English when the device says nothing', () => {
    expect(resolveLocale({ deviceLanguages: [] })).toEqual({ locale: 'en', source: 'default' });
  });

  it('does adopt Korean when the device is Korean', () => {
    // This used to be forbidden, on the argument that the audience is people
    // learning Korean rather than people who read it. Korean speakers are
    // exactly who uses this app to learn the writing system, and the learning
    // content stays Korean either way — what changes is only whether the
    // buttons are readable.
    expect(resolveLocale({ deviceLanguages: ['ko-KR'] }).locale).toBe('ko');
  });

  it('never lets the device override a choice the learner made', () => {
    expect(resolveLocale({ storedLocale: 'en', deviceLanguages: ['ko-KR'] })).toEqual({
      locale: 'en',
      source: 'stored',
    });
    expect(resolveLocale({ profileLocale: 'de', deviceLanguages: ['ko-KR'] }).locale).toBe('de');
  });

  it('prefers an account preference over a device one', () => {
    expect(resolveLocale({ profileLocale: 'ja', storedLocale: 'ko' })).toEqual({
      locale: 'ja',
      source: 'account',
    });
  });

  it('uses the stored preference when there is no account one', () => {
    expect(resolveLocale({ profileLocale: null, storedLocale: 'ko' })).toEqual({
      locale: 'ko',
      source: 'stored',
    });
  });

  it('ignores a corrupt stored value rather than crashing', () => {
    expect(resolveLocale({ storedLocale: 'not a locale', deviceLanguages: [] })).toEqual({
      locale: 'en',
      source: 'default',
    });
    // …and still lets the device have its say, since the corrupt value was
    // never a choice.
    expect(resolveLocale({ storedLocale: '\u0000', deviceLanguages: ['fr-CA'] }).locale).toBe('fr');
  });

  it('persists a choice and reads it back', () => {
    writeStoredLocale('ko');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ko');
    expect(readStoredLocale()).toBe('ko');
    expect(resolveLocale({ storedLocale: readStoredLocale() }).locale).toBe('ko');
  });

  it('inherits a language chosen before the product was renamed', () => {
    window.localStorage.setItem('hangyul-start:locale', 'ja');
    expect(readStoredLocale()).toBe('ja');
  });

  it('only ever suggests a browser language, never applies it', () => {
    expect(suggestLocaleFromBrowser(['ko-KR', 'en'], ['en', 'ko'])).toBe('ko');
    // English needs no suggestion — it is already the default.
    expect(suggestLocaleFromBrowser(['en-GB'], ['en', 'ko'])).toBeNull();
    // Nor does a language we do not ship.
    expect(suggestLocaleFromBrowser(['th-TH'], ['en', 'ko'])).toBeNull();
  });
});

describe('translation resources', () => {
  it('ships every namespace for the source locale', () => {
    for (const ns of NAMESPACES) {
      expect(RESOURCES.en?.[ns], `en/${ns}.json`).toBeTruthy();
    }
  });

  it('discovers locales from the filesystem rather than a hardcoded list', () => {
    expect(AVAILABLE_LOCALES).toContain('en');
    expect(AVAILABLE_LOCALES).toContain('ko');
    // Adding a directory is all it takes; nothing enumerates languages in code.
    expect(AVAILABLE_LOCALES.length).toBeGreaterThan(2);
  });
});

describe('runtime language switching', () => {
  it('changes language without recreating the instance', async () => {
    const i18n = createI18n('en');
    expect(i18n.t('tabs.letters', { ns: 'navigation' })).toBe('Letters');

    await i18n.changeLanguage('ko');
    expect(i18n.language).toBe('ko');
    expect(i18n.t('tabs.letters', { ns: 'navigation' })).toBe('글자');

    await i18n.changeLanguage('en');
    expect(i18n.t('tabs.letters', { ns: 'navigation' })).toBe('Letters');
  });

  it('falls back to English for a locale with no bundle', async () => {
    const i18n = createI18n('en');
    await i18n.changeLanguage('sw');
    expect(i18n.t('tabs.letters', { ns: 'navigation' })).toBe('Letters');
  });

  it('reaches a sibling regional variant before falling all the way to English', () => {
    // pt-PT ships no bundle. Brazilian Portuguese is a far better answer for a
    // Portuguese reader than English, and it is what `negotiateLocale` picks
    // too — the client-side chain and i18next's own resolution agree.
    const i18n = createI18n('pt-PT');
    expect(i18n.t('tabs.letters', { ns: 'navigation' })).toBe('Letras');
    expect(negotiateLocale('pt-PT', AVAILABLE_LOCALES)).toBe('pt-BR');
  });

  it('never renders a raw key, even for one that does not exist', () => {
    const i18n = createI18n('en');
    const rendered = i18n.t('handwriting:feedback.thisKeyDoesNotExist');
    expect(rendered).not.toContain('.');
    expect(rendered).toBe('This Key Does Not Exist');
  });
});

describe('pluralisation', () => {
  it('uses the language’s own plural categories rather than n === 1', () => {
    const en = createI18n('en');
    expect(en.t('review.sessionLength', { ns: 'learning', count: 1 })).toBe(
      'One short exercise',
    );
    expect(en.t('review.sessionLength', { ns: 'learning', count: 5 })).toBe(
      '5 short exercises',
    );
  });

  it('handles a language with no plural distinction', () => {
    const ko = createI18n('ko');
    // Korean has one plural category, so the same form answers for 1 and 5 —
    // and the `_one` written in the bundle for key parity is never selected.
    expect(ko.t('review.sessionLength', { ns: 'learning', count: 1 })).toBe('짧은 문제 1개');
    expect(ko.t('review.sessionLength', { ns: 'learning', count: 5 })).toBe('짧은 문제 5개');
  });

  it('takes its plural categories from the language, not from a count of forms', () => {
    // The two cases above are the proof: English distinguishes 1 from 5 and
    // Korean does not, from the same key, with no branch anywhere in the app.
    // A language with four or six categories — Russian, Arabic — needs no code
    // either, because the categories come from Intl by way of i18next.
    //
    // What *would* be needed is the bundle, and this is the whole of it: the
    // supported set is the set of directories under `src/locales`, so dropping
    // one in is the entire act of adding a language.
    const i18n = createI18n('en');
    const supported = i18n.options.supportedLngs as string[];
    for (const code of AVAILABLE_LOCALES) expect(supported, code).toContain(code);
    // And a language with no directory is not silently half-supported.
    expect(supported).not.toContain('ru');
  });
});

describe('locale-aware formatting', () => {
  it('formats numbers with the locale’s own separators', () => {
    const de = createI18n('de');
    expect(de.t('units.day', { ns: 'common', count: 1234 })).toContain('1.234');
  });

  it('formats percentages rather than concatenating a % sign', () => {
    const en = createI18n('en');
    expect(en.t('feedback.correct.scored', { ns: 'handwriting', character: '가', score: 0.94 })).toContain(
      '94%',
    );
  });
});

describe('product identity', () => {
  it('uses the new slug and name', () => {
    expect(PRODUCT.slug).toBe('hangyul_ganada');
    expect(PRODUCT.kebabSlug).toBe('hangyul-ganada');
    expect(PRODUCT.name).toBe('Hangyul ganada');
  });

  it('keeps the Latin wordmark in every language but Korean', () => {
    expect(productName('en')).toBe('Hangyul ganada');
    expect(productName('ko')).toBe('한귤 가나다');
    expect(productName('ko-KR')).toBe('한귤 가나다');
    // The brand is not translated into arbitrary local names.
    for (const code of ['ja', 'zh-CN', 'es', 'fr', 'de', 'pt-BR', 'he', 'sw']) {
      expect(productName(code), code).toBe('Hangyul ganada');
    }
  });

  it('carries no trace of either retired name', () => {
    const serialized = JSON.stringify(PRODUCT);
    expect(serialized).not.toMatch(/Hangyul Start/i);
    expect(serialized).not.toMatch(/한귤 스타트/);
    expect(serialized).not.toMatch(/hangyul[_-]start/i);
    // The camel-cased spelling, and the capital-G near-miss that reads as a
    // different product.
    expect(serialized).not.toMatch(/GaNaDa/);
    expect(serialized).not.toMatch(/Hangyul Ganada/);
  });
});

describe('learning content is not translated', () => {
  it('keeps every Hangul character identical across locales', () => {
    for (const character of ALL_CHARACTERS) {
      for (const locale of AVAILABLE_LOCALES) {
        // Only the explanation is resolved; the glyph is never touched.
        const copy = pickContent(character.translations, locale);
        expect(copy.pronunciation_hint).toBeTruthy();
        expect(character.character).toMatch(/[ᄀ-ᇿ㄰-㆏가-힯]/);
      }
    }
  });

  it('keeps Korean words, readings and examples out of the translation map', () => {
    const apple = VOCABULARY.find((w) => w.word === '사과')!;
    expect(apple.word).toBe('사과');
    expect(apple.syllables).toEqual(['사', '과']);
    // The meaning moves; the word does not.
    expect(wordCopy(apple, 'en').value.meaning).toContain('apple');
    expect(wordCopy(apple, 'ko').value.meaning).not.toBe('apple');
    expect(wordCopy(apple, 'sw').value.meaning).toContain('apple'); // English fallback
  });

  // Word meanings are loaded per locale rather than bundled, so a test that
  // asserts anything about them has to load them first — exactly as
  // `LocaleProvider` does before it changes language.
  beforeAll(async () => {
    await Promise.all(
      ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de', 'pt-BR'].map((l) => loadWordCopy(l)),
    );
  });

  it('serves every shipping locale from its own content, with no fallback', () => {
    // The check this cycle exists for. Before, a Japanese learner saw English
    // meanings on almost every card and the fallback machinery was doing the
    // work of a translation. The fallback still exists — a missing string must
    // never render as a blank — but reaching it in shipped content is a bug,
    // and this asserts it does not happen.
    const locales = ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de', 'pt-BR'] as const;
    const sample = VOCABULARY.slice(0, 250);
    for (const locale of locales) {
      for (const word of sample) {
        const resolved = wordCopy(word, locale);
        expect(
          resolved.isFallback,
          `${word.word} falls back to ${resolved.locale} for ${locale}`,
        ).toBe(false);
      }
    }
  });

  it('explains every letter in every shipping locale, with no fallback', () => {
    // The counterpart to the vocabulary check above, and the gap this cycle
    // closed: the letters had English and Korean only, so six of the eight
    // languages taught the alphabet in English while claiming to be
    // translated. A fallback here is a bug, not a planned state.
    const locales = ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de', 'pt-BR'] as const;
    for (const locale of locales) {
      for (const character of ALL_CHARACTERS) {
        const resolved = resolveContent(character.translations, locale);
        expect(
          resolved.isFallback,
          `${character.character} falls back to ${resolved.locale} for ${locale}`,
        ).toBe(false);
        expect(resolved.value.pronunciation_hint, `${character.character} in ${locale}`).toBeTruthy();
      }
    }
  });

  it('keeps a mnemonic present or absent in every language alike', () => {
    // A mnemonic is written where there is something to remember. Having one in
    // French and not in German would not be a translation gap — it would be a
    // different product in each language.
    const locales = ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de', 'pt-BR'] as const;
    for (const character of ALL_CHARACTERS) {
      const hasEnglish = Boolean(character.translations.en.mnemonic);
      for (const locale of locales) {
        const resolved = resolveContent(character.translations, locale);
        expect(Boolean(resolved.value.mnemonic), `${character.character} in ${locale}`).toBe(
          hasEnglish,
        );
      }
    }
  });

  it('keeps lesson subtitles as the letters they teach', () => {
    const first = LETTER_LESSONS[0]!;
    expect(first.subtitle).toBe('ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ');
    expect(pickContent(first.translations, 'en').title).toBe('Six vowels to start');
    expect(pickContent(first.translations, 'ko').title).toBe('첫 모음 여섯 개');
    // A locale with no lesson titles still gets the same letters.
    expect(pickContent(first.translations, 'sw').title).toBe('Six vowels to start');
  });

  it('gives every curriculum record an English entry, since English ends every chain', () => {
    for (const character of ALL_CHARACTERS) {
      expect(character.translations.en, character.character).toBeTruthy();
    }
    for (const word of VOCABULARY) {
      expect(wordCopy(word, 'en').value.meaning, word.word).toBeTruthy();
    }
  });
});
