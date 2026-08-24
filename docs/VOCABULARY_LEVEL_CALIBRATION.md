# Vocabulary level calibration

How a taught word gets a number between 1 and 30, why the number is that one,
and what was measured to believe it.

Generated artefacts: `content/vocabulary/word-signals.json` (the evidence),
`scripts/content/level.py` (the model), `content/vocabulary/level-anchors.json`
and `content/vocabulary/level-overrides.json` (the human corrections),
`docs/level-galleries/` (every level, read one word at a time).

Gates: `npm run vocabulary:level:qa` and `npm run vocabulary:recommendation:qa`,
both in `verify:release`.

---

## 1. What was wrong before

The old level was frequency rank, bucketed. It is worth being precise about how
badly that failed, because the failure was invisible from inside the code and
obvious the moment anything was simulated:

| Symptom | Measurement |
| --- | --- |
| A learner at 15 and a learner at 20 were taught the same words | identical lists, 1,000 draws each |
| A learner at 25 and a learner at 30 were taught the same words | identical lists |
| A learner at 30 saw the same words over and over | 82 distinct words in 1,000 recommendations |
| Most of the scale held nothing | levels 15–29 were empty |

The cause was arithmetic, not judgement. `wordLevel()` bucketed a word's
frequency rank against a 10,635-word scale while the taught corpus holds 2,948
words, so every taught word landed in the bottom half of the range and the top
half was unreachable. The learner had a number beside `Lv.` and the number
changed nothing.

## 2. The model

Four components, each in 0–1 where 1 is hardest, combined with fixed weights:

```
difficulty = 0.34·frequency + 0.26·utility + 0.22·linguistic + 0.18·semantic
```

Frequency leads because it is the strongest single predictor of whether a
learner has already met a word. It leads by a third rather than by a mile
because on its own it puts 것 at level 1, and 것 is a bound noun a beginner
cannot use in a sentence.

### 2.1 The signals

Twenty-three, extracted once into `content/vocabulary/word-signals.json` by
`scripts/content/extract_signals.py` and read from there by the model:

| Component | Signals |
| --- | --- |
| **frequency** | corpus rank; occurrences per million; whether the word was observed at all |
| **utility** | the editorial `usefulness` score 1–5; the semantic template; whether the tag names a concrete part |
| **linguistic** | syllable count; part of speech; spelling difficulty; irregular conjugation; honorific status; derivational shape (`-하다`, `-되다`, `-스럽다`, `-롭다`, …); whether the word is an analysable compound |
| **semantic** | number of dictionary senses; number of distinct part-of-speech entries (homography); usage register (literary, dialectal, archaic, slang); abstractness of the semantic template; Sino-Korean origin *when combined with* abstractness; whether the word is an idiom |

Two of those deserve their own line because they are the ones most often got
wrong:

**Frequency is not difficulty.** 그들 is rank-high because the frequency corpora
are subtitles and subtitles are written Korean. A learner who says 그들이 in
conversation sounds like a caption. It is overridden to 14.

**The corpus has to be read correctly first.** The frequency reader folds a
corpus by stripping an ending off each token, and two of the commonest endings
cannot be stripped. 감사합니다 is 감사하 plus ㅂ니다, where the ㅂ is the final
consonant *inside* 합 — `"감사합니다".endswith("ㅂ니다")` is false and always was.
감사해요 is 감사해 plus 요, and neither 해요 nor 어요 comes off it. One of the
first sentences anybody learns in Korean was contributing nothing to its own
headword, and 감사하다 came out at level 11. `conjugate.written_forms` generates
those finished tokens and they are matched whole, with a guard that skips any
form the fold already credited so nothing is counted twice. The effect:

| word | before | after |
| --- | --- | --- |
| 감사하다 | 11 | 4 |
| 미안하다 | 9 | 4 |
| 죄송하다 | 12 | 7 |
| 마시다 | 6 | 4 |
| 고맙다 | 6 | 4 |
| 축하하다 | 11 | 8 |

**Being longer is a cost; being analysable is a discount.** 손가락 is 손 plus
가락, and a learner who has 손 is most of the way there. The linguistic
component charges for syllable count and then refunds a quarter of the whole
component when the word decomposes into parts the corpus already teaches.

### 2.2 Scoring, not sorting

The 1–30 boundaries are **fixed absolute scores**, not quantiles:

```python
BOUNDARIES = (0.2671, 0.2953, 0.3142, 0.3321, 0.3488, 0.3611, 0.3759, 0.3913,
              0.4036, 0.4145, 0.4294, 0.4432, 0.4556, 0.4662, 0.4774, 0.4895,
              0.5010, 0.5100, 0.5206, 0.5304, 0.5392, 0.5482, 0.5577, 0.5659,
              0.5752, 0.5872, 0.6007, 0.6156, 0.6292)
```

This matters for a reason that only shows up later: with quantiles, adding two
hundred advanced words would push easy words *down* a level each, and every
learner's plan would shift for a change that had nothing to do with them. With
fixed boundaries a word's level is a property of the word.

Level is never array position. `wordLevel(word)` returns `word.level`, written
at build time by `scripts/content/build_vocabulary.py`.

### 2.3 The corrections

**Anchors** — 162 words in five bands, in `level-anchors.json`, each asserting a
range the model must land in. Foundation 1–8 (50 words), early 1–16 (46),
middle 6–26 (24), advanced 22–30 (30), expert 27–30 (12). All 162 hold. An
anchor that stops holding fails `vocabulary:level:qa`; it is not a target the
weights are tuned against one word at a time, it is a claim that the shape of
the scale is still right.

**Overrides** — 6 words in `level-overrides.json`, each with the reason written
out. Two kinds of row: one carries a `level` and moves the word, the other
carries `keep: true` and records that the model was right and the check that
flagged it was reading the wrong evidence. Both are decisions somebody made and
can be argued with, which is the point: a weight nudged until one word moves is
a decision nobody can find afterwards.

## 3. What was tuned, and what it cost

Every change below was made because a word came out wrong, not because a number
looked untidy.

| Change | Found by | Effect |
| --- | --- | --- |
| Part-of-speech spread narrowed from 0.15 to 0.06 for verbs | 놀다 at level 20, 덥다 at 21 | the term was worth ~13 levels; now ~5 |
| `_concreteness` reads the template first, parts only to refine | 놀다 (`act:party\|group`) scored 1.0 abstract because neither part is a concrete noun | inverted the default |
| The category "survival" bonus removed from `utility_cost` | it double-counted the editorial `usefulness` score | removed |
| 26 editorial `usefulness` values corrected in the pack | 말, 일, 때, 뒤, 앞, 후, 전, 곳, 끝, 힘, 불, 꿈, 약, 그냥, 또, 죽다 and others were scored 4–5 | corrected at source |
| Register signals scoped to the first sense only | 저, 앞, 물건, 소리, 그들 were marked literary because *some* sense of the spelling is | 5 false positives removed |

## 4. What the scale looks like now

`npm run vocabulary:level:qa`:

```
  taught words          2,948
  levels populated      30/30
  smallest level        44 words
  largest level         149 words
  anchors held          162
  levels set by hand    6
```

Median difficulty rises strictly from level 1 (0.247) to level 30 (0.648), with
no reversal anywhere. Level 1 holds 44 words and level 30 holds 51; the bulge in
the middle (levels 11–20 hold 114–149 each) is the corpus, not the model — most
of a 2,948-word foundation vocabulary is intermediate.

## 5. Reading the levels rather than the graph

A monotone median proves the scale is a scale. It does not prove level 17 holds
the right words, and the brief is explicit that a green gate is not the answer
to that question.

`docs/level-galleries/` holds one file per level, 30 files, each listing the
words at that level with gloss and example. They were read. What reading them
changed is in §3 above: every row in that table was a word noticed in a gallery,
not a metric that moved.

## 6. The Level Test against the new scale

The adaptive test estimates the same 1–30 quantity, so re-levelling the corpus
required re-checking it. `scripts/content/build_level_test.py` now takes a
taught word's authored level where it has one and falls back to rank only for
dictionary anchors.

Two things changed and one deliberately did not.

**Every locale now reaches the whole scale.** Before re-levelling the bank
topped out at 23 in most languages, so a learner above that could not be placed
above it either.

**The prior was re-centred and widened.** `PRIOR_MEAN` moved from 9 to 15 —
the middle of the scale rather than the middle of the range the old bank could
reach — and `PRIOR_SD` from 8 to 20, which is nearly flat. A prior centred at 9
was pulling advanced learners down: levels 26–30 sat at bias −1.38 and MAE 1.67. They now sit at
−0.58 and 1.09.

**`LOGITS_PER_LEVEL` stayed at 0.3.** Sweeping it against the simulator is
circular: the simulator generates responses from the same logistic model the
estimator inverts, so any value fits itself. The comment in
`apps/web/src/domain/levelTest.ts` says so at the point where somebody would
otherwise try.

Current placement accuracy, 200 simulated sittings per level:

```
  mean absolute error   1.29 levels
  within ±3 levels      95.9%
  within ±5 levels      99.7%

    band            MAE   bias   ±1     ±2     ±3
    levels 1–5     1.15  +0.65    71%    91%    96%
    levels 6–10    1.37  -0.01    61%    84%    95%
    levels 11–20   1.37  -0.03    63%    85%    95%
    levels 21–25   1.40  -0.21    62%    83%    95%
    levels 26–30   1.09  -0.58    72%    93%    98%
```

The residual +0.65 bias at levels 1–5 is the floor: a learner at level 1 cannot
be underestimated, so every error is positive. It is arithmetic, not a defect.
