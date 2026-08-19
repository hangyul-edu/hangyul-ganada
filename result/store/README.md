# Store submission material

Everything a submission needs that does **not** require a store console.

```
store/
  listing/<locale>.md        title, subtitle, short and full description, keywords
  release-notes.md           "what's new", first release
  google-play/
    store-listing.md         which copy goes in which Console field
    data-safety.md           the answers to Play's Data safety form
    app-access.md            the App access declaration
    ads-declaration.md       the Ads declaration
    target-audience.md       Target audience and content
    content-rating.md        the IARC questionnaire
    permissions-audit.md     what the built APK actually asks for
    review-notes.md          the note pasted to the reviewer
  app-store/
    store-listing.md         which copy goes in which Connect field
    app-privacy.md           Apple's privacy questionnaire
    age-rating.md            the age-rating questionnaire
    export-compliance.md     the encryption declaration
    privacy-manifest-audit.md what PrivacyInfo.xcprivacy declares, and why
    support-and-privacy-urls.md the two URLs, and why they are not set
    review-notes.md          the note pasted to App Review
docs/legal/                  privacy policy, support and licences, hostable
docs/store-assets/android/   screenshots, from a running app on a device
```

## What has not been done, and cannot be here

| | Why |
| --- | --- |
| Uploading anything | needs a Play Console and an App Store Connect account |
| Reserving the app id | `com.talkhangyul.ganada` is **not registered** with either store — see `apps/mobile/app.identity.json` |
| Signing with the Play *upload* key | the release keystore in this environment was generated here. It signs a genuine, installable, verified APK; it is not the identity Google Play would know this app by |
| Submitting the Data safety / App Privacy forms | console-only; the answers are written out here so submitting them is transcription rather than authorship |
| Hosting the privacy and support pages | needs a domain. The pages exist in `docs/legal/` |
| iOS screenshots and the feature graphic | need a Simulator (macOS) and a designer respectively |

## About the screenshots

`docs/store-assets/android/*.png` are `adb exec-out screencap` frames from the
app running on an Android 16 emulator (Pixel 7 profile, 1080 × 2400) — the real
composited frame including the status and gesture bars, not a browser at a
phone-shaped viewport. That distinction matters for a submission: a browser
screenshot has no system bars, the wrong corner radius and the wrong font
rendering, and reviewers notice.

They show a seeded profile — five weeks of practice, a streak with gaps in it,
several letters learned — written into the app's own native store through its
own plugin, so the app reads it exactly as it reads a real learner's. Driving
forty lessons of synthetic handwriting through the UI instead would produce a
slightly different picture every run.
