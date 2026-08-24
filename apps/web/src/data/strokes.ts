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
 * ## The curve
 *
 * The leg is not a straight diagonal — it leaves the corner travelling down and
 * turns into the sweep, which is what the four samples above describe. The two
 * controls below were fitted to them by least squares over the three tall
 * blocks, to an RMS of 0.017 of the letter's width. `c1` is held on the
 * corner's own vertical so the corner stays a clean right angle rather than
 * becoming a chamfer.
 *
 * The fit is against the *rendered ink*, not against the bare curve. Those are
 * not the same thing and the difference is not small: the samples above are
 * taken at fractions of the letter's ink box, whose top edge is half a pen
 * above where the curve starts and whose bottom is half a pen below where it
 * ends, so a curve fitted to them directly comes out about 0.057 of the width
 * too far left through the middle. Fitted once, measured off the render,
 * refitted against the offset — which is why the numbers below are not the
 * ones a first pass produces.
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

/** The two strokes of a ㄷ: the lid, then the ㄴ under it. */
function digeut(left: number, right: number): StrokeStep[] {
  return [
    stroke([
      [left, 20],
      [right, 20],
    ]),
    nieun(left, right, 22, 78),
  ];
}

/** The four strokes of a ㅂ: both uprights, the waist, then the base. */
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
      [left, 52],
      [right, 52],
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
 */
function siot(apexX: number, left: number, right: number, top = 16): StrokeStep[] {
  const bottom = 84;
  const branch = 0.32;
  const fall = bottom - top;

  // Both legs leave the fork steeply and flare as they drop, which is what the
  // reference face does and what a hand does. Authored as one cubic each: the
  // controls hold the stroke near-vertical for the first half and let it open
  // out into the last third.
  const leftLeg: Cubic = [
    apexX - (apexX - left) * 0.08,
    top + fall * 0.5,
    left + (apexX - left) * 0.3,
    bottom - fall * 0.14,
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
          branchX + (right - branchX) * 0.1,
          branchY + rightFall * 0.5,
          right - (right - branchX) * 0.28,
          bottom - rightFall * 0.14,
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
    ...siot(middle, left + 4, right - 2, lidY),
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

/** A vertical, e.g. the upright of ㅏ or the ㅣ of a compound vowel. */
function vertical(x: number, top = 10, bottom = 90): StrokeStep {
  return stroke([
    [x, top],
    [x, bottom],
  ]);
}

function horizontal(y: number, left = 12, right = 88): StrokeStep {
  return stroke([
    [left, y],
    [right, y],
  ]);
}

export const STROKE_ORDER: Record<string, StrokeStep[]> = {
  // --- Basic vowels ---------------------------------------------------------
  // The upright first, then the branch, because the branch is to its right.
  ㅏ: [vertical(45), stroke([[45, 50], [80, 50]])],
  // The branch first, because here it is on the *left* of the upright.
  ㅓ: [stroke([[20, 50], [55, 50]]), vertical(55)],
  ㅗ: [stroke([[50, 18], [50, 62]]), horizontal(62)],
  ㅜ: [horizontal(38), stroke([[50, 38], [50, 82]])],
  ㅡ: [horizontal(50)],
  ㅣ: [vertical(50)],

  // --- Iotised vowels: the upright, then its branches, top before bottom -----
  ㅑ: [vertical(45), stroke([[45, 35], [80, 35]]), stroke([[45, 65], [80, 65]])],
  ㅕ: [stroke([[20, 35], [55, 35]]), stroke([[20, 65], [55, 65]]), vertical(55)],
  ㅛ: [stroke([[32, 18], [32, 62]]), stroke([[66, 18], [66, 62]]), horizontal(62)],
  ㅠ: [horizontal(38), stroke([[32, 38], [32, 80]]), stroke([[66, 38], [66, 80]])],

  // --- Compound vowels: the parts, in order ---------------------------------
  // The connector stops well short of the second stem. The letter is fitted
  // into the narrow box the face gives it (see `shapeToFace`), which brings the
  // two stems much closer together than they are written here while the pen
  // stays the width it is — so a connector authored to end a hair short of the
  // stem ends up touching it. Sixty-two per cent of the way across leaves the
  // gap the face leaves, at the width the face uses.
  ㅐ: [vertical(35), stroke([[35, 50], [57, 50]]), vertical(70)],
  ㅔ: [stroke([[16, 50], [44, 50]]), vertical(44), vertical(74)],
  ㅒ: [
    vertical(30),
    stroke([[30, 35], [56, 35]]),
    stroke([[30, 65], [56, 65]]),
    vertical(72),
  ],
  ㅖ: [
    stroke([[12, 35], [42, 35]]),
    stroke([[12, 65], [42, 65]]),
    vertical(42),
    vertical(74),
  ],
  ㅘ: [
    stroke([[26, 18], [26, 52]]),
    stroke([[6, 52], [48, 52]]),
    vertical(68),
    stroke([[68, 50], [92, 50]]),
  ],
  ㅝ: [
    stroke([[6, 38], [48, 38]]),
    stroke([[26, 38], [26, 78]]),
    stroke([[56, 50], [76, 50]]),
    vertical(76),
  ],
  ㅚ: [stroke([[30, 18], [30, 52]]), stroke([[8, 52], [56, 52]]), vertical(78)],
  ㅟ: [stroke([[8, 38], [56, 38]]), stroke([[30, 38], [30, 80]]), vertical(78)],
  /*
    ㅗ, then the ㅐ — and the ㅐ has to look like a ㅐ.

    Its two uprights were 28 apart in a letter 100 wide, which measures 31 of
    the ink box against Pretendard's 24. Nearly a third too wide, and what that
    costs is not subtle: the branch reaches out of the first upright and stops
    in open paper, and the second upright reads as a bar standing on its own
    rather than as the other half of a ㅐ. A learner copying it writes ㅗ ㅏ ㅣ.

    69 and 93 of the ink box is where the face puts them, which is 63 and 84
    here once the pen is accounted for, and the branch keeps the standalone ㅐ's
    proportion — a little under two thirds of the gap.
  */
  ㅙ: [
    stroke([[22, 18], [22, 52]]),
    stroke([[4, 52], [42, 52]]),
    vertical(63),
    stroke([[63, 50], [77, 50]]),
    vertical(84),
  ],
  /*
    ㅜ, then the ㅔ, and the same correction as ㅙ above.

    The uprights measured 76 and 95 of the ink box against the face's 71 and
    93 — pushed right and squeezed, so the ㅔ sat against the edge with its
    connector a stub between two bars. 65 and 86 here puts them where the face
    has them.

    The connector stays low. Authored level with the middle of the box it
    landed a stroke's width above the ink it was meant to claim, the claim went
    to the upright beside it, and it was left holding a scrap of somebody
    else's letter with its route drawn through empty paper — which is what
    `strokes:visual` is for and what it caught.
  */
  ㅞ: [
    stroke([[4, 38], [42, 38]]),
    stroke([[22, 38], [22, 78]]),
    stroke([[52, 62], [65, 62]]),
    vertical(65),
    vertical(86),
  ],
  ㅢ: [stroke([[10, 55], [60, 55]]), vertical(78)],

  // --- Basic consonants -----------------------------------------------------
  ㄱ: [giyeok(20, 78)],
  ㄴ: [nieun(26, 82)],
  ㄷ: digeut(24, 80),
  ㄹ: [
    // The ㄱ on top, the waist, then the ㄴ underneath.
    // The three bars line up on both edges, as the face's do. Authored with the
    // ㄱ's leg leaning in and the ㄴ's upright set in from the bar, the letter
    // stepped in and out down its own sides and the leaning leg made a long
    // mitred beak at the top corner.
    stroke([[22, 16], [76, 16], [76, 44]]),
    stroke([[22, 46], [76, 46]]),
    stroke([[22, 48], [22, 82], [76, 82]]),
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
  ㅌ: [
    stroke([[24, 18], [80, 18]]),
    stroke([[26, 48], [80, 48]]),
    stroke([[24, 20], [24, 80], [80, 80]]),
  ],
  ㅍ: [
    stroke([[18, 24], [82, 24]]),
    stroke([[32, 24], [32, 74]]),
    stroke([[68, 24], [68, 74]]),
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
