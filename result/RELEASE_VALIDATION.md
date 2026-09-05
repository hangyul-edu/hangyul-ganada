# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `b4bbaf85` on branch `main`. `build-info.json` →
`source_state` reads `"dirty": false`: no product file differed from that commit
when the artefacts were built. `sourceState()` filters to product files, with the
same list `release:current` keeps, so it does not hash the delivery it is in the
middle of writing.

**Built:** 5 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes the versionCode 13 validation.** Codes 3 through 13 are spent,
each by an artefact that was actually produced. This is 14.

---

## Why this release happened

Two new application logos, and three screenshots of the Numbers course.

**The logos.** `application_logo_android.png` and `application_logo_iphone.png`
replace the previous pair. The pipeline already read one source per platform, so
the work was the three numbers tuned for the *previous* drawing and carried
forward as if they belonged to the pipeline — the adaptive, round and maskable
safe fractions, and the ground colour the adaptive background paints. Left where
they were, the launcher icon would have shipped about 15% smaller than it needs
to be, inside a tile of empty cream. And the gate could not tell the two sources
apart: swapping the two constants moves both sides of its comparison together.

**The questions.**

```
  원        무슨 뜻일까요?      한국 돈의 단위 · 5,000원 · 10,000원 · 35,000원
  [clip]    무엇이라고 들렸나요?   두 시 십오 분 · 분 · 세 시 삼십 분 · 초
  오천 원    무슨 뜻일까요?      2시 · 사람 세 명 · 돈 5,000원 · 30분
```

Each has exactly one correct option, passed `answerability` and `numbers:qa`, and
can be answered without reading any Korean. Options were drawn from whatever the
lesson happened to contain, and *what makes two options comparable* had never
been written down — so no verifier could ask for it. A pass two editions ago
addressed the first of these by making the option shapes uniform, which is why it
still looked plausible and was still unanswerable on its merits.

## What changed

| | |
| --- | --- |
| Application logos | Both platform sources replaced; 59 icon, splash and favicon files regenerated. `ROUND_ICON_FRACTION` 0.76→0.84, `ANDROID_ADAPTIVE_FRACTION` 0.46→0.51, `MASKABLE_SAFE_FRACTION` 0.62→0.69, `ic_launcher_background` #FFF6DC→#FDF3DD — each re-measured against *this* artwork at every density, 48 px mdpi being the binding one. Two constants nothing read are deleted, and so is a third platform-neutral copy of the icon still carrying the previous drawing |
| Icon gate | Each platform's delivered icon is re-rendered from the *other* platform's source; byte-identical means it was built from the wrong file. Sources must also exist, be square and be their declared size |
| Answer domains | `AnswerDomain` declared on all 102 Numbers items and on every option. One filter at the single point every generator passes through; a question that cannot reach three same-domain options is not asked. A clock time with minutes stands only against clock times with minutes, and a whole question only against whole questions |
| Question schema | Every generated question carries `learningObjective`, `promptType`, `targetType`, `answerDomain`, `correctAnswer`, `distractorStrategy`, `difficulty`, `prerequisites` and `audioTarget`, filled in from what was built rather than what was intended |
| Instructions | *무슨 뜻일까요?* retired. Five instructions, one per domain a meaning question can ask about, in all 32 languages |
| New content | Seven items the domain rule showed were missing — 천 원, 두 시 사십 분, 아홉 시 오 분, 일곱 시, 오월, 나이가 어떻게 되세요?, 연세가 어떻게 되세요? — and ten clips for them in both voices |
| Answer equivalence | `korean-morphology/equivalence` decides whether two Korean strings are the same answer and returns which of spacing, particle allomorph, counting form, politeness or inflection made them differ. Used by the option builder, not only by gates |
| Audio tool | `--only` merges into the manifest instead of replacing it. It had written a valid three-entry manifest over the real one while 6,861 recordings sat on disk unreferenced |
| PDF builder | YAML front matter is removed before the document is read as prose. It was being typeset as a heading in every document that has front matter, this report included |
| Version | Android 1.0.3 / **14**. iOS deliberately left at 1.0.2 / 4 — see `BUILD_OR_SIGNING_BLOCKERS.md` §9 |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; size and sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; same |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint every previous release carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, version code **14**, versionName **1.0.3**, SDK 24–36 — read back with `aapt2 dump badging` on the delivered file |
| Why 14 | 13 is spent. Both previously delivered artefacts report a code of 13, the previous `build-info.json` recorded 13, and product files have changed since the commit that produced them — every launcher and store icon, the Numbers question model with seven new items, and the equivalence module. `npm run version:check` said so before the build rather than after. Nothing has been uploaded to Play, so 14 is the next valid code rather than the next unused one. |
| iOS | **not built** — macOS and Xcode are unavailable here. The project is complete and ships in `result/ios-project/`, at version 1.0.2 build 4, which is what `build-info.json` reports for it; `pending_version` and `pending_build` name what is owed. |

## What was run against this tree

| Suite / gate | Result |
| --- | --- |
| `npm run verify:release` | green from end to end on the delivered tree, including `verify:quick` |
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
| Unit suites | web **1,044**, Korean morphology **225**, handwriting core **96** — **1,365**, all passing |
| `npm run native:bundle:check` | 14,152 files compared inside the APK — 0 missing, 0 different, 4 of 4 web-only files pruned |
| `npm run release:current` | both delivery manifests at HEAD |

Eight gates were negative-tested this refresh by restoring the behaviour they
exist to catch:

```
원 declared a moneyAmount                            30 findings   exit 1
the granularity and length filters removed           30 findings   exit 1
the domain filter removed from build()               30 findings   exit 1
개 and 마리 given the same English gloss              30 findings   exit 1
the answer index no longer following the shuffle     30 findings   exit 1
the two application-icon sources crossed              2 findings   exit 1
a 256 px Android icon source                          1 finding    exit 1
one launcher icon left stale                          1 finding    exit 1
```

## The icons, looked at

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
  Korean. The strings this pass wrote — five instructions and eleven glosses in
  each of 32 languages — joined the unread surface rather than shrinking it. See
  `BUILD_OR_SIGNING_BLOCKERS.md` §10 and issue I-17.
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
bcb94e2a3002e65cbbf31d79c23a5bcf81f4da4a2fb89a8258029a4ff99c8bca  hangyul-ganada-release.apk
ca6fb668ee76e2579e4cf22be301256e5f983815b28a9419c4480e1c45490bda  hangyul-ganada-release.aab
2e08fe3ffb3ef916d3e3418bea0756b96b084ffe2b0547669d67578042e7007b  docs/report.pdf
37c93e33aba3b83ecc0dad17ab2299500ca32bf693ffcee93aa1143f46c35c28  build-info.json
```
