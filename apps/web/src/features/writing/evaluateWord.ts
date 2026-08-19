import type {
  EvaluationConfig,
  EvaluationResult,
  HandwritingEvaluator,
  Stroke,
} from '@hangyul-ganada/handwriting-core';

/**
 * Grading a whole Korean word.
 *
 * ## Why this layer exists
 *
 * The evaluator grades one character against one reference glyph, and that is
 * the right size for it — 기도하다 is four glyphs and there is no such thing as
 * a four-glyph reference mask. So the word level is an *aggregation*, not a
 * second evaluator: `evaluateWord` calls the calibrated grader once per
 * syllable and assembles one verdict out of the answers. The geometry, the
 * thresholds and the per-font slack are untouched.
 *
 * From the learner's side it is one action with one result. That difference —
 * four calls inside, one grading event outside — is the whole point of the
 * function.
 *
 * ## Every syllable has to pass
 *
 * `passed` is a conjunction, never an average. A word written
 *
 * ```
 * 기 95%   도 95%   하 0%   다 0%
 * ```
 *
 * has two characters in it that are not the characters they were meant to be,
 * and averaging to 48% — or worse, to a pass — would be telling a learner they
 * wrote 기도하다 when they did not. Korean words are spelled with all of their
 * syllables.
 */

/** What the learner has drawn for one syllable of the word. */
export interface SyllableAttempt {
  /** The syllable itself, e.g. `도`. */
  character: string;
  strokes: readonly Stroke[];
}

/** One syllable's share of the word's verdict. */
export interface SyllableEvaluation {
  character: string;
  passed: boolean;
  /**
   * The grader's answer, or `null` when there was nothing to grade.
   *
   * `null` means the box was empty and the evaluator was never called — see
   * `evaluateWord`. It is not a failure to grade, it is an absence of writing,
   * and the copy layer says "write this part first" rather than naming a shape
   * problem in ink that does not exist.
   */
  result: EvaluationResult | null;
}

export interface WordEvaluation {
  /** True only when every syllable passed. */
  passed: boolean;
  syllables: SyllableEvaluation[];
  /** Indices of the syllables still needing work, in writing order. */
  needsWork: number[];
}

export interface EvaluateWordOptions {
  /** The practice typeface, shared by every syllable of the word. */
  glyph: { fontFamily: string; fontWeight?: number };
  /** Per-font grading slack — `gradingFor(font)`. */
  config?: Partial<EvaluationConfig>;
}

/**
 * Grades every syllable of a word and folds the answers into one verdict.
 *
 * Sequential rather than concurrent on purpose. The rasteriser caches reference
 * masks, so the work is small either way, and running four canvas
 * rasterisations at once on a low-end phone buys nothing worth the memory
 * spike.
 *
 * Every syllable is graded on every call, including ones that passed before.
 * Re-grading unchanged ink is cheap and it cannot go stale, whereas carrying an
 * old verdict forward means holding a result whose strokes may since have been
 * cleared. Preserving a pass is the *stroke* state's job, not this function's:
 * ink that passed and was not touched passes again.
 */
export async function evaluateWord(
  evaluator: HandwritingEvaluator,
  attempts: readonly SyllableAttempt[],
  { glyph, config }: EvaluateWordOptions,
): Promise<WordEvaluation> {
  const syllables: SyllableEvaluation[] = [];

  for (const attempt of attempts) {
    // An empty box short-circuits. The evaluator handles empty input correctly,
    // but asking it to would still rasterise a reference glyph to compare
    // nothing against, and a font that fails to render throws — turning "you
    // have not written this part yet" into a crash. The UI normally prevents
    // this state; the domain still has to survive it.
    if (attempt.strokes.length === 0) {
      syllables.push({ character: attempt.character, passed: false, result: null });
      continue;
    }

    const result = await evaluator.evaluate({
      strokes: attempt.strokes,
      glyph: { character: attempt.character, ...glyph },
      config,
    });
    syllables.push({ character: attempt.character, passed: result.passed, result });
  }

  return {
    // A word with no syllables has not been written well, it has not been
    // written at all — `every` on an empty list is true, so this is guarded.
    passed: syllables.length > 0 && syllables.every((s) => s.passed),
    syllables,
    needsWork: syllables.flatMap((s, i) => (s.passed ? [] : [i])),
  };
}
