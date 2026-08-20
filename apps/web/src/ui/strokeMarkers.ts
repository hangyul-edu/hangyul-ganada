import type { StrokeShape } from '../data/strokeAssets';
import { drawPoints } from '../data/strokeAssets';

/**
 * Where the numbered markers go.
 *
 * ## The number belongs to a point, not to a region
 *
 * Each number answers "start here, then here" — so it is anchored to the
 * stroke's own starting point, the one place a number is unambiguous. A label
 * floated beside the character would have to be matched to its stroke by eye,
 * which is the thing the number exists to save the learner from doing.
 *
 * ## The starting point is the tip, not the first point of the route
 *
 * These are two different places, and taking the second for the first is what
 * made the badges look detached. `stroke.start` is where the *drawn route*
 * begins, and the route is a run of band centres re-read from the ink — so it
 * begins about half a band inside the stroke rather than at the end of it. On a
 * thin letter that is a pixel or two and nobody notices. On ㄴ, whose pen is
 * nine units across, it is eleven units: the recorded start sits a fifth of the
 * way down the vertical, and a disc placed behind it cleared the letter
 * entirely and hung on blank paper.
 *
 * So the anchor walks back along the stroke's own opening direction until it
 * leaves the outline, and stops on the last point still on the ink — see
 * `strokeTip`. That is read from the same validated shape the ink is drawn
 * from, at build-frozen coordinates, with no per-character constant anywhere:
 * fix the shape and the numbers follow it.
 *
 * ## One coordinate system, shared with the ink
 *
 * Everything here is in the asset's own `0 0 100 100` viewBox, and every caller
 * — the lesson demonstration, the writing screen's helper, the gallery, the QA
 * sheet — draws the discs inside the same `<svg>` as the paths. There is no
 * second transform that could drift, and a marker cannot come unstuck from its
 * stroke at a different screen size because neither of them knows what size it
 * is being drawn at.
 *
 * ## Why the bubble is allowed to move and the anchor is not
 *
 * In a block like 글, four strokes begin within a few units of each other — the
 * ㅡ and all three bars of the ㄹ start at the same left edge. Drawn where they
 * belong, the discs pile into an unreadable stack, which is what the demo used
 * to do. So the anchor stays exactly on the validated start point and only the
 * *bubble* is displaced, along a fixed ladder of candidate positions, until it
 * clears the ones already placed and sits inside the frame. When a bubble ends
 * up far enough from its anchor to be ambiguous, a hairline joins the two.
 *
 * The ladder is fixed and walked in the same order every time, so a given
 * character lays out identically on every render, in every build, forever. It is
 * deliberately not a relaxation or a force simulation: those settle differently
 * depending on where they start, and a diagram that rearranges itself between
 * two runs of the same lesson is a diagram a learner cannot get used to.
 */

export interface StrokeMarker {
  order: number;
  /** The stroke's real starting point. Never moved. */
  anchor: { x: number; y: number };
  /** Where the numbered disc is drawn. Displaced only to avoid a collision. */
  label: { x: number; y: number };
  /** Whether the two are far enough apart to need a connecting hairline. */
  tethered: boolean;
}

/**
 * Turns away from the stroke's own direction, in the order they are tried.
 *
 * Nearest-to-the-stroke first, so a marker only moves as far as it has to and
 * the common case — nothing in the way — puts the number exactly where the pen
 * lands.
 */
const TURNS = [0, -30, 30, -60, 60, -90, 90, -120, 120, -150, 150, 180];

/**
 * How far out to push, as multiples of the marker's radius.
 *
 * The first rung is one radius, so the disc's near edge lands exactly on the
 * tip: touching the stroke rather than hovering near it. The rest are escape
 * routes for a collision — five rather than three because 글's fourth and fifth
 * strokes begin a stroke's width apart, and with three rungs they ran out of
 * candidates and settled for overlapping anyway.
 */
const REACHES = [1.05, 1.6, 2.2, 2.9, 3.7];

/**
 * How far back a tip may be from the recorded start, in viewBox units.
 *
 * Generous — the inset is about half a sampling band, which on a thick letter
 * like ㄴ is eleven units — and bounded, because a stroke with no free end in
 * that direction must not be walked all the way round. See `strokeTip`.
 */
const TIP_REACH = 16;

/** How finely the walk steps. Half a unit is a twentieth of a pen width. */
const TIP_STEP = 0.5;

export function layoutMarkers(strokes: StrokeShape[], radius: number): StrokeMarker[] {
  const edge = radius + 1.5;
  const placed: StrokeMarker[] = [];

  for (const stroke of strokes) {
    const points = drawPoints(stroke.draw);
    const from = points[0] ?? { x: 50, y: 50 };

    /*
     * The bubble sits back along the stroke rather than on top of it, so the
     * ink it is labelling stays visible underneath. Where the stroke has no
     * length to speak of, up-left is as good as any other direction and is at
     * least the same one every time.
     */
    const next = points.find((p) => Math.hypot(p.x - from.x, p.y - from.y) > 0.5) ?? {
      x: from.x + 1,
      y: from.y + 1,
    };
    const away = Math.atan2(from.y - next.y, from.x - next.x);

    /*
     * The number points at the tip of the stroke, not at the first point of its
     * route.
     *
     * `stroke.start` is where the *drawn path* begins, and the drawn path is a
     * run of band centres re-read from the ink — so it starts about half a band
     * inside the stroke rather than at its end. On a thin letter that is a
     * pixel or two. On ㄴ, whose pen is nine units wide, it is eleven: the
     * recorded start sits a fifth of the way down the vertical, and the marker
     * placed behind it floated clear of the ink with nothing under it. The
     * badge looked like a label near the letter instead of a mark on the place
     * the pen lands.
     *
     * So the anchor walks back along the stroke's own opening direction until it
     * leaves the stroke's outline, and stops on the last point still inside.
     * That is geometry, from the same validated shape the ink is drawn from —
     * no per-character constant, and nothing that can drift from what is on
     * screen.
     */
    const anchor = strokeTip(stroke, from, away);

    let best: { x: number; y: number } | null = null;
    let bestClearance = -Infinity;

    for (const reach of REACHES) {
      for (const turn of TURNS) {
        const angle = away + (turn * Math.PI) / 180;
        const label = {
          x: clamp(anchor.x + Math.cos(angle) * radius * reach, edge, 100 - edge),
          y: clamp(anchor.y + Math.sin(angle) * radius * reach, edge, 100 - edge),
        };
        // How much room this leaves the markers already down. Two discs need
        // their diameters apart plus a hair, or they read as one smudge.
        let clearance = Infinity;
        for (const other of placed) {
          const gap =
            Math.hypot(label.x - other.label.x, label.y - other.label.y) - (radius * 2 + 0.8);
          if (gap < clearance) clearance = gap;
        }
        if (clearance >= 0) {
          best = label;
          bestClearance = clearance;
          break;
        }
        if (clearance > bestClearance) {
          bestClearance = clearance;
          best = label;
        }
      }
      if (bestClearance >= 0) break;
    }

    const label = best ?? { x: anchor.x, y: anchor.y };
    placed.push({
      order: stroke.order,
      anchor,
      label,
      tethered: Math.hypot(label.x - anchor.x, label.y - anchor.y) > radius * 1.6,
    });
  }

  return placed;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The point where the stroke actually begins, walking back from its route.
 *
 * Steps backwards along the stroke's opening direction and returns the last
 * point still inside its outline. If the walk never leaves — a closed ring like
 * ㅇ, where "backwards" runs round the circle rather than off the end — the
 * recorded start is returned unchanged, because a stroke with no free end in
 * that direction has no tip to find and marching on would carry the number a
 * quarter of the way round the letter.
 */
function strokeTip(
  stroke: StrokeShape,
  from: { x: number; y: number },
  away: number,
): { x: number; y: number } {
  const outline = rings(stroke.shape);
  if (outline.length === 0) return { x: from.x, y: from.y };

  /*
   * Start the walk from ink, which is not always where the route starts.
   *
   * ㅍ's second stroke is cut into two islands with a five-unit gap between
   * them, and its route begins in that gap — on no ink at all. Walking back
   * from there would step further into nothing and the number would be pinned
   * to empty paper. So the walk begins at the first point of the route that is
   * actually on the stroke, and only then looks for the end.
   */
  const origin = inside(outline, from) ? from : firstOnInk(stroke, outline) ?? from;
  if (!inside(outline, origin)) return { x: origin.x, y: origin.y };

  const dx = Math.cos(away) * TIP_STEP;
  const dy = Math.sin(away) * TIP_STEP;
  let last = { x: origin.x, y: origin.y };
  for (let step = 1; step * TIP_STEP <= TIP_REACH; step += 1) {
    const point = { x: origin.x + dx * step, y: origin.y + dy * step };
    if (!inside(outline, point)) return last;
    last = point;
  }
  // Never came out: no free end this way.
  return { x: origin.x, y: origin.y };
}

/**
 * The first point of the drawn route that is actually on the stroke.
 *
 * Sampled along the route at the same step as the walk, so a gap between two
 * islands is crossed rather than fallen into.
 */
function firstOnInk(
  stroke: StrokeShape,
  outline: Array<Array<{ x: number; y: number }>>,
): { x: number; y: number } | null {
  const route = drawPoints(stroke.draw);
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1]!;
    const b = route[i]!;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(span / TIP_STEP));
    for (let step = 0; step <= steps; step += 1) {
      const point = { x: a.x + ((b.x - a.x) * step) / steps, y: a.y + ((b.y - a.y) * step) / steps };
      if (inside(outline, point)) return point;
    }
  }
  return null;
}

/**
 * Whether a point lies on a stroke's own ink.
 *
 * Exported because it is what makes the marker rule testable: "the number is on
 * the tip" is only checkable against the same outline the tip was found from,
 * and a second copy of this in a test would be a second answer that could
 * disagree with the first.
 */
export function insideStroke(stroke: StrokeShape, point: { x: number; y: number }): boolean {
  return inside(rings(stroke.shape), point);
}

/**
 * A stroke's filled outline, as closed rings of points.
 *
 * The shapes are polygons — the contour tracer in `build-stroke-assets.mjs`
 * emits only `M`, `L` and `Z` — so this needs no curve handling, and a stroke
 * with a hole in it (ㅇ) or two islands (ㅅ's foot) simply arrives as more than
 * one ring.
 */
function rings(shape: string): Array<Array<{ x: number; y: number }>> {
  const out: Array<Array<{ x: number; y: number }>> = [];
  for (const part of shape.split('M').slice(1)) {
    const numbers = part.match(/-?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 6) continue;
    const ring: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      ring.push({ x: Number(numbers[i]), y: Number(numbers[i + 1]) });
    }
    out.push(ring);
  }
  return out;
}

/**
 * Even-odd point-in-polygon, over every ring at once.
 *
 * Even-odd rather than nonzero so that a hole counts as outside without this
 * having to know which ring is a hole and which is a wall — crossing the ring of
 * ㅇ twice puts you back out, which is the answer wanted.
 */
function inside(outline: Array<Array<{ x: number; y: number }>>, point: { x: number; y: number }): boolean {
  let within = false;
  for (const ring of outline) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > point.y !== b.y > point.y) {
        const at = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
        if (point.x < at) within = !within;
      }
    }
  }
  return within;
}
