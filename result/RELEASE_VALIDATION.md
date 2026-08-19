# Release validation

What was built, what was tested, and what was observed. Every line below is
something that was run on this machine during this refresh; nothing is carried
over from an earlier cycle. Where something could not be verified it says so
rather than being left blank or implied.

**Source:** commit `a7cc604` ("stroke have improved"), working tree clean apart
from a `gradlew.bat` line-ending difference that predates this task.
**Built:** 2026-08-19, Linux (WSL2), JDK 21.0.11, Android SDK build-tools 36.0.0,
bundletool 1.18.1.
**Device:** `hangyul-qa` AVD, Android 16 (API 36), x86_64, 1080×2400, software GPU.

---

## Android APK — **PASS**

`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`, copied to
`HangyulGaNaDa-release.apk` **before** installation, so the file that was tested
and the file delivered here are the same bytes (`sha256` in
`checksums.sha256`).

| Check | Result |
| --- | --- |
| Built from current source | `npm run mobile:sync` then `./gradlew clean assembleRelease bundleRelease`, BUILD SUCCESSFUL in 2m |
| Signed | Yes — release keystore from `ANDROID_KEYSTORE_PATH`, not the debug key |
| Signature verified | `apksigner verify --print-certs`: **Verifies**, v2 ✓, v3 ✓ (v1 deliberately off — `minSdk` 24) |
| Certificate | `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR`, RSA 4096 |
| Certificate SHA-256 | `157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc` |
| Package / version | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0 |
| SDK levels | minSdk 24, targetSdk 36, compileSdk 36 |
| Installed | `adb install -r HangyulGaNaDa-release.apk` → Success |
| Launched | `MainActivity` reached `topResumedActivity`; `Displayed … +2s438ms` |

### Smoke test, on the installed APK

| What | Evidence |
| --- | --- |
| Home | Renders in full: streak, unit card, Letters/Words counters, review row, quote |
| Lesson opens | Letters → "Consonant meets vowel" → unit intro → 가 |
| **Latest stroke renderer present** | 가's demonstration draws the current centreline paths with round caps and the numbered markers 1–3 — the renderer introduced after the last release, so the binary is current |
| **가** | Composition matches the reference glyph above it |
| **어** | ㅇ and ㅓ composed **in contact**, matching the reference — the fix from the final composition pass |
| **오** | ㅇ above ㅗ in contact, "Write ㅇ first, then ㅗ underneath" |
| **밥** | 받침 block renders correctly, guide and demonstration both |
| Handwriting canvas | Four swipes drew ink that followed the finger |
| Grading | Check returned "Not quite" with real feedback, including "You used 4 strokes; this letter is usually written in 3" |
| Writing-first layout | Canvas, Undo/Clear and Check all above the fold; demonstration below |
| Audio | Speaker tap produced `AAudioStream_requestStart(…) returned 0` and AudioFlinger mixing |
| Safe area | Check button clear of the gesture bar; content clear of the status bar |
| **Android system Back** | From deep inside a lesson, **one** press → Home (not the previous screen) |
| Back on Home | Exit dialog: "Leave Hangyul ganada?" · Stay / Leave |
| Back on the dialog | Dialog dismissed, app still running (pid unchanged, `MainActivity` still resumed) |
| Persistence | After `force-stop` + relaunch: streak "1 day", "This week 1 of 7 · 1 min", "3 reviews ready / 6 letters to finish" all survived |

### One ANR, investigated and attributed

The first launch raised "Hangyul ganada isn't responding". It was investigated
rather than retried, because an ANR in a release binary is not something to wave
through:

* `dumpsys window lastanr` reason: **"Input dispatching timed out … Waited
  5000ms for FocusEvent(hasFocus=true)"** — a window-focus timeout, not a
  blocked worker.
* The app's own main thread in the bugreport is `Native … epoll_pwait` inside
  the normal Looper, with `utm=45 stm=27` — 0.7 s of CPU used in total. It was
  idle, not stuck.
* The emulator's load average at that moment was **47**, because the AVD had
  just been `-wipe-data`'d and Play Services was updating every system package
  at once. `com.android.vending`, `com.google.android.as` and
  `com.google.android.gms.persistent` **also ANR'd** in the same window.
* After a warm reboot and letting the load fall below 4, the app was launched
  repeatedly and `dumpsys window lastanr` recorded **no new ANR**. Every check
  in the table above was then performed on that settled device.

Attributed to emulator contention during first boot. Not reproduced once the
device was idle. No app-side fix was made, and none is implied.

---

## Android AAB — **PASS**

`HangyulGaNaDa-release.aab`, the same file delivered here.

| Check | Result |
| --- | --- |
| Built from current source | `./gradlew bundleRelease` in the same invocation as the APK |
| Bundle structure | `bundletool validate` — valid, one feature module (`base`) |
| Application id | `com.talkhangyul.ganada` |
| Version | versionCode 1, versionName 1.0.0 |
| Target SDK | 36 (`bundletool dump manifest --xpath …targetSdkVersion`) |
| Assets present | 10 455 audio entries in the bundle, plus the subset Pretendard faces and the web bundle |
| Signed | Yes — `jarsigner -verify`: **jar verified**, same certificate as the APK |
| APK set from **this** AAB | `bundletool build-apks --connected-device`, 66 271 562 bytes |
| Installed from that set | `bundletool install-apks` → base.apk + `split_config.xxhdpi.apk` |
| Launched | `MainActivity` resumed, Home rendered, no ANR recorded |

The install was done after `adb uninstall`, so it was a clean install of the
bundle's own output rather than an update over the APK.

**Not Play-upload-signed.** See the blocker note — the key is the project's
established release key, but it is self-signed and has never been registered
with a Play console.

---

## iOS — **EXTERNAL BLOCKER**

| Check | Result |
| --- | --- |
| Project synchronised with current source | Yes — `cap sync ios` copied this build's `dist` into `App/App/public`, timestamps match `apps/web/dist` |
| Capacitor plugins resolved | 5 plugins written into `Package.swift` (App, Haptics, Keyboard, LocalNotifications, SplashScreen) |
| Bundle id | `com.talkhangyul.ganada` |
| Version / build | MARKETING_VERSION 1.0.0, CURRENT_PROJECT_VERSION 1 |
| Xcode archive | **Not attempted** — no macOS, no Xcode on this machine |
| Signing / provisioning | **Not available** — no Apple Developer identity here |
| IPA exported | **No.** `result/` contains no `.ipa`, and no placeholder was created |
| Delivered instead | `result/ios-project/`, refreshed from the synced project this cycle |

There is no stale IPA to remove: none was present before this refresh and none
was produced.

---

## Artefacts

| File | Size | Current |
| --- | --- | --- |
| `HangyulGaNaDa-release.apk` | 62.9 MB | rebuilt this cycle |
| `HangyulGaNaDa-release.aab` | 61.7 MB | rebuilt this cycle |
| `android-project/` | 81 MB | re-copied from `apps/mobile/android`, minus `build/`, `.gradle/`, `.kotlin/`, `local.properties`, keystores |
| `ios-project/` | 81 MB | re-copied from `apps/mobile/ios`, minus `build/`, `Pods/`, `xcuserdata/`, `DerivedData/` |
| `docs/report.pdf` | unchanged | not regenerated — outside this task's scope |
| `store/` | unchanged | listing material, not a build output |

`checksums.sha256` covers the APK, the AAB and `docs/report.pdf`, and was
verified with `sha256sum -c` after being written.

---

## What this does not claim

* Not tested on physical hardware — one x86_64 emulator with a software GPU.
* Audio was confirmed to reach the platform mixer; nobody listened to it.
* The web suites (`verify:quick`, 122 Playwright tests) passed before this
  build, but they were not re-run as part of it.
* Store readiness is a separate question from build validity: neither store
  identifier has been registered yet.
