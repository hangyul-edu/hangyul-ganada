import METRICS from './generated/jamoMetrics.json';

/**
 * How far a letter's ink sits from the centre of the box that centring gives it.
 *
 * Measured off the reference face by `scripts/measure-jamo.mjs` and expressed
 * as a share of the em, so it holds at any font size. See `ui/CenteredGlyph`
 * for what it is for and why the numbers are measured rather than typed.
 *
 * Lives here rather than beside the component because two things need it — the
 * component and the callers that position their own content — and because a
 * module that exports both a component and a helper opts the whole file out of
 * React Fast Refresh.
 */
const OFFSETS = METRICS.inkOffset as Record<string, { dx: number; dy: number } | undefined>;

/** `{ dx: 0, dy: 0 }` for anything unmeasured — a syllable, a space, a digit. */
export function inkOffset(character: string): { dx: number; dy: number } {
  return OFFSETS[character] ?? { dx: 0, dy: 0 };
}
