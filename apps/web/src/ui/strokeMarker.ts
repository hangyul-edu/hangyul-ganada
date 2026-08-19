import type { StrokeStep } from '@hangyul-ganada/shared-types';

/**
 * Where a stroke's number goes: just *behind* where the pen starts.
 *
 * On the stroke's own start point is where a number is least ambiguous and, on
 * a composed block, where it does the most damage — ㅂ starts three of its four
 * strokes on the same upright, so three discs stack up and the upright
 * disappears underneath them. A learner then reads a column of orange circles
 * where a letter should be.
 *
 * So the number backs off along the line the pen is about to travel, which is
 * the convention a printed stroke-order chart uses: it sits at the tail of the
 * stroke rather than on it, still unmistakably attached to the stroke it
 * belongs to, and off the ink. Clamped so a stroke that starts at the edge of
 * the paper does not push its number over the side.
 */
export function markerAt(step: StrokeStep, radius: number): { x: number; y: number } {
  const start = step.points[0]!;
  const next = step.points[1] ?? start;
  const dx = next.x - start.x;
  const dy = next.y - start.y;
  const length = Math.hypot(dx, dy);
  const back = radius * 1.15;
  const x = start.x * 100 - (length === 0 ? 0 : (dx / length) * back);
  const y = start.y * 100 - (length === 0 ? 0 : (dy / length) * back);
  const edge = radius + 1.5;
  const clamp = (v: number) => Math.min(100 - edge, Math.max(edge, v));
  return { x: clamp(x), y: clamp(y) };
}
