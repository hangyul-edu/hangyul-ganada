#!/usr/bin/env node
/**
 * Every level from 1 to 30, one row each, with the numbers that decide whether
 * a learner placed there has a course to follow.
 *
 *   npm run vocabulary:level:audit
 *   npm run vocabulary:level:audit -- --check
 *
 * ## Why a thirtieth row is the point
 *
 * The corpus has been audited from the top for four passes, because the top is
 * where a learner runs out: `I-79` is about levels 28–30 and the words added to
 * answer it went there. That is a real shortage and it is not the worst one.
 *
 * A learner is taught from a **zone** — their level and its neighbours — so
 * what decides how long they have new words for is not how many words their
 * level holds but how many the zone does. Level 1's zone is 1–2, which is
 * 47 + 55 = 102 words; at ten a day that is ten days. Level 30's zone is
 * 28–30, which is 478. **The thinnest part of the scale is the beginning**,
 * and a beginner is the learner most likely to be new enough to leave.
 *
 * So this reports every level rather than the interesting ones, and each row
 * carries what a shortage actually looks like from the four directions it can
 * come from: too few words, words missing the pieces a question needs, words
 * a learner cannot read in their own language, and words that are in the
 * wrong place.
 *
 * ## The columns
 *
 * | | |
 * | --- | --- |
 * | **words** | taught entries whose level is this one |
 * | **zone** | the band a learner at this level is taught from, and its size |
 * | **days** | zone ÷ 10, the days of new words before repetition begins |
 * | **senses** | distinct `senseId`s — a headword taught twice under two senses counts twice, which is what the learner meets |
 * | **pos** | the part-of-speech spread, as the share held by the commonest one |
 * | **topics** | how many of the 18 categories the level touches |
 * | **example** | entries with a Korean example sentence |
 * | **audio** | entries whose word and example clips are both in the manifest |
 * | **en** | entries with an English meaning |
 * | **packs** | languages in which *every* word of this level has a meaning |
 * | **freq** | median observed frequency rank; `—` where the level is mostly unobserved |
 *
 * ## What fails the build, and what only prints
 *
 * Failing: a level with too few words to build a fortnight from, an entry with
 * no example, no English, or no audio slot, and a level whose part of speech
 * or topic spread has collapsed to a single value. Those are all repairable
 * from this repository and none of them is a judgement call.
 *
 * Printing: the frequency medians and the pack coverage. The first is a
 * property of the corpora rather than of the product, and the second is
 * `I-19`, which is open, counted, and not something a threshold should be able
 * to hide by being lowered.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const WORDS = read('apps/web/src/data/generated/vocabulary.json');
const words = Array.isArray(WORDS) ? WORDS : (WORDS.words ?? Object.values(WORDS)[0]);
const manifest = read('apps/web/public/audio/manifest.json');
/** Recorded clip ids. `audioId` in `data/vocabulary.ts` builds the same string. */
const clips = new Set(manifest.entries.map((entry) => entry.id));
const audioId = (prefix, text) =>
  `${prefix}_${[...text].map((ch) => ch.codePointAt(0).toString(16)).join('')}`;

/** Every locale pack that ships a meaning map. */
const packFiles = readdirSync(join(ROOT, 'apps/web/src/data/generated'))
  .filter((name) => /^vocabulary\.[\w-]+\.json$/.test(name));
/*
 * The meaning packs are keyed by *position* in `vocabulary.json`, not by word
 * id — see `data/wordCopy.ts`, which zips a band's rows against that band's id
 * list. A lookup by `word.id` finds nothing and reports the whole corpus as
 * untranslated, which is what the first draft of this script did.
 */
const packs = packFiles.map((name) => {
  const locale = name.slice('vocabulary.'.length, -'.json'.length);
  const pack = read(`apps/web/src/data/generated/${name}`);
  return { locale, rows: pack.words ?? {} };
});
const english = packs.find((p) => p.locale === 'en')?.rows ?? {};
const positionOf = new Map(words.map((word, index) => [word.id, index]));
const meaning = (rows, word) => rows[String(positionOf.get(word.id))]?.[0];

/**
 * The band a learner at `level` is taught from.
 *
 * Mirrors `domain/vocabularyLevel.teachingZone`: the learner's level and one
 * either side, three levels wide, deepening the other way at both ends rather
 * than narrowing.
 */
function zoneOf(level) {
  const clamp = (value) => Math.min(30, Math.max(1, value));
  if (level <= 2) return [1, 3];
  if (level >= 29) return [28, 30];
  return [clamp(level - 1), clamp(level + 1)];
}

const LEVELS = Array.from({ length: 30 }, (_, i) => i + 1);
const byLevel = new Map(LEVELS.map((l) => [l, []]));
for (const word of words) {
  if (byLevel.has(word.level)) byLevel.get(word.level).push(word);
}

const failures = [];
const fail = (what) => failures.push(what);

/** Days of new words a zone supplies at the shipping rate of ten a day. */
const PER_DAY = 10;
/**
 * The floor, in days.
 *
 * A fortnight is the interval the product's own review schedule is built
 * around, so a zone that cannot supply one is a zone where a learner meets a
 * word again before they were due to. It is deliberately not "enough for
 * ever": that is `I-04`, it is open, and a gate that demanded it would fail
 * every build without telling anybody anything new.
 */
const MIN_DAYS = 14;

const rows = [];
for (const level of LEVELS) {
  const own = byLevel.get(level);
  const [low, high] = zoneOf(level);
  const zone = words.filter((w) => w.level >= low && w.level <= high);
  const days = Math.floor(zone.length / PER_DAY);

  const senses = new Set(own.map((w) => w.senseId ?? w.id)).size;
  const pos = new Map();
  for (const w of own) pos.set(w.part_of_speech, (pos.get(w.part_of_speech) ?? 0) + 1);
  const topics = new Set(own.map((w) => w.c)).size;
  const commonestPos = own.length === 0 ? 0 : Math.max(...pos.values()) / own.length;

  const withExample = own.filter((w) => w.example && String(w.example).trim()).length;
  const withEnglish = own.filter((w) => meaning(english, w)).length;
  /*
   * Both clips, not either: the word card plays the headword and the example
   * sentence, and a word with only one of them is a card with a dead speaker
   * on it.
   *
   * From `word` and `example` exactly as `data/vocabulary.ts` derives them —
   * *not* from `say`, the spoken form. 쉽다 is pronounced 쉽따 and the clip is
   * still filed under the spelling, so keying on the pronunciation reports
   * eight hundred silent words that all play.
   */
  const withAudio = own.filter(
    (w) => clips.has(audioId('word', w.word)) && (!w.example || clips.has(audioId('ex', w.example))),
  ).length;

  const complete = packs.filter((p) => own.every((w) => meaning(p.rows, w))).length;

  const observed = own.map((w) => (Array.isArray(w.f) ? w.f[1] : null)).filter((r) => typeof r === 'number' && r > 0).sort((a, b) => a - b);
  const medianRank = observed.length === 0 ? null : observed[Math.floor(observed.length / 2)];

  rows.push({ level, own: own.length, zone: zone.length, days, senses, topics, commonestPos,
    withExample, withEnglish, withAudio, complete, medianRank,
    observedShare: own.length ? observed.length / own.length : 0 });

  // --- what fails ----------------------------------------------------------
  if (days < MIN_DAYS) {
    fail(`level ${level}: its zone (${low}–${high}) holds ${zone.length} words — ${days} days of new words, under the ${MIN_DAYS}-day floor`);
  }
  if (withExample !== own.length) {
    fail(`level ${level}: ${own.length - withExample} word(s) have no example sentence`);
  }
  if (withEnglish !== own.length) {
    fail(`level ${level}: ${own.length - withEnglish} word(s) have no English meaning`);
  }
  if (withAudio !== own.length) {
    fail(`level ${level}: ${own.length - withAudio} word(s) are missing a recording for the word or its example`);
  }
  if (own.length > 4 && commonestPos === 1) {
    fail(`level ${level}: every word is the same part of speech`);
  }
  if (own.length > 4 && topics < 2) {
    fail(`level ${level}: every word is in one topic`);
  }
}

// --- report -------------------------------------------------------------------

console.log('Vocabulary levels 1–30 — every level, not the interesting ones\n');
console.log(`  taught words          ${words.length.toLocaleString('en')}`);
console.log(`  locale packs read     ${packs.length}`);
console.log(`  new words per day     ${PER_DAY}, so the floor is a ${MIN_DAYS}-day zone\n`);
console.log('  level  words   zone  days  senses  topics  top-pos  example  audio   en   packs  median rank');
for (const r of rows) {
  const [low, high] = zoneOf(r.level);
  console.log(
    `  ${String(r.level).padStart(5)}  ${String(r.own).padStart(5)}  ${`${low}–${high}`.padStart(5)}` +
      `  ${String(r.days).padStart(4)}  ${String(r.senses).padStart(6)}  ${String(r.topics).padStart(6)}` +
      `  ${(r.commonestPos * 100).toFixed(0).padStart(6)}%  ${String(r.withExample).padStart(7)}` +
      `  ${String(r.withAudio).padStart(5)}  ${String(r.withEnglish).padStart(3)}  ${String(r.complete).padStart(5)}` +
      `  ${r.medianRank === null ? '        —' : String(r.medianRank).padStart(9)}`,
  );
}

const thinnest = [...rows].sort((a, b) => a.days - b.days).slice(0, 5);
console.log('\n  thinnest zones, in days of new words before repetition:');
for (const r of thinnest) console.log(`    level ${String(r.level).padStart(2)}  ${r.days} days from ${r.zone} words`);

if (failures.length === 0) {
  console.log('\n  every level has a fortnight of new words, an example and an English meaning for every entry,');
  console.log('  and more than one part of speech and topic.');
} else {
  console.log(`\n  ${failures.length} problem(s):`);
  for (const f of failures) console.log(`    ${f}`);
}
if (CHECK && failures.length > 0) process.exit(1);
