import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EvaluationConfig, EvaluationResult, Stroke } from '@hangyul-ganada/handwriting-core';

import { Button } from '../../ui/Button';
import { FocusFooter } from '../../ui/FocusScreen';
import { EraserIcon, UndoIcon } from '../../ui/icons';
import { WritingCanvas, type WritingCanvasHandle } from './WritingCanvas';
import { useEvaluator } from './useEvaluator';
import styles from './PracticeCanvasCard.module.css';

export interface PracticeCanvasCardProps {
  character: string;
  fontFamily: string;
  fontWeight?: number;
  /**
   * Grading slack for the selected typeface — `gradingFor(font)`. Omitted, the
   * evaluator's own defaults apply.
   */
  grading?: Partial<EvaluationConfig>;
  /** How much of the reference glyph this step shows. */
  showGrid?: boolean;
  showCenterCrosshair?: boolean;
  status: 'idle' | 'correct' | 'incorrect';
  /** Disables input once the item has been answered correctly. */
  locked?: boolean;
  /**
   * A verdict is showing. The check button hides, because the feedback card
   * now owns the next action — two competing primary buttons on one screen is
   * exactly the confusion a beginner does not need.
   */
  resultShown?: boolean;
  /**
   * The verdict and the strokes that produced it — the strokes so the session
   * can say something about stroke *order*, which the evaluator cannot see in a
   * finished image.
   */
  onEvaluated: (result: EvaluationResult, strokes: Stroke[]) => void;
  /** Label above the box, e.g. the syllable's position in a word. */
  caption?: string;
  compact?: boolean;
}

/**
 * A writing box plus its controls.
 *
 * Every canvas action has a real button: a learner who cannot draw with a
 * pointer, or who is using a keyboard or switch, still gets undo, clear and
 * check. The canvas is an enhancement over those controls, not the only way in.
 *
 * There is no hint button, because there is nothing to reveal. The character is
 * on the paper at every step — plainly while tracing, lightly while practising —
 * so the situation the hint existed for (a blank box and no way in) cannot
 * arise. Removing the wall was the better fix than putting a door in it.
 */
export function PracticeCanvasCard({
  character,
  fontFamily,
  fontWeight,
  grading,
  showGrid = true,
  showCenterCrosshair = true,
  status,
  locked = false,
  resultShown = false,
  onEvaluated,
  caption,
  compact = false,
}: PracticeCanvasCardProps) {
  const evaluator = useEvaluator();
  const { t } = useTranslation('handwriting');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [checking, setChecking] = useState(false);
  const canvasRef = useRef<WritingCanvasHandle>(null);

  const isEmpty = strokes.length === 0;

  const check = useCallback(async () => {
    if (isEmpty || checking) return;
    setChecking(true);
    try {
      const result = await evaluator.evaluate({
        strokes,
        glyph: { character, fontFamily, fontWeight },
        config: grading,
      });
      onEvaluated(result, strokes);
    } finally {
      setChecking(false);
    }
  }, [
    evaluator,
    strokes,
    character,
    fontFamily,
    fontWeight,
    grading,
    onEvaluated,
    isEmpty,
    checking,
  ]);

  const clear = () => {
    canvasRef.current?.clear();
    setStrokes([]);
  };

  const undo = () => {
    canvasRef.current?.undo();
    setStrokes((prev) => prev.slice(0, -1));
  };

  return (
    <div
      className={`${styles.wrapper} ${compact ? styles.compact : ''}`}
      data-testid="practice-card"
    >
      {caption && <p className={styles.caption}>{caption}</p>}

      <WritingCanvas
        key={`${character}-${fontFamily}`}
        ref={canvasRef}
        character={character}
        fontFamily={fontFamily}
        fontWeight={fontWeight}
        showGrid={showGrid}
        showCenterCrosshair={showCenterCrosshair}
        status={status}
        disabled={locked}
        onStrokesChange={setStrokes}
      />

      <div className={styles.controls}>
        <div className={styles.toolRow}>
          <Button
            size="sm"
            variant="ghost"
            pill
            onClick={undo}
            disabled={isEmpty || locked}
            startIcon={<UndoIcon size={16} />}
          >
            {t('actions.undo')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            pill
            onClick={clear}
            disabled={isEmpty || locked}
            startIcon={<EraserIcon size={16} />}
          >
            {t('actions.clear')}
          </Button>
        </div>


        {/*
          Check goes to the screen's safe footer, not here.

          It stays owned by this component — only this knows whether the canvas
          is empty or a verdict is already up — but it is rendered into
          `FocusScreen`'s footer row, which is the one region that reserves
          Android's navigation bar. In the flow it scrolled with the canvas, and
          anything that scrolls can be scrolled to the bottom edge of the
          screen, which on a phone is where the system draws its own buttons.

          Undo and Clear stay with the canvas deliberately: they act on the ink
          directly above them, they are secondary, and a learner reaches for
          them while looking at what they have drawn.
        */}
        {!locked && !resultShown && (
          <FocusFooter>
            <Button size="lg" fullWidth onClick={check} disabled={isEmpty} loading={checking}>
              {t('actions.check')}
            </Button>
          </FocusFooter>
        )}
      </div>
    </div>
  );
}
