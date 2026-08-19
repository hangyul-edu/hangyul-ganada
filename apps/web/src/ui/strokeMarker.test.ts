import { describe, expect, it } from 'vitest';

import { getCharacterByGlyph } from '../data/characters';
import { markerAt } from './strokeMarker';

/**
 * The numbered markers, which are the one part of the demonstration that can
 * make the character harder to read rather than easier.
 */

const RADIUS = 4;

/** Distance from a point to the nearest ink of a stroke, in viewBox units. */
function distanceToStroke(
  step: { points: Array<{ x: number; y: number }> },
  at: { x: number; y: number },
) {
  let best = Infinity;
  for (let i = 1; i < step.points.length; i += 1) {
    const a = step.points[i - 1]!;
    const b = step.points[i]!;
    const ax = a.x * 100;
    const ay = a.y * 100;
    const bx = b.x * 100;
    const by = b.y * 100;
    const len = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((at.x - ax) * (bx - ax) + (at.y - ay) * (by - ay)) / len));
    best = Math.min(best, Math.hypot(at.x - (ax + (bx - ax) * t), at.y - (ay + (by - ay) * t)));
  }
  return best;
}

describe('stroke-order markers', () => {
  it('sits behind the start of its stroke, not on top of it', () => {
    // 밥 is the case that forced this: ㅂ begins three of its four strokes on
    // the same upright, so numbers drawn on the start points stacked into a
    // column of discs and the upright vanished underneath them.
    const bap = getCharacterByGlyph('밥')!;
    for (const [index, stroke] of bap.strokes.entries()) {
      const at = markerAt(stroke, RADIUS);
      const start = { x: stroke.points[0]!.x * 100, y: stroke.points[0]!.y * 100 };
      // Still unmistakably this stroke's number: close to where it begins.
      expect(Math.hypot(at.x - start.x, at.y - start.y), `${index + 1}`).toBeLessThan(RADIUS * 1.6);
      // And backed off it, rather than centred on the ink.
      expect(distanceToStroke(stroke, at), `${index + 1}`).toBeGreaterThan(RADIUS * 0.7);
    }
  });

  it('never lets a number spill over the edge of the paper', () => {
    for (const glyph of ['밥', '가', '어', '고', '강', '국', '옷', '말', '꽃', 'ㄱ', 'ㅅ', 'ㅇ']) {
      const character = getCharacterByGlyph(glyph)!;
      for (const [index, stroke] of character.strokes.entries()) {
        const at = markerAt(stroke, RADIUS);
        const where = `${glyph} ${index + 1}`;
        expect(at.x - RADIUS, where).toBeGreaterThanOrEqual(0);
        expect(at.y - RADIUS, where).toBeGreaterThanOrEqual(0);
        expect(at.x + RADIUS, where).toBeLessThanOrEqual(100);
        expect(at.y + RADIUS, where).toBeLessThanOrEqual(100);
      }
    }
  });

  it('keeps the three ㅂ uprights’ numbers apart from each other', () => {
    const bap = getCharacterByGlyph('밥')!;
    // The 받침 ㅂ is strokes 7–10.
    const marks = bap.strokes.slice(6).map((s) => markerAt(s, RADIUS));
    for (let i = 0; i < marks.length; i += 1) {
      for (let j = i + 1; j < marks.length; j += 1) {
        const apart = Math.hypot(marks[i]!.x - marks[j]!.x, marks[i]!.y - marks[j]!.y);
        expect(apart, `받침 markers ${i + 7} and ${j + 7}`).toBeGreaterThan(RADIUS);
      }
    }
  });
});
