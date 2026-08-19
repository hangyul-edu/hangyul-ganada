import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from './characters';
import {
  STROKE_ASSETS,
  STROKE_ASSET_CHARACTERS,
  drawLength,
  drawPoints,
  hasStrokeAsset,
  strokeAsset,
} from './strokeAssets';

/**
 * Every shipping glyph is a regression case.
 *
 * Not a sample of them. The demonstration was signed off five times on the
 * strength of one character looking right, and five times a different character
 * was still broken — 가 was fixed while 어 was disconnected, 어 was fixed while
 * 글's ㄹ was collapsing into overlapping lines. A test that checks three
 * characters is a test that will pass the next time this breaks.
 *
 * So everything here loops over the whole curriculum. The named fixtures below
 * are not a shortlist to check *instead*; they are the specific failures that
 * have actually shipped, pinned so they cannot come back quietly.
 */

/** The failures this architecture was built to end. Each one shipped broken. */
const FIXTURES = ['ㄱ', 'ㄹ', 'ㅂ', 'ㅇ', '가', '거', '어', '오', '고', '구', '바', '밥', '글'];

const NUMBER = /-?\d+(\.\d+)?/g;
const numbers = (path: string) => (path.match(NUMBER) ?? []).map(Number);

describe('stroke assets', () => {
  it('has one for every character the curriculum teaches', () => {
    // The set difference the whole design rests on: curriculum − assets = ∅.
    // A missing asset is a build failure, never a quiet fall back to something
    // that draws an approximation instead.
    const absent = ALL_CHARACTERS.map((c) => c.character).filter((c) => !hasStrokeAsset(c));
    expect(absent).toEqual([]);
  });

  it('has nothing the curriculum does not teach', () => {
    const taught = new Set(ALL_CHARACTERS.map((c) => c.character));
    expect(STROKE_ASSET_CHARACTERS.filter((c) => !taught.has(c))).toEqual([]);
  });

  it('keeps every named regression fixture', () => {
    for (const character of FIXTURES) {
      expect(hasStrokeAsset(character), character).toBe(true);
      expect(strokeAsset(character).strokes.length, character).toBeGreaterThan(0);
    }
  });

  it('refuses a character it does not have, rather than inventing one', () => {
    // There is no placeholder and no fallback renderer: the whole point is that
    // a lesson cannot show a shape nobody has looked at.
    expect(() => strokeAsset('漢')).toThrow(/no stroke asset/i);
  });

  it('agrees with the curriculum about how many strokes each character has', () => {
    // The lesson says "3 strokes" out loud and the learner counts what they see.
    for (const character of ALL_CHARACTERS) {
      expect(strokeAsset(character.character).strokes.length, character.character).toBe(
        character.strokes.length,
      );
      expect(character.stroke_count, character.character).toBe(character.strokes.length);
    }
  });

  it('numbers the strokes 1…n, in writing order, with no gaps', () => {
    for (const character of ALL_CHARACTERS) {
      const asset = strokeAsset(character.character);
      expect(
        asset.strokes.map((s) => s.order),
        character.character,
      ).toEqual(asset.strokes.map((_, i) => i + 1));
    }
  });

  it('draws every stroke with real numbers, inside the box', () => {
    for (const character of ALL_CHARACTERS) {
      const asset = strokeAsset(character.character);
      expect(asset.viewBox, character.character).toBe('0 0 100 100');
      for (const stroke of asset.strokes) {
        const where = `${character.character} stroke ${stroke.order}`;
        for (const path of [stroke.shape, stroke.draw]) {
          expect(path, where).not.toMatch(/NaN|Infinity|undefined|null/);
          const values = numbers(path);
          expect(values.length, where).toBeGreaterThan(0);
          expect(values.every(Number.isFinite), where).toBe(true);
          // A hair of slack: a contour traced on a pixel grid can land on the edge.
          expect(Math.min(...values), where).toBeGreaterThanOrEqual(-0.5);
          expect(Math.max(...values), where).toBeLessThanOrEqual(100.5);
        }
      }
    }
  });

  it('gives every stroke a closed outline with area in it', () => {
    // A stroke that claimed no ink is the 글 defect: the demonstration counts it,
    // the learner is told to draw it, and nothing appears.
    for (const character of ALL_CHARACTERS) {
      for (const stroke of strokeAsset(character.character).strokes) {
        const where = `${character.character} stroke ${stroke.order}`;
        expect(stroke.shape.startsWith('M'), where).toBe(true);
        expect(stroke.shape.endsWith('Z'), where).toBe(true);
        expect(area(stroke.shape), where).toBeGreaterThan(1);
      }
    }
  });

  it('starts each stroke where its own path begins', () => {
    // The numbered marker and the first frame of the animation both hang off
    // this. A start point somewhere else teaches the stroke from the wrong end.
    for (const character of ALL_CHARACTERS) {
      for (const stroke of strokeAsset(character.character).strokes) {
        const [x, y] = stroke.start;
        const first = drawPoints(stroke.draw)[0]!;
        expect(Math.hypot(x - first.x, y - first.y), `${character.character} ${stroke.order}`).toBeLessThan(
          0.01,
        );
      }
    }
  });

  it('reveals the whole of every stroke by the time it is finished', () => {
    /*
     * The animation uncovers a stroke by sweeping a brush `reveal` wide along
     * its centreline. Anything further from that line than the brush reaches is
     * still hidden at the moment the stroke is supposed to be complete, and
     * snaps in when the next stroke starts — a flick at the end of every stroke,
     * invisible in a screenshot and obvious in motion. That is the failure mode
     * a still-image review cannot catch, so it is arithmetic instead.
     */
    for (const character of ALL_CHARACTERS) {
      for (const stroke of strokeAsset(character.character).strokes) {
        const line = drawPoints(stroke.draw);
        const values = numbers(stroke.shape);
        let furthest = 0;
        for (let i = 0; i + 1 < values.length; i += 2) {
          let nearest = Infinity;
          for (let j = 1; j < line.length; j += 1) {
            const ax = line[j - 1]!.x;
            const ay = line[j - 1]!.y;
            const dx = line[j]!.x - ax;
            const dy = line[j]!.y - ay;
            const length = dx * dx + dy * dy;
            let t = length === 0 ? 0 : ((values[i]! - ax) * dx + (values[i + 1]! - ay) * dy) / length;
            t = Math.max(0, Math.min(1, t));
            nearest = Math.min(
              nearest,
              Math.hypot(values[i]! - (ax + t * dx), values[i + 1]! - (ay + t * dy)),
            );
          }
          furthest = Math.max(furthest, nearest);
        }
        expect(stroke.reveal / 2, `${character.character} stroke ${stroke.order}`).toBeGreaterThanOrEqual(
          furthest - 0.01,
        );
      }
    }
  });

  it('gives every stroke a path long enough to animate along', () => {
    for (const character of ALL_CHARACTERS) {
      for (const stroke of strokeAsset(character.character).strokes) {
        expect(drawPoints(stroke.draw).length, `${character.character} ${stroke.order}`).toBeGreaterThan(1);
        expect(drawLength(stroke.draw), `${character.character} ${stroke.order}`).toBeGreaterThan(0.5);
      }
    }
  });

  it('is the same data every time it is read', () => {
    // Nothing is measured at runtime any more, so nothing can come back
    // different because a font had not loaded yet. This is what that buys.
    for (const character of FIXTURES) {
      expect(strokeAsset(character)).toBe(strokeAsset(character));
      expect(JSON.stringify(STROKE_ASSETS[character])).toBe(JSON.stringify(strokeAsset(character)));
    }
  });
});

/** A polygon's area by the shoelace formula, summed over a shape's rings. */
function area(shape: string): number {
  let total = 0;
  for (const ring of shape.split('M').filter(Boolean)) {
    const values = numbers(ring);
    let sum = 0;
    for (let i = 0; i + 3 < values.length; i += 2) {
      sum += values[i]! * values[i + 3]! - values[i + 2]! * values[i + 1]!;
    }
    total += Math.abs(sum) / 2;
  }
  return total;
}
