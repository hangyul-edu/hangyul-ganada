import type { CharacterTranslation, HangulCharacter } from '@hangyul-ganada/shared-types';

import { fallbackChain } from '../i18n/locales';
import type { ResolvedContent } from '../i18n/content';

/**
 * What a letter sounds like and how to remember its shape, per language,
 * fetched rather than bundled.
 *
 * ## Why this is not in `characters.ts`
 *
 * Seventy-three letters, each with a sound hint and usually a mnemonic, in
 * thirty-two languages, is a quarter of a megabyte of prose. It used to live in
 * `characterCopy.ts` and be merged into every character at module scope, which
 * meant `characters.ts` imported all of it — and `characters.ts` is imported by
 * every screen. Thirty-two languages of letter copy therefore arrived before
 * the first paint, on the phone of somebody who reads one of them: 61 kB
 * gzipped on the critical path to deliver about 2 kB of use.
 *
 * So it follows the road the interface bundles and the word packs already took.
 * `scripts/build-letter-copy.mjs` emits one file per language from
 * `content/letters/`, this module fetches the one the learner is reading, and
 * `LocaleProvider` starts that fetch at the same moment it starts the others.
 *
 * ## Why English and Korean are still inline
 *
 * They are written next to the letters they describe in `characters.ts`, which
 * is where a change to the curriculum should be able to see them. English is
 * also the end of every fallback chain, so it has to be present synchronously
 * or a screen has nothing to render on the frame before the fetch lands.
 *
 * ## What a screen sees while it is loading
 *
 * English, marked as English — `letterCopy` reports the locale it actually
 * resolved from, exactly as `wordCopy` and `resolveContent` do, so
 * `LocalizedText` can stamp the run with a `lang` and `dir` that are true. The
 * interface does not wait: holding a lesson on a spinner for one small file
 * would be a worse answer than a correct sentence in the wrong language for
 * one paint.
 */
interface LetterPack {
  locale: string;
  /** Keyed by the letter itself: a positional file reassigns every hint the
      day a character is inserted into the curriculum. */
  letters: Record<string, [hint: string, mnemonic: string | null]>;
}

const packs = new Map<string, LetterPack>();

/**
 * Every emitted pack, as a lazy import.
 *
 * A glob rather than a switch on the locale, so adding a language stays a
 * matter of adding a file — the same rule the translation bundles and the word
 * packs follow.
 */
const lazyPacks = import.meta.glob<LetterPack>('./generated/letters.*.json', {
  import: 'default',
});

function pathFor(locale: string): string {
  return `./generated/letters.${locale}.json`;
}

/** Whether a locale's letter copy is in memory and can be read synchronously. */
export function hasLetterCopy(locale: string): boolean {
  return packs.has(locale);
}

/**
 * Loads the letter copy for `locale` and everything its fallback chain reaches.
 *
 * A locale with no pack resolves to nothing rather than throwing: `en` and `ko`
 * are inline, `pt` on the way to `pt-BR` has no file of its own, and a stored
 * preference can name a language the product has never heard of. In all three
 * cases the right answer is the next candidate in the chain.
 */
export async function loadLetterCopy(locale: string): Promise<void> {
  await Promise.all(
    fallbackChain(locale).map(async (candidate) => {
      if (packs.has(candidate)) return;
      const load = lazyPacks[pathFor(candidate)];
      if (!load) return;
      packs.set(candidate, await load());
    }),
  );
}

/** Loads every pack. Test and QA only — see `preloadAllLocaleResources`. */
export async function preloadAllLetterCopy(): Promise<void> {
  await Promise.all(
    Object.entries(lazyPacks).map(async ([path, load]) => {
      const locale = /letters\.(.+)\.json$/.exec(path)?.[1];
      if (locale && !packs.has(locale)) packs.set(locale, await load());
    }),
  );
}

/**
 * The sound hint and mnemonic for one character, and where they came from.
 *
 * Checks the fetched packs first and the character's own inline translations
 * last, so English and Korean need no pack and every other language overrides
 * them when its file has landed.
 */
export function letterCopy(
  character: Pick<HangulCharacter, 'character' | 'translations'>,
  locale: string,
): ResolvedContent<CharacterTranslation> {
  for (const candidate of fallbackChain(locale)) {
    const row = packs.get(candidate)?.letters[character.character];
    if (row) {
      return {
        value: { pronunciation_hint: row[0], mnemonic: row[1] },
        locale: candidate,
        isFallback: candidate !== locale,
      };
    }
    const inline = character.translations[candidate];
    if (inline) {
      return { value: inline, locale: candidate, isFallback: candidate !== locale };
    }
  }
  return { value: character.translations.en, locale: 'en', isFallback: locale !== 'en' };
}
