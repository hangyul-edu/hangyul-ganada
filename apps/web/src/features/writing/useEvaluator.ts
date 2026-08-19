import { useMemo } from 'react';
import {
  GeometryHandwritingEvaluator,
  type EvaluationConfig,
  type HandwritingEvaluator,
} from '@hangyul-ganada/handwriting-core';
import type { PracticeFont } from '@hangyul-ganada/shared-types';

import { CanvasGlyphRasterizer } from './CanvasGlyphRasterizer';

/**
 * The evaluator the app grades with.
 *
 * One rasteriser instance is shared so its glyph-mask cache survives across
 * characters and sessions — rendering the same reference glyph repeatedly is
 * the only expensive part of an attempt.
 *
 * Swapping in OCR or a stroke-order recogniser later means returning a
 * different `HandwritingEvaluator` from here. Nothing else in the app knows
 * which implementation it is talking to.
 */
const rasterizer = new CanvasGlyphRasterizer();
const geometryEvaluator = new GeometryHandwritingEvaluator(rasterizer);

export function useEvaluator(): HandwritingEvaluator {
  return useMemo(() => geometryEvaluator, []);
}

/** Clears cached reference masks — call when the practice typeface changes. */
export function invalidateGlyphCache(): void {
  rasterizer.clearCache();
}

/**
 * The grading slack for a typeface.
 *
 * Translates the face's declared profile into the evaluator's vocabulary, and
 * is the only place the two spellings meet. A face with no profile grades on
 * the defaults — which is the right answer for the plain gothics the thresholds
 * were calibrated against.
 *
 * What this is *not* is a way to make hard fonts easy. The structural checks —
 * a missing jamo, ink in the wrong half of the box, a scribble — are untouched;
 * only the geometric slack around correct strokes moves, because that is the
 * part a decorative face genuinely changes.
 */
export function gradingFor(font: PracticeFont): Partial<EvaluationConfig> | undefined {
  const profile = font.evaluation;
  if (!profile) return undefined;
  const config: Partial<EvaluationConfig> = {};
  if (profile.glyph_tolerance_ratio !== undefined) {
    config.glyphToleranceRatio = profile.glyph_tolerance_ratio;
  }
  if (profile.max_mismatch_ratio !== undefined) {
    config.maxMismatchRatio = profile.max_mismatch_ratio;
  }
  return config;
}
