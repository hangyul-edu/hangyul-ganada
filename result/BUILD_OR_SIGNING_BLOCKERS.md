# Blockers

What could not be completed here, why, and exactly what would unblock each one.

Nothing on this list was worked around, faked, or quietly downgraded. Where a
credential is missing the artefact is absent rather than approximated, and where
a URL does not exist the field is empty rather than invented.

Re-checked on 2 September 2026 against the v1.0.2 rebuild from the working
tree over commit `3833da71` (uncommitted; see the source fingerprint in
`build-info.json`). Every item below still stands, unchanged: none of them is a
build problem and none can be cleared from this machine. The Android artefacts
were rebuilt and signed with the existing production identity this cycle — see
`RELEASE_VALIDATION.md`.

---

## 1. iOS — no IPA · **EXTERNAL BLOCKER**

**What is missing:** macOS, Xcode, and an Apple Developer signing identity.

Building an `.ipa` requires all three. This environment is Linux (WSL2); Xcode
does not exist for it, and no supported cross-compiler produces a signed iOS
application bundle. A `.ipa` is a signed archive, not a zip with a different
extension, so there is no honest way to produce one from here.

**What was done instead:** the Xcode project is complete and is delivered in
`result/ios-project/`. It is synced with this exact web build, resolves all
seven Capacitor plugins over SwiftPM, and carries the two things a first
submission is usually missing:

* `App/App/PrivacyInfo.xcprivacy` — `NSPrivacyTracking` false, no collected data
  types, and one required-reason API (`NSPrivacyAccessedAPICategoryFileTimestamp`,
  reason `C617.1`) declared because `@capacitor/filesystem` reads a modification
  time when the learner exports their progress. The audit behind it, plugin by
  plugin, is `store/app-store/privacy-manifest-audit.md`.
* `App/App/Info.plist` — corrected this cycle: `UIRequiredDeviceCapabilities` is
  `arm64` rather than the template's `armv7`, `ITSAppUsesNonExemptEncryption` is
  false so App Store Connect stops asking, and the declared orientations now
  match what `HangyulViewController` enforces at runtime.

**To unblock:**

```bash
# On a Mac with Xcode 26 (the SDK Apple requires from 28 April 2026):
npm ci && npm run mobile:sync
cd apps/mobile/ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/ipa
```

An Apple Developer Program membership, a distribution certificate and a
provisioning profile for `com.talkhangyul.ganada` are needed for the export step
to be signed.

---

## 2. Play upload key · **CREDENTIAL REQUIRED**

**What exists:** the delivered APK and AAB are genuinely signed, with a real
4096-bit RSA key, and `apksigner` verifies them under schemes v2 and v3.
Certificate SHA-256:

```
157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc
CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR
```

**What is missing:** that keystore was generated in this environment. It is
**not the upload key Google Play knows this app by**, because the app has never
been uploaded and no upload key has been registered.

This matters and is easy to get wrong. Once an app is published, Play permanently
associates it with an upload certificate; a build signed with a different key is
rejected. So the key here must not be treated as the production identity by
default — whoever makes the first upload decides whether to register this
certificate or generate the real one.

**To unblock:** create the app in Play Console, enrol in Play App Signing, and
either register this certificate as the upload key or generate a new keystore.
The build reads the keystore entirely from the environment, so no code changes:

```bash
export ANDROID_KEYSTORE_PATH=/secure/path/upload.jks
export ANDROID_KEYSTORE_PASSWORD=…
export ANDROID_KEY_ALIAS=…
export ANDROID_KEY_PASSWORD=…
cd apps/mobile/android && ./gradlew assembleRelease bundleRelease
```

**No keystore, password or key is in this repository or in `result/`.**

---

## 3. Neither store identifier is registered · **MANUAL CONSOLE ACTION REQUIRED**

`com.talkhangyul.ganada` is proposed and used consistently by both native
projects. It is **not reserved** in Play Console or App Store Connect —
`apps/mobile/app.identity.json` records both as `false`, and that file is the one
place either project reads its identity from, so changing it changes both.

An identifier cannot be changed after the first publish. Reserving it is the
first console action.

---

## 4. Privacy policy and support URLs · **EXTERNAL HOSTING REQUIRED**

App Store Connect requires a support URL and a privacy policy URL before
submission; Play requires a contact email and, in practice, a privacy policy URL.

No domain has been registered for this product, so none of them is set — and
none was invented. A privacy policy link that returns 404 is worse for a
customer than a field that is empty, because an empty field cannot be submitted
by accident.

The pages themselves are written and delivered in `result/docs/legal/`:

| Page | File |
| --- | --- |
| Privacy policy | `privacy-policy.md` |
| Support | `support.md` |
| Content sources and licences | `licences.md` |

All three are also *inside* the app and readable offline. Hosting them is
transcription, not authorship.

---

## 5. The in-app support address · **CONFIGURATION REQUIRED**

The "Report a problem" action on a word screen opens a mail draft to
`VITE_SUPPORT_EMAIL`. That variable is unset, and where it is unset **the action
is not rendered at all** (`apps/web/src/config/product.ts`).

That is deliberate: a button that opens a draft to an address nobody owns is
worse than one that is not offered. Setting the variable and rebuilding restores
the feature — and changes the bundle, so the release artefacts must be rebuilt
after it.

---

## 6. Audio licensing · **CREDENTIAL REQUIRED**

The 10,550 bundled clips were generated with `edge-tts`, which reaches
Microsoft's neural `ko-KR-SunHiNeural` and `ko-KR-InJoonNeural` voices without a
credential.

Everything measurable about the audio is finished: 100% coverage of every word
and every sentence in both voices, loudness-normalised, 0.82× speaking rate,
0 errors and 0 warnings from `npm run audio:qa`.

What is **not** established is the licence to redistribute synthesised speech
inside a paid binary. That comes with a paid Azure Speech subscription.

**Re-checked this cycle, and still absent.** `HANGYUL_TTS_PROVIDER` is `edge` in
`.env.example`, there is no `.env`, and neither `AZURE_SPEECH_KEY` nor
`AZURE_SPEECH_REGION` is set in the environment. So the corpus was **not**
regenerated wholesale: re-running 10,454 clips through the same unlicensed
provider would have cost an hour and changed nothing about the licence. Nothing
in this delivery is described as commercially cleared.

One clip *was* regenerated, through the same provider and for a different
reason: the male voice read 마디 as [마지], and the repair is a different voice of
the same gender for that one recording. The repair is provider-independent — each
provider declares an alternate voice of each gender — so a later run under the
paid Azure licence keeps the fix rather than undoing it, and the listening
fixture fails if it does not. See `RELEASE_VALIDATION.md`, *The final quality
pass*.

**This is not a claim that the audio is unlicensed. It is a statement that the
licence has not been established, and it must be before the app is sold.**

**To unblock:**

```bash
export HANGYUL_TTS_PROVIDER=azure
export AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=…
npm run audio:plan && npm run audio:build -- --force && npm run audio:qa
```

The same voices, the same rate, the same file names — under a subscription that
comes with redistribution terms.

---

## 7. Store graphics that need a designer · **NOT PRODUCED**

| Asset | Status |
| --- | --- |
| Play feature graphic, 1024 × 500 | not produced |
| iOS screenshots (6.9", 6.5", 13" iPad) | not produced — needs a Simulator, which needs macOS |

The Android screenshots **are** produced, in `docs/store-assets/android/`: real
`adb exec-out screencap` frames from the app running on an Android 16 emulator,
including the system bars. The Android frames are deliberately *not* rescaled and
submitted as iOS screenshots — that would be submitting a picture of a different
operating system, which App Review notices.

---

## 8. No human usability testing · **NOT DONE**

No person who cannot read Hangul has used this application. Every claim about
what a beginner understands is reasoned from the design, from a simulated
first-run walkthrough, and from automated checks — not from watching someone.

`docs/BEGINNER_TEST_PROTOCOL.md` is the study that should be run, written so
that somebody else can run it. It has not been run, and nothing in the report or
the store material claims otherwise.

---

## What is explicitly **not** blocked

So this list is not read as "the release is stuck":

* The Android APK is signed, verified, installed, launched and exercised on a
  device — including handwriting input, persistence across a restart, and
  persistence across an app update.
* The AAB is validated, and a device package generated **from it** was installed
  and launched.
* All 2,581 example sentences pass the teaching-quality gate.
* Every content coverage row is at 100%.
* The full test suite passes.
* Both consoles' declarations are written out, ready to transcribe.
