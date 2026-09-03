# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `07a4535a` on branch `main`, **with a clean working tree at
the moment the packages were compiled**. This is the line that was wrong last
time and is the reason `I-01` was reopened: the previous artefacts recorded
`"dirty": true` beside their commit, with 440 changed and 595 untracked files,
so no commit described what was inside them. `npm run release:current` is green
on this refresh and was not weakened — it reports both delivery manifests as
**at HEAD**, with the working tree dirty only in `docs/` and the release
directories, which are what a release writes.

The `source_state` block in `build-info.json` is recorded by the script that
also writes `result/`, so it necessarily observes its own output; the files
it counts are the delivery files themselves. What matters — that no
*product* file differs from the commit — is what `release:current` checks and
reports, and it is green.

Rebuilt twice on this refresh. The first attempt reported `BUILD SUCCESSFUL`
having run nothing: `./gradlew` had no execute bit in the checkout, the wrapper
never started, and the outputs already sitting in `app/build/outputs` were the
previous build's. The mode bit is committed and the build was run again from the
clean tree — which is the same class of defect as `I-01`, a build that appears to
have happened and delivers something older, caught this time by the artefact
timestamps rather than by a customer.

**Built:** 3 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, Node v24.19.0.

**This supersedes the earlier v1.0.2 validations.** The first carried versionCode
3 and was built from an uncommitted tree; the second carried versionCode 4 and
predates the backup and restore feature. Both are superseded by versionCode 5,
built from a committed tree.

---

## Why this rebuild happened

Six screenshots of the running product, with the instruction not to treat the
previous report's *resolved* labels as proof. Five showed real defects that
every gate in the repository had passed:

- a numbered stroke badge sitting on the branch of the ㅏ in 안, hiding **62%**
  of the stroke it was pointing at;
- seventeen of the eighteen Numbers lessons locked, and the course written in
  grammatical terminology — 한자어 수, 단위 명사, 두 체계 — that a beginner has
  not met;
- seven screens with no visible back control;
- five answer tiles laid out as four and one;
- a first hint that named the word's category and part of speech, which over a
  distractor set chosen to share that category rules nothing out.

The sixth — the Pronunciation voice setting rendered under the Privacy screen —
could not be reproduced in the current build, in the delivered APK's own bundle,
at six device profiles, or along four different routes to the page. Two guards
were added rather than a fix claimed. §20L of `docs/report.pdf` is the account
of all six.

The same pass audited all thirty vocabulary levels rather than the top, found
the absolute beginner had the narrowest teaching band in the product, and
generated every question the app can produce — 806,270 of them — to check that
each has exactly one defensible answer.

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` |
| Certificate | `157a2bb133f6aa3d…3323debc` — the existing production identity; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, **versionCode 9**, versionName 1.0.2, SDK 24–36 — read back with `aapt2 dump badging` |
| Why 9 | versionCodes 4 through 8 are spent, each by an artefact that was actually produced. 9 is this one: 8 was built before the corpus-loading guard that stopped a level-30 plan announcing itself finished on a cold load. Google Play refuses a reused code whatever the version name says; `version:check` used to allow the reuse within one marketing version, and now refuses it whenever a product file has changed since the delivered build |
| iOS | **not built** — macOS and Xcode are unavailable here; source is complete (version 1.0.2, build 9, 32 `.lproj`, `CFBundleLocalizations`). The remaining step is `xcodebuild -project apps/mobile/ios/App/App.xcodeproj -scheme App -configuration Release archive` (the project resolves Capacitor through Swift Package Manager; there is no workspace) with the distribution certificate |

## What was run against this tree, after the last product edit

| Suite / gate | Result |
| --- | --- |
| `npm run verify:release` | **every step green.** The chain caught three generated artefacts that had gone stale under the corpus change — the level-test bank, `curriculum.json` and `relations.json` — and one end-to-end fixture I had written against an assumption rather than the code; each was fixed and the chain re-run from the top. `vocabulary:qa:target` reports the corpus deficit as **INFORMATIONAL** and exits 0, and `release:current` is green with both delivery manifests at HEAD |
| Web unit (`vitest`) | **1018 passed** (64 files) |
| Korean morphology | **216 passed** |
| Handwriting core | **96 passed** |
| End-to-end (`playwright`) | **446 passed**, 223 × 2 projects — including 8 Numbers course cases, 10 beginner Numbers journeys, 25 rendered Home-header cases and the two backup cases that run over the real IndexedDB driver and the browser’s own download. Run twice end to end: 367 of 368 the first time and 368 of 368 the second, with the same code. The one failure was a flake — the review hub’s save test, which passes alone and in order — and it is hardened rather than re-run away: it now waits for the write to reach IndexedDB before a cold load, because the stores are written optimistically and a navigation inside that window aborts the transaction |
| `npm run answerability:check` | **806,270 generated questions** across 32 languages, 6 exercise modes and 3 attempts, plus 73 characters and 19 Numbers lessons — 0 findings |
| `npm run strokes:visual:check` | 73 items · 269 strokes · 1,345 frames; the new **Obscured** check finds no glyph ink under any badge at 200, 152 or 96 px |
| `npm run handwriting:robustness` | FRR **0.94%**, FAR **0.00%** over 2,880 genuine and 2,172 wrong attempts |
| `npm run back:coverage:check` | 22 shipped routes, one back control each, in the corner, 44 × 44, named in all 32 languages |
| `npm run legal:isolation:check` | Privacy and Licences × 6 device profiles + the walk from My Learning — 16 renders, nothing leaked |
| `npm run numbers:copy:check` | 7,200 learner-facing strings across 32 languages; no lesson names the two number sets by a linguistic label |
| `npm run vocabulary:level:audit -- --check` | all 30 levels: every zone at or above a fortnight, every entry with an example, an English meaning and a recording |
| `npm run numbers:qa:check` | 6 modules · 19 lessons · 97 items · 9 kinds · 0 problems; 148 clips present, 0 synthesised; 270 × 32 keys, 0 identical to English |
| `npm run hints:qa:check` | 442,694 rendered rungs in 32 languages — 0 answer-leaking, 0 that rule nothing out |
| `npm run audio:qa` | 13,728 voice slots over 13,608 files, **0 errors, 0 warnings** |
| `npm run i18n:check`, `copy:audit:check`, `locale:editorial:check` | pass — **0 errors, 0 warnings** on the copy audit |
| `npm run locale:content:check` | 20 languages complete at 3,333 words, 12 at the 609-word band; levels 1–3 complete in all 32 |
| `npm run leveltest:locale:check` | 32 languages; no answer option in any language resolved from another |
| `npm run docs:consistency:check`, `issues:check` | pass — 127 issues: 6 open, 3 partial, 1 blocked, 117 resolved |
| `npm run vocabulary:qa:target` | **INFORMATIONAL** — 3,333 headwords, 6,667 short of the 10,000 target (I-04) |

Thirteen gates were negative-tested by restoring the behaviour they exist to
catch, and all thirteen failed as they should.

Added this round, one per screenshot finding: `back:coverage` and the Home
header spec, with the chevron put back beside the logo; `scroll:audit`, with the
Numbers page's two CSS rules reverted — it failed in four of seven sizes, naming
the button and the pixel it ends at; `numbers:qa`, with 만 단위 restored as an
item; `numbers:copy`, with the *두 벌 · 중국에서* sentence restored; and
`copy:ledger`, with an unread edit to the home screen. The backup's key/value
pairing was negative-tested by zipping the two IndexedDB reads in reverse.

From the earlier rounds: the marker placement, the legal isolation,
the Numbers copy register, the assembly-tray guard, a self-answering gloss, the
reused versionCode, and the six-of-eight store list behind
*Clear everything you have learned*, whose test names the store still holding
rows when the old implementation is put back.

## On a device — NOT RUN THIS REFRESH

The signed APK was not installed on an emulator or a handset in this refresh,
and no physical device exists on this machine. Everything above ran in headless
Chromium at phone viewports, or against the installed APK's own extracted
bundle. **Nothing here is evidence about a real phone.** The matrix that would
close it: a 320 px-class Android at 100% and 200% text, a 412 px Android, an
iPhone SE and an iPhone Pro Max, each in light and dark, walking the alphabet
lesson, a vocabulary sitting, the Numbers course and the Level Test.

## Checksums

```
b13c7f46ec500222eae2b391f44dabaddb64aeecc2e7b61fc9a4ceb093ad0dc3  hangyul-ganada-release.apk
5643ab61ea8e503f515b485a94f787ffa100eacdc62a81e56feeb4b426c75583  hangyul-ganada-release.aab
fd9860e85477e4fa9621caf2f512c4ccebc88f0089b89dd4f3a8e39b225cbced  docs/report.pdf
7055ded864890385a7736653993757ed8402aedf1d9409df8f3cd7f1c3744801  build-info.json
```
