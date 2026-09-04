import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from '../data/characters';
import { isSyllable } from '../data/jamo';
import { vectorGlyph } from '../data/strokeVectors';
import {
  MARKER_RING,
  PAPER_CORNER,
  distanceToStroke,
  inkDistance,
  layoutMarkers,
  ontoPaper,
  paintedRadius,
} from './strokeMarkers';

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

/**
 * How much of a stroke's centreline disappears under a disc, as a fraction.
 *
 * The unit the defect was reported in. "Disc 3 overlaps stroke 3" is a fact
 * about geometry; "62% of the stroke is under the number" is the reason anybody
 * cared, and it is the number that tells a short stroke's problem apart from a
 * long stroke's harmless graze.
 *
 * The centreline rather than the ink: a badge that covers the middle of the
 * pen covers the stroke, and a badge clear of the centreline but grazing the
 * pen's edge is caught by the distance test above instead. Sampled at a
 * quarter of a unit, which on the shortest stroke in the curriculum — ㅏ's
 * 12.3-unit branch — is fifty samples.
 */
function coveredFraction(
  stroke: { d: string },
  label: { x: number; y: number },
  radius: number,
): number {
  const points = samplePath(stroke.d);
  let total = 0;
  let under = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    total += length;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (Math.hypot(mid.x - label.x, mid.y - label.y) <= radius) under += length;
  }
  return total === 0 ? 0 : under / total;
}

/** A path walked at a quarter of a unit. Cubics are sampled; the rest are corners. */
function samplePath(d: string): Array<{ x: number; y: number }> {
  const corners: Array<{ x: number; y: number }> = [];
  let current = { x: 0, y: 0 };
  let first = { x: 0, y: 0 };
  for (const command of d.match(/[MLCZ][^MLCZ]*/g) ?? []) {
    const numbers = (command.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (command[0] === 'M') {
      current = { x: numbers[0]!, y: numbers[1]! };
      first = current;
      corners.push(current);
    } else if (command[0] === 'L') {
      current = { x: numbers[0]!, y: numbers[1]! };
      corners.push(current);
    } else if (command[0] === 'C') {
      const [c1x, c1y, c2x, c2y, x, y] = numbers as [number, number, number, number, number, number];
      for (let step = 1; step <= 24; step += 1) {
        const t = step / 24;
        const u = 1 - t;
        corners.push({
          x: u * u * u * current.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
          y: u * u * u * current.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
        });
      }
      current = { x, y };
    } else {
      corners.push(first);
      current = first;
    }
  }

  const walked: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < corners.length; i += 1) {
    const a = corners[i - 1]!;
    const b = corners[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      walked.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (corners.length > 0) walked.push(corners[corners.length - 1]!);
  return walked;
}

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

  it('keeps every disc near enough to its own stroke to read as its label', () => {
    /*
     * The badge clears the ink now, so it is always displaced — the question
     * stopped being *has it floated* and became *has it floated too far to
     * belong to anything*. A number four radii out with a hairline back to the
     * stroke is still that stroke's number; a number across the box is a
     * legend.
     *
     * Four and a quarter radii is the allowance because the worst case in the
     * curriculum is 꽃's seventh at 3.95, and 꽃 is the densest block taught:
     * seven strokes in one box, so the last badge placed is choosing from
     * whatever room the first six left. Anything with more slack than this
     * would not be measuring a real constraint.
     */
    for (const character of ALL_CHARACTERS) {
      const radius = radiusFor(character.character);
      for (const marker of layoutMarkers(vectorGlyph(character.character).strokes, radius)) {
        const gap =
          Math.hypot(marker.label.x - marker.anchor.x, marker.label.y - marker.anchor.y) - radius;
        expect(gap, `${character.character} ${marker.order}`).toBeLessThanOrEqual(radius * 4.25);
        expect(marker.tethered, `${character.character} ${marker.order} is tethered`).toBe(true);
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

  it('never lets a disc sit on any stroke, its own included', () => {
    /*
     * The invariant this module exists for, and the one it did not used to
     * have.
     *
     * The old rule was *a disc may not cover a stroke it does not label*, and
     * it said so in as many words: touching its own stroke was the point of it.
     * That is defensible on a long stroke and indefensible on a short one, and
     * the curriculum is full of short ones. 안's third stroke — the branch of
     * the ㅏ — is 12.3 units long and the disc is 8 across. 62% of it was under
     * the number.
     *
     * So the rule is now the same for every piece of ink in the glyph: the disc
     * clears all of it. The leader line is the exception, and it is the only
     * one — a one-unit hairline over a nine-unit pen hides nothing, and it is
     * what keeps the badge attached to the stroke it names.
     *
     * `inkDistance` rather than `distanceToStroke`: the badge is a disc, not a
     * point, so what matters is whether its *edge* reaches the ink. See the
     * note on that function about the butt caps.
     */
    const PEN = 9;
    for (const character of ALL_CHARACTERS) {
      const glyph = vectorGlyph(character.character);
      const radius = radiusFor(character.character);
      for (const marker of layoutMarkers(glyph.strokes, radius)) {
        for (const stroke of glyph.strokes) {
          expect(
            inkDistance(stroke, marker.label, PEN) - radius,
            `${character.character}: disc ${marker.order} sits on stroke ${stroke.order}`,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('leaves no stroke in the curriculum with ink under a badge', () => {
    /*
     * The same rule, measured the way a reader sees it rather than the way the
     * placement computes it: walk each stroke's centreline and count how much
     * of it disappears under a disc.
     *
     * Two implementations of one property is usually a smell. It is right here,
     * because the first is a *distance* — what the search optimises — and this
     * is a *length* — what the learner loses. A rounding error in the first
     * shows up as a fraction of a unit; the same error here shows up as a
     * percentage of a stroke, which is the number the defect was reported in.
     */
    for (const character of ALL_CHARACTERS) {
      const glyph = vectorGlyph(character.character);
      const radius = radiusFor(character.character);
      const markers = layoutMarkers(glyph.strokes, radius);
      for (const stroke of glyph.strokes) {
        for (const marker of markers) {
          expect(
            coveredFraction(stroke, marker.label, radius),
            `${character.character}: stroke ${stroke.order} under disc ${marker.order}`,
          ).toBe(0);
        }
      }
    }
  });

  it('shows the whole of the tick that makes ㅊ a ㅊ', () => {
    /*
     * The named fixture for the defect above. It asserts the thing a learner
     * needs — that the first stroke is *visible* — rather than that the layout
     * produced particular coordinates, which would fail the next time anything
     * moved for a good reason.
     *
     * The tick runs from (50, 8) to the lid at (50, 30). Sampled along it, no
     * point may be underneath a disc except near its own start, where disc 1
     * legitimately touches the stroke it labels.
     */
    const glyph = vectorGlyph('ㅊ');
    const radius = radiusFor('ㅊ');
    const markers = layoutMarkers(glyph.strokes, radius);
    const tick = glyph.strokes.find((stroke) => stroke.order === 1)!;
    let covered = 0;
    for (let t = 0.25; t <= 1.0001; t += 0.05) {
      const point = { x: tick.start[0], y: tick.start[1] + (30 - tick.start[1]) * t };
      for (const marker of markers) {
        if (marker.order === 1) continue;
        if (Math.hypot(point.x - marker.label.x, point.y - marker.label.y) < radius) covered += 1;
      }
    }
    expect(covered, 'a disc is drawn over the tick of ㅊ').toBe(0);
  });

  it('keeps every disc on the paper — ring included, corners included', () => {
    /*
     * The reported defect, as a property.
     *
     * This test used to measure `marker.label.x >= radius`, and it passed on
     * every build in which the badges were visibly cut. `radius` is the disc's
     * *fill*; the ring is 0.9 units wide and straddles the circumference, so a
     * badge sitting at exactly `x = radius` painted 0.45 units to the left of
     * the box — and the outermost `<svg>` clips at its viewport, so 0.45 units
     * of ring simply were not drawn. Twenty-one badges over twenty characters
     * were in that state. `ㅌ`'s third, at (5.6, 5.73), is the one that was
     * reported; `ㄷ`'s second was at (5.6, 5.6) and lost ring on two sides.
     *
     * The corner is the second half of it. The paper is a rounded rectangle —
     * a `<rect rx>` inside the SVG now, so it is in the same coordinate system
     * as everything else — and a badge in the square corner of the viewBox is
     * off the sheet even when it is inside the box.
     *
     * So the bound measured here is the badge's *painted* extent against the
     * *sheet*, which is what a reader sees.
     */
    for (const character of ALL_CHARACTERS) {
      const radius = radiusFor(character.character);
      const outer = paintedRadius(radius);
      for (const marker of layoutMarkers(vectorGlyph(character.character).strokes, radius)) {
        const where = `${character.character} ${marker.order}`;
        const { x, y } = marker.label;
        expect(x, where).toBeGreaterThanOrEqual(outer);
        expect(y, where).toBeGreaterThanOrEqual(outer);
        expect(x, where).toBeLessThanOrEqual(100 - outer);
        expect(y, where).toBeLessThanOrEqual(100 - outer);

        for (const cx of [PAPER_CORNER, 100 - PAPER_CORNER]) {
          for (const cy of [PAPER_CORNER, 100 - PAPER_CORNER]) {
            const outX = cx < 50 ? x < cx : x > cx;
            const outY = cy < 50 ? y < cy : y > cy;
            if (!outX || !outY) continue;
            expect(
              Math.hypot(x - cx, y - cy),
              `${where} is inside the sheet's rounded corner at (${cx}, ${cy})`,
            ).toBeLessThanOrEqual(PAPER_CORNER - outer + 1e-9);
          }
        }
      }
    }
  });

  it('measures the badge against the ring the stylesheet actually draws', () => {
    /*
     * One fact in two places, so it is asserted rather than hoped for.
     *
     * `MARKER_RING` is what the layout reserves; `.marker circle`'s
     * `stroke-width` is what the browser paints. The clipping defect *was* the
     * gap between those two numbers, so the day somebody thickens the ring the
     * layout has to be told — and this is what tells them.
     */
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, 'StrokeOrder.module.css'), 'utf8');
    const rule = css.match(/\.marker circle,\s*\.markerDone circle \{[^}]*stroke-width:\s*([\d.]+)/);
    expect(rule, 'the ring rule is still in StrokeOrder.module.css').not.toBeNull();
    expect(Number(rule![1]), 'MARKER_RING matches the stylesheet').toBe(MARKER_RING);
  });

  it('places nothing the paper bound would have to move', () => {
    // `ontoPaper` is the bound. A position it would change is a position that
    // was outside the sheet, so a layout that returns one has escaped its own
    // rule — which is how the clamp-at-`radius` version shipped.
    for (const character of ALL_CHARACTERS) {
      const radius = radiusFor(character.character);
      for (const marker of layoutMarkers(vectorGlyph(character.character).strokes, radius)) {
        const safe = ontoPaper(marker.label, radius);
        expect(
          Math.hypot(safe.x - marker.label.x, safe.y - marker.label.y),
          `${character.character} ${marker.order}`,
        ).toBeLessThan(1e-9);
      }
    }
  });

  it('numbers the badges in the order the strokes are animated', () => {
    /*
     * `StrokeOrder` decides which badges are "done" by index — `markers.map((m,
     * index) => index < complete)` — while the ink it counts is
     * `strokes.slice(0, complete)`. The two lists therefore have to be in the
     * same order, and the placement deliberately sorts by *crowding* before it
     * sorts back. If that final sort were ever dropped, badge 5 would light up
     * while stroke 2 was being drawn.
     */
    for (const character of ALL_CHARACTERS) {
      const glyph = vectorGlyph(character.character);
      const markers = layoutMarkers(glyph.strokes, radiusFor(character.character));
      expect(markers.map((m) => m.order), character.character).toEqual(
        glyph.strokes.map((s) => s.order),
      );
      expect(markers.map((m) => m.order), character.character).toEqual(
        markers.map((_, index) => index + 1),
      );
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
        expect(marker.tethered, `${character.character} ${marker.order}`).toBe(moved > radius * 1.2);
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

  /**
   * The characters the defect was demonstrated on, and the shapes most likely
   * to reproduce it.
   *
   * The sweep above already covers all of these — it runs over every taught
   * character — so nothing here is load-bearing for correctness. What they are
   * for is the failure message. A sweep that breaks reports "some character,
   * some stroke"; these report *which* letter and *why it was chosen*, which is
   * the difference between a five-minute fix and an afternoon.
   *
   * Chosen for the property that makes a badge dangerous rather than for
   * appearances: a stroke short enough that a disc swallows it, and a
   * neighbour close enough that the obvious escape route is taken.
   */
  describe.each([
    ['안', 'the reported defect: a 12-unit ㅏ branch starting on the stem, 62% covered'],
    ['아', 'the same branch with more room to the left, and it was covered too'],
    ['ㅏ', 'the branch on its own — no ㅇ in the way, so a placement bug shows unmasked'],
    ['ㅅ', 'two strokes meeting at a point, both starts within a pen of each other'],
    ['ㅈ', 'a lid with two legs hanging off it — three starts in a hand-span'],
    ['ㅊ', 'ㅈ plus the tick, which is the shortest stroke in the alphabet'],
    ['ㄲ', 'double consonant: the same shape twice, so two badges want one gap'],
    ['ㄸ', 'double consonant, four strokes'],
    ['ㅃ', 'double consonant, eight strokes — the densest single letter taught'],
    ['ㅉ', 'double consonant built from the letter with the shortest strokes'],
    ['ㅘ', 'compound vowel: two vowels sharing a box, so neither has its usual room'],
    ['ㅙ', 'compound vowel, four strokes'],
    ['ㅞ', 'compound vowel, five strokes — the tightest vowel in the curriculum'],
    ['ㅢ', 'compound vowel whose two parts meet at a corner'],
    ['꽃', 'dense block: seven strokes, and the last badge placed takes what is left'],
    ['밥', 'dense block: nine strokes over three letters'],
    ['한', 'dense block with a ㅎ, whose lid and ring crowd the vowel'],
    ['글', 'the block whose fourth and fifth strokes begin a pen-width apart'],
  ])('%s', (character, why) => {
    it(`shows every stroke — ${why}`, () => {
      const glyph = vectorGlyph(character);
      const radius = radiusFor(character);
      const markers = layoutMarkers(glyph.strokes, radius);
      expect(markers).toHaveLength(glyph.strokes.length);
      for (const stroke of glyph.strokes) {
        for (const marker of markers) {
          expect(
            coveredFraction(stroke, marker.label, radius),
            `${character}: stroke ${stroke.order} under disc ${marker.order}`,
          ).toBe(0);
          expect(
            inkDistance(stroke, marker.label, glyph.pen) - radius,
            `${character}: disc ${marker.order} clears stroke ${stroke.order}`,
          ).toBeGreaterThanOrEqual(0);
        }
        // And the badge still names the stroke: the anchor is on it, and the
        // leader is drawn.
        const marker = markers.find((m) => m.order === stroke.order)!;
        expect(distanceToStroke(stroke, marker.anchor, glyph.pen)).toBeLessThanOrEqual(0);
        expect(marker.tethered, `${character}: disc ${marker.order} has a leader`).toBe(true);
      }
    });
  });
});
