# Final pre-launch audit — working record

**Started:** 23 August 2026, from commit `e89c4e48`.

This file is a *checkpoint*, not a report. It is written as the work happens so
that a compacted context can be resumed from it. `docs/report.md` is rewritten
from scratch at the end and is the document a reader should trust.

## How to resume

Read this file top to bottom, find the first item that is not `DONE`, and
continue there. The three checkpoint files are:

| File | Holds |
| --- | --- |
| `docs/final-launch-audit.md` | this — the pass's task state and findings |
| `docs/vocabulary-expansion-progress.md` | per-batch vocabulary authoring ledger |
| `docs/i18n-quality-review.md` | per-locale copy review state |

## Task state

| # | Task | State |
| --- | --- | --- |
| 1 | Handwriting Correct/Incorrect panel width | **DONE** |
| 2 | Re-read report / issues / localisation doc, classify every claim | IN PROGRESS |
| 3 | Visual quality audit beyond mechanical failures | IN PROGRESS |
| 4 | Re-render all routes and interactive states | **DONE** — 32 renders, read |
| 5 | Vocabulary expansion toward 10,000, quality-first | TODO |
| 6 | Level Test recalibration after expansion | TODO |
| 7 | Independent Level Test content review | TODO |
| 8 | Vocabulary example re-audit | TODO |
| 9 | Korean product-copy review | TODO |
| 10 | 32 UI locales linguistic re-audit | TODO |
| 11 | Vocabulary-content locale status | TODO |
| 12 | I-03 Hangyul hand-off | TODO |
| 13 | Persistence / data loss | TODO |
| 14 | Lexical relations | TODO |
| 15 | "More about it" content | TODO |
| 16 | Accessibility final pass | TODO |
| 17 | Offline / failure QA | TODO |
| 18 | Performance final pass | TODO |
| 19 | Android / native boundary | TODO |
| 20 | Negative-test the critical gates | TODO |
| 21 | Release gate semantics | TODO |
| 22 | Report consistency | TODO |
| 23 | Final build from final source | TODO |
| 24 | APK/AAB verification | TODO |
| 25 | Rewrite report from scratch | TODO |
| 26 | Final launch verdict | TODO |

## Findings

*(appended as they are found; nothing is deleted)*

### 1. Handwriting verdict panel — DONE

**Reproduced before touching anything.** Rendered `/letters/lesson-vowels-core`
at 390 px, scribbled, pressed Check:

| | Panel | Column | Ratio |
| --- | --- | --- | --- |
| Incorrect | 143 px | 350 px | **41%** |
| Correct | 180 px | 350 px | **51%** |

Two defects, not one. The panel shrank to fit its own words, and because
"Correct." is a shorter word than "Incorrect.", **the two states measured
differently** — the card changed shape according to whether the learner had got
it right.

**Cause.** `FeedbackState` declared no width, and `.after` on the session screen
was a flex column with `align-items: center`, which sizes children to their
content. Nothing was clipped, nothing overlapped, every contrast passed. The
existing audit could not see it because it only ever asked whether something had
gone *outside* its box.

**Fix.** The card takes `width: 100%` and the column stretches; `.retryNote`,
the one child that genuinely wants centring, keeps it with `margin: 0 auto`.
Hierarchy with it: verdict 15 px → 17 px (`--hg-text-title`), icon 22 → 26 px,
gap from the Undo/Clear row 32 px → 28 px so the rhythm above and below the
controls is closer to even.

**Measured after**, both states, six widths and 200% text:

| Width | Panel | Ratio | Same as canvas | CTA |
| --- | --- | --- | --- | --- |
| 320 | 280 px | 1.00 | yes | 246×48 |
| 360 | 320 px | 1.00 | yes | 286×48 |
| 375 | 335 px | 1.00 | yes | 301×48 |
| 390 | 350 px | 1.00 | yes | 316×48 |
| 412 | 372 px | 1.00 | yes | 338×48 |
| 430 | 390 px | 1.00 | yes | 356×48 |
| 390 @200% | 350 px | 1.00 | yes | 316×48 |

Correct and incorrect are identical at every one of them.

**Gated, and negative-tested.** `screens:audit` gains two rules — a `role=status`
panel under 90% of its column, and the two writing states measuring differently
— plus an end-to-end test that walks a rejection and an acceptance and compares
them. Putting the original CSS back produces:

```
narrow panel — 8
  320  writing accepted   Correct.Try a question    — 180px in a 280px column, 64% of it
  390  writing rejected   Incorrect.Try again       — 153px in a 350px column, 44% of it
verdict states differ — 4
  320  the panel is 180px when the letter is accepted and 153px when it is not
```

**What this proves about the previous pass**, and why §2 below re-reads every
claim: "nothing clipped" is not "looks right", and the report said the first.

### 3–4. Rendered audit — 32 routes and states, read rather than counted

Every route plus the transient states a learner actually meets: splash,
placement dialog, handwriting idle / drawn / correct / incorrect, recognition,
a vocabulary question, a level-test question, the level-test result, the reset
dialog, offline, and Home / My Learning in Arabic, Korean, Japanese, Tamil and
Thai. The existing `screens:audit` passed all 143 of its renders throughout;
these are the things it does not measure.

**F1 — "Most likely between 1 and 1."** The level-test result prints a
confidence band from `estimate`'s low and high. On a sitting answered entirely
with *I don't know* both come back 1, so the screen showed a range that is not a
range. Fixed: the line appears only when the two differ, because where the
estimator is certain to a single level the number above has already said it.

**F2 — 383 px of dead space under the result.** Measured at 390×844: the last
control ended at y=397 and the tab bar begins at 780, so 45% of the screen sat
empty beneath a card the learner had spent eight minutes earning. Nothing was
clipped; it looked like a page that had not finished loading. The product's own
empty states already centre themselves in the space they are given, and a result
is the same shape of screen. Fixed by making `.body` grow and centre. The
question screens are unaffected — they are taller than the viewport, so there is
nothing to distribute.

**Checked and *not* a defect** — recorded because measuring beats impression:

* the Words card's gap between "0/10" and *Start* looked wide after §58 removed
  the blurb; measured at 16 px, which is the design token. Left alone.
* the empty states (Wrong words, Saved words, Review) are vertically centred
  with generous space. That is the pattern, not a fault, and it is what F2 was
  fixed *to*.
