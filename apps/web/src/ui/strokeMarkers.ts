import type { VectorStroke } from '../data/strokeVectors';

/**
 * Where each stroke's number goes.
 *
 * ## The number points at the place the pen lands; it does not sit on it
 *
 * A stroke-order diagram's numbers are not a legend. They are an instruction —
 * *put the pen here, and go that way* — so a number that drifts off its stroke
 * is wrong. For a long time the answer to that was to put the disc *on* the
 * stroke, just behind its start, and the file said so: it touches the ink it
 * labels, and touching is the point.
 *
 * Touching was never the point. **Pointing** was, and a disc eight units across
 * dropped on a stroke twelve units long does not point at it, it replaces it.
 * That is what a learner was shown for 안: a ㅇ, the ㅏ's stem, and an orange
 * 3 where the ㅏ's branch should be — 62% of the stroke under the number that
 * was supposed to be naming it, and the same again on 아, on 꽃, on 어, 오, 부
 * and 우.
 *
 * So the disc has moved off the letter entirely and a hairline does the
 * pointing:
 *
 * ```
 * A badge clears all ink — the stroke it names as well as every other —
 * and a leader line connects it back to the place the pen lands.
 * ```
 *
 * The leader is the only thing allowed to cross the glyph, and it is allowed
 * because a one-unit hairline over a nine-unit pen hides nothing. The anchor
 * never moves.
 *
 * ## This used to be much harder than it is
 *
 * The previous stroke model cut each stroke out of a rasterised glyph and
 * re-read its route from the ink, which meant the recorded start was not the
 * start: it sat about half a sampling band inside the stroke — a pixel or two
 * on a thin letter, eleven units on ㄴ, whose pen is nine units wide. A disc
 * placed behind *that* floated clear of the letter with nothing under it. So
 * this file used to walk backwards along the stroke, testing point-in-polygon
 * against the traced outline, to find where the ink actually ended; and it
 * needed a second walk for ㅍ, whose second stroke came out of the cut as two
 * islands with the route starting in the gap between them.
 *
 * None of that is needed now. `data/strokeVectors` is authored geometry: a
 * stroke's `start` is where the pen lands, exactly, and `heading` is the
 * direction it sets off in. Both are read straight off the same path the ink is
 * drawn from. There is no outline to trace, no polygon to test against, and no
 * way for a marker to come unstuck from its stroke.
 *
 * ## One coordinate system, shared with the ink
 *
 * Everything here is in the glyph's own `0 0 100 100` viewBox, and every caller
 * — the lesson demonstration, the writing screen's helper, the gallery, the QA
 * sheet — draws the discs inside the same `<svg>` as the paths. There is no
 * second transform that could drift, and a marker cannot come unstuck at a
 * different screen size because neither it nor the path knows what size it is
 * being drawn at. Text scaling, dark mode and the phone's width move the `<svg>`
 * and never the layout inside it.
 *
 * ## Why the badge is allowed to move and the anchor is not
 *
 * Clearing the ink is a search, not a direction — on a dense block the room
 * left over after seven strokes is narrow — and two strokes can start close
 * together, 글's fourth and fifth about a pen's width apart, so two discs that
 * both cleared the ink could still land on each other. The disc therefore turns
 * and steps outwards until it finds room from the letter, from the discs
 * already placed and from the edge of the box. Whatever it had to do to be
 * legible, the leader still points at the place the pen goes.
 *
 * `strokeMarkers.test.ts` holds the invariant this file exists for, measured
 * over every character the curriculum teaches; `npm run strokes:visual` draws
 * the contact sheet a person looks at.
 */
export interface StrokeMarker {
  order: number;
  /** Where the pen lands. The disc points here and the tether ends here. */
  anchor: { x: number; y: number };
  /** Where the numbered disc is drawn. Displaced only to avoid a collision. */
  label: { x: number; y: number };
  /** Whether the two are far enough apart to need a connecting hairline. */
  tethered: boolean;
}

/**
 * Turns away from the stroke's own direction, in the order they are tried.
 *
 * Every ten degrees, nearest-to-the-opening-direction first, so a badge
 * only turns as far as it has to and the common case — nothing in the way —
 * puts the number behind the stroke, where the hand comes from.
 *
 * Twelve coarse turns were not enough once the badge had to clear its *own*
 * ink as well as everybody else's: on a short stroke wedged between two others
 * — 안's third, 꽃's third — the clear direction is a narrow window, and a
 * thirty-degree sweep steps straight over it.
 */
const TURNS = ((): number[] => {
  const turns: number[] = [0];
  for (let degrees = 10; degrees <= 180; degrees += 10) {
    turns.push(-degrees, degrees);
  }
  return turns;
})();

/**
 * How far out to step past the first clear rung, as multiples of the radius.
 *
 * The rungs are *relative* now. Where the badge sits is decided by how wide the
 * pen is and how big the badge is — a disc has to be `pen / 2 + radius` from
 * the centreline before it stops touching the ink at all — so the first rung is
 * computed rather than written down, and these are the escape routes past it.
 *
 * Close together near the bottom, because the first rung that clears is almost
 * always within half a radius of the last one that did not, and a coarse ladder
 * throws away a good placement to land on a worse one further out. 꽃's seventh
 * badge — the last of seven in one box, choosing from what the other six left —
 * missed by 0.013 units on the coarse ladder and lands on the fine one.
 */
const REACH_STEPS = [0, 0.15, 0.3, 0.5, 0.65, 0.85, 1.05, 1.3, 1.5, 1.75, 2.05, 2.35, 2.7, 3.1];

/**
 * The breathing space a badge keeps from ink it is not allowed to sit on, as a
 * fraction of its radius.
 *
 * Not zero, because a disc drawn exactly tangent to a stroke reads as touching
 * it: the badge has a border, the ink has an anti-aliased edge, and at a phone
 * size the two merge. A tenth of a radius is under half a pixel at 160 px and
 * is the difference between "beside" and "on".
 */
const INK_MARGIN = 0.12;

/**
 * The pen width the markers assume when deciding what counts as *on the ink*.
 *
 * The demonstration strokes at 9 units in a 100-unit box. It is a constant here
 * rather than a parameter because every caller draws at that width and a marker
 * layout that changed with the pen would move between the lesson, the writing
 * helper and the gallery — which are the same picture.
 */
const PEN = 9;

/**
 * How far a badge may be displaced before a hairline is drawn back to the
 * anchor, as a multiple of the radius.
 *
 * Low, because under the clear-space rule below almost every badge *is*
 * displaced — it has to be, to stop covering the stroke it names — and a badge
 * sitting off the letter with no line back to it has stopped being an
 * instruction about where the pen goes.
 */
const TETHER_AT = 1.2;

/**
 * Where every badge goes, for one glyph.
 *
 * ## The rule, and the one it replaced
 *
 * The badge used to be allowed to sit on the stroke it labelled — that was
 * stated as the point of it, and for a long stroke it is harmless: a disc on
 * the top of ㄹ's 111-unit route hides a tenth of it and the letter is still a
 * ㄹ.
 *
 * It is not harmless on a short one, and the curriculum is full of short ones.
 * `ㅏ`'s branch in 안 is **12.3 units** long and the badge is 8 across: placed
 * one radius back along the stroke's own opening direction, disc 3 covered
 * **62% of the stroke it was pointing at**. A learner reading that screen is
 * shown a ㅇ, a stem, and an orange circle where the branch should be — which
 * is to say they are shown the wrong letter, on the screen whose whole job is
 * to show them the right one. 아 was the same, 꽃's third was at 49%, and 어,
 * 오, 부 and 우 were all past 30%.
 *
 * So the rule is now the same for every piece of ink in the glyph:
 *
 * ```
 * A badge clears all ink — the stroke it names as well as every other —
 * and a hairline connects it back to the place the pen lands.
 * ```
 *
 * The anchor still never moves. Whatever the disc had to do to be legible, the
 * line still points at the start of the stroke, and the line is the only thing
 * permitted to cross the letter.
 *
 * ## Why this is a search and not a formula
 *
 * "Outside the ink" is not a direction; it is whatever is left over after seven
 * strokes have taken their space, and on a dense block — 꽃, 밤, 한 — the
 * leftovers are narrow. So candidates are generated around the anchor, nearest
 * first, and the first one that clears every stroke, every badge already
 * placed, and the edge of the box wins. Nearest-first is what keeps the badge
 * associated with its own stroke: it moves as little as it can get away with.
 *
 * Nothing here knows what size it will be drawn at. Every coordinate is in the
 * glyph's own `0 0 100 100` box, shared with the paths, so the layout is
 * identical on a 320 px phone, a tablet, the QA contact sheet and the grading
 * mask — and cannot drift between them.
 */
export function layoutMarkers(strokes: VectorStroke[], radius: number): StrokeMarker[] {
  /*
   * How near the edge of the box a disc may be drawn: touching it, not inset
   * from it.
   *
   * This was `radius + 1.5`, a tidiness margin from when the disc sat on the
   * ink and never needed the room. Under the clear-space rule it costs
   * placements: ㅞ is five strokes crowded against the right of the box, every
   * clear position for its last badge is in that outer band, and clamping
   * pushed the disc back onto the ink it had just escaped. Three units of
   * whitespace is not worth a number drawn on a letter.
   */
  const edge = radius;
  const placed: StrokeMarker[] = [];
  // The distance at which a disc's edge stops touching a stroke's edge. Below
  // this the badge is on the ink whatever direction it went in, so there is no
  // point offering the search a rung it can never accept.
  const clear = (PEN / 2 + radius * (1 + INK_MARGIN)) / radius;

  for (const stroke of strokes) {
    const anchor = { x: stroke.start[0], y: stroke.start[1] };
    // Back down the stroke's own opening direction: the badge sits where the
    // hand comes from, not where it is going.
    const away = Math.atan2(-stroke.heading[1], -stroke.heading[0]);

    let best: { x: number; y: number } | null = null;
    let bestClearance = -Infinity;
    let settled = false;

    for (const step of REACH_STEPS) {
      const reach = clear + step;
      for (const turn of TURNS) {
        const angle = away + (turn * Math.PI) / 180;
        const label = {
          x: clamp(anchor.x + Math.cos(angle) * radius * reach, edge, 100 - edge),
          y: clamp(anchor.y + Math.sin(angle) * radius * reach, edge, 100 - edge),
        };
        const clearance = clearanceAt(label, stroke, strokes, placed, radius);
        if (clearance >= 0) {
          best = label;
          bestClearance = clearance;
          settled = true;
          break;
        }
        if (clearance > bestClearance) {
          bestClearance = clearance;
          best = label;
        }
      }
      if (settled) break;
    }

    const label = best ?? { x: anchor.x, y: anchor.y };
    placed.push({
      order: stroke.order,
      anchor,
      label,
      tethered: Math.hypot(label.x - anchor.x, label.y - anchor.y) > radius * TETHER_AT,
    });
  }

  return placed;
}

/**
 * How much room a candidate position leaves everything it must not touch.
 *
 * Negative is an overlap, and the worst offender is what is returned — a badge
 * is only as well placed as its closest collision. Three things are measured
 * against, and the first is the one that changed:
 *
 * * **Every stroke in the glyph, its own included.** See `layoutMarkers`.
 * * **Every badge already placed.** Two discs need their diameters apart plus a
 *   hair, or they read as one smudge — 글's fourth and fifth strokes begin a
 *   pen's width apart and produced exactly that.
 * * Nothing else. The edge of the box is handled by clamping the candidate
 *   before it gets here, so a badge cannot be pushed off the paper.
 */
function clearanceAt(
  label: { x: number; y: number },
  own: VectorStroke,
  strokes: VectorStroke[],
  placed: StrokeMarker[],
  radius: number,
): number {
  let clearance = Infinity;
  for (const other of placed) {
    const gap = Math.hypot(label.x - other.label.x, label.y - other.label.y) - (radius * 2 + 0.8);
    if (gap < clearance) clearance = gap;
  }
  for (const stroke of strokes) {
    // `own` is in this loop on purpose, and is the whole point of the rule.
    void own;
    const gap = inkDistance(stroke, label, PEN) - radius * (1 + INK_MARGIN);
    if (gap < clearance) clearance = gap;
  }
  return clearance;
}

/**
 * Distance from a point to a stroke's ink, with the caps rounded rather than cut.
 *
 * This is `distanceToStroke` without its butt-cap rule, and the difference is
 * the last of the overlap. `distanceToStroke` answers *is this point on the
 * ink*, and for that the flat cap matters: a point three quarters of a unit
 * above ㅏ's stem is off the letter, and saying otherwise moved the anchor test
 * onto paper. A **badge** is not a point. Its edge reaches a whole radius past
 * its centre, so a disc whose centre sits just beyond the cap plane still lands
 * on the last few units of the stroke — which is how ㅏ, ㅣ, ㅗ, ㅜ and fifteen
 * more kept 6% of their stem under disc 1 after the clear-space rule went in,
 * and how ㅎ kept 20% of its lid.
 *
 * Rounding the caps overstates the ink by half a pen at each end. That is the
 * safe direction to be wrong in: the badge is pushed a fraction further out and
 * nothing is covered. Being wrong the other way is a number drawn on a letter.
 *
 * Exported so the placement, the test and `strokes:visual` all ask the same
 * question. A second copy of this in the gate would be a second opinion about
 * where the ink is, and the day the two disagreed the gate would be certifying
 * a rule the product does not follow.
 */
export function inkDistance(
  stroke: VectorStroke,
  point: { x: number; y: number },
  pen: number,
): number {
  const points = flatten(stroke.d);
  if (points.length === 1) {
    return Math.hypot(point.x - points[0]!.x, point.y - points[0]!.y) - pen / 2;
  }
  let nearest = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    const hit = nearestOnSegment(point, points[i - 1]!, points[i]!);
    if (hit.distance < nearest) nearest = hit.distance;
  }
  return nearest - pen / 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * How far a point lies from a stroke's ink, in viewBox units. Negative is on it.
 *
 * The stroke is a stroked centreline, so "on the ink" is "within half a pen of
 * the path" — which is a distance, not a polygon test. Exported because it is
 * what makes the marker rule checkable: `strokeMarkers.test.ts` asserts every
 * anchor is on its own stroke, and a second copy of this in the test would be a
 * second answer that could disagree with the first.
 */
export function distanceToStroke(
  stroke: VectorStroke,
  point: { x: number; y: number },
  pen: number,
): number {
  const points = flatten(stroke.d);
  if (points.length === 1) {
    return Math.hypot(point.x - points[0]!.x, point.y - points[0]!.y) - pen / 2;
  }

  let nearest = Infinity;
  let atSegment = 0;
  let atParameter = 0;
  for (let i = 1; i < points.length; i += 1) {
    const hit = nearestOnSegment(point, points[i - 1]!, points[i]!);
    if (hit.distance < nearest) {
      nearest = hit.distance;
      atSegment = i;
      atParameter = hit.t;
    }
  }

  /*
   * The caps are butt, so the ink stops flat at each end rather than bulging
   * half a pen past it. Distance to the centreline alone would say a point
   * three quarters of a unit above ㅏ's stem is on the stem — it is within half
   * a pen of the stem's top — when on the paper it is clear of the letter.
   *
   * The rule applies only where the nearest point on the path *is* a terminal,
   * which is the thing the cap actually cuts. Applied as a half-plane over the
   * whole path instead, a point can be on the far side of the end's plane while
   * being nowhere near that end — the start of 구's ㄱ is past the plane of its
   * own leg's tip, twenty units away from it, and was called outside the stroke
   * it begins.
   */
  if (!stroke.closed) {
    // Strictly past, not at: the flat cap is the last of the ink, not the
    // first of the paper, so a point exactly on the terminal is on the stroke.
    if (atSegment === 1 && atParameter < -1e-9) return Infinity;
    if (atSegment === points.length - 1 && atParameter > 1 + 1e-9) return Infinity;
  }

  return nearest - pen / 2;
}

/** A path flattened to points. Cubics are sampled; everything else is a corner. */
function flatten(d: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const commands = d.match(/[MLCZ][^MLCZ]*/g) ?? [];
  let current = { x: 0, y: 0 };
  let first = { x: 0, y: 0 };
  for (const command of commands) {
    const numbers = (command.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (command[0] === 'M') {
      current = { x: numbers[0]!, y: numbers[1]! };
      first = current;
      out.push(current);
    } else if (command[0] === 'L') {
      current = { x: numbers[0]!, y: numbers[1]! };
      out.push(current);
    } else if (command[0] === 'C') {
      const [c1x, c1y, c2x, c2y, x, y] = numbers as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      for (let step = 1; step <= 12; step += 1) {
        const t = step / 12;
        const u = 1 - t;
        out.push({
          x: u * u * u * current.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
          y: u * u * u * current.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
        });
      }
      current = { x, y };
    } else {
      out.push(first);
      current = first;
    }
  }
  return out;
}

function nearestOnSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { distance: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-9) return { distance: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  const raw = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  return {
    distance: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)),
    // The unclamped parameter, so a caller can tell "at the end" from "past it".
    t: raw,
  };
}
