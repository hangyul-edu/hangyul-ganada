import { describe, expect, it } from 'vitest';
import type { EvaluationResult } from '@hangyul-ganada/handwriting-core';

import { createI18n } from '../../i18n/config';
import { feedbackFor, scoreBreakdownParams, strokeOrderNotes } from './feedback';

const result = (patch: Partial<EvaluationResult> = {}): EvaluationResult => ({
  passed: false,
  score: 0.5,
  mismatchRatio: 0.5,
  outsideStrokeRatio: 0.25,
  missingCoverageRatio: 0.25,
  reason: 'mixed',
  diagnostics: {
    userInk: 1000,
    referenceInk: 1000,
    inkRatio: 1,
    resolution: 128,
    toleranceRadiusPx: 4.5,
    largestGapRatio: 0,
    largestBlotRatio: 0,
    meanMissingRatio: 0.25,
  },
  ...patch,
});

/**
 * The classifier returns keys, so the tests render them.
 *
 * Two things are being checked at once, and both matter: that the evaluation is
 * mapped to the right *message*, and that the message exists in the bundle. A
 * test asserting on key names alone would pass happily while the learner saw
 * `feedback.outside.tooLarge` on screen.
 */
const i18n = createI18n('en');
const render = (copy: ReturnType<typeof feedbackFor>) => ({
  headline: i18n.t(copy.headlineKey, { ns: 'handwriting' }),
  detail: i18n.t(copy.detailKey, { ns: 'handwriting', ...copy.detailParams }),
});

describe('feedback copy', () => {
  it('celebrates a pass and names the character', () => {
    const copy = render(feedbackFor(result({ passed: true, score: 0.94, reason: null }), 'ㅏ'));
    expect(copy.headline).toBe("That's it!");
    expect(copy.detail).toContain('94');
  });

  it('does not quote a score when the trace was near perfect', () => {
    const copy = render(feedbackFor(result({ passed: true, score: 0.995, reason: null }), '가'));
    expect(copy.detail).toContain('가');
    expect(copy.detail).not.toMatch(/\d+%/);
  });

  it('keeps the Korean character in the copy rather than transliterating it', () => {
    const copy = render(feedbackFor(result({ passed: true, score: 0.995, reason: null }), '한'));
    expect(copy.detail).toContain('한');
  });

  it('asks for something to be written when the box is empty', () => {
    const copy = feedbackFor(result({ reason: 'empty' }), 'ㅏ');
    expect(copy.headlineKey).toBe('feedback.empty.headline');
    // Says where to put it, rather than naming a step: the same message shows
    // on both writing steps, and one of them is not tracing.
    expect(render(copy).detail).toMatch(/inside the box/i);
  });

  it('says "too small" rather than "missing strokes" for undersized writing', () => {
    // Little ink, none of it astray — that is small, not incomplete.
    const copy = feedbackFor(
      result({
        reason: 'incomplete',
        outsideStrokeRatio: 0.02,
        diagnostics: { ...result().diagnostics, inkRatio: 0.5 },
      }),
      '가',
    );
    expect(copy.detailKey).toBe('feedback.incomplete.tooSmall');
  });

  it('says "missing a stroke" when plenty was written but part was skipped', () => {
    const copy = feedbackFor(
      result({
        reason: 'incomplete',
        outsideStrokeRatio: 0.02,
        diagnostics: { ...result().diagnostics, inkRatio: 0.95 },
      }),
      '가',
    );
    expect(copy.detailKey).toBe('feedback.incomplete.missingStroke');
  });

  it('says "too large" rather than "off the guide" for oversized writing', () => {
    const copy = feedbackFor(
      result({
        reason: 'outside',
        diagnostics: { ...result().diagnostics, inkRatio: 1.6 },
      }),
      '가',
    );
    expect(copy.detailKey).toBe('feedback.outside.tooLarge');
  });

  it('never blames the learner, in either shipped language', () => {
    const ko = createI18n('ko');
    for (const reason of ['empty', 'outside', 'incomplete', 'mixed'] as const) {
      const copy = feedbackFor(result({ reason }), '가');
      const en = render(copy);
      expect(en.headline).not.toMatch(/wrong|fail|incorrect/i);
      expect(en.detail).toBeTruthy();

      const korean = ko.t(copy.headlineKey, { ns: 'handwriting' });
      expect(korean).not.toMatch(/틀렸|실패|오답/);
    }
  });

  it('resolves every key it can emit, so no learner ever sees a dotted path', () => {
    const cases = [
      result({ passed: true, score: 0.99, reason: null }),
      result({ passed: true, score: 0.8, reason: null }),
      ...(['empty', 'outside', 'incomplete', 'mixed'] as const).map((reason) =>
        result({ reason }),
      ),
    ];
    for (const evaluation of cases) {
      const copy = feedbackFor(evaluation, '가');
      const rendered = render(copy);
      expect(rendered.headline).not.toContain('.');
      expect(rendered.detail).not.toBe(copy.detailKey);
    }
  });
});

describe('score breakdown', () => {
  it('reports the three measurements as ratios for the formatter to render', () => {
    const params = scoreBreakdownParams(
      result({ mismatchRatio: 0.34, outsideStrokeRatio: 0.2, missingCoverageRatio: 0.14 }),
    );
    expect(params).toEqual({ mismatch: 0.34, outside: 0.2, missing: 0.14 });

    const text = i18n.t('feedback.breakdown', { ns: 'handwriting', ...params });
    expect(text).toContain('34%');
    expect(text).toContain('20%');
    expect(text).toContain('14%');
  });

  it('formats the same numbers the way the locale writes a percentage', () => {
    const de = createI18n('de');
    const text = de.t('feedback.breakdown', {
      ns: 'handwriting',
      ...scoreBreakdownParams(
        result({ mismatchRatio: 0.34, outsideStrokeRatio: 0.2, missingCoverageRatio: 0.14 }),
      ),
    });
    // German puts a non-breaking space before the sign: "34 %", not "34%". A
    // hand-built `${n}%` would be wrong here, which is the point of the test —
    // every number on screen goes through Intl.
    expect(text).toContain('34 %');
    expect(text).not.toBe('feedback.breakdown');
  });
});

/**
 * Stroke-order notes.
 *
 * The behaviour worth pinning is not that the notes are *right* — that is a
 * judgement about Korean, and the data is where it lives — but that they are
 * **advisory and quiet**. A learner who writes correctly should hear nothing,
 * and nothing here should ever be able to turn a pass into a failure.
 */
describe('stroke order notes', () => {
  const line = (points: Array<[number, number]>) => ({
    points: points.map(([x, y]) => ({ x, y })),
  });

  /** ㅏ: the upright top-to-bottom, then the branch left-to-right. */
  const reference = [
    line([
      [0.45, 0.1],
      [0.45, 0.9],
    ]),
    line([
      [0.45, 0.5],
      [0.8, 0.5],
    ]),
  ];

  it('says nothing when the learner wrote it the standard way', () => {
    const learner = [
      line([
        [0.44, 0.12],
        [0.46, 0.88],
      ]),
      line([
        [0.46, 0.52],
        [0.78, 0.51],
      ]),
    ];
    expect(strokeOrderNotes(learner, reference)).toEqual([]);
  });

  it('mentions a stroke count that differs, in both directions', () => {
    const merged = [line([[0.45, 0.1], [0.45, 0.9], [0.8, 0.5]])];
    expect(strokeOrderNotes(merged, reference)[0]?.key).toBe('strokeOrder.notes.fewer');

    const split = [...reference, line([[0.5, 0.2], [0.6, 0.2]])];
    expect(strokeOrderNotes(split, reference)[0]?.key).toBe('strokeOrder.notes.more');
  });

  it('names where the first stroke usually starts, as a place rather than a fault', () => {
    const startedLow = [
      line([
        [0.45, 0.9],
        [0.45, 0.1],
      ]),
      reference[1]!,
    ];
    const notes = strokeOrderNotes(startedLow, reference);
    expect(notes.some((n) => n.key === 'strokeOrder.notes.startElsewhere')).toBe(true);
    // And the place is a key the bundle can render, not a coordinate.
    const note = notes.find((n) => n.key === 'strokeOrder.notes.startElsewhere')!;
    expect(i18n.t(`strokeOrder.corners.${String(note.params!.corner)}`, { ns: 'handwriting' })).toBe(
      'top',
    );
  });

  it('notices a stroke drawn end-to-start', () => {
    const backwards = [
      line([
        [0.45, 0.9],
        [0.45, 0.1],
      ]),
      reference[1]!,
    ];
    const notes = strokeOrderNotes(backwards, reference);
    expect(notes.some((n) => n.key === 'strokeOrder.notes.direction')).toBe(true);
  });

  it('does not guess a direction for a stroke that has none', () => {
    // ㅇ starts and ends in the same place, so "backwards" is not a question
    // with an answer. Reporting one would be inventing a fault.
    const circle = line([
      [0.5, 0.2],
      [0.3, 0.5],
      [0.5, 0.8],
      [0.7, 0.5],
      [0.5, 0.2],
    ]);
    const drawnTheOtherWay = line([
      [0.5, 0.2],
      [0.7, 0.5],
      [0.5, 0.8],
      [0.3, 0.5],
      [0.5, 0.2],
    ]);
    expect(strokeOrderNotes([drawnTheOtherWay], [circle])).toEqual([]);
  });

  it('renders every note it can produce', () => {
    const cases = [
      [line([[0.45, 0.1], [0.45, 0.9], [0.8, 0.5]])],
      [...reference, line([[0.5, 0.2], [0.6, 0.2]])],
      [line([[0.45, 0.9], [0.45, 0.1]]), reference[1]!],
    ];
    for (const learner of cases) {
      for (const note of strokeOrderNotes(learner, reference)) {
        const params = note.params?.corner
          ? {
              ...note.params,
              corner: i18n.t(`strokeOrder.corners.${String(note.params.corner)}`, {
                ns: 'handwriting',
              }),
            }
          : note.params;
        const rendered = i18n.t(note.key, { ns: 'handwriting', ...params });
        expect(rendered).not.toBe(note.key);
        expect(rendered).not.toContain('{{');
      }
    }
  });

  it('is not consulted by the verdict', () => {
    // The guard that matters: `feedbackFor` takes an evaluation and a
    // character, and has no way to see a stroke. A future change that tried to
    // fail someone for stroke order would have to change its signature first.
    expect(feedbackFor(result({ passed: true, score: 0.99 }), 'ㅏ').headlineKey).toBe(
      'feedback.correct.headline',
    );
  });
});
