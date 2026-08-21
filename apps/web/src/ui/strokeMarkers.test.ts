import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from '../data/characters';
import { isSyllable } from '../data/jamo';
import { vectorGlyph } from '../data/strokeVectors';
import { distanceToStroke, layoutMarkers } from './strokeMarkers';

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
  it('anchors every number to the start of its own stroke', () => {
    /*
     * The anchor is the instruction — *the pen lands here* — so it has to be on
     * the ink, and on the *end* of it.
     *
     * Under the previous stroke model this was hard: each stroke was cut out of
     * a rasterised glyph and its route re-read from the ink, so the recorded
     * start sat about half a sampling band inside the stroke. On ㄴ, whose pen
     * is nine units wide, that was eleven units — a fifth of the way down the
     * vertical — and the disc placed behind it floated clear of the letter with
     * nothing underneath it. `strokeMarkers` carried a whole point-in-polygon
     * walk to find the real end.
     *
     * The geometry is authored now, so `start` *is* where the pen lands and
     * there is nothing to search for. The property is still worth asserting,
     * because it is the one a learner sees: on the ink, and at the end of it.
     */
    for (const character of ALL_CHARACTERS) {
      const glyph = vectorGlyph(character.character);
      const markers = layoutMarkers(glyph.strokes, radiusFor(character.character));
      expect(markers.length, character.character).toBe(glyph.strokes.length);
      markers.forEach((marker, index) => {
        const stroke = glyph.strokes[index]!;
        const where = `${character.character} ${marker.order}`;
        expect(marker.order).toBe(stroke.order);

        expect(
          distanceToStroke(stroke, marker.anchor, glyph.pen),
          `${where} is on its own ink`,
        ).toBeLessThanOrEqual(0);

        /*
         * Half a unit back along the stroke's own opening direction is off it —
         * unless the stroke has no free end that way.
         *
         * ㅇ is a ring: "backwards" from its start runs round the circle rather
         * than off it, so there is no end to be at. A stroke whose start is a
         * `corner` end has been extended half a pen to close that corner, so
         * backwards from `start` is still on its own ink by construction.
         */
        if (!stroke.closed && stroke.ends.start !== 'corner') {
          const beyond = {
            x: marker.anchor.x - stroke.heading[0] * 0.75,
            y: marker.anchor.y - stroke.heading[1] * 0.75,
          };
          expect(
            distanceToStroke(stroke, beyond, glyph.pen),
            `${where} sits at the end of its ink`,
          ).toBeGreaterThan(0);
        }
      });
    }
  });

  it('puts the disc against the tip rather than near it', () => {
    /*
     * The complaint was that the badge floated. A disc whose centre is one
     * radius from the anchor has its near edge *on* the anchor; anything much
     * further and it reads as a label placed beside the letter. The allowance is
     * generous because a crowded block legitimately pushes a disc outward — but
     * then the hairline is there to say which stroke it belongs to.
     */
    for (const character of ALL_CHARACTERS) {
      const radius = radiusFor(character.character);
      for (const marker of layoutMarkers(vectorGlyph(character.character).strokes, radius)) {
        const gap =
          Math.hypot(marker.label.x - marker.anchor.x, marker.label.y - marker.anchor.y) - radius;
        expect(gap, `${character.character} ${marker.order}`).toBeLessThanOrEqual(radius * 2.8);
        // Clear of the boundary the code itself uses, so this is not a
        // test of floating-point equality.
        if (gap > radius * 0.75) {
          expect(marker.tethered, `${character.character} ${marker.order} is tethered`).toBe(true);
        }
      }
    }
  });

  it('never lets two discs overlap, in any character', () => {
    for (const character of ALL_CHARACTERS) {
      const radius = radiusFor(character.character);
      const markers = layoutMarkers(vectorGlyph(character.character).strokes, radius);
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
      for (const marker of layoutMarkers(vectorGlyph(character.character).strokes, radius)) {
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
      for (const marker of layoutMarkers(vectorGlyph(character.character).strokes, radius)) {
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
      const strokes = vectorGlyph(character).strokes;
      expect(layoutMarkers(strokes, 4)).toEqual(layoutMarkers(strokes, 4));
    }
  });
});
