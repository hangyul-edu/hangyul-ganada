import '@testing-library/jest-dom/vitest';

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
