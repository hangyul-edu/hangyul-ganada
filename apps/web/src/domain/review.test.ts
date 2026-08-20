import { describe, expect, it } from 'vitest';
import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { blankProgress } from '../storage/schema';
import { applyReview, memoryKey, type MemoryMap, type Skill } from './memory';
import {
  MAX_DAILY_REVIEWS,
  SESSION_SIZE,
  buildSession,
  candidates,
  insertRescue,
  priority,
  sessionOutcome,
  summarise,
  todaysPractice,
  weeklyInsights,
} from './review';
import { PROFILES, simulate } from './simulate';

const T0 = new Date('2026-03-01T09:00:00.000Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function learned(kind: ItemProgress['kind'], key: string): ItemProgress {
  return { ...blankProgress(kind, key, T0.toISOString()), stage: 'learned', learned: true };
}

function profile(...items: Array<[ItemProgress['kind'], string]>): Record<string, ItemProgress> {
  return Object.fromEntries(
    items.map(([kind, key]) => [memoryKey(kind, key), learned(kind, key)]),
  );
}

function practise(
  memory: MemoryMap,
  kind: ItemProgress['kind'],
  key: string,
  skill: Skill,
  day: number,
  passed = true,
  extra: { confusedWith?: string } = {},
): MemoryMap {
  const id = memoryKey(kind, key);
  return {
    ...memory,
    [id]: applyReview(
      memory[id],
      kind,
      key,
      { skill, passed, score: passed ? 1 : 0, ...extra },
      at(day),
    ),
  };
}

describe('priority', () => {
  it('puts a never-tested skill above one that was just practised', () => {
    const memory = practise({}, 'character', 'ㄱ', 'guided_writing', 0);
    const untested = priority(memory[memoryKey('character', 'ㄱ')], 'listening_recognition', at(0.1));
    const fresh = priority(memory[memoryKey('character', 'ㄱ')], 'guided_writing', at(0.1));
    expect(untested).toBeGreaterThan(fresh);
  });

  it('rises the longer something has been left', () => {
    const memory = practise({}, 'character', 'ㄱ', 'guided_writing', 0);
    const row = memory[memoryKey('character', 'ㄱ')];
    expect(priority(row, 'guided_writing', at(30))).toBeGreaterThan(
      priority(row, 'guided_writing', at(2)),
    );
  });

  it('falls steeply once an item has already appeared in this sitting', () => {
    const memory = practise({}, 'character', 'ㄱ', 'guided_writing', 0);
    const row = memory[memoryKey('character', 'ㄱ')];
    const first = priority(row, 'guided_writing', at(10), 0);
    expect(priority(row, 'guided_writing', at(10), 1)).toBeLessThan(first);
    expect(priority(row, 'guided_writing', at(10), 2)).toBeLessThan(
      priority(row, 'guided_writing', at(10), 1),
    );
  });
});

describe('building a sitting', () => {
  const items = profile(
    ['character', 'ㄱ'],
    ['character', 'ㄴ'],
    ['character', 'ㄷ'],
    ['character', 'ㄹ'],
    ['character', 'ㅁ'],
    ['character', 'ㅂ'],
  );

  it('is finite, and no longer than a sitting', () => {
    expect(buildSession(items, {}, T0).length).toBeLessThanOrEqual(SESSION_SIZE);
  });

  it('offers nothing for an item the learner has not met', () => {
    const unseen = { 'character:ㅎ': blankProgress('character', 'ㅎ', T0.toISOString()) };
    expect(buildSession(unseen, {}, T0)).toEqual([]);
  });

  it('never asks the same item twice in a row, even when it is the weakest', () => {
    // One item, badly known, and every other item strong. The naive scheduler
    // gives ㄹ ㄹ ㄹ ㄹ; the constraint is what stops it.
    let memory: MemoryMap = {};
    for (const key of ['ㄱ', 'ㄴ', 'ㄷ', 'ㅁ', 'ㅂ']) {
      for (const skill of ['guided_writing', 'visual_recognition', 'sound_recognition'] as Skill[]) {
        memory = practise(memory, 'character', key, skill, 0);
      }
    }
    const session = buildSession(items, memory, at(0.1));
    for (let i = 1; i < session.length; i += 1) {
      expect(session[i]!.itemKey).not.toBe(session[i - 1]!.itemKey);
    }
  });

  it('never runs three exercises of the same kind together', () => {
    const session = buildSession(items, {}, T0);
    for (let i = 2; i < session.length; i += 1) {
      const run = [session[i - 2]!.mode, session[i - 1]!.mode, session[i]!.mode];
      expect(new Set(run).size).toBeGreaterThan(1);
    }
  });

  it('honours a manual mode', () => {
    const session = buildSession(items, {}, T0, { mode: 'write' });
    expect(session.length).toBeGreaterThan(0);
    expect(session.every((candidate) => candidate.mode === 'write')).toBe(true);
  });

  it('honours a restricted set — the saved words', () => {
    const only = new Set([memoryKey('character', 'ㄷ')]);
    const session = buildSession(items, {}, T0, { only });
    expect(session.every((candidate) => candidate.itemKey === 'ㄷ')).toBe(true);
  });

  it('offers a discrimination drill only once a confusion is established', () => {
    let memory: MemoryMap = {};
    expect(
      buildSession(items, memory, T0).some((c) => c.mode === 'distinguish'),
    ).toBe(false);

    memory = practise(memory, 'character', 'ㄱ', 'visual_recognition', 0, false, {
      confusedWith: 'ㅋ',
    });
    memory = practise(memory, 'character', 'ㄱ', 'visual_recognition', 1, false, {
      confusedWith: 'ㅋ',
    });
    const drill = buildSession(items, memory, at(1.1)).find((c) => c.mode === 'distinguish');
    expect(drill?.partner).toBe('ㅋ');
  });
});

describe('the micro-rescue', () => {
  it('brings a failed item back later in the sitting, not immediately', () => {
    const session = buildSession(
      profile(['character', 'ㄱ'], ['character', 'ㄴ'], ['character', 'ㄷ'], ['character', 'ㄹ']),
      {},
      T0,
    );
    const failed = session[0]!;
    const next = insertRescue(session, 0, failed);
    expect(next[1]!.itemKey).not.toBe(failed.itemKey);
    const returnedAt = next.findIndex((c, i) => i > 0 && c.itemKey === failed.itemKey);
    expect(returnedAt).toBeGreaterThan(2);
  });
});

describe('what the Review screen says', () => {
  it('shows nothing on a first launch rather than a dashboard of zeroes', () => {
    const summary = summarise({}, {}, new Set(), T0);
    expect(summary).toMatchObject({ needsPractice: 0, dueToday: 0, total: 0 });
  });

  it('counts items that need attention, not items that exist', () => {
    /*
     * §21 and §32, and the reason this test changed.
     *
     * It used to assert that two learned characters produce a review count of
     * two — one per item, rather than one per skill — and the *shape* of that
     * was right while the premise was wrong. Having learned something is not a
     * reason to review it. At five hundred words the old rule produced a screen
     * reading "500 to review", which is a catalogue with a badge on it.
     *
     * Two characters just met, with no memory of them yet, need nothing: they
     * were learned a moment ago and are not fading. What they have is skills
     * never asked about, which the scheduler will broaden into and which are
     * deliberately not a number on a screen.
     */
    const items = profile(['character', 'ㄱ'], ['character', 'ㄴ']);
    expect(summarise(items, {}, new Set(), T0).total).toBe(0);

    // Once one of them has been asked and is fading, it is counted — once,
    // however many ways it could be asked.
    const fading = applyReview(
      undefined,
      'character',
      'ㄱ',
      { skill: 'visual_recognition', passed: true, score: 1 },
      new Date(T0.getTime() - 20 * 86_400_000),
    );
    const summary = summarise(items, { 'character:ㄱ': fading }, new Set(), T0);
    expect(summary.total).toBe(1);
    // `sessionSize` used to be here, as `min(SESSION_SIZE, pool.length)`. It
    // was the number the Review screen printed and it was a *guess* at what the
    // session would contain — which is how "8 questions" came to open an empty
    // page. The count now comes from a resolved plan, and is asserted against
    // the session it names in `plan.test.ts`.
    expect(summary.needsPractice + summary.dueToday).toBeGreaterThan(0);
  });

  it('reports saved words from the learner’s own list', () => {
    const saved = new Set([memoryKey('word', 'word_sagwa')]);
    expect(summarise({}, {}, saved, T0).saved).toBe(1);
  });
});

describe("today's practice", () => {
  it('is empty on day one rather than inventing something to do', () => {
    expect(todaysPractice({}, {}, 0, T0).empty).toBe(true);
  });

  it('caps review so the curriculum is never blocked by a backlog', () => {
    const many = profile(
      ...Array.from({ length: 40 }, (_, n) => ['word', `word_${n}`] as [ItemProgress['kind'], string]),
    );
    const plan = todaysPractice(many, {}, 3, T0);
    expect(plan.reviews).toBeLessThanOrEqual(MAX_DAILY_REVIEWS);
    expect(plan.lettersLeft).toBe(3);
  });
});

describe('the completion screen', () => {
  it('reports first-try successes and what is coming back, from real state', () => {
    const items = profile(['character', 'ㄱ']);
    const session = buildSession(items, {}, T0);
    let memory: MemoryMap = {};
    const results = session.slice(0, 2).map((candidate) => {
      memory = practise(memory, candidate.kind, candidate.itemKey, candidate.skill, 0);
      return { candidate, passed: true, hintLevel: 0, recovery: false };
    });
    const outcome = sessionOutcome(results, memory, T0);
    expect(outcome.practised).toBe(results.length);
    expect(outcome.firstTry).toBe(results.length);
    // Initial stability is a day and a half, so it is genuinely coming back.
    expect(outcome.comingBack).toBeGreaterThan(0);
  });

  it('does not count a recovered item as a first-try success', () => {
    const session = buildSession(profile(['character', 'ㄱ']), {}, T0);
    const outcome = sessionOutcome(
      [{ candidate: session[0]!, passed: true, hintLevel: 0, recovery: true }],
      {},
      T0,
    );
    expect(outcome.firstTry).toBe(0);
    expect(outcome.practised).toBe(1);
  });
});

describe('weekly insights', () => {
  it('says nothing without enough evidence to say it', () => {
    const attempts = Array.from({ length: 3 }, () => ({
      skill: 'guided_writing' as Skill,
      passed: true,
      hintUsed: false,
      at: T0.toISOString(),
    }));
    expect(weeklyInsights({}, attempts, at(0.5))).toEqual([]);
  });

  it('ignores anything older than the week it is reporting on', () => {
    const attempts = Array.from({ length: 20 }, () => ({
      skill: 'guided_writing' as Skill,
      passed: true,
      hintUsed: false,
      at: at(-30).toISOString(),
    }));
    expect(weeklyInsights({}, attempts, T0)).toEqual([]);
  });

  it('reports first-try recall once there is enough of it', () => {
    const attempts = Array.from({ length: 18 }, () => ({
      skill: 'meaning_recognition' as Skill,
      passed: true,
      hintUsed: false,
      at: at(-1).toISOString(),
    }));
    const insights = weeklyInsights({}, attempts, T0);
    expect(insights.some((insight) => insight.key === 'firstTry')).toBe(true);
  });
});

// --- The simulations of section 61 -------------------------------------------

const ITEMS: Array<{ kind: ItemProgress['kind']; key: string }> = [
  ...['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅎ', 'ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'].map(
    (key) => ({ kind: 'character' as const, key }),
  ),
  ...Array.from({ length: 12 }, (_, n) => ({ kind: 'word' as const, key: `word_${n}` })),
];

function runProfile(name: string, days = 60) {
  const found = PROFILES.find((p) => p.name === name);
  if (!found) throw new Error(`no profile named ${name}`);
  return simulate({ days, items: ITEMS, profile: found, seed: 20260301 });
}

describe('simulated learners', () => {
  it('A — a learner who is always correct ends up on long intervals', () => {
    const { adaptive } = runProfile('always correct');
    // The direct statement of "intervals grow steadily": by day sixty the mean
    // scheduled interval is weeks rather than the day and a half it started at.
    expect(adaptive.meanInterval).toBeGreaterThan(7);
    expect(adaptive.lateRate).toBeLessThan(0.05);
    expect(adaptive.chronic).toBeLessThan(6);
  });

  it('B — a learner who keeps failing gets short intervals and is flagged', () => {
    const easy = runProfile('always correct').adaptive;
    const hard = runProfile('repeatedly fails').adaptive;
    expect(hard.meanInterval).toBeLessThan(easy.meanInterval / 2);
    expect(hard.chronic).toBeGreaterThan(0);
  });

  it('C — a learner who reads well and listens badly gets more listening', () => {
    const { adaptive } = runProfile('reads well, listens badly');
    // More than a blind rotation would give it, which is what "responds to the
    // weakness" has to mean.
    expect(adaptive.weakSkillShare).toBeGreaterThan(adaptive.uniformShare * 1.3);
  });

  it('D — a learner who writes badly gets more guided writing', () => {
    const { adaptive } = runProfile('writes badly, recognises well');
    expect(adaptive.weakSkillShare).toBeGreaterThan(adaptive.uniformShare * 1.3);
  });

  it('E — a learner who confuses ㅓ and ㅗ is given the distinction to practise', () => {
    const found = PROFILES.find((p) => p.name === 'confuses ㅓ and ㅗ')!;
    let memory: MemoryMap = {};
    const items = profile(['character', 'ㅓ'], ['character', 'ㅗ'], ['character', 'ㄱ']);
    for (let n = 0; n < 3; n += 1) {
      memory = practise(memory, 'character', 'ㅓ', 'visual_recognition', n, false, {
        confusedWith: found.confuses!['ㅓ'],
      });
    }
    const session = buildSession(items, memory, at(3));
    const drill = session.find((c) => c.mode === 'distinguish');
    expect(drill).toBeDefined();
    expect(drill!.partner).toBe('ㅗ');
  });

  it('F — a learner who stops for 30 days comes back to a finite session', () => {
    const { adaptive } = runProfile('stops for 30 days', 60);
    // The backlog does not become the session. Whatever is due, a sitting is
    // still a sitting.
    expect(adaptive.worstRepetition).toBeLessThanOrEqual(2);
    expect(adaptive.asked / 30).toBeLessThanOrEqual(SESSION_SIZE);
  });

  it('G — a brand-new learner is shown nothing rather than meaningless zeroes', () => {
    const summary = summarise({}, {}, new Set(), T0);
    expect(summary.total).toBe(0);
    expect(candidates({}, {}, T0)).toEqual([]);
  });
});

// --- The comparison of section 69 --------------------------------------------

describe('against the fixed 1/3/7/21 scheduler it replaced', () => {
  /**
   * The claim, stated exactly.
   *
   * Under the forgetting model in `simulate.ts` — a model, not a measurement of
   * real people — and with the same number of exercises available per day, the
   * adaptive scheduler leaves the learner remembering **more of what they were
   * taught in total** after sixty days, for every one of the seven profiles.
   *
   * The measure is the *sum* of predicted recall over every item and skill, and
   * the choice of sum over mean is the whole honesty of the comparison. A mean
   * flatters the narrow scheduler: the fixed one exercises writing and nothing
   * else, so its per-covered-slot recall is excellent precisely because it
   * declined to teach four skills in five. The sum asks what a learner would
   * ask — how much do I still have — and counts the skills that were never
   * practised at zero, which is what they are worth.
   *
   * What is *not* claimed: that this is better than any other product's
   * scheduler, that these numbers describe a real person, or that a real
   * learner's memory is an exponential. See `docs/report.md`.
   */
  const profiles = PROFILES.map((p) => p.name);

  for (const name of profiles) {
    it(`${name}: the learner ends up remembering more, in total`, () => {
      const { adaptive, fixed } = runProfile(name);
      expect(adaptive.retainedTotal).toBeGreaterThan(fixed.retainedTotal);
    });
  }

  it('does not win by narrowing: per-skill retention is comparable', () => {
    const { adaptive, fixed } = runProfile('always correct');
    expect(adaptive.covered).toBeGreaterThan(fixed.covered * 3);
    expect(adaptive.retainedCovered).toBeGreaterThan(fixed.retainedCovered - 0.05);
  });

  it('exercises every skill, where the old scheduler could only write', () => {
    const { adaptive, fixed } = runProfile('always correct');
    expect(fixed.skillsExercised).toBe(1);
    expect(adaptive.skillsExercised).toBeGreaterThan(4);
  });

  it('finds chronic difficulty the old scheduler could not see', () => {
    // The old one can only notice an item being failed at *writing*. A learner
    // who cannot hear a word is invisible to it.
    const { adaptive, fixed } = runProfile('reads well, listens badly');
    expect(fixed.chronic).toBe(0);
    expect(adaptive.chronic).toBeGreaterThan(0);
  });

  it('never asks the same item three times in one sitting', () => {
    const { adaptive } = runProfile('repeatedly fails');
    expect(adaptive.worstRepetition).toBeLessThanOrEqual(2);
  });
});
