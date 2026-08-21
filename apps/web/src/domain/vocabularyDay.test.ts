/**
 * The daily vocabulary goal, and the two promises it makes.
 *
 * 1. **Ten means ten words.** Not ten questions, not ten taps. §25 exists
 *    because a goal counter that measures its own UI is a goal nobody can
 *    predict, and the number would move at a rate that depends on which
 *    exercises happened to be scheduled.
 * 2. **Leaving is safe.** Four of ten, close the app, come back to four of ten
 *    and the same six words. §49. A plan that regenerates while you are gone is
 *    not a target, it is a treadmill.
 *
 * Plus the rule underneath both: nowhere in any of this is a word handwritten.
 */
import { describe, expect, it } from 'vitest';
import type { ItemProgress, VocabularyWord } from '@hangyul-ganada/shared-types';

import { blankProgress } from '../storage/schema';
import { blankMemory, memoryKey, type MemoryMap } from './memory';
import {
  DAILY_WORD_GOALS,
  buildDailyPlan,
  completeWord,
  dayProgress,
  extendDay,
  newWordAllowance,
  planIsCurrent,
  scheduleSteps,
  stepsFor,
  MIN_WORD_GAP,
  MATCH_SIZE,
  MIN_MATCH_SIZE,
} from './vocabularyDay';

const NOW = new Date('2026-06-02T10:00:00.000Z');

/** A corpus of plain words, in priority order, with nothing else attached. */
function corpus(count: number): VocabularyWord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `w${i}`,
    word: `단어${i}`,
    difficulty_score: i,
  })) as unknown as VocabularyWord[];
}

function met(...ids: string[]): Record<string, ItemProgress> {
  const rows: Record<string, ItemProgress> = {};
  for (const id of ids) {
    rows[`word:${id}`] = {
      ...blankProgress('word', id, NOW.toISOString()),
      stage: 'learned',
    };
  }
  return rows;
}

/** A memory row whose every skill is at `recall`, by placing the due date. */
function remembering(ids: string[], stability: number, daysAgo: number): MemoryMap {
  const map: MemoryMap = {};
  for (const id of ids) {
    const memory = blankMemory('word', id);
    const reviewed = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();
    memory.skills.meaning_recognition = {
      skill: 'meaning_recognition',
      stability_days: stability,
      difficulty: 0.3,
      last_reviewed_at: reviewed,
      next_review_at: reviewed,
      streak: 1,
      lapses: 0,
      recent_score: 1,
      last_response_ms: null,
      hints: 0,
    };
    map[memoryKey('word', id)] = memory;
  }
  return map;
}

const plan = (overrides: Partial<Parameters<typeof buildDailyPlan>[0]> = {}) =>
  buildDailyPlan({
    progress: {},
    memory: {},
    corpus: corpus(200),
    goal: 10,
    now: NOW,
    ...overrides,
  });

describe('building the day', () => {
  it('takes the goal from the top of the priority order', () => {
    const day = plan();
    expect(day.words).toHaveLength(10);
    // The corpus arrives ordered by usefulness, and the plan does not re-sort
    // it: a beginner's first ten words are the ten a beginner most needs.
    expect(day.words.map((w) => w.wordId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `w${i}`),
    );
  });

  it('never plans more than the goal', () => {
    for (const goal of DAILY_WORD_GOALS) {
      expect(plan({ goal }).words.length).toBeLessThanOrEqual(goal);
    }
  });

  it('caps new material so review is not crowded out', () => {
    // Without the cap, a returning learner's session is all new words, because
    // there are always more unmet words than a session has room for — and the
    // things they are actually losing never come back.
    const stale = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const day = plan({
      progress: met(...stale),
      memory: remembering(stale, 1, 30),
      goal: 10,
    });
    const fresh = day.words.filter((w) => w.source === 'new');
    expect(fresh.length).toBeLessThanOrEqual(newWordAllowance(10));
    expect(day.words.some((w) => w.source !== 'new')).toBe(true);
  });

  it('puts what is being lost before what has merely faded', () => {
    const weak = ['w0', 'w1'];
    const due = ['w2', 'w3'];
    const day = plan({
      progress: met(...weak, ...due),
      /*
       * Recall is 0.9 ^ (elapsed / stability), so a word is "due" once it is
       * past its own interval and "weak" once it is well past it.
       *
       *   weak   stability 1, seen 20 days ago  →  0.12
       *   due    stability 2, seen  3 days ago  →  0.85
       */
      memory: { ...remembering(weak, 1, 20), ...remembering(due, 2, 3) },
      goal: 6,
    });
    const sources = day.words.map((w) => w.source);
    expect(sources.slice(0, 2)).toEqual(['weak', 'weak']);
    expect(sources).toContain('review');
  });

  it('gives a first-day learner new words and nothing else', () => {
    expect(plan().words.every((w) => w.source === 'new')).toBe(true);
  });

  it('still fills a session when the corpus is smaller than the goal', () => {
    const day = plan({ corpus: corpus(3), goal: 10 });
    expect(day.words).toHaveLength(3);
    // And finishing what there is finishes the day, rather than leaving the
    // learner at 3 / 10 forever because the app ran out of words.
    const done = day.words.reduce((acc, w) => completeWord(acc, w.wordId), day);
    expect(dayProgress(done).complete).toBe(true);
  });
});

describe('recognition before recall', () => {
  it('meets a new word before asking anything about it', () => {
    expect(stepsFor('new')[0]).toBe('intro');
  });

  it('asks a new word the easiest question there is, and only that', () => {
    // §34. A word met sixty seconds ago is shown its own Korean and asked what
    // it means. It is not asked to be produced from its meaning, and it is not
    // met inside a sentence — both of those come once it is known.
    expect(stepsFor('new')).toEqual(['intro', 'meaning']);
    expect(stepsFor('new')).not.toContain('produce');
    expect(stepsFor('new')).not.toContain('context');
  });

  it('rebuilds a failing word from the easiest question up', () => {
    // This used to start at `listen`, on the reading that the failing skill was
    // often the listening one. There is no listening question any more, so the
    // order is what it says: read it, meet it in its sentence, produce it.
    expect(stepsFor('weak')).toEqual(['meaning', 'context', 'produce']);
  });

  it('cannot schedule a listening question for a word, from any state', () => {
    for (const source of ['new', 'review', 'familiar', 'weak'] as const) {
      for (let index = 0; index < 6; index += 1) {
        const steps = stepsFor(source, index);
        expect(steps, `${source} ${index}`).not.toContain('listen');
        expect(steps, `${source} ${index}`).not.toContain('listenMeaning');
      }
    }
  });

  it('cannot schedule one for the extra study either', () => {
    /*
     * Extra study is the same words asked the same ways.
     *
     * `extendDay` appends by calling `buildDailyPlan` again, so the words it
     * adds carry steps from the same table as the day's own — the rule above
     * covers them by construction. Named here anyway, because "the extra
     * questions come from somewhere else" is the shape the rule would grow back
     * in, and a learner who asks for more practice is exactly the learner who
     * would meet it.
     */
    const day = plan({ goal: 5 });
    const longer = extendDay(day, 5, {
      progress: {},
      memory: {},
      corpus: corpus(200),
      goal: 5,
      now: NOW,
    });
    expect(longer.words.length).toBeGreaterThan(day.words.length);
    for (const word of longer.words) {
      expect(word.steps, word.wordId).not.toContain('listen');
      expect(word.steps, word.wordId).not.toContain('listenMeaning');
    }
  });

  it('never asks for handwriting, in any state', () => {
    // §5, §28, §35. The steps are a closed set and none of them holds a pen.
    for (const source of ['new', 'review', 'weak'] as const) {
      for (const step of stepsFor(source)) {
        expect(['intro', 'meaning', 'produce', 'context', 'build']).toContain(step);
      }
    }
  });
});

describe('difficulty follows familiarity', () => {
  const familiarMemory = (ids: string[]) => {
    const map: MemoryMap = {};
    for (const id of ids) {
      const memory = blankMemory('word', id);
      const reviewed = new Date(NOW.getTime() - 12 * 86_400_000).toISOString();
      // Three skills, all answered right several times running, all now due.
      for (const skill of ['meaning_recognition', 'listening_recognition', 'sentence_comprehension'] as const) {
        memory.skills[skill] = {
          skill,
          stability_days: 8,
          difficulty: 0.2,
          last_reviewed_at: reviewed,
          next_review_at: reviewed,
          streak: 4,
          lapses: 0,
          recent_score: 1,
          last_response_ms: 1500,
          hints: 0,
        };
      }
      map[memoryKey('word', id)] = memory;
    }
    return map;
  };

  it('asks a well-known word the harder questions', () => {
    // §16. "What does 엄마 mean" is not a question for somebody who has answered
    // it right four times running; it is the app confirming what it knows.
    const ids = ['w0', 'w1', 'w2'];
    const day = plan({ progress: met(...ids), memory: familiarMemory(ids), goal: 6 });
    const familiar = day.words.filter((word) => word.source === 'familiar');
    expect(familiar.length).toBeGreaterThan(0);
    for (const word of familiar) {
      /*
       * One production question, and which one alternates.
       *
       * This used to require `produce` specifically, which was right when it
       * was the only way to ask a word from its meaning. `build` — assemble it
       * from its own syllables — is the same skill asked harder, and familiar
       * words alternate between the two so that a learner three weeks in is not
       * meeting the same production question every time. What the rule actually
       * is, and so what this asserts, is that a familiar word is always asked to
       * be *produced* in one form or the other.
       */
      expect(word.steps.some((step) => step === 'produce' || step === 'build')).toBe(true);
      // Was `listenMeaning` here, between the production question and the
      // sentence. The sentence is what a familiar word keeps.
      expect(word.steps).toContain('context');
      expect(word.steps).not.toContain('intro');
    }
    // And both forms are in use across the day, not just the first one.
    const production = new Set(
      familiar.flatMap((word) => word.steps.filter((step) => step === 'produce' || step === 'build')),
    );
    expect(production.size).toBeGreaterThan(1);
  });

  it('does not call a half-known word familiar', () => {
    // Measured on the weakest skill, not the best one. A word read fluently and
    // never heard is half-known, and giving it the harder questions would test
    // the missing half by way of the one that is fine.
    const memory = familiarMemory(['w0']);
    memory[memoryKey('word', 'w0')]!.skills.listening_recognition!.streak = 0;
    const day = plan({ progress: met('w0'), memory, goal: 4 });
    const word = day.words.find((row) => row.wordId === 'w0');
    expect(word?.source).not.toBe('familiar');
  });

  it('never asks a new word anything but the easiest question', () => {
    // §34, restated against the new types: production and listening-for-meaning
    // are recall, and recall comes after recognition.
    expect(stepsFor('new')).toEqual(['intro', 'meaning']);
  });

  it('offers no handwriting in any state, including the new ones', () => {
    const allowed = ['intro', 'meaning', 'produce', 'context', 'build'];
    for (const source of ['new', 'review', 'familiar', 'weak'] as const) {
      for (const step of stepsFor(source)) expect(allowed).toContain(step);
    }
  });
});

describe('the sitting', () => {
  it('does not ask about the same word twice in a row', () => {
    // §27. Three questions about 엄마 back to back measure whether the learner
    // can remember the previous screen.
    const steps = scheduleSteps(plan({ goal: 10 }));
    for (let i = 1; i < steps.length; i += 1) {
      const window = steps.slice(Math.max(0, i - MIN_WORD_GAP), i);
      const repeated = window.filter((s) => s.wordId === steps[i]!.wordId);
      // A gap is a preference and finishing the plan is the contract, so the
      // tail of a session may run out of other words to interleave with. What
      // must never happen is a repeat while alternatives remain.
      if (i < steps.length - MIN_WORD_GAP * 2) expect(repeated).toHaveLength(0);
    }
  });

  it("keeps each word's own steps in order", () => {
    const day = plan({ goal: 6 });
    const steps = scheduleSteps(day);
    for (const word of day.words) {
      /*
       * A word appears in a step either as its owner or as a member of a
       * matching grid, and a grid belongs to all four of its words equally —
       * so "this word's steps" is the steps it is *in*, not the steps whose
       * `wordId` happens to be it.
       */
      const asked = steps
        .filter((s) => (s.group ?? [s.wordId]).includes(word.wordId))
        .map((s) => s.step);
      /*
       * `match` is dropped when too few words reach it to make a grid, which
       * is the expected outcome at small goals. What must hold is that the
       * steps a word *did* get are its own, in its own order.
       */
      expect(asked).toEqual(word.steps.slice(0, asked.length));
      expect(word.steps.slice(0, asked.length)).toEqual(asked);
    }
  });

  it('finishes every word exactly once, counting matching grids', () => {
    const day = plan({ goal: 8 });
    const steps = scheduleSteps(day);
    const finished = new Map<string, number>();
    for (const step of steps) {
      for (const id of step.completes) finished.set(id, (finished.get(id) ?? 0) + 1);
    }
    // Every word in the plan is finished, and none of them twice — the
    // invariant a group step is most likely to break in either direction.
    expect([...finished.values()].every((n) => n === 1)).toBe(true);
    expect(finished.size).toBe(day.words.length);
  });

  it('keeps completesWord consistent with completes', () => {
    for (const goal of [5, 8, 10, 15, 20]) {
      for (const step of scheduleSteps(plan({ goal }))) {
        expect(step.completesWord, `goal ${goal} · ${step.wordId} · ${step.step}`).toBe(
          step.completes.includes(step.wordId),
        );
      }
    }
  });

  it('builds matching grids out of words the learner has already met', () => {
    const steps = scheduleSteps(plan({ goal: 20 }));
    const grids = steps.filter((s) => s.step === 'match');
    expect(grids.length).toBeGreaterThan(0);
    for (const [at, grid] of steps.entries()) {
      if (grid.step !== 'match') continue;
      expect(grid.group?.length).toBeGreaterThanOrEqual(MIN_MATCH_SIZE);
      expect(grid.group?.length).toBeLessThanOrEqual(MATCH_SIZE);
      // No word appears twice in one grid…
      expect(new Set(grid.group).size).toBe(grid.group!.length);
      // …and every word in it was introduced earlier in the sitting, so the
      // grid is a recall exercise rather than four strangers and a guess.
      for (const id of grid.group!) {
        const introduced = steps
          .slice(0, at)
          .some((earlier) => earlier.wordId === id && earlier.step === 'intro');
        expect(introduced, `${id} was in a grid before it was introduced`).toBe(true);
      }
    }
  });

  it('never puts the same word in two grids', () => {
    const seen = new Set<string>();
    for (const step of scheduleSteps(plan({ goal: 20 }))) {
      if (step.step !== 'match') continue;
      for (const id of step.group!) {
        expect(seen.has(id), `${id} appeared in two grids`).toBe(false);
        seen.add(id);
      }
    }
  });

  it('is deterministic, so leaving and returning is not a reshuffle', () => {
    const day = plan({ goal: 8 });
    expect(scheduleSteps(day)).toEqual(scheduleSteps(day));
  });
});

describe('the goal counts words, not taps', () => {
  it('moves by one when a word is finished, however many questions it took', () => {
    // §25, stated as an assertion. The weak path asks three questions about one
    // word; the goal moves by one.
    const day = plan({
      progress: met('w0'),
      memory: remembering(['w0'], 1, 30),
      goal: 5,
    });
    const target = day.words.find((w) => w.source === 'weak')!;
    expect(target.steps.length).toBeGreaterThan(1);
    const after = completeWord(day, target.wordId);
    expect(dayProgress(after).done).toBe(1);
  });

  it('counts a word once however many times it is reported', () => {
    const day = plan({ goal: 5 });
    const id = day.words[0]!.wordId;
    const twice = completeWord(completeWord(day, id), id);
    expect(dayProgress(twice).done).toBe(1);
  });

  it("ignores a word that is not in today's plan", () => {
    const day = plan({ goal: 5 });
    expect(completeWord(day, 'w199')).toBe(day);
  });
});

describe('leaving and coming back', () => {
  it("keeps today's plan for today", () => {
    const day = plan();
    expect(planIsCurrent(day, NOW)).toBe(true);
    expect(planIsCurrent(day, new Date(NOW.getTime() + 86_400_000))).toBe(false);
    expect(planIsCurrent(null, NOW)).toBe(false);
  });

  it('resumes at the same place with the same words left', () => {
    // §49, directly. Four of ten, then away, then back.
    const day = plan({ goal: 10 });
    const finished = day.words.slice(0, 4).reduce((acc, w) => completeWord(acc, w.wordId), day);

    expect(dayProgress(finished).done).toBe(4);
    expect(dayProgress(finished).total).toBe(10);
    expect(dayProgress(finished).complete).toBe(false);

    // What a fresh mount rebuilds from the stored plan: the six that are left,
    // and none of the four already done.
    const remaining = new Set(scheduleSteps(finished).map((s) => s.wordId));
    expect(remaining.size).toBe(6);
    for (const done of day.words.slice(0, 4)) expect(remaining.has(done.wordId)).toBe(false);
  });

  it('reports a finished day as finished', () => {
    const day = plan({ goal: 5 });
    const done = day.words.reduce((acc, w) => completeWord(acc, w.wordId), day);
    const progress = dayProgress(done);
    expect(progress.complete).toBe(true);
    expect(progress.ratio).toBe(1);
    expect(progress.stepsLeft).toBe(0);
  });
});
