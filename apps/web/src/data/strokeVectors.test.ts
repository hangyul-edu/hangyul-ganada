import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from './characters';
import { vectorGlyph, type VectorStroke } from './strokeVectors';

/**
 * The instructional stroke geometry, and the four letters that were reported.
 *
 * ## Why these four are named
 *
 * A customer sent four screenshots of the shipped product — ㅂ, ㅅ, ㅇ and ㅈ —
 * against a report that called the stroke renderer release quality and said all
 * 73 items had been looked at. All four defects were real. They are named here
 * so that a future change cannot quietly reintroduce the exact thing that was
 * reported, and the general properties are asserted over all 73 so that fixing
 * four letters cannot be mistaken for fixing the problem.
 *
 * ## What can and cannot be tested here
 *
 * These are assertions about geometry, and geometry was never the thing that was
 * wrong — the old model's data passed every check it had while the product was
 * visibly broken. What they can do is pin the *structural* facts that the old
 * model could not satisfy and the new one satisfies by construction: a stroke is
 * its own path, a curve is a curve, and no stroke's ink is decided by a rule
 * about who owns a junction.
 *
 * Whether ㅅ looks like ㅅ is settled by `npm run strokes:visual`, which renders
 * the gallery, and by a person looking at it.
 */

const REPORTED = ['ㅂ', 'ㅅ', 'ㅇ', 'ㅈ'] as const;

/** Points along a path, cubics sampled — enough to measure a turn or a gap. */
function flatten(d: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  let at = { x: 0, y: 0 };
  let first = at;
  for (const command of d.match(/[MLCZ][^MLCZ]*/g) ?? []) {
    const n = (command.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (command[0] === 'M') {
      at = { x: n[0]!, y: n[1]! };
      first = at;
      out.push(at);
    } else if (command[0] === 'L') {
      at = { x: n[0]!, y: n[1]! };
      out.push(at);
    } else if (command[0] === 'C') {
      const [c1x, c1y, c2x, c2y, x, y] = n as [number, number, number, number, number, number];
      for (let step = 1; step <= 16; step += 1) {
        const t = step / 16;
        const u = 1 - t;
        out.push({
          x: u ** 3 * at.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t ** 3 * x,
          y: u ** 3 * at.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * y,
        });
      }
      at = { x, y };
    } else {
      out.push(first);
      at = first;
    }
  }
  return out;
}

function sharpestTurnDegrees(points: Array<{ x: number; y: number }>): number {
  const real = points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y) > 1e-6,
  );
  let worst = 0;
  for (let i = 2; i < real.length; i += 1) {
    const [a, b, c] = [real[i - 2]!, real[i - 1]!, real[i]!];
    const turn = Math.abs(
      Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x),
    );
    worst = Math.max(worst, Math.min(turn, Math.PI * 2 - turn));
  }
  return (worst * 180) / Math.PI;
}

const isStraight = (stroke: VectorStroke) => sharpestTurnDegrees(flatten(stroke.d)) < 0.5;

describe('the four letters the customer reported', () => {
  it('is still teaching all four of them', () => {
    // If one of these left the curriculum the fixtures below would quietly stop
    // covering anything, and the report would still say they were pinned.
    const taught = new Set(ALL_CHARACTERS.map((c) => c.character));
    for (const character of REPORTED) expect(taught.has(character), character).toBe(true);
  });

  it('ㅂ — the uprights are straight lines with nothing growing out of them', () => {
    /*
     * The screenshot showed triangular wedges on the uprights where the
     * crossbars would later cross them: a piece of stroke three, black, while
     * stroke three was still grey. Under the old model those wedges *were* the
     * upright — ink awarded to it by the rule that divided the junction — so no
     * assertion about "stroke 1 must not contain stroke 3's ink" could catch it.
     *
     * Here the upright is a straight segment and nothing else, which is the
     * structural reason the wedge cannot come back: there is nothing for it to
     * be made of.
     */
    const { strokes } = vectorGlyph('ㅂ');
    expect(strokes).toHaveLength(4);

    const [left, right, waist, base] = strokes as [
      VectorStroke,
      VectorStroke,
      VectorStroke,
      VectorStroke,
    ];
    for (const upright of [left, right]) {
      expect(isStraight(upright), `upright ${upright.order} is a straight line`).toBe(true);
      expect(upright.start[0]).toBeCloseTo(upright.finish[0], 5);
    }

    // The crossbars land on the uprights and are cut square there, with no
    // terminal to stand proud of the letter.
    expect(waist.ends).toEqual({ start: 'join', end: 'join' });
    // The base closes the box with the uprights' own ends, so it is the *later*
    // stroke that extends — never the finished one reaching towards it.
    expect(base.ends).toEqual({ start: 'corner', end: 'corner' });
    expect(left.ends.end).not.toBe('corner');
    expect(right.ends.end).not.toBe('corner');
  });

  it('ㅅ — the second stroke starts on the first, and the first does not reach for it', () => {
    /*
     * The screenshot showed stroke one carrying an angular chunk of stroke
     * two's shoulder. The branch is a `join`: stroke two begins on stroke one's
     * ink and is cut square there, and stroke one is unaffected by the fact that
     * anything joins it at all.
     */
    const { strokes, pen } = vectorGlyph('ㅅ');
    expect(strokes).toHaveLength(2);
    const [fall, branch] = strokes as [VectorStroke, VectorStroke];

    expect(branch.ends.start).toBe('join');
    expect(fall.ends).toEqual({ start: 'free', end: 'free' });

    // The branch really does begin on the first stroke rather than near it.
    const nearest = Math.min(
      ...flatten(fall.d).map((p) =>
        Math.hypot(p.x - branch.start[0], p.y - branch.start[1]),
      ),
    );
    expect(nearest).toBeLessThanOrEqual(pen / 2);
  });

  it('ㅇ — a closed curve, not a polygon', () => {
    /*
     * The reported ㅇ was a traced raster contour with about thirty segments a
     * side, flat spots and a staircase. This one is four cubic segments. The
     * assertion is on the *sample*, because the curve is exact by construction
     * and the sample is what every other consumer reads: no turn between
     * consecutive samples may be large enough to read as a corner.
     */
    const { strokes } = vectorGlyph('ㅇ');
    expect(strokes).toHaveLength(1);
    const ring = strokes[0]!;

    expect(ring.closed).toBe(true);
    expect(ring.d).toMatch(/C/);
    expect(ring.d.endsWith('Z')).toBe(true);
    expect(sharpestTurnDegrees(flatten(ring.d))).toBeLessThan(15);

    // Round, not a lens: the two diameters agree.
    const points = flatten(ring.d);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(Math.max(width / height, height / width)).toBeLessThan(1.25);
  });

  it('ㅈ — the lid is a straight bar and the legs start on what they meet', () => {
    /*
     * The screenshot showed the lid chipped into the fork below it. The lid is
     * now a straight segment; the left leg begins on the lid and the right leg
     * begins on the left leg, both cut square.
     */
    const { strokes } = vectorGlyph('ㅈ');
    expect(strokes).toHaveLength(3);
    const [lid, left, right] = strokes as [VectorStroke, VectorStroke, VectorStroke];

    expect(isStraight(lid)).toBe(true);
    expect(lid.start[1]).toBeCloseTo(lid.finish[1], 5);
    expect(lid.ends).toEqual({ start: 'free', end: 'free' });
    expect(left.ends.start).toBe('join');
    expect(right.ends.start).toBe('join');
  });
});

describe('every taught character', () => {
  const taught = ALL_CHARACTERS.map((c) => c.character);

  it('draws the number of strokes the lesson says it does', () => {
    for (const character of taught) {
      const { strokes } = vectorGlyph(character);
      const expected = ALL_CHARACTERS.find((c) => c.character === character)!;
      expect(strokes.length, character).toBe(expected.strokes.length);
      expect(strokes.map((s) => s.order)).toEqual(strokes.map((_, i) => i + 1));
    }
  });

  it('keeps all of its ink on the paper, pen included', () => {
    for (const character of taught) {
      const { strokes, pen } = vectorGlyph(character);
      const half = pen / 2;
      for (const stroke of strokes) {
        for (const p of flatten(stroke.d)) {
          expect(p.x - half, `${character} stroke ${stroke.order}`).toBeGreaterThanOrEqual(-0.01);
          expect(p.y - half, `${character} stroke ${stroke.order}`).toBeGreaterThanOrEqual(-0.01);
          expect(p.x + half, `${character} stroke ${stroke.order}`).toBeLessThanOrEqual(100.01);
          expect(p.y + half, `${character} stroke ${stroke.order}`).toBeLessThanOrEqual(100.01);
        }
      }
    }
  });

  it('never lets a finished stroke reach towards one not yet written', () => {
    /*
     * `corner` is the only end that extends, and it may only belong to the
     * *later* of the two strokes whose ends meet. That asymmetry is the whole
     * of §10's rule — at any frame of the animation, the black on the paper is a
     * state a hand could have left it in — and it is checkable without rendering
     * anything: an extended end must have another stroke's end under it, and
     * that stroke must come earlier.
     */
    for (const character of taught) {
      const { strokes, pen } = vectorGlyph(character);
      const tolerance = pen * 0.5 + 0.01;
      for (const stroke of strokes) {
        const ends: Array<[string, [number, number]]> = [
          ['start', stroke.start],
          ['end', stroke.finish],
        ];
        for (const [side, point] of ends) {
          const kind = side === 'start' ? stroke.ends.start : stroke.ends.end;
          if (kind !== 'corner') continue;
          const earlier = strokes.filter((other) => other.order < stroke.order);
          const meets = earlier.some((other) =>
            [other.start, other.finish].some(
              (theirs) => Math.hypot(theirs[0] - point[0], theirs[1] - point[1]) <= tolerance,
            ),
          );
          expect(meets, `${character} stroke ${stroke.order} ${side} extends into nothing`).toBe(
            true,
          );
        }
      }
    }
  });

  it('is stroked geometry, never a filled outline', () => {
    // The old model's paths needed `evenodd` because a stroke could enclose a
    // counter. A centreline encloses nothing, and a path here that needed a fill
    // rule would mean the filled-outline model had come back.
    for (const character of taught) {
      for (const stroke of vectorGlyph(character).strokes) {
        expect(stroke.d, character).toMatch(/^M/);
        expect(stroke.length, `${character} stroke ${stroke.order}`).toBeGreaterThan(0);
      }
    }
  });
});
