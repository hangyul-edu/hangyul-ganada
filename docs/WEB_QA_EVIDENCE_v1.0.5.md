# Web QA evidence — v1.0.5

*13 September 2026. Every check that was run for the web release, its exit
code and its count, and every check that was deliberately not run. Nothing
below built, synchronised or packaged a native project.*

Labels: **WEB TESTED** run on this tree, result quoted · **WEB UNTESTED**
exists and was not run, with the reason · **ANDROID NOT BUILT** / **IOS NOT
BUILT** native steps, out of scope · **HUMAN REVIEW REQUIRED** · **EXTERNAL
BLOCKER**.

## 1. Environment

| | |
| --- | --- |
| Tree | `bdd2d552` + this pass's changes; `git status --short` shows no file under `apps/mobile/android/**`, `apps/mobile/ios/**`, Gradle, Xcode, CocoaPods or `result/*` (§7) |
| Node | v24.19.0 |
| Build | `npm run build --workspace @hangyul-ganada/web` — exit 0, `✓ built in 7.24s` |
| Served for the render gates | `vite preview --port 4477 --host 127.0.0.1` from `apps/web` (started by `scripts/lib/preview.mjs`, stopped at the end); the learner walks used port 4173 |
| Memory | 6 GB VM; one heavy pipeline at a time (Playwright, Chromium, Vite build, PDF) |

## 2. Static and unit — WEB TESTED

| Check | Result |
| --- | --- |
| `npm run typecheck` (all workspaces) | exit 0 |
| `npm run lint` (all workspaces, `--max-warnings 0`) | exit 0 |
| `npm test` — `packages/content-safety` | 4 files, **833 passed** |
| `npm test` — `packages/korean-morphology` | 5 files, **96 passed** |
| `npm test` — `packages/handwriting-core` | 4 files, **237 passed** |
| `npm test` — `apps/web` | 84 files, **1,523 passed** (final tree; `NextStepCard.test.tsx` included) |
| `python3 scripts/content/child_safety.py --self-test` | **368/368** fixtures agree with the TypeScript evaluator |
| `python3 scripts/content/frequency.py --self-test` (`frequency:check`) | **96/96** |

## 3. Content, copy and policy gates — WEB TESTED

Run individually, in the order `verify:quick` lists them, without `build`,
`test`, `lint`, `typecheck` (above) and without the native checks
(`mobile:identity:check`, `ios:project:check`, `splash:check`,
`locales:native:check` — §6).

| Gate | Exit |
| --- | --- |
| `name:check` | **1** — nine references to the old product name in `patent/**`, an untracked directory outside this brief; every other file passes (audit C-20) |
| `route:policy:check` | 0 |
| `version:check` | 0 — web 1.0.5 leads native 1.0.4; the stale-delivery line is printed as *pending, for a person with the store consoles* |
| `content:fresh:check` (frequency, vocabulary, corpus, level test, dictionary) | 0 |
| `policy:runtime:check` | 0 — `runtime-policy.json` 22 kB, policy 1.0.0 |
| `content:safety:check` | 0 — 14 families, 32 locales, 392,881 items, **1,007,447 fields, 0 findings** |
| `i18n:check` · `locale:content:check` (32 complete · 0 partial) · `locale:ledger:check` | 0 · 0 · 0 |
| `copy:audit:check` (28,673 strings) · `copy:ledger:check` · `copy:remediation:check` · `copy:generated:check` · `copy:fresh:check` | 0 each |
| `locale:editorial:check` | 0 errors, 13 warnings (split translations of one shared imperative; content review §5) |
| `letters:copy:check` · `strokes:qa:check` · `strokes:corners:check` · `strokes:visual:check` · `strokes:markers:check` · `glyphshape:qa:check` · `glyph:structure:check` · `letters:face:check` · `hints:qa:check` | 0 each |
| `conjugation:qa:check` · `conjugation:display:qa:check` | 0 · 0 |
| `leveltest:qa:check` · `leveltest:bank:check` · `leveltest:ambiguity:check` · `leveltest:distractors:check` · `leveltest:policy:check` · `leveltest:simulations:check` · `leveltest:content:check` · `leveltest:locale:check` | 0 each |
| `content:audit:check` · `questions:ledger:check` · `ambiguity:ledger:check` | 0 each |
| `dailyvocab:qa:check` · `dailyplan:fresh:check` · `dailyplan:level:check` | 0 each |
| `numbers:qa:check` · `numbers:domain:check` · `numbers:copy:check` · `numbers:ledger:check` | 0 each |
| `quotes:qa:check` · `quotes:audit:check` | 0 · 0 |
| `strokes:fixtures:check` · `vocabulary:qa:check` · `romanization:qa:check` · `vocabulary:relations:qa` · `vocabulary:sense:qa:check` · `vocabulary:translation:check` · `translation:semantics:check` · `tokens:check` | 0 each |

## 4. Release-only gates that are web-safe — WEB TESTED

| Gate | Exit |
| --- | --- |
| `korean:education:check` · `examples:qa:check` · `worddetail:qa:check` · `content:coverage:check` · `answerability:check` | 0 each |
| `dictionary:qa:check` · `dictionary:coverage:check` · `dictionary:morphology:check` · `content:qa:check` | 0 each |
| `vocabulary:level:audit:check` · `vocabulary:level:qa:check` · `vocabulary:recommendation:qa:check` · `locale:practice:check` | 0 each |
| `strokes:measure:check` · `jamo:measure:check` · `jamo:centering:check` · `fonts:audit` | 0 each |
| `content:safety:bundle:check` | 0 — the web `dist/` scan; the `--apk`/`--aab` forms read native packages and were not run |
| `content:vocabulary:check` · `content:dictionary:check` · `content:corpus:check` · `content:leveltest:check` · `curriculum:check` · `vocabulary:relations:check` · `vocabulary:qa:target` | 0 each |
| `issues:check` | 0 after `npm run issues` |
| `docs:consistency:check` | **1, expected while the web leads the native delivery**: `result/RELEASE_VALIDATION.md:76` records 811 content-safety tests, the number at the 1.0.4 delivery; the source now has 833. That file is the delivery's validation record and is regenerated only by a native delivery (`build-result`), which this pass does not make; it was deliberately left as the record of what was validated then rather than edited to a number no delivery measured. Every other figure in the six documents (81 checked) agrees with its source, and `docs/report.md` no longer differs from the committed tree |
| `bundle:budget:check` | 0 — first load **314.1 / 460 kB**, corpus first paint 55.7 / 64, largest route chunk 20.2 / 24 (`locale-el`), precache 1,151.5 / 1,600; *every budget met*, none raised |
| `routing:check` · `share:check` | 0 · 0 |
| `audio:qa` (600 decoded, 13,974 slots checked) | 0 errors, 0 warnings |
| `audio:pronunciation:check` | 0 errors on the rebuilt `dist/sw.js` (audio build `20260913-cda6c683`) |

## 4a. Web vitals on the production build — WEB TESTED

Playwright over the production build on 127.0.0.1:4173, 390×844 mobile
emulation, `PerformanceObserver` for LCP and CLS, navigation timing for the
rest; the first route of each run is a cold cache, the later ones are served
by the installed service worker (8 kB transferred). The throttled run applies
Lighthouse's mobile profile (4× CPU, 1.6 Mbps, 150 ms RTT).

| Route | Unthrottled LCP | Throttled LCP | CLS | Tap → next paint |
| --- | --- | --- | --- | --- |
| `/` (cold, 1,032 kB installed incl. precache) | 400 ms | **2,916 ms** | 0.000 | 19–28 ms |
| `/letters` | 552 ms | 1,164 ms | 0.000 | 22–50 ms |
| `/words` | 488 ms | 628 ms | 0.000 | 15–25 ms |
| `/review` | 404 ms | 628 ms | 0.000 | 8–10 ms |
| `/me` | 524 ms | 688 ms | 0.000 | 22–31 ms |
| `/letters/lesson-vowels-core` | 460 ms | 880 ms | 0.000 | — |

Reading: no layout shift anywhere; every warm route paints under 1.2 s on a
throttled phone; the cold first paint of Home on a slow connection is 2.9 s
(Lighthouse calls 2.5–4 s "needs improvement"), which is the 314 kB first
load plus the service-worker install — inside every budget, and no budget
was raised. The `willReadFrequently` Canvas2D advisory is the only console
warning on any route.

## 5. Render gates against the production build — WEB TESTED

Each gate starts `vite preview` on 4477 from `apps/web/dist` (the build in §1) and stops it.

| Gate | Exit | What it measured |
| --- | --- | --- |
| `screens:audit:check` | 0 | 17 routes + 6 states × 8 profiles (320, 360, 390, 412, 430, 390 dark, **390 and 320 at 200 % text — tokens scaled, text asserted ≥ 1.9×**) = 166 renders; nothing clipped, overlapping, unreadable, or pushed past the viewport |
| `modals:qa:check` | 0 | 30 dialog states across 6 widths (five of them at 200 % text) in their longest language; every action inside its modal |
| `status:qa:check` | 0 | the two Home chips: same height, centre and touch target across streak/level/width/language |
| `face:size:check` | 0 | every practice face reads at the same size |
| `leveltest:viewport:check` | 0 | no overflow, no clipped option, no control under 44 px, no overlap |
| `numbers:layout:check` | 0 | one rail, no reserved columns, nothing clipped, every lesson reachable (45/45 at 100/150/200 %) |
| `qa:locales:check` | 0 | every locale's screens at 320 and 390 render without clipping |
| `quotes:render:check` | 0 | every card wraps in its box; Korean first everywhere but Korean; Arabic RTL with the Korean pinned |
| `back:coverage:check` | 0 | Home draws no back control; every other route draws one at 44 px with a name |
| `scroll:audit:check` | 0 | every screen's last action reachable, clear of the navigation and the safe area (at 200 %) |
| `align:sections:check` | 0 | headings in a group start on the same rule within a pixel |
| `legal:isolation:check` | 0 | every legal page carries its own content, ends above the navigation |
| `perf:dictionary:check` | 0 | search answers within half a frame at the shipped index size |
| `synthetic:users:qa:check` | 0 | 118 personas through the real domain code — 118 PASS, 0 FAIL (`docs/SYNTHETIC_USER_JOURNEY_QA.md` regenerated) |
| `accessibility.spec.ts` (axe, WCAG A/AA, light + dark, both projects, 200 % text asserted) | see §6 | |

## 6. End-to-end — WEB TESTED

`npx playwright test --project=mobile` then `--project=desktop`, one at a
time, each against a production build served by Playwright's own
`vite preview` on 4173 (31 spec files; `workers: 1`).

| Project | Result | Duration |
| --- | --- | --- |
| mobile (390×844, touch) | **314 passed, 0 failed** | 22.3 min |
| desktop (1440×900) | **314 passed, 0 failed** | 21.8 min |

The first full mobile run on this tree failed 18 cases: 17 Numbers specs
still read the removed `numbers:feedback.*` keys (updated to the shared
`common:verdict.*`), and `confirm-dialog.spec` "holds its shape when the
text is doubled" asserted one row of buttons where the dialog's stylesheet
says they stack at doubled text (W-023). Its screenshot showed *My Learnin /
g*, which led to W-023, and measuring that led to W-024 and W-025. Every
spec that changed was re-run (71 passed) and then the two full projects were
run again on the final build — the figures above.

Specs exercising the regression matrix (ledger §R): `answer-reveal`,
`choice-layout`, `journey`, `feedback`, `level-change`, `level-test`,
`numbers`, `numbers-journeys`, `numbers-prompts`, `numbers-teaching`,
`back-policy`, `tab-bar`, `persistence`, `offline`, `backup`,
`privacy-stability`, `writing-first`, `sound-changes`, `locale`,
`locale-quiz`, `hints`, `dictionary`, `dictionary-viewport`, `quotes`,
`review-hub`, `activity`, `safe-area`, `home-header`, `entry`,
`accessibility` (axe WCAG A/AA, light and dark, and text at 200 % asserted
≥ 1.9×), `confirm-dialog`.

## 7. Deliberately not run

| Step | Label | Why |
| --- | --- | --- |
| `verify:release` as a whole | — | contains `store:check`, `mobile:icons:check`, `native:bundle:check`, `splash:bundle:check`, `release:current`, `patent:evidence:check`; the web-safe members were run individually above |
| `mobile:sync`, `cap sync/copy`, `mobile:qa*`, `mobile:identity:check`, `ios:project:check`, `splash:check`, `locales:native:check`, `mobile:icons:check`, `native:bundle:check`, `splash:bundle:check`, `release:current`, `store:check` | **ANDROID NOT BUILT / IOS NOT BUILT** | native projects are read-only in this brief; nothing was synchronised, built or packaged |
| `content:safety:bundle:check --apk/--aab` | ANDROID NOT BUILT | reads the delivered packages; the web `dist/` form was run |
| `patent:evidence:check` | — | `patent/**` is read-only and excluded |
| Deploy, store submission | EXTERNAL BLOCKER | not part of this pass; `docs/DEPLOYMENT.md` unchanged |
| Native-speaker reading of 31 packs and 30 safety lists | HUMAN REVIEW REQUIRED | content review §5, §6 |
| Real-learner calibration of the Level Test | EXTERNAL BLOCKER | content review §4 |

## 8. Negative tests (Pass 6)

| Gate or test | Defect reintroduced | Result |
| --- | --- | --- |
| `version:check` | `product.ts` 1.0.3 (behind native) | exit 1 — "the web may lead the native deliveries, never lag them" |
| `version:check` | `product.ts` 1.0.6 (no release notes for it) | exit 1 |
| `version:check` | `web_version` removed from the report front matter | exit 1 |
| `product.test.ts` | `product.ts` at 1.0.3 | 3 of 4 fail, including "never falls behind the delivered native version" |
| `frequency:check` | the old reader | 52/84 (new: 96/96) |
| `numberSessionSeed.test.tsx` | `useState(() => 0)` seed | 1 of 2 fails |
| `MatchExercise.test.tsx` | binary *Incorrect* restored | 1 of 15 fails |
| `curatedClozeAudio.test.ts` | `audioId: word.audio.example` for every gap | 1 of 3 fails |
| `NextStepCard.test.tsx` | earned card renders `null` | 2 of 3 fail |
| Child-safety fixtures | `composeJamo` removed | `sex-final-spelled` still caught by `closeSyllables`; both removed → 4 fixtures fail; `closeSyllables` alone removed → `sex-final-spelled` fails |
| `content:safety:check` | ㅅㅔㄱㅅㅡ, `porn`, `casino` planted in `locales/ko/common.json` | 3 findings, exit 1; file restored byte-for-byte (`git status` clean for it) |
| `screens:audit:check` (corrected, 7 profiles) | pre-W-010 CSS | **passed** — the overflows were at 320 px and the gate's 200 % profile was 390 only; so a `320-200%` profile was added |
| `screens:audit:check` (8 profiles) | pre-W-010 CSS | exit 1 — 7 findings at `320-200%` (5 escaped, 2 states unreachable) |
| `screens:audit:check` (8 profiles) | W-010 CSS, button still `nowrap` | exit 1 — 5 escaped on the unit intro (W-026) |
| `emulateTextScale` (old `head ?? documentElement` form) | restored in the helper | `tab-bar.spec -g "text ×2"`: 7 of 7 fail at "the page renders at the scale the case names" before measuring anything |
| `numbers:layout:check` (scaling for real) | pre-W-025 stylesheet | exit 1 — "390×844 ×2 de light: the page scrolls 47 px sideways" (this is how W-025 was found) |
| `tab-bar.spec` (with `brokenWords`) | flat 16 px cap restored | did **not** fail — because the helper was not scaling (W-024). That non-failure is what exposed W-024; with the helper fixed, the flat cap is the measured state in W-023's table (English *Learning* breaks at 320 and 360 ×2) |
| `journey.spec` / `feedback.spec` | `retry()` no longer bumps `attempt` (the canvas keeps the rejected ink) | 2 of 71 fail — both at `expect(Clear).toBeDisabled()` after *Try again*; the other 69 (tab-bar included) pass |

## 9. Git integrity

`git status --short` and `git diff --name-only` were run after every phase.
No path under `apps/mobile/android/`, `apps/mobile/ios/`, no Gradle, Xcode or
CocoaPods file, nothing under `result/` or `patent/` appears in either. Staging
was by explicit path; no `git add -A`, no reset, no force.
