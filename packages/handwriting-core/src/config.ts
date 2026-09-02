import type { EvaluationConfig } from './types.js';

/**
 * The product rule: an attempt that differs from the expected character by more
 * than 10% is incorrect. This is the *final combined mismatch* threshold, not a
 * geometric tolerance — see `GLYPH_TOLERANCE_RATIO` for that.
 */
export const MAX_MISMATCH_RATIO = 0.1;

/**
 * Free-slack radius around the reference glyph, as a fraction of the
 * writing-box edge. This is what buys natural handwriting variation: at the
 * default 128 px comparison resolution, 0.04 is ~5.1 px of slack in every
 * direction, on top of the glyph's own stroke thickness.
 *
 * Deliberately separate from MAX_MISMATCH_RATIO so the two can be tuned
 * independently — widening tolerance and loosening the pass bar are different
 * product decisions.
 *
 * ## Why 0.04 and not the 0.035 this shipped with
 *
 * The learner's pen has one width, 0.062 of the box, whatever typeface is
 * selected — while the reference glyph's stroke width is whatever its designer
 * chose. Across the six bundled faces that ranges from about half the pen to
 * about one and a half times it. The original 0.035 was measured against a
 * single face whose weight happened to sit near the pen's, and against
 * attempts built by nudging that face's own outline; it did not have to answer
 * for the difference.
 *
 * `font-tolerance.test.ts` does answer for it: it rewrites each face's glyphs
 * with the learner's actual pen and then perturbs them. At 0.035 that produced
 * false failures — a correctly written 이, 8% small and 2 px off, scored 0.135
 * against a 0.10 pass mark. At 0.04 the worst honest attempt across all six
 * faces scores 0.074 and the *best* wrong character scores 0.114, so the pass
 * mark sits between them with room on both sides. Going further does not help:
 * by 0.048 a wrong character scores 0.065 and would pass.
 *
 * One number for every face, because the measurement said one number works.
 * `AttemptInput.config` is there for the face that ever needs its own.
 */
export const GLYPH_TOLERANCE_RATIO = 0.04;

/**
 * Beyond the free slack, error ramps to full over this multiple of the
 * tolerance radius. Without a ramp every attempt inside the band scores exactly
 * zero, which makes `score` meaningless and turns grading into a cliff at the
 * band edge.
 */
export const TOLERANCE_FALLOFF_MULTIPLIER = 1.5;

/** Whether the largest unwritten piece acts as a floor on the coverage term. */
export const USE_STRUCTURAL_GAP = true;

/**
 * A contiguous unwritten piece counts this much more than its bare area. An
 * absent structural feature — a whole stroke or jamo — is a categorically worse
 * mistake than the same amount of ink missing uniformly because the pen ran
 * thin: it changes which character was written. Without this, omitting the
 * branch of ㅏ in 가 (about 4% of the glyph's area, and the difference between
 * 가 and 기) scores as a rounding error.
 */
export const STRUCTURAL_GAP_WEIGHT = 2.5;

/**
 * The mirror of `STRUCTURAL_GAP_WEIGHT`, for ink that should not be there.
 *
 * ## Why the outside term needed one too
 *
 * The adversarial corpus (`__tests__/robustness.ts`) measured what the
 * evaluator actually accepts, and every impostor it let through was the same
 * shape of mistake: a letter that is another letter **plus one stroke**. ㅎ was
 * accepted for ㅇ, ㅋ for ㄱ, ㅂ for ㅁ, ㅊ for ㅈ, ㅒ for ㅐ.
 *
 * The reason is a direct consequence of the tolerance band. That band has to be
 * wide enough for a wobbly finger — about 5 px of free slack at 128 — and an
 * extra stroke on a Hangul letter is drawn *close to* the rest of the letter,
 * because that is where the letters put their strokes. The bar across ㅋ sits
 * inside ㄱ's slack. Averaged over all the learner's ink, a whole extra stroke
 * therefore cost about 0.02 against a 0.10 bar, and the grader could not tell
 * ㄱ from ㅋ.
 *
 * So the outside term gets the same treatment the missing term already had: a
 * *contiguous* piece of ink that lies beyond the free slack counts several
 * times its bare area, because it is not a wobble — it is a stroke, and a
 * stroke is a different character.
 *
 * ## How 2.25, and 4 for the gap, were chosen
 *
 * By sweeping both against the whole corpus — 2,880 attempts across six faces —
 * and reading the surface, not by picking a number that made one case behave.
 * The two weights trade against each other: harsher on extra ink also fails
 * honest attempts that overshoot a corner, harsher on missing ink also fails
 * ones written a little small.
 *
 * ```
 * blot  gap   FAR     FRR    worst face
 * 1.75  3.5   0.76%   0.94%   2.50%
 * 2.25  4.0   0.48%   1.42%   3.33%   <- chosen
 * 2.5   4.5   0.41%   1.84%   3.96%
 * 4.0   4.0   0.34%   1.98%   7.71%
 * ```
 *
 * The chosen pair is where false acceptance stops improving cheaply: going
 * further buys 0.07 points of FAR and costs more than twice as much FRR on the
 * worst face. The gap weight moved from 2.5 to 4 in the same sweep, which is
 * the first time it has been measured against anything other than one
 * hand-built case.
 */
export const STRUCTURAL_BLOT_WEIGHT = 2;

/**
 * How much stray ink is eroded before it counts as an added stroke, as a
 * multiple of the tolerance radius.
 *
 * At the default 0.04 tolerance and 128 px this is about 2.6 px of erosion,
 * which is a little under half the learner's pen. The overhang a displaced
 * character leaves is a rim narrower than the displacement itself — two or
 * three pixels — and disappears; the bar across ㅋ is a full pen wide and keeps
 * a core.
 */
export const BLOT_EROSION_RATIO = 0.5;

export const BLOT_REACH_MULTIPLIER = 1;

/**
 * The same erosion, applied to the *unwritten* term. The mirror of
 * `BLOT_EROSION_RATIO`, and the piece that was missing.
 *
 * ## What it fixes
 *
 * The learner's pen is one fixed width. The reference glyph's stroke is
 * whatever the face draws at whatever size the glyph is fitted to, and once
 * `fitGlyph` began sizing glyphs by their **ink** rather than by their em, the
 * compact letters — ㄱ, ㅅ, ㅣ — grew enough that their strokes became wider
 * than the pen. A learner who traces such a stroke perfectly still leaves a rim
 * of reference ink uncovered along both of its edges, because there is no way
 * to cover it: the pen is narrower than the target.
 *
 * That rim is thin, but it is *connected* — it runs the length of every stroke
 * in the letter and joins up at the corners — so `largestComponentSize` saw one
 * enormous unwritten piece and `structuralGapWeight` multiplied it by four.
 * Measured: false rejection went from 0.21% to 3.26% overall and 10.42% on
 * Pretendard, the default face, entirely from this.
 *
 * The blot term had already solved the identical problem pointed the other way
 * — "a rim is displacement, a thick piece is a stroke" — and this is that
 * argument mirrored. A missing *stroke* is as thick as a stroke. A rim along
 * the edge of one is the pen being narrower than the paint, which is not a
 * mistake the learner made and not one they can fix.
 *
 * ## How 0.75 was chosen
 *
 * By sweeping it against the whole corpus — 2,880 genuine attempts and 2,172
 * wrong ones across six faces — jointly with `MAX_FIT_SCALE`, because the two
 * are the same trade seen from opposite ends: a larger fit makes the reference
 * stroke wider than the pen, and erosion is what forgives the rim that leaves.
 *
 * At the shipped fit of 1.3:
 *
 * ```
 * gapErosion   FRR      FAR     worst-face FRR
 * 0.00        3.26%    0.23%    10.42%
 * 0.25        3.02%    0.23%    10.21%
 * 0.50        1.01%    0.28%     3.54%
 * 0.75        0.28%    0.28%     1.04%   <- chosen
 * 1.00        0.00%    0.46%     0.00%
 * 1.25        0.00%    0.46%     0.00%
 * ```
 *
 * For reference, the product before the glyph was fitted at all measured 0.21%
 * / 0.78%. So 0.75 holds false rejection where it was and **more than halves**
 * false acceptance, with the glyph now correctly sized and centred.
 *
 * ## Why not 1.0, which reads better on both columns
 *
 * Because the corpus is not the only evidence and it does not measure this:
 * erosion by 1.0 is about 5.1 px, and a stroke drawn with the 7.9 px pen has a
 * radius of 3.9 px, so a *whole missing stroke* is eroded away to nothing and
 * stops being seen as a structural gap at all. `real-glyphs.test.ts` — which
 * holds the hand-built "가 written as ㄱㅣ" cases — fails four of its
 * assertions at 1.0 and none at 0.75. A grader that cannot notice an absent
 * stroke has a low false-acceptance rate on this corpus and is wrong about the
 * thing the term exists for.
 *
 * 0.75 is about 3.8 px, which still leaves a core on a pen-width stroke. That
 * is the constraint; the corpus picked the value inside it.
 */
/**
 * ## Recalibrated when the reference became the canonical geometry
 *
 * This constant was measured while the guide and the grading mask were *set in
 * the practice typeface*. Its whole job was to forgive the rim a too-wide font
 * stroke leaves along a correctly traced one: a font stem can be half again the
 * learner's fixed 0.062 pen, and the uncovered rim is connected and letter-long,
 * so the structural-gap term read it as one enormous missing piece.
 *
 * Since `usesCanonicalGeometry` the reference is a constant-width pen of about
 * 0.065 of the box — near enough the learner's own that the rim it was written
 * for barely exists. What is left is the cost nobody had to weigh before: an
 * erosion wide enough to eat a rim is also wide enough to eat a *missing thin
 * stroke*, and at the inherited 0.75 it did. A 사 written with no right leg to
 * its ㅅ — 14.6% of the glyph's ink, gone — passed.
 *
 * Swept against both signals at once, because either one alone picks a wrong
 * answer:
 *
 * ```
 * erosion   FRR     FAR    real-glyphs structural suite
 * 0.45     6.08%   0.00%   14/14
 * 0.60     2.43%   0.00%   14/14
 * 0.65     1.84%   0.00%   14/14
 * 0.68     0.94%   0.00%   14/14   <- chosen
 * 0.71     0.94%   0.00%   13/14   accepts 사 with no right leg
 * 0.75     0.94%   0.00%   13/14   the inherited value
 * ```
 *
 * 0.68 is the last value that still fails a missing stroke. Against the
 * configuration this replaced — 0.28% FRR, 0.276% FAR, measured against font
 * references — false *acceptance* is now zero and false rejection is higher.
 * That is a deliberate trade and not a free win: the rejections are
 * concentrated in the "stopped short" and "written small" fixtures, where a
 * uniform pen with butt caps has none of the slack a font's tapered terminals
 * gave. Reducing it is live work; see `docs/HANDWRITING_EVALUATION.md`.
 */
export const GAP_EROSION_RATIO = 0.68;

/** Edge length of the masks the comparison runs on. */
export const COMPARISON_RESOLUTION = 128;

/**
 * Both terms carry full weight, because they measure disjoint quantities of
 * difference: ink that should not be there, and glyph that was never written.
 * Averaging them would mean a character missing 14% of its strokes scores as 7%
 * different, and would let a learner skip an entire jamo and still pass.
 */
export const OUTSIDE_WEIGHT = 1;
export const MISSING_WEIGHT = 1;

/**
 * An attempt with less than 8% of the reference glyph's ink is treated as
 * nothing having been drawn, rather than as a very bad attempt — the feedback
 * copy differs.
 */
export const MIN_INK_RATIO = 0.08;

/**
 * How far the pen may travel, as a multiple of the letter's own length.
 *
 * The second gate, and the one the mask comparison cannot be: ink is a set of
 * pixels and a pixel does not record how many times the pen crossed it. Traced
 * along ㅏ, a sine wave of amplitude 0.04 and period 0.04 scores a mismatch of
 * **exactly 0.000** — every pixel of it lands inside the tolerance band a
 * wobbly beginner hand needs. Narrowing the band cannot fix that, because the
 * amplitude of the scribble and the amplitude of honest jitter are the same
 * number. See `path.ts`.
 *
 * ## Why 2.5
 *
 * Measured over the whole adversarial corpus — six faces, forty-five
 * characters, twelve perturbations, 3,240 honest attempts. Every genuine
 * attempt that the mask comparison accepts lands at or below **1.67**, and the
 * worst of those is simply a letter written 10% large, which lengthens the pen
 * path in exact proportion. The cheapest deliberate scribble that the mask
 * comparison lets through starts at **1.79**.
 *
 * 2.5 sits 50% above the honest maximum rather than halfway between the two
 * populations, and that asymmetry is the point: failing a learner who is
 * writing correctly is the expensive mistake, and the band immediately above
 * 1.67 is where a genuinely shaky hand lives. What is given up is the mildest
 * scribble — a wave of half the tolerance band's amplitude, which is a wobbly
 * line by any fair reading and which §12 of the product rules says to accept.
 */
export const MAX_PATH_LENGTH_RATIO = 2.5;

/**
 * How often the pen may turn back on itself, per unit of letter length.
 *
 * The companion gate. Length alone passes a slow, tight back-and-forth that
 * never gets long; reversals alone pass one enormous looping detour that never
 * turns back. Between them there is no way to lay down the right ink while
 * moving like a scribble.
 *
 * Over the same corpus, the most an honest attempt reverses is **1.5** per
 * letter length — a single hairpin, and it comes from ㅉ in Gaegu, a
 * handwriting face whose strokes genuinely double back. Scribbles that clear
 * the length gate run from 3.8 to 55. Set at 6, four times the honest
 * maximum, for the same reason the length gate is set high.
 */
export const MAX_REVERSAL_DENSITY = 6;

export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  maxMismatchRatio: MAX_MISMATCH_RATIO,
  glyphToleranceRatio: GLYPH_TOLERANCE_RATIO,
  toleranceFalloffMultiplier: TOLERANCE_FALLOFF_MULTIPLIER,
  useStructuralGap: USE_STRUCTURAL_GAP,
  structuralGapWeight: STRUCTURAL_GAP_WEIGHT,
  structuralBlotWeight: STRUCTURAL_BLOT_WEIGHT,
  blotErosionRatio: BLOT_EROSION_RATIO,
  blotReachMultiplier: BLOT_REACH_MULTIPLIER,
  gapErosionRatio: GAP_EROSION_RATIO,
  outsideWeight: OUTSIDE_WEIGHT,
  missingWeight: MISSING_WEIGHT,
  minInkRatio: MIN_INK_RATIO,
  maxPathLengthRatio: MAX_PATH_LENGTH_RATIO,
  maxReversalDensity: MAX_REVERSAL_DENSITY,
  resolution: COMPARISON_RESOLUTION,
};

/**
 * How much of the reference glyph the learner can see, by step.
 *
 * Guidance, never grading. The pass bar is the same 10% at both levels, so a
 * "correct" always means the same thing and the only variable is how much help
 * was on the screen when it was earned.
 *
 * ```
 * trace      ██████████   0.32  the shape, plainly. Follow the line.
 * practice   ████░░░░░░   0.15  much lighter, and still enough to write by
 * ```
 *
 * There used to be a third level at zero — a blank box, from memory. It is
 * gone. A beginner three minutes into their first Korean letter cannot recall a
 * shape they have never once recalled, and the step did not teach them to: it
 * simply moved the moment of failure. Handwriting is learned by writing the
 * letter correctly many times, not by being examined on it, so every practice
 * step now keeps a reference on the paper.
 *
 * 0.15 is the value the second step needs and the old assist level (0.11) did
 * not have. 0.11 was designed to be too faint to copy, because something
 * stricter came after it; now that this *is* the last step, it has to be enough
 * to write by on a phone at half brightness while still being obviously lighter
 * than the tracing guide.
 */
export const TRACE_GLYPH_OPACITY = 0.32;
export const PRACTICE_GLYPH_OPACITY = 0.15;
