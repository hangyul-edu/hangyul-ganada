#!/usr/bin/env node
/**
 * Two words, one sentence: where a translation says less than its card does.
 *
 *   node scripts/vocabulary-translation-qa.mjs           print the pairs
 *   node scripts/vocabulary-translation-qa.mjs --check   fail on an unlisted one
 *
 * ## The defect
 *
 * Every taught word has its own example sentence, and every sentence has a
 * translation in each language. Two different Korean words can end up with the
 * *same* translated sentence, and when that happens the card stops teaching the
 * thing it exists for.
 *
 * Japanese gave 이메일 and 문자 one sentence — メールを送りました — so an email
 * and a text message were the same lesson. Chinese, Thai and Vietnamese gave
 * 말리다 and 널다 one sentence, so drying the washing and hanging it out were the
 * same lesson. Portuguese gave 말하다, 말씀하다 and 얘기하다 one sentence, which
 * is three registers under one line. None of it was visible from inside a
 * language: the sentence is fine, the translation is fine, and only the *pair*
 * is wrong.
 *
 * ## Why the English pack is the reference
 *
 * Because it is the one pack written against the Korean rather than against
 * another translation, and it does make these distinctions: *I sent an email*
 * against *I sent a text message*. So the rule is not "two words may not share a
 * sentence" — the English pack shares 27 of its own — it is **"two words may not
 * share a sentence in a language where English separates them, unless somebody
 * has written down why."**
 *
 * ## Why a ledger rather than a rule
 *
 * Twenty-five of the pairs are legitimate. 멈추다 and 정지 are both *el coche se
 * detuvo*; 오래 and 오랫동안 are both *lange*. The target language has one
 * ordinary word where English has two, and inventing a distinction it does not
 * make reads worse than sharing a sentence. A rule cannot tell those from the
 * email and the text message, so `content/vocabulary/shared-translations.json`
 * names each accepted pair with a reason, exactly like `unobserved.json` names
 * each word the frequency corpora never saw.
 *
 * Which merges are legitimate is ultimately a speaker's judgement and no speaker
 * has read any of these. The ledger records a decision, not a review — see I-17.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED = join(ROOT, 'apps/web/src/data/generated');
const CHECK = process.argv.includes('--check');

const read = (name) => JSON.parse(readFileSync(join(GENERATED, name), 'utf8'));
const corpus = read('vocabulary.json');
const words = corpus.words;
const english = read('vocabulary.en.json').words;

const ledger = JSON.parse(
  readFileSync(join(ROOT, 'content/vocabulary/shared-translations.json'), 'utf8'),
);
const accepted = new Map(Object.entries(ledger.pairs));

const findings = [];
const acceptedSeen = new Set();
let sharedInEnglish = 0;
{
  const byText = new Map();
  english.forEach((row, index) => {
    const text = (row?.[1] ?? '').trim();
    if (!text) return;
    byText.set(text, [...(byText.get(text) ?? []), index]);
  });
  for (const list of byText.values()) if (list.length > 1) sharedInEnglish += 1;
}

let checked = 0;
for (const locale of corpus.locales) {
  if (locale === 'ko' || locale === 'en') continue;
  const rows = read(`vocabulary.${locale}.json`).words;
  const byText = new Map();
  rows.forEach((row, index) => {
    const text = (row?.[1] ?? '').trim();
    if (!text) return;
    byText.set(text, [...(byText.get(text) ?? []), index]);
  });
  for (const [text, list] of byText) {
    if (list.length < 2) continue;
    checked += 1;
    // English shares it too: not a flattening, a coincidence the reference makes.
    const inEnglish = new Set(list.map((index) => (english[index]?.[1] ?? '').trim()));
    if (inEnglish.size < 2) continue;
    const key = list
      .map((index) => words[index].word)
      .sort()
      .join('·');
    const entry = accepted.get(key);
    if (entry && entry.locales.includes(locale)) {
      acceptedSeen.add(`${key}/${locale}`);
      continue;
    }
    findings.push({ locale, key, text, english: [...inEnglish] });
  }
}

console.log('Example translations — two words, one sentence\n');
console.log(`  languages compared              ${corpus.locales.length - 2}`);
console.log(`  shared sentences examined       ${checked.toLocaleString('en')}`);
console.log(`  shared in the English pack too  ${sharedInEnglish}  (a coincidence, not a flattening)`);
console.log(`  accepted merges in the ledger   ${accepted.size}`);

const stale = [];
for (const [key, entry] of accepted) {
  for (const locale of entry.locales) {
    if (!acceptedSeen.has(`${key}/${locale}`)) stale.push(`${key} in ${locale}`);
  }
}

if (stale.length) {
  console.log(`\n  ${stale.length} ledger entr(ies) no longer merge and can be removed:`);
  for (const entry of stale) console.log(`    ${entry}`);
}

if (findings.length) {
  console.error(`\n${findings.length} pair(s) share a sentence the English pack separates:\n`);
  for (const finding of findings) {
    console.error(`  ${finding.locale}  ${finding.key}`);
    console.error(`      both: ${finding.text}`);
    for (const line of finding.english) console.error(`      en:   ${line}`);
  }
  console.error(
    '\nEither give them different sentences, or add the pair to\n' +
      'content/vocabulary/shared-translations.json with the reason the language merges them.',
  );
  process.exit(CHECK ? 1 : 0);
}

console.log('\nno card teaches less than the word it is for.');
