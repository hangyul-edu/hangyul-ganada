import { describe, expect, it } from 'vitest';
import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { blankProgress } from '../storage/schema';
import {
  CHARACTER_SKILLS,
  INITIAL_STABILITY,
  LEECH_LAPSES,
  REVIEW_ALGORITHM_VERSION,
  TARGET_RECALL,
  applyReview,
  blankMemory,
  confusionPartner,
  migrateMemory,
  needsIntervention,
  recallProbability,
  skillRecall,
  weakestSkill,
  type ItemMemory,
} from './memory';

/**
 * The memory model, tested against the behaviour it is supposed to produce
 * rather than against the numbers it happens to contain.
 *
 * That distinction matters for a file whose constants are meant to be
 * recalibrated: an assertion that a clean success multiplies stability by
 * exactly 2.2 would have to be rewritten every time the model improves, so the
 * suite would stop being evidence and start being maintenance. What is asserted
 * here is that a clean success grows the interval *more than* a hinted one,
 * that a failure brings it in without erasing it, and so on — the properties a
 * change is allowed to preserve and not allowed to break.
 */

const DAY = 86_400_000;
const T0 = new Date('2026-03-01T09:00:00.000Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);

function review(
  memory: ItemMemory | undefined,
  overrides: Partial<Parameters<typeof applyReview>[3]> & { day?: number } = {},
): ItemMemory {
  const { day = 0, ...outcome } = overrides;
  return applyReview(
    memory,
    'character',
    'ㄱ',
    { skill: 'guided_writing', passed: true, score: 1, ...outcome },
    at(day),
  );
}

describe('the forgetting curve', () => {
  it('is 1 at the moment of review and TARGET_RECALL one stability later', () => {
    expect(recallProbability(0, 4)).toBe(1);
    expect(recallProbability(4, 4)).toBeCloseTo(TARGET_RECALL, 6);
  });

  it('falls monotonically, and never to zero inside a lifetime', () => {
    let previous = 1;
    for (const days of [1, 2, 5, 10, 30, 100, 1000]) {
      const recall = recallProbability(days, 4);
      expect(recall).toBeLessThan(previous);
      expect(recall).toBeGreaterThan(0);
      previous = recall;
    }
  });

  it('is scaled by stability, so a stronger memory decays more slowly', () => {
    expect(recallProbability(7, 14)).toBeGreaterThan(recallProbability(7, 3));
  });
});

describe('the first demonstration of a skill', () => {
  it('starts conservatively, and grades how it went', () => {
    const clean = review(undefined, { score: 1 });
    const normal = review(undefined, { score: 0.91 });
    const helped = review(undefined, { score: 1, hintLevel: 1 });

    expect(clean.skills.guided_writing!.stability_days).toBe(INITIAL_STABILITY.clean);
    expect(normal.skills.guided_writing!.stability_days).toBe(INITIAL_STABILITY.normal);
    expect(helped.skills.guided_writing!.stability_days).toBe(INITIAL_STABILITY.assisted);
  });

  it('schedules the next review exactly one stability out', () => {
    const memory = review(undefined, { score: 1 });
    const skill = memory.skills.guided_writing!;
    const days = (Date.parse(skill.next_review_at) - T0.getTime()) / DAY;
    expect(days).toBeCloseTo(skill.stability_days, 6);
  });

  it('stamps the algorithm version, so a later model can tell what wrote it', () => {
    expect(review(undefined).algorithm_version).toBe(REVIEW_ALGORITHM_VERSION);
  });
});

describe('success', () => {
  it('grows the interval', () => {
    let memory = review(undefined);
    const first = memory.skills.guided_writing!.stability_days;
    memory = review(memory, { day: first });
    expect(memory.skills.guided_writing!.stability_days).toBeGreaterThan(first);
  });

  it('grows it more for a clean answer than for a scraped one', () => {
    const base = review(undefined, { score: 0.95 });
    const day = base.skills.guided_writing!.stability_days;
    const perfect = review(base, { day, score: 1 });
    const scraped = review(base, { day, score: 0.9 });
    expect(perfect.skills.guided_writing!.stability_days).toBeGreaterThan(
      scraped.skills.guided_writing!.stability_days,
    );
  });

  it('grows it less when a hint was used, without calling it a failure', () => {
    const base = review(undefined, { score: 0.95 });
    const day = base.skills.guided_writing!.stability_days;
    const unaided = review(base, { day });
    const helped = review(base, { day, hintLevel: 1 });

    expect(helped.skills.guided_writing!.stability_days).toBeGreaterThan(
      base.skills.guided_writing!.stability_days,
    );
    expect(helped.skills.guided_writing!.stability_days).toBeLessThan(
      unaided.skills.guided_writing!.stability_days,
    );
    expect(helped.skills.guided_writing!.lapses).toBe(0);
    expect(helped.skills.guided_writing!.hints).toBe(1);
  });

  it('grows it more when the answer was long overdue', () => {
    const base = review(undefined, { score: 0.95 });
    const due = base.skills.guided_writing!.stability_days;
    const onTime = review(base, { day: due });
    const late = review(base, { day: due * 4 });
    expect(late.skills.guided_writing!.stability_days).toBeGreaterThan(
      onTime.skills.guided_writing!.stability_days,
    );
  });

  it('grows it less for an item this learner keeps losing', () => {
    let hard = review(undefined);
    let easy = review(undefined);
    for (let n = 0; n < 3; n += 1) hard = review(hard, { day: n, passed: false, score: 0 });

    const day = 10;
    hard = review(hard, { day });
    easy = review(easy, { day });
    // Compared as a ratio, because the two have different starting points.
    expect(hard.skills.guided_writing!.difficulty).toBeGreaterThan(
      easy.skills.guided_writing!.difficulty,
    );
  });

  it('lets response time nudge the schedule, and only nudge it', () => {
    const base = applyReview(
      undefined,
      'character',
      'ㄱ',
      { skill: 'visual_recognition', passed: true, score: 1 },
      T0,
    );
    const day = base.skills.visual_recognition!.stability_days;
    const quick = applyReview(
      base,
      'character',
      'ㄱ',
      { skill: 'visual_recognition', passed: true, score: 1, responseMs: 800 },
      at(day),
    );
    const slow = applyReview(
      base,
      'character',
      'ㄱ',
      { skill: 'visual_recognition', passed: true, score: 1, responseMs: 40_000 },
      at(day),
    );
    const fast = quick.skills.visual_recognition!.stability_days;
    const dawdle = slow.skills.visual_recognition!.stability_days;
    expect(fast).toBeGreaterThan(dawdle);
    // Under 20%: someone who thought carefully must not be treated as someone
    // who got it wrong.
    expect(fast / dawdle).toBeLessThan(1.2);
  });

  it('never compares writing time against a recognition expectation', () => {
    const base = review(undefined);
    const day = base.skills.guided_writing!.stability_days;
    const slowDrawing = review(base, { day, responseMs: 40_000 });
    const noTiming = review(base, { day });
    // Ten seconds is a normal stroke. Writing has no timing expectation at all,
    // so the two are identical.
    expect(slowDrawing.skills.guided_writing!.stability_days).toBe(
      noTiming.skills.guided_writing!.stability_days,
    );
  });
});

describe('failure', () => {
  it('shortens the interval without erasing the memory', () => {
    let memory = review(undefined);
    for (let n = 1; n <= 4; n += 1) memory = review(memory, { day: n * 2 });
    const strong = memory.skills.guided_writing!.stability_days;

    memory = review(memory, { day: 20, passed: false, score: 0 });
    const after = memory.skills.guided_writing!;
    expect(after.stability_days).toBeLessThan(strong);
    expect(after.stability_days).toBeGreaterThan(0);
    expect(after.streak).toBe(0);
    expect(after.lapses).toBe(1);
  });

  it('cuts harder the more often the item has been lost', () => {
    // Built directly rather than played out, so the two rows differ in exactly
    // one thing: the lapse count. Playing them out would also give them
    // different stabilities, and the floor would then decide the answer.
    const after = (lapses: number): number => {
      const memory: ItemMemory = {
        ...blankMemory('character', 'ㄱ'),
        skills: {
          guided_writing: {
            skill: 'guided_writing',
            stability_days: 20,
            difficulty: 0.3,
            last_reviewed_at: T0.toISOString(),
            next_review_at: at(20).toISOString(),
            streak: 3,
            lapses,
            recent_score: 1,
            last_response_ms: null,
            hints: 0,
          },
        },
      };
      return review(memory, { day: 20, passed: false, score: 0 }).skills.guided_writing!
        .stability_days;
    };
    expect(after(4)).toBeLessThan(after(0));
  });

  it('cuts less when the attempt nearly passed', () => {
    const base = review(undefined);
    const day = 3;
    const nearMiss = review(base, { day, passed: false, score: 0.85 });
    const blank = review(base, { day, passed: false, score: 0 });
    expect(nearMiss.skills.guided_writing!.stability_days).toBeGreaterThan(
      blank.skills.guided_writing!.stability_days,
    );
  });
});

describe('the weakest skill', () => {
  it('is one that has never been demonstrated, over any that has', () => {
    const memory = review(undefined);
    const weakest = weakestSkill(memory, 'character', at(0.1));
    expect(weakest.skill).not.toBe('guided_writing');
    expect(weakest.recall).toBe(0);
  });

  it('is the faded one once every skill has been seen', () => {
    let memory: ItemMemory | undefined;
    for (const skill of CHARACTER_SKILLS) {
      memory = applyReview(memory, 'character', 'ㄱ', { skill, passed: true, score: 1 }, T0);
    }
    // Then one of them is practised again, three days later.
    memory = applyReview(
      memory,
      'character',
      'ㄱ',
      { skill: 'guided_writing', passed: true, score: 1 },
      at(3),
    );
    const weakest = weakestSkill(memory, 'character', at(3.1));
    expect(weakest.skill).not.toBe('guided_writing');
    expect(skillRecall(memory!.skills.guided_writing, at(3.1))).toBeGreaterThan(weakest.recall);
  });
});

describe('confusion', () => {
  it('records what was chosen instead, and needs a pattern before it acts', () => {
    let memory = applyReview(
      undefined,
      'character',
      'ㅓ',
      { skill: 'visual_recognition', passed: false, score: 0, confusedWith: 'ㅗ' },
      T0,
    );
    expect(confusionPartner(memory)).toBeNull();

    memory = applyReview(
      memory,
      'character',
      'ㅓ',
      { skill: 'visual_recognition', passed: false, score: 0, confusedWith: 'ㅗ' },
      at(1),
    );
    expect(confusionPartner(memory)).toBe('ㅗ');
  });

  it('names the one actually confused, not the one the design expected', () => {
    let memory = blankMemory('character', 'ㅓ');
    for (const [other, times] of [
      ['ㅕ', 1],
      ['ㅗ', 3],
    ] as const) {
      for (let n = 0; n < times; n += 1) {
        memory = applyReview(
          memory,
          'character',
          'ㅓ',
          { skill: 'visual_recognition', passed: false, score: 0, confusedWith: other },
          at(n),
        );
      }
    }
    expect(confusionPartner(memory)).toBe('ㅗ');
  });
});

describe('chronic difficulty', () => {
  it('is detected once repetition has demonstrably stopped working', () => {
    let memory = review(undefined);
    expect(needsIntervention(memory)).toBeNull();
    for (let n = 0; n < LEECH_LAPSES; n += 1) {
      memory = review(memory, { day: n, passed: false, score: 0 });
    }
    expect(needsIntervention(memory)).toBe('guided_writing');
  });

  it('is not triggered by lapses spread across different skills', () => {
    let memory: ItemMemory | undefined;
    for (const skill of CHARACTER_SKILLS) {
      memory = applyReview(memory, 'character', 'ㄱ', { skill, passed: false, score: 0 }, T0);
    }
    expect(needsIntervention(memory)).toBeNull();
  });
});

describe('migrating from the fixed-interval scheduler', () => {
  function legacy(overrides: Partial<ItemProgress>): ItemProgress {
    return {
      ...blankProgress('character', 'ㄱ', '2026-02-01T00:00:00.000Z'),
      stage: 'learned',
      learned: true,
      ...overrides,
    };
  }

  it('keeps the interval the learner had already earned', () => {
    const memory = migrateMemory(
      legacy({
        practice_passes: 4,
        last_attempted_at: '2026-02-20T09:00:00.000Z',
        review_due_at: '2026-03-13T09:00:00.000Z', // the 21-day rung
      }),
      T0,
    );
    expect(memory!.skills.guided_writing!.stability_days).toBeCloseTo(21, 3);
  });

  it('does not invent evidence for skills that were never tested', () => {
    const memory = migrateMemory(
      legacy({ practice_passes: 2, review_due_at: '2026-03-05T09:00:00.000Z' }),
      T0,
    );
    expect(Object.keys(memory!.skills)).toEqual(['guided_writing']);
    // Which means the scheduler will offer listening first, because it has
    // never seen the learner do it.
    expect(weakestSkill(memory!, 'character', T0).skill).not.toBe('guided_writing');
  });

  it('carries the failure history into difficulty', () => {
    const easy = migrateMemory(legacy({ practice_passes: 3, fails: 0 }), T0)!;
    const hard = migrateMemory(legacy({ practice_passes: 3, fails: 5 }), T0)!;
    expect(hard.skills.guided_writing!.difficulty).toBeGreaterThan(
      easy.skills.guided_writing!.difficulty,
    );
  });

  it('credits a recognition pass to recognition rather than to writing', () => {
    const memory = migrateMemory(
      legacy({ kind: 'word', item_key: 'word_sagwa', practice_passes: 1, recognition_passes: 2 }),
      T0,
    )!;
    expect(memory.skills.reading_recognition).toBeDefined();
    expect(memory.skills.listening_recognition).toBeUndefined();
  });

  it('produces nothing for a row with no history at all', () => {
    expect(migrateMemory(blankProgress('character', 'ㅎ', T0.toISOString()), T0)).toBeNull();
  });

  it('does not touch mastery — a review is not a demotion', () => {
    const row = legacy({ practice_passes: 3, fails: 4, needs_review: true });
    migrateMemory(row, T0);
    expect(row.stage).toBe('learned');
    expect(row.learned).toBe(true);
  });
});
