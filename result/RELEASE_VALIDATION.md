# Release validation

What was built, what was tested, and what was observed. Every line below is
something that was run on this machine during this refresh; nothing is carried
over from an earlier cycle. Where something could not be verified it says so
rather than being left blank or implied.

**Source:** commit `40c5e6d` on branch `premium-quality-pass`, working tree
clean — the `gradlew.bat` line-ending difference that earlier validations noted
as the one exception was committed alongside the Gradle change in that same
commit.
**Built:** 2026-08-20, Linux (WSL2), JDK 21.0.11, Android SDK build-tools 36.0.0.
**Device:** `hangyul-pixel7` AVD, Android 16 (API 36), x86_64, 1080×2400,
software GPU, wiped before install.

**This supersedes the earlier validation of `deda959`.** Those artefacts were
correct for their commit and are four commits behind this one; they have been
replaced. The filename change recorded under "Filenames" below happened in that
earlier rebuild and still stands.

---

## Why this rebuild happened

Four commits of product work landed after the last artefacts were built:
Vietnamese and Thai finished to all 2,581 words, eleven glosses pinned to the
sense their own example demonstrates, the *More about it* block rewritten from
derived dictionary fragments into 25 authored explanations in ten languages, a
render-time hint filter, and `vi`/`th` added to the Android resource
configuration. An artefact that predates any of that is the P0 this document
exists to keep closed.

The order matters and was followed again: **commit first, then build from the
commit.** Building from a dirty working tree produces a signed artefact that
looks current and is not, which is worse than a stale one because nothing about
it says so. `build-info.json` records `40c5e6d`, which is the tip.

### The signing key was recovered, not regenerated

The release keystore is not in this repository and not in the shell environment,
and the obvious next step — generate one — would have been the wrong one: a new
key is a different app identity forever. It was found in the environment
instead, and **its certificate was compared with the previously delivered
artefact before anything was rebuilt**:

```
keystore  SHA256: 15:7A:2B:B1:33:F6:AA:3D:…:33:23:DE:BC   CN=Hangyul GaNaDa
old APK   digest: 157a2bb133f6aa3d…3323debc               ← same certificate
new APK   digest: 157a2bb133f6aa3d…3323debc               ← same certificate
```

No keystore, password or key value appears in this repository, in `result/`, or
in any log written during this build. A second keystore on the same machine
(`qa-not-for-store.jks`) carries a *different* certificate and was not used.

## Android APK — **PASS**

Built by `npm run mobile:sync` then `./gradlew assembleRelease bundleRelease`,
BUILD SUCCESSFUL. Copied to `hangyul-ganada-release.apk` **before** installation,
so the bytes tested and the bytes delivered are the same (`sha256` in
`checksums.sha256`).

| Check | Result |
| --- | --- |
| Built from the committed tree | `git rev-parse HEAD` = `40c5e6d…`, recorded in `build-info.json` |
| Signed | Yes — release keystore from `ANDROID_KEYSTORE_PATH`, not the debug key |
| Signature schemes | v2 ✓, v3 ✓ (v1 deliberately off — `minSdk` 24) |
| Certificate SHA-256 | `157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc` — the project's established release key, compared against the keystore *and* the superseded artefact before rebuilding |
| Package / version | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0 |
| SDK levels | minSdk 24, targetSdk 36, compileSdk 36 |
| Packaged locales | `de es fr ja ko pt th vi` — `th` and `vi` are new; the resource list had been left at eight while the app shipped ten |
| Vocabulary locales complete | all 10, counted from the emitted packs rather than read off the corpus field |
| Installed | `adb install -r` → Success |
| Launched | `MainActivity` reached `topResumedActivity` |
| Crashes | None. No `FATAL EXCEPTION` and no app entry in `AndroidRuntime` for the session |

### The check that was missing last time

The failure this rebuild exists to fix was *not* that a build was broken — it
was that nobody confirmed the packaged bundle contained the code. So it is now
confirmed by unpacking the delivered APK and grepping `assets/public`:

**This cycle's work:**

| Marker | What it proves is in the build | Found |
| --- | --- | --- |
| `the engine of Korean vocabulary` | the written *More about it* text for 하다, in English | ✓ |
| `พยางค์เดียวกันนี้ยังเป็นคำว่าชา` | the same block for 차, in Thai — so it is not English-only | ✓ |
| `theo giới tính của người nói` | the same block for 오빠, in Vietnamese | ✓ |
| `thỏa thích` | 마음껏, corpus index 1,860 — Vietnamese past the old 500-word cut | ✓ |
| `เทิดทูนรับใช้` | 받들다, the last word in the corpus, in Thai | ✓ |
| `a word, a remark` · `to be few, to be little` | two of the eleven pinned glosses | ✓ |
| `첫 글자는 ‘` | the corrected Korean first-letter hint | ✓ |

**And what should no longer be in it** — the derived dictionary fragments the
*More about it* block used to carry:

| Marker | Was under | Found |
| --- | --- | --- |
| `prophase` | 전기 | gone |
| `phylum` | 문 | gone |
| `straw thatch` | 새 | gone |

**Earlier cycles, confirmed still present:** `capability-probe` (the storage
write/read probe), `showMoreHint` (the hint ladder), `Tiếng Việt`.

One thing this table cannot show: `usableHints`, the render-time filter that
drops a hint rung which would give the answer away, is code and is minified to
nothing greppable. It is held by `hints.test.ts`, not by this table, and that is
stated here rather than papered over with a marker that proves something else.

This table is the point of the whole document. Any future release should
reproduce it against whatever that cycle changed.

### Smoke test, on the installed APK

Emulator wiped before install; APK copied into `result/` before installation, so
the bytes tested are the bytes delivered.

| What | Evidence |
| --- | --- |
| Installs | `adb install -r` → Success |
| Launches and stays up | `MainActivity` reached `topResumedActivity` and was still `topResumedActivity` at the end of the session |
| Crashes | **None** — zero `FATAL EXCEPTION` in the whole logcat |
| Home renders | Brand, streak, purpose line, Unit 1 card with its six vowels and progress ring, Start now, Letters 0/40 and Words 0/10, review row, Today's words row, bottom bar with the active tab marked |
| **First-run purpose line** | "Learn Korean from the very first letter — Hangul, then the words you will actually use." Present on a wiped install, which is the only place it should be |
| Words tab | Opens: Today's words 0/10, Saved words, search, and the topic grid |
| Search | Accepts input and reports "Nothing matches …" for a non-word |

**What was not reached, and why.** Navigation past the Words screen was
abandoned: the emulator raised *System UI isn't responding* and then *Process
system isn't responding*, both naming Android's own processes rather than this
app, on a freshly wiped image running a software renderer on a loaded machine.
The app's activity stayed resumed behind both dialogs and never crashed. So the
device evidence stops at "installs, launches, renders its first two screens
correctly, does not crash" — and the *More about it* block, the pinned glosses
and the finished Vietnamese and Thai copy are evidenced by the marker table
above (they are **in** the delivered package) and by the browser and end-to-end
suites (they **render**), not by a screenshot from this device. That split is
the same one the last cycle recorded and it is stated rather than glossed.

## What this does not claim

* **Not tested on physical hardware** — one x86_64 emulator with a software GPU,
  which wedged twice during the session. See the note under the smoke test: both
  dialogs name Android's own processes, the app stayed resumed behind them, and
  the consequence is that on-device evidence is thinner this cycle than last,
  not that something was found wrong.
* **No audio was listened to.** Nobody heard a clip.
* **No handwriting was drawn** on the device; the canvas was not exercised
  through touch input here.
* **No Vietnamese or Thai run-through on the device.** Both were verified in the
  browser at a phone viewport and by the end-to-end suite; the packaged APK was
  only confirmed to *contain* them — including, this cycle, words past the old
  500-word cut and the newly written *More about it* text in both languages.
* **No word screen was opened on the device**, so the *More about it* block was
  not seen rendered on Android. It is in the package and it renders in the
  browser and in `wordDefinition.test.tsx`.
* **Nothing was validated for iOS.** See `BUILD_OR_SIGNING_BLOCKERS.md` — no
  macOS, no Xcode, no signing identity, therefore no IPA. The Xcode project in
  `ios-project/` is synced with this web build and is not a release artefact.

## Web suites, run on the same commit

| Suite | Result |
| --- | --- |
| `verify:quick` | **PASS** — 15 checks including lint, typecheck, unit, build, bundle budget, routing, and the new sense QA |
| Unit (`vitest`) | **589 passed** |
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
| `hangyul-ganada-release.apk` | 63.1 MB | rebuilt this cycle from `40c5e6d` |
| `hangyul-ganada-release.aab` | 61.8 MB | rebuilt this cycle from `40c5e6d` |
| `android-project/` | — | re-copied from `apps/mobile/android`, minus `build/`, `.gradle/`, `.kotlin/`, `local.properties`, keystores |
| `ios-project/` | — | re-copied from `apps/mobile/ios`, minus `build/`, `Pods/`, `xcuserdata/`, `DerivedData/` |
| `docs/report.pdf` | 1.3 MB | regenerated this cycle |
| `store/` | unchanged | listing material, not a build output |

`checksums.sha256` covers the APK, the AAB, `docs/report.pdf` and
`build-info.json`.

## Checksums

```
a472d2e5875bdcbf321384bb19e60266cd59a488641a424702f7f3c0dc1d2188  hangyul-ganada-release.apk
29c2b59888e707a47b7e8aee36ec7317e0e46bc25a165d3a8faeda5ca5d04959  hangyul-ganada-release.aab
83e98cbf01fef7cadd4a0fb9c8e5ec4b0f6d600431b8f5e77f83525acee9bfb5  docs/report.pdf
b5875c3c87cf9ee36a93082e76c3118b094ea684facc3209a2265026f7903588  build-info.json
```

The block above is **rewritten by `build-result.mjs`** from the digests it has
just computed, not maintained by hand — a hand-copied digest goes stale on the
first rebuild, and `build-info.json` changes every time because it records when
it was built. `checksums.sha256` in this directory carries the same values in
the format `sha256sum -c` expects.

The last cycle recorded that this block was missing and that the script exited
non-zero on it *after* having already written every artefact — so the delivery
directory was correct and the command reported failure. It exists now, which is
the half of that finding that was actually a defect.
