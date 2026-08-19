#!/usr/bin/env node
/**
 * Guards the product name.
 *
 *   node scripts/check-product-name.mjs           report
 *   node scripts/check-product-name.mjs --check   exit non-zero on a finding
 *
 * Two obsolete names, and the same rule for both.
 *
 * "Hangyul Start" is the original name. "Hangyul GaNaDa" is the camel-cased
 * spelling that replaced it and that this cycle retired in turn: the customer
 * name is **Hangyul ganada**, and 가나다 is a word rather than three initials.
 *
 * A few references to the old spellings are deliberate: a localStorage key read
 * once so existing learners keep their progress, and the iOS WebView scheme,
 * which is the origin the app's storage is keyed to and therefore a technical
 * identifier rather than a name. Those are listed in `ALLOWED` with the reason,
 * so an exception is reviewed rather than assumed.
 *
 * The word "start" on its own is not searched for. `startDate`, "Start now" and
 * `session.start` are ordinary English and have nothing to do with the product
 * name; a regex broad enough to catch them would be a regex nobody could keep
 * green. Neither is "ganada" on its own: `com.talkhangyul.ganada` and
 * `hangyul-ganada` are the package and the workspace, and both are correct.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Every spelling of a retired product name, and every miscapitalisation of the current one. */
const PATTERNS = [
  /Hangyul\s+Start/gi,
  /HangyulStart/g,
  /hangyulStart/g,
  /hangyul[_-]start/gi,
  /HANGYUL_START/g,
  /한귤\s*스타트/g,
  // The camel-cased spellings, and the two near-misses that read as a different
  // product: "Hangyul Ganada" with a capital G, and the shouted form.
  /HangyulGaNaDa/g,
  /Hangyul\s+GaNaDa/g,
  /Hangyul\s+GaNada/g,
  /Hangyul\s+Ganada/g,
  /HANGYUL\s+GANADA/g,
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  'coverage',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  'test-results',
  'playwright-report',
  '.design-audit',
  '.visual-qa',
  /*
   * The delivery directory.
   *
   * `result/` is assembled by `scripts/build-result.mjs` from artefacts and
   * from copies of the two native projects — build output, all of it, including
   * the synced web bundle that carries the legacy storage keys. Scanning it
   * reports the same handful of legitimate exceptions a third time and, worse,
   * makes `npm run verify` pass or fail depending on whether somebody has run
   * the release assembly yet.
   */
  'result',
]);

/**
 * Directories that are copies of a build output rather than source.
 *
 * `cap sync` copies `apps/web/dist` verbatim into both native projects, so the
 * minified bundle — including the two legacy storage keys the migration needs —
 * appears there too. `dist` itself is already skipped; these are the same bytes
 * under a different path, and flagging them would report the same three
 * exceptions three times and tempt someone to widen the allowlist.
 */
const SKIP_PATHS = [
  'apps/mobile/android/app/src/main/assets/public',
  'apps/mobile/ios/App/App/public',
  // `cap sync` writes these from `capacitor.config.ts`, including the iOS
  // scheme that is deliberately unchanged. Source is checked; its copies are
  // not checked twice.
  'apps/mobile/android/app/src/main/assets/capacitor.config.json',
  'apps/mobile/ios/App/App/capacitor.config.json',
];

const TEXT_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|json|toml|ini|cfg|md|css|html|yml|yaml|sh|mako)$/;

/**
 * Deliberate survivors, each with the reason it has to stay.
 *
 * Keyed by repo-relative path. A file listed here is exempt only for the
 * occurrences described; the count is checked so a new one still trips the
 * guard.
 */
const ALLOWED = [
  {
    file: 'apps/web/src/storage/schema.ts',
    count: 1,
    reason:
      'Legacy localStorage key, read once by the v3 migration so a learner who practised under the old name keeps their progress. Retired once the import has been read back.',
  },
  {
    file: 'apps/web/src/i18n/preference.ts',
    count: 1,
    reason: 'Legacy localStorage key for the saved language, same one-time migration.',
  },
  {
    file: 'apps/mobile/capacitor.config.ts',
    count: 1,
    reason:
      'The iOS WebView scheme. It is the origin the app\'s storage is keyed to, so renaming it would discard every existing learner\'s progress for a cosmetic change.',
  },
  {
    file: 'apps/web/src/i18n/i18n.test.ts',
    count: 4,
    reason:
      'One legacy language key, plus three assertions that the product metadata carries no trace of either retired name.',
  },
  {
    file: 'scripts/check-product-name.mjs',
    count: null,
    reason: 'This file is the guard; it necessarily contains the patterns it searches for.',
  },
  {
    file: 'README.md',
    count: null,
    reason: 'Documents the renames and the compatibility exceptions above.',
  },
  {
    file: 'docs/report.md',
    count: null,
    reason:
      'Chapter 24 records what the guard now forbids, which means writing the forbidden spellings down once.',
  },
  {
    file: 'docs/ARCHITECTURE.md',
    count: null,
    reason: 'Records why the migration IDs and storage keys were left alone.',
  },
];

const allowedByFile = new Map(ALLOWED.map((entry) => [entry.file, entry]));

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (SKIP_PATHS.some((skip) => relative(root, full) === skip)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (TEXT_EXTENSIONS.test(entry)) files.push(full);
  }
  return files;
}

const findings = [];
const accountedFor = new Map();

for (const file of walk(root)) {
  const rel = relative(root, file);
  // package-lock records the workspace name; it is regenerated, not authored.
  if (rel === 'package-lock.json') continue;

  const text = readFileSync(file, 'utf8');
  const hits = [];
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      hits.push({ line, text: match[0] });
    }
  }
  if (hits.length === 0) continue;

  const allowance = allowedByFile.get(rel);
  if (allowance) {
    accountedFor.set(rel, hits.length);
    if (allowance.count !== null && hits.length !== allowance.count) {
      findings.push({
        file: rel,
        line: hits[0].line,
        text: hits[0].text,
        note: `expected ${allowance.count} allowed reference(s), found ${hits.length}`,
      });
    }
    continue;
  }
  for (const hit of hits) findings.push({ file: rel, ...hit });
}

if (findings.length === 0) {
  console.log('Product name: no unintended references to a retired spelling.');
  if (accountedFor.size) {
    console.log('\nDeliberate references, kept for backward compatibility:');
    for (const entry of ALLOWED) {
      const count = accountedFor.get(entry.file);
      if (!count) continue;
      console.log(`  ${entry.file} (${count}) — ${entry.reason}`);
    }
  }
} else {
  console.error('Unintended references to the old product name:\n');
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.text}${finding.note ? `  (${finding.note})` : ''}`);
  }
  console.error(
    '\nRename them, or add the file to ALLOWED in scripts/check-product-name.mjs with a reason.',
  );
}

if (process.argv.includes('--check') && findings.length > 0) process.exit(1);
