/**
 * What a content change may not do to a learner who already has progress.
 *
 * Written 10 September 2026, when a pass moved 134 words between browse
 * categories, removed 174 questions from the Level Test bank and rewrote three
 * example sentences. None of those *should* touch a saved word or a review
 * schedule, and the point of this file is that "should" is not a guarantee
 * anybody can check by reading a diff of 190 files.
 *
 * Progress is keyed by `progressKey(kind, itemKey)` on the device, with no
 * cloud copy, so an id that moves takes a learner's history with it — see
 * `word_id` in `scripts/content/build_vocabulary.py` for the rename that cost
 * 젖다 its history once already.
 */
import { describe, expect, it } from 'vitest';

import { clozeFor } from './cloze';
import retiredLedger from '../../../../content/vocabulary/retired-words.json';
import permanentIds from '../../../../content/vocabulary/word-ids.json';
import { VOCABULARY, getWord } from './vocabulary';

const PERMANENT = permanentIds as Record<string, string>;

describe('a content change and a learner who already has progress', () => {
  it('gives every shipped word an id from the permanent ledger', () => {
    /*
     * `content/vocabulary/word-ids.json` is the promise that an id, once
     * written down, belongs to that word forever. A word shipping with an id
     * the ledger does not know is a word whose id was allocated this build and
     * can therefore be allocated differently next build.
     */
    const ledger = new Set(Object.values(PERMANENT));
    const strangers = VOCABULARY.filter((word) => !ledger.has(word.id));
    expect(strangers.map((word) => `${word.word}/${word.id}`)).toEqual([]);
  });

  it('resolves every id the ledger has ever issued, bar three that never shipped', () => {
    /*
     * The other direction, and the one that breaks a saved word: an id that has
     * shipped and then stopped resolving leaves a progress row, a saved-words
     * entry and a review schedule pointing at nothing.
     *
     * The ledger is append-only and records an *allocation*, which is not quite
     * a shipment: three words were allocated an id and then left the pack
     * before any release carried them, so no device can hold progress for them.
     * They are named here rather than filtered by a rule, because the rule
     * would be "an id may stop resolving" and that is the thing this test
     * exists to refuse.
     */
    const neverShipped = new Set(['word_buditda', 'word_sukda', 'word_aigu']);
    /*
     * And one more way an id may stop resolving, which is the only honest
     * one: the word was retired under the child-safe content policy, and a
     * tombstone in `retired-words.json` says so, with the reason. The
     * progress row, the saved-word entry and the review schedule are kept on
     * the device; what changes is that the plan and the review no longer
     * schedule the word — see `domain/contentSafety.ts`. An id that stops
     * resolving without a tombstone is still the defect this test refuses.
     */
    const retired = new Set(Object.keys((retiredLedger as { words: Record<string, unknown> }).words));
    const missing = Object.entries(PERMANENT)
      .filter(([, id]) => typeof id === 'string' && !neverShipped.has(id) && !retired.has(id) && !getWord(id))
      .map(([word, id]) => `${word}/${id}`);
    expect(missing).toEqual([]);
  });

  it('keeps a word findable when its browse category moves', () => {
    /*
     * A category is display metadata. 화가 moved out of Body & Health and 창문
     * out of Animals & Nature this pass, and neither may take anything with it:
     * the card, the audio and the progress key are all reached by id.
     */
    for (const id of ['word_hwaga', 'word_changmun', 'word_bit', 'word_saengil']) {
      const word = getWord(id);
      expect(word, `${id} no longer resolves`).toBeDefined();
      expect(word!.category).toBeTruthy();
      expect(word!.example).toContain(word!.word);
    }
  });

  it('never leaves a gap-fill whose answer is not among its own options', () => {
    /*
     * The bank shrank by 174 items this pass and gained 22 hand-written ones.
     * A gap-fill whose answer is missing from its options is unanswerable, and
     * it is the shape a merge of two sources gets wrong.
     */
    for (const word of VOCABULARY) {
      const gap = clozeFor(word.id);
      if (!gap) continue;
      expect(gap.options.map((option) => option.id)).toContain(word.id);
      expect(gap.options.map((option) => option.surface)).toContain(gap.target);
      expect(new Set(gap.options.map((option) => option.surface)).size).toBe(gap.options.length);
    }
  });

  it('plays no recording under a sentence that was written for the question', () => {
    /*
     * A curated gap-fill is not the card's sentence, so the card's example clip
     * is a recording of something else. `exercises.ts` omits the audio for
     * these; this asserts the data says which are which, because the renderer
     * has no other way to tell.
     */
    const curated = VOCABULARY.filter((word) => clozeFor(word.id)?.curated);
    expect(curated.length).toBeGreaterThan(0);
    for (const word of curated) {
      const gap = clozeFor(word.id)!;
      const written = `${gap.before}${gap.target}${gap.after}`;
      expect(written).not.toBe(word.example);
    }
  });
});
