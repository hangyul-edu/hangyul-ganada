#!/usr/bin/env node
/**
 * What a learner in each of the 32 languages actually gets.
 *
 *   tsx scripts/locale-content-qa.mjs           print the matrix
 *   tsx scripts/locale-content-qa.mjs --check   fail the build
 *
 * ## Why `i18n:check` passing is not this
 *
 * `i18n:check` reads the translation files and reports 32 locales at 100%. It
 * is right, and it is answering "is the interface translated". The question
 * this asks is "can a learner in this language be given a fair vocabulary
 * question", and those came apart badly enough to ship: a Tamil learner was
 * shown a Tamil prompt over four English answers, and every check in the repo
 * was green.
 *
 * The shell and the content are different bodies of text with different
 * sources. The shell is 32 files a translator wrote. The content is 2,581 word
 * meanings, example translations and definitions that the curriculum ships in
 * **ten** languages. A report that says "32/32" without saying which of the two
 * it means is the thing that let the defect through.
 *
 * ## What "eligible" means here
 *
 * A vocabulary question is eligible in a locale when the meanings it needs all
 * resolve in **one language** — the one `i18n/contentLocale.ts` picks for that
 * learner. Not necessarily their interface language: the corpus does not have
 * twenty-two of them, and excluding those learners from vocabulary practice
 * entirely would be a worse product than an honest, chosen, consistent second
 * language. What is not allowed is *mixing*, and that is what this measures.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const CORPUS = join(ROOT, 'apps/web/public/corpus');
const LOCALES = join(ROOT, 'apps/web/src/locales');

const { contentLocale } = await import('../apps/web/src/i18n/contentLocale.ts');

const manifest = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8'));
/** The languages the *curriculum* ships meanings in. */
const contentLocales = manifest.bands?.[0]?.locales
  ? Object.keys(manifest.bands[0].locales)
  : [];
/** The languages the *interface* ships in. */
const interfaceLocales = readdirSync(LOCALES).filter((name) =>
  readdirSync(join(LOCALES, name)).includes('settings.json'),
);

// --- how complete each content pack is ----------------------------------------
const wordIds = new Set();
/** Band number to the ids it holds, in order. */
const bandIds = new Map();
for (const band of manifest.bands) {
  const rows = JSON.parse(readFileSync(join(CORPUS, band.words), 'utf8')).words;
  bandIds.set(band.band, rows.map((row) => row.id));
  for (const row of rows) wordIds.add(row.id);
}

/**
 * Words with a non-empty meaning in this language, across every band.
 *
 * A locale pack's `words` is a **list aligned index-for-index with its band**,
 * not a map keyed by word id. Reading it as a map counts array indices, which
 * silently reports the size of the largest band — 800 — for every language
 * including the complete ones, and then accuses all ten of being half-filled.
 */
function covered(locale) {
  const seen = new Set();
  let withExample = 0;
  for (const band of manifest.bands) {
    const file = band.locales[locale];
    if (!file) continue;
    const rows = JSON.parse(readFileSync(join(CORPUS, file), 'utf8')).words ?? [];
    const ids = bandIds.get(band.band) ?? [];
    rows.forEach((row, index) => {
      const id = ids[index];
      if (!id) return;
      // A row is [meaning, exampleTranslation, definition].
      if (row?.[0]) seen.add(id);
      if (row?.[1]) withExample += 1;
    });
  }
  return { meanings: seen.size, examples: withExample };
}

const coverage = new Map();
for (const locale of contentLocales) coverage.set(locale, covered(locale));

console.log('Localization — the interface, and the content behind it\n');
console.log(`  interface languages   ${interfaceLocales.length}`);
console.log(`  content languages     ${contentLocales.length}  (${contentLocales.join(', ')})`);
console.log(`  words in the corpus   ${wordIds.size.toLocaleString('en')}\n`);

console.log('  language   meanings   examples   quiz language      mixed?');
/**
 * Which script each language is written in, for the ones where a stray
 * character is unambiguous evidence of a mistake.
 *
 * Not a completeness test and not a spellcheck. It catches one specific
 * failure: text from the wrong language landing in a pack. A Russian row came
 * back as `День长长…` during authoring — Cyrillic, then two Han characters, then
 * an ellipsis — which is exactly the kind of thing that survives review because
 * the first word looks right.
 *
 * Latin-script languages are deliberately absent: they legitimately contain
 * Korean headwords, proper nouns and loanwords, so there is no character that
 * proves an error.
 */
const SCRIPTS = {
  ar: /\p{Script=Arabic}/u,
  bn: /\p{Script=Bengali}/u,
  el: /\p{Script=Greek}/u,
  hi: /\p{Script=Devanagari}/u,
  kk: /\p{Script=Cyrillic}/u,
  ky: /\p{Script=Cyrillic}/u,
  mn: /\p{Script=Cyrillic}/u,
  ru: /\p{Script=Cyrillic}/u,
  ta: /\p{Script=Tamil}/u,
  te: /\p{Script=Telugu}/u,
  th: /\p{Script=Thai}/u,
  uk: /\p{Script=Cyrillic}/u,
};
/** Han and kana, which belong only in the three languages that use them. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

const problems = [];
const rows = [];

// --- the hand-written packs, checked for the wrong language ---------------------
const COPY = join(ROOT, 'content/vocabulary/copy');
let handWritten = 0;
for (const file of readdirSync(COPY).filter((name) => name.endsWith('.json'))) {
  const locale = file.replace('.json', '');
  const pack = JSON.parse(readFileSync(join(COPY, file), 'utf8'));
  const expected = SCRIPTS[locale];
  for (const [wordId, row] of Object.entries(pack.words ?? {})) {
    if (!Array.isArray(row)) continue;
    handWritten += 1;
    const [meaning, example] = row;
    if (!meaning || !String(meaning).trim()) {
      problems.push(`${locale} ${wordId}: no meaning`);
      continue;
    }
    if (!example || !String(example).trim()) {
      problems.push(`${locale} ${wordId}: no example translation`);
    }
    const text = `${meaning} ${example ?? ''}`;
    if (expected && !expected.test(String(meaning))) {
      problems.push(`${locale} ${wordId}: "${meaning}" is not written in this language's script`);
    }
    if (!['ja', 'zh-CN', 'ko'].includes(locale) && CJK.test(text)) {
      problems.push(`${locale} ${wordId}: Han or kana in a language that does not use it — "${text.trim()}"`);
    }
  }
}
console.log(`  hand-written rows checked for script: ${handWritten.toLocaleString('en')}\n`);


console.log('  language   meanings   examples   quiz words   status');
for (const locale of [...interfaceLocales].sort()) {
  const own = coverage.get(locale);
  const meanings = own ? own.meanings : 0;
  const examples = own ? own.examples : 0;
  /*
   * How many words this locale can actually be quizzed on.
   *
   * A question needs four options and every one of them has to be in the
   * learner's language — `strictMeaning` returns nothing otherwise and
   * `buildExercise` declines to build. So the quiz pool is the localized set,
   * and a locale with three words has no questions rather than three bad ones.
   */
  const quizzable = meanings >= 4 ? meanings : 0;
  const status = meanings === 0
    ? 'no vocabulary questions yet'
    : meanings < wordIds.size
      ? `partial — ${((meanings / wordIds.size) * 100).toFixed(0)}% of the corpus`
      : 'complete';
  rows.push({ locale, meanings, examples, quizzable, status });
  console.log(
    `  ${locale.padEnd(9)} ${String(meanings).padStart(8)}   ${String(examples).padStart(8)}   ` +
      `${String(quizzable).padStart(10)}   ${status}`,
  );
}

const complete = rows.filter((row) => row.meanings >= wordIds.size);
const empty = rows.filter((row) => row.meanings === 0);
const partial = rows.filter((row) => row.meanings > 0 && row.meanings < wordIds.size);

console.log(
  `\n  ${complete.length} complete · ${partial.length} partial · ${empty.length} with no vocabulary content yet`,
);

/*
 * Partial is safe now, and that is a change worth stating.
 *
 * It used to be the failing condition here, because a half-filled pack made
 * *some* questions come out in the learner's language and the rest fall back to
 * English — one screen in ten, mixed, with nothing reporting it. The fallback is
 * gone: `strictMeaning` resolves in the learner's language or not at all, so a
 * partial pack now means a *smaller* pool of questions rather than a mixed one.
 *
 * What is still a failure is English reaching a non-English learner, and that is
 * what the simulation below checks.
 */
if (empty.length > 0) {
  console.log(
    `\n  no vocabulary questions in: ${empty.map((row) => row.locale).join(', ')}\n` +
      '  These learners get the interface, the alphabet course and the dictionary,\n' +
      '  and no vocabulary quiz at all until their pack is written. That is the\n' +
      '  product decision recorded in §35: a smaller coherent lesson beats a\n' +
      '  mixed-language one, and no lesson beats a lesson in a language the\n' +
      '  learner did not choose.',
  );
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ! ${problem}`);
  process.exit(CHECK ? 1 : 0);
}
console.log('\nno language can produce a mixed-language question.');
