# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `37849b61` on branch `main`. `build-info.json` →
`source_state` reads `"dirty": false`: no product file differed from that commit
when the artefacts were built. `sourceState()` filters to product files, with the
same list `release:current` keeps, so it does not hash the delivery it is in the
middle of writing.

**Built:** 8 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes the versionCode 16 validation.** Codes 3 through 16 are spent,
each by an artefact that was actually produced. This is 17.

---

## Why this release happened

**A customer sentence beat every gate in the repository: the level test is too
hard.** It was, and for two reasons that have nothing to do with each other.

**The sequence.** The estimator was sound and was being asked the wrong
question. With nothing asked the posterior is the prior, the prior is
uninformative and therefore centred, so the most informative item sits in the
middle of the scale — and that was question one for every learner in the
product, including one who had finished the alphabet an hour earlier. Selection
was unconstrained thereafter. Measured over 6,000 simulated sittings: the
opening item at **level 14 of 30** for everybody, the largest step between two
questions **six levels**, the longest run at one level **twenty-five**, and
**42.8%** of a level-2 learner's opening five questions more than six levels
above them.

Four rules now sit on top of the information criterion — a warm-up ladder, a
step bounded at three levels, no level three times running, and a confirmation
group at the settled estimate. Opening level 2, largest step 3, longest run 2,
opening figure **1.0%**. Accuracy did not move: MAE 1.31 against 1.29.

**The bank, which is the worse half.** Dictionary headwords are levelled by the
frequency rank of their *spelling*, and Korean writes many different words the
same way. 누가 ranks 107th because it means *who*; the bank asked it at level 1
with **"nougat"** keyed as the correct answer. 내 ranks 3rd because it means
*my* and was keyed to "smell"; 위해 ranks 131st because it means *for the sake
of* and was keyed to "harm". Sixty-nine such items sat at levels 1 to 5. A
learner who knew the word was marked wrong for knowing it.

Levels 1–10 are now entirely curated corpus words. Above the floor, forty
headwords whose rank belongs to an inflected form of another word were dropped
(부탁해요 glossed "please", 팔고 glossed "eight Duḥkhas"), along with
one-syllable headwords, truncated grammar-page glosses, and six grammatical
forms found by reading a rendered sample — 다가 was asked at level 15 to mean
"multivalent".

**Fifteen questions had two right answers, in languages nothing read them in.**
Distractors were rejected on their *English* gloss. 확실히 and 정확히 are
*definitely* and *exactly* in English and one word — *aniq* — in Uzbek.

**And *I don't know* was worth nothing.** Under a model where both it and a
wrong answer can only happen when the learner does not know, the two likelihoods
differ by a constant that cancels; ten of each gave identical estimates to twelve
decimal places. A slip term separates them.

**A sitting now survives the app closing.** Schema 14, and the first new
persisted field since 13.

**Two things had to be fixed before this pass could verify itself.** The
previous release bumped the Xcode project in Xcode without adopting its lock
file, so `verify:release` could not pass on a clean checkout of `main`. And
three of the checks added *in this pass* could not fail, because each read the
constant it was guarding — restoring the old unbounded selection produced 174
passing tests and a green gate.

## What changed

| | |
| --- | --- |
| Level Test selection | A warm-up ladder, a step bounded at three levels, a two-in-a-row repeat limit and a confirmation group, on top of the existing information criterion. A sitting is 20–30 items rather than a flat 30, ending early only when the posterior has settled |
| Level Test scoring | A slip term, so a declared *I don't know* is strictly stronger evidence of not knowing than a wrong answer. Swept: it costs nothing against learners who never mis-tap and is worth a quarter of a level against those who do |
| Level Test bank | 4,199 → 4,121 items, 2,246 distinct words. No dictionary headword below level 11; 40 rank-borrowing headwords, the one-syllable headwords, the truncated glosses, the plurals and six grammatical forms removed; distractor collision now tested in every language a meaning exists in. Every non-English language's askable bank rose from 1,014 items to 2,061 |
| Persistence | Schema 14 adds `level_test_sitting` — the ids presented, the response to each, a seed, the deadline and the locale. Every later item is recomputed from the seed, so a resumed sitting shows the same question and keeps adapting |
| Localisation | One string in each of 32 bundles: the intro promises a range rather than a fixed thirty. Only the numerals changed |
| New gates | `leveltest:bank` reads the shipped bank for mis-levelling, unanswerability and two-answer items in all 32 languages; `patent:evidence` fails on a citation in the disclosure package that does not resolve; `upgradeCompatibility.test.ts` walks a complete learner from every one of the twelve supported schema versions |
| Gates repaired | Four checks that read the constant they guarded now hold their own literals and assert the code agrees. Each was re-broken and watched to fail |
| Release engineering | `docs:consistency` tracks the four artefact figures, so the report cannot carry a stale copy. The iOS project lock is adopted for the version bump the previous release made in Xcode |
| Version | Android **1.0.4 / 17**. iOS deliberately left at 1.0.3 / 5 — see `BUILD_OR_SIGNING_BLOCKERS.md` |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint every previous release carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, version code **17**, versionName **1.0.4**, SDK 24–36 — read back with `aapt2 dump badging` on the delivered file |
| Why 17 | 16 is spent. Both previously delivered artefacts report a code of 16, the previous `build-info.json` recorded 16, and product files have changed since the commit that produced them — the level-test engine, its item bank in all thirty-two languages, the persisted schema, and one string in each of the thirty-two interface bundles. `npm run version:check` said so before the build rather than after. Nothing has been uploaded to Play, so 17 is the next valid code rather than the next unused one. |
| Why 1.0.4 and not 1.0.3 | The previous release was content — a lesson and a set of corrections — and its version name rightly stayed still. This one changes how the Level Test chooses its questions, what its bank contains, what the intro screen promises in thirty-two languages, and the persisted schema. A learner who updates will meet a different test on their first sitting after it, which is what a version name is for. |
| iOS | **not built** — macOS and Xcode are unavailable here. The project is complete, is synced with this exact web build, and ships in `result/ios-project/`, at version 1.0.3 build 5, which is what `build-info.json` reports for it; `pending_version` 1.0.4 and `pending_build` 17 name what is owed. No `.ipa` was approximated and nothing was renamed to one. |

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
8344ecc7c49a092dd9cb51ba8e8064f1462b2c86d17223de0fbfd0f2af6a868f  hangyul-ganada-release.apk
378103caea4f941d7439c361d0e023b60f918839325ae0fcd08f52f7df1d7357  hangyul-ganada-release.aab
f562e60c6278a929049c915fa5955f17936c027dbf9c547b7458b43f28c74a71  docs/report.pdf
bc2e488924c51637a315bfad5eaa246c417b16bf4a19e466b9617b881e4ac25f  build-info.json
```
