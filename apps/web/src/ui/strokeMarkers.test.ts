import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from '../data/characters';
import { isSyllable } from '../data/jamo';
import { drawPoints, strokeAsset } from '../data/strokeAssets';
import { layoutMarkers } from './strokeMarkers';

/**
 * The numbered markers, on every character the curriculum teaches.
 *
 * The reported defect was 글: four strokes that begin within a stroke's width of
 * each other, four discs drawn on top of one another, and no way to read the
 * order out of the pile. So what is checked here is the property that was
 * violated — no two discs may intersect, anywhere in the curriculum — rather
 * than that one character now looks better.
 */

const radiusFor = (character: string) => (isSyllable(character) ? 4 : 5.6);

describe('stroke markers', () => {
  it('anchors every number to its own stroke’s starting point', () => {
    // The bubble may move to stay readable; the anchor is the instruction and
    // never moves. If these drift apart the diagram is pointing at nothing.
    for (const character of ALL_CHARACTERS) {
      const asset = strokeAsset(character.character);
      const markers = layoutMarkers(asset.strokes, radiusFor(character.character));
      expect(markers.length, character.character).toBe(asset.strokes.length);
      markers.forEach((marker, index) => {
        const stroke = asset.strokes[index]!;
        const start = drawPoints(stroke.draw)[0]!;
        expect(marker.order).toBe(stroke.order);
        expect(marker.anchor.x, `${character.character} ${marker.order}`).toBeCloseTo(start.x, 5);
        expect(marker.anchor.y, `${character.character} ${marker.order}`).toBeCloseTo(start.y, 5);
      });
    }
  });

  it('never lets two discs overlap, in any character', () => {
    for (const character of ALL_CHARACTERS) {
      const radius = radiusFor(character.character);
      const markers = layoutMarkers(strokeAsset(character.character).strokes, radius);
      for (let a = 0; a < markers.length; a += 1) {
        for (let b = a + 1; b < markers.length; b += 1) {
          const gap = Math.hypot(
            markers[a]!.label.x - markers[b]!.label.x,
            markers[a]!.label.y - markers[b]!.label.y,
          );
          expect(
            gap,
            `${character.character}: markers ${markers[a]!.order} and ${markers[b]!.order}`,
          ).toBeGreaterThanOrEqual(radius * 2);
        }
      }
    }
  });

  it('keeps every disc on the paper', () => {
    for (const character of ALL_CHARACTERS) {
      const radius = radiusFor(character.character);
      for (const marker of layoutMarkers(strokeAsset(character.character).strokes, radius)) {
        const where = `${character.character} ${marker.order}`;
        expect(marker.label.x, where).toBeGreaterThanOrEqual(radius);
        expect(marker.label.y, where).toBeGreaterThanOrEqual(radius);
        expect(marker.label.x, where).toBeLessThanOrEqual(100 - radius);
        expect(marker.label.y, where).toBeLessThanOrEqual(100 - radius);
      }
    }
  });

  it('tethers a disc to its anchor exactly when it has moved far enough to be ambiguous', () => {
    for (const character of ALL_CHARACTERS) {
      const radius = radiusFor(character.character);
      for (const marker of layoutMarkers(strokeAsset(character.character).strokes, radius)) {
        const moved = Math.hypot(
          marker.label.x - marker.anchor.x,
          marker.label.y - marker.anchor.y,
        );
        expect(marker.tethered, `${character.character} ${marker.order}`).toBe(moved > radius * 1.6);
      }
    }
  });

  it('lays out identically every time', () => {
    // A fixed ladder of candidates, walked in a fixed order — not a relaxation.
    // A diagram that rearranges itself between two runs of the same lesson is
    // one a learner cannot get used to.
    for (const character of ['글', '밥', '꽃', 'ㄹ']) {
      const strokes = strokeAsset(character).strokes;
      expect(layoutMarkers(strokes, 4)).toEqual(layoutMarkers(strokes, 4));
    }
  });
});
