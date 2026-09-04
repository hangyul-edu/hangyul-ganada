import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { vectorGlyph } from '../data/strokeVectors';
import { isSyllable } from '../data/jamo';
import { PAPER_CORNER, layoutMarkers } from './strokeMarkers';
import styles from './StrokeOrder.module.css';

/**
 * The character being written, at the speed a hand writes it.
 *
 * ## Why it draws rather than reveals
 *
 * A learner is not trying to memorise a picture of ㅂ; they are trying to find
 * out what their hand should do. That is movement information, and it survives
 * exactly one presentation: ink growing from its starting point in the direction
 * the pen travels. Revealing whole strokes one after another — the obvious
 * implementation, and what this used to do — throws away the direction and most
 * of the order, and leaves a slideshow that reads as a glitch.
 *
 * So each stroke grows continuously along its own centreline at a roughly
 * constant pen speed, with a short rest between strokes where a writer would
 * lift the pen. Long strokes take longer than short ones, because they do.
 *
 * ```
 * ░░░░░░░░   the glyph, faint: where this is going
 * ▓▒░░░░░░   stroke 1 grows along its own path
 * ▓▓▓▒░░░░   …and keeps growing, at a hand's speed
 * ▓▓▓▓░░░░   stroke 1 lands; a beat
 * ▓▓▓▓▓▒░░   stroke 2 begins where a writer would begin it
 * ████████   the finished character — the reference glyph, exactly
 * ```
 *
 * ## One geometry, and no second opinion
 *
 * Everything here is drawn from `data/strokeVectors`: the grey guide, the ink
 * as it arrives, the completed strokes, the final frame. Each stroke is one
 * authored centreline path, stroked with the pen the face uses, and the reveal
 * is that same path with a dash offset walked down to zero. There is no mask,
 * no second shape and no per-character arithmetic — this component's only job
 * is to decide how much of the geometry to show, and if a letter ever looks
 * wrong the geometry is wrong and this is not where to fix it.
 *
 * ## Why a dash offset and not a mask
 *
 * The previous model animated a *filled outline* cut from the rasterised glyph,
 * uncovered by a mask shaped like a ribbon swept along the stroke. Two things
 * came out of that and neither could be tuned away. The ribbon and the outline
 * were separate geometry, so they could disagree — and a filled outline cut
 * from a shared glyph has to decide who owns a junction, which drew a boundary
 * the learner could see: ㅂ's uprights carried wedges of their crossbars before
 * the crossbars were written, and ㅇ, traced back from pixels, was a polygon.
 *
 * A stroked path has neither problem. `stroke-dasharray` set to the path's own
 * length with the offset walked from that length down to zero uncovers the path
 * *along itself*, from the end the pen starts at, at whatever the browser's own
 * curve arithmetic says — so the ink appears in the order a hand lays it down
 * and the shape it lands in is the shape that was authored. Two strokes that
 * meet simply overlap, as two pen strokes on paper do.
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
 */
export function StrokeOrder({
  character,
  size = 160,
  autoPlay = true,
  onWatched,
}: {
  /** The character itself: the accessible name, and the thing being drawn. */
  character: string;
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

  const glyph = useMemo(() => vectorGlyph(character), [character]);
  const strokes = glyph.strokes;
  const count = strokes.length;

  // A composed block is several letters sharing one box, and it needs smaller
  // numbers than a single letter filling it.
  const markerRadius = isSyllable(character) ? 4 : 5.6;
  const markers = useMemo(() => layoutMarkers(strokes, markerRadius), [strokes, markerRadius]);

  const schedule = useMemo(
    () => buildSchedule(strokes.map((stroke) => stroke.length)),
    [strokes],
  );

  /**
   * How much has been drawn, as a stroke index plus a fraction of it.
   *
   * One number for both modes, so the SVG below does not care whether a hand or
   * a clock is moving it.
   */
  const [drawn, setDrawn] = useState(count);
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

  // The clock. One rAF loop that converts elapsed milliseconds into "how much of
  // the character is on the paper", including the rests between strokes.
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = drawnAt(schedule, now - startedAt);
      setDrawn(progress);
      if (progress >= count) {
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
  }, [playing, schedule, count]);

  // A new character starts over. Reduced motion never autoplays; it shows the
  // finished diagram and waits to be stepped through.
  useEffect(() => {
    watched.current = false;
    stop();
    if (reduceMotion) {
      setDrawn(count);
      return;
    }
    if (autoPlay) {
      setDrawn(0);
      setPlaying(true);
    } else {
      setDrawn(count);
    }
    return stop;
    // Restarting when the character changes is exactly the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, reduceMotion]);

  /** Step-through, for reduced motion. */
  const step = (delta: number) => {
    setDrawn((current) => {
      const next = Math.min(count, Math.max(0, Math.round(current) + delta));
      if (next >= count && !watched.current) {
        watched.current = true;
        onWatchedRef.current?.();
      }
      return next;
    });
  };

  const complete = Math.floor(drawn);
  const partial = drawn - complete;
  const active = partial > 0 ? strokes[complete] : undefined;

  return (
    <figure className={styles.wrap}>
      <svg
        className={styles.paper}
        viewBox={glyph.viewBox}
        preserveAspectRatio="xMidYMid meet"
        width={size}
        height={size}
        role="img"
        aria-label={t('strokeOrder.diagramLabel', { character, count })}
      >
        {/*
          The paper, drawn *inside* the box rather than under it.

          It was a `background` and a `border-radius` on the `<svg>` element
          itself, and that is what cut the numbered badges. An outermost `<svg>`
          clips at its viewport, and a `border-radius` on an element whose
          overflow is hidden clips at the curve — so a badge near an edge lost
          the outer half of its ring, and a badge in a corner (`ㄷ`'s second,
          at 5.6, 5.6) was cut on two sides by an arc whose radius nothing in
          `strokeMarkers` could even read: 20 px is 13.3 viewBox units at the
          size the gallery draws and 10 at the size the introduction card does.

          As a `<rect>` it is one geometry in one coordinate system, the same
          one the placement measures against — `PAPER_CORNER` is its `rx` — and
          the `<svg>` no longer needs to clip anything at all. Inset half a unit
          so the hairline sits inside the box rather than astride its edge.
        */}
        <rect
          className={styles.sheet}
          x={0.5}
          y={0.5}
          width={99}
          height={99}
          rx={PAPER_CORNER}
        />

        {/* The same guides the practice canvas draws, so the demonstration and
            the box underneath it agree about where the middle is. */}
        <path d="M50 4 V96 M4 50 H96" className={styles.guide} />

        {/*
          Where the whole character is going.

          Under the ink, and under every stroke of it, so a stroke still to come
          can never appear to cut across one already written — whatever order
          they overlap in, black is painted after grey.
        */}
        {strokes.map((stroke) => (
          <path
            key={`guide-${stroke.order}`}
            d={stroke.d}
            className={styles.ghost}
            strokeWidth={glyph.pen}
          />
        ))}

        {strokes.slice(0, complete).map((stroke) => (
          <path
            key={`ink-${stroke.order}`}
            d={stroke.d}
            className={styles.ink}
            strokeWidth={glyph.pen}
          />
        ))}

        {/*
          The stroke being written: its own path, uncovered along itself.

          One dash as long as the whole path, offset by however much of it has
          not been written yet. At `partial = 0` the offset is the full length
          and nothing shows; at 1 it is zero and the stroke is complete. The
          growing end is cut square by the `butt` cap, which is what a pen tip
          looks like.
        */}
        {active && (
          <path
            d={active.d}
            className={styles.ink}
            strokeWidth={glyph.pen}
            strokeDasharray={active.length}
            strokeDashoffset={active.length * (1 - partial)}
          />
        )}

        {markers.map((marker, index) => (
          <g
            key={`n-${marker.order}`}
            className={index < complete ? styles.markerDone : styles.marker}
          >
            {marker.tethered && (
              <line
                className={styles.tether}
                x1={marker.anchor.x}
                y1={marker.anchor.y}
                x2={marker.label.x}
                y2={marker.label.y}
              />
            )}
            <g transform={`translate(${marker.label.x} ${marker.label.y})`}>
              <circle r={markerRadius} />
              <text dy={markerRadius * 0.36} fontSize={markerRadius * 1.05}>
                {marker.order}
              </text>
            </g>
          </g>
        ))}
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
              {t('strokeOrder.position', { current: complete, count })}
            </span>
            <button
              type="button"
              className={styles.stepButton}
              onClick={() => step(1)}
              disabled={complete >= count}
            >
              {t('strokeOrder.next')}
            </button>
          </span>
        ) : (
          <>
            <button type="button" className={styles.replay} onClick={playing ? stop : play}>
              {playing ? t('strokeOrder.pause') : t('strokeOrder.watchAgain')}
            </button>
            <span className={styles.count}>{t('strokeOrder.count', { count })}</span>
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
