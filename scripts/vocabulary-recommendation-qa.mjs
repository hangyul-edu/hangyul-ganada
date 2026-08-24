#!/usr/bin/env node
/**
 * Do the words a learner is given actually change with their level?
 *
 *   npm run vocabulary:recommendation:qa
 *   npm run vocabulary:recommendation:qa -- --check
 *
 * ## The question this answers, and the one it refuses to
 *
 * A level system can be validated two ways. One is to check that the number is
 * stored, rendered and passed to the selector, which the product passed for
 * months while a learner placed at 30 was taught the same eighty words as one
 * placed at 15. The other is to run the selector thirty thousand times and read
 * what comes out, which is this.
 *
 * Every learner level from 1 to 30 is simulated for 100 days of 10 new words —
 * 30,000 recommendation events — against a blank history, which is the hardest
 * case: nothing has been met, so nothing is excluded, and any tendency to hand
 * out the same easy words shows up immediately.
 *
 * ## What it asserts
 *
 * | | |
 * | --- | --- |
 * | **Centred** | the median recommended level is the learner's level |
 * | **Bounded** | nothing outside the teaching zone, ever |
 * | **Separated** | a level-1 and a level-30 learner share no ordinary new word |
 * | **Ordered** | median difficulty rises from learner 1 to 10 to 20 to 30 |
 * | **Deep enough** | the zone holds a week of new words without reaching outside |
 *
 * The last one is the one that fails quietly. A zone with forty words in it
 * satisfies every other check on day one and runs dry on day five, and
 * `pickNewWords` will not tell you — it returns a short list, and the caller
 * has no reason to look at the length.
 *
 * It is measured as **pool depth**, not as distinct words in a simulated run.
 * The simulation deliberately meets nothing, so the same word is eligible every
 * day and the draw repeats by chance; a real learner never sees a word offered
 * as new twice, because `isMet` excludes it. Counting the simulation's repeats
 * would be measuring the simulation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpusForNode } from './lib/corpus.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const JSON_OUT = process.argv.includes('--json')
  ? process.argv[process.argv.indexOf('--json') + 1]
  : null;

await loadCorpusForNode();
const { vocabularyByPriority } = await import('../apps/web/src/data/vocabulary.ts');
const { planNewWords, teachingZone, wordLevel } = await import(
  '../apps/web/src/domain/vocabularyLevel.ts'
);

const LEVELS = 30;
const DAYS = 100;
const PER_DAY = 10;
/**
 * A week of new words a zone must be able to supply from itself.
 *
 * Seven days rather than a fortnight, because the teaching level rises as a
 * learner finishes a band — see `levelFromProgress` — so a zone is not required
 * to hold a learner forever. It is required not to run out inside a week, which
 * is the point at which a learner would notice a short day.
 */
const WEEK = 70;

const corpus = vocabularyByPriority();
const never = () => false;
const findings = [];
const fail = (rule, detail) => findings.push({ rule, detail });

const english = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.en.json'), 'utf8'),
).words;
const builtWords = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.json'), 'utf8'),
).words;
const glossOf = new Map(builtWords.map((w, i) => [w.word, english[i]?.[0] ?? '']));

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

const rows = [];
const wordsByLearner = new Map();
let events = 0;
let deficitEvents = 0;

for (let level = 1; level <= LEVELS; level += 1) {
  const zone = teachingZone(level);
  const levels = [];
  const words = new Set();
  let firstFortnight = [];
  for (let day = 0; day < DAYS; day += 1) {
    const { words: picked, deficits } = planNewWords({
      corpus,
      level,
      seed: `qa-level-${level}`,
      dayIndex: day,
      count: PER_DAY,
      isMet: never,
      isRecent: never,
    });
    for (const deficit of deficits) deficitEvents += deficit.short;
    for (const word of picked) {
      events += 1;
      levels.push(wordLevel(word));
      words.add(word.word);
    }
  }
  levels.sort((a, b) => a - b);
  wordsByLearner.set(level, words);

  // Bounded: never outside the zone, on any of the thousand events.
  const outside = levels.filter((l) => l < zone.min || l > zone.max);
  if (outside.length) {
    fail(
      'outside-the-zone',
      `learner ${level} (zone ${zone.min}–${zone.max}) was offered ${outside.length} word(s) at ` +
        `level ${[...new Set(outside)].sort((a, b) => a - b).join(', ')}`,
    );
  }
  // Centred: the median is the learner's level, or the nearest the zone allows.
  const median = percentile(levels, 0.5);
  const wanted = Math.min(zone.max, Math.max(zone.min, level));
  if (median !== wanted) {
    fail('not-centred', `learner ${level} has a median recommendation of ${median}, not ${wanted}`);
  }
  // Deep enough: how many unmet words the zone actually holds.
  const depth = corpus.filter((w) => {
    const at = wordLevel(w);
    return at >= zone.min && at <= zone.max;
  }).length;
  if (depth < WEEK) {
    fail(
      'shallow-zone',
      `learner ${level}: levels ${zone.min}–${zone.max} hold ${depth} words, under the ${WEEK} ` +
        'a week of new study needs — this is a corpus deficit, not a selector bug',
    );
  }

  rows.push({
    level,
    zone,
    events: levels.length,
    min: levels[0],
    p10: percentile(levels, 0.1),
    p50: median,
    p90: percentile(levels, 0.9),
    max: levels[levels.length - 1],
    mean: levels.reduce((s, x) => s + x, 0) / levels.length,
    distinct: words.size,
    depth,
    days: Math.floor(depth / PER_DAY),
  });
}

// Separated: the extremes must not overlap at all, and 10 against 30 barely.
const overlap = (a, b) => {
  const left = wordsByLearner.get(a);
  const right = wordsByLearner.get(b);
  return [...left].filter((w) => right.has(w)).length;
};
if (overlap(1, 30) > 0) {
  fail('extremes-overlap', `learner 1 and learner 30 share ${overlap(1, 30)} ordinary new word(s)`);
}
if (overlap(10, 30) > 0) {
  fail('wide-overlap', `learner 10 and learner 30 share ${overlap(10, 30)} ordinary new word(s)`);
}
// Ordered: the four fixtures the brief names, A < B < C < D.
const medians = [1, 10, 20, 30].map((l) => rows[l - 1].p50);
for (let i = 1; i < medians.length; i += 1) {
  if (medians[i] <= medians[i - 1]) {
    fail('not-ordered', `median recommendation does not rise: ${medians.join(' → ')}`);
  }
}

console.log('Recommendation QA — thirty thousand words, read rather than assumed\n');
console.log(`  simulated             ${events.toLocaleString('en')} recommendation events`);
console.log(`  learners              ${LEVELS} levels x ${DAYS} days x ${PER_DAY} words`);
console.log(`  short days            ${deficitEvents} word(s) the zone could not supply`);
console.log('');
console.log('  learner  zone    min  P10  P50  P90  max   mean  distinct  fortnight');
for (const row of rows) {
  console.log(
    `  ${String(row.level).padStart(7)}  ${String(`${row.zone.min}–${row.zone.max}`).padStart(5)}  ` +
      `${String(row.min).padStart(3)}  ${String(row.p10).padStart(3)}  ${String(row.p50).padStart(3)}  ` +
      `${String(row.p90).padStart(3)}  ${String(row.max).padStart(3)}  ${row.mean.toFixed(2).padStart(5)}  ` +
      `${String(row.depth).padStart(11)}  ${String(row.days).padStart(4)}`,
  );
}

console.log('\n  a day at each of the four fixture levels, to read:');
for (const level of [1, 10, 20, 30]) {
  const { words } = planNewWords({
    corpus, level, seed: `qa-level-${level}`, dayIndex: 0, count: PER_DAY,
    isMet: never, isRecent: never,
  });
  console.log(`\n    learner ${level}:`);
  for (const word of words) {
    console.log(`      L${String(wordLevel(word)).padStart(2)}  ${word.word.padEnd(8)} ${glossOf.get(word.word) ?? ''}`);
  }
}

const byRule = new Map();
for (const finding of findings) byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
if (findings.length === 0) {
  console.log('\n  every learner is taught from their own level, and no two ends of the scale meet.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const [rule, count] of byRule) console.log(`  ${count} ${rule}`);
  console.log('');
  for (const finding of findings.slice(0, 30)) console.log(`  ${finding.rule.padEnd(20)} ${finding.detail}`);
}

if (JSON_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(ROOT, JSON_OUT), `${JSON.stringify({ events, rows, findings }, null, 2)}\n`);
  console.log(`\n  wrote ${JSON_OUT}`);
}

console.log(
  '\n  Distributions, not judgements. Whether a learner at 20 would want these\n' +
    '  particular words is read in docs/VOCABULARY_LEVEL_RECOMMENDATION_QA.md.',
);

if (CHECK && findings.length > 0) process.exit(1);
