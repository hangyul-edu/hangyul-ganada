# Web content remediation ledger — v1.0.5

Written 2026-09-14, extended 2026-09-15 after the second reading. Statuses are only RESOLVED, PARTIALLY RESOLVED, OPEN, HUMAN REVIEW REQUIRED, EXTERNAL BLOCKER. Each row names the evidence a reader can re-run.

| # | Item | Status | Evidence |
|---:|:---|:---|:---|
| 1 | One canonical machine-readable content inventory used by every document | **RESOLVED** | `docs/content-inventory.json`, `npm run content:inventory`, `content:inventory:check` in `verify:quick`; report §2.2 cites it; negative case N1 |
| 2 | Report contradictions (three word counts, pack counts, I-126 verdict, gap-fills, test counts, screens, I-03, I-79, docs:consistency) | **RESOLVED** | report §20AB.1, `docs/WEB_CONTENT_QUALITY_AUDIT_v1.0.5.md` §1, `docs:consistency:check` on figures; I-227 |
| 3 | 10,000-word target — 3,867 reached, 6,133 short | **OPEN** | 497 added in seven validated batches; the deficit and the rate are stated in §20AB.2 and I-04; the target was not lowered |
| 4 | Level quality: evidence-based model, no manual balancing, overrides documented | **RESOLVED** | learner-list evidence (I-229), `level-overrides.json` reasons, anchors held, `vocabulary:level:qa`/`:audit` green; negative case N7 |
| 5 | Korean source audit ledger with honest labels | **RESOLVED** | audit §3: AUTOMATED CHECKED for all, MODEL-REVIEWED for the 497 + 32 glosses, NATIVE-SPEAKER REVIEWED for none |
| 6 | 32-locale translation audit, two passes, machine-readable per locale and per row | **RESOLVED** | `translation:audit:check`, `docs/content-translation-audit.json`, `docs/content-translation-review-sample.json`; three wrong rows fixed (I-230) |
| 7 | Native-speaker review of any locale | **HUMAN REVIEW REQUIRED** | I-17, I-213; no row is labelled native-reviewed |
| 8 | 64-row quotation audit with attribution honesty | **RESOLVED** | `docs/QUOTE_TRANSLATION_REVIEW_v1.0.5.md`, `quotes:review:check`; 21 rows carry a named point for a native reader |
| 9 | Child-safe policy on every surface; runtime subset gap; 24 kB budget kept | **RESOLVED** | I-228; `content:safety:check`, `content:safety:bundle:check`, `policy:runtime:check`; negative cases N6, N8 |
| 10 | Runtime / publication policy version compatibility | **RESOLVED** | `RUNTIME_POLICY_VERSION`; supplements refused when their version differs from the base; `policy:runtime:check` fails when the committed subset lags the source |
| 11 | Level Test / exercise quality ledger | **RESOLVED** | `leveltest:qa`, `:bank`, `:ambiguity`, `:distractors`, `:policy`, `:simulations`, `:content`, `:locale`, `questions:ledger`, `ambiguity:ledger` green on the final tree; `docs/LEVEL_TEST_CONTENT_REVIEW.md`, `docs/AMBIGUITY_LEDGER.md`, `docs/LEVEL_TEST_SIMULATION_RESULTS.md` regenerated; counts in the inventory `level_test` |
| 12 | More-about-it triggers and sourced relations only | **RESOLVED** | `vocabulary:relations:qa` green; 292 words with relations, 88 synonym and 77 antonym pairs, every one from `content/vocabulary/relations.json` with a source; 99 long definitions |
| 13 | Audio verification, no placeholders | **RESOLVED** | `audio:qa:full` (decode, silence, duration, voice distinctness, manifest agreement) — see the QA evidence; inventory `audio.missing` empty |
| 14 | Scalability measurements and web-only lazy loading | **RESOLVED** | `content:scalability:check`, `docs/content-scalability.json`; negative case N5 |
| 15 | QA gates with negative tests | **RESOLVED** | `scripts/content-gates-negative.sh` → `docs/content-gates-negative.json`; N1 caught, N2 caught, N3 caught, N4 caught, N5 caught, N6 caught, N8 caught, N9 caught, N10 caught, N11 caught, N7 caught |
| 16 | Full web-only verification | **RESOLVED** | `docs/WEB_CONTENT_QA_EVIDENCE_v1.0.5.md` — every command, exit code and count |
| 17 | Report repaired from generated evidence, PDF regenerated and inspected | **PARTIALLY RESOLVED** | report figures re-derived (§2.2, §20AB); PDF status in the QA evidence document |
| 18 | Shared English glosses | **RESOLVED** | 108 rewritten across the pass; 0 remain (I-231) |
| 19 | Git repository repaired without discarding work | **RESOLVED** | I-232 — 1,092 zero-byte objects quarantined (not deleted), index rebuilt with `git read-tree HEAD`, two reflog lines for the unreachable commit removed after backup, `git fsck --full --no-dangling` exit 0, working tree sha256-identical before and after; backups under /root/hangyul-backup/ |
| 20 | Study-selection chevron misalignment (소리가 만날 때) | **RESOLVED** | shared two-column grid in `LettersPage.module.css` (`minmax(0,1fr)` + 24 px slot, `justify-self: end`), decorative chevron, 44 px target, RTL mirrored; `apps/web/e2e/letters-chevron.spec.ts` (fails on the old layout by 30–62 px); screenshots `docs/qa-screenshots/letters-chevron-*.png` |
| 21 | Level Test first question latency after the start button | **RESOLVED** | `LevelTestPage.tsx` prefetches the bank while the intro is on screen; `leveltest:locale:check` green |
| 22 | Forensic re-read of the 497 new entries for bulk-generation artefacts | **RESOLVED** | audit §3; five hidden-distinction pairs rewritten with 31 translations; 0 rejected, 0 retired |
| 23 | Per-locale audit table (32 rows, nine columns) | **RESOLVED** | `docs/LOCALE_AUDIT_v1.0.5.md`, `scripts/build-locale-audit-v105.mjs --check`, negative case N11; every row HUMAN REVIEW REQUIRED for a native reader |
| 24 | Quotation table with the fourteen requested columns | **RESOLVED** | `docs/QUOTE_TRANSLATION_REVIEW_v1.0.5.md`, `quotes:review:check`; 43 RESOLVED / 21 HUMAN REVIEW REQUIRED |
| 25 | Child-safe policy against further evasion shapes | **RESOLVED** | four rules in `normalize.ts`/`evaluate.ts` and `child_safety.py`; 38 new fixtures; N9, N10; false-positive measurement 0/84,038 |
| 26 | Korean learner-facing copy audit | **RESOLVED** | 884 strings read; 1 rewritten; `copy:ledger:check` |
| 27 | Commits and the single push | **RESOLVED** | commit hashes and the push record in the QA evidence document §6 |
