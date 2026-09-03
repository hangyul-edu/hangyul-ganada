# Hangyul ganada — the applications

Built from commit `22b048aa7e54665458ead94e913d5930725d92d9` at 2026-09-03T09:54:11.103Z. **The working tree was not clean**: 12 changed and 0 untracked files over that commit, source fingerprint `be1ecb7d71b0cd33d57667a5bf8d58a27525afbf91b6843aa5c0db5e323672d1`. `release:current` is pending until this tree is committed.
Everything else about this release — both native projects, the store listings,
the legal pack and the full report — is in `result/`.

## What is here

| File | Size | What it is for |
| --- | --- | --- |
| `hangyul-ganada-release.apk` | 83.7 MB | sideloading, and testing on a device |
| `hangyul-ganada-release.aab` | 82.0 MB | the upload to Google Play |
| `build-info.json` | — | what these two are, in full |
| `checksums.sha256` | — | `sha256sum -c checksums.sha256` |

## What signed them

    CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR
    SHA-256  157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc

**This is the same identity every previous release carries**, and that matters
more than it looks: Android ties an app's upgrade path to its signing
certificate, so an artefact signed with a different key is not an update of this
app — it is a different app that cannot replace it. The keystore is not in this
repository and no password, path or alias appears anywhere in this directory.

Signature schemes: v2 + v3. Application id
`com.talkhangyul.ganada`, version 1.0.2 (9), min SDK
24, target SDK 36.

To confirm it yourself:

    apksigner verify --print-certs hangyul-ganada-release.apk

## What is not here, and will not be faked

**There is no `.ipa`.** not built — macOS and Xcode are unavailable in this environment. An `.ipa` is a signed archive
produced by Xcode against an Apple Developer identity; a renamed zip is not one,
would not install, and would be a false artefact in a delivery directory. The
complete Xcode project ships in `result/ios-project/` and
`result/BUILD_OR_SIGNING_BLOCKERS.md` gives the exact commands and the exact
credentials still required.

## The web build

Not a separate file. It is inside the APK and the AAB, and it is what
`https://ganada.talkhangyul.com` serves; `result/android-project/` carries the
same `dist` under `app/src/main/assets/public`.
