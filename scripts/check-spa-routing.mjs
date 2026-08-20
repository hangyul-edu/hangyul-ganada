#!/usr/bin/env node
/**
 * Does a valid route survive a refresh on a real host?
 *
 *   node scripts/check-spa-routing.mjs           print the findings
 *   node scripts/check-spa-routing.mjs --check   fail the build on an error
 *
 * ## The bug this exists to stop coming back
 *
 * Hangyul ganada is a single-page app with clean URLs. Client-side navigation
 * to `/words/word/word_eomma` works because the router handles it in the page;
 * a *browser refresh* of the same URL is an ordinary HTTP GET for a path that
 * does not exist as a file, and a static host answers it with 404. The learner
 * loses the page they were on, and every link anybody shares is dead.
 *
 * Nothing in the app can fix that — it is decided before any JavaScript runs —
 * so the fix is hosting configuration, and hosting configuration is exactly the
 * kind of thing that is never tested until it breaks in production. The dev
 * server has SPA fallback built in and would pass any check run against it,
 * which is why this script refuses to use it: it serves the built `dist/` with
 * the same precedence a static host applies, driven by the rules in the
 * repository's own `vercel.json`, and asks for the URLs a learner would.
 *
 * ## What it asserts
 *
 * | | Why |
 * | --- | --- |
 * | every application route answers 200 with the app shell | §5.1 — refresh and deep links must work |
 * | a real static file is still served as itself | §5.6 — the fallback must not eat the bundle |
 * | a *missing* file under `/assets/` still 404s | a stale chunk answered with HTML fails with a syntax error nobody can read |
 * | `/api/*` is never answered with the shell | §5.7 — backend routes stay backend routes |
 * | the shipped rules exclude both, in the config itself | the server below is only as honest as the file it reads |
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const DIST = join(ROOT, 'apps', 'web', 'dist');
const CHECK = process.argv.includes('--check');

const failures = [];
const notes = [];
const fail = (what, detail) => failures.push(`${what} — ${detail}`);

// --- The rules the host will actually apply ----------------------------------

/**
 * Read from `vercel.json` rather than restated here.
 *
 * A checker with its own copy of the rules proves that the checker is
 * self-consistent, which is not the question. The question is whether the file
 * that ships is right.
 */
const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const rewrites = config.rewrites ?? [];

if (rewrites.length === 0) fail('vercel.json', 'declares no rewrites, so every nested route will 404');

/** Every rewrite source, compiled. Vercel matches the whole path. */
const rules = rewrites.map((rule) => ({
  test: new RegExp(`^${rule.source}$`),
  destination: rule.destination,
  source: rule.source,
}));

const catchAll = rules.find((rule) => rule.destination === '/index.html');
if (!catchAll) fail('vercel.json', 'no rule sends unmatched paths to /index.html');
else {
  if (catchAll.test.test('/api/words')) {
    fail('vercel.json', `"${catchAll.source}" would send /api/* to the app shell`);
  }
  if (catchAll.test.test('/assets/missing-chunk.js')) {
    fail('vercel.json', `"${catchAll.source}" would answer a missing bundle with HTML`);
  }
}

// The portable copy, for hosts that read Netlify-style rules.
const redirects = join(ROOT, 'apps', 'web', 'public', '_redirects');
if (!existsSync(redirects)) fail('_redirects', 'missing; only Vercel-style hosts would fall back');
else if (!/^\/\*\s+\/index\.html\s+200\s*$/m.test(readFileSync(redirects, 'utf8'))) {
  fail('_redirects', 'has no `/*  /index.html  200` catch-all');
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No build to check. Run `npm run build` first.');
  process.exit(1);
}

// --- A static host, with no SPA knowledge of its own --------------------------

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

/**
 * Filesystem first, then the configured rewrites, then 404.
 *
 * That order is the one every static host uses and it is the reason a blanket
 * catch-all does not break the bundle: `/assets/index-abc123.js` never reaches
 * a rule, because the file is there.
 */
function resolve(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const direct = join(DIST, safe);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;

  for (const rule of rules) {
    if (!rule.test.test(safe)) continue;
    const target = join(DIST, rule.destination);
    if (existsSync(target) && statSync(target).isFile()) return target;
  }
  return null;
}

const server = createServer((req, res) => {
  const file = resolve(new URL(req.url, 'http://localhost').pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// --- The URLs a learner would open -------------------------------------------

/**
 * Every route in `App.tsx` that a learner can be sitting on when they refresh,
 * plus the two that carry an id — which are the ones that matter, because they
 * are what gets shared and bookmarked.
 */
const ROUTES = [
  '/',
  '/letters',
  '/letters/sounds',
  '/words',
  '/words/category/family',
  '/words/word/word_eomma',
  '/words/word/word_hada',
  '/words/saved',
  '/words/today',
  '/review',
  '/review/mistakes',
  '/review/session',
  '/me',
  '/me/activity',
  '/me/language',
  '/me/privacy',
  '/me/legal',
];

const shell = readFileSync(join(DIST, 'index.html'), 'utf8');

for (const route of ROUTES) {
  const response = await fetch(base + route);
  if (response.status !== 200) {
    fail(route, `refreshing it returns ${response.status}, not the app`);
    continue;
  }
  const body = await response.text();
  if (body !== shell) fail(route, 'answered with something other than the app shell');
}
notes.push(`${ROUTES.length} application routes survive a direct request`);

// --- Static files must still be themselves ------------------------------------

/** One real file of each kind the app actually ships. */
const assets = readdirSync(join(DIST, 'assets'));
const STATIC = [
  `/assets/${assets.find((name) => name.endsWith('.js'))}`,
  `/assets/${assets.find((name) => name.endsWith('.css'))}`,
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline-assets.json',
];

for (const path of STATIC) {
  const response = await fetch(base + path);
  if (response.status !== 200) {
    fail(path, `a real static file returns ${response.status}`);
    continue;
  }
  const body = await response.text();
  if (body === shell) fail(path, 'a real static file was replaced by the app shell');
}
notes.push(`${STATIC.length} static files are served as themselves`);

// A bundle that is genuinely gone must say so, not hand back HTML: an import()
// that receives markup fails with a syntax error pointing at nothing.
const missing = await fetch(`${base}/assets/index-does-not-exist.js`);
if (missing.status !== 404) fail('/assets/*', `a missing bundle returns ${missing.status}, not 404`);

// Backend routes stay backend routes, whether or not one is deployed today.
const api = await fetch(`${base}/api/anything`);
if (api.status === 200 && (await api.text()) === shell) {
  fail('/api/*', 'a backend request was answered with the app shell');
}
notes.push('/api/* and missing bundles are left alone');

server.close();

// --- The one part of this the app itself owns --------------------------------

/*
 * The worker must survive a host that has *not* got the rules above.
 *
 * Everything checked so far is configuration, and configuration is the half of
 * this that a repository cannot guarantee: the app can be published somewhere
 * that reads neither `vercel.json` nor `_redirects`, and then a refresh on a
 * nested route is answered with that host's 404 page.
 *
 * The worker used to make that permanent. `fetch` resolves for a 404 — it only
 * rejects when the request never completed — so the navigation handler took the
 * error page as a valid answer and wrote it into the cache *as the app shell*.
 * From then on every navigation served the 404, offline included, and repairing
 * the hosting rule would not have cleared it.
 */
const worker = readFileSync(join(DIST, 'sw.js'), 'utf8');
const navigation = worker.slice(worker.indexOf("request.mode === 'navigate'"));
if (!/if \(!response\.ok\) throw/.test(navigation)) {
  fail('sw.js', 'a navigation response is cached as the app shell without checking it succeeded');
} else {
  notes.push('the worker treats a failed navigation as a miss, not as the shell');
}

// --- Report -------------------------------------------------------------------

console.log('SPA routing — the built app, served the way a static host serves it\n');
for (const note of notes) console.log(`  ok  ${note}`);
for (const failure of failures) console.log(`  ERROR  ${failure}`);
console.log(`\n${failures.length} error(s).`);
if (failures.length > 0 && CHECK) process.exit(1);
