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
/** And the median must be well inside it: half a frame is the ceiling, not the aim. */
const P50_BUDGET_MS = 4;
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

/**
 * Synthetic headwords with the *shape* of the real corpus, not a worst case.
 *
 * The earlier version made every headword start with 가, which was the right
 * hostility for a linear scan — nothing exits early — and is meaningless for an
 * index: one bucket holds everything and the index measures as a scan. A real
 * Korean dictionary spreads across many first syllables. Measured on the 26,675
 * that ship: 1,210 distinct first characters, the largest bucket 328 rows.
 * These rows reproduce that spread, so the projections below say something
 * about the structure rather than about a corpus nobody has.
 */
const LEAD = 1210;

function synthesise(count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    // A first syllable drawn from a Zipf-ish spread, so bucket sizes vary the
    // way real ones do rather than every bucket being identical.
    const lead = String.fromCharCode(0xac00 + ((i * 7919) % LEAD));
    const tail = String.fromCharCode(0xac00 + ((i * 31) % 400));
    // Five columns, the same shape the shipping index has — see `build_dictionary.py`.
    rows.push([
      `${lead}${tail}`,
      `r${i.toString(36)}`,
      `a thing numbered ${i}`,
      `g-${1 + (i % 3)}`,
      50000 - i,
    ]);
  }
  return rows;
}

/**
 * The app's own ranking, imported rather than transcribed.
 *
 * A copy of the loop in here would be a benchmark of a function nobody runs.
 * `rankDictionary` is plain TypeScript with no React and no DOM, so `tsx` can
 * load the module the product actually ships.
 */
const { rankDictionary, buildIndexForTest } = await import('../apps/web/src/data/dictionary.ts');

/** The shape `loadIndex` hands to the ranker: hits plus the lower-cased fields. */
function prepare(rows) {
  return buildIndexForTest(
    rows.map((row) => ({
      headword: row[0],
      romanization: row[1],
      shortGloss: row[2],
      chunk: row[3],
      frequency: row[4],
    })),
  );
}

/**
 * A spread of queries, not one.
 *
 * A single hostile query measures one code path. What a learner does is type a
 * word a character at a time, so the distribution that matters is: growing
 * prefixes, exact hits, romanisation, English gloss words, and the occasional
 * substring that lands in the middle of something. p50 and p95 over that spread
 * say more than a worst case over one.
 */
function queries(rows) {
  const out = [];
  for (let i = 0; i < 60; i += 1) {
    const row = rows[(i * 617) % rows.length];
    const head = row[0];
    for (let n = 1; n <= Math.min(3, head.length); n += 1) out.push(head.slice(0, n));
    out.push(head);
    out.push(row[1].slice(0, 2));
    const word = String(row[3]).split(/\s+/).pop();
    if (word && word.length > 2) out.push(word);
    if (head.length > 2) out.push(head.slice(1));
  }
  return out;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const rank = (index, query, limit) => rankDictionary(index, query, limit);

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
console.log('    rows    index gz     parse    p50/key    p95/key');

for (const count of [26_675, 50_000, 100_000]) {
  const rows = synthesise(count);
  const json = JSON.stringify({ fields: [], rows });
  const gz = gzipSync(Buffer.from(json), { level: 9 }).length;

  let t = performance.now();
  const parsed = prepare(JSON.parse(json).rows);
  /*
    The substring postings are part of the once-per-session cost, not part of a
    keystroke, so they are built and timed here. Leaving them to be built by
    whichever query happened to need them first put a hundred milliseconds
    inside one sample and made p95 a measurement of the build.
  */
  rank(parsed, 'zzqq', 12);
  const parseMs = performance.now() - t;

  // Warm, then measure: a cold JIT reports the compiler, not the code.
  const qs = queries(JSON.parse(json).rows);
  for (const q of qs.slice(0, 20)) rank(parsed, q, 12);
  const samples = [];
  for (const q of qs) {
    const at = performance.now();
    rank(parsed, q, 12);
    samples.push(performance.now() - at);
  }
  const rankMs = percentile(samples, 50);
  const p95 = percentile(samples, 95);

  const rankPhone = rankMs * PHONE;
  const p95Phone = p95 * PHONE;
  const parsePhone = parseMs * PHONE;
  console.log(
    `  ${String(count).padStart(7)}   ${(gz / 1024).toFixed(0).padStart(5)} kB   ` +
      `${parsePhone.toFixed(0).padStart(5)} ms   ${rankPhone.toFixed(2).padStart(7)} ms   ` +
      `${p95Phone.toFixed(2).padStart(7)} ms`,
  );
  if (p95Phone > RANK_BUDGET_MS || rankPhone > P50_BUDGET_MS) {
    forecast.push(
      `at ${count.toLocaleString('en')} headwords the median keystroke would cost ` +
        `${rankPhone.toFixed(2)} ms on a phone, over the ${RANK_BUDGET_MS} ms budget`,
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
  `\n  budgets: p50 ${P50_BUDGET_MS} ms, p95 ${RANK_BUDGET_MS} ms per keystroke, ` +
    `${PARSE_BUDGET_MS} ms to parse and index (once per session)`,
);

// --- What actually ships -------------------------------------------------------

const manifest = JSON.parse(readFileSync(new URL('../apps/web/public/dictionary/manifest.json', import.meta.url), 'utf8'));
const realJson = readFileSync(
  new URL(`../apps/web/public/dictionary/${manifest.index}`, import.meta.url),
);
const realRows = JSON.parse(realJson.toString('utf8')).rows;
const realBuildAt = performance.now();
const real = prepare(realRows);
rank(real, 'zzqq', 12);
const realBuild = (performance.now() - realBuildAt) * PHONE;
const realQueries = queries(realRows);
for (const q of realQueries.slice(0, 20)) rank(real, q, 12);
const realSamples = [];
for (const q of realQueries) {
  const at = performance.now();
  rank(real, q, 12);
  realSamples.push(performance.now() - at);
}
const realRank = percentile(realSamples, 50) * PHONE;
const realP95 = percentile(realSamples, 95) * PHONE;

console.log(
  `\n  shipping now: ${real.hits.length.toLocaleString('en')} headwords, ` +
    `${(gzipSync(realJson, { level: 9 }).length / 1024).toFixed(0)} kB gzipped, ` +
    `built in ${realBuild.toFixed(0)} ms, then p50 ${realRank.toFixed(2)} ms and ` +
      `p95 ${realP95.toFixed(2)} ms per keystroke — phone-adjusted`,
);
/**
 * How large the index may be, gzipped.
 *
 * Fetched once, on the first search, and cached for good behind a content hash
 * — but it is still a download a learner waits through with "Looking in the
 * dictionary…" on screen, and it is already comparable to the app's entire
 * first load. Budgeted so that it cannot drift upwards one corpus refresh at a
 * time without somebody deciding to let it.
 */
const INDEX_BUDGET_KB = 520;
const indexKb = gzipSync(realJson, { level: 9 }).length / 1024;
if (indexKb > INDEX_BUDGET_KB) {
  problems.push(
    `the index is ${indexKb.toFixed(0)} kB gzipped, over the ${INDEX_BUDGET_KB} kB budget`,
  );
}
if (realRank > P50_BUDGET_MS) {
  problems.push(
    `the shipping index costs ${realRank.toFixed(2)} ms at p50 on a phone, ` +
      `over the ${P50_BUDGET_MS} ms budget`,
  );
}
if (realP95 > RANK_BUDGET_MS) {
  problems.push(
    `the shipping index costs ${realP95.toFixed(2)} ms at p95 on a phone, ` +
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
