import type { VectorStroke } from '../data/strokeVectors';

/**
 * Where each stroke's number goes.
 *
 * ## The number sits on the place the pen lands
 *
 * A stroke-order diagram's numbers are not a legend. They are an instruction —
 * *put the pen here, and go that way* — so a number that drifts off its stroke
 * is not untidy, it is wrong. The disc is placed just behind the start, along
 * the stroke's own opening direction, so it touches the ink it labels without
 * covering it and points back the way the hand comes in.
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
 * being drawn at.
 *
 * ## Why the bubble is allowed to move and the anchor is not
 *
 * Two strokes can start close together — 글's fourth and fifth begin about a
 * pen's width apart — and two discs that overlap read as one smudge. So the
 * disc may turn and step outwards until it finds room, and when it has moved
 * far enough to stop touching its stroke a hairline tethers it back. The
 * anchor never moves: whatever the disc had to do to be legible, the line still
 * points at the place the pen goes.
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
 * Nearest-to-the-stroke first, so a marker only moves as far as it has to and
 * the common case — nothing in the way — puts the number exactly where the pen
 * lands.
 */
const TURNS = [0, -30, 30, -60, 60, -90, 90, -120, 120, -150, 150, 180];

/**
 * How far out to push, as multiples of the marker's radius.
 *
 * The first rung is one radius, so the disc's near edge lands on the start:
 * touching the stroke rather than hovering near it. The rest are escape routes
 * for a collision — five rather than three because 글's fourth and fifth
 * strokes begin a stroke's width apart, and with three rungs they ran out of
 * candidates and settled for overlapping anyway.
 */
const REACHES = [1.05, 1.6, 2.2, 2.9, 3.7];

/**
 * How much of the disc has to clear a stroke that is not its own, as a fraction
 * of its radius.
 *
 * This was 0.8, which lets the disc's near edge sit a fifth of a radius *inside*
 * another stroke's ink and still count as placed. On 안 that is the difference
 * between a legible diagram and an unreadable one: the third stroke starts on
 * the ㅏ's stem, every direction to its left is taken by the ㅇ, and the first
 * rung out to the right that scored non-negative put the disc's edge a hair
 * over the stem — a numbered circle sitting on the letter it is pointing at.
 *
 * At 1.0 the disc has to be wholly off foreign ink, and the search walks out
 * another rung to find room. A disc may still touch the stroke it labels: that
 * is the point of it.
 */
const FOREIGN_INK = 1;

/**
 * The pen width the markers assume when deciding what counts as *on the ink*.
 *
 * The demonstration strokes at 9 units in a 100-unit box. It is a constant here
 * rather than a parameter because every caller draws at that width and a marker
 * layout that changed with the pen would move between the lesson, the writing
 * helper and the gallery — which are the same picture.
 */
const PEN = 9;

export function layoutMarkers(strokes: VectorStroke[], radius: number): StrokeMarker[] {
  const edge = radius + 1.5;
  const placed: StrokeMarker[] = [];

  for (const stroke of strokes) {
    const anchor = { x: stroke.start[0], y: stroke.start[1] };
    // Back down the stroke's own opening direction: the disc sits where the
    // hand comes from, not where it is going.
    const away = Math.atan2(-stroke.heading[1], -stroke.heading[0]);

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
        /*
         * And how much room it leaves the *letter*.
         *
         * This used to consider only the other discs, and ㅊ is what that
         * costs. Its third stroke starts where the ㅅ hangs from the lid, and
         * the direction the pen comes from there points straight up — into the
         * short tick above the bar. The disc landed on the tick, disc 1 landed
         * on the top of it, and between them the stroke that makes a ㅈ into a
         * ㅊ was invisible. Two orange circles and a bar: a learner reading
         * that screen is being shown the wrong letter.
         *
         * A disc may still touch the stroke it labels — that is the whole
         * point of it, and `REACHES` starts at one radius so it does. What it
         * may not do is sit on a *different* stroke. The number is an
         * instruction about where the pen goes; covering the ink it is pointing
         * at makes it an obstacle instead.
         */
        for (const other of strokes) {
          if (other.order === stroke.order) continue;
          const gap = distanceToStroke(other, label, PEN) - radius * FOREIGN_INK;
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
