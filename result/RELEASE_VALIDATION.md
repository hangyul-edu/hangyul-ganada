# Release validation

What was built, what was tested, and what was observed. Every line below was run
on this machine during this refresh; nothing is carried over from an earlier
cycle. Where something could not be verified it says so rather than being left
blank or implied.

**Source:** commit `683b9671` on branch `main`, working tree clean at the moment
of the build.

Commits after `683b9671` touch only `docs/`, `result/` and `app_result/`. None of
them is inside `assets/public`, so the delivered package is byte-correct for the
shipping source; a commit that records a build cannot be in the build it
records, and that is the only gap. `npm run release:current` reads the commit
back out of `build-info.json` and fails if anything outside those directories
has moved since.

**Built:** 26 August 2026, Linux (WSL2), JDK 21, Android SDK build-tools 36.0.0.

**This supersedes the validation of `7f21b034`.** Those artefacts were correct
for their commit and are behind this one; they have been replaced.

---

## Why this rebuild happened

A pass that drove one hundred synthetic learners through the shipping code
changed the product underneath the previous artefacts, in five places a
customer meets:

- **Two ways a day could stick at 9/10 are fixed** — a matching grid whose
  correct answers credited nothing, and a review word scheduled in a partial
  locale with no askable question. Crediting is per-word; the plan builder
  refuses to schedule what the session cannot ask.
- **The streak is one number.** Home and Learning Activity computed it from
  different stores; `learningStreak()` is now the only read path.
- **The conjugation panel is licensed by sense.** 죽으세요, 맞으세요 under
  “Please do”, 도와줘 주세요 and 172 other rows a Korean speaker would not
  say are gone; 그러다's family stopped conjugating to non-words.
- **Fifteen teaching examples were rewritten** (화나지 마세요 among them), one
  word retired, and 101 dictionary sentences a reviewer refused — propaganda,
  unattributed political violence, corrupted text, unmarked dialect — no
  longer ship. ~300 dictionary examples lost their interlinear hyphen markup.
- **5.1 MB left the package with nothing removed**: the `.woff` twins no
  engine downloads, and the web-only files the Android runtime never reads.

## The artefacts

| | |
| --- | --- |
| `hangyul-ganada-release.apk` | 82,316,042 B (78.5 MB), sha256 `7f856430b49ca865…` |
| `hangyul-ganada-release.aab` | 80,533,803 B (76.8 MB), sha256 `85c85432612595d4…` |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — minSdk 24) |
| Certificate | `157a2bb133f6aa3d…3323debc` — the existing production identity; **no key was generated** |
| Package | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0, SDK 24–36 |

The previous artefacts were 87,413,933 B and 85,627,920 B; the difference is
the font and web-only pruning above, with the audio deliberately untouched —
see `docs/PACKAGE_SIZE_ANALYSIS.md` for the measurements behind that decision.

## The package, read rather than trusted

`unzip` on the delivered APK, against the tree it claims to be built from:

| | |
| --- | --- |
| `.woff` files | 0 — every face is woff2-only |
| Social-preview image, `robots.txt`, `_redirects`, `sw.js` | 0 — pruned; the native runtime reads none of them |
| Taught words in the corpus manifest | 3,220 = 3,220 |
| The rewritten 화나다 example | present in `corpus/band-2-671860f0509f.json` |
| Level-test items | 4,169 = 4,169 |
| Audio build | `20260825-a037f9bc`, 6,553 entries — the build with the re-recorded examples |
| Dictionary | 30,282 headwords · 39,676 senses · 3,721 examples — the curated set |
| The corrected demonstrative-verb table | `어쩌:"어째"` present in the shipped morphology chunk — a string that exists in no earlier build of that module |

## What was run against this tree, after the last product edit

| Suite / gate | Result |
| --- | --- |
| `npm run verify:quick` (32 checks) | ✓ — lint, typecheck, unit suites, build, budgets, routing, share metadata, and every content gate in the chain |
| Web unit (`vitest`) | **810 passed** (53 files) |
| Korean morphology | **216 passed** |
| Handwriting core | **96 passed** |
| End-to-end (`playwright`) | **346 passed (18.1 m)**, both projects, no retries |
| `npm run synthetic:users:qa` | **100 of 100 journeys PASS** — 32 locales, 30 levels, 1,157 simulated days |
| `npm run screens:audit:check` | 143 renders across 7 profiles, clean |
| `npm run qa:locales` | 256 locale renders, clean |
| `npm run conjugation:display:qa:check` | 0 findings; 5-input self-test refused on every run |
| `npm run dictionary:qa:check` | clean, including the new interlinear-hyphen rule |
| `npm run examples:qa` | 3,220 sentences, **PASS 3,220 / REVIEW 0 / REWRITE 0** |
| `npm run leveltest:qa` + `leveltest:ambiguity` | within ±3 levels, exactly 30 items; 0 ambiguity findings |
| `npm run vocabulary:recommendation:qa` | 0 zone violations, 0 short days; level 1 and level 30 samples read by hand |
| `npm run audio:qa` | 13,106 voice slots over 13,002 files, **0 errors, 0 warnings** |
| `npm run audio:pronunciation:check` | 0 errors |
| `npm run letters:face:check` | every letter has the face's parts, in the face's places |
| `npm run store:check` | listings within limits; the word-count rule widened past its 2,XXX blindness and negative-tested |
| `npm run vocabulary:qa:target` | **FAILS** — 3,220 words against a stated 10,000. Left failing on purpose; see I-04. |

## On the emulator — ANDROID EMULATOR VERIFIED / PHYSICAL DEVICE NOT VERIFIED

The signed APK — not a debug build — installed with `adb install -r` over the
previous cycle's install on an emulated Pixel 7:

- Home renders complete, and the previous profile's streak and study time
  survived the update — the persistence promise, exercised across a real
  upgrade.
- Words renders the goal card, saved-words row, search and all eighteen
  categories; starting the day walks placement prompt → skip → the first
  introduction card with its 0/10 counter and audio.
- `logcat`: no `FATAL`, no `AndroidRuntime` crash, no ANR naming
  `com.talkhangyul.ganada`.
- The emulator was shut down afterwards.

No physical device exists on this machine, and nothing here is evidence about
one.

## Checksums

```
7f856430b49ca865b93adba1e55998b7c2d008d3fcecdf07ab104fb1f3f3602b  hangyul-ganada-release.apk
85c85432612595d4a9bc99b9d8fc819ffd42027390e57acc8599f960b4c38621  hangyul-ganada-release.aab
91059322ce701e951ed71fef38f57bdaa11ec6febd3e772a1d38d2ed07d34f14  docs/report.pdf
44a3858d2d505a714acaa022821ec5654a1f5973484a0273f678c5ff6b6a1e9e  build-info.json
```

## What is not verified from here

- **iOS**: no macOS or Xcode. The Xcode project is delivered in
  `result/ios-project`; `BUILD_OR_SIGNING_BLOCKERS.md` records what a Mac
  would need to do.
- **The live web deploy**: the production domain still serves the previous
  deploy, so the new social-preview asset is verified against the local
  production build only. Deployment happens outside this repository.
- **Native review**: no locale has been read by a native speaker, including
  the fifteen examples rewritten this pass.
