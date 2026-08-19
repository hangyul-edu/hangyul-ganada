import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { drawLength, strokeAsset, strokeReveal } from '../data/strokeAssets';
import { isSyllable } from '../data/jamo';
import { layoutMarkers } from './strokeMarkers';
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
 * Everything here is drawn from `data/strokeAssets`: the grey guide, the ink as
 * it arrives, the completed strokes, the final frame. Each stroke is a filled
 * outline cut from the reference glyph at build time, so the union of them *is*
 * that glyph and the last frame cannot drift into a different shape. That is why
 * this component has no measuring, no fitting and no layout arithmetic in it —
 * the geometry arrives finished, and its only job is to decide how much of it to
 * show. Anything character-specific lives in the asset, never here: there is no
 * place in this file where a particular ㄱ or 글 is worth mentioning, and if one
 * ever seems to be, the asset is wrong and this is not where to fix it.
 *
 * The previous version measured the practice typeface at runtime and fitted
 * polylines onto what it found. That is where four rounds of "it still looks
 * wrong" came from and could not have stopped coming: it was answering "roughly
 * what does this look like" when the reference glyph two inches above it had
 * already answered exactly.
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
  const maskId = useId();

  const asset = useMemo(() => strokeAsset(character), [character]);
  const strokes = asset.strokes;
  const count = strokes.length;

  // A composed block is several letters sharing one box, and it needs smaller
  // numbers than a single letter filling it.
  const markerRadius = isSyllable(character) ? 4 : 5.6;
  const markers = useMemo(() => layoutMarkers(strokes, markerRadius), [strokes, markerRadius]);

  const schedule = useMemo(
    () => buildSchedule(strokes.map((stroke) => drawLength(stroke.draw))),
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
  const reveal = active ? strokeReveal(active, partial) : null;

  return (
    <figure className={styles.wrap}>
      <svg
        className={styles.paper}
        viewBox={asset.viewBox}
        preserveAspectRatio="xMidYMid meet"
        width={size}
        height={size}
        role="img"
        aria-label={t('strokeOrder.diagramLabel', { character, count })}
      >
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
          <path key={`guide-${stroke.order}`} d={stroke.shape} className={styles.ghost} />
        ))}

        {strokes.slice(0, complete).map((stroke) => (
          <path key={`ink-${stroke.order}`} d={stroke.shape} className={styles.ink} />
        ))}

        {/*
          The stroke being written.

          A mask rather than a clip, because a clip path is filled and this has
          to be *stroked*: the reveal is a fat line swept along the stroke's own
          centreline, so the ink appears in the order a pen would lay it down
          rather than wiping in from one side.

          The region comes from `strokeReveal` rather than being written out
          here, because `scripts/strokes-qa.mjs` renders the same frames for a
          person to look at and the two must not be able to differ — the wedge
          that used to appear at the corner of ㄱ was in both, identically, and
          passing QA. It is a filled ribbon of the stroke's own varying width,
          cut square across at the pen; see `strokeReveal` for why a stroked
          line of one width cannot do this job.
        */}
        {active && (
          <>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100"
              height="100"
            >
              <path d={reveal!.path} fill="#fff" fillRule="nonzero" />
            </mask>
            <path d={active.shape} className={styles.ink} mask={`url(#${maskId})`} />
          </>
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
