import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StrokeStep } from '@hangyul-ganada/shared-types';

import { COMPOSED_PEN } from '../data/compose';
import { isSyllable } from '../data/jamo';
import { markerAt } from './strokeMarker';
import { strokeLength, strokePath } from './strokePath';
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
  size = 160,
  autoPlay = true,
  onWatched,
}: {
  /** The character itself: the accessible name, and the thing being drawn. */
  character: string;
  strokes: StrokeStep[];
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

  /*
   * Where the glyph's ink sits, and the polylines moved onto it.
   *
   * Both come from the same measurement, which is the whole point: the mask has
   * to lie over the glyph it is uncovering. Re-measured when the face changes
   * and once web fonts have finished loading, because measuring a face the
   * browser has not got yet returns the metrics of whatever it substituted.
   */
  const layout = useMemo(
    () => placeStrokes(character, strokes),
    [character, strokes],
  );
  const placed = layout.strokes;

  /*
   * One path per stroke, built once.
   *
   * Every state of every stroke is drawn from these strings: the guide before
   * it is written, the ink as it grows, the finished stroke afterwards. Same
   * geometry three times over, so there is nothing for a seam to appear
   * between.
   */
  const paths = useMemo(() => placed.map(strokePath), [placed]);

  // A composed block is several letters sharing one box, and it needs smaller
  // numbers than a single letter filling it.
  const markerRadius = isSyllable(character) ? 4 : 5.6;

  const lengths = useMemo(() => placed.map(strokeLength), [placed]);
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
  const partial = drawn - complete;

  return (
    <figure className={styles.wrap}>
      <svg
        className={styles.paper}
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={t('strokeOrder.diagramLabel', { character, count: strokes.length })}
        style={{ ['--hg-pen' as string]: layout.pen }}
      >
        {/* The same guides the practice canvas draws, so the demonstration and
            the box underneath it agree about where the middle is. */}
        <path d="M50 4 V96 M4 50 H96" className={styles.guide} />

        {/*
          Where the whole character is going.

          Under the ink, and every stroke of it, so a stroke still to come can
          never appear to cut across one already written — whatever order they
          overlap in, black is painted after grey.
        */}
        {paths.map((d, index) => (
          <path key={`guide-${index}`} d={d} className={styles.ghost} />
        ))}

        {paths.map((d, index) => {
          if (index > complete) return null;
          const shown = index < complete ? 1 : partial;
          return (
            <path
              key={`ink-${index}`}
              d={d}
              className={styles.ink}
              /*
                `pathLength` re-scales the path's own length to 1, so the dash
                that reveals it is exact whatever the curve actually measures —
                no length has to be computed, and none can be slightly wrong.
              */
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - shown}
            />
          );
        })}

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

// --- Putting the strokes in the box ------------------------------------------

/**
 * How much of the box the finished character covers, ink included.
 *
 * The rest is margin. `INK_SPAN` counts the outside of the ink rather than the
 * centrelines, so the pen's own width is inside the number and a stroke running
 * along the edge of the character still has air beyond it.
 */
const INK_SPAN = 74;

/**
 * The pen, as a fraction of the coordinate space the strokes are drawn in.
 *
 * Not measured off the practice typeface, which is what it used to be. The
 * spacing inside a composed block is designed against a particular pen — see
 * `BLOCK_PEN` — so a pen decided somewhere else can quietly close the gaps that
 * layout depends on, and a face with hairline strokes would produce a
 * demonstration nobody could see. A single letter fills its own box and carries
 * more weight than a letter inside a block, which is what a Hangul face does
 * too.
 *
 * Both are scaled by the same factor as the character itself, so ink weight
 * stays proportional at any size, and applied *after* the coordinates are
 * placed, so it is identical horizontally and vertically.
 */
const LETTER_PEN = 0.086;

/** Never a hairline, never a marker pen, whatever the arithmetic says. */
const PEN_MIN = 4;
const PEN_MAX = 10;

interface Placed {
  /** Stroke width, in the 0–100 box. */
  pen: number;
  /** The stroke polylines, scaled and centred in the box. */
  strokes: StrokeStep[];
}

/** The bounding box of a run of polylines, in their own coordinates. */
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
 * Scales the strokes into the box and picks the pen to draw them with.
 *
 * Uniformly, on purpose: one factor for both axes, so the character keeps its
 * proportions and — because the pen is applied after the coordinates are
 * placed, not scaled along with them — its ink is the same weight horizontally
 * and vertically. A non-uniform fit would give a character thicker one way than
 * the other, which is the sort of thing that looks subtly wrong without ever
 * looking obviously wrong.
 *
 * An axis with no extent — ㅡ is one horizontal line, ㅣ one vertical — is
 * centred rather than scaled by zero, and takes its scale from the axis that
 * has one.
 */
function placeStrokes(character: string, strokes: StrokeStep[]): Placed {
  const bounds = polylineBounds(strokes);
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  const designed = isSyllable(character) ? COMPOSED_PEN : LETTER_PEN;

  /*
   * The pen is part of the character's size, so it has to be solved with it.
   *
   * `INK_SPAN` is the outside of the ink, and the ink is the centrelines plus
   * half a pen either side — but the pen is itself the scale times a constant.
   * Rearranging: the span is (extent + designed) × scale, which gives the scale
   * directly instead of iterating towards it.
   */
  const FLAT = 1e-6;
  const scales: number[] = [];
  if (spanX > FLAT) scales.push(INK_SPAN / 100 / (spanX + designed));
  if (spanY > FLAT) scales.push(INK_SPAN / 100 / (spanY + designed));
  const scale = scales.length ? Math.min(...scales) : 1;
  const pen = Math.min(PEN_MAX, Math.max(PEN_MIN, designed * scale * 100));

  const midX = (bounds.x0 + bounds.x1) / 2;
  const midY = (bounds.y0 + bounds.y1) / 2;
  const placed = strokes.map((stroke) => ({
    points: stroke.points.map((point) => ({
      x: 0.5 + (point.x - midX) * scale,
      y: 0.5 + (point.y - midY) * scale,
    })),
  }));

  return { pen, strokes: placed };
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
