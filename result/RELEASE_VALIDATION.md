# Release validation

What was built, what was tested, and what was observed. Every gate reported here
was run on this machine for this build. Two sections are explicitly *carried
forward* from an earlier cycle and say so in their own headings — the icon
reading from build 14 and the device walk from build 16 — because re-running
them would have produced nothing new in the first case and could not be done on
this machine in the second. Nothing else is inherited. Where something could not
be verified it says so rather than being left blank or implied.

**Source:** commit `b76b0805` on branch `main`. `build-info.json` →
`source_state` reads `"dirty": false`: no product file differed from that commit
when the artefacts were built. `sourceState()` filters to product files, with the
same list `release:current` keeps, so it does not hash the delivery it is in the
middle of writing.

**Built:** 10 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes the versionCode 21 validation.** Codes 3 through 21 are spent,
each by an artefact that was actually produced. This is 22.

---

## Why this release happened

**The level test asked a beginner questions they could not read.** Three
separate testers reported it. One, who had recently finished learning Hangul,
was shown this as **question four**:

```
  물을 안 줘서 화분의 꽃이 ____.        도왔어요 · 떠났어요 · 배웠어요 · 죽었어요
```

Two clauses, a negation, a causal connective, an inference about plants, and
화분 — a level-28 word. The item was recorded as level 7. A second tester, who
answered three word questions correctly, met a level-8 sentence at question
four. A third, who *declined* a level-4 word, was shown level 6 next.

Three independent causes, and none of them is in the estimator.

**Difficulty was a fact about the answer.** A contextual item took its level from
the word removed from it and from nothing else — 629 of 629 in the shipped bank.
`지갑에 ____이 있어요` was level 1 because 돈 is a level-1 word; 지갑 is a level-9
word and the frame was never measured. 61 items, 10% of the contextual bank,
contained a word ranked above the item's own level; the worst gap was 21 levels.
`scripts/content/sentence_demand.py` now reads the frame and returns what it
asks for — the hardest ordinary word in it, twelve grammatical constructions
each with the level a learner can be expected to have met it at, and the eojeol
count — and the item takes the highest of those and the answer's own level, so
the model can only raise. **68 items moved, every one upward.** The foundation
band now holds three sentences instead of the reach of the whole bank.

**Nothing bounded where the sitting aimed.** The bracket's upper bound is 30
until something is missed, so after three correct answers its midpoint is 18;
the posterior's prior is centred at 15 and deliberately weak, so for the first
several questions it believes roughly 15 about everybody. `MAX_STEP_UP` was the
only restraint, and a step bound limits how fast a sitting climbs without
saying whether the learner gave any reason to climb. Difficulty now moves in
**bands**, and a band opens on three correct answers inside it across two
distinct question kinds — three correct `meaning` answers is recognition of
three words, and the band above holds sentences. A miss costs one unit of that
evidence rather than all of it, opens a two-question confirmation window capped
a level below what was missed, and never takes the band away.

**The second question was always a sentence.** `planKinds` cycled `meaning,
context, produce, context`, so index 1 was contextual for every learner who ever
sat the test — a reading task before anything was known about whether the
learner could read one. The first five questions are now word questions and the
first sentence is question six, in all sixteen simulated profiles and in the
running app.

**What it cost, stated rather than hidden.** Within ±3 levels over 6,000
simulated sittings: **90.2% → 86.9%**; mean absolute error 1.64 → 1.80. A
sitting now spends its first ten to twelve questions climbing through bands a
strong learner would previously have skipped in four, and a thirty-question
ceiling leaves less evidence at the top. The gate's accuracy floor moved from
90% to 85% with the reasoning written at the constant. A test that measures an
advanced learner half a level better by asking a beginner questions they cannot
read is not the better test.

**And a fourth leak, found by replaying the policy rather than reasoning about
it.** The ceiling was applied to the selector's target, the bounded step and the
warm-up ladder — and not to the screen's own pool fallback, which searches
neighbouring levels when a kind is thin. Band 1 holds three contextual items, so
the fallback fired on the first sentence of nearly every beginner sitting and
served a band-2 one. `leveltest:policy` now replays six beginner profiles across
eight seeds through the real selector, the real fallback and the real draw.

## What changed

| | |
| --- | --- |
| Item difficulty | A contextual item's level is now `max(answer level, hardest word in the frame, grammar floor, eojeol floor)` — `scripts/content/sentence_demand.py`, recorded on every item as `demand` so a reader of the bank can see why it sits where it does. 68 of 625 items moved, all upward; largest move +21 |
| Foundation band | Three sentences at levels 1–3, all one clause, present or past polite, three eojeol or fewer. `leveltest:policy` fails the build on a connective, negation, nominaliser, relative clause, honorific or formal ending anywhere in band 1, or on a frame longer than four eojeol |
| Selection | Six bands with an earned ceiling. A band opens on `PROMOTE_CORRECT` correct answers inside it across `PROMOTE_KINDS` distinct kinds; a miss costs one unit of evidence, opens a two-question confirmation window capped `CONFIRM_DROP` below the missed level, and does not take the band away. `reachCeiling` is applied in four places, including the screen's pool fallback |
| Opening | The first `OPENING_ITEMS` = 5 questions are word questions; the warm-up ladder is clamped by the same ceiling and ends at the first miss. The composition over the whole sitting is unchanged — twelve contextual, nine of each other kind — reordered, not reduced |
| Exposure metric | `leveltest:qa` classified each question against a posterior the evidence gate does not let the sitting act on, and reported 77% of a sitting as *below the estimate*. It now compares against `min(estimate, reachCeiling)` |
| New gate | `leveltest:policy` — re-derives every contextual level from the item's own recorded demand, forbids six constructions in the foundation band, and replays 6 beginner profiles × 8 seeds through the real selector asserting nothing above the ceiling and no sentence in the opening |
| Negative tests | Two more, 13 in all: G9 restores `물을 안 줘서 화분의 꽃이 ____.` to level 7, G10 drops a two-clause sentence into band 1. Both are caught |
| New documents | `docs/LEVEL_TEST_DIFFICULTY_AUDIT.md`, `docs/LEVEL_TEST_ADAPTIVE_POLICY.md`, `docs/LEVEL_TEST_CONTENT_REVIEW.md` and `docs/LEVEL_TEST_SIMULATION_RESULTS.md` — the last three generated, with `:check` forms in `verify:quick` |
| Ambiguity | One more reviewed pair, 25 in all: `____ 한글을 써요` took both 매일 and 조금 |
| Report | §20W, and a figure taken from the built app at 390×844 showing the six questions that open a sitting |
| Version | Android **1.0.5 / 22**. iOS deliberately left at 1.0.3 / 5 — see `BUILD_OR_SIGNING_BLOCKERS.md` |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint every previous release carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, version code **22**, versionName **1.0.5**, SDK 24–36 — read back with `aapt2 dump badging` on the delivered file |
| Why 22 | 21 is spent. Both previously delivered artefacts report a code of 21 and the previous `build-info.json` recorded 21, and product files have changed since — the level-test bank was re-levelled by its sentences and the selector gained an evidence gate. `npm run version:check` said so before the build rather than after, which is what I-152 exists for. Nothing has been uploaded to Play, so 22 is the next valid code rather than the next unused one. |
| Why still 1.0.5 | The versionName does not move. This release changes how the level test chooses questions and which level each sentence sits at; it teaches the same 3,393 words, with the same sentences and the same recordings, so there is nothing a customer reading the listing would need told. The number is set by a person deciding to ship, never incremented by a script. `registered` records that nothing has been uploaded to either console. |
| iOS | **not built** — macOS and Xcode are unavailable here. The project is complete, is synced with this exact web build (`cap sync` reported `update ios` and `copy web` against this `dist/`, and `ios:project:check` passed), and ships in `result/ios-project/`, at version 1.0.3 build 5, which is what `build-info.json` reports for it; `pending_version` 1.0.5 and `pending_build` 22 name what is owed. No `.ipa` was approximated, nothing was renamed to one, and no signing identity, team or bundle identifier was touched. |

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
| `npm run leveltest:qa:check` | 6,000 simulated sittings — **86.9%** within ±3 levels, MAE **1.80**, floor 85%; 0 questions above the earned ceiling |
| `npm run leveltest:policy:check` | every contextual level re-derived from the item's own demand; band 1 free of six constructions; 6 beginner profiles × 8 seeds replayed through the real selector — 0 ceiling breaches, 0 sentences in the opening |
| `npm run leveltest:bank:check` | 625 contextual items, none below its anchor |
| `npm run leveltest:simulations:check` / `leveltest:content:check` | both generated documents current against the shipped bank |
| `npm run synthetic:users:qa:check` | **118 journeys**, all pass |
| `npm run locale:editorial:check` | 0 errors, 0 warnings |
| `npm run test:e2e` | **594 passed, 0 failed**, exit 0, in 46.6 min across the mobile and desktop projects. Three cases in `journey.spec.ts` were corrected first — see below |
| Unit suites | web **1,393**, Korean morphology **237**, handwriting core **96** — **1,726**, all passing |
| `bash scripts/regression-gates-negative.sh` | **fifteen** sabotage runs, two written this cycle — G9 puts the reported level-7 item back, G10 drops a two-clause sentence into the foundation band. 15 ok, 0 problems, every restoration green |
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

## Two cases in the release suite were wrong, in opposite directions

The e2e run is reported above as 594 passed. It did not start there, and what it
took to get there is the part worth recording.

**One case had been failing in the release run and passing alone for four
sessions**, written off as a flake each time — `an interrupted lesson resumes at
the letter that is unfinished`, 9.5s green alone and 18–25s red in the suite.
Driven at `--repeat-each=8 --workers=4` it failed **6 of 8**. A 500 ms pause
before the navigation changed nothing, so it was not the progress write racing
the page teardown; dumping the object store through the failure returned
`character:ㅏ=learned` both before and after it, so the data was right and the
**read** was early. `LetterSessionPage` computed its resume point in a `useState`
initialiser, and the route mounts before the stored profile has been read — so a
returning learner was put back on a letter they had finished, on exactly the slow
phone that behaviour exists for. Fixed, and 8 of 8 under the same parallelism.
**I-203.**

**Three more were passing for the opposite reason.** They are runs of
`toHaveCount(0)` immediately after `page.goto`, and a count of zero is satisfied
by a document that has not rendered: the first poll succeeds and the matcher
returns without retrying. One of them, once a loaded machine made it run late
enough to look, found that the settings screen has shipped *Save a copy* and
*Restore a copy* since `f731bd43` while the case still forbade them — the
product was right and the gate was a week stale, and the race is why nobody was
told. All three now assert something present before asserting what is absent.
**I-202.**

Sweeping for the same shape found it once more, seeding the Numbers question
order. Recorded as **I-204** and left open: it seeds a shuffle from the wrong
number rather than losing or miscounting anything, and believing a change there
means re-running five Numbers suites.

Sixty further failures were seen in one run and are **not** in this list, because
they were this machine: another project on the same VM was running its own
Playwright suite, the preview server was killed under the load, and 59 of the 60
were `ERR_CONNECTION_REFUSED` with the sixtieth an IndexedDB open falling back to
memory. Each was reproduced green in isolation, and the run reported above was
taken on a quiet machine from a cold boot.

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

## On a device — carried forward from build 16, not re-run for 22

**Read the version line below before the rest of this section.** The walk
recorded here was driven against **versionCode 16 / 1.0.3**, which is what its
own `dumpsys` output says, and it has not been repeated for 19. It is kept
because every screen it describes is still in this delivery and none of them
changed; it is *not* evidence about the bytes in this build.

It was not re-run because the emulator could not be given enough memory to boot
on this machine while the rest of the release verification still had to run.
`hangyul-pixel7` was started for this build, reached `offline`, and took the VM
to 693 MB of free memory — the condition that has ended sessions here before, and
which `docs/CLAUDE_ENVIRONMENT_STABILITY.md` exists to prevent. It was shut down
rather than fought. **The next person with a device or a machine that can hold an
emulator should walk build 19 before it goes to a store**, and Today's Vocabulary
is the screen to walk: the one behaviour that changed in this build is that a
plan whose words arrive late now fills in when they land instead of reporting an
empty day, and only a real cold start over a real network exercises it.

What follows is the build-16 reading, unedited.

The signed release APK was installed on an Android 16 emulator (`hangyul-pixel7`,
1080×2400) from `result/hangyul-ganada-release.apk` — the delivered file at that
time, not a rebuild — and driven by hand.

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
  Korean. This cycle wrote no new locale strings, so the unread text is the same
  unread text it was — which is not an improvement, only an absence of a new
  debt. Every rule in `sentence_demand.py` and in `leveltest:policy` is
  structural, and structural is a proxy for a judgement no gate here makes:
  **nothing in this repository reads Korean.** See
  `BUILD_OR_SIGNING_BLOCKERS.md` §10 and issue I-17.
* **The difficulty scale has never been calibrated against a learner**, and it
  cannot be from here — the application opens no network connection at runtime
  and collects nothing. The floors in the demand model are reasoned, not
  measured, and every accuracy figure above is against a simulated learner
  answering the way the model says someone of that ability would. A simulation
  reports excellent behaviour for a badly calibrated bank for exactly as long as
  the bank is wrong in the same way the simulation is.
* **The bank is regenerated with a different distractor draw whenever the corpus
  moves.** The rules and the 25 reviewed pairs carry forward; the reading of
  this build's items recorded in `docs/LEVEL_TEST_CONTENT_REVIEW.md` does not.
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
54aac8388b82fd722f6ba82942b3cac58767a80642d671e83bd4d91a21709b8b  hangyul-ganada-release.apk
71d25b4f1f52ade58a2ff05db9807583147259fefeeeab3988ff1083d42a4300  hangyul-ganada-release.aab
87467b27875a2f7c91209d1d1e93cd66302d6a68536932052fd9c30b1c5c9a7c  docs/report.pdf
675d94f58939af9bf42334045d3fb5f03ffc562ce35d34cc0b839ab817e9722b  build-info.json
```
