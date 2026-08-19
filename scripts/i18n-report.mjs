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
  ])],
  ['pt-BR', new Set([
    'vocabulary:partOfSpeech.numeral',
    // "Item" is Portuguese, with a Portuguese plural (itens); it is not the
    // English word left in place.
    'common:report.field.item',
  ])],
]);
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
      const want = placeholders(source[key]);
      const got = placeholders(value);
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
