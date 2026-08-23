# Final pre-launch audit — working record

**Started:** 23 August 2026, from commit `e89c4e48`.

This file is a *checkpoint*, not a report. It is written as the work happens so
that a compacted context can be resumed from it. `docs/report.md` is rewritten
from scratch at the end and is the document a reader should trust.

## How to resume

Read this file top to bottom, find the first item that is not `DONE`, and
continue there. The three checkpoint files are:

| File | Holds |
| --- | --- |
| `docs/final-launch-audit.md` | this — the pass's task state and findings |
| `docs/vocabulary-expansion-progress.md` | per-batch vocabulary authoring ledger |
| `docs/i18n-quality-review.md` | per-locale copy review state |

## Task state

| # | Task | State |
| --- | --- | --- |
| 1 | Handwriting Correct/Incorrect panel width | **DONE** |
| 2 | Re-read report / issues / localisation doc, classify every claim | IN PROGRESS |
| 3 | Visual quality audit beyond mechanical failures | **DONE** — 2 defects fixed |
| 4 | Re-render all routes and interactive states | **DONE** — 32 renders, read |
| 5 | Vocabulary expansion toward 10,000, quality-first | IN PROGRESS — 2,581 → 2,844 |
| 6 | Level Test recalibration after expansion | **DONE** — rebuilt at 2,731; qa / ambiguity / locale all green |
| 7 | Independent Level Test content review | **DONE** — 420 contextual items read; 3 fixed |
| 8 | Vocabulary example re-audit | **DONE** — 2,844 pass examples:qa; 6 rewritten by hand |
| 9 | Korean product-copy review | **DONE** — 566 strings read; 4 defects, one of them the app's own name |
| 10 | 32 UI locales linguistic re-audit | IN PROGRESS — Tamil shaping fixed; see docs/i18n-quality-review.md |
| 11 | Vocabulary-content locale status | IN PROGRESS — pt-BR drift fixed; es/zh checked |
| 12 | I-03 Hangyul hand-off | **DONE** — still BLOCKED, and correctly so; verified it degrades to nothing |
| 13 | Persistence / data loss | **DONE** — word-id renaming found and pinned |
| 14 | Lexical relations | **DONE** — rebuilt; unchanged at 245, and checked against the bank |
| 15 | "More about it" content | **DONE** — 25 → 35, the ten homographs batch 3 added |
| 16 | Accessibility final pass | **DONE** — axe clean in e2e; contrast and target size clean at 7 profiles |
| 17 | Offline / failure QA | **DONE** — offline specs green, routing:check clean |
| 18 | Performance final pass | **DONE** — budgets met; the forecast that was missing now says 197% |
| 19 | Android / native boundary | **DONE** — ANDROID EMULATOR VERIFIED / PHYSICAL DEVICE NOT VERIFIED |
| 20 | Negative-test the critical gates | **DONE** — 4 gates broken on purpose and caught |
| 21 | Release gate semantics | **DONE** — verified it fails on a stale package and a dirty tree |
| 22 | Report consistency | TODO |
| 23 | Final build from final source | **DONE** — rebuilt from HEAD, release:current clean |
| 24 | APK/AAB verification | **DONE** — certificate unchanged, checksums verified |
| 25 | Rewrite report from scratch | TODO |
| 26 | Final launch verdict | TODO |

## Findings

*(appended as they are found; nothing is deleted)*

### 1. Handwriting verdict panel — DONE

**Reproduced before touching anything.** Rendered `/letters/lesson-vowels-core`
at 390 px, scribbled, pressed Check:

| | Panel | Column | Ratio |
| --- | --- | --- | --- |
| Incorrect | 143 px | 350 px | **41%** |
| Correct | 180 px | 350 px | **51%** |

Two defects, not one. The panel shrank to fit its own words, and because
"Correct." is a shorter word than "Incorrect.", **the two states measured
differently** — the card changed shape according to whether the learner had got
it right.

**Cause.** `FeedbackState` declared no width, and `.after` on the session screen
was a flex column with `align-items: center`, which sizes children to their
content. Nothing was clipped, nothing overlapped, every contrast passed. The
existing audit could not see it because it only ever asked whether something had
gone *outside* its box.

**Fix.** The card takes `width: 100%` and the column stretches; `.retryNote`,
the one child that genuinely wants centring, keeps it with `margin: 0 auto`.
Hierarchy with it: verdict 15 px → 17 px (`--hg-text-title`), icon 22 → 26 px,
gap from the Undo/Clear row 32 px → 28 px so the rhythm above and below the
controls is closer to even.

**Measured after**, both states, six widths and 200% text:

| Width | Panel | Ratio | Same as canvas | CTA |
| --- | --- | --- | --- | --- |
| 320 | 280 px | 1.00 | yes | 246×48 |
| 360 | 320 px | 1.00 | yes | 286×48 |
| 375 | 335 px | 1.00 | yes | 301×48 |
| 390 | 350 px | 1.00 | yes | 316×48 |
| 412 | 372 px | 1.00 | yes | 338×48 |
| 430 | 390 px | 1.00 | yes | 356×48 |
| 390 @200% | 350 px | 1.00 | yes | 316×48 |

Correct and incorrect are identical at every one of them.

**Gated, and negative-tested.** `screens:audit` gains two rules — a `role=status`
panel under 90% of its column, and the two writing states measuring differently
— plus an end-to-end test that walks a rejection and an acceptance and compares
them. Putting the original CSS back produces:

```
narrow panel — 8
  320  writing accepted   Correct.Try a question    — 180px in a 280px column, 64% of it
  390  writing rejected   Incorrect.Try again       — 153px in a 350px column, 44% of it
verdict states differ — 4
  320  the panel is 180px when the letter is accepted and 153px when it is not
```

**What this proves about the previous pass**, and why §2 below re-reads every
claim: "nothing clipped" is not "looks right", and the report said the first.

### 3–4. Rendered audit — 32 routes and states, read rather than counted

Every route plus the transient states a learner actually meets: splash,
placement dialog, handwriting idle / drawn / correct / incorrect, recognition,
a vocabulary question, a level-test question, the level-test result, the reset
dialog, offline, and Home / My Learning in Arabic, Korean, Japanese, Tamil and
Thai. The existing `screens:audit` passed all 143 of its renders throughout;
these are the things it does not measure.

**F1 — "Most likely between 1 and 1."** The level-test result prints a
confidence band from `estimate`'s low and high. On a sitting answered entirely
with *I don't know* both come back 1, so the screen showed a range that is not a
range. Fixed: the line appears only when the two differ, because where the
estimator is certain to a single level the number above has already said it.

**F2 — 383 px of dead space under the result.** Measured at 390×844: the last
control ended at y=397 and the tab bar begins at 780, so 45% of the screen sat
empty beneath a card the learner had spent eight minutes earning. Nothing was
clipped; it looked like a page that had not finished loading. The product's own
empty states already centre themselves in the space they are given, and a result
is the same shape of screen. Fixed by making `.body` grow and centre. The
question screens are unaffected — they are taller than the viewport, so there is
nothing to distribute.

**Checked and *not* a defect** — recorded because measuring beats impression:

* the Words card's gap between "0/10" and *Start* looked wide after §58 removed
  the blurb; measured at 16 px, which is the design token. Left alone.
* the empty states (Wrong words, Saved words, Review) are vertically centred
  with generous space. That is the pattern, not a fault, and it is what F2 was
  fixed *to*.

### 10. Script rendering — Tamil

Full record in `docs/i18n-quality-review.md`. In one line: the Tamil strings
were correct and the *shaping* was not, because the font stack ended at the
generic `sans-serif` keyword and the platform resolved it to a face that draws
ை detached. Fixed in the design tokens; a preference list, nothing fetched.

### 6. Level Test recalibration at 2,731 taught words

The corpus grew, so the bank was rebuilt rather than left calibrated against the
2,581 it was built from. What changed: the anchor pool now draws 2,729 words
from the teaching corpus, the bank is 4,020 items (meaning 1,800, produce 1,800,
context 420), and the **ceiling for the nine complete non-English locales rose
from 25 to 26** — the expansion bought a level of headroom, which is the point
of it. English still reaches 30; the twenty-two partial locales still reach 23
and the result screen still says so.

All three gates re-run against the rebuilt bank:

* `leveltest:qa` — mean absolute error 1.34 levels, 95.3% within ±3, 99.7%
  within ±5, 30 items every sitting, kinds 12/9/9 as planned.
* `leveltest:ambiguity` — 4,020 items, 420 contextual, none breaking any of the
  twelve rules.
* `leveltest:locale` — every item resolves in all 32 languages, and no answer
  option in any language resolved from another one.

### 7. Reading the contextual items rather than counting them

`leveltest:ambiguity` checks twelve mechanical rules and passed all 420
contextual items both before and after this section. So the 60 items the new
vocabulary added were read one at a time, against their three distractors,
asking only: is the keyed answer the *only* defensible one?

Three were not. All three are the same fault — the example sentence is a bare
frame whose only verb is one that fits anything, so the blank is unconstrained:

| item | second answer that also works |
| --- | --- |
| `____에서 십 년을 보냈어요.` → 감옥 | 바다에서 십 년을 보냈어요 is ordinary Korean |
| `____ 준비를 해야 해요.` → 입원 | 국 준비를 해야 해요 |
| `____을 새로 샀어요.` → 화장품 | 칠판을 새로 샀어요 |

The fix is in the content, not the builder. Each of the three example sentences
was weak *as a teaching example* for the same reason it was weak as a question —
"I bought new cosmetics" shows the word in a slot rather than in a life — so
they were rewritten to carry their own context (경찰이 그 사람을 감옥에 보냈어요 ·
친구가 병원에 입원했어요 · 엄마 생일 선물로 화장품을 샀어요), and the th and vi
copy rows with them. `examples:qa` passes all 2,731; the three rebuilt items now
read `경찰이 그 사람을 ____에 보냈어요`, `친구가 병원에 ____했어요` and
`엄마 생일 선물로 ____을 샀어요`, none of which any distractor fits.

**No new gate, and the reason.** The tempting generalisation is "a noun blank
whose sentence ends in a general verb constrains nothing" — the repository
already keeps that judgement, in `GENERAL_VERBS`, and applies it to *distractors*
for verb items. Applied to noun frames it fires on 54 of the 164 noun items, and
reading them shows the overwhelming majority are fine, because the constraint
comes from the sentence's *other* argument rather than from its verb:
`____에서 채소를 사요` is pinned by 채소 no matter that 사다 is general. A rule
that deleted 54 items to fix three would be a worse bank, so the finding is
recorded here instead of encoded as a gate that does not generalise.

### 13. A content change was renaming words out from under saved progress

Found while adding 젓다 (to stir) in batch 3. The build assigns ids by
romanisation — `word_jeotda` — and two Korean words can romanise the same, so
the second one to ask gets `_2`. Which one asks first was decided by the
iteration order in `build_vocabulary.py`:

```
for word in sorted(words, key=lambda w: (levels[w], scores[w], w)):
```

— *difficulty* order, which every content change perturbs. Adding 젓다 renamed
the already-shipped 젖다 (to get wet) from `word_jeotda` to `word_jeotda_2`.

That is not cosmetic. `progressKey(kind, itemKey)` in
`apps/web/src/storage/schema.ts` keys every progress row by this id, on the
device, with no cloud copy — and the file's own opening comment says an update
that silently resets progress is unacceptable for a paid app. The rename does
two things to a learner who updates: 젖다 loses its history, and that history is
handed to 젓다, a word they have never seen, which the app will then treat as
one they know. The storage layer is written to survive updates; it cannot, if
the content renumbers underneath it.

**Fixed** with `content/vocabulary/word-ids.json`, a checked-in ledger seeded
from the ids at HEAD. `word_id()` returns the pinned id when the word has one,
and the pinned ids are reserved before allocation so a new word cannot take one.
Retired words keep their line, so re-adding a word later returns the id its
learners still have on disk. A duplicate id in the ledger is a build error.

**Negative-tested.** Deleting the ledger and rebuilding flips the ids back —
젖다 → `word_jeotda_2`, 젓다 → `word_jeotda` — and restoring it flips them
right. Across the whole 2,581 → 2,844 expansion, exactly one word was affected
before the fix and none after.

**Scope of the damage in the field: none.** The rename had not shipped — it was
introduced by an uncommitted batch and caught in the same session.

### 11. The Portuguese pack was European, in a pt-BR product

The locale is `pt-BR`, and the existing pack is unambiguously Brazilian: você
×44, trem, celular, banheiro, resfriado, xícara. Every batch written during
this pass was European Portuguese, and the surface of it was 143 strings.

Some of it merely reads foreign to the reader it is for — *telemóvel*,
*comboio*, *palavra-passe*, *porta-bagagens*, *estou a aprender*, *toda a
gente*, enclitic *doem-me* and *encontramo-nos*. Two of them are simply wrong:

* **camisola** was the meaning taught for 스웨터. In Brazil that is a
  nightgown.
* **constipação** was the meaning used for 독감's symptoms. In Brazil that is
  constipation, not a head cold.

All 143 rewritten. Two strings in the pre-existing pack went with them
(*autocarro* and *o teu livro* in `000.jsonl`), and 컴퓨터's *computadora*
became *ordenador*, the pack's Spanish being Peninsular — coche ×11, autobús
×14, patata, gafas, conducir.

**The other locales were checked the same way and are consistent.** Spanish:
my batches used móvil / patata / billete, matching. Chinese: no traditional
characters anywhere in the pack.

**How it was caught, which is the part worth keeping.** Not by reading — by
`content:qa`, which warns when several words share one meaning string. Five
words had become *antes* (예전 이전 앞서 차라리 전) and the fifth was mine. The
warning is about learnability, and it found a regional-register defect it was
not looking for, four batches after the drift began. There was no gate for
"this locale is written in the wrong variety of its language", and the honest
statement is that there still is not one; what there is now is a corrected pack
and a marker list in this file.

### 9. Reading the Korean, all 566 strings

Korean is one of the ten complete locales and the only one where a mistake in
the *interface* is a mistake in the language being taught. Every string in the
ten `ko` bundles was read against its English source. The copy is good — one
consistent 해요체 register, no calques, no key leaking through. Four things were
wrong.

**The app called itself by the wrong name.** `common:exit.title` read
"**한글** 가나다를 닫을까요?" The product is **한귤** 가나다 — `config/product.ts`
defines it and `i18n.test.ts` asserts it. 한글 is the writing system; 한귤 is the
brand, a tangerine and a first alphabet. The one dialog that names the product
to a Korean speaker named a different thing.

Pulling that thread found three more locales that had invented a brand, against
a policy `product.ts` states in its opening comment — *the brand is not
translated; `localizedName` carries only the locales with an officially defined
representation, and today that is English and Korean*:

| locale | said | should say |
| --- | --- | --- |
| ko | 한글 가나다 | 한귤 가나다 |
| zh-CN | 한글 가나다 | Hangyul ganada |
| ja | ハングルガナダ (exit) but ハンギュル (level test) | Hangyul ganada |
| ar | هانغيول غانادا, in five places | Hangyul ganada |

Chinese put Korean script a Chinese reader cannot read in front of them, and
named the app wrongly while doing it. Japanese disagreed with the config and
with itself. **Gated**: `name:check` now reads every locale bundle and fails on
a brand spelling the config does not define for that locale. Negative-tested by
restoring the Korean typo — one finding, naming the file, the line and what the
locale is allowed to write.

**A band label that is a feeling among three levels.** The level-test result
bands read 입문 · 생활 · **자신감** · 고급. The first, second and fourth are
levels; 자신감 is self-confidence. Now 능숙.

**A category name that means conversation.** *Coming & Going* was 오가는 말 —
which is a set phrase for words exchanged in conversation — while the
*communication* category next to it is 말과 미디어. Two categories, one about
talking, and the movement one also said 말. Now 오고 가기.

**Straight quotes in four locales.** `settings:language.noResults` wrote
`"{{query}}"` where every other search-empty message in the same product writes
`“{{query}}”`. Fixed in en, ko, th and vi. The Korean also read `"{{query}}"와
맞는`, and 와/과 depends on the final consonant of a value chosen at runtime, so
half of all queries would have taken the wrong particle. Rewritten to the
invariant 에, which is what the vocabulary search already used.

**Not changed.** `locale:editorial` reports 37 split-translation warnings, three
of them Korean, where one English string is translated two ways. All three read
correctly: a unit title and a sound-rule name that share an English word but not
a context, two question forms deliberately distinguished, and a Home button
shorter than the dialog button beside it.

### 18. What ships fits, and the forecast that was not being made

Every enforced budget is met at 2,844 words:

```
first load                       235.8 kB /  460.0 kB   51%
corpus, first paint               46.0 kB /   64.0 kB   72%
corpus, whole                    221.8 kB /  900.0 kB   25%
largest route chunk               12.6 kB /   24.0 kB   52%
everything precached            1025.7 kB / 1400.0 kB   73%
```

Dictionary search answers in p50 0.07 ms and p95 2.42 ms per keystroke, phone
adjusted, over 30,229 headwords built in 1,022 ms.

**The finding is a line that was not there.** `corpus, whole at 10,000` is
forecast, and it lands at 779.8 kB against a 900 kB budget — 87%, which reads
comfortable. But that row measures **one language**. The service worker
precaches `public/corpus` entire: the shared tables plus every complete
language's meanings, 691 kB of the 1,026 kB precached today, two thirds of it.
The row with the total budget was not being projected at all, and it is the one
that breaks first.

Added, and reported rather than enforced, like the row above it:

```
everything precached at 10,000  2763.7 kB / 1400.0 kB  197%
```

**Nearly twice the budget, and not a number a better gzip closes.** This is a
finding about the delivery strategy, not about the budget. Precaching every
language's meanings is affordable at 2,844 headwords and is not affordable at
10,000; when it stops being affordable the answer is to precache the learner's
own language and fetch the rest on demand — the same band mechanism that already
keeps first paint flat at any corpus size.

It matters for §5 as much as for §18: reaching 10,000 taught words is not only
an authoring problem. Whoever finishes the corpus has to change how it is
delivered somewhere on the way there, and now there is a line that will say when.

### 12. The Hangyul hand-off — still blocked, and the block is the right answer

I-03 says the hand-off is built and has no destination. Re-checked, and nothing
about it has changed or should:

* `HANGYUL_URL` reads `VITE_HANGYUL_URL` at build time and is `null` in a plain
  checkout. It is documented in `.env.example` line 47, commented out.
* `NextStepCard` returns `null` when it is unset, so the card and the My
  Learning row render nothing rather than rendering a link that goes nowhere.
* `routing:check` passes: 17 application routes survive a direct request, six
  static files are served as themselves, and the worker treats a failed
  navigation as a miss rather than as the shell.

The one thing worth saying plainly is that **this is not a defect to fix in
code**. The destination is a business fact somebody outside this repository
owns — a landing page, a store listing or a universal link. Neither repository
on this machine declares a learner-facing web address for the main Hangyul app;
the single occurrence of `https://hangyul.app` is a fallback inside a `catch` in
a billing modal, which is not a declared destination. Inventing one would ship a
link to a page that may not exist.

**Customer impact as it ships:** a learner who finishes the alphabet reaches the
end of this product and sees no onward card at all. That is a smaller product
than intended and it is not a broken one. It stays BLOCKED.

### 20. Breaking the gates on purpose

A gate that has never failed is a gate nobody has tested. Four were broken
deliberately this pass and each caught what it claims to.

| gate | what was broken | what it said |
| --- | --- | --- |
| `content/vocabulary/word-ids.json` | deleted the ledger and rebuilt | 젖다 flipped to `word_jeotda_2` and 젓다 took `word_jeotda`; restoring it flipped them right |
| `hints:qa` | put the mark-stripping back into `revealsAnswer` | **8** answer-leaking hints across hi and te — 돈, 가다, 몸, 집 — where the original sample had shown 3 |
| `name:check` | restored the Korean 한글 가나다 typo | one finding, with the file, the line, and the two spellings that locale is allowed |
| `screens:audit` | reverted the verdict-panel CSS | 8 narrow panels and 4 accepted/rejected pairs of different widths |

Four more were negative-tested by the work itself rather than by sabotage,
which is better evidence: `examples:qa` refused six of the 263 new entries,
`vocabulary:sense:qa` refused three double-sense glosses, `content:qa` warned on
the fifth word to become *antes* in Portuguese, and `store:check` refused a
listing that undersold the corpus in three different thousands separators.

### 21. What the release gate actually enforces

`release:current` compares `build-info.json`'s commit against HEAD and lists
every product file changed since, excluding `docs/`, `result/`, `app_result/`,
`README.md`, `.gitattributes` and `.gitignore`. Run before the rebuild it said:

```
HEAD          8643053918f10229b13830da777732ad985944bf
app_result/build-info.json built from 9c686eb7
  ✗  1337 product file(s) have changed since
```

— which is correct and is the state the brief warns about: *artefacts lag HEAD*.
It also refuses a dirty tree, so the bytes delivered are the bytes committed.
The rebuild below is what clears it.

### 16. Accessibility, and 17. Offline

Both are carried by suites that ran in full on this tree rather than by a
separate pass, and both are green:

* `accessibility.spec.ts` runs axe over every route in light and dark, at both
  project sizes, for WCAG A and AA. `screens:audit` measures contrast and touch
  target independently at seven device profiles including 200% text, and
  reported nothing at any of them.
* the offline specs cut the network after the service worker has *claimed* the
  page — not merely become active, which was the cause of an earlier flake — and
  `routing:check` confirms 17 routes survive a direct request, six static files
  are served as themselves, and a failed navigation is treated as a miss rather
  than as the shell.

### 19. Android — **ANDROID EMULATOR VERIFIED / PHYSICAL DEVICE NOT VERIFIED**

There is no physical Android device on this machine, so nothing below is a
physical-device claim. What follows was done on an emulated Pixel 7, Android 16,
software-rendered.

**The delivered artefact, installed and walked.** Not a debug build — the signed
`app_result/hangyul-ganada-release.apk`, installed with `adb install -r`:

* Home renders complete: brand, Unit 1 card, the Letters and Words tiles, the
  vocabulary-level row, the quote, the tab bar.
* The lesson opens on its explainer, the stroke demonstration draws ㅏ with
  numbered strokes and its sound, the canvas shows the guide with Undo, Clear
  and Check correctly disabled.
* Two swipes and Check produced **the §1 fix on a real device**: the verdict
  panel spans the full content width, its edges level with the canvas above it,
  the CTA full width beneath a divider. This is the first time that fix has been
  seen anywhere but a headless browser.
* Words renders the hub and the topic browse. Searching *dragon* returns
  **1 match** — 용, authored in batch 3 today — so the expansion is in the
  delivered binary and not merely in the repository.
* `logcat` carries no `FATAL`, no `AndroidRuntime`, and no ANR naming
  `com.talkhangyul.ganada`. The emulator's own SystemUI did ANR twice under
  software rendering, which is the emulator and not the app.

**`mobile:qa` — 14/14** against the debug variant, which is the one with a
debuggable WebView: Capacitor native platform, every asset served from the
bundle at `https://localhost`, launch screen gone, **progress stored in native
SQLite**, insets reaching the layout at top 52 px / bottom 24 px and honoured
exactly, nothing under the system bars, navigation and hardware back working,
the lesson clip playing once on arrival, the corrected 마디 recording served
rather than a cached older one, no service worker in the native build, and no
console error during the walk.

**`mobile:qa:safe-area` — 60/60**, and it was 42/48. The six failures were one
check, repeated across six device configurations: the script looked for a
button called **Trace it** and the interface renamed it **Write it**. That
check is the reason the script exists — the comment names the failure
photograph it was written from — so the thing it was built to watch had not
been watched since the rename. `e2e/safe-area.spec.ts` was updated with the
rename and this file was missed, which is what a label duplicated in two places
eventually does. Fixed, and the check now runs and passes at every inset,
theme and text scale.

**A false alarm worth recording**, because it looked like a serious defect for
several minutes. Running `mobile:qa` after launching the activity twice reported
*progress is stored in native SQLite — not reported* and then threw. Attaching
to DevTools by hand found **two** `page` targets, one answering `sqlite` and one
answering `memory`. The second was a WebView left attached from the extra
launch; `launchMode` is `singleTask` and a single clean launch has exactly one
target and 14/14 passes. The script takes `targets.find(t => t.type === 'page')`
and so picks arbitrarily when two exist — worth knowing, and not a customer
defect.

**Native libraries:** none in either artefact, so 16 KB page-size compatibility
holds by construction.

### 23–24. The build, and what is in it

Rebuilt from HEAD with a clean tree after every source change above, using the
existing production signing identity found at `ANDROID_KEYSTORE_PATH`. **No key
was generated.** The keystore's certificate was read before the build and
compared with the superseded artefact:

```
keystore   SHA256 15:7A:2B:B1:…:33:23:DE:BC   CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR
old APK    157a2bb133f6aa3d…3323debc
new APK    157a2bb133f6aa3d…3323debc
```

| | |
| --- | --- |
| Built from | `0f79feee`, recorded in `build-info.json` |
| APK | 77,763,323 bytes · `2dd51fd51ad56518b46397f7e7ed439a7311a5a0f9e7975103542b4b51251faa` |
| AAB | 76,299,626 bytes · `96f67ee755e97e8acc0b0634887aa1ab3e1d09b67feb6739b3aa0d6010fec9e2` |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — `minSdk` 24) |
| Package | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0 |
| SDK | min 24, target 36 |

The APK grew from 71.3 MB to 77.8 MB, and the 6.5 MB is the audio for the 263
new words. `checksums.sha256` verifies in both `result/` and `app_result/`, and
`release:current` reports both at HEAD with the tree clean outside `docs/` and
the release directories.
