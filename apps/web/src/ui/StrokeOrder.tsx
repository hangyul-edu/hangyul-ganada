import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StrokeStep } from '@hangyul-ganada/shared-types';

import { isSyllable } from '../data/jamo';
import { glyphInk, whenFaceReady } from './glyphInk';
import { markerAt } from './strokeMarker';
import { buildRevealMap, paintRevealMask } from './strokeReveal';
import styles from './StrokeOrder.module.css';

/**
 * The character being written, at the speed a hand writes it.
 *
 * ## Why it draws rather than reveals
 *
 * A learner is not trying to memorise a picture of ㅂ; they are trying to find
 * out what their hand should do. That is movement information, and it survives
 * exactly one presentation: a line growing from its starting point in the
 * direction the pen travels. Revealing whole strokes one after another — the
 * obvious implementation, and what this used to do — throws away the direction
 * and most of the order, and leaves a slideshow that reads as a glitch.
 *
 * So each stroke is drawn continuously along its own path, at a roughly
 * constant pen speed, with a short rest between strokes where a writer would
 * lift the pen. Long strokes take longer than short ones, because they do.
 *
 * ```
 * ▁▁▁▁▁▁▁▁    blank paper
 * ▂▁▁▁▁▁▁▁    ink appears at the start of stroke 1
 * ▄▄▄▁▁▁▁▁    stroke 1 draws, continuously
 * ████▁▁▁▁    stroke 1 lands; a beat
 * ████▂▁▁▁    stroke 2 begins where it should
 * ████████    the finished character stays on screen
 * ```
 *
 * ## Reduced motion
 *
 * The demonstration does not disappear for `prefers-reduced-motion` — the
 * information in it is the lesson. It becomes a step-through instead: the
 * numbered diagram, and Back/Next to add one stroke at a time under the
 * learner's own thumb. Same content, no movement they did not ask for.
 *
 * ## Ink and paper
 *
 * Black on warm white, in both appearances. See `canvasPaper` in the design
 * tokens: a Korean glyph is black on paper, and inverting it in dark mode would
 * teach the shape against a background it never has.
 *
 * ## It uncovers the real glyph rather than drawing its own
 *
 * What is animated is the character itself, set in the learner's chosen
 * practice face — the same glyph, in the same typeface, as the large reference
 * at the top of the lesson. The polylines are not the picture; they are the
 * mask that uncovers it, growing along each stroke in writing order.
 *
 * This replaced drawing the polylines directly, which is where four rounds of
 * complaints came from and could not have stopped coming. Those polylines say
 * where a stroke starts, which way it runs and what comes next, and they are
 * *approximations of a shape* — a ㄱ built from two straight segments, a block
 * assembled from measured slots. A learner sees them next to a real 거 and
 * reads the difference as the app being wrong, because it is: the demonstration
 * was answering "roughly what does this look like" when the reference glyph two
 * inches above it already answered that exactly.
 *
 * Now the answer is the same glyph both times, and the polylines do the job
 * they are actually good at.
 *
 * ```
 * ░░░░░░░░   the glyph, faint: where this is going
 * ▓▒░░░░░░   the mask opens along stroke 1, uncovering ink
 * ▓▓▓▒░░░░   …and keeps opening, at a hand's speed
 * ▓▓▓▓░░░░   stroke 1 stands; a beat
 * ▓▓▓▓▓▒░░   stroke 2 begins where a writer would begin it
 * ████████   the finished character — the reference glyph, exactly
 * ```
 *
 * The last frame drops the mask entirely, so what a learner is left looking at
 * is the glyph and not a very good approximation of it.
 *
 * ## The pen and the numbers are lighter for a syllable than for a letter
 *
 * A single ㄱ fills the box, so a heavy pen reads as confident. A 가 is two
 * letters at about half that size each, drawn a little smaller still to leave
 * the block some air (see `BLOCK_SCALE` in `data/compose.ts`), and the same pen
 * on them reads as a blot: the counter inside ㅇ closes up, the gap between ㄱ
 * and ㅏ fills in, and ten strokes of 밥 become a smudge. Korean type does the
 * same thing — a face's strokes are lighter in a three-letter block than in a
 * one-letter one.
 *
 * The numbered markers scale with it. They have to be legible and they are not
 * the lesson: a learner reads the shape first and the order second, and a disc
 * sized for a single ㅅ sits on a block's ㅅ like a lid.
 */
export function StrokeOrder({
  character,
  strokes,
  fontFamily,
  size = 160,
  autoPlay = true,
  onWatched,
}: {
  /** The character itself: the accessible name, and the thing being drawn. */
  character: string;
  strokes: StrokeStep[];
  /** The learner's practice face, so this and the reference glyph agree. */
  fontFamily: string;
  size?: number;
  autoPlay?: boolean;
  /**
   * Called once each time the learner watches the whole thing through.
   *
   * The mastery ladder has a rung for having seen the character written, and
   * this is what earns it — the animation reaching the end, not the screen
   * opening. In step-through mode it fires on reaching the last stroke.
   */
  onWatched?: () => void;
}) {
  const { t } = useTranslation('handwriting');
  const reduceMotion = usePrefersReducedMotion();
  const faceVersion = useFaceReady(character, fontFamily);

  /*
   * Where the glyph's ink sits, and the polylines moved onto it.
   *
   * Both come from the same measurement, which is the whole point: the mask has
   * to lie over the glyph it is uncovering. Re-measured when the face changes
   * and once web fonts have finished loading, because measuring a face the
   * browser has not got yet returns the metrics of whatever it substituted.
   */
  const layout = useMemo(
    () => glyphLayout(character, fontFamily, strokes),
    // `faceVersion` is not read here; it is what makes this run again once the
    // real face has arrived and the fallback's metrics have been thrown away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [character, fontFamily, strokes, faceVersion],
  );
  const placed = layout.strokes;

  // A composed block is several letters sharing one box, and it needs smaller
  // numbers than a single letter filling it.
  const dense = layout.dense;
  const markerRadius = dense ? 4 : 5.6;

  const lengths = useMemo(() => placed.map(polylineLength), [placed]);
  const schedule = useMemo(() => buildSchedule(lengths), [lengths]);

  /**
   * How much has been drawn, as a stroke index plus a fraction of it.
   *
   * One number for both modes, so the SVG below does not care whether a hand
   * or a clock is moving it.
   */
  const [drawn, setDrawn] = useState(() => strokes.length);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<number | null>(null);
  const watched = useRef(false);
  const onWatchedRef = useRef(onWatched);
  onWatchedRef.current = onWatched;

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    stop();
    setDrawn(0);
    setPlaying(true);
  }, [stop]);

  // The clock. One rAF loop that converts elapsed milliseconds into "how much
  // of the character is on the paper", including the rests between strokes.
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = drawnAt(schedule, now - startedAt);
      setDrawn(progress);
      if (progress >= strokes.length) {
        if (!watched.current) {
          watched.current = true;
          onWatchedRef.current?.();
        }
        // Rest on the finished character rather than snapping away: the last
        // frame of the demonstration is the thing the learner copies from.
        frame.current = null;
        setPlaying(false);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [playing, schedule, strokes.length]);

  // A new character starts over. Reduced motion never autoplays; it shows the
  // finished diagram and waits to be stepped through.
  useEffect(() => {
    watched.current = false;
    stop();
    if (reduceMotion) {
      setDrawn(strokes.length);
      return;
    }
    if (autoPlay) {
      setDrawn(0);
      setPlaying(true);
    } else {
      setDrawn(strokes.length);
    }
    return stop;
    // Restarting when the character changes is exactly the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, reduceMotion]);

  /** Step-through, for reduced motion. */
  const step = (delta: number) => {
    setDrawn((current) => {
      const next = Math.min(strokes.length, Math.max(0, Math.round(current) + delta));
      if (next >= strokes.length && !watched.current) {
        watched.current = true;
        onWatchedRef.current?.();
      }
      return next;
    });
  };

  const complete = Math.floor(drawn);

  /*
   * The glyph, cut into strokes, so the animation can uncover it exactly.
   *
   * Rebuilt when the character, the face or the size changes — a rasterisation
   * and a few hundred thousand distance comparisons, which is nothing once and
   * far too much per frame, hence the memo.
   */
  const reveal = useMemo(
    () => buildRevealMap(placed, (context, res) => layout.paint(context, res), layout.weight),
    [placed, layout],
  );

  const canvas = useRef<HTMLCanvasElement | null>(null);
  /*
   * Ink and paper, from the design tokens.
   *
   * Read once: `canvasInk` and `canvasGuide` are deliberately the same in light
   * and dark — a Korean glyph is black on paper, and teaching the shape against
   * an inverted background would teach it against a background it never has.
   */
  const ink = useRef({ ink: '#16130f', ghost: '#e6e1d6' });
  useEffect(() => {
    const element = canvas.current;
    if (!element || typeof getComputedStyle !== 'function') return;
    const style = getComputedStyle(element);
    const read = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;
    ink.current = {
      ink: read('--hg-canvas-ink', ink.current.ink),
      ghost: read('--hg-canvas-guide', ink.current.ghost),
    };
  }, []);

  const maskCanvas = useRef<HTMLCanvasElement | null>(null);
  const maskImage = useRef<ImageData | null>(null);

  /*
   * One frame of the demonstration.
   *
   * The glyph is drawn whole, in ink, then everything the pen has not reached
   * is taken back out of it, then the same glyph goes in behind at a fraction
   * of the weight so the learner can see where the writing is going. Nothing is
   * ever painted that is not the character: the glyph's outline is the
   * typeface's, and the only edge this code draws is the one at the pen.
   */
  useEffect(() => {
    const display = canvas.current;
    if (!display) return;
    const context = display.getContext('2d');
    if (!context) return;

    const ratio = typeof window === 'undefined' ? 1 : Math.min(3, window.devicePixelRatio || 1);
    const pixels = Math.round(size * ratio);
    if (display.width !== pixels) {
      display.width = pixels;
      display.height = pixels;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixels, pixels);

    const drawGlyph = (fill: string) => {
      context.save();
      context.scale(pixels / 100, pixels / 100);
      context.fillStyle = fill;
      layout.paint(context, 100);
      context.restore();
    };

    if (reveal && drawn < strokes.length) {
      let mask = maskCanvas.current;
      if (!mask) {
        mask = document.createElement('canvas');
        mask.width = reveal.size;
        mask.height = reveal.size;
        maskCanvas.current = mask;
        maskImage.current = null;
      }
      const maskContext = mask.getContext('2d');
      if (maskContext) {
        if (!maskImage.current || maskImage.current.width !== reveal.size) {
          maskImage.current = maskContext.createImageData(reveal.size, reveal.size);
        }
        drawGlyph(ink.current.ink);
        paintRevealMask(maskContext, maskImage.current, reveal, drawn);
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(mask, 0, 0, pixels, pixels);
        context.globalCompositeOperation = 'destination-over';
        drawGlyph(ink.current.ghost);
        context.globalCompositeOperation = 'source-over';
      }
    } else {
      // Finished, or nothing to animate with: the character, plainly.
      drawGlyph(ink.current.ink);
    }
  }, [drawn, reveal, layout, size, strokes.length]);

  return (
    <figure className={styles.wrap}>
      <div
        className={styles.stage}
        style={{ width: size, height: size }}
        role="img"
        aria-label={t('strokeOrder.diagramLabel', { character, count: strokes.length })}
      >
        {/* The same guides the practice canvas draws, so the demonstration and
            the box underneath it agree about where the middle is. */}
        <svg className={styles.guides} viewBox="0 0 100 100" aria-hidden="true">
          <path d="M50 4 V96 M4 50 H96" className={styles.guide} />
        </svg>

        <canvas ref={canvas} className={styles.glyph} style={{ width: size, height: size }} />

        <svg className={styles.marks} viewBox="0 0 100 100" aria-hidden="true">
          {placed.map((stroke, index) => {
            const at = markerAt(stroke, markerRadius);
            return (
              <g
                key={`n-${index}`}
                className={index < complete ? styles.markerDone : styles.marker}
                transform={`translate(${at.x} ${at.y})`}
              >
                <circle r={markerRadius} />
                <text dy={markerRadius * 0.36} fontSize={markerRadius * 1.05}>
                  {index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className={styles.caption}>
        {reduceMotion ? (
          <span className={styles.stepper}>
            <button
              type="button"
              className={styles.stepButton}
              onClick={() => step(-1)}
              disabled={complete === 0}
            >
              {t('strokeOrder.back')}
            </button>
            <span className={styles.count}>
              {t('strokeOrder.position', { current: complete, count: strokes.length })}
            </span>
            <button
              type="button"
              className={styles.stepButton}
              onClick={() => step(1)}
              disabled={complete >= strokes.length}
            >
              {t('strokeOrder.next')}
            </button>
          </span>
        ) : (
          <>
            <button type="button" className={styles.replay} onClick={playing ? stop : play}>
              {playing ? t('strokeOrder.pause') : t('strokeOrder.watchAgain')}
            </button>
            <span className={styles.count}>
              {t('strokeOrder.count', { count: strokes.length })}
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

// --- The clock ---------------------------------------------------------------

/**
 * How fast the pen moves, in viewBox units per second.
 *
 * The box is 100 units across, so a full-width horizontal stroke takes about
 * three quarters of a second — near enough to a real hand that watching it feels
 * like watching someone write, and slow enough to follow with a finger.
 */
const PEN_SPEED = 130;

/** No stroke is instant, and none outstays its welcome. */
const MIN_STROKE_MS = 320;
const MAX_STROKE_MS = 1100;

/** The pen lifting between strokes. Long enough to see, short enough not to drag. */
const PEN_LIFT_MS = 260;

interface Segment {
  /** When this stroke starts drawing, ms from the beginning. */
  at: number;
  duration: number;
}

function buildSchedule(lengths: number[]): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  for (const length of lengths) {
    const duration = Math.min(
      MAX_STROKE_MS,
      Math.max(MIN_STROKE_MS, (length / PEN_SPEED) * 1000),
    );
    segments.push({ at, duration });
    at += duration + PEN_LIFT_MS;
  }
  return segments;
}

/** Stroke index plus fraction, at `elapsed` ms into the demonstration. */
function drawnAt(schedule: Segment[], elapsed: number): number {
  for (let index = 0; index < schedule.length; index += 1) {
    const { at, duration } = schedule[index]!;
    if (elapsed < at) return index;
    if (elapsed < at + duration) return index + (elapsed - at) / duration;
  }
  return schedule.length;
}

// --- Putting the polylines onto the glyph ------------------------------------

/**
 * How much of the box the glyph's ink covers, edge to edge.
 *
 * Uniform: whichever of the glyph's two dimensions is larger gets this, and the
 * other keeps its own proportion. A character is never stretched to fill the
 * square — a stretched Korean glyph is precisely the thing this screen is meant
 * to stop a learner copying.
 */
const INK_SPAN = 74;

interface Placed {
  /** Draws the glyph into a square canvas of `box` units on a side. */
  paint: (context: CanvasRenderingContext2D, box: number) => void;
  /** The face's stroke weight, as a fraction of the box. */
  weight: number;
  /** The stroke polylines, moved onto the glyph's ink. */
  strokes: StrokeStep[];
  /** Whether this is a composed block rather than a single letter. */
  dense: boolean;
}

/** The ink bounding box of a run of polylines, in their own coordinates. */
function polylineBounds(strokes: StrokeStep[]) {
  const xs = strokes.flatMap((s) => s.points.map((p) => p.x));
  const ys = strokes.flatMap((s) => s.points.map((p) => p.y));
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

/**
 * Places the glyph, then lays the polylines over it.
 *
 * The polylines and the glyph describe the same character but neither knows the
 * other's coordinates, so the two ink boxes are matched up: whatever square the
 * glyph's ink occupies in the box, the polylines' own extent is mapped onto it.
 * A polyline run with no extent along one axis — ㅡ is a single horizontal line
 * — is centred on that axis instead of being scaled by zero.
 */
function glyphLayout(character: string, fontFamily: string, strokes: StrokeStep[]): Placed {
  const measured = glyphInk(character, fontFamily);
  const emWidth = measured.right - measured.left;
  const emHeight = measured.bottom - measured.top;

  const fontSize = INK_SPAN / Math.max(emWidth, emHeight);
  const inkWidth = emWidth * fontSize;
  const inkHeight = emHeight * fontSize;
  const ink = {
    x0: 50 - inkWidth / 2,
    x1: 50 + inkWidth / 2,
    y0: 50 - inkHeight / 2,
    y1: 50 + inkHeight / 2,
  };

  /*
   * The polylines land on the glyph's *centrelines*, not on its ink box.
   *
   * They describe where a pen travels; the ink box is where the ink ends up,
   * which is half a stroke weight further out on every side. Matching the two
   * boxes directly — which is what this did — pushes every stroke that touches
   * the edge of the character half a weight off its own middle: the uprights of
   * ㅂ end up on the outer edges of the uprights they are meant to run down.
   * Nothing downstream can recover from that. It is why the mask had to be so
   * wide, and why the junctions came out chamfered once it was not.
   */
  const weight = measured.weight * fontSize;
  const inset = weight / 2;
  const target = {
    x0: ink.x0 + inset,
    x1: ink.x1 - inset,
    y0: ink.y0 + inset,
    y1: ink.y1 - inset,
  };

  const bounds = polylineBounds(strokes);
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  const FLAT = 1e-6;
  const scaleX = spanX < FLAT ? 0 : (target.x1 - target.x0) / spanX;
  const scaleY = spanY < FLAT ? 0 : (target.y1 - target.y0) / spanY;

  // Back to 0–1, the unit every other helper here works in: `toPath`,
  // `polylineLength`, `pointAt` and `markerAt` all multiply up to the viewBox
  // themselves.
  const placed = strokes.map((stroke) => ({
    points: stroke.points.map((point) => ({
      x: (scaleX === 0 ? 50 : target.x0 + (point.x - bounds.x0) * scaleX) / 100,
      y: (scaleY === 0 ? 50 : target.y0 + (point.y - bounds.y0) * scaleY) / 100,
    })),
  }));

  // Drawn from the origin and moved so the measured ink box lands centred,
  // which is exact where a text baseline is a browser's opinion.
  const originX = ink.x0 - measured.left * fontSize;
  const originY = ink.y0 - measured.top * fontSize;

  return {
    paint: (context, box) => {
      const unit = box / 100;
      context.font = `400 ${fontSize * unit}px ${fontFamily}`;
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      context.fillText(character, originX * unit, originY * unit);
    },
    strokes: placed,
    weight: weight / 100,
    dense: isSyllable(character),
  };
}

/**
 * Bumps once the practice face is really available, so the glyph gets measured
 * again rather than staying placed by the fallback's metrics. See
 * `whenFaceReady`.
 */
function useFaceReady(character: string, fontFamily: string): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    whenFaceReady(character, fontFamily).then((changed) => {
      if (live && changed) setVersion((v) => v + 1);
    });
    return () => {
      live = false;
    };
  }, [character, fontFamily]);
  return version;
}

// --- Geometry ----------------------------------------------------------------


/**
 * Length of a stroke in viewBox units.
 *
 * Computed from the points rather than read back with `getTotalLength()`,
 * because the paths are polylines and the two agree exactly — and this way the
 * schedule exists before anything is in the DOM, so the first frame is already
 * correct instead of being a layout-dependent guess.
 */
function polylineLength(step: StrokeStep): number {
  let total = 0;
  for (let i = 1; i < step.points.length; i += 1) {
    const a = step.points[i - 1]!;
    const b = step.points[i]!;
    total += Math.hypot((b.x - a.x) * 100, (b.y - a.y) * 100);
  }
  return total || 1;
}

/**
 * Whether the learner has asked for less movement.
 *
 * Read live rather than once, because the setting can change while the app is
 * open — on a phone it is a toggle two taps away, and a learner who reaches for
 * it because an animation is making them unwell should not have to relaunch.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return reduced;
}
