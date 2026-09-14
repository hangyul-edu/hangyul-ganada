# Web content quality audit — v1.0.5

Written 2026-09-14 for the eighteenth pass (web only), extended 2026-09-15 after the second reading. Every figure below is read from a generated file named in its row; the base commit of the pass is d06c7faa and the commits that carry it are listed in the QA evidence document. Labels: **VERIFIED** (re-derived and it held), **CONTRADICTED** (two current statements of the report disagreed, or the statement disagreed with the tree), **PARTIALLY VERIFIED** (true at the pass that wrote it, stale as a current claim), **UNVERIFIED** (could not be re-derived from this machine), **HUMAN REVIEW REQUIRED**, **EXTERNAL BLOCKER**.

## 1. The claims of report(20260914-031145) — the seventeenth edition

| # | Claim as written | Where | Finding | Label | Now |
|---:|:---|:---|:---|:---|:---|
| 1 | Words shipping 3,370 | §2.2 | The same edition says 3,393 in §1, §3, §8, §9, §11, §14 and 3,333 in §20; the tree at the pass held 3,370. | **CONTRADICTED** | 3,867 — one figure, `content-inventory.json` `taught_entries`; §1 now marks pass narratives as historical |
| 2 | 20 packs complete, 12 at 600 | §2.2 | §11.1 of the same edition says 32 complete and no partial language; `locale:content:qa` reports 32. | **CONTRADICTED** | 32 complete, 0 partial (`locales.complete`) |
| 3 | I-126 "needs a spoken-Korean corpus that is not open data" | §3 verdict | The ledger marked I-126 RESOLVED in the same edition; the learner list adopted this pass is open data (KOGL type 1). | **CONTRADICTED** | Verdict rewritten; I-126 RESOLVED, I-229 records the second source |
| 4 | Beginner gap-fills 36 → 53 | §20AA.3 | §20Z said levels 1–5 hold 36; both were true at their pass. | **PARTIALLY VERIFIED** | 60 at levels 1–5 now (`gap_fills.levels_1_to_5`) |
| 5 | Curated gap-fills recorded in both voices | §20AA.3 | `audio.curated_gap_fills_with_both_voices` = 39 of 39; `audio.curated_missing` empty. | **VERIFIED** | holds |
| 6 | Tests 1,523 web / 833 safety / 2,689 total | §19.1 vs §2.2/§23 | §2.2 and §23 carried the 1.0.4 delivery counts (1,512 / 811 / 2,689) beside §19.1's 1,523 / 833; the total was never the sum of its parts. | **CONTRADICTED** | 1,525 / 1298 / 3,156, one run, `npm test` |
| 7 | 166 screens rendered vs 143 | §20AA.5 vs §23 | Two passes, two render sets; §23 was not updated at the seventeenth pass. | **PARTIALLY VERIFIED** | 166 this pass |
| 8 | I-03 "built but has no destination" | ledger vs §18.7 | The ledger summary and §18.7 agree; §4.3 says the product "stops there". No contradiction found on re-reading; the wording differs, the fact does not. | **VERIFIED** | unchanged, EXTERNAL BLOCKER (a URL only the owner has) |
| 9 | I-79 "about five weeks" vs "52 days" | ledger summary vs impact | Two measures (all-new vs reserved-new) stated as one number. | **CONTRADICTED** | re-measured: 43 / 87 days at ten a day, both defined; thinnest zone now 24-26 |
| 10 | docs:consistency:check settled | §20AA.5 | It failed on 24 claims against the tree it described. | **CONTRADICTED** | passes on every figure; the clean-tree rule waits on I-232 |
| 11 | Every taught word has both voices for headword and example | §14 | `audio.headwords_with_both_voices` = 3867, `examples_with_both_voices` = 3867, `missing` empty; `audio:qa:full` in the QA evidence. | **VERIFIED** | holds at 3,867 |
| 12 | 32 locales, every row written | §11.1 | `translation:audit:check`: 123,744 rows, 0 MISSING_MEANING, 0 MISSING_EXAMPLE. | **VERIFIED** | holds; form only — see §3 |
| 13 | No locale reviewed by a native speaker | §11.3 | Still true; this pass added a model reading of 90 rows and labels it as such. | **VERIFIED** | HUMAN REVIEW REQUIRED on every row |
| 14 | The runtime safety subset is the full policy's Korean, English and romanised forms | §20AA / policy §6 | It was English-only for the learner-language surface; a Thai meaning refused by the full policy passed the runtime gate. | **CONTRADICTED** | per-language supplements, I-228 RESOLVED, negative case N6 |
| 15 | Levels are computed from evidence, not declared | §8 | One frequency source plus an editorial usefulness mark per batch; 1,031 words sat too high against an independent list. | **PARTIALLY VERIFIED** | two sources, I-229 RESOLVED, negative case N7 |
| 16 | Android / iOS deliveries at 1.0.4, versionCode 25 | §2.1 | Not touched by this pass; not rebuilt; `git diff --name-only` shows no native path. | **VERIFIED** | unchanged by design |
| 17 | Study-selection chevrons sit on one trailing guideline | §13 / design audit | On the production build the lesson rows drew the chevron 16 px in, the Numbers card 46 px, 소리가 만날 때 78 px: the foot cards were a flex row with no `flex: 1` on the text column. | **CONTRADICTED** | shared grid layout in `LettersPage.module.css`; `letters-chevron.spec.ts` measures 18 px on every card at 5 widths × 2 text sizes × 3 locales; before/after screenshots in `docs/qa-screenshots/` |
| 18 | The eighteenth pass was complete | previous final response | It was not: the tree was uncommitted (git objects corrupt), the 76 shared glosses of I-231 remained, the per-locale table and the 14-column quotation table did not exist, and ten evasion shapes passed the safety policy. | **CONTRADICTED** | each item is a row in the ledger below with its evidence |
| 19 | The child-safe policy refuses every evasion shape the brief names | policy §4 | Twenty-six further shapes were probed; ten passed (split-once Korean terms, ideographic space, Cyrillic look-alikes, particle-attached Latin terms, parenthesis masks, hyphenated spelling, Han/kana in Korean fields). | **CONTRADICTED** | four normaliser/evaluator rules in both ports; fixtures 368 → 406; N9, N10; false-positive cost measured over 84,038 Korean strings: 0 |
| 20 | Git history intact after the crash | I-232 | HEAD and main both at d06c7faa and the remote agreed; 1,092 zero-byte loose objects, 1,070 missing blobs referenced only by the aborted commit's index, one unreachable commit in the reflog. | **VERIFIED** | quarantined, index rebuilt, fsck clean, working tree byte-identical — §20AB.8; I-232 RESOLVED |
| 21 | Every learner-facing Korean interface string has been read at its current wording | §20AA / copy ledger | `copy:ledger:check` green; the 884 strings were read again in full on 2026-09-15; one rewritten. | **VERIFIED** | levelTest:intro.retake → 다시 해 보기, recorded in `docs/copy-audit-ko.json` |

## 2. The corpus after this pass

| Measure | Value | Source |
|:---|---:|:---|
| Taught entries (complete: id, lemma, POS, sense, gloss, level, category, example, 32 locales, pronunciation, audio, safety) | 3,867 | `content-inventory.json` `taught_entries`; `problems` = 0 |
| Distinct headwords / senses / homographs taught twice | 3,867 / 3,867 / 0 | same |
| Spacing variants counted as words | 0 | `duplicates.spacing_variants` |
| Target / distance | 10,000 / **6,133** | `target`, `distance_to_target` |
| Added this pass | 497 in seven batches | `content/vocabulary/entries/300.jsonl`–`306.jsonl` |
| Words at levels 28–30 / at 30 | 436 / 298 | `by_level` |
| Level-test items / context items / distinct words / reach | 4,191 / 613 / 1,790 / 2,253 | `level_test` |
| Audio files / voice slots / missing | 15,840 / 15,960 / 0 | `audio` |
| Safety findings across 1,122,518 fields | 0 | `safety`; `docs/child-safe-content-audit.json` |
| Shared English glosses | 0 | `duplicates.shared_english_glosses`; I-231 (108 → 0 across the pass) |

## 3. Korean source audit ledger

| Surface | Rows | Label | Evidence |
|:---|---:|:---|:---|
| Korean headwords and examples, all | 3,867 | AUTOMATED CHECKED | `examples:qa` (2–8 eojeol, 해요체, ≤1 unknown supporting word, no duplicate), `korean:education:qa`, `content:safety:check`, `romanization:qa`, `audio:pronunciation` — exit codes in the QA evidence |
| Korean examples of the 497 new entries | 497 | MODEL-REVIEWED | written and re-read by the model against the gloss and the copy rows; refusals and rewrites listed in §20AB.2 |
| Korean definitions (`m.ko`) of the 497 new entries | 497 | MODEL-REVIEWED | same pass; 찍다 trimmed to one sense |
| The 108 glosses rewritten (I-231) | 108 | MODEL-REVIEWED | patches C, J, K, L, M in the pass; sense gate green; `duplicates.shared_english_glosses` = 0 |
| The 497 new entries, re-read as a set for bulk-generation artefacts | 497 | MODEL-REVIEWED | template shapes (max 7 share one), pronoun starts, lengths 2–5 eojeol, 26 two-synonym glosses read, 29 identical English example translations corpus-wide read (5 rewritten); 0 rejected, 0 retired on the second reading |
| Learner-facing Korean interface strings | 884 | MODEL-REVIEWED | read in full 2026-09-15; 1 rewritten; `copy:ledger:check` |
| Any row | — | NATIVE-SPEAKER REVIEWED | **none**; not claimed anywhere |
| Every row | 3,867 | HUMAN REVIEW REQUIRED | until a native reader reads it (I-17, I-213) |

## 4. Level model

Evidence-based, no manual balancing: `scripts/content/level.py` scores 0.34 frequency + 0.26 utility + 0.22 linguistic + 0.18 semantic; the frequency cost is the *lower* of the OpenSubtitles cost and the learner-list cost; the usefulness ceiling reads the learner grade. Overrides on record: `content/vocabulary/level-overrides.json` (each with a reason) and `level-anchors.json` (held: see `vocabulary:level:audit`). Distribution by level is `by_level` in the inventory; zone exhaustion at every daily goal is `zones`.

## 5. Translations, quotations, safety, audio, scalability

* Translations: `docs/CONTENT_TRANSLATION_AUDIT_v1.0.5.md` — 123,744 rows AUTOMATED CHECKED, 0 blocking; `docs/content-translation-review-sample.json` — 90 rows MODEL-REVIEWED (87 PASS, 3 FLAGGED and corrected).
* Quotations: `docs/QUOTE_TRANSLATION_REVIEW_v1.0.5.md` — 64 rows in the fourteen-column table (meaning, metaphor, naturalness, register, punctuation, model-review, native-review, correction, final status): 43 RESOLVED, 21 HUMAN REVIEW REQUIRED, 0 NATIVE-SPEAKER REVIEWED; Carlyle attribution stated with its limit in the runtime `source` field and in the document.
* Per locale: `docs/LOCALE_AUDIT_v1.0.5.md` — one row per locale with diff-derived correction counts (`docs/locale-audit-v105-input.json`), rendered-screen findings (`qa:locales --summary`) and the remaining human-review items; every locale HUMAN REVIEW REQUIRED.
* Child safety: `content:safety:check` over every content family; runtime supplements per language (I-228); policy version 1.0.0 compared between publication and runtime at build and at load. Evasion re-run 2026-09-15: 26 further shapes probed, 10 passed the policy and are now refused by four rules in both evaluators (forward syllable join, mixed-script homoglyph fold, script-change token boundary, foreign-script list reading); fixtures 368 → 406, `child_safety.py --self-test` 406/406 agree; negative cases N9, N10.
* Audio: `audio:qa:full` — 15,960 voice slots checked, 15,960 decoded, 0 errors, 1 warning(s) (`docs/audio-qa-v105.json`); two 170 ms female clips the recorder had returned for eight-syllable sentences were caught and re-recorded; no placeholder clip remains: every file decodes, is not silent, is of plausible length for its syllables, and the two voices differ.
* Scalability: `docs/content-scalability.json` — first render 60.3 kB gzip (line 120 kB), corpus all locales 2560.2 kB, audio 81.9 MB; at 10,000 words 6620.6 kB and 211.9 MB. Web lazy loading: bands after first paint, dictionary and bank on first use, audio per clip.

## 6. Negative tests

| Case | Result | Detail |
|:---|:---|:---|
| N1 | caught | inventory figure out of date — docs/content-inventory.json is stale — run npm run content:inventory |
| N2 | caught | Korean copied into th example — 3 blocking translation finding(s): th/word_geot/KOREAN_COPIED, th/word_geot/HANGUL_IN_TRANSLATION, th/word_geot/WRONG_SCRIPT |
| N3 | caught | Hangul in en example — 1 blocking translation finding(s): en/word_geot/HANGUL_IN_TRANSLATION |
| N4 | caught | placeholder in vi meaning — 1 blocking translation finding(s): vi/word_geot/PLACEHOLDER |
| N5 | caught | first render over its line — first render 60.3 kB gzip exceeds the 10 kB line |
| N6 | caught | runtime supplement weaker than the full policy — ❯ packages/content-safety/src/runtime.test.ts (641 tests \| 1 failed) 2185ms |
| N8 | caught | slur in shipped meaning — blocked profanity  en     vocabulary.en.json:word_geot                 retard — a retard |
| N9 | caught | split-once evasion passes the fixtures — ❯ packages/content-safety/src/fixtures.test.ts (407 tests \| 5 failed) 1751ms |
| N10 | caught | particle-attached Latin term passes the fixtures — ❯ packages/content-safety/src/fixtures.test.ts (407 tests \| 4 failed) 1646ms |
| N11 | caught | stale per-locale audit table — /root/hangyul-ganada/docs/LOCALE_AUDIT_v1.0.5.md is stale — run node scripts/build-locale-audit-v105.mjs |
| N7 | caught | learner-list evidence dropped from the level model — anchors held          166 |

The thirteen earlier known-bad implementations in the negative-test catalogue (report §19.4, §20H.2) were not re-run this pass; they are unchanged code paths.
