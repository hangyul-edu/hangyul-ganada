# Release validation

What was built, what was tested, and what was observed. Every line below is
something that was run on this machine during this refresh; nothing is carried
over from an earlier cycle. Where something could not be verified it says so
rather than being left blank or implied.

**Source:** commit `e49c28b` on branch `premium-quality-pass`, working
tree clean at the moment of the build.

Commits after `e49c28b` touch only this file, `docs/report.md`,
`result/` and `app_result/`. None of them is inside `assets/public`, so the
delivered package is byte-correct for the shipping source; a commit that records
a build cannot be in the build it records, and that is the only gap.

**Built:** 2026-08-21, Linux (WSL2), JDK 21, Android SDK build-tools 36.0.0.

**This supersedes the earlier validation of `22ba72a`.** Those artefacts were
correct for their commit and are one commit behind this one; they have been
replaced.

---

## Why this rebuild happened

One commit of product work landed after the last artefacts were built, and it is
a large one: twenty-two interface languages, the whole alphabet course written in
all thirty-two, the customer-facing notation replaced with Revised Romanization
derived from the standard pronunciation, three screens simplified, and the letter
explanations moved off the critical path. An artefact that predates any of that
is the P0 this document exists to keep closed.

The order matters and was followed again: **commit first, then build from the
commit.** Building from a dirty working tree produces a signed artefact that
looks current and is not, which is worse than a stale one because nothing about
it says so.

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
| Built from the committed tree | `git rev-parse HEAD` = `e49c28b…`, recorded in `build-info.json` |
| Signed | Yes — release keystore from `ANDROID_KEYSTORE_PATH`, not the debug key |
| Signature schemes | v2 ✓, v3 ✓ (v1 deliberately off — `minSdk` 24) |
| Certificate SHA-256 | `157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc` — the project's established release key, compared against the keystore *and* the superseded artefact before rebuilding |
| Package / version | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0 |
| SDK levels | minSdk 24, targetSdk 36, compileSdk 36 |
| APK / AAB | 63.4 MB / 62.2 MB, both signed |
| Interface locales in the package | 32, as separate lazy chunks |
| Vocabulary locales complete | 10 of 32, counted from the emitted packs — the rest fall back to English and the picker says so |
| Storage schema | 9, read from `storage/schema.ts` |
| Secret scan | `audit-release-security.mjs` over 11,124 APK entries and 11,133 AAB entries — **no findings** |

### The check that was missing last time

The failure this rebuild exists to fix was *not* that a build was broken — it
was that nobody confirmed the packaged bundle contained the code. So it is now
confirmed by unpacking the delivered APK and grepping `assets/public`:

**This cycle's work** — 111 emitted files searched:

| Marker | What it proves is in the build | Found |
| --- | --- | --- |
| `jari` | 자리 romanised from its sound, not its spelling | ✓ |
| `jangnyeon` | 작년 nasalised — the romanization comes from the standard pronunciation | ✓ |
| `hakgyo` | 학교 tensed, the same way | ✓ |
| `ستة صوائت للبداية` | a lesson title in Arabic | ✓ |
| `தொடங்க ஆறு உயிரெழுத்துகள்` | the same lesson in Tamil | ✓ |
| `как а в «мама»` | the Russian sound hint for ㅏ, from `letters.ru` | ✓ |
| `మ్యాంగ్‌జో` | a practice typeface named in Telugu | ✓ |
| `لاو تسي` | Laozi, attributed in Arabic — the quotations that used to blank the screen | ✓ |
| `Word meanings in English` | the picker's caveat on the twenty-two | ✓ |
| `Try a question` | the CTA that names the quiz it opens | ✓ |
| `Негізгі` | the bottom navigation in Kazakh | ✓ |

**And what should no longer be in it:**

| Marker | Was | Found |
| --- | --- | --- |
| `ɕ`, `ɾ` | IPA characters from the retired notation | gone |
| `jaknyeon` | 작년 romanised from its spelling | gone |
| `10 left today` | the duplicate home row | gone |
| `About your strokes` | the feedback heading over a list of one | gone |

The two directions matter equally. Present markers prove the cycle is *in* the
package; absent ones prove what it replaced is *out* of it, which a table that
only looks for additions cannot tell you.

**Earlier cycles, confirmed still present:** `capability-probe` (the storage
write/read probe), `showMoreHint` (the hint ladder), `Tiếng Việt`.

One thing this table cannot show: `usableHints`, the render-time filter that
drops a hint rung which would give the answer away, is code and is minified to
nothing greppable. It is held by `hints.test.ts`, not by this table, and that is
stated here rather than papered over with a marker that proves something else.

This table is the point of the whole document. Any future release should
reproduce it against whatever that cycle changed.

### Smoke test — **not run this cycle, and that is stated rather than implied**

The previous validation installed and launched the APK on a wiped Android 16
emulator and recorded what it could reach before the emulator's own system
processes wedged under a software renderer. That evidence belongs to the previous
artefact and is not carried forward here: an emulator session that was not run
cannot be reported as if it were.

What this cycle has instead, and what each thing actually establishes:

| Evidence | What it establishes |
| --- | --- |
| The marker table above, in both directions | this cycle's content **is in** the delivered package, and what it replaced is not |
| `apksigner verify --print-certs` on the delivered bytes | it is signed, by the identity every previous release carries |
| 230 Playwright cases across two projects | the same web bundle **renders and behaves**, on a mobile and a desktop viewport |
| 651 unit + 95 handwriting-core tests | the logic under it |
| The screens in this cycle read by eye, in six languages including Arabic | it **looks right**, which no suite decides |

The gap is device-specific behaviour: WebView quirks, real touch input, and the
system bars. Those were checked on a device last cycle against a package built
from the same Capacitor configuration, and nothing in this cycle changed the
native shell — but that is an argument, not an observation, and it is written
here as one.

## What this does not claim

* **Nothing was run on a device or an emulator this cycle.** See the smoke-test
  section above, which says what stands in for it and what that does and does not
  establish.
* **No audio was listened to.** Nobody heard a clip.
* **No handwriting was drawn** on a device; the canvas was exercised in a browser
  and by the handwriting-core suite, not through real touch input.
* **No native speaker read any of the thirty-two languages.** Not one, including
  Korean. `docs/LOCALIZATION_NATIVE_REVIEW.md` is the whole subject.
* **Word meanings ship in ten languages of thirty-two.** The other twenty-two
  fall back to English on the word cards. That is marked in the interface and
  said on the row in the language picker before the learner chooses; it is a
  stated gap and not a defect, and it is not a claim of completeness.
* **Nothing was validated for iOS.** See `BUILD_OR_SIGNING_BLOCKERS.md` — no
  macOS, no Xcode, no signing identity, therefore no `.ipa`. The Xcode project in
  `ios-project/` is synced with this web build and is not a release artefact. No
  file in this delivery has been given that extension.

## Web suites, run on the same commit

| Suite | Result |
| --- | --- |
| `verify:quick` | **PASS** — 16 checks including lint, typecheck, unit, build, bundle budget, routing, romanization QA and the letter-pack freshness check |
| `verify:release` | every check passes except `vocabulary:qa:target`, which fails on "2,581 headwords — 7,419 short of the 10,000 target" by design; that is I-04 stated as a build failure |
| Unit (`vitest`) | **651 passed** |
| Handwriting core | **95 passed** |
| End-to-end (`playwright`) | **230 passed** — 115 × mobile and desktop projects |
| `strokes:qa:check` | 73 items, 269 strokes, 1,345 frames — **PASS** |
| `strokes:visual:check` | the same 1,345 frames rasterised — **PASS**, 1 sub-threshold finding reported |
| `romanization:qa:check` | five layers, including all 2,581 words re-derived and compared — **PASS** |
| `i18n:check` / `copy:audit:check` | 32 locales at 100%; 17,832 strings, 0 errors |
| `audit-release-security.mjs` | APK and AAB scanned — **no findings** |

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
| `hangyul-ganada-release.apk` | 63.4 MB | rebuilt this cycle from `e49c28b` |
| `hangyul-ganada-release.aab` | 62.2 MB | rebuilt this cycle from `e49c28b` |
| `android-project/` | — | re-copied from `apps/mobile/android`, minus `build/`, `.gradle/`, `.kotlin/`, `local.properties`, keystores |
| `ios-project/` | — | re-copied from `apps/mobile/ios`, minus `build/`, `Pods/`, `xcuserdata/`, `DerivedData/` |
| `docs/report.pdf` | 2.2 MB | regenerated this cycle, after the build it describes |
| `store/` | unchanged | listing material, not a build output |

The same two binaries, on their own with their checksums and a README, are in
`app_result/` — derived from this directory rather than built separately, so the
two cannot disagree about which APK shipped.

`checksums.sha256` covers the APK, the AAB, `docs/report.pdf` and
`build-info.json`.

## Checksums

```
1caf5a9025fdfd436efb27e16ad4c08df79284dfc72a7391d9a39801acb4f4fe  hangyul-ganada-release.apk
a0b00016e83075620e6e4110449cedeb9665fc064d0deeed5527d07054b6ce61  hangyul-ganada-release.aab
fb825ec7a2e1d0b62fa6efd86bf85881cf238eace40eef7aaa5820dc3c41f5e6  docs/report.pdf
768d6f5fb72643d600a8cc356dc1c6e8aeae9ffaa5d1069f1e7189aa8fd3edab  build-info.json
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
