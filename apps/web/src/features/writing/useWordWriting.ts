import { useCallback, useMemo, useState } from 'react';
import type { EvaluationConfig, Stroke } from '@hangyul-ganada/handwriting-core';

import { useEvaluator } from './useEvaluator';
import { evaluateWord, type SyllableEvaluation, type WordEvaluation } from './evaluateWord';

/**
 * Where one syllable of the word has got to.
 *
 * `drafted` is the state the old per-syllable screen had no room for: ink is on
 * the paper but nothing has judged it, because judging happens once for the
 * whole word. It is what lets the navigator say "this part is written" without
 * claiming "this part is right".
 */
export type SyllableStatus = 'empty' | 'drafted' | 'passed' | 'needsWork';

export interface SyllableWritingState {
  text: string;
  strokes: Stroke[];
  hasInk: boolean;
  /** The last verdict on *this ink*, or null if it has never been graded. */
  evaluation: SyllableEvaluation | null;
  status: SyllableStatus;
}

export type WordWritingStatus = 'writing' | 'needsWork' | 'passed';

export interface WordWritingState {
  activeIndex: number;
  syllables: SyllableWritingState[];
  /** Every syllable has ink, so the word can be checked. */
  ready: boolean;
  /** The learner has checked at least once — the summary has something to say. */
  hasChecked: boolean;
  checking: boolean;
  overallStatus: WordWritingStatus;
  /** Indices still needing work after the last check, in writing order. */
  needsWork: number[];
}

export interface UseWordWritingOptions {
  syllables: readonly string[];
  fontFamily: string;
  fontWeight?: number;
  config?: Partial<EvaluationConfig>;
  /** Called with the whole-word verdict each time the learner checks. */
  onChecked?: (evaluation: WordEvaluation) => void;
}

/**
 * The word-writing state model.
 *
 * One word, one active syllable, one check.
 *
 * ## Why the strokes live here
 *
 * Only the active canvas is mounted — that is what keeps four or five live
 * drawing surfaces off a phone. So navigating from 기 to 도 unmounts 기's box,
 * and its ink has to survive somewhere that is not the box. It survives here,
 * and is handed back when the box remounts.
 *
 * ## Why a verdict can be dropped
 *
 * Verdicts are per syllable and are cleared when that syllable's ink changes.
 * A ✓ earned by writing that has since been rubbed out is a lie, and the
 * learner would carry it into a check that then contradicts it. Clearing is
 * scoped to the edited syllable, so the other passes stand — which is the whole
 * of §21: only the parts that need work need doing again.
 *
 * Undo and clear are written in terms of `activeIndex` and cannot reach another
 * syllable.
 */
export function useWordWriting({
  syllables,
  fontFamily,
  fontWeight,
  config,
  onChecked,
}: UseWordWritingOptions) {
  const evaluator = useEvaluator();

  // The word itself is the identity of this state. A new word resets to its
  // first syllable: opening 기도하다 shows 기, never whatever index the previous
  // word happened to be left on.
  const wordKey = syllables.join('');
  const [word, setWord] = useState(wordKey);
  const [activeIndex, setActiveIndex] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[][]>(() => syllables.map(() => []));
  const [verdicts, setVerdicts] = useState<(SyllableEvaluation | null)[]>(() =>
    syllables.map(() => null),
  );
  const [hasChecked, setHasChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  // Render-phase reset rather than an effect: an effect would paint one frame
  // of the previous word's strokes under the new word's title.
  if (word !== wordKey) {
    setWord(wordKey);
    setActiveIndex(0);
    setStrokes(syllables.map(() => []));
    setVerdicts(syllables.map(() => null));
    setHasChecked(false);
    setChecking(false);
  }

  const state: WordWritingState = useMemo(() => {
    const items: SyllableWritingState[] = syllables.map((text, i) => {
      const ink = strokes[i] ?? [];
      const verdict = verdicts[i] ?? null;
      const status: SyllableStatus = verdict
        ? verdict.passed
          ? 'passed'
          : 'needsWork'
        : ink.length > 0
          ? 'drafted'
          : 'empty';
      return { text, strokes: ink, hasInk: ink.length > 0, evaluation: verdict, status };
    });

    // A word passes only when every syllable passes — a conjunction, never an
    // average. See `evaluateWord` for why.
    const passed = items.length > 0 && items.every((s) => s.status === 'passed');

    return {
      activeIndex,
      syllables: items,
      ready: items.length > 0 && items.every((s) => s.hasInk),
      hasChecked,
      checking,
      overallStatus: !hasChecked ? 'writing' : passed ? 'passed' : 'needsWork',
      needsWork: items.flatMap((s, i) => (s.status === 'needsWork' ? [i] : [])),
    };
  }, [syllables, strokes, verdicts, activeIndex, hasChecked, checking]);

  const goTo = useCallback(
    (index: number) => {
      // Clamped rather than trusted: rapid taps on the arrows must not be able
      // to produce an index with no syllable at it.
      setActiveIndex(Math.max(0, Math.min(syllables.length - 1, index)));
    },
    [syllables.length],
  );

  const next = useCallback(() => goTo(activeIndex + 1), [goTo, activeIndex]);
  const previous = useCallback(() => goTo(activeIndex - 1), [goTo, activeIndex]);

  /** Replaces the active syllable's ink. Never touches another syllable. */
  const setActiveStrokes = useCallback(
    (ink: Stroke[]) => {
      setStrokes((prev) => {
        const nextStrokes = [...prev];
        nextStrokes[activeIndex] = ink;
        return nextStrokes;
      });
      setVerdicts((prev) => {
        if (prev[activeIndex] === null) return prev;
        const nextVerdicts = [...prev];
        nextVerdicts[activeIndex] = null;
        return nextVerdicts;
      });
    },
    [activeIndex],
  );

  const check = useCallback(async () => {
    if (checking) return null;
    setChecking(true);
    try {
      const result = await evaluateWord(
        evaluator,
        syllables.map((character, i) => ({ character, strokes: strokes[i] ?? [] })),
        { glyph: { fontFamily, fontWeight }, config },
      );
      setVerdicts(result.syllables);
      setHasChecked(true);
      onChecked?.(result);
      return result;
    } finally {
      setChecking(false);
    }
  }, [checking, evaluator, syllables, strokes, fontFamily, fontWeight, config, onChecked]);

  return { state, goTo, next, previous, setActiveStrokes, check };
}
