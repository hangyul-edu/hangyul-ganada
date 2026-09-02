# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `3833da71` on branch `main` **plus the uncommitted v1.0.2
pass** — the working tree was not clean at the moment of the build. The exact
tree is recorded as `source_state.fingerprint` in `build-info.json` (a digest of
the tracked diff and every untracked, non-ignored file), with the counts of
changed and untracked files beside it. `npm run release:current` therefore
**fails, by design, and was not weakened**: a build from an uncommitted tree
cannot be reproduced from any commit. It becomes green when this tree is
committed and the build is re-run against that commit.

**Built:** 2 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools 36.0.0,
Node v24.19.0.

**This supersedes the v1.0.2 validation of earlier in the same pass.** Those
artefacts were built before the Numbers course was rebuilt (below) and have been
replaced.

---

## Why this rebuild happened

A user found that **Numbers lessons showed as completed without having been
studied** — a lesson opened and answered entirely wrong ended on "Lesson
complete" — and that the course was a table of contents rather than a course.
Reproduced on a fresh profile before anything was touched, then rebuilt:

- **Completion is derived from evidence, in one place.** One record per lesson
  in its own store; a lesson is complete only when every explanation step and
  example was viewed, practice finished, a mastery check passed at 80% or
  better, and every item answered right at least once in a mastery check. A
  stored completion the evidence does not support is cleared on read. Migration
  13 snapshots and removes the old contaminated rows and touches no letter or
  word data. Numbers had never shipped (the committed artefacts are v1.0.0).
- **Six modules, nineteen lessons, 97 items**, recorded audio for every word
  and example (96 new clips through the existing pipeline, none synthesised at
  runtime), nine exercise kinds with misconception-class distractors and seeded
  option order, 272 strings in all 32 languages, gated.
- **Level Test feedback**: a live-region "Answer N recorded" for assistive
  technology and a guard that drops a same-position tap within 250 ms, with no
  element disabled. The vocabulary target gate is now explicitly informational.

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24) |
| Certificate | `157a2bb133f6aa3d…3323debc` — the existing production identity; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, versionCode 3, versionName 1.0.2, SDK 24–36 |
| iOS | **not built** — macOS and Xcode are unavailable here; source is complete (version 1.0.2, build 3, 32 `.lproj`, `CFBundleLocalizations`). The remaining step is `xcodebuild -project apps/mobile/ios/App/App.xcodeproj -scheme App -configuration Release archive` (the project resolves Capacitor through Swift Package Manager; there is no workspace) with the distribution certificate |

## What was run against this tree, after the last product edit

| Suite / gate | Result |
| --- | --- |
| `npm run verify:release` | every step passes except the last — `release:current`, red on an uncommitted tree by design; `vocabulary:qa:target` reports the corpus deficit as **INFORMATIONAL** and exits 0 |
| Web unit (`vitest`) | **890 passed** (58 files) — 57 of them new: 27 Numbers journeys and negative tests, 12 migration fixtures, 8 exercise-engine tests, 10 data tests |
| Korean morphology | **216 passed** |
| Handwriting core | **96 passed** |
| End-to-end (`playwright`) | **362 passed**, 181 × 2 projects — including 5 Numbers journeys and the Level Test single-scoring test |
| `npm run numbers:qa:check` | 6 modules · 19 lessons · 97 items · 9 kinds · 0 problems; 148 clips present, 0 synthesised; 272 × 32 keys, 0 identical to English; correct-option index 28/28/22/36 over 114 four-option mastery questions |
| `npm run audio:qa` | 13,738 voice slots over 13,618 files, 600 decoded, **0 errors, 0 warnings** |
| `npm run content:fresh:check`, `leveltest:ambiguity:check` | pass — the `content-cache/` fetch (39,040 pages) is complete |
| `npm run i18n:check`, `copy:audit:check`, `locale:editorial:check` | pass — 0 errors (4 and 45 warnings for a human to read) |
| `npm run locale:content:check` | 20 languages complete at 3,333 words, 12 at the 600-word band |
| `npm run store:check` | listings within limits; word count 3,333 in every listing |
| `npm run docs:consistency:check`, `issues:check` | pass — 115 issues: 5 open, 3 partial, 1 blocked, 106 resolved |
| `npm run vocabulary:qa:target` | **INFORMATIONAL** — 3,333 headwords, 6,667 short of the 10,000 target (I-04) |

## On a device — NOT RUN THIS REFRESH

The signed APK was not installed on the emulator in this refresh, and no
physical device exists on this machine. The earlier v1.0.2 refresh in this pass
installed and walked the signed build on an emulated Pixel 7; the Numbers
course has been verified in the browser (5 Playwright journeys, 42 rendered
screens across ar, th, bn, ja, ko and en) and not on Android. Nothing here is
evidence about a real phone.

## Checksums

```
0bde965597381c12177045a82230cdf8d7884f34221b1be669b44e855344ee7d  hangyul-ganada-release.apk
be9318597d1c40af82b3fc4fe8da6bc636dc16a8de81e2322c4c13bbe8e39f40  hangyul-ganada-release.aab
29c0dc63a0f52af9a90959d0b2caf3c2f07888e6186d702593e89382a3ca9502  docs/report.pdf
1e2db2fa6f5393017455fd48bf2b09934651f07037e3da5ba9ebb893fbee2d28  build-info.json
```
