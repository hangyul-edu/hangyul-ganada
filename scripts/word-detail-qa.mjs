#!/usr/bin/env node
/**
 * What a taught word card actually puts in front of a learner.
 *
 *   tsx scripts/word-detail-qa.mjs           print the audit
 *   tsx scripts/word-detail-qa.mjs --check   fail the build
 *
 * ## Why this gate exists
 *
 * Word Detail used to end in a disclosure called *More from the dictionary*
 * that listed every upstream sense of the headword. On 발 — a card teaching
 * "foot" — it produced *leg*, *Counter: steps*, *a blind or screen*, *strands
 * of noodles* and *rounds of ammunition*. All true, none asked for, and the
 * effect on a reader is that the product looks less trustworthy rather than
 * more complete.
 *
 * That block is gone. What replaced it is at most two extra example sentences
 * *for the sense the card teaches*, and this file is the thing that keeps that
 * promise honest at corpus scale, because the promise is impossible to check by
 * opening a few pages.
 *
 * ## What is checked
 *
 * 1. **No example drifts to another sense.** Every sentence shown under a card
 *    has a translation that shares a stem with the taught gloss. 술을 먹다 —
 *    "to drink wine" — cannot appear under 먹다 meaning "to eat".
 * 2. **No markup reaches a learner.** `^서울에 가요`, `새들-이`, `거겠--어` were
 *    all real, and all shipped.
 * 3. **No fragments, no commentary, no essays.** A citation like 여자친구 is not
 *    a sentence; "(saying) … i.e. something impossible" is a dictionary
 *    explaining itself.
 * 4. **The yield is reported, not assumed.** If the filter starts keeping
 *    everything, something has broken in it.
 */
import { loadCorpusForNode } from './lib/corpus.mjs';

const CHECK = process.argv.includes('--check');
await loadCorpusForNode();

const dict = await import('../apps/web/src/data/dictionary.ts');
const vocab = await import('../apps/web/src/data/vocabulary.ts');
const { wordCopy, loadWordCopy } = await import('../apps/web/src/data/wordCopy.ts');
const { usableExamples } = await import('../apps/web/src/data/exampleQuality.ts');

await loadWordCopy('en');
const index = await dict.loadIndex();
const chunkOf = new Map();
for (const hit of index.hits) if (!chunkOf.has(hit.headword)) chunkOf.set(hit.headword, hit.chunk);

/*
 * The same rules the app applies, imported rather than restated.
 *
 * They were copied into this file first, and within an hour the copy had
 * drifted: the gate kept a three-letter minimum after the module dropped to
 * two, and reported six cards as showing the wrong sense when they were showing
 * the right one — "Let us all face the new challenge" under 우리 meaning
 * "we, us". A gate that disagrees with the code it guards is worse than no gate,
 * because somebody has to work out which of the two is wrong.
 *
 * What this file adds is *scale and independence of data*: it runs every rule
 * over all 2,578 cards against the real dictionary, which is the part a unit
 * test cannot do.
 */
const { sameSense, MARKUP, COMMENTARY, ENDS } = await import(
  '../apps/web/src/data/exampleQuality.ts'
);

const words = vocab.vocabularyByPriority();
const problems = [];
let checked = 0;
let candidates = 0;
let shown = 0;
let gained = 0;

console.log('Word Detail — the examples a taught card shows beneath its own\n');

for (const word of words) {
  const chunk = chunkOf.get(word.word);
  if (!chunk) continue;
  const entry = await dict.loadEntry(word.word, chunk).catch(() => null);
  if (!entry) continue;
  checked += 1;

  const taught = wordCopy(word, 'en').value.meaning;
  const pool = entry.senses
    .filter((sense) => taught.toLowerCase().includes(sense.shortGloss.toLowerCase()))
    .flatMap((sense) => sense.examples);
  candidates += pool.length;

  const extra = usableExamples(pool, { taughtGloss: taught, skip: word.example, limit: 2 });
  shown += extra.length;
  if (extra.length > 0) gained += 1;

  for (const example of extra) {
    if (MARKUP.test(example.korean) || MARKUP.test(example.translation)) {
      problems.push(`${word.word}: markup reaches the card — ${example.korean}`);
    }
    if (COMMENTARY.test(example.translation)) {
      problems.push(`${word.word}: the translation explains rather than translates — ${example.translation}`);
    }
    if (!ENDS.test(example.korean)) {
      problems.push(`${word.word}: not a sentence — ${example.korean}`);
    }
    if (example.korean === word.example) {
      problems.push(`${word.word}: the card's own example is repeated underneath it`);
    }
    if (!sameSense(example.translation, taught)) {
      problems.push(
        `${word.word} teaches "${taught}" and shows "${example.translation}" — a different sense`,
      );
    }
  }
}

console.log(`  taught words with a dictionary entry   ${checked.toLocaleString('en')}`);
console.log(`  candidate sentences upstream           ${candidates.toLocaleString('en')}`);
console.log(`  fit to show                            ${shown.toLocaleString('en')}  (${candidates ? ((shown / candidates) * 100).toFixed(0) : 0}%)`);
console.log(`  cards gaining an extra example         ${gained.toLocaleString('en')}`);

/*
 * A filter that keeps everything is a filter that has stopped working. The
 * measured yield when this was written was 38%; anything above 80% means the
 * rules have been loosened or the parse has changed underneath them.
 */
if (candidates > 0 && shown / candidates > 0.8) {
  problems.push(
    `${((shown / candidates) * 100).toFixed(0)}% of upstream sentences are being shown — the quality filter is not filtering`,
  );
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 25)) console.error(`  ! ${problem}`);
  if (problems.length > 25) console.error(`  … and ${problems.length - 25} more`);
  process.exit(CHECK ? 1 : 0);
}
console.log('\nno card shows an example of a sense it does not teach.');
