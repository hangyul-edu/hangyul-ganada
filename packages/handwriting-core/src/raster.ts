import { createMask } from './mask.js';
import type { Mask, Stroke } from './types.js';

/**
 * Rasterises normalised strokes into an ink mask.
 *
 * Deliberately implemented without a canvas: the evaluator must run in Node for
 * tests, in a web worker, and later under React Native, none of which share a
 * 2-D context. Strokes are stamped as discs swept along each segment, which is
 * what a round pen cap actually produces.
 */
export function rasterizeStrokes(strokes: readonly Stroke[], resolution: number): Mask {
  const mask = createMask(resolution);
  for (const stroke of strokes) {
    const radius = Math.max(0.5, (stroke.width * resolution) / 2);
    const pts = stroke.points;
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      stampDisc(mask, pts[0]!.x * resolution, pts[0]!.y * resolution, radius);
      continue;
    }
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      stampSegment(
        mask,
        a.x * resolution,
        a.y * resolution,
        b.x * resolution,
        b.y * resolution,
        radius,
      );
    }
  }
  return mask;
}

function stampDisc(mask: Mask, cx: number, cy: number, r: number): void {
  const { width: w, height: h, data } = mask;
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y += 1) {
    const dy = y + 0.5 - cy;
    const row = y * w;
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) data[row + x] = 1;
    }
  }
}

/** Fills the capsule swept by a disc of radius `r` moving from (ax,ay) to (bx,by). */
function stampSegment(
  mask: Mask,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
): void {
  const { width: w, height: h, data } = mask;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const r2 = r * r;

  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r));

  for (let y = y0; y <= y1; y += 1) {
    const row = y * w;
    const py = y + 0.5;
    for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5;
      // Distance from the pixel centre to the segment.
      let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const ex = px - cx;
      const ey = py - cy;
      if (ex * ex + ey * ey <= r2) data[row + x] = 1;
    }
  }
}
