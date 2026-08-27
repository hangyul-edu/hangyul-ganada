# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `37d2f82b` on branch `main`, working tree clean outside
`docs/` and `result/` at the moment of the build.

Commits after `37d2f82b` touch only `docs/` and `result/`. None of them is
inside `assets/public`, so the delivered package is byte-correct for the
shipping source; a commit that records a build cannot be in the build it
records, and that is the only gap. `npm run release:current` reads the commit
back out of `build-info.json` and fails if anything outside those directories
has moved since.

**Built:** 26 August 2026, Linux (WSL2), JDK 21, Android SDK build-tools 36.0.0.

**This supersedes the validation of `37d2f82b`.** Those artefacts were correct
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
| `hangyul-ganada-release.apk` | 86,743,504 B (82.7 MB), sha256 `2083f76cfa5165c9…` |
| `hangyul-ganada-release.aab` | 84,861,858 B (80.9 MB), sha256 `b52c982a2279ec7b…` |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24) |
| Certificate | `157a2bb133f6aa3d…3323debc` — the existing production identity; **no key was generated** |
| Package | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0, SDK 24–36 |

## The package, read rather than trusted

`unzip` on the delivered APK, against the tree it claims to be built from:

| | |
| --- | --- |
| Web bundle | `assets/public/assets/index-tuWK6T_H.js`, sha256 `800a402e…` — **byte-identical** to the `dist` the level-change Playwright journeys passed against |
| Taught words in the corpus manifest | 3,333 = 3,333 |
| Level-test items | 4,194 = 4,194 |
| Audio build | `20260826-299bca46`, 6,779 entries — unchanged this pass; no recordings were added |
| Dictionary | 30,282 headwords · 39,676 senses · 3,721 examples — the curated set |
| `.woff` files | 0 — every face is woff2-only |
| Social-preview image, `robots.txt`, `_redirects`, `sw.js` | 0 — pruned; the native runtime reads none of them |

## What was run against this tree, after the last product edit

| Suite / gate | Result |
| --- | --- |
| `npm run verify:quick` (35 checks) | ✓ — lint, typecheck, unit suites, build, budgets, routing, share metadata, and every content gate in the chain |
| Web unit (`vitest`) | **825 passed** (53 files) |
| Korean morphology | **216 passed** |
| Handwriting core | **96 passed** |
| End-to-end (`playwright`) | **350 passed (19.1 m)**, both projects, no retries — including the mid-day level-change journeys in both directions |
| `npm run synthetic:users:qa` | **118 of 118 journeys PASS** — 32 locales, 30 levels, 18 mid-day Level Test retakes |
| Randomized sittings | 2,000 seeded sittings + 1,000 with mid-sitting retakes, invariants after every event |
| `npm run screens:audit:check` | 143 renders across 7 profiles, clean |
| `npm run qa:locales` | 256 locale renders, clean |
| `npm run conjugation:display:qa:check` | 0 findings on 1,507 predicates; 5-input self-test refused on every run |
| `npm run dictionary:qa:check` | clean |
| `npm run examples:qa` | 3,333 sentences, **PASS 3,333 / REVIEW 0 / REWRITE 0** |
| `npm run leveltest:qa` + `leveltest:ambiguity` | within ±3 levels, exactly 30 items; 0 ambiguity findings |
| `npm run vocabulary:recommendation:qa` | 30,000 events, 0 zone violations, 0 short days; levels 1/10/20/30 samples read by hand |
| `npm run audio:qa` | 13,558 voice slots over 13,454 files, **0 errors, 0 warnings** |
| `npm run audio:pronunciation:check` | 0 errors |
| `npm run letters:face:check` | every letter has the face's parts, in the face's places |
| `npm run store:check` | listings within limits; word counts updated to 3,333 in all eight languages (the gate now reads the listing files too — I-114) |
| `npm run vocabulary:qa:target` | **FAILS** — 3,333 words against a stated 10,000. Left failing on purpose; see I-04. |

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
471012598e86718ff6a802c4b042f0910ccc7b84269617c31e7f4f1ea460a11c  hangyul-ganada-release.apk
0bd6d5fecd4f4b235f3e5a327d44dfbe3dd7a95f11de25ef5a0121914509aae7  hangyul-ganada-release.aab
88c57ba08aea1f4db4096953ec3a1654cd40ab659cd6f1625e113fc6c8fa1ba8  docs/report.pdf
283b8a63be4758690b9df4579c37a3cdf1fc3dfb9c4ec33d61e77613a2c38c8a  build-info.json
```
