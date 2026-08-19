import { describe, expect, it } from 'vitest';

import { getCharacterByGlyph } from '../data/characters';
import { strokePath } from './strokePath';

/**
 * The one path each stroke is drawn from.
 *
 * Everything the demonstration shows — the guide, the growing ink, the finished
 * stroke — is this string. So what has to hold is that it is the *same* string
 * every time, that it curves where the letter curves, and that it does not
 * curve where the letter turns a corner. A ㅇ built from line segments is a
 * polygon; a ㄱ built from a smooth curve has lost its elbow.
 */

/** Every point the path passes through or is steered by. */
function numbers(path: string): number[] {
  return path.match(/-?\d+(\.\d+)?/g)!.map(Number);
}

describe('stroke paths', () => {
  it('builds the same string every time', () => {
    // The guide and the ink are two calls; if they could disagree, the seam
    // between them would be the bug this whole approach exists to remove.
    for (const glyph of ['ㄱ', 'ㅇ', 'ㅂ', '바', '밥']) {
      for (const stroke of getCharacterByGlyph(glyph)!.strokes) {
        expect(strokePath(stroke)).toBe(strokePath(stroke));
      }
    }
  });

  it('never emits a coordinate that is not a number', () => {
    for (const glyph of ['ㄱ', 'ㅇ', 'ㅅ', 'ㅢ', '가', '밥', '꽃']) {
      for (const stroke of getCharacterByGlyph(glyph)!.strokes) {
        const path = strokePath(stroke);
        expect(path).not.toMatch(/NaN|Infinity|undefined/);
        expect(numbers(path).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('keeps ㄱ’s corner a corner', () => {
    // The turn at the top right is the letter. A Catmull-Rom tangent there
    // would round it off into a quarter-circle, which is a different shape and
    // a different instruction to the hand.
    const [stroke] = getCharacterByGlyph('ㄱ')!.strokes;
    const path = strokePath(stroke!);
    const corner = stroke!.points[1]!;

    // The control points either side of the corner sit on the two straight
    // runs, so both approach and departure are straight lines through it.
    const values = numbers(path);
    const cornerX = Math.round(corner.x * 100 * 1000) / 1000;
    const cornerY = Math.round(corner.y * 100 * 1000) / 1000;
    const at = values.findIndex((v, i) => v === cornerX && values[i + 1] === cornerY);
    expect(at).toBeGreaterThan(0);
    // The control point arriving at the corner shares its y: the top bar is
    // horizontal right up to the turn.
    expect(values[at - 1]).toBeCloseTo(cornerY, 3);
  });

  it('curves ㅇ rather than drawing it as a polygon', () => {
    const [stroke] = getCharacterByGlyph('ㅇ')!.strokes;
    const path = strokePath(stroke!);
    // Every segment is a cubic; a single `L` would be a flat side.
    expect(path).not.toContain('L');
    expect(path.match(/C/g)!.length).toBe(stroke!.points.length - 1);
  });

  it('draws a straight stroke straight', () => {
    // ㅣ is one vertical line and must not acquire a wobble from smoothing.
    const [stroke] = getCharacterByGlyph('ㅣ')!.strokes;
    const xs = numbers(strokePath(stroke!)).filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
  });

  it('starts where the stroke starts', () => {
    // The numbered marker and the first frame of the animation both depend on
    // it: a path that begins somewhere else is a stroke drawn from the wrong
    // end, which is the one thing this data exists to get right.
    for (const glyph of ['ㄱ', 'ㅓ', '밥']) {
      for (const stroke of getCharacterByGlyph(glyph)!.strokes) {
        const start = stroke.points[0]!;
        expect(strokePath(stroke)).toMatch(
          new RegExp(`^M${Math.round(start.x * 100 * 1000) / 1000} `),
        );
      }
    }
  });
});
