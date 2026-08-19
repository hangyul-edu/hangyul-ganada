import { countInk, createMask, squaredDistanceTransform } from './mask.js';
import type { Mask, PathMetrics, Point, Stroke } from './types.js';

/**
 * How the pen moved, as opposed to where the ink landed.
 *
 * ## The gap this closes
 *
 * `evaluate.ts` compares two ink masks. That is the right primary measure and
 * it has one blind spot, which is total: **it cannot see the path**. Ink is a
 * set of pixels, and a pixel does not record how many times the pen crossed it.
 *
 * The consequence is not theoretical. Traced along ㅏ, a sine wave of amplitude
 * 0.04 and period 0.04 — a violent scribble, four times the pen path of an
 * honest attempt — scores a **mismatch of exactly 0.000**, because every pixel
 * of it lands inside the tolerance band that a wobbly beginner hand needs. The
 * band cannot be narrowed to exclude it: the amplitude of the scribble and the
 * amplitude of honest hand jitter are the same number. That is why this is a
 * second measure and not a tightening of the first.
 *
 * ## What is measured, and why these two
 *
 * | Metric | Question | The mistake it catches |
 * | --- | --- | --- |
 * | `lengthRatio` | how much further did the pen travel than the letter is long? | zigzags, repeated S-curves, over-tracing, wandering detours |
 * | `reversalDensity` | how often did the pen turn back on itself? | scribbling back and forth, random loops, shading |
 *
 * Both are ratios against the *reference glyph's own* skeleton length, so they
 * mean the same thing for ㅣ and for 뷁 and do not need a per-character table.
 *
 * ## Why this cannot be one number
 *
 * Length alone passes a slow, tight back-and-forth that never gets long.
 * Reversals alone pass a single enormous looping detour that never turns back.
 * Each is cheap, and between them there is no way to lay down the right ink
 * while moving like a scribble.
 *
 * ## Forgiveness is designed in, not traded off
 *
 * Everything here is deliberately blind to the things a beginner actually does
 * wrong, because none of them changes how far the pen travelled:
 *
 * * **hand jitter** — filtered before measurement by resampling at
 *   `NOISE_STEP`, which is far below any deliberate stroke feature and far
 *   above pointer noise. Synthetic jitter at the amplitude a real finger
 *   produces moves `lengthRatio` by about 2%.
 * * **curved straight strokes, imperfect proportions, slight overshoot,
 *   a stroke drawn short or long** — all of them are still one pen-stroke of
 *   about the right length, and all of them score near 1.
 * * **stroke count and stroke order** — not looked at here at all. A learner
 *   who draws ㄱ as two strokes instead of one has not scribbled, and stroke
 *   order is reported separately as a note rather than folded into a verdict.
 *
 * The thresholds live in `config.ts` and are set from the measured separation
 * between the two populations rather than from taste.
 */

/**
 * Arc-length step the path is resampled to before anything is measured, as a
 * fraction of the writing box.
 *
 * The one number that decides what counts as noise. Pointer sensors emit
 * sub-pixel jitter at a very high rate; a deliberate stroke feature — the
 * shortest thing a person draws on purpose — is an order of magnitude larger.
 * At 0.006 of a box, roughly 2 px on a 320 px canvas, the first is smoothed
 * away and the second is untouched: the tightest scribble measured here has a
 * half-period of 0.02, which is still three samples wide after resampling.
 */
const NOISE_STEP = 0.006;

/**
 * Width of the moving average applied after resampling, in box units.
 *
 * Resampling alone is not a filter — it re-cuts a path into even steps and
 * keeps every wiggle. This is the part that removes tremor, and the width is
 * the whole design:
 *
 * A box filter of width `W` multiplies a wiggle of wavelength `λ` by
 * `sinc(W/λ)`, which is **zero** when `W = λ` and still 0.76 at `λ = 2.5 W`.
 * So a window sized to the wavelength of hand tremor annihilates tremor and
 * barely touches a deliberate scribble, because the two are an order of
 * magnitude apart in wavelength:
 *
 * ```
 * hand tremor          λ ≈ 0.016   ── gain 0.00, gone
 * tightest scribble    λ ≈ 0.040   ── gain 0.76, kept
 * loosest scribble     λ ≈ 0.060   ── gain 0.87, kept
 * a real stroke        λ ≈ 1.0     ── gain 1.00, untouched
 * ```
 *
 * 0.016 of a box is ~5 px on a 320 px canvas. It is set at the tremor end of
 * that gap rather than in the middle on purpose: the cost of being too narrow
 * is failing a learner whose hand shakes, and the cost of being too wide is
 * letting through a scribble that the *mask* comparison will also have to miss
 * before anything goes wrong. Only one of those two is a mistake this product
 * is willing to make.
 */
const SMOOTHING_SPAN = 0.016;

/** Turn sharper than this counts as the pen going back on itself. 120°. */
const REVERSAL_ANGLE = (120 * Math.PI) / 180;

/**
 * Window over which a reversal is judged, as a fraction of the box.
 *
 * A reversal is a change of heading between where the pen was coming from and
 * where it goes next, and both have to be measured over enough distance to be
 * a heading rather than a sample. Half the pen's own width is the scale at
 * which a person is steering rather than wobbling.
 */
const HEADING_SPAN = 0.03;

/** Total pen travel over a polyline, in box units. */
export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return total;
}

/**
 * A polyline re-cut into even steps of `step`.
 *
 * Uniform in arc length rather than in time, which is what makes every measure
 * downstream independent of how fast the learner drew and of what rate their
 * device sampled at. A stroke shorter than one step survives as its endpoints;
 * dropping it would silently un-draw the dot of a short tick.
 */
export function resamplePath(points: readonly Point[], step: number): Point[] {
  if (points.length < 2) return points.slice();
  const out: Point[] = [points[0]!];
  let carry = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (segment === 0) continue;
    let travelled = step - carry;
    while (travelled <= segment) {
      const t = travelled / segment;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      travelled += step;
    }
    carry = segment - (travelled - step);
  }
  const last = points[points.length - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > step / 2) out.push(last);
  return out;
}

/**
 * A moving average over `window` samples, applied to an evenly-cut polyline.
 *
 * Endpoints are averaged over whatever part of the window exists, so a stroke
 * is not shortened at its ends — which would read as "stopped short", a
 * *different* mistake that the mask comparison is already responsible for.
 */
export function smoothPath(points: readonly Point[], window: number): Point[] {
  const half = Math.floor(Math.max(1, window) / 2);
  if (half < 1 || points.length < 3) return points.slice();
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const from = Math.max(0, i - half);
    const to = Math.min(points.length - 1, i + half);
    let x = 0;
    let y = 0;
    for (let k = from; k <= to; k += 1) {
      x += points[k]!.x;
      y += points[k]!.y;
    }
    const n = to - from + 1;
    out.push({ x: x / n, y: y / n });
  }
  return out;
}

/**
 * How far the pen travelled and how often it doubled back.
 *
 * `referenceSkeletonLength` is the length of the letter itself — see
 * `skeletonLengthOf`. Passing it in rather than deriving it here keeps this
 * function pure over its arguments and lets the caller reuse one measurement
 * of a reference mask across many attempts.
 */
export function pathMetrics(
  strokes: readonly Stroke[],
  referenceSkeletonLength: number,
): PathMetrics {
  let length = 0;
  let reversals = 0;

  for (const stroke of strokes) {
    const points = smoothPath(resamplePath(stroke.points, NOISE_STEP), SMOOTHING_SPAN / NOISE_STEP);
    length += pathLength(points);
    reversals += countReversals(points);
  }

  // A reference with no measurable skeleton is a caller error, not a learner
  // one: report ratios of zero rather than infinities, and let the mask
  // comparison — which raises on an empty reference — be the thing that speaks.
  const denominator = referenceSkeletonLength > 0 ? referenceSkeletonLength : 0;
  return {
    pathLength: length,
    referenceSkeletonLength: denominator,
    lengthRatio: denominator > 0 ? length / denominator : 0,
    reversals,
    reversalDensity: denominator > 0 ? reversals / denominator : 0,
  };
}

/**
 * Times the pen turned back on itself along one stroke.
 *
 * Counted on headings measured over `HEADING_SPAN`, not between consecutive
 * samples: at a 0.006 step two neighbouring segments can point anywhere at all
 * on a shaky hand, and counting those would make every honest attempt look like
 * a scribble. Consecutive reversals are collapsed onto their sharpest sample,
 * so one hairpin is one reversal however many samples it spans.
 */
function countReversals(points: readonly Point[]): number {
  const span = Math.max(1, Math.round(HEADING_SPAN / NOISE_STEP));
  if (points.length < span * 2 + 1) return 0;

  let count = 0;
  let inTurn = false;
  for (let i = span; i + span < points.length; i += 1) {
    const back = points[i - span]!;
    const here = points[i]!;
    const ahead = points[i + span]!;
    const inX = here.x - back.x;
    const inY = here.y - back.y;
    const outX = ahead.x - here.x;
    const outY = ahead.y - here.y;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    // A heading needs movement. A stroke that pauses is not a stroke that turns.
    if (inLen < NOISE_STEP || outLen < NOISE_STEP) {
      inTurn = false;
      continue;
    }
    const cos = (inX * outX + inY * outY) / (inLen * outLen);
    const turn = Math.acos(Math.min(1, Math.max(-1, cos)));
    if (turn >= REVERSAL_ANGLE) {
      if (!inTurn) count += 1;
      inTurn = true;
    } else {
      inTurn = false;
    }
  }
  return count;
}

/**
 * The length of the letter itself, read off its printed form.
 *
 * A glyph is a thick shape and its skeleton is the thin line down the middle of
 * it; the two are related by the stroke width, so
 *
 * ```
 * skeleton length  ≈  ink area ÷ stroke thickness
 * ```
 *
 * and the whole problem is measuring the thickness of a shape that has corners,
 * junctions and tapers. It is taken from the distance transform: for a long
 * rectangle of width `w`, the mean distance from an interior pixel to the
 * outside is `w / 4`, so `4 × mean` recovers the width. Junctions and stroke
 * ends bias it, but they bias it the same way for every attempt at the same
 * character, and what is wanted here is a stable yardstick rather than an exact
 * measurement of a font.
 *
 * Measured from the *reference*, never from the learner: a yardstick derived
 * from the thing being measured would stretch to fit whatever it was handed,
 * which is exactly how a scribble comes to look normal.
 */
export function skeletonLengthOf(reference: Mask): number {
  const ink = countInk(reference);
  if (ink === 0) return 0;

  // Distance from each ink pixel to the nearest background pixel. The transform
  // measures distance *to* ink, so it is run on the inverse.
  const inverse = createMask(reference.width, reference.height);
  for (let i = 0; i < reference.data.length; i += 1) {
    inverse.data[i] = reference.data[i] ? 0 : 1;
  }
  const dist2 = squaredDistanceTransform(inverse);

  let total = 0;
  for (let i = 0; i < reference.data.length; i += 1) {
    if (reference.data[i]) total += Math.sqrt(dist2[i]!);
  }
  const meanDepth = total / ink;
  const thickness = 4 * meanDepth;
  if (thickness <= 0) return 0;

  // Back into box units: the mask is `width` pixels across one box.
  return ink / thickness / reference.width;
}
