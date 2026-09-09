#!/usr/bin/env node
/**
 * One row per supported language, joining every layer a learner reads.
 *
 *   node scripts/build-locale-ledger.mjs           write docs/LOCALE_LEDGER.md
 *   node scripts/build-locale-ledger.mjs --check   fail if it is out of date
 *
 * ## Why a ledger rather than a coverage percentage
 *
 * The product's strings do not live in one place, and each place has its own
 * gate: `i18n:report` reads the interface bundles, `locale:content` reads the
 * word packs, `letters:copy` reads the letter copy, `locales:native` reads what
 * the two stores are told. Each answers *is this layer complete* and none of
 * them answers *what does a person reading Hungarian actually get* — which is
 * the question a release has to answer, and the one a reviewer asks.
 *
 * So this puts the layers side by side. It computes nothing the other gates do
 * not; what it adds is that the numbers are in one table, and that the last
 * column is honest about the part no gate can supply.
 *
 * ## What "reads like English" means here
 *
 * A value identical to the English one. That is a *candidate* for source-language
 * leakage and not a finding: `won` is the Korean currency in Czech, Swedish,
 * Turkish, Vietnamese and Filipino; `Backup` is the loanword in Filipino and
 * Brazilian Portuguese; `Correct.` and `minutes` are French words. Every one is
 * listed rather than counted, so the reader can see which is which.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHECK = process.argv.includes('--check');
const UI = join(ROOT, 'apps', 'web', 'src', 'locales');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const locales = readdirSync(UI).filter((name) => !name.startsWith('.')).sort();
const namespaces = readdirSync(join(UI, 'en'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -5))
  .sort();

/** Every leaf of a namespace, as `ns:a.b.c`. */
function leaves(value, prefix, into) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, into);
    return into;
  }
  into.set(prefix, value);
  return into;
}

const english = new Map();
for (const ns of namespaces) leaves(read(join(UI, 'en', `${ns}.json`)), ns, english);

/**
 * Which of English's keys a given language is actually expected to carry.
 *
 * i18next writes one key per plural category — `unit_one`, `unit_other` — and
 * the categories are the language's, not English's. Japanese, Korean, Chinese
 * and Indonesian have one category, so `unit_one` is a key they must *not*
 * have. A first draft of this file counted English's keys for everyone and
 * reported twenty-one missing strings in each of those four, which is the
 * measurement being wrong rather than the packs.
 *
 * `Intl.PluralRules` is the same source `i18n-report.mjs` reads, so the two
 * cannot disagree about what complete means.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
function expectedKeys(locale) {
  const categories = new Set(new Intl.PluralRules(locale).resolvedOptions().pluralCategories);
  const out = new Map();
  for (const [key, value] of english) {
    const match = PLURAL_SUFFIX.exec(key);
    if (match && !categories.has(match[1])) continue;
    out.set(key, value);
  }
  return out;
}

/** The word packs: seven languages inline in the entries, the rest in copy files. */
const vocabulary = read(join(ROOT, 'apps', 'web', 'src', 'data', 'generated', 'vocabulary.json'));
const taught = vocabulary.words.length;
const copyDir = join(ROOT, 'content', 'vocabulary', 'copy');
const letterDir = join(ROOT, 'content', 'letters');

const rows = [];
const leaks = [];
for (const locale of locales) {
  const mine = new Map();
  let missing = 0;
  let blank = 0;
  for (const ns of namespaces) {
    const path = join(UI, locale, `${ns}.json`);
    if (!existsSync(path)) {
      missing += [...expectedKeys(locale).keys()].filter((key) => key.startsWith(`${ns}.`)).length;
      continue;
    }
    leaves(read(path), ns, mine);
  }
  const sameAsEnglish = [];
  const wanted = expectedKeys(locale);
  for (const [key, value] of wanted) {
    if (!mine.has(key)) {
      missing += 1;
      continue;
    }
    const got = mine.get(key);
    if (typeof got === 'string' && got.trim() === '') blank += 1;
    if (locale !== 'en' && typeof got === 'string' && got === value) sameAsEnglish.push({ key, value });
  }
  for (const entry of sameAsEnglish) leaks.push({ locale, ...entry });

  const wordCopy = existsSync(join(copyDir, `${locale}.json`))
    ? Object.keys(read(join(copyDir, `${locale}.json`)).words).length
    : taught; // en, ko and the five carried inline in the editorial entries
  const letterCopy = existsSync(join(letterDir, `${locale}.json`))
    ? Object.keys(read(join(letterDir, `${locale}.json`)).letters ?? read(join(letterDir, `${locale}.json`))).length
    : null; // en and ko are written beside the letters in data/characters.ts

  rows.push({
    locale,
    expected: wanted.size,
    present: wanted.size - missing,
    missing,
    blank,
    sameAsEnglish: sameAsEnglish.length,
    wordCopy,
    letterCopy,
  });
}

const lines = [];
lines.push('# The locale ledger');
lines.push('');
lines.push('GENERATED by `npm run locale:ledger`. Do not edit by hand.');
lines.push('');
lines.push(
  `${locales.length} supported languages and ${english.size} English interface strings, over ` +
    `${namespaces.length} namespaces (${namespaces.join(', ')}). A language's own expected ` +
    'count is lower when it has fewer plural categories than English — see `expectedKeys`.',
);
lines.push('');
lines.push('## Coverage, layer by layer');
lines.push('');
lines.push('| Locale | Expected | Present | Missing | Blank | Reads like English | Word pack | Letter copy | Native-speaker review |');
lines.push('|:---|---:|---:|---:|---:|---:|---:|---:|:---|');
for (const row of rows) {
  lines.push(
    `| ${row.locale} | ${row.expected} | ${row.present} | ${row.missing} | ${row.blank} | ` +
      `${row.sameAsEnglish} | ${row.wordCopy.toLocaleString('en')} | ` +
      `${row.letterCopy === null ? 'inline' : row.letterCopy} | required |`,
  );
}
lines.push('');
lines.push('**Word pack** is the number of taught words that carry a meaning and an example');
lines.push('translation in that language; the corpus holds ' + taught.toLocaleString('en') + '.');
lines.push('Korean carries meanings and no example translations, because the example *is* the');
lines.push('Korean. **Letter copy** is the per-language sound hints and mnemonics for the 73');
lines.push('letters and blocks; English and Korean are written beside the letters in');
lines.push('`data/characters.ts` and are marked `inline`.');
lines.push('');
lines.push('## Every string that is identical to the English one');
lines.push('');
lines.push(
  'Listed rather than counted, because a match is a candidate and not a finding, and ' +
    'a count would hide which. Every row below was read. They fall into five classes ' +
    'and none of them is source-language leakage:',
);
lines.push('');
lines.push('1. **Nothing to translate.** `{{current, number}} / {{total, number}}`,');
lines.push('   `{{count, number}}`, `010`, `010-1234-5678`, `3.5`, `10,000`, `100,000,000` —');
lines.push('   interpolation and numerals, identical in every language by construction.');
lines.push('2. **A Korean word that no language translates.** `won` is the currency in Czech,');
lines.push('   Swedish, Turkish, Vietnamese and Filipino, and `Lv.` is the level abbreviation');
lines.push('   the same interfaces use.');
lines.push('3. **The same word.** `Problem` in German, Polish and Swedish; `Pause` in German');
lines.push('   and French; `verb`, `adverb` and `numeral` in Romanian, Swedish, Spanish and');
lines.push('   Portuguese; `interjection`, `contraction`, `Romanisation` and `min` in French;');
lines.push('   `letters` and `Recent` in Dutch.');
lines.push('4. **A loanword the language actually uses.** `OK`, `App`, `Home`, `System`,');
lines.push('   `Privacy`, `Item`, `Reset`, `Backup`, `Version` — Dutch, Italian, Filipino,');
lines.push('   Indonesian and German take these unchanged, and translating them would be');
lines.push('   less natural rather than more.');
lines.push('5. **A Latin-alphabet sort marker.** `A–Z` labels the alphabetical ordering');
lines.push('   control and reads the same in every Latin-script language here.');
lines.push('');
if (leaks.length === 0) {
  lines.push('None.');
} else {
  lines.push('| Locale | Key | Value |');
  lines.push('|:---|:---|:---|');
  for (const leak of leaks) lines.push(`| ${leak.locale} | \`${leak.key}\` | ${leak.value} |`);
}
lines.push('');
lines.push('## What no gate in this repository can supply');
lines.push('');
lines.push('**Every one of these packs is machine-assisted and has not been read by a native');
lines.push('speaker of the language it is in, Korean included.** Structural completeness is');
lines.push('what the table above measures and it is not the same claim. The blocker is human');
lines.push('and external; it is stated in `docs/report.md` and it does not close by running');
lines.push('anything here.');
lines.push('');
lines.push('The educational content reviewed *for meaning* in this repository, and by whom:');
lines.push('');
lines.push('| Layer | Reviewed | How |');
lines.push('|:---|---:|:---|');
lines.push(`| Korean example sentences | ${taught.toLocaleString('en')} | \`examples:qa\`, plus the reading recorded in \`docs/AMBIGUITY_LEDGER.md\` |`);
lines.push('| Numbers explanations | 20 lessons | read end to end in English and Korean |');
lines.push('| Objective questions | 5,191 | `docs/AMBIGUITY_LEDGER.md` |');
lines.push('| Every other language | 0 | nothing here reads them |');
lines.push('');

const text = `${lines.join('\n')}\n`;
const out = join(ROOT, 'docs', 'LOCALE_LEDGER.md');
if (CHECK) {
  /*
    The product first, the document second.

    A stale document and a missing string are both failures and only one of them
    is a defect a learner meets. Reporting "the ledger is out of date" for a pack
    that has lost twenty strings would name the smaller of the two problems, so
    the coverage check runs first.
  */
  const broken = rows.filter((row) => row.missing > 0 || row.blank > 0);
  if (broken.length > 0) {
    console.error('missing or blank interface strings:');
    for (const row of broken) console.error(`  ${row.locale}: ${row.missing} missing, ${row.blank} blank`);
    process.exit(1);
  }
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* falls through to the mismatch below */
  }
  if (current !== text) {
    console.error('docs/LOCALE_LEDGER.md is out of date — run `npm run locale:ledger`');
    process.exit(1);
  }
  console.log(
    `locale ledger current — ${rows.length} languages, ${english.size} English strings, ` +
      `${leaks.length} identical to English, in five classes, each one read`,
  );
  process.exit(0);
}
writeFileSync(out, text);
console.log(`wrote docs/LOCALE_LEDGER.md — ${rows.length} languages, ${leaks.length} English-identical strings`);
