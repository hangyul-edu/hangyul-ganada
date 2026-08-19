/**
 * Prints the evaluator's response curve across the synthetic cases, so the
 * tolerance band and weights are tuned against numbers rather than intuition.
 *
 *   npx tsx scripts/calibrate.mjs        (run via `npm run calibrate`)
 */
import { rasterizeStrokes } from '../src/raster.ts';
import { evaluateStrokes } from '../src/evaluate.ts';
import { DEFAULT_EVALUATION_CONFIG } from '../src/config.ts';
import {
  SHAPE_A,
  SHAPE_GA,
  SHAPE_GIYEOK,
  resample,
  scribble,
  transform,
  REFERENCE_STROKE_WIDTH,
} from '../src/test-shapes.ts';

const R = DEFAULT_EVALUATION_CONFIG.resolution;
const tolerance = Number(process.argv[2] ?? DEFAULT_EVALUATION_CONFIG.glyphToleranceRatio);
const cfg = { glyphToleranceRatio: tolerance };

const ref = (shape) => rasterizeStrokes(resample(shape), R);
const run = (label, attempt, shape) => {
  const r = evaluateStrokes(resample(attempt), ref(shape), cfg);
  console.log(
    `${label.padEnd(34)} mismatch=${r.mismatchRatio.toFixed(3)}  ` +
      `outside=${r.outsideStrokeRatio.toFixed(3)}  missing=${r.missingCoverageRatio.toFixed(3)}  ` +
      `gap=${r.diagnostics.largestGapRatio.toFixed(3)}  ` +
      `${r.passed ? 'PASS' : 'FAIL'} ${r.reason ?? ''}`,
  );
};

console.log(`\n=== tolerance ratio ${tolerance} (band ${(tolerance * R).toFixed(1)}px @ ${R}) ===\n`);

console.log('-- should pass --');
run('perfect trace 가', SHAPE_GA, SHAPE_GA);
run('jitter 0.012', transform(SHAPE_GA, { jitter: 0.012, seed: 42 }), SHAPE_GA);
run('jitter 0.02', transform(SHAPE_GA, { jitter: 0.02, seed: 3 }), SHAPE_GA);
run('shift 0.02', transform(SHAPE_GA, { dx: 0.02, dy: -0.015 }), SHAPE_GA);
run('thin pen 0.7x', transform(SHAPE_GA, { width: REFERENCE_STROKE_WIDTH * 0.7 }), SHAPE_GA);
run('thick pen 1.25x', transform(SHAPE_GA, { width: REFERENCE_STROKE_WIDTH * 1.25 }), SHAPE_GA);
run('scale 0.92', transform(SHAPE_GA, { scale: 0.92 }), SHAPE_GA);
run('scale 1.08', transform(SHAPE_GA, { scale: 1.08 }), SHAPE_GA);

console.log('\n-- should fail --');
run('incomplete (2 of 3 strokes)', SHAPE_GA.slice(0, 2), SHAPE_GA);
run('scribble', scribble(), SHAPE_GA);
run('displaced 0.3/0.25', transform(SHAPE_GA, { dx: 0.3, dy: 0.25 }), SHAPE_GA);
run('oversized 1.45', transform(SHAPE_GA, { scale: 1.45 }), SHAPE_GA);
run('undersized 0.5', transform(SHAPE_GA, { scale: 0.5 }), SHAPE_GA);
run('undersized 0.55 (ㅏ)', transform(SHAPE_A, { scale: 0.55 }), SHAPE_A);
run('wrong char ㅏ for ㄱ', SHAPE_A, SHAPE_GIYEOK);
run('wrong char ㄱ for 가', SHAPE_GIYEOK, SHAPE_GA);

console.log('\n-- drift response curve (가) --');
for (const dx of [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.16, 0.2, 0.3]) {
  run(`dx ${dx.toFixed(2)}`, transform(SHAPE_GA, { dx }), SHAPE_GA);
}

console.log('\n-- scale response curve (가) --');
for (const scale of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.45]) {
  run(`scale ${scale.toFixed(2)}`, transform(SHAPE_GA, { scale }), SHAPE_GA);
}
console.log();
