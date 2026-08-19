import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS, getCharacterByGlyph } from './characters';
import { composeSyllableStrokes, paperRegion, syllableLayout } from './compose';
import { branchesLeft, toJamo } from './jamo';
import { STROKE_ORDER } from './strokes';

/**
 * A syllable block has to come out of the demonstration looking like itself.
 *
 * The bug this defends against shipped: the block's stroke order was its
 * letters' stroke data concatenated unchanged, so 가 was drawn as a full-size
 * ㄱ and a full-size ㅏ in the same square, crossing each other. The animation
 * ended on a tangle, and the learner — who had just been shown 가 at the top of
 * the same screen — could not tell that the two were the same character.
 *
 * So the assertions below are structural rather than pixel-exact. They say
 * where each component of a block must *be*, which is the part a future
 * refactor can silently get wrong.
 */

/** The ink bounding box of a run of strokes, in the 0–1 block. */
function bounds(strokes: Array<{ points: Array<{ x: number; y: number }> }>) {
  const xs = strokes.flatMap((s) => s.points.map((p) => p.x));
  const ys = strokes.flatMap((s) => s.points.map((p) => p.y));
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/** The strokes belonging to one component, split back out by count. */
function componentStrokes(syllable: string) {
  const composed = composeSyllableStrokes(syllable);
  const jamo = toJamo(syllable);
  const out: Array<{ jamo: string; strokes: typeof composed }> = [];
  let at = 0;
  for (const letter of jamo) {
    const count = (STROKE_ORDER[letter] ?? []).length;
    out.push({ jamo: letter, strokes: composed.slice(at, at + count) });
    at += count;
  }
  return out;
}

/** Every composed syllable the curriculum teaches. */
const SYLLABLES = ALL_CHARACTERS.filter((c) => c.group === 'syllable');

describe('syllable composition', () => {
  it('teaches syllables at all, so the sweep below is not vacuous', () => {
    expect(SYLLABLES.length).toBeGreaterThan(20);
  });

  it('puts the consonant left and the vowel right in 가', () => {
    const [giyeok, a] = componentStrokes('가');
    const consonant = bounds(giyeok!.strokes);
    const vowel = bounds(a!.strokes);

    // The whole bug in one line: the consonant finishes before the vowel starts.
    expect(consonant.right).toBeLessThan(vowel.left);
    // And with room between them, not merely touching.
    expect(vowel.left - consonant.right).toBeGreaterThan(0.05);

    // The stem of ㅏ — its first stroke — is the vowel's left edge, so the
    // branch really does hang off to the right of it.
    const stem = bounds([a!.strokes[0]!]);
    expect(consonant.right).toBeLessThan(stem.left);
    expect(stem.left).toBeGreaterThan(0.5);

    // Neither one is a miniature: each fills its half of the block vertically.
    expect(consonant.bottom - consonant.top).toBeGreaterThan(0.4);
    expect(vowel.bottom - vowel.top).toBeGreaterThan(0.65);
  });

  it('puts the consonant above and the vowel below in 고 and 구', () => {
    // Stacking, not spacing. How much air is between them is the reference
    // face's business — in 구 the two touch — so what is asserted is the order,
    // which is what makes it a horizontal-vowel block at all.
    for (const syllable of ['고', '구']) {
      const [initial, medial] = componentStrokes(syllable);
      const consonant = bounds(initial!.strokes);
      const vowel = bounds(medial!.strokes);
      expect(consonant.top, syllable).toBeLessThan(vowel.top);
      expect(consonant.bottom, syllable).toBeLessThan(vowel.bottom);
      // The vowel spans the block rather than hiding in one corner of it.
      expect(vowel.right - vowel.left, syllable).toBeGreaterThan(0.6);
    }
  });

  it('drops the 받침 into the bottom band, clear of the vowel', () => {
    const [initial, medial, final] = componentStrokes('안');
    const consonant = bounds(initial!.strokes);
    const vowel = bounds(medial!.strokes);
    const batchim = bounds(final!.strokes);

    expect(consonant.right).toBeLessThan(vowel.left);
    // The 받침 is below both, by their centres. Edges can cross by a hair —
    // the stem of ㅏ reaches a little past where ㄴ begins, as it does in the
    // reference face — and demanding otherwise would be demanding a gap the
    // face does not have.
    const middle = (b: { top: number; bottom: number }) => (b.top + b.bottom) / 2;
    expect(middle(vowel)).toBeLessThan(middle(batchim));
    expect(middle(consonant)).toBeLessThan(middle(batchim));
    expect(consonant.bottom).toBeLessThan(batchim.bottom);
    // The 받침 sits under the middle of the block, not off to one side.
    expect((batchim.left + batchim.right) / 2).toBeGreaterThan(0.4);
    expect((batchim.left + batchim.right) / 2).toBeLessThan(0.6);
  });

  it('keeps ㅣ and ㅡ centred in their slot rather than collapsed to an edge', () => {
    // A stroke with no width or no height cannot be scaled onto its region, and
    // the naive version divides by zero and paints it at NaN.
    const [, i] = componentStrokes('이');
    const stem = bounds(i!.strokes);
    expect(Number.isFinite(stem.left)).toBe(true);
    expect(stem.left).toBeGreaterThan(0.6);
    expect(stem.left).toBeLessThan(0.9);

    const [, eu] = componentStrokes('그');
    const bar = bounds(eu!.strokes);
    expect(bar.top).toBeGreaterThan(0.55);
    expect(bar.top).toBeLessThan(0.95);
  });

  it('draws ㅇ as a circle a learner reads as round, not as a polygon', () => {
    // ㅇ is a polyline like every other stroke, so the point count *is* the
    // resolution of the curve. At twelve points it read as a visible dodecagon
    // on the 어 screen. What matters is not the count but the corner it
    // leaves: the angle the pen turns through from one segment to the next,
    // which at this size has to stay under what an eye can pick out.
    for (const syllable of ['어', '아', '오', '우', '이', '으', '안', '강', '공']) {
      const strokes = composeSyllableStrokes(syllable);
      const round = strokes.find((s) => s.points.length > 8);
      expect(round, syllable).toBeDefined();
      let sharpest = 0;
      for (let i = 2; i < round!.points.length; i += 1) {
        const a = round!.points[i - 2]!;
        const b = round!.points[i - 1]!;
        const c = round!.points[i]!;
        const turn = Math.abs(
          Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x),
        );
        sharpest = Math.max(sharpest, Math.min(turn, Math.PI * 2 - turn));
      }
      expect((sharpest * 180) / Math.PI, syllable).toBeLessThan(15);
    }
  });

  it('keeps a consonant’s own proportions instead of stretching it to its slot', () => {
    // Filling the region exactly is what made ㄱ lean and ㅇ flatten into a
    // lens. A consonant is scaled by one factor in both directions, within a
    // bound that is tighter for a round letter than an angular one.
    for (const character of SYLLABLES) {
      const parts = componentStrokes(character.character);
      for (const [at, part] of parts.entries()) {
        if (at === 1) continue; // the vowel — straight lines, meant to stretch
        const own = bounds(STROKE_ORDER[part.jamo]!);
        const drawn = bounds(part.strokes);
        const scaleX = (drawn.right - drawn.left) / (own.right - own.left);
        const scaleY = (drawn.bottom - drawn.top) / (own.bottom - own.top);
        const distortion = Math.max(scaleX / scaleY, scaleY / scaleX);
        const round = STROKE_ORDER[part.jamo]!.some((s) => s.points.length > 8);
        expect(distortion, `${character.character} ${part.jamo}`).toBeLessThanOrEqual(
          (round ? 1.8 : 2.9) + 1e-9,
        );
      }
    }
  });

  it('puts ㅓ’s branch to the left of its stem, clear of the consonant', () => {
    const [ieung, eo] = componentStrokes('어');
    const consonant = bounds(ieung!.strokes);
    // ㅓ is written branch first, then the stem it hangs from.
    const branch = bounds([eo!.strokes[0]!]);
    const stem = bounds([eo!.strokes[1]!]);

    expect(branchesLeft('ㅓ')).toBe(true);
    expect(branch.right).toBeLessThanOrEqual(stem.left + 1e-9);
    expect(consonant.right).toBeLessThan(branch.left);
    // The stem is held off the frame, unlike 가's, because the branch needs the
    // room on its left. That is the whole reason ㅓ has a region of its own.
    expect(stem.left).toBeLessThan(0.94);
    const gaStem = bounds([componentStrokes('가')[1]!.strokes[0]!]);
    expect(stem.left).toBeGreaterThan(gaStem.left);
  });

  it('keeps every numbered marker whole inside the paper', () => {
    // The marker is a disc on the stroke's first point — see `ui/StrokeOrder`.
    // A start point too near the edge puts half the number off the paper.
    const RADIUS = 4.3 / 100;
    for (const character of SYLLABLES) {
      for (const [i, stroke] of character.strokes.entries()) {
        const start = stroke.points[0]!;
        const where = `${character.character} marker ${i + 1}`;
        expect(start.x, where).toBeGreaterThanOrEqual(RADIUS);
        expect(start.x, where).toBeLessThanOrEqual(1 - RADIUS);
        expect(start.y, where).toBeGreaterThanOrEqual(RADIUS);
        expect(start.y, where).toBeLessThanOrEqual(1 - RADIUS);
      }
    }
  });

  it('never draws one letter of a block on top of another', () => {
    /*
     * Boxes may touch and may even overlap a little — a ㄱ's leg comes down
     * beside a ㅗ's stem and the two bounding rectangles clip corners, which is
     * what the reference face does and what makes the block read as one
     * character. What must not happen is a letter sitting *on* another: the
     * test is whether a component's centre falls inside a different
     * component's box.
     */
    for (const character of SYLLABLES) {
      const parts = componentStrokes(character.character).filter((p) => p.strokes.length > 0);
      const boxes = parts.map((p) => bounds(p.strokes));
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = 0; j < boxes.length; j += 1) {
          if (i === j) continue;
          const a = boxes[i]!;
          const b = boxes[j]!;
          const cx = (a.left + a.right) / 2;
          const cy = (a.top + a.bottom) / 2;
          const inside = cx > b.left && cx < b.right && cy > b.top && cy < b.bottom;
          expect(inside, `${character.character}: ${parts[i]!.jamo} sits inside ${parts[j]!.jamo}`)
            .toBe(false);
        }
      }
    }
  });

  it('leaves a margin of paper around the block on all four sides', () => {
    // Not merely inside the frame — clear of it. A block drawn edge to edge is
    // what made the demonstration feel cramped even once the letters inside it
    // were correctly placed. The pen has width too, so the margin is measured
    // against the outside of the ink rather than the centre of it.
    const HALF_PEN = 5 / 2 / 100;
    for (const character of SYLLABLES) {
      const box = bounds(character.strokes);
      expect(box.left - HALF_PEN, character.character).toBeGreaterThan(0.06);
      expect(box.top - HALF_PEN, character.character).toBeGreaterThan(0.06);
      expect(box.right + HALF_PEN, character.character).toBeLessThan(0.94);
      expect(box.bottom + HALF_PEN, character.character).toBeLessThan(0.94);
    }
  });

  it('still fills the paper, so a syllable is not a shrunken letter in a corner', () => {
    // The other side of the margin above. A block has air around it and is
    // still the thing on the page, not a stamp in the middle of it. Measured
    // on the centrelines, so it reads a little under the ink's true span.
    for (const character of SYLLABLES) {
      const box = bounds(character.strokes);
      /*
       * Loose, and deliberately so. A block now carries the *reference glyph's*
       * proportions rather than being fitted to a square: 거 is genuinely
       * narrower than it is tall in this face, 고 wider. On top of that ㅣ is a
       * line with no width and ㅡ a line with no height, so the ink of 기 stops
       * at its stem and 그 at its bar. What is being caught here is a block that
       * has collapsed, not one that is not square.
       */
      const jamo = toJamo(character.character);
      expect(box.right - box.left, character.character).toBeGreaterThan(
        jamo.includes('ㅣ') ? 0.45 : 0.5,
      );
      expect(box.bottom - box.top, character.character).toBeGreaterThan(
        jamo.includes('ㅡ') ? 0.45 : 0.5,
      );
    }
  });

  it('keeps every letter in the slot its layout gives it', () => {
    /*
     * The general layout, which is now the fallback: a taught syllable is
     * placed from a measurement of the reference glyph instead (see
     * `composition.test.ts`), so this exercises the path a syllable takes
     * before anyone has measured it — 과, which the curriculum does not teach.
     */
    for (const character of [{ character: '과', strokes: composeSyllableStrokes('과') }]) {
      const layout = syllableLayout(character.character)!;
      // The slot as it lands on the paper — the layout describes the block, and
      // the block is set on the paper smaller than the paper. Same transform the
      // renderer uses, read from the same place, so this cannot drift.
      const slot = paperRegion(layout.initial);
      const parts = componentStrokes(character.character);
      const initial = bounds(parts[0]!.strokes);
      expect(initial.left, character.character).toBeGreaterThanOrEqual(slot.x0 - 1e-9);
      expect(initial.right, character.character).toBeLessThanOrEqual(slot.x1 + 1e-9);
      expect(initial.top, character.character).toBeGreaterThanOrEqual(slot.y0 - 1e-9);
      expect(initial.bottom, character.character).toBeLessThanOrEqual(slot.y1 + 1e-9);
    }
  });

  it('writes the letters in the order they are written, and counts them', () => {
    // The numbered markers are the first point of each stroke, so preserving the
    // order here is what keeps 1 → 2 → 3 on the right parts of 가.
    const strokes = composeSyllableStrokes('가');
    expect(strokes).toHaveLength(3);
    expect(getCharacterByGlyph('가')!.stroke_count).toBe(3);
    // Stroke 1 starts in the left half, strokes 2 and 3 in the right.
    expect(strokes[0]!.points[0]!.x).toBeLessThan(0.5);
    expect(strokes[1]!.points[0]!.x).toBeGreaterThan(0.5);
    expect(strokes[2]!.points[0]!.x).toBeGreaterThan(0.5);
    // Stroke 3 is the branch, which starts partway down stroke 2.
    expect(strokes[2]!.points[0]!.y).toBeGreaterThan(strokes[1]!.points[0]!.y);
  });

  it('composes wrapped vowels into three places rather than two', () => {
    // Nothing in the curriculum teaches 과 yet. The layout still has to be
    // right, because the composer is what any later lesson will use.
    const strokes = composeSyllableStrokes('과');
    expect(strokes).toHaveLength(5);
    const consonant = bounds(strokes.slice(0, 1));
    const o = bounds(strokes.slice(1, 3));
    const a = bounds(strokes.slice(3));
    expect(consonant.bottom).toBeLessThan(o.top);
    expect(o.right).toBeLessThan(a.left);
    expect(consonant.right).toBeLessThan(a.left);
  });

  it('is the only thing that lays a block out', () => {
    // A block built straight from `STROKE_ORDER` is the old bug. If this ever
    // matches again, something has gone back to concatenating full-box letters.
    const naive = toJamo('가').flatMap((j) => STROKE_ORDER[j] ?? []);
    expect(composeSyllableStrokes('가')).not.toEqual(naive);
  });
});
