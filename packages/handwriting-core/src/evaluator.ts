import { DEFAULT_EVALUATION_CONFIG } from './config.js';
import { evaluateStrokes } from './evaluate.js';
import type { GlyphRasterizer, GlyphSpec } from './glyph.js';
import type { EvaluationConfig, EvaluationResult, Stroke } from './types.js';

export interface AttemptInput {
  strokes: readonly Stroke[];
  glyph: GlyphSpec;
  /**
   * Grading parameters for this attempt, merged over the evaluator's own.
   *
   * The caller supplies them because the thing that moves them is the *font*,
   * and the font is chosen per attempt: a learner tracing a heavy rounded face
   * covers less of the reference with the same honest pen stroke than one
   * tracing a plain gothic, and grading both to a gothic's tolerance fails the
   * first for something that is not a mistake. See `PRACTICE_FONTS` in the app
   * for the per-face values and the reasoning behind each.
   */
  config?: Partial<EvaluationConfig>;
}

/**
 * The seam the learning flow talks to.
 *
 * Everything upstream — the canvas, the session, the API — depends only on this
 * interface, so the geometry comparison can later be augmented or replaced by
 * OCR, an ML recogniser, or stroke-order checking without the learning flow
 * knowing. A future implementation is free to ignore `strokes` order or to use
 * it, which is why the raw strokes are passed rather than a pre-baked mask.
 */
export interface HandwritingEvaluator {
  readonly id: string;
  evaluate(input: AttemptInput): Promise<EvaluationResult>;
}

/**
 * Deterministic, local, no inference. Renders the expected glyph in the
 * learner's selected typeface and compares geometry.
 */
export class GeometryHandwritingEvaluator implements HandwritingEvaluator {
  readonly id = 'geometry-v1';

  constructor(
    private readonly rasterizer: GlyphRasterizer,
    private readonly config: Partial<EvaluationConfig> = {},
  ) {}

  async evaluate({ strokes, glyph, config }: AttemptInput): Promise<EvaluationResult> {
    const cfg = { ...DEFAULT_EVALUATION_CONFIG, ...this.config, ...config };
    const reference = await this.rasterizer.rasterize(glyph, cfg.resolution);
    return evaluateStrokes(strokes, reference, cfg);
  }
}
