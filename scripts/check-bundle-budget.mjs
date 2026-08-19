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
 * | stroke assets | the stroke geometry, fetched when a lesson opens |
 * | word corpus | the vocabulary, measured now and **projected to the target size** |
 * | everything | every chunk the service worker precaches for offline use |
 *
 * ## The projection, and why one budget is not a measurement of today
 *
 * Every other line here answers "how big is this now". The word corpus line
 * also answers "how big will this be when it is finished", because the corpus
 * is deliberately growing towards ten thousand headwords and the difference
 * between where it is and where it is going is a factor of four.
 *
 * A budget that only measured today would pass every commit and then fail once,
 * catastrophically, on the commit that finished the content — by which point
 * the architecture that made it possible is months old. So the per-word cost is
 * measured and multiplied out to the target, and *that* is what has to fit. It
 * is a linear extrapolation and it is honest about being one; what it is for is
 * making the constraint arrive at the same time as the decision that creates it.
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
 * **Read out of the built `index.html`**, not written down here.
 *
 * It used to be a hand-maintained list of name patterns, and the problem with
 * that is the one it was supposed to solve. Splitting the word corpus into its
 * own chunk moved 181 kB out of this list and changed nothing about when the
 * browser fetches it — it is still statically imported, so it is still
 * preloaded before the home screen paints. The report said the first load had
 * halved. It had not; the list had.
 *
 * The entry HTML names the eager module graph exactly: the script tag and every
 * `modulepreload` Vite emits for its static imports. Reading it means a chunk
 * leaves this budget when it *becomes lazy* and not when somebody edits a
 * regular expression.
 */
function firstLoadNames() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const names = new Set();
  for (const match of html.matchAll(/(?:href|src)="\/assets\/([^"]+)"/g)) {
    names.add(match[1]);
  }
  return names;
}

/** One language's word meanings and example translations. */
const LOCALE_PACK = /^vocabulary\.[\w-]+-.*\.js$/;

/**
 * The stroke geometry for every character the curriculum teaches.
 *
 * Budgeted apart from the route chunks rather than counted among them. It is
 * data, not a screen: it loads once when the first lesson opens and is reused by
 * every lesson after. Left in the route bucket it was the largest "route" by a
 * factor of three, which hid what that budget is for — a *page's code* quietly
 * growing — behind a number that only ever moves when a character is added to
 * the curriculum. Two lines say two different things; one line said neither.
 */
const STROKE_ASSETS = /^stroke-assets-.*\.js$/;

/**
 * The vocabulary itself — headwords, spellings, categories, provenance.
 *
 * Split out from the alphabet's curriculum data so it can be measured on its
 * own, because it is the one piece of this build whose size is a content
 * decision rather than a code one.
 */
const WORD_CORPUS = /^word-corpus-.*\.js$/;

/**
 * How many headwords the corpus is being built towards.
 *
 * The product target. It is written here, in the file that enforces the
 * consequences, rather than only in a content script — a size budget that does
 * not know what it is budgeting for is a number that gets raised whenever it
 * fails.
 */
const TARGET_HEADWORDS = 10_000;

/**
 * What the corpus may cost at `TARGET_HEADWORDS`, gzipped.
 *
 * Deliberately far below the first-load budget, because at the target size the
 * corpus **must not be in the first load at all**. 220 kB is a figure a learner
 * can wait for once, on the screen that needs it, over a slow connection — and
 * it is unreachable by a corpus that ships every field of every word to a home
 * screen that shows ten of them.
 *
 * The projection against this number is printed as a **forecast** rather than
 * enforced, because a build cannot be failed for content that does not exist
 * yet — a permanently red gate is a gate people learn to ignore. What *is*
 * enforced is `LAZY_REQUIRED_HEADWORDS` below, which turns the forecast into a
 * failure at the exact commit where it stops being hypothetical.
 *
 * When it does fail, raising it is the wrong fix and the remedy is one of:
 *
 *   * drop the corpus out of the eager module graph and fetch it with the
 *     vocabulary route, which is where it is actually needed;
 *   * ship only the fields the learning path reads — headword, id, category,
 *     priority — and fetch provenance and frequency on demand;
 *   * shard it, so a session loads the slice its plan names.
 *
 * All three are architecture. None of them is a bigger number.
 */
const CORPUS_TARGET_BUDGET = 220 * 1024;

/**
 * The size at which the corpus has to stop being eagerly loaded.
 *
 * At roughly 72 gzipped bytes a word, four thousand headwords is 280 kB — which
 * with React, the interface and the alphabet is the whole first-load budget
 * spent before the home screen draws anything. Below that the corpus can stay
 * in the first load and the simplicity is worth more than the bytes.
 *
 * This is the gate that makes the forecast real: it does not fail today at
 * 2,581 words, and it fails the moment the corpus grows past the point where
 * the current architecture is the wrong one. That is deliberately the same
 * commit that a content pipeline would otherwise land quietly.
 */
const LAZY_REQUIRED_HEADWORDS = 4_000;

const BUDGETS = {
  firstLoad: 460 * 1024,
  localePack: 44 * 1024,
  route: 24 * 1024,
  strokeAssets: 32 * 1024,
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

const eager = firstLoadNames();
const firstLoad = files.filter((f) => eager.has(f.name));
const localePacks = files.filter((f) => LOCALE_PACK.test(f.name));
const wordCorpus = files.filter((f) => WORD_CORPUS.test(f.name));
const strokeAssets = files.filter((f) => STROKE_ASSETS.test(f.name));
const routes = files.filter(
  (f) =>
    !firstLoad.includes(f) &&
    !localePacks.includes(f) &&
    !strokeAssets.includes(f) &&
    !wordCorpus.includes(f),
);

const sum = (list) => list.reduce((n, f) => n + f.gzip, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

/**
 * How many headwords the built corpus actually contains.
 *
 * Read from the source data rather than the bundle: the bundle is minified
 * JavaScript and counting entries in it would be a regex against a build
 * artefact. If the file cannot be read the projection is skipped rather than
 * guessed — a budget nobody can verify is worse than no budget.
 */
function headwordCount() {
  try {
    const data = JSON.parse(
      readFileSync(join(here, '..', 'apps', 'web', 'src', 'data', 'generated', 'vocabulary.json'), 'utf8'),
    );
    return Array.isArray(data.words) ? data.words.length : 0;
  } catch {
    return 0;
  }
}

const headwords = headwordCount();
const corpusNow = sum(wordCorpus);
// Linear in the number of words, which is what the data is: one record each,
// of roughly constant shape. It ignores gzip's improving ratio on a larger
// dictionary, so it errs high — which is the right direction for a budget.
const corpusProjected = headwords > 0 ? (corpusNow / headwords) * TARGET_HEADWORDS : 0;

const results = [
  {
    label: 'first load',
    detail: `${firstLoad.length} chunk(s) preloaded by index.html`,
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
    label: 'stroke assets',
    detail: strokeAssets.length ? `${strokeAssets.length} chunk(s), loaded with the first lesson` : 'none found',
    actual: sum(strokeAssets),
    budget: BUDGETS.strokeAssets,
  },
  {
    label: 'word corpus, now',
    detail: headwords
      ? `${headwords.toLocaleString('en')} headwords${
          wordCorpus.some((f) => eager.has(f.name)) ? ' — still in the first load' : ''
        }`
      : 'none found',
    actual: corpusNow,
    // Today's corpus is allowed the room the projection is denied: what has to
    // fit at the target is the *projection*, on the next line.
    budget: CORPUS_TARGET_BUDGET,
  },
  {
    label: `word corpus at ${TARGET_HEADWORDS.toLocaleString('en')}`,
    detail: headwords
      ? `forecast from ${(corpusNow / headwords).toFixed(0)} B/word — not enforced, see below`
      : 'cannot project — no corpus found',
    actual: corpusProjected,
    budget: CORPUS_TARGET_BUDGET,
    forecast: true,
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
  // A forecast is printed with the same arithmetic and does not fail the build.
  // See `CORPUS_TARGET_BUDGET`.
  if (over && !result.forecast) failed += 1;
  const share = result.budget ? (result.actual / result.budget) * 100 : 0;
  const mark = over ? (result.forecast ? '~' : '!') : ' ';
  console.log(
    `  ${mark} ${result.label.padEnd(width)}  ${kb(result.actual).padStart(9)} / ${kb(
      result.budget,
    ).padStart(9)}  ${share.toFixed(0).padStart(3)}%   ${result.detail}`,
  );
}

/*
 * The forecast, turned into a rule.
 *
 * The corpus may sit in the first load while it is small. Past
 * `LAZY_REQUIRED_HEADWORDS` it may not, and this is where that stops being a
 * note in a file and becomes a failing build — on the commit that grows the
 * corpus, which is the commit where somebody can still do something about it.
 */
const corpusIsEager = wordCorpus.some((f) => eager.has(f.name));
if (corpusIsEager && headwords > LAZY_REQUIRED_HEADWORDS) {
  failed += 1;
  console.error(
    `\n  ! the word corpus is ${headwords.toLocaleString('en')} headwords and is still loaded ` +
      `before the home screen paints.`,
  );
  console.error(
    `    Past ${LAZY_REQUIRED_HEADWORDS.toLocaleString('en')} it has to be fetched with the ` +
      `vocabulary route instead. See CORPUS_TARGET_BUDGET in this file for the options.`,
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
