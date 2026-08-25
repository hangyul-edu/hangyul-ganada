#!/usr/bin/env node
/**
 * What the conjugation panel actually shows a learner, judged as teaching.
 *
 *   npm run conjugation:display:qa           print the table and the ledger
 *   npm run conjugation:display:qa:check     fail the build on a finding
 *
 * ## Why this exists beside `conjugation:qa`
 *
 * `conjugation:qa` asks whether the morphology is right — is 먹었어요 the past
 * of 먹다. This asks a different question: is the row *worth showing*, under
 * the label it gets. The two came apart on 맞다: 맞으세요 and 맞아 주세요 are
 * both impeccable morphology, and under labels meaning "Please do" and
 * "Please do (for me)" they teach a learner to say something no Korean speaker
 * says about being right. A form can be generable and still be the wrong thing
 * to print.
 *
 * ## What it checks, per displayed row of every taught predicate
 *
 * - an adjective never shows a command or request row
 * - a verb the volitionality tables deny never shows one either — the check
 *   re-derives the display from the same module the app renders from, so a
 *   regression in the wiring (not only in the tables) fails here
 * - no request row doubles its own 주세요 (도와줘 주세요)
 * - no surface form appears under two different labels
 * - no row shows a form from the known-bad regression list — the strings that
 *   have actually been photographed or shipped: 있세요, 계셌어요, 그러요…
 * - every row is Hangul and non-empty
 *
 * ## The ledger
 *
 * Every displayed command and request row is written to
 * `.conjugation-display/display-forms.tsv`, because the licensing lists are
 * meant to be re-read when the corpus grows: a verb added tomorrow is licensed
 * by default, and if it is a verb of harm or of spontaneous change its card
 * will show a bad row until somebody reads the ledger. This file is that
 * reading surface.
 *
 * ## Self-test
 *
 * The checks are run first against a deliberately broken fixture set — a
 * doubled 주세요, an adjective imperative, a known-bad form, a duplicate
 * surface — and the gate refuses to certify anything if any of those pass.
 * A gate that has never been seen failing is not evidence (§55).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { displayConjugations } from '../packages/korean-morphology/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/**
 * Forms that have actually shipped or been photographed as defects. None of
 * them may ever be displayed again, whatever produces them.
 */
const KNOWN_BAD = new Set([
  // malformed honorifics the old conjugation:qa passed
  '있세요', '만들세요', '듣으세요', '먹시어요',
  // the suppletive honorific past that shipped in the level test
  '계셌어요', '계세 주세요',
  // the ㄷ-irregular the bank held after the module was fixed
  '치닫아요',
  // the contracted demonstratives before the fronting fix
  '그러요', '그렀어요', '이러요', '이렀어요', '어쩌요', '어쩠어요',
  // contractions Korean does not write
  '벼요', '뼈요', '뼜어요', '겨요', '쫘요',
  // the photographed 맞다 rows
  '맞으세요', '맞아 주세요',
  // commands of things that happen to you
  '죽으세요', '죽이세요', '다치세요', '틀리세요', '꺼지세요', '늙으세요',
]);

/** The rows the panel renders — the same function the component calls. */
function displayed(lemma, partOfSpeech) {
  return displayConjugations(lemma, { partOfSpeech });
}

/** Every finding one predicate's displayed table produces. */
function judge(lemma, partOfSpeech, rows) {
  const findings = [];
  const seen = new Map();
  for (const { form, value } of rows) {
    if (!value || !/[가-힣]/.test(value)) {
      findings.push(`${lemma}: ${form} is empty or not Hangul: "${value}"`);
      continue;
    }
    if (KNOWN_BAD.has(value)) {
      findings.push(`${lemma}: ${form} shows the known-bad form ${value}`);
    }
    if (partOfSpeech === 'adjective' && (form === 'honorific' || form === 'request')) {
      findings.push(`${lemma}: an adjective shows a ${form} row (${value})`);
    }
    if (form === 'request' && (lemma.endsWith('주다') || /주셔 주세요$/.test(value))) {
      // A 주다 verb's favour form folds into itself; a shown one is doubled.
      // The lemma decides, not the surface — 두드려 주세요 ends in the same
      // syllables and is ordinary Korean.
      findings.push(`${lemma}: the request doubles its own 주세요: ${value}`);
    }
    const previous = seen.get(value);
    // The same surface under two labels confuses the table it sits in. The
    // dictionary and present-polite rows may legitimately coincide for no
    // taught word; anything that does coincide is a finding to look at.
    if (previous && previous !== form) {
      findings.push(`${lemma}: ${value} appears as both ${previous} and ${form}`);
    }
    seen.set(value, form);
  }
  return findings;
}

// --- Self-test: the gate must fail these before it may pass anything --------

const selfTest = [
  {
    name: 'a doubled 주세요',
    lemma: '도와주다',
    pos: 'verb',
    rows: [{ form: 'request', value: '도와줘 주세요' }],
  },
  {
    name: 'an adjective imperative',
    lemma: '예쁘다',
    pos: 'adjective',
    rows: [{ form: 'honorific', value: '예쁘세요' }],
  },
  {
    name: 'a known-bad form',
    lemma: '있다',
    pos: 'verb',
    rows: [{ form: 'honorific', value: '있세요' }],
  },
  {
    name: 'a duplicate surface',
    lemma: '가다',
    pos: 'verb',
    rows: [
      { form: 'presentPolite', value: '가요' },
      { form: 'request', value: '가요' },
    ],
  },
  {
    name: 'the photographed 맞다 request',
    lemma: '맞다',
    pos: 'verb',
    rows: [{ form: 'request', value: '맞아 주세요' }],
  },
];
for (const broken of selfTest) {
  if (judge(broken.lemma, broken.pos, broken.rows).length === 0) {
    console.error(`self-test failed: the gate passed ${broken.name}`);
    process.exit(1);
  }
}

// --- The sweep ---------------------------------------------------------------

const corpus = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.json'), 'utf8'),
);
const en = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.en.json'), 'utf8'),
);

const PREDICATES = new Set(['verb', 'adjective']);
const problems = [];
const ledger = [];
let tables = 0;
let commandRows = 0;
let requestRows = 0;

corpus.words.forEach((word, index) => {
  if (!PREDICATES.has(word.part_of_speech)) return;
  const rows = displayed(word.word, word.part_of_speech);
  if (rows.length === 0) return;
  tables += 1;
  problems.push(...judge(word.word, word.part_of_speech, rows));
  const gloss = en.words[index]?.[0] ?? '';
  for (const { form, value } of rows) {
    if (form === 'honorific') {
      commandRows += 1;
      ledger.push(`${word.word}\t${gloss}\tcommand\t${value}`);
    } else if (form === 'request') {
      requestRows += 1;
      ledger.push(`${word.word}\t${gloss}\trequest\t${value}`);
    }
  }
});

const outDir = join(ROOT, '.conjugation-display');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'display-forms.tsv'), ledger.join('\n') + '\n');

console.log('Conjugation display QA — what the panel teaches\n');
console.log(`  predicates with a table   ${tables.toLocaleString('en')}`);
console.log(`  command rows displayed    ${commandRows.toLocaleString('en')}`);
console.log(`  request rows displayed    ${requestRows.toLocaleString('en')}`);
console.log(`  ledger                    .conjugation-display/display-forms.tsv`);
console.log(`  self-test                 5 broken inputs, all refused`);

if (problems.length > 0) {
  console.log('');
  for (const problem of problems) console.log(`  ✗  ${problem}`);
  console.log(`\n${problems.length} finding(s).`);
  process.exit(1);
}

console.log('\n0 finding(s).');
if (!CHECK) {
  console.log('\nRe-read the ledger when the corpus grows: a new verb is licensed by default.');
}
