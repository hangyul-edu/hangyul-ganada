#!/usr/bin/env node
/**
 * Does a learner get the same words every day?
 *
 *   node scripts/daily-plan-freshness-qa.mjs           print the simulation
 *   node scripts/daily-plan-freshness-qa.mjs --check   fail the build on a problem
 *
 * ## The complaint this answers, and why the existing gate could not
 *
 * "Today's Vocabulary appears to present the same words every day."
 *
 * `scripts/daily-vocabulary-qa.mjs` already asks whether the days differ, and
 * it passed throughout. It passed because it simulates the days with
 * `dayIndex: day` — a perfect loop counter — while the app supplied
 * `settings.active_days.length`, **the number of days the learner had actually
 * practised on**. So the old gate proved the *selector* rotates with
 * `dayIndex` and never asked whether the product supplies a rotating one. It
 * does not: a learner who opens Today's Vocabulary and finishes nothing does
 * not add a day to `active_days`, so tomorrow's `dayIndex` is today's and the
 * plan is rebuilt identically, indefinitely.
 *
 * The rule this file works to is therefore: **simulate through the same
 * function the app calls, with the same inputs the app derives**, and never a
 * hand-fed ideal. `dayIndex` here comes from `dayOrdinal(now)` — the app's own
 * source since this pass — so if somebody points the app back at a
 * sittings-counter this gate fails rather than agreeing with it.
 *
 * ## What is a defect and what is not
 *
 * A word coming round again as a **review** is the product working: the
 * scheduler decided the memory was fading and there is a `next_review_at` in
 * store to prove it. A word offered again as **new**, when the learner has
 * already met it and the eligible pool has not run out, is the defect. The two
 * are counted separately and only the second one fails.
 *
 * Exhaustion is not a defect either, but it must be *reported*: a level-30
 * learner in a partial locale can genuinely run out of askable material, and
 * the honest answer is a content shortage with a number on it, not a silently
 * repeated plan.
 */
import { loadCorpusForNode } from './lib/corpus.mjs';

await loadCorpusForNode();

const { vocabularyByPriority } = await import('../apps/web/src/data/vocabulary.ts');
const { buildDailyPlan, planIsCurrent, rebuildPlanForLevel } = await import(
  '../apps/web/src/domain/vocabularyDay.ts'
);
const { wordLevel, levelRange, teachingZone, recentlyIntroduced } = await import(
  '../apps/web/src/domain/vocabularyLevel.ts'
);
const { memoryKey, skillsFor } = await import('../apps/web/src/domain/memory.ts');
const { dayOrdinal, dateKey } = await import('../apps/web/src/domain/progress.ts');

const CHECK = process.argv.includes('--check');
const DAYS = 30;
const GOAL = 10;

const corpus = vocabularyByPriority();
const range = levelRange(corpus);
const byId = new Map(corpus.map((w) => [w.id, w]));

/**
 * A locale that can only ask about part of the corpus.
 *
 * Modelled the way the app models it — `canPractise`, a predicate over word ids
 * — rather than by trimming the corpus, because trimming would also hide the
 * words from the *level* arithmetic and the simulation would stop resembling
 * the product. A partial pack knows the word exists; it just cannot ask
 * anything about it.
 */
function partialLocale(fraction) {
  const askable = new Set(
    corpus.filter((_, i) => i % Math.round(1 / fraction) === 0).map((w) => w.id),
  );
  return (id) => askable.has(id);
}

/** A memory row for a word that has been answered right and is not due soon. */
function restedMemory(wordId, now, stabilityDays) {
  const skills = {};
  for (const skill of skillsFor('word')) {
    skills[skill] = {
      skill,
      stability_days: stabilityDays,
      difficulty: 0.2,
      last_reviewed_at: now.toISOString(),
      next_review_at: new Date(now.getTime() + stabilityDays * 86400000).toISOString(),
      streak: 3,
      lapses: 0,
      recent_score: 1,
      last_response_ms: null,
    };
  }
  return {
    item_key: wordId,
    kind: 'word',
    algorithm_version: 1,
    skills,
    confusions: {},
    rescued_at: null,
  };
}

/**
 * One learner, day by day, through the real planner.
 *
 * `behaviour` decides what happens to each day's plan — finished, abandoned,
 * answered wrong — because the reported defect is specifically about a learner
 * who does *not* finish, and a simulation in which everybody finishes cannot
 * contain it.
 */
function live({
  level,
  seed,
  days = DAYS,
  behaviour = 'completes',
  canPractise,
  timezoneShiftOnDay = null,
  retakeOnDay = null,
  retakeTo = null,
  extraStudyOnDay = null,
  startUtc = Date.UTC(2026, 2, 1, 9),
}) {
  const progress = {};
  const memory = {};
  const log = [];
  let storedPlan = null;
  let measuredLevel = level;
  let offsetHours = 0;

  for (let day = 0; day < days; day += 1) {
    if (timezoneShiftOnDay !== null && day === timezoneShiftOnDay) offsetHours = 14;
    const now = new Date(startUtc + day * 86400000 + offsetHours * 3600000);
    if (retakeOnDay !== null && day === retakeOnDay) measuredLevel = retakeTo;

    const request = {
      progress,
      memory,
      corpus,
      goal: GOAL,
      now,
      level: measuredLevel,
      seed,
      // The app's own source. Not a loop counter.
      dayIndex: dayOrdinal(now),
      recentlyIntroduced: recentlyIntroduced(progress, now),
      canPractise,
    };

    // Exactly the branch in LearnerProvider: keep today's plan, correct a
    // plan whose level moved, otherwise build.
    let plan;
    if (planIsCurrent(storedPlan, now, measuredLevel)) {
      plan = storedPlan;
    } else if (
      storedPlan !== null &&
      storedPlan.date === dateKey(now) &&
      storedPlan.completed.length > 0
    ) {
      plan = rebuildPlanForLevel(storedPlan, request);
    } else {
      plan = buildDailyPlan(request);
    }

    // Reconstructing the same day twice must give the same list.
    const rebuilt = planIsCurrent(plan, now, measuredLevel)
      ? plan
      : buildDailyPlan(request);
    const sameDayStable =
      rebuilt.words.length === plan.words.length &&
      rebuilt.words.every((w, i) => w.wordId === plan.words[i].wordId);

    const eligible = corpus.filter(
      (w) => !progress[`word:${w.id}`] || progress[`word:${w.id}`].stage === 'unseen',
    );
    const zone = teachingZone(measuredLevel);
    const inZone = eligible.filter((w) => {
      const l = wordLevel(w);
      return l >= zone.min && l <= zone.max;
    });
    const askableInZone = canPractise ? inZone.filter((w) => canPractise(w.id)) : inZone;

    log.push({
      day,
      dayKey: dateKey(now),
      dayIndex: dayOrdinal(now),
      level: measuredLevel,
      sameDayStable,
      newIds: plan.words.filter((w) => w.source === 'new').map((w) => w.wordId),
      /*
        New words the learner had already met before this morning.

        This, and not "have I seen this id in an earlier plan", is the defect.
        A word that appeared in an abandoned plan was never met — nothing was
        written about it, `recentlyIntroduced` has never heard of it — and
        offering it again is the product being patient, not repeating itself.
        Re-teaching something they have *already learned* is the failure.
      */
      reTaught: plan.words
        .filter((w) => w.source === 'new')
        .filter((w) => {
          const row = progress[`word:${w.wordId}`];
          return row !== undefined && row.stage !== 'unseen';
        })
        .map((w) => w.wordId),
      reviewIds: plan.words.filter((w) => w.source === 'review').map((w) => w.wordId),
      weakIds: plan.words.filter((w) => w.source === 'weak').map((w) => w.wordId),
      familiarIds: plan.words.filter((w) => w.source === 'familiar').map((w) => w.wordId),
      allIds: plan.words.map((w) => w.wordId),
      eligiblePool: eligible.length,
      inZonePool: inZone.length,
      askablePool: askableInZone.length,
      goalReached: false,
    });

    // --- what the learner did with it ------------------------------------
    const finish = (word) => {
      const key = `word:${word.wordId}`;
      progress[key] = {
        item_key: word.wordId,
        kind: 'word',
        stage: 'learned',
        first_seen_at: progress[key]?.first_seen_at ?? now.toISOString(),
      };
      memory[memoryKey('word', word.wordId)] = restedMemory(word.wordId, now, 90);
    };

    let completed = [];
    if (behaviour === 'completes') {
      plan.words.forEach(finish);
      completed = plan.words.map((w) => w.wordId);
      log[log.length - 1].goalReached = completed.length >= GOAL;
    } else if (behaviour === 'abandons') {
      // Opens it, finishes nothing. The exact case the defect lived in.
      completed = [];
    } else if (behaviour === 'partial') {
      const half = plan.words.slice(0, Math.floor(plan.words.length / 2));
      half.forEach(finish);
      completed = half.map((w) => w.wordId);
    } else if (behaviour === 'struggles') {
      // Answers, but badly: met, and due again tomorrow.
      for (const word of plan.words) {
        const key = `word:${word.wordId}`;
        progress[key] = {
          item_key: word.wordId,
          kind: 'word',
          stage: 'practising',
          first_seen_at: progress[key]?.first_seen_at ?? now.toISOString(),
        };
        memory[memoryKey('word', word.wordId)] = restedMemory(word.wordId, now, 1);
      }
      completed = [];
    }

    if (extraStudyOnDay !== null && day === extraStudyOnDay) {
      log[log.length - 1].extraStudy = true;
    }

    storedPlan = { ...plan, completed };
  }
  return log;
}

// --- the measurements --------------------------------------------------------

function metrics(log) {
  let exactRepeat = 0;
  let overlapTotal = 0;
  let newReuseBeforeExhaustion = 0;
  let unstable = 0;
  const seenNew = new Set();
  for (let i = 0; i < log.length; i += 1) {
    const d = log[i];
    if (!d.sameDayStable) unstable += 1;
    for (const id of d.newIds) seenNew.add(id);
    if (d.askablePool > GOAL) newReuseBeforeExhaustion += d.reTaught.length;
    if (i === 0) continue;
    const prev = log[i - 1];
    const a = new Set(prev.allIds);
    const shared = d.allIds.filter((id) => a.has(id));
    overlapTotal += shared.length;
    if (
      d.allIds.length > 0 &&
      d.allIds.length === prev.allIds.length &&
      d.allIds.every((id, k) => id === prev.allIds[k])
    ) {
      exactRepeat += 1;
    }
  }
  /*
    `pickNewWords` may look one level either side of the teaching zone, and
    says so. A word at `zone.min - 1` is therefore the selector working, not
    beginner contamination — measuring it as a defect would fail the gate on
    documented behaviour and teach the next person to widen the tolerance
    rather than read the code. What is a defect is material: a word further
    below the zone than the widening allows.
  */
  const beginnerContamination = log.reduce((n, d) => {
    const zone = teachingZone(d.level);
    return (
      n +
      d.newIds.filter((id) => {
        const w = byId.get(id);
        return w ? wordLevel(w) < zone.min - 1 : false;
      }).length
    );
  }, 0);
  return {
    days: log.length,
    exactRepeat,
    meanOverlap: log.length > 1 ? overlapTotal / (log.length - 1) : 0,
    newReuseBeforeExhaustion,
    unstable,
    beginnerContamination,
    distinctNew: seenNew.size,
    exhaustedDays: log.filter((d) => d.askablePool <= GOAL).length,
    shortDays: log.filter((d) => d.allIds.length < GOAL).length,
  };
}

const SCENARIOS = [
  { name: 'L1 · completes every day', opts: { level: 1, seed: 'aaaa1111' } },
  { name: 'L1 · opens and abandons', opts: { level: 1, seed: 'bbbb2222', behaviour: 'abandons' } },
  { name: 'L10 · completes', opts: { level: 10, seed: 'cccc3333' } },
  { name: 'L10 · half a day', opts: { level: 10, seed: 'dddd4444', behaviour: 'partial' } },
  { name: 'L20 · completes', opts: { level: 20, seed: 'eeee5555' } },
  { name: 'L20 · struggles (due debt)', opts: { level: 20, seed: 'ffff6666', behaviour: 'struggles' } },
  { name: 'L30 · completes', opts: { level: 30, seed: 'aaaa7777' } },
  { name: 'L30 · abandons', opts: { level: 30, seed: 'bbbb8888', behaviour: 'abandons' } },
  {
    name: 'L10 · partial locale (25% askable)',
    opts: { level: 10, seed: 'cccc9999', canPractise: partialLocale(0.25) },
  },
  {
    name: 'L30 · partial locale (25% askable)',
    opts: { level: 30, seed: 'dddd0000', canPractise: partialLocale(0.25) },
  },
  {
    name: 'L1 → 30 · mid-run retake',
    opts: { level: 1, seed: 'eeee1212', retakeOnDay: 5, retakeTo: 30 },
  },
  {
    name: 'L20 · timezone change on day 10',
    opts: { level: 20, seed: 'ffff1313', timezoneShiftOnDay: 10 },
  },
];

const rows = [];
const problems = [];

for (const scenario of SCENARIOS) {
  const log = live(scenario.opts);
  const m = metrics(log);
  rows.push({ name: scenario.name, ...m });

  if (m.unstable > 0) {
    problems.push(`${scenario.name}: ${m.unstable} day(s) rebuilt to a different list within the day`);
  }
  if (m.exactRepeat > 0) {
    problems.push(
      `${scenario.name}: the whole plan repeated on ${m.exactRepeat} consecutive day(s)`,
    );
  }
  if (m.newReuseBeforeExhaustion > 0) {
    problems.push(
      `${scenario.name}: ${m.newReuseBeforeExhaustion} already-met word(s) re-taught as new while ` +
        'the askable pool still had room',
    );
  }
  if (m.beginnerContamination > 0) {
    problems.push(
      `${scenario.name}: ${m.beginnerContamination} new word(s) below the teaching zone`,
    );
  }
}

console.log(`Daily plan freshness — ${DAYS} consecutive days, ${SCENARIOS.length} learners\n`);
console.log(
  '  learner                              exact  overlap  new-reuse  beginner  distinct  exhausted',
);
for (const r of rows) {
  console.log(
    `  ${r.name.padEnd(36)} ${String(r.exactRepeat).padStart(5)}  ` +
      `${r.meanOverlap.toFixed(1).padStart(7)}  ${String(r.newReuseBeforeExhaustion).padStart(9)}  ` +
      `${String(r.beginnerContamination).padStart(8)}  ${String(r.distinctNew).padStart(8)}  ` +
      `${String(r.exhaustedDays).padStart(9)}`,
  );
}
console.log(
  '\n  exact     consecutive days whose whole plan was identical — always a defect\n' +
    '  overlap   mean words shared with the previous day — reviews make this legitimately non-zero\n' +
    '  new-reuse a word the learner had ALREADY MET, offered as NEW again with pool to spare — a defect\n' +
    '  beginner  new words further below the zone than the documented ±1 widening — a defect\n' +
    '  exhausted days where the askable in-zone pool was at or under the goal — a content shortage, reported',
);

if (problems.length === 0) {
  console.log('\n  no learner was shown the same plan twice, and nothing was re-taught as new.');
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
}

if (CHECK && problems.length > 0) process.exit(1);
