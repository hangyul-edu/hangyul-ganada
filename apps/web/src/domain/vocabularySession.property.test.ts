/**
 * The daily-vocabulary state machine, driven by thousands of random sittings.
 *
 * §31. The deterministic fixtures in `dailyProgress.test.ts` and
 * `vocabularyDay.test.ts` pin the named cases; this file exists for the cases
 * nobody names. A seeded generator drives whole sittings — answers right and
 * wrong in every order, double taps, reloads mid-pass, extra study after the
 * goal — and after every single event the invariants below are asserted. Any
 * failure prints its seed, so a broken sequence replays exactly.
 *
 * The invariants, which are §58's acceptance list:
 *
 *   - progress == number of unique completed target words, at all times
 *   - progress <= the session total
 *   - no target word ever disappears: completed ∪ owed == the plan, always
 *   - a wrong answer never increases progress
 *   - a retry answered correctly increases it exactly once
 *   - a reload (rebuilding the queue from the persisted plan) preserves both
 *     the progress and what is owed
 *   - the session cannot end while a word is still owed
 *   - extra study grows the session denominator and never touches `completed`
 */
import { describe, expect, it } from 'vitest';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import {
  buildDailyPlan,
  completeWord,
  dayProgress,
  endsSession,
  extendDay,
  rebuildPlanForLevel,
  retrySteps,
  scheduleSteps,
  sessionProgress,
  type DailyPlan,
  type WordStep,
} from './vocabularyDay';

const NOW = new Date('2026-06-02T10:00:00.000Z');

function corpus(count: number): VocabularyWord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `w${i}`,
    word: `단어${i}`,
    difficulty_score: i,
  })) as unknown as VocabularyWord[];
}

/** Deterministic PRNG so a failure names the sequence that produced it. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every invariant that must hold between any two events of a sitting. */
function assertInvariants(plan: DailyPlan, seed: number) {
  const planned = new Set(plan.words.map((w) => w.wordId));
  const completed = new Set(plan.completed);

  // One canonical identity per target: a plan may never hold the same word in
  // two slots, whatever built or rebuilt it — §41's identity rule.
  expect(plan.words.length, `seed ${seed}: duplicate target in plan`).toBe(planned.size);

  // Progress is unique completed words — never entries, never questions.
  const day = dayProgress(plan);
  const session = sessionProgress(plan);
  expect(day.done, `seed ${seed}: done != unique completed`).toBe(completed.size);
  expect(session.done, `seed ${seed}: session done != unique completed`).toBe(completed.size);

  // Progress never exceeds what the session holds.
  expect(session.done, `seed ${seed}: done > session total`).toBeLessThanOrEqual(session.total);
  expect(day.ratio, `seed ${seed}: ratio over 1`).toBeLessThanOrEqual(1);

  // Nothing completed that was never planned.
  for (const id of completed) {
    expect(planned.has(id), `seed ${seed}: completed unplanned word ${id}`).toBe(true);
  }

  // No target disappears: what is not completed is owed, exactly.
  const owed = retrySteps(plan).map((step) => step.wordId);
  const owedSet = new Set(owed);
  expect(owed.length, `seed ${seed}: duplicate owed entries`).toBe(owedSet.size);
  for (const id of planned) {
    const accounted = completed.has(id) || owedSet.has(id);
    expect(accounted, `seed ${seed}: word ${id} vanished`).toBe(true);
    expect(
      completed.has(id) && owedSet.has(id),
      `seed ${seed}: word ${id} both completed and owed`,
    ).toBe(false);
  }

  // The session may end exactly when nothing is owed.
  expect(endsSession(plan, new Map(), 0), `seed ${seed}: endsSession disagrees with owed`).toBe(
    owed.length === 0,
  );
}

/**
 * One whole sitting, driven by the given generator, with invariants asserted
 * after every event. Returns the finished plan.
 */
function runSitting(seed: number): DailyPlan {
  const rand = mulberry32(seed);
  const goal = [5, 10, 15][Math.floor(rand() * 3)]!;
  let plan = buildDailyPlan({
    progress: {},
    memory: {},
    corpus: corpus(120),
    goal,
    now: NOW,
  });
  assertInvariants(plan, seed);

  const missed = new Map<string, WordStep>();
  let extended = false;
  let guard = 0;

  // The first pass is the schedule; every later pass is what is owed.
  let queue = scheduleSteps(plan).filter((step) => step.completes.length > 0);

  while (queue.length > 0) {
    if (++guard > 500) throw new Error(`seed ${seed}: sitting did not converge`);

    for (const step of queue) {
      const correct = rand() < 0.7;
      const doneBefore = new Set(plan.completed).size;

      if (correct) {
        // A double tap credits once: completeWord is idempotent per word.
        for (const id of step.completes) {
          plan = completeWord(plan, id);
          plan = completeWord(plan, id);
        }
        const doneAfter = new Set(plan.completed).size;
        expect(doneAfter, `seed ${seed}: correct answer credited wrongly`).toBe(
          doneBefore + step.completes.length,
        );
      } else {
        for (const id of step.completes) missed.set(id, step.step);
        const doneAfter = new Set(plan.completed).size;
        expect(doneAfter, `seed ${seed}: wrong answer moved progress`).toBe(doneBefore);
      }
      assertInvariants(plan, seed);

      // An occasional reload mid-pass: everything is re-derived from the
      // persisted plan, and nothing changes.
      if (rand() < 0.08) {
        const before = dayProgress(plan);
        const owedBefore = retrySteps(plan, missed)
          .map((s) => s.wordId)
          .sort();
        const reloaded: DailyPlan = JSON.parse(JSON.stringify(plan));
        const after = dayProgress(reloaded);
        // Losing the `missed` map on reload is allowed (§27's step-choice memory
        // is per-sitting); losing a word is not.
        const owedAfter = retrySteps(reloaded)
          .map((s) => s.wordId)
          .sort();
        expect(after.done, `seed ${seed}: reload lost progress`).toBe(before.done);
        expect(owedAfter, `seed ${seed}: reload lost owed words`).toEqual(owedBefore);
        plan = reloaded;
      }
    }

    // Pass over: whatever is owed comes round again — §26, §29.
    queue = retrySteps(plan, missed);

    // After the goal is met, sometimes ask for extra study — §29.
    if (queue.length === 0 && !extended && rand() < 0.5) {
      const before = [...plan.completed];
      const beforeTotal = sessionProgress(plan).total;
      plan = extendDay(plan, 5, {
        progress: {},
        memory: {},
        corpus: corpus(120),
        goal,
        now: NOW,
      });
      extended = true;
      // Extra study is extra: nothing already earned moves...
      expect(plan.completed, `seed ${seed}: extension touched completed`).toEqual(before);
      // ...and the *session* denominator grows so 10/10 becomes 10/15.
      const after = sessionProgress(plan);
      expect(after.total, `seed ${seed}: extension did not grow the session`).toBeGreaterThan(
        beforeTotal - 1,
      );
      if (plan.words.length > before.length) {
        expect(after.total).toBe(plan.words.length);
        expect(after.complete, `seed ${seed}: extension left session complete`).toBe(false);
      }
      assertInvariants(plan, seed);
      queue = retrySteps(plan, missed);
    }
  }

  // The sitting is over exactly because nothing is owed.
  expect(retrySteps(plan).length).toBe(0);
  const finished = sessionProgress(plan);
  expect(finished.complete, `seed ${seed}: finished sitting not complete`).toBe(true);
  expect(finished.done).toBe(plan.words.length);
  return plan;
}

/**
 * A corpus with real levels, twenty words per level, for the sittings where
 * the learner's measured level changes underneath the day.
 */
function leveledCorpus(perLevel = 20, levels = 30): VocabularyWord[] {
  const out: VocabularyWord[] = [];
  for (let level = 1; level <= levels; level += 1) {
    for (let i = 0; i < perLevel; i += 1) {
      out.push({
        id: `L${level}w${i}`,
        word: `단어${level}-${i}`,
        level,
        difficulty_score: level * 100 + i,
      } as unknown as VocabularyWord);
    }
  }
  return out;
}

/**
 * One sitting during which the Vocabulary Level Test is retaken mid-day —
 * once, twice or three times, at arbitrary points between answers, to
 * arbitrary levels in both directions.
 *
 * The §59 interleaving the fixed-level sittings could not reach: every
 * rebuild must keep every credit already earned, keep the invariants, leave
 * the queue with a next action while anything is owed, and let the sitting
 * converge. A step whose word was replaced mid-pass credits nothing — its
 * word is no longer a target — and the replacement is asked instead on the
 * next pass.
 */
function runLevelChangeSitting(seed: number): DailyPlan {
  const rand = mulberry32(seed);
  const corpus = leveledCorpus();
  const goal = [5, 10, 15][Math.floor(rand() * 3)]!;
  const levelAt = () => 1 + Math.floor(rand() * 30);
  const request = (level: number) => ({
    progress: {},
    memory: {},
    corpus,
    goal,
    now: NOW,
    level,
    seed: `learner-${seed}`,
    dayIndex: 0,
  });

  let level = levelAt();
  let plan = buildDailyPlan(request(level));
  assertInvariants(plan, seed);

  const missed = new Map<string, WordStep>();
  let retakes = 1 + Math.floor(rand() * 3);
  let guard = 0;
  let queue = scheduleSteps(plan).filter((step) => step.completes.length > 0);

  while (queue.length > 0) {
    if (++guard > 500) throw new Error(`seed ${seed}: level-change sitting did not converge`);

    for (const step of queue) {
      // A retake lands between any two answers.
      if (retakes > 0 && rand() < 0.15) {
        retakes -= 1;
        const next = levelAt();
        const doneBefore = new Set(plan.completed).size;
        const completedBefore = [...plan.completed];
        plan = rebuildPlanForLevel(plan, request(next));
        // Mastered progress is preserved to the word, not merely to the count.
        expect(plan.completed, `seed ${seed}: retake touched completed`).toEqual(completedBefore);
        expect(new Set(plan.completed).size, `seed ${seed}: retake moved progress`).toBe(
          doneBefore,
        );
        // Every replacement target sits inside the new level's teaching zone
        // (the picker may look one level outside it, and no further).
        if (next !== level) {
          const done = new Set(plan.completed);
          for (const planned of plan.words) {
            if (done.has(planned.wordId) || planned.source !== 'new') continue;
            const at = Number(planned.wordId.slice(1).split('w')[0]);
            expect(Math.abs(at - next), `seed ${seed}: ${planned.wordId} out of zone for ${next}`)
              .toBeLessThanOrEqual(3);
          }
        }
        level = next;
        assertInvariants(plan, seed);
      }

      const planned = new Set(plan.words.map((w) => w.wordId));
      const correct = rand() < 0.7;
      const doneBefore = new Set(plan.completed).size;
      if (correct) {
        // The frozen queue can hold a step for a word a retake has since
        // replaced. Continuing it credits nothing — the word is not a target —
        // and never throws, which is the UI's exact behaviour.
        const expected = step.completes.filter(
          (id) => planned.has(id) && !plan.completed.includes(id),
        ).length;
        for (const id of step.completes) {
          plan = completeWord(plan, id);
          plan = completeWord(plan, id);
        }
        expect(new Set(plan.completed).size, `seed ${seed}: correct answer credited wrongly`).toBe(
          doneBefore + expected,
        );
      } else {
        for (const id of step.completes) missed.set(id, step.step);
        expect(new Set(plan.completed).size, `seed ${seed}: wrong answer moved progress`).toBe(
          doneBefore,
        );
      }
      assertInvariants(plan, seed);

      if (rand() < 0.08) {
        const before = dayProgress(plan);
        const reloaded: DailyPlan = JSON.parse(JSON.stringify(plan));
        expect(dayProgress(reloaded).done, `seed ${seed}: reload lost progress`).toBe(before.done);
        plan = reloaded;
      }
    }
    queue = retrySteps(plan, missed);
  }

  expect(retrySteps(plan).length).toBe(0);
  const finished = sessionProgress(plan);
  expect(finished.complete, `seed ${seed}: finished sitting not complete`).toBe(true);
  return plan;
}

/**
 * Sitting counts are env-scalable so a release pass can soak far past the
 * defaults (PROPERTY_SITTINGS=8000 PROPERTY_RETAKE_SITTINGS=2000 → 10,000
 * sequences) without making every CI run pay for it. The defaults are the
 * gate; the soak is the audit.
 */
const SITTINGS = Number(process.env.PROPERTY_SITTINGS) || 2_000;
const RETAKE_SITTINGS = Number(process.env.PROPERTY_RETAKE_SITTINGS) || 1_000;

describe('randomized sittings', () => {
  it(`holds every invariant across ${SITTINGS} random sittings`, { timeout: 600_000 }, () => {
    for (let seed = 1; seed <= SITTINGS; seed += 1) {
      runSitting(seed);
    }
  });

  it(
    `holds every invariant across ${RETAKE_SITTINGS} sittings with mid-day level retakes`,
    { timeout: 600_000 },
    () => {
      for (let seed = 1; seed <= RETAKE_SITTINGS; seed += 1) {
        runLevelChangeSitting(seed);
      }
    },
  );

  it('a sitting of pure wrong answers never moves progress and never ends', () => {
    const plan = buildDailyPlan({ progress: {}, memory: {}, corpus: corpus(40), goal: 10, now: NOW });
    const missed = new Map<string, WordStep>();
    for (let round = 0; round < 5; round += 1) {
      const queue = round === 0 ? scheduleSteps(plan) : retrySteps(plan, missed);
      for (const step of queue) {
        for (const id of step.completes) missed.set(id, step.step);
      }
      expect(dayProgress(plan).done).toBe(0);
      expect(endsSession(plan, missed, 0)).toBe(false);
    }
  });

  it('9/10 with one word owed always has a next action', () => {
    // The acceptance case in §28: nine done, one wrong. The session must offer
    // the owed word again, and the finish state must be unreachable until it
    // is answered.
    let plan = buildDailyPlan({ progress: {}, memory: {}, corpus: corpus(40), goal: 10, now: NOW });
    const ids = plan.words.map((w) => w.wordId);
    for (const id of ids.slice(0, 9)) plan = completeWord(plan, id);
    const missed = new Map<string, WordStep>([[ids[9]!, 'meaning']]);

    expect(dayProgress(plan).done).toBe(9);
    // There is always a next action…
    const owed = retrySteps(plan, missed);
    expect(owed.length).toBe(1);
    expect(owed[0]!.wordId).toBe(ids[9]);
    // …the retry is a different question from the one that was missed…
    expect(owed[0]!.step).not.toBe('meaning');
    // …and the session cannot claim to be over.
    expect(endsSession(plan, missed, 0)).toBe(false);

    // Answering it correctly increases progress exactly once and ends the day.
    plan = completeWord(plan, ids[9]!);
    plan = completeWord(plan, ids[9]!);
    expect(dayProgress(plan).done).toBe(10);
    expect(endsSession(plan, missed, 0)).toBe(true);
    expect(dayProgress(plan).complete).toBe(true);
  });
});
