# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `3e367ee1` on branch `main`. `build-info.json` →
`source_state` reads `"dirty": false`: no product file differed from that commit
when the artefacts were built. `sourceState()` filters to product files, with the
same list `release:current` keeps, so it does not hash the delivery it is in the
middle of writing.

**Built:** 6 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes the versionCode 14 validation.** Codes 3 through 14 are spent,
each by an artefact that was actually produced. This is 15.

---

## Why this release happened

**Twelve languages that taught six hundred words now teach all of them.** The
content packs for kk, ky, mn, nl, pl, ro, sv, ta, te, tr, uk and uz carried
meanings for 609 of the corpus's 3,333 words. A gate written this cycle,
`locale:practice:qa`, drives the real planner and question builder for every
shipping language at levels 1, 5, 10, 15, 20, 25 and 30 over fourteen days, and
measured what that costs a learner past the core band:

```
en   140 intro   57 meaning   14 match   30 build   11 context
tr   140 intro    0 meaning    0 match   86 build   11 context
```

No meaning question and no matching grid, because neither can be built without a
meaning in the learner's language — and the intro card fell back to the English
gloss. Somebody had paid for a Korean course in Turkish and was being taught in
English. 217 findings, all in those twelve languages. 65,376 strings were written
to close it, and the gate now reads 0 and sits in `verify:release`.

**Then the corpus freeze lifted and sixty words went in at the top of the
scale.** `docs/CONTENT_COMPLETION_STATE.md` had held *no new word until 32/32
complete*, because a corpus growing under twelve half-written packs makes the gap
permanent. With the gap closed, sixty entries were authored against the place the
course runs out first: 48 measured into levels 28–30 and 11 more into 27, taking
the top band from 477 to 524 and the corpus to 3,393. That is issue I-79, moved
rather than closed.

**Korean text is now compared as it is read, not as it happens to be encoded.**
Nothing normalised Unicode. Every rule in the morphology package is written
against precomposed syllables, and a macOS or iOS text field hands back 학교를 as
six conjoining jamo, so dictionary search, corpus search, morphological analysis
and answer equivalence all returned *nothing* or *different* for two strings a
reader cannot tell apart.

**And a typed Korean answer can now be graded, with the reason as data.**
`validate()` returns typed fields — the two forms, the two particles, the stem
and its 받침 — never a sentence, because the interface has to say it in thirty-two
languages. The library is tested; no screen reaches it yet, and the disclosure
says which of the two it is.

## What changed

| | |
| --- | --- |
| Content packs | kk, ky, mn, nl, pl, ro, sv, ta, te, tr, uk and uz each went from 609 of 3,333 words to all 3,393. 2,724 meanings and 2,724 example translations per language, with the *More about it* note on the 36 words that carry one |
| Practice parity | `locale:practice:qa` is new: it drives the real planner and question builder for 32 languages × 7 levels × 14 days and fails if any language cannot build a meaning question, a matching grid, or a word whose meaning it holds. 217 findings → 0, and it is in `verify:release` |
| Example-translation collisions | 192 pairs where two Korean sentences arrived at one target sentence in a language whose English pack separates them. All 192 given distinct sentences; none moved to `shared-translations.json` |
| Translation semantics | 43 polarity and question findings. Forty rewritten, one a real defect — 어쩌다 이렇게 됐어요? had become a Turkish statement. Three were the gate's: Kyrgyz harmonises its negative suffix across four vowels and the marker list enumerated two, so the marker class was completed rather than the Kyrgyz bent |
| Corpus | +60 words, 3,333 → **3,393**. 48 measure into levels 28–30 and 11 into 27; the top band goes 477 → 524. 240 new recordings in two voices |
| Unicode | `normalise` composes to NFC first, and the composition sits inside `decompose` so it cannot be forgotten at a call site. Dictionary search over 30,334 headwords, corpus search, `analyse` and `compare` all handle decomposed input |
| Typed-answer grading | `korean-morphology/validate.ts` grades a typed Korean answer against an expected one and returns the correction as structured fields, never as prose. Separates a wrong particle from a wrong word where the stems agree |
| Version | Android 1.0.3 / **15**. iOS deliberately left at 1.0.2 / 4 — see `BUILD_OR_SIGNING_BLOCKERS.md` §9 |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint every previous release carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, version code **15**, versionName **1.0.3**, SDK 24–36 — read back with `aapt2 dump badging` on the delivered file |
| Why 15 | 14 is spent. Both previously delivered artefacts report a code of 14, the previous `build-info.json` recorded 14, and product files have changed since the commit that produced them — twelve content packs went from 609 words to all 3,393, which rewrites every generated pack and every corpus band, sixty new words landed with 240 recordings, and Unicode normalisation now runs where user text enters. `npm run version:check` said so before the build rather than after. Nothing has been uploaded to Play, so 15 is the next valid code rather than the next unused one. |
| iOS | **not built** — macOS and Xcode are unavailable here. The project is complete, is synced with this exact web build, and ships in `result/ios-project/`, at version 1.0.2 build 4, which is what `build-info.json` reports for it; `pending_version` 1.0.3 and `pending_build` 15 name what is owed. No `.ipa` was approximated and nothing was renamed to one. |

## What was run against this tree

| Suite / gate | Result |
| --- | --- |
| `npm run verify:release` | green from end to end on the delivered tree, including `verify:quick` |
| `npm run locale:content:check` | **32 complete · 0 partial · 0 with no vocabulary content yet**; 12,800 simulated questions across 32 languages, all askable, 0 refused for want of a meaning |
| `npm run locale:practice:check` | 32 locales × 7 levels × 14 days through the real planner and question builder — **0 findings**, from 217 before this cycle. New this refresh and in `verify:release` |
| `npm run vocabulary:translation:check` | 30 languages compared; every pair that shares a sentence is one English shares too, or is in the ledger with a reason |
| `npm run translation:semantics:check` | 103,323 rows across 31 locales — **0 findings** |
| `npm run romanization:qa:check` | 3,393 headwords, 41 rule fixtures, 3,424 word recordings matched to headwords in both voices |
| `npm run audio:qa` | 13,980 clips, 68.4 MB, 600 decoded — 0 errors, 0 warnings |
| `npm run content:coverage:check` | every applicable row at 100%, and every one of the 55 unobserved words carries a written reason |
| `npm run mobile:icons:check` | 59 files, Android from `application_logo_android.png` at 512px, iOS from `application_logo_iphone.png` at 1024px, **neither drawn from the other's artwork** |
| `npm run numbers:domain:check` | **1,767 questions, 6,626 options**, 2,496 strings across 32 languages, 0 findings |
| `npm run numbers:qa:check` | 6 modules · 19 lessons · **102 items** · 9 exercise kinds · 0 problems |
| `npm run numbers:copy:check` | 6,944 learner-facing strings across 32 languages — 0 findings |
| `npm run numbers:ledger:check` | **270 distinct questions**, every one read at its current wording; the hash covers the answer domain, so a re-labelled item must be read again |
| `npm run copy:generated:check` | 530 exercises built, 16,960 rendered prompts across 32 languages; **0** compose a sentence under the answer result |
| `npm run answerability:check` | **806,252 generated questions** — every one has exactly one option that answers it |
| `npm run strokes:corners:check` | 73 taught characters, 510 stroke ends, 86 joints, 82 corner terminals — 0 findings |
| `npm run glyph:structure:check` | 86 junctions probed, weakest **100.0%** |
| `npm run glyphshape:qa:check` | mean **99.6%** explained against the reference face, floor 93% |
| `npm run vocabulary:level:qa:check` | every level valid, populated and harder than the one below; 235 words held to their editorial band |
| `npm run docs:consistency:check` | 65 figures across 6 documents |
| `npm run synthetic:users:qa:check` | **118 journeys**, all pass |
| `npm run locale:editorial:check` | 0 errors, 0 warnings |
| `npm run test:e2e` | see the run recorded below |
| Unit suites | web, Korean morphology **237**, handwriting core **96** — all passing |
| `npm run native:bundle:check` | 14,152 files compared inside the APK — 0 missing, 0 different, 4 of 4 web-only files pruned |
| `npm run release:current` | both delivery manifests at HEAD |

Five gates were negative-tested this refresh by restoring the behaviour they
exist to catch. Every restoration is undone by regenerating from source, never
by editing the generated file back:

```
tr truncated to 609 words, corpus re-split      19 findings   exit 1
  locale:practice — no meaning question at L15/20/25/30, no matching
  grid, 90% of the session one exercise kind, 140 of 140 words taught
  with no Turkish meaning to read
the Kyrgyz negative class returned to two vowels  3 findings   exit 1
the NFC composition removed from decompose/normalise
                                                  2 tests fail  exit 1
the particle/word separation removed from validate()
                                                  1 test fails  exit 1
kk 산책하다 given 공원's sentence                    1 pair       exit 1
```

**The first one failed to fail, at first, and that is the finding worth
recording.** Truncating the Turkish pack and rebuilding only
`content:vocabulary` produced *zero* findings, because `locale-practice-qa`
loads word copy the way the app does — through `loadWordCopy`, which fetches the
**bands** under `public/corpus/` — and those still held the full pack. It is the
same sequencing trap that cost sixty word recordings this cycle: source →
`content:vocabulary` → `content:corpus`, and a gate that reads the app's own
loader reads the second, not the first. Re-split, the same truncation produces
the nineteen findings above.

## The icons, looked at — carried forward from build 14

The icon sources did not change in this build and neither did the generated
files; `mobile:icons:check` re-ran and passed. What follows is the reading from
build 14, kept because it still describes the artefacts in this delivery.

Rendered under circle, squircle and rounded-square masks at 192, 48 and 32 px, on
light and dark launcher grounds, for the legacy icon, the round icon, the
adaptive foreground composited over its background, and the monochrome layer.
Nothing clipped, nothing stretched, 가나다 still readable at 32 px. The iOS
catalogue's one universal slot is 1024×1024 RGB with no alpha, which is what App
Store Connect requires; `Contents.json` is unchanged, as are every Xcode-managed
signing, team, bundle-identifier and provisioning value.

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
  Korean. This is the claim this release is most likely to be misread about, so
  it is stated at full size: **69,156 strings were written into twelve languages
  and thirty-two packs this cycle, and not one of them has been read by a
  speaker of the language it is in.** Coverage went from a real gap to none;
  review went further out of reach in the same movement, because there is more
  unread text than there was before. See `BUILD_OR_SIGNING_BLOCKERS.md` §10 and
  issue I-17.
* **No review by anybody who needs the accessibility route.** The sound-free run
  and the per-question escape exist, are gated, and were walked in a browser.
* **No iOS build.** No `.ipa` exists and none was approximated.
* **iOS is not at 1.0.3.** Its version is set in Xcode, on a Mac, by the person
  who archives the build; §9 of the blockers document says exactly how.
* **The icons were reviewed as renders, not on a home screen.** The masks above
  are drawn by a script, not by a launcher.
* **No emulator run this refresh.**

## Checksums

```
95752af19c29b3365fdc58cfe10d0422acb772408cc1dd0eefe3840d7073aad0  hangyul-ganada-release.apk
4dc538877ec39dd4117aad07c268f438c94696d227316f634260cf1c7c8d7dee  hangyul-ganada-release.aab
c2ce7f671b6181d23d919ae7e81c742ccef211807e99eac38409e13a84ed9476  docs/report.pdf
0c38ffe96b6cd52cb255d313485671746aca04d155b447a21599bfdff287df38  build-info.json
```
