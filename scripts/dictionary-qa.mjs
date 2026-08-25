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

/*
  Sentences a reviewer read and refused, and the reason each one was refused.

  The build drops them; this checks the build did. A defective sentence that
  comes back — because the upstream cache was refetched, or because somebody
  edited the builder — comes back silently otherwise, and the whole point of
  writing the reasons down is that nobody has to find them twice.
*/
const REFUSED = new Map(
  Object.entries(
    JSON.parse(
      readFileSync(join(ROOT, 'content/vocabulary/example-blocklist.json'), 'utf8'),
    ).examples,
  ),
);

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

/*
 * Every name is ASCII.
 *
 * The buckets were once named with the initial consonant itself, and the signed
 * APK unpacked with `entries/πä▒-1-....json` in it. The bytes in the archive
 * were correct UTF-8 — the ZIP entries simply did not set the general-purpose
 * UTF-8 flag, so a reader following the specification decodes them as CP437.
 * The app asks its WebView for the name the manifest gives; whether the archive
 * agrees depends on a flag neither of them owns.
 *
 * A dev server reads the filesystem and never sees it, which is why this is a
 * check and not a test: the failure only exists inside the packaged app.
 */
for (const name of promised) {
  // eslint-disable-next-line no-control-regex
  if (/[^\u0000-\u007f]/.test(name)) {
    fail(
      `${name} has a non-ASCII filename — it survives a dev server and comes out ` +
        'of a ZIP as mojibake, so the packaged app cannot fetch it',
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
for (const [headword, , gloss, chunk] of index.rows) {
  if (headwordsInIndex.has(headword)) fail(`${headword} appears twice in the index`);
  headwordsInIndex.add(headword);
  if (!manifest.chunks[chunk]) fail(`${headword} names chunk ${chunk}, which does not exist`);
  if (!gloss) fail(`${headword} has no gloss in the index, so search would show a blank row`);
}

/**
 * What a learner must never read on a dictionary page.
 *
 * ## Why these and not a spell-check
 *
 * §16 asked for the whole dictionary to be looked at rather than the one word
 * in the screenshot, so it was: thirty thousand entries swept for the defects
 * a scraped source produces. Five classes came back, every one of them a
 * *systemic* fault with a single cause in the ingestion, and every one of them
 * fixed there rather than by listing exceptions:
 *
 * ```
 *   84   a gloss cut at a pipe inside a link      핵  "core of planets or other [[celestial body"
 *  252   a gloss that is an empty parenthesis     너도밤나무  "()"
 *  340   Wiktionary's "(to be) " adjective marker  낯설다  "(to be) strange"
 *  212   the same gloss twice under one headword  내일  "tomorrow", "tomorrow"
 *   11   a transliteration caret or an entity     안녕  "^안녕? &mdash; …"
 * ```
 *
 * They are gated here, not merely fixed, because the source is refetched and
 * the cleaner will meet templates it has not met before. A defect that reaches
 * this file is a defect that reached a reader.
 */
const MARKUP = /\{\{|\}\}|\[\[|\]\]|&[a-z]+;|<\/?[a-zA-Z][^>]*>/;
/** A caret bound to what follows it — the marker, not the character itself. */
const CAPITAL_MARK = /\^(?=[\uac00-\ud7a3\dA-Z])/;
/** Nothing but punctuation and space: a definition with no words in it. */
const CONTENT_FREE = /^[\s()[\].,;:'"]*$/;
/** Wiktionary's note that Korean has no adjective class. The label says it. */
const TO_BE = /^\(to be\)\s/;

/**
 * The second sweep, and what it found that the first did not.
 *
 * Fixing five defect classes is not evidence that there is no sixth. So the
 * whole corpus was read again against a wider net, and six more came back —
 * every one of them, again, with a single cause in the ingestion:
 *
 * ```
 *    6   a citation in the definition   초목  "…(Chinese pepper tree).[https://ko.dict.naver.com/ …]"
 *    5   a MediaWiki interwiki prefix   홍대  "short for w:ko:홍익대학교 — Hongik University"
 *    3   a bracket with no partner      집유령거미  "…a small long-legged spider)"
 *   39   a reference with no referent   찬    "conjugative form of"
 * ```
 *
 * The last of those is dropped rather than repaired: the target is gone by the
 * time the gloss is read, and a definition that trails off mid-phrase is worse
 * than an entry that does not claim to have one.
 */
const CITATION = /https?:\/\//;
const INTERWIKI = /\b(?:w|wikt|wikipedia|s|q)::?[a-z-]*:?[^\s]/;
const DANGLING =
  /^(?:\w+\s+){0,4}(?:form|spelling|short|abbreviation|initialism|clipping|synonym)\s+(?:of|for)$/i;
const REPLACEMENT = /\uFFFD/;

/**
 * A definition long enough to be an encyclopaedia entry — reported, not failed.
 *
 * 27 of 39,610, and they are real Wiktionary content: 설잡대's 626 characters
 * explain a piece of university slang, 강신무's 418 describe a kind of shaman.
 * Truncating them would manufacture the "obviously truncated text" this sweep
 * exists to remove — first-sentence extraction cuts 전통 mid-parenthetical —
 * and dropping them would lose the headword. So the count is the gate: it may
 * not grow, and if it does somebody has widened the ingestion again.
 */
const ENCYCLOPAEDIC = 200;
const ENCYCLOPAEDIC_BUDGET = 27;
let encyclopaedic = 0;

const senseIds = new Set();
/** Every part of speech the dictionary actually uses. */
const parts = new Set();
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
    if (row && row[3] !== name) {
      fail(`${entry.headword} is in chunk ${name} but the index sends readers to ${row[3]}`);
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

    const glossesHere = new Set();
    for (const sense of entry.senses) {
      senseCount += 1;
      exampleCount += sense.examples.length;
      if (senseIds.has(sense.senseId)) fail(`two senses share the id ${sense.senseId}`);
      senseIds.add(sense.senseId);
      if (!sense.gloss) fail(`${sense.senseId} has no gloss`);
      if (!sense.senseId.includes('#')) {
        fail(`${sense.senseId} is not of the form dict_<word>#<sense>`);
      }
      if (MARKUP.test(sense.gloss)) fail(`${sense.senseId} shows markup: ${sense.gloss}`);
      if (CAPITAL_MARK.test(sense.gloss)) {
        fail(`${sense.senseId} shows a transliteration caret: ${sense.gloss}`);
      }
      if (CONTENT_FREE.test(sense.gloss)) {
        fail(`${sense.senseId} has a gloss with no words in it: ${JSON.stringify(sense.gloss)}`);
      }
      if (TO_BE.test(sense.gloss)) fail(`${sense.senseId} keeps the "(to be)" marker`);
      if (CITATION.test(sense.gloss)) fail(`${sense.senseId} carries a citation URL: ${sense.gloss}`);
      if (INTERWIKI.test(sense.gloss)) {
        fail(`${sense.senseId} carries an interwiki prefix: ${sense.gloss}`);
      }
      if (DANGLING.test(sense.gloss.trim())) {
        fail(`${sense.senseId} is a cross-reference with no target: "${sense.gloss}"`);
      }
      if (REPLACEMENT.test(sense.gloss)) fail(`${sense.senseId} contains a replacement character`);
      for (const [open, close] of [['(', ')'], ['[', ']']]) {
        const opens = [...sense.gloss].filter((c) => c === open).length;
        const closes = [...sense.gloss].filter((c) => c === close).length;
        if (opens !== closes) {
          fail(`${sense.senseId} has ${opens} "${open}" and ${closes} "${close}": ${sense.gloss}`);
        }
      }
      if (sense.gloss.length > ENCYCLOPAEDIC) encyclopaedic += 1;
      const key = sense.gloss.toLowerCase();
      if (glossesHere.has(key)) fail(`${entry.headword} shows "${sense.gloss}" twice`);
      glossesHere.add(key);
      parts.add(sense.partOfSpeech);
      /*
        A label is one label.

        `{{lb|ko|used exclusively with the particles {{m|ko|-가}}}}` was read
        with a regex that stopped at the first brace and split on every pipe, so
        the 거의 entry printed three labels — the first ending in `{{m`, the
        second the bare language code `ko`. 142 labels on 44 distinct strings
        were broken this way and 65 of them were the word `ko`, which is not a
        label at all. See `_labels` in `scripts/content/wiktionary.py`.
      */
      for (const label of sense.labels ?? []) {
        if (MARKUP.test(label) || label.includes('|')) {
          fail(`${sense.senseId} has an unparsed label: ${JSON.stringify(label)}`);
        }
        if (label === 'ko') fail(`${sense.senseId} shows the language code as a label`);
      }
      for (const example of sense.examples) {
        if (MARKUP.test(example.korean) || MARKUP.test(example.translation)) {
          fail(`${sense.senseId} has an example with markup in it: ${example.korean}`);
        }
        if (example.korean.includes('^')) {
          fail(`${sense.senseId} has a transliteration caret in its example`);
        }
        // Interlinear-gloss hyphens: 죽었--네, 김-일성, 새끼들-아. Notation,
        // not orthography — an audit of every shipped example found no genuine
        // in-sentence hyphen, so any hyphen touching a Hangul syllable in an
        // example is markup the ingestion failed to strip.
        if (/[가-힣]-|-[가-힣]/.test(example.korean)) {
          fail(`${sense.senseId} has an interlinear hyphen in its example: ${example.korean}`);
        }
        if (REFUSED.has(example.korean.trim())) {
          fail(
            `${sense.senseId} still ships a sentence a reviewer refused: ${example.korean} — ` +
              REFUSED.get(example.korean.trim()),
          );
        }
      }
    }
  }
}

if (encyclopaedic > ENCYCLOPAEDIC_BUDGET) {
  fail(
    `${encyclopaedic} gloss(es) run past ${ENCYCLOPAEDIC} characters, up from ` +
      `${ENCYCLOPAEDIC_BUDGET}. These are encyclopaedia entries rather than definitions and the ` +
      'budget exists so the number cannot creep — see the note beside it',
  );
}

// --- Every part of speech has a name in every language -------------------------

/*
  The label under a headword is `t('partOfSpeech.<value>')` with the raw value
  as its default, so a part of speech nobody translated does not fail — it
  prints the English word and looks deliberate. Five of the fourteen the
  dictionary uses were in that state: `proper noun` (2,310 senses), `ideophone`
  (787), `counter` (92), `phrase` (21) and `contraction` (1), each showing an
  English word on 3,211 pages in all thirty-two languages.

  The default is what makes that silent, so the silence is broken here instead.
*/
const LOCALES = readdirSync(join(ROOT, 'apps/web/src/locales'), { withFileTypes: true })
  .filter((row) => row.isDirectory())
  .map((row) => row.name);
for (const locale of LOCALES) {
  const file = join(ROOT, 'apps/web/src/locales', locale, 'vocabulary.json');
  if (!existsSync(file)) continue;
  const labels = JSON.parse(readFileSync(file, 'utf8')).partOfSpeech ?? {};
  const absent = [...parts].filter((part) => !labels[part]);
  if (absent.length > 0) {
    fail(`${locale} has no name for ${absent.join(', ')} — the page would show English`);
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
console.log(
  `  ${parts.size} part(s) of speech, each named in all ${LOCALES.length} languages`,
);
console.log(
  `  ${encyclopaedic} gloss(es) longer than ${ENCYCLOPAEDIC} characters, of a budget of ${ENCYCLOPAEDIC_BUDGET}`,
);

if (problems.length === 0) {
  console.log('\nthe dictionary is coherent, attributed, and safe to cache.');
} else {
  console.log(`\n${problems.length} problem(s):`);
  for (const problem of problems.slice(0, 20)) console.log(`  ${problem}`);
  if (problems.length > 20) console.log(`  … and ${problems.length - 20} more`);
}

if (CHECK && problems.length > 0) process.exit(1);
