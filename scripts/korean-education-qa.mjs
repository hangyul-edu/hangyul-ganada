#!/usr/bin/env node
/**
 * Every check that reads the Korean, run as one gate.
 *
 *   npm run korean:education:qa
 *   npm run korean:education:qa -- --check
 *
 * ## THIS DOES NOT PROVE NATIVE NATURALNESS
 *
 * That sentence is the reason the file exists, so it is the first thing in it.
 *
 * Nothing below was written by a Korean native speaker and nothing below can
 * tell you whether a sentence sounds like Korean. What these checks do is
 * narrower and worth having: they prove that the *machine-decidable* parts are
 * right. A particle agrees with the noun in front of it. A conjugated form
 * matches the rule for its stem class. A four-option question has one option
 * the frame accepts. No composed sentence puts a person in the object slot of
 * 타다. Every taught word has an example that contains it.
 *
 * A sentence can pass all of that and still be something no Korean would say.
 * 저는 매일 물을 마시는 것을 합니다 is grammatical, particle-correct, safe, and
 * wrong. No gate in this list will ever find it. Only a native reader will, and
 * `docs/LEVEL_TEST_KOREAN_REVIEW.md` records which parts of the corpus have had
 * one and which have not — at the time of writing, none have.
 *
 * So: a green run here means the corpus is free of the defects a program can
 * see. It is a floor, not a ceiling, and it must never be quoted as evidence of
 * Korean quality in a release note, a store listing, or a report.
 *
 * ## Why compose them at all
 *
 * Because they were being run one at a time and the gaps between them were
 * where the defects lived. 맛없은 passed the level-test gates because it was on
 * a word card; 여자를 타요 passed the vocabulary gates because each word was
 * innocent; 빵을 만들다어요 passed both because the browser built it after
 * every gate had finished. Running them together, in one command, with one
 * summary, is how the next thing in a gap gets noticed.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/**
 * The gates, in the order a defect would be caught.
 *
 * `proves` and `blind` are not decoration. Each is what that gate's author
 * could actually claim, and the pair is printed on every run so that reading
 * the output tells you what the green line means. Where they are vague, the
 * gate is vague.
 */
const GATES = [
  {
    id: 'morphology',
    script: 'conjugation:qa:check',
    proves: 'every conjugated form on every word card follows its stem class',
    blind: 'whether the form is one anybody would use for that verb',
  },
  {
    id: 'dictionary-morphology',
    script: 'dictionary:morphology:check',
    proves: 'the 30,243 dictionary entries inflect without producing impossible stems',
    blind: 'the meaning the inflected form carries',
  },
  {
    id: 'level-test',
    script: 'leveltest:qa:check',
    proves: 'every bank item is well formed, levelled, and has its answer present',
    blind: 'whether the sentence teaches anything',
  },
  {
    id: 'ambiguity',
    script: 'leveltest:ambiguity:check',
    proves: 'exactly one option fits each frame, by particle, class, and conjugation',
    blind: 'a second answer that is wrong only pragmatically',
  },
  {
    id: 'daily-vocabulary',
    script: 'dailyvocab:qa:check',
    proves: "the day's plan can build a question for every word it schedules",
    blind: 'whether the questions are worth asking',
  },
  {
    id: 'safety',
    script: 'content:safety:check',
    proves: 'no word list entry and no composed sentence is unsafe for a beginner',
    blind: 'harm carried by connotation rather than by a class rule',
  },
  {
    id: 'examples',
    script: 'examples:qa:check',
    proves: 'each example contains its headword, at its level, in one clause style',
    blind: 'whether the example is natural',
  },
  {
    id: 'senses',
    script: 'vocabulary:sense:qa:check',
    proves: 'one card teaches one sense, and every translation names that sense',
    blind: 'whether the chosen sense is the one worth teaching first',
  },
  {
    id: 'pack',
    script: 'content:qa:check',
    proves: 'the packs are internally consistent and complete for the locales that claim to be',
    blind: 'the quality of any string in them',
  },
  {
    id: 'word-detail',
    script: 'worddetail:qa:check',
    proves: 'every word detail screen has the rows it promises, with no empty ones',
    blind: 'whether a row is correct',
  },
  {
    id: 'romanization',
    script: 'romanization:qa:check',
    proves: 'Revised Romanization is applied consistently, including the sound changes',
    blind: 'nothing much — this one is genuinely decidable',
  },
];

/**
 * The ledger, read rather than trusted.
 *
 * `docs/LEVEL_TEST_KOREAN_REVIEW.md` is the file this gate points people at, so
 * it cannot be allowed to go stale or to overclaim. Two rules, both enforced
 * before a single check runs:
 *
 * 1. Every gate below has a row. A dimension checked by a program and not
 *    recorded here is a dimension nobody can find out about.
 * 2. No row may name a native speaker as its reviewer. When one genuinely does
 *    review a locale, this check is what has to be edited to say so — and
 *    editing it is a deliberate act with a name attached, which is the point.
 */
const LEDGER = 'docs/LEVEL_TEST_KOREAN_REVIEW.md';
const ledger = readFileSync(join(ROOT, LEDGER), 'utf8');
const rows = ledger
  .split('\n')
  .filter((line) => line.startsWith('|') && !/^\|\s*(dimension|---)/.test(line))
  .map((line) => line.split('|').map((cell) => cell.trim()));
const ledgerIds = new Set(rows.map((cells) => cells[2]));
const ledgerProblems = [];
for (const gate of GATES) {
  if (!ledgerIds.has(gate.id)) ledgerProblems.push(`${LEDGER} has no row for the ${gate.id} gate`);
}
for (const cells of rows) {
  const reviewer = cells[6] ?? '';
  if (/native/i.test(reviewer)) {
    ledgerProblems.push(`${LEDGER} claims a native reviewer for ${cells[1]}: "${reviewer}"`);
  }
}
if (ledgerProblems.length > 0) {
  for (const problem of ledgerProblems) console.error(`  ${problem}`);
  process.exit(1);
}

const results = [];
for (const gate of GATES) {
  const started = process.hrtime.bigint();
  const run = spawnSync('npm', ['run', '--silent', gate.script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  results.push({ ...gate, ok: run.status === 0, seconds, output: `${run.stdout ?? ''}${run.stderr ?? ''}` });
  process.stdout.write(`${run.status === 0 ? '  ok  ' : ' FAIL '}${gate.id}\n`);
}

const failed = results.filter((result) => !result.ok);

console.log('\nKorean education QA — what a program can check about the Korean\n');
for (const result of results) {
  console.log(`  ${result.ok ? 'pass' : 'FAIL'}  ${result.id.padEnd(22)}${result.seconds.toFixed(1)}s`);
  console.log(`        proves  ${result.proves}`);
  console.log(`        blind   ${result.blind}`);
}

console.log('\n  THIS DOES NOT PROVE NATIVE NATURALNESS.');
console.log('  No Korean native speaker has reviewed this corpus. These gates find the');
console.log('  defects a program can see; a sentence that is merely unnatural passes all');
console.log('  of them. See docs/LEVEL_TEST_KOREAN_REVIEW.md for what has been reviewed');
console.log('  by whom, and by what method.');

if (failed.length > 0) {
  console.log(`\n${failed.length} gate(s) failed:\n`);
  for (const result of failed) {
    console.log(`--- ${result.id} (${result.script}) ---`);
    console.log(result.output.trimEnd().split('\n').slice(-25).join('\n'));
    console.log('');
  }
}

if (CHECK && failed.length > 0) process.exit(1);
