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
  LEVELS,
  MAX_ITEMS,
  MIN_ITEMS,
  estimate,
  nextLevel,
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
for (const item of bank.items) {
  const list = byLevel.get(item.level) ?? [];
  list.push(item);
  byLevel.set(item.level, list);
}
const levelsAvailable = [...byLevel.keys()].sort((a, b) => a - b);

/** One sitting, for a learner whose true level is `truth`. */
function sit(truth, random) {
  const asked = [];
  const used = new Set();
  while (!shouldStop(asked)) {
    const open = levelsAvailable.filter((level) =>
      (byLevel.get(level) ?? []).some((item) => !used.has(item.id)),
    );
    const level = nextLevel(asked, open);
    if (level === null) break;
    const pool = (byLevel.get(level) ?? []).filter((item) => !used.has(item.id));
    const item = pool[Math.floor(random() * pool.length)];
    used.add(item.id);

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

for (let truth = 1; truth <= LEVELS; truth += 1) {
  const random = rng(1000 + truth);
  const mine = [];
  for (let run = 0; run < RUNS; run += 1) {
    const { asked, result } = sit(truth, random);
    mine.push(result.reported - truth);
    errors.push(Math.abs(result.reported - truth));
    lengths.push(asked.length);
  }
  const bias = mine.reduce((a, b) => a + b, 0) / mine.length;
  const mae = mine.reduce((a, b) => a + Math.abs(b), 0) / mine.length;
  perLevel.push({ truth, bias, mae });
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

const worst = [...perLevel].sort((a, b) => b.mae - a.mae).slice(0, 5);
console.log('\n  hardest levels to place:');
for (const row of worst) {
  console.log(`    level ${String(row.truth).padStart(2)}  error ${row.mae.toFixed(2)}  bias ${row.bias >= 0 ? '+' : ''}${row.bias.toFixed(2)}`);
}

const problems = [];
if (within3 < 0.9) problems.push(`only ${(within3 * 100).toFixed(1)}% of sittings land within ±3 levels`);
if (mae > 2) problems.push(`mean absolute error is ${mae.toFixed(2)} levels`);
if (maxItems > MAX_ITEMS) problems.push(`a sitting asked ${maxItems} items, over the ${MAX_ITEMS} cap`);
if (minItems < MIN_ITEMS) problems.push(`a sitting asked ${minItems} items, under the ${MIN_ITEMS} floor`);

if (problems.length === 0) {
  console.log('\nthe test places a simulated learner within ±3 levels, in 18–36 items.');
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ${problem}`);
}
if (CHECK && problems.length > 0) process.exit(1);
