/**
 * Response curve of the evaluator against real Noto Sans CJK KR glyph masks.
 * This is the calibration that matters — real typeface proportions are what the
 * 10% threshold has to hold against.
 *
 *   npx tsx scripts/calibrate-glyphs.mjs [toleranceRatio]
 */
import { evaluateMasks } from '../src/evaluate.ts';
import { DEFAULT_EVALUATION_CONFIG } from '../src/config.ts';
import {
  eraseRegion,
  erodeOrDilateMask,
  glyphMask,
  scaleMask,
  shiftMask,
} from '../src/__tests__/fixtures.ts';
import { rasterizeStrokes } from '../src/raster.ts';
import { scribble, resample } from '../src/test-shapes.ts';

const tolerance = Number(process.argv[2] ?? DEFAULT_EVALUATION_CONFIG.glyphToleranceRatio);
const falloff = Number(process.argv[3] ?? DEFAULT_EVALUATION_CONFIG.toleranceFalloffMultiplier);
const useGap = process.argv[4] !== 'nogap';
const cfg = {
  glyphToleranceRatio: tolerance,
  toleranceFalloffMultiplier: falloff,
  useStructuralGap: useGap,
  structuralGapWeight: Number(process.env.GAP_WEIGHT ?? DEFAULT_EVALUATION_CONFIG.structuralGapWeight),
};
const R = DEFAULT_EVALUATION_CONFIG.resolution;

const show = (label, user, ref) => {
  const r = evaluateMasks(user, ref, cfg);
  console.log(
    `${label.padEnd(32)} mismatch=${r.mismatchRatio.toFixed(3)}  ` +
      `out=${r.outsideStrokeRatio.toFixed(3)}  miss=${r.missingCoverageRatio.toFixed(3)}  ` +
      `mean=${r.diagnostics.meanMissingRatio.toFixed(3)} gap=${r.diagnostics.largestGapRatio.toFixed(3)}  ` +
      `${r.passed ? 'PASS' : 'FAIL'} ${r.reason ?? ''}`,
  );
};

console.log(
  `\n=== real glyphs | tolerance ${tolerance} (${(tolerance * R).toFixed(1)}px) | ` +
    `falloff x${falloff} | gap-floor ${useGap} ===\n`,
);

const ga = glyphMask('가');
const sa = glyphMask('사');
const han = glyphMask('한');
const mul = glyphMask('물');

console.log('-- should pass: honest attempts --');
show('가 exact', ga, ga);
show('가 shift 2px', shiftMask(ga, 2, -1), ga);
show('가 shift 4px', shiftMask(ga, 4, 2), ga);
show('가 thinner pen (-1)', erodeOrDilateMask(ga, -1), ga);
show('가 thicker pen (+2)', erodeOrDilateMask(ga, 2), ga);
show('가 scale 0.95', scaleMask(ga, 0.95), ga);
show('가 scale 1.05', scaleMask(ga, 1.05), ga);
show('한 exact', han, han);
show('한 shift 3px', shiftMask(han, 3, 3), han);

console.log('\n-- should fail: wrong or incomplete --');
show('가 without ㅏ', eraseRegion(ga, { x0: 0.6, y0: 0, x1: 1, y1: 1 }), ga);
show('가 without ㄱ', eraseRegion(ga, { x0: 0, y0: 0, x1: 0.58, y1: 1 }), ga);
show('가 without ㅏ branch', eraseRegion(ga, { x0: 0.72, y0: 0.45, x1: 1, y1: 0.58 }), ga);
show('사 without ㅅ right leg', eraseRegion(sa, { x0: 0.3, y0: 0.6, x1: 0.55, y1: 1 }), sa);
show('한 without final ㄴ', eraseRegion(han, { x0: 0, y0: 0.62, x1: 1, y1: 1 }), han);
show('물 without final ㄹ', eraseRegion(mul, { x0: 0, y0: 0.6, x1: 1, y1: 1 }), mul);
show('wrong char: 사 for 가', sa, ga);
show('wrong char: 한 for 물', han, mul);
show('가 shift 10px', shiftMask(ga, 10, 0), ga);
show('가 shift 16px', shiftMask(ga, 12, 10), ga);
show('가 scale 0.6', scaleMask(ga, 0.6), ga);
show('가 scale 1.5', scaleMask(ga, 1.5), ga);
show('scribble over 가', rasterizeStrokes(resample(scribble()), R), ga);

console.log('\n-- drift curve (가) --');
for (const d of [0, 2, 4, 6, 8, 10, 12, 16, 20]) show(`shift ${d}px`, shiftMask(ga, d, 0), ga);

console.log('\n-- scale curve (가) --');
for (const s of [0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2, 1.3, 1.5]) {
  show(`scale ${s}`, scaleMask(ga, s), ga);
}
console.log();
