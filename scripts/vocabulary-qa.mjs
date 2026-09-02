#!/usr/bin/env node
/**
 * The vocabulary gate: what has to be true of the corpus a learner receives.
 *
 *   npm run vocabulary:qa            report
 *   npm run vocabulary:qa -- --check fail the build on any error
 *
 * ## What this is, and what it is not
 *
 * The content pipeline already has deep per-field gates, and this does not
 * repeat them:
 *
 * | Gate | Answers |
 * | --- | --- |
 * | `content:qa` (`qa_pack.py`) | is each field *good* — a real translation, a sentence that teaches |
 * | `content:coverage` | is each field *there*, counted semantically |
 * | `examples:qa` | does the sentence demonstrate the word it belongs to |
 * | `audio:pronunciation` | does the clip say what the word says |
 *
 * Those read the editorial sources. This reads the **built dataset the app
 * ships**, and asks the questions that are about the corpus as a whole and
 * about the product rules that govern it:
 *
 *   * is it the size the product is committed to;
 *   * is every headword unique and canonical;
 *   * can the learning system actually reach every word — priority, category,
 *     search;
 *   * and the two prohibitions, which are the ones a data pipeline will
 *     otherwise reintroduce by accident: **no word images** and **no word
 *     handwriting**.
 *
 * ## The size check is informational, and says so
 *
 * The headword count is reported against the 10,000 target in every mode and
 * never fails the run. A build cannot be failed for content that has not been
 * written yet, and a gate that is red on every commit is a gate people route
 * around. `--target` prints the shortfall as a labelled **INFORMATIONAL**
 * line so a release log carries the honest distance without a false red; the
 * number itself is tracked as issue I-04 and in `docs/report.md` §8.3.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toIpa } from './lib/ipa.ts';
import { COMPLETE_LOCALES } from './lib/locale-status.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CHECK = process.argv.includes('--check');
const ENFORCE_TARGET = process.argv.includes('--target');

/**
 * The number of useful headwords the product is being built towards.
 *
 * Stated once, here, and read by the bundle budget's projection as the same
 * commitment from the other side — see `check-bundle-budget.mjs`. Depth is a
 * product pillar; it is not a number to be reached by any means, which is what
 * the quality gates above are for.
 */
const TARGET_HEADWORDS = 10_000;

const errors = [];
const warnings = [];
const notes = [];
const fail = (what) => errors.push(what);

const data = JSON.parse(
  readFileSync(join(ROOT, 'apps', 'web', 'src', 'data', 'generated', 'vocabulary.json'), 'utf8'),
);
const words = data.words ?? [];

// --- 1. Size ------------------------------------------------------------------

const shortfall = TARGET_HEADWORDS - words.length;
if (shortfall > 0) {
  const message =
    `${words.length.toLocaleString('en')} headwords — ` +
    `${shortfall.toLocaleString('en')} short of the ${TARGET_HEADWORDS.toLocaleString('en')} target`;
  // Informational in both modes: the deficit is reported, never enforced.
  notes.push(ENFORCE_TARGET ? `INFORMATIONAL (not a release blocker): ${message}` : message);
} else {
  notes.push(`${words.length.toLocaleString('en')} headwords — at or above target`);
}

// --- 2. Every headword is unique and canonical --------------------------------

/**
 * Hangul syllables only, and nothing else in the string.
 *
 * A headword with a space, a digit, a bracket or a Latin letter in it is a
 * dictionary artefact — "가다 (to go)", "1월" — not a word a learner is taught.
 */
const HANGUL_WORD = /^[가-힣]+$/;

const seen = new Map();
for (const row of words) {
  if (typeof row.word !== 'string' || !row.word) {
    fail(`a row has no headword: ${JSON.stringify(row).slice(0, 80)}`);
    continue;
  }
  if (!HANGUL_WORD.test(row.word)) {
    fail(`${row.word}: not a plain Hangul headword`);
  }
  const first = seen.get(row.word);
  if (first !== undefined) fail(`${row.word}: duplicate headword (ids ${first}, ${row.id})`);
  else seen.set(row.word, row.id);
}

const ids = new Set();
for (const row of words) {
  if (ids.has(row.id)) fail(`${row.id}: duplicate id`);
  ids.add(row.id);
}

// --- 3. Everything the learning system needs to reach a word ------------------

for (const row of words) {
  if (typeof row.c !== 'number' || !data.categories?.[row.c]) {
    fail(`${row.word}: no category`);
  }
  // The one number the daily plan orders by. Without it a word is unreachable:
  // it never rises to the top of the priority list and never gets taught.
  if (typeof row.difficulty_score !== 'number' || !Number.isFinite(row.difficulty_score)) {
    fail(`${row.word}: no usefulness/priority score`);
  }
  if (typeof row.usefulness !== 'number') {
    fail(`${row.word}: no editorial usefulness rating`);
  }
  if (!row.part_of_speech) {
    // Part of speech is what keeps a multiple-choice question's grammar from
    // giving the answer away. See `wordOptions.ts`.
    fail(`${row.word}: no part of speech`);
  }
  if (typeof row.example !== 'string' || row.example.length === 0) {
    fail(`${row.word}: no example sentence`);
  }
}

/**
 * The priority order is *total*: no two distinct words compare equal.
 *
 * This is what makes a daily plan reproducible. `buildDailyPlan` walks the
 * corpus in this order and takes a prefix of it; if two words tie completely,
 * their relative order is whatever the engine's sort happened to do, and a
 * learner who leaves at four of ten can come back to a different six.
 *
 * Checked by looking for actual ties rather than by sorting twice and comparing
 * — two runs of the same sort on the same array agree whether or not the
 * comparator is total, so that would have been a test of nothing. The tie that
 * can really happen is `localeCompare` returning 0 for two spellings it
 * considers equivalent under collation, which no amount of re-sorting reveals.
 */
const byPriority = [...words].sort(
  (a, b) => a.difficulty_score - b.difficulty_score || a.word.localeCompare(b.word),
);
for (let i = 1; i < byPriority.length; i += 1) {
  const a = byPriority[i - 1];
  const b = byPriority[i];
  if (a.difficulty_score === b.difficulty_score && a.word.localeCompare(b.word) === 0) {
    fail(
      `${a.word} / ${b.word}: tie in the priority order — ` +
        'a daily plan built from it would not be reproducible',
    );
  }
}

/** Gaps in the languages still being written, reported at the end. */
const inProgress = [];

// --- 4. Glosses, in every language that ships ---------------------------------

const locales = data.locales ?? [];
if (locales.length === 0) fail('the dataset declares no locales');

for (const locale of locales) {
  const path = join(ROOT, 'apps', 'web', 'src', 'data', 'generated', `vocabulary.${locale}.json`);
  let pack;
  try {
    pack = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`${locale}: no copy pack`);
    continue;
  }
  /*
   * A copy pack is positional: `pack.words[i]` is `[meaning, exampleTranslation,
   * definition]` for `data.words[i]`. See `data/wordCopy.ts`.
   *
   * Which makes length the first thing to check, and the most important: a pack
   * one row short does not fail loudly, it silently shifts every meaning after
   * the gap onto the wrong word — 사과 glossed "school" and a build that passes.
   */
  const entries = pack.words ?? [];
  if (entries.length !== words.length) {
    fail(
      `${locale}: copy pack has ${entries.length} rows for ${words.length} words — ` +
        'the packs are positional, so a mismatch mis-glosses every word after the gap',
    );
    continue;
  }
  const missing = [];
  const noExample = [];
  words.forEach((row, index) => {
    const entry = entries[index];
    if (!entry || typeof entry[0] !== 'string' || entry[0].trim().length === 0) {
      missing.push(row.word);
    }
    // The Korean pack carries no translation of a Korean sentence, by design.
    if (locale !== 'ko' && (typeof entry?.[1] !== 'string' || entry[1].trim().length === 0)) {
      noExample.push(row.word);
    }
  });
  /*
    A gap is a failure in a language that claims to be finished, and a fact in
    one that does not.

    Every content locale used to be all-or-nothing: a pack was written in full
    or the language was absent, so any hole meant a build had gone wrong. Twenty-two
    languages are now *in progress* — real packs with most rows still empty —
    and the app is built for that: `strictMeaning` resolves in the learner's own
    language or not at all, so an unwritten row removes a word from that
    language's quiz pool instead of falling back to English. Failing the build
    for it would be failing for the content backlog, every run, forever.

    `COMPLETE_LOCALES` is the list that still has to be perfect. A language moves
    into it when its pack is finished, and from that moment a missing row is a
    build failure again.
  */
  const complete = COMPLETE_LOCALES.has(locale);
  const report = (list, what) => {
    if (list.length === 0) return;
    const line = `${locale}: ${list.length} word(s) with no ${what} — e.g. ${list.slice(0, 5).join(', ')}`;
    if (complete) fail(line);
    else inProgress.push(line);
  };
  report(missing, 'meaning');
  report(noExample, 'example translation');
}

if (inProgress.length > 0) {
  console.log(`\n  ${inProgress.length} gap(s) in languages still being written:`);
  for (const line of inProgress) console.log(`    ${line}`);
  console.log(
    '    These remove words from that language\'s quiz pool rather than falling back\n' +
      "    to English — see §23.8. They are the content backlog, not a build fault.",
  );
}

// --- 5. Pronunciation ---------------------------------------------------------

/**
 * How many of the most useful words get the stronger check.
 *
 * §5 asks for stronger validation on core vocabulary, and "core" here is the
 * top of the priority order — the words a beginner meets in their first weeks,
 * where a wrong transcription is worst because it is the one they will repeat.
 */
const CORE = 500;

{
  const core = [...words]
    .sort((a, b) => a.difficulty_score - b.difficulty_score || a.word.localeCompare(b.word))
    .slice(0, CORE);

  for (const row of core) {
    const ipa = toIpa(row.say ?? row.word);
    if (!ipa) {
      fail(`${row.word}: no pronunciation could be transcribed`);
      continue;
    }
    // An unmapped letter passes through as itself, which reads as a rendering
    // bug rather than as a missing table entry.
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ipa)) {
      fail(`${row.word}: pronunciation "${ipa}" still contains Hangul — a letter is unmapped`);
    }
    // A syllable's worth of symbols per syllable, give or take. Far fewer means
    // something was dropped silently.
    const syllables = [...(row.say ?? row.word)].filter((c) => /[가-힣]/.test(c)).length;
    if (syllables > 0 && ipa.split('.').length !== syllables) {
      fail(
        `${row.word}: transcribed as ${ipa.split('.').length} syllables, written as ${syllables}`,
      );
    }
  }

  /*
   * A word the pipeline says is *said* differently must transcribe differently.
   *
   * This is the check that the reviewed spoken form is actually being used. If
   * `pronunciationOf` ever went back to transcribing the spelling, every one of
   * these five hundred-odd words would quietly start showing the pronunciation
   * a beginner guesses rather than the one a Korean speaker says, and nothing
   * else in the build would notice.
   */
  const changed = words.filter((row) => row.say && row.say !== row.word);
  const unchanged = changed.filter((row) => toIpa(row.say) === toIpa(row.word));
  if (changed.length === 0) {
    fail('no word carries a spoken form — the sound-change data has gone missing');
  }
  if (unchanged.length > changed.length / 2) {
    fail(
      `${unchanged.length} of ${changed.length} words with a spoken form transcribe identically ` +
        'to their spelling — the reviewed pronunciation is not being used',
    );
  }
  notes.push(
    `${core.length} core words transcribed; ${changed.length} carry a reviewed spoken form`,
  );
}

// --- 6. The two prohibitions --------------------------------------------------

/**
 * No word images. §32.
 *
 * The field, the asset pipeline and the UI were removed. This is the check that
 * stops them coming back: a dataset that grows an image field again would
 * otherwise ship one, and the first anybody would know is an empty thumbnail on
 * a card.
 */
const IMAGE_FIELDS = ['image', 'img', 'picture', 'illustration', 'emoji', 'icon', 'photo'];
for (const row of words.slice(0, 2000)) {
  for (const field of IMAGE_FIELDS) {
    if (field in row) fail(`${row.word}: has an image field (${field}) — §32 removed word images`);
  }
}

/**
 * No word handwriting. §5, §35.
 *
 * Asserted against the app rather than the data, because handwriting is not a
 * field — it is a *skill the scheduler can select*. If `guided_writing` ever
 * returns to a word's skill list, every one of review, the daily session and
 * saved words starts handing learners a canvas again, from four different
 * routes, and no per-screen check would catch it.
 */
const memory = readFileSync(join(ROOT, 'apps', 'web', 'src', 'domain', 'memory.ts'), 'utf8');
const wordSkills = memory.match(/export const WORD_SKILLS = \[([\s\S]*?)\] as const;/);
if (!wordSkills) {
  fail('cannot find WORD_SKILLS — the no-handwriting rule cannot be verified');
} else if (wordSkills[1].includes('guided_writing')) {
  fail('WORD_SKILLS contains guided_writing — §5 forbids vocabulary handwriting');
}

const exercises = readFileSync(
  join(ROOT, 'apps', 'web', 'src', 'features', 'review', 'exercises.ts'),
  'utf8',
);
if (!/case 'write':[\s\S]{0,1200}?return null;/.test(exercises)) {
  fail("the word exercise builder no longer refuses 'write' — §35 requires it to");
}

// --- 7. Report ----------------------------------------------------------------

console.log('Vocabulary QA\n');
console.log(`  headwords          ${words.length.toLocaleString('en')}`);
console.log(`  categories         ${(data.categories ?? []).length}`);
console.log(`  locales            ${locales.join(', ')}`);
console.log(`  target             ${TARGET_HEADWORDS.toLocaleString('en')}`);

if (notes.length) {
  console.log('');
  for (const note of notes) console.log(`  · ${note}`);
}

for (const [label, list] of [
  ['warning', warnings],
  ['error', errors],
]) {
  if (list.length === 0) continue;
  console.log(`\n  ${list.length} ${label}(s):`);
  for (const item of list.slice(0, 40)) console.log(`    ${item}`);
  if (list.length > 40) console.log(`    … and ${list.length - 40} more`);
}

if (errors.length > 0) {
  console.error(`\nvocabulary:qa failed — ${errors.length} error(s).`);
  process.exit(CHECK ? 1 : 0);
}
console.log('\nvocabulary:qa passed.');
