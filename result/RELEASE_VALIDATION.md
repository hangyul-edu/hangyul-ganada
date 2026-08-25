# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `7f21b034` on branch `main`, working tree clean at the moment
of the build.

Commits after `7f21b034` touch only `docs/`, `result/` and `app_result/`. None of
them is inside `assets/public`, so the delivered package is byte-correct for the
shipping source; a commit that records a build cannot be in the build it
records, and that is the only gap. `npm run release:current` reads the commit
back out of `build-info.json` and fails if anything outside those directories
has moved since.

**Built:** 25 August 2026, Linux (WSL2), JDK 21, Android SDK build-tools 36.0.0.

**This supersedes the validation of `4bb6a88e`.** Those artefacts were correct for
their commit and are several commits behind this one; they have been replaced.

---

## Why this rebuild happened

A photograph of the running product contradicted the report that shipped with
the previous artefacts. It recorded the compound vowels ㅙ and ㅞ as fixed; the
app drew each of them as three separate letters, and a learner copying that
copies the wrong shape.

The cause was three defects at once, and one of them was not a compound-vowel
bug at all: `shapeToFace` assumed the pen widens a stroke's ink box on all four
sides, which butt caps do not, so **all forty jamo had the wrong proportion**.
The gate that had certified the fix was comparing the app's tracing guide with
the app's demonstration — two drawings generated from the same authored
centrelines, which agree perfectly whatever they draw.

Everything below the geometry follows from that: 273 new words weighted to the
top of the scale, the twenty-two partial languages taken from 100 words to the
600-word core band, and two more gates found passing a deliberately broken
input. An artefact predating that work is the P0 this document exists to keep
closed.

The order matters and was followed: **commit first, then build from the commit.**

### The signing key was recovered, not regenerated

The release keystore is not in this repository and not in the shell environment.
Generating one would have been the wrong answer: a new key is a different app
identity forever, and an installed app cannot be updated by a package signed
with anything else. It was found on disk at the path `ANDROID_KEYSTORE_PATH`
names, and **its certificate was compared with the previously delivered artefact
before anything was rebuilt**:

```
keystore  SHA256: 15:7A:2B:B1:33:F6:AA:3D:…:33:23:DE:BC   CN=Hangyul GaNaDa
old APK   digest: 157a2bb133f6aa3d…3323debc               ← same certificate
new APK   digest: 157a2bb133f6aa3d…3323debc               ← same certificate
```

No keystore, password or key value appears in this repository, in `result/`, or
in any log written during this build. A second keystore on the same machine
(`qa-not-for-store.jks`) carries a *different* certificate and was not used.

---

## Android APK — **PASS**

Built by `npm run mobile:sync` then `./gradlew assembleRelease bundleRelease`,
BUILD SUCCESSFUL. Copied to `hangyul-ganada-release.apk` **before** installation,
so the bytes tested and the bytes delivered are the same (`sha256` in
`checksums.sha256`).

| Check | Result |
| --- | --- |
| Built from the committed tree | `git rev-parse HEAD` = `7f21b03421fafbe795c9ea57406192bfc1ff97df`, recorded in `build-info.json` |
| Signed | Yes — the release keystore from `ANDROID_KEYSTORE_PATH`, not the debug key |
| Signature schemes | v2 ✓, v3 ✓ (v1 deliberately off — `minSdk` 24) |
| Certificate SHA-256 | `157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc` — the project's established release key, compared against the keystore *and* the superseded artefact before rebuilding |
| Certificate subject | `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` |
| Package / version | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0 |
| SDK levels | minSdk 24, targetSdk 36, compileSdk 36 |
| APK | 87,413,933 bytes, SHA-256 `e68f7a7803a0180fd861b0e806745a02c0562d59d02bb7740f587835d3e51fff` |
| AAB | 85,627,920 bytes, SHA-256 `40d2cf02d05ecb757bf1ccf67c2f746a46795523219c8e4e708c22400d98043d`, signed |
| Entries in the package | 13,978 |
| Permissions | INTERNET, VIBRATE and the Capacitor receiver guard — three, none of which prompts |
| Native libraries | none, so 16 KB page-size compatibility holds by construction |
| Interface locales in the package | 32, as 31 separate lazy chunks plus the bundled English |
| Vocabulary locales complete | 10 of 32; the other 22 carry the 600-word core band and fall back to English past it, and the picker says so before the learner chooses |
| Installed and opened | emulated Pixel 7, Android 16 — Home complete, Unit 10 *The combined vowels* reached, no `FATAL` and no ANR in `logcat` |

---

## The check this document exists for

The failure it was written against was *not* a broken build — it was that nobody
confirmed the packaged bundle contained the code. So it is confirmed by
unpacking the delivered APK and reading `assets/public`.

**This cycle's work — present:**

| Marker | What it proves is in the build | Found |
| --- | --- | --- |
| `93.9` in `assets/stroke-geometry-oFDEPQa4.js` | ㅙ's second upright at its re-authored x-position — a number that exists nowhere in the previous geometry | ✓ |
| `"count": 600` × 5 bands summing to 3,221 in `corpus/manifest.json` | the corpus this cycle grew | ✓ |
| `corpus/uz-1-4a22653bde60.json` holding `Kerakli narsalarni sotib oldim.` | the Uzbek core band, written this cycle | ✓ |
| 600 Uzbek meanings and 38 Uzbek long definitions in band 1 | and its *More about it* paragraphs | ✓ |
| `level-test/bank-a4ec5fc6.json`, 4,166 items | the bank rebuilt after 치닫다 was corrected | ✓ |
| `치달아요` in that bank | the correct ㄷ-irregular form | ✓ |
| `"uz": {"items": 1021, "ceiling": 30}` | the reach the core band bought a partial language | ✓ |
| `Ta'lim va mehnat` in `assets/locale-uz-OfI8y24G.js` | the Uzbek category renamed so it stops naming its own answer | ✓ |
| `Адамдар жана туугандар` in `assets/locale-ky-RYh3mVep.js` | and the Kyrgyz one | ✓ |
| `20260825-89f334b3` in `sw.js` | this cycle's audio build, so no worker can serve an older clip | ✓ |

**And what should no longer be in it:**

| Marker | Was | Found |
| --- | --- | --- |
| `치닫아요` | a level-test distractor that is not Korean | gone |
| `Адамдар жана үй-бүлө` | the Kyrgyz category that contained the answer to 가족 | gone |
| `O'qish va ish` | the Uzbek category that contained the answer to 공부 | gone |
| `elevenlabs`, `xi-api-key`, any key material | the retired TTS vendor | **none anywhere in the package** |

The two directions matter equally. Present markers prove the cycle is *in* the
package; absent ones prove what it replaced is *out* of it, which a table that
only looks for additions cannot tell you.

**And the letters were looked at, not only grepped.** The web bundle was
unzipped out of this APK, served back, and walked to the writing screen for each
of the seven combined vowels. ㅙ and ㅞ read as one letter, the reference glyph
agrees with the tracing guide agrees with the stroke demonstration, and the
screenshots are in `docs/report.pdf` §7.2. That is the defect this rebuild
exists for, checked in the artefact rather than in the source.

---

## Tests — **PASS**

Run from `7f21b034` with the working tree clean.

| Suite | Result |
| --- | --- |
| `npm run verify:quick` | 31 checks, **exit 0** |
| `npm run test` | **1,065 unit tests** — 789 web in 50 files, 180 Korean morphology, 96 handwriting — **all pass** |
| `npm run test:e2e` | **346 passed (20.1m)**, two projects, one worker, no retries, **exit 0** |
| `npm run screens:audit -- --check` | 17 routes and 6 states across 7 device profiles, 143 renders, **clean** |
| `npm run qa:locales` | 32 languages × 8 screens = 256 renders, **no measurable problem** |
| `npm run letters:face` | every taught letter against Pretendard — aspect, ink islands, 40 band profiles, upright anchors — **every letter has the face's parts, in the face's places** |
| `npm run examples:qa` | 3,221 sentences, **PASS 3,221 / REVIEW 0 / REWRITE 0** |
| `npm run korean:education:qa` | eleven composed gates, **all pass**, and it prints THIS DOES NOT PROVE NATIVE NATURALNESS on every run |
| `npm run leveltest:ambiguity` | 4,166 items, thirteen rules and six photographed regressions, **no findings** |
| `npm run leveltest:locale` | 32 languages, resolver and rendered, **no option resolved from another language** |
| `npm run locale:content:qa` | 12,800 simulated four-option questions across 32 languages — 5,694 askable, 7,106 refused for want of a meaning, **none in a language the learner did not choose** |
| `npm run vocabulary:translation:qa` | 187 shared sentences examined, 25 accepted merges in the ledger, **no card teaches less than the word it is for** |
| `npm run vocabulary:recommendation:qa` | 30,000 simulated recommendation events over 30 levels × 100 days, **0 short days** |
| `npm run audio:qa` | 13,110 voice slots over 13,006 files, **0 errors, 0 warnings** |
| `npm run locale:editorial` | **0 errors**, 38 warnings for a person to read |
| `npm run docs:consistency` | 19 figures across 5 documents, **no contradictions** |
| `npm run mobile:qa` | **14/14** on an emulated Pixel 7, against a debug build of this commit |
| `npm run mobile:qa:safe-area` | **60/60** across six device configurations |
| `npm run release:current` | **exit 0** — nothing outside `docs/` and the release directories has moved since the build |
| `npm run vocabulary:qa:target` | **FAILS** — 3,221 words against a stated 10,000. Left failing on purpose; see I-04. |

### What the suite still cannot do

It runs in Chromium on a desktop kernel. It does not run on a real Android
device, does not exercise the notification permission flow, and cannot see what
the app looks like on a phone with a physical notch. The safe-area behaviour is
asserted against simulated insets, which is the closest this machine gets.

---

## iOS — **NOT BUILT**

macOS and Xcode are unavailable in this environment. The Xcode project is
present and synced in `result/ios-project/`, and there is no code path anywhere
in this repository that renames anything to `.ipa`. See
`BUILD_OR_SIGNING_BLOCKERS.md`.

---

## What a reviewer should do with this

Re-run any row above. Every one of them is a single command, and the two that
matter most — `test:e2e` and unpacking the APK — need nothing but this
repository and the artefact beside this file.

---

## Checksums

```
e68f7a7803a0180fd861b0e806745a02c0562d59d02bb7740f587835d3e51fff  hangyul-ganada-release.apk
40d2cf02d05ecb757bf1ccf67c2f746a46795523219c8e4e708c22400d98043d  hangyul-ganada-release.aab
8d81040701f8a176fad51f42b3dab24425916fb805d88de56da74ed2be2c3fb2  docs/report.pdf
0d571cfad41524fd97ab4d86a4f6ab694c9c60c94a73ec76944fd47e3c3df024  build-info.json
```
