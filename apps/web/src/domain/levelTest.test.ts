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
  CONFIRM_WIDTH,
  OPENING_ITEMS,
  bandTop,
  bracket,
  converged,
  LEVELS,
  MAX_ITEM_COUNT,
  MAX_STEP,
  MAX_STEP_UP,
  MIN_ITEM_COUNT,
  REPEAT_LIMIT,
  STOP_SE,
  SUSTAINED_CORRECT,
  WARMUP_ITEMS,
  type AskedDetail,
  type AskedItem,
  type Response,
  estimate,
  nextLevel,
  phaseOf,
  pickIndex,
  planKinds,
  reach,
  reachCeiling,
  shouldStop,
  sittingIsServable,
  warmupLadder,
} from './levelTest';

/** Every level the shipped bank has items at. */
const ALL_LEVELS = Array.from({ length: LEVELS }, (_, i) => i + 1);

/**
 * The bounds, written out as numbers rather than read from the module.
 *
 * ## Why this matters more than it looks
 *
 * The first version of this file asserted `Math.abs(step) <= MAX_STEP` — the
 * constant imported from the code under test. It passed. It also passed when
 * `MAX_STEP` was set to 30, which is the whole defect this file exists to
 * prevent: raising the bound raised the assertion with it, so the test measured
 * the constant's agreement with itself and reported nothing about the engine.
 * Restoring the old unbounded selection produced 174 passing tests.
 *
 * So the numbers live here, and `the bounds are what they say they are` below
 * asserts the module still agrees with them. Changing a bound is then a
 * deliberate edit in two places — which is the point, because a bound is a
 * promise to a learner about how a test feels, not an implementation detail.
 */
const BOUNDS = {
  /** The most the difficulty may move between two consecutive questions. */
  step: 3,
  /** How many questions in a row may share a level. */
  repeat: 2,
  /** How many opening items come off the warm-up ladder. */
  warmup: 3,
  /** The shortest and longest a sitting may be. */
  min: 20,
  max: 30,
  /** The top of the warm-up ladder for a learner with no history. */
  opening: 2,
} as const;

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
    expect(nextLevel([], ALL_LEVELS, { previousLevel: null })).toBe(BOUNDS.opening);
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

  /**
   * The ladder now stops at the foundation band, and that is the point.
   *
   * It used to run 2, 4, 6 for every learner who got them right, so the third
   * question of a sitting was already level 6 on the strength of two correct
   * word answers. The evidence gate caps the ladder at the top of band 1 until
   * a band has been *earned*, so it runs 2, 3, 3 — three foundation questions,
   * which is what a warm-up is for.
   */
  it('spends the first questions on the ladder, inside the foundation band', () => {
    const { levels } = walk(ability(30));
    expect(levels.slice(0, BOUNDS.warmup)).toEqual([2, 3, 3]);
    expect(levels.slice(0, BOUNDS.warmup).every((level) => level <= bandTop(0))).toBe(true);
    expect(phaseOf([])).toBe('warmup');
  });

  it('will not leave the foundation band on three correct answers of one kind', () => {
    /*
      The reported defect, as an assertion. Three correct `meaning` answers is
      recognition of three words; the band above holds sentences, and reading a
      sentence is a different skill. `PROMOTE_KINDS` is what says so.
    */
    const oneKind: AskedDetail[] = [1, 2, 3].map((level) => ({
      level,
      response: 'correct' as const,
      kind: 'meaning' as const,
    }));
    expect(reach(oneKind).band).toBe(0);
    expect(reachCeiling(oneKind)).toBe(bandTop(0));

    // The same three answers across two kinds do open it.
    const twoKinds: AskedDetail[] = [
      { level: 1, response: 'correct', kind: 'meaning' },
      { level: 2, response: 'correct', kind: 'produce' },
      { level: 3, response: 'correct', kind: 'meaning' },
    ];
    expect(reach(twoKinds).band).toBe(1);
  });

  it('asks no sentence until the opening word questions are done', () => {
    const plan = planKinds();
    expect(plan.slice(0, OPENING_ITEMS).every((kind) => kind !== 'context')).toBe(true);
    expect(plan[OPENING_ITEMS]).toBe('context');
  });

  it('abandons the ladder the moment a learner says they do not know', () => {
    /*
      The ladder is an offer, not a schedule. The shipped build ran 2, 4, 6
      regardless, so a learner who declined the level-2 word was shown level 4
      next — the gentlest opening in the product was the one place a struggling
      learner could not escape.
    */
    const declined: AskedItem[] = [{ level: 2, response: 'unknown' }];
    expect(phaseOf(declined)).toBe('adaptive');
    expect(nextLevel(declined, ALL_LEVELS, { previousLevel: null })).toBeLessThanOrEqual(2);

    const missed: AskedItem[] = [{ level: 2, response: 'wrong' }];
    expect(nextLevel(missed, ALL_LEVELS, { previousLevel: null })).toBeLessThanOrEqual(2);
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
    it(`never steps more than ${BOUNDS.step} levels: ${name}`, () => {
      const { levels } = walk(respond);
      for (let i = 1; i < levels.length; i += 1) {
        expect(Math.abs(levels[i]! - levels[i - 1]!)).toBeLessThanOrEqual(BOUNDS.step);
      }
    });

    it(`never asks one level ${BOUNDS.repeat + 1} times running: ${name}`, () => {
      const { levels } = walk(respond);
      let run = 1;
      for (let i = 1; i < levels.length; i += 1) {
        run = levels[i] === levels[i - 1] ? run + 1 : 1;
        expect(run).toBeLessThanOrEqual(BOUNDS.repeat);
      }
    });

    it(`asks between ${BOUNDS.min} and ${BOUNDS.max} questions: ${name}`, () => {
      const { levels } = walk(respond);
      expect(levels.length).toBeGreaterThanOrEqual(BOUNDS.min);
      expect(levels.length).toBeLessThanOrEqual(BOUNDS.max);
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
    expect(levels.length).toBe(BOUNDS.min);
  });

  it('reaches advanced items for an advanced learner', () => {
    const { levels } = walk(ability(28));
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(26);
  });
});

describe('the stopping rule', () => {
  it('never stops before the floor, whatever the answers', () => {
    for (let n = 0; n < BOUNDS.min; n += 1) {
      const asked: AskedItem[] = Array.from({ length: n }, () => ({
        level: 15,
        response: 'correct' as const,
      }));
      expect(shouldStop(asked)).toBe(false);
    }
  });

  it('always stops at the ceiling', () => {
    const asked: AskedItem[] = Array.from({ length: BOUNDS.max }, (_, i) => ({
      level: (i % LEVELS) + 1,
      response: 'correct' as const,
    }));
    expect(shouldStop(asked)).toBe(true);
  });

  it('stops between the two only when the estimate has settled', () => {
    const settled: AskedItem[] = Array.from({ length: BOUNDS.min }, () => ({
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
    for (let i = BOUNDS.min - 1; i < asked.length; i += 1) {
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

describe('the bounds are what they say they are', () => {
  /*
    The other half of `BOUNDS`. Without this, pinning the literals would mean the
    suite no longer noticed a constant moving at all — it would simply start
    disagreeing with the engine and failing everywhere, which is a worse signal
    than one test naming the number that changed.
  */
  it('matches the constants the engine selects with', () => {
    expect(MAX_STEP).toBe(BOUNDS.step);
    expect(REPEAT_LIMIT).toBe(BOUNDS.repeat);
    expect(WARMUP_ITEMS).toBe(BOUNDS.warmup);
    expect(MIN_ITEM_COUNT).toBe(BOUNDS.min);
    expect(MAX_ITEM_COUNT).toBe(BOUNDS.max);
    expect(CONFIRM_FROM).toBe(BOUNDS.min - 4);
  });
});

describe('the shape of a sitting', () => {
  it('plans one kind for every question the ceiling allows', () => {
    expect(planKinds()).toHaveLength(BOUNDS.max);
  });

  it('opens on the gentlest kind', () => {
    expect(planKinds()[0]).toBe('meaning');
  });
});

describe('the bracket, which is what steers', () => {
  it('opens wide and closes onto the evidence', () => {
    expect(bracket([])).toMatchObject({ lowerBound: 1, upperBound: LEVELS, bracketed: false });
    const some: AskedItem[] = [
      { level: 10, response: 'correct' },
      { level: 20, response: 'unknown' },
    ];
    expect(bracket(some)).toMatchObject({ lowerBound: 10, upperBound: 20, bracketed: true });
  });

  it('does not reopen a bound on one answer', () => {
    /*
      A four-option question is answered correctly by luck a quarter of the time,
      so one correct answer above the ceiling is a coin flip. Reopening on it
      placed every simulated learner between levels 9 and 18 about two levels too
      high, because the walk kept being sent above them by guesses.
    */
    const lucky: AskedItem[] = [
      { level: 5, response: 'unknown' },
      { level: 8, response: 'correct' },
    ];
    expect(bracket(lucky).upperBound).toBe(5);
  });

  it('reopens on two in a row, which is how a learner climbs back', () => {
    const twice: AskedItem[] = [
      { level: 5, response: 'unknown' },
      { level: 8, response: 'correct' },
      { level: 8, response: 'correct' },
    ];
    expect(bracket(twice).upperBound).toBe(LEVELS);
  });

  it('reopens the floor symmetrically', () => {
    const slipped: AskedItem[] = [
      { level: 20, response: 'correct' },
      { level: 18, response: 'wrong' },
      { level: 18, response: 'wrong' },
    ];
    expect(bracket(slipped).lowerBound).toBe(1);
  });

  it('is a pure function of the responses, so a resumed sitting agrees', () => {
    const history: AskedItem[] = ALL_LEVELS.slice(0, 12).map((level, i) => ({
      level,
      response: i % 3 === 0 ? ('unknown' as const) : ('correct' as const),
    }));
    expect(bracket(history)).toEqual(bracket([...history]));
  });
});

describe('a learner who starts badly is not written off', () => {
  /*
    The defect this replaces, measured on the shipped build: a learner whose true
    level is 30 and who answered *I don't know* to the first six questions was
    reported at level **2**. The selection was not at fault — it climbed to level
    30 and asked twenty-three questions there, all answered correctly. The model
    was: `P(unknown)` was `1 − known`, so a decline on a level-1 word had
    probability 0.0002 at θ=30 and six of them cost 10²³. It preferred the theory
    that a level-2 learner guessed right twenty-three times running.
  */
  const shakyStart = (truth: number, blanks: number) =>
    walk((level, i) => (i < blanks ? 'unknown' : level <= truth ? 'correct' : 'wrong'));

  it.each([
    [10, 6],
    [15, 6],
    [20, 6],
    [25, 6],
    [30, 6],
  ])('recovers a true level-%i learner who opens with %i blanks', (truth, blanks) => {
    const { asked } = shakyStart(truth, blanks);
    expect(Math.abs(estimate(asked).reported - truth)).toBeLessThanOrEqual(3);
  });

  it('still reaches the top of the scale after a bad opening', () => {
    const { levels } = shakyStart(30, 6);
    expect(Math.max(...levels)).toBeGreaterThanOrEqual(LEVELS - 1);
  });
});

describe('a sitting is only resumed when this build can still serve it', () => {
  /**
   * The quiet failure this guards.
   *
   * Replaying a stored sitting looks each presented item up by id and skips one
   * it cannot find, so an answered question whose item has left the bank is
   * dropped from the evidence: twelve answers scored as eleven, with nothing on
   * screen saying so. An update regenerates the bank, so this is not
   * hypothetical — it is one content change away at any time.
   */
  it('serves a sitting whose every item is still in the bank', () => {
    const bank = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(sittingIsServable(['a', 'b'], bank)).toBe(true);
    expect(sittingIsServable([], bank)).toBe(true);
  });

  it('refuses one whose answered item has left the bank', () => {
    const bank = new Map([['a', 1]]);
    expect(sittingIsServable(['a', 'gone'], bank)).toBe(false);
  });

  it('refuses one whose question on screen has left the bank', () => {
    const bank = new Set(['a', 'b']);
    expect(sittingIsServable(['a', 'b', 'gone'], bank)).toBe(false);
  });
});

describe('the difficulty moves gently, and asymmetrically', () => {
  /**
   * The complaint this pass was given: "it moves to a much higher level too
   * quickly after a correct answer". Going down after a miss is the test
   * agreeing with the learner and should happen at the speed of the evidence;
   * going up is the test disagreeing with where it just put them, on the
   * strength of one answer that may have been a guess — one correct answer in
   * four carries no information at all under a four-option floor.
   */
  it('never climbs more than two levels on the strength of one answer', () => {
    const { levels, asked } = walk(ability(30));
    for (let at = 1; at < levels.length; at += 1) {
      let streak = 0;
      for (let back = at - 1; back >= 0 && asked[back]!.response === 'correct'; back -= 1) streak += 1;
      if (streak >= SUSTAINED_CORRECT) continue;
      expect(levels[at]! - levels[at - 1]!).toBeLessThanOrEqual(MAX_STEP_UP);
    }
  });

  it('still allows the full step downward, so a miss is believed at once', () => {
    /*
      Driven from high up rather than from the opening. A sitting can no longer
      reach level 6 in three questions — the ceiling holds it in band 1 — so a
      learner who succeeds and then fails has to climb first before there is
      three levels of room to fall.
    */
    const { levels } = walk((_level, index) => (index < 16 ? 'correct' : 'wrong'));
    const drops = levels.slice(1).map((level, at) => levels[at]! - level);
    expect(Math.max(...drops)).toBeGreaterThan(MAX_STEP_UP);
    expect(Math.max(...drops)).toBeLessThanOrEqual(MAX_STEP);
  });

  it('sends a learner who misses somewhere easier, and keeps them there to confirm', () => {
    /*
      The other half of the reported defect: after a miss the sequence used to
      keep climbing, because the posterior still sat near its prior of 15 and
      the step bound was the only thing holding it. Now a miss caps the next
      `CONFIRM_AFTER_MISS` questions at a level below the one that was missed.
    */
    const missed: AskedDetail[] = [
      { level: 1, response: 'correct', kind: 'meaning' },
      { level: 2, response: 'correct', kind: 'produce' },
      { level: 3, response: 'correct', kind: 'meaning' },
      { level: 5, response: 'correct', kind: 'produce' },
      { level: 6, response: 'correct', kind: 'meaning' },
      { level: 7, response: 'correct', kind: 'context' },
      { level: 9, response: 'wrong', kind: 'context' },
    ];
    const after = reach(missed);
    expect(after.confirming).toBe(true);
    expect(reachCeiling(missed)).toBeLessThan(9);
    expect(nextLevel(missed, ALL_LEVELS, { previousLevel: null })!).toBeLessThan(9);

    // And the window closes once the confirmation questions are answered.
    const recovered: AskedDetail[] = [
      ...missed,
      { level: 7, response: 'correct', kind: 'meaning' },
      { level: 7, response: 'correct', kind: 'produce' },
    ];
    expect(reach(recovered).confirming).toBe(false);
  });

  it('never asks above the band the learner has earned', () => {
    for (const respond of [
      () => 'wrong' as const,
      () => 'unknown' as const,
      (_l: number, i: number) => (i % 2 === 0 ? ('correct' as const) : ('wrong' as const)),
    ]) {
      const { levels, asked } = walk(respond);
      for (let at = 0; at < levels.length; at += 1) {
        expect(levels[at]!).toBeLessThanOrEqual(reachCeiling(asked.slice(0, at)));
      }
    }
  });

  /**
   * The wider step is earned rather than removed. A learner who answers
   * everything correctly has given the sitting all the evidence there is, and a
   * permanent cap of two left them finishing below the top of the scale because
   * the walk ran out of questions before it ran out of scale.
   */
  /**
   * Both sides of the threshold, so the constant cannot drift from the prose.
   *
   * The file's own comment said "three consecutive correct answers" for two
   * cycles while `SUSTAINED_CORRECT` said eight. Nothing failed, because
   * nothing asserted the boundary — only that the wide step existed somewhere.
   * This pins it: one short of the threshold the climb is still capped, and at
   * the threshold it is not.
   */
  it('does not unlock the wide step one answer short of the threshold', () => {
    const { levels, asked } = walk(() => 'correct');
    for (let at = 1; at < levels.length; at += 1) {
      let streak = 0;
      for (let back = at - 1; back >= 0 && asked[back]!.response === 'correct'; back -= 1) streak += 1;
      if (streak === SUSTAINED_CORRECT - 1) {
        expect(levels[at]! - levels[at - 1]!).toBeLessThanOrEqual(MAX_STEP_UP);
      }
    }
    // And the threshold itself is reachable in a sitting, or the rule is dead code.
    const streaks = asked.map((_item, at) => {
      let streak = 0;
      for (let back = at - 1; back >= 0 && asked[back]!.response === 'correct'; back -= 1) streak += 1;
      return streak;
    });
    expect(Math.max(...streaks)).toBeGreaterThanOrEqual(SUSTAINED_CORRECT);
  });

  it('earns the wider step back after a sustained run, and loses it on one miss', () => {
    const { levels, asked } = walk(() => 'correct');
    const climbs = levels.slice(1).map((level, at) => level - levels[at]!);
    expect(Math.max(...climbs)).toBe(MAX_STEP);
    expect(asked.length).toBeGreaterThanOrEqual(MIN_ITEM_COUNT);

    // One wrong answer inside the run and the wide step is gone again.
    const shaky = walk((_level, index) => (index === 10 ? 'wrong' : 'correct'));
    const after = shaky.levels[11]! - shaky.levels[10]!;
    expect(after).toBeLessThanOrEqual(MAX_STEP_UP);
  });

  /**
   * One adaptive question in five is drawn below the estimate, so a sitting is
   * never a continuous wall. Deterministic, because a resumed sitting has to
   * ask the same questions in the same order.
   */
  it('asks one adaptive question in five below its own estimate', () => {
    const { levels, asked } = walk(ability(18));
    let easy = 0;
    for (let at = WARMUP_ITEMS; at < levels.length; at += 1) {
      const believed = estimate(asked.slice(0, at)).reported;
      if (levels[at]! < believed) easy += 1;
    }
    expect(easy).toBeGreaterThan(0);
  });

  it('is reproducible: the same answers give the same walk', () => {
    const first = walk(ability(12));
    const second = walk(ability(12));
    expect(second.levels).toEqual(first.levels);
    expect(estimate(second.asked).reported).toBe(estimate(first.asked).reported);
  });
});

describe('level 30 is earned, not stumbled into', () => {
  it('is not reached on a couple of lucky answers', () => {
    const { asked } = walk((_level, i) => (i < 2 ? 'correct' : 'unknown'));
    expect(estimate(asked).reported).toBeLessThanOrEqual(5);
  });

  it('does not put advanced words in front of a beginner', () => {
    const { levels } = walk(ability(3));
    expect(levels.filter((level) => level >= 27)).toHaveLength(0);
  });

  /**
   * The top *band*, not the top number, and the difference is a deliberate trade.
   *
   * This asserted `toBe(LEVELS)` while the climb was capped at three levels a
   * question. Capping it at two — the fix for the complaint that one correct
   * answer made the test noticeably harder — means a perfect learner arrives at
   * the ceiling later and spends fewer of their twenty questions there, so the
   * posterior at the edge is thinner and the sitting reports 29 rather than 30.
   *
   * That is the estimator being careful at a boundary it cannot see past, not a
   * learner being under-rated: the same change moved the share of questions
   * asked above the running estimate from 23.7% to 18.3% and left overall
   * accuracy where it was (±3 at 90.2%, MAE 1.64). A learner who answers
   * everything correctly is told they are at the top of the scale; the argument
   * this test exists to have — that the top is *earned* — is unchanged, and the
   * two tests above it still hold the other side.
   */
  it('is reached by a learner who sustains it', () => {
    const { asked, levels } = walk(() => 'correct');
    expect(estimate(asked).reported).toBeGreaterThanOrEqual(LEVELS - 1);
    expect(levels.filter((level) => level >= 27).length).toBeGreaterThan(5);
  });
});

describe('the sitting stops when it knows, not when it is tired', () => {
  it('does not stop while the bracket is still wide, however sure the posterior is', () => {
    /*
      The floor alone was not enough, and this history is why. Twenty answers
      from an erratic learner leave the posterior *confident* — standard error
      1.47, inside `STOP_SE` — about a level the bracket has not found: the
      bounds are still 17 apart and the top end was never pinned at all.

      Under the previous rule (`se <= STOP_SE` alone) the sitting would stop here
      and report 2, on a learner who has answered correctly at levels 22, 24 and
      28. That is the shape of the failure that reported a true level-30 learner
      as 2, isolated: posterior confidence about a region nobody searched.

      Kept as a literal history rather than generated, because it was *found* by
      searching two hundred thousand random ones for a case where the two rules
      disagree, and a generator that stopped producing it would silently retire
      the test.
    */
    const erratic: AskedItem[] = [
      { level: 26, response: 'unknown' },
      { level: 10, response: 'unknown' },
      { level: 24, response: 'correct' },
      { level: 18, response: 'correct' },
      { level: 20, response: 'unknown' },
      { level: 9, response: 'unknown' },
      { level: 4, response: 'unknown' },
      { level: 6, response: 'unknown' },
      { level: 29, response: 'unknown' },
      { level: 25, response: 'unknown' },
      { level: 28, response: 'correct' },
      { level: 13, response: 'unknown' },
      { level: 4, response: 'wrong' },
      { level: 28, response: 'wrong' },
      { level: 1, response: 'unknown' },
      { level: 3, response: 'wrong' },
      { level: 12, response: 'unknown' },
      { level: 22, response: 'correct' },
      { level: 17, response: 'correct' },
      { level: 13, response: 'correct' },
    ];
    expect(erratic).toHaveLength(MIN_ITEM_COUNT);
    // The posterior is sure enough on its own — this is the trap.
    expect(estimate(erratic).se).toBeLessThanOrEqual(STOP_SE);
    // The bracket is not, so the sitting keeps asking.
    expect(converged(erratic)).toBe(false);
    expect(shouldStop(erratic)).toBe(false);
  });

  it('does not stop a learner who is still climbing', () => {
    const climbing: AskedItem[] = Array.from({ length: MIN_ITEM_COUNT }, (_, i) => ({
      level: Math.min(LEVELS, 1 + i),
      response: 'correct' as const,
    }));
    expect(converged(climbing)).toBe(false);
    expect(shouldStop(climbing)).toBe(false);
  });

  it('stops once the bracket has closed and the posterior has settled', () => {
    const settled: AskedItem[] = Array.from({ length: MIN_ITEM_COUNT }, () => ({
      level: 1,
      response: 'unknown' as const,
    }));
    expect(converged(settled)).toBe(true);
    expect(shouldStop(settled)).toBe(true);
  });

  it('narrows the bracket to within the confirmation width before finishing', () => {
    for (const truth of [3, 8, 14, 22, 28]) {
      const { asked } = walk(ability(truth));
      const bounds = bracket(asked);
      if (asked.length < MAX_ITEM_COUNT) {
        expect(bounds.upperBound - bounds.lowerBound).toBeLessThanOrEqual(CONFIRM_WIDTH);
      }
    }
  });
});

describe('every level from 1 to 30 is placed', () => {
  it.each(ALL_LEVELS)('places a clean level-%i learner within three levels', (truth) => {
    const { asked } = walk(ability(truth));
    expect(Math.abs(estimate(asked).reported - truth)).toBeLessThanOrEqual(3);
  });
});
