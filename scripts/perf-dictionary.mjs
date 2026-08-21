#!/usr/bin/env node
/**
 * What the dictionary costs at sizes it does not yet have.
 *
 *   npm run perf:dictionary
 *   npm run perf:dictionary -- --check   fail if a budget is exceeded
 *
 * ## Why forecast rather than wait
 *
 * The corpus target is 10,000 taught words and the dictionary is at 7,865 and
 * still growing from a fetch that adds pages every run. Both numbers move in
 * one direction, and the failure they can produce is not a crash — it is a
 * search box that takes a third of a second to answer a keystroke on a phone,
 * which reads as a broken app rather than as a slow one.
 *
 * The two halves are measured separately because they fail differently. Parsing
 * happens once per session and can be slow without anybody noticing; ranking
 * happens on **every keystroke** and is the one that has to stay under a frame.
 *
 * The rows are synthetic and deliberately hostile: every headword shares a
 * prefix with the query, so the scan cannot exit early and every row is scored.
 * A real query touches far fewer. This measures the worst case a learner can
 * type, not the average one.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const CHECK = process.argv.includes('--check');

/**
 * What a keystroke may cost **on a phone**, not on this machine.
 *
 * A frame is 16.7 ms, and ranking is not the only thing in it — React still has
 * to reconcile and paint a list of results. Half a frame is the share this may
 * take. Every measurement below is multiplied by `PHONE` before it is judged,
 * because a budget checked against a developer machine is a budget that passes
 * until a customer holds the product.
 *
 * Ranking is behind `useDeferredValue`, so exceeding this does not freeze the
 * text box — React keeps typing responsive and lets the results lag. That is
 * why the ceiling is half a frame rather than a quarter: the failure is a
 * result list that visibly trails the cursor, not an input that stutters.
 */
const RANK_BUDGET_MS = 8;
/** Parsing is once per session, behind a spinner nobody sees. One second. */
const PARSE_BUDGET_MS = 1000;

/**
 * How much slower a mid-range phone is than this machine.
 *
 * A round, pessimistic 4. The point is not to predict a particular handset —
 * it is to stop a number measured on a desktop being read as a number a
 * learner experiences.
 */
const PHONE = 4;

const SYLLABLES = '가나다라마바사아자차카타파하거너더러머버서어저';

function synthesise(count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const a = SYLLABLES[i % SYLLABLES.length];
    const b = SYLLABLES[(i * 7) % SYLLABLES.length];
    const c = SYLLABLES[(i * 13) % SYLLABLES.length];
    rows.push([
      `가${a}${b}${c}`,
      `ga${i.toString(36)}`,
      'noun',
      `a thing numbered ${i}`,
      1 + (i % 5),
      `ㄱ-${1 + (i % 3)}`,
      50000 - i,
    ]);
  }
  return rows;
}

/** The app's own ranking, transcribed. Kept in step by `dictionary.test.ts`. */
function rank(index, query, limit) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const scored = [];
  for (const hit of index) {
    const gloss = hit[3].toLowerCase();
    let r;
    if (hit[0] === needle || gloss === needle) r = 0;
    else if (hit[0].startsWith(needle) || gloss.startsWith(needle)) r = 1;
    else if (hit[0].includes(needle) || gloss.includes(needle)) r = 2;
    else if (hit[1].toLowerCase().startsWith(needle)) r = 3;
    else continue;
    scored.push({ hit, r });
  }
  scored.sort((a, b) => a.r - b.r || b.hit[6] - a.hit[6]);
  return scored.slice(0, limit);
}

const problems = [];
/**
 * Sizes the dictionary has not reached, reported and not enforced.
 *
 * Failing a release on a forecast is how a gate gets switched off. What is
 * enforced is the index that actually ships, measured below; the projections
 * exist to say *when* this design stops working, which is a thing worth
 * knowing before the day it does.
 */
const forecast = [];
console.log('Dictionary at scale — worst-case query, every row scored\n');
console.log('  every figure below is already multiplied by ' + PHONE + ' for a phone\n');
console.log('   rows    index gz    parse    rank/keystroke');

for (const count of [10_000, 25_000, 50_000]) {
  const rows = synthesise(count);
  const json = JSON.stringify({ fields: [], rows });
  const gz = gzipSync(Buffer.from(json), { level: 9 }).length;

  let t = performance.now();
  const parsed = JSON.parse(json).rows;
  const parseMs = performance.now() - t;

  // Warm, then measure: a cold JIT reports the compiler, not the code.
  for (let i = 0; i < 3; i += 1) rank(parsed, '가', 12);
  t = performance.now();
  const RUNS = 20;
  for (let i = 0; i < RUNS; i += 1) rank(parsed, '가', 12);
  const rankMs = (performance.now() - t) / RUNS;

  const rankPhone = rankMs * PHONE;
  const parsePhone = parseMs * PHONE;
  console.log(
    `  ${String(count).padStart(6)}   ${(gz / 1024).toFixed(0).padStart(5)} kB   ` +
      `${parsePhone.toFixed(0).padStart(4)} ms   ${rankPhone.toFixed(1).padStart(6)} ms`,
  );
  if (rankPhone > RANK_BUDGET_MS) {
    forecast.push(
      `at ${count.toLocaleString('en')} headwords a keystroke would cost ` +
        `${rankPhone.toFixed(1)} ms on a phone, over the ${RANK_BUDGET_MS} ms budget`,
    );
  }
  if (parsePhone > PARSE_BUDGET_MS) {
    forecast.push(
      `at ${count.toLocaleString('en')} headwords parsing would cost ` +
        `${parsePhone.toFixed(0)} ms on a phone, over the ${PARSE_BUDGET_MS} ms budget`,
    );
  }
}

console.log(
  `\n  budgets: ${RANK_BUDGET_MS} ms per keystroke (half a frame), ` +
    `${PARSE_BUDGET_MS} ms to parse (once per session)`,
);

// --- What actually ships -------------------------------------------------------

const manifest = JSON.parse(readFileSync(new URL('../apps/web/public/dictionary/manifest.json', import.meta.url), 'utf8'));
const real = JSON.parse(
  readFileSync(new URL(`../apps/web/public/dictionary/${manifest.index}`, import.meta.url), 'utf8'),
).rows;
for (let i = 0; i < 3; i += 1) rank(real, '가', 12);
let t = performance.now();
for (let i = 0; i < 20; i += 1) rank(real, '가', 12);
const realRank = ((performance.now() - t) / 20) * PHONE;

console.log(
  `\n  shipping now: ${real.length.toLocaleString('en')} headwords, ` +
    `${realRank.toFixed(1)} ms per keystroke on a phone`,
);
if (realRank > RANK_BUDGET_MS) {
  problems.push(
    `the shipping index costs ${realRank.toFixed(1)} ms per keystroke on a phone, ` +
      `over the ${RANK_BUDGET_MS} ms budget`,
  );
}

if (forecast.length) {
  console.log('\n  forecast — reported, not enforced:');
  for (const line of forecast) console.log(`    ${line}`);
  console.log(
    '    a keystroke is deferred, so this shows as results trailing the cursor rather\n' +
      '    than as a stuck text box. Past that point the answer is an inverted index or a\n' +
      '    worker, not a faster scan.',
  );
}

if (problems.length === 0) {
  console.log('\nsearch answers within half a frame at the size that ships.');
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  ${problem}`);
}
if (CHECK && problems.length > 0) process.exit(1);
