import { strokeAsset } from '../data/strokeAssets';

/**
 * The character at the top of a lesson, drawn from the same asset as the demo.
 *
 * ## Why this is not just large text
 *
 * It used to be, set in whichever practice face the learner had chosen. That
 * gave an instructional screen two different answers to the same question: the
 * reference glyph said the character looks like *this*, and the demonstration
 * below it — measured, fitted and composed at runtime — said it looks like
 * something close to that. A learner cannot tell which of the two to copy, and
 * the honest answer was neither, because they disagreed.
 *
 * Now both are `union(strokes)` of one build-time asset, so the shape a learner
 * studies and the shape they watch being written are not merely consistent, they
 * are the same paths. There is nothing left that could drift.
 *
 * The decorative practice faces are still the learner's to choose, and they
 * still apply where they belong: the writing canvas, the word rows, anywhere
 * reading Korean is the task. This is the one place where the glyph *is* the
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
  const asset = strokeAsset(character);
  return (
    <svg
      className={className}
      viewBox={asset.viewBox}
      preserveAspectRatio="xMidYMid meet"
      width={size}
      height={size}
      role="img"
      aria-label={character}
      lang="ko"
    >
      {asset.strokes.map((stroke) => (
        <path key={stroke.order} d={stroke.shape} fillRule="evenodd" fill="currentColor" />
      ))}
    </svg>
  );
}
