/**
 * How many questions a voluntary practice session should ask.
 *
 * In its own file because it is arithmetic rather than a component, and because
 * both the screens that use it and the tests that check it want the numbers
 * without rendering anything.
 */

/** The rungs offered, when the pool is big enough for them. */
export const RUNGS = [5, 10, 20] as const;

/**
 * The sizes worth offering for a pool of `available` items.
 *
 * Always ends with the whole pool, and never repeats it: with exactly ten saved
 * words the options are 5 and All 10, not 5, 10 and All 10.
 */
export function sessionSizes(available: number): number[] {
  if (available <= 0) return [];
  const sizes = RUNGS.filter((rung) => rung < available);
  return [...sizes, available];
}

/** The size a screen should start on. Ten, or the whole list if it is smaller. */
export function defaultSessionSize(available: number): number {
  const sizes = sessionSizes(available);
  if (sizes.length === 0) return 0;
  return sizes.includes(10) ? 10 : (sizes[sizes.length - 1] ?? 0);
}
