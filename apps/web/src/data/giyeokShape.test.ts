import { describe, expect, it } from 'vitest';

import { blockLetterForms } from './compose';
import { vectorGlyph } from './strokeVectors';

/**
 * The ㄱ regression, pinned without a browser.
 *
 * `glyphshape:qa` is the real check — it renders the letter and the practice
 * face and compares the ink — but it needs Chromium and the font file, so it
 * runs on the release gate rather than on every save. These assertions are the
 * cheap half: they read the authored geometry directly and fail in a second if
 * the lean is ever flattened again.
 *
 * The defect they exist for: the leg of ㄱ beside a vowel was authored to come
 * back 0.28 of the letter's width, where Pretendard brings it back 0.885. On
 * screen the letter read as top-heavy, with the leg stopping short of where the
 * tracing guide underneath it put the same stroke. 가 and 거 are the two the
 * customer named; 기 has the same form and 강 has it with a 받침 underneath.
 */

/** Where the leg ends, as a fraction of the ㄱ's own width. 0 is under the bar's left end. */
function toeFraction(syllable: string): number {
  const [initial] = blockLetterForms(syllable);
  const stroke = initial!.strokes[0]!;
  const xs = stroke.points.map((p) => p.x);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const toe = stroke.points[stroke.points.length - 1]!.x;
  return (toe - left) / (right - left);
}

describe('ㄱ beside a vowel leans the way the face leans it', () => {
  /*
    Measured off Pretendard, per syllable, taking the ㄱ's region from the
    measured composition so the vowel's ink cannot be counted as the leg:
    가 0.120, 거 0.116, 기 0.113. The band is wide enough for the difference
    between the authored curve and a font outline and nowhere near wide enough
    to admit the 0.72 this used to be.
  */
  for (const syllable of ['가', '거', '기', '강']) {
    it(`${syllable} brings the leg back to about an eighth of the letter`, () => {
      expect(toeFraction(syllable)).toBeGreaterThan(0.05);
      expect(toeFraction(syllable)).toBeLessThan(0.2);
    });
  }
});

describe('ㄱ above a vowel does not lean', () => {
  // 고, 구, 그 and the letter alone: the face brings the leg straight down, and
  // a leaning form stretched into a wide, shallow slot lies over at sixty
  // degrees. Both forms exist for this reason; see `strokesOf`.
  for (const syllable of ['고', '구', '그']) {
    it(`${syllable} keeps the leg upright`, () => {
      expect(toeFraction(syllable)).toBeGreaterThan(0.9);
    });
  }

  it('and neither does the letter on its own', () => {
    const glyph = vectorGlyph('ㄱ');
    expect(glyph.strokes).toHaveLength(1);
    // A straight leg: the path has no curve segment to bow it.
    expect(glyph.strokes[0]!.d).not.toMatch(/[Cc]/);
  });
});
