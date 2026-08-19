# Handwriting evaluation

`packages/handwriting-core` decides whether a learner's drawing is the character
they were asked to write. It is deterministic, local, and needs no inference.

## The rule

```
mismatchRatio = outsideStrokeRatio + missingCoverageRatio    (clamped to 0..1)

PASS when mismatchRatio <= MAX_MISMATCH_RATIO   (0.10)
FAIL when mismatchRatio >  MAX_MISMATCH_RATIO
```

## How the two terms are measured

Both masks are rasterised at `COMPARISON_RESOLUTION` (128²) over the writing
box. Nothing is re-centred or re-scaled: **where the learner writes inside the
box is part of the task**, so only device pixel ratio and canvas size are
normalised away.

**`outsideStrokeRatio`** — of the ink the learner laid down, how much does not
belong to the glyph. Catches scribbles, wrong shapes, oversized writing, and
writing in the wrong place.

**`missingCoverageRatio`** — of the glyph, how much the learner never wrote.
Catches half-finished characters, omitted strokes, and undersized writing.

Neither is sufficient alone: one dot scores a perfect outside ratio, and
flooding the box scores perfect coverage.

### Errors are graded, not binary

Each pixel is charged by its distance to the other mask: free within
`GLYPH_TOLERANCE_RATIO` (0.04 of the box edge — the tolerance band that buys
natural handwriting variation), then ramping to a full unit of error over
`TOLERANCE_FALLOFF_MULTIPLIER` × that radius.

The first implementation used a plain dilation and a binary in-band test. Every
attempt inside the band scored exactly 0.000 — a 2 px drift and a 6 px drift
were indistinguishable, `score` carried no information, and grading fell off a
cliff at the band edge. The ramp fixes all three.

### The terms add rather than average

Weighting them 0.5/0.5 means a character missing a tenth of its strokes scores
as 5% different. Measured on the reference glyphs, that let a learner drop a
whole jamo and still pass. They measure disjoint quantities of difference, so
they add.

### A contiguous gap counts for more than its area

Mean coverage dilutes an omitted stroke against everything the learner *did*
write. Dropping the branch of ㅏ in 가 is ~4% of the glyph's area — and turns 가
into 기. Measured, it scored 0.023 and passed comfortably.

So the largest connected blob of unwritten reference ink acts as a floor on the
coverage term, weighted by `STRUCTURAL_GAP_WEIGHT` (2.5). An absent structural
feature is categorically worse than the same ink missing uniformly because the
pen ran thin — it changes which character was written.

## Calibration

Constants were tuned against **real Korean outlines**, not against hand-drawn
approximations, because typeface proportions are what the threshold has to hold
against. Fixtures live in `src/__tests__/glyph-fixtures.json` — one set of glyph
masks per practice face the app bundles, rendered from the exact woff2 files in
`node_modules` (regenerate with `npm run fixtures`, which needs `fonttools[woff]`
and `pillow`).

### Six typefaces, one pass mark

`real-glyphs.test.ts` calibrates the algorithm against the default face.
`font-tolerance.test.ts` asks the question that only exists because the learner
can choose: does one pass mark serve all six?

It has to model the thing that actually differs between them. The learner's pen
is 0.062 of the box wide whatever is selected, while the reference stroke is
whatever its designer drew — across the bundled faces that ranges from about
half the pen to one and a half times it. So an "honest attempt" is built by
reducing the glyph to its ridge and re-inking it at the pen's width
(`rewriteWithPen`), then writing it imperfectly: a little small, a little large,
a few pixels off, a heavier or lighter hand. A "wrong answer" is a *different*
character drawn just as carefully.

Two findings came out of that, and both are load-bearing:

* **The tolerance was slightly too tight.** At 0.035 a correctly written 이, 8%
  small and 2 px off, scored 0.135 against a 0.10 pass mark — a false failure.
  At 0.04 the worst honest attempt across all six faces scores 0.074 and the
  closest wrong character scores 0.114. Going further inverts it: by 0.048 a
  wrong character scores 0.065 and would pass.
* **Two typefaces were rejected on the measurements rather than on taste.** Jua,
  the rounded face most Koreans would name, draws at roughly twice the pen: an
  honest attempt scored *worse* than a wrong character at every tolerance
  tried, so no pass mark separates them. Nanum Pen Script, the best-known
  handwriting face, leaves 사 and 가 about 0.014 apart — inside the noise of
  real handwriting. Neither is bundled. See `apps/web/src/data/fonts.ts`.

A face may still carry its own `evaluation` profile, which the app turns into
grading parameters in `features/writing/useEvaluator.ts`. None of the six needs
one: the finding above applied to every face, so it was fixed once in
`config.ts` rather than six times in the data.

Reproduce the numbers below with:

```bash
npm run calibrate:glyphs --workspace @hangyul-ganada/handwriting-core
npm run calibrate        --workspace @hangyul-ganada/handwriting-core   # synthetic strokes
```

Measured behaviour at the shipped constants:

| Case | mismatch | verdict |
| --- | --- | --- |
| exact trace | 0.000 | pass |
| drift 2–4 px (of 128) | 0.000 | pass |
| lighter / heavier pen | 0.000 | pass |
| scale 0.88 – 1.15 | ≤ 0.086 | pass |
| drift 6 px | 0.291 | fail |
| scale 0.8 | 0.193 | fail |
| scale 1.3 | 0.446 | fail |
| 가 without ㅏ's branch | 0.105 | fail |
| 사 without ㅅ's right leg | 0.117 | fail |
| 한 without final ㄴ | 0.600 | fail |
| wrong syllable (사 for 가) | 0.502 | fail |
| wrong syllable (한 for 물) | 0.221 | fail |
| random scribble | 0.434 | fail |
| nothing drawn | 1.000 | fail (`empty`) |

The pass window — roughly ±5 px of placement and 0.88–1.15 of size — is wide
enough for a beginner tracing a visible guide and narrow enough that the wrong
character never passes.

## Whole words

The evaluator grades one character against one reference glyph, and that is the
right size for it — 기도하다 is four glyphs and there is no four-glyph mask.

`apps/web/src/features/writing/evaluateWord.ts` is the aggregation over it, not
a second evaluator. It calls the grader once per syllable, against that
syllable's own glyph, with the same per-typeface slack, and folds the answers
into one verdict. Four calls inside, one grading event outside.

```ts
evaluateWord(evaluator, [
  { character: '기', strokes },
  { character: '도', strokes },
  { character: '하', strokes },
  { character: '다', strokes },
], { glyph: { fontFamily, fontWeight }, config })
```

Two rules it enforces:

- **Every syllable must pass.** `passed` is a conjunction, never an average.
  95 / 95 / 0 / 0 is not a word the learner wrote, and averaging it to 48% — or
  to a pass — would say otherwise. A word with no syllables does not pass
  either; `every` on an empty list is true, so that is guarded explicitly.
- **An empty syllable short-circuits.** The evaluator is never called, and the
  syllable is reported with a `null` result meaning *not written yet*. Asking it
  to grade nothing would still rasterise a reference glyph, and a font that
  fails to render throws — turning an unwritten box into an exception. The
  interface normally prevents this state; the domain survives it regardless.

Feedback maps the four failure reasons the evaluator can actually produce onto
four sentences and stops there. It never claims an angle, an offset or a stroke
length, because nothing in this method measures those — see **Known limitation**
directly below.

## Known limitation

This is an **area-overlap** method. It cannot see stroke order, stroke
direction, or stroke count, and a wrong character that happens to occupy nearly
the same area as the target is its hardest case. `한` written for `물` scores
0.221 — comfortably failing, but by a smaller margin than a human would judge.

The structural-gap floor mitigates the worst of it, but it is a mitigation, not
a solution. `HandwritingEvaluator` in `src/evaluator.ts` exists as the seam for
the real fix: the learning flow depends only on that interface, so an OCR or
stroke-order recogniser can be added — or the geometry evaluator kept as a fast
pre-filter in front of one — without touching the UI. Raw strokes rather than a
pre-baked mask are passed across the interface precisely so a future
implementation can use timing and order.

## Tuning

Every constant is in `src/config.ts` and overridable per call:

| Constant | Default | Effect |
| --- | --- | --- |
| `MAX_MISMATCH_RATIO` | `0.10` | the pass bar |
| `GLYPH_TOLERANCE_RATIO` | `0.04` | free slack around the glyph |
| `TOLERANCE_FALLOFF_MULTIPLIER` | `1.5` | how fast error ramps past the slack |
| `STRUCTURAL_GAP_WEIGHT` | `2.5` | how much a contiguous omission counts |
| `MIN_INK_RATIO` | `0.08` | below this, the attempt reads as `empty` |
| `COMPARISON_RESOLUTION` | `128` | mask edge length |

The tolerance band and the pass bar are deliberately separate knobs: widening
what counts as natural variation and lowering what counts as correct are
different product decisions.
