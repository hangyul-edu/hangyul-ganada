import { describe, expect, it, vi } from 'vitest';
import type {
  EvaluationResult,
  HandwritingEvaluator,
  Stroke,
} from '@hangyul-ganada/handwriting-core';

import { evaluateWord } from './evaluateWord';

/** A stroke with real points, so `strokes.length` is not the only thing true. */
const ink: Stroke[] = [{ points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }], width: 0.06 }];

function verdict(passed: boolean, reason: EvaluationResult['reason'] = null): EvaluationResult {
  return {
    passed,
    score: passed ? 0.95 : 0.2,
    mismatchRatio: passed ? 0.05 : 0.8,
    outsideStrokeRatio: 0,
    missingCoverageRatio: 0,
    reason,
    diagnostics: {
      userInk: 100,
      referenceInk: 100,
      inkRatio: 1,
      resolution: 128,
      toleranceRadiusPx: 4,
      largestGapRatio: 0,
      largestBlotRatio: 0,
      meanMissingRatio: 0,
    },
  };
}

/** Grades each character according to a lookup, and counts its calls. */
function evaluatorFor(byCharacter: Record<string, EvaluationResult>): HandwritingEvaluator {
  return {
    id: 'stub',
    evaluate: vi.fn(async ({ glyph }) => byCharacter[glyph.character] ?? verdict(false, 'mixed')),
  };
}

const FONT = { glyph: { fontFamily: 'Test Sans', fontWeight: 400 } };

describe('evaluateWord', () => {
  it('grades every syllable from one call', async () => {
    const evaluator = evaluatorFor({
      기: verdict(true),
      도: verdict(true),
      하: verdict(true),
      다: verdict(true),
    });

    const result = await evaluateWord(
      evaluator,
      ['기', '도', '하', '다'].map((character) => ({ character, strokes: ink })),
      FONT,
    );

    // One grading event to the learner, four calls to the calibrated grader.
    expect(evaluator.evaluate).toHaveBeenCalledTimes(4);
    expect(result.syllables.map((s) => s.character)).toEqual(['기', '도', '하', '다']);
    expect(result.passed).toBe(true);
    expect(result.needsWork).toEqual([]);
  });

  it('fails the word when any syllable fails, and never averages', async () => {
    // The case from the brief: two near-perfect syllables and two that are not
    // the character at all. An average would be 48% — or, with a kinder
    // weighting, a pass. Neither is a word the learner has written.
    const evaluator = evaluatorFor({
      기: verdict(true),
      도: verdict(true),
      하: verdict(false, 'outside'),
      다: verdict(false, 'incomplete'),
    });

    const result = await evaluateWord(
      evaluator,
      ['기', '도', '하', '다'].map((character) => ({ character, strokes: ink })),
      FONT,
    );

    expect(result.passed).toBe(false);
    expect(result.needsWork).toEqual([2, 3]);
    expect(result.syllables[0]!.passed).toBe(true);
    expect(result.syllables[1]!.passed).toBe(true);
    expect(result.syllables[2]!.result!.reason).toBe('outside');
    expect(result.syllables[3]!.result!.reason).toBe('incomplete');
  });

  it('fails on a single bad syllable out of four', async () => {
    const evaluator = evaluatorFor({
      기: verdict(true),
      도: verdict(true),
      하: verdict(true),
      다: verdict(false, 'mixed'),
    });

    const result = await evaluateWord(
      evaluator,
      ['기', '도', '하', '다'].map((character) => ({ character, strokes: ink })),
      FONT,
    );

    expect(result.passed).toBe(false);
    expect(result.needsWork).toEqual([3]);
  });

  it('reports an unwritten syllable without calling the grader', async () => {
    const evaluator = evaluatorFor({ 사: verdict(true), 과: verdict(true) });

    const result = await evaluateWord(
      evaluator,
      [
        { character: '사', strokes: ink },
        { character: '과', strokes: [] },
      ],
      FONT,
    );

    // Nothing was drawn, so nothing was graded — and the reference glyph was
    // never rasterised, which is what stops a font failure turning "not written
    // yet" into a thrown error.
    expect(evaluator.evaluate).toHaveBeenCalledTimes(1);
    expect(result.syllables[1]).toEqual({ character: '과', passed: false, result: null });
    expect(result.passed).toBe(false);
    expect(result.needsWork).toEqual([1]);
  });

  it('survives a word where nothing at all has been written', async () => {
    const evaluator = evaluatorFor({});

    const result = await evaluateWord(
      evaluator,
      ['기', '도', '하', '다'].map((character) => ({ character, strokes: [] })),
      FONT,
    );

    expect(evaluator.evaluate).not.toHaveBeenCalled();
    expect(result.passed).toBe(false);
    expect(result.needsWork).toEqual([0, 1, 2, 3]);
    expect(result.syllables.every((s) => s.result === null)).toBe(true);
  });

  it('does not pass a word with no syllables', async () => {
    const result = await evaluateWord(evaluatorFor({}), [], FONT);
    // `every` on an empty list is true, so this is the guard, not a formality.
    expect(result.passed).toBe(false);
  });

  it('passes the per-font grading slack through to every syllable', async () => {
    const evaluator = evaluatorFor({ 사: verdict(true), 과: verdict(true) });
    const config = { maxMismatchRatio: 0.14 };

    await evaluateWord(
      evaluator,
      [
        { character: '사', strokes: ink },
        { character: '과', strokes: ink },
      ],
      { ...FONT, config },
    );

    for (const call of (evaluator.evaluate as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0].config).toBe(config);
      expect(call[0].glyph.fontFamily).toBe('Test Sans');
    }
  });
});
