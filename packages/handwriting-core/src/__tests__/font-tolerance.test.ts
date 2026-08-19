import { describe, expect, it } from 'vitest';

import { DEFAULT_EVALUATION_CONFIG, MAX_MISMATCH_RATIO } from '../config.js';
import { evaluateMasks } from '../evaluate.js';
import { countInk } from '../mask.js';
import type { Mask } from '../types.js';
import {
  FIXTURE_FONTS,
  erodeOrDilateMask,
  glyphMask,
  rewriteWithPen,
  scaleMask,
  shiftMask,
} from './fixtures.js';

/**
 * Does one pass mark serve every typeface the app offers?
 *
 * `real-glyphs.test.ts` calibrates the algorithm against one face. This asks
 * the question that only exists because there are six: a learner who has
 * selected the calligraphic 바탕 face, or the rounded one, writes with the same
 * pen and the same hand as everybody else — so an honest attempt has to pass in
 * *every* face, and a wrong character has to fail in every face, at the same
 * threshold.
 *
 * Both halves matter and they pull against each other. Loosening tolerance
 * until no honest attempt fails eventually lets a different character through,
 * which is a worse defect than a retry: it tells a learner that 이 is an
 * acceptable 가.
 *
 * ## What "an honest attempt" means here
 *
 * Not the glyph nudged a few pixels — that model cannot see the thing that
 * actually differs between faces. A learner's pen is 0.062 of the box wide
 * whatever is selected; the reference stroke is whatever the designer drew, and
 * across these six that ranges from roughly half the pen to one and a half
 * times it. So the attempt is the glyph's *skeleton re-inked at the pen's
 * width* (`rewriteWithPen`), and then written imperfectly: a little small, a
 * little large, a few pixels off, a heavier or lighter hand.
 *
 * That is what caught the two faces this set does not contain. See the note in
 * `apps/web/src/data/fonts.ts` for what happened to Jua and Nanum Pen Script.
 */

/** The pen the writing canvas draws with, as a radius in mask pixels. */
const PEN_RADIUS_PX = (0.062 * DEFAULT_EVALUATION_CONFIG.resolution) / 2;

const CHARACTERS = ['ㄱ', 'ㅏ', '가', '사', '한', '물', '이'];

/** The same character, correctly written, by a hand that is not a typesetter. */
function honestAttempts(reference: Mask): Array<{ name: string; mask: Mask }> {
  const pen = rewriteWithPen(reference, PEN_RADIUS_PX);
  return [
    { name: 'their own pen', mask: pen },
    { name: 'a little right and down', mask: shiftMask(pen, 3, 2) },
    { name: 'a little left and up', mask: shiftMask(pen, -3, -3) },
    { name: 'a tenth too small', mask: scaleMask(pen, 0.9) },
    { name: 'a tenth too large', mask: scaleMask(pen, 1.1) },
    { name: 'a lighter hand', mask: erodeOrDilateMask(pen, -1) },
    { name: 'a heavier hand', mask: erodeOrDilateMask(pen, 2) },
    { name: 'small and off-centre', mask: shiftMask(scaleMask(pen, 0.92), 2, 2) },
    { name: 'large and off-centre', mask: shiftMask(scaleMask(pen, 1.08), -2, 1) },
  ];
}

describe.each(FIXTURE_FONTS)('%s', (font) => {
  it('passes an honest attempt at every character', () => {
    for (const character of CHARACTERS) {
      const reference = glyphMask(character, font);
      for (const { name, mask } of honestAttempts(reference)) {
        const result = evaluateMasks(mask, reference);
        expect(
          result.passed,
          `${font}: ${character} written with ${name} scored ${result.mismatchRatio.toFixed(3)}`,
        ).toBe(true);
      }
    }
  });

  it('still fails a different character', () => {
    for (const character of CHARACTERS) {
      const reference = glyphMask(character, font);
      for (const other of CHARACTERS) {
        if (other === character) continue;
        // Written properly, with the learner's own pen — the strongest form of
        // the wrong answer, and the one a looser tolerance would let through.
        const attempt = rewriteWithPen(glyphMask(other, font), PEN_RADIUS_PX);
        const result = evaluateMasks(attempt, reference);
        expect(
          result.passed,
          `${font}: ${other} was accepted as ${character} (${result.mismatchRatio.toFixed(3)})`,
        ).toBe(false);
      }
    }
  });

  it('leaves room on both sides of the pass mark', () => {
    // Not just "the tests pass" but "they pass with margin". A face whose
    // honest attempts creep up to the pass mark is one bad day away from
    // failing learners in the field, where handwriting varies more than nine
    // synthetic perturbations do.
    let worstHonest = 0;
    let bestWrong = 1;
    for (const character of CHARACTERS) {
      const reference = glyphMask(character, font);
      for (const { mask } of honestAttempts(reference)) {
        worstHonest = Math.max(worstHonest, evaluateMasks(mask, reference).mismatchRatio);
      }
      for (const other of CHARACTERS) {
        if (other === character) continue;
        const attempt = rewriteWithPen(glyphMask(other, font), PEN_RADIUS_PX);
        bestWrong = Math.min(bestWrong, evaluateMasks(attempt, reference).mismatchRatio);
      }
    }
    expect(worstHonest, `${font}: worst honest attempt`).toBeLessThan(MAX_MISMATCH_RATIO - 0.02);
    expect(bestWrong, `${font}: closest wrong character`).toBeGreaterThan(MAX_MISMATCH_RATIO + 0.01);
  });
});

describe('the pen model itself', () => {
  it('re-inks a heavy face thinner and a light face thicker', () => {
    // Guards the premise of everything above: if `rewriteWithPen` did not
    // actually normalise stroke weight, the tests would be measuring the
    // typefaces' weights and quietly passing.
    const weights = FIXTURE_FONTS.map((font) => {
      const reference = glyphMask('물', font);
      return countInk(rewriteWithPen(reference, PEN_RADIUS_PX)) / countInk(reference);
    });
    // A face drawn near the pen's width barely moves; the light ones gain ink.
    expect(Math.min(...weights)).toBeLessThan(1.05);
    expect(Math.max(...weights)).toBeGreaterThan(1.15);
  });
});

describe('a typeface may override the grading', () => {
  it('applies the config it is handed', () => {
    // No bundled face needs this today — the default tolerance was measured to
    // serve all six. The mechanism is still exercised, because the day a face
    // does need it is not the day to find out whether the override works.
    const reference = glyphMask('가');
    const wrong = rewriteWithPen(glyphMask('물'), PEN_RADIUS_PX);
    expect(evaluateMasks(wrong, reference).passed).toBe(false);
    expect(evaluateMasks(wrong, reference, { maxMismatchRatio: 1 }).passed).toBe(true);
  });
});
