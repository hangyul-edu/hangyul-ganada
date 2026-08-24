#!/usr/bin/env node
/**
 * Does the Vocabulary Level Test find the level a learner actually has?
 *
 *   npm run leveltest:qa            report
 *   npm run leveltest:qa -- --check fail if accuracy or length regress
 *
 * ## Why a simulation and not a unit test
 *
 * Every part of this can be individually correct and the whole thing still
 * place people wrongly: the prior can be too strong, the stopping rule too
 * eager, the item bank too thin at one end, the guessing floor mis-set. None of
 * that shows up in a test of `estimate()` — it shows up as a learner at level 22
 * being told they are 17.
 *
 * So this runs the real engine against the real bank, for simulated learners at
 * every level, answering the way the model says a person of that ability would:
 * knowing a word with probability σ(θ − b), guessing a quarter of the rest, and
 * saying *I don't know* to the ones they neither know nor guess. Then it asks
 * how far the answers landed from the truth.
 *
 * ## What it does not prove
 *
 * That the model matches real people. A simulation is a check on the machinery,
 * not on the assumption underneath it, and it will report excellent accuracy
 * for a badly calibrated bank as long as the bank is wrong in the same way the
 * simulation is. What would settle it is data from learners, which does not
 * exist yet, and this file should not be quoted as if it did.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPOSITION,
  ITEM_COUNT,
  LEVELS,
  estimate,
  nextLevel,
  planKinds,
  shouldStop,
} from '../apps/web/src/domain/levelTest.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');

const manifest = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/public/level-test/manifest.json'), 'utf8'),
);
const bank = JSON.parse(
  readFileSync(join(ROOT, `apps/web/public/level-test/${manifest.bank}`), 'utf8'),
);

/** Deterministic: an accuracy figure that moves between runs is not a figure. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const LOGITS_PER_LEVEL = 0.3;
const GUESS = 0.25;

const byLevel = new Map();
const byLevelKind = new Map();
for (const item of bank.items) {
  const list = byLevel.get(item.level) ?? [];
  list.push(item);
  byLevel.set(item.level, list);
  const key = `${item.level}:${item.kind}`;
  const kindList = byLevelKind.get(key) ?? [];
  kindList.push(item);
  byLevelKind.set(key, kindList);
}
const levelsAvailable = [...byLevel.keys()].sort((a, b) => a - b);
const KINDS = planKinds();

/** One sitting, for a learner whose true level is `truth`. */
function sit(truth, random, kindsAsked = new Map()) {
  const asked = [];
  const used = new Set();
  while (!shouldStop(asked)) {
    const open = levelsAvailable.filter((level) =>
      (byLevel.get(level) ?? []).some((item) => !used.has(item.id)),
    );
    const level = nextLevel(asked, open);
    if (level === null) break;
    /*
     * The same fallback the screen uses, because a simulation that draws from
     * the whole level is measuring a test nobody sits. Twelve of the thirty
     * questions are contextual and the contextual bank thins out above level
     * 23, so the fallback fires in real sittings and has to fire here.
     */
    const wanted = KINDS[asked.length] ?? 'meaning';
    const unused = (list) => (list ?? []).filter((item) => !used.has(item.id));
    let pool = unused(byLevelKind.get(`${level}:${wanted}`));
    if (pool.length === 0) {
      for (const nearby of [level - 1, level + 1, level - 2, level + 2]) {
        pool = unused(byLevelKind.get(`${nearby}:${wanted}`));
        if (pool.length > 0) break;
      }
    }
    if (pool.length === 0) pool = unused(byLevel.get(level));
    if (pool.length === 0) break;
    const item = pool[Math.floor(random() * pool.length)];
    used.add(item.id);
    kindsAsked.set(item.kind, (kindsAsked.get(item.kind) ?? 0) + 1);

    // How a learner of this ability answers: they either know the word, or they
    // guess and land it a quarter of the time, or they say so.
    const knows = 1 / (1 + Math.exp(-(truth - level) * LOGITS_PER_LEVEL));
    let response;
    if (random() < knows) response = 'correct';
    else if (random() < GUESS) response = 'correct';
    else response = random() < 0.5 ? 'unknown' : 'wrong';

    asked.push({ level, response });
  }
  return { asked, result: estimate(asked) };
}

const RUNS = 200;
const errors = [];
const lengths = [];
const perLevel = [];
const kindTotals = new Map();

for (let truth = 1; truth <= LEVELS; truth += 1) {
  const random = rng(1000 + truth);
  const mine = [];
  for (let run = 0; run < RUNS; run += 1) {
    const { asked, result } = sit(truth, random, kindTotals);
    mine.push(result.reported - truth);
    errors.push(Math.abs(result.reported - truth));
    lengths.push(asked.length);
  }
  const bias = mine.reduce((a, b) => a + b, 0) / mine.length;
  const mae = mine.reduce((a, b) => a + Math.abs(b), 0) / mine.length;
  perLevel.push({ truth, bias, mae, deltas: mine });
}

const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
const within3 = errors.filter((e) => e <= 3).length / errors.length;
const within5 = errors.filter((e) => e <= 5).length / errors.length;
const medianItems = [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length / 2)];
const minItems = Math.min(...lengths);
const maxItems = Math.max(...lengths);

console.log(
  `Vocabulary Level Test — ${bank.items.length.toLocaleString('en')} items, ` +
    `${LEVELS} levels, ${RUNS} simulated sittings per level\n`,
);
console.log(`  mean absolute error   ${mae.toFixed(2)} levels`);
console.log(`  within ±3 levels      ${(within3 * 100).toFixed(1)}%`);
console.log(`  within ±5 levels      ${(within5 * 100).toFixed(1)}%`);
console.log(`  items asked           ${minItems}–${maxItems}, median ${medianItems}`);
console.log(`  bank per level        min ${Math.min(...byLevel.values().map?.((v) => v.length) ?? [0])}`);

/*
 * Error by band, because a good global figure hides the failure that matters.
 *
 * §32 and §33. A test can place the middle of the scale beautifully and
 * compress the top — every advanced learner comes out at 23 because the bank
 * has nothing harder to ask them — and the mean absolute error over all thirty
 * levels barely moves. The band table is what makes that visible, and `bias` is
 * the column to read: a large negative bias at the top *is* compression.
 */
const BANDS = [
  { label: 'levels 1–5', min: 1, max: 5 },
  { label: 'levels 6–10', min: 6, max: 10 },
  { label: 'levels 11–20', min: 11, max: 20 },
  { label: 'levels 21–25', min: 21, max: 25 },
  { label: 'levels 26–30', min: 26, max: 30 },
];
console.log('\n  error by band — a good average can hide a compressed top:');
console.log('    band            MAE   bias   ±1     ±2     ±3');
const bandRows = [];
for (const band of BANDS) {
  const rows = perLevel.filter((r) => r.truth >= band.min && r.truth <= band.max);
  const all = rows.flatMap((r) => r.deltas);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const share = (n) => all.filter((d) => Math.abs(d) <= n).length / Math.max(1, all.length);
  const row = {
    label: band.label,
    mae: mean(all.map(Math.abs)),
    bias: mean(all),
    within1: share(1),
    within2: share(2),
    within3: share(3),
  };
  bandRows.push(row);
  console.log(
    `    ${row.label.padEnd(14)} ${row.mae.toFixed(2)}  ${(row.bias >= 0 ? '+' : '') + row.bias.toFixed(2)}  ` +
      `${(row.within1 * 100).toFixed(0).padStart(4)}%  ${(row.within2 * 100).toFixed(0).padStart(4)}%  ` +
      `${(row.within3 * 100).toFixed(0).padStart(4)}%`,
  );
}

const worst = [...perLevel].sort((a, b) => b.mae - a.mae).slice(0, 5);
console.log('\n  hardest levels to place:');
for (const row of worst) {
  console.log(`    level ${String(row.truth).padStart(2)}  error ${row.mae.toFixed(2)}  bias ${row.bias >= 0 ? '+' : ''}${row.bias.toFixed(2)}`);
}

const problems = [];
if (within3 < 0.9) problems.push(`only ${(within3 * 100).toFixed(1)}% of sittings land within ±3 levels`);
if (mae > 2) problems.push(`mean absolute error is ${mae.toFixed(2)} levels`);
/*
 * Compression, checked rather than eyeballed.
 *
 * A band whose learners are pulled two whole levels toward the middle is a band
 * the test cannot see. Two levels is the threshold because one is inside the
 * noise of a thirty-item adaptive walk and three is a different product.
 */
for (const row of bandRows) {
  if (Math.abs(row.bias) > 2) {
    problems.push(`${row.label} are placed ${row.bias.toFixed(2)} levels from the truth on average`);
  }
}
if (maxItems !== ITEM_COUNT || minItems !== ITEM_COUNT) {
  problems.push(`sittings asked ${minItems}–${maxItems} items; every one must ask exactly ${ITEM_COUNT}`);
}

/*
 * And the composition, which is a promise the intro screen makes.
 *
 * Not exactly 12/9/9 in every sitting: a learner placed at level 27 meets a
 * contextual bank with one item in it, and the screen asks another kind rather
 * than asking nothing. What has to hold is that the *average* sitting is close
 * to the plan, or the twelve contextual questions are a claim rather than a
 * design.
 */
const totalAsked = [...kindTotals.values()].reduce((a, b) => a + b, 0);
console.log('\n  question kinds, averaged over every sitting:');
for (const kind of ['context', 'meaning', 'produce']) {
  const share = ((kindTotals.get(kind) ?? 0) / totalAsked) * ITEM_COUNT;
  console.log(`    ${kind.padEnd(8)} ${share.toFixed(1)} of ${ITEM_COUNT}   (plan: ${COMPOSITION[kind]})`);
}
const contextShare = ((kindTotals.get('context') ?? 0) / totalAsked) * ITEM_COUNT;
if (contextShare < COMPOSITION.context * 0.8) {
  problems.push(
    `the average sitting gets ${contextShare.toFixed(1)} contextual questions, against a plan of ${COMPOSITION.context}`,
  );
}

if (problems.length === 0) {
  console.log(`\nthe test places a simulated learner within ±3 levels, in exactly ${ITEM_COUNT} items.`);
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ${problem}`);
}
if (CHECK && problems.length > 0) process.exit(1);
