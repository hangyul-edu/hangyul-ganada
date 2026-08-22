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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPLETE_LOCALES } from './lib/locale-status.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = join(ROOT, 'apps/web/src/data/generated');
const CHECK = process.argv.includes('--check');

const read = (name) => JSON.parse(readFileSync(join(GENERATED, name), 'utf8'));

/**
 * The dictionary entry for a headword, or nothing.
 *
 * Read straight off the built chunks rather than through the app's loader,
 * which fetches over HTTP and would need a server. Thirty thousand entries is
 * a few seconds and one pass, so they are indexed once here.
 */
const DICTIONARY = new Map();
{
  const dir = join(ROOT, 'apps/web/public/dictionary/entries');
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      for (const entry of JSON.parse(readFileSync(join(dir, file), 'utf8')).entries) {
        DICTIONARY.set(entry.headword, entry);
      }
    }
  }
}
const dictionaryEntry = (headword) => DICTIONARY.get(headword);
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
/** Coverage in the languages still being written — measured, never gated. */
const backlog = [];

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
 *
 * Carrying a pack is no longer the same as promising a full one. Twenty-two of
 * these languages are being written — see `lib/locale-status.mjs` — so what is
 * gated below is the ten that have finished, and the rest are measured.
 */
const shipped = corpus.locales;
const packs = new Map();
for (const locale of shipped) {
  const name = `vocabulary.${locale}.json`;
  if (!existsSync(join(GENERATED, name))) {
    hard.push(`${locale} claims complete copy and has no pack`);
    continue;
  }
  packs.set(locale, read(name).words);
}

/*
 * Row count is a hard failure in every language, written or not: the packs are
 * positional, so a pack of the wrong length does not leave a word blank — it
 * shifts every gloss after the gap onto the wrong word.
 *
 * Emptiness is the part that depends on the promise. A finished language with a
 * hole in it is a defect; an unfinished one is a backlog figure, and printed as
 * one so the number stays visible instead of being suppressed.
 */
const written = new Map();
for (const [locale, rows] of packs) {
  if (rows.length !== corpus.words.length) {
    hard.push(`${locale} has ${rows.length} rows for ${corpus.words.length} words`);
    continue;
  }
  written.set(locale, new Set(rows.flatMap((row, index) => (row && row[0] ? [index] : []))));
  const empty = corpus.words.length - written.get(locale).size;
  if (empty === 0) continue;
  if (COMPLETE_LOCALES.has(locale)) hard.push(`${locale} is missing ${empty} meaning(s)`);
  else backlog.push(`${locale} ${written.get(locale).size} of ${corpus.words.length} written`);
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
    /*
     * A language still being written is compared over the rows it has actually
     * written. Anything else asks it to translate a paragraph for a word whose
     * one-line meaning it does not have yet, which is not a defect but the
     * definition of unfinished — and it would drown the real finding, which is
     * a *written* row that has the section in one language and not another.
     */
    const scope = COMPLETE_LOCALES.has(locale) ? null : (written.get(locale) ?? new Set());
    const missing = [...expected].filter((index) => !indices.has(index) && (!scope || scope.has(index)));
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

// --- More than one sense in one gloss -----------------------------------------

/**
 * Split glosses that have been read and found to be one sense, not two.
 *
 * A separator in a gloss is not by itself a defect. Japanese has no single verb
 * for 있다 and must write ある、いる, choosing by animacy; it has no word for
 * 동생 and must write 弟、妹, choosing by gender. That is one taught sense given
 * the two renderings the language requires, and the English gloss usually says
 * so itself — "nephew, niece", "to peel, to cut down".
 *
 * What is a defect is the other kind, and 차 was it: 車、お茶, a car *or* the tea
 * you drink, on a beginner's card whose sentence is 차를 타요. Two answers, one
 * button. 103 glosses were read against the sentence each card actually asks;
 * 35 named a sense the sentence never demonstrates and were trimmed to the one
 * it does. These are the rest.
 *
 * Keyed `locale/headword` so that a word may be reviewed in one language and
 * still be caught in another. Anything not on this list fails: the point of
 * writing the review down is that the next split gloss has to be read too,
 * rather than joining a list of warnings nobody reads.
 *
 * The obvious wider rule — every gloss must be recognisable in its own example
 * — is already applied to concrete nouns in `examples_qa.py` and cannot be
 * widened to verbs: run over the 2,581-word corpus it flags 215, almost all of
 * them honest paraphrase ("to see" glossing "I watch a movie", "to congratulate"
 * glossing "Happy birthday to you"). Hence a read list rather than a heuristic.
 */
const REVIEWED_SPLIT = new Set(
  [
    // English teaches both halves itself.
    'ko/밥', 'ko/접속', 'ja/안녕', 'ja/아무', 'ja/조카', 'ja/안부', 'ja/맑다', 'ja/짓다',
    'ja/닿다', 'ja/깎다', 'ja/갈다', 'ja/여기다', 'ja/닦다', 'ja/뚫다', 'ja/빠지다',
    'ja/외계', 'ja/곱다', 'ja/돋다', 'ja/뜯다', 'ja/이제',
    // Japanese needs two words where Korean and English need one.
    'ja/나', 'ja/있다', 'ja/없다', 'ja/알다', 'ja/살다', 'ja/동생', 'ja/받다', 'ja/내다',
    'ja/풀다', 'ja/담다', 'ja/나다', 'ja/빼다', 'ja/몰다', 'ja/치르다', 'ja/잠그다',
    'ja/틀다', 'ja/아하',
    // A collocation list in parentheses, not a second sense: 上（学、班）.
    'zh-CN/다니다',
  ],
);

for (const [locale, rows] of packs) {
  rows.forEach((row, index) => {
    if (!row?.[0] || !SENSE_SPLIT.test(row[0])) return;
    const headword = corpus.words[index].word;
    if (REVIEWED_SPLIT.has(`${locale}/${headword}`)) return;
    hard.push(
      `${headword} reads "${row[0]}" in ${locale} — two senses on a card that ` +
        `teaches ${corpus.words[index].senseId}. Trim it to the sense the ` +
        'example demonstrates, or add it to REVIEWED_SPLIT once you have read it',
    );
  });
}

// --- Commas, against the dictionary's own senses -------------------------------

/*
 * §50: a comma in a gloss may be two renderings of one sense, or two senses.
 *
 * `SENSE_SPLIT` deliberately excludes the comma, because "we, us" and "mum,
 * mummy" are one sense written twice and a rule that flagged those would flag
 * seven hundred glosses and be switched off within a week. But some comma
 * glosses really do carry two senses — "a neck, a throat" — and nothing here
 * could tell them apart.
 *
 * The dictionary can. Every taught word has an entry with its senses already
 * separated by somebody else, so a comma gloss whose parts land on *different*
 * dictionary senses is the shortlist worth reading. It is a shortlist and not a
 * verdict: 55 words come back and most are near-synonyms Wiktionary happens to
 * file apart — "to grab, to catch", "traffic, transport". Five were real, and
 * the five are what this pass fixed:
 *
 * ```
 *   목    "a neck, a throat"        every example said throat; eight glosses said neck
 *   밥    "rice, a meal"            English translated its example "a meal"; eight said rice
 *   근데  "but, by the way"         four glosses said but; every example was by-the-way
 *   그쪽  "that way, your side"     the example is the polite second person
 *   기술  "technology, a skill"     the Korean gloss is 솜씨, and every example is technique
 * ```
 *
 * Every remaining word is named below, which is what makes this a review rather
 * than a filter: a new comma gloss that splits senses is not on the list, and
 * fails.
 */
const REVIEWED_COMMA = new Set([
  // One sense, two English words for it — no single word does the job.
  '지금', '여행', '자리', '맞다', '보이다', '아직', '잡다', '약속', '제일', '손님',
  '우주', '교통', '아무', '시원하다', '행동', '베다', '흐리다', '나누다', '닦다', '얻다',
  '끊다', '존재', '건드리다', '뿌리다', '깨어나다', '가만히', '이동', '부동산', '사인',
  '깨지다', '꼬다', '똑바로', '발표하다', '늘어나다', '작전', '부수다', '조종하다',
  '아깝다', '외부', '대기', '줄곧', '중지', '실행', '떠돌다', '충돌', '채다', '휘다',
  '돋다', '억지로', '기울다',
  // Read and kept after the fix: the parts are the same sense either way.
  '밥',
]);

const article = /^(?:to|a|an|the)\s+/i;
const bare = (text) => text.trim().toLowerCase().replace(article, '').trim();
const unreviewed = [];
for (const [index, word] of corpus.words.entries()) {
  const gloss = english[index]?.[0];
  if (!gloss || !gloss.includes(',')) continue;
  const entry = dictionaryEntry(word.word);
  if (!entry) continue;
  /*
    Which dictionary sense each part of the gloss belongs to. A part that
    matches nothing is ignored rather than counted as a third sense — the
    dictionary is a second opinion here, not the authority, and its silence
    says nothing.
  */
  const senses = new Map();
  for (const part of gloss.split(',').map(bare).filter(Boolean)) {
    const match = entry.senses.find((sense) => bare(sense.gloss).includes(part));
    if (match) senses.set(part, match.senseId);
  }
  const distinct = new Set(senses.values());
  if (senses.size >= 2 && distinct.size > 1 && !REVIEWED_COMMA.has(word.word)) {
    unreviewed.push(
      `${word.word} reads "${gloss}", and its parts are ${[...distinct].join(' and ') } in ` +
        'the dictionary — two senses on one card. Trim it to the sense the example ' +
        'demonstrates, or add it to REVIEWED_COMMA once you have read it',
    );
  }
}
hard.push(...unreviewed);

const staleComma = [...REVIEWED_COMMA].filter(
  (headword) => !corpus.words.some((word) => word.word === headword && english[corpus.words.indexOf(word)]?.[0]?.includes(',')),
);
if (staleComma.length) {
  notes.push(
    `${staleComma.length} REVIEWED_COMMA entr(ies) no longer hold a comma gloss ` +
      `and should be deleted: ${staleComma.join(', ')}`,
  );
}

const stale = [...REVIEWED_SPLIT].filter((key) => {
  const [locale, headword] = key.split('/');
  const rows = packs.get(locale);
  if (!rows) return true;
  const index = corpus.words.findIndex((word) => word.word === headword);
  return index < 0 || !rows[index]?.[0] || !SENSE_SPLIT.test(rows[index][0]);
});
if (stale.length) {
  hard.push(
    `${stale.length} REVIEWED_SPLIT entr(ies) no longer name a split gloss and ` +
      `should be deleted: ${stale.join(', ')}`,
  );
}

// --- Report -------------------------------------------------------------------

console.log(
  `Sense QA — ${corpus.words.length.toLocaleString('en')} words, ` +
    `${packs.size} language(s) with a pack, ` +
    `${[...packs.keys()].filter((l) => COMPLETE_LOCALES.has(l)).length} of them finished`,
);

if (reference) {
  console.log(
    `  ${withDefinition.get(reference).size} word(s) carry a long definition, ` +
      `in all ${withDefinition.size} language(s)`,
  );
}

if (backlog.length) {
  console.log(`  ${backlog.length} language(s) still being written:`);
  for (const line of backlog) console.log(`    ${line}`);
}

for (const [locale, covered] of handWritten) {
  const total = corpus.words.length;
  console.log(
    `  ${locale}  ${covered.toLocaleString('en')} of ${total.toLocaleString('en')} ` +
      `written by hand${covered < total ? ' — the rest fall back to English, marked' : ''}`,
  );
}

console.log(
  `  ${REVIEWED_SPLIT.size} gloss(es) hold a separator and have been read as one sense`,
);

for (const note of notes) console.log(`\nnote: ${note}`);

if (hard.length === 0) {
  console.log('\nEvery word has one taught sense in every complete language, and the pinned ones held.');
} else {
  console.log(`\n${hard.length} problem(s):`);
  for (const problem of hard) console.log(`  ${problem}`);
}

if (CHECK && hard.length > 0) process.exit(1);
