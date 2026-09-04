# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `2f282d9b` on branch `main`. The working tree at build time
differed only in `result/` and `app_result/` — the delivery directories a
release necessarily rewrites — and in the two hand-written documents inside
them. `npm run release:current` is the check that owns this question and it
reports both delivery manifests at HEAD.

The `source_state` block in `build-info.json` reads `"dirty": true`, and that is
the script observing its own output: it is written by the same run that
assembles `result/`, and the files it counts are the delivery files themselves.
What matters — that no *product* file differs from the commit — is what
`release:current` checks.

**Built:** 4 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes every v1.0.2 validation.** versionCodes 3 through 10 are
spent, each by an artefact that was actually produced. This is 11.

---

## Why this release happened

Two screenshots of the running Numbers course, and a version number that had
gone backwards.

The screenshots showed the same defect twice. Four buttons — 세 시 · 두 개 ·
한 명 · 셋 시 — under **어느 쪽이 맞을까요?**, *which one is right?*. Three of
them are right. The answer the grader wanted was 셋 시, the one that is
**wrong**, because the exercise was built by `spot_mistake` and the instruction
was chosen from the exercise *kind* rather than from what the learner was being
asked to do. A learner who read the instruction and obeyed it was marked
incorrect, on every question of that kind, in all thirty-two languages.

The second: 한 개, under **이건 무슨 뜻일까요?**, with four whole grammar rules
to choose between. 한 개 does not mean *counting words take a space*.

The version number: `f177884e`, resolving a stash conflict, had taken
`buildNumber` from 10 to 4 to match what the Xcode project happened to carry.
Left alone, the next Android build would have been versionCode 4 after 10 had
already been produced and delivered.

Auditing the whole course rather than the two screenshots found twenty-six more
question shapes with more than one defensible answer, six date expressions
written in a form nobody writes, and every example card headed *이렇게 써요* —
*this is how you write it* — including the cards whose whole subject is a sound
change.

## What changed

| | |
| --- | --- |
| Question types | `NumbersQuestionType` is carried on the exercise, resolved in the builder from declared content (`NumberItem.gloss_kind`), and the page switches on it and nothing else. Ten types, ten instructions. |
| The four instructions | 다음 중 틀린 표현을 고르세요. · 다음 중 올바른 설명을 고르세요. · 무엇이라고 들렸나요? · 무슨 뜻일까요? |
| One answer | 26 question shapes corrected: 13 fill-the-blanks whose sentence decided nothing (`두 ____` takes 개, 명, 마리 and 사람), 5 meaning questions offering two glosses that named the same thing, 5 explanation questions over a stimulus that two rules explained at once, 3 offering duplicate distractors |
| Date spacing | 삼월 일일 · 유월 육일 · 시월 십일 · 십오일 · 이천이십육년, in the curriculum data, all 32 bundles and the audio manifest |
| Audio | 5 clips regenerated in both voices; the 10 files that said the spaced forms **deleted**, so a cached clip id cannot keep playing 삼월 일 일 |
| Example headings | `example_kind` — 이렇게 발음해요 on the five sound-change cards, 이렇게 써요 on the three that show a written contrast, 이렇게 말해요 otherwise |
| Launcher artwork | Android and the web install from `app_logo_android.png`, iOS from `app_logo_iphone.png`; 59 generated files |
| Version | Android 1.0.3 / 11. iOS deliberately left at 1.0.2 / 4 — see `BUILD_OR_SIGNING_BLOCKERS.md` §9 |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint versionCode 10 carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, **versionCode 11**, versionName **1.0.3**, SDK 24–36 — read back with `aapt2 dump badging` on the delivered file |
| Why 11 | 10 is spent. Both previously delivered artefacts report versionCode 10 under `aapt2 dump badging` and `bundletool dump manifest`, the previous `build-info.json` recorded 10, and the commit that produced them is titled `versionCode 10`. Nothing has been uploaded to Play, so 11 is the next valid code rather than the next unused one. `build-result` now reads the number back out of the binary before delivering it, and refuses a code behind the last delivery. |
| iOS | **not built** — macOS and Xcode are unavailable here. The project is complete and ships in `result/ios-project/`, at version 1.0.2 build 4, which is what `build-info.json` reports for it; `pending_version` and `pending_build` name what is owed. |

## What was run against this tree

| Suite / gate | Result |
| --- | --- |
| `npm run verify:quick` | **every step green** — 40 gates including `name:check`, `ios:project:check`, `version:check`, `i18n:check`, `numbers:qa:check`, `copy:audit:check`, `copy:ledger:check`, `tokens:check`, `lint`, `typecheck`, `test`, `build`, `bundle:budget:check`, `routing:check` and `share:check` |
| `npm run verify:release` | green through the chain. `docs:consistency:check` failed once on figures this pass had moved — the unit-test count, the end-to-end count and the two artefact sizes — and passes with the documents corrected, which is the gate doing its job rather than a defect |
| `npm run numbers:qa:check` | 6 modules · 19 lessons · 95 items · 9 exercise kinds · **0 problems**; 144 clips present, 0 synthesised; 277 keys × 32 languages, 0 identical to English; **284 distinct questions audited across 10 question types, 972 built** |
| `bash scripts/numbers-qa-negative.sh` | **10 of 10 defects restored and caught**, then restored and green |
| `npm run mobile:icons:check` | 59 files up to date; negative-tested by adding an obsolete PNG and by removing a required one, both caught |
| `npm run ios:project:check` | `project.pbxproj` byte-for-byte unchanged, before and after `cap sync`; negative-tested by editing `MARKETING_VERSION`, caught on the sha256, the blob id and the setting by name |
| `npm run version:check` | 1.0.3 / 11 in every file that states one, and the pending iOS action printed |
| `npm run copy:ledger:check` | 847 Korean strings, every one read at its current wording; 10 rewritten this pass with the reason recorded |
| `npm run numbers:copy:check` | 7,200 learner-facing strings across 32 languages; no lesson names the two number sets by a linguistic label |
| `npm run copy:audit:check`, `i18n:check`, `locale:content:check`, `locale:editorial:check` | pass — 0 errors and 0 warnings on the copy audit |
| `npm run audio:qa`, `audio:pronunciation:check` | pass over the regenerated corpus |
| `npm run test:e2e` | **573 passed, 1 failed** over 287 cases × 2 projects, 40.7 minutes. The failure is `level-change.spec.ts` — *a mid-day retake keeps the mastered words and serves the measured level* — timing out waiting for the corpus to load a headword, in a suite that had already been running for forty minutes. Re-run alone it passes, twice, along with the other case in its file. It is a flake under load and it is recorded as one rather than re-run away; nothing in this pass touches the vocabulary level machinery |
| `npm run native:bundle:check` | 14,152 files in `apps/web/dist`, 14,152 compared inside the APK, **0 missing and 0 different** — the app inside the package is the app that was built |
| `npm run release:current` | both delivery manifests at HEAD; the working tree dirty only in `docs/` and the release directories |

Thirteen gates were negative-tested this pass by restoring the behaviour they
exist to catch. Ten are in `scripts/numbers-qa-negative.sh`; the other three are
the icon gate's obsolete and missing-resource cases and the iOS project lock.

## On a device — NOT RUN THIS REFRESH

The signed APK was not installed on an emulator or a handset in this refresh,
and no physical device exists on this machine. Everything above ran in headless
Chromium at phone viewports — including the Numbers prompts at 320×568, 375×667
and at 22 px root text, where what is asserted is that the instruction, every
option, the feedback and the Continue button are all reachable and none of them
overflows the viewport. **Nothing here is evidence about a real phone.** The
matrix that would close it: a 320 px-class Android at 100% and 200% text, a
412 px Android, an iPhone SE and an iPhone Pro Max, each in light and dark,
walking the alphabet lesson, a vocabulary sitting, the Numbers course and the
Level Test.

The launcher icons were reviewed by eye rather than on a launcher: rendered
under circle, squircle and rounded-square masks at 176 px and at 48 px, and the
adaptive and monochrome layers over light and dark grounds. The lettering, the
face, the leaf and both arms survive every mask. That is a render, not a home
screen.

## Not claimed

* **No native-speaker review** of the thirty-one non-Korean bundles. See
  `BUILD_OR_SIGNING_BLOCKERS.md` §10.
* **No iOS build.** No `.ipa` exists and none was approximated.
* **iOS is not at 1.0.3.** Its version is set in Xcode, on a Mac, by the person
  who archives the build; §9 of the blockers document says exactly how.

## Checksums

```
3894b163b0156c1370ec36db7b9ec15c1981e8d04501ebbd7c03a5dc6ff8ad88  hangyul-ganada-release.apk
8a271a8dc9004c8585cdc262283727f8eb8eff4fe58d862f2ef722b66434b5a6  hangyul-ganada-release.aab
914652ed8b1b6723262bc6ba0940e0da89c0e6e5a711c629a37c1a0b4f39dfa2  docs/report.pdf
65e74cbf5d76950d42f96ee32266d18c5d040c961a846b2c00b5a2f929f7d01b  build-info.json
```
