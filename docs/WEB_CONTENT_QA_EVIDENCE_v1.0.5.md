# Web content QA evidence — v1.0.5

Written 2026-09-14, rewritten 2026-09-15 after the second reading, on base commit d06c7faa; §9 added 2026-09-16 for the nineteenth pass, on base commit d511ff1e. Web only: no gradle, xcodebuild, pod, capacitor sync or native asset sync was run; `git diff --name-only` and `git status --short` were checked before and after every phase and no path under `apps/mobile/android`, `apps/mobile/ios`, `result/`, `app_result/` or `capacitor.config.*` changed. Versions unchanged: web v1.0.5, native 1.0.4, versionCode 25.

## 1. Gates on the final tree

| Command | Exit | Seconds |
|:---|---:|---:|
| `npm run content:vocabulary` | 0 | 19 |
| `npm run content:corpus` | 0 | 1 |
| `npm run audio:plan` | 0 | 0 |
| `python3 -u scripts/content/generate_audio.py` | 0 | 161 |
| `npm run content:leveltest` | 0 | 37 |
| `npm run content:dictionary` | 0 | 38 |
| `npm run vocabulary:relations` | 0 | 0 |
| `npm run curriculum:build` | 0 | 1 |
| `npm run copy:fresh` | 0 | 1 |
| `npm run leveltest:simulations` | 0 | 0 |
| `npm run leveltest:content` | 0 | 0 |
| `npm run questions:ledger` | 0 | 1 |
| `npm run ambiguity:ledger` | 0 | 0 |
| `npm run content:audit` | 0 | 1 |
| `npm run locale:ledger` | 0 | 0 |
| `npm run content:safety:qa` | 0 | 46 |
| `npm run content:inventory` | 0 | 1 |
| `npm run translation:audit` | 0 | 0 |
| `npm run content:scalability` | 0 | 1 |
| `npm run quotes:review` | 0 | 0 |
| `npm run build` | 0 | 14 |
| `npm run bundle:budget:check` | 0 | 1 |
| `npm run content:safety:bundle:check` | 0 | 81 |
| `npm run examples:qa:check` | 0 | 2 |
| `npm run content:qa` | 0 | 0 |
| `npm run vocabulary:qa:check` | 0 | 1 |
| `npm run vocabulary:sense:qa:check` | 0 | 0 |
| `npm run vocabulary:translation:check` | 0 | 1 |
| `npm run translation:semantics:check` | 0 | 0 |
| `npm run translation:audit:check` | 0 | 1 |
| `npm run content:scalability:check` | 0 | 1 |
| `npm run quotes:review:check` | 0 | 0 |
| `npm run quotes:qa:check` | 0 | 0 |
| `npm run quotes:audit:check` | 0 | 0 |
| `npm run copy:fresh:check` | 0 | 1 |
| `npm run locale:content:check` | 0 | 0 |
| `npm run locale:editorial:check` | 0 | 1 |
| `npm run copy:generated:check` | 0 | 0 |
| `npm run copy:audit:check` | 0 | 0 |
| `npm run copy:remediation:check` | 0 | 0 |
| `npm run conjugation:qa:check` | 0 | 0 |
| `npm run conjugation:display:qa:check` | 0 | 1 |
| `npm run content:coverage` | 0 | 0 |
| `npm run romanization:qa:check` | 0 | 1 |
| `npm run vocabulary:level:qa:check` | 0 | 0 |
| `npm run vocabulary:level:audit` | 0 | 1 |
| `npm run leveltest:qa:check` | 0 | 89 |
| `npm run leveltest:bank:check` | 0 | 0 |
| `npm run leveltest:ambiguity:check` | 0 | 1 |
| `npm run leveltest:distractors:check` | 0 | 0 |
| `npm run leveltest:policy:check` | 0 | 1 |
| `npm run leveltest:simulations:check` | 0 | 1 |
| `npm run leveltest:content:check` | 0 | 0 |
| `npm run questions:ledger:check` | 0 | 1 |
| `npm run ambiguity:ledger:check` | 0 | 0 |
| `npm run content:audit:check` | 0 | 0 |
| `npm run dailyplan:level:check` | 0 | 50 |
| `npm run dailyplan:fresh:check` | 0 | 4 |
| `npm run dailyvocab:qa:check` | 0 | 1 |
| `npm run vocabulary:recommendation:qa` | 0 | 27 |
| `npm run hints:qa:check` | 0 | 36 |
| `npm run worddetail:qa:check` | 0 | 0 |
| `npm run korean:education:check` | 0 | 146 |
| `npm run answerability` | 0 | 157 |
| `npm run leveltest:locale:check` | 0 | 264 |
| `npm run content:safety:check` | 0 | 53 |
| `npm run policy:runtime:check` | 0 | 0 |
| `npm run content:inventory:check` | 0 | 1 |
| `npm run vocabulary:relations:qa` | 0 | 0 |
| `npm run dictionary:qa:check` | 0 | 4 |
| `npm run dictionary:coverage:check` | 0 | 1 |
| `npm run dictionary:morphology:check` | 0 | 1 |
| `npm run locale:ledger:check` | 0 | 0 |
| `npm run content:fresh:check` | 0 | 98 |
| `npm run frequency:check` | 0 | 0 |
| `npm run letters:copy:check` | 0 | 1 |
| `npm run numbers:qa:check` | 0 | 0 |
| `npm run numbers:copy:check` | 0 | 1 |
| `npm run i18n:check` | 0 | 1 |
| `npm run locales:native:check` | 0 | 0 |
| `node scripts/build-locale-audit-v105.mjs` | 0 | 0 |
| `npm run typecheck` | 0 | 12 |
| `npm run lint` | 0 | 7 |
| `npm run copy:ledger:check` | 0 | 0 |
| `npm run docs:consistency:check` | 1 | 77 |
| `cd apps/web && npx vitest run  — 1,525 passed, 84 files` | 0 |  |
| `cd packages/korean-morphology && npx vitest run  — 237 passed` | 0 |  |
| `cd packages/handwriting-core && npx vitest run  — 96 passed` | 0 |  |
| `cd packages/content-safety && npx vitest run  — 1,298 passed, 4 files` | 0 |  |
| `python3 scripts/content/child_safety.py --self-test  — 406/406 agree` | 0 |  |
| `npm run qa:locales -- --check --summary docs/locale-audit-v105-layout.json  — 256 renders, 0 findings` | 0 |  |
| `npm run screens:audit:check  — 166 renders, nothing clipped, overlapping or unreadable` | 0 |  |
| `cd apps/web && npx playwright test --project=mobile  — 317 passed` | 0 | 1392 |
| `cd apps/web && npx playwright test --project=desktop  — 317 passed` | 0 | 1398 |
| `cd apps/web && npx playwright test e2e/letters-chevron.spec.ts --project=mobile  — 3 passed (ko, en, ar)` | 0 |  |
| `bash scripts/content-gates-negative.sh  — N1–N11 caught, 6 clean re-runs green` | 0 |  |
| `npm run content:fresh:check` | 0 |  |
| `npm run vocabulary:level:qa:check` | 0 |  |

## 2. Test suites

| Suite | Cases | Files |
|:---|---:|---:|
| Web unit (vitest) | 1,525 | 84 |
| Content safety (vitest) | 1298 | 4 |
| Korean morphology (vitest) | 237 | |
| Handwriting core (vitest) | 96 | |
| Total unit | 3,156 | 97 |
| End-to-end (playwright) | 634 (317 × 2 projects) | |
| Rendered screens (`screens:audit`) | 166 | |

## 3. Negative tests

`bash scripts/content-gates-negative.sh` at 2026-09-14T16:58:31+00:00:

* N1: **caught** — inventory figure out of date — docs/content-inventory.json is stale — run npm run content:inventory
* N2: **caught** — Korean copied into th example — 3 blocking translation finding(s): th/word_geot/KOREAN_COPIED, th/word_geot/HANGUL_IN_TRANSLATION, th/word_geot/WRONG_SCRIPT
* N3: **caught** — Hangul in en example — 1 blocking translation finding(s): en/word_geot/HANGUL_IN_TRANSLATION
* N4: **caught** — placeholder in vi meaning — 1 blocking translation finding(s): vi/word_geot/PLACEHOLDER
* N5: **caught** — first render over its line — first render 60.3 kB gzip exceeds the 10 kB line
* N6: **caught** — runtime supplement weaker than the full policy — ❯ packages/content-safety/src/runtime.test.ts (641 tests | 1 failed) 2185ms
* N8: **caught** — slur in shipped meaning — blocked profanity  en     vocabulary.en.json:word_geot                 retard — a retard
* N9: **caught** — split-once evasion passes the fixtures — ❯ packages/content-safety/src/fixtures.test.ts (407 tests | 5 failed) 1751ms
* N10: **caught** — particle-attached Latin term passes the fixtures — ❯ packages/content-safety/src/fixtures.test.ts (407 tests | 4 failed) 1646ms
* N11: **caught** — stale per-locale audit table — /root/hangyul-ganada/docs/LOCALE_AUDIT_v1.0.5.md is stale — run node scripts/build-locale-audit-v105.mjs
* N7: **caught** — learner-list evidence dropped from the level model — anchors held          166

## 4. Audio

`python3 scripts/content/qa_audio.py --json docs/audio-qa-v105.json`: 15,960 voice slots checked, 15,960 decoded, 79.3 MiB, 0 error(s), 1 warning(s): word_babb [female] '못': mean -9.7 dB is far from the -16 dB target

## 5. The repository repair (I-232)

Recorded before anything was touched: `git status --short` (322 M, 209 D, 1,452 ??), `git branch --show-current` = main, `git rev-parse HEAD` = d06c7faa, `git log -5 --oneline`, `git remote -v` (origin, GitHub) — in `/root/hangyul-backup/git-state.txt`. Preserved: `tracked-changes.patch` (partial: 166 blobs unreadable), `worktree-changes-20260914-2355.tgz` (1,565 changed and untracked files), `untracked.txt`, `modified-tracked.txt`, `deleted-tracked.txt`, `worktree-sha256-before.txt`. Diagnosis (read-only): `find .git/objects -type f -size 0` → 1,092, all written 15:01 (the crash); `git fsck --full` → 1,070 *missing blob*, each referenced only by the index; `git cat-file -t` on HEAD, main and the remote head → commit; refs intact. Repair: objects moved to `/root/hangyul-backup/quarantine/` (not deleted); `git read-tree HEAD` (index only; the working tree was not written); the two `.git/logs` lines naming the unreachable commit 399d17ff removed after backing the logs up; `git fsck --full --no-dangling` → exit 0, no output; `worktree-sha256-after.txt` identical to before. `git reset` was not run: HEAD already named d06c7faa and the only damaged structure was the index.

## 6. Commits and the push

Made 2026-09-15 on `main` from base `d06c7faa`, after `git status --short`, `git diff --cached --check`, `--stat` and `--name-only` were inspected before each one; no path under `apps/mobile/android`, `apps/mobile/ios`, `result/`, `app_result/` or `capacitor.config.*` is in any of them; `package.json` versions unchanged (web 1.0.5; native 1.0.4 / versionCode 25 untouched).

| Commit | Message | Files |
|:---|:---|---:|
| `e2038124` | feat(content): 497 words in seven batches, 108 shared glosses differentiated, every artefact rebuilt | 2,557 |
| `10142a99` | fix(safety): split-once terms, look-alike letters, attached particles and foreign scripts are refused | 6 |
| `4c940763` | fix(web): every Letters card puts its chevron on one trailing guideline; the Level Test bank is prefetched | 11 |
| `d665496b` | feat(qa): translation audit, scalability, quotation and per-locale tables, negative harness, PDF inspection | 19 |
| (this document's own commit) | docs(report): the eighteenth pass, second reading — report, issues, evidence documents | see `git log -1` |

`docs/report.pdf` is regenerated from the committed tree and is not tracked (`*.pdf` in `.gitignore`). The push (`git push origin main`, once, no force) and the local/remote head comparison are recorded in the final response.

## 7. The chevron regression test and the rendered locale screens

`npx playwright test e2e/letters-chevron.spec.ts --project=mobile` (run from `apps/web`): 3 passed — ko, en, ar at 320/360/390/412/430 px × 100 %/200 % text; every card inset 18 px (Arabic: 18 px from the left edge). Negative: with the old `.sounds` flex rule planted, the same command fails with `/letters/sounds chevron inset 16 vs guideline 18` (and 46/78 px on the wider foot cards before the grid). Screenshots from the production build: `docs/qa-screenshots/letters-chevron-before-ko-390.png`, `letters-chevron-after-ko-390.png`, `letters-chevron-after-ar-390.png`, `letters-chevron-after-en-320.png`, `letters-chevron-after-de-430.png`.

`npm run qa:locales -- --check --summary docs/locale-audit-v105-layout.json` at 2026-09-14T15:59:39.524Z: 256 renders (32 locales), 0 finding(s); per locale in `docs/LOCALE_AUDIT_v1.0.5.md`.

## 8. Scope check

`git status --short | grep -E "android/|ios/|result/|app_result/|capacitor.config"` → empty, before and after every phase.

## 9. The nineteenth pass — 16 September 2026

Base commit `d511ff1e` on `main`, clean tree at the start. Web only: no gradle, xcodebuild, pod, capacitor sync or native asset sync was run; `git status --short | grep -E "android/|ios/|result/|app_result/|capacitor.config"` was empty after every phase and before every commit. Versions unchanged: web v1.0.5, native 1.0.4, versionCode 25 (`version:check` in the chain below). The named attachment `report(20260916-012042).pdf` was not on this machine (searched `/root`, `/mnt/c/Users`, the repository and its ignored directories); `docs/report.pdf` — the eighteenth edition, sha256 `514fd1f3…`, 426 pages, created 2026-09-14T17:06Z — was read as the source and its claims are classified in `docs/WEB_CONTENT_QUALITY_AUDIT_v1.0.5.md` §7.

### 9.1 Gates on the final tree

Every step of `verify:quick` except `name:check` (fails on the gitignored `patent/` directory before this pass and after it — pre-existing, not touched), plus the five gates after it, run one after another from `/root/hangyul-ganada` at 14:41–14:58 KST (05:41–05:58 UTC); 73 steps, all exit 0, 1,017 s in total.

| Command | Exit | Seconds |
|:---|---:|---:|
| `npm run route:policy:check` | 0 | 1 |
| `npm run mobile:identity:check` | 0 | 0 |
| `npm run version:check` | 0 | 2 |
| `npm run ios:project:check` | 0 | 0 |
| `npm run splash:check` | 0 | 4 |
| `npm run locales:native:check` | 0 | 0 |
| `npm run content:fresh:check` | 0 | 104 |
| `npm run content:inventory:check` | 0 | 0 |
| `npm run policy:runtime:check` | 0 | 1 |
| `npm run content:safety:check` | 0 | 57 |
| `npm run i18n:check` | 0 | 2 |
| `npm run locale:content:check` | 0 | 1 |
| `npm run locale:ledger:check` | 0 | 0 |
| `npm run copy:audit:check` | 0 | 0 |
| `npm run copy:ledger:check` | 0 | 0 |
| `npm run copy:remediation:check` | 0 | 1 |
| `npm run copy:generated:check` | 0 | 0 |
| `npm run copy:fresh:check` | 0 | 0 |
| `npm run locale:editorial:check` | 0 | 1 |
| `npm run letters:copy:check` | 0 | 0 |
| `npm run strokes:qa:check` | 0 | 1 |
| `npm run strokes:corners:check` | 0 | 1 |
| `npm run strokes:visual:check` | 0 | 9 |
| `npm run strokes:markers:check` | 0 | 3 |
| `npm run glyphshape:qa:check` | 0 | 4 |
| `npm run glyph:structure:check` | 0 | 2 |
| `npm run letters:face:check` | 0 | 4 |
| `npm run hints:qa:check` | 0 | 49 |
| `npm run conjugation:qa:check` | 0 | 0 |
| `npm run conjugation:display:qa:check` | 0 | 1 |
| `npm run leveltest:qa:check` | 0 | 86 |
| `npm run leveltest:bank:check` | 0 | 1 |
| `npm run leveltest:ambiguity:check` | 0 | 0 |
| `npm run leveltest:distractors:check` | 0 | 0 |
| `npm run content:audit:check` | 0 | 1 |
| `npm run leveltest:policy:check` | 0 | 1 |
| `npm run leveltest:simulations:check` | 0 | 0 |
| `npm run leveltest:content:check` | 0 | 1 |
| `npm run questions:ledger:check` | 0 | 0 |
| `npm run ambiguity:ledger:check` | 0 | 0 |
| `npm run leveltest:locale:check` | 0 | 259 |
| `npm run dailyvocab:qa:check` | 0 | 2 |
| `npm run dailyplan:fresh:check` | 0 | 4 |
| `npm run dailyplan:level:check` | 0 | 49 |
| `npm run numbers:qa:check` | 0 | 1 |
| `npm run numbers:domain:check` | 0 | 1 |
| `npm run numbers:copy:check` | 0 | 0 |
| `npm run numbers:ledger:check` | 0 | 1 |
| `npm run quotes:qa:check` | 0 | 0 |
| `npm run quotes:audit:check` | 0 | 0 |
| `npm run quotes:review:check` | 0 | 0 |
| `npm run strokes:fixtures:check` | 0 | 6 |
| `npm run vocabulary:qa:check` | 0 | 0 |
| `npm run romanization:qa:check` | 0 | 1 |
| `npm run vocabulary:relations:qa` | 0 | 0 |
| `npm run vocabulary:sense:qa:check` | 0 | 0 |
| `npm run vocabulary:translation:check` | 0 | 1 |
| `npm run translation:semantics:check` | 0 | 0 |
| `npm run translation:audit:check` | 0 | 1 |
| `npm run content:scalability:check` | 0 | 0 |
| `npm run tokens:check` | 0 | 1 |
| `npm run lint` | 0 | 6 |
| `npm run typecheck` | 0 | 13 |
| `npm run test` | 0 | 66 |
| `npm run build` | 0 | 17 |
| `npm run bundle:budget:check` | 0 | 1 |
| `npm run routing:check` | 0 | 0 |
| `npm run share:check` | 0 | 0 |
| `npm run audio:pronunciation:check` | 0 | 1 |
| `npm run answerability:check` | 0 | 157 |
| `npm run gold:check` | 0 | 5 |
| `npm run issues:check` | 0 | 30 |
| `npm run exercise:inventory:check` | 0 | 56 |

`docs:consistency:check` was run separately: 78 figures across 6 documents agree; the one finding before the commit is the clean-tree rule (`docs/report.md calls the tree clean, but 707 product file(s) differ`), which is what a dirty tree is supposed to produce and is re-run from the committed tree in §9.7.

### 9.2 Test suites

| Suite | Cases | Files |
|:---|---:|---:|
| Web unit (vitest) | 1,566 | 88 |
| Content safety (vitest) | 1,298 | 4 |
| Korean morphology (vitest) | 242 | 4 |
| Handwriting core (vitest) | 96 | 5 |
| Total unit | 3,202 | 101 |
| End-to-end (playwright) | 640 (320 × 2 projects) | 33 |

New this pass: `apps/web/src/domain/streak.test.ts` (20, rewritten), `apps/web/src/store/streak.test.tsx` (11), `apps/web/e2e/streak.spec.ts` (3), `apps/web/src/features/learning/wordOptions.test.ts` (3), `apps/web/src/data/koreanGoldSet.test.ts` (11), `apps/web/src/pages/reviewSessionHydration.test.tsx` (3), the 400-seed letter sweep in `answerable.test.ts`, the matching-grid cases in `dailyQuestions.test.ts`, the suppletive rows in `packages/korean-morphology/src/conjugate.test.ts`, `PATTERN_FIXTURES` and `check_gold_set` in `scripts/content/qa_pronunciation.py`.

### 9.3 Negative tests

`bash scripts/content-gates-negative.sh` (full, with N7) at 2026-09-16T05:45:14+00:00 (14:45 KST): 33 passed, 0 problems, 238 s. N1–N11 as in §3; the ten cases added this pass:

* N12: **caught** — the streak counted from zero (first learning day reads Day 0) — ❯ src/domain/streak.test.ts (20 tests | 15 failed) 29ms
* N13: **caught** — a session-screen-only day counted as a streak day — ❯ src/domain/streak.test.ts (20 tests | 3 failed) 22ms
* N14: **caught** — the letter-sound question drawing i beside i again — ❯ src/features/review/answerable.test.ts (16 tests | 1 failed) 799ms
* N15: **caught** — the matching grid showing one meaning twice again — ❯ src/features/vocabulary/dailyQuestions.test.ts (7 tests | 2 failed) 199ms
* N16: **caught** — near-synonym glosses offered against each other again — ❯ src/features/learning/wordOptions.test.ts (3 tests | 1 failed) 71ms
* N17: **caught** — ㅀ-stems labelled 된소리되기 again — ERROR: pattern fixture 싫다 (ㅀ + ㄷ aspirates; was labelled tensing): rules name 'tensing', expected 'aspiration'
* N18: **caught** — 담요 back to plain liaison — ERROR: pattern fixture 담요 (표준발음법 §29's own example: [담뇨]): rules name 'liaison', expected 'insertion'
* N19: **caught** — the card printing 먹으세요 under Please do again — ❯ src/conjugate.test.ts (187 tests | 1 failed) 36ms
* N20: **caught** — a banned rival planted back into a shipped gap-fill — 1  reviewed-conflict
* N21: **caught** — the review session resolving its plan before the profile has loaded — ❯ src/pages/reviewSessionHydration.test.tsx (3 tests | 2 failed) 10040ms

N21 was first run with `ReviewSessionPage.tsx` missing from the harness's backup list, so the planted line survived the run (`30 passed, 1 problem: review hydration STILL FAILING`); the file was restored by hand, compared byte-for-byte with the copy taken before the run, the list corrected, and the harness re-run twice — the JSON in `docs/content-gates-negative.json` is from the last run.

### 9.4 End-to-end, from the production build

`npm run build` before each run (exit 0; 18.8 s and 18.2 s). One project at a time, run from `apps/web`:

| Run | Result | Wall | Exit |
|:---|:---|---:|---:|
| mobile — `streak`, `activity`, `home-header`, `sound-changes` (first run) | 34 passed, 3 failed | 1.9 m | 1 |
| mobile — the same four after the fixes | 37 passed | 2.1 m | 0 |
| mobile — the other 29 specs | 281 passed, 2 failed (`choice-layout` ko, ar) | 29.2 m | 1 |
| desktop — all 33 specs | 319 passed, 1 failed (`safe-area.spec.ts:142`, *browser.newContext: Target page, context or browser has been closed* — the browser process, not the product) | 30.7 m | 1 |
| desktop — `safe-area.spec.ts` alone | 10 passed | 49 s | 0 |
| mobile — all 33 specs, final build | 320 passed | 30.4 m | 0 |

The three first-run failures: `sound-changes.spec.ts` expected six sections and the lesson now teaches seven (ㄴ 첨가) — the spec's pattern list was extended; `home-header.spec.ts` at 320 px × 200 % text, light and dark, measured the logo at 29 px wide (I-247, §9.5). The two `choice-layout` failures were the review session resolving an empty plan before the profile had loaded (I-248): the case passed alone (`1 passed, 25.3 s`) and failed only inside the long run, which is the signature of a hydration race; the fix is held by `reviewSessionHydration.test.tsx` and N21, and the full mobile project was re-run on the final build.

The desktop project was run on the build that preceded the review-session fix; the mobile project was run in full on the final build. The change between them is `apps/web/src/pages/ReviewSessionPage.tsx` (the mount-time plan resolution) and `apps/web/src/pages/reviewSessionHydration.test.tsx`.

### 9.5 The Home header, measured

A temporary Playwright spec (not committed) measured the brand header at 320 px in the production build, fresh profile and a one-day-streak profile, at 100 / 150 / 200 % text:

| Profile | Text | Logo width before | Logo width after |
|:---|---:|---:|---:|
| fresh (*Start today*) | 100 % | 115 | 115 |
| fresh | 150 % | 71 | 88 |
| fresh | 200 % | **29** | 88 |
| one-day streak | 100 % | 123 | 123 |
| one-day streak | 150 % | 123 | 111 |
| one-day streak | 200 % | **98 (distorted)** | 88 |

"Before" is the `auto 1fr` grid narrowing the image box at a fixed 26 px height; "after" scales the mark at its own ratio (88 px is 18.5 px tall). The screenshots `hdr-fresh-1.png`, `hdr-fresh-1.5.png`, `hdr-fresh-2.png`, `hdr-active-2.png` were read: the invitation folds onto two lines at 150 % and 200 %, the logo is intact, nothing overflows. `home-header.spec.ts`: 25 cases green on both projects.

### 9.6 The report

`docs/report.md` regenerated with `npm run issues` (244 issues; 6 open, 1 blocked, 5 partial, 232 resolved) and `npm run docs:consistency` (78 figures across 6 documents), then `npm run report:pdf` and `npm run report:pdf:inspect` — the page count, sizes and the inspection record are in §9.8 below and in `docs/report-pdf-inspection.json`.

### 9.7 Commits, the push, and the check from the committed tree

Made 2026-09-16 on `main` from base `d511ff1e`, after `git status --short`, `git diff --cached --check`, `--stat` and `--name-only` were inspected before each one; no path under `apps/mobile/android`, `apps/mobile/ios`, `result/`, `app_result/` or `capacitor.config.*` is in any of them; `package.json` versions unchanged (web 1.0.5; native 1.0.4 / versionCode 25 untouched, `version:check` green).

| Commit | Message | Files |
|:---|:---|---:|
| `50987dce` | fix(web): a streak day is a learning day, the first one is Day 1, and Home invites a learner who has none | 44 |
| `d00460ad` | fix(web): the review session waits for the profile before it decides nothing is due | 2 |
| `7733cc73` | feat(content): the corpus read as Korean — sound rules, honorifics, glosses, gap-fills and every artefact rebuilt | 665 |
| `844659cf` | feat(qa): every learner-reachable question inventoried, an expert gold set, and ten more negative cases | 7 |
| (this document's own commit) | docs(report): the nineteenth pass — report, issues, audit and evidence documents | see `git log -1` |

After the last commit, from the committed tree: `docs:consistency:check` (the clean-tree rule included), `issues:check`, `version:check`, `typecheck`, `npm test` and `npm run build`, with exit codes in the final response; then `git push origin main` once, without force, `git fetch origin`, and `git rev-parse HEAD` compared with `git rev-parse origin/main`.

### 9.8 The regenerated PDF

`npm run report:pdf` (exit 0, 6 s) wrote `docs/report.pdf`: 6,789,142 bytes, sha256 `3f4fbf3b0a69323efd34607d5a226eac91cd832b861593ce48e249f04c7c4e48`, **446 pages** (the eighteenth edition was 426). `npm run report:pdf:inspect` (exit 0, 11 s): blank 0, replacement characters 0, markdown artefacts 0, pages with Hangul 446, recorded in `docs/report-pdf-inspection.json` at 2026-09-16T06:08:32.371Z. Every page was rendered with `pdftoppm` at 40 dpi into fifteen contact sheets and read; pages 242–247 (§20AC in full) and the last sheet (§22, §23, the closing tables) were rendered at 70 dpi and read page by page: no cut-off table, no overflowing code span, sections in order, the verdict on page 438. The ten pages under 300 characters — 37, 38, 41, 42, 43, 44, 46, 47, 48, 50 — are the glyph sheets and device screenshots of §7 and are image pages, as in the previous edition. The PDF is ignored by git (`*.pdf`) and is regenerated from the committed Markdown; the inspection record is tracked.
