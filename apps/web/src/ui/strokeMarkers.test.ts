import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from '../data/characters';
import { isSyllable } from '../data/jamo';
import { drawLength, drawPoints, strokeAsset } from '../data/strokeAssets';
import { insideStroke, layoutMarkers } from './strokeMarkers';

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
  it('anchors every number to the tip of its own stroke', () => {
    /*
     * The anchor is the instruction — *the pen lands here* — so it has to be on
     * the ink, and on the *end* of it.
     *
     * It used to be asserted as `draw[0]`, the first point of the drawn route,
     * and that is what let the reported defect through: the route is a run of
     * band centres re-read from the ink, so it starts about half a band *inside*
     * the stroke. On ㄴ that is eleven units — a fifth of the way down the
     * vertical — and the disc placed behind it floated clear of the letter with
     * nothing underneath it. So the property checked is the one that matters:
     * the anchor is on the ink, and half a unit further back along the stroke's
     * own opening direction is off it.
     */
    for (const character of ALL_CHARACTERS) {
      const asset = strokeAsset(character.character);
      const markers = layoutMarkers(asset.strokes, radiusFor(character.character));
      expect(markers.length, character.character).toBe(asset.strokes.length);
      markers.forEach((marker, index) => {
        const stroke = asset.strokes[index]!;
        const where = `${character.character} ${marker.order}`;
        expect(marker.order).toBe(stroke.order);

        const points = drawPoints(stroke.draw);
        const from = points[0]!;
        expect(insideStroke(stroke, marker.anchor), `${where} is on its own ink`).toBe(true);

        // Backwards along the stroke, which is the direction the walk took.
        const next = points.find((p) => Math.hypot(p.x - from.x, p.y - from.y) > 0.5) ?? from;
        const away = Math.atan2(from.y - next.y, from.x - next.x);
        const beyond = {
          x: marker.anchor.x + Math.cos(away) * 0.75,
          y: marker.anchor.y + Math.sin(away) * 0.75,
        };
        /*
         * The anchor is at a free end of the stroke — unless the stroke has no
         * free end.
         *
         * ㅇ is a ring: "backwards" from its start runs round the circle rather
         * than off it, so there is no tip to find and marching on would carry
         * the number a quarter of the way round the letter. Every other stroke
         * has an end, and the anchor has to be on it.
         *
         * This used to be phrased as "if the anchor moved, it is at an edge;
         * if it did not, there is no free end", which asserted *how the walk
         * behaved* rather than where it ended up — and broke the day the
         * generator started emitting routes that already begin at the tip,
         * because then the anchor is correct and has not moved. A route
         * starting on the tip is a better route, and a test that fails on an
         * improvement is testing the wrong thing.
         */
        const last = points[points.length - 1]!;
        const gap = Math.hypot(last.x - from.x, last.y - from.y);
        const closed = gap < drawLength(stroke.draw) * 0.35;
        if (!closed) {
          expect(insideStroke(stroke, beyond), `${where} sits at the end of its ink`).toBe(false);
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
      for (const marker of layoutMarkers(strokeAsset(character.character).strokes, radius)) {
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
