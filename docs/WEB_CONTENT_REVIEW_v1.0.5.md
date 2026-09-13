# Web content review — v1.0.5

*13 September 2026. What was read, by whom, and what it is worth. Web only.*

The generated ledgers this document points at are the machine-checkable
record; this document says what a reader can and cannot conclude from them.

| Layer | Ledger | Gate |
| --- | --- | --- |
| Korean interface strings | `docs/copy-audit-ko.json` (884 strings, hash per reading) | `copy:audit:check`, `copy:ledger:check` |
| Korean examples and glosses | `docs/content-quality-audit.json`, `docs/CONTENT_QUALITY_AUDIT.md` | `content:audit:check`, `examples:qa:check` |
| Level-test items | `docs/LEVEL_TEST_CONTENT_REVIEW.md`, `docs/AMBIGUITY_LEDGER.md` | `leveltest:content:check`, `leveltest:ambiguity:check`, `leveltest:distractors:check` |
| Child safety | `docs/child-safe-content-audit.json`, `packages/content-safety/fixtures/*.json` | `content:safety:check` (self-test 368/368 + 14 families, 32 locales, 1,007,447 fields, 0 findings) |
| Locales | `docs/LOCALE_LEDGER.md` | `i18n:check`, `locale:content:check`, `locale:ledger:check`, `locale:editorial:check` |
| Quotations | `docs/QUOTE_TRANSLATION_AUDIT.md`, `docs/quote-render-audit.json` | `quotes:qa:check`, `quotes:audit:check`, `quotes:render:check` |

## 1. Korean interface strings — read in full

884 learner-reachable Korean strings (11 namespaces) were read, in the order
a learner meets them, against the screen they appear on. The ledger records a
hash of each reading; a string that changes is unread until it is read again.

- Register: 해요체 throughout; no 합니다체 leaking from the Numbers course, no
  반말 in a button. The five strings added this pass were written in the same
  register and read back: `페이지를 찾을 수 없어요` (404 title),
  `{{total}}쌍 중 {{right}}쌍을 맞혔어요.` (matching verdict — note the counter
  쌍 on both numbers, and 맞혔어요 not 맞췄어요), and the Hangul-complete card
  `이제 한글을 읽을 수 있어요 / 다음은 단어예요. 내 수준에 맞는 단어를 하루 열
  개씩, 예문과 발음과 함께 배워요. / 오늘의 단어 시작하기`.
- One stale sentence found: the Language screen's footnote *일부 단어는 영어로
  표시돼요* was shown for languages whose word packs are complete. It now
  appears only when a listed language actually lacks word copy (W-009).
- The Numbers-only verdict strings (`numbers:feedback.*`) were removed from all
  32 packs; the course now uses `common:verdict.correct/incorrect` like every
  other exercise, so a learner reads one word for one outcome (W-006).

**Status: VERIFIED by a reader of Korean; not by a native speaker.** The
ledger says which strings were rewritten (103) and which kept (781).

## 2. Taught words — 3,370, every English gloss read against its Korean

The corpus is 3,370 taught words (23 retired earlier by the child-safety pass,
`content/vocabulary/retired-words.json`). Every English gloss was read beside
its headword and its example sentence, and the 32-language packs were checked
for the shape a translation must have (`vocabulary:translation:check`,
`translation:semantics:check`).

**Found and fixed (W-011, P2).** Thirty glosses were dictionary definitions
that had come through from the source cache rather than card glosses — not
wrong, but not what a card should say, and in five cases misleading on a
card:

| Word | Was | Now |
| --- | --- | --- |
| 커피 | coffee, especially the beverage | coffee |
| 아기 | unweaned baby, child | baby |
| 녹다 | to melt into water | to melt |
| 진짜 | something which is real or true | real, the real thing |
| 형 | older brother of a male | a man's older brother |
| 오빠 / 누나 / 언니 | elder brother of a female / older sister of a male / older sister of a female | a woman's older brother / a man's older sister / a woman's older sister |
| 이제 | now, and now | now, from now on |
| 필요하다 | to have a need | to be needed |
| 늑대 | wolf, wolves — sentence *Wolves live in the mountains.* | wolf — *A wolf lives in the mountains.* (the gloss must be findable in the sentence: `examples:qa` rule 15) |
| 음식, 점심, 우유, 모르다, 아파트, 나이, 아내, 단어, 환자, 먼저, 이해, 잘하다, 그때, 상황, 씻다, 자식, 벗다, 대통령, 뚫다 | definition-shaped | gloss-shaped (`docs/CONTENT_REMEDIATION_LEDGER.md` C-008) |

The 형/오빠/누나/언니 rewrite is the one with a learning consequence: *older
brother of a male* reads, to a beginner, as a statement about the brother.
The kinship terms are chosen by the **speaker's** gender, and the gloss now
says so.

**More about it (I-20).** 24 notes were written for the words a first-week
learner stops on — the ㄷ/ㅂ/르/ㅎ-irregulars (듣다 걷다 춥다 덥다 다르다 빠르다
그렇다), 알다 · 모르다 as a pair, 좋아하다, the counters 개 · 살 · 명 · 마리, 잘,
고맙다 · 죄송하다 (which politeness each carries), 싶다, 아직 · 벌써, 너무, 때,
밥, 머리, 마음 — in all 32 languages, because every one is in the core band.
75 → 99 words carry a note. `vocabulary:sense:qa:check` passes.

**Status: VERIFIED for English and Korean by a reader; EXTERNAL for the other
30 languages** (see §5).

## 3. Levels — re-derived, not re-declared

`scripts/content/frequency.py` decides a word's frequency cost, and it had
been reading surface strings: 있어요 was credited to 잇다 (rank 1), 잘게 to 잘다
(rank 83), 긴 wholly to 길다 *and* to 기다, and an adjective that lives its life
inflected (길어요, 긴, 짧은) ranked as if rare. The reader now has a form model
by class (`conjugate.frequency_forms`), splits shared strings in proportion to
each owner's unambiguous evidence, and refuses an alternant that is a lemma in
its own right. `content/vocabulary/frequency-fixtures.json` pins 96 forms of 20
words; the old reader scores 52/84 on the same fixtures.

- 419 of 3,370 words changed level (179 harder, 240 easier). Every anchor in
  `level-anchors.json` (161) held. `vocabulary:level:qa:check` and
  `vocabulary:level:audit:check` pass.
- Three override rows were retired because the model now agrees with them
  (잇다, 잘다, 싸다); one was added with a reason (싫다 → 6, the other half of
  좋다; it also keeps level 6 at the 40 words a daily plan requires).
- Distribution after the rebuild: level 1 52 · 2 60 · 3 59 · 4 79 · 5 168 ·
  6 40 · 7 57 · … · 28–30 520 (level 30: 337). I-79's measurement is in
  `docs/issues.json`.

The full account, with every moved word above level 20 read, is
`docs/VOCABULARY_LEVEL_CALIBRATION.md`.

## 4. The Level Test bank — curated beginner items

The bottom of the scale was thin: 36 gap-fills at levels 1–5, and a beginner
sitting the test met sentences lifted from cards two levels up. Seventeen
curated items were written by hand in `content/vocabulary/context-items.json`
and each one was refused by at least one of the bank's rules before it was
accepted — *nothing pins the blank* (every consumable fits), the 로/으로
particle rule, 하다 with an activity noun, a destination verb, a sentence
identical to the card's own example (약국, 비누 rewritten). Three drafts were
dropped rather than argued with (우유, 음악, 나이). The 거울 distractor 방 was
replaced with 수건. Levels 1–5 now hold 53 gap-fills; the bank holds 531.

Each curated sentence is recorded in both voices and the exercise plays **its
own** clip (`apps/web/src/features/review/curatedClozeAudio.test.ts`); before
this pass a curated item played the card's example while showing a different
sentence (W-014).

**Validity, separated as the brief asks.**

| Kind | State |
| --- | --- |
| Simulation validity | VERIFIED — `leveltest:simulations:check`: synthetic learners at every true level land within ±3 in 30 items, every language reaches the top |
| Content validity | IMPROVED, VERIFIED by reading — the bottom levels now ask sentences a level-1–5 learner can read; every item's distractors share the answer's category (`leveltest:distractors:check`, 0 findings) |
| Real validity | **EXTERNAL** — no learner-calibration data exists in the repository; the number the test gives is consistent with the bank's own levels, and nothing here can say it is the learner's level |
| Usability | VERIFIED on the build — clock, resume, *I don't know*, back navigation, 200 % text, RTL |

## 5. Locales — locale by locale

Labels: **STRUCTURALLY VERIFIED** every key present, no blank, no English
leakage beyond the listed classes, word pack 3,370/3,370 · **MEANING CHECKED**
read for meaning by the reviewer (a reader of that language, not a native
speaker) on the strings changed this pass and the 99 notes · **RENDER
VERIFIED** rendered at 320 and 390 px, light and dark, and inspected ·
**NATIVE-SPEAKER REVIEW REQUIRED** what every non-English pack still owes ·
**BLOCKED** cannot be done from this repository.

| Locale | Structure | Meaning | Render | Native review |
| --- | --- | --- | --- | --- |
| en | STRUCTURALLY VERIFIED | MEANING CHECKED (all strings) | RENDER VERIFIED (9 viewports × light/dark × 200 %) | source language |
| ko | STRUCTURALLY VERIFIED | MEANING CHECKED (884 strings read) | RENDER VERIFIED (3 viewports, 200 %) | REQUIRED |
| ja | STRUCTURALLY VERIFIED | MEANING CHECKED (changed strings, notes) | RENDER VERIFIED (3 viewports) | REQUIRED |
| zh-CN | STRUCTURALLY VERIFIED | MEANING CHECKED (changed strings, notes) | RENDER VERIFIED (320, 390) | REQUIRED |
| de | STRUCTURALLY VERIFIED | MEANING CHECKED (changed strings, notes) | RENDER VERIFIED (3 viewports; long-word) | REQUIRED |
| es | STRUCTURALLY VERIFIED | MEANING CHECKED (changed strings, notes) | RENDER VERIFIED (320, 390) | REQUIRED |
| fr | STRUCTURALLY VERIFIED | MEANING CHECKED (changed strings, notes) | RENDER VERIFIED (320, 390) | REQUIRED |
| pt-BR | STRUCTURALLY VERIFIED | MEANING CHECKED (changed strings, notes) | RENDER VERIFIED (320, 390) | REQUIRED |
| ar | STRUCTURALLY VERIFIED | — | RENDER VERIFIED (RTL, 3 viewports) | REQUIRED |
| ta | STRUCTURALLY VERIFIED | — | RENDER VERIFIED (3 viewports; long-word) | REQUIRED |
| cs | STRUCTURALLY VERIFIED | MEANING CHECKED (register corrected: `inProduct.title/body`) | RENDER VERIFIED (320, 390) | REQUIRED |
| mn | STRUCTURALLY VERIFIED | MEANING CHECKED (register corrected: `inProduct.title`) | RENDER VERIFIED (320, 390) | REQUIRED |
| bn, el, fil, hi, hu, id, it, kk, ky, nl, pl, ro, ru, sv, te, th, tr, uk, uz, vi | STRUCTURALLY VERIFIED | — (gate-checked only: `locale:editorial:check` register and split-translation warnings read) | RENDER VERIFIED (320, 390, via `qa:locales:check`) | REQUIRED |

Every pack carries meanings and example translations for all 3,370 words
(`locale:content:check`: 32 complete · 0 partial). The report's §8.1 still
described ten complete and twenty-two partial packs; that sentence is stale
(audit C-23). The gate list `COMPLETE_LOCALES` in `scripts/lib/locale-status.mjs`
still names ten — it is a ratchet that makes a pack's coverage a gate, and
widening it is a decision for whoever owns the packs, not a fix.

`locale:editorial:check` leaves 13 warnings for a person: one English sentence
rendered as two different sentences in 13 languages where three keys share it
(`home:finished.cta`, `learning:mistakes.emptyCta`, `learning:nextStep.inProduct.cta`).
They are not errors — each is a correct imperative — and unifying them is a
native speaker's call.

**Tab words.** Measured across all 32 languages at five widths (ledger
W-023): in twelve languages the single word for a tab — fr *apprentissage*,
de *Wiederholen*, ru *Повторение*, ta *மீள்பார்வை*, es *aprendizaje*, pt-BR
*aprendizado*, ro *Recapitulare*, el *Επανάληψη*, hu *Tanulásom*, cs
*Opakování*, bn *পুনরালোচনা*, uk *Повторення* — is wider than a fifth of a
320 px screen at the normal 11 px and hyphenates (or, without a hyphenation
dictionary, breaks) inside the word. A shorter word is a native speaker's
call; the type was not shrunk below 11 px. **NATIVE-SPEAKER REVIEW REQUIRED.**

**BLOCKED from here:** nothing structural. Meaning in 31 languages is the
external item, as it was in the previous report.

## 6. Child safety — release-blocking, and the evasions it did not cover

The policy (`packages/content-safety`, `scripts/content/child_safety.py`)
remains the release gate: `content:safety:check` runs the fixture self-test
and then scans 14 families × 32 locales. This pass added evasion classes the
brief named and the fixtures lacked:

| Evasion | Fixture(s) | Before | After |
| --- | --- | --- | --- |
| Spelled-out jamo | `sex-jamo-spelled`, `sex-jamo-spelled-sentence`, `suicide-jamo-spelled` | passed | blocked |
| Loose final after an open syllable (세ㄱ스) | `sex-final-spelled` | passed | blocked |
| NFD (decomposed) text | `sex-nfd` | blocked (NFKC) — pinned | blocked |
| Latin term in a Korean field | `latin-in-korean-sentence`, `latin-in-korean-option` | passed | blocked (publication gate) |
| Latin term in a Japanese gloss | `latin-in-japanese-gloss` | passed | blocked |
| Borrowed English profanity in a Latin-script language | `latin-in-german-sentence` | passed | blocked (`*` lists) |
| Innocent jamo runs, Essex, a lesson's ㄱㄴㄷ | `jamo-lesson-list`, `jamo-vowels-run`, `latin-in-korean-innocent`, `latin-essex` | allowed | allowed |

Conjugation, particle, spacing, punctuation, romanisation, leet/obfuscation,
misspelling, unsafe translation, unsafe distractor and unsafe explanation
were already fixtures (367) and still pass (368 with the new ones; both
evaluators agree on all 368). The full scan is clean: 1,007,447 fields, 0
findings. Planting the three evasions in `locales/ko/common.json` produced 3
findings and exit 1; the file was restored byte-for-byte.

One scanner labelling defect was found by the new rule: the curriculum
export's translated notes were scanned as Korean, so a German *die* became a
mortality review. Translated fields are now scanned as their own language
(W-016).

**Native review of the 30 non-Korean, non-English lists: EXTERNAL,
unchanged.**

## 7. Quotations

`quotes:qa:check`, `quotes:audit:check` and `quotes:render:check` pass. The
two documented exceptions stand: 꿈을 크게 가져라 ships as *author unknown* by
request, and the Carlyle line stays **conventionally attributed** (the wording
in `apps/web/src/data/quotes.ts`), not asserted.

## 8. Audio

`audio:qa` (600 decoded, all 13,974 slots checked for existence, manifest
agreement and duplication): 0 errors, 0 warnings. `audio:pronunciation:check`:
0 errors on the rebuilt `dist/sw.js`. 35 sentences recorded this pass (34 new
curated or rewritten sentences and 늑대's), 2 recordings removed with their
sentences; manifest 6,987 entries. Provider: edge-tts, both voices, the same
normalisation as the rest of the corpus.
