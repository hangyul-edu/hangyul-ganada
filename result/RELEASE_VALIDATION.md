# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `d9178282` on branch `main`, working tree clean outside
`docs/` and `result/` at the moment of the build.

Commits after `d9178282` touch only `docs/` and `result/`. None of them is
inside `assets/public`, so the delivered package is byte-correct for the
shipping source; a commit that records a build cannot be in the build it
records, and that is the only gap. `npm run release:current` reads the commit
back out of `build-info.json` and fails if anything outside those directories
has moved since.

**Built:** 26 August 2026, Linux (WSL2), JDK 21, Android SDK build-tools 36.0.0.

**This supersedes the validation of `683b9671`.** Those artefacts were correct
for their commit and are behind this one; they have been replaced.

---

## Why this rebuild happened

The level-change truth pass changed the product underneath the previous
artefacts, in the places a customer meets first:

- **A mid-day Level Test retake now takes effect immediately.** The old
  behaviour kept a started day's plan at its old level — a learner who
  studied three Level-1 words, measured 30, and returned the same day was
  taught beginner fillers for the rest of it. Mastered progress is preserved,
  unresolved ordinary new-study targets are regenerated for the measured
  level, and the goal never moves (I-108).
- **Four ways a credited answer could be lost are closed**: per-row storage
  write serialisation (a stale plan snapshot could land last on the native
  driver and erase a credit), the plan-persist effect standing down when a
  newer credit exists, the mid-day goal change no longer wiping the day
  (I-110), and extra study now choosing words at the learner's level (I-111).
- **Thirty-six hand-written advanced words** joined levels 28–30 (now 417
  words), with Thai/Vietnamese rows, recordings in both voices, and five new
  verbs added to the not-volitional table before any card could show their
  imperatives.

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | 83,489,478 B (79.6 MB), sha256 `a117849b490feb7f…` |
| `hangyul-ganada-release.aab` | 81,675,564 B (77.9 MB), sha256 `ba06249c090b47ca…` |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24) |
| Certificate | `157a2bb133f6aa3d…3323debc` — the existing production identity; **no key was generated** |
| Package | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0, SDK 24–36 |

## The package, read rather than trusted

`unzip` on the delivered APK, against the tree it claims to be built from:

| | |
| --- | --- |
| Web bundle | `assets/public/assets/index-C5_bTtUo.js`, sha256 `d4c5174c…` — **byte-identical** to the `dist` the level-change Playwright journeys passed against |
| Taught words in the corpus manifest | 3,256 = 3,256 |
| Level-test items | 4,185 = 4,185 |
| Audio build | `20260826-9c60136d`, 6,625 entries — the build with the batch-910 recordings |
| Dictionary | 30,282 headwords · 39,676 senses · 3,721 examples — the curated set |
| `.woff` files | 0 — every face is woff2-only |
| Social-preview image, `robots.txt`, `_redirects`, `sw.js` | 0 — pruned; the native runtime reads none of them |

## What was run against this tree, after the last product edit

| Suite / gate | Result |
| --- | --- |
| `npm run verify:quick` (32 checks) | ✓ — lint, typecheck, unit suites, build, budgets, routing, share metadata, and every content gate in the chain |
| Web unit (`vitest`) | **825 passed** (53 files) |
| Korean morphology | **216 passed** |
| Handwriting core | **96 passed** |
| End-to-end (`playwright`) | **350 passed (19.1 m)**, both projects, no retries — including the mid-day level-change journeys in both directions |
| `npm run synthetic:users:qa` | **112 of 112 journeys PASS** — 32 locales, 30 levels, 1,203 simulated days, 12 mid-day Level Test retakes |
| Randomized sittings | 2,000 seeded sittings + 1,000 with mid-sitting retakes, invariants after every event |
| `npm run screens:audit:check` | 143 renders across 7 profiles, clean |
| `npm run qa:locales` | 256 locale renders, clean |
| `npm run conjugation:display:qa:check` | 0 findings on 1,475 predicates; 5-input self-test refused on every run |
| `npm run dictionary:qa:check` | clean |
| `npm run examples:qa` | 3,256 sentences, **PASS 3,256 / REVIEW 0 / REWRITE 0** |
| `npm run leveltest:qa` + `leveltest:ambiguity` | within ±3 levels, exactly 30 items; 0 ambiguity findings |
| `npm run vocabulary:recommendation:qa` | 30,000 events, 0 zone violations, 0 short days; levels 1/10/20/30 samples read by hand |
| `npm run audio:qa` | 13,250 voice slots over 13,146 files, **0 errors, 0 warnings** |
| `npm run audio:pronunciation:check` | 0 errors |
| `npm run letters:face:check` | every letter has the face's parts, in the face's places |
| `npm run store:check` | listings within limits; word counts updated to 3,256 in all eight languages |
| `npm run vocabulary:qa:target` | **FAILS** — 3,256 words against a stated 10,000. Left failing on purpose; see I-04. |

## On the emulator — ANDROID EMULATOR VERIFIED / PHYSICAL DEVICE NOT VERIFIED

The signed APK — not a debug build — installed with `adb install -r` on an
emulated Pixel 7: Home renders complete past the splash, and the previous
profile's streak survived the reinstall.

The mid-day level-change journey was then driven end to end on the debug build
of the same `dist` (byte-identical web bundle) through the app's own SQLite
storage plugin — `scripts/qa-level-change-android.mjs`, **10/10 checks**: a
Level-1 plan built and persisted by the app, three words mastered, a Level-30
result written the way the store writes it, a cold reload, and the day comes
back at 3/10 under *Chosen for Level 30* with every regenerated target inside
levels 27–30 and no beginner filler. Screenshotted. The standard native QA
passed **14/14**, the learner walk **6/6**, and the safe-area matrix **60/60**
on the same installed build. `logcat`: no `FATAL`, no crash, no ANR. The
emulator was shut down afterwards.

No physical device exists on this machine, and nothing here is evidence about
one.

## Checksums

```
a117849b490feb7f71bd909ed53a76e404eea7e25a123d76354f38077654e36e  hangyul-ganada-release.apk
ba06249c090b47ca9aa0fe7e3f06932a6ea6ea8644d9dcabcefe17b20758e5fe  hangyul-ganada-release.aab
d29cedd51370a243b1dd6febc210a3875d7e3edded443b5455343d7004ea7a94  docs/report.pdf
dcb2e9fbf4c133e716f7ebc74cf0093ef46a46739e9a565a4eef7cbef1e7a733  build-info.json
```
