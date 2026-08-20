# Release validation

What was built, what was tested, and what was observed. Every line below is
something that was run on this machine during this refresh; nothing is carried
over from an earlier cycle. Where something could not be verified it says so
rather than being left blank or implied.

**Source:** commit `deda959` on branch `premium-quality-pass`, working tree clean
apart from a `gradlew.bat` line-ending difference that predates this task.
**Built:** 2026-08-20, Linux (WSL2), JDK 21.0.11, Android SDK build-tools 36.0.0.
**Device:** `hangyul-pixel7` AVD, Android 16 (API 36), x86_64, 1080×2400,
software GPU, wiped before install.

**This supersedes the 19 August validation of `a7cc604`.** The artefacts it
described have been replaced, and their filenames changed with them — see
"Filenames" below.

---

## Why this rebuild happened

The previous two product reports both closed with the same P0: the signed
artefacts on disk predated every fix those reports described. `docs/report.md`
verified it directly, by unpacking the APK and finding that the storage
capability probe and the dark-mode hover token were not in it.

This rebuild exists to close that. The order matters and was followed: **commit
first, then build from the commit.** Building from a dirty working tree produces
a signed artefact that looks current and is not, which is worse than a stale one
because nothing about it says so.

## Android APK — **PASS**

Built by `npm run mobile:sync` then `./gradlew assembleRelease bundleRelease`,
BUILD SUCCESSFUL. Copied to `hangyul-ganada-release.apk` **before** installation,
so the bytes tested and the bytes delivered are the same (`sha256` in
`checksums.sha256`).

| Check | Result |
| --- | --- |
| Built from the committed tree | `git rev-parse HEAD` = `deda959…`, recorded in `build-info.json` |
| Signed | Yes — release keystore from `ANDROID_KEYSTORE_PATH`, not the debug key |
| Signature schemes | v2 ✓, v3 ✓ (v1 deliberately off — `minSdk` 24) |
| Certificate SHA-256 | `157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc` — the project's established release key, unchanged |
| Package / version | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0 |
| SDK levels | minSdk 24, targetSdk 36, compileSdk 36 |
| Installed | `adb install -r` → Success |
| Launched | `MainActivity` reached `topResumedActivity` |
| Crashes | None. No `FATAL EXCEPTION` and no app entry in `AndroidRuntime` for the session |

### The check that was missing last time

The failure this rebuild exists to fix was *not* that a build was broken — it
was that nobody confirmed the packaged bundle contained the code. So it is now
confirmed by unpacking the delivered APK and grepping `assets/public`:

| Marker | What it proves is in the build | Found |
| --- | --- | --- |
| `capability-probe` | the storage write/read probe — the false-warning fix | ✓ |
| `surface-hover` | the dark-mode hover token | ✓ |
| `showMoreHint` | the hint ladder | ✓ |
| `hintLevel` | graded hint scoring in the memory model | ✓ |
| `nextStep` | the Hangyul hand-off | ✓ |
| `Tiếng Việt` · `ไทย` | the two new interface languages | ✓ |

This table is the point of the whole document. Any future release should
reproduce it against whatever that cycle changed.

### Smoke test, on the installed APK

| What | Evidence |
| --- | --- |
| Home renders | Brand, streak, unit card, Letters/Words counters, review row, quote |
| **First-run purpose line** | "Learn Korean from the very first letter — Hangul, then the words you will actually use." Present on a wiped install, which is the only place it should be |
| Lesson opens | Unit 1 intro card, then ㅏ |
| **Stroke demonstration** | ㅏ drawn cleanly; markers 1 and 2 sit on their own stroke tips; no wedge, no spike, no early ink |
| Navigation | Bottom bar renders and highlights the active tab |

## What this does not claim

* **Not tested on physical hardware** — one x86_64 emulator with a software GPU.
  A "System UI isn't responding" dialog appeared once during first boot; it names
  System UI, not this app, and the app's own activity stayed resumed behind it.
  It is an artefact of a freshly wiped image on a software renderer.
* **No audio was listened to.** Nobody heard a clip.
* **No handwriting was drawn** on the device; the canvas was not exercised
  through touch input here.
* **No Vietnamese or Thai run-through on the device.** Both were verified in the
  browser at a phone viewport and by the end-to-end suite; the packaged APK was
  only confirmed to *contain* them.
* **Nothing was validated for iOS.** See `BUILD_OR_SIGNING_BLOCKERS.md` — no
  macOS, no Xcode, no signing identity, therefore no IPA. The Xcode project in
  `ios-project/` is synced with this web build and is not a release artefact.

## Web suites, run on the same commit

| Suite | Result |
| --- | --- |
| `verify:quick` | **PASS** — 14 checks including lint, typecheck, unit, build, bundle budget, routing |
| Unit (`vitest`) | **573 passed** |
| Handwriting core | **95 passed** |
| End-to-end (`playwright`) | **228 passed** — 114 × mobile and desktop projects |
| `strokes:qa:check` | 73 items, 269 strokes, 1,345 frames — **PASS** |
| `strokes:visual:check` | the same 1,345 frames rasterised — **PASS**, 18 sub-threshold findings reported |

## Filenames

The delivered artefacts are now `hangyul-ganada-release.apk` and `.aab`, which is
what `scripts/build-result.mjs` has always written. The files this replaces were
`HangyulGaNaDa-release.*` — an older spelling of the product name, produced by an
earlier release process and never repackaged.

That mismatch had a consequence worth recording: `docs:consistency` looked for
the current name, found nothing, and reported the APK and AAB sizes as "not built
yet, skipped" on every run for two cycles, with a 63 MB APK sitting in the
directory it was looking in. It now matches by extension and reports both.

## Contents

| Item | Size | Note |
| --- | --- | --- |
| `hangyul-ganada-release.apk` | 63.0 MB | rebuilt this cycle from `deda959` |
| `hangyul-ganada-release.aab` | 61.8 MB | rebuilt this cycle from `deda959` |
| `android-project/` | — | re-copied from `apps/mobile/android`, minus `build/`, `.gradle/`, `.kotlin/`, `local.properties`, keystores |
| `ios-project/` | — | re-copied from `apps/mobile/ios`, minus `build/`, `Pods/`, `xcuserdata/`, `DerivedData/` |
| `docs/report.pdf` | 1.3 MB | regenerated this cycle |
| `store/` | unchanged | listing material, not a build output |

`checksums.sha256` covers the APK, the AAB, `docs/report.pdf` and
`build-info.json`.

## One thing the packaging script could not finish

`build-result.mjs` expects a `## Checksums` fenced block in this file to rewrite,
and this file does not have one — the checksums live in `checksums.sha256`, which
the script writes directly and which is the file anyone would actually verify
against. The script exits non-zero on that, after having written every artefact.
Either the block should be added here or the expectation dropped; it is recorded
rather than worked around.
