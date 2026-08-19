import type { SyllableWritingState } from './useWordWriting';

/**
 * What to tell a learner about one syllable of a word.
 *
 * ## Only what the evaluator actually knows
 *
 * The grader compares two ink masks. It can say that ink landed away from the
 * glyph, that part of the glyph was never covered, that there is barely any ink
 * at all, or that both went wrong at once. It cannot say that a stroke is 11°
 * too steep or 13 px too far right — it never had strokes matched to reference
 * strokes to measure that against.
 *
 * So this maps the four reasons it *can* give onto four sentences, and stops.
 * A broad sentence that is true beats a precise one that is invented: a
 * beginner cannot tell which kind they are reading, and one confident wrong
 * hint teaches them to distrust the right ones.
 *
 * Returned as keys, not sentences, for the same reason `feedbackFor` does —
 * this is called from places that have no UI language.
 */
export interface SyllableAdvice {
  /** Key under `handwriting.word.advice.*`. */
  key: string;
  params?: Record<string, string | number>;
}

export function syllableAdvice(syllable: SyllableWritingState): SyllableAdvice {
  const verdict = syllable.evaluation;

  // Never graded. Either the box is empty, or its ink changed since the last
  // check — in both cases there is no evidence to describe, and saying "write
  // this part first" is the honest instruction.
  if (!verdict || !verdict.result) {
    return { key: 'word.advice.empty' };
  }
  if (verdict.passed) return { key: 'word.advice.passed' };

  switch (verdict.result.reason) {
    case 'empty':
      return { key: 'word.advice.empty' };
    case 'outside':
      return { key: 'word.advice.outside' };
    case 'incomplete':
      return { key: 'word.advice.incomplete' };
    case 'mixed':
    default:
      return { key: 'word.advice.mixed' };
  }
}
