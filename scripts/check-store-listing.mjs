#!/usr/bin/env node
/**
 * Checks the store listings against the limits the stores actually enforce.
 *
 *   node scripts/check-store-listing.mjs           print the table
 *   node scripts/check-store-listing.mjs --check   fail if anything is over
 *
 * ## Why this is a script and not a careful read
 *
 * The failure mode is silent and late: a subtitle one character over is
 * accepted by nothing and is discovered in a console, by a person, at the point
 * of submitting — and then in seven more languages after that, one at a time.
 * Counting is what a computer is for.
 *
 * The limits are the published ones:
 *
 * | Field | Play | App Store |
 * | --- | --- | --- |
 * | title / name | 30 | 30 |
 * | subtitle | — | 30 |
 * | short description | 80 | — |
 * | full description | 4,000 | 4,000 |
 * | keywords | — | 100, comma-separated |
 *
 * The listing is also checked for the claims the product must not make — the
 * same rules `audit-copy.mjs` applies to the interface, because a promise on a
 * store page is a promise.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const DIR = join(ROOT, 'store', 'listing');
const CHECK = process.argv.includes('--check');

const LIMITS = {
  title: 30,
  subtitle: 30,
  short: 80,
  keywords: 100,
  full: 4000,
};

const HEADINGS = {
  title: '## Title / App name',
  subtitle: '## Subtitle (App Store)',
  short: '## Short description (Play)',
  keywords: '## Keywords (App Store)',
  full: '## Full description',
};

/**
 * Claims a listing must not make.
 *
 * Deliberately the same list as the in-app copy audit. A store page is where an
 * exaggeration is most tempting and where it is most expensive: Play and the
 * App Store both reject listings for unsubstantiated claims, and a learner who
 * buys on a promise the app does not keep asks for their money back.
 */
const FORBIDDEN = [
  { id: 'official', pattern: /\b(official|certified|accredited|공인|公認)\b/i },
  { id: 'guarantee', pattern: /\b(guarantee[sd]?|fluent in \d|보장합니다|保証)\b/i },
  { id: 'subscription', pattern: /\bfree trial\b/i },
  { id: 'placeholder', pattern: /\b(TODO|TBD|FIXME|XXX)\b/ },
];

/**
 * `TOPIK` is allowed — but only in a sentence that says the app is *not* one.
 * Every listing says so on purpose; a listing that mentioned it any other way
 * would be claiming an exam preparation this product does not do.
 */
const TOPIK_DISCLAIMERS = [
  /not a topik/i,
  /TOPIK 강좌가 아닙니다/,
  /TOPIK 対策講座ではありません/,
  /不是 TOPIK 课程/,
  /No es un curso de TOPIK/i,
  /Ni un cours TOPIK/i,
  /Kein TOPIK-Kurs/i,
  /Não é um curso de TOPIK/i,
];

function field(text, name) {
  const heading = HEADINGS[name];
  const start = text.indexOf(heading);
  if (start < 0) return null;
  const after = text.slice(start + heading.length);
  const end = after.indexOf('\n## ');
  return (end < 0 ? after : after.slice(0, end)).trim();
}

const files = readdirSync(DIR).filter((name) => name.endsWith('.md'));
const problems = [];

console.log(`Store listings — ${files.length} languages\n`);
console.log('  locale   title  subtitle  short  keywords  full');
for (const file of files.sort()) {
  const locale = file.replace('.md', '');
  const text = readFileSync(join(DIR, file), 'utf8');
  const lengths = {};
  for (const name of Object.keys(LIMITS)) {
    const value = field(text, name);
    if (value === null) {
      problems.push(`${locale}: no "${HEADINGS[name]}" section`);
      lengths[name] = 0;
      continue;
    }
    lengths[name] = [...value].length;
    if (lengths[name] > LIMITS[name]) {
      problems.push(`${locale}: ${name} is ${lengths[name]} characters, limit ${LIMITS[name]}`);
    }
    if (lengths[name] === 0) problems.push(`${locale}: ${name} is empty`);
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(value)) problems.push(`${locale}: ${name} claims "${rule.id}"`);
    }
  }

  const whole = text;
  if (/\bTOPIK\b/i.test(whole) && !TOPIK_DISCLAIMERS.some((pattern) => pattern.test(whole))) {
    problems.push(`${locale}: mentions TOPIK outside a disclaimer`);
  }

  console.log(
    `  ${locale.padEnd(8)} ${String(lengths.title).padStart(5)}  ${String(lengths.subtitle).padStart(8)}  ${String(
      lengths.short,
    ).padStart(5)}  ${String(lengths.keywords).padStart(8)}  ${String(lengths.full).padStart(4)}`,
  );
}

console.log(`\n  limits   ${String(LIMITS.title).padStart(5)}  ${String(LIMITS.subtitle).padStart(8)}  ${String(
  LIMITS.short,
).padStart(5)}  ${String(LIMITS.keywords).padStart(8)}  ${String(LIMITS.full).padStart(4)}`);

/*
 * The release notes, against the product they describe.
 *
 * This file is shown to customers by both stores and was not checked until the
 * final pass, which is how it came to offer "2,504 everyday words, each with a
 * picture" — seventy-seven words short, and promising illustrations that were
 * removed from the product a cycle earlier. A listing that describes a feature
 * the binary does not have is the one kind of copy defect that costs money.
 */
const notesFile = readFileSync(join(ROOT, 'store/release-notes.md'), 'utf8');
// Only what a customer is shown. The file's own preamble records what these
// rules were added to catch, which necessarily quotes the wrong figures — and a
// check that cannot tell its own audit trail from the copy is a check that
// forces the trail to be deleted.
const notes = notesFile.slice(Math.max(0, notesFile.indexOf('\n## ')));
const words = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.json'), 'utf8'),
).words.length;

for (const heading of ['English', '한국어', '日本語', '简体中文', 'Español', 'Français', 'Deutsch', 'Português']) {
  if (!notes.includes(`## ${heading}`)) problems.push(`release notes: no ${heading} section`);
}
// Every thousands separator the eight languages use, so a stale count cannot
// hide behind a comma, a full stop or a space \u2014 and every thousands *digit*,
// because the first version of this rule matched only `2,XXX` and went blind
// the day the corpus crossed three thousand: it certified listings claiming
// 3,221 over a corpus of 3,220. A word count is any 4-digit-with-separator
// figure in the customer copy; there is nothing else in the notes that looks
// like one.
const claimed = [...notes.matchAll(/\b(\d)[.,\u00a0 ](\d{3})\b/g)].map(
  (match) => Number(match[1]) * 1000 + Number(match[2]),
);
for (const value of new Set(claimed)) {
  if (value !== words) {
    problems.push(`release notes: claims ${value.toLocaleString('en')} words; the corpus has ${words}`);
  }
}
for (const pattern of [/\bpicture\b/i, /\billustrat/i, /ilustraci/i, /\bBild\b/, /插图/, /\u7d75/, /그림/]) {
  if (pattern.test(notes)) {
    problems.push(`release notes: still promises an illustration (${pattern})`);
  }
}

if (problems.length === 0) {
  console.log('\nevery listing is within its limits, and the release notes match the product.');
  process.exit(0);
}
console.log();
for (const problem of problems) console.log(`  ! ${problem}`);
console.log(`\n${problems.length} problem(s).`);
process.exit(CHECK ? 1 : 0);
