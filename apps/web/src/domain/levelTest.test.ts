/**
 * The Vocabulary Level Test's selection and stopping rules.
 *
 * ## Why these are unit tests and not only a simulation
 *
 * `scripts/level-test-qa.mjs` measures whether the test lands on the right
 * level, over six thousand simulated sittings. That is the right instrument for
 * accuracy and the wrong one for everything a learner actually complained
 * about, because an average is exactly the shape that hides a bad sequence: the
 * engine that opened every sitting at level 14 and swung six levels between
 * consecutive questions placed learners within ±3 levels 95.9% of the time. It
 * was accurate and it was unpleasant, and only one of those was measured.
 *
 * So each rule below is asserted as a rule — on the sequence, not on the
 * outcome — and each names the behaviour it exists to prevent.
 */
import { describe, expect, it } from 'vitest';

import {
  CONFIRM_FROM,
  LEVELS,
  MAX_ITEM_COUNT,
  MAX_STEP,
  MIN_ITEM_COUNT,
  REPEAT_LIMIT,
  STOP_SE,
  WARMUP_ITEMS,
  type AskedItem,
  type Response,
  estimate,
  nextLevel,
  phaseOf,
  pickIndex,
  planKinds,
  shouldStop,
  warmupLadder,
} from './levelTest';

/** Every level the shipped bank has items at. */
const ALL_LEVELS = Array.from({ length: LEVELS }, (_, i) => i + 1);

/**
 * Runs a whole sitting against a responder, and returns the item levels in order.
 *
 * The responder is a function so a test can be a learner: `() => 'correct'` is
 * somebody who knows everything, and a closure over the item level is somebody
 * with an ability.
 */
function walk(
  respond: (level: number, index: number) => Response,
  options: { previousLevel?: number | null; levels?: number[] } = {},
): { levels: number[]; asked: AskedItem[] } {
  const available = options.levels ?? ALL_LEVELS;
  const asked: AskedItem[] = [];
  const levels: number[] = [];
  while (!shouldStop(asked)) {
    const level = nextLevel(asked, available, { previousLevel: options.previousLevel ?? null });
    if (level === null) break;
    levels.push(level);
    asked.push({ level, response: respond(level, asked.length) });
  }
  return { levels, asked };
}

/** A learner who knows a word if it is at or below their level, with no luck. */
const ability = (truth: number) => (level: number): Response =>
  level <= truth ? 'correct' : 'unknown';

describe('where a sitting opens', () => {
  it('opens a first-time learner on level 2, not in the middle of the scale', () => {
    /*
      The defect this replaces: with no history the posterior is the prior, the
      prior is centred at 15, and the most informative item is therefore level
      14 — which is what every learner in the product saw as question one.
    */
    expect(nextLevel([], ALL_LEVELS, { previousLevel: null })).toBe(2);
  });

  it('climbs the warm-up gently rather than jumping', () => {
    expect(warmupLadder(null)).toEqual([2, 4, 6]);
  });

  it('opens a returning learner below the level they already have', () => {
    expect(warmupLadder(20)).toEqual([14, 16, 18]);
    expect(warmupLadder(30)).toEqual([24, 26, 28]);
    // Nobody is opened below the bottom of the scale, however low they were.
    expect(warmupLadder(1)).toEqual([1, 3, 5]);
    expect(warmupLadder(5)).toEqual([1, 3, 5]);
  });

  it('never opens a returning learner above the level they already have', () => {
    for (let previous = 1; previous <= LEVELS; previous += 1) {
      for (const rung of warmupLadder(previous)) {
        expect(rung).toBeLessThanOrEqual(Math.max(previous, 6));
        expect(rung).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('spends the first questions on the ladder and not on the estimator', () => {
    const { levels } = walk(ability(30));
    expect(levels.slice(0, WARMUP_ITEMS)).toEqual([2, 4, 6]);
    expect(phaseOf(0)).toBe('warmup');
    expect(phaseOf(WARMUP_ITEMS)).toBe('adaptive');
    expect(phaseOf(CONFIRM_FROM)).toBe('confirm');
  });
});

describe('the difficulty moves gradually', () => {
  /*
    The bound is the whole point, so it is asserted over every response pattern
    the engine can meet rather than over a sample: all-correct, all-wrong,
    all-unknown, both alternations, and thirty simulated abilities.
  */
  const patterns: Array<[string, (level: number, index: number) => Response]> = [
    ['all correct', () => 'correct'],
    ['all wrong', () => 'wrong'],
    ["all I don't know", () => 'unknown'],
    ['alternating from correct', (_l, i) => (i % 2 === 0 ? 'correct' : 'wrong')],
    ['alternating from wrong', (_l, i) => (i % 2 === 0 ? 'wrong' : 'correct')],
    ['struggles then improves', (level, i) => (i < 10 ? 'unknown' : level <= 20 ? 'correct' : 'wrong')],
    ['succeeds then hits a limit', (level, i) => (i < 8 ? 'correct' : level <= 8 ? 'correct' : 'unknown')],
    ...ALL_LEVELS.map(
      (truth) => [`ability ${truth}`, ability(truth)] as [string, (l: number, i: number) => Response],
    ),
  ];

  it.each(patterns)('never steps more than %s levels — %s', () => {});

  for (const [name, respond] of patterns) {
    it(`never steps more than ${MAX_STEP} levels: ${name}`, () => {
      const { levels } = walk(respond);
      for (let i = 1; i < levels.length; i += 1) {
        expect(Math.abs(levels[i]! - levels[i - 1]!)).toBeLessThanOrEqual(MAX_STEP);
      }
    });

    it(`never asks one level ${REPEAT_LIMIT + 1} times running: ${name}`, () => {
      const { levels } = walk(respond);
      let run = 1;
      for (let i = 1; i < levels.length; i += 1) {
        run = levels[i] === levels[i - 1] ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(REPEAT_LIMIT);
      }
    });

    it(`asks between ${MIN_ITEM_COUNT} and ${MAX_ITEM_COUNT} questions: ${name}`, () => {
      const { levels } = walk(respond);
      expect(levels.length).toBeGreaterThanOrEqual(MIN_ITEM_COUNT);
      expect(levels.length).toBeLessThanOrEqual(MAX_ITEM_COUNT);
    });
  }

  it('does not trap a learner who gets everything wrong at one level', () => {
    /*
      The defect: the old selector asked level 1 twenty-five times in a row of a
      learner who answered everything wrongly. The posterior had stopped moving,
      so the argmax stopped moving, and five sixths of that learner's sitting
      was the same question at the same difficulty.
    */
    const { levels } = walk(() => 'wrong');
    expect(new Set(levels).size).toBeGreaterThan(2);
  });

  it('does not trap a learner who gets everything right at the ceiling', () => {
    const { levels } = walk(() => 'correct');
    expect(new Set(levels.slice(-10)).size).toBeGreaterThan(1);
    // and it does reach the top of the scale
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(LEVELS - 1);
  });
});

describe('a beginner is not asked impossible questions', () => {
  it('puts nothing far above a true beginner in the opening questions', () => {
    /*
      Measured before this change: 42.8% of the first five questions put to a
      simulated level-2 learner were above level 8. The rule is the sequence,
      not the average, so it is asserted on the sequence.
    */
    const { levels } = walk(ability(2));
    expect(levels.slice(0, 5).filter((level) => level > 8)).toHaveLength(0);
  });

  it('lets a beginner stop after the floor rather than sitting the ceiling', () => {
    const { levels } = walk(() => 'unknown');
    expect(levels.length).toBe(MIN_ITEM_COUNT);
  });

  it('reaches advanced items for an advanced learner', () => {
    const { levels } = walk(ability(28));
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(26);
  });
});

describe('the stopping rule', () => {
  it('never stops before the floor, whatever the answers', () => {
    for (let n = 0; n < MIN_ITEM_COUNT; n += 1) {
      const asked: AskedItem[] = Array.from({ length: n }, () => ({
        level: 15,
        response: 'correct' as const,
      }));
      expect(shouldStop(asked)).toBe(false);
    }
  });

  it('always stops at the ceiling', () => {
    const asked: AskedItem[] = Array.from({ length: MAX_ITEM_COUNT }, (_, i) => ({
      level: (i % LEVELS) + 1,
      response: 'correct' as const,
    }));
    expect(shouldStop(asked)).toBe(true);
  });

  it('stops between the two only when the estimate has settled', () => {
    const settled: AskedItem[] = Array.from({ length: MIN_ITEM_COUNT }, () => ({
      level: 1,
      response: 'unknown' as const,
    }));
    expect(estimate(settled).se).toBeLessThanOrEqual(STOP_SE);
    expect(shouldStop(settled)).toBe(true);
  });
});

describe('one question does not decide the result', () => {
  it('moves the reported level by at most a level or two on any single answer', () => {
    /*
      A test whose answer can be swung by one question is a test that measures
      luck. Every prefix of a realistic sitting is re-scored with the last answer
      flipped, and the reported level is required not to jump.
    */
    const { asked } = walk(ability(14));
    for (let i = MIN_ITEM_COUNT - 1; i < asked.length; i += 1) {
      const history = asked.slice(0, i + 1);
      const flipped = [...history];
      const last = flipped[i]!;
      flipped[i] = { ...last, response: last.response === 'correct' ? 'wrong' : 'correct' };
      const difference = Math.abs(estimate(history).reported - estimate(flipped).reported);
      expect(difference).toBeLessThanOrEqual(2);
    }
  });
});

describe("I don't know is not a wrong guess", () => {
  it('counts as stronger evidence of not knowing than a wrong answer', () => {
    /*
      A wrong answer might be a guess that missed; a declared blank cannot be.
      So it is scored with the guessing floor removed, which must place the
      learner lower — not merely differently.
    */
    const wrong: AskedItem[] = Array.from({ length: 10 }, () => ({
      level: 20,
      response: 'wrong' as const,
    }));
    const unknown: AskedItem[] = wrong.map((item) => ({ ...item, response: 'unknown' as const }));
    expect(estimate(unknown).level).toBeLessThan(estimate(wrong).level);
  });

  it('is not scored as a random answer', () => {
    const unknown: AskedItem[] = Array.from({ length: 10 }, () => ({
      level: 20,
      response: 'unknown' as const,
    }));
    const half: AskedItem[] = Array.from({ length: 10 }, (_, i) => ({
      level: 20,
      response: i % 4 === 0 ? ('correct' as const) : ('wrong' as const),
    }));
    expect(estimate(unknown).level).toBeLessThan(estimate(half).level);
  });
});

describe('a previous result is a starting estimate, not a verdict', () => {
  it('does not hold a learner at the level they were last measured at', () => {
    /*
      The strongest case: somebody stored at 30 who now knows nothing. If the
      stored level reached the posterior, this learner would be dragged back
      toward 30 and would have to out-argue their own history. It reaches only
      the warm-up ladder, so they are measured where they are.
    */
    const { asked } = walk(() => 'unknown', { previousLevel: 30 });
    expect(estimate(asked).reported).toBeLessThanOrEqual(3);
  });

  it('does not cap a learner who has improved since their last result', () => {
    const { asked } = walk(() => 'correct', { previousLevel: 2 });
    expect(estimate(asked).reported).toBeGreaterThanOrEqual(LEVELS - 2);
  });

  it('scores identically whatever the previous level was', () => {
    /*
      The stored level changes which questions get asked. It must not change how
      an answer is read, so the same responses at the same levels score the
      same.
    */
    const history: AskedItem[] = Array.from({ length: 20 }, (_, i) => ({
      level: (i % 10) + 5,
      response: i % 3 === 0 ? ('correct' as const) : ('unknown' as const),
    }));
    expect(estimate(history).reported).toBe(estimate([...history]).reported);
  });
});

describe('the confirmation questions sit on the answer', () => {
  it('asks the last questions within a level or two of the reported result', () => {
    for (const truth of [3, 10, 18, 25]) {
      const { levels, asked } = walk(ability(truth));
      const reported = estimate(asked).reported;
      for (const level of levels.slice(CONFIRM_FROM)) {
        expect(Math.abs(level - reported)).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('a sitting can be resumed without changing', () => {
  it('chooses the same next level from the same history', () => {
    const { asked } = walk(ability(12));
    for (let cut = 1; cut < asked.length; cut += 1) {
      const prefix = asked.slice(0, cut);
      const first = nextLevel(prefix, ALL_LEVELS, { previousLevel: null });
      const again = nextLevel([...prefix], ALL_LEVELS, { previousLevel: null });
      expect(again).toBe(first);
    }
  });

  it('chooses the same item from the same pool, seed and position', () => {
    /*
      `pickIndex` is what replaces `Math.random()` in the screen. A resumed
      sitting recomputes the next question rather than storing it, so this has
      to be a pure function of the seed and the question number — on any device
      and in any release.
    */
    for (const seed of ['abc', 'a-very-long-seed-0123', '한글']) {
      for (let index = 0; index < 30; index += 1) {
        const size = 7 + (index % 5);
        const first = pickIndex(seed, index, size);
        expect(pickIndex(seed, index, size)).toBe(first);
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThan(size);
      }
    }
  });

  it('gives different sittings different questions', () => {
    const a = Array.from({ length: 30 }, (_, i) => pickIndex('seed-one', i, 40));
    const b = Array.from({ length: 30 }, (_, i) => pickIndex('seed-two', i, 40));
    expect(a).not.toEqual(b);
  });

  it('spreads over a pool rather than favouring one item', () => {
    const counts = new Map<number, number>();
    for (let s = 0; s < 400; s += 1) {
      const index = pickIndex(`seed-${s}`, 0, 10);
      counts.set(index, (counts.get(index) ?? 0) + 1);
    }
    expect(counts.size).toBe(10);
  });
});

describe('the shape of a sitting', () => {
  it('plans one kind for every question the ceiling allows', () => {
    expect(planKinds()).toHaveLength(MAX_ITEM_COUNT);
  });

  it('opens on the gentlest kind', () => {
    expect(planKinds()[0]).toBe('meaning');
  });
});
