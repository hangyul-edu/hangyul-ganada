import styles from './ReferenceGlyph.module.css';

/**
 * The character at the top of a lesson: the shape the learner is aiming at.
 *
 * ## Why this is the typeface and the demonstration is not
 *
 * A lesson screen answers two different questions, and they want two different
 * kinds of drawing. *What does this letter look like?* is answered best by a
 * Korean typeface, whose designer has already solved it — the counters, the
 * stem weights, the way ㅅ's legs flare — better than any geometry generated
 * here will. *How is it written?* is movement, and a typeface cannot say
 * anything about it, because a finished outline has no order and no direction.
 *
 * The two used to be forced to share one geometry. Each stroke of the
 * demonstration was cut out of this glyph at build time, so that
 * `union(strokes)` was the glyph exactly and the reference could not drift from
 * the animation. It held, and the price was that the *cut* was visible: a
 * junction is ink two strokes both pass through, and dividing it draws a
 * boundary the learner can see. ㅂ's uprights carried wedges of crossbars that
 * had not been written yet, and ㅇ — traced back from pixels — was a polygon.
 *
 * So the two are separate again, deliberately. This is the typeface. The
 * demonstration, the numbered diagram and the guide under the writing canvas
 * are all `data/strokeVectors`, which is authored centrelines fitted into the
 * proportions measured off *this* face (`scripts/measure-jamo.mjs`,
 * `scripts/measure-composition.mjs`). They are not the same paths any more;
 * they are the same letter, at the same size, in the same proportions, and
 * there is exactly one of each on the screen.
 *
 * ## Why this face and not the learner's chosen one
 *
 * The decorative practice faces are still the learner's to choose, and they
 * still apply where they belong: the writing canvas, the word rows, anywhere
 * *reading* Korean is the task. This is the one place where the glyph is the
 * instruction, and instruction gets one canonical shape.
 */
export function ReferenceGlyph({
  character,
  size,
  className,
}: {
  character: string;
  size: number;
  className?: string;
}) {
  return (
    <span
      className={className ? `${styles.glyph} ${className}` : styles.glyph}
      style={{ fontSize: `${size * 0.78}px`, width: size, height: size }}
      role="img"
      aria-label={character}
      lang="ko"
    >
      {character}
    </span>
  );
}
