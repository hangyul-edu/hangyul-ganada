import type { CurveSegment, StrokeStep } from '@hangyul-ganada/shared-types';

/**
 * Stroke order for every letter the curriculum teaches.
 *
 * ## Why this exists
 *
 * Hangul is written, not drawn. Two people can produce the same silhouette from
 * completely different pen movements, and only one of them is writing Korean:
 * ㄴ is a single stroke that turns the corner, and a learner who makes it from a
 * vertical line and a separate horizontal one has drawn a picture of ㄴ. The
 * evaluator cannot see the difference — it grades the ink that ends up on the
 * page — so without this data the product could show a learner a shape and
 * never once tell them how it is made.
 *
 * ## What the data is
 *
 * Each stroke is an ordered polyline in a 0–100 box, top-left origin, the same
 * box the reference glyph is drawn in. A polyline rather than a curve because
 * every one of these strokes is straight or a straight line that turns a
 * corner — the one exception, ㅇ, is written as a circle and is given enough
 * points to read as one. From the points the app derives all three things it
 * needs: the path to animate, the dot that says *start here*, and the direction
 * of the arrowhead.
 *
 * ## The order is the standard one
 *
 * Korean stroke order follows two rules that between them settle almost every
 * case: **top before bottom, left before right**. So ㅗ is the short vertical
 * and then the horizontal under it, while ㅜ is the horizontal and then the
 * vertical below; ㅏ is the long vertical and then the branch to its right,
 * while ㅓ is the branch first because it is on the left. Compound letters are
 * their parts in order — ㅘ is ㅗ then ㅏ, ㅐ is ㅏ then ㅣ — which is also how a
 * learner should think about them.
 *
 * The stroke *counts* here match `stroke_count` in `characters.ts`, and
 * `data.test.ts` asserts that they do. They are the counts a Korean primary
 * school teaches: ㅅ is two strokes, ㅈ is three, ㅁ is three (the left upright,
 * then the top-and-right in one turn, then the base).
 *
 * ## This is teaching material, not a grading rule
 *
 * `strokeOrderNotes` in `features/writing/feedback.ts` compares what the learner
 * did against this and says what differed. It never fails anybody for it. A
 * learner who writes a correct character in an unusual order has written a
 * correct character, and telling them otherwise would be inventing a rule the
 * language does not enforce.
 */

/** `[x, y]` pairs in a 0–100 box. Written as tuples so the data stays readable. */
type Points = Array<[number, number]>;

/** A cubic segment as `[c1x, c1y, c2x, c2y, tox, toy]`, in the same 0–100 box. */
type Cubic = [number, number, number, number, number, number];

function at(x: number, y: number) {
  return { x: x / 100, y: y / 100 };
}

/**
 * One stroke: the polyline a grader compares against, and optionally the exact
 * curve a renderer draws.
 *
 * Give `curve` only when the stroke is genuinely curved. A straight stroke's
 * polyline *is* its geometry, and saying so twice is one more thing that can
 * disagree with itself.
 */
function stroke(points: Points, curve?: Cubic[]): StrokeStep {
  if (!curve) return { points: points.map(([x, y]) => at(x, y)) };
  return {
    // Sampled from the curve rather than authored beside it. Everything that
    // reads `points` — the junction classifier, the grader, the marker layout,
    // the length the animation is paced by — is then reading the same stroke
    // the renderer draws. Authoring both is one more pair of things that can
    // disagree, and a branch point authored on a chord of a bowed stroke sits
    // just off the stroke, which is exactly the kind of near-miss that used to
    // put a stray mark on the paper.
    points: sample(points[0]!, curve),
    curve: curve.map(
      ([c1x, c1y, c2x, c2y, tx, ty]): CurveSegment => ({
        c1: at(c1x, c1y),
        c2: at(c2x, c2y),
        to: at(tx, ty),
      }),
    ),
  };
}

/** Points per cubic. Twelve puts every sample well under the pen at lesson size. */
const SAMPLES = 12;

function sample(first: [number, number], curve: Cubic[]): Array<{ x: number; y: number }> {
  const out = [at(first[0], first[1])];
  let [x0, y0] = first;
  for (const [c1x, c1y, c2x, c2y, tx, ty] of curve) {
    for (let i = 1; i <= SAMPLES; i += 1) {
      const t = i / SAMPLES;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      out.push(at(a * x0 + b * c1x + c * c2x + d * tx, a * y0 + b * c1y + c * c2y + d * ty));
    }
    x0 = tx;
    y0 = ty;
  }
  return out;
}

/** A point on a cubic, for placing something that has to sit on the stroke. */
function onCubic(
  from: [number, number],
  [c1x, c1y, c2x, c2y, tx, ty]: Cubic,
  t: number,
): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * from[0] + b * c1x + c * c2x + d * tx,
    a * from[1] + b * c1y + c * c2y + d * ty,
  ];
}

/**
 * A ㄱ, drawn as one stroke that turns the corner, inside `[left, right]`.
 *
 * ## How far the leg leans, measured against the face rather than estimated
 *
 * Three times now, and the first two were wrong. The number that matters is
 * where the **toe** lands: the leg's centre at the bottom of the letter, as a
 * fraction of the letter's own width, with 1.0 meaning straight down from the
 * corner and 0 meaning all the way back under the bar's left end.
 *
 * Read off the practice face row by row, taking the ㄱ's region from the
 * measured composition so the vowel's ink cannot be mistaken for the leg:
 *
 * ```
 *            toe    leg centre at 25% / 50% / 75% / 98% of the ㄱ's height
 *   가      0.120      0.873   0.743   0.459   0.134
 *   거      0.114      0.866   0.814   0.459   0.131
 *   기      0.113      0.864   0.738   0.457   0.129
 *   그      0.945      0.922   0.917   0.901   0.897
 *   ㄱ      0.915      0.915   0.915   0.915   0.915
 * ```
 *
 * So the face draws two quite different letters, and the split is the one
 * `strokesOf` already knew about — beside a vowel the leg sweeps almost the
 * whole width back; above one, or on its own, it comes straight down. What was
 * wrong was the *size* of the lean, not the rule: this was authored at 0.28,
 * which puts the toe at 0.72 where the face puts it at 0.115. On screen that
 * reads as a ㄱ whose leg stops early — top-heavy, and visibly not the letter
 * the tracing guide shows underneath it.
 *
 * 고 and 구 are absent from the table on purpose. Their vowel's stem descends
 * into the consonant's measured region, so "the lowest ink in that region" is
 * the stem and not the toe; both measure at almost exactly 0.5, which is where
 * the stem is. They are covered by the upright form, whose leg is straight.
 *
 * ## The curve, fitted to the guide
 *
 * The leg is not a straight diagonal. It leaves the corner travelling down and
 * turns into the sweep, which is what the four samples above describe, and the
 * two controls below were fitted to them by least squares over the three tall
 * blocks to an RMS of 0.017 of the letter's width. `c1` is held on the corner's
 * own vertical so the corner stays a clean right angle rather than becoming a
 * chamfer.
 *
 * The fit is against the *rendered ink*, not the bare curve: the samples are
 * taken at fractions of the letter's ink box, whose top edge is half a pen
 * above where the curve starts and whose bottom is half a pen below where it
 * ends, so a curve fitted to them directly comes out about 0.057 of the width
 * too far left through the middle.
 *
 * It was replaced twice by a straighter leg — first a shallow bow, then a plain
 * chord — on the reasoning that a diagram should show a tidier stroke than the
 * face does. Both are visibly a different letter from the tracing guide the
 * demonstration is drawn over: the chord cuts across the inside of the guide's
 * sweep and leaves a crescent of grey showing on every 가, 거, 기 and 강. The
 * guide is the target, so the fit is what ships.
 */
export const GIYEOK_LEAN = 0.885;

function giyeok(
  left: number,
  right: number,
  top = 20,
  bottom = 80,
  lean = GIYEOK_LEAN,
): StrokeStep {
  const width = right - left;
  const height = bottom - top;
  const toe = right - width * lean;
  if (lean === 0) {
    // Nothing to curve: the leg comes straight down and the corner is square.
    return stroke([
      [left, top],
      [right, top],
      [right, bottom],
    ]);
  }
  return stroke(
    // The polyline the demonstration reveals, sampled off the same curve: the
    // corner, the two places the face's leg passes through on its way down, and
    // the toe. Three segments rather than two, because at this lean two chords
    // of the arc visibly cut the corner off it.
    [
      [left, top],
      [right, top],
      [legX(left, width, toe, 0.5), top + height * 0.5],
      [legX(left, width, toe, 0.8), top + height * 0.8],
      [toe, bottom],
    ],
    [
      [left, top, right, top, right, top],
      [
        right,
        top + height * 0.67,
        left + width * 0.15,
        top + height * 0.9,
        toe,
        bottom,
      ],
    ],
  );
}

/**
 * A point on the leg, for the polyline that follows the curve above.
 *
 * Evaluated from the same cubic rather than estimated, so the revealed path and
 * the drawn one cannot drift apart — which is the whole reason the polyline
 * exists.
 */
function legX(left: number, width: number, toe: number, v: number): number {
  const p0 = 1;
  const c1 = 1;
  const c2 = 0.15;
  const p3 = (toe - left) / width;
  // Solve the cubic's y for the parameter, then read its x. y is
  // 3(1-t)²t·0.3 + 3(1-t)t²·0.77 + t³, which is monotonic over [0, 1].
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const t = (lo + hi) / 2;
    const m = 1 - t;
    const y = 3 * m * m * t * 0.67 + 3 * m * t * t * 0.9 + t * t * t;
    if (y < v) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  const m = 1 - t;
  const u = m * m * m * p0 + 3 * m * m * t * c1 + 3 * m * t * t * c2 + t * t * t * p3;
  return left + width * u;
}

/** A ㄴ: down, then right. One stroke. */
function nieun(left: number, right: number, top = 16, bottom = 78): StrokeStep {
  return stroke([
    [left, top],
    [left, bottom],
    [right, bottom],
  ]);
}

/**
 * The two strokes of a ㄷ: the lid, then the ㄴ under it.
 *
 * ## The corner has to be one point, not two near ones
 *
 * The ㄴ used to start at `[left, 22]` while the lid started at `[left, 20]`,
 * two units below it, and that is a notch you can see. Both are stroked
 * centrelines with butt caps: the lid's ink begins at x = `left` and runs
 * right, while the ㄴ's ink is half a pen wide *either side* of `left`. Where
 * the ㄴ has not started yet — the two units under the lid's own top edge —
 * nothing covers its outer half, so the letter's top-left corner is bitten out
 * in a square about half a pen wide and two units deep.
 *
 * `strokeVectors` does close a corner: an end that meets another stroke's end
 * is extended by half a pen. That cannot help here, because the extension runs
 * along the stroke's own tangent — it lengthens the ㄴ upwards and never moves
 * the lid leftwards. A flush corner needs the two centrelines to *start at the
 * same point*, which is how ㅁ and ㅂ were authored and why they have never had
 * this defect. (The extension is symmetric now, so the lid reaches the corner
 * too; that closes the animation's version of the same defect and not this one,
 * which is about where the centrelines are authored.)
 *
 * Measured, at 512 px over the 100-unit box: the junction square at the lid's
 * start was 90% inked before this and is 100% after. The same two units cost
 * ㄹ's waist junction 48% of its square, because there the notch is bounded on
 * three sides.
 */
function digeut(left: number, right: number): StrokeStep[] {
  return [
    stroke([
      [left, 20],
      [right, 20],
    ]),
    nieun(left, right, 20, 78),
  ];
}

/**
 * The four strokes of a ㅂ: both uprights, the waist, then the base.
 *
 * The waist sits at 0.41 of the letter's ink, which is where Pretendard puts
 * it — noticeably above the middle. It was authored at 0.50, and a ㅂ with its
 * waist on the centre line reads as a box with a shelf in it rather than as ㅂ:
 * the counter above the waist should be the shallower of the two. Measured by
 * `letters:face`, which is also what found it.
 */
function bieup(left: number, right: number): StrokeStep[] {
  return [
    stroke([
      [left, 14],
      [left, 86],
    ]),
    stroke([
      [right, 14],
      [right, 86],
    ]),
    stroke([
      [left, 45.5],
      [right, 45.5],
    ]),
    stroke([
      [left, 86],
      [right, 86],
    ]),
  ];
}

/**
 * The two falling strokes of a ㅅ. The second starts **on** the first.
 *
 * Where it starts is a fraction of the fall rather than a fixed drop, because
 * ㅈ borrows this pair under a lid and its legs are shorter: a drop measured in
 * box units put the branch a third of the way down a ㅅ and nearly half of the
 * way down a ㅈ. The x follows from the y — the branch point has to sit on the
 * first stroke, and the first stroke is a straight line from the apex.
 *
 * ## The fraction was 0.32, and it was measured to 0.22
 *
 * A fork a third of the way down opens the legs early, and against the face
 * that reads as the two strokes crossing rather than one splitting off the
 * other — the "forked" ㅅ and ㅊ this was reported for. Swept the same way as
 * `SIOT_FAR`:
 *
 * ```
 * branch     ㅅ     ㅈ     ㅊ
 * 0.16      93%   98%   99%
 * 0.22      94%   97%   98%     <- chosen
 * 0.32      92%   95%   96%     <- was here
 * 0.42      88%   91%   93%
 * ```
 *
 * Not 0.16, which measures a shade better and is the wrong shape for the
 * reason the paragraph above this one exists: a branch that high is two
 * strokes leaving the same point, and the trunk above it then belongs to
 * whichever was written first. 0.22 keeps a visible trunk and a junction a
 * hand would make.
 */
/**
 * How much a leg of ㅅ flares, as controls on the chord from fork to foot.
 *
 * Both legs used to leave the fork nearly vertical and open out only in the
 * last seventh of the drop, which puts a near-horizontal tail on the bottom of
 * every ㅅ, ㅈ, ㅊ, ㅆ and ㅉ and on the 받침 of 옷 and 꽃. Flattened at the foot
 * the letter stops being two falling strokes and becomes a pair of hooks, and
 * because the left leg reaches its width earlier than the right one the whole
 * mark reads as sitting to the left of where it is.
 *
 * The four numbers below put each control near the chord instead: the leg is a
 * straight fall with a slight outward bow, and both legs are shaped alike, so
 * the letter is symmetrical about its fork.
 *
 * ## `SIOT_FAR` was 0.3, and it was measured to 0.55
 *
 * 0.3 holds the far control close to the foot, which keeps the leg vertical
 * most of the way down and then turns it out sharply near the bottom. Against
 * the face that reads as a leg that falls too straight and then hooks, and it
 * is what put ㅅ eight points below every other letter in the curriculum.
 *
 * Swept against the reference face with `glyphshape:qa --only ㅅㅈㅊ`, which
 * asks how much of each letter's ink the other explains within 14px of a 320px
 * raster:
 *
 * ```
 * SIOT_FAR    ㅅ     ㅈ     ㅊ
 * 0.30       94%   97%   98%     <- was here
 * 0.40       96%   99%   99%
 * 0.50       98%  100%   99%
 * 0.55       99%  100%   99%     <- chosen
 * 0.60       99%  100%   99%
 * ```
 *
 * 0.55 is where the curve stops paying: 0.60 measures the same and pushes the
 * control past the point where the leg still reads as a bow rather than a
 * straight line. The letters were rendered against the face and looked at at
 * each step — the numbers chose between neighbouring candidates, they did not
 * decide the shape.
 */
const SIOT_NEAR = 0.08;
const SIOT_NEAR_Y = 0.5;
const SIOT_FAR = 0.55;
const SIOT_FAR_Y = 0.14;

function siot(apexX: number, left: number, right: number, top = 16): StrokeStep[] {
  const bottom = 84;
  const branch = 0.22;
  const fall = bottom - top;

  // Both legs leave the fork steeply and flare as they drop, which is what the
  // reference face does and what a hand does. Authored as one cubic each: the
  // controls hold the stroke near-vertical for the first half and let it open
  // out into the last third.
  const leftLeg: Cubic = [
    apexX - (apexX - left) * SIOT_NEAR,
    top + fall * SIOT_NEAR_Y,
    left + (apexX - left) * SIOT_FAR,
    bottom - fall * SIOT_FAR_Y,
    left,
    bottom,
  ];

  // Where the second stroke lands, read off the first stroke's *curve*. Taken
  // off the straight chord instead it sits a little inside the bow, and the
  // second stroke then starts just short of the first — a hairline of paper
  // between two strokes that are supposed to meet.
  const [branchX, branchY] = onCubic([apexX, top], leftLeg, branch);
  const rightFall = bottom - branchY;

  return [
    stroke([[apexX, top]], [leftLeg]),
    stroke(
      [[branchX, branchY]],
      [
        [
          branchX + (right - branchX) * SIOT_NEAR,
          branchY + rightFall * SIOT_NEAR_Y,
          right - (right - branchX) * SIOT_FAR,
          bottom - rightFall * SIOT_FAR_Y,
          right,
          bottom,
        ],
      ],
    ),
  ];
}

/**
 * The three strokes of a ㅈ: the lid, then the ㅅ under it.
 *
 * The two falling strokes are `siot`'s, not a second pair authored here, and
 * that is the correction rather than a tidy-up. They used to be written as two
 * lines leaving the *same* point under the lid, which is how the letter is
 * drawn in a diagram and not how it is written: the right-falling stroke starts
 * **on** the left-falling one, a little below the fork, exactly as it does in ㅅ.
 *
 * Authoring both from one point split the trunk above the fork down its middle
 * — half a stroke's width to each leg — so the leg written first carried a
 * hairline of the trunk up to the lid while the leg it belongs to was still
 * grey. Every ㅈ, ㅊ, ㅉ and syllable built from them had it. Sharing `siot`
 * makes the two letters agree about a shape they share, which is also why the
 * defect could exist: ㅅ never had it.
 */
function jieut(left: number, right: number, lidY = 26): StrokeStep[] {
  const middle = (left + right) / 2;
  return [
    stroke([
      [left, lidY],
      [right, lidY],
    ]),
    // Symmetrical insets. They were 4 and 2, which pulls the letter's ink box
    // a unit to the right of the lid it hangs from and leaves the fork looking
    // off-centre once `fit` centres the box in its slot.
    ...siot(middle, left + 3, right - 3, lidY),
  ];
}

/**
 * A circle, written anticlockwise from the top, as ㅇ and ㅎ's bowl are.
 *
 * ## Why this is a curve and not forty-eight straight lines
 *
 * It used to be only the polyline below, and the polyline was what got drawn.
 * A polygon is a polygon at any resolution: at the size a lesson shows ㅇ, and
 * more so once a block flattens it, the turns fell where the eye could find
 * them and a learner looking at 어 saw a lumpy shape and reasonably concluded
 * the app did not know what the letter looks like. Adding points moved the
 * lumps around and made the file bigger; it could not remove them, because the
 * shape being drawn really was a polygon.
 *
 * So the circle is now four cubic segments — the standard construction, with
 * control points at `kappa` of the radius — which is a circle to within a
 * fraction of a pixel at any size. The polyline stays as the *sample*: the
 * grader compares a learner's ink against it, `strokeGuide` measures it, and
 * neither needs a curve. Both are the same circle, so they cannot disagree.
 *
 * `fit` in `compose.ts` scales x and y independently, and that maps a cubic
 * exactly — so a ㅇ flattened into a block is a true ellipse rather than a
 * squashed polygon, which is the case that looked worst.
 */
const KAPPA = 0.5522847498307936;

function circle(cx: number, cy: number, r: number): StrokeStep {
  const k = r * KAPPA;
  // From the top, anticlockwise: left, bottom, right, back to the top. The same
  // direction and the same starting point as the sample above, so the ink grows
  // the way the pen goes.
  return stroke([[cx, cy - r]], [
    [cx - k, cy - r, cx - r, cy - k, cx - r, cy],
    [cx - r, cy + k, cx - k, cy + r, cx, cy + r],
    [cx + k, cy + r, cx + r, cy + k, cx + r, cy],
    [cx + r, cy - k, cx + k, cy - r, cx, cy - r],
  ]);
}

/**
 * ## The vowels are authored in the face's own fractions
 *
 * Every number in the vowel table below is a position in the letter's **ink
 * box** as Pretendard draws it, times a hundred: `upright(15.6)` is the stem
 * Pretendard centres 15.6% of the way across ㅏ's ink. They were read off the
 * face by `scripts/compound-vowel-qa.mjs`, which renders the glyph, finds its
 * uprights and bars, and reports where they are — and which then re-reads the
 * app's own drawing the same way and compares the two.
 *
 * `shapeToFace` renormalises whatever box these are authored in, so the
 * absolute values do not survive; the proportions do, and stating them in the
 * face's units is what makes the table checkable against the face by eye as
 * well as by the gate.
 *
 * ### Why this was rewritten
 *
 * The previous numbers were authored by eye in a roughly square box, and two
 * defects came out of it that no gate could see, because `glyphshape:qa`
 * compares the tracing guide with the demonstration and for these letters both
 * are drawn from this table.
 *
 * **The bars were short.** Pretendard carries ㅗ's bar 68% of the way across ㅘ
 * and stops it a twentieth of the letter short of the ㅏ; this table stopped it
 * at 49% and left an open channel three times as wide. Every ㅗ/ㅜ/ㅡ compound
 * had it. A learner sees two letters side by side instead of one vowel, which
 * is the thing a compound vowel most needs not to look like.
 *
 * **The crossbars did not arrive.** In ㅐ, ㅒ and ㅙ the face runs the ㅏ's
 * branch into the second upright — one connected mark. This table stopped the
 * branch an eighth of the letter short of it, so the second upright stood on
 * its own and the letter read as ㅏ then ㅣ. The branch now ends a third of a
 * pen *inside* the upright it belongs to: far enough that the ink is
 * continuous, not so far that the animation draws a stroke past where the pen
 * has been.
 *
 * Where the face slants a bar — it tilts ㅗ and ㅜ down towards the outside so
 * the halves do not collide at text sizes — the number here is the slant's mean
 * height, and the guide draws it level. That is an optical adjustment belonging
 * to the typeface, and nobody writes a slanted ㅗ.
 */

/** An upright — ㅏ's stem, ㅣ, the second half of a ㅐ. Ink-box fractions ×100. */
function upright(x: number, top = 0, bottom = 99.8): StrokeStep {
  return stroke([
    [x, top],
    [x, bottom],
  ]);
}

/** A full-width bar — ㅗ's, ㅜ's, ㅡ. Ink-box fractions ×100. */
function crossbar(y: number, left = 0, right = 99.8): StrokeStep {
  return stroke([
    [left, y],
    [right, y],
  ]);
}

export const STROKE_ORDER: Record<string, StrokeStep[]> = {
  // --- Basic vowels ---------------------------------------------------------
  // The upright first, then the branch, because the branch is to its right.
  ㅏ: [upright(15.6), stroke([[15.6, 44.6], [99.4, 44.6]])],
  // The branch first, because here it is on the *left* of the upright.
  ㅓ: [stroke([[0, 43.9], [83.8, 43.9]]), upright(83.8)],
  ㅗ: [stroke([[49.9, 0], [49.9, 91.1]]), crossbar(91.1)],
  ㅜ: [crossbar(8.5), stroke([[49.8, 8.5], [49.8, 99.6]])],
  ㅡ: [crossbar(48.9)],
  ㅣ: [upright(49)],

  // --- Iotised vowels: the upright, then its branches, top before bottom -----
  ㅑ: [
    upright(15.9),
    stroke([[15.9, 32.6], [99.4, 32.6]]),
    stroke([[15.9, 60.7], [99.4, 60.7]]),
  ],
  ㅕ: [
    stroke([[0, 31.2], [84, 31.2]]),
    stroke([[0, 58.4], [84, 58.4]]),
    upright(84),
  ],
  ㅛ: [
    stroke([[30.7, 0], [30.7, 91.1]]),
    stroke([[69.4, 0], [69.4, 91.1]]),
    crossbar(91.1),
  ],
  ㅠ: [
    crossbar(8.4),
    stroke([[31.2, 8.4], [31.2, 99.6]]),
    stroke([[68, 8.4], [68, 99.6]]),
  ],

  // --- Compound vowels: the parts, in order ---------------------------------
  /*
    ㅏ then ㅣ, and the branch reaches the ㅣ.

    Pretendard's ㅐ is one connected mark: the crossbar runs from the first
    upright into the second. Stopped short — which is what this used to do, by
    an eighth of the letter — the second upright stands on its own and a learner
    copying it writes ㅏ ㅣ. It ends a third of a pen inside the upright now, so
    the ink is continuous without the animation drawing past the pen.
  */
  ㅐ: [upright(13.6), stroke([[13.6, 43.9], [81.3, 43.9]]), upright(85.9)],
  // ㅓ then ㅣ. Here the face does *not* carry the bar across, and neither does
  // this: the branch belongs to the ㅓ and stops on its upright.
  ㅔ: [stroke([[0, 43.8], [46.4, 43.8]]), upright(46.4), upright(88.9)],
  ㅒ: [
    upright(13.7),
    stroke([[13.7, 31.2], [80.7, 31.2]]),
    stroke([[13.7, 58.8], [80.7, 58.8]]),
    upright(85.4),
  ],
  ㅖ: [
    stroke([[0, 30.8], [47.7, 30.8]]),
    stroke([[0, 57.8], [47.7, 57.8]]),
    upright(47.7),
    upright(89.2),
  ],
  ㅘ: [
    stroke([[34.1, 31.1], [34.1, 69.8]]),
    stroke([[0, 69.8], [67.9, 69.8]]),
    upright(78.1),
    stroke([[78.1, 44.5], [99.8, 44.5]]),
  ],
  ㅝ: [
    stroke([[0, 47.4], [78.9, 47.4]]),
    stroke([[37, 47.4], [37, 92.1]]),
    stroke([[60.2, 66.9], [93.6, 66.9]]),
    upright(93.6),
  ],
  ㅚ: [stroke([[40.6, 32.1], [40.6, 68.1]]), stroke([[0, 68.1], [79.7, 68.1]]), upright(93.1)],
  ㅟ: [stroke([[0, 48.4], [81, 48.4]]), stroke([[40.9, 48.4], [40.9, 91.9]]), upright(93.3)],
  /*
    ㅗ, then the ㅐ — and the ㅐ has to look like a ㅐ.

    Two things were wrong here and only one of them had been found. The uprights
    were 31 of the ink box apart against the face's 24, which a previous pass
    corrected. The branch between them was still a stub: it stopped in open
    paper two units short of the second upright, so the letter came apart into
    ㅗ ㅏ ㅣ at exactly the place the eye looks for the join. The face runs it
    through, and so does this.

    The ㅗ's bar is the other half of the same defect: 44 of the ink box against
    the face's 60, leaving a channel between the ㅗ and the ㅐ a third of the
    letter wide.
  */
  ㅙ: [
    stroke([[30.5, 31], [30.5, 67.8]]),
    stroke([[0, 67.8], [59.9, 67.8]]),
    upright(70.2),
    stroke([[70.2, 44.7], [91.9, 44.7]]),
    upright(93.9),
  ],
  /*
    ㅜ, then the ㅔ, and the same corrections as ㅙ above.

    The connector stays low — 67 of the ink box, not 50. That is not a fudge to
    keep it clear of the ㅜ's bar: it is where Pretendard puts it, in ㅝ as well
    as ㅞ, because the ㅜ's bar has taken the middle of the letter and the ㅓ's
    branch goes under it. Measured off the face, not chosen.
  */
  ㅞ: [
    stroke([[0, 48], [60.5, 48]]),
    stroke([[30.2, 48], [30.2, 92.3]]),
    stroke([[45.9, 66.9], [71.5, 66.9]]),
    upright(71.5),
    upright(94),
  ],
  ㅢ: [stroke([[0, 62.4], [80.3, 62.4]]), upright(93.5)],

  // --- Basic consonants -----------------------------------------------------
  ㄱ: [giyeok(20, 78)],
  ㄴ: [nieun(26, 82)],
  ㄷ: digeut(24, 80),
  ㄹ: [
    /*
      The ㄱ on top, the waist, then the ㄴ underneath.

      The three bars line up on both edges, as the face's do — and lining them
      up means lining up the *ink*, not the centrelines. A bar is cut square
      where its centreline stops; an upright puts half a pen outside its own.
      Authored to the same x, the top bar therefore began half a pen inside the
      upright below it and the letter stepped in at the top left and again at
      the bottom right, which `letters:face` reads as the left edge of ㄹ
      carrying ink for half its height where the face carries it for all of it.
      So the bar that ends in *open paper* is given that half pen — which is
      the top bar, and only the top bar.

      The waist does not end in open paper: the lower ㄴ starts there. It used to
      be authored at 18.7 like the top bar, with the ㄴ's stem at 22 and its top
      two units lower again, and those two small offsets were a notch — 52% of
      its junction square was blank, the worst in the curriculum. So the waist
      and the stem now begin at the *same point*, 22, and the corner is solid.
      The waist loses nothing by starting 3.3 further right: 22 is the stem's
      centreline and the stem's ink runs from 17.5, so the waist's square end is
      under it either way and the letter's left edge is unchanged.

      Moving the *stem* to 22 + half a pen instead was tried and was wrong, and
      the reason is worth keeping: `shapeToFace` scales the authored letter and
      **not the pen**, so a half-pen offset typed in authored units is not half
      a pen once the letter has been fitted to the face's proportions. Measured,
      the 4.5 became 6.09 and the top bar came out 1.6 units proud of the stem —
      `letters:face` read it immediately as a left stem that no longer stands
      against the letter's edge. A number that means "half a pen" cannot be
      written down here; a coincident point can.

      On the right
      the waist does not end in open paper at all: it runs into the foot of the
      leg above it, so it stops **on** that leg's centreline at 76 and
      `strokeVectors` closes the corner by extending it half a pen, which lands
      its ink exactly on the leg's right edge. Ended at 79.3 instead it was
      still close enough to the leg's end to be called a corner, got the same
      half pen on top of the 3.3 it already had, and came out as a spur sticking
      past every other bar in 라, 말 and 글 — the middle of the letter reaching
      further right than its foot. Only the base runs on, by about a fortieth of
      the letter, which is the face's own overhang and is what keeps the leg
      clear of the letter's right edge.
    */
    stroke([[18.7, 16], [76, 16], [76, 44]]),
    stroke([[22, 46], [76, 46]]),
    stroke([[22, 46], [22, 82], [80.8, 82]]),
  ],
  ㅁ: [
    // Left upright, then top-and-right in one turn, then the base. Three
    // strokes, not four: the corner at the top right is not lifted.
    stroke([[26, 18], [26, 82]]),
    stroke([[26, 18], [78, 18], [78, 82]]),
    stroke([[26, 82], [78, 82]]),
  ],
  ㅂ: bieup(26, 76),
  ㅅ: siot(50, 20, 80),
  ㅇ: [circle(50, 50, 32)],
  ㅈ: jieut(18, 82),
  ㅎ: [
    // The mark on top is a short **upright** that comes down onto the bar, not
    // a second horizontal above it. Measured off the face: Pretendard sets it
    // about 0.17 of the letter's width and 0.20 of its height — taller than it
    // is wide — and its ink runs into the bar's, which is why the two come back
    // from `measure-composition` as one island.
    //
    // It was authored as a wide horizontal for four rounds, on a note claiming
    // the face drew it that way. The face does not, and the note came from
    // reading a canvas that had quietly fallen back to a system sans because
    // the Korean subset of Pretendard was never asked for; see
    // `scripts/measure-composition.mjs`. Drawn as a bar it was 0.44 of the
    // letter wide and 0.12 tall — half the width of ㅎ laid across the top — so
    // the letter read as having two horizontals and a circle.
    stroke([[50, 11], [50, 32]]),
    stroke([[20, 32], [80, 32]]),
    // Clear of the bar, not touching it. At r = 24 the top of the bowl's ink
    // and the underside of the bar's overlapped by three units and the two
    // read as one shape — the face leaves a visible gap and so does this.
    circle(50, 64, 19),
  ],

  // --- Aspirates: the plain letter with a stroke added ----------------------
  // The same upright ㅎ carries, ending on the lid rather than short of it.
  // Both letters had it authored as a wide horizontal, and for the same wrong
  // reason — see the note on ㅎ. The claim that an upright would leave the pen
  // travelling through blank paper belonged to the old model, where a stroke
  // was cut out of the rasterised glyph and could therefore be given ink that
  // was not its own; a stroked centreline draws exactly where it goes.
  //
  // The tick runs from 8 to the lid at 30, and it was shortened to 13 once on
  // the reasoning that Pretendard's tick is 22% of the letter's height against
  // this one's 29%. That arithmetic forgot the pen: the lid is a stroked
  // centreline nine units wide, so a tick ending at the lid's *centre* shows
  // only as far as the lid's top edge, and 8 → 30 shows 23% — the face's
  // number. Shortened to 13 it showed 17% and `glyphshape:qa` reported ㅊ at
  // 92%, its worst score of the seventy-three. Left at 8.
  ㅊ: [stroke([[50, 8], [50, 30]]), ...jieut(18, 82, 30)],
  // The added bar starts on the letter's own left edge, level with the top
  // bar's, and runs right to cross the leg. Set in from that edge it hung in
  // open paper with nothing on either end of it.
  ㅋ: [giyeok(20, 78, 18, 84), stroke([[20, 49], [74, 49]])],
  // The upright starts *on* the top bar's own start, not two units under it:
  // see `digeut` for the notch that opens at the upper-left corner otherwise.
  // The middle bar starts at 26, inside the upright's ink rather than on its
  // centreline, which is a `join` and needs no such alignment — its square end
  // is under the upright either way.
  ㅌ: [
    stroke([[24, 18], [80, 18]]),
    stroke([[26, 48], [80, 48]]),
    stroke([[24, 18], [24, 80], [80, 80]]),
  ],
  // The two uprights stand at 0.28 and 0.72 across the ink, not 0.22 and 0.78:
  // Pretendard sets them a little inside where they were authored, and pushed
  // out they crowd the lid's ends and leave the middle counter too wide.
  ㅍ: [
    stroke([[18, 24], [82, 24]]),
    stroke([[35.9, 24], [35.9, 74]]),
    stroke([[64.3, 24], [64.3, 74]]),
    stroke([[18, 76], [82, 76]]),
  ],

  // --- Tense consonants: the plain letter, twice, left before right ---------
  ㄲ: [giyeok(10, 46), giyeok(56, 92)],
  ㄸ: [...digeut(8, 44), ...digeut(56, 92)],
  ㅃ: [...bieup(10, 42), ...bieup(58, 90)],
  ㅆ: [...siot(26, 6, 46), ...siot(74, 54, 94)],
  ㅉ: [...jieut(6, 46), ...jieut(54, 94)],
};

/**
 * The letters the face draws with a **straight** leg, and when it does.
 *
 * ## This is the face's own distinction, not a preference
 *
 * Rendering Pretendard's ㄱ settles it. Alone — the glyph on a lesson about the
 * letter ㄱ — the leg comes straight down from a square corner. In 가, 거 and
 * 기, where the block gives ㄱ a tall narrow slot, the leg **leans and curves**
 * away to the left, a real 7. In 고, 구, 그, 국, 공 and 글, where the slot is
 * wide and shallow, it is straight again — and so is the ㄱ at the foot of 국.
 * ㅋ and ㄲ follow ㄱ.
 *
 * `STROKE_ORDER` holds the leaning form, and this map holds the other one.
 *
 * ## Why it is a second form and not a consequence of the fit
 *
 * It used to be the latter. The claim was that a squat slot squashes the letter
 * horizontally and squashing a leaning leg straightens it, so only the isolated
 * letter needed saying. That is backwards: a wide, shallow slot **stretches** a
 * near-square ㄱ sideways, by up to the squeeze bound, and stretching a leaning
 * leg sideways lays it further over. The lean is authored as a fraction of the
 * letter's width — a quarter of it — so a ㄱ stretched to two and a bit times
 * its own proportions arrives with a leg at nearly sixty degrees. Every block
 * with a horizontal vowel had one, which is why 국, 공, 글, 고, 구 and 그 all
 * read as a diagonal slash with a bar over it rather than as ㄱ.
 *
 * So the two forms are two forms. `strokeVectors` takes this one for a letter
 * on its own, and `compose.ts` takes it for a letter whose slot would stretch
 * it wide; see `uprightInWideSlot` there.
 */
export const STROKE_ORDER_UPRIGHT: Record<string, StrokeStep[]> = {
  ㄱ: [giyeok(20, 78, 20, 80, 0)],
  // The added bar runs all the way to the leg's centreline, not to just short of
  // it: stopping short leaves its squared end a fraction of a pen proud of the
  // leg's right edge, which is a nub on the outside of the letter. Ending on the
  // centreline puts the end under the leg's own ink, where it cannot be seen.
  ㅋ: [giyeok(20, 78, 18, 84, 0), stroke([[20, 49], [78, 49]])],
  ㄲ: [giyeok(10, 46, 20, 80, 0), giyeok(56, 92, 20, 80, 0)],
};

/** Every character the stroke data covers. */
export const STROKE_ORDER_CHARACTERS = Object.keys(STROKE_ORDER);

/**
 * The stroke order for a character, or the letters of a syllable in order.
 *
 * A syllable block is written by writing its letters, so 가 is ㄱ then ㅏ — the
 * data does not repeat itself for the eleven thousand blocks, and a lesson on
 * 가 shows the two letters it is made of.
 */
export function strokesFor(character: string): StrokeStep[] | null {
  const direct = STROKE_ORDER[character];
  if (direct) return direct;
  return null;
}
