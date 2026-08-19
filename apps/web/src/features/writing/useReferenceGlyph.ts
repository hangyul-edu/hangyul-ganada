import { useEffect, useRef } from 'react';
import { drawGlyph, type Canvas2DLike, type GlyphSpec } from '@hangyul-ganada/handwriting-core';

/**
 * Paints the reference glyph the learner traces.
 *
 * This deliberately goes through `drawGlyph()` — the same function the
 * evaluator's rasteriser uses — rather than rendering the character as DOM
 * text.
 *
 * Rendering it as DOM text was the first implementation and it was wrong:
 * CSS centring positions the *line box*, using the font's ascent and descent,
 * while the evaluation mask positions the glyph by canvas `textBaseline`
 * metrics. The two disagree by several percent of the box, which is more than
 * the whole tolerance band. A learner traced exactly what was on screen and was
 * told they were incorrect.
 *
 * Sharing one code path makes that class of bug impossible: whatever is painted
 * here is, pixel for pixel, what the mask is built from.
 */
export function useReferenceGlyph(
  spec: GlyphSpec,
  visible: boolean,
): React.RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement>(null);
  const { character, fontFamily, fontWeight, glyphScale } = spec;

  useEffect(() => {
    let cancelled = false;
    const canvas = ref.current;
    if (!canvas) return undefined;

    /**
     * Paints the glyph at the element's current size.
     *
     * Re-run on resize, not only on mount. The box is laid out by CSS — an
     * `aspect-ratio` frame inside a flex column — so its final width is not
     * known when the effect first runs, and a canvas painted at the wrong
     * backing-store size is then *stretched* by the browser to fit. A stretched
     * guide is no longer pixel-for-pixel what the evaluator's mask is built
     * from, which is precisely the disagreement this file exists to prevent.
     * The ink canvas has always observed its own size; this one has to as well,
     * or the two drift apart the moment the layout settles.
     */
    const paint = async () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const size = Math.round(rect.width * dpr);
      // Assigning width/height also clears the canvas, so this is only done
      // when the size actually changed — otherwise a repaint would flicker.
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Wait for the practice face before painting, so the guide is never drawn
      // in a fallback font the learner would then be graded against.
      const fonts = document.fonts;
      if (fonts) {
        try {
          await fonts.load(`${fontWeight ?? 400} ${size}px ${fontFamily}`, character);
        } catch {
          /* fall through to whatever is available */
        }
      }
      if (cancelled) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle =
        getComputedStyle(canvas).getPropertyValue('--hg-canvas-trace-glyph').trim() || '#ADB4BA';
      drawGlyph(ctx as unknown as Canvas2DLike, spec, canvas.width);
    };

    void paint();

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        cancelled = true;
      };
    }
    const observer = new ResizeObserver(() => void paint());
    observer.observe(canvas);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [character, fontFamily, fontWeight, glyphScale, visible, spec]);

  return ref;
}
