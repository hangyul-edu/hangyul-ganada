# App Store Connect — App Privacy

Apple's questionnaire, answered. Same facts as Play's Data safety form; the two
consoles ask them in different shapes.

## Do you or your third-party partners collect data from this app?

**No, we do not collect data from this app.**

That answer requires every one of the following to be true, and each is:

| Apple's condition | Status |
| --- | --- |
| No data is transmitted off the device | true — the app makes no network request; every asset is in the bundle |
| No third-party SDK collects data | true — the dependency list has no analytics, no attribution, no ads. `apps/mobile/package.json` is seven Capacitor plugins: App, Filesystem, Haptics, Keyboard, Local Notifications, Share, Splash Screen |
| Data stored on device is not "collected" | true — Apple's definition of collection is transmission off the device. Practice history is written to the app's own database and stays there |
| No tracking across apps or websites | true — no `NSUserTrackingUsageDescription`, no IDFA access, no `AppTrackingTransparency` |

## Privacy nutrition label

Every category is **Data Not Collected**.

## Required reason API usage

`apps/mobile/ios/App/App/PrivacyInfo.xcprivacy` declares **none**. It used to
declare `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1`, for
`@capacitor/filesystem`; that plugin existed only to write the learner's
exported backup, the export was removed from the product, and the plugin and the
declaration went with it.

No category is declared now, because nothing in the binary touches one — the
audit that establishes that, plugin by plugin, is in `privacy-manifest-audit.md`.
`UserDefaults` is worth naming: `@capacitor/preferences` was removed from the
project so that `CA92.1` would not be needed.

Any dependency added or upgraded later invalidates this and the audit has to be
run again. Apple rejects at upload for a missing declaration.

## Usage descriptions in `Info.plist`

There are none, deliberately: the app opens no camera, no microphone, no photo
library, no contacts, no location, no calendar, and no Bluetooth. An unused
usage-description string is itself a rejection risk, because it promises a
capability the reviewer will look for and not find.

Notifications need no usage-description key — iOS asks with its own system
prompt — and the app requests authorisation only when the learner switches the
daily reminder on. Nothing is scheduled unless they do, and no notification
carries anything about them: the text is a fixed string from the translation
bundles.

## Encryption

`ITSAppUsesNonExemptEncryption` is `false` in `Info.plist`, so App Store Connect
does not ask on upload. The reasoning is in `export-compliance.md`.

## Account deletion

Apple requires apps that support account creation to support account deletion.
This app has no accounts. **My Learning → Reset → Reset learning progress** erases the
learner's record from the device, which is the only place it exists.
