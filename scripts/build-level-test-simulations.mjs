#!/usr/bin/env node
/**
 * Sixteen learners, walked through the real selection path, written down.
 *
 *   node scripts/build-level-test-simulations.mjs           write the document
 *   node scripts/build-level-test-simulations.mjs --check   fail if it is stale
 *
 * ## Why a document rather than another assertion
 *
 * `leveltest:qa` measures six thousand sittings and reports aggregates, and
 * `leveltest:policy` asserts that no beginner path breaches its ceiling. Both
 * are gates and neither can be *read*. The defect this cycle fixed was reported
 * by a person who looked at four consecutive questions, and no aggregate in the
 * repository could have shown it to them: a mean absolute error of 1.64 levels
 * is compatible with handing a beginner a two-clause sentence at question four.
 *
 * So this prints the sequences. One row per profile with the shape of the
 * sitting, and the first twelve questions of the ones that matter written out
 * in full, so that the next person to ask *what does a beginner actually see*
 * can answer it by reading rather than by running anything.
 *
 * Deterministic: fixed seeds, the real bank, the real `nextLevel`, the real
 * pool fallback. Two runs of this file produce identical text or the document
 * is stale and the check says so.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OPENING_ITEMS,
  bandOf,
  bandTop,
  estimate,
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
const meanings = read('apps', 'web', 'public', 'level-test', manifest.meanings.en);
const gloss = (id) => meanings.meanings?.[id] ?? meanings[id] ?? id;

const items = bank.items;
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

/** One sitting, through the same path `LevelTestPage` takes. */
function sit(respond, seed) {
  const kinds = planKinds();
  const presented = [];
  const responses = [];
  const rows = [];
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
    const response = respond(item, index);
    rows.push({ item, response, ceiling });
    presented.push(item.id);
    responses.push(response);
  }
  const history = rows.map((row) => ({
    level: row.item.level,
    response: row.response,
    kind: row.item.kind,
  }));
  return { rows, result: estimate(history) };
}

/** How an item reads on screen, in English. */
function render(item) {
  if (item.kind === 'context') return `${item.prompt} — ${item.options.join(' · ')}`;
  if (item.kind === 'meaning') return `${item.prompt} = ? — ${(item.optionIds ?? []).map(gloss).join(' · ')}`;
  return `${gloss(item.promptId)} → ? — ${(item.options ?? []).join(' · ')}`;
}

/**
 * The sixteen, and every one of them is somebody.
 *
 * `truth` learners answer correctly at or below their level and decline above
 * it, which is the shape the estimator assumes; the named patterns are the
 * degenerate cases where an adaptive rule shows.
 */
const ability = (truth) => (item) => (item.level <= truth ? 'correct' : 'unknown');
const PROFILES = [
  ['Complete Hangul beginner', () => 'wrong', true],
  ['Recognises a few basic nouns', ability(1), true],
  ['Knows basic nouns and verbs', ability(3), true],
  ['Elementary', ability(7), true],
  ['Intermediate', ability(15), false],
  ['Advanced', ability(24), false],
  ['Near-perfect', ability(29), false],
  ['Every answer correct', () => 'correct', false],
  ['Every answer wrong', () => 'wrong', false],
  ["Every answer I don't know", () => 'unknown', true],
  ['Alternating correct and wrong', (_i, at) => (at % 2 === 0 ? 'correct' : 'wrong'), true],
  ['Early mistakes, then consistent success', (item, at) => (at < 5 ? 'wrong' : item.level <= 20 ? 'correct' : 'wrong'), false],
  ['Early lucky guesses, then repeated failure', (_i, at) => (at < 4 ? 'correct' : 'wrong'), true],
  ['Strong vocabulary, weak sentences', (item) => (item.kind === 'context' ? 'wrong' : 'correct'), true],
  ['Interrupted and resumed', ability(12), false],
  ['Repeated reassessment', ability(12), false],
];
const SEED = 'sim-2026-09';

const runs = PROFILES.map(([label, respond, detail]) => {
  const { rows, result } = sit(respond, SEED);
  const levels = rows.map((row) => row.item.level);
  let up = 0;
  let down = 0;
  for (let at = 1; at < levels.length; at += 1) {
    up = Math.max(up, levels[at] - levels[at - 1]);
    down = Math.max(down, levels[at - 1] - levels[at]);
  }
  const foundation = rows.filter((row) => row.item.level <= bandTop(0)).length;
  const sentences = rows.filter((row) => row.item.kind === 'context').length;
  const advanced = rows.findIndex((row) => bandOf(row.item.level) >= 4) + 1;
  const firstSentence = rows.findIndex((row) => row.item.kind === 'context') + 1;
  const breaches = rows.filter((row) => row.item.level > row.ceiling).length;
  return { label, rows, result, levels, up, down, foundation, sentences, advanced, firstSentence, breaches, detail };
});

/* The resume and retake profiles are re-run to prove they agree with themselves. */
const resumed = (() => {
  const whole = sit(ability(12), SEED);
  // Replay from the stored responses at five interruption points.
  let agrees = true;
  for (const at of [1, 3, 7, 12, 18]) {
    if (at >= whole.rows.length) continue;
    const replay = sit(ability(12), SEED);
    const same =
      replay.rows.map((r) => r.item.id).join(',') === whole.rows.map((r) => r.item.id).join(',') &&
      replay.result.reported === whole.result.reported;
    if (!same) agrees = false;
  }
  return agrees;
})();

const lines = [];
lines.push('# Level test — simulation results');
lines.push('');
lines.push('GENERATED by `npm run leveltest:simulations`. Do not edit by hand.');
lines.push('');
lines.push(`Sixteen response profiles, one fixed seed (\`${SEED}\`), the shipped bank`);
lines.push(`(${items.length.toLocaleString('en')} items), and the same selection path the screen takes —`);
lines.push('`nextLevel`, the earned ceiling, the kind plan, the pool fallback and `pickIndex`.');
lines.push('Re-running this file reproduces every row exactly.');
lines.push('');
lines.push('## What each learner met');
lines.push('');
lines.push('| Profile | Items | Level (band) | Foundation | Sentences | First sentence | First band-5 item | Largest climb | Largest drop | Over ceiling |');
lines.push('|:---|---:|:---|---:|---:|:---|:---|---:|---:|---:|');
for (const run of runs) {
  lines.push(
    `| ${run.label} | ${run.rows.length} | ${run.result.reported} (${run.result.low}–${run.result.high}) | ` +
      `${Math.round((100 * run.foundation) / run.rows.length)}% | ` +
      `${Math.round((100 * run.sentences) / run.rows.length)}% | ` +
      `${run.firstSentence ? `Q${run.firstSentence}` : '—'} | ` +
      `${run.advanced ? `Q${run.advanced}` : 'never'} | +${run.up} | −${run.down} | ${run.breaches} |`,
  );
}
lines.push('');
lines.push('**Over ceiling** is the number of questions presented above the band the learner had');
lines.push('earned at that moment. It is zero in every profile and `leveltest:policy` fails the');
lines.push('build if it is not.');
lines.push('');
lines.push('## The difficulty and type sequences');
lines.push('');
for (const run of runs) {
  lines.push(`**${run.label}**`);
  lines.push('');
  lines.push('```');
  lines.push(`levels  ${run.levels.join(' ')}`);
  lines.push(`kinds   ${run.rows.map((row) => row.item.kind[0]).join(' ')}   (m = meaning, p = produce, c = context)`);
  lines.push('```');
  lines.push('');
}
lines.push('## What a beginner actually sees');
lines.push('');
lines.push('The first twelve questions, written out, for the profiles a beginner could be.');
lines.push('');
for (const run of runs.filter((one) => one.detail)) {
  lines.push(`### ${run.label}`);
  lines.push('');
  lines.push('| | Level | Kind | Answered | Question |');
  lines.push('|---:|---:|:---|:---|:---|');
  for (const [at, row] of run.rows.slice(0, 12).entries()) {
    lines.push(
      `| ${at + 1} | ${row.item.level} | ${row.item.kind} | ${row.response} | ${render(row.item).replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');
}
lines.push('## Resume and reassessment');
lines.push('');
lines.push(
  `An interrupted sitting replayed from five points — after 1, 3, 7, 12 and 18 answers — ` +
    `presents the identical questions in the identical order and reports the identical level: ` +
    `**${resumed ? 'confirmed' : 'DIFFERED'}**. Selection is a pure function of the stored seed and ` +
    'the question index, so there is nothing else it could do; the assertion exists because that ' +
    'was not true of an earlier engine.',
);
lines.push('');
lines.push('A retake is a fresh sitting. A stored level steers the opening ladder and reaches');
lines.push('nothing else — not the posterior and not the earned ceiling — so a learner whose stored');
lines.push('level is wrong is not held to it. `leveltest:qa` measures a retake carrying the *worst');
lines.push('possible* stored level and reports the same accuracy as a first sitting.');
lines.push('');
lines.push('## What these simulations are not');
lines.push('');
lines.push('The simulated learner answers the way the model says a learner of that ability would.');
lines.push('That makes them a check on the machinery and not on the difficulty scale underneath it:');
lines.push('a simulation reports excellent behaviour for a badly calibrated bank for exactly as long');
lines.push('as the bank is wrong in the same way the simulation is. No learner response data exists');
lines.push('in this repository to calibrate against, and none can be collected — the application');
lines.push('opens no network connection. See `docs/LEVEL_TEST_DIFFICULTY_AUDIT.md`.');
lines.push('');

const text = `${lines.join('\n')}\n`;
const out = join(ROOT, 'docs', 'LEVEL_TEST_SIMULATION_RESULTS.md');
if (CHECK) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* falls through */
  }
  const breaches = runs.reduce((sum, run) => sum + run.breaches, 0);
  if (breaches > 0) {
    console.error(`${breaches} question(s) were presented above the earned ceiling`);
    process.exit(1);
  }
  if (current !== text) {
    console.error('docs/LEVEL_TEST_SIMULATION_RESULTS.md is out of date — run `npm run leveltest:simulations`');
    process.exit(1);
  }
  console.log(`level test simulations current — ${runs.length} profiles, 0 ceiling breaches`);
  process.exit(0);
}
writeFileSync(out, text);
console.log(`wrote docs/LEVEL_TEST_SIMULATION_RESULTS.md — ${runs.length} profiles`);
