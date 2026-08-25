import '@testing-library/jest-dom/vitest';

import { configure } from '@testing-library/react';

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpusCore, loadCorpusRest } from '../data/corpus';
import { loadWordCopy } from '../data/wordCopy';
import { preloadAllLetterCopy } from '../data/letterCopy';
import { preloadAllLocaleResources } from '../i18n/resources';

/**
 * jsdom implements neither canvas nor ResizeObserver, both of which the writing
 * surface uses. Stubbing them here keeps component tests focused on behaviour;
 * the drawing and grading paths are covered by the handwriting-core unit tests
 * and by the Playwright suite, which run against real implementations.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

/*
 * `waitFor` gets five seconds instead of one, everywhere.
 *
 * Nothing in this suite measures speed — `perf:dictionary` does that, against a
 * budget, on purpose. Every `waitFor` here is waiting for a driver to load or
 * for React to flush an effect, and the one-second default is a bet about how
 * fast the machine is rather than an assertion about the product.
 *
 * The bet started losing as the corpus grew. `open()` in
 * `vocabularyProgress.test.tsx` waits for the day's plan to be built over the
 * whole corpus; at 2,581 words that finished inside a second on a loaded
 * machine and at 3,221 it did not, so a full `verify:release` — fifty test
 * files, a production build and a Playwright suite competing for the same
 * cores — reported `expected 0 to be greater than 0` for a plan that was
 * simply still being built. It passed on its own every time.
 *
 * That is the third distinct place in this repository where a fixed delay
 * became a false failure as the content grew, after two end-to-end walks. The
 * class is worth fixing once rather than three more times: a timeout is not an
 * assertion unless somebody wrote it to be one, and a hang still fails — five
 * seconds later, with the same message.
 */
configure({ asyncUtilTimeout: 5_000 });

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext ??= (() => null) as never;
}

/*
 * Every language, in memory, before any suite runs.
 *
 * The app ships English and fetches the rest — see `i18n/resources.ts` for the
 * interface strings and `data/letterCopy.ts` for the letter explanations. The
 * tests assert about all thirty-two at once, synchronously, and would otherwise
 * see only English and pass while saying nothing. This is the one place that is
 * allowed to load the whole set.
 */
await Promise.all([preloadAllLocaleResources(), preloadAllLetterCopy()]);

/*
 * `public/` over the file system, for the two datasets the app fetches.
 *
 * The learning corpus and the level-test bank are not imported any more — they
 * are bands and chunks under `public/`, fetched at runtime, which is the whole
 * point of `data/corpus.ts`. jsdom has no server behind it, so a unit test
 * would see a corpus of nothing.
 *
 * This maps exactly the two prefixes the app fetches from and passes everything
 * else through, so a test that means to assert about a *failed* fetch still
 * can, and a test that accidentally reaches the network still fails loudly.
 */
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const LOCAL = /^\/(corpus|level-test|dictionary)\//;
const network = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (!LOCAL.test(url)) return network(input as RequestInfo, init);
  try {
    const body = await readFile(join(PUBLIC, url));
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}) as typeof fetch;

/*
 * The whole corpus, before any suite runs.
 *
 * The app loads band 1 and then the rest in the background; a test asserting
 * about the curriculum wants all of it and wants it synchronously, the same
 * bargain the locale preload above strikes.
 */
await loadCorpusCore();
await loadCorpusRest();
// And the English meanings for every band of it. The bands bring the loaded
// languages with them, but that fetch is started rather than awaited — the app
// re-renders when it lands and a test cannot.
await loadWordCopy('en');
