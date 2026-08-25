/**
 * What pressing Continue credits — the rule `advance` and `isLast` share.
 *
 * The photographed 9/10: a matching grid reported which words were matched
 * cleanly, the crediting path read a boolean nothing had set, and every word
 * the grid completed was treated as failed and requeued. The learner watched
 * the counter hold at 9/10 after answering correctly. `creditsFor` is the
 * fix made testable: one function, per-word, used by both the crediting and
 * the finish-button prediction.
 */
import { describe, expect, it } from 'vitest';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import type { DailyQuestion } from '../features/vocabulary/dailyQuestions';
import { creditsFor } from './WordSessionPage';

const word = { id: 'w1', word: '엄마' } as unknown as VocabularyWord;

function question(overrides: Partial<DailyQuestion>): DailyQuestion {
  return {
    word,
    step: 'meaning',
    completesWord: true,
    completes: ['w1'],
    exercise: null,
    ...overrides,
  };
}

describe('creditsFor', () => {
  it('credits a correctly answered single-word question', () => {
    expect(creditsFor(question({}), { correct: ['w1'], wrong: [] })).toEqual(['w1']);
  });

  it('credits nothing for a wrong answer', () => {
    expect(creditsFor(question({}), { correct: [], wrong: ['w1'] })).toEqual([]);
  });

  it('credits nothing when the screen has not been answered', () => {
    expect(creditsFor(question({}), null)).toEqual([]);
  });

  it('credits a matching grid per word — the 9/10 regression', () => {
    // Four words, three matched cleanly, one caught out. Exactly the three
    // move the day; the fourth is requeued by the caller.
    const grid = question({
      step: 'match',
      completes: ['w1', 'w2', 'w3', 'w4'],
    });
    const answered = { correct: ['w1', 'w2', 'w4'], wrong: ['w3'] };
    expect(creditsFor(grid, answered)).toEqual(['w1', 'w2', 'w4']);
  });

  it('a grid answered entirely correctly credits every word it completes', () => {
    const grid = question({ step: 'match', completes: ['w1', 'w2'] });
    expect(creditsFor(grid, { correct: ['w1', 'w2', 'w3', 'w4'], wrong: [] })).toEqual([
      'w1',
      'w2',
    ]);
  });

  it('an intro for a word with a question ahead credits nothing — §26', () => {
    // `repairCompletion` gives such an intro an empty `completes`.
    expect(creditsFor(question({ step: 'intro', completes: [] }), null)).toEqual([]);
  });

  it('an intro that is a word’s whole obligation credits it', () => {
    // A partial-locale learner meets a word with no askable question in their
    // language. `repairCompletion` makes the intro the completing screen;
    // refusing to credit it would strand the day one short forever.
    expect(creditsFor(question({ step: 'intro', completes: ['w1'] }), null)).toEqual(['w1']);
  });

  it('credits nothing with no current question', () => {
    expect(creditsFor(undefined, { correct: ['w1'], wrong: [] })).toEqual([]);
  });
});
