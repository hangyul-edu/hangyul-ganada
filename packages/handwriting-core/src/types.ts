/** A single sampled pointer position, in writing-box coordinates. */
export interface Point {
  /** 0..1, left to right across the writing box. */
  x: number;
  /** 0..1, top to bottom across the writing box. */
  y: number;
  /** Optional pointer pressure, 0..1. Reserved; not yet used by the evaluator. */
  pressure?: number;
}

/**
 * One continuous pen-down..pen-up gesture. Coordinates are normalised to the
 * writing box so a stroke recorded on a 320 px phone canvas and one recorded on
 * a 600 px desktop canvas evaluate identically.
 */
export interface Stroke {
  points: Point[];
  /** Pen width as a fraction of the writing-box edge. */
  width: number;
}

/**
 * A binary ink mask. `data[y * width + x]` is 1 where there is ink, 0 where
 * there is not. Square in practice, but width/height are carried explicitly.
 */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Detailed outcome of comparing a learner's drawing against a reference glyph. */
export interface EvaluationResult {
  /** `mismatchRatio <= maxMismatchRatio`. */
  passed: boolean;
  /** `1 - mismatchRatio`, clamped to 0..1. Presentation-friendly. */
  score: number;
  /** Combined, weighted mismatch. 0 is a perfect trace, 1 is unrelated. */
  mismatchRatio: number;
  /** Fraction of the learner's ink that fell outside the tolerance band. */
  outsideStrokeRatio: number;
  /** Fraction of the reference glyph the learner never covered. */
  missingCoverageRatio: number;
  /** Why it failed, for feedback copy. `null` when passed. */
  reason: FailureReason | null;
  /** Non-fatal diagnostics, useful for tuning and for the debug overlay. */
  diagnostics: EvaluationDiagnostics;
}

export type FailureReason =
  /** Nothing, or almost nothing, was drawn. */
  | 'empty'
  /** Ink is largely off the glyph — wrong shape, wrong place, or scribble. */
  | 'outside'
  /** Parts of the glyph were never written. */
  | 'incomplete'
  /** Both error terms contributed roughly equally. */
  | 'mixed'
  /**
   * The right ink, laid down the wrong way: a zigzag, a scrubbed-over shape, a
   * looping detour. Only reachable when the ink comparison was satisfied — see
   * `path.ts` for why that is possible and why it needs its own verdict.
   */
  | 'scribble';

export interface EvaluationDiagnostics {
  /** Ink pixel count in the learner's mask. */
  userInk: number;
  /** Ink pixel count in the reference mask. */
  referenceInk: number;
  /** `userInk / referenceInk`. ~1 is a well-proportioned attempt. */
  inkRatio: number;
  /** Resolution the comparison ran at. */
  resolution: number;
  /** Tolerance band radius in mask pixels. */
  toleranceRadiusPx: number;
  /**
   * Largest single unwritten piece of the reference glyph, as a fraction of it.
   * High means a whole stroke was skipped rather than the pen running thin.
   */
  largestGapRatio: number;
  /**
   * The biggest single piece of learner ink that lies outside the glyph's free
   * slack, as a fraction of the reference's ink. A whole extra stroke.
   */
  largestBlotRatio: number;
  /** The ungated mean coverage penalty, before any structural floor. */
  meanMissingRatio: number;
  /**
   * How the pen moved. Absent when the caller evaluated masks directly, which
   * has no path to measure.
   */
  path?: PathMetrics;
}

/** Tunable evaluation parameters. See `config.ts` for the defaults and rationale. */
export interface EvaluationConfig {
  /** Fail above this combined mismatch. The product rule is 0.10. */
  maxMismatchRatio: number;
  /**
   * Radius of the tolerance band grown around the reference glyph, as a
   * fraction of the writing-box edge. Independent of `maxMismatchRatio`.
   */
  glyphToleranceRatio: number;
  /**
   * Beyond the tolerance radius, error ramps to full over this multiple of it.
   * Keeps grading continuous instead of a step at the band edge.
   */
  toleranceFalloffMultiplier: number;
  /** Whether the largest structural gap acts as a floor on missing coverage. */
  useStructuralGap: boolean;
  /** How much more a contiguous unwritten piece counts than its bare area. */
  structuralGapWeight: number;
  /**
   * How much more a contiguous piece of ink that is nowhere near the glyph
   * counts than its bare area. The mirror of `structuralGapWeight`.
   */
  structuralBlotWeight: number;
  /**
   * How far stray ink is eroded, as a multiple of the tolerance radius, before
   * the largest remaining piece counts as an added stroke. Erases the thin rim
   * a displaced character leaves and keeps a stroke.
   */
  blotErosionRatio: number;
  /**
   * How far from the glyph ink must be, as a multiple of the tolerance radius,
   * before it can count as an added stroke at all.
   */
  blotReachMultiplier: number;
  /**
   * How far an *unwritten* piece is eroded, as a multiple of the tolerance
   * radius, before the largest remaining piece counts as a missing stroke.
   * The mirror of `blotErosionRatio`: erases the rim the pen cannot reach along
   * the edge of a thick reference stroke, and keeps a whole absent stroke.
   */
  gapErosionRatio: number;
  /** Weight of the outside-stroke term. */
  outsideWeight: number;
  /** Weight of the missing-coverage term. */
  missingWeight: number;
  /** Below this fraction of the reference ink, the attempt counts as empty. */
  minInkRatio: number;
  /**
   * Fail above this much pen travel, as a multiple of the reference glyph's own
   * skeleton length. Catches what an ink comparison structurally cannot.
   */
  maxPathLengthRatio: number;
  /** Fail above this many pen reversals per unit of reference skeleton length. */
  maxReversalDensity: number;
  /** Mask edge length used for the comparison. */
  resolution: number;
}

/**
 * How the pen moved, measured against how long the letter is.
 *
 * The mask comparison sees ink and cannot see the path that laid it down; these
 * are the numbers that can. See `path.ts` for what each one catches and why one
 * of them would not be enough.
 */
export interface PathMetrics {
  /** Total pen travel, in box units, after noise resampling. */
  pathLength: number;
  /** The reference glyph's own skeleton length, in box units. The yardstick. */
  referenceSkeletonLength: number;
  /** `pathLength / referenceSkeletonLength`. ~1 is an honest single pass. */
  lengthRatio: number;
  /** How many times the pen turned back on itself by more than 120°. */
  reversals: number;
  /** `reversals / referenceSkeletonLength`. Reversals per letter-length. */
  reversalDensity: number;
}
