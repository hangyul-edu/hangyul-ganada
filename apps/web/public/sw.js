/*
 * Offline support.
 *
 * Hangyul ganada is bought once and every lesson and recording is
 * bundled with it — but "bundled" in a browser still means "fetched over the
 * network the first time". This worker is what turns that into a real offline
 * product.
 *
 * ## Two strategies, for two kinds of thing
 *
 * **The app** — HTML, JavaScript, CSS, fonts — is served network-first with a
 * cache fallback. A learner who is online gets the release they should have;
 * one who is not gets the last one that reached them, which is the whole app.
 *
 * **The content** — the audio clips — is served cache-first. A clip is worth
 * a round trip once and never again, and cache-first is what makes a speaker
 * button feel instant on the second tap.
 *
 * ## Why the audio cache is versioned, and how that was found out
 *
 * A clip's file name is derived from the word it says, so a *corrected*
 * recording of 마디 arrives under exactly the name the wrong one already has.
 * This worker used to treat that as immutable and key its cache to a constant,
 * which meant a learner whose app had already played the word would go on
 * hearing the defect through every future release: the fix shipped, the store
 * updated, and the sound never changed. There is no version of that which is
 * acceptable in a product that teaches pronunciation.
 *
 * So the audio cache carries the *audio build's* own version — the date stamped
 * into `audio/manifest.json`, injected here by the web build — and a release
 * with new recordings lands in a new cache while the old one is deleted on
 * activation. The manifest itself is fetched network-first, because it is two
 * hundred kilobytes and it is the thing that has to be able to say "there are
 * new recordings".
 *
 * ## What is deliberately *not* precached
 *
 * The audio set is 47 MB across 10,158 files. Downloading all of it on first
 * visit, before the learner has met a single letter, would be a hostile way to
 * introduce a product. Clips are cached as they are played, so the lessons a
 * learner has actually done are the lessons that work on a plane — which is the
 * right set, and it costs them nothing to acquire.
 */

const VERSION = 'hangyul-ganada-v1';
/**
 * The audio build this release ships, replaced by the web build with the
 * `version` field of `audio/manifest.json`. `dev` while running from source,
 * where the clips are read straight off the dev server.
 */
const AUDIO_VERSION = '__HANGYUL_AUDIO_VERSION__';
const APP_CACHE = `${VERSION}-app`;
const CONTENT_CACHE = `${VERSION}-content`;
const AUDIO_CACHE = `${VERSION}-audio-${AUDIO_VERSION}`;

/** Paths whose contents never change under the same name. */
const IMMUTABLE = [/^\/brand\//, /^\/assets\//, /^\/dictionary\/(?!manifest\.json$)/];

/** Recordings: immutable *within* an audio build, replaced between them. */
const AUDIO = /^\/audio\/.+\.mp3$/;
const AUDIO_MANIFEST = '/audio/manifest.json';

/** How the app finds the current dictionary index and chunks. Never stale. */
const DICTIONARY_MANIFEST = '/dictionary/manifest.json';

/**
 * The shell, fetched up front so a learner who closes the app and reopens it
 * offline sees the app rather than the browser's error page.
 */
const SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

/**
 * Caches the shell, including the hashed bundle the HTML actually references.
 *
 * The script and stylesheet names carry a content hash, so they cannot be
 * listed here — and they are exactly what a first-ever visit fails without. On
 * that first visit the worker is not yet controlling the page, so the browser
 * fetched the bundle directly and the worker never saw it; the next launch,
 * offline, would then find the HTML in the cache and nothing to run in it.
 *
 * The build writes `offline-assets.json` listing every emitted chunk, and the
 * HTML is still read as a fallback for a release built before that existed.
 * Neither can drift from what actually shipped.
 */
async function precache() {
  try {
    const cache = await caches.open(APP_CACHE);
    // `reload` bypasses the HTTP cache: installing a new worker with the
    // previous release's HTML is how a stale app pins itself forever.
    await cache.addAll(SHELL.map((path) => new Request(path, { cache: 'reload' })));

    // The manifest, into the audio cache it belongs to rather than the app's,
    // so that dropping one audio build drops its index with it.
    await caches
      .open(AUDIO_CACHE)
      .then((audio) => audio.add(new Request(AUDIO_MANIFEST, { cache: 'reload' })))
      .catch(() => {});

    // Every emitted chunk, not only the ones the HTML names. Routes and the
    // per-locale word copy are dynamic imports and appear in no markup, so
    // reading the HTML alone left a learner who had never opened a word screen
    // — or had never switched language — with a shell and nothing to put in it.
    // The list is written by the build (see `offlineAssetList` in
    // `vite.config.ts`), so it is exactly what shipped.
    const assets = new Set();
    try {
      const listed = await (await fetch('/offline-assets.json', { cache: 'reload' })).json();
      for (const url of listed.assets ?? []) assets.add(url);
    } catch {
      /* Fall through to the HTML, which is still better than nothing. */
    }

    const html = await (await cache.match('/index.html'))?.text();
    for (const match of html?.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g) ?? []) {
      assets.add(match[1]);
    }
    if (assets.size === 0) return;
    const content = await caches.open(CONTENT_CACHE);
    // Individually, not `addAll`: one asset that 404s must not throw away the
    // rest of the precache with it.
    await Promise.all(
      [...assets].map((url) =>
        content
          .match(url, { ignoreVary: true })
          .then((hit) => (hit ? undefined : content.add(url).catch(() => {}))),
      ),
    );
  } catch {
    /* Offline support is unavailable this launch. The app still works. */
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                // Anything from an older worker…
                !key.startsWith(VERSION) ||
                // …and the recordings of an older audio build, which are the
                // ones that would otherwise outlive a pronunciation fix.
                (key.startsWith(`${VERSION}-audio-`) && key !== AUDIO_CACHE),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The manifest is how the app finds out which recordings exist, so it is
  // never served from a cache while a network is available: a stale one would
  // point at the previous build's clips and hide the new ones.
  if (url.pathname === AUDIO_MANIFEST) {
    event.respondWith(networkFirst(request, AUDIO_CACHE));
    return;
  }

  // The dictionary manifest names the content-hashed index and chunk files, so
  // it is the one dictionary file that must not go stale: served from cache
  // while the network is up, it would keep pointing a learner at last build's
  // chunks. Everything it points at is named after its own bytes and so is
  // cached for good — which is what makes an opened chunk work offline.
  if (url.pathname === DICTIONARY_MANIFEST) {
    event.respondWith(networkFirst(request, CONTENT_CACHE));
    return;
  }

  if (AUDIO.test(url.pathname)) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE));
    return;
  }

  if (IMMUTABLE.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(request, CONTENT_CACHE));
    return;
  }

  /*
   * A navigation must always resolve to the app, whatever route the learner
   * typed: this is a single-page app, and every path is index.html.
   *
   * ## Why a 404 is treated as a miss rather than as an answer
   *
   * The SPA fallback is a *hosting* rule — `vercel.json`, `_redirects`, a
   * server config — and a host that has not got one answers `/words/word/x`
   * with a 404 page. That is the reported bug: navigate anywhere inside the
   * app, press reload, and get the host's not-found page instead of the screen
   * that was on the display a second ago.
   *
   * This used to make it worse in two ways. `fetch` *succeeds* on a 404 — it
   * only rejects when the request never completed — so the `catch` below never
   * ran and the learner got the 404 straight through. And the response was then
   * written into the cache as `/index.html`, so the app shell itself became the
   * host's error page: from then on every navigation served it, offline
   * included, and fixing the hosting rule would not have cleared it.
   *
   * So only a real response is kept, and anything else falls through to the
   * shell. The worst case is now that a misconfigured host costs one round trip
   * and the learner still lands on the screen they asked for.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) throw new Error(`navigation returned ${response.status}`);
          void caches.open(APP_CACHE).then((cache) => cache.put('/index.html', response.clone()));
          return response;
        })
        .catch(() =>
          caches
            .match('/index.html', { ignoreVary: true })
            .then((cached) => cached ?? fetch('/index.html').catch(() => offlineResponse())),
        ),
    );
    return;
  }

  event.respondWith(networkFirst(request, APP_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  // `ignoreVary`: the server sends `Vary: Accept-Encoding`, and the worker's
  // own precache fetch does not negotiate encoding the way the page's script
  // and stylesheet requests do. Without this the entries are in the cache and
  // never match, which looks exactly like nothing having been cached at all.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // Only successful, complete responses. Caching a 404 for an audio clip
    // would make a missing file permanent.
    if (response.ok && response.status === 200) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    // A missing clip is handled by the app, which falls back to the other
    // voice or renders the speaker button as unavailable.
    return cached ?? Response.error(error);
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    return offlineResponse();
  }
}

function offlineResponse() {
  return new Response('', { status: 504, statusText: 'offline' });
}
