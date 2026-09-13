# Web product critical audit — v1.0.5

*13 September 2026. Web only. The Android and iOS projects were not modified,
synchronised, packaged or built, and nothing here is a claim about them.*

| | |
| --- | --- |
| Baseline | `bdd2d552932c4a77d7e00a893f7df3f43bf7592e` on `main`, clean, no untracked files |
| Report read | `docs/report.pdf` — 238 pages, dated 12 September 2026, describing 1.0.4; md5 `efaa857f482f68241a075b06d140ac7f`. The named file `docs/report(20260913-010919).pdf` does not exist in the repository; `docs/report.md` is its source and was read alongside it |
| Web product | **v1.0.5** (`apps/web/src/config/product.ts`) |
| Android project | **not modified or built** — delivered 1.0.4, versionCode 25 |
| iOS project | **not modified or built** — delivered 1.0.4, build 25 |
| Companion documents | `WEB_UX_CONTENT_REMEDIATION_LEDGER_v1.0.5.md` (every finding, in the required format), `WEB_CONTENT_REVIEW_v1.0.5.md` (the Korean and locale reading), `WEB_QA_EVIDENCE_v1.0.5.md` (every command, exit code and count), `WEB_RELEASE_NOTES_v1.0.5.md` |

## 1. Verdict

**Web: releasable, with the external items in §7 open.** Seven passes were run
(§6). The last two passes found no new P0 or P1; the pass before them found
one P1 (the Try-again canvas) and the child-safety evasions, both fixed and
negative-tested. No P0 was found at any point.

The report's most important green claims about *what the learner sees* did
not all survive re-derivation. Four "200 % text" checks — the ones the previous pass's own
correction of nine such sites did not reach — were measuring text at 100 %
(§3, C-02). The first-load figure in §16 was 38 kB stale (C-05). I-204,
carried as OPEN, cannot be reproduced on this tree and is now pinned by a test
that would catch it (C-09). None of these was a defect a learner met; all
three were gates or figures saying more than they had measured, which is the
class of error the report itself warns about in §1.

## 2. Method

**Read first.** All 238 pages of `docs/report.pdf`, then `docs/report.md`
where the PDF elided a table; then the code behind every claim the report
labelled VERIFIED that concerned something a learner sees or a gate that
stands in for a learner.

**Walk second.** The production build (`npm run build --workspace
@hangyul-ganada/web`, served by `vite preview`) was walked as a first-time
learner in English, then Korean, then in Arabic (RTL), German and Tamil (long
words), then at 200 % text, across the nine viewports in the brief
(320×568 … 1440×900), light and dark, with keyboard only and with a screen
reader's view of the DOM. Screenshots were inspected, not counted: 324 renders
in the English matrix and the locale/large-text matrices (`scratchpad
matrix.mjs`, `walk.mjs`, `shot.mjs` — harnesses outside the repository, their
findings recorded in the ledger).

**Then the gates, and then the gates against themselves.** Every web gate was
run individually (§5). Every gate added or corrected in this pass was broken on
purpose and shown to fail (§6, Pass 6).

**Then the content.** Every learner-reachable Korean interface string (884)
read in full; every English gloss of the 3,370 taught words read against its
Korean and its example; the level-test bank's curated items read one by one;
the 32 locale packs checked structurally and, for the ten the product declares
complete, read for meaning where the reviewer can (§4 of the content review).

## 3. The report's claims, re-derived

Labels: **VERIFIED** re-derived on this tree and true · **CONTRADICTED** re-derived and false · **PARTIALLY VERIFIED** true in the common case, false in a real one · **UNVERIFIED** could not be re-derived from this machine · **EXTERNAL VALIDATION REQUIRED** true only if a person outside the repository confirms it.

| # | Report claim | Where | Result | What was found |
| --- | --- | --- | --- | --- |
| C-01 | 17 routes, every screen clean at seven device profiles | §5.1, §5.2 | **PARTIALLY VERIFIED** | Routes verified. "Clean" held at 100 % text; at 200 % text the words category grid, the progress-bar label, the bottom-tab labels and the conjugation rows overflowed at 320 px (W-010). The gate could not see it — see C-02 |
| C-02 | `screens:audit` renders 390 at 200 % text and finds nothing; "nine large-text measurements … re-run for real" | §5.2, §15, §20Z.8 | **CONTRADICTED** | Two layers. The sixteenth pass missed four sites (`screens:audit` still set root `font-size`; `modals:qa`, `accessibility.spec`, `confirm-dialog.spec` set `text-size-adjust`). And at eight of the nine sites it did correct, the token sheet was appended from an init script before the document had a `<head>` — the append threw, the throw was swallowed, and the "re-run for real" figures (45/45, 12/12, 16/16, 210/210, 79 spec cases, the 64 px tab targets) were measured at normal text (W-024). The design tokens are `px`, so every one of those renders was at 100 %. All four now scale the tokens, assert the rendered text is ≥ 1.9× and fail on content pushed past the viewport. Re-run: 143/143 renders passed on the corrected CSS — and the corrected gate *also* passed the old CSS, because W-010's overflows were at 320 px and the gate's only 200 % profile was 390; a `320-200%` profile was added (166 renders), which fails the old CSS with 7 findings and found W-026 on the new one |
| C-03 | axe passes WCAG A/AA on every route, light and dark | §15 | **VERIFIED** | Re-run, passes. Axe does not measure the two things found by reading: a gap-fill blank whose `aria-label` sat on a `<span>` (ignored by assistive technology, W-004), and a 404 page whose `<h1>` was empty (W-007). Both fixed |
| C-04 | Every enforced bundle budget met; first load 273.3 kB | §16 | **PARTIALLY VERIFIED** | Budgets met — but the figure was stale: HEAD measured 311.8 kB before this pass, 314.1 kB after it (the 24 new notes × 32 languages land in band 1; precache 1073.5 → 1151.5 kB, 72 % of budget). No budget was raised |
| C-05 | "at 3,393 words" | §16 | **CONTRADICTED** (stale) | The corpus is 3,370 taught words (23 retired by the child-safety pass, §20-series); the sentence was carried forward |
| C-06 | Numbers: completion derived from evidence; I-204 seed race OPEN | §20K, I-204 | **CONTRADICTED** (in the product's favour) | `NumberSessionPage` has gated the exercise phase on `storage.checked` since 8b489ebe; a slow-driver test that seeds stored attempts proves the first question is built from the stored count. I-204 → RESOLVED with the test as evidence |
| C-07 | Difficulty model: I-126 fixed for concreteness, residual is the frequency term | I-126, I-133 | **VERIFIED, then fixed** | The residual was real and measurable (길다 ranked 893rd, 잇다 1st). The frequency reader was rewritten at the source; 419 of 3,370 words moved level; anchors held |
| C-08 | Level Test: ±3 levels in 30 items, every language reaches the top | §10.7, §10.8 | **PARTIALLY VERIFIED** | The simulation claims re-run and hold (`leveltest:simulations`). What the simulation measures is the bank's *internal* consistency against its own levels — not that a real learner's level is what the number says. Real validity is EXTERNAL (§7). Content validity was improved: 17 curated beginner gap-fills (levels 1–5: 36 → 53) so the bottom of the scale asks sentences a beginner can read |
| C-09 | The remaining-time clock in the Level Test | §10.6 | **CONTRADICTED** | Showed 8:01 on the first tick and a stale minute after a resume: `remaining` was computed from the previous `now`. Fixed (W-005) |
| C-10 | Child-safety: "every conjugated, particle-attached, spaced, punctuated, romanised, misspelled or translated variant" is refused | §12, policy | **PARTIALLY VERIFIED** | The named classes hold (367 fixtures). Three classes the sentence implies were not covered: spelled-out jamo (ㅅㅔㄱㅅㅡ), a loose final after an open syllable (세ㄱ스), and a Latin-script term inside a Korean field (우리 sex 하자). All three now refused, in both evaluators, with fixtures; negative-tested |
| C-11 | The runtime policy subset judges "by the same rules the release scanner applied" | §6 of the policy | **PARTIALLY VERIFIED** | True for Korean and romanised forms. The runtime carries no English lists (they would put the chunk past the 24 kB budget: 16.7 → ~24.7 kB gz), so a Latin word hidden in a Korean field is the publication gate's to refuse. Documented in the policy and in the runtime test, which names the fixtures it does not carry |
| C-12 | Korean interface copy natural, 해요체 | §12 | **VERIFIED** | 884 strings read; one stale sentence (the Language screen's coverage footnote, W-009) |
| C-13 | Hangul completion hands off to the next product | §4.3, §18.7 | **CONTRADICTED** as a learner experience | With no configured URL the "earned" card rendered nothing a learner could act on. It now offers the in-product next step (*Words*) in 32 languages; no URL is invented (W-008) |
| C-14 | Matching, word-ordering, show-answer, [4]/[2,2], retired words, back navigation, legal pages, bottom nav, compound vowels, progress — the regression matrix | §20-series | **VERIFIED** | Every behaviour re-walked on the build and re-run in the unit and e2e suites (ledger §R). One addition: after *Check*, a partly right matching grid said only *Incorrect*; it now says how many pairs were right (W-003) |
| C-15 | Audio: every clip in the manifest decodes, both voices | §14 | **VERIFIED** | `audio:qa` 0 errors after re-recording; `audio:pronunciation:check` 0 errors on the rebuilt `sw.js`. A curated gap-fill *played the card's example sentence* while showing its own (W-014) — fixed; the 39 curated sentences are recorded in both voices |
| C-16 | Persistence: schema 14, every version walks to it; per-row writes serialised | §13 | **VERIFIED** | Unit suites re-run (1,520 web tests). The hydration harness itself was wrong: `wordSessionHydration.test.tsx` measured a thrown error, not a slow driver (W-019); fixed, still passes |
| C-17 | Offline: the app works with the network off | §17 | **VERIFIED** (web) | `offline.spec` passes on the production build at both projects |
| C-18 | 32 locales, ten complete, twenty-two at the core band | §11 | **VERIFIED structurally; meaning EXTERNAL** | `i18n:check`, `locale:content:check`, `locale:ledger:check` pass; the locale table in the content review labels each language. Two new strings failed the register gate in Czech and Mongolian and were corrected before commit |
| C-19 | Version 1.0.4 / versionCode 25 in the delivered artefacts | §2.1 | **VERIFIED, unchanged** | Native untouched. The web product is 1.0.5 (`displayVersion()` on the Legal and Privacy screens reads `v1.0.5`); the gate distinguishes the two and refuses a web version behind native. `docs/legal/*.md` stay at 1.0.4: they are copied into the native delivery by `build-result.mjs` and the gate pins them to the native release |
| C-20 | `name:check` passes | §19 | **UNVERIFIED on this tree** | Fails on `patent/**` (an untracked, read-only directory outside this brief). Every other file passes. Not fixable here |
| C-21 | Android emulator / device results (§18) | §18 | **EXTERNAL VALIDATION REQUIRED** | Not re-run: native out of scope. Nothing in this pass changes a native binary |
| C-22 | Native-speaker review of the 30 non-Korean, non-English safety lists | §11.3 | **EXTERNAL VALIDATION REQUIRED** | Unchanged |
| C-23 | "a meaning in ten complete languages … the twenty-two partial languages carry the first 600" | §8.1 | **CONTRADICTED** (stale) | `locale:content:check` reads 32 complete · 0 partial, and §11.1 of the same report says so; §8.1 was carried forward from an earlier edition. The gate list `COMPLETE_LOCALES` still names ten; see the content review §5 |

## 4. What was wrong, in the order it would matter to a learner

Full entries — evidence, repro, root cause, fix, acceptance, regression and
negative tests, rendered verification — are in the ledger. This is the list.

| ID | Sev | Finding | Status |
| --- | --- | --- | --- |
| W-001 | P1 | *Try again* graded the second attempt over the rejected ink — a correct second letter read *Incorrect* | fixed, e2e |
| W-015 | P1 | Child-safety scanner passed spelled-out jamo, NFD text and Latin terms in Korean fields | fixed, 13 fixtures, negative-tested |
| W-011 | P2 | 30 English card glosses were dictionary definitions, not glosses — *coffee, especially the beverage*; *unweaned baby, child*; *to melt into water*; *something which is real or true*; *older brother of a male* for 형, which a beginner reads as the brother's sex, not the speaker's | fixed at the source, all locales rebuilt |
| W-008 | P1 | Hangul-complete card had no in-product next step when no partner URL is configured | fixed, 32 languages |
| W-002 | P1 (gate) | Four 200 % text gates measured 100 % text | fixed, negative-tested |
| W-010 | P2 | Overflows at 200 % text / long-word locales at 320 px: words category grid, progress label, tab labels, conjugation rows; search results ellipsis; no focus ring on word search | fixed, gate now sees it |
| W-012 | P2 | Frequency reader over-credited shared strings (잇다 rank 1) and under-credited inflected adjectives (길다 893) → wrong levels | fixed at source; 96 fixture forms |
| W-013 | P2 | Beginner gap-fills thin (36 at levels 1–5) | 17 curated items added; 53 |
| W-014 | P2 | Curated gap-fill played the card's example clip, not its own sentence | fixed, unit test, 39 clips recorded |
| W-003 | P2 | Matching grid: partly right after *Check* read only *Incorrect* | fixed, 32 languages, unit tests |
| W-004 | P2 | Gap-fill blank not announced (aria-label on span) | fixed |
| W-005 | P2 | Level Test clock 8:01 / stale minute | fixed |
| W-007 | P2 | 404 page: empty `<h1>`, no header | fixed, 32 languages |
| W-016 | P2 (gate) | Safety scanner labelled translated curriculum notes as Korean | fixed |
| W-019 | P2 (test) | Hydration test measured a thrown error, not a slow driver | fixed |
| W-006 | P3 | Numbers verdict copy diverged from every other exercise | unified |
| W-009 | P3 | Language screen footnote claimed some words are shown in English when none are | fixed |
| W-017 | P3 | I-204 not reproducible; no test pinned it | test added, issue resolved |
| W-018 | P3 (doc) | Report first-load figure stale; "3,393 words" stale | report regenerated |
| W-020 | P3 | Web version had no way to lead the native version truthfully | gate rewritten |
| W-021 | EXTERNAL | `name:check` fails on `patent/**` | reported, not touched |
| W-022 | P3 | New strings broke register in cs and mn | fixed before commit |
| W-024 | P1 (gate) | The sixteenth pass's nine-site large-text correction injected its sheet before the document existed; eight sites still measured normal text | fixed — shared injector + read-back; every scaled case now refuses an unscaled page |
| W-026 | P2 | Full-width CTA with `nowrap` widened the unit intro to 355 px at 320 px @ 200 %, cutting the lesson counter off; `screens:audit` had no 320 @ 200 % profile — it has one now (166 renders) | fixed |
| W-025 | P2 | Numbers course list scrolled 47 px sideways at 200 % text (nowrap meta and count; unbreakable title word) — found by the gate once it measured real scale | fixed, 45/45 |
| W-023 | P2 | Tab labels broke inside a word at 200 % text (*My Learnin / g*); the doubled-text dialog assertion had never measured doubled text | fixed, measured across 32 languages; long tab words in 12 languages at 320 px are a translation-length question (HUMAN REVIEW) |

## 5. Verification, web only

The full list with counts and exit codes is `WEB_QA_EVIDENCE_v1.0.5.md`.
Summary: typecheck 0; lint 0 (max-warnings 0); unit 833 + 96 + 237 + 1,523
tests pass; content and QA gates of `verify:quick` run individually — every
one exit 0 except `name:check` (C-20); the render gates (`screens:audit`,
`modals:qa`, `status:qa`, `face:size`, `leveltest:viewport`, `numbers:layout`,
`qa:locales`, `quotes:render`) against the production build served on
127.0.0.1:4173; bundle budgets met; e2e at the mobile and desktop projects (314 + 314, 0 failed).
Not run: `verify:release` as a whole (it contains native steps), `mobile:*`,
`native:bundle:check`, `splash:bundle:check`, `release:current`,
`content:safety:bundle:check --apk/--aab` (reads native packages).

## 6. The passes

| Pass | What | New P0/P1 |
| --- | --- | --- |
| 1 | Report read; baseline recorded; version gate rewritten; first learner walk (EN, 390×844) | W-001, W-008 |
| 2 | Responsive matrix 9 viewports × light/dark; locale matrices (ar, de, ja, ko, ta); 200 % text | W-002 (gate), W-010 |
| 3 | Content: glosses, notes, gap-fills, audio, levels (I-126/I-79/I-20) | none (W-011 is P2) |
| 4 | Regression matrix re-walk; persistence and hydration; Numbers seed (I-204) | none |
| 5 | Child-safety evasions; scanner labelling; localisation register | W-015 |
| 6 | Adversarial: every new or corrected gate broken on purpose — version gate (1.0.3, 1.0.6, missing `web_version`), corrected `screens:audit` on the old CSS, frequency fixtures on the old reader (52/84), Numbers seed with `useState(() => 0)`, matching verdict, curated audio, jamo composer halves, planted evasions in Korean UI copy (3/3 refused) | none |
| 7 | Clean-profile walkthrough of the final production build, EN and KO, phone and desktop; full gate and e2e run | none (W-023 is P2, found by the e2e run at real 200 %) |

Two consecutive passes (6, 7) found no new P0 or P1.

## 7. Open, and why

- **Real validity of the Level Test** — a placement number is only as true as
  the learners it was calibrated on; the repository has none. EXTERNAL.
- **Native-speaker review** of every non-English pack's meaning (all 32 are
  structurally complete; none has been read by a native speaker) and of the 30
  non-Korean, non-English child-safety lists. EXTERNAL.
- **Advanced exhaustion (I-79)** — 520 words at levels 28–30 last a level-30
  learner 52 days at ten a day. Content work, not bulk generation.
- **`name:check` on `patent/**`** — outside this brief.
- **Runtime English lists** — the on-device evaluator does not carry them
  (budget); the publication gate does. Documented, not hidden.
- **`docs:consistency:check`** fails on one figure: `result/RELEASE_VALIDATION.md`
  says 811 content-safety tests, the count at the 1.0.4 delivery; there are
  833 now. The file is the native delivery's validation record and is
  rewritten by the next delivery, not by a web pass; the gate was not
  loosened to hide that.
- **Android / iOS** — not modified, not built, not verified in this pass.
