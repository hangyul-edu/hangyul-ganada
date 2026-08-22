import type { EvaluationResult } from '@hangyul-ganada/handwriting-core';

/**
 * A verdict, expressed as translation keys rather than sentences.
 *
 * `feedbackFor` is a pure function over an evaluation: it is called from the
 * session pages, exercised by unit tests, and could be called from a worker.
 * None of those places has, or should have, a UI language. So it returns *what
 * happened* — a headline key, a detail key and the values to interpolate — and
 * the component renders it.
 *
 * The tone rules survive the change. Failure copy names the specific problem —
 * too small, missing a stroke, off to one side — because "try again" teaches
 * nothing, and the reference screens' incorrect state says "have another
 * think", never "wrong".
 */
export interface FeedbackCopy {
  /**
   * Key under `handwriting.feedback.*` for the one sentence that is shown.
   *
   * There is no headline any more. This used to carry one — "That's it!",
   * "Almost", "Not quite" — above the detail, and §8 removed the card both
   * were drawn in. The headline said how the learner had performed; the detail
   * says what to change, and only one of those is worth a line of a screen on
   * the fortieth attempt at a letter.
   *
   * On a *correct* attempt nothing is shown at all, so `feedbackFor` still
   * returns a detail for that case and no screen reads it.
   */
  detailKey: string;
  detailParams?: Record<string, string | number>;
}

export function feedbackFor(result: EvaluationResult, character: string): FeedbackCopy {
  if (result.passed) {
    return {
      ...(result.score > 0.97
        ? {
            detailKey: 'feedback.correct.perfect',
            detailParams: { character },
          }
        : {
            detailKey: 'feedback.correct.scored',
            detailParams: { character, score: result.score },
          }),
    };
  }

  switch (result.reason) {
    case 'empty':
      return { detailKey: 'feedback.empty.detail' };
    case 'incomplete':
      return {
        detailKey: isTooSmall(result)
          ? 'feedback.incomplete.tooSmall'
          : 'feedback.incomplete.missingStroke',
      };
    case 'outside':
      return {
        detailKey: isTooLarge(result)
          ? 'feedback.outside.tooLarge'
          : 'feedback.outside.strayStroke',
      };
    case 'scribble':
      /*
       * The right ink, laid down the wrong way — see `path.ts` in
       * handwriting-core. The copy says *what to do*, not what was detected:
       * a learner who was genuinely scrubbing knows what they did, and one who
       * was not is better served by "one clean stroke at a time" than by being
       * accused of scribbling.
       */
      return { detailKey: 'feedback.scribble.detail' };
    case 'mixed':
    default:
      return { detailKey: 'feedback.mixed.detail' };
  }
}

/** Undersized: the learner missed a lot without straying much. */
function isTooSmall(result: EvaluationResult): boolean {
  return result.diagnostics.inkRatio < 0.75 && result.outsideStrokeRatio < 0.1;
}

/** Oversized: plenty of ink, most of it beyond the glyph. */
function isTooLarge(result: EvaluationResult): boolean {
  return result.diagnostics.inkRatio > 1.25;
}

/**
 * The measurement, for the details panel.
 *
 * Ratios, not formatted percentages — the renderer applies the locale's percent
 * format, so this stays a pure summary of the numbers.
 */
export function scoreBreakdownParams(result: EvaluationResult): {
  mismatch: number;
  outside: number;
  missing: number;
} {
  return {
    mismatch: result.mismatchRatio,
    outside: result.outsideStrokeRatio,
    missing: result.missingCoverageRatio,
  };
}

// --- Stroke order ------------------------------------------------------------

/**
 * What the learner did differently from the standard stroke order.
 *
 * ## This never fails anybody
 *
 * It returns notes, and a note is shown *after* the verdict has already been
 * decided by the evaluator on the ink alone. That separation is deliberate and
 * is the whole design:
 *
 * - Stroke order is a real part of writing Korean and a learner who is never
 *   told about it will form habits that make their handwriting look wrong in a
 *   way they cannot diagnose.
 * - Stroke order is also not what makes a character correct. 는 written in an
 *   unusual order is still 는, and refusing it would be teaching a rule the
 *   language does not have.
 *
 * Grading on it would additionally punish the wrong people: someone writing
 * with a finger on a phone lifts and re-lands mid-stroke, and a left-handed
 * writer's directions differ on the diagonals. Neither has written a wrong
 * character.
 *
 * ## What it can actually tell
 *
 * Three things, all of them robust to sloppy input:
 *
 * | Note | How it is decided |
 * | --- | --- |
 * | stroke count | the learner's stroke count against the reference's |
 * | starting corner | where their first stroke began, against where it should |
 * | direction | whether a stroke ran the opposite way along its own axis |
 *
 * It deliberately does *not* try to match each learner stroke to a reference
 * stroke. Getting that wrong produces confident nonsense — "your third stroke
 * went the wrong way" when the learner simply merged two strokes — and a hint
 * that is sometimes wrong is worse than no hint, because a beginner cannot tell
 * which kind they are looking at.
 */
export interface StrokeOrderNote {
  /** Key under `handwriting.strokeOrder.notes.*`. */
  key: string;
  params?: Record<string, string | number>;
}

/** A stroke, as the canvas records it and as the reference data stores it. */
interface PointLike {
  x: number;
  y: number;
}

/**
 * How far apart two starting points may be before it is worth mentioning.
 *
 * A fifth of the box. Generous on purpose: the note is meant to catch someone
 * starting ㅗ from the bottom, not someone whose finger landed 6% left of the
 * ideal spot.
 */
const START_TOLERANCE = 0.2;

export function strokeOrderNotes(
  learner: Array<{ points: PointLike[] }>,
  reference: Array<{ points: PointLike[] }>,
): StrokeOrderNote[] {
  const notes: StrokeOrderNote[] = [];
  if (learner.length === 0 || reference.length === 0) return notes;

  if (learner.length !== reference.length) {
    notes.push({
      key: learner.length < reference.length ? 'strokeOrder.notes.fewer' : 'strokeOrder.notes.more',
      params: { theirs: learner.length, expected: reference.length },
    });
  }

  const theirStart = learner[0]!.points[0];
  const properStart = reference[0]!.points[0];
  if (theirStart && properStart && distance(theirStart, properStart) > START_TOLERANCE) {
    notes.push({
      key: 'strokeOrder.notes.startElsewhere',
      params: { corner: cornerKey(properStart) },
    });
  }

  // Direction is only checked when the counts agree, because when they do not,
  // stroke *n* of one is not stroke *n* of the other and the comparison would
  // be meaningless.
  if (learner.length === reference.length) {
    const reversed = learner.filter((stroke, index) =>
      runsBackwards(stroke.points, reference[index]!.points),
    ).length;
    if (reversed > 0) {
      notes.push({ key: 'strokeOrder.notes.direction', params: { count: reversed } });
    }
  }

  return notes;
}

function distance(a: PointLike, b: PointLike): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Whether a stroke was drawn end-to-start along its dominant axis.
 *
 * Compares only the axis the reference stroke actually travels along, and only
 * when it travels far enough for the answer to mean anything. A stroke that is
 * mostly a corner — ㄱ, ㄴ — has no single direction to be wrong about, so it is
 * judged on the axis it covers most, which is the one a learner would reverse.
 */
function runsBackwards(theirs: PointLike[], proper: PointLike[]): boolean {
  const first = theirs[0];
  const last = theirs[theirs.length - 1];
  const from = proper[0];
  const to = proper[proper.length - 1];
  if (!first || !last || !from || !to) return false;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const span = horizontal ? dx : dy;
  // Under a quarter of the box, direction is noise: ㅇ starts and ends in the
  // same place, and no honest answer exists for it.
  if (Math.abs(span) < 0.25) return false;

  const theirSpan = horizontal ? last.x - first.x : last.y - first.y;
  // A clear reversal, not a wobble: their travel must be at least a fifth of
  // the box in the opposite direction.
  return Math.sign(theirSpan) !== Math.sign(span) && Math.abs(theirSpan) > 0.2;
}

/** Which corner of the box a point is in, as a translation key suffix. */
function cornerKey(point: PointLike): string {
  const vertical = point.y < 0.4 ? 'top' : point.y > 0.6 ? 'bottom' : 'middle';
  const horizontal = point.x < 0.4 ? 'Left' : point.x > 0.6 ? 'Right' : 'Centre';
  return `${vertical}${horizontal}`;
}
