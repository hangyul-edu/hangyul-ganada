# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `bbe6302d` on branch `main`. `build-info.json` →
`source_state` reads `"dirty": false`: no product file differed from that commit
when the artefacts were built. It could not have read `false` before this
refresh, and that was a defect rather than a fact about the tree —
`sourceState()` runs after the artefacts have been copied into `result/`, so it
was hashing its own output and every build from every tree reported a dirty
source. It filters to product files now, with the same list `release:current`
keeps.

**Built:** 4 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes the versionCode 11 validation.** Codes 3 through 11 are spent,
each by an artefact that was actually produced. This is 12.

---

## Why this release happened

Two screenshots. A `ㅌ` whose third stroke number was cut off flat down its
left-hand side, and the Numbers course list with every lesson title pushed a
thumb's width in from the page.

Both had been shipping and both had a gate watching them, passing. In both cases
the gate was measuring the quantity the code computes rather than the one a
reader sees.

A numbered badge is a `<circle r="5.6">` with `stroke-width: 0.9`, and an SVG
ring straddles the circumference — so the disc paints to 6.05 while every bound
in the placement was written against 5.6. Twenty-one badges over twenty
characters sat at exactly that clamp; the `.paper` element also carried a
`border-radius` it clipped at, whose size in viewBox units nothing in the layout
could name. `strokes:qa` asked whether two badges overlapped, the unit test
asked whether `label.x >= radius`, and `strokes:visual` asked whether a badge
stood on the ink. All three passed.

Every Numbers lesson row began with a 20 px `<span>` holding a tick when the
lesson was finished and nothing at all otherwise — which is most of the course,
most of the time — plus the row's 12 px gap. Module headings started 20 px from
the edge of the phone, the summary card at 32, and lesson titles at 49. A
three-word lesson title wrapped onto three lines beside a quarter-row of
nothing.

Reading the Numbers course end to end after that found a third thing neither
screenshot could show: **a learner who cannot hear could not finish a single
lesson.** A listening question's whole stimulus is a clip, all nineteen lessons
list that kind, a mastery check asks every item, and passing one is what
completes a lesson.

## What changed

| | |
| --- | --- |
| Badge geometry | `MARKER_RING` and `paintedRadius`; `ontoPaper` bounds a badge to the sheet including its rounded corners, and the layout, the unit test and the gate all call it. The paper is a `<rect rx>` inside the SVG, so the element clips nothing. No per-glyph override; the gate asserts there are none |
| Numbers list | One `--numbers-rail` for the module number, the module goal, the summary and every lesson title, with chevrons and lesson counts on one rule at the other end. No leading icon column; the tick lives in the **Completed** pill. `flex: 1 1 9rem` on the title, so the badge wraps below it rather than squeezing it |
| Accessibility | Two routes past a question whose whole stimulus is a clip. `practiceExercises`, `masteryExercises` and `exerciseCoverage` take a `soundFree` option, and `NumberSessionPage` reads `settings.sound_free` and the player's own availability once per run — every lesson still asks every item without a heard-only question. And, because that setting is unreachable in the interface, a per-question **Can't use audio?** that swaps the clip for an equivalent visual question with the same options and the same answer, on 349 of the 352 listening questions the engine can build |
| Numbers content | 224 translated strings that no screen could draw, removed; 금요일 re-glossed (it was *the fifth day of the week*, which is the sixth on a Korean calendar); one prompt stopped writing 을(를) longhand; nine straight apostrophes in four languages |
| Progress | `lessonStatus` asks the evidence before the visit, and the completion tick follows the rule its own comment states rather than `isDone` |
| Release paperwork | `build-info.json`'s dirty flag stopped counting the delivery it had just written; the report's version, version code, issue count and Numbers key count are derived figures now |
| Version | Android 1.0.3 / **12**. iOS deliberately left at 1.0.2 / 4 — see `BUILD_OR_SIGNING_BLOCKERS.md` §9 |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint every previous release carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, version code **12**, versionName **1.0.3**, SDK 24–36 — read back with `aapt2 dump badging` on the delivered file |
| Why 12 | 11 is spent. Both previously delivered artefacts report a code of 11 under `aapt2 dump badging` and `bundletool dump manifest`, the previous `build-info.json` recorded 11, and product files have changed since the commit that produced them — so a rebuild at 11 would put different bytes under a code Play has already been shown a set of bytes for, which it refuses. `npm run version:check` said so before the build rather than after. Nothing has been uploaded to Play, so 12 is the next valid code rather than the next unused one. |
| iOS | **not built** — macOS and Xcode are unavailable here. The project is complete and ships in `result/ios-project/`, at version 1.0.2 build 4, which is what `build-info.json` reports for it; `pending_version` and `pending_build` name what is owed. |

## What was run against this tree

| Suite / gate | Result |
| --- | --- |
| `npm run verify:release` | green from end to end on the delivered tree, including `verify:quick` |
| `npm run strokes:markers:check` | 73 characters, **269 badges**, 0 problems — clipping against the straight sides and the sheet's rounded corners, ink overlap, ring-to-ring collision, leader integrity, badge order against the animation, legibility at 152 px, and the stylesheet read back so a clip cannot grow again |
| `npm run numbers:layout:check` | **45 cases, 3,465 elements**, 0 problems — seven sizes including landscape, 100/150/200% text, light and dark, and all 32 languages at 320 px, with four lessons seeded to real evidence. It measures ink, not boxes |
| `npm run numbers:qa:check` | 6 modules · 19 lessons · 95 items · 9 exercise kinds · **0 problems**; 144 clips present, 0 synthesised; 270 keys × 32 languages, 0 identical to English; **284 distinct questions audited across 10 question types, 972 built**; 19 lessons complete sound-free; 349 listening questions answerable without the clip |
| `bash scripts/regression-gates-negative.sh` | **5 of 5 defects restored and caught** — the icon column (2,565 findings), a badge bounded by its fill (24), a blank two words fit (12), 둘 개 (6), an unearned `completed_at` (19) — then restored and green |
| `bash scripts/numbers-qa-negative.sh` | **10 of 10** restored and caught, then restored and green |
| `npm run copy:ledger:check` | 839 Korean strings, every one read at its current wording; 3 rewritten this pass with the reason recorded |
| `npm run locale:editorial:check` | 0 errors, **70 warnings** — all split-translation judgements for a native reader. The nine straight-apostrophe findings this pass fixed are gone |
| `npm run test:e2e` | see the run recorded below |
| Unit suites | web **1035**, Korean morphology **216**, handwriting core **96** — **1,347**, all passing |
| `npm run native:bundle:check` | 14,152 files in `apps/web/dist`, 14,152 compared inside the APK, **0 missing and 0 different** — the app inside the package is the app that was built |
| `npm run release:current` | both delivery manifests at HEAD; the working tree dirty only in `docs/` and the release directories |

Fifteen gates have been negative-tested by restoring the behaviour they exist to
catch: the ten in `scripts/numbers-qa-negative.sh` and the five in
`scripts/regression-gates-negative.sh`.

## On a device — NOT RUN THIS REFRESH

The signed APK was not installed on an emulator or a handset in this refresh,
and no physical device exists on this machine. Everything above ran in headless
Chromium at phone viewports. **Nothing here is evidence about a real phone.**
The matrix that would close it: a 320 px-class Android at 100% and 200% text, a
412 px Android, an iPhone SE and an iPhone Pro Max, each in light and dark,
walking the alphabet lesson, a vocabulary sitting, the Numbers course and the
Level Test.

## Not claimed

* **No native-speaker review** of the thirty-one non-Korean bundles, or of
  Korean. Three Korean strings were rewritten this pass and one was added, and
  the ledger records that the reading was done by the model that wrote them. See
  `BUILD_OR_SIGNING_BLOCKERS.md` §10.
* **No review by anybody who needs the accessibility route.** The sound-free
  run and the per-question escape exist, are gated, and were walked in a
  browser. Whether they are the route a deaf or hard-of-hearing learner would
  choose is not something this repository can establish about itself.
* **No iOS build.** No `.ipa` exists and none was approximated.
* **iOS is not at 1.0.3.** Its version is set in Xcode, on a Mac, by the person
  who archives the build; §9 of the blockers document says exactly how.
* **The badge and layout work was reviewed as a render, not on a launcher or a
  handset.** The before-and-after figures in §20Q of the report are headless
  Chromium at the sizes the product draws.

## Checksums

```
f87c6834ef68ff11b7a674d4468eb328defcab1bb1892b2ad6441fe83f0851ba  hangyul-ganada-release.apk
f01a0a27914a79a3a5f1801018b2273f38cda21c0b582a806cd24649e009f074  hangyul-ganada-release.aab
e9e2b228a90ad9f9a4b68ab1e7f40aab0b5c9b9240c7fb858ecebff1fbafab54  docs/report.pdf
1884647c004794411ab11a1f10e26cd1f099fc21ad1b8b71d8ff9403108289ee  build-info.json
```
