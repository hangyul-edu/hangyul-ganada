import type { StrokeStep } from '@hangyul-ganada/shared-types';

/**
 * One stroke, as one path.
 *
 * ## Why there is now exactly one of these per stroke
 *
 * The demonstration used to draw the character in the practice typeface and
 * uncover it, cutting the glyph's pixels into per-stroke territories. The
 * finished frame was the typeface exactly, which was the point — and every
 * frame before it was a seam. A completed stroke ended wherever its territory
 * ended, which is a straight edge across the middle of the ink: black stopping
 * in a rectangular block, a grey neighbour appearing to cut through it, a
 * half-written stroke reading as two disconnected pieces. There is no version
 * of that idea without those edges, because the edges *are* the idea.
 *
 * So the guide, the growing ink and the finished stroke are now the same path,
 * drawn three times. Nothing can disagree with anything, because there is
 * nothing else to disagree with: same `d`, same width, same caps. The only
 * thing that changes between the three is colour and how much of it is shown.
 *
 * ## What that costs, and why it is worth paying
 *
 * The demonstration is no longer pixel-identical to the reference glyph above
 * it — a written stroke has a round end where the typeface has a flat one. What
 * it keeps is the proportions and the composition, which come from measurements
 * of that same typeface (`data/compose.ts`), so the two still read as the same
 * character. A learner watching a character being written is watching a hand,
 * not a font; a rounded pen-end is what a hand leaves, and it is a far smaller
 * lie than a stroke that appears to break in half while it is being drawn.
 *
 * ## Curves, without rounding off corners
 *
 * The points are a polyline, and drawing them as line segments makes ㅇ a
 * 48-sided polygon. Drawing them all as one smooth curve instead rounds off
 * ㄱ's corner, which is worse — the corner is the letter.
 *
 * So the tangent at each point depends on how far the pen turns there. Below
 * `CORNER`, the point is on a curve and gets a Catmull-Rom tangent; at or above
 * it, the point is a corner and the curve runs straight into and straight out
 * of it. ㅇ comes out round, ㄱ keeps its elbow, and neither needed to be
 * special-cased by name.
 */

/** Past this much turn at a point, it is a corner rather than a curve. */
const CORNER = (32 * Math.PI) / 180;

/** How much of the neighbouring span a smooth tangent reaches. */
const TENSION = 1 / 3;

interface Point {
  x: number;
  y: number;
}

/** Whether a stroke's ends meet, as ㅇ's do. */
function isClosed(points: Point[]): boolean {
  if (points.length < 4) return false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(last.x - first.x, last.y - first.y) < 1e-6;
}

/** The turn at `points[at]`, in radians. Zero where there is nothing to turn. */
function turnAt(points: Point[], at: number, closed: boolean): number {
  const before = points[at - 1] ?? (closed ? points[points.length - 2] : undefined);
  const after = points[at + 1] ?? (closed ? points[1] : undefined);
  if (!before || !after) return Math.PI;
  const inX = points[at]!.x - before.x;
  const inY = points[at]!.y - before.y;
  const outX = after.x - points[at]!.x;
  const outY = after.y - points[at]!.y;
  if ((inX === 0 && inY === 0) || (outX === 0 && outY === 0)) return 0;
  const turn = Math.abs(Math.atan2(outY, outX) - Math.atan2(inY, inX));
  return Math.min(turn, Math.PI * 2 - turn);
}

/**
 * The tangent at `points[at]`, or null where the point is a corner.
 *
 * A corner has no single tangent — that is what makes it a corner — so the
 * caller uses the direction of the segment it is drawing instead, and the curve
 * arrives and leaves in a straight line.
 */
function tangentAt(points: Point[], at: number, closed: boolean): Point | null {
  if (turnAt(points, at, closed) >= CORNER) return null;
  const before = points[at - 1] ?? (closed ? points[points.length - 2] : points[at]);
  const after = points[at + 1] ?? (closed ? points[1] : points[at]);
  return { x: (after!.x - before!.x) / 2, y: (after!.y - before!.y) / 2 };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The stroke as an SVG path, in a 0–100 box.
 *
 * Deterministic: the same points always produce the same string, so the guide
 * drawn before the stroke and the ink drawn after it are the same geometry down
 * to the last decimal rather than two things that ought to agree.
 */
export function strokePath(step: StrokeStep): string {
  const points = step.points.map((point) => ({ x: point.x * 100, y: point.y * 100 }));
  if (points.length === 0) return '';
  if (points.length === 1) {
    // A dot. Given a hair of length so a round cap draws it at all.
    const only = points[0]!;
    return `M${round(only.x)} ${round(only.y)} L${round(only.x + 0.01)} ${round(only.y)}`;
  }

  const closed = isClosed(points);
  const parts = [`M${round(points[0]!.x)} ${round(points[0]!.y)}`];

  for (let at = 1; at < points.length; at += 1) {
    const from = points[at - 1]!;
    const to = points[at]!;
    const spanX = to.x - from.x;
    const spanY = to.y - from.y;

    // A corner takes the direction of this segment, so the curve leaves and
    // arrives straight and the join is where the pen actually turned.
    const out = tangentAt(points, at - 1, closed) ?? { x: spanX, y: spanY };
    const into = tangentAt(points, at, closed) ?? { x: spanX, y: spanY };

    const c1x = from.x + out.x * TENSION;
    const c1y = from.y + out.y * TENSION;
    const c2x = to.x - into.x * TENSION;
    const c2y = to.y - into.y * TENSION;

    parts.push(
      `C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(to.x)} ${round(to.y)}`,
    );
  }

  return parts.join(' ');
}

/**
 * How long the stroke is, in the same 0–100 box.
 *
 * The polyline's length rather than the curve's: it is used to decide how long
 * a stroke takes to write, where a fraction of a percent does not matter, and
 * the reveal itself is measured in the path's own units by `pathLength` so it
 * needs no number from here at all.
 */
export function strokeLength(step: StrokeStep): number {
  let total = 0;
  for (let at = 1; at < step.points.length; at += 1) {
    const from = step.points[at - 1]!;
    const to = step.points[at]!;
    total += Math.hypot((to.x - from.x) * 100, (to.y - from.y) * 100);
  }
  return total || 1;
}
