import { DEFAULT_EVALUATION_CONFIG } from './config.js';
import {
  countInk,
  createMask,
  largestComponentSize,
  largestThickComponentSize,
  squaredDistanceTransform,
} from './mask.js';
import { rasterizeStrokes } from './raster.js';
import type {
  EvaluationConfig,
  EvaluationDiagnostics,
  EvaluationResult,
  FailureReason,
  Mask,
  Stroke,
} from './types.js';

/**
 * Compares a learner's ink against a reference glyph and returns a pass/fail
 * plus the two error terms that produced it.
 *
 * The two ways of getting a character wrong are different mistakes, so they are
 * measured separately and then added:
 *
 *   outsideStrokeRatio    — of the ink the learner laid down, how much of it
 *                           does not belong to the glyph. Catches scribbles,
 *                           wrong shapes, oversized writing, and writing in the
 *                           wrong part of the box.
 *
 *   missingCoverageRatio  — of the glyph, how much the learner never wrote.
 *                           Catches half-finished characters, missing strokes,
 *                           and undersized writing.
 *
 * Neither alone is sufficient: a learner who draws one dot scores a perfect
 * outside ratio, and one who floods the box scores perfect coverage.
 *
 * **Errors are graded, not binary.** Each pixel is scored by its distance to
 * the other mask: within `glyphToleranceRatio` it costs nothing, and the cost
 * then ramps to full over `toleranceFalloffMultiplier` more. A hard in-band /
 * out-of-band test — which is what a plain dilation gives — makes every attempt
 * inside the band score identically zero, so `score` carries no information and
 * grading jumps off a cliff at the band edge. The ramp keeps the measure
 * monotonic in how wrong the attempt is.
 *
 * **The terms add rather than average.** They quantify disjoint quantities of
 * difference, so a character missing a tenth of its strokes differs from the
 * expected character by a tenth — not by a twentieth. Averaging would let a
 * learner skip a whole jamo and still pass the 10% rule.
 *
 * **A contiguous unwritten piece counts for more than its area.** Mean coverage
 * alone dilutes an omitted stroke against everything the learner did write, so
 * dropping the branch of ㅏ in 가 — about 4% of the glyph, and the difference
 * between 가 and 기 — scored as a rounding error. The largest connected
 * unwritten blob therefore acts as a weighted floor on the coverage term. See
 * `docs/HANDWRITING_EVALUATION.md` for the calibration data behind the
 * constants, and for the limitation this does not solve.
 *
 * Placement inside the box is part of the learning task, so nothing here
 * re-centres or re-scales the learner's ink. Both masks are simply sampled at
 * the same resolution, which normalises away device pixel ratio and canvas size
 * and nothing else.
 */
export function evaluateMasks(
  userMask: Mask,
  referenceMask: Mask,
  config: Partial<EvaluationConfig> = {},
): EvaluationResult {
  const cfg = { ...DEFAULT_EVALUATION_CONFIG, ...config };

  if (userMask.width !== referenceMask.width || userMask.height !== referenceMask.height) {
    throw new Error(
      `mask size mismatch: user ${userMask.width}x${userMask.height}, ` +
        `reference ${referenceMask.width}x${referenceMask.height}`,
    );
  }

  const resolution = userMask.width;
  const toleranceRadiusPx = cfg.glyphToleranceRatio * resolution;
  const falloffPx = Math.max(1e-6, toleranceRadiusPx * cfg.toleranceFalloffMultiplier);

  const userInk = countInk(userMask);
  const referenceInk = countInk(referenceMask);
  const inkRatio = referenceInk === 0 ? 0 : userInk / referenceInk;

  const diagnostics: EvaluationDiagnostics = {
    userInk,
    referenceInk,
    inkRatio,
    resolution,
    toleranceRadiusPx,
    largestGapRatio: 0,
    largestBlotRatio: 0,
    meanMissingRatio: 0,
  };

  // An empty reference means the caller handed us a font that could not render
  // the character. Failing the learner for that would be wrong.
  if (referenceInk === 0) {
    throw new Error('reference glyph mask is empty — the practice font failed to render');
  }

  if (userInk === 0 || inkRatio < cfg.minInkRatio) {
    return {
      passed: false,
      score: 0,
      mismatchRatio: 1,
      outsideStrokeRatio: 1,
      missingCoverageRatio: 1,
      reason: 'empty',
      diagnostics,
    };
  }

  const meanOutside = meanDistancePenalty(userMask, referenceMask, toleranceRadiusPx, falloffPx);
  const meanMissing = meanDistancePenalty(referenceMask, userMask, toleranceRadiusPx, falloffPx);

  // The same argument as the structural gap below, pointed the other way. One
  // contiguous lump of ink outside the glyph's free slack is an extra stroke,
  // not a wobbly line — and on Hangul an extra stroke is usually a different
  // letter, because that is exactly how ㄱ becomes ㅋ and ㅈ becomes ㅊ.
  // Normalised by the reference's ink so the term means "a stroke's worth"
  // whatever the learner drew, which is what makes it comparable to the gap.
  // ...and only for ink that is *thick* as well as far away. A character
  // written a little small and a little low also leaves ink beyond the slack,
  // in one connected piece, and it is not an added stroke at all — it is the
  // right strokes in the wrong place, which the graded mean already measures
  // correctly and gently. What separates them is width: displacement overhang
  // is a rim a few pixels wide along the edge of a stroke, while an added
  // stroke is as thick as the pen that drew it. Eroding first erases the rim
  // and keeps the stroke.
  const largestBlotRatio =
    largestThickComponentSize(
      unwrittenMask(userMask, referenceMask, toleranceRadiusPx * cfg.blotReachMultiplier),
      toleranceRadiusPx * cfg.blotErosionRatio,
    ) / referenceInk;
  const outsideStrokeRatio = clamp01(
    cfg.useStructuralGap
      ? Math.max(meanOutside, largestBlotRatio * cfg.structuralBlotWeight)
      : meanOutside,
  );

  // A single unwritten piece of the glyph counts at least at its own size,
  // however small a share of the total it is. Averaging alone lets a learner
  // omit a short stroke — writing 가 as ㄱㅣ — and still clear the 10% bar,
  // because the omission is diluted by everything they did write. A missing
  // stroke is a different character, not a small error.
  // Measured at the free-slack reach, not out to the end of the falloff: ink in
  // the falloff zone was approached and got partial credit above, whereas ink
  // beyond the slack the learner never went near is simply not written.
  const largestGapRatio =
    largestComponentSize(unwrittenMask(referenceMask, userMask, toleranceRadiusPx)) / referenceInk;
  const missingCoverageRatio = clamp01(
    cfg.useStructuralGap
      ? Math.max(meanMissing, largestGapRatio * cfg.structuralGapWeight)
      : meanMissing,
  );

  diagnostics.largestGapRatio = largestGapRatio;
  diagnostics.largestBlotRatio = largestBlotRatio;
  diagnostics.meanMissingRatio = meanMissing;

  const mismatchRatio = clamp01(
    cfg.outsideWeight * outsideStrokeRatio + cfg.missingWeight * missingCoverageRatio,
  );
  const passed = mismatchRatio <= cfg.maxMismatchRatio;

  return {
    passed,
    score: clamp01(1 - mismatchRatio),
    mismatchRatio,
    outsideStrokeRatio,
    missingCoverageRatio,
    // Classified on the unamplified coverage, so the reason reflects which
    // mistake the learner actually made rather than the structural weighting.
    reason: passed ? null : classify(outsideStrokeRatio, meanMissing),
    diagnostics,
  };
}

/**
 * Mean penalty over `subject`'s ink, where each pixel is charged by how far it
 * lies from the nearest ink in `target`: free within `tolerancePx`, ramping to
 * a full unit of error over the following `falloffPx`.
 */
function meanDistancePenalty(
  subject: Mask,
  target: Mask,
  tolerancePx: number,
  falloffPx: number,
): number {
  const dist2 = squaredDistanceTransform(target);
  let total = 0;
  let count = 0;
  for (let i = 0; i < subject.data.length; i += 1) {
    if (!subject.data[i]) continue;
    count += 1;
    const d = Math.sqrt(dist2[i]!);
    if (d <= tolerancePx) continue;
    total += Math.min(1, (d - tolerancePx) / falloffPx);
  }
  return count === 0 ? 0 : total / count;
}

/** Reference ink the learner did not come within `reachPx` of — fully unwritten. */
function unwrittenMask(referenceMask: Mask, userMask: Mask, reachPx: number): Mask {
  const dist2 = squaredDistanceTransform(userMask);
  const out = createMask(referenceMask.width, referenceMask.height);
  const reach2 = reachPx * reachPx;
  for (let i = 0; i < referenceMask.data.length; i += 1) {
    out.data[i] = referenceMask.data[i] && dist2[i]! > reach2 ? 1 : 0;
  }
  return out;
}

/**
 * Convenience wrapper: rasterises normalised strokes, then evaluates. The
 * reference mask still has to come from the platform's glyph rasteriser,
 * because only it knows the learner's selected typeface.
 */
export function evaluateStrokes(
  strokes: readonly Stroke[],
  referenceMask: Mask,
  config: Partial<EvaluationConfig> = {},
): EvaluationResult {
  const cfg = { ...DEFAULT_EVALUATION_CONFIG, ...config };
  const userMask = rasterizeStrokes(strokes, referenceMask.width || cfg.resolution);
  return evaluateMasks(userMask, referenceMask, cfg);
}

/** Picks the dominant error so the UI can say something specific. */
function classify(outside: number, missing: number): FailureReason {
  const ratio = missing === 0 ? Number.POSITIVE_INFINITY : outside / missing;
  if (ratio > 1.6) return 'outside';
  if (ratio < 0.625) return 'incomplete';
  return 'mixed';
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
