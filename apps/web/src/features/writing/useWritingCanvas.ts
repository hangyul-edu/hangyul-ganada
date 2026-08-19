import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Stroke } from '@hangyul-ganada/handwriting-core';

export interface UseWritingCanvasOptions {
  /** Pen width as a fraction of the box edge. */
  penWidth: number;
  onStrokeEnd?: (strokes: Stroke[]) => void;
  /**
   * Ink the box opens with.
   *
   * Read once, as the initial state. A word's syllables share one screen and
   * only the active one is mounted, so returning to a syllable remounts its box
   * — and it has to come back with the learner's writing still on it. The owner
   * of the word keeps the strokes; this is how they get handed back.
   */
  initialStrokes?: readonly Stroke[];
}

export interface WritingCanvasApi {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  strokes: Stroke[];
  isEmpty: boolean;
  isDrawing: boolean;
  undo: () => void;
  clear: () => void;
  handlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  };
}

/**
 * Pointer capture, stroke recording and high-DPI painting for the writing box.
 *
 * Strokes are stored in normalised 0..1 coordinates, never pixels: a stroke
 * drawn on a 320 px phone canvas has to grade identically to the same stroke on
 * a 560 px desktop canvas, and the evaluator's comparison resolution is
 * independent of both.
 *
 * A single `pointerdown` covers mouse, touch and stylus. Pointer capture means
 * a stroke that leaves the canvas mid-drag still terminates correctly instead
 * of leaving the pen stuck down.
 */
export function useWritingCanvas({
  penWidth,
  onStrokeEnd,
  initialStrokes,
}: UseWritingCanvasOptions): WritingCanvasApi {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Copied, not aliased: the box owns its list from here on, and mutating the
  // caller's array through it would edit a syllable the learner is not on.
  const [strokes, setStrokes] = useState<Stroke[]>(() =>
    initialStrokes ? [...initialStrokes] : [],
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const activePointerId = useRef<number | null>(null);
  const currentStroke = useRef<Stroke | null>(null);

  /** Sizes the backing store to the device pixel ratio so ink is not blurry. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
  }, []);

  /** Repaints every stroke. Cheap enough at these stroke counts to avoid
   *  incremental-draw bugs when undoing or resizing. */
  const repaint = useCallback(
    (list: Stroke[]) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle =
        getComputedStyle(canvas).getPropertyValue('--hg-canvas-ink').trim() || '#262C31';

      const size = canvas.width; // square
      for (const stroke of list) {
        if (stroke.points.length === 0) continue;
        ctx.lineWidth = stroke.width * size;
        ctx.beginPath();
        const first = stroke.points[0]!;
        if (stroke.points.length === 1) {
          // A tap still leaves a dot, which is correct for ㅇ-like taps.
          ctx.arc(first.x * size, first.y * size, (stroke.width * size) / 2, 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
          continue;
        }
        ctx.moveTo(first.x * size, first.y * size);
        for (let i = 1; i < stroke.points.length; i += 1) {
          const p = stroke.points[i]!;
          ctx.lineTo(p.x * size, p.y * size);
        }
        ctx.stroke();
      }
    },
    [],
  );

  useEffect(() => {
    resize();
    repaint(strokes);
  }, [resize, repaint, strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      resize();
      repaint(strokes);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [resize, repaint, strokes]);

  const positionOf = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      pressure: event.pressure > 0 ? event.pressure : undefined,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // Ignore a second finger mid-stroke rather than jumping the line to it.
    if (activePointerId.current !== null) return;
    // Right-click and stylus-barrel presses are not writing.
    if (event.button !== 0 && event.pointerType === 'mouse') return;

    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerId.current = event.pointerId;
    currentStroke.current = { points: [positionOf(event)], width: penWidth };
    setIsDrawing(true);
    setStrokes((prev) => [...prev, currentStroke.current!]);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== event.pointerId || !currentStroke.current) return;

    // Coalesced events give the full input sample rate, so a fast stroke on a
    // 120 Hz stylus stays smooth instead of turning into long straight chords.
    const native = event.nativeEvent;
    const points =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];

    const rect = event.currentTarget.getBoundingClientRect();
    const added =
      points.length > 0
        ? points.map((p) => ({
            x: (p.clientX - rect.left) / rect.width,
            y: (p.clientY - rect.top) / rect.height,
            pressure: p.pressure > 0 ? p.pressure : undefined,
          }))
        : [positionOf(event)];

    currentStroke.current.points.push(...added);
    // Same array identity, new list identity — repaint runs, state stays cheap.
    setStrokes((prev) => [...prev]);
  };

  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerId.current = null;
    currentStroke.current = null;
    setIsDrawing(false);
    setStrokes((prev) => {
      onStrokeEnd?.(prev);
      return prev;
    });
  };

  const undo = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setStrokes([]);
  }, []);

  return {
    canvasRef,
    strokes,
    isEmpty: strokes.length === 0,
    isDrawing,
    undo,
    clear,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
