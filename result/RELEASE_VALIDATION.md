# Release validation

What was built, what was tested, and what was observed. Every gate reported here
was run on this machine for this build unless its own heading says *carried
forward*, and three sections do: the icon reading from build 14, the cold-start
recording from build 25 and the device walk from build 16. Nothing else is
inherited. Where something could not be verified it says so rather than being
left blank or implied.

**Source:** commit `384c245e` on branch `main`. `build-info.json` →
`source_state` reads `"dirty": false`: no product file differed from that commit
when the artefacts were built. `sourceState()` filters to product files, with the
same list `release:current` keeps, so it does not hash the delivery it is in the
middle of writing.

**Built:** 18 September 2026, Linux (WSL2), JDK 21, Android SDK build-tools
36.0.0, bundletool 1.18.1, Gradle 8.14.3, Node v24.19.0.

**This supersedes the versionCode 25 validation.** Codes 3 through 25 are spent,
each by an artefact that was actually produced. This is 26, and the marketing
version is **1.0.5** on every platform — the number the web product has carried
since the seventeenth pass and the native deliveries had not.

---

## Why this release happened

**The downloaded native apps were 1.0.4 while the web product was 1.0.5.** The
delivered APK and AAB were built from `420a8e57` on 12 September. Twenty-eight
commits of product work landed after them — 3,029 product files, among them
497 new words (the corpus went from 3,393 to 3,864), 2,089 new recordings, the
corpus re-read for sound rules and honorifics, the content-safety gate's
split-once and look-alike rules, the lazy-chunk failure screen, the
profile-read guard, the exercise-string register fixes in four languages — and
none of it reached a native package, because `cap sync` and the Gradle build
were never run again. The version gate documented the arrangement (the web may
lead, never lag) rather than failing on it, and three web-only passes recorded
the lag as a state instead of closing it.

The proof is one hash. Before this pass, `index.html` in
`apps/mobile/android/app/src/main/assets/public` and in
`apps/mobile/ios/App/App/public` both read `e4f0d6a0…` — the same file the
1.0.4 APK carries — while `apps/web/dist` on the same disk already read
`55b97222…`. The web moved; the copy into the native projects did not.

## What changed

| | |
| --- | --- |
| Version | **1.0.5** everywhere: `app.identity.json` (`version` 1.0.5, `buildNumber` 26), the mobile package and the lockfile's workspace entry, `MARKETING_VERSION` 1.0.5 in both Xcode configurations, three legal documents, `store/release-notes.md`, the report front matter. `config/product.ts` was already 1.0.5. `version:check` pins the literal as `RELEASE_VERSION`; `config/product.test.ts` pins the native literal the web may never fall behind |
| Build number | Android `versionCode` **26** — 25 is spent by the delivered artefacts and no `build-info.json` in the history goes above 25; neither store is registered, so nothing higher exists anywhere. iOS `CURRENT_PROJECT_VERSION` stays **25** by requirement: the iOS build number was to be left byte-for-byte unchanged, and it was — `app.identity.json` declares `currentProjectVersion: 25` beside `buildNumber: 26` so the gate can tell the deliberate difference from a drift |
| Xcode project | the diff of `project.pbxproj` is exactly the two `MARKETING_VERSION` lines. `DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE`, `PRODUCT_BUNDLE_IDENTIFIER`, `IPHONEOS_DEPLOYMENT_TARGET` (×4), `CURRENT_PROJECT_VERSION` (×2) and the 30 `knownRegions` are what they were, asserted setting by setting by the re-adopted `project-file.lock.json`. `Info.plist` is untouched; `CFBundleShortVersionString` resolves to 1.0.5 and `CFBundleVersion` to 25 |
| Native bundles | both `public/` directories deleted and re-synchronised from a fresh `dist` (`npm run mobile:sync`: build, `cap sync` for Android and iOS, prune). Nothing copied during the 1.0.4 release survives |
| Android lint | `gradlew lintRelease` had two pre-existing errors — `package_name` and `custom_url_scheme` reported as untranslated in 28 languages. They are identifiers, not copy; both now carry `translatable="false"`, and `check-mobile-identity.mjs` still holds their values. 0 errors after the fix (21 warnings, all in Capacitor's generated sources) |
| Learner data | no stored row changes shape in the native catch-up itself; the schema is 14, as it was for the web 1.0.5 release |

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | signed; 103,528,200 bytes (98.7 MB); sha256 in the Checksums block below and in `build-info.json` |
| `hangyul-ganada-release.aab` | signed; 101,309,812 bytes (96.6 MB); same. Byte-identical across the two release builds of this cycle (the lint fix changed no resource value), which is the AAB's usual behaviour; the APK's digest moves with its signing block |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24), read back with `apksigner verify --print-certs` on the delivered file; the AAB's JAR signature reads the same certificate with `keytool -printcert -jarfile` |
| Certificate | `157a2bb133f6aa3d…3323debc`, `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` — the existing production identity, the same fingerprint every previous release carries; **no key was generated or replaced** |
| Package | `com.talkhangyul.ganada`, version code **26**, versionName **1.0.5**, SDK 24–36, label `Hangyul Ganada` — read back with `aapt2 dump badging` on the APK and `bundletool dump manifest` on the AAB |
| Permissions | `INTERNET`, `VIBRATE`, the app's own `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — unchanged |
| Embedded web | the bundle under `assets/public/` in the APK and under `base/assets/public/` in the AAB hashes file for file to `apps/web/dist` — 16,436 files compared, 0 missing, 0 different; the same tree digest `ee97265d…` is read from the APK, the AAB, the Android `public/` and the iOS `public/`. The only files in the package and not in `dist` are Capacitor's own `cordova.js` and `cordova_plugins.js`; the only files in `dist` and not in the package are the four web-hosting files the prune removes (`sw.js`, `robots.txt`, `_redirects`, the Open Graph image). No entry name has a non-ASCII byte; the splash directory holds two PNGs and no video |
| In-app version | the packaged main chunk carries `version:"1.0.5"` and `displayVersion()` renders it as `v1.0.5`; the same chunk is in the iOS `public/` |
| Packaged content | `content:safety:bundle:check` over the APK and AAB unpacked, `dist/` and both native copies: 49,316 files, 1,690,108 fields, 40,210 Korean literals — **no packaged asset carries prohibited content** |
| iOS | **not built** — macOS and Xcode are unavailable here (**IOS BUILD BLOCKED — REQUIRES MACOS/XCODE**). The project is complete, is synchronised with this exact web build (`cap sync` reported `copy ios` against this `dist/`, and the iOS `public/` hashes to the same tree digest as the APK's bundle), and ships in `result/ios-project/` at **MARKETING_VERSION 1.0.5 / CURRENT_PROJECT_VERSION 25** in both configurations. No `.ipa` was approximated, nothing was renamed to one, and no signing identity, team, entitlement or bundle identifier was touched. The exact commands are in `BUILD_OR_SIGNING_BLOCKERS.md` §9 |

## What was run against this tree

| Suite / gate | Result |
| --- | --- |
| Freshness before the build | `content:fresh:check` (frequency, vocabulary, corpus, level test, dictionary), `curriculum:check`, `policy:runtime:check`, `tokens:check`, `letters:copy:check`, `copy:fresh:check`, `copy:generated:check` — every generated artefact equal to its source, exit 0 each, so nothing was regenerated and nothing stale went into the bundle |
| `npm run typecheck` · `npm run lint` · `npm run test` | exit 0 each; unit suites web **1,570**, content safety **1,298**, Korean morphology **242**, handwriting core **96** — **3,206**, all passing |
| `npm run version:check` · `mobile:identity:check` · `ios:project:check` · `locales:native:check` | exit 0 each; the version gate prints one pending line, for a person with Xcode, and it is the archive |
| `gradlew clean assembleRelease bundleRelease` | exit 0, 2m 16s, from `384c245e` with the production keystore exported into the shell |
| `gradlew lintRelease` | exit 0 after the fix above (exit 1 before it, two errors) |
| `npm run native:bundle:check` | the app inside the package is the app that was built — 16,436 compared, 0 missing, 0 different, 4 of 4 web-only files pruned |
| `npm run splash:bundle:check` | every launch frame comes from the approved artwork; no mark, no words, one ground |
| `npm run content:safety:bundle:check` | no packaged asset carries prohibited content |
| `npm run test:e2e` | **638 passed, 2 failed** in the full chained run (exit 1, 57.3 min, 640 cases across the mobile and desktop projects, on the delivered tree): `journey.spec.ts:453` (*every practice typeface traces the one canonical glyph*) hit its 60 s budget and `offline.spec.ts:108` (*a pronunciation that has been played once plays again offline*) got `Failed to fetch` from the preview server, both in the desktop project in the last hour of the run while the machine was at 424 MB free. **Re-run alone, both pass** — exit 0, 52.9 s and 2.7 s; the first sits just under its budget, which is what a timeout under load looks like. `dist` was hashed after the suite's own rebuilds and is byte-identical to the bundle that was packaged (tree digest `9fd59e98…`) |
| `npm run release:current` | both delivery manifests built from `384c245e`, which is HEAD; the working tree dirty only in docs and the release directories — 0 errors |
| `npm run verify:release`, the rest | run gate by gate on this tree (the chain built from `package.json` less `name:check` and `test:e2e`, 118 steps) — **every step exit 0** on its final run. Three were red once and are recorded as such: `quotes:review:check` (a generated evidence document a timestamp behind its source since the twentieth pass — regenerated, green), `audio:qa` (one sampled clip reported *Conversion failed!* from ffmpeg with the VM at 66 MB free; the clip decodes cleanly by hand and the gate is green on re-run) and `npm test` (one `strokeMarkers.test.ts` case over its 5 s budget — a different case each time, 2.4–3.0 s of wall clock, on a VM shared with other sessions' Playwright runs; 3,206 of 3,206 on the quiet re-run). Fourteen steps after `audio:qa` were run in a second loop because the first loop's stdin was consumed by a python gate; all fourteen green. `docs:consistency:check` and `issues:check`, which read this document, were re-run last after it was finished |

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

## Cold start on the emulator — carried forward from build 25, not re-run for 26

The launch screen resources did not change between 25 and 26 —
`splash:bundle:check` reads the same adaptive `splash_icon` and the same five
wordless layers out of this APK — so the recording from build 25 still
describes what this package draws. It was **not** re-run: an emulator holds
~2.4 GB on this machine and the release verification had to run beside it.

Recorded then, not reasoned about: `scripts/qa-cold-start-android.sh` installs
the package on the API 36 emulator (`hangyul-pixel7`, headless, software
rendering), force-stops it, starts `screenrecord`, launches the activity with
`am start -W`, and extracts a frame every 200 ms.

| Start | Frames, in order | Frame means (RGB) |
| --- | --- | --- |
| 1.0.4 build 25, clean install | launcher → the system's launch cross-fade (one frame) → peach ground with the soft disc → the artwork → Home | 79·82·95 → 127·125·129 → 250·236·216 → 248·216·186 → 246·237·228 |
| 1.0.4 build 25, force-stop then start | launcher → disc → artwork → Home; `am start -W` TotalTime 3,756 ms | 79·82·95 → 250·236·217 → 248·216·186 → 245·236·227 |
| 1.0.4 build 25, upgrade install over 1.0.6 | disc → artwork → Home; first launch after the install took 21.8 s to display on this emulator, and about 0.6 s after the artwork appeared the disc frame recurs for three frames before Home, with `Activity transferring splash screen timeout` in logcat at that moment — not reproduced on the clean or force-stop start | 250·236·217 → 248·216·186 → 250·236·216 → Home |

No frame is white, black, or carries the old mark. The frames are in
`docs/report-assets/coldstart-*.png`; §20Z.2 of the report reads them.

## On a device — carried forward from build 16, not re-run for 26

**Read the version line below before the rest of this section.** The walk
recorded here was driven against **versionCode 16 / 1.0.3**, which is what its
own `dumpsys` output says, and it has not been repeated since. It is kept
because every screen it describes is still in this delivery; it is *not*
evidence about the bytes in this build, and this build carries 497 words,
2,089 recordings and several screens the walk never saw. **The next person
with a device or a machine that can hold an emulator should walk build 26
before it goes to a store**: the version line under Settings (`v1.0.5`), a
word added after 3,393 (the corpus is 3,864), and a screen whose chunk is
refused offline are the three things that changed and can only be seen
running.

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

* **No iOS build.** No `.ipa` exists and none was approximated. The project
  carries 1.0.5 / 25 and its `public/` is the same bundle the APK carries; the
  archive is a Mac's to make (§9 of the blockers document), and the in-app
  `v1.0.5` on iOS is therefore a statement about the synchronised bundle, not
  about a running device.
* **No native-speaker review** of the thirty-one non-Korean bundles, or of
  Korean. Every rule in `sentence_demand.py` and in `leveltest:policy` is
  structural, and structural is a proxy for a judgement no gate here makes:
  **nothing in this repository reads Korean.** See
  `BUILD_OR_SIGNING_BLOCKERS.md` §10 and issue I-17.
* **The difficulty scale has never been calibrated against a learner**, and it
  cannot be from here — the application opens no network connection at runtime
  and collects nothing.
* **No device walk of this build.** The walk above is build 16; the cold-start
  recording is build 25. Neither was re-run, for the memory reason given.
* **The icons were reviewed as renders, not on a home screen.**
* **No clip was listened to** in this pass; the 2,089 recordings added since
  build 25 were checked structurally by `audio:qa` and `audio:pronunciation`
  in the passes that added them.

## Checksums

```
8f1492a5f8d783c2432ac8559190e72767760f4250793fa5bfc3787f6845eeaf  hangyul-ganada-release.apk
8e65f27cf86f538b3e6999601cacf3baa6d635d6e1d72f9da2bd880ca1c902e3  hangyul-ganada-release.aab
42946d53665ae5acab746ed28070d85ae30d884162947e5699b0277d4a8a1d73  docs/report.pdf
6faf354036c5502f497d9417499232b9d5b0196152a30e82e61a83fabd2db645  build-info.json
```
