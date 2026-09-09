#!/usr/bin/env node
/**
 * Whether a beginner can be shown something they cannot read.
 *
 *   npx tsx scripts/level-test-policy-qa.mjs           print what a beginner meets
 *   npx tsx scripts/level-test-policy-qa.mjs --check   fail the build on any breach
 *
 * ## The defect this exists for
 *
 * A tester who had recently learnt Hangul answered three word questions
 * correctly and was given this as question four:
 *
 *     물을 안 줘서 화분의 꽃이 ____.        도왔어요 · 떠났어요 · 배웠어요 · 죽었어요
 *
 * Two clauses, a negation, a causal connective, an inference, and 화분 — a
 * level-28 word. The item was **level 7**, because 죽다 is a level-7 word and a
 * contextual item took its difficulty from the word removed from it and from
 * nothing else. 629 of 629 did.
 *
 * Every gate over the bank passed. `leveltest:qa` measured "of a level-2
 * learner's first five questions, the share more than six levels above them"
 * and reported 1.0%, because a level-7 question put to a level-2 learner is
 * five levels above them and the threshold was six.
 *
 * ## What this checks, and why here
 *
 * Three things no other gate asks, each one a property of the *artefact* rather
 * than of the intention that built it:
 *
 * 1. **Every contextual item's level is justified by its own sentence.**
 *    `sentence_demand` computed the floors when the bank was built; this reads
 *    them back off the item and re-applies them, so a builder that stopped
 *    calling it would be caught rather than trusted.
 * 2. **The foundation band contains nothing a beginner cannot read.** No
 *    connective, negation, nominaliser, relative clause or formal ending in
 *    levels 1–3, and no frame longer than four eojeol.
 * 3. **No response history can reach past the band it has earned.** The
 *    interesting half: a full replay of the selection path — the real
 *    `nextLevel`, the real pool fallback, the real seeds — over beginner
 *    response patterns, asserting that nothing above the earned ceiling is ever
 *    presented and that the opening five questions are words.
 *
 * The third is what would have caught the reported defect, and it is the reason
 * this is a separate program rather than three more rules in the ambiguity gate:
 * it has to *run a sitting*, and the ambiguity gate reads items.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OPENING_ITEMS,
  bandOf,
  bandTop,
  nextLevel,
  pickIndex,
  planKinds,
  reachCeiling,
  shouldStop,
} from '../apps/web/src/domain/levelTest.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');
const read = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

const manifest = read('apps', 'web', 'public', 'level-test', 'manifest.json');
const bank = read('apps', 'web', 'public', 'level-test', manifest.bank);
const items = bank.items;
const contexts = items.filter((item) => item.kind === 'context');

const problems = [];
const fail = (rule, detail) => problems.push({ rule, detail });

/* --- 1. every contextual level is justified ------------------------------- */

/**
 * The floors `sentence_demand` applies, restated here.
 *
 * Deliberately a second copy, and the only place in this repository where that
 * is the right thing to do: the point of the check is to catch a bank whose
 * levels no longer follow from its own recorded demand, and a check that
 * imported the producer's numbers could not see a producer that stopped running.
 */
const GRAMMAR_FLOOR = {
  past: 3,
  negation: 5,
  connective: 8,
  adnominal: 10,
  nominaliser: 10,
  honorific: 12,
  'uncommon-particle': 12,
  'two-clauses': 14,
  formal: 16,
  quoted: 18,
  'passive-causative': 18,
  'formal-connective': 22,
};
const LENGTH_FLOOR = [
  [7, 17],
  [6, 13],
  [5, 9],
  [4, 5],
];
const lengthFloor = (eojeol) => LENGTH_FLOOR.find(([at]) => eojeol >= at)?.[1] ?? 1;

for (const item of contexts) {
  const demand = item.demand;
  if (!demand) {
    fail('no-demand', `${item.id} carries no demand metadata`);
    continue;
  }
  const floors = [
    demand.noun ?? 0,
    lengthFloor(demand.eojeol ?? 0),
    ...(demand.grammar ?? []).map((name) => GRAMMAR_FLOOR[name] ?? 0),
  ];
  const wanted = Math.max(...floors);
  if (item.level < wanted) {
    fail(
      'level-below-demand',
      `${item.id} is level ${item.level} and its sentence demands ${wanted} ` +
        `(${item.prompt} — ${(demand.grammar ?? []).join(', ') || 'no grammar'}, ` +
        `hardest word ${demand.hardest ?? '—'} L${demand.noun ?? 0}, ${demand.eojeol} eojeol)`,
    );
  }
}

/* --- 2. the foundation band is readable ----------------------------------- */

/** Constructions that have no business in a learner's first band. */
const FORBIDDEN_IN_FOUNDATION = new Set([
  'negation',
  'connective',
  'adnominal',
  'nominaliser',
  'honorific',
  'uncommon-particle',
  'two-clauses',
  'formal',
  'quoted',
  'passive-causative',
  'formal-connective',
]);
const FOUNDATION_EOJEOL = 4;

for (const item of contexts.filter((one) => one.level <= bandTop(0))) {
  for (const name of item.demand?.grammar ?? []) {
    if (FORBIDDEN_IN_FOUNDATION.has(name)) {
      fail('foundation-grammar', `${item.id} is in the foundation band and uses ${name}: ${item.prompt}`);
    }
  }
  if ((item.demand?.eojeol ?? 0) > FOUNDATION_EOJEOL) {
    fail(
      'foundation-length',
      `${item.id} is in the foundation band with ${item.demand.eojeol} eojeol: ${item.prompt}`,
    );
  }
}

/* --- 3. no history reaches past what it earned ---------------------------- */

const byId = new Map(items.map((item) => [item.id, item]));
const byLevel = new Map();
const byLevelKind = new Map();
for (const item of items) {
  if (!byLevel.has(item.level)) byLevel.set(item.level, []);
  byLevel.get(item.level).push(item);
  const key = `${item.level}:${item.kind}`;
  if (!byLevelKind.has(key)) byLevelKind.set(key, []);
  byLevelKind.get(key).push(item);
}
const WORD_COOLDOWN = 6;

/** One sitting, through the same path the screen takes. */
function sit(respond, seed) {
  const kinds = planKinds();
  const presented = [];
  const responses = [];
  const shown = [];
  for (;;) {
    const history = presented.map((id, at) => ({
      level: byId.get(id).level,
      response: responses[at],
      kind: byId.get(id).kind,
    }));
    if (shouldStop(history)) break;
    const index = history.length;
    const wanted = kinds[index] ?? 'meaning';
    const used = new Set(presented);
    const unused = (list) => (list ?? []).filter((item) => !used.has(item.id));
    const open = [...byLevel.keys()].filter((level) => unused(byLevel.get(level)).length > 0);
    const level = nextLevel(history, open, { previousLevel: null });
    if (level === null) break;
    const ceiling = reachCeiling(history);
    let pool = unused(byLevelKind.get(`${level}:${wanted}`));
    if (pool.length === 0) {
      for (const nearby of [level - 1, level + 1, level - 2, level + 2]) {
        if (nearby < 1 || nearby > ceiling) continue;
        pool = unused(byLevelKind.get(`${nearby}:${wanted}`));
        if (pool.length > 0) break;
      }
    }
    if (pool.length === 0) pool = unused(byLevel.get(level));
    if (pool.length === 0) break;
    const wordOf = (id) => id.split(':')[0];
    const seen = new Set(presented.map(wordOf));
    const distinct = pool.filter((item) => !seen.has(wordOf(item.id)));
    const noRepeat = distinct.length > 0 ? distinct : pool;
    const cooling = new Set(presented.map(wordOf).slice(-WORD_COOLDOWN));
    const spaced = noRepeat.filter((item) => !cooling.has(wordOf(item.id)));
    const respectful = spaced.length > 0 ? spaced : noRepeat;
    const ordered = [...respectful].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const item = ordered[pickIndex(seed, index, ordered.length)];
    shown.push({ item, ceiling, index });
    presented.push(item.id);
    responses.push(respond(item, index));
  }
  return shown;
}

/**
 * The learners this gate is for.
 *
 * Every one of them is somebody who should never meet a two-clause sentence,
 * and the last two are the reported cases: a learner who answers the opening
 * correctly by recognition, and one who then stops.
 */
const BEGINNERS = [
  ['answers nothing correctly', () => 'wrong'],
  ["says I don't know to everything", () => 'unknown'],
  ['knows only the first band', (item) => (item.level <= bandTop(0) ? 'correct' : 'unknown')],
  ['recognises words, cannot read sentences', (item) => (item.kind === 'context' ? 'wrong' : 'correct')],
  ['opens correctly, then stops', (_item, at) => (at < 3 ? 'correct' : 'wrong')],
  ['alternates', (_item, at) => (at % 2 === 0 ? 'correct' : 'wrong')],
];
const SEEDS = ['seed-a', 'seed-b', 'seed-c', 'seed-d', 'seed-e', 'seed-f', 'seed-g', 'seed-h'];

const walked = [];
for (const [label, respond] of BEGINNERS) {
  for (const seed of SEEDS) {
    const shown = sit(respond, seed);
    for (const { item, ceiling, index } of shown) {
      if (item.level > ceiling) {
        fail(
          'above-the-ceiling',
          `"${label}" (${seed}) was asked level ${item.level} at Q${index + 1} with a ceiling of ${ceiling}: ${item.prompt ?? item.promptId}`,
        );
      }
      if (index < OPENING_ITEMS && item.kind === 'context') {
        fail(
          'sentence-in-the-opening',
          `"${label}" (${seed}) met a sentence at Q${index + 1}: ${item.prompt}`,
        );
      }
    }
    walked.push({ label, seed, shown });
  }
}

/* --- what it found -------------------------------------------------------- */

const perBand = new Map();
for (const item of contexts) {
  const band = bandOf(item.level);
  perBand.set(band, (perBand.get(band) ?? 0) + 1);
}

console.log(
  `Level Test policy — ${contexts.length.toLocaleString('en')} contextual items, ` +
    `${BEGINNERS.length} beginner profiles × ${SEEDS.length} seeds\n`,
);
console.log('  contextual items by band:');
for (const band of [...perBand.keys()].sort((a, b) => a - b)) {
  console.log(`    band ${band + 1}  ${String(perBand.get(band)).padStart(4)}`);
}
console.log('\n  what each beginner profile met, worst seed:');
for (const [label] of BEGINNERS) {
  const runs = walked.filter((run) => run.label === label);
  const worst = runs.reduce((a, b) =>
    Math.max(...b.shown.map((s) => s.item.level)) > Math.max(...a.shown.map((s) => s.item.level)) ? b : a,
  );
  const levels = worst.shown.map((s) => s.item.level);
  const sentences = worst.shown.filter((s) => s.item.kind === 'context').length;
  const firstSentence = worst.shown.findIndex((s) => s.item.kind === 'context') + 1;
  console.log(
    `    ${label.padEnd(42)} highest L${String(Math.max(...levels)).padStart(2)}  ` +
      `${String(worst.shown.length).padStart(2)}q  ${String(sentences).padStart(2)} sentences, ` +
      `first at ${firstSentence ? `Q${firstSentence}` : '—'}`,
  );
}

if (problems.length === 0) {
  console.log('\n  every contextual level follows from its own sentence, the foundation band is');
  console.log('  readable, and no beginner path reaches past the band it earned.');
  process.exit(0);
}
const byRule = new Map();
for (const problem of problems) byRule.set(problem.rule, (byRule.get(problem.rule) ?? 0) + 1);
console.error(`\n${problems.length} problem(s):\n`);
for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.error(`  ${String(count).padStart(5)}  ${rule}`);
}
console.error('');
for (const problem of problems.slice(0, 20)) console.error(`  ${problem.rule}: ${problem.detail}`);
if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
process.exit(CHECK ? 1 : 0);
