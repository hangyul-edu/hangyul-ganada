/**
 * Checks the generated dictionary against the promises the app makes about it.
 *
 * The dictionary is not imported, not typechecked and not covered by the corpus
 * gates — it is JSON fetched at runtime from `public/`, which means a build can
 * emit something incoherent and every other check will stay green while search
 * quietly returns nothing. This is the check that reads the files.
 *
 * Four of the assertions are structural bookkeeping. The fifth is the one that
 * matters: **every file's name must be the hash of its own bytes.** The offline
 * worker serves `/dictionary/` cache-first, which is only safe because a changed
 * file gets a changed name. If the builder ever emitted a stale name — a
 * partial write, a hand edit, a merge that took one side of a rebuild — the
 * worker would serve last build's dictionary to that learner for good, and
 * nothing else in the suite would notice.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const CHECK = process.argv.includes('--check');
const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, 'apps/web/public/dictionary');

const problems = [];
const fail = (message) => problems.push(message);

const read = (name) => JSON.parse(readFileSync(join(DIR, name), 'utf8'));
const manifest = read('manifest.json');

// --- Every promised file is there, and named after what is in it ---------------

const promised = [manifest.index, ...Object.values(manifest.chunks).map((c) => c.file)];
for (const name of promised) {
  if (!existsSync(join(DIR, name))) {
    fail(`manifest points at ${name}, which is not on disk`);
    continue;
  }
  const raw = readFileSync(join(DIR, name), 'utf8');
  const digest = createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 8);
  const claimed = name.replace(/\.json$/, '').split('-').pop();
  if (claimed !== digest) {
    fail(
      `${name} is named for hash ${claimed} but its bytes hash to ${digest} — ` +
        'the offline worker caches these for good, so a wrong name is served for good',
    );
  }
}

// A file nobody points at is a file the worker may still be holding.
const onDisk = [
  ...readdirSync(DIR).filter((n) => n.endsWith('.json') && n !== 'manifest.json'),
  ...readdirSync(join(DIR, 'entries')).map((n) => `entries/${n}`),
];
for (const name of onDisk) {
  if (!promised.includes(name)) fail(`${name} is on disk and in no manifest — delete it`);
}

// --- The index and the chunks agree -------------------------------------------

const index = read(manifest.index);
const headwordsInIndex = new Set();
for (const [headword, , , gloss, senseCount, chunk] of index.rows) {
  if (headwordsInIndex.has(headword)) fail(`${headword} appears twice in the index`);
  headwordsInIndex.add(headword);
  if (!manifest.chunks[chunk]) fail(`${headword} names chunk ${chunk}, which does not exist`);
  if (!gloss) fail(`${headword} has no gloss in the index, so search would show a blank row`);
  if (!(senseCount > 0)) fail(`${headword} claims ${senseCount} senses`);
}

const senseIds = new Set();
let entryCount = 0;
let senseCount = 0;
let exampleCount = 0;
for (const [name, { file }] of Object.entries(manifest.chunks)) {
  const { entries } = read(file);
  for (const entry of entries) {
    entryCount += 1;
    if (!headwordsInIndex.has(entry.headword)) {
      fail(`${entry.headword} is in chunk ${name} and not in the index — unreachable by search`);
    }
    const row = index.rows.find((r) => r[0] === entry.headword);
    if (row && row[5] !== name) {
      fail(`${entry.headword} is in chunk ${name} but the index sends readers to ${row[5]}`);
    }
    if (row && row[4] !== entry.senses.length) {
      fail(
        `${entry.headword}: index says ${row[4]} sense(s), the entry has ${entry.senses.length}`,
      );
    }

    /*
      Provenance, on every record.

      This corpus is somebody else's work under CC BY-SA 4.0, and the licence is
      only honourable if each entry can still say where it came from when it
      reaches a screen. A record that has lost its source is a record the app
      cannot legally show, so this is a failure and not a warning.
    */
    const source = entry.source ?? {};
    for (const field of ['id', 'entryId', 'license', 'retrievedAt', 'url']) {
      if (!source[field]) fail(`${entry.headword} has no source.${field}`);
    }

    for (const sense of entry.senses) {
      senseCount += 1;
      exampleCount += sense.examples.length;
      if (senseIds.has(sense.senseId)) fail(`two senses share the id ${sense.senseId}`);
      senseIds.add(sense.senseId);
      if (!sense.gloss) fail(`${sense.senseId} has no gloss`);
      if (!sense.senseId.includes('#')) {
        fail(`${sense.senseId} is not of the form dict_<word>#<sense>`);
      }
    }
  }
}

// --- The manifest's own numbers are true ---------------------------------------

if (manifest.headwords !== entryCount) {
  fail(`manifest claims ${manifest.headwords} headwords; the chunks hold ${entryCount}`);
}
if (manifest.senses !== senseCount) {
  fail(`manifest claims ${manifest.senses} senses; the chunks hold ${senseCount}`);
}
if (manifest.examples !== exampleCount) {
  fail(`manifest claims ${manifest.examples} examples; the chunks hold ${exampleCount}`);
}

// --- Report --------------------------------------------------------------------

console.log(
  `Dictionary QA — ${entryCount.toLocaleString('en')} headwords, ` +
    `${senseCount.toLocaleString('en')} senses, ${exampleCount.toLocaleString('en')} examples`,
);
console.log(`  ${Object.keys(manifest.chunks).length} chunks, every name a hash of its contents`);
console.log(`  ${manifest.source.name}, ${manifest.source.license}`);

if (problems.length === 0) {
  console.log('\nthe dictionary is coherent, attributed, and safe to cache.');
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 20)) console.log(`  ${problem}`);
  if (problems.length > 20) console.log(`  … and ${problems.length - 20} more`);
}

if (CHECK && problems.length > 0) process.exit(1);
