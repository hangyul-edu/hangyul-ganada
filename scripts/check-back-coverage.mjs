#!/usr/bin/env node
/**
 * Every route a learner navigates *to* draws one back control, in the same
 * corner, that actually works — and Home draws none.
 *
 *   npm run back:coverage            render every route and report
 *   npm run back:coverage -- --check the same; exit non-zero on a finding
 *
 * ## The defect this exists for
 *
 * Seven screens shipped with no visible way back: Home, Letters, Numbers,
 * Words, a word category, Review and My Learning. Every one of them called
 * `AppHeader` and every one of them left `onBack` off, because the prop was
 * optional and opting in was easy to forget. On a phone using gesture
 * navigation — no visible system bar — those were screens a learner could enter
 * and see no way out of.
 *
 * ## And then the fix went one screen too far
 *
 * Making the control unconditional put a back chevron on Home, beside the
 * product's own logo, on the screen the app opens to. It was defended as
 * consistency and a screenshot ended the argument: on a first launch there is
 * nothing behind Home to go back to, and an arrow that says otherwise is a
 * control that lies. So the expectation here is now *two* rules rather than
 * one, and the second is as load-bearing as the first:
 *
 * - Home: **zero** visible back controls.
 * - Every other production route: **exactly one**.
 *
 * Both directions are checked, because "at least one" would pass a Home with a
 * chevron on it and "at most one" would pass a Letters screen with none.
 *
 * A component default fixes today's seven. It does not stop the eighth, which
 * is a *new screen that does not use the header at all*, and that is what this
 * checks: the route inventory is read out of the router rather than typed here,
 * so a route added tomorrow is in this gate tomorrow.
 *
 * ## Two passes, because each one misses what the other catches
 *
 * **Static.** Every `<Route element={<X />}>` in `App.tsx` is resolved to the
 * module that defines `X`, and that module must render `<AppHeader`. This is
 * the pass that catches a new screen written from scratch, and it runs without
 * a browser, so it is cheap enough to keep in `verify:quick`.
 *
 * **Rendered.** Every route is opened in a real browser at a phone size and the
 * control is measured: present, exactly one of it, in the top-left, at least
 * 44 x 44, with an accessible name, and not printed over the title. This is the
 * pass that catches a header that is present in the markup and invisible on the
 * screen — which is the failure the static pass would happily pass, and the one
 * a learner actually meets.
 *
 * ## And the name, in every language
 *
 * The control is an icon. Its accessible name is the only thing a screen reader
 * announces, so a locale missing `common:actions.back` ships a button that
 * reads as "button" — checked here rather than left to the key-coverage gate,
 * because this is the gate somebody reads when they are thinking about Back.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { ensurePreview } from './lib/preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const WEB = join(root, 'apps/web/src');
const CHECK = process.argv.includes('--check');
const baseUrl = process.argv.find((arg) => arg.startsWith('http')) ?? 'http://127.0.0.1:4477';

const findings = [];
const fail = (what) => findings.push(what);

/** The one route with no back control. Everything else has exactly one. */
const HOME = '/';

// --- the route inventory, read out of the router -----------------------------

const app = readFileSync(join(WEB, 'App.tsx'), 'utf8');

/**
 * `path` and the component in its `element`, for every route in the router.
 *
 * A regex over the source rather than an import, because importing `App.tsx`
 * pulls in the whole application — every lazy chunk, the corpus fetch, the
 * canvas — into a Node process that only wants to know what the paths are.
 */
/**
 * Routes mounted only when `import.meta.env.DEV` is true.
 *
 * `import.meta.env.DEV` is a compile-time constant, so these are removed
 * entirely from a release build — there is no bundle for them to be in and no
 * address a customer can reach them at. They are held to the static half of
 * this gate and excused the rendered half, because rendering one against a
 * production preview measures the not-found page and reports it as a pass,
 * which is worse than not measuring it.
 *
 * The developer gallery is the only one today. It is a wall of stroke diagrams
 * with its own heading and no navigation of any kind — see
 * `pages/StrokeGalleryPage` — and giving it the app's header would be dressing
 * a QA surface up as a screen.
 */
const devOnly = new Set(
  [...app.matchAll(/import\.meta\.env\.DEV &&[\s\S]{0,400}?path="([^"]+)"/g)].map(([, path]) => path),
);

const routes = [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)\s*\/>\}/g)].map(
  ([, path, component]) => ({ path, component, dev: devOnly.has(path) }),
);
// The catch-all is written across several lines with its element inline.
if (/path="\*"/.test(app)) routes.push({ path: '*', component: 'NotFoundPage' });

if (routes.length < 15) fail(`only ${routes.length} routes found in App.tsx — the parser has drifted`);

// --- static: every route's screen renders the shared header ------------------

/** Which module defines each lazily-imported screen. */
const definedIn = new Map(
  [...app.matchAll(/const (\w+) = lazy\(\(\) =>\s*import\("\.\/([^"]+)"\)/g)].map(
    ([, name, path]) => [name, `${path}.tsx`],
  ),
);
for (const [, name, path] of app.matchAll(/import \{ (\w+) \} from "\.\/([^"]+)";/g)) {
  definedIn.set(name, `${path}.tsx`);
}

const sources = new Map();
const sourceOf = (file) => {
  if (!sources.has(file)) sources.set(file, readFileSync(join(WEB, file), 'utf8'));
  return sources.get(file);
};

for (const { path, component } of routes) {
  const file = definedIn.get(component);
  if (!file) {
    // `WordCategoryPage` and friends are re-exported from another page's module.
    const found = readdirSync(join(WEB, 'pages')).find(
      (name) => name.endsWith('.tsx') && !name.includes('.test.') &&
        new RegExp(`export (function|const) ${component}\\b`).test(sourceOf(`pages/${name}`)),
    );
    if (!found) {
      fail(`${path}: cannot find the module that defines ${component}`);
      continue;
    }
    definedIn.set(component, `pages/${found}`);
  }
  const source = sourceOf(definedIn.get(component));
  const dev = devOnly.has(path);
  if (!source.includes('<AppHeader') && !dev) {
    fail(`${path} (${component}) does not render <AppHeader>, so it has no back control`);
  }
  if (/onBack=\{(false|undefined|null)\}/.test(source)) {
    fail(`${path} (${component}) switches its back control off`);
  }
}

// --- the accessible name, in all thirty-two languages ------------------------

const locales = readdirSync(join(WEB, 'locales')).filter((name) =>
  readdirSync(join(WEB, 'locales', name)).includes('common.json'),
);
for (const locale of locales) {
  const common = JSON.parse(readFileSync(join(WEB, 'locales', locale, 'common.json'), 'utf8'));
  const name = common?.actions?.back;
  if (typeof name !== 'string' || name.trim() === '') {
    fail(`${locale}: common:actions.back is missing, so the back button has no accessible name`);
  }
}

// --- rendered: what a learner can actually see and press ---------------------

/**
 * A concrete address for every route, since a browser cannot open `:wordId`.
 *
 * Deliberately the ids the rest of the QA suite uses, so a fixture that rots
 * rots in one place. A route with no address here is a failure rather than a
 * skip: an unvisited route is exactly where a missing back button hides.
 */
const ADDRESSES = {
  '/': '/',
  '/letters': '/letters',
  '/letters/numbers': '/letters/numbers',
  '/letters/sounds': '/letters/sounds',
  '/letters/numbers/:lessonId': '/letters/numbers/sinoBasics',
  '/letters/:lessonId': '/letters/lesson-vowels-core',
  '/words': '/words',
  '/words/category/:category': '/words/category/people',
  '/words/word/:wordId': '/words/word/word_eomma',
  '/words/dictionary/:headword': '/words/dictionary/%EA%B7%80%EC%A1%B1',
  '/words/saved': '/words/saved',
  '/words/today': '/words/today',
  '/review': '/review',
  '/review/mistakes': '/review/mistakes',
  '/review/session': '/review/session',
  '/me': '/me',
  '/me/activity': '/me/activity',
  '/me/level-test': '/me/level-test',
  '/me/language': '/me/language',
  '/me/privacy': '/me/privacy',
  '/me/legal': '/me/legal',
  '*': '/this-route-does-not-exist',
};

const stop = await ensurePreview(baseUrl);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
});
const page = await context.newPage();

let measured = 0;
for (const { path, dev } of routes) {
  if (dev) continue;
  const address = ADDRESSES[path];
  if (!address) {
    fail(`${path}: no address to open it at — add one to ADDRESSES`);
    continue;
  }
  await page.goto(`${baseUrl}${address}`, { waitUntil: 'networkidle' });
  // Past the launch overlay, which eats input for 900 ms, and past the lazy
  // chunk behind it.
  await page.waitForTimeout(1400);

  const seen = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-testid="app-back"]')].filter(
      (element) => element.getBoundingClientRect().width > 0,
    );
    const title = document.querySelector('header h1')?.getBoundingClientRect() ?? null;
    return {
      count: buttons.length,
      boxes: buttons.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x, y: box.y, width: box.width, height: box.height,
          label: element.getAttribute('aria-label') ?? '',
        };
      }),
      title: title ? { x: title.x, y: title.y, width: title.width, height: title.height } : null,
    };
  });

  measured += 1;

  /*
   * Home is the exception, and it is checked rather than skipped: a screen
   * excused from a gate is a screen the gate cannot report on, and the whole
   * reason this rule exists is that a chevron appeared on Home without anybody
   * deciding it should.
   */
  if (path === HOME) {
    if (seen.count > 0) {
      fail(
        `${path}: Home draws ${seen.count} back control(s); it must draw none — ` +
          'there is nothing behind the screen the app opens to',
      );
    }
    continue;
  }

  if (seen.count === 0) {
    fail(`${path}: no visible back control`);
    continue;
  }
  if (seen.count > 1) fail(`${path}: ${seen.count} back controls — a learner should see one`);

  const [box] = seen.boxes;
  if (box.label.trim() === '') fail(`${path}: the back control has no accessible name`);
  // The upper-left safe area: the left third of the screen, and the header band.
  if (box.x > 130) fail(`${path}: the back control is ${Math.round(box.x)} px from the left, not in the corner`);
  if (box.y > 120) fail(`${path}: the back control is ${Math.round(box.y)} px down the page, below the header`);
  if (box.width < 44 || box.height < 44) {
    fail(`${path}: the back control is ${Math.round(box.width)}x${Math.round(box.height)}, under the 44 px floor`);
  }
  if (seen.title) {
    const overlaps =
      box.x < seen.title.x + seen.title.width && box.x + box.width > seen.title.x &&
      box.y < seen.title.y + seen.title.height && box.y + box.height > seen.title.y;
    if (overlaps) fail(`${path}: the back control is printed over the title`);
  }
}

await browser.close();
await stop();

// --- report ------------------------------------------------------------------

const shipped = routes.filter((route) => !route.dev).length;
const dev = routes.filter((route) => route.dev);
console.log(
  `Back control — ${routes.length} routes in the router (${shipped} in a release build), ${measured} opened in a browser`,
);
console.log(`  Home (${HOME}) expects none; the other ${shipped - 1} production routes expect exactly one`);
console.log(
  dev.length === 0
    ? '  no developer-only routes'
    : `  developer-only, static pass only: ${dev.map((route) => route.path).join(', ')}`,
);
console.log(`  ${locales.length} locales carry an accessible name for it`);
if (findings.length === 0) {
  console.log('  Home draws none; every other route draws one, in the corner, at 44 px, with a name.');
} else {
  console.log(`\n  ${findings.length} problem(s):`);
  for (const finding of findings) console.log(`    ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
