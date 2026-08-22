#!/usr/bin/env node
/**
 * Does the learner get different, appropriate words as the days pass?
 *
 *   node scripts/daily-vocabulary-qa.mjs           print the simulation
 *   node scripts/daily-vocabulary-qa.mjs --check   fail the build on a problem
 *
 * ## The complaint this answers
 *
 * "Today's vocabulary feels like the same words over and over." It was. The
 * plan took a prefix of the corpus in priority order, so every learner got the
 * same list, and a learner who did not finish a day met the same ten again the
 * next morning. The level test told somebody they were level 14 and then
 * nothing used the number.
 *
 * Four properties are worth asserting, and none of them can be seen in a unit
 * test of a single day:
 *
 * | | |
 * | --- | --- |
 * | **stable within a day** | reload, reopen, restart — the same ten words |
 * | **different across days** | day 2 is not day 1, and day 100 is not day 1 |
 * | **different across learners** | two people at one level do not share a list |
 * | **level-appropriate** | the words sit around the learner's level, not at the corpus's start |
 *
 * ## What is simulated
 *
 * A learner who studies every day and learns everything they are given, which
 * is the fastest anybody empties the pool and therefore the hardest case for
 * "does it run out". Days 1, 2, 7, 30, 60 and 100 are printed; every day up to
 * 100 is generated, because the interesting number — how many *distinct* words
 * a hundred days produces — needs all of them.
 */
import { loadCorpusForNode } from './lib/corpus.mjs';

await loadCorpusForNode();

const { vocabularyByPriority } = await import('../apps/web/src/data/vocabulary.ts');
const { buildDailyPlan } = await import('../apps/web/src/domain/vocabularyDay.ts');
const { wordLevel, levelRange } = await import('../apps/web/src/domain/vocabularyLevel.ts');
const { memoryKey, skillsFor } = await import('../apps/web/src/domain/memory.ts');

const CHECK = process.argv.includes('--check');
const DAYS = 100;
const GOAL = 10;
const MILESTONES = [1, 2, 7, 30, 60, 100];

const corpus = vocabularyByPriority();
const range = levelRange(corpus);

/**
 * One learner, studied for `days` days, learning everything they are given.
 *
 * The progress and memory maps are built as the days go by, exactly as the app
 * would build them, so day 30's plan sees the twenty-nine days before it.
 */
function study({ level, seed, days }) {
  const progress = {};
  const memory = {};
  const perDay = [];
  const start = Date.UTC(2026, 0, 1);
  for (let day = 0; day < days; day += 1) {
    const now = new Date(start + day * 24 * 60 * 60 * 1000);
    const plan = buildDailyPlan({
      progress,
      memory,
      corpus,
      goal: GOAL,
      now,
      level,
      seed,
      dayIndex: day,
      /*
       * Deliberately empty.
       *
       * The app excludes words met in the last fortnight from *new* selection,
       * and this learner has met everything they were given — so passing the
       * real set would exclude the last 140 words and measure the exclusion
       * rather than the selection. What is being measured here is whether the
       * pool runs out, and `isMet` already covers that.
       */
      recentlyIntroduced: new Set(),
    });
    perDay.push(plan);
    for (const word of plan.words) {
      progress[`word:${word.wordId}`] = {
        item_key: word.wordId,
        kind: 'word',
        stage: 'learned',
        first_seen_at: progress[`word:${word.wordId}`]?.first_seen_at ?? now.toISOString(),
      };
      /*
       * And a memory of having answered it, which the plan reads.
       *
       * Without this every learned word has recall 0 and lands in the *weak*
       * pool, so half of every day is review and the simulation measures a
       * learner who never remembers anything. Ninety days of stability is a
       * word that has been answered right a few times — the case where the new
       * pool is under most pressure, which is the case worth simulating.
       */
      const skills = {};
      for (const skill of skillsFor('word')) {
        skills[skill] = {
          skill,
          stability_days: 90,
          difficulty: 0.2,
          last_reviewed_at: now.toISOString(),
          next_review_at: new Date(now.getTime() + 90 * 86400000).toISOString(),
          streak: 3,
          lapses: 0,
          recent_score: 1,
          last_response_ms: null,
        };
      }
      memory[memoryKey('word', word.wordId)] = {
        item_key: word.wordId,
        kind: 'word',
        algorithm_version: 1,
        skills,
        confusions: {},
        rescued_at: null,
      };
    }
  }
  return perDay;
}

const problems = [];

// --- 1. Stable within a day --------------------------------------------------
{
  const once = study({ level: 14, seed: 'aaaa1111', days: 1 })[0];
  const twice = study({ level: 14, seed: 'aaaa1111', days: 1 })[0];
  const same =
    once.words.length === twice.words.length &&
    once.words.every((word, i) => word.wordId === twice.words[i].wordId);
  console.log(`  same learner, same day, built twice   ${same ? 'identical' : 'DIFFERENT'}`);
  if (!same) problems.push('the same learner on the same day got two different lists');
}

// --- 2. Different learners ----------------------------------------------------
{
  const a = study({ level: 14, seed: 'aaaa1111', days: 1 })[0].words.map((w) => w.wordId);
  const b = study({ level: 14, seed: 'bbbb2222', days: 1 })[0].words.map((w) => w.wordId);
  const shared = a.filter((id) => b.includes(id)).length;
  console.log(`  two level-14 learners, day 1          ${shared} of ${a.length} words in common`);
  if (shared > a.length / 2) {
    problems.push(`two learners at the same level share ${shared} of ${a.length} day-one words`);
  }
}

// --- 3. Different days, and how far the pool goes ------------------------------
const days = study({ level: 14, seed: 'aaaa1111', days: DAYS });
const seen = new Set();
let repeats = 0;
// Only the *new* words. A word coming back for review is the review system
// doing its job, and counting it here would report the feature as the fault.
for (const plan of days) {
  for (const word of plan.words) {
    if (word.source !== 'new') continue;
    if (seen.has(word.wordId)) repeats += 1;
    seen.add(word.wordId);
  }
}
const newOnly = (plan) => plan.words.filter((word) => word.source === 'new');
const dayOne = new Set(newOnly(days[0]).map((w) => w.wordId));
const dayHundred = new Set(newOnly(days[DAYS - 1]).map((w) => w.wordId));
const overlap = [...dayHundred].filter((id) => dayOne.has(id)).length;

const newPerDay = days.map((plan) => newOnly(plan).length);
const offered = newPerDay.reduce((a, b) => a + b, 0);
console.log(`  new words offered over ${DAYS} days       ${offered}`);
console.log(`  distinct among them                   ${seen.size}`);
console.log(`  a word offered as new twice            ${repeats}`);
console.log(`  day ${DAYS} words also in day 1            ${overlap}`);
if (repeats > 0) problems.push(`${repeats} word(s) were offered as new more than once`);
if (overlap > 0) problems.push(`day ${DAYS} repeats ${overlap} of day 1's words`);
if (seen.size !== offered) {
  problems.push(`${offered} new words were offered but only ${seen.size} were distinct`);
}
/*
 * How much room is left, which is the question §19 is actually asking.
 *
 * A hundred days at ten a day is a thousand *slots*, and this learner used 875
 * of them for new words — the other 125 went to review, because by day 100 the
 * words from day 1 are ninety-nine days old and the scheduler wants them back.
 * That is the review system working, not the new-word pool failing.
 *
 * What would be a failure is running out, so that is what is checked: how many
 * words the learner has never met after a hundred days of the fastest possible
 * study. If that number ever approaches zero the corpus is the constraint and
 * the answer is I-04, not a change here.
 */
const met = new Set();
for (const plan of days) for (const word of plan.words) met.add(word.wordId);
const untouched = corpus.length - met.size;
console.log(`  words still unseen after ${DAYS} days     ${untouched} of ${corpus.length}`);
if (untouched < 500) {
  problems.push(`only ${untouched} unseen words are left after ${DAYS} days`);
}

// --- 4. Level-appropriate ------------------------------------------------------
console.log(`\n  the corpus has words at levels ${range.min}–${range.max}\n`);
console.log('  day   levels of the ten new words');
const byId = new Map(corpus.map((word) => [word.id, word]));
for (const milestone of MILESTONES) {
  const plan = days[milestone - 1];
  const levels = plan.words
    .filter((word) => word.source === 'new')
    .map((word) => wordLevel(byId.get(word.wordId)))
    .sort((a, b) => a - b);
  console.log(`  ${String(milestone).padStart(3)}   ${levels.join(' ') || '—'}`);
}

/*
 * And the mix, over every day rather than over one.
 *
 * The rule is seven at the learner's level give or take one, two easier, one
 * harder — but the corpus only has words at levels 1 to 13, so a level-14
 * learner's "at level" and "harder" both clamp to 13. Measured at level 8,
 * where the whole distribution fits inside what exists, which is the only place
 * the rule can be observed rather than inferred.
 */
const midLevel = Math.min(8, range.max - 2);
const spread = new Map();
for (const plan of study({ level: midLevel, seed: 'cccc3333', days: 30 })) {
  for (const word of plan.words) {
    if (word.source !== 'new') continue;
    const offset = wordLevel(byId.get(word.wordId)) - midLevel;
    spread.set(offset, (spread.get(offset) ?? 0) + 1);
  }
}
const total = [...spread.values()].reduce((a, b) => a + b, 0);
console.log(`\n  a level-${midLevel} learner's new words, 30 days, by distance from their level:`);
for (const offset of [...spread.keys()].sort((a, b) => a - b)) {
  const count = spread.get(offset);
  const share = ((count / total) * 100).toFixed(0);
  console.log(`    ${offset >= 0 ? '+' : ''}${offset}  ${String(count).padStart(4)}  ${share}%`);
}
const near = (spread.get(-1) ?? 0) + (spread.get(0) ?? 0) + (spread.get(1) ?? 0);
const nearShare = near / total;
console.log(`\n  within one level of the learner:       ${(nearShare * 100).toFixed(0)}%`);
if (nearShare < 0.5) {
  problems.push(`only ${(nearShare * 100).toFixed(0)}% of new words are within one level`);
}

// --- 5. A retake does not disturb today ------------------------------------------
{
  const before = study({ level: 8, seed: 'dddd4444', days: 3 })[2].words.map((w) => w.wordId);
  const after = study({ level: 20, seed: 'dddd4444', days: 3 })[2].words.map((w) => w.wordId);
  const changed = before.some((id, i) => id !== after[i]);
  console.log(`\n  a new level changes the next plan       ${changed ? 'yes' : 'NO'}`);
  if (!changed) problems.push('changing the level did not change the plan');
  /*
   * That it does not change *today's* plan is a property of the caller, not of
   * this function: `planIsCurrent` returns the stored plan for the rest of the
   * day whatever the level says. `vocabularyDay.test.ts` covers it, and the
   * end-to-end suite sits the test mid-session and checks the list is intact.
   */
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ! ${problem}`);
  process.exit(CHECK ? 1 : 0);
}
console.log("\nthe day's words are stable within a day, different across days, and near the level.");
