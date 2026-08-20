import { TRACE_GLYPH_OPACITY } from '@hangyul-ganada/handwriting-core';

/**
 * How much of the reference glyph is on screen while the learner writes.
 *
 * ```
 * ██████████  the shape, plainly. Follow the line.
 * ```
 *
 * **One value, and there is no setting.** There used to be two — a full model
 * and a fainter one — and a preference in My Learning to choose between them,
 * and before that a lesson that made you write the same letter twice with the
 * model fading in between. All of it is gone.
 *
 * The reason is that the faded step was never a second skill. It asked for the
 * identical movement with less ink on the paper, so the only thing it could
 * measure was whether the learner would do it again — and as a *setting* it was
 * worse, because it made a learner who has known Hangul for four minutes decide
 * how much help they need before they have tried once. That is a configuration
 * question standing where a lesson should be.
 *
 * A learner is never asked to produce a Korean letter on an empty box, at any
 * point in the product. The model is always there, and it is always this.
 */
export const GUIDE_OPACITY = TRACE_GLYPH_OPACITY;
