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
const problems = [];
const rows = [];
for (const locale of [...interfaceLocales].sort()) {
  const resolved = contentLocale(locale, contentLocales, null);
  const own = coverage.get(locale);
  const meanings = own ? own.meanings : 0;
  const examples = own ? own.examples : 0;
  const borrowed = resolved !== locale;

  /*
   * The failure this gate exists for.
   *
   * A pack that covers *some* of the corpus is the dangerous state: the
   * questions it can fill come out in the learner's language and the rest fall
   * back, so one screen in ten is mixed and nothing reports it. All or nothing
   * is safe; partial is not.
   */
  const partial = own && meanings > 0 && meanings < wordIds.size;
  if (partial) {
    problems.push(
      `${locale}: ${meanings} of ${wordIds.size} words have a meaning — a partly-filled pack ` +
        'produces questions with some choices in this language and some in another',
    );
  }
  rows.push({ locale, meanings, examples, resolved, borrowed, partial });
  console.log(
    `  ${locale.padEnd(9)} ${String(meanings).padStart(8)}   ${String(examples).padStart(8)}   ` +
      `${resolved.padEnd(17)}  ${partial ? 'YES — see below' : 'no'}`,
  );
}

const borrowed = rows.filter((row) => row.borrowed);
console.log(
  `\n  ${rows.length - borrowed.length} of ${rows.length} languages read meanings in their own language.`,
);
console.log(
  `  ${borrowed.length} read them in another, chosen and disclosed rather than silently: ` +
    `${borrowed.map((row) => row.locale).join(', ')}`,
);
console.log(
  '\n  That second group is I-19 and it is a content gap, not a defect in the code:\n' +
    '  the meanings do not exist to show. What the code guarantees is that a question\n' +
    '  is never *half* translated — see `i18n/contentLocale.ts` and the one-language\n' +
    '  rule in `features/review/exercises.ts`.',
);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ! ${problem}`);
  process.exit(CHECK ? 1 : 0);
}
console.log('\nno language can produce a mixed-language question.');
