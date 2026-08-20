import type { StrokeStep } from '@hangyul-ganada/shared-types';

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

function stroke(points: Points): StrokeStep {
  return { points: points.map(([x, y]) => ({ x: x / 100, y: y / 100 })) };
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
function giyeok(left: number, right: number, top = 20, bottom = 80): StrokeStep {
  const width = right - left;
  const height = bottom - top;
  return stroke([
    [left, top],
    [right, top],
    [right - width * 0.08, top + height * 0.55],
    [right - width * 0.28, bottom],
  ]);
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
  return [
    stroke([
      [apexX, top],
      [left, bottom],
    ]),
    stroke([
      [apexX - (apexX - left) * branch, top + (bottom - top) * branch],
      [right, bottom],
    ]),
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
 * Enough points to *be* a circle rather than to suggest one. Every stroke in
 * this file is drawn as a polyline, so the number of points is the resolution
 * of the curve, and twelve of them left ㅇ reading as a visible dodecagon on
 * screen — a learner looking at 어 saw a rough polygon and reasonably concluded
 * the app did not know what the letter looked like. Enough points that the
 * corners fall well under the ink, with room to spare for the ㅇ that gets
 * flattened most: a block squeezes it out of round, and squeezing a polygon
 * concentrates its turn into the flat ends of the ellipse.
 */
function circle(cx: number, cy: number, r: number): StrokeStep {
  const steps = 48;
  const points: Points = [];
  for (let i = 0; i <= steps; i += 1) {
    // Negative angle sweep: anticlockwise on a screen whose y grows downward.
    const angle = -Math.PI / 2 - (i / steps) * Math.PI * 2;
    points.push([
      Math.round((cx + r * Math.cos(angle)) * 10) / 10,
      Math.round((cy + r * Math.sin(angle)) * 10) / 10,
    ]);
  }
  return stroke(points);
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
  ㅐ: [vertical(35), stroke([[35, 50], [64, 50]]), vertical(70)],
  ㅔ: [stroke([[16, 50], [44, 50]]), vertical(44), vertical(74)],
  ㅒ: [
    vertical(30),
    stroke([[30, 35], [58, 35]]),
    stroke([[30, 65], [58, 65]]),
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
    stroke([[22, 16], [76, 16], [68, 44]]),
    stroke([[22, 46], [76, 46]]),
    stroke([[26, 48], [26, 82], [78, 82]]),
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
    circle(50, 62, 24),
  ],

  // --- Aspirates: the plain letter with a stroke added ----------------------
  // The mark on top is a short *horizontal* in this face, not the upright a
  // diagram usually draws. Authored as one because these polylines are matched
  // against the reference glyph, and an upright over a horizontal bar left the
  // pen travelling twelve units down through blank paper while the bar it was
  // supposed to be drawing sat above it. See `strokes:visual`, which measures
  // exactly that.
  ㅊ: [stroke([[36, 12], [64, 12]]), ...jieut(18, 82, 30)],
  ㅋ: [giyeok(20, 78, 18, 84), stroke([[26, 50], [74, 48]])],
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
