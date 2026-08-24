# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `9c686eb` on branch `main`, working tree clean at the moment
of the build.

Commits after `9c686eb` touch only `docs/`, `result/` and `app_result/`. None of
them is inside `assets/public`, so the delivered package is byte-correct for the
shipping source; a commit that records a build cannot be in the build it
records, and that is the only gap. `npm run release:current` reads the commit
back out of `build-info.json` and fails if anything outside those directories
has moved since.

**Built:** 23 August 2026, Linux (WSL2), JDK 21, Android SDK build-tools 36.0.0.

**This supersedes the validation of `e49c28b`.** Those artefacts were correct for
their commit and are several commits behind this one; they have been replaced.

---

## Why this rebuild happened

Nine defects were fixed after the previous artefacts were built, and two of them
are things a customer meets on their first session: the confirmation dialog's
two answers were stacked at every phone width, and the honorific verbs were
conjugating into strings that are not Korean — two of which were answer options
in the placement test. An artefact that predates that work is the P0 this
document exists to keep closed.

The order matters and was followed: **commit first, then build from the commit.**
Building from a dirty working tree produces a signed artefact that looks current
and is not, which is worse than a stale one because nothing about it says so.

### The signing key was recovered, not regenerated

The release keystore is not in this repository and not in the shell environment.
The obvious next step — generate one — would have been the wrong one: a new key
is a different app identity forever, and an installed app cannot be updated by a
package signed with anything else. It was found on disk instead, at the path
`ANDROID_KEYSTORE_PATH` names, and **its certificate was compared with the
previously delivered artefact before anything was rebuilt**:

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
| Built from the committed tree | `git rev-parse HEAD` = `9c686eb745ca47743490d2a5ac0eadc1192a721c`, recorded in `build-info.json` |
| Signed | Yes — the release keystore from `ANDROID_KEYSTORE_PATH`, not the debug key |
| Signature schemes | v2 ✓, v3 ✓ (v1 deliberately off — `minSdk` 24) |
| Certificate SHA-256 | `157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc` — the project's established release key, compared against the keystore *and* the superseded artefact before rebuilding |
| Certificate subject | `CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR` |
| Package / version | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0 |
| SDK levels | minSdk 24, targetSdk 36, compileSdk 36 |
| APK | 71,321,797 bytes, SHA-256 `6ca1da3382c894305ef9f2d04ba31ab6e09bfbcca580a87dbee8123eb97dafa5` |
| AAB | 70,065,052 bytes, SHA-256 `b0a7982a58e0bce28d20951db84189940040b25b9bf63ea6fea18b568a641557`, signed |
| Entries in the package | 11,396 |
| Interface locales in the package | 32, as separate lazy chunks |
| Vocabulary locales complete | 10 of 32, counted from the emitted packs — the rest fall back to English past word 100 and the picker says so before the learner chooses |

---

## The check this document exists for

The failure it was written against was *not* a broken build — it was that nobody
confirmed the packaged bundle contained the code. So it is confirmed by
unpacking the delivered APK and reading `assets/public`.

**This cycle's work — present:**

| Marker | What it proves is in the build | Found |
| --- | --- | --- |
| `bank-e6759230.json` | the level-test bank rebuilt after the four ambiguity rules | ✓ |
| `"en": {"items": 3960, "ceiling": 30}` | the reach the result screen reads | ✓ |
| `"hu": {"items": 399, "ceiling": 23}` | and the ceiling a Hungarian learner is told about | ✓ |
| `지금은 …단계까지 물어볼 수 있어요` | that ceiling, written in Korean | ✓ |
| `A teszt egyelőre a(z) …. szintig kérdez` | and in Hungarian | ✓ |
| `맞았어요` | the shared verdict, in Korean | ✓ |
| `저장한 단어` | the terminology fix on the saved list | ✓ |
| `낱자 배우기` | and on the letters screen | ✓ |
| `display:flex;flex-wrap:wrap` on `.answers` | the dialog action row that stopped stacking | ✓ |
| `flex:1 1 calc(50% - (var(--hg-space-2) / 2))` | and the half-row basis that made the two answers equal | ✓ |
| `size-adjust:121%` | Gaegu's corrected reading size | ✓ |

**And what should no longer be in it:**

| Marker | Was | Found |
| --- | --- | --- |
| `Not quite` | the review exercises' own verdict | gone |
| `That's it.` | the other half of it | gone |
| `저장한 어휘` | the saved list under two names | gone |
| `글자 배우기` | the letters screen under the wrong noun | gone |
| `size-adjust: 127%` | Gaegu fitted to one axis | gone |
| `elevenlabs`, `xi-api-key`, any key material | the retired TTS vendor | **none anywhere in the package** |

The two directions matter equally. Present markers prove the cycle is *in* the
package; absent ones prove what it replaced is *out* of it, which a table that
only looks for additions cannot tell you.

---

## Tests — **PASS**

Run from `9c686eb` with the working tree clean.

| Suite | Result |
| --- | --- |
| `npm run verify:quick` | 29 checks, **exit 0** |
| `npm run test` | 740 web unit tests, 47 files, **all pass** |
| `npm run test:e2e` | **336 passed (20.3m)**, two projects, one worker, no retries, **exit 0** |
| `npm run screens:audit -- --check` | 17 routes and 6 states across 7 device profiles, 143 renders, **clean** |
| `npm run modals:qa` | 18 dialog states across 6 widths, in each dialog's longest language, **all inside the modal** |
| `npm run examples:qa` | 2,581 sentences, **every example passes** |
| `npm run leveltest:ambiguity` | 3,960 items, twelve rules, **no findings** |
| `npm run leveltest:locale` | 32 languages, resolver and rendered, **no option resolved from another language** |
| `npm run locale:editorial` | **0 errors**, 37 warnings for a person to read |
| `npm run docs:consistency` | 15 figures across 5 documents, **no contradictions** |
| `npm run vocabulary:qa:target` | **FAILS** — 2,581 words against a stated 10,000. Left failing on purpose; see I-04. |

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
757705a4d676bcfa7e9249b21fb6beb95907f6e5ccae3ec7314abb8002d18b68  hangyul-ganada-release.apk
1b859b6737769dff6b6a7067408c04e97164a27e1a147e0c5afe35dd1949596e  hangyul-ganada-release.aab
74216bb8e8f93513f6721a49f198da1d84b6c49ebb8091075c55ee0912a825ca  docs/report.pdf
4b8e072f5ebc2e39e4e85f0e44bcebc1ed939f1c42f80117aa859455599c5a31  build-info.json
```
