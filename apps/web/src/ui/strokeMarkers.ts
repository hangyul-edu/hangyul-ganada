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
 * Five rungs rather than three. With three, 글's fourth and fifth strokes — which
 * begin a stroke's width apart — ran out of candidates and settled for
 * overlapping anyway, which is the defect this whole ladder exists to prevent.
 */
const REACHES = [1.15, 1.7, 2.3, 3.0, 3.8];

export function layoutMarkers(strokes: StrokeShape[], radius: number): StrokeMarker[] {
  const edge = radius + 1.5;
  const placed: StrokeMarker[] = [];

  for (const stroke of strokes) {
    const points = drawPoints(stroke.draw);
    const from = points[0] ?? { x: 50, y: 50 };
    const anchor = { x: stroke.start[0], y: stroke.start[1] };

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
