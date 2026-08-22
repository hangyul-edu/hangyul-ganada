import type { CSSProperties, ReactNode } from 'react';

import { inkOffset } from '../data/inkOffset';

/**
 * A Hangul letter, in the middle of the space it is given.
 *
 * ## Why `text-align: center` is not enough
 *
 * Centring puts the middle of a glyph's **advance width** in the middle of its
 * container, and the middle of its **line box** on the vertical centre. Neither
 * of those is the ink. For Latin the difference is invisible; for compatibility
 * jamo it is not, because those codepoints are drawn to be legible on their own
 * rather than to fill their em. Measured off Pretendard at weight 600:
 *
 * ```
 *   ㅜ   7.8% of the em too low
 *   ㅠ   7.5% too low
 *   ㅏ   6.8% too far right
 *   ㅑ   4.0% too far right
 *   ㅗ   3.8% too high
 * ```
 *
 * At the size a lesson card sets the reference character, 7.8% of the em is
 * about seven pixels — plainly visible, and worse than plainly visible in
 * context: the learner is copying that letter into a square guide that *is*
 * centred, so the model and the target disagree about where the letter belongs.
 *
 * ## Why this is not a per-letter margin
 *
 * Nobody types these numbers. `scripts/measure-jamo.mjs` renders each letter in
 * the real face, finds the painted pixels, and records how far their centre
 * falls from the centre of the box a centred element occupies. This subtracts
 * that. Change the face or the weight and the numbers are re-measured by the
 * same generator that already measures the proportions the strokes are fitted
 * to — which is the point: one source for "what does this face do", and no
 * hand-tuned constants that go stale the day the typeface is updated.
 *
 * A letter with no measurement — a syllable, punctuation, anything outside the
 * taught set — renders unshifted. Composed syllables were measured too and sit
 * within 2.5% of centre, because a syllable block *is* designed to fill its em.
 */

export function CenteredGlyph({
  character,
  className,
  style,
  lang = 'ko',
  children,
  'data-testid': testId,
}: {
  /** The text to centre. Only single taught letters carry a measurement. */
  character: string;
  className?: string;
  style?: CSSProperties;
  lang?: string;
  /** Rendered instead of `character` when the caller draws its own content. */
  children?: ReactNode;
  /** Test hook, forwarded so a spec can still find the glyph it always found. */
  'data-testid'?: string;
}) {
  const offset = inkOffset(character);
  /*
   * `em`, so the correction scales with whatever font size the caller sets.
   *
   * A translate rather than a margin or padding: it moves the painted glyph
   * without changing the box, so nothing around it reflows and a container that
   * was the right size stays the right size.
   */
  const corrected: CSSProperties | undefined =
    offset.dx === 0 && offset.dy === 0
      ? style
      : { ...style, transform: `translate(${-offset.dx}em, ${-offset.dy}em)` };

  return (
    <span className={className} style={corrected} lang={lang} dir="ltr" data-testid={testId}>
      {children ?? character}
    </span>
  );
}
