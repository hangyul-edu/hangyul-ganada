/**
 * A gap-fill plays the recording of the sentence on the screen, or nothing.
 *
 * The card's example clip is a recording of the card's sentence. A curated
 * gap-fill (content/vocabulary/context-items.json) is a different sentence,
 * written for the question, so under it the card's clip would be a recording
 * of something other than what the learner is reading — the audio/transcript
 * mismatch §9 of the brief forbids. Since the v1.0.5 pass each curated
 * sentence carries its own clip id, derived from its text the way a card
 * example's is, and the speech plan records it. This holds the seam in three
 * places: the builder stamped the id, the id is the text's own, and the
 * question carries that id and never the card's.
 */
import { describe, expect, it } from 'vitest';

import { clozeFor, clozeCount } from '../../data/cloze';
import raw from '../../data/generated/cloze.json';
import { VOCABULARY, getWord } from '../../data/vocabulary';
import type { ReviewCandidate } from '../../domain/review';
import { buildExercise } from './exercises';

const WORDS = (raw as { words: Record<string, { curated?: boolean; audioId?: string; before: string; target: string; after: string }> }).words;

/** The same derivation `data/vocabulary.ts` and `data/characters.ts` use. */
const audioId = (prefix: string, text: string) =>
  `${prefix}_${[...text].map((ch) => ch.codePointAt(0)!.toString(16)).join('')}`;

const curated = Object.entries(WORDS).filter(([, gap]) => gap.curated);

describe('curated gap-fills and their recordings', () => {
  it('exist, and every one carries a clip id derived from its own sentence', () => {
    expect(clozeCount()).toBeGreaterThan(0);
    expect(curated.length).toBeGreaterThanOrEqual(22);
    for (const [id, gap] of curated) {
      expect(gap.audioId, `${id} has no audioId`).toBeDefined();
      expect(gap.audioId).toBe(audioId('ex', gap.before + gap.target + gap.after));
      // And it is not the card's: a curated sentence is by definition another one.
      const word = getWord(id)!;
      expect(gap.audioId).not.toBe(word.audio.example);
    }
  });

  it('the context question plays the curated clip, never the card example', () => {
    let asked = 0;
    for (const [id, gap] of curated) {
      const word = getWord(id)!;
      const candidate: ReviewCandidate = {
        kind: 'word',
        itemKey: word.id,
        skill: 'meaning_recognition',
        mode: 'context',
        priority: 1,
        recall: 0.5,
        partner: null,
        intervene: false,
        need: 'due',
      };
      const exercise = buildExercise(candidate, (w) => ({ value: w.translations?.en?.meaning ?? w.word, locale: 'en' }), 1);
      if (!exercise || exercise.mode !== 'context') continue;
      asked += 1;
      expect(exercise.sentence?.audioId, `${word.word}`).toBe(gap.audioId);
      expect(exercise.sentence?.audioId).not.toBe(word.audio.example);
    }
    expect(asked).toBeGreaterThan(0);
  });

  it("a card-sentence gap-fill still plays the card's example", () => {
    const lifted = VOCABULARY.find((w) => {
      const gap = clozeFor(w.id);
      return gap && !gap.curated;
    })!;
    const exercise = buildExercise(
      { kind: 'word', itemKey: lifted.id, skill: 'meaning_recognition', mode: 'context', priority: 1, recall: 0.5, partner: null, intervene: false, need: 'due' },
      (w) => ({ value: w.translations?.en?.meaning ?? w.word, locale: 'en' }),
      1,
    );
    expect(exercise?.mode).toBe('context');
    expect(exercise?.sentence?.audioId).toBe(lifted.audio.example);
  });
});
