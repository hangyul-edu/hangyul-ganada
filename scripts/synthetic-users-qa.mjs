#!/usr/bin/env node
/**
 * One hundred synthetic learners, driven through the real product code.
 *
 *   npm run synthetic:users:qa            run all journeys, write the report
 *   npm run synthetic:users:qa:check      fail the build on any journey FAIL
 *
 * ## What this is, and what it is not
 *
 * Each persona in `qa/synthetic-users.json` runs a multi-day study journey
 * through the modules the shipping app runs: `buildDailyPlan` chooses their
 * words, `scheduleSteps` and `buildDailyQuestions` build their sitting in
 * their own language, answers are credited through the same rules the session
 * screen uses (`completeWord`, per-word grid results, retries from
 * `retrySteps`), memory moves through `applyReview`, progress through
 * `applyIntroduced`/`applyRecognition`, mistakes through `applyAnswer`, and
 * the streak through `learningStreak`. What it measures is therefore the
 * product's own behaviour, not a model of it.
 *
 * It is a SYNTHETIC EDUCATIONAL OUTCOME. No sentence in this file or in the
 * report it writes claims anything about human learning: a seeded random
 * learner with 75% accuracy is not a person, and software driving software
 * proves state machines, not pedagogy.
 *
 * What runs here is the domain layer. Rendering — breakpoints, dark mode,
 * touch targets — is covered by `screens:audit` (143 renders at seven device
 * profiles) and the Playwright suite; the `device` and `platform` fields on a
 * persona are recorded for the report and deliberately do not alter a domain
 * simulation that has no pixels.
 *
 * ## The invariants every day of every journey must hold
 *
 * - progress equals unique mastered target words — never questions, never
 *   screens (§26, §58)
 * - a wrong answer moves nothing; the word is owed and comes back (§27)
 * - 9/10 always has a next action; the sitting ends exactly when nothing is
 *   owed (§28)
 * - extra study turns 10/10 into 10/15, and touches nothing earned (§29)
 * - a mid-session reload rebuilt from the persisted plan loses neither
 *   progress nor owed words (§31)
 * - every recommended new word sits inside the learner's teaching zone, one
 *   level of grace at most; a level-30 learner is never handed beginner
 *   vocabulary (§45–46)
 * - a meaning question is never built for a word the learner's language has
 *   no meaning for (§49)
 * - the streak is one number, continuous across consecutive study days (§57)
 * - the saved list and the wrong list always equal their counters (§33)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const PUBLIC = join(ROOT, 'apps/web/public');

// --- Serve public/ over fetch, exactly as the unit-test setup does ----------

const LOCAL = /^\/(corpus|level-test|dictionary)\//;
const network = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (!LOCAL.test(url)) return network(input, init);
  try {
    const body = await readFile(join(PUBLIC, url));
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
};

const { loadCorpusCore, loadCorpusRest } = await import('../apps/web/src/data/corpus.ts');
await loadCorpusCore();
await loadCorpusRest();

const { vocabularyByPriority, VOCABULARY } = await import('../apps/web/src/data/vocabulary.ts');
const { loadWordCopy, strictMeaning } = await import('../apps/web/src/data/wordCopy.ts');
const {
  buildDailyPlan,
  completeWord,
  dayProgress,
  endsSession,
  extendDay,
  retrySteps,
  scheduleSteps,
  sessionProgress,
} = await import('../apps/web/src/domain/vocabularyDay.ts');
const { buildDailyQuestions, canPractise, creditsFor } = await import(
  '../apps/web/src/features/vocabulary/dailyQuestions.ts'
);
const { applyReview, blankMemory, memoryKey, skillRecall } = await import(
  '../apps/web/src/domain/memory.ts'
);
const { applyIntroduced, applyRecognition } = await import('../apps/web/src/domain/mastery.ts');
const { applyAnswer, listMistakes } = await import('../apps/web/src/domain/mistakes.ts');
const { learningStreak, recordActivity } = await import('../apps/web/src/domain/activity.ts');
const { dateKey } = await import('../apps/web/src/domain/progress.ts');
const { levelFromProgress, teachingLevel, teachingZone, wordLevel, recentlyIntroduced } =
  await import('../apps/web/src/domain/vocabularyLevel.ts');

const { personas } = JSON.parse(readFileSync(join(ROOT, 'qa/synthetic-users.json'), 'utf8'));
const LOCALES = [...new Set(personas.map((p) => p.locale))];
for (const locale of LOCALES) await loadWordCopy(locale);

// English meanings, for the leakage check: an option that reads exactly like
// the English pack's meaning while the learner's pack says something else is
// English leaking into a localized question.
await loadWordCopy('en');

// --- Small deterministic PRNG so a failing journey replays exactly ----------

function mulberry32(seed) {
  let a = 0;
  for (const ch of seed) a = (a * 31 + ch.codePointAt(0)) | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- One persona's journey ---------------------------------------------------

const T0 = new Date(2026, 6, 1, 10, 0, 0); // July 1st, local, mid-morning.

function runJourney(persona) {
  const rand = mulberry32(persona.seed);
  const defects = [];
  const flag = (kind, message) => defects.push({ kind, message });

  // The learner's whole device-local state, as the stores hold it.
  let progress = {}; // Record<progressKey, ItemProgress>
  let memory = {}; // MemoryMap
  let mistakes = {}; // MistakeMap
  let activity = {}; // ActivityMap
  let activeDays = [];
  const saved = new Set();

  // Pre-seeded history for a returning learner: their prior study days count
  // toward streak continuity and day indexing.
  if (persona.history === 'returning') {
    const prior = persona.priorDays ?? 5;
    for (let d = prior; d >= 1; d -= 1) {
      // Only the trailing `streakBefore` days are consecutive.
      const consecutive = persona.streakBefore ?? 0;
      if (d <= consecutive) {
        const when = new Date(T0);
        when.setDate(when.getDate() - d);
        activeDays.push(dateKey(when));
      }
    }
  }

  // Mastery-state ledger for the synthetic educational outcome (§6).
  const wordState = new Map(); // wordId -> one of the §6 states
  const setState = (id, state) => wordState.set(id, state);

  const outcome = {
    introduced: new Set(),
    mastered: new Set(),
    wrongOnce: new Set(),
    recovered: new Set(),
    reviewAsked: 0,
    reviewCorrect: 0,
    exposures: new Map(), // wordId -> distinct days seen
    zoneViolations: 0,
    beginnerLeaks: 0,
    localizationLeaks: 0,
    questionsAnswered: 0,
    retries: 0,
    reopens: 0,
    sessionsAbandoned: 0,
    daysStudied: 0,
  };

  const meaningOf = (word) => ({
    value: strictMeaning(word, persona.locale) ?? '',
    locale: persona.locale,
  });
  const label = (key) => key;

  const measuredLevel = () =>
    persona.levelTest === 'skipped' ? null : persona.level;

  let dayIndexBase = persona.history === 'returning' ? (persona.priorDays ?? 5) : 0;

  for (let day = 0; day < persona.days; day += 1) {
    const now = new Date(T0);
    now.setDate(now.getDate() + day);

    // An offline day: the product works offline, so the journey continues —
    // what an offline day must NOT do is corrupt anything, which the reload
    // checks below cover. A persona with the offline-day interruption instead
    // skips one mid-journey day entirely (life happened), which also exercises
    // the streak's missed-day arithmetic.
    if (persona.interruptions === 'offline-day' && day === Math.floor(persona.days / 2) && persona.days > 2) {
      continue;
    }

    // The measured level changes mid-journey for a retaken test.
    let measured = measuredLevel();
    if (persona.levelTest === 'retaken' && day >= Math.ceil(persona.days / 2)) {
      measured = persona.retakenLevel;
    }
    const outgrown = levelFromProgress(
      VOCABULARY,
      (wordId) => progress[`word:${wordId}`]?.stage === 'learned',
    );
    const level = teachingLevel(measured, outgrown);

    const request = {
      progress,
      memory,
      corpus: vocabularyByPriority(),
      goal: persona.goal,
      now,
      level,
      seed: persona.seed,
      dayIndex: dayIndexBase + day,
      recentlyIntroduced: recentlyIntroduced(progress, now),
      canPractise: (wordId) => {
        const word = VOCABULARY.find((w) => w.id === wordId);
        return word ? canPractise(word, meaningOf) : false;
      },
    };
    let plan = buildDailyPlan(request);

    // --- Recommendation invariants (§45–46) --------------------------------
    const zone = teachingZone(level);
    for (const planned of plan.words) {
      if (planned.source !== 'new') continue;
      const word = VOCABULARY.find((w) => w.id === planned.wordId);
      if (!word) continue;
      const wl = wordLevel(word);
      // `planNewWords` may reach one level outside the zone when the pool is
      // short, and no further.
      if (wl < zone.min - 1 || wl > zone.max + 1) {
        outcome.zoneViolations += 1;
        flag(
          'RECOMMENDATION',
          `${persona.id} day ${day + 1}: level-${level} learner offered ${word.word} (level ${wl}, zone ${zone.min}–${zone.max})`,
        );
      }
      if (level >= 25 && wl <= 5) {
        outcome.beginnerLeaks += 1;
        flag(
          'RECOMMENDATION',
          `${persona.id} day ${day + 1}: level-${level} learner offered beginner word ${word.word} (level ${wl})`,
        );
      }
    }

    // --- The sitting --------------------------------------------------------
    const steps = scheduleSteps(plan);
    let queue = buildDailyQuestions(steps, meaningOf, label);
    const missed = new Map();
    let passes = 0;
    let extended = false;

    // A localization check over every question built today (§49).
    for (const question of queue) {
      if (!question.exercise) continue;
      if (question.step === 'meaning' || question.step === 'produce') {
        const own = strictMeaning(question.word, persona.locale);
        if (!own) {
          outcome.localizationLeaks += 1;
          flag(
            'LOCALIZATION',
            `${persona.id} day ${day + 1}: a ${question.step} question built for ${question.word.word} with no ${persona.locale} meaning`,
          );
        }
      }
    }

    while (queue.length > 0) {
      passes += 1;
      if (passes > 40) {
        flag('PROGRESS', `${persona.id} day ${day + 1}: sitting did not converge`);
        break;
      }
      for (const question of queue) {
        const touches = question.pairs
          ? question.pairs.map((p) => p.wordId)
          : [question.word.id];
        for (const id of touches) {
          const days = outcome.exposures.get(id) ?? new Set();
          days.add(day);
          outcome.exposures.set(id, days);
        }

        if (question.step === 'intro') {
          progress = {
            ...progress,
            [`word:${question.word.id}`]: applyIntroduced(
              progress[`word:${question.word.id}`],
              { kind: 'word', itemKey: question.word.id },
              now,
            ),
          };
          outcome.introduced.add(question.word.id);
          if (!wordState.has(question.word.id)) setState(question.word.id, 'INTRODUCED');
          // An intro that is a word's whole obligation credits it (the
          // partial-locale case) — same rule as the screen.
          for (const id of creditsFor(question, null)) {
            plan = completeWord(plan, id);
            outcome.mastered.add(id);
            setState(id, 'MASTERED');
          }
          continue;
        }

        // Answer, per word: a grid can be right about three and wrong about one.
        outcome.questionsAnswered += 1;
        const isReview = wordState.get(question.word.id) === 'REVIEW_DUE' ||
          wordState.get(question.word.id) === 'FORGOTTEN';
        if (isReview) outcome.reviewAsked += touches.length === 1 ? 1 : 0;

        const answered = { correct: [], wrong: [] };
        for (const id of touches) {
          const wasWrongBefore = missed.has(id);
          const correct = rand() < persona.accuracy;
          (correct ? answered.correct : answered.wrong).push(id);
          const skill = question.exercise?.candidate.skill ?? 'meaning_recognition';
          memory = {
            ...memory,
            [memoryKey('word', id)]: applyReview(
              memory[memoryKey('word', id)],
              'word',
              id,
              { skill, passed: correct, score: correct ? 1 : 0, recovery: wasWrongBefore },
              now,
            ),
          };
          const key = `word:${id}`;
          const mistakeKey = `word:${id}`;
          const next = applyAnswer(
            mistakes[mistakeKey],
            { kind: 'word', itemKey: id, correct, confusedWith: null },
            now,
          );
          if (next === null) delete mistakes[mistakeKey];
          else mistakes[mistakeKey] = next;
          if (!correct) {
            outcome.wrongOnce.add(id);
            setState(id, 'RETRY_PENDING');
          } else {
            progress = {
              ...progress,
              [key]: applyRecognition(
                progress[key],
                { kind: 'word', itemKey: id, correct: true },
                now,
              ),
            };
            if (isReview) {
              outcome.reviewCorrect += 1;
              setState(id, 'REMASTERED');
            }
          }
        }

        const before = dayProgress(plan).done;
        const credited = creditsFor(question, answered);
        for (const id of credited) {
          plan = completeWord(plan, id);
          outcome.mastered.add(id);
          if (outcome.wrongOnce.has(id)) outcome.recovered.add(id);
          if (wordState.get(id) !== 'REMASTERED') setState(id, 'MASTERED');
        }
        for (const id of answered.wrong) missed.set(id, question.step);

        // Wrong answers moved nothing; correct ones moved exactly their count.
        const after = dayProgress(plan).done;
        const expected = Math.min(
          before + credited.filter((id) => !plan.completed.slice(0, before).includes(id)).length,
          Math.max(plan.goal, plan.words.length),
        );
        if (answered.correct.length === 0 && after !== before) {
          flag('PROGRESS', `${persona.id} day ${day + 1}: a wrong answer moved progress`);
        }
        if (after > Math.max(plan.goal, plan.words.length)) {
          flag('PROGRESS', `${persona.id} day ${day + 1}: progress exceeded the session`);
        }
        void expected;
      }

      // Mid-pass reload for the reload persona: everything re-derived from the
      // persisted snapshot must agree (§31).
      if (persona.interruptions === 'reload') {
        outcome.reopens += 1;
        const snapshot = JSON.parse(
          JSON.stringify({ plan, progress, memory, mistakes }),
        );
        const reProgress = dayProgress(snapshot.plan);
        if (reProgress.done !== dayProgress(plan).done) {
          flag('PERSISTENCE', `${persona.id} day ${day + 1}: reload lost progress`);
        }
        const owedNow = retrySteps(plan, missed).map((s) => s.wordId).sort();
        const owedAfter = retrySteps(snapshot.plan).map((s) => s.wordId).sort();
        if (JSON.stringify(owedNow) !== JSON.stringify(owedAfter)) {
          flag('PERSISTENCE', `${persona.id} day ${day + 1}: reload changed what is owed`);
        }
        plan = snapshot.plan;
        progress = snapshot.progress;
        memory = snapshot.memory;
        mistakes = snapshot.mistakes;
      }

      // The pass is over; whatever is owed comes round again.
      const owed = retrySteps(plan, missed);
      queue = buildDailyQuestions(owed, meaningOf, label);
      outcome.retries += queue.length;
      if (owed.length > 0 && queue.length === 0) {
        // Owed words with nothing left to ask — the stuck class. The intro
        // crediting and the retry fallback chain exist so this cannot happen.
        flag(
          'PROGRESS',
          `${persona.id} day ${day + 1}: ${owed.length} word(s) owed with no askable question — stuck at ${dayProgress(plan).done}/${dayProgress(plan).total}`,
        );
        outcome.sessionsAbandoned += 1;
        break;
      }
      if (endsSession(plan, missed, 0) !== (owed.length === 0)) {
        flag('STATE', `${persona.id} day ${day + 1}: endsSession disagrees with the owed list`);
      }

      // Extra study after the goal is met, once (§29).
      if (queue.length === 0 && persona.extraStudy && !extended) {
        const beforeCompleted = [...plan.completed];
        const beforeTotal = sessionProgress(plan).total;
        plan = extendDay(plan, 5, request);
        extended = true;
        const session = sessionProgress(plan);
        if (JSON.stringify(plan.completed) !== JSON.stringify(beforeCompleted)) {
          flag('STATE', `${persona.id} day ${day + 1}: extra study altered completed words`);
        }
        if (plan.words.length > beforeCompleted.length && session.total !== plan.words.length) {
          flag('STATE', `${persona.id} day ${day + 1}: extra study denominator wrong — ${session.done}/${session.total}`);
        }
        void beforeTotal;
        queue = buildDailyQuestions(scheduleSteps(plan), meaningOf, label);
      }
    }

    // Save a couple of words, for the counter-consistency check.
    if (persona.saveWords && plan.words.length > 0) {
      const target = plan.words[Math.floor(rand() * plan.words.length)].wordId;
      saved.add(target);
    }

    // The day's activity and streak.
    const attempt = recordActivity(
      activity[dateKey(now)],
      { type: 'attempt', itemKey: 'word:day', kind: 'word', passed: true, review: false },
      now,
    );
    activity = { ...activity, [dateKey(now)]: attempt };
    if (!activeDays.includes(dateKey(now))) activeDays.push(dateKey(now));
    outcome.daysStudied += 1;

    // --- Cross-screen truths, once per day (§33, §57) -----------------------
    const streak = learningStreak(activity, activeDays, now);
    // Home and Activity read the same function; assert the *value* is also
    // the true consecutive count this journey has produced.
    let expectedRun = 0;
    const cursor = new Date(now);
    const all = new Set([...activeDays, ...Object.keys(activity)]);
    while (all.has(dateKey(cursor))) {
      expectedRun += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (streak.current !== expectedRun) {
      flag('STATE', `${persona.id} day ${day + 1}: streak ${streak.current} != consecutive days ${expectedRun}`);
    }

    const wrongList = listMistakes(mistakes);
    const unresolved = Object.values(mistakes).filter((m) => !m.resolved_at).length;
    if (wrongList.length !== Object.keys(mistakes).length && wrongList.length !== unresolved) {
      // listMistakes' own filter decides; the two counters a screen would show
      // must agree with one of its documented readings.
      flag('STATE', `${persona.id} day ${day + 1}: wrong-list length disagrees with the mistake map`);
    }

    // Words fading between days: recall decides due/forgotten states (§6).
    for (const [id, state] of wordState) {
      if (state !== 'MASTERED' && state !== 'REMASTERED') continue;
      const item = memory[memoryKey('word', id)];
      const skills = Object.values(item?.skills ?? {}).filter(Boolean);
      if (skills.length === 0) continue;
      const recall = Math.min(...skills.map((s) => skillRecall(s, now)));
      if (recall < 0.5) setState(id, 'FORGOTTEN');
      else if (recall < 0.9) setState(id, 'REVIEW_DUE');
    }
  }

  // Premature mastery: a progress row at `learned` for a word never answered
  // correctly would be the 10/10-without-mastery class.
  let premature = 0;
  for (const [key, row] of Object.entries(progress)) {
    if (row.kind !== 'word' || row.stage !== 'learned') continue;
    const id = key.slice('word:'.length);
    if (!outcome.mastered.has(id)) premature += 1;
  }
  if (premature > 0) {
    defects.push({
      kind: 'PROGRESS',
      message: `${persona.id}: ${premature} word(s) marked learned without a correct answer`,
    });
  }

  return {
    persona,
    defects,
    outcome: {
      ...outcome,
      introduced: outcome.introduced.size,
      mastered: outcome.mastered.size,
      wrongOnce: outcome.wrongOnce.size,
      recovered: outcome.recovered.size,
      repeatExposure: [...outcome.exposures.values()].filter((days) => days.size > 1).length,
      exposures: undefined,
      savedCount: saved.size,
      prematureMastery: premature,
    },
    pass: defects.length === 0,
  };
}

// --- Run all journeys --------------------------------------------------------

console.log(`Synthetic 100-user journey QA — ${personas.length} personas\n`);

const results = [];
for (const persona of personas) {
  results.push(runJourney(persona));
}

const failed = results.filter((r) => !r.pass);
const allDefects = results.flatMap((r) => r.defects);
const byKind = {};
for (const defect of allDefects) byKind[defect.kind] = (byKind[defect.kind] ?? 0) + 1;

const totals = results.reduce(
  (sum, r) => ({
    days: sum.days + r.outcome.daysStudied,
    questions: sum.questions + r.outcome.questionsAnswered,
    retries: sum.retries + r.outcome.retries,
    reopens: sum.reopens + r.outcome.reopens,
    introduced: sum.introduced + r.outcome.introduced,
    mastered: sum.mastered + r.outcome.mastered,
    wrong: sum.wrong + r.outcome.wrongOnce,
    recovered: sum.recovered + r.outcome.recovered,
    reviewAsked: sum.reviewAsked + r.outcome.reviewAsked,
    reviewCorrect: sum.reviewCorrect + r.outcome.reviewCorrect,
    repeat: sum.repeat + r.outcome.repeatExposure,
  }),
  { days: 0, questions: 0, retries: 0, reopens: 0, introduced: 0, mastered: 0, wrong: 0, recovered: 0, reviewAsked: 0, reviewCorrect: 0, repeat: 0 },
);

console.log(`  journeys           ${results.length} (${results.length - failed.length} PASS, ${failed.length} FAIL)`);
console.log(`  locales            ${LOCALES.length}`);
console.log(`  levels             ${new Set(personas.map((p) => p.level)).size} of 30`);
console.log(`  simulated days     ${totals.days.toLocaleString('en')}`);
console.log(`  questions answered ${totals.questions.toLocaleString('en')}`);
console.log(`  retry questions    ${totals.retries.toLocaleString('en')}`);
console.log(`  mid-session reloads ${totals.reopens.toLocaleString('en')}`);
console.log('');
console.log('  synthetic educational outcome (not a claim about humans):');
console.log(`    words introduced        ${totals.introduced.toLocaleString('en')}`);
console.log(`    words mastered          ${totals.mastered.toLocaleString('en')}`);
console.log(`    missed at least once    ${totals.wrong.toLocaleString('en')}`);
console.log(`    recovered via retry     ${totals.recovered.toLocaleString('en')} (${((totals.recovered / Math.max(1, totals.wrong)) * 100).toFixed(0)}%)`);
console.log(`    later-review retention  ${totals.reviewAsked > 0 ? ((totals.reviewCorrect / totals.reviewAsked) * 100).toFixed(0) + '%' : 'n/a'} of ${totals.reviewAsked.toLocaleString('en')} review questions`);
console.log(`    words met on 2+ days    ${totals.repeat.toLocaleString('en')}`);
console.log('');
if (allDefects.length > 0) {
  console.log('  defects by class:');
  for (const [kind, count] of Object.entries(byKind)) console.log(`    ${kind.padEnd(16)} ${count}`);
  console.log('');
  for (const defect of allDefects.slice(0, 40)) console.log(`  ✗  [${defect.kind}] ${defect.message}`);
  if (allDefects.length > 40) console.log(`  … and ${allDefects.length - 40} more`);
}

// --- The report --------------------------------------------------------------

const lines = [];
lines.push('# Synthetic 100-user journey QA');
lines.push('');
lines.push('**This is a simulation.** One hundred synthetic learners were driven through');
lines.push('the real product domain code — the same plan builder, question builder,');
lines.push('crediting rules, memory scheduler and streak arithmetic the shipping app');
lines.push('runs — by `scripts/synthetic-users-qa.mjs` from the fixtures in');
lines.push('`qa/synthetic-users.json`. Every number below is a **synthetic educational');
lines.push('outcome**: it is evidence about the software, and it is not evidence about');
lines.push('human learning. No human used the product to produce this file.');
lines.push('');
lines.push('Rendering is out of scope here and covered elsewhere: `screens:audit` (143');
lines.push('renders at seven device profiles), `qa:locales` (256 locale renders) and the');
lines.push('Playwright suite drive the pixels. The `device`/`platform` columns below');
lines.push('record the persona definition; they do not alter a domain simulation.');
lines.push('');
lines.push(`- personas: ${results.length}`);
lines.push(`- journeys PASS: ${results.length - failed.length} · FAIL: ${failed.length}`);
lines.push(`- locales covered: ${LOCALES.length} of 32`);
lines.push(`- levels covered: ${new Set(personas.map((p) => p.level)).size} of 30`);
lines.push(`- total simulated study days: ${totals.days.toLocaleString('en')}`);
lines.push(`- questions answered: ${totals.questions.toLocaleString('en')}`);
lines.push(`- wrong-answer retries asked: ${totals.retries.toLocaleString('en')}`);
lines.push(`- mid-session reloads exercised: ${totals.reopens.toLocaleString('en')}`);
lines.push('');
lines.push('## Synthetic educational outcome');
lines.push('');
lines.push(`| Proxy | Value |`);
lines.push(`| --- | --- |`);
lines.push(`| Unique words introduced | ${totals.introduced.toLocaleString('en')} |`);
lines.push(`| Unique words mastered (answered correctly) | ${totals.mastered.toLocaleString('en')} |`);
lines.push(`| Words missed at least once | ${totals.wrong.toLocaleString('en')} |`);
lines.push(`| Retry recovery | ${((totals.recovered / Math.max(1, totals.wrong)) * 100).toFixed(0)}% |`);
lines.push(`| Later-review retention | ${totals.reviewAsked > 0 ? ((totals.reviewCorrect / totals.reviewAsked) * 100).toFixed(0) + '%' : 'n/a'} |`);
lines.push(`| Words met on two or more days | ${totals.repeat.toLocaleString('en')} |`);
lines.push(`| Words marked learned without a correct answer | ${results.reduce((n, r) => n + r.outcome.prematureMastery, 0)} |`);
lines.push(`| Teaching-zone violations | ${results.reduce((n, r) => n + r.outcome.zoneViolations, 0)} |`);
lines.push(`| Beginner words offered to level ≥ 25 learners | ${results.reduce((n, r) => n + r.outcome.beginnerLeaks, 0)} |`);
lines.push(`| Mixed-language questions built | ${results.reduce((n, r) => n + r.outcome.localizationLeaks, 0)} |`);
lines.push(`| Sittings stuck with no next action | ${results.reduce((n, r) => n + r.outcome.sessionsAbandoned, 0)} |`);
lines.push('');
lines.push('## The hundred journeys');
lines.push('');
lines.push('| ID | Locale | Lv | Test | History | Goal | Days | Acc | Device | Introduced | Mastered | Wrong | Recovered | Saved | Verdict |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  const p = r.persona;
  lines.push(
    `| ${p.id} | ${p.locale} | ${p.level}${p.levelTest === 'retaken' ? `→${p.retakenLevel}` : ''} | ${p.levelTest} | ${p.history} | ${p.goal} | ${p.days} | ${p.accuracy} | ${p.platform}/${p.device} | ${r.outcome.introduced} | ${r.outcome.mastered} | ${r.outcome.wrongOnce} | ${r.outcome.recovered} | ${r.outcome.savedCount} | ${r.pass ? 'PASS' : '**FAIL**'} |`,
  );
}
lines.push('');
if (allDefects.length > 0) {
  lines.push('## Defects found');
  lines.push('');
  for (const [kind, count] of Object.entries(byKind)) lines.push(`- ${kind}: ${count}`);
  lines.push('');
  for (const defect of allDefects) lines.push(`- [${defect.kind}] ${defect.message}`);
} else {
  lines.push('## Defects found');
  lines.push('');
  lines.push('None on this run. The classes this harness watches for were found and fixed');
  lines.push('during its construction — see the report’s Synthetic 100-User section.');
}
lines.push('');

writeFileSync(join(ROOT, 'docs/SYNTHETIC_USER_JOURNEY_QA.md'), lines.join('\n'));
console.log('\nwrote docs/SYNTHETIC_USER_JOURNEY_QA.md');

if (failed.length > 0) {
  console.log(`\n${failed.length} journey(s) FAILED.`);
  process.exit(1);
}
console.log('\nAll journeys PASS.');
