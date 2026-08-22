#!/usr/bin/env node
/**
 * Can a learner look up the word they actually saw?
 *
 *   node scripts/dictionary-morphology-qa.mjs           print the table
 *   node scripts/dictionary-morphology-qa.mjs --check   fail the build
 *
 * Korean never writes the dictionary form in a sentence, so every word a
 * beginner meets is a form no dictionary lists. Typing 먹었어요 used to return
 * nothing — from a dictionary with 26,675 headwords, one of which is 먹다.
 *
 * This runs the analyser against the **shipped index**, so it is checking what
 * a learner would get rather than what the unit tests mock: the headword has to
 * be in the dictionary, and the analysis has to reach it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyse, conjugate, conjugationTable } from '../packages/korean-morphology/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICT = join(ROOT, 'apps', 'web', 'public', 'dictionary');
const CHECK = process.argv.includes('--check');

const manifest = JSON.parse(readFileSync(join(DICT, 'manifest.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(DICT, manifest.index), 'utf8'));
const headwords = new Set(index.rows.map((row) => row[0]));
const partOfSpeech = new Map(index.rows.map((row) => [row[0], row[2]]));
const isHeadword = (lemma) => headwords.has(lemma);

/** The brief's list (§69), plus the irregular classes it does not name. */
const CASES = [
  ['먹었어요', '먹다'],
  ['걸어요', '걷다'],
  ['들었어요', '듣다'],
  ['몰랐어요', '모르다'],
  ['썼어요', '쓰다'],
  ['불러요', '부르다'],
  ['했어요', '하다'],
  ['먹을 거예요', '먹다'],
  ['도와요', '돕다'],
  ['지었어요', '짓다'],
  ['나아요', '낫다'],
  ['추워요', '춥다'],
  ['삽니다', '살다'],
  ['그래요', '그렇다'],
  ['공부했어요', '공부하다'],
  ['예뻐요', '예쁘다'],
  ['마셨어요', '마시다'],
  ['봐요', '보다'],
];

const problems = [];
console.log(
  `Dictionary morphology — ${headwords.size.toLocaleString('en')} headwords, ` +
    `${manifest.senses.toLocaleString('en')} senses\n`,
);
console.log('  typed          resolves to');
for (const [surface, expected] of CASES) {
  const found = analyse(surface, isHeadword).map((a) => a.lemma);
  const ok = found.includes(expected);
  console.log(`  ${surface.padEnd(14)} ${found.join(', ') || '—'}${ok ? '' : '   ← expected ' + expected}`);
  if (!ok) problems.push(`${surface} did not resolve to ${expected}`);
}

/*
 * And the panel, over every verb and adjective the dictionary has.
 *
 * Not for correctness — `conjugation:qa` does that against 1,303 hand-authored
 * forms — but for *coverage*: a headword whose panel comes back empty is a word
 * card with a heading and nothing under it.
 */
let predicates = 0;
let empty = 0;
for (const [headword, pos] of partOfSpeech) {
  if (pos !== 'verb' && pos !== 'adjective') continue;
  if (!headword.endsWith('다')) continue;
  predicates += 1;
  const rows = conjugationTable(headword, { partOfSpeech: pos });
  if (rows.length < 5) empty += 1;
}
console.log(`\n  verbs and adjectives in the dictionary   ${predicates.toLocaleString('en')}`);
console.log(`  with fewer than five forms               ${empty}`);
if (empty > 0) problems.push(`${empty} headword(s) produce fewer than five conjugated forms`);

/* And the round trip, which is what makes the analyser exact rather than close. */
let roundTripped = 0;
for (const [headword, pos] of partOfSpeech) {
  if ((pos !== 'verb' && pos !== 'adjective') || !headword.endsWith('다')) continue;
  const past = conjugate(headword, 'pastPolite', { partOfSpeech: pos });
  if (!past) continue;
  if (analyse(past, isHeadword).some((a) => a.lemma === headword)) roundTripped += 1;
}
const share = (roundTripped / predicates) * 100;
console.log(`  past tense that finds its own headword   ${share.toFixed(1)}%`);
if (share < 95) problems.push(`only ${share.toFixed(1)}% of past forms resolve back to their headword`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ! ${problem}`);
  process.exit(CHECK ? 1 : 0);
}
console.log('\nevery inflected form in the list reaches its dictionary entry.');
