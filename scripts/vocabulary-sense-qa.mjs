#!/usr/bin/env node
/**
 * One taught sense per word, in every language.
 *
 *   npm run vocabulary:sense:qa            report
 *   npm run vocabulary:sense:qa -- --check report, and fail on a hard finding
 *
 * ## The defect this exists for
 *
 * A vocabulary card shows a Korean word, a meaning, and an example sentence.
 * Those three have to be about the *same sense* of the word, and for eight
 * entries they were not:
 *
 * ```
 *   열      "fever"                 열까지 세어 보세요.  Please count to ten.
 *   찍다    "to take a photo"       도장을 찍었어요.     I stamped it with a seal.
 *   수도    "waterworks"            한국의 수도는 서울이에요.
 * ```
 *
 * The Korean gloss was right in every case and the example was right in every
 * case. What was wrong was the English, which the build *derives* from a
 * dictionary where the entry carries no explicit `en` — and a derivation has to
 * pick a sense, so on a polysemous headword it picks one and the example
 * demonstrates the other. All eight now carry an authored `en`, which the build
 * prefers, so they cannot silently revert.
 *
 * ## What a machine can and cannot decide here
 *
 * It cannot decide that two glosses in two languages mean the same thing. That
 * was tried: comparing the English gloss against the example translation by
 * word overlap flags 11% of the corpus and is mostly noise, and comparing the
 * English and Korean glosses by grammatical *shape* flags 21 entries of which
 * most are correct. Neither is a check; both are a way of generating work.
 *
 * What it can decide is precise, and is what this does:
 *
 * * **Coverage** — every shipping word has a meaning in every language that
 *   claims to be complete. Hard failure.
 * * **Part of speech against the shape of the gloss** — an infinitive gloss on
 *   a noun, or a verb glossed as a bare noun. Hard failure. One documented
 *   exception; it fires on 1 of 2,581 today.
 * * **The pinned senses** — the eight corrected above must still read as
 *   pinned. Hard failure, and the reason this file exists at all.
 * * **More than one sense in one gloss** — a *report*, not a gate. The build
 *   already refuses a two-sense English gloss (`gloss.problems`); the other
 *   languages have no such rule and 차 is "a car, or the tea you drink" in
 *   Korean and 車、お茶 in Japanese. Those are real and they are content work,
 *   so they are listed rather than made to block a build nobody can unblock.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = join(ROOT, 'apps/web/src/data/generated');
const CHECK = process.argv.includes('--check');

const read = (name) => JSON.parse(readFileSync(join(GENERATED, name), 'utf8'));
const corpus = read('vocabulary.json');

/**
 * The eleven glosses that contradicted their own example, and what they say now.
 *
 * Matched exactly. A near-match would let a regeneration replace "ten" with
 * "the number ten, a count" and call it unchanged, and the point of pinning is
 * that the sense stops moving.
 *
 * The last three were found by translating: Vietnamese and Thai are written
 * from the example sentence rather than from the English gloss, so a
 * translator reading 전기 "first period, early period" beside 전기가 나갔어요
 * writes "electricity" and the disagreement surfaces. 적다 needed its part of
 * speech corrected as well — the derivation had taken the verb "to write down"
 * on a headword whose example is the adjective "to be few".
 */
const PINNED = {
  네: 'yes',
  열: 'ten',
  타다: 'to ride, to get on',
  쓰다: 'to write',
  수도: 'the capital city',
  정말: 'really, truly',
  찍다: 'to stamp',
  있다: 'to be in a place',
  적다: 'to be few, to be little',
  전기: 'electricity',
  마디: 'a word, a remark',
};

/**
 * Glosses that look like a part-of-speech conflict and are not.
 *
 * "to one's heart's content" is an adverbial phrase that begins with the word
 * "to". Listed rather than pattern-matched around, because a cleverer pattern
 * is a pattern that will one day fail to notice a real one.
 */
const POS_EXCEPTIONS = new Set(['실컷']);

/**
 * Separators that divide two *senses* rather than two words for one sense.
 *
 * Punctuation only, plus Korean's 또는. The obvious additions — "or", "ou",
 * "oder" — were tried and removed: 아니면 *means* "or", 이상 means "or more",
 * and a rule that reports a gloss for containing the word it is glossing is a
 * rule that trains people to ignore its output.
 *
 * A comma is deliberately absent for the same reason in the other direction:
 * "we, us" and "mum, mummy" are one sense given two renderings, which is good
 * writing and not a defect.
 */
const SENSE_SPLIT = /;|；|또는|、/;

const hard = [];
const notes = [];

// --- Coverage -----------------------------------------------------------------

/**
 * Languages whose meanings are carried on every corpus entry.
 *
 * Read from the corpus rather than listed, so a locale added to the pack is
 * checked without touching this file. Vietnamese and Thai are absent because
 * they are not carried on the entries — they are hand-written files keyed by
 * word id, and a word with no line there gets a `null` row that `wordCopy`
 * resolves down the fallback chain. They are complete today and are counted
 * below as a *report*: a word added to the corpus tomorrow ships with English
 * in those two languages rather than failing a build nobody can unblock
 * without writing Vietnamese.
 */
const complete = corpus.locales;
const packs = new Map();
for (const locale of complete) {
  const name = `vocabulary.${locale}.json`;
  if (!existsSync(join(GENERATED, name))) {
    hard.push(`${locale} claims complete copy and has no pack`);
    continue;
  }
  packs.set(locale, read(name).words);
}

for (const [locale, rows] of packs) {
  if (rows.length !== corpus.words.length) {
    hard.push(`${locale} has ${rows.length} rows for ${corpus.words.length} words`);
    continue;
  }
  const empty = rows.reduce((n, row) => n + (row && row[0] ? 0 : 1), 0);
  if (empty > 0) hard.push(`${locale} is missing ${empty} meaning(s)`);
}

/**
 * The hand-written languages, counted rather than gated.
 *
 * `existsSync` and not a hard failure: these packs are allowed to be partial,
 * and the number is the honest claim `docs/LOCALIZATION_NATIVE_REVIEW.md`
 * makes. Coverage is not review — neither of these has been read by a native
 * speaker, and no check here can change that.
 */
const HAND_WRITTEN = ['vi', 'th'];
const readPack = (locale) => {
  const name = `vocabulary.${locale}.json`;
  return existsSync(join(GENERATED, name)) ? read(name).words : null;
};
const handWritten = new Map();
for (const locale of HAND_WRITTEN) {
  const rows = readPack(locale);
  if (!rows) continue;
  handWritten.set(locale, rows.reduce((n, row) => n + (row && row[0] ? 1 : 0), 0));
}

// --- Part of speech against the gloss -----------------------------------------

const english = packs.get('en') ?? [];
for (const [index, word] of corpus.words.entries()) {
  const gloss = english[index]?.[0];
  if (!gloss || POS_EXCEPTIONS.has(word.word)) continue;
  const infinitive = /^to\s/i.test(gloss);
  const pos = word.part_of_speech;
  if (infinitive && pos !== 'verb' && pos !== 'adjective') {
    hard.push(`${word.word} is a ${pos} glossed as an infinitive — "${gloss}"`);
  }
  if (!infinitive && pos === 'verb') {
    hard.push(`${word.word} is a verb glossed as "${gloss}", which is not an action`);
  }
}

// --- The long definition, all languages or none --------------------------------

/*
 * A *More about it* section that appears in English and not in Portuguese is
 * the defect this check exists for, and it is the one the old derived
 * definitions had: 784 words carried one, all of them English.
 *
 * The eight entry-carried locales are already gated by `pack.py`, which refuses
 * a partial `d`. Vietnamese and Thai are not — they are hand-written files, and
 * nothing stops somebody adding a Vietnamese paragraph and forgetting Thai. So
 * the count is compared across all ten, and a word that has the section in some
 * languages and not in others is a hard failure rather than a difference a
 * learner discovers by switching language.
 */
const withDefinition = new Map();
for (const [locale, rows] of [...packs, ...HAND_WRITTEN.map((l) => [l, readPack(l)])]) {
  if (!rows) continue;
  withDefinition.set(locale, new Set(rows.flatMap((row, index) => (row?.[2] ? [index] : []))));
}
const [reference] = [...withDefinition.keys()];
if (reference) {
  const expected = withDefinition.get(reference);
  for (const [locale, indices] of withDefinition) {
    const missing = [...expected].filter((index) => !indices.has(index));
    const extra = [...indices].filter((index) => !expected.has(index));
    for (const index of missing) {
      hard.push(`${corpus.words[index].word} has a long definition in ${reference} and not in ${locale}`);
    }
    for (const index of extra) {
      hard.push(`${corpus.words[index].word} has a long definition in ${locale} and not in ${reference}`);
    }
  }
}

// --- The pinned senses --------------------------------------------------------

for (const [headword, expected] of Object.entries(PINNED)) {
  const index = corpus.words.findIndex((word) => word.word === headword);
  if (index < 0) {
    notes.push(`${headword} is pinned and no longer ships — remove it from PINNED`);
    continue;
  }
  const actual = english[index]?.[0];
  if (actual !== expected) {
    hard.push(
      `${headword} was pinned to "${expected}" and now reads "${actual}" — ` +
        'the sense has moved back to one its own example does not demonstrate',
    );
  }
}

// --- More than one sense in one gloss — reported ------------------------------

const multi = new Map();
for (const [locale, rows] of packs) {
  const found = [];
  rows.forEach((row, index) => {
    if (row?.[0] && SENSE_SPLIT.test(row[0])) found.push(`${corpus.words[index].word}: ${row[0]}`);
  });
  if (found.length) multi.set(locale, found);
}

// --- Report -------------------------------------------------------------------

console.log(
  `Sense QA — ${corpus.words.length.toLocaleString('en')} words, ` +
    `${packs.size} language(s) claiming complete copy`,
);

if (reference) {
  console.log(
    `  ${withDefinition.get(reference).size} word(s) carry a long definition, ` +
      `in all ${withDefinition.size} language(s)`,
  );
}

for (const [locale, covered] of handWritten) {
  const total = corpus.words.length;
  console.log(
    `  ${locale}  ${covered.toLocaleString('en')} of ${total.toLocaleString('en')} ` +
      `written by hand${covered < total ? ' — the rest fall back to English, marked' : ''}`,
  );
}

if (multi.size > 0) {
  const total = [...multi.values()].reduce((n, list) => n + list.length, 0);
  console.log(`\n${total} gloss(es) carry more than one sense — content work, not a build failure:`);
  for (const [locale, found] of multi) {
    console.log(`  ${locale}  ${found.length}`);
    for (const line of found.slice(0, 4)) console.log(`      ${line}`);
    if (found.length > 4) console.log(`      … and ${found.length - 4} more`);
  }
}

for (const note of notes) console.log(`\nnote: ${note}`);

if (hard.length === 0) {
  console.log('\nEvery word has one taught sense in every complete language, and the pinned ones held.');
} else {
  console.log(`\n${hard.length} problem(s):`);
  for (const problem of hard) console.log(`  ${problem}`);
}

if (CHECK && hard.length > 0) process.exit(1);
