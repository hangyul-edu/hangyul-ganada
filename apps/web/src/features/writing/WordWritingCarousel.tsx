import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EvaluationConfig, Stroke } from '@hangyul-ganada/handwriting-core';

import { Button } from '../../ui/Button';
import { ChevronLeftIcon, ChevronRightIcon, EraserIcon, UndoIcon } from '../../ui/icons';
import type { GuideLevel } from './guide';
import { WritingCanvas, type WritingCanvasHandle } from './WritingCanvas';
import { WordFeedbackSheet } from './WordFeedbackSheet';
import { useWordWriting } from './useWordWriting';
import type { WordEvaluation } from './evaluateWord';
import styles from './WordWritingCarousel.module.css';

export interface WordWritingCarouselProps {
  /** The word being written, e.g. `기도하다`. Used for labels only. */
  word: string;
  /** Its syllables in writing order, e.g. `['기','도','하','다']`. */
  syllables: readonly string[];
  fontFamily: string;
  fontWeight?: number;
  grading?: Partial<EvaluationConfig>;
  guide: GuideLevel;
  showGrid?: boolean;
  showCenterCrosshair?: boolean;
  /** Fired for every syllable of every check, so the session can record it. */
  onSyllableEvaluated?: (index: number, evaluation: WordEvaluation['syllables'][number]) => void;
  /**
   * Fired once per check, with the whole-word verdict. This is where a word
   * being written correctly is *recorded*; it is not where the learner leaves.
   */
  onChecked?: (evaluation: WordEvaluation) => void;
  /**
   * The learner has chosen to move on from a word they wrote correctly.
   *
   * Deliberately not fired the instant the word passes. Doing that replaced the
   * success state with the next screen before anyone could see it — the learner
   * wrote 기도하다, and the reward was the page changing under them. Passing and
   * leaving are two events, and the second one is theirs.
   */
  onComplete?: () => void;
  /** Label for the button that leaves a finished word. */
  continueLabel: string;
}

/** How far a horizontal swipe must travel, in px, before it turns a page. */
const SWIPE_THRESHOLD = 48;
/** Beyond this much vertical travel it was a scroll, not a swipe. */
const SWIPE_MAX_DRIFT = 40;

/**
 * Writing one Korean word, one syllable at a time.
 *
 * ## The shape of the thing
 *
 * ```
 *        기   [도]   하   다      ← navigator: where I am, what is done
 *
 *              도                 ← the active syllable, named once
 *        ┌───────────┐
 *   ‹    │  writing  │    ›       ← arrows outside the paper, never on it
 *        └───────────┘
 *        Undo      Clear          ← one toolbar, for this syllable only
 *
 *          확인하기               ← one check, for the whole word
 * ```
 *
 * Four syllables used to mean four boxes side by side, each with its own undo,
 * clear and check — a row that did not fit a phone, so parts of it were simply
 * off the screen. The fix is not a smaller box. It is showing one box.
 *
 * ## Drawing beats navigation, always
 *
 * A horizontal stroke is how you write ㅡ, and it is also how you swipe. There
 * is no gesture heuristic clever enough to be trusted with that, so there is no
 * heuristic: **the swipe listener is not attached to the canvas.** It lives on
 * the frame around it, and the canvas sits above that frame in the stacking
 * order with its own pointer handling. Ink inside the paper cannot turn the
 * page because nothing outside the paper is listening to it.
 *
 * The arrows are the reliable route and the only one a keyboard or a screen
 * reader needs. Swipe is an accelerant for people who already know it is there.
 */
export function WordWritingCarousel({
  word,
  syllables,
  fontFamily,
  fontWeight,
  grading,
  guide,
  showGrid = true,
  showCenterCrosshair = true,
  onSyllableEvaluated,
  onChecked,
  onComplete,
  continueLabel,
}: WordWritingCarouselProps) {
  const { t } = useTranslation(['handwriting', 'vocabulary', 'common']);
  const canvasRef = useRef<WritingCanvasHandle>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const { state, goTo, next, previous, setActiveStrokes, check } = useWordWriting({
    syllables,
    fontFamily,
    fontWeight,
    config: grading,
    onChecked: (evaluation) => {
      evaluation.syllables.forEach((s, i) => onSyllableEvaluated?.(i, s));
      onChecked?.(evaluation);
      setSummaryOpen(true);
    },
  });

  const { activeIndex, syllables: items, ready, overallStatus, checking, needsWork } = state;
  const active = items[activeIndex];
  const total = items.length;
  const passed = overallStatus === 'passed';

  // --- controls, scoped to the active syllable -------------------------------

  const handleStrokes = useCallback(
    (ink: Stroke[]) => setActiveStrokes([...ink]),
    [setActiveStrokes],
  );

  const undo = useCallback(() => {
    canvasRef.current?.undo();
    setActiveStrokes((active?.strokes ?? []).slice(0, -1));
  }, [setActiveStrokes, active?.strokes]);

  const clear = useCallback(() => {
    canvasRef.current?.clear();
    setActiveStrokes([]);
  }, [setActiveStrokes]);

  // --- swipe, on the frame only ----------------------------------------------

  /**
   * A swipe is measured from where it started to wherever it ended — including
   * over a control, or off the element entirely.
   *
   * The end is listened for on the window rather than on the frame, and the
   * pointer is deliberately *not* captured. Both matter:
   *
   * - Without a window listener, a swipe that finishes over the Previous arrow
   *   while that arrow is disabled is delivered nowhere, and the gesture is
   *   silently lost. Disabled buttons receive no pointer events at all.
   * - With pointer capture, the arrows stop working: capture redirects the
   *   pointerup to the frame, so the button never sees a complete click.
   */
  const endSwipe = useRef<(() => void) | null>(null);

  useEffect(() => () => endSwipe.current?.(), []);

  const onFramePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A press on a control is a press on that control, not the beginning of a
    // swipe. Ink is already excluded — the paper stops its own events.
    if ((event.target as HTMLElement).closest('button')) return;

    const from = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };

    const finish = (moved: PointerEvent | null) => {
      endSwipe.current?.();
      if (!moved || moved.pointerId !== from.pointerId) return;
      const dx = moved.clientX - from.x;
      const dy = moved.clientY - from.y;
      // Mostly-vertical travel was a scroll, and a short one was a tap.
      if (Math.abs(dy) > SWIPE_MAX_DRIFT || Math.abs(dx) < SWIPE_THRESHOLD) return;
      if (dx < 0) next();
      else previous();
    };

    const onUp = (moved: PointerEvent) => finish(moved);
    const onCancel = () => finish(null);

    endSwipe.current?.();
    endSwipe.current = () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      endSwipe.current = null;
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  // --- checking ---------------------------------------------------------------

  const onCheck = () => {
    void check();
  };

  /** Closes the summary and puts the learner back on the syllable to repair. */
  const fix = (index: number) => {
    setSummaryOpen(false);
    goTo(index);
  };

  if (!active) return null;

  const instruction =
    total > 1
      ? t('vocabulary:session.writeEachPart', { word })
      : t('vocabulary:session.hintSingle');

  return (
    <div className={styles.root} data-testid="word-writing">
      {/*
        The navigator carries position, so no line of copy needs to repeat it.
        "2번째 · 도" said what the highlighted 도 already says, and cost a row of
        vertical space on the screen with the least of it to spare.
      */}
      <div
        className={styles.navigator}
        role="group"
        aria-label={t('vocabulary:session.syllableGroup', { word })}
        dir="ltr"
      >
        {items.map((syllable, i) => (
          <button
            key={`${word}-${i}`}
            type="button"
            // A step indicator rather than a tab strip. The tab pattern would
            // owe a tabpanel, aria-controls and a roving tabindex, and would be
            // subtly wrong without all three; `aria-current` says the one thing
            // that is actually true — this is the part being written now.
            aria-current={i === activeIndex ? 'step' : undefined}
            aria-label={t('handwriting:word.syllablePosition', {
              syllable: syllable.text,
              position: i + 1,
              count: total,
            })}
            className={`${styles.chip} ${styles[syllable.status]} ${
              i === activeIndex ? styles.chipActive : ''
            }`}
            data-status={syllable.status}
            data-testid="syllable-chip"
            onClick={() => goTo(i)}
          >
            <span className={styles.chipText} lang="ko">
              {syllable.text}
            </span>
            <span className={styles.chipMark} aria-hidden="true" />
          </button>
        ))}
      </div>

      <p className={styles.instruction}>{instruction}</p>

      {/*
        The swipe frame. The canvas is a child, but it stops pointer events
        itself, so a stroke never reaches these handlers. The arrows sit in the
        frame's gutters, which is also where a swipe has room to start.
      */}
      <div
        className={styles.stage}
        onPointerDown={onFramePointerDown}
        data-testid="carousel-stage"
      >
        <button
          type="button"
          className={styles.arrow}
          onClick={previous}
          disabled={activeIndex === 0}
          aria-label={t('handwriting:word.previous')}
          data-testid="syllable-previous"
        >
          <ChevronLeftIcon size={24} />
        </button>

        {/* Keyed so the fade replays on each syllable change. */}
        <div className={styles.paper} key={`paper-${activeIndex}`}>
          <p className={styles.activeLabel} lang="ko" aria-hidden="true">
            {active.text}
          </p>
          {/*
            Where "drawing wins" is actually enforced.

            React's pointer events bubble, so a stroke drawn on the canvas would
            otherwise reach the swipe handlers on the frame above — and a
            horizontal stroke is both how you write ㅡ and how you swipe. No
            heuristic can tell those apart reliably, so none is attempted: the
            events are stopped at the edge of the paper and the frame never sees
            them. Swiping works everywhere around the box; inside it, the pen
            is the only thing that happens.
          */}
          <div
            className={styles.canvasFrame}
            onPointerDown={(event) => event.stopPropagation()}
            data-testid="canvas-frame"
          >
            <WritingCanvas
              // Keyed by index so moving between syllables remounts the box with
              // that syllable's saved ink rather than reusing the previous one's.
              key={`${word}-${activeIndex}`}
              ref={canvasRef}
              character={active.text}
              fontFamily={fontFamily}
              fontWeight={fontWeight}
              guide={guide}
              showGrid={showGrid}
              showCenterCrosshair={showCenterCrosshair}
              status={
                active.status === 'passed'
                  ? 'correct'
                  : active.status === 'needsWork'
                    ? 'incorrect'
                    : 'idle'
              }
              initialStrokes={active.strokes}
              onStrokesChange={handleStrokes}
              label={t('handwriting:word.canvasLabel', {
                syllable: active.text,
                position: activeIndex + 1,
                count: total,
              })}
            />
          </div>
        </div>

        <button
          type="button"
          // Once there is ink the way forward is worth pointing at — it means
          // "you may go on", not "that was right". Nothing here has been judged.
          className={`${styles.arrow} ${active.hasInk ? styles.arrowReady : ''}`}
          onClick={next}
          disabled={activeIndex === total - 1}
          aria-label={t('handwriting:word.next')}
          data-testid="syllable-next"
        >
          <ChevronRightIcon size={24} />
        </button>
      </div>

      <div className={styles.tools}>
        <Button
          size="sm"
          variant="ghost"
          pill
          onClick={undo}
          disabled={!active.hasInk}
          startIcon={<UndoIcon size={16} />}
          aria-label={t('handwriting:word.undoSyllable', { syllable: active.text })}
          data-testid="undo"
        >
          {t('handwriting:actions.undo')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          pill
          onClick={clear}
          disabled={!active.hasInk}
          startIcon={<EraserIcon size={16} />}
          aria-label={t('handwriting:word.clearSyllable', { syllable: active.text })}
          data-testid="clear"
        >
          {t('handwriting:actions.clear')}
        </Button>
      </div>

      {/* Announced rather than shown: sighted learners have the navigator. */}
      <p className="hg-sr-only" aria-live="polite">
        {t('handwriting:word.syllablePosition', {
          syllable: active.text,
          position: activeIndex + 1,
          count: total,
        })}
      </p>

      {/*
        The one action for the whole word, and the only primary button on the
        screen. Sticky, inside the safe area, so it cannot end up half under an
        Android navigation bar or an iOS home indicator the way the old row of
        per-syllable check buttons did.
      */}
      <div className={styles.cta}>
        {passed ? (
          <Button size="lg" fullWidth onClick={() => onComplete?.()} data-testid="word-continue">
            {continueLabel}
          </Button>
        ) : (
          <>
            {/*
              Always rendered, hidden once the word is ready, so the block keeps
              its height either way.

              Removing it outright shifted the layout at the exact moment the
              last syllable got its first stroke — which is to say, while the
              learner's pen was down on that box. Reserving the space costs two
              lines that are useful anyway while the word is unfinished; taking
              it away moved the paper mid-stroke.
            */}
            <p
              className={styles.ctaHint}
              aria-hidden={ready || undefined}
              data-hidden={ready || undefined}
            >
              {t('vocabulary:session.writeEveryPartFirst')}
            </p>
            <Button
              size="lg"
              fullWidth
              onClick={onCheck}
              disabled={!ready}
              loading={checking}
              data-testid="check-word"
            >
              {state.hasChecked
                ? t('handwriting:word.checkAgain')
                : t('handwriting:word.checkWord')}
            </Button>
          </>
        )}
      </div>

      <WordFeedbackSheet
        open={summaryOpen && state.hasChecked}
        word={word}
        syllables={items}
        needsWork={needsWork}
        passed={passed}
        onFix={fix}
        onClose={() => setSummaryOpen(false)}
        onContinue={() => {
          setSummaryOpen(false);
          onComplete?.();
        }}
        continueLabel={continueLabel}
      />
    </div>
  );
}
