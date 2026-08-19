import { forwardRef, useImperativeHandle, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Stroke } from '@hangyul-ganada/handwriting-core';

import { GUIDE_OPACITY, type GuideLevel } from './guide';
import { useReferenceGlyph } from './useReferenceGlyph';
import { useWritingCanvas } from './useWritingCanvas';
import styles from './WritingCanvas.module.css';

export interface WritingCanvasHandle {
  strokes: Stroke[];
  isEmpty: boolean;
  undo: () => void;
  clear: () => void;
}

export interface WritingCanvasProps {
  character: string;
  fontFamily: string;
  fontWeight?: number;
  guide: GuideLevel;
  /** Pen width as a fraction of the box edge. */
  penWidth?: number;
  showGrid?: boolean;
  showCenterCrosshair?: boolean;
  onStrokesChange?: (strokes: Stroke[]) => void;
  /** Ink the box opens with — see `useWritingCanvas`. Read once, on mount. */
  initialStrokes?: readonly Stroke[];
  /** Marks the box as already answered, freezing input. */
  status?: 'idle' | 'correct' | 'incorrect';
  disabled?: boolean;
  /** Accessible label; defaults to naming the character. */
  label?: string;
}

/**
 * The square practice surface.
 *
 * The reference glyph is a DOM element rather than something painted into the
 * canvas, so the learner's ink and the guide never fight over one drawing
 * surface — undo and clear touch only the ink. The glyph and the evaluator's
 * mask both come from `glyphLayout()`, so what is traced is exactly what is
 * graded.
 */
export const WritingCanvas = forwardRef<WritingCanvasHandle, WritingCanvasProps>(
  function WritingCanvas(
    {
      character,
      fontFamily,
      fontWeight = 400,
      guide,
      penWidth = 0.062,
      showGrid = true,
      showCenterCrosshair = true,
      onStrokesChange,
      initialStrokes,
      status = 'idle',
      disabled = false,
      label,
    },
    ref,
  ) {
    const { t } = useTranslation('handwriting');
    const canvas = useWritingCanvas({ penWidth, onStrokeEnd: onStrokesChange, initialStrokes });
    const glyphSpec = useMemo(
      () => ({ character, fontFamily, fontWeight }),
      [character, fontFamily, fontWeight],
    );
    const level: GuideLevel = guide;
    const opacity = GUIDE_OPACITY[level];
    const glyphRef = useReferenceGlyph(glyphSpec, true);

    useImperativeHandle(
      ref,
      () => ({
        strokes: canvas.strokes,
        isEmpty: canvas.isEmpty,
        undo: canvas.undo,
        clear: canvas.clear,
      }),
      [canvas.strokes, canvas.isEmpty, canvas.undo, canvas.clear],
    );

    return (
      <div
        className={`${styles.box} ${styles[status]} ${disabled ? styles.disabled : ''}`}
        data-testid="writing-canvas"
      >
        {showGrid && (
          <div className={styles.guides} aria-hidden="true">
            <span className={styles.guideH} />
            <span className={styles.guideV} />
            {showCenterCrosshair && <span className={styles.crosshair} />}
          </div>
        )}

        {/* Painted by the evaluator's own drawGlyph(), so what is traced is
            exactly what is graded. Fading rather than switching: the guide
            getting quieter between steps is the progression made visible. */}
        <canvas
          ref={glyphRef}
          className={styles.glyph}
          aria-hidden="true"
          style={{ opacity }}
        />

        <canvas
          ref={canvas.canvasRef}
          className={styles.canvas}
          // Suppresses browser panning/zooming inside the box only, so the page
          // itself still scrolls normally everywhere else.
          style={{ touchAction: 'none' }}
          role="img"
          aria-label={label ?? t('canvas.label', { character })}
          {...(disabled ? {} : canvas.handlers)}
        />

        <p className="hg-sr-only" aria-live="polite">
          {canvas.isEmpty
            ? t('canvas.empty')
            : t('canvas.strokes', { count: canvas.strokes.length })}
        </p>
      </div>
    );
  },
);
