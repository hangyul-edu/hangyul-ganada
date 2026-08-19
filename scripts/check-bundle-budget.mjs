#!/usr/bin/env node
/**
 * Performance budgets, enforced.
 *
 *   node scripts/check-bundle-budget.mjs           print the table
 *   node scripts/check-bundle-budget.mjs --check   fail the build if over
 *
 * ## Why a budget rather than a warning
 *
 * Vite's `chunkSizeWarningLimit` prints a line and carries on, which is a
 * warning nobody reads twice. A bundle does not get large in one commit; it
 * gets large in forty, each of which added eight kilobytes and none of which
 * looked like the problem. A number that fails the build is the only kind that
 * survives that.
 *
 * ## What is measured
 *
 * **Gzipped bytes**, because that is what crosses the network and what a
 * learner on a slow connection waits for. Raw size matters too — it is what has
 * to be parsed — so it is printed, but the budget is on the transferred size.
 *
 * The budgets are split by what a first visit actually costs:
 *
 * | Budget | What it covers |
 * | --- | --- |
 * | first load | everything the browser needs before the home screen paints |
 * | one locale | the word copy for the learner's own language, fetched right after |
 * | any route | the largest single lazily-loaded screen |
 * | everything | every chunk the service worker precaches for offline use |
 *
 * The numbers below are the measured sizes plus a deliberate margin — roughly
 * 10%, enough to absorb an honest feature and not enough to absorb a
 * regression. When a budget is genuinely too small, raising it is a decision
 * someone makes in a diff, which is the point.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '..', 'apps', 'web', 'dist');
const ASSETS = join(DIST, 'assets');

const CHECK = process.argv.includes('--check');

/**
 * Chunks the browser loads before it can show anything.
 *
 * Matched by name rather than by parsing the HTML, because the point is to
 * notice when something *becomes* eagerly loaded: a new entry chunk would
 * otherwise slip past a check that only looked at what the HTML already names.
 */
const FIRST_LOAD = [
  /^index-.*\.js$/,
  /^index-.*\.css$/,
  /^react-.*\.js$/,
  /^i18n-.*\.js$/,
  /^curriculum-data-.*\.js$/,
];

/** One language's word meanings and example translations. */
const LOCALE_PACK = /^vocabulary\.[\w-]+-.*\.js$/;

const BUDGETS = {
  firstLoad: 460 * 1024,
  localePack: 44 * 1024,
  route: 24 * 1024,
  total: 800 * 1024,
};

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

const files = readdirSync(ASSETS)
  .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
  .map((name) => {
    const path = join(ASSETS, name);
    return { name, raw: statSync(path).size, gzip: gzipSize(path) };
  })
  .sort((a, b) => b.gzip - a.gzip);

const firstLoad = files.filter((f) => FIRST_LOAD.some((pattern) => pattern.test(f.name)));
const localePacks = files.filter((f) => LOCALE_PACK.test(f.name));
const routes = files.filter((f) => !firstLoad.includes(f) && !localePacks.includes(f));

const sum = (list) => list.reduce((n, f) => n + f.gzip, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

const results = [
  {
    label: 'first load',
    detail: `${firstLoad.length} chunk(s) before the home screen paints`,
    actual: sum(firstLoad),
    budget: BUDGETS.firstLoad,
  },
  {
    label: 'largest locale pack',
    detail: localePacks.length ? `of ${localePacks.length}` : 'none found',
    actual: Math.max(0, ...localePacks.map((f) => f.gzip)),
    budget: BUDGETS.localePack,
  },
  {
    label: 'largest route chunk',
    detail: routes.length ? (routes[0]?.name ?? '') : 'none found',
    actual: Math.max(0, ...routes.map((f) => f.gzip)),
    budget: BUDGETS.route,
  },
  {
    label: 'everything precached',
    detail: `${files.length} files`,
    actual: sum(files),
    budget: BUDGETS.total,
  },
];

console.log('Bundle budget — gzipped\n');
const width = Math.max(...results.map((r) => r.label.length));
let failed = 0;
for (const result of results) {
  const over = result.actual > result.budget;
  if (over) failed += 1;
  const share = result.budget ? (result.actual / result.budget) * 100 : 0;
  console.log(
    `  ${over ? '!' : ' '} ${result.label.padEnd(width)}  ${kb(result.actual).padStart(9)} / ${kb(
      result.budget,
    ).padStart(9)}  ${share.toFixed(0).padStart(3)}%   ${result.detail}`,
  );
}

console.log('\n  largest files');
for (const file of files.slice(0, 8)) {
  console.log(`    ${kb(file.gzip).padStart(9)} gz  ${kb(file.raw).padStart(10)} raw  ${file.name}`);
}

if (failed > 0) {
  console.error(`\n${failed} budget(s) exceeded.`);
  console.error('Reduce the payload, or raise the budget in this file and say why.');
  process.exit(CHECK ? 1 : 0);
}
console.log('\nevery budget met.');
