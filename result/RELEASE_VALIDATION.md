# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `a8e04b79` on branch `main`. `build-info.json` →
`source_state` reads `"dirty": false`: no product file differed from that commit
when the artefacts were built. `sourceState()` filters to product files, with the
same list `release:current` keeps, so it does not hash the delivery it is in the
middle of writing.

**Built:** 7 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes the versionCode 15 validation.** Codes 3 through 15 are spent,
each by an artefact that was actually produced. This is 16.

---

## Why this release happened

**The Numbers course could not say which one comes first.** It taught 하나 and
일 and 한 개 and 세 시 and had nothing at all about order, so a learner who had
just been taught 한 개 reached for 한 번째 the first time they needed *the first
one* — and 한 번째 is not Korean. `num-lesson-ordinals` is the twentieth lesson,
fourth in the counting module: ten items, four explanation steps, a check of
ten, and five question shapes.

Korean has two ordinal families and they are not interchangeable. 번째 says
where something stands in a line; 째 counts off the points of what you are
saying, and names which child in a family. The lesson teaches the difference
rather than presenting them as synonyms, and the content model makes the
alternative unbuildable: `ordinalPosition` and `ordinalRank` are two answer
domains, so 첫 번째 and 첫째 can never be two buttons under one instruction —
both name position one, and under *which position is this?* both would be
defensible.

**Then the rest of the course was read again, and it was not clean.** Two
explanation steps said the sound inserted in 십육 → 심뉵 is **ㄹ**. It is ㄴ:
ㄴ 첨가 puts a ㄴ in front of 육 and 십 assimilates to 심. In 열여섯 → 열려섣
that same inserted ㄴ becomes ㄹ after ㄹ, which is why the two look alike and
are one rule — and the second step called it "the same ㄹ sound as in 심뉵",
which is wrong twice over. Both said it in all 32 languages.

The three ways of asking somebody's age were glossed *the phrase for asking
someone's age*, *the everyday polite way to ask an adult's age* and *the polite
way to ask an older person's age*. The first is true of all three and the other
two both say *polite*; in Thai and Telugu two of them read as the same sentence.
A listening pool was drawing 영, 공 and 영하 — three ways of saying zero — into
questions about counting words. And this document's own §9 said *an ordinal is
closed*, which is true of 삼월 일일 and false of 첫 번째; the rule as written
would have had the new lesson writing 첫번째.

**And opening the lesson in Arabic found a defect that is not the lesson's.**
`global.css` isolates a Korean run inside a right-to-left page and leaves its
direction inherited, so a contrast card — `첫 번째 (✓)  ·  한 번째 (✗)` — ended
in a neutral character, the trailing neutral took the paragraph's direction, and
the (✗) rendered at the **left** of the pair it belongs to. The pitfalls lesson
has been drawing four of those since it was written.

## What changed

| | |
| --- | --- |
| New lesson | `num-lesson-ordinals`, twentieth in the course, fourth in module 3. Ten items — 번째, 첫 번째, 두 번째, 세 번째, 네 번째, 첫째, 둘째, 셋째, 넷째, 다섯째 — four explanation steps, a mastery check of ten, five question types |
| Content model | `AnswerDomain` gains `ordinalPosition` and `ordinalRank`, so the two ordinal families can never appear in one option list; `gloss_group` states the relationship the domains only imply. `ordinal_form` is a new misconception class, because 한 번째 is neither a spacing slip nor the plain numeral |
| Korean corrections | `lesson.sinoBuild.step2` and `lesson.nativeBuild.step3` named the wrong consonant for the ㄴ-첨가 rule; the three age-asking glosses overlapped and in two languages collided; four Korean sentences were circular, self-repeating or ambiguously particled. 32 languages each |
| Distractors | `listenChoose` now prefers taught words of the same role before the rest, which is the pool `readChoose` already used. Twelve questions changed and each was re-read in the ledger |
| Right-to-left | The two Numbers modules pin `direction: ltr` on their own Korean. `.hg-target-content` existed in `global.css` for exactly this and had no users anywhere in the app |
| New gates | `numbers:qa` §18 rejects five non-Korean ordinal forms everywhere except the one place each is taught against, and knows the difference structurally; §19 recomputes all 112 romanisations through the transliterator the vocabulary pipeline uses; §20 holds the six stages, the twenty shipped lesson ids and the three printed denominators. §8 gains a blank option |
| Audio | Twelve clips in two voices — 번째, the four 번째 phrases, 셋째, 넷째, 다섯째. 첫째 and 둘째 were already in the corpus. 13,876 → 13,876 distinct files, 13,996 voice slots |
| Localisation | 25 new keys × 32 languages, and nine existing strings corrected in each. 272 → 297 keys |
| Version | Android 1.0.3 / **16**. iOS deliberately left at 1.0.2 / 4 — see `BUILD_OR_SIGNING_BLOCKERS.md` §9 |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint every previous release carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, version code **16**, versionName **1.0.3**, SDK 24–36 — read back with `aapt2 dump badging` on the delivered file |
| Why 16 | 15 is spent. Both previously delivered artefacts report a code of 15, the previous `build-info.json` recorded 15, and 60 product files have changed since the commit that produced them — a lesson with ten items, twelve recordings, 25 keys in each of 32 bundles and corrections to nine existing strings. `npm run version:check` said so before the build rather than after. Nothing has been uploaded to Play, so 16 is the next valid code rather than the next unused one. |
| iOS | **not built** — macOS and Xcode are unavailable here. The project is complete, is synced with this exact web build, and ships in `result/ios-project/`, at version 1.0.2 build 4, which is what `build-info.json` reports for it; `pending_version` 1.0.3 and `pending_build` 16 name what is owed. No `.ipa` was approximated and nothing was renamed to one. |

## What was run against this tree

| Suite / gate | Result |
| --- | --- |
| `npm run verify:release` | green from end to end on the delivered tree, including `verify:quick` |
| `npm run locale:content:check` | **32 complete · 0 partial · 0 with no vocabulary content yet**; 12,800 simulated questions across 32 languages, all askable, 0 refused for want of a meaning |
| `npm run locale:practice:check` | 32 locales × 7 levels × 14 days through the real planner and question builder — **0 findings**, from 217 before this cycle. New this refresh and in `verify:release` |
| `npm run vocabulary:translation:check` | 30 languages compared; every pair that shares a sentence is one English shares too, or is in the ledger with a reason |
| `npm run translation:semantics:check` | 103,323 rows across 31 locales — **0 findings** |
| `npm run romanization:qa:check` | 3,393 headwords, 41 rule fixtures, 3,424 word recordings matched to headwords in both voices |
| `npm run audio:qa` | 13,996 clips, 68.5 MB, 600 decoded — 0 errors, 0 warnings |
| `npm run content:coverage:check` | every applicable row at 100%, and every one of the 55 unobserved words carries a written reason |
| `npm run mobile:icons:check` | 59 files, Android from `application_logo_android.png` at 512px, iOS from `application_logo_iphone.png` at 1024px, **neither drawn from the other's artwork** |
| `npm run numbers:domain:check` | **2,100 questions, 7,811 options**, 3,072 strings across 32 languages, 0 findings |
| `npm run numbers:qa:check` | 6 modules · **20 lessons** · **112 items** · 9 exercise kinds · 0 problems, in twenty sections including the three written this cycle |
| `npm run numbers:copy:check` | 8,032 learner-facing strings across 32 languages — 0 findings |
| `npm run numbers:ledger:check` | **299 distinct questions**, every one read at its current wording; 39 corrected or noted because of a reading, 29 of them this cycle |
| `bash scripts/numbers-qa-negative.sh` | **fifteen** sabotage runs, each restoring one defect and asserting the gate fires — five of them written this cycle for §18–§20 — then restoring and confirming green. 16 ok, 0 problems |
| `npm run numbers:layout:check` | 45/45 cases, 3,600 elements: 7 sizes · 100/150/200% text · light and dark · 32 languages, with the twentieth row on the list |
| `npm run scroll:audit:check` | 26 route/states, 210 measurements, including an answered *ordinal* question at seven phone sizes, at 150% and 200% text, and in dark |
| `npm run copy:generated:check` | 608 exercises built, 19,456 rendered prompts across 32 languages; **0** compose a sentence under the answer result |
| `npm run answerability:check` | **1,026,458 generated questions** — every one has exactly one option that answers it |
| `npm run strokes:corners:check` | 73 taught characters, 510 stroke ends, 86 joints, 82 corner terminals — 0 findings |
| `npm run glyph:structure:check` | 86 junctions probed, weakest **100.0%** |
| `npm run glyphshape:qa:check` | mean **99.6%** explained against the reference face, floor 93% |
| `npm run vocabulary:level:qa:check` | every level valid, populated and harder than the one below; 235 words held to their editorial band |
| `npm run docs:consistency:check` | 65 figures across 6 documents |
| `npm run synthetic:users:qa:check` | **118 journeys**, all pass |
| `npm run locale:editorial:check` | 0 errors, 0 warnings |
| `npm run test:e2e` | **578 passed** in 38.7 min across the mobile and desktop projects |
| Unit suites | web **1,048**, Korean morphology **237**, handwriting core **96** — **1,381**, all passing |
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

## On a device

The signed release APK was installed on an Android 16 emulator (`hangyul-pixel7`,
1080×2400) from `result/hangyul-ganada-release.apk` — the delivered file, not a
rebuild — and driven by hand.

```
adb install -r result/hangyul-ganada-release.apk        Success
dumpsys package                                        versionCode=16  versionName=1.0.3
                                                       minSdk=24  targetSdk=36
am start -n com.talkhangyul.ganada/.MainActivity       topResumedActivity, no crash
adb logcat -b crash                                    empty
```

What was walked, with a screenshot at each step: the home screen; Letters; the
Numbers course header reading **0 of 20 lessons completed**; module 3 reading
**0 of 4 lessons** with *첫 번째, 두 번째 — saying the order* as its fourth row;
the lesson's objective screen listing all ten items; explanation steps 1 and 4;
the 번째 example card with its romanisation, gloss and *In use* heading; the
첫 번째 card with `첫 번째 (✓) · 한 번째 (✗)` under *Written like this* and the
caption beneath it; a listening question with **Can't use audio?** offered; that
question answered through the visual substitute — *Which of these means this? —
4th, counting off* over 셋째 · 둘째 · 첫째 · 넷째 — and graded **Correct**, with
Continue reachable.

The emulator was shut down afterwards.

**What this is not.** One emulator, one size, one appearance, one language, and
no audio was listened to — the speaker buttons were seen, not heard. It is not
the matrix a release wants, which is a 320 px-class Android at 100% and 200%
text, a 412 px Android, an iPhone SE and an iPhone Pro Max, each in light and
dark, walking the alphabet lesson, a vocabulary sitting, the Numbers course and
the Level Test. Everything else above ran in headless Chromium at phone
viewports.

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
* **No clip was listened to.** The twelve new recordings were checked
  structurally — the id derives from the text, the manifest text is the Korean
  the screen shows, `audio:qa` decoded a 600-clip sample without error — and the
  speaker buttons were seen to be drawn on a device. Nobody heard them.
* **The device walk is one emulator**, in English, in light mode, at one size.

## Checksums

```
96490914cb213bb9c908450144f0877ae98ef5b9e8a89104cc8c39c33be47e0c  hangyul-ganada-release.apk
5bf70c5c649a166cffd8bcd50d7b499d7f020e822459dee0b6ae429e3fb329c7  hangyul-ganada-release.aab
e314326ad816040652a0bc41f5e224c5a36ace73e631b45fee7dc9447b0c1c25  docs/report.pdf
dc6ac940a94f11a58234d6761d5efe3a90df93b78838e49c8c1184151053f90c  build-info.json
```
