import { describe, expect, it } from 'vitest';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import raw from '../data/generated/vocabulary.json';
import { buildDailyPlan, planIsCurrent } from './vocabularyDay';
import { planNewWords, teachingZone, wordLevel } from './vocabularyLevel';

/**
 * Does the learner's level change what the learner is taught?
 *
 * ## Why this is a fixture and not a metric
 *
 * `npm run vocabulary:recommendation:qa` simulates thirty thousand events and
 * prints distributions. This is the same question asked in four lines that fail
 * the build, because the defect it guards against is one a distribution can be
 * green through: before this pass, a learner at 15 and a learner at 20 received
 * an *identical* list, and a learner at 30 saw 82 distinct words in a thousand
 * draws. Every unit test in the suite passed the whole time. The level was
 * computed by bucketing a frequency rank against a 10,635-word scale on a
 * 2,916-word corpus, so levels 15–29 held nothing and everybody above 14 fell
 * into the same bucket.
 *
 * So the assertions below are the ones that would have caught it: the medians
 * of four learners' words must strictly increase, and the two ends of the scale
 * must not overlap at all.
 *
 * ## Why the real corpus
 *
 * A synthetic corpus with one word per level would pass this test with the
 * broken code in place, because the bug was in how real levels were assigned
 * rather than in how a level is used. It reads the built file.
 */
const CORPUS = (raw as unknown as { words: VocabularyWord[] }).words;

const LEARNERS = [1, 10, 20, 30] as const;
const DAYS = 10;
const PER_DAY = 10;

/**
 * Ten days of recommendations for one learner, deterministic in the seed.
 *
 * `isMet` accumulates, so this is a learner who actually learns what they are
 * given rather than a sampler drawing from an infinite bag. That matters: it is
 * the only way the pool can run out, and running out is the case where the
 * old code quietly reached down the scale.
 */
function tenDays(level: number): { words: VocabularyWord[]; shortfall: number } {
  const met = new Set<string>();
  const out: VocabularyWord[] = [];
  let shortfall = 0;
  for (let day = 0; day < DAYS; day += 1) {
    const { words, deficits } = planNewWords({
      corpus: CORPUS,
      level,
      seed: 'fixture',
      dayIndex: day,
      count: PER_DAY,
      isMet: (id) => met.has(id),
      isRecent: () => false,
    });
    for (const word of words) met.add(word.id);
    out.push(...words);
    shortfall += deficits.reduce((sum, deficit) => sum + deficit.short, 0);
  }
  return { words: out, shortfall };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe('a learner is taught from their own level', () => {
  const runs = new Map(LEARNERS.map((level) => [level, tenDays(level)]));
  const plans = new Map([...runs].map(([level, run]) => [level, run.words]));

  it('fills ten days for every learner the corpus can supply', () => {
    // 10, 20 and 30 have hundreds of words inside their zones. Level 1 does
    // not — its zone is levels 1–2, and the whole corpus holds 93 of those.
    for (const level of [10, 20, 30] as const) {
      expect(plans.get(level), `learner ${level}`).toHaveLength(DAYS * PER_DAY);
      expect(runs.get(level)?.shortfall, `learner ${level}`).toBe(0);
    }
  });

  it('runs short and says so, rather than reaching down the scale', () => {
    /*
      The bottom of the scale is the one place a hundred distinct words cannot
      be found, and what happens there is the whole point of this file.

      The previous planner walked outward across all thirty levels until it
      found something, so a learner placed at 25 was handed level-14 vocabulary
      and nothing anywhere said so. This one stops one level outside the zone
      and returns the gap as a deficit. A short day is visible; a silently
      widened range is not.
    */
    const run = runs.get(1);
    expect(run?.words.length).toBeLessThan(DAYS * PER_DAY);
    expect(run?.shortfall).toBe(DAYS * PER_DAY - (run?.words.length ?? 0));
  });

  it('never looks more than one level outside the teaching zone', () => {
    for (const level of LEARNERS) {
      const zone = teachingZone(level);
      for (const word of plans.get(level) ?? []) {
        const at = wordLevel(word);
        expect(at, `${word.word} for learner ${level}`).toBeGreaterThanOrEqual(zone.min - 1);
        expect(at, `${word.word} for learner ${level}`).toBeLessThanOrEqual(zone.max + 1);
      }
    }
  });

  it('raises the median difficulty with every step up the scale', () => {
    const medians = LEARNERS.map((level) => ({
      level,
      value: median((plans.get(level) ?? []).map(wordLevel)),
    }));
    medians.reduce((lower, here) => {
      expect(here.value, `learner ${here.level} vs ${lower.level}`).toBeGreaterThan(lower.value);
      return here;
    });
  });

  it('teaches a learner at 1 and a learner at 30 no word in common', () => {
    const beginner = new Set((plans.get(1) ?? []).map((word) => word.id));
    const advanced = (plans.get(30) ?? []).filter((word) => beginner.has(word.id));
    expect(advanced.map((word) => word.word)).toEqual([]);
  });

  it('gives each learner a different list from the next one up', () => {
    LEARNERS.reduce((lower, here) => {
      const previous = new Set((plans.get(lower) ?? []).map((word) => word.id));
      const shared = (plans.get(here) ?? []).filter((word) => previous.has(word.id));
      // Adjacent zones overlap by design — 60/20/20 — but a tenth of a
      // hundred-word plan is the most that can be shared nine levels apart.
      expect(shared.length, `${lower} vs ${here}`).toBeLessThan(10);
      return here;
    });
  });
});

/**
 * The day a learner actually gets, at the level the test measured.
 *
 * ## The report
 *
 * A learner sat the Vocabulary Level Test, came out at **30**, opened Today's
 * Vocabulary and was taught 남자. 남자 is a level-1 noun; there is no reading of
 * the level model on which it belongs in an advanced learner's new material.
 *
 * ## What it was
 *
 * Not the level model and not `planNewWords`, both of which were correct: the
 * search window for a learner at 30 is levels 27–30 and 남자 cannot come out of
 * it. It was the *plan cache*. A `DailyPlan` was identified by its date and its
 * goal, so the plan built when the app first opened — before the test, at the
 * default level — was still "current" afterwards. Every new learner meets this,
 * because sitting the test is something you do after opening the app for the
 * first time, which is exactly when a default-level plan has just been written.
 *
 * The two tests below are the two halves: the plan must not be reused across a
 * change of level, and the plan built at 30 must actually be advanced.
 */
describe("the day a learner is given matches the level they were measured at", () => {
  const NO_PROGRESS: Record<string, never> = {};

  function planAt(level: number) {
    return buildDailyPlan({
      progress: NO_PROGRESS,
      memory: {},
      corpus: CORPUS,
      goal: 10,
      now: new Date('2026-08-24T09:00:00Z'),
      level,
      seed: 'learner',
      dayIndex: 0,
    });
  }

  it('does not hand a level-30 learner beginner vocabulary', () => {
    const plan = planAt(30);
    const byId = new Map(CORPUS.map((word) => [word.id, word]));
    const chosen = plan.words.map((planned) => byId.get(planned.wordId)!);
    expect(chosen).toHaveLength(10);
    for (const word of chosen) {
      expect(wordLevel(word), `${word.word} for a learner at 30`).toBeGreaterThanOrEqual(27);
    }
    // The word from the report, by name, because that is what was reported.
    expect(chosen.map((word) => word.word)).not.toContain('남자');
  });

  it('does not hand a level-1 learner advanced vocabulary', () => {
    const byId = new Map(CORPUS.map((word) => [word.id, word]));
    for (const planned of planAt(1).words) {
      const word = byId.get(planned.wordId)!;
      expect(wordLevel(word), `${word.word} for a learner at 1`).toBeLessThanOrEqual(3);
    }
  });

  it('refuses to reuse a plan built at another level', () => {
    const now = new Date('2026-08-24T09:00:00Z');
    const beginner = planAt(1);
    // Same day, same goal, and the learner has since been measured at 30.
    expect(planIsCurrent(beginner, now, 1)).toBe(true);
    expect(planIsCurrent(beginner, now, 30)).toBe(false);
  });

  it('keeps a plan written before plans carried a level', () => {
    const now = new Date('2026-08-24T09:00:00Z');
    const { level: _dropped, ...old } = planAt(12);
    expect(planIsCurrent(old, now, 30)).toBe(true);
  });
});
