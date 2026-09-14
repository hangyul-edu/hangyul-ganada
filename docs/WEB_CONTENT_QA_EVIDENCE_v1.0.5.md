# Web content QA evidence — v1.0.5

Written 2026-09-14, rewritten 2026-09-15 after the second reading, on base commit d06c7faa. Web only: no gradle, xcodebuild, pod, capacitor sync or native asset sync was run; `git diff --name-only` and `git status --short` were checked before and after every phase and no path under `apps/mobile/android`, `apps/mobile/ios`, `result/`, `app_result/` or `capacitor.config.*` changed. Versions unchanged: web v1.0.5, native 1.0.4, versionCode 25.

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
