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
 * | corpus, first paint | the shared tables, the first band, and its meanings |
 * | corpus, whole | every band and every language's meanings, fetched after |
 * | any route | the largest single lazily-loaded screen |
 * | stroke assets | the stroke geometry, fetched when a lesson opens |
 * | everything | every chunk the service worker precaches for offline use |
 *
 * ## The projection, and why one budget is not a measurement of today
 *
 * Every other line here answers "how big is this now". The corpus lines also
 * answer "how big will this be when it is finished", because the corpus is
 * deliberately growing towards ten thousand headwords and the difference
 * between where it is and where it is going is a factor of four.
 *
 * A budget that only measured today would pass every commit and then fail once,
 * catastrophically, on the commit that finished the content — by which point
 * the architecture that made it possible is months old. So the per-word cost is
 * measured and multiplied out to the target, and *that* is what has to fit. It
 * is a linear extrapolation and it is honest about being one; what it is for is
 * making the constraint arrive at the same time as the decision that creates it.
 *
 * The **first-paint** corpus row is the one that changed shape. It used to be a
 * projection that grew with the corpus and would one day fail. It is now a
 * projection that is *flat*, because the first band is a fixed 600 words
 * whatever the corpus becomes — and a forecast that does not move is the
 * evidence that the architecture is right, not a row that stopped mattering.
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

/**
 * The corpus, as it is actually delivered.
 *
 * Not a chunk any more. `scripts/content/split_corpus.py` writes bands to
 * `public/corpus/` and `data/corpus.ts` fetches them, so the thing to weigh is
 * a directory of JSON rather than a JavaScript module — see the corpus rows
 * below for what is weighed and why it is split in two.
 */
const CORPUS = join(DIST, 'corpus');

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
const STROKE_ASSETS = /^stroke-geometry-.*\.js$/;

/**
 * The corpus, back in the JavaScript bundle.
 *
 * There should be no such chunk. `manualChunks` still names one, deliberately:
 * if anything ever imports `src/data/generated/vocabulary*.json` again, the
 * corpus reappears as `word-corpus-*.js` and this pattern finds it, rather than
 * the corpus quietly re-entering the first load inside `index.js` where no row
 * of this table would show it.
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
 * What the whole corpus may cost at `TARGET_HEADWORDS`, gzipped.
 *
 * ## This number was re-derived, and that is worth reading before trusting it
 *
 * It used to be 220 kB, and 220 kB was a **first-load** figure: the corpus was
 * a statically imported chunk, so every byte of it was downloaded and parsed
 * before the home screen painted, and 220 kB was the most of the 460 kB
 * first-load budget it could be allowed to take. The forecast against it ran at
 * 754 kB and the answer was never going to be a bigger number — it was the
 * architecture, and the architecture is now done.
 *
 * So the quantity changed and the budget had to change with it. What this row
 * measures now is a **background** download: the app is already on screen and
 * usable on band 1 when it starts, nothing waits for it, and the service worker
 * keeps it so that it happens once ever. The constraint on a background fetch
 * is not "does it fit in the first load" — that is what `CORE_BUDGET` is, and
 * it is enforced and flat — it is "is this a fair thing to pull down over a
 * slow connection for a product somebody bought".
 *
 * 900 kB is that figure, for a ten-thousand-word teaching corpus with a
 * language's meanings attached. For scale, the dictionary layer's search index
 * alone is 449 kB on exactly these terms and nobody waits for that either.
 *
 * Raising a budget to make your own work pass is the failure mode this file
 * exists to prevent, so: the old number is not raised, it is *retired*, and the
 * property it was protecting — that a learner does not wait on the corpus — is
 * now protected by a different row that is stricter than it was and cannot be
 * satisfied by content shrinking.
 *
 * Still printed as a **forecast** rather than enforced, because a build cannot
 * be failed for content that does not exist yet: a permanently red gate is a
 * gate people learn to ignore.
 */
const CORPUS_TARGET_BUDGET = 900 * 1024;

/**
 * What the corpus may cost *before the app can render*, gzipped.
 *
 * This is the number the whole band architecture exists to hold flat. It is the
 * shared tables plus band 1 plus band 1's meanings in the learner's language —
 * the fetch `LearnerProvider` awaits behind the launch screen — and because
 * band 1 is a fixed 600 words it does not grow with the corpus. Sixty-four
 * kilobytes is the measured 45 kB plus the usual margin.
 *
 * Unlike the whole-corpus line this one **is enforced**, at today's size and at
 * the target, because unlike the whole-corpus line it is not a forecast about
 * content that does not exist: it is a property of the split, and if it ever
 * fails it means the split has stopped working.
 */
const CORE_BUDGET = 64 * 1024;

const BUDGETS = {
  firstLoad: 460 * 1024,
  route: 24 * 1024,
  /**
   * The instructional stroke geometry, loaded with the first lesson.
   *
   * Was 32 kB when this was ~190 kB of generated outlines cut from the glyph,
   * gzipped. It is now the code that draws the strokes rather than a dump of
   * them, so the budget comes down with it — and a budget left at the old
   * number would stop noticing if the outlines ever came back.
   */
  strokeAssets: 12 * 1024,
  /**
   * Everything the service worker holds for offline use.
   *
   * Raised twice for the same two languages: 800 → 840 kB when Vietnamese and
   * Thai were added at 500 words each, and 840 → 900 kB when their copy was
   * finished to all 2,581. That is what those two languages cost and the number
   * should say so rather than the languages being trimmed to fit a round
   * figure — but the *reason* it keeps having to be raised is the finding, not
   * the kilobytes. Two raises in one release is the point being made, not a
   * process being followed.
   *
   * It was then **not** raised a third time, and that is the more useful half
   * of this note.
   *
   * The worker used to precache every locale's word copy, so that a learner who
   * installs the app and goes offline before opening a word screen still has
   * their own language. Right behaviour, and it did not scale: the total grew
   * by a pack per language and by the whole corpus per word. Tripling the
   * interface languages to thirty-two would have taken it from 854 kB to over
   * 1.1 MB and this number would have been raised again.
   *
   * What happened instead is the architecture the previous note was waiting
   * for: the shell is precached, the thirty-one non-English interface bundles
   * are cached on first use, and the corpus — which is no longer a chunk at all
   * — is precached band by band out of its own manifest, all ten languages of
   * it, because that is the product and it has to work offline.
   *
   * So this row now covers two different things and the note should say which:
   * the emitted JavaScript and CSS the worker holds, **plus** `public/corpus/`.
   * The JavaScript half stopped growing with the corpus, which is the whole
   * point; the corpus half grows with it and is meant to, and the row is where
   * that shows up in one number instead of two.
   *
   * **Raised to 1,500 kB, and this is the corpus half doing exactly that.**
   * The measured total went to 1,454 kB when the twenty-two partial languages
   * went from 100 words to the whole 600-word core band. Band 1 is the band the
   * splitter precaches for every language, so 500 words x 22 languages of
   * meanings, example translations and 38 long definitions each land in this
   * row and nowhere else. The JavaScript half did not move: 367 kB of it
   * before and after, against 1,087 kB of corpus.
   *
   * Raised rather than trimmed, for the reason the first paragraph gives. The
   * alternative is to stop precaching twenty-two languages a learner might
   * actually be using, which is the offline promise, to save 54 kB. The line
   * that *is* the finding is the projection below it — 3,741 kB at 10,000
   * words — and it is unchanged in kind: precaching every language stops being
   * affordable long before the target, and the answer is the learner's own
   * language plus on-demand, not a smaller pack.
   */
  total: 1500 * 1024,
};

function gzipSize(path) {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

/**
 * What the service worker actually precaches, from the list the build emits.
 *
 * This row used to sum *every* file in `assets/`, which is a different number
 * and was not the one the label claimed. It mattered once the build started
 * emitting things it deliberately does not precache — thirty-one interface
 * languages and nine word packs, all fetched on use — because the row then
 * reported 1.1 MB of "precached" for a worker that stores 600 kB of it. A
 * budget measuring the wrong quantity is worse than no budget: it fails on
 * work that made the product smaller.
 *
 * `offline-assets.json` is written by the build itself (see
 * `offlineAssetList` in `apps/web/vite.config.ts`), so this cannot drift from
 * what the worker is handed. If it is missing — an older build, a partial
 * tree — the row falls back to every emitted file, which is the pessimistic
 * answer rather than a silent pass.
 */
function precacheList() {
  try {
    const listed = JSON.parse(readFileSync(join(DIST, 'offline-assets.json'), 'utf8')).assets;
    return new Set(listed.map((path) => path.replace(/^\/assets\//, '')));
  } catch {
    return null;
  }
}

const files = readdirSync(ASSETS)
  .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
  .map((name) => {
    const path = join(ASSETS, name);
    return { name, raw: statSync(path).size, gzip: gzipSize(path) };
  })
  .sort((a, b) => b.gzip - a.gzip);

const precacheNames = precacheList();
const precached = precacheNames ? files.filter((file) => precacheNames.has(file.name)) : files;

const eager = firstLoadNames();
const firstLoad = files.filter((f) => eager.has(f.name));
const wordCorpus = files.filter((f) => WORD_CORPUS.test(f.name));
const strokeAssets = files.filter((f) => STROKE_ASSETS.test(f.name));
const routes = files.filter(
  (f) =>
    !firstLoad.includes(f) &&
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

/**
 * `public/corpus/`, weighed the way a learner pays for it.
 *
 * Three numbers, from one manifest:
 *
 *   `core`   the tables, band 1, and band 1's English meanings — the fetch the
 *            launch screen waits behind
 *   `words`  every band of words
 *   `copy`   one language's meanings for every band
 *
 * English stands in for "the learner's language" because it is the largest
 * pack and because every learner has it as the end of their fallback chain.
 */
function corpusSizes() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(CORPUS, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
  const size = (name) => gzipSize(join(CORPUS, name));
  const tables = size(manifest.tables);
  const words = manifest.bands.map((band) => size(band.words));
  const copy = manifest.bands.map((band) => (band.locales.en ? size(band.locales.en) : 0));
  return {
    bands: manifest.bands.length,
    coreWords: manifest.bands[0]?.count ?? 0,
    core: tables + (words[0] ?? 0) + (copy[0] ?? 0),
    whole: tables + words.reduce((n, x) => n + x, 0) + copy.reduce((n, x) => n + x, 0),
    // Every language, which is what the worker precaches.
    everyLanguage: readdirSync(CORPUS).reduce((n, name) => n + gzipSize(join(CORPUS, name)), 0),
  };
}

const corpus = corpusSizes();

/*
 * Linear in the number of words, which is what the data is: one record each, of
 * roughly constant shape. It ignores gzip's improving ratio on a larger corpus,
 * so it errs high — the right direction for a budget.
 *
 * The core is projected too, and the answer is that it does not move: band 1 is
 * a fixed count of words, so the fetch that gates first paint costs the same at
 * ten thousand headwords as at two and a half. That flat line is the finding.
 */
const wholeProjected = corpus && headwords > 0 ? (corpus.whole / headwords) * TARGET_HEADWORDS : 0;

/*
 * The precache, projected — and this is the line the forecast was missing.
 *
 * `corpus, whole at 10,000` measures **one** language. The service worker
 * precaches `public/corpus` entire, which is the shared tables plus every
 * complete language's meanings: 698 kB of the 1,026 kB precached today, two
 * thirds of it. So the row that has a budget was being projected and the row
 * that would break first was not.
 *
 * At the target that is about 2.5 MB of corpus against a 1.4 MB total, which is
 * not a number a better gzip closes. It is a finding about the delivery
 * strategy rather than about the budget: precaching every language's meanings
 * is affordable at 2,844 headwords and is not affordable at 10,000, and the
 * answer when it stops being affordable is to precache the learner's own
 * language and fetch the others on demand — the same band mechanism that
 * already keeps first paint flat.
 *
 * Reported, not enforced, exactly like the row above it. What ships today fits.
 */
const precacheProjected =
  corpus && headwords > 0
    ? sum(precached) + (corpus.everyLanguage / headwords) * TARGET_HEADWORDS
    : 0;

const results = [
  {
    label: 'first load',
    detail: `${firstLoad.length} chunk(s) preloaded by index.html`,
    actual: sum(firstLoad),
    budget: BUDGETS.firstLoad,
  },
  {
    label: 'corpus, first paint',
    detail: corpus
      ? `tables + band 1 (${corpus.coreWords.toLocaleString('en')} words) + its meanings`
      : 'none found — public/corpus is missing',
    actual: corpus?.core ?? 0,
    budget: CORE_BUDGET,
  },
  {
    label: `corpus, first paint at ${TARGET_HEADWORDS.toLocaleString('en')}`,
    detail: 'the same band 1 — this line is meant not to move',
    actual: corpus?.core ?? 0,
    budget: CORE_BUDGET,
  },
  {
    label: 'corpus, whole',
    detail: corpus
      ? `${headwords.toLocaleString('en')} headwords in ${corpus.bands} bands, one language`
      : 'none found',
    actual: corpus?.whole ?? 0,
    // Today's corpus is allowed the room the projection is denied: what has to
    // fit at the target is the *projection*, on the next line.
    budget: CORPUS_TARGET_BUDGET,
  },
  {
    label: `corpus, whole at ${TARGET_HEADWORDS.toLocaleString('en')}`,
    detail: corpus
      ? `forecast from ${(corpus.whole / headwords).toFixed(0)} B/word — not enforced, see below`
      : 'cannot project — no corpus found',
    actual: wholeProjected,
    budget: CORPUS_TARGET_BUDGET,
    forecast: true,
  },
  {
    label: 'largest route chunk',
    detail: routes.length ? (routes[0]?.name ?? '') : 'none found',
    actual: Math.max(0, ...routes.map((f) => f.gzip)),
    budget: BUDGETS.route,
  },
  {
    label: 'stroke assets',
    detail: strokeAssets.length
      ? `${strokeAssets.length} chunk(s), loaded with the first lesson`
      : 'none found',
    actual: sum(strokeAssets),
    budget: BUDGETS.strokeAssets,
  },
  {
    label: 'everything precached',
    detail: `${precached.length} of ${files.length} emitted files, plus public/corpus`,
    actual: sum(precached) + (corpus?.everyLanguage ?? 0),
    budget: BUDGETS.total,
  },
  {
    label: `everything precached at ${TARGET_HEADWORDS.toLocaleString('en')}`,
    detail: corpus
      ? `the corpus is ${(corpus.everyLanguage / 1024).toFixed(0)} kB of the row above, in every complete language — not enforced`
      : 'cannot project — no corpus found',
    actual: precacheProjected,
    budget: BUDGETS.total,
    forecast: true,
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
 * The corpus is fetched, and this is what says so rather than trusting that it
 * still is. Two ways it could come back: something imports the generated JSON
 * again, which `manualChunks` would emit as `word-corpus-*.js`; or
 * `public/corpus` stops being written and the app has nothing to fetch. Either
 * one fails the build here, on the commit that does it.
 */
const corpusIsEager = wordCorpus.some((f) => eager.has(f.name));
if (corpusIsEager) {
  failed += 1;
  console.error(
    `\n  ! the word corpus is back in the eager module graph — ${wordCorpus
      .map((f) => f.name)
      .join(', ')}.`,
  );
  console.error(
    '    It is meant to be fetched from public/corpus. Something is importing\n' +
      '    src/data/generated/vocabulary*.json again; see data/corpus.ts.',
  );
} else if (!corpus) {
  failed += 1;
  console.error('\n  ! public/corpus is missing from the build.');
  console.error('    Run `npm run content:corpus` — the app has nothing to fetch without it.');
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
