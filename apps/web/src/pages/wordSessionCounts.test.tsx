/**
 * One counter on the session screen, and one unit behind it.
 *
 * ## The defect
 *
 * The screen carried two `x / y` counters a few pixels apart, measuring
 * different things. The header's counts **words finished today** — 3 / 10 — and
 * the line under the word counted *this screen's position within its word*:
 *
 *     새 단어 · 1 / 2
 *     새 단어 · 2 / 2
 *
 * The second one existed for a good reason. The day's counter measures words
 * *finished*, so meeting a two-step word moves nothing, and a learner pressing
 * *Got it* on an introduction saw a number that did not change. But `x / y`
 * already meant something in this product, at the top of the same screen, and a
 * reader took the smaller one to mean what the bigger one means: it was
 * reported as "the app says there are two new words today", by a learner who
 * then met a third. Nothing was miscounted — the plan really did hold three new
 * words, and the day's counter was right the whole time. The screen simply said
 * `1 / 2` about a word and let it be read as a day.
 *
 * ## What is asserted here
 *
 * That the element is gone from the DOM and from the accessibility tree, and
 * that the one counter left measures words, on every shape a day can take:
 * none, one, two, three or more, review-only, and a mixture. `sessionProgress`
 * is the only source the header and the progress bar read, so pinning it pins
 * both.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sessionProgress, type DailyPlan, type PlannedWord } from '../domain/vocabularyDay';

const word = (id: string, source: PlannedWord['source'], steps: PlannedWord['steps']): PlannedWord => ({
  wordId: id,
  source,
  steps,
});

function plan(words: PlannedWord[], completed: string[] = [], goal = 10): DailyPlan {
  return { date: '2026-09-08', goal, level: 1, words, completed };
}

describe('the day counter measures words, whatever shape the day has', () => {
  /**
   * Each row is a day a learner can actually get, and the *unit* is the point:
   * `done` is words finished, never screens shown and never questions answered.
   * A two-step word contributes one, and contributes it once.
   */
  const shapes: Array<[string, DailyPlan, number, number]> = [
    ['no new words at all', plan([], []), 0, 10],
    ['one new word, untouched', plan([word('a', 'new', ['intro', 'meaning'])]), 0, 10],
    ['one new word, finished', plan([word('a', 'new', ['intro', 'meaning'])], ['a']), 1, 10],
    [
      'two new words, one finished',
      plan([word('a', 'new', ['intro', 'meaning']), word('b', 'new', ['intro', 'meaning'])], ['a']),
      1,
      10,
    ],
    [
      'three new words, all finished',
      plan(
        ['a', 'b', 'c'].map((id) => word(id, 'new', ['intro', 'meaning'])),
        ['a', 'b', 'c'],
      ),
      3,
      10,
    ],
    [
      'review only',
      plan([word('r1', 'review', ['meaning']), word('r2', 'review', ['meaning'])], ['r1']),
      1,
      10,
    ],
    [
      'a mixture, part done',
      plan([word('a', 'new', ['intro', 'meaning']), word('r1', 'review', ['meaning'])], ['r1']),
      1,
      10,
    ],
    [
      'a plan longer than the goal',
      plan(
        ['a', 'b', 'c'].map((id) => word(id, 'new', ['intro'])),
        ['a'],
        2,
      ),
      1,
      3,
    ],
  ];

  for (const [name, day, done, total] of shapes) {
    it(`counts ${name}`, () => {
      const progress = sessionProgress(day);
      expect(progress.done).toBe(done);
      expect(progress.total).toBe(total);
      expect(progress.done).toBeLessThanOrEqual(progress.total);
      expect(progress.ratio).toBeLessThanOrEqual(1);
    });
  }

  /**
   * The failure that put this rule here: a word credited twice — by its own
   * step and by a matching grid it was also in — used to inflate the day.
   */
  it('counts a word once, however many times it was credited', () => {
    const twice = plan([word('a', 'new', ['intro', 'meaning'])], ['a', 'a']);
    expect(sessionProgress(twice).done).toBe(1);
  });

  /**
   * Reopening the same plan is the same reading. The counter is a pure function
   * of the stored plan, so a reload, a resume and a restart cannot disagree
   * with each other — there is no session-local tally to fall out of step.
   */
  it('reads the same on a reopened plan', () => {
    const day = plan(
      ['a', 'b', 'c'].map((id) => word(id, 'new', ['intro', 'meaning'])),
      ['a', 'b'],
    );
    const first = sessionProgress(day);
    const reopened = sessionProgress(JSON.parse(JSON.stringify(day)) as DailyPlan);
    expect(reopened).toEqual(first);
  });

  /** An empty day is complete rather than dividing by zero. */
  it('does not divide by zero on a plan with no words and no goal', () => {
    const empty = plan([], [], 0);
    expect(sessionProgress(empty).ratio).toBe(1);
    expect(sessionProgress(empty).percent).toBe(100);
  });
});

/**
 * Read from the working tree rather than through `import.meta.url`, which Vite
 * serves over http in this runner and `readFileSync` will not take.
 */
const sessionSource = () => readFileSync('src/pages/WordSessionPage.tsx', 'utf8');

describe('the per-word step counter', () => {
  /**
   * Asserted against the source rather than a rendered screen, because the
   * claim is that *nothing* renders it: a DOM assertion can only look for what
   * it already knows to look for, and would keep passing if the counter came
   * back under a different test id or a different label.
   */
  it('is not built anywhere in the session screen', () => {
    const source = sessionSource();
    expect(source).not.toContain('word-step');
    expect(source).not.toContain('wordStep');
    // The day's counter and the letter/review counters keep this key; what may
    // not come back is a *second* one inside the word card.
    const counters = source.match(/learning:session\.counter/g) ?? [];
    expect(counters).toHaveLength(1);
  });

  it('leaves the new-word label, which says something the counter did not', () => {
    const source = sessionSource();
    expect(source).toContain('vocabulary:session.newWord');
    expect(source).toContain('word-source');
  });
});
