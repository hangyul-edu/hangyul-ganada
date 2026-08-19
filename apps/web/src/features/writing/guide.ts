import { PRACTICE_GLYPH_OPACITY, TRACE_GLYPH_OPACITY } from '@hangyul-ganada/handwriting-core';

/**
 * How much of the reference glyph is on screen during one practice step.
 *
 * ```
 * full    ██████████  the shape, plainly. Follow the line.
 * light   ████░░░░░░  much lighter, and still enough to write by.
 * ```
 *
 * Two levels, and both of them show the character. There is no third level: a
 * learner is never asked to produce a Korean letter on an empty box, at any
 * point in the product, under any setting.
 *
 * This is guidance only. The pass mark is the same at both levels, so "correct"
 * always means the same thing.
 */
export type GuideLevel = 'full' | 'light';

export const GUIDE_OPACITY: Record<GuideLevel, number> = {
  full: TRACE_GLYPH_OPACITY,
  light: PRACTICE_GLYPH_OPACITY,
};
