import '@testing-library/jest-dom/vitest';

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
