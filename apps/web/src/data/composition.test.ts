import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS, getCharacterByGlyph } from './characters';
import { COMPOSED_PEN } from './compose';
import { toJamo } from './jamo';
import { STROKE_ORDER } from './strokes';

/**
 * How the letters of a block sit together.
 *
 * `compose.test.ts` next door checks the structure — consonant left, vowel
 * right, 받침 underneath. This checks the *spacing*, which is a different
 * failure and the one that survived every structural fix: letters correctly
 * arranged and still not composed, standing apart with a gap the typeface does
 * not have. A learner reads that as ㅇ ㅓ rather than 어.
 *
 * The spacing now comes from measuring the reference glyph per syllable — see
 * `scripts/measure-composition.mjs`. So what is defended here is that the
 * measurement is actually being used: that syllables the face draws touching
 * come out touching, that syllables it draws apart keep their gap, and that no
 * syllable has fallen back to a uniform slot spacing for all of them.
 */

/** The strokes belonging to each letter, split out by stroke count. */
function parts(syllable: string) {
  const character = getCharacterByGlyph(syllable)!;
  const jamo = toJamo(syllable);
  const out: Array<{ jamo: string; left: number; right: number; top: number; bottom: number }> = [];
  let at = 0;
  for (const letter of jamo) {
    const count = (STROKE_ORDER[letter] ?? []).length;
    const points = character.strokes.slice(at, at + count).flatMap((s) => s.points);
    at += count;
    out.push({
      jamo: letter,
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      top: Math.min(...points.map((p) => p.y)),
      bottom: Math.max(...points.map((p) => p.y)),
    });
  }
  return out;
}

/** Gap between two components' *ink*, which is the centrelines plus the pen. */
const gapBetween = (a: number, b: number) => b - a - COMPOSED_PEN;

const SYLLABLES = ALL_CHARACTERS.filter((c) => c.group === 'syllable');

describe('how a block holds together', () => {
  it('lets 어’s ㅇ and ㅓ meet, because the reference face joins them', () => {
    // The regression case. The old layout put a tenth of the block between
    // them — the average gap across a class of syllables — and 어 read as two
    // letters standing next to each other.
    const [ieung, eo] = parts('어');
    expect(gapBetween(ieung!.right, eo!.left)).toBeLessThan(0.02);
  });

  it('lets 오’s ㅇ and ㅗ meet in the same way, vertically', () => {
    const [ieung, o] = parts('오');
    expect(gapBetween(ieung!.bottom, o!.top)).toBeLessThan(0.02);
  });

  it('keeps the gap in 가, because the face has one there', () => {
    // The other half of the rule: not "close everything up" but "do what the
    // reference does". ㄱ and ㅏ genuinely stand apart.
    const [giyeok, a] = parts('가');
    expect(gapBetween(giyeok!.right, a!.left)).toBeGreaterThan(0.04);
  });

  it('spaces syllables differently from one another', () => {
    // A single spacing rule applied to every syllable is exactly what this
    // replaced, and it would pass every test above except this one.
    const vertical = ['가', '거', '바', '어', '자', '하'].map((syllable) => {
      const [consonant, vowel] = parts(syllable);
      return gapBetween(consonant!.right, vowel!.left);
    });
    const spread = Math.max(...vertical) - Math.min(...vertical);
    expect(spread).toBeGreaterThan(0.03);
  });

  it('never leaves a component floating away from the rest', () => {
    for (const character of SYLLABLES) {
      const laid = parts(character.character);
      for (let at = 1; at < laid.length; at += 1) {
        const before = laid[at - 1]!;
        const here = laid[at]!;
        // Some gap in one axis is normal; a gap in *both* means the letter is
        // adrift, sharing no edge with anything.
        const across = Math.max(gapBetween(before.right, here.left), gapBetween(here.right, before.left));
        const down = Math.max(gapBetween(before.bottom, here.top), gapBetween(here.bottom, before.top));
        expect(Math.min(across, down), `${character.character}: ${before.jamo}/${here.jamo}`)
          .toBeLessThan(0.12);
      }
    }
  });

  it('keeps every component inside the frame, ink and all', () => {
    const half = COMPOSED_PEN / 2;
    for (const character of SYLLABLES) {
      for (const part of parts(character.character)) {
        const where = `${character.character} ${part.jamo}`;
        expect(part.left - half, where).toBeGreaterThanOrEqual(0);
        expect(part.top - half, where).toBeGreaterThanOrEqual(0);
        expect(part.right + half, where).toBeLessThanOrEqual(1);
        expect(part.bottom + half, where).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps the block roughly square, as a Hangul block is', () => {
    for (const character of SYLLABLES) {
      const laid = parts(character.character);
      const width = Math.max(...laid.map((p) => p.right)) - Math.min(...laid.map((p) => p.left));
      const height = Math.max(...laid.map((p) => p.bottom)) - Math.min(...laid.map((p) => p.top));
      const aspect = width / height;
      // ㅣ and ㅡ blocks are genuinely narrower or shorter — their vowel is one
      // line — so the bound is loose. It is here to catch a block that has
      // collapsed or spread, not to police proportions.
      expect(aspect, character.character).toBeGreaterThan(0.5);
      expect(aspect, character.character).toBeLessThan(2);
    }
  });
});
