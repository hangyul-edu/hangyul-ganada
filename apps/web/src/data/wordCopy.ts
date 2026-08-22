/**
 * A word's meaning, in the reader's language.
 *
 * ## Why this is not a field on the word
 *
 * The curriculum ships ten languages. A learner reads one of them. Holding
 * all ten on every word — which is what `VocabularyWord.translations` used to
 * do — put 696 KB of glosses and example translations into the first JavaScript
 * chunk, nine tenths of it for languages that reader will never select.
 *
 * So the generator writes one file per locale, and `split_corpus.py` cuts each
 * of them into the same bands as the words themselves. This module loads the
 * ones that are needed: the language the learner reads, band by band, as the
 * corpus arrives.
 *
 * ## Why the packs are keyed by word id
 *
 * They used to be arrays aligned index-for-index with `vocabulary.json`, which
 * is the tightest possible encoding and a standing invariant that two files
 * must never disagree about ordering. Now that both arrive in pieces, the
 * pieces are keyed instead: a band's meanings are looked up by the id of the
 * word, so a pack and a band that disagree produce a missing meaning rather
 * than the *wrong* meaning, which is the failure worth having.
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
import {
  announceContent,
  fetchBandCopy,
  loadCorpusCore,
  loadedBands,
  onCorpus,
  type CopyRow,
  type CorpusRow,
  type CorpusTables,
} from './corpus';

/** Meanings by word id, per locale. Grows as bands and languages arrive. */
const packs = new Map<string, Map<string, CopyRow>>();

/**
 * The fetch for each (language, band), in flight or finished.
 *
 * Promises rather than a set of "already asked for", because both callers can
 * be racing: a band arriving in the background starts one of these, and
 * `LocaleProvider` calls `loadWordCopy` for the same language a moment later.
 * With a boolean the second caller saw "already asked for" and returned
 * immediately, so it resolved before the meanings existed — and the words on
 * screen had no glosses until something else re-rendered them.
 */
const takenBands = new Map<string, Map<number, Promise<void>>>();

/** Word ids per band, remembered so a locale loaded later can be aligned. */
const bandWordIds = new Map<number, string[]>();

/**
 * The languages somebody has asked for, whether or not any of them has arrived.
 *
 * Separate from `packs`, and the separation is the fix for a defect. A band
 * arriving in the background has to bring the learner's meanings with it, and
 * the way it used to find out which language that was, was to look at which
 * languages were already in `packs` — which is a list of languages that have
 * *succeeded*. On a cold start in Korean, `LocaleProvider` asked for `ko`
 * before the corpus existed, there were no bands to take, `ko` never entered
 * `packs`, and every band that arrived afterwards was fetched in English only.
 * The word cards read "to do" in a Korean interface, and nothing failed.
 */
const wanted = new Set<string>(['en']);

/**
 * Every locale the curriculum has word copy for.
 *
 * Read from the manifest's tables rather than from the loaded packs, so it is
 * the full set whether or not anything has been loaded yet.
 */
export const WORD_COPY_LOCALES: string[] = [];

/** Whether a locale's copy is in memory and can be read synchronously. */
export function hasWordCopy(locale: string): boolean {
  return packs.has(locale);
}

function takeBand(locale: string, band: number): Promise<void> {
  const taken = takenBands.get(locale) ?? new Map<number, Promise<void>>();
  takenBands.set(locale, taken);
  const existing = taken.get(band);
  if (existing) return existing;

  const fetching = (async () => {
    const rows = await fetchBandCopy(band, locale);
    const ids = bandWordIds.get(band);
    // Not every fallback candidate is a locale the curriculum has copy for, so
    // a missing pack is dropped rather than remembered as done — the next
    // caller may be asking for a language that does have one.
    if (!rows || !ids) {
      taken.delete(band);
      return;
    }
    const pack = packs.get(locale) ?? new Map<string, CopyRow>();
    packs.set(locale, pack);
    ids.forEach((id, index) => {
      const row = rows[index];
      if (row) pack.set(id, row);
    });
    // A screen showing a word from this band is showing it with no meaning
    // until this lands, so it has to be told. See `announceContent`.
    announceContent();
  })().catch(() => {
    taken.delete(band);
  });

  taken.set(band, fetching);
  return fetching;
}

/**
 * Loads the copy for `locale` and everything its fallback chain may reach.
 *
 * Awaiting the whole chain matters for a locale that is only partly translated:
 * resolving one word to English while the next resolves to the requested
 * language would otherwise depend on load order.
 */
export async function loadWordCopy(locale: string): Promise<void> {
  for (const candidate of fallbackChain(locale)) wanted.add(candidate);
  // Before the bands, because there may not be any yet: this is called as soon
  // as the locale is known, which on a cold start is before the corpus has
  // arrived. Without the await it would resolve having loaded nothing.
  await loadCorpusCore().catch(() => {});
  const bands = loadedBands();
  await Promise.all(
    fallbackChain(locale).flatMap((candidate) =>
      // Not every fallback candidate is a locale the curriculum has copy for —
      // `pt` on the way to `pt-BR`, for instance. `fetchBandCopy` reports that
      // by resolving to null; it is not an error and the chain simply continues.
      bands.map((band) => takeBand(candidate, band)),
    ),
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
  for (const candidate of fallbackChain(locale)) {
    const entry = packs.get(candidate)?.get(word.id);
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
 * Keeps the loaded languages level with the loaded bands.
 *
 * A band arriving in the background has to bring the learner's meanings with
 * it, or the words appear with blank glosses until the language is switched.
 * Only the languages already in memory are extended — a language nobody has
 * asked for is not downloaded because a band arrived.
 */
onCorpus({
  tables: (tables: CorpusTables) => {
    WORD_COPY_LOCALES.push(...tables.locales);
  },
  band: (band) => {
    const rows = band.words as CorpusRow[];
    bandWordIds.set(
      band.band,
      rows.map((row) => row['id'] as string),
    );
    for (const locale of wanted) void takeBand(locale, band.band);
  },
});
