# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `f5697244` on branch `main`. `build-info.json` →
`source_state` reads `"dirty": false`: no product file differed from that commit
when the artefacts were built. `sourceState()` filters to product files, with the
same list `release:current` keeps, so it does not hash the delivery it is in the
middle of writing.

**Built:** 5 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes the versionCode 12 validation.** Codes 3 through 12 are spent,
each by an artefact that was actually produced. This is 13.

---

## Why this release happened

Two screenshots, and neither of them was a rendering bug.

**ㄸ being written.** Both of its lids began a visible distance to the right of
where the letter begins, and became flush only once the ㄴ under each of them was
drawn. `strokeVectors.classify` extended only the *later* of two stroke ends that
meet, so the first stroke of every corner was drawn half a pen short of the
letter's own corner and stayed short for as long as it was the only ink on the
paper — 41 stroke ends over 16 characters. Every glyph gate measures the
**finished** letter, where the second stroke has arrived and filled the hole.

**The Numbers course.** *이 숫자를 일, 이, 삼으로 말해 보세요.* *0을 읽고, 어디에
어떤 말을 쓰는지도 익혀요.* *마무리 확인 통과 — 10문제 중 8개* under a heading
reading *아직 끝나지 않았어요*, with *마무리 확인 통과하기* listed below as the
thing still to do. A pass two editions ago had banned the linguistic names for
the two number sets and replaced them with the sets' own first three words; a set
with no name has to be pointed at every time it comes up, and pointing at it is
what produced a course full of demonstratives.

Reading the course end to end after that found two things neither screenshot
could show: a **lesson header that was one of its own answers** in thirty-one
languages — 얼마예요? is the money lesson's title, and every language but Korean
glossed the item with the same sentence — and two questions whose answer was the
only option of its **shape**.

## What changed

| | |
| --- | --- |
| Stroke geometry | The `corner` extension is symmetric: both ends of a shared joint reach it, so a stroke is drawn to the letter's corner from the moment the pen leaves it. The finished glyph does not move — junctions 100%, shape 99.6% mean explained against the face. `strokes:corners` is the new gate and asks the question order-independently; it also holds ㄲ ㄸ ㅃ ㅆ ㅉ to being one component written twice |
| Numbers terminology | The two sets are named — 한자어식 and 고유어식, and each language's own equivalent — and module 1 teaches both before anything asks about them. Nine later lessons stopped saying *일, 이, 삼 쪽*. `numbers:copy` enforces the opposite rule to the one it used to: a demonstrative standing in for a name is a finding, and six strings must say which set they are about |
| Answer result | The verdict and nothing under it. `feedback` is off the exercise, `rationale` is out of all 32 bundles, and *필요한 곳에는 설명이 따라와요* has gone with the sentence it promised. `copy:generated` builds all 530 exercises and fails if one carries a body |
| Final check | `passMark(total)` is one function and both screens call it: *10문제 중 8문제 이상 맞히면 통과해요* before, and the score with the mark after. The summary drops the line the score already covers, and *every item answered once* is its own row |
| Question bank | `readChoose` refuses a question whose answer is the only option of its shape; `numbers:qa` asserts it from outside the builder, and compares the lesson header against the option list in all 32 languages. `docs/numbers-question-ledger.md` records all 276 distinct questions read one at a time |
| Vocabulary levels | I-133 closed: editorial usefulness is a ceiling rather than a term, so a word marked *needed first* cannot ship above the starter band. 235 words moved; levels 1–4 unchanged, so the twelve partial packs and the 32-language completeness of levels 1–3 are untouched |
| Editorial | The 70 `locale:editorial` warnings were all one class — two keys holding the same English sentence, translated two ways — and all 70 are closed |
| Gates | `answerability`, the 118 synthetic journeys, the level audit, back coverage, reachable actions, section alignment and legal isolation were defined and never run; they are in `verify:release` now |
| End-to-end suite | Two Numbers cases were still asserting the two sentences this cycle removed — `summaryMissing.mastery` under a score line that already carries the fact, and `masteryPerfect` with `{{total}}` uninterpolated. The screens were correct in all four failing runs; the assertions now read the score line at its real numbers and require the retired row to be **absent**. Restoring the unfiltered list fails them again |
| Version | Android 1.0.3 / **13**. iOS deliberately left at 1.0.2 / 4 — see `BUILD_OR_SIGNING_BLOCKERS.md` §9 |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint every previous release carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, version code **13**, versionName **1.0.3**, SDK 24–36 — read back with `aapt2 dump badging` on the delivered file |
| Why 13 | 12 is spent. Both previously delivered artefacts report a code of 12 under `aapt2 dump badging`, the previous `build-info.json` recorded 12, and product files have changed since the commit that produced them — so a rebuild at 12 would put different bytes under a code a set of bytes already exists for, which Play refuses. `npm run version:check` said so before the build rather than after. Nothing has been uploaded to Play, so 13 is the next valid code rather than the next unused one. |
| iOS | **not built** — macOS and Xcode are unavailable here. The project is complete and ships in `result/ios-project/`, at version 1.0.2 build 4, which is what `build-info.json` reports for it; `pending_version` and `pending_build` name what is owed. |

## What was run against this tree

| Suite / gate | Result |
| --- | --- |
| `npm run verify:release` | run twice. The first run failed at its last step — four Playwright cases pinning copy this cycle removed, described above and in report §20R.11a; nothing in the app was wrong. The second run, on the delivered tree, is recorded below |
| `npm run strokes:corners:check` | 73 taught characters, **510 stroke ends**, 86 joints, 82 corner terminals, 5 doubled letters over 12 corresponding stroke pairs — 0 findings |
| `npm run glyph:structure:check` | 86 junctions probed, weakest **100.0%**; islands drawn = predicted 73/73 |
| `npm run glyphshape:qa:check` | mean **99.6%** explained against the reference face, floor 93% |
| `npm run strokes:visual:check` | 73 items, 269 strokes, **1,345 frames** rendered at 256 px — no measurable problem in any frame |
| `npm run strokes:markers:check` | 73 characters, **269 badges**, 0 problems |
| `npm run numbers:qa:check` | 6 modules · 19 lessons · 95 items · 9 exercise kinds · **0 problems**; 144 clips present, 0 synthesised; 260 keys × 32 languages, 0 identical to English; **282 distinct questions audited across 10 question types, 972 built**; **2,208 lesson header / answer pairs compared** across 32 languages; 19 lessons complete sound-free |
| `npm run numbers:copy:check` | 6,944 learner-facing strings across 32 languages; 192 set labels checked in that language's own words; 10 retired sentences and 1 retired key block checked in every bundle — 0 findings |
| `npm run numbers:ledger:check` | **276 distinct questions**, every one read at its current wording; 9 corrected and 2 noted with the reason recorded |
| `npm run copy:generated:check` | 530 exercises built, **16,960 rendered prompts** across 32 languages; **0** compose a sentence under the answer result |
| `npm run answerability:check` | **806,252 generated questions** — every one has exactly one option that answers it |
| `npm run vocabulary:level:qa:check` | every level valid, populated and harder than the one below; **235 words** held to their editorial band; 162 anchors in place |
| `npm run numbers:layout:check` | **45 cases, 3,465 elements**, 0 problems |
| `npm run scroll:audit:check` | 25 route/states, **199 measurements** at seven sizes — every screen's last action reachable |
| `npm run synthetic:users:qa:check` | **118 journeys**, 7,902 words introduced, all pass |
| `npm run copy:ledger:check` | **830** Korean strings, every one read at its current wording; 78 rewritten with the reason recorded |
| `npm run locale:editorial:check` | **0 errors, 0 warnings** — the 70 split-translation warnings the previous edition carried are closed |
| `npm run test:e2e` | **578 cases** over the mobile and desktop projects, 0 failed, 0 flaky, 38.4 min |
| Unit suites | web **1044**, Korean morphology **216**, handwriting core **96** — **1,356**, all passing |
| `npm run native:bundle:check` | **14,152 files** compared inside the APK — 0 missing, 0 different, and the 4 web-only files pruned, which it now checks rather than skips (report §20R.11b) |
| `npm run release:current` | both delivery manifests at HEAD |

Twelve gates were negative-tested this refresh by restoring the behaviour they
exist to catch:

```
the asymmetric corner rule restored                  41 findings   exit 1
필요한 곳에는 설명이 따라와요 put back                    2 findings   exit 1
the rationale block put back in one bundle            (same run)   exit 1
two glosses made identical — a second right answer   14 findings   exit 1
the pass mark rounded instead of ceilinged            1 test        exit 1
MASTERY_PASS moved to 0.5                             1 test        exit 1
English copied into the Tamil pack                    2 findings   exit 1
the prompt table and the page's switch disagreeing    1 finding    exit 1
the usefulness ceiling emptied                      215 findings   exit 1
the money gloss restored to the lesson's own title    1 finding    exit 1
the summary's retired *Take the final check* row back  1 e2e case   exit 1
sw.js copied back into the native bundle               1 finding    exit 1
```

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
  Korean. 1,646 strings were written across 32 languages this pass and the
  ledger records that the reading was done by the model that wrote them. See
  `BUILD_OR_SIGNING_BLOCKERS.md` §10.
* **No review by anybody who needs the accessibility route.** The sound-free
  run and the per-question escape exist, are gated, and were walked in a
  browser. Whether they are the route a deaf or hard-of-hearing learner would
  choose is not something this repository can establish about itself.
* **No iOS build.** No `.ipa` exists and none was approximated.
* **iOS is not at 1.0.3.** Its version is set in Xcode, on a Mac, by the person
  who archives the build; §9 of the blockers document says exactly how.
* **The stroke work was reviewed as a render, not on a handset.** The 1,345
  animation frames and the contact sheets in `.stroke-qa/` are headless Chromium
  at the sizes the product draws.
* **No emulator run this refresh.** The previous edition's device walk is not
  re-claimed for these bytes.

## Checksums

```
e76ab90aec2399eb18920e57775437546bb5bec7fc015ce85d5e84e678808651  hangyul-ganada-release.apk
d230b86460a8b458d64fd273eb9e1dc491ff06d0cd9c30b92bbaaa65ca6ff6ac  hangyul-ganada-release.aab
85e6b7941a8d12257252c352867821465a41f3dee11bedbe6d822f6bf3a27f2c  docs/report.pdf
e6bca3eacaab84a99c4dd8795a0d30f266444f80dc5a3546ec1bf9ee62ce06ad  build-info.json
```
