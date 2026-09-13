# Web UX and content remediation ledger — v1.0.5

*13 September 2026. Every finding of the web audit, in the format the brief
asks for. Web only; nothing here touched a native project.*

Severity: **P0** release-blocking · **P1** a learner is misled, loses work or
is stopped · **P2** a learner is confused or a gate says more than it measured
· **P3** polish, copy, or a stale figure · **EXTERNAL** cannot be closed from
this repository. Status: **FIXED** with tests · **DOCUMENTED** recorded, not
changed · **EXTERNAL**.

Each entry: Evidence · Route/state · Repro · Root cause · Severity · Learner
impact · Test gap (why a green suite did not see it) · Fix · Acceptance ·
Files · Regression test · Negative test · Rendered verification · Status.

---

## W-001 — *Try again* graded the second letter over the rejected first one — **P1**

**Evidence.** Write ㄱ badly → *Incorrect* → *Try again* → write ㄱ correctly on
the same canvas → *Incorrect*. Screenshot pair in the walk (`walks/letters`).
**Route/state.** `/letters/:id/session`, step `write`, after a rejected
attempt. **Repro.** As above; any letter. **Root cause.** `retry()` reset the
step status but not the canvas: `PracticeCanvasCard` was keyed on
`character-step` only, so the rejected strokes stayed and the evaluator read
old ink plus new. **Impact.** A learner's correct second attempt is called
wrong; the third attempt (after a manual *Clear*) passes, which teaches that
the verdict is arbitrary. **Test gap.** `journey.spec` and `feedback.spec`
clicked *Clear* before the retry, so they never drew on a dirty canvas.
**Fix.** `retry()` bumps an `attempt` counter that is part of the canvas key;
a fresh `PracticeCanvasCard` mounts on every *Try again*. **Acceptance.**
After *Try again* the canvas is empty (*Clear* disabled, "Nothing written
yet."), and a correct attempt passes. **Files.**
`apps/web/src/pages/LetterSessionPage.tsx`; `apps/web/e2e/journey.spec.ts`,
`apps/web/e2e/feedback.spec.ts`. **Regression test.** Both specs now assert
the empty canvas after *Try again* instead of clearing it. **Negative test.**
Keying the canvas without `attempt` fails both specs at the "Nothing written
yet." assertion. **Rendered.** Walk re-run on the production build, EN and KO,
390×844 and 1024×768. **Status: FIXED.**

## W-002 — Four "200 % text" gates measured 100 % text — **P1 (gate)**

**Evidence.** `scripts/screen-audit-qa.mjs` set `document.documentElement.style.fontSize`;
`modals-bounds-qa.mjs`, `accessibility.spec.ts` and `confirm-dialog.spec.ts`
set `text-size-adjust`. The design tokens (`--hg-text-*`) are `px`, so neither
changes any rendered glyph; `text-size-adjust` is additionally a no-op on
desktop Chromium. Measured: text height identical at "100 %" and "200 %" in
the old harness. **Route/state.** Every route the gates render. **Repro.**
Run the old `screens:audit`, compare a 390 and a 390@200 % screenshot.
**Root cause.** The wrong lever for a token-based type scale — the same cause the sixteenth pass found and corrected at nine other sites (report §20Z.8, I-223); these four were not on its list. **Impact.** No
learner impact directly; the report's §5.2 and §15 claims about 200 % text
were unmeasured, and W-010 shipped behind them. **Test gap.** The gate is the
test. **Fix.** `scripts/lib/text-scale.mjs` / `e2e/helpers/textScale.ts`
inject a stylesheet that doubles every `--hg-text-*` token; each gate asserts
the rendered body text is ≥ 1.9× and adds an *escaped* check (any element
beyond the viewport, excluding declared horizontal scroll rows).
**Acceptance.** 143/143 `screens:audit` renders pass on the corrected CSS.
**Files.** `scripts/screen-audit-qa.mjs`, `scripts/modal-bounds-qa.mjs`,
`scripts/lib/text-scale.mjs`, `apps/web/e2e/accessibility.spec.ts`,
`apps/web/e2e/confirm-dialog.spec.ts`, `apps/web/e2e/helpers/textScale.ts`.
**Negative test.** The corrected `screens:audit` against the pre-W-010 CSS
fails on the words grid and the tab labels at 320@200 %. **Rendered.** The
390@200 % screenshots were inspected: text visibly doubled. **Status: FIXED.**

## W-003 — Matching: partly right after *Check* read only *Incorrect* — **P2**

**Evidence.** 4-pair grid, 3 right, *Check* → "Incorrect". **Route/state.**
`/learn` review, match exercise, after *Check*. **Root cause.** The status
line rendered the binary verdict. **Impact.** A learner with three of four
right is told the same as one with none. **Test gap.** Tests asserted the
verdict, not its wording. **Fix.** `learning:review.matchRight` ("{{right}} of
{{total}} pairs right.") in 32 languages when any pair is wrong; positive and
negative status colours from the tokens. **Files.**
`apps/web/src/features/vocabulary/MatchExercise.tsx`, `.module.css`,
`MatchExercise.test.tsx`, `apps/web/src/locales/*/learning.json`. **Regression
test.** `MatchExercise.test.tsx` (15 tests) asserts the count for a partly
right grid and *Correct* for a wholly right one. **Negative test.** Restoring
the binary string fails the count assertion. **Rendered.** EN/KO/DE at 320 and
390. **Status: FIXED.** The crediting rule ("no credit unless all right") is
unchanged and still tested.

## W-004 — Gap-fill blank not announced — **P2**

**Evidence.** `<span aria-label="blank">` — an `aria-label` on a generic
`<span>` is not exposed by assistive technology. **Fix.** Visual blank
`aria-hidden`, plus `<span class="hg-sr-only">` carrying
`learning:review.blank`. **Files.** `apps/web/src/features/review/ChoiceExercise.tsx`.
**Regression.** `accessibility.spec` (axe) plus the DOM read in the walk.
**Status: FIXED.**

## W-005 — Level Test clock showed 8:01 and stale minutes — **P2**

**Evidence.** First tick after start: 8:01 for an 8-minute limit; after a
resume the minute lagged. **Root cause.** `remaining` derived from the
previous `now`; the tick set `now` after computing. **Fix.** `remaining =
sitting === null ? TIME_LIMIT_MS : min(TIME_LIMIT_MS, max(0, deadline − now))`,
`setNow(Date.now())` first. **Files.** `apps/web/src/pages/LevelTestPage.tsx`.
**Rendered.** Clock read 8:00 → 7:59 on the build. **Status: FIXED.**

## W-006 — Numbers verdict copy diverged — **P3**

Numbers used `numbers:feedback.*`; everything else `common:verdict.*`.
Unified; the Numbers strings removed from 32 packs. **Files.**
`apps/web/src/pages/NumberSessionPage.tsx`, `apps/web/src/locales/*/numbers.json`,
`apps/web/e2e/numbers.spec.ts` (asserts the common string). **Status: FIXED.**

## W-007 — 404 page had an empty `<h1>` and no header — **P2**

**Fix.** `AppHeader` with `errors:notFound.title` in 32 languages. **Files.**
`apps/web/src/pages/NotFoundPage.tsx`, `apps/web/src/locales/*/errors.json`.
**Rendered.** `/nowhere` at 320 and 390, EN/KO. **Status: FIXED.**

## W-008 — Hangul-complete card had no in-product next step — **P1**

**Evidence.** With `HANGYUL_URL` unset (the web build), the *earned* variant of
`NextStepCard` rendered nothing actionable after the last letter. **Root
cause.** The card existed only to hand off to a partner URL. **Impact.** The
course's biggest moment ends in silence. **Fix.** In-product card
(`data-testid="next-step-in-product"`) linking to `/words`, with
`learning:nextStep.inProduct.{title,body,cta}` in 32 languages; no URL
invented; the row variant stays null. **Files.**
`apps/web/src/features/learning/NextStepCard.tsx`,
`apps/web/src/locales/*/learning.json`. **Regression.** Journey walk asserts
the card and its link. **Rendered.** EN/KO/CS/MN (the two whose register was
corrected, W-022). **Status: FIXED.**

## W-009 — Language screen footnote stale — **P3**

Shown for every language; now only when a listed language lacks word copy.
**Files.** `apps/web/src/pages/LanguagePage.tsx`. **Status: FIXED.**

## W-010 — Overflows at 200 % text and in long-word locales at 320 px — **P2**

**Evidence.** Words category grid pushed past the viewport; progress-bar label
overflowed its bar; bottom-tab labels wrapped out of the bar; conjugation rows
overflowed; search results cut with an ellipsis; no focus ring on the word
search. Screenshots in the 2× and locale matrices. **Fix.** Grid
`repeat(auto-fit, minmax(min(100%, 9em), 1fr))` with `min-width: 0` items and
`overflow-wrap: anywhere`; bar label `flex: 0 1 auto; min-width: 0`; tab label
`font-size: min(var(--hg-text-micro), 16px)`; conjugation rows wrap; result
meaning two-line clamp; `.searchRow:focus-within` outline. **Files.**
`apps/web/src/pages/WordsPage.module.css`, `apps/web/src/ui/Progress.module.css`,
`apps/web/src/ui/BottomNavigation.module.css`,
`apps/web/src/features/vocabulary/Conjugation.module.css`. **Regression.**
The corrected `screens:audit` (W-002) and `accessibility.spec` escaped check.
**Negative.** Old CSS fails the corrected gate. **Rendered.** 320@200 %,
DE/TA/AR at 320. **Status: FIXED.**

## W-011 — Thirty English card glosses were dictionary definitions — **P2**

See `WEB_CONTENT_REVIEW_v1.0.5.md` §2 for the table. **Files.**
`content/vocabulary/entries/*.jsonl` (`en` overrides), rebuilt packs.
**Regression.** `examples:qa:check` rule 15 (gloss findable in the sentence),
`vocabulary:translation:check`. **Status: FIXED.**

## W-012 — Frequency reader over- and under-credited forms → wrong levels — **P2**

**Evidence.** 잇다 rank 1 (from 있어요), 잘다 83 (from 잘게), 길다 893, 멀다 804.
**Root cause.** Surface-string matching without a form model; shared strings
credited to every owner. **Fix.** `conjugate.frequency_forms()` class model;
two-pass `measure()` with proportional sharing; lemma guard. **Files.**
`scripts/content/conjugate.py`, `scripts/content/frequency.py`,
`content/vocabulary/frequency-fixtures.json`, `content/vocabulary/level-overrides.json`,
`package.json` (`frequency:check` first in `content:fresh:check`),
`docs/VOCABULARY_LEVEL_CALIBRATION.md`. **Regression.** 96/96 fixture forms.
**Negative.** Old reader: 52/84. **Outcome.** 419 words moved; anchors held;
`vocabulary:level:qa`/`audit` pass. **Status: FIXED.** I-126 → RESOLVED.

## W-013 — Beginner gap-fills thin — **P2**

36 → 53 at levels 1–5 via 17 curated items; see content review §4.
**Files.** `content/vocabulary/context-items.json`,
`scripts/content/build_level_test.py` (curated context level/demand from the
item's own sentence), `scripts/content/build_level_test.mjs`,
`scripts/level-test-distractor-qa.mjs` (curated items exempt from the
"reviewed-out" rule, not from the distractor rules). **Regression.**
`leveltest:policy:check`, `leveltest:distractors:check`, `content:leveltest:check`.
**Status: FIXED.**

## W-014 — Curated gap-fill played the card's example clip — **P2**

**Evidence.** Item shows *더운 방에서 ____을 열었어요*, plays the card's *창문*
sentence. **Fix.** Curated cloze entries carry `audioId: ex_<codepoints>`;
`exercises.ts` uses it; `export-speech-plan.mjs` records curated sentences.
**Files.** `scripts/content/build_level_test.mjs`, `scripts/export-speech-plan.mjs`,
`apps/web/src/data/cloze.ts`, `apps/web/src/features/review/exercises.ts`,
`curatedClozeAudio.test.ts`, `answerable.test.ts`. **Regression.** 3 tests:
curated plays its own clip, never the card's; a card-sentence gap-fill still
plays the card's. **Negative.** Reverting `exercises.ts` to `word.audio.example`
fails the first. **Status: FIXED.**

## W-015 — Child-safety evasions the scanner passed — **P1**

Spelled-out jamo, loose final, Latin term in a non-Latin-script field,
borrowed profanity in Latin-script languages. See content review §6.
**Files.** `packages/content-safety/src/normalize.ts` (`composeJamo` before
NFKC, `closeSyllables` after), `src/evaluate.ts` (`latinScript`),
`src/policy.ts`, `policy/child-safe-content-policy.json` (`latinScript`, `*`
lists), `policy/runtime-policy.json` (regenerated), `scripts/build-runtime-policy.mjs`,
`fixtures/negative.json` (+9), `fixtures/positive.json` (+4),
`src/runtime.test.ts` (`lists` filter), `scripts/content/child_safety.py`
(the Python twin, same steps), `docs/CHILD_SAFE_CONTENT_POLICY.md`.
**Regression.** 368/368 in both evaluators; 833 package tests. **Negative.**
Removing both composer halves: 4 fixtures fail; removing one: the fixture
only it covers fails; planting the evasions in `locales/ko/common.json`: 3
findings, exit 1. **Status: FIXED.** Runtime limit documented (audit C-11).

## W-016 — Scanner labelled translated curriculum notes as Korean — **P2 (gate)**

**Evidence.** After W-015, 38 reviews: German/Dutch *die* in notes scanned as
`ko`. **Fix.** `translations.<lang>` strings scanned as `<lang>`. **Files.**
`scripts/content-safety-qa.mjs`. **Outcome.** 0 findings across 1,007,447
fields. **Status: FIXED.**

## W-017 — I-204 not reproducible, untested — **P3**

`numberSessionSeed.test.tsx` (slow durable driver, stored attempts) proves the
seed comes from the stored count. Negative: `useState(() => 0)` fails it.
I-204 → RESOLVED. **Status: FIXED (test added).**

## W-018 — Stale figures in the report — **P3 (doc)**

First load 273.3 kB (measured 311.8 at HEAD, 314.1 now); "3,393 words" (3,370);
§8.1 ten/twenty-two locales (32 complete). Regenerated via `docs:consistency`
and `issues`. **Status: FIXED (documented in the report's v1.0.5 chapter).**

## W-019 — Hydration test measured a thrown error — **P2 (test)**

`wordSessionHydration.test.tsx`'s slow-driver proxy called methods unbound
(`Cannot read properties of undefined (reading 'bucket')`), so the test passed
on the failure path. Bound via `method.apply(target, args)`; still passes, now
for the right reason. **Status: FIXED.**

## W-020 — Web version could not truthfully lead the native version — **P3**

`check-version-consistency.mjs` now carries `WEB_RELEASE_VERSION` beside the
native `RELEASE_VERSION`; web ≥ native is required; the web release notes and
`web_version` front matter are required; the stale-delivery finding becomes a
pending line for the store consoles while web leads. `product.test.ts` pins
1.0.5 and "never behind native". Negative: 1.0.3 → exit 1; 1.0.6 → exit 1;
front matter without `web_version` → exit 1. **Files.**
`scripts/check-version-consistency.mjs`, `apps/web/src/config/product.ts`,
`product.test.ts`, `scripts/build-pdf.mjs`, `scripts/build-report.mjs`,
`docs/report.md` (front matter). **Status: FIXED.** No native version file
touched.

## W-021 — `name:check` fails on `patent/**` — **EXTERNAL**

Nine references to the old product name in an untracked, read-only directory
the brief excludes. Every other file passes. **Status: DOCUMENTED.**

## W-022 — New strings broke register in Czech and Mongolian — **P3**

`locale:editorial:check` errors on `inProduct.body` (cs, familiar in a polite
pack) and `inProduct.title` (mn, polite in a familiar pack). Corrected; gate
0 errors. **Status: FIXED.**

## W-023 — Tab labels broke inside a word at 200 % text; two e2e assertions had never measured doubled text — **P2**

**Evidence.** The first full e2e run after W-002 (the four gates measuring
200 % for real) failed `confirm-dialog.spec` "holds its shape when the text is
doubled" and, in its screenshot, the *My Learning* tab read *My Learnin / g*
at 390 px. Measured across all 32 languages, 5 widths and both scales
(scratch `tabcap.mjs`): with the flat 16 px cap, English *Learning* breaks at
320 and 360 (and at 390 under the mobile project's rendering); 18 languages
break a word at 390. **Route/state.** Every tabbed route, 200 % text.
**Root cause.** The cap on the tab label (`min(token, 16px)`) was chosen when
"200 %" measured normal text; `overflow-wrap: anywhere` then splits the word
because headless Chromium has no hyphenation dictionary. **Impact.** A
learner with large text reads a tab as two fragments. **Test gap.**
`screens:audit` checks for escape and overlap, not for a word split across
lines; the spec asserted the dialog's two answers share a row, which the
dialog's own stylesheet says they must *not* at doubled text. **Fix.**
`font-size: min(var(--hg-text-micro), 16px, 3.6vw)` — never below the normal
11 px, 14 px at 390, 15.5 at 430 — the widest cap at which every English and
Korean label stays whole at every width (measured); `tab-bar.spec` gains a
`brokenWords` check (a word with more than one client rectangle) run at ×1,
×1.5 and ×2 across the five widths; `confirm-dialog.spec` asserts the
documented rule — one row while both labels fit, stacked otherwise, both
inside the dialog and the viewport, 44 px tall. **Files.**
`apps/web/src/ui/BottomNavigation.module.css`, `apps/web/e2e/tab-bar.spec.ts`,
`apps/web/e2e/confirm-dialog.spec.ts`. **Regression.** `tab-bar.spec` (15
scaled cases) and `confirm-dialog.spec` pass on the rebuilt bundle.
**Negative.** With the flat 16 px cap restored, `tab-bar.spec` fails at 320
and 360 ×2 on *Learning*. **Rendered.** 390@200 % `/me` screenshot: *My* over
*Learning*, whole. **Status: FIXED.**

**What stays open — HUMAN REVIEW REQUIRED.** At normal size, twelve languages'
single word for a tab is wider than a fifth of a 320 px screen at 11 px
(fr *apprentissage*, de *Wiederholen*, ru *Повторение*, ta *மீள்பார்வை*,
es *aprendizaje*, pt-BR *aprendizado*, ro *Recapitulare*, el *Επανάληψη*,
hu *Tanulásom*, cs *Opakování*, bn *পুনরালোচনা*, uk *Повторення*); they
hyphenate where the device has a dictionary and break bare where it does
not. That is a translation-length question for a native speaker — a shorter
tab word — not a stylesheet one; shrinking the type below 11 px is the wrong
trade and was not made. Recorded in the content review §5.

## W-024 — The previous pass's large-text fix was inert at eight of its nine sites — **P1 (gate)**

**Evidence.** While measuring W-023, `emulateTextScale(page, 2)` followed by a
load of `/me` at 320 px rendered body text at 15 px and the tab label at
11 px: `textScaleFactor` = 1. The same init-script shape —
`(document.head ?? document.documentElement).appendChild(style)` — is in
`e2e/helpers/textScale.ts` (used by `tab-bar.spec`, `home-header.spec`,
`numbers-prompts.spec`, `safe-area.spec`) and in `check-legal-isolation.mjs`,
`check-reachable-actions.mjs`, `check-section-alignment.mjs` and
`numbers-layout-qa.mjs`. Only `qa-quote-render.mjs` (injects after load) and
`modal-bounds-qa.mjs` / `screen-audit-qa.mjs` (this pass, `DOMContentLoaded`)
were scaling. **Root cause.** An init script runs before the document has an
element; both `head` and `documentElement` are null at that moment, the
`appendChild` throws, and Playwright swallows an init-script throw. The
sixteenth pass replaced the wrong lever (root font size) with the right sheet
injected at the wrong moment, and no site read back what had applied.
**Impact.** Report §20Z.8's "re-run for real: `numbers:layout` 45/45,
`align:sections` 12/12, `legal:isolation` 16/16, `scroll:audit` 210/210, 79
spec cases; the tab-bar targets are 64×64–67 px at 320 px" were measured at
normal text. **Test gap.** The gate is the test; none asserted the scale it
claimed. **Fix.** `scripts/lib/text-scale.mjs` gains `injectTextScale`
(appends at `DOMContentLoaded`, after the token sheet) and
`textScaleFactor` (the applied body token over its base); the four scripts
use both and fail any case whose page is not at the scale the case names;
`e2e/helpers/textScale.ts` does the same and the four specs assert
`textScaleFactor ≈ scale` before measuring. **Files.**
`scripts/lib/text-scale.mjs`, `scripts/check-legal-isolation.mjs`,
`scripts/check-reachable-actions.mjs`, `scripts/check-section-alignment.mjs`,
`scripts/numbers-layout-qa.mjs`, `apps/web/e2e/helpers/textScale.ts`,
`apps/web/e2e/tab-bar.spec.ts`, `apps/web/e2e/home-header.spec.ts`,
`apps/web/e2e/numbers-prompts.spec.ts`, `apps/web/e2e/safe-area.spec.ts`.
**Regression.** The four gates and four specs re-run on the rebuilt bundle at
real scale (evidence §5–6). **Negative.** With the old `appendChild` form
restored in the helper, every scaled case fails at the read-back assertion
before measuring anything. **Rendered.** 320@200 % `/me`: body 30 px, label
11.5 px, *My* over *Learning*. **Status: FIXED.** The report's §20Z.8 figures
are re-stated in §20AA.

## W-025 — The Numbers course list pushed the page 47 px sideways at 200 % text — **P2**

**Evidence.** `numbers:layout:check`, once it measured doubled text (W-024):
"390×844 ×2 de light: the page scrolls 47 px sideways". Measured by element:
`.summaryMeta` ("0 von 20 Lektionen abgeschlossen", `white-space: nowrap`)
405 px in a 326 px column, and each module title's longest word
(*Sinokoreanische*) unable to break inside a 106 px column because the
nowrap lesson count beside it kept the rest of the row. English overflowed
20 px at 320. **Route/state.** `/letters/numbers`, 200 % text, any locale
with a long word. **Root cause.** Two `nowrap`s written for one-line text at
normal size; a flex row that never wrapped. **Impact.** A learner with large
text gets a horizontally scrolling course list. **Test gap.** The gate that
covers exactly this had been measuring normal text (W-024). **Fix.**
`.summaryMeta` wraps (`text-wrap: pretty`); `.moduleHead` wraps so the count
drops to its own line when the title needs the room, `margin-inline-start:
auto` keeps it on the right-hand rail; `.moduleTitle` gets
`overflow-wrap: anywhere` as the last resort. At normal size nothing moves:
the count still shares the title's line. **Files.**
`apps/web/src/pages/NumbersPage.module.css`. **Regression.**
`numbers:layout:check` 45/45 at 100/150/200 % in 32 languages, at real scale.
**Negative.** The gate, now scaling, fails the old stylesheet (this is how
it was found). **Rendered.** 390@200 % `/letters/numbers` in German: summary
on four lines, meta on two, module title on four, nothing sideways.
**Status: FIXED.**

## W-026 — A full-width button widened the page to 355 px at 320 px @ 200 %; `screens:audit` had no 320 @ 200 % profile — **P2**

**Evidence.** `screens:audit` gained a `320-200%` profile (the width where
W-010's overflows lived, which the 390 @ 200 % profile alone had passed —
the corrected gate run against the baseline stylesheet found nothing at 390).
On the current stylesheet the new profile reported five *escaped* elements on
the lesson's unit intro: the header (0–355 in 320), its *1 / 6* counter at
273–347, the progress row, the scroll pane and the footer. Measured by leaf:
`button.fullWidth.lg` "Got it — let's start" at 20–335 with `white-space:
nowrap` — 315 px of label in a 280 px column. **Route/state.** Any screen with
a full-width CTA whose label is longer than the column at doubled text: the
unit intro at 320 px, the Level Test start, the Numbers *Lektion starten*.
**Root cause.** `.button { white-space: nowrap }` applied to a block that is
supposed to be as wide as its column. **Impact.** With large text on a
narrow phone the header counter is cut off and the page pans sideways.
**Test gap.** No profile combined the narrowest width with doubled text.
**Fix.** `.fullWidth { max-width: 100%; white-space: normal; text-wrap:
balance }` — a full-width label takes two lines when it must; inline buttons
keep `nowrap`. `screens:audit` keeps the `320-200%` profile (166 renders,
was 143). **Files.** `apps/web/src/ui/Button.module.css`,
`scripts/screen-audit-qa.mjs`. **Regression.** `screens:audit:check` 166/166.
**Negative.** The extended gate against the baseline CSS: 7 findings at
`320-200%`, exit 1; against the corrected CSS with the button still `nowrap`:
5 escaped elements, exit 1. **Rendered.** 320 @ 200 % unit intro: title on two
lines, *1 / 6* fully inside the edge, CTA on two lines. **Status: FIXED.**

**Also found and fixed on the way (harness).** The audit's *writing accepted*
and *recognition answered* states could not be reached at 320 @ 200 %: the
trace helper drew past the bottom of the viewport, where a pointer draws
nothing, so a faithful glyph was refused. `e2e/helpers/trace.ts` now scrolls
the box into view before drawing, as a learner does; no product change.

---

## R. Regression matrix — previously corrected behaviours, re-verified

| Behaviour | How verified | Result |
| --- | --- | --- |
| Show-answer blue state; reveal earns no credit | `answer-reveal.spec`, `answerReveal.test.tsx`, walk | holds |
| Question shape [4] or [2,2], never [3,1] | `choice-layout.spec` | holds |
| Word-ordering undo and *Check* | `journey.spec`, walk | holds |
| Matching columns, undo, *Check*, no credit unless all right | `MatchExercise.test` (15), walk | holds (+ W-003 wording) |
| Daily selection rotates on the calendar day | `dailyvocab:qa:check`, `dailyplan:fresh:check`, `domain/vocabularyDay.test.ts` | holds |
| Level change immediate; started day preserved | `dailyplan:level:check`, `level-change.spec`, `store/levelAppropriate.test.tsx` | holds |
| Retired words never return | `content:safety:check` retired-items family; `retired-word-ids.json` | holds |
| Numbers completion from evidence in its own store | `numbers.spec`, `numbers-journeys.spec`, `domain/numbersProgress.test.ts`, `numberSessionSeed.test` | holds |
| Audio alternative on every heard-only question | `numbers:qa:check` §11, `domain/soundFree.test.ts`, walk | holds |
| Back navigation | `back:coverage:check`, `back-policy.spec` | holds |
| Legal pages scrollable | `legal:isolation:check`, `scroll:audit:check` | holds |
| Bottom nav fixed | `screens:audit`, `tab-bar.spec`, walk at 320×568 | holds |
| Handwriting: compound vowels one block | `strokes:*`, `glyph:structure:check`, walk ㅘ ㅝ ㅢ | holds |
| Progress readable | `status:qa:check`, `Progress.module.css` (W-010) | holds |
