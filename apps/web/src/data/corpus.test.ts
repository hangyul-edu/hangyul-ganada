import { describe, expect, it } from 'vitest';

import {
  CATEGORY_IDS,
  VOCABULARY,
  VOCABULARY_CATEGORIES,
  VOCABULARY_LESSONS,
  corpusReady,
  corpusTotal,
  getVocabularyLesson,
  lessonForWord,
  wordsByCategory,
  wordsPerLesson,
} from './vocabulary';
import { corpusManifest, loadedBands } from './corpus';
import { wordCopy } from './wordCopy';

/**
 * The corpus arrives in bands, and this is what has to stay true of that.
 *
 * The suite runs against a fully-loaded corpus — `test/setup.ts` fetches every
 * band before anything else — so none of these assertions is about the *timing*
 * of the load. They are about the properties the incremental build has to
 * preserve, each of which would be trivially true if the corpus were still one
 * imported file and each of which is a way the band version could be wrong:
 *
 *   * the order is the priority order, so a partial corpus is a *prefix* of the
 *     curriculum rather than a random subset of it;
 *   * a study set holds the same words whether one band has arrived or all of
 *     them, because sets are only ever appended and filled;
 *   * the totals come from the manifest, not from what happens to be loaded.
 *
 * The strongest of them is the last test: it rebuilds every lesson from the
 * finished corpus in one pass and requires the answer to be identical to the
 * one four incremental passes produced.
 */
describe('the corpus, delivered in bands', () => {
  it('arrives whole, and knows its own size', () => {
    const manifest = corpusManifest();
    expect(manifest, 'no manifest — public/corpus is missing').not.toBeNull();
    expect(corpusReady()).toBe(true);
    expect(loadedBands()).toEqual(manifest!.bands.map((band) => band.band));
    // The published total and the loaded one agree only because everything is
    // loaded. `corpusTotal` reads the manifest, which is what makes "12 of
    // 2,581" honest while band 3 is still in flight.
    expect(corpusTotal()).toBe(manifest!.headwords);
    expect(VOCABULARY.length).toBe(corpusTotal());
  });

  it('is in priority order, so a partial corpus is a prefix', () => {
    for (let i = 1; i < VOCABULARY.length; i += 1) {
      const before = VOCABULARY[i - 1]!;
      const after = VOCABULARY[i]!;
      expect(
        before.difficulty_score,
        `${before.word} sorts after ${after.word} — the bands are cut on a different key ` +
          'than the app reads them in, and a partly-loaded corpus would not be a prefix',
      ).toBeLessThanOrEqual(after.difficulty_score);
    }
  });

  it('files every word under exactly one category, in that same order', () => {
    let counted = 0;
    for (const id of CATEGORY_IDS) {
      const words = wordsByCategory(id);
      counted += words.length;
      const scores = words.map((w) => w.difficulty_score);
      expect([...scores].sort((a, b) => a - b), `${id} is out of order`).toEqual(scores);
      const entry = VOCABULARY_CATEGORIES.find((c) => c.id === id);
      expect(entry?.word_count, `${id} reports the wrong count`).toBe(words.length);
    }
    expect(counted).toBe(VOCABULARY.length);
  });

  it('builds the same study sets a single pass would', () => {
    /*
     * The invariant the whole design rests on.
     *
     * Lessons are built four times, once per band, appending. If the bands were
     * cut on anything but the order the sets are chunked in, a word from band 3
     * would belong in the middle of a set built from band 1 and every set after
     * it would shift — so a learner's half-finished "Set 2" would silently
     * become a different five words. This rebuilds them in one pass from the
     * finished corpus and requires the two to be identical.
     */
    const expected = CATEGORY_IDS.flatMap((category, categoryIndex) => {
      const words = wordsByCategory(category);
      const sets = [];
      for (let i = 0; i < words.length; i += wordsPerLesson()) {
        const slice = words.slice(i, i + wordsPerLesson());
        const setIndex = i / wordsPerLesson() + 1;
        sets.push({
          id: `vocab-${category}-${setIndex}`,
          category,
          set_index: setIndex,
          subtitle: slice.map((w) => w.word).join(' · '),
          word_ids: slice.map((w) => w.id),
          sequence: categoryIndex * 1000 + setIndex,
        });
      }
      return sets;
    }).sort((a, b) => a.sequence - b.sequence);

    expect(VOCABULARY_LESSONS).toEqual(expected);
  });

  it('can find the set any word is in, and the set can find the word', () => {
    for (const word of VOCABULARY) {
      const lessonId = lessonForWord(word.id);
      expect(lessonId, `${word.word} is in no study set`).toBeTruthy();
      expect(getVocabularyLesson(lessonId!)?.word_ids).toContain(word.id);
    }
  });

  it('brings the meanings with the words, band for band', () => {
    /*
     * The packs used to be aligned with the corpus by *index*, which is the
     * tightest encoding and an invariant two separate files had to keep. Now
     * they are keyed by word id and cut into the same bands, so this checks the
     * thing that would break if a band and its pack ever disagreed: a word
     * somewhere in the middle of the corpus with no meaning at all.
     */
    const blank = VOCABULARY.filter((word) => !wordCopy(word, 'en').value.meaning);
    expect(blank.map((w) => w.word)).toEqual([]);
  });
});
