#!/usr/bin/env node
/**
 * Is Today's Vocabulary level-appropriate — for every level, on every day?
 *
 *   npm run dailyplan:level            simulate, and write the audit
 *   npm run dailyplan:level -- --check the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * A learner measured at Level 30 opened Today's Vocabulary and was taught
 * 그래서 — a Level 2 conjunction — as the first word of their day. The report
 * said the level rules were proven; the product did this anyway.
 *
 * The existing gate, `dailyvocab:qa`, could not see it. It simulates three
 * learners (levels 8, 14 and 20) with **empty progress**, and asserts an
 * *aggregate*: that most new words land within one level of the learner. Both
 * choices are exactly where the defect lived:
 *
 * - **Empty progress.** The learner in the bug report had a progress row for
 *   그래서 and no memory row, because the app writes a progress row when a word
 *   is *shown* and a memory row only when one is *answered*. They had been shown
 *   three words at the default level, left without answering, and then sat the
 *   Level Test. `weakestRecall` returned 0 for a word with no memory — the
 *   strongest claim it can make — so all three were classified `weak` and
 *   scheduled ahead of everything the learner's level had chosen.
 * - **An aggregate.** Those three words were three of ten. A distribution check
 *   is comfortably satisfied by a plan whose first three items are wrong, and
 *   the first item is the one the learner actually sees.
 *
 * So this simulates **thirty levels × thirty consecutive days × four profiles**,
 * asks about the *first* word as well as the distribution, and writes the whole
 * thing out as an auditable table.
 *
 * ## The profiles
 *
 * | | |
 * | --- | --- |
 * | `new` | never studied. The first-day case. |
 * | `shown-not-answered` | met words with no memory behind them — the reported defect, exactly |
 * | `partial` | halfway through the level below, with real memory |
 * | `advanced` | the level's own words mostly learned, so `levelFromProgress` has moved |
 *
 * ## The policy, as assertions
 *
 * 1. Every new word sits inside the teaching zone, or one level either side of
 *    it where the zone ran out — never further, and the widening is counted.
 * 2. **No word outside the teaching zone may be first.** Consolidation is
 *    allowed to reach any level, and it is *not* allowed to be the thing a
 *    learner opens their day on while carrying a `new`-shaped question.
 * 3. A word the learner has answered correctly to mastery never returns as new.
 * 4. A shortage is reported as a shortage. A plan that cannot be filled from the
 *    band comes up short and says so; it does not reach further down.
 *
 * ## The audit
 *
 * `docs/vocabulary-plan-audit.json` — one row per planned word, carrying the
 * learner's level, the teaching zone it was chosen from, the word, that word's
 * assigned level, why it is in the plan, its mastery state, whether the locale
 * can ask about it, the plan's date and the level epoch the plan was built at.
 * That is the thing that was missing when the bug was reported: there was no way
 * to ask the product *why* 그래서 was in the plan.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpusForNode } from './lib/corpus.mjs';

await loadCorpusForNode();

const { vocabularyByPriority } = await import('../apps/web/src/data/vocabulary.ts');
const { buildDailyPlan, rebuildPlanForLevel } = await import(
  '../apps/web/src/domain/vocabularyDay.ts'
);
const { teachingZone, recentlyIntroduced } = await import(
  '../apps/web/src/domain/vocabularyLevel.ts'
);
const { dayOrdinal, dateKey } = await import('../apps/web/src/domain/progress.ts');
const { blankMemory, memoryKey, skillsFor } = await import('../apps/web/src/domain/memory.ts');

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CHECK = process.argv.includes('--check');

const LEVELS = 30;
const DAYS = 30;
const GOAL = 10;

const corpus = vocabularyByPriority();
const byId = new Map(corpus.map((word) => [word.id, word]));

const findings = [];
const fail = (what) => findings.push(what);

/**
 * The word the reported defect named.
 *
 * Pinned by headword rather than by id, and asserted to exist: a regression
 * fixture that silently stops covering its case because the word was renamed is
 * worse than no fixture.
 */
const REPORTED = corpus.find((word) => word.word === '그래서');
if (!REPORTED) fail('그래서 is not in the corpus — the named regression cannot be checked');

/** A learner's stored state, in the shapes the store keeps them in. */
function profileFor(kind, level, now) {
  const progress = {};
  const memory = {};
  const stamp = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const met = (word, { answered, due = false }) => {
    progress[`word:${word.id}`] = {
      kind: 'word',
      item_key: word.id,
      stage: answered ? 'learned' : 'introduced',
      first_seen_at: stamp,
    };
    if (!answered) return;
    /*
      A memory row built the way `applyReview` leaves one: a stability far
      enough out that the word is not due, and a streak past `FAMILIAR_STREAK`
      on every skill the kind has. Written directly rather than by replaying
      reviews, because what is being simulated is a learner who *arrives*
      knowing this — the schedule maths is `memory.test.ts`'s subject.
    */
    const key = memoryKey('word', word.id);
    const item = blankMemory('word', word.id);
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const long = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    for (const skill of skillsFor('word')) {
      item.skills[skill] = {
        skill,
        // `due` puts the last review three months back against a short
        // stability, which is a word the learner really is losing.
        stability_days: due ? 3 : 60,
        difficulty: due ? 0.7 : 0.2,
        last_reviewed_at: due ? long : stamp,
        next_review_at: due ? stamp : soon,
        streak: due ? 0 : 4,
        lapses: due ? 3 : 0,
        recent_score: due ? 0 : 1,
        last_response_ms: null,
        hints: 0,
      };
    }
    memory[key] = item;
  };

  if (kind === 'new') return { progress, memory };

  if (kind === 'shown-not-answered') {
    /*
     * The reported learner. Shown a handful of beginner words at the default
     * level, left without answering any of them, then measured. Every one of
     * these has a progress row and no memory row, which is the exact state that
     * used to score recall 0 and outrank the whole plan.
     */
    const beginner = corpus.filter((word) => word.level <= 2).slice(0, 6);
    for (const word of beginner) met(word, { answered: false });
    if (REPORTED) met(REPORTED, { answered: false });
    return { progress, memory };
  }

  if (kind === 'easy-words-due') {
    /*
     * §7's case. A learner at the top of the scale who is genuinely losing a
     * handful of beginner words. Those are real evidence and Review owns them;
     * what must not happen is the day *opening* on one, wearing the shape of
     * today's new material.
     */
    const beginner = corpus.filter((word) => word.level <= 3).slice(0, 8);
    for (const word of beginner) met(word, { answered: true, due: true });
    return { progress, memory };
  }

  if (kind === 'partial') {
    const below = corpus.filter((word) => word.level === Math.max(1, level - 1));
    for (const word of below.slice(0, Math.ceil(below.length / 2))) met(word, { answered: true });
    return { progress, memory };
  }

  // advanced: most of the learner's own level is done.
  const own = corpus.filter((word) => word.level <= level);
  for (const word of own.slice(0, Math.floor(own.length * 0.7))) met(word, { answered: true });
  return { progress, memory };
}

const PROFILES = ['new', 'shown-not-answered', 'easy-words-due', 'partial', 'advanced'];

/** The days written into the audit. Every day is still simulated and asserted. */
const MILESTONES = [1, 2, 7, 30];

const rows = [];
const shortages = [];
let plans = 0;

for (const kind of PROFILES) {
  for (let level = 1; level <= LEVELS; level += 1) {
    const zone = teachingZone(level);
    const start = Date.UTC(2026, 8, 4);
    const base = profileFor(kind, level, new Date(start));

    for (let day = 0; day < DAYS; day += 1) {
      const now = new Date(start + day * 24 * 60 * 60 * 1000);
      const plan = buildDailyPlan({
        progress: base.progress,
        memory: base.memory,
        corpus,
        goal: GOAL,
        now,
        level,
        seed: `seed-${kind}-${level}`,
        dayIndex: dayOrdinal(now),
        recentlyIntroduced: recentlyIntroduced(base.progress, now),
      });
      plans += 1;

      plan.words.forEach((planned, index) => {
        const word = byId.get(planned.wordId);
        if (!word) {
          fail(`${kind} L${level} day ${day + 1}: planned a word that is not in the corpus`);
          return;
        }
        const row = {
          profile: kind,
          learner_level: level,
          teaching_zone: [zone.min, zone.max],
          day: day + 1,
          plan_date: plan.date,
          level_epoch: plan.level,
          position: index,
          word: word.word,
          word_id: word.id,
          assigned_level: word.level,
          reason: planned.source,
          mastery: base.progress[`word:${word.id}`]?.stage ?? 'unseen',
          practised: Boolean(base.memory[memoryKey('word', word.id)]),
          // Every locale that has a pack can ask about every word in it; the
          // partial locales are covered by `locale:content:qa`, which owns that
          // question. Recorded so the audit row is complete.
          locale_askable: true,
          steps: planned.steps,
        };
        rows.push(row);

        // 1 — new material never leaves the band.
        if (planned.source === 'new') {
          const outside = word.level < zone.min - 1 || word.level > zone.max + 1;
          if (outside) {
            fail(
              `${kind} L${level} day ${day + 1}: new word ${word.word} is level ${word.level}, ` +
                `outside the teaching zone ${zone.min}–${zone.max} and its one-level margin`,
            );
          }
        }

        // 2 — nothing from outside the band may open the day.
        if (index === 0 && (word.level < zone.min - 1 || word.level > zone.max + 1)) {
          fail(
            `${kind} L${level} day ${day + 1}: the day opens on ${word.word} (level ` +
              `${word.level}, ${planned.source}), outside the teaching zone ${zone.min}–${zone.max}`,
          );
        }

        // 3 — mastered work does not come back as new.
        if (planned.source === 'new' && row.mastery === 'learned') {
          fail(`${kind} L${level} day ${day + 1}: ${word.word} is learned and was offered as new`);
        }
      });

      // 4 — a short day is a content shortage, and is counted rather than
      // silently filled from somewhere else.
      if (plan.words.length < GOAL) {
        shortages.push({ profile: kind, level, day: day + 1, got: plan.words.length });
      }
    }
  }
}

/*
 * The named regression, through the path the product actually takes.
 *
 * Day one at the default level with nothing studied; three words shown and none
 * answered; then the Level Test comes back at 30 and the plan is rebuilt for
 * the new level exactly as `LearnerProvider` rebuilds it. 그래서 must not be in
 * the result, and nothing under the band may open the day.
 */
if (REPORTED) {
  const now = new Date(Date.UTC(2026, 8, 4));
  const request = (level, progress, memory) => ({
    progress,
    memory,
    corpus,
    goal: GOAL,
    now,
    level,
    seed: 'reported-defect',
    dayIndex: dayOrdinal(now),
    recentlyIntroduced: recentlyIntroduced(progress, now),
  });

  const progress = {};
  const memory = {};
  const first = buildDailyPlan(request(1, progress, memory));
  for (const planned of first.words.slice(0, 3)) {
    progress[`word:${planned.wordId}`] = {
      kind: 'word',
      item_key: planned.wordId,
      stage: 'introduced',
      first_seen_at: now.toISOString(),
    };
  }
  progress[`word:${REPORTED.id}`] = {
    kind: 'word',
    item_key: REPORTED.id,
    stage: 'introduced',
    first_seen_at: now.toISOString(),
  };

  const rebuilt = rebuildPlanForLevel(first, request(30, progress, memory));
  const fresh = buildDailyPlan(request(30, progress, memory));
  for (const [what, plan] of [
    ['the rebuilt plan', rebuilt],
    ["the next day's plan", fresh],
  ]) {
    const carries = plan.words.find((planned) => planned.wordId === REPORTED.id);
    if (carries) {
      fail(`the reported defect is back: ${what} at Level 30 contains 그래서 (${carries.source})`);
    }
    const opener = byId.get(plan.words[0]?.wordId ?? '');
    if (opener && opener.level < 27) {
      fail(
        `the reported defect is back: ${what} at Level 30 opens on ${opener.word}, level ${opener.level}`,
      );
    }
  }
}

// --- the audit ---------------------------------------------------------------

if (!CHECK) {
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(
    join(ROOT, 'docs/vocabulary-plan-audit.json'),
    `${JSON.stringify(
      {
        _comment:
          'GENERATED by npm run dailyplan:level. One row per planned word, with the level, ' +
          'the zone it was chosen from, why it is there and what the learner already knew.',
        generated_from: `${PROFILES.length} profiles x ${LEVELS} levels x ${DAYS} days`,
        plans,
        words_planned: rows.length,
        shortages,
        /*
          The whole simulation is 45,000 rows and about 1.7 MB, which is a file
          nobody opens. What is kept is the part the defect was about — the word
          the learner *opens the day on* — on four days that between them cover a
          first sitting, a settled routine and a month in, plus one whole plan
          per profile so a reader can see what a day actually looks like.
        */
        openers: rows.filter((row) => row.position === 0 && MILESTONES.includes(row.day)),
        one_full_plan_per_profile: PROFILES.map((profile) =>
          rows.filter((row) => row.profile === profile && row.learner_level === 30 && row.day === 1),
        ),
      },
      null,
      1,
    )}\n`,
  );
}

// --- report ------------------------------------------------------------------

const newRows = rows.filter((row) => row.reason === 'new');
const atLevel = newRows.filter((row) => row.assigned_level === row.learner_level).length;
const within = newRows.filter(
  (row) => Math.abs(row.assigned_level - row.learner_level) <= 1,
).length;
const openers = rows.filter((row) => row.position === 0);
const openerOutside = openers.filter(
  (row) => row.assigned_level < row.teaching_zone[0] - 1 || row.assigned_level > row.teaching_zone[1] + 1,
).length;

console.log(
  `Daily plan by level — ${PROFILES.length} profiles x ${LEVELS} levels x ${DAYS} days = ${plans} plans\n`,
);
console.log(`  words planned            ${rows.length}`);
console.log(`  of them new              ${newRows.length}`);
console.log(
  `  new words at the level   ${((atLevel / newRows.length) * 100).toFixed(0)}%, within one level ${((within / newRows.length) * 100).toFixed(0)}%`,
);
console.log(`  days opened outside band ${openerOutside}`);
console.log(`  short days               ${shortages.length} of ${plans}`);
if (shortages.length > 0) {
  const worst = shortages.reduce((a, b) => (a.got <= b.got ? a : b));
  console.log(
    `    worst: ${worst.profile} at level ${worst.level}, day ${worst.day} — ${worst.got} of ${GOAL}`,
  );
  const levels = [...new Set(shortages.map((s) => s.level))].sort((a, b) => a - b);
  console.log(`    levels that ever run short: ${levels.join(', ')}`);
}
if (!CHECK) console.log(`\n  audit: docs/vocabulary-plan-audit.json`);

if (findings.length === 0) {
  console.log('\nevery level is taught from its own band, and no day opens on a word from');
  console.log('outside it — including the Level 30 learner who was being taught 그래서.');
} else {
  const shown = findings.slice(0, 25);
  console.log(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}:`);
  for (const finding of shown) console.log(`  - ${finding}`);
  if (findings.length > shown.length) console.log(`  … and ${findings.length - shown.length} more`);
}
if (CHECK && findings.length > 0) process.exit(1);
