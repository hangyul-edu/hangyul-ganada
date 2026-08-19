/**
 * A word's meaning, in the reader's language.
 *
 * ## Why this is not a field on the word
 *
 * The curriculum ships eight languages. A learner reads one of them. Holding
 * all eight on every word — which is what `VocabularyWord.translations` used to
 * do — put 696 KB of glosses and example translations into the first JavaScript
 * chunk, seven eighths of it for languages that reader will never select.
 *
 * So the generator writes one file per locale, each aligned index-for-index
 * with `vocabulary.json`'s `words`, and this module loads the one that is
 * needed. English is imported statically because it is the last link in every
 * fallback chain and because something has to be renderable before any dynamic
 * import resolves; the other seven are `import()`ed, which is what makes Vite
 * emit them as separate chunks.
 *
 * ## Why it is synchronous to read
 *
 * Because the alternative is a pending state in every screen that shows a word,
 * for a file that is on the device and takes a few milliseconds to parse.
 *
 * `LocaleProvider` starts the load as soon as the locale is known and
 * re-renders when it lands; it deliberately does not *wait* for it, because
 * freezing the interface on the tap that changes language would be a worse
 * experience than a moment of English. In that moment `wordCopy` resolves down
 * the fallback chain and reports `isFallback`, which is the same honest signal
 * the rest of the content layer uses and which the UI already renders with the
 * source language marked.
 */
import type { VocabularyTranslation, VocabularyWord } from '@hangyul-ganada/shared-types';

import { fallbackChain } from '../i18n/locales';
import type { ResolvedContent } from '../i18n/content';
import generated from './generated/vocabulary.json';
import englishPack from './generated/vocabulary.en.json';

/** `[meaning, example translation | null, long definition | null]`. */
type CopyRow = [string, string | null, string | null];

interface CopyPack {
  locale: string;
  words: CopyRow[];
}

const WORD_ORDER: string[] = (generated as { words: Array<{ id: string }> }).words.map(
  (row) => row.id,
);

/** Row index by word id, so a lookup does not scan 2,504 entries. */
const ROW_OF = new Map(WORD_ORDER.map((id, index) => [id, index]));

const packs = new Map<string, CopyPack>();
packs.set('en', englishPack as CopyPack);

/**
 * The other seven locales, as separate chunks.
 *
 * `import.meta.glob` rather than a switch on the locale: adding a language must
 * stay a matter of adding a file, the same rule the translation bundles follow.
 * English is excluded because it is already imported above — including it here
 * as well would emit its 155 KB twice.
 */
const lazyPacks = import.meta.glob<CopyPack>('./generated/vocabulary.*.json', {
  import: 'default',
});

function pathFor(locale: string): string {
  return `./generated/vocabulary.${locale}.json`;
}

/** Whether a locale's copy is in memory and can be read synchronously. */
export function hasWordCopy(locale: string): boolean {
  return packs.has(locale);
}

/**
 * Loads the copy for `locale` and everything its fallback chain may reach.
 *
 * Awaiting the whole chain matters for a locale that is only partly translated:
 * resolving one word to English while the next resolves to the requested
 * language would otherwise depend on load order.
 */
export async function loadWordCopy(locale: string): Promise<void> {
  await Promise.all(
    fallbackChain(locale).map(async (candidate) => {
      if (packs.has(candidate)) return;
      const load = lazyPacks[pathFor(candidate)];
      // Not every fallback candidate is a locale the curriculum has copy for —
      // `pt` on the way to `pt-BR`, for instance. A missing pack is not an
      // error; the chain simply continues.
      if (!load) return;
      packs.set(candidate, await load());
    }),
  );
}

const EMPTY: VocabularyTranslation = { meaning: '', definition: null, example_translation: null };

/**
 * The meaning, definition and example translation for a word.
 *
 * Reports which locale it actually came from, exactly like `resolveContent`
 * does for every other kind of explanatory content, so a screen can mark text
 * that is standing in from another language.
 */
export function wordCopy(
  word: Pick<VocabularyWord, 'id'>,
  locale: string,
): ResolvedContent<VocabularyTranslation> {
  const row = ROW_OF.get(word.id);
  if (row === undefined) return { value: EMPTY, locale, isFallback: false };
  for (const candidate of fallbackChain(locale)) {
    const pack = packs.get(candidate);
    const entry = pack?.words[row];
    if (entry) {
      return {
        value: { meaning: entry[0], definition: entry[2], example_translation: entry[1] },
        locale: candidate,
        isFallback: candidate !== locale,
      };
    }
  }
  return { value: EMPTY, locale, isFallback: true };
}

/**
 * Every locale the curriculum has word copy for.
 *
 * Read from the generated file rather than from the loaded packs, so it is the
 * full set whether or not anything has been loaded yet.
 */
export const WORD_COPY_LOCALES: string[] = (generated as { locales: string[] }).locales;
