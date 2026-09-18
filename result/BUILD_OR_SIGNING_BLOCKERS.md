# Blockers

What could not be completed here, why, and exactly what would unblock each one.

Nothing on this list was worked around, faked, or quietly downgraded. Where a
credential is missing the artefact is absent rather than approximated, and where
a URL does not exist the field is empty rather than invented.

Re-checked on 18 September 2026 against **v1.0.5, versionCode 26**, compiled
from a clean checkout of commit `384c245e`. Every item below still stands.
None is a build problem and none can be cleared from this machine. The Android
artefacts were rebuilt at versionCode 26 from the current web build and signed
with the existing production identity this cycle — see `RELEASE_VALIDATION.md`.
§9 is open again in the one way it can be from here: the Xcode project carries
1.0.5 in both configurations and is synchronised with this exact web bundle,
and its archive still needs a Mac.

**§10 is still the one to read.** This cycle wrote 24 copy-pack translations
of one rewritten example (베다: 풀을 베어요) and thirty non-Korean, non-English
surface lists in the child-safe content policy, none of them read by a native
speaker — so §10 has more unread text than it had, and the policy lists are
marked EXTERNAL_REVIEW in `docs/CHILD_SAFE_CONTENT_POLICY.md` §7. The device walk was **not** re-run for this
build: `RELEASE_VALIDATION.md` carries the one from build 16 under a heading
that says so.

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

## 9. iOS carries 1.0.5 build 25 and is synchronised — the archive still needs a Mac · **REQUIRES A MAC**

**What is missing:** the archive and the IPA, not the version and not the
bundle.

The Xcode project's `MARKETING_VERSION` reads `1.0.5` in both the Debug and the
Release configuration and `CURRENT_PROJECT_VERSION` reads `25` in both — the
build number was to stay exactly where it was, and it did; Android is at
versionCode 26 and `apps/mobile/app.identity.json` declares the two numbers
separately so `npm run version:check` can tell the deliberate difference from a
drift. This pass edited exactly the two `MARKETING_VERSION` lines in
`App.xcodeproj/project.pbxproj` from Linux and nothing else in the file:
`DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE`, `PRODUCT_BUNDLE_IDENTIFIER`,
`IPHONEOS_DEPLOYMENT_TARGET`, `CURRENT_PROJECT_VERSION` and the `knownRegions`
are byte-for-byte what they were, which the re-adopted lock file's
setting-by-setting assertions confirm. `App/App/Info.plist` is untouched;
`CFBundleShortVersionString` resolves to 1.0.5 and `CFBundleVersion` to 25.

`App/App/public` is the 1.0.5 web bundle: `cap sync ios` was run against the
same `dist/` as Android, and the directory hashes file for file to the bundle
inside the delivered APK and AAB (tree digest `ee97265d…`, 16,438 files). The
in-app version on iOS will read `v1.0.5` because that string is in the bundle;
that it renders on a device is a Mac's to confirm.

**To unblock**, on a Mac with Xcode 26 (the SDK Apple requires from 28 April
2026), from commit `384c245e`. The project is SwiftPM-based (`CapApp-SPM`);
there is no `.xcworkspace` and no CocoaPods step, and no `ExportOptions.plist`
is committed — write one for the export method the signing identity permits
(`app-store-connect`, `ad-hoc` or `development`) before the last command:

```bash
git checkout 384c245e
npm ci && npm run mobile:sync          # re-creates App/App/public from the same dist
cd apps/mobile/ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release clean
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/ipa
# then read back, from the archive's Info.plist and the exported IPA:
#   CFBundleIdentifier          com.talkhangyul.ganada
#   CFBundleShortVersionString  1.0.5
#   CFBundleVersion             25        (unchanged)
#   CFBundleDisplayName         Hangyul Ganada
# and hash build/App.xcarchive/Products/Applications/App.app/public against
# result/android-project/app/src/main/assets/public — they must be identical.
```

An Apple Developer Program membership (team `A6776XC6JH` is what the project
names), a distribution certificate and a provisioning profile for
`com.talkhangyul.ganada` are needed for the export step to be signed.

**IOS BUILD BLOCKED — REQUIRES MACOS/XCODE.** No IPA exists and none is claimed.

---

## 10. The thirty-one non-Korean bundles have not had a native reading · **EXTERNAL REVIEW REQUIRED**

**What is missing:** a speaker of each language reading the strings this cycle
added.

**This cycle made it larger by an order of magnitude.** Twelve content packs
went from 609 of 3,333 words to all 3,393, and sixty new words were written into
all thirty-two: **69,156 strings**, every one of them a meaning or an example
sentence a learner reads on a card, and every one of them unread by a speaker of
the language it is in. Before this cycle the unread surface in those twelve
languages was 609 words deep; it is now the whole corpus.

They are gated, and the gates found real defects — 192 pairs of Korean words
that had arrived at one sentence in a language whose English keeps them apart,
43 sentences where a Korean negation did not survive, twelve glosses that were
outright mistranslations. What no gate can see is whether the Turkish reads like
Turkish.

What no gate can see is whether the Vietnamese reads like Vietnamese. Korean is
covered — `docs/copy-audit-ko.json` records a reading of all 847 learner-facing
Korean strings, ten of them rewritten because of one — and that ledger says
plainly that the reading was done by the model that wrote the sentence, which is
the same pair of eyes twice. The other thirty-one languages have had no reading
at all.

**To unblock:** one reviewer per language. The unit is no longer a screen of
interface strings — it is 3,370 word cards, and the honest estimate of the work
is a reviewer-month per language rather than a reviewer-afternoon. Nothing in
this report claims a native review happened.

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
