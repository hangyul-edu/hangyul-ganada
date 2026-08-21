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
 * The leg comes back about a quarter of the letter's width as it descends, on a
 * gentle curve. That number is measured, not guessed — twice now, because the
 * first guess was wrong in both directions.
 *
 * Rendering the practice face and reading the ink off it row by row: in 가 and
 * 거, where the ㄱ is tall, the leg's centre travels from 0.49 of the block to
 * 0.34 as it falls, a shift of a bit over a quarter of the letter. In 고 and
 * 국, where the ㄱ is squat, the leg comes straight down. One polyline cannot
 * be both — but it does not have to be, because the block that wants the
 * upright version is also the block that squashes the letter horizontally, and
 * squashing a leaning leg is what makes it upright.
 *
 * The middle point is the curve. The leg is an arc, and two segments follow an
 * arc closely enough for a demonstration that reveals the same path it draws.
 */
function giyeok(left: number, right: number, top = 20, bottom = 80, lean = 0.28): StrokeStep {
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
    [
      [left, top],
      [right, top],
      [right - width * 0.08, top + height * 0.55],
      [toe, bottom],
    ],
    // The corner, then the leg as one cubic rather than two chords of it. The
    // controls are placed so the curve leaves the corner travelling straight
    // down — which is what makes the corner a clean right angle instead of a
    // chamfer — and passes through the same waist the polyline does.
    [
      [left, top, right, top, right, top],
      [right, top + height * 0.45, toe + width * 0.16, bottom - height * 0.32, toe, bottom],
    ],
  );
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
  ㅙ: [
    stroke([[22, 18], [22, 52]]),
    stroke([[4, 52], [42, 52]]),
    vertical(58),
    stroke([[58, 50], [78, 50]]),
    vertical(86),
  ],
  ㅞ: [
    stroke([[4, 38], [42, 38]]),
    stroke([[22, 38], [22, 78]]),
    // The ㅔ's connector sits low here, under the ㅜ's bar rather than level
    // with the middle of the box. Authored at 50 it landed a stroke's width
    // above the ink it was meant to claim, the claim went to the upright
    // beside it, and the connector was left holding a scrap of somebody else's
    // letter with its route drawn through empty paper.
    stroke([[50, 62], [70, 62]]),
    vertical(70),
    vertical(88),
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
    stroke([[36, 10], [64, 10]]),
    stroke([[20, 32], [80, 32]]),
    // Clear of the bar, not touching it. At r = 24 the top of the bowl's ink
    // and the underside of the bar's overlapped by three units and the two
    // read as one shape — the face leaves a visible gap and so does this.
    circle(50, 64, 19),
  ],

  // --- Aspirates: the plain letter with a stroke added ----------------------
  // The mark on top is a short *horizontal* in this face, not the upright a
  // diagram usually draws. Authored as one because these polylines are matched
  // against the reference glyph, and an upright over a horizontal bar left the
  // pen travelling twelve units down through blank paper while the bar it was
  // supposed to be drawing sat above it. See `strokes:visual`, which measures
  // exactly that.
  ㅊ: [stroke([[36, 12], [64, 12]]), ...jieut(18, 82, 30)],
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
 * The letters whose *isolated* form differs from the one written inside a block.
 *
 * ## This is the face's own distinction, not a preference
 *
 * Rendering Pretendard's ㄱ four ways settles it. Alone — the glyph on a lesson
 * about the letter ㄱ — the leg comes **straight down** from a square corner.
 * In 가 and 거, where the block gives ㄱ a tall narrow slot, the leg **leans and
 * curves** away to the left, a real 7. In 고 and 국, where the slot is squat, it
 * is straight again. ㅋ and ㄲ follow ㄱ.
 *
 * `STROKE_ORDER` holds the leaning form because that is the one composition
 * needs, and the squat blocks get the upright version for free: the slot that
 * wants it is also the slot that squashes the letter horizontally, and squashing
 * a leaning leg is what straightens it. What that cannot produce is the
 * *unsquashed* upright form, which is exactly the isolated letter — so a lesson
 * on ㄱ drew a leaning leg directly above a reference glyph with a straight one.
 *
 * Only `data/strokeVectors` reads this, and only for a letter on its own.
 * `compose.ts` never does: inside a block, `STROKE_ORDER` is right.
 */
export const STROKE_ORDER_ALONE: Record<string, StrokeStep[]> = {
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
