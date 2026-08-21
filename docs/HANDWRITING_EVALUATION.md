# Handwriting evaluation

`packages/handwriting-core` decides whether a learner's drawing is the character
they were asked to write. It is deterministic, local, and needs no inference.

## The rule

```
mismatchRatio = outsideStrokeRatio + missingCoverageRatio    (clamped to 0..1)

PASS when mismatchRatio <= MAX_MISMATCH_RATIO   (0.10)
           and the pen path is not a scrawl     (see The path gate)
FAIL otherwise
```

Two gates, and the second is not a refinement of the first. The ink comparison
is the primary measure; the path gate closes the one thing it structurally
cannot see. Both have to be satisfied, and only the ink comparison can produce a
score.

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

## Note on the demonstration

The stroke *animation* is a separate subject from grading, and it is documented
where it lives: `data/strokeVectors.ts` for the instructional geometry and
`scripts/strokes-qa.mjs` for what is checked. In short, a stroke is uncovered by
a ribbon of its own varying width cut square across at the pen, and `strokes:qa`
holds the property that a stroke may only be as black as the pen has travelled.

## The path gate

The rule above compares **ink to ink**, and that comparison has one blind spot
which is total: *a pixel does not record how many times the pen crossed it.*

Traced along ㅏ, a sine wave of amplitude 0.04 and period 0.04 — a violent
scribble, four times the pen travel of an honest attempt — scored a
**mismatch of exactly 0.000** and was marked correct. It is not a threshold
problem. Every pixel of that scribble lands inside the tolerance band, and the
band cannot be narrowed to exclude it, because the amplitude of the scribble and
the amplitude of honest hand jitter are the same number.

So the path is measured separately, from the strokes rather than the mask
(`src/path.ts`):

| Metric | Question | What it catches |
| --- | --- | --- |
| `lengthRatio` | how much further did the pen travel than the letter is long? | zigzags, repeated S-curves, over-tracing, wandering detours |
| `reversalDensity` | how often did the pen turn back on itself? | scrubbing back and forth, loops, shading |

Both are ratios against the **reference glyph's own skeleton length**, estimated
from its ink area and its stroke thickness, so they mean the same thing for ㅣ
and for 뷁 without a per-character table. The yardstick comes from the reference
and never from the learner: one derived from the thing being measured would
stretch to fit whatever it was handed, which is exactly how a scribble comes to
look normal.

Length alone passes a slow, tight back-and-forth. Reversals alone pass one
enormous looping detour. Between them there is no way to lay down the right ink
while moving like a scribble.

### It is a veto, and only a veto

The gate can turn a pass into a failure. It can never turn a failure into a
pass, and it never changes the score of an honest attempt. A rejection reports
`reason: 'scribble'`, and the score is pulled down to the pass mark rather than
to zero — the ink really was close to the glyph, and reporting 0 would tell the
scheduler the learner cannot form the letter at all, which the measurement does
not support.

### Forgiveness is designed in

Everything measured is deliberately blind to what a beginner actually does
wrong, because none of it changes how far the pen travelled: curved "straight"
strokes, imperfect proportions, small positional error, slight overshoot,
strokes drawn short or long. Hand tremor is filtered before measurement — the
path is resampled to an even 0.006 of the box and smoothed over 0.016, a window
sized so that a box filter annihilates tremor (gain 0.00 at its wavelength) and
barely touches a deliberate scribble (gain 0.76 at the tightest one measured).
Stroke *count* and stroke *order* are not looked at here at all.

### The numbers, and where they came from

Measured over the whole adversarial corpus — six typefaces, forty-five
characters, twelve perturbations, 3,240 honest attempts:

| | `lengthRatio` | `reversalDensity` |
| --- | --- | --- |
| worst honest attempt that the ink comparison accepts | 1.67 | 1.5 |
| cheapest scribble the ink comparison lets through | 1.79 | 0 |
| threshold | **2.5** | **6** |

Both thresholds sit well above the honest maximum rather than halfway between
the populations, and the asymmetry is the point: failing a learner who is
writing correctly is the expensive mistake, and the band just above the honest
maximum is where a genuinely shaky hand lives. What is given up is the mildest
scribble — a wave of half the tolerance band's amplitude, which is a wobbly line
by any fair reading.

### What it now rejects that it used to accept

Besides scribbles, one honest-looking behaviour: **colouring the glyph in**.
Filling the shape by laying a stroke down every row and every column of it —
about sixty-five strokes for a syllable — travels several times the length of
the letter and is failed as excessive path length.

That is the intended answer. Filling a shape is not among the beginner
behaviours §12 asks the product to accept (jitter, curved straight strokes,
imperfect proportions, small positional error, slight overshoot, strokes drawn
short or long), and "excessive path length" is explicitly one §13 asks it to
reject. It is worth naming because the end-to-end suite's own tracing fixture
did exactly this, and the fixture was removed rather than the gate loosened: a
test that needs the gate widened to pass is a test arguing for the scribble hole
to be reopened.

A learner who writes a letter in *more, shorter* strokes than usual is not
affected — four strokes or one, ㅁ is the same distance round.

### One fixture had to be fixed first

The corpus's *very unsteady hand* was independent random displacement per
sample: on a skeleton path sampled one point per pixel, an amplitude of 0.035
meant the pen jumping sideways 2.2× its own forward step, in a new random
direction, every sample. Nothing produces that — a finger has mass, a
touchscreen reports a filtered centroid, and physiological tremor is a wave, not
a fuzz.

It mattered because, measured as a path, that fuzz *is* a scribble: it triples
pen travel and reverses fifty times per letter. The fixture was asserting that
the grader must accept something indistinguishable from the thing it must
reject. It now draws a smooth wander of the same peak displacement, so the ink
comparison is tested exactly as hard as before. Making it physical dropped false
rejection from **1.42% to 0.21%**.

Adding the gate and three new scrawl populations to the corpus moved false
acceptance from **1.17% to 0.78%**, with all three scrawl populations rejected
100% on all six faces.

## Words are not graded at all

There is no whole-word evaluation, and there is no `evaluateWord`. Vocabulary in
this product is never handwritten: a word is met, heard, chosen and recognised.
The module that aggregated per-syllable verdicts into a word verdict was deleted
with the screen that used it — see `docs/ARCHITECTURE.md`, *Vocabulary is never
handwritten*, for the three places that rule is now enforced.

The evaluator therefore grades exactly one character against one reference
glyph, which is the size it was always right for.

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
| `MAX_PATH_LENGTH_RATIO` | `2.5` | pen travel, as a multiple of the letter's own length |
| `MAX_REVERSAL_DENSITY` | `6` | pen reversals per unit of letter length |
| `COMPARISON_RESOLUTION` | `128` | mask edge length |

The tolerance band and the pass bar are deliberately separate knobs: widening
what counts as natural variation and lowering what counts as correct are
different product decisions.
