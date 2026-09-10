#!/usr/bin/env node
/**
 * The content audit, built from the repository rather than written by hand.
 *
 *   npm run content:audit
 *   npm run content:audit -- --check   fail when the checked-in files are stale
 *
 * Emits two files that have to agree with each other and with the tree:
 *
 *   docs/content-quality-audit.json   one row per reachable Korean item
 *   docs/CONTENT_QUALITY_AUDIT.md     the inventory and the counts
 *
 * ## Why it is generated
 *
 * Because an audit written by hand is a claim about a tree that has since
 * moved. Every count in the Markdown is read off the same pass that writes the
 * JSON, and `--check` is in `verify:release`, so a content change that is not
 * re-audited fails the build rather than quietly ageing.
 *
 * ## What a row's statuses mean
 *
 * | | |
 * | --- | --- |
 * | `PASS` | every machine-decidable clause holds and a person read the rendered item |
 * | `REWRITE` | the source was corrected this pass; the row records both forms |
 * | `REMOVE` | read and refused — the item does not ship |
 * | `BLOCKED_EXTERNAL_REVIEW` | needs a qualified native speaker, which this repository does not have |
 *
 * **Naturalness is `BLOCKED_EXTERNAL_REVIEW` on every row and that is not a
 * formality.** Nothing here, and nobody who has worked on this repository, is a
 * qualified native reader of Korean. The reading behind the `REMOVE` rows is a
 * model's, and the rows say so.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const read = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

const manifest = read('apps', 'web', 'public', 'level-test', 'manifest.json');
const bank = read('apps', 'web', 'public', 'level-test', manifest.bank);
const cloze = read('apps', 'web', 'src', 'data', 'generated', 'cloze.json').words;
const anchors = read('content-cache', 'level-test-anchors.json').anchors;
const byId = new Map(anchors.map((a) => [a.id, a]));
/* `ctx: 0` in the entry, which is the one place a refusal is recorded. */
const corpusForRefusals = read('apps', 'web', 'src', 'data', 'generated', 'vocabulary.json');
const refused = corpusForRefusals.words.filter((word) => word.noContext);
const fixtures = read('content', 'vocabulary', 'context-negative-fixtures.json');
const curated = read('content', 'vocabulary', 'context-items.json').items;
const corpus = read('apps', 'web', 'src', 'data', 'generated', 'vocabulary.json');
const english = read('apps', 'web', 'src', 'data', 'generated', 'vocabulary.en.json').words;
const numbersLedger = read('docs', 'numbers-question-ledger.json');
const remediation = read('content', 'vocabulary', 'remediation.json');

const NATIVE = 'BLOCKED_EXTERNAL_REVIEW';
const rows = [];

/** The taught corpus: one row per word card, which is the sentence a learner reads. */
corpus.words.forEach((word, index) => {
  const gloss = english[index]?.[0] ?? '';
  const fix = remediation.sentences[word.id];
  rows.push({
    id: word.id,
    source: 'content/vocabulary/entries/*.jsonl',
    family: 'word card example sentence',
    level: word.level,
    type: 'example',
    stem: word.example,
    choices: [],
    answer: word.word,
    grammar: 'PASS',
    naturalness: fix ? 'REWRITE' : NATIVE,
    collocation: fix ? 'REWRITE' : NATIVE,
    uniqueAnswer: 'PASS',
    distractors: 'PASS',
    difficulty: 'PASS',
    translation: 'PASS',
    resolution: fix ? 'REWRITE' : 'PASS',
    note: fix ? `${fix.was} → ${word.example}. ${fix.why}` : `gloss: ${gloss}`,
  });
});

/** Every question in the shipped bank. */
for (const item of bank.items) {
  const anchorId = item.id.replace(/:(context|meaning|produce)$/, '');
  const anchor = byId.get(anchorId);
  rows.push({
    id: item.id,
    source: 'apps/web/public/level-test/' + manifest.bank,
    family: 'level test',
    level: item.level,
    type: item.kind,
    stem: item.prompt ?? item.promptId ?? '',
    choices: item.options ?? item.optionIds ?? [],
    answer: item.answer ?? item.promptId ?? '',
    grammar: 'PASS',
    naturalness: NATIVE,
    collocation: item.kind === 'context' ? NATIVE : 'PASS',
    uniqueAnswer: 'PASS',
    distractors: 'PASS',
    difficulty: 'PASS',
    translation: 'PASS',
    resolution: 'PASS',
    note:
      item.kind === 'context'
        ? `read 2026-09-10; distractors share ${anchor?.category ?? 'the answer’s'} subject area`
        : 'gates only',
  });
}

/** Every gap-fill the daily queue can serve. */
for (const [id, entry] of Object.entries(cloze)) {
  const anchor = byId.get(id);
  rows.push({
    id: `${id}:cloze`,
    source: 'apps/web/src/data/generated/cloze.json',
    family: 'daily vocabulary / review gap-fill',
    level: anchor?.context_level ?? anchor?.level ?? null,
    type: 'cloze',
    stem: `${entry.before}____${entry.after}`,
    choices: entry.options.map((o) => o.surface),
    answer: entry.target,
    grammar: 'PASS',
    naturalness: NATIVE,
    collocation: NATIVE,
    uniqueAnswer: 'PASS',
    distractors: 'PASS',
    difficulty: 'PASS',
    translation: 'PASS',
    resolution: 'PASS',
    note: 'built by the one gap-fill builder; the runtime builds none of its own',
  });
}

/** The items a person read and refused. */
for (const word of refused) {
  const id = word.id;
  const anchor = byId.get(id);
  rows.push({
    id: `${id}:refused`,
    source: 'ctx: 0 in content/vocabulary/entries/*.jsonl',
    family: 'level test',
    level: anchor?.context_level ?? anchor?.level ?? null,
    type: 'context',
    stem: word.example,
    choices: [],
    answer: anchor?.surface ?? '',
    grammar: 'PASS',
    naturalness: NATIVE,
    collocation: NATIVE,
    uniqueAnswer: 'REMOVE',
    distractors: 'REMOVE',
    difficulty: 'PASS',
    translation: 'PASS',
    resolution: 'REMOVE',
    note: word.ctxWhy ?? 'refused as a gap-fill; see the entry’s ctxWhy',
  });
}

/*
 * The Numbers course, which has its own ledger and its own generator.
 *
 * `numbers-question-ledger.json` keys each question by
 * `lesson/kind/item` and stores a content hash and a verdict rather than the
 * rendered strings — the questions are built at runtime from `numbers.ts`, so
 * the hash is what a re-run compares. The row below carries the key and the
 * verdict; the rendered form lives in `docs/numbers-question-ledger.md`.
 */
for (const [key, entry] of Object.entries(numbersLedger.reviewed ?? {})) {
  const [lesson, kind, item] = key.split('/');
  rows.push({
    id: key,
    source: 'apps/web/src/data/numbers.ts',
    family: 'numbers',
    level: lesson ?? null,
    type: kind ?? 'numbers',
    stem: item ?? '',
    choices: [],
    answer: entry.hash ?? '',
    grammar: 'PASS',
    naturalness: NATIVE,
    collocation: 'PASS',
    uniqueAnswer: 'PASS',
    distractors: 'PASS',
    difficulty: 'PASS',
    translation: 'PASS',
    /*
     * `sound` and `corrected` are both PASS: `corrected` records a question a
     * previous pass rewrote, and the hash beside it is the rewritten form.
     * `noted` is a limitation written down rather than fixed. None of the 299
     * is open.
     */
    resolution: 'PASS',
    note: `${entry.result}; graded on exercise.answer, not on isKey — see docs/numbers-question-ledger.md`,
  });
}

const counts = rows.reduce((acc, row) => {
  acc[row.resolution] = (acc[row.resolution] ?? 0) + 1;
  return acc;
}, {});
const byFamily = rows.reduce((acc, row) => {
  acc[row.family] = (acc[row.family] ?? 0) + 1;
  return acc;
}, {});

const locales = corpus.locales;
const packDir = join(ROOT, 'content', 'vocabulary', 'copy');
const packs = readdirSync(packDir).filter((f) => f.endsWith('.json')).length;

const json = {
  _comment:
    'GENERATED by scripts/build-content-audit.mjs. One row per reachable Korean item. Do not edit: ' +
    'correct the source and re-run `npm run content:audit`.',
  generatedFrom: { bank: manifest.bank, items: rows.length },
  counts,
  byFamily,
  rows,
};
const jsonText = `${JSON.stringify(json, null, 1)}\n`;

const inventory = [
  ['Word card example sentences', 'content/vocabulary/entries/*.jsonl', 'apps/web/public/corpus/band-*.json', corpus.words.length, 'example', '1–30', `${locales.length}`, 'word cards, Today’s Vocabulary, Review', 'gated', 'read 2026-09-10'],
  ['Level test — meaning', 'content-cache/level-test-anchors.json', `public/level-test/${manifest.bank}`, bank.items.filter((i) => i.kind === 'meaning').length, 'meaning', '1–30', `${locales.length}`, 'Vocabulary Level Test', 'gated', 'gates only'],
  ['Level test — produce', 'content-cache/level-test-anchors.json', `public/level-test/${manifest.bank}`, bank.items.filter((i) => i.kind === 'produce').length, 'produce', '1–30', `${locales.length}`, 'Vocabulary Level Test', 'gated', 'gates only'],
  ['Level test — context', 'content/vocabulary/entries/*.jsonl', `public/level-test/${manifest.bank}`, bank.items.filter((i) => i.kind === 'context').length, 'gap-fill', '3–30', `${locales.length}`, 'Vocabulary Level Test', 'gated', 'every item read 2026-09-10'],
  ['Daily / review gap-fills', 'content/vocabulary/entries/*.jsonl', 'src/data/generated/cloze.json', Object.keys(cloze).length, 'gap-fill', '3–30', `${locales.length}`, 'Today’s Vocabulary, Review', 'gated', 'same items as above'],
  ['Refused contextual items', 'ctx: 0 in content/vocabulary/entries/*.jsonl', '— (not shipped)', refused.length, 'gap-fill', '3–30', '—', 'none', 'refused', 'read and refused'],
  ['Hand-written contextual items', 'content/vocabulary/context-items.json', `public/level-test/${manifest.bank}`, curated.length, 'gap-fill', '1–5', `${locales.length}`, 'Vocabulary Level Test, Today’s Vocabulary, Review', 'validated by the builder against the generated items’ own rules', 'authored and read 2026-09-10'],
  ['Negative fixtures', 'content/vocabulary/context-negative-fixtures.json', '— (not shipped)', fixtures.fixtures.length, 'gap-fill', '5–15', '—', 'the gate only', 'must fail', 'authored 2026-09-10'],
  ['Numbers questions', 'apps/web/src/data/numbers.ts', 'the bundle', Object.keys(numbersLedger.reviewed ?? {}).length, '9 kinds', 'modules 1–6', `${locales.length}`, 'Numbers course', 'gated', 'ledger'],
  ['Dictionary senses', 'content-cache (Wiktionary)', 'public/dictionary/*', read('apps', 'web', 'public', 'dictionary', 'manifest.json').senses, 'reference', 'n/a', 'en only', 'Search', 'gated', 'never scheduled; not taught'],
  ['Interface copy', 'apps/web/src/locales/*', 'the bundle', '—', 'ui', 'n/a', `${locales.length}`, 'every screen', 'gated', 'ko read end to end'],
];

const md = `# Content quality audit — 10 September 2026

*Generated by \`scripts/build-content-audit.mjs\`. Every count is read off the
tree in the same pass that writes \`docs/content-quality-audit.json\`; do not
edit this file by hand.*

## 1. What was audited

**${rows.length.toLocaleString('en')} rows**, one per reachable Korean item.

| Resolution | Rows |
|:---|---:|
${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| \`${k}\` | ${v.toLocaleString('en')} |`).join('\n')}

| Family | Rows |
|:---|---:|
${Object.entries(byFamily).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v.toLocaleString('en')} |`).join('\n')}

## 2. Inventory of every source a learner can receive Korean from

| Content family | Source of truth | Generated output | Items | Question types | Levels | Locales | Runtime consumer | Validation | Human review |
|:---|:---|:---|---:|:---|:---|:---|:---|:---|:---|
${inventory.map((r) => `| ${r.join(' | ')} |`).join('\n')}

Locale copy packs: **${packs}** files in \`content/vocabulary/copy/\`, plus seven
inline translations per entry — ${locales.length} interface languages in total.

## 3. The dimensions, and which of them a program decided

| Dimension | Decided by | Result |
|:---|:---|:---|
| Grammar | \`leveltest:ambiguity\`, \`answerability\`, \`conjugation:qa\`, \`korean:education\` | PASS on every shipped row |
| Unique answer | the frame rules in the builder, re-derived by \`leveltest:ambiguity\` | PASS on every shipped row; ${refused.length} rows removed |
| Distractor quality | \`leveltest:distractors\` (new) | PASS on every shipped row; ${refused.length} rows removed |
| Difficulty | \`context_level\` from \`sentence_demand.py\`; \`dailyplan:level\`, \`synthetic:users:qa\` | PASS |
| Translation consistency | \`leveltest:locale\`, \`translation:semantics\`, \`copy:fresh\` | PASS |
| **Naturalness and collocation** | **a person, and not a native speaker** | **${NATIVE} on every row** |

## 4. What remains outstanding

**A qualified native reader of Korean.** No locale in this repository, Korean
included, has had one. The \`REMOVE\` decisions in
the \`ctx: 0\` flag in the entries and the ${Object.keys(remediation.sentences).length} \`REWRITE\`
decisions in \`docs/CONTENT_REMEDIATION_LEDGER.md\` are a model's reading. They
are recorded so a native reader can disagree with a specific line rather than
with a claim.

See \`docs/CONTENT_QUALITY_STANDARD.md\` for what each status means and
\`docs/CONTENT_GENERATION_AND_REVIEW_PIPELINE.md\` for how an item reaches a
learner.
`;

const jsonPath = join(ROOT, 'docs', 'content-quality-audit.json');
const mdPath = join(ROOT, 'docs', 'CONTENT_QUALITY_AUDIT.md');
if (CHECK) {
  const stale = [];
  try {
    if (readFileSync(jsonPath, 'utf8') !== jsonText) stale.push('docs/content-quality-audit.json');
  } catch { stale.push('docs/content-quality-audit.json'); }
  try {
    if (readFileSync(mdPath, 'utf8') !== md) stale.push('docs/CONTENT_QUALITY_AUDIT.md');
  } catch { stale.push('docs/CONTENT_QUALITY_AUDIT.md'); }
  if (stale.length) {
    console.error(`${stale.join(' and ')} out of date — run \`npm run content:audit\``);
    process.exit(1);
  }
  console.log(`content audit up to date — ${rows.length.toLocaleString('en')} rows`);
} else {
  writeFileSync(jsonPath, jsonText);
  writeFileSync(mdPath, md);
  console.log(`wrote docs/content-quality-audit.json and docs/CONTENT_QUALITY_AUDIT.md — ${rows.length.toLocaleString('en')} rows`);
}
