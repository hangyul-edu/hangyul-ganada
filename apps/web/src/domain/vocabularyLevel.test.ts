import { describe, expect, it } from 'vitest';
import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import raw from '../data/generated/vocabulary.json';
import {
  buildDailyPlan,
  extendDay,
  planIsCurrent,
  rebuildPlanForLevel,
  type DailyPlan,
  type DayRequest,
} from './vocabularyDay';
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
function tenDays(level: number, days: number = DAYS): { words: VocabularyWord[]; shortfall: number } {
  const met = new Set<string>();
  const out: VocabularyWord[] = [];
  let shortfall = 0;
  for (let day = 0; day < days; day += 1) {
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
    // 10, 20 and 30 have hundreds of words inside their zones. Level 1 is the
    // thin end — its zone is levels 1–2 and the reachable pool is around a
    // hundred words — so it is checked by the deficit test below instead.
    for (const level of [10, 20, 30] as const) {
      expect(plans.get(level), `learner ${level}`).toHaveLength(DAYS * PER_DAY);
      expect(runs.get(level)?.shortfall, `learner ${level}`).toBe(0);
    }
  });

  it('runs short and says so, rather than reaching down the scale', () => {
    /*
      The bottom of the scale is the one place the pool is small enough to
      empty, and what happens when it empties is the whole point of this file.

      The previous planner walked outward across all thirty levels until it
      found something, so a learner placed at 25 was handed level-14 vocabulary
      and nothing anywhere said so. This one stops one level outside the zone
      and returns the gap as a deficit. A short day is visible; a silently
      widened range is not.

      ## Why the demand is named here and not taken from DAYS

      This assertion used to be `tenDays(1).words.length < 100`, and it was
      true because level 1's reachable pool held 93 words. Growing the corpus
      to 3,221 took that pool to 102, the ten days filled, and a test whose
      subject is *what happens when the pool empties* failed for the one reason
      that is not a defect: the pool no longer empties in ten days.

      A test that a content change can invert was measuring the corpus, not the
      planner. So the demand is set past whatever the pool holds — thirty days
      against a bottom-of-scale zone — and the assertion is the invariant it
      always meant: every word still comes from inside the zone, and the gap
      between what was asked for and what arrived is reported rather than
      filled from somewhere else.
    */
    const HUNGRY_DAYS = 30;
    const run = tenDays(1, HUNGRY_DAYS);
    const asked = HUNGRY_DAYS * PER_DAY;
    expect(run.words.length).toBeLessThan(asked);
    expect(run.shortfall).toBe(asked - run.words.length);
    const zone = teachingZone(1);
    for (const word of run.words) {
      expect(wordLevel(word), word.word).toBeGreaterThanOrEqual(zone.min - 1);
      expect(wordLevel(word), word.word).toBeLessThanOrEqual(zone.max + 1);
    }
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

  it('refuses a mismatched plan even when the day has been started', () => {
    /*
     * The negative test for the retired "new level tomorrow" rule. The old
     * `planIsCurrent` kept a stale-level plan alive the moment it had any
     * completed word in it — which is precisely the reported journey: study
     * three beginner words, be measured at 30, and be taught 엄마 anyway.
     * A measured level change invalidates the plan whatever its progress;
     * preserving the progress is `rebuildPlanForLevel`'s job, not this one's.
     */
    const now = new Date('2026-08-24T09:00:00Z');
    const beginner = planAt(1);
    const started = { ...beginner, completed: [beginner.words[0]!.wordId] };
    expect(planIsCurrent(started, now, 30)).toBe(false);
  });

  it('keeps a plan written before plans carried a level', () => {
    const now = new Date('2026-08-24T09:00:00Z');
    const { level: _dropped, ...old } = planAt(12);
    expect(planIsCurrent(old, now, 30)).toBe(true);
  });
});

/**
 * The mid-day level change, end to end at the domain layer.
 *
 * The canonical rule this pass installed: **a measured vocabulary-level change
 * immediately invalidates the unresolved level-dependent portion of Today's
 * Vocabulary; already mastered progress is preserved; remaining ordinary
 * new-study targets are regenerated for the new level.** The old rule — a
 * retake mid-day leaves today's words as they were, the new level being "a
 * fact about tomorrow" — is retired, and these fixtures are the ones that fail
 * if it returns.
 *
 * Every fixture runs against the real corpus, because the defect it guards was
 * only visible in real levels: a synthetic corpus with a word per level cannot
 * tell 남자 from 새옹지마.
 */
describe('a mid-day level change replaces what is owed and keeps what is earned', () => {
  const byId = new Map(CORPUS.map((word) => [word.id, word]));
  const NOW = new Date('2026-08-24T09:00:00Z');

  function request(level: number, progress: DayRequest['progress'] = {}): DayRequest {
    return {
      progress,
      memory: {},
      corpus: CORPUS,
      goal: 10,
      now: NOW,
      level,
      seed: 'learner',
      dayIndex: 0,
    };
  }

  function planAt(level: number, progress: DayRequest['progress'] = {}): DailyPlan {
    return buildDailyPlan(request(level, progress));
  }

  /** The first `n` planned words marked complete, as a started day. */
  function started(plan: DailyPlan, n: number): DailyPlan {
    return { ...plan, completed: plan.words.slice(0, n).map((word) => word.wordId) };
  }

  const levelOf = (id: string) => wordLevel(byId.get(id)!);
  const BEGINNER_FILLER = ['남자', '여자', '엄마', '아빠', '나', '너'];

  it('A: an untouched Level-1 day retaken to 30 serves only the advanced zone', () => {
    const rebuilt = rebuildPlanForLevel(planAt(1), request(30));
    expect(rebuilt.level).toBe(30);
    expect(rebuilt.words).toHaveLength(10);
    const zone = teachingZone(30);
    for (const word of rebuilt.words) {
      expect(levelOf(word.wordId), byId.get(word.wordId)!.word).toBeGreaterThanOrEqual(
        zone.min - 1,
      );
    }
    const surfaces = rebuilt.words.map((word) => byId.get(word.wordId)!.word);
    for (const filler of BEGINNER_FILLER) expect(surfaces).not.toContain(filler);
  });

  it('B: 3/10 at Level 1 retaken to 30 stays 3/10 with seven advanced targets', () => {
    const day = started(planAt(1), 3);
    const rebuilt = rebuildPlanForLevel(day, request(30));
    // The earned three: still credited, still in the plan, untouched.
    expect(rebuilt.completed).toEqual(day.completed);
    for (const id of day.completed) {
      expect(rebuilt.words.map((word) => word.wordId)).toContain(id);
    }
    // The denominator the learner agreed to does not move.
    expect(rebuilt.goal).toBe(10);
    expect(rebuilt.words).toHaveLength(10);
    // The seven unresolved beginner words are replaced by Level-30-zone words.
    const done = new Set(day.completed);
    const regenerated = rebuilt.words.filter((word) => !done.has(word.wordId));
    expect(regenerated).toHaveLength(7);
    for (const word of regenerated) {
      expect(levelOf(word.wordId), byId.get(word.wordId)!.word).toBeGreaterThanOrEqual(
        teachingZone(30).min - 1,
      );
    }
    const oldUnresolved = day.words.slice(3).map((word) => word.wordId);
    for (const id of oldUnresolved) {
      expect(rebuilt.words.map((word) => word.wordId)).not.toContain(id);
    }
  });

  it('C: 4/10 at Level 30 retaken to 1 stays 4/10 with beginner-appropriate targets', () => {
    const day = started(planAt(30), 4);
    const rebuilt = rebuildPlanForLevel(day, request(1));
    expect(rebuilt.completed).toEqual(day.completed);
    expect(rebuilt.words).toHaveLength(10);
    const done = new Set(day.completed);
    const regenerated = rebuilt.words.filter((word) => !done.has(word.wordId));
    expect(regenerated).toHaveLength(6);
    for (const word of regenerated) {
      expect(levelOf(word.wordId), byId.get(word.wordId)!.word).toBeLessThanOrEqual(
        teachingZone(1).max + 1,
      );
    }
  });

  it('D: an unresolved wrong answer does not keep the old plan alive', () => {
    /*
     * A word answered wrongly stays unresolved — it is not in `completed` — and
     * used to sit in the retry queue holding a place in the day. It is ordinary
     * new-study, so the measured level owns it: after the retake it is replaced
     * like any other unresolved target. Its wrong-answer history lives in the
     * mistakes store, and Review is the feature entitled to bring it back.
     */
    const day = started(planAt(10), 9);
    const pending = day.words[9]!.wordId; // answered wrong: unresolved, not completed
    const rebuilt = rebuildPlanForLevel(day, request(25));
    expect(rebuilt.words.map((word) => word.wordId)).not.toContain(pending);
    expect(rebuilt.completed).toEqual(day.completed);
    expect(rebuilt.words).toHaveLength(10);
  });

  it('E: extra study after a completed day and a retake is chosen at the new level', () => {
    const finished = started(planAt(1), 10);
    const rebuilt = rebuildPlanForLevel(finished, request(30));
    // Nothing was owed, so nothing is replaced — only the level moves.
    expect(rebuilt.words).toEqual(finished.words);
    expect(rebuilt.completed).toEqual(finished.completed);
    expect(rebuilt.level).toBe(30);
    // The five extra words are picked around Level 30, not the finished plan's 1.
    const extended = extendDay(rebuilt, 5, request(30));
    const added = extended.words.slice(10);
    expect(added).toHaveLength(5);
    for (const word of added) {
      expect(levelOf(word.wordId), byId.get(word.wordId)!.word).toBeGreaterThanOrEqual(
        teachingZone(30).min - 1,
      );
    }
  });

  it('F: 12/15 keeps twelve credits and regenerates only the remaining three', () => {
    const day = planAt(1);
    const extended = extendDay(day, 5, request(1));
    expect(extended.words).toHaveLength(15);
    const twelve = started(extended, 12);
    const rebuilt = rebuildPlanForLevel(twelve, request(30));
    expect(rebuilt.completed).toHaveLength(12);
    expect(rebuilt.completed).toEqual(twelve.completed);
    // The denominator of the extended day stays 15.
    expect(rebuilt.words).toHaveLength(15);
    const done = new Set(twelve.completed);
    const regenerated = rebuilt.words.filter((word) => !done.has(word.wordId));
    expect(regenerated).toHaveLength(3);
    for (const word of regenerated) {
      expect(levelOf(word.wordId), byId.get(word.wordId)!.word).toBeGreaterThanOrEqual(
        teachingZone(30).min - 1,
      );
    }
  });

  it('G: a retake to the same level returns the identical plan', () => {
    const day = started(planAt(10), 4);
    expect(rebuildPlanForLevel(day, request(10))).toBe(day);
  });

  it('never re-teaches a word from earlier today as one of the replacements', () => {
    // The learner met the beginner words this morning — introduced, some wrong.
    // None of them may come back wearing a new-word slot at the new level, and
    // none of the replacements may duplicate a word already in the plan.
    const day = started(planAt(1), 3);
    const progress: DayRequest['progress'] = Object.fromEntries(
      day.words.map((word) => [
        `word:${word.wordId}`,
        {
          kind: 'word',
          item_key: word.wordId,
          stage: 'seen',
          attempts: 1,
          passes: 0,
          first_seen_at: NOW.toISOString(),
          last_seen_at: NOW.toISOString(),
        } as unknown as DayRequest['progress'][string],
      ]),
    );
    const rebuilt = rebuildPlanForLevel(day, { ...request(30), progress });
    const ids = rebuilt.words.map((word) => word.wordId);
    expect(new Set(ids).size).toBe(ids.length);
    const oldUnresolved = day.words.slice(3).map((word) => word.wordId);
    for (const id of oldUnresolved) expect(ids).not.toContain(id);
  });
});
