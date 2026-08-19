import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StrokeStep } from '@hangyul-ganada/shared-types';

import { isSyllable } from '../data/jamo';
import { markerAt } from './strokeMarker';
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
  /** The character itself, for the accessible name. */
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

  // A composed block is several letters at half size sharing one box, and it
  // needs a lighter pen and smaller numbers than a single letter filling it.
  const dense = isSyllable(character);
  const pen = dense ? 5 : 8.6;
  const markerRadius = dense ? 4.3 : 6.2;

  const paths = useMemo(() => strokes.map(toPath), [strokes]);
  const lengths = useMemo(() => strokes.map(polylineLength), [strokes]);
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
  const nib = playing && partial > 0 ? pointAt(strokes[complete]!, partial) : null;

  return (
    <figure className={styles.wrap}>
      <svg
        className={styles.paper}
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={t('strokeOrder.diagramLabel', { character, count: strokes.length })}
        style={{ ['--hg-pen' as string]: pen }}
      >
        {/* The same guides the practice canvas draws, so the demonstration and
            the box underneath it agree about where the middle is. */}
        <rect x="1" y="1" width="98" height="98" rx="6" className={styles.box} />
        <path d="M50 4 V96 M4 50 H96" className={styles.guide} />

        {/* Where the whole character will end up. Faint enough not to be
            mistaken for ink, present so the demonstration never looks like a
            different, smaller letter while it is halfway through. */}
        {paths.map((d, index) => (
          <path key={`ghost-${index}`} d={d} className={styles.ghost} />
        ))}

        {paths.map((d, index) => {
          if (index > complete) return null;
          const length = lengths[index]!;
          const shown = index < complete ? 1 : partial;
          return (
            <path
              key={`ink-${index}`}
              d={d}
              className={styles.ink}
              // The pen: the path is dashed with one dash as long as itself,
              // and the dash is slid into view. What the eye sees is a line
              // being drawn from its start, which is what a pen does.
              strokeDasharray={length}
              strokeDashoffset={length * (1 - shown)}
            />
          );
        })}

        {/* The nib. A small round mark at the point the pen has reached, which
            is what makes the line read as *being written* rather than as an
            animation of a line. */}
        {nib && <circle className={styles.nib} cx={nib.x} cy={nib.y} r={pen * 0.52} />}

        {strokes.map((stroke, index) => {
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

// --- Geometry ----------------------------------------------------------------


/** An SVG path for one stroke, in the 0–100 box the viewBox uses. */
function toPath(step: StrokeStep): string {
  return step.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x * 100} ${point.y * 100}`)
    .join(' ');
}

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

/** Where the pen is, a fraction of the way along one stroke. */
function pointAt(step: StrokeStep, fraction: number): { x: number; y: number } {
  const target = polylineLength(step) * fraction;
  let walked = 0;
  for (let i = 1; i < step.points.length; i += 1) {
    const a = step.points[i - 1]!;
    const b = step.points[i]!;
    const segment = Math.hypot((b.x - a.x) * 100, (b.y - a.y) * 100);
    if (walked + segment >= target) {
      const within = segment === 0 ? 0 : (target - walked) / segment;
      return {
        x: (a.x + (b.x - a.x) * within) * 100,
        y: (a.y + (b.y - a.y) * within) * 100,
      };
    }
    walked += segment;
  }
  const last = step.points[step.points.length - 1]!;
  return { x: last.x * 100, y: last.y * 100 };
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
