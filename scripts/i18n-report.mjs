#!/usr/bin/env node
/**
 * Translation coverage report.
 *
 *   node scripts/i18n-report.mjs           print the report
 *   node scripts/i18n-report.mjs --check   exit non-zero on a blocking problem
 *   node scripts/i18n-report.mjs --json    machine-readable output
 *
 * "Blocking" is deliberately narrow. English is the source language and the end
 * of every fallback chain, so a gap in English is a bug that reaches a learner
 * and fails the build. A gap in Japanese falls back to English, which is a
 * planned state — it is reported, and it does not fail anything. Conflating the
 * two is how a project ends up either shipping raw keys or refusing to ship a
 * partially translated language at all.
 *
 * What is checked:
 *
 *   missing        a key English has and this locale does not
 *   extra          a key this locale has and English does not (usually a typo)
 *   untranslated   a value byte-identical to English (excluding shared tokens
 *                  like "—" and bare interpolations)
 *   plurals        a count key whose locale needs a plural category it lacks —
 *                  this one *is* blocking, because i18next would fall back to
 *                  English mid-sentence rather than degrade gracefully
 *   placeholders   an interpolation or <1></1> tag that English has and the
 *                  translation dropped, which renders as a hole in the sentence
 *   unused         a key no source file references
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const LOCALES_DIR = join(root, 'apps/web/src/locales');
const SOURCE_DIRS = [join(root, 'apps/web/src'), join(root, 'apps/web/e2e')];
const SOURCE_LOCALE = 'en';

const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const JSON_OUT = args.has('--json');

/** Values that are legitimately identical across languages. */
const SHARED_VALUES = new Set(['—', '-', 'OK']);

/**
 * Keys whose translation really is the English word, per locale.
 *
 * Not an excuse list. Each of these was checked against the language rather
 * than assumed: "Version" is the German noun, "Licence" is the French one,
 * "numeral" is Spanish and Portuguese, "interjection" is French. Marking them
 * as untranslated would leave a report with permanent findings in it, and a
 * report with permanent findings in it is one nobody reads.
 *
 * A key is listed against the exact locale it is a cognate in, so a genuinely
 * missed translation in another language is still reported.
 */
const COGNATES = new Map([
  ['de', new Set([
    'settings:about.version',
    'handwriting:strokeOrder.pause',
    // "System" and "App" are the German nouns, spelled and used the same way.
    'settings:appearance.system',
    'settings:groups.app',
    // "Problem" is the German noun for exactly this, and it is the word a
    // German report form would use.
    'common:report.field.category',
  ])],
  ['es', new Set(['vocabulary:partOfSpeech.numeral'])],
  ['fr', new Set([
    'settings:about.version',
    'settings:sources.licenceLink',
    'vocabulary:partOfSpeech.interjection',
    'handwriting:strokeOrder.pause',
    // "rare" is the French adjective, spelled the same and meaning the same.
    'vocabulary:frequency.rare',
    // "Romanisation" is the French noun for writing a language in the Latin
    // alphabet, spelled exactly as the British English one. The alternatives —
    // "translittération", "transcription" — both name something else, and
    // "transcription" is the word for the notation this label replaced.
    'vocabulary:detail.romanization',
  ])],
  ['pt-BR', new Set([
    'vocabulary:partOfSpeech.numeral',
    // "Item" is Portuguese, with a Portuguese plural (itens); it is not the
    // English word left in place.
    'common:report.field.item',
  ])],
]);

/*
 * "A–Z" is a sort order, not an English phrase.
 *
 * Every Latin-alphabet interface language labels alphabetical order with the
 * first and last letters of that alphabet, and they are A and Z in German as in
 * French as in Filipino. Translating it would mean inventing a label readers of
 * those languages do not use. Languages that write their own alphabet have a
 * real translation and are deliberately absent: Thai ก–ฮ, Greek Α–Ω, Russian
 * and the Cyrillic languages А–Я, Hindi and Telugu अ–ह / అ–హ.
 *
 * Swedish is absent for a different reason: its alphabet ends at Ö, so its
 * label is "A–Ö" and is a genuine translation.
 *
 * Merged in rather than written into the literal above, because several of
 * these locales already have an entry there and a duplicate key in a `Map`
 * literal silently keeps only the last one.
 */
for (const code of ['cs', 'de', 'es', 'fil', 'fr', 'hu', 'id', 'it', 'nl', 'pl', 'pt-BR', 'ro', 'tr', 'uz', 'vi']) {
  const set = COGNATES.get(code) ?? new Set();
  set.add('vocabulary:saved.order.alphabetical');
  COGNATES.set(code, set);
}

/*
 * Words several languages simply share with English.
 *
 * Each one was checked in the language rather than waved through. "Home",
 * "App", "Privacy", "Item", "Unit" and "Recent" are the ordinary words in the
 * languages listed; "verb", "adverb" and "numeral" are the Romanian and Swedish
 * grammar terms; "Letters" is Dutch for letters; "System" and "Version" are
 * Swedish nouns. Marking them as untranslated would leave the coverage report
 * permanently red, and a report with permanent findings in it is one nobody
 * reads.
 */
for (const [code, keys] of [
  ['fil', ['navigation:tabs.home', 'settings:groups.app', 'settings:groups.reset', 'settings:privacy.title']],
  ['id', ['common:report.field.item', 'learning:units.badge']],
  ['it', ['navigation:tabs.home', 'settings:groups.app', 'settings:privacy.title']],
  ['nl', [
    'activity:memory.skill.visual_recognition',
    'common:report.field.item',
    'home:quick.letters',
    'learning:mistakes.filter.character',
    'navigation:tabs.letters',
    'settings:groups.app',
    'settings:privacy.title',
    'vocabulary:saved.order.recent',
  ]],
  ['pl', ['common:report.field.category']],
  ['ro', ['vocabulary:partOfSpeech.adverb', 'vocabulary:partOfSpeech.numeral', 'vocabulary:partOfSpeech.verb']],
  ['sv', [
    'common:report.field.category',
    'settings:about.version',
    'settings:appearance.system',
    'vocabulary:partOfSpeech.adverb',
    'vocabulary:partOfSpeech.verb',
  ]],
]) {
  const set = COGNATES.get(code) ?? new Set();
  for (const key of keys) set.add(key);
  COGNATES.set(code, set);
}
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

function readLocale(code) {
  const dir = join(LOCALES_DIR, code);
  const out = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '');
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const [key, value] of Object.entries(flatten(parsed))) out[`${ns}:${key}`] = value;
  }
  return out;
}

/** `learning:review.missed_one` → `learning:review.missed`, or null. */
function pluralBase(key) {
  const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
  return match ? match[1] : null;
}

function placeholders(value) {
  if (typeof value !== 'string') return [];
  const found = [];
  // {{name}} and {{name, format}} — the name is what must survive translation.
  for (const m of value.matchAll(/\{\{\s*([A-Za-z0-9_]+)/g)) found.push(`{{${m[1]}}}`);
  for (const m of value.matchAll(/<(\d+)>/g)) found.push(`<${m[1]}>`);
  return [...new Set(found)].sort();
}

function walkSources(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'locales' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkSources(full, files);
    else if (/\.(ts|tsx|mjs|py)$/.test(full)) files.push(full);
  }
  return files;
}

const sourceText = SOURCE_DIRS.flatMap((d) => walkSources(d))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/**
 * A key counts as used if its dotted path appears anywhere in the source.
 *
 * Keys assembled at runtime never appear whole. `units.unit-3.title` is written
 * as ``t(`units.${unit.id}.title`)``, so the literal that survives into the
 * source is `units.$` — and the interpolation can sit at *any* depth, not just
 * one level up. Every ancestor prefix is therefore tried, which is what stops
 * an entire translated section being reported as dead code.
 */
function isUsed(key) {
  const [, path] = key.split(/:(.*)/s);
  const base = pluralBase(path) ?? path;
  if (sourceText.includes(base)) return true;
  const parts = base.split('.');
  for (let depth = parts.length - 1; depth >= 1; depth -= 1) {
    if (sourceText.includes(`${parts.slice(0, depth).join('.')}.$`)) return true;
  }
  return false;
}

const source = readLocale(SOURCE_LOCALE);
const sourceKeys = Object.keys(source).sort();

/**
 * The other direction: a `t()` call with no string behind it.
 *
 * ## Why this half was missing, and what it cost
 *
 * Everything above asks "does this key have a caller". Nothing asked "does this
 * caller have a key", and `RecognitionStep` called
 * `t('handwriting:feedback.correct.headline')` — a path that has never existed
 * in any bundle. The handwriting namespace has `feedback.correct.perfect` and
 * `feedback.correct.scored`; it has never had a `headline`.
 *
 * `parseMissingKeyHandler` then did what it was written to do, which is the
 * cruel part. Rather than let a dotted path reach a learner it humanised the
 * key — leaf, de-camelised, capitalised — and produced the word **"Headline"**.
 * So every learner who answered a letter correctly, in all thirty-two
 * languages, was congratulated by a placeholder that looks exactly like real
 * copy. A raw `handwriting.feedback.correct.headline` on screen would have been
 * reported in a day.
 *
 * ## Static keys only, and that is not a weakness
 *
 * A key assembled at runtime cannot be resolved by reading source, so template
 * literals are skipped — and separately covered, because `unused` above proves
 * every *shipped* key has a caller. What is checked here is every key written
 * out in full, which is the overwhelming majority and is where this defect was.
 */
const CALL = /\bt\(\s*(['"])([^'"`$]+?)\1/g;
/*
  Product source only.

  A test may name a key on purpose to prove what happens when one is missing —
  `i18n.test.ts` does exactly that, and adds its own resource at runtime for the
  formatter case. Scanning tests here would make the check report its own
  fixtures, which is the fastest way to have it switched off.
*/
const productText = SOURCE_DIRS.flatMap((d) => walkSources(d))
  .filter((file) => !/\.test\.tsx?$/.test(file) && !/[\\/]e2e[\\/]/.test(file))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
const everyKey = new Set();
for (const locale of readdirSync(LOCALES_DIR).filter((d) => statSync(join(LOCALES_DIR, d)).isDirectory())) {
  for (const key of Object.keys(readLocale(locale))) {
    const [, path] = key.split(/:(.*)/s);
    everyKey.add(path);
    everyKey.add(key);
    const plural = pluralBase(path);
    if (plural) everyKey.add(plural);
  }
}
const unresolved = [];
for (const match of productText.matchAll(CALL)) {
  const key = match[2];
  // A `t()` argument that is plainly not a key: a sentence, a URL, a selector.
  if (!/^[A-Za-z][\w-]*(?::[\w.-]+)?(?:\.[\w-]+)*$/.test(key)) continue;
  if (!key.includes('.') && !key.includes(':')) continue;
  const bare = key.includes(':') ? key.split(/:(.*)/s)[1] : key;
  if (everyKey.has(key) || everyKey.has(bare)) continue;
  // A prefix used with a runtime suffix, e.g. `t(\`partOfSpeech.${pos}\`)`.
  if ([...everyKey].some((known) => known.startsWith(`${bare}.`))) continue;
  unresolved.push(key);
}
const locales = readdirSync(LOCALES_DIR).filter((d) =>
  statSync(join(LOCALES_DIR, d)).isDirectory(),
);

const report = { sourceLocale: SOURCE_LOCALE, totalKeys: sourceKeys.length, locales: {}, errors: [] };

// --- English-only checks ----------------------------------------------------
const unused = sourceKeys.filter((k) => !isUsed(k));
report.unused = unused;

for (const code of locales.sort()) {
  const bundle = readLocale(code);
  const keys = new Set(Object.keys(bundle));
  const isSource = code === SOURCE_LOCALE;

  const pluralRules = new Intl.PluralRules(code);
  const categories = pluralRules.resolvedOptions().pluralCategories;

  const missing = [];
  const untranslated = [];
  const missingPlurals = [];
  const droppedPlaceholders = [];

  const seenPluralBases = new Set();

  for (const key of sourceKeys) {
    const base = pluralBase(key);
    if (base) {
      if (seenPluralBases.has(base)) continue;
      seenPluralBases.add(base);
      // A locale must carry every plural category its language actually uses;
      // anything less renders an English sentence at a random count.
      const absent = categories.filter((c) => !keys.has(`${base}_${c}`));
      if (absent.length) missingPlurals.push(`${base} (needs ${absent.join(', ')})`);
      continue;
    }
    if (!keys.has(key)) {
      missing.push(key);
      continue;
    }
    if (!isSource) {
      const value = bundle[key];
      if (
        typeof value === 'string' &&
        value === source[key] &&
        !SHARED_VALUES.has(value.trim()) &&
        !COGNATES.get(code)?.has(key) &&
        // A value made only of interpolations and punctuation — "{{a}} / {{b}}"
        // — carries no words, so being identical across locales is correct.
        /\p{L}/u.test(value.replace(/\{\{[^}]*\}\}/g, ''))
      ) {
        untranslated.push(key);
      }
      /*
       * `{{korean}}`, `{{subject}}` and `{{object}}` are one slot.
       *
       * The Numbers feedback line hands the page the Korean word three ways:
       * bare, and with the subject or object particle already attached, because
       * 만은 and 하나는 are not a suffix a translation string can choose for
       * itself. English writes "{{korean}} is 10,000"; Korean writes
       * "{{subject}} 10,000이에요". Counting those as different slots would make
       * every such line look like a dropped placeholder, and the only way to
       * satisfy the gate would be the 은(는) parenthesis the copy rules forbid.
       */
      const sameSlot = (name) => (name === '{{subject}}' || name === '{{object}}' ? '{{korean}}' : name);
      const want = placeholders(source[key]).map(sameSlot);
      const got = placeholders(value).map(sameSlot);
      const lost = want.filter((p) => !got.includes(p));
      if (lost.length) droppedPlaceholders.push(`${key} (lost ${lost.join(' ')})`);
    }
  }

  const extra = [...keys].filter((k) => {
    const base = pluralBase(k);
    if (base) return !sourceKeys.some((s) => (pluralBase(s) ?? s) === base);
    return !keys.has(k) ? false : !sourceKeys.includes(k);
  });

  const translatable = sourceKeys.filter((k) => !pluralBase(k)).length;
  const covered = translatable - missing.length - untranslated.length;

  report.locales[code] = {
    coverage: translatable ? Math.round((covered / translatable) * 1000) / 10 : 100,
    missing,
    extra,
    untranslated,
    missingPlurals,
    droppedPlaceholders,
    pluralCategories: categories,
  };

  // Blocking rules.
  if (isSource && missing.length) {
    report.errors.push(`${code}: ${missing.length} missing key(s) in the source locale`);
  }
  if (missingPlurals.length) {
    report.errors.push(`${code}: ${missingPlurals.length} incomplete plural set(s)`);
  }
  if (droppedPlaceholders.length) {
    report.errors.push(`${code}: ${droppedPlaceholders.length} translation(s) dropped a placeholder`);
  }
  if (extra.length) {
    report.errors.push(`${code}: ${extra.length} key(s) not present in ${SOURCE_LOCALE}`);
  }
}

if (unresolved.length) {
  report.unresolved = unresolved;
  report.errors.push(
    `${unresolved.length} t() call(s) name a key that exists in no bundle — see the note above ` +
      `"the other direction"; this is how the word "Headline" reached learners`,
  );
}
if (unused.length) {
  report.errors.push(`${SOURCE_LOCALE}: ${unused.length} key(s) no source file references`);
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Translation coverage — source locale "${SOURCE_LOCALE}", ${report.totalKeys} keys\n`);
  const width = Math.max(...locales.map((c) => c.length));
  for (const [code, data] of Object.entries(report.locales)) {
    const bar = '█'.repeat(Math.round(data.coverage / 5)).padEnd(20, '·');
    console.log(
      `  ${code.padEnd(width)}  ${bar} ${String(data.coverage).padStart(5)}%` +
        (data.missing.length ? `  missing ${data.missing.length}` : '') +
        (data.untranslated.length ? `  untranslated ${data.untranslated.length}` : ''),
    );
  }
  for (const [code, data] of Object.entries(report.locales)) {
    const notes = [
      ...data.missing.map((k) => `missing        ${k}`),
      ...data.extra.map((k) => `not in ${SOURCE_LOCALE}     ${k}`),
      ...data.untranslated.map((k) => `untranslated   ${k}`),
      ...data.missingPlurals.map((k) => `plural gap     ${k}`),
      ...data.droppedPlaceholders.map((k) => `placeholder    ${k}`),
    ];
    if (!notes.length) continue;
    console.log(`\n[${code}] plural categories: ${data.pluralCategories.join(', ')}`);
    for (const note of notes.slice(0, 40)) console.log(`  ${note}`);
    if (notes.length > 40) console.log(`  … and ${notes.length - 40} more`);
  }
  if (unresolved.length) {
    console.log('');
    for (const key of unresolved) console.log(`  no such key    ${key}`);
  }
  if (unused.length) {
    console.log(`\n[${SOURCE_LOCALE}] keys no source file references:`);
    for (const key of unused) console.log(`  unused         ${key}`);
  }
  console.log(
    `\nSources scanned: ${SOURCE_DIRS.map((d) => relative(root, d)).join(', ')}`,
  );
}

if (CHECK && report.errors.length) {
  console.error(`\ni18n check failed:`);
  for (const error of report.errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}
if (CHECK) console.log('\ni18n check passed.');
