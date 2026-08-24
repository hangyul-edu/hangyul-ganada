---
title: Hangyul ganada
title_ko: 한귤 가나다
subtitle: A zero-beginner Korean foundation app — Hangul reading and writing, then practical vocabulary — running entirely on the learner's own device.
document: Product Truth Report
version: 0.1.0
date: 24 August 2026
describes: A pre-launch re-audit written from scratch against the running product at `8e72a50f` — the corpus grown from 2,581 to 2,916 words by hand, every one of its 2,916 Korean examples read one at a time, a quarter of the contextual Level Test found answerable without reading the Korean, three classes of Korean the conjugator was inventing, a sentence the distractor generator could compose that no learning product may show, 125 translations that invented a person the Korean does not have, and the signed package rebuilt from this commit with the existing production key and verified on an emulator.
mark: report-assets/mark.png
---

# 1. About this report

This is an **internal product truth document** — not marketing, not a changelog.
It is handed to a reviewer, usually another model, as the authoritative
description of what Hangyul ganada *currently is*.

It was written from scratch. The previous report was not edited or carried
forward; every claim below was re-derived from the running product, the current
source, or a script whose output is quoted. That matters more than it sounds.
Eight of the previous report's own figures had gone stale by the time this pass
started — the word count, the study-set count, three test counts, the
pronunciation-note count and both artefact sizes — and a document that is edited
rather than rewritten loses the ability to tell you which of its sentences were
checked this cycle.

## How to read the claims

| Label | Means |
| --- | --- |
| **VERIFIED** | Confirmed by running the product, reading the code, or a script whose output is quoted here |
| **INFERRED** | Follows from the architecture but was not directly observed this cycle |
| **RECOMMENDED** | A product suggestion, not a statement of fact |
| **EXTERNAL** | From outside the repository; see §22 for the limits on this |

Feature status uses a second scale:

| Status | Means |
| --- | --- |
| **VERIFIED WORKING** | Does what it should, checked this cycle |
| **PARTIALLY WORKING** | Works for the common path; a real case is unhandled |
| **UX-PROBLEMATIC** | The code is correct and the customer experience is not |
| **BROKEN** | Does not work |
| **NOT IMPLEMENTED** | Does not exist |
| **NEEDS VERIFICATION** | Could not be settled from this machine |

## Four things this report will not do

**It will not call something finished because a check is green.** The single
most important finding of this pass is not any one defect; it is that five of
the defects were *invisible to a full, green suite*. The handwriting verdict
panel was 41% of the width it sat in and every contrast, clipping and layout
gate passed on that screen. The answer-leak guard was handing learners the
answer in three languages while its own test certified it safe. A safe-area
check had been reporting "not found" for a renamed button instead of running.
Green means the questions we thought to ask were answered.

**It will not describe a language as reviewed.** No locale in this product has
been read by a native speaker, including the two the product is about. §11 and
`docs/LOCALIZATION_NATIVE_REVIEW.md` say so in the same words, and this pass
produced a concrete demonstration of what that costs — see §11.

**It will not present a content backlog as an engineering number.** The corpus
is 2,916 taught words against a 10,000 target. §8 gives the honest distance in
the unit the work is actually done in, and §16 shows that the target is not only
an authoring problem.

**It will not claim a physical device.** There is none on this machine. §18 is
labelled *ANDROID EMULATOR VERIFIED / PHYSICAL DEVICE NOT VERIFIED* and means
exactly that.

---

# 2. Audit metadata

## 2.1 What this describes — **VERIFIED**

| | |
| --- | --- |
| Commit | `8e72a50f` |
| Working tree | clean outside `docs/` and the release directories |
| Node | v24.19.0 |
| Web | React 19, Vite 7, TypeScript |
| Native | Capacitor 8, `com.talkhangyul.ganada` |
| Signing | existing production identity, certificate `157a2bb1…3323debc` — no key generated |

## 2.2 Figures for the next report to diff against

| Metric | Value |
| --- | --- |
| Words shipping | 2,916 |
| Categories | 18 |
| Study sets | 591 (five words each) |
| Characters taught | 73 |
| Pronunciation notes | 549 |
| Dictionary headwords | 30,229 |
| Dictionary senses | 39,610 |
| Dictionary examples | 3,866 |
| Interface languages | 32 |
| Vocabulary packs complete | 10 |
| Vocabulary packs at 100 words | 22 |
| Unwritten vocabulary rows | 60,368 |
| Level-test items, English | 4,106 |
| Level-test contextual items | 506 |
| Hangul letters taught | 40 |
| Curriculum units | 12 |
| Lessons | 15 |
| Audio clips | 11,788 |
| Signed APK | 76.0 MB |
| Signed AAB | 74.6 MB |
| Issues tracked | 69 |

"Characters taught" counts every entry in the curriculum's character table — the
40 letters plus the syllable blocks and 받침 forms the lessons introduce — where
"Hangul letters taught" is the 40 a learner would name. Test counts are in §19;
artefact hashes are in §18.

---

# 3. Executive summary

## What the product is

A paid, offline-first Korean foundation app for someone who cannot read Hangul
yet. It teaches the 40 letters by sight, sound and hand — the learner writes
each one with a finger and the app grades the strokes — then the syllable blocks
they build, then 2,916 everyday words, each with a hand-written example
sentence, a recording in two voices and a meaning in the learner's own language.
There is no account, no server and no network request during a lesson.

## What this cycle did

The brief for this pass was a final pre-launch audit with a content expansion
attached, and then a second brief that arrived with photographs of the running
app. Both halves produced findings, and the interesting ones came from the join
between them.

**The corpus grew from 2,581 to 2,916 taught words**, all authored by hand and
all passing the production gates before being counted. The selection rule
changed partway: reading the candidate pool rather than filtering it showed the
corpus had holes in its *core* — 앞, 뒤, 때, 일, 말, 불, 힘, 꿈, 곧, 늘 and 죽다
were untaught while 위, 아래 and 옆 were taught — so 113 of the 263 fill those
rather than extend the tail.

**Growing the corpus is what found three of the worst defects.** Adding one verb
renamed a different, already-shipped word's id, and word ids key every progress
row in IndexedDB. Adding 113 words shifted a positional sample in a QA gate and
exposed an answer-leak guard that had been blind in Bengali, Hindi, Telugu and
Tamil. Pushing a fifth word into a crowded Portuguese gloss triggered a
collision warning that turned out to be pointing at a whole pack written in the
wrong variety of Portuguese.

**Ten defects were found and fixed**, listed in §20. Five of them were
invisible to the existing gates, and every one of those five now has a gate.

**Then somebody photographed the app running on a device, and the second half of
this cycle is what those photographs cost.** Each screenshot was treated as
evidence of a class rather than as one sentence to patch, and each class turned
out to be larger than its photograph: a question with two right answers was a
quarter of the contextual Level Test; a blank that did not match its options was
every gap-fill the browser built, on three screens, because three different
programs were deciding independently what a gap-fill is; a wrongly conjugated
card was three whole classes of Korean the conjugator was inventing, including
`-아/어 주세요` on every verb it had, which produced 죽여 주세요 and 사망해 주세요
on real word cards. §20.1 states each class and what it counted to.

The response is one sentence: **one place now decides what a valid question is,
and it writes its answer to a file the other screens read.** Alongside that,
every one of the 2,916 Korean teaching examples was read individually — not
sampled — and `docs/LEVEL_TEST_KOREAN_REVIEW.md` records what has been read, by
whom, and by what method, including the one row that has been read by nobody.

## What did not change

The 10,000-word target is not met and is not close: 2,916 of 10,000, a deficit
of 7,084 entries, which at the measured rate is about 142,000 authored strings.
No locale has been reviewed by a native speaker. Twenty-two of the 32 interface
languages still carry word meanings only 100 words deep, and growing the corpus
made that fraction *worse*, not better. The onward hand-off to the main Hangyul
product has no destination and renders nothing.

## The verdict

**LAUNCH READY WITH DISCLOSED NON-BLOCKING LIMITATIONS.** The reasoning is in
§23.

---

# 4. Product definition

## 4.1 What it is — **VERIFIED**

A standalone paid application, web and Android from one codebase. Twelve
curriculum units, fifteen lessons, forty letters, 33 syllable blocks, 2,916
words. Everything a learner needs is in the binary: the curriculum, the fonts,
the stroke data and 11,500 pronunciation clips.

## 4.2 The intended journey — **VERIFIED**

Open the app; no account is asked for. Unit 1 introduces six vowels. Each letter
is shown, sounded, demonstrated stroke by stroke, then written with a finger
over a guide and graded. By the third lesson the learner is reading syllable
blocks. After the alphabet, the product moves to vocabulary: ten words a day,
chosen to match a level the learner can measure with a 30-item placement test.

## 4.3 Does the product support that positioning? — **VERIFIED, with one gap**

It does, up to the end of the alphabet and through the vocabulary, and it stops
there. A learner who finishes has no onward step inside the product — see §18
and I-03. That is a smaller product than intended, not a broken one.

---

# 5. Information architecture and flows

## 5.1 Sitemap — **VERIFIED, 17 routes**

Five tabs — Home, Letters, Words, Review, My Learning — over seventeen
application routes. `routing:check` confirms every one survives a direct request
against a built `dist` served the way a static host serves it, that six static
files are served as themselves, and that the service worker treats a failed
navigation as a miss rather than as the shell.

## 5.2 Screens, read rather than counted — **VERIFIED at seven device profiles**

`screens:audit` renders 17 routes and 6 transient states across seven profiles —
320, 360, 390, 412, 430, 390 in dark, and 390 at 200% text — which is 143
renders. All 143 are clean: nothing clipped, nothing overlapping, nothing below
contrast, no touch target under size.

**That gate was extended this cycle, because it had been green on a broken
screen for the whole life of the product.** It now also fails a visible
`role="status"` panel narrower than 90% of its column, and compares the accepted
and rejected verdict widths per device. See §7 and I-64.

---

# 6. The Hangul learning system

## 6.1 Curriculum shape — **VERIFIED**

Twelve units, fifteen lessons, 73 character entries. A unit opens with a short
explainer — *Hangul is an alphabet, not a set of pictures* — and each letter runs
see → hear → watch the strokes → write it → read it back.

## 6.2 Audio in the lesson — **VERIFIED WORKING, on device**

Each letter plays its name and its sound from a bundled clip. Verified on the
emulator: the lesson plays its clip on arrival, exactly once, from
`/audio/letters/female/name_c544.mp3`.

## 6.3 Progress and daily goals — **VERIFIED**

Letters today, a streak, a per-unit ring, and a daily word goal. Progress is
per-item and survives closing the app, a fresh tab and a nested route —
asserted end to end.

---

# 7. Handwriting: the strokes and the verdict

## 7.1 What it draws — **VERIFIED**

Every letter is drawn as stroke centrelines from the curriculum's own stroke
data, not cut from a raster asset. `strokes:visual:check`, `glyphshape:qa:check`
and `jamo:measure:check` compare what the guide draws against what the
demonstration draws at 320 px: mean agreement 98.8%, floor 90%, tolerance 14 px
of a 320 px raster, and six compound vowels deliberately stroked rather than set
because the face slants them and a hand does not.

## 7.2 The verdict panel — **fixed this cycle, and it is the headline defect**

The moment the product exists for is the one where the pen lifts and the app
says whether the letter is right. Measured at 390 px before anything was
touched:

| | Panel | Column | Ratio |
| --- | --- | --- | --- |
| Incorrect | 143 px | 350 px | **41%** |
| Correct | 180 px | 350 px | **51%** |

Two defects, not one. The card shrank to fit its own words, and because
"Correct." is a shorter word than "Incorrect.", **the card physically changed
shape according to whether the learner had got it right**.

`FeedbackState` declared no width and the session column was a flex column with
`align-items: center`, which sizes children to their content. Nothing was
clipped, nothing overlapped, every contrast passed — which is exactly why the
audit could not see it. It only ever asked whether something had gone *outside*
its box.

Fixed by giving the card `width: 100%` and stretching the column. Gated in three
places, because any one of them would have been a rule about this bug rather
than about its class: `screens:audit` fails a narrow status panel and compares
the two states' widths, and an end-to-end case asserts both. Negative-tested by
reverting the CSS — eight narrow panels and four differing pairs reported.

**Verified on a real Android build**, which is the part that matters: the panel
now spans the full content width with its edges level with the canvas above it.
That is the first time the fix has been seen outside a headless browser.

## 7.3 What recognition does not solve — **VERIFIED**

The grader compares stroke geometry and order. It cannot tell a learner *why* a
letter is wrong beyond accepting or rejecting it, and the feedback is
deliberately one word plus a way forward: no percentage, no score, no
stroke-by-stroke critique, no praise.

---

# 8. Vocabulary data

## 8.1 Scale — **VERIFIED**

2,916 taught words in 18 categories and 591 study sets of five. Every entry has
one taught sense, a hand-written Korean example, a meaning in ten complete
languages and an example translation in each.

Every one of those 2,916 Korean examples has now been **read**, one at a time,
rather than sampled — see §20.1 for what that found and §9.2 for how it was
done.

## 8.2 What one entry costs, measured — **VERIFIED**

This is the number the 10,000 target has to be read against. One entry is
**twenty authored strings**:

| Where | Strings |
| --- | --- |
| pack entry `m` | 7 meanings — ko ja zh es fr de pt |
| pack entry `en` | 1 English meaning; a raw dictionary gloss is refused |
| pack entry `ex` | 1 Korean example |
| pack entry `t` | 7 example translations |
| `copy/th.json`, `copy/vi.json` | 2 meanings + 2 example translations |

The last row was a discovery of the first batch: Thai and Vietnamese are not
carried on pack entries, so a batch that ignores them silently regresses two of
the ten complete locales.

## 8.3 The 10,000-word target — **the delivery is built; the words are not written**

2,916 of 10,000. The deficit is **7,084 entries, about 142,000 authored
strings**. That is the honest distance and it is not closable by generation
without lowering the bar the gates enforce — `examples:qa` refused six of the
263 entries authored in the previous cycle and three of the 60 authored in this
one, and it refused them for reasons a generator would reproduce at scale.

`vocabulary:qa:target` fails on this tree and is meant to. It is the one gate
whose job is to state the distance rather than to be satisfied, and it prints
*2,916 headwords — 7,084 short of the 10,000 target*. It has not been disabled,
weakened or excluded from `verify:release`.

Two further facts belong with the number, because "we just need to write more"
is not the whole picture:

* Every word added also adds **22 rows** to the partial-locale backlog. Growing
  the corpus from 2,581 to 2,916 moved the twenty-two partial languages from
  3.9% coverage to 3.4%.
* The precache does not fit at the target. See §16.

## 8.4 The dictionary layer — **VERIFIED, and it is not the corpus**

30,229 searchable headwords, 39,610 senses and 3,866 examples, fetched from
`public/dictionary` at runtime in 84 chunks. It is a lookup surface: nothing in
it is ever scheduled, taught or quizzed. Search answers in p50 0.07 ms and p95
2.42 ms per keystroke, phone-adjusted, over an index built in 1,022 ms.

---

# 9. Vocabulary content quality

## 9.1 The automated gates — **VERIFIED, run on this tree**

| Gate | Result |
| --- | --- |
| `examples:qa` | 2,916 examples, all PASS; 2,509 distinct sentence shapes; largest shared template 8 |
| `vocabulary:qa` | passed; ten complete locales at 2,916 |
| `vocabulary:sense:qa` | one taught sense per word in every complete language |
| `content:qa` | 4 warnings, all genuine loanwords (hotel, golf, whisky, yoga) |
| `worddetail:qa` | no card shows an example of a sense it does not teach |
| `conjugation:qa` | clean |
| `dailyvocab:qa` | clean |

## 9.2 Reading, which is the part that found things

**Six of the 263 new entries were refused by a gate** and rewritten: two example
sentences where the taught meaning was not recognisable in the translation, one
where the idiom read as a different sense of the headword, one with two clause
joins, and three glosses that split into two dictionary senses on one card.

**Three contextual level-test items had a second defensible answer**, found by
reading all 60 that the new vocabulary added, one at a time against their
distractors. See §10.

### Then all 2,916 were read

Not sampled. Every taught example, in level order, one at a time. What a full
reading found that the sample had not:

| Finding | Count |
| --- | --- |
| A sentence that does not demonstrate its own headword | 5 — 부시다 shown with 눈부시다, 노랗다 with 노란색, 가만 with 가만히, 진정 with 진정하다, 이빨 with a plural |
| A grammatical error | 1 — 묻히다 given 옷에 물감이 묻혔어요, which is 묻다's sentence with 묻히다's spelling; the gloss was 묻다's too, and both were corrected |
| An unnatural collocation | 12 — 해가 밝아요, 사용이 쉬워요, 시험에 성공했어요, 할아버지가 숨지셨어요, 약속을 행했어요 and seven more |
| A part of speech filed wrongly | 15 — 다시, 아마, 오래, 미리, 저리, 또다시, 막상 and 다행히 as nouns or interjections rather than adverbs; 저 as a noun rather than a pronoun; 시리다 and 쓰리다 as verbs rather than adjectives; 가만있다 as an adjective rather than a verb |
| A gendered default with no reason for it | 10 — the father in the hospital, the driving seat, the navy and the throne; see §20.1 |

The reading is the finding. `examples:qa` passed on every one of those sentences
before and after, because none of them is decidable: a sentence can contain its
headword, sit at its level, use one clause and be perfectly ungrammatical.

**Ten of the new words are homographs** — 말 is also a horse, 배 also a boat and
a pear, 병 also an illness, 반 also a school class, 김 also the commonest
surname and steam, 벌 also a punishment and a counter for clothes, 일 also one
and day, 금 also a crack, 전 also war and a savoury pancake, 키 also a key. The
product has a hand-written *More about it* note for exactly this, and they had
shipped without one. All ten now have it, in all ten languages: 25 notes → 35.

---

# 10. The Vocabulary Level Test

## 10.1 What it is — **VERIFIED**

A 30-item adaptive placement test over 30 levels and a 4,106-item bank, in three
kinds: meaning shown / Korean chosen, meaning asked / Korean produced, and a
word blanked out of a real sentence. Rebuilt against the 2,916-word corpus.

## 10.2 Calibration — **VERIFIED, re-run after the expansion**

```
mean absolute error   1.34 levels
within ±3 levels      95.3%
within ±5 levels      99.7%
kinds per sitting     context 12, meaning 9, produce 9
```

## 10.3 The per-language ceiling — **and why "32/32" would be a lie**

| Languages | Askable items | Ceiling |
| --- | --- | --- |
| en | 4,106 | 30 |
| de es fr ja ko pt-BR th vi zh-CN | 1,572 | 23 |
| the other 22 | 535 | 23 |

**The ceiling is no longer stated on the result screen, and that is a change
this cycle made deliberately.** It used to read *지금은 23단계까지 물어볼 수
있어요. 그 위 단계의 단어는 아직 번역되지 않았어요* — a content backlog,
described to the person who bought the finished product. Whether a language's
bank reaches level 23 or level 30 is ours to fix; until it is, the honest thing
is to report the level measured rather than to explain the engineering. The
confidence band went with it for the same reason: a learner who has just spent
eight minutes being measured does not need to be told the measurement is
uncertain to six levels. Both are still computed and still saved.

The table above is therefore the place the ceiling is stated, and an end-to-end
case asserts the card shows one number with no range and no backlog line, in
Hungarian — the language where the removed line used to appear.

**The expansion moved this the other way from the obvious direction, and that is
worth stating plainly.** The nine complete non-English locales went from 1,374
askable items to 1,572 — 14% more — and their ceiling went from 26 down to 23.
The new words are core words and land at low levels, which shifts the difficulty
tiers. The test got deeper where learners actually sit rather than taller at the
top, and the drop from 25 to 23 is the same effect continuing: the bank is now
dense enough at the bottom that the adaptive walk stops climbing sooner. The
number is stated on the result screen wherever it is below the full scale.

## 10.4 Item quality — **and the gate that passed on a quarter of the bank**

`leveltest:ambiguity` checks thirteen rules and six photographed regressions over
all 4,106 items and passes. **It passed before this cycle too, on a bank in
which a quarter of the contextual items had more than one right answer**, and
that is the finding of §20.1 rather than a footnote to this section: twelve
rules that each check something true were between them blind to the question
"could a learner defend a different option".

What closed it was not a fourteenth rule of the same kind. The builder now
conjugates every option into the answer's own form, checks the particle the
frame carries, refuses a person noun in an object slot that reads badly, and
refuses the frame outright when more than one option survives — and it writes
its surviving questions to `data/generated/cloze.json`, so Today's Vocabulary
and Review ask the questions the Level Test validated instead of building their
own. One place decides.

The three items below were found earlier in the cycle, by reading the 60
contextual items the new vocabulary added. They are kept here because the cause
they share is the cause of the larger class:

| item | second answer that also works |
| --- | --- |
| `____에서 십 년을 보냈어요.` → 감옥 | 바다에서 십 년을 보냈어요 is ordinary Korean |
| `____ 준비를 해야 해요.` → 입원 | 국 준비를 해야 해요 |
| `____을 새로 샀어요.` → 화장품 | 칠판을 새로 샀어요 |

All three shared one cause: the example sentence was a bare frame whose only
verb fits anything. The fix went into the content, not the builder, because each
sentence was weak as a *teaching example* for the same reason.

**No new gate, deliberately.** The tempting generalisation — a noun blank whose
sentence ends in a general verb — fires on 54 of the 164 noun items, and reading
them shows the constraint usually comes from the sentence's other argument
rather than its verb: `____에서 채소를 사요` is pinned by 채소 no matter that 사다
is general. A rule that deleted 54 items to fix three would be a worse bank, so
the class is recorded rather than encoded.

---

# 11. Localization

## 11.1 The two axes, which are not the same — **VERIFIED**

**Interface**: 32 languages, complete. Every screen, every letter lesson, every
mnemonic. `i18n:check`, `copy:audit` (18,270 strings) and `locale:content:check`
pass, and no language can produce a mixed-language question.

**Word content**: 10 complete at 2,916 words; 22 at 100 words, which is 3.4% of
the corpus. The row in the language picker says so before the learner chooses,
which is what makes it a limitation rather than a misrepresentation.

## 11.2 The Portuguese pack was the wrong Portuguese — **fixed**

The locale is `pt-BR` and the existing pack is unambiguously Brazilian: você
×44, trem, celular, banheiro, resfriado, xícara. Every batch authored during
this pass drifted European, and nothing noticed for four of them — 143 strings.

Most of it merely reads foreign to the reader it is for: *telemóvel*,
*comboio*, *palavra-passe*, *porta-bagagens*, *estou a aprender*, *toda a
gente*, enclitic *doem-me*. Two of them teach the wrong word:

* **camisola** was the meaning taught for 스웨터. In Brazil that is a nightgown.
* **constipação** was used for 독감's symptoms. In Brazil that is constipation.

All 143 rewritten, plus two strings that predated the pass and one Spanish
inconsistency. Spanish and Chinese were checked the same way and are consistent.

**How it was caught is the part to keep.** Not by reading — by `content:qa`,
which warns when several words share one meaning string. Five words had become
*antes*, and the fifth was new. A warning about learnability found a
regional-register defect it was not looking for, four batches late. **There is
still no gate that reads for the variety of a language, and writing one is not
obviously possible.** This is what native review is for.

## 11.3 Native review — **NOT VERIFIED, and it is a human-only blocker**

No locale in this product has been read by a native speaker, including Korean.
`docs/LOCALIZATION_NATIVE_REVIEW.md` states it. Nothing automated substitutes
for it, and no document in this repository may claim it has happened. §11.2 is
the demonstration of what goes unnoticed without it.

`locale:editorial` reports 15 remaining warnings and 37 split-translation
notices; the three Korean ones were read and are correct — a unit title and a
sound-rule name that share an English word but not a context, two deliberately
distinguished question forms, and a Home button shorter than the dialog button
beside it.

---

# 12. Korean, read as Korean

Korean is one of the ten complete locales and the only one where a mistake in
the interface is a mistake in the subject being taught. All 566 strings in the
ten `ko` bundles were read against their English source. The copy is good: one
consistent 해요체 register, no calques, no key leaking through. Four things were
wrong.

**The app called itself by the wrong name.** `common:exit.title` read
"**한글** 가나다를 닫을까요?" The product is **한귤** 가나다 —
`config/product.ts` defines it and `i18n.test.ts` asserts it. 한글 is the
writing system; 한귤 is the brand. The one dialog that names the product to a
Korean speaker named a different thing.

Pulling that thread found three more locales that had invented a brand, against
a policy `product.ts` states in its opening comment — *the brand is not
translated; only the locales with an officially defined representation carry
one, and today that is English and Korean*:

| locale | said | should say |
| --- | --- | --- |
| ko | 한글 가나다 | 한귤 가나다 |
| zh-CN | 한글 가나다 | Hangyul ganada |
| ja | ハングルガナダ (exit) but ハンギュル (level test) | Hangyul ganada |
| ar | هانغيول غانادا, in five places | Hangyul ganada |

Chinese put Korean script a Chinese reader cannot read in front of them, and
named the app wrongly while doing it. Japanese disagreed with the config and
with itself. `name:check` now reads every locale bundle and fails on a brand
spelling the config does not define for that locale; negative-tested by
restoring the Korean typo.

**A band label that is a feeling.** The level-test result bands read 입문 · 생활
· **자신감** · 고급 — three levels and one emotion. Now 능숙.

**A category named with a set phrase for conversation.** *Coming & Going* was
오가는 말, which is what people say for words exchanged in talk, sitting beside a
*말과 미디어* category. Now 오고 가기.

**A particle chosen at build time for a value chosen at runtime.**
`settings:language.noResults` read `"{{query}}"와 맞는`, and 와/과 depends on the
final consonant of whatever the learner typed, so half of all queries took the
wrong particle. Rewritten to the invariant 에, and the straight quotes in four
locales made curly to match the rest of the product.

---

# 13. Persistence

## 13.1 What is stored, and where — **VERIFIED**

Everything is device-local: IndexedDB in the browser, native SQLite in the
Android build — confirmed on device, not inferred. There is no account and no
server copy. Progress rows are keyed by `progressKey(kind, itemKey)`, and for a
word that key is the word's id.

## 13.2 A content change was renaming words out from under saved progress — **fixed**

This is the most serious defect of the pass and it was found by accident.

Ids are `word_` plus the romanisation, and two Korean words can romanise the
same: 젓다 (to stir) and 젖다 (to get wet) are both `word_jeotda`, so the second
to ask gets `_2`. Which asked first was decided by the builder's iteration
order — `sorted(words, key=(level, score, word))`, which is *difficulty* order,
and every content change perturbs it. Adding 젓다 renamed the already-shipped
젖다.

The consequence for a learner who updates is precise: 젖다 loses its history,
and that history is handed to 젓다, a word they have never seen, which the app
then treats as one they know. The storage layer's own opening comment says an
update that silently resets progress is unacceptable for a paid app with no
cloud copy; this defeated that guarantee from the content side, where nothing
was looking.

Fixed with `content/vocabulary/word-ids.json`, a checked-in ledger seeded from
the ids at the previous release. Pinned ids are reserved before allocation so a
new word cannot take one; a retired word keeps its line so re-adding it later
returns the id its learners still have on disk; a duplicate id in the ledger is
a build error. **Negative-tested**: deleting the ledger flips the pair back, and
restoring it flips them right. Across the whole 2,581 → 2,916 expansion exactly
one word was affected before the fix and none after, and the rename never
shipped.

## 13.3 The remaining exposure — **stated, not solved**

A learner who clears site data loses everything, and there is no export. A
developer-style JSON export was tried and rejected as customer-facing. What is
done instead is to keep IndexedDB robust, request persistent storage, and not
warn ordinary users about a risk they cannot act on (I-12).

---

# 14. Audio

11,788 distinct files over 11,890 voice slots, 56.5 MB, two Korean neural voices
at 0.82× rate. `audio:qa` decodes a 600-clip sample and checks the rest for
existence, manifest agreement and duplication: 0 errors, 0 warnings, durations
240 ms to 3,960 ms.

**263 words had no recording** when this pass started — the words added over
three batches — and `verify:quick` counts them, which is how it was caught.
Generated for both voices and re-verified.

**Two new verbs needed a decision the rules cannot make.** 쫓아오다 and 찢어지다
each put a 받침 outside the seven in front of a vowel, and whether that vowel
begins an ending or a new word changes the sound. Both are endings — the
connective -아 and the passive -어지다, exactly like 쫓아가다 and 흩어지다 already
reviewed — so they liaise: 쪼차오다 and 찌저지다.

**A permanently red check was made honest.** `audio:listen:fixtures` failed on
낳다 every run, reporting it heard 낫다. The same file documents at length why
that is recogniser noise — the decoder writes 바티 for a 마디 clip nobody
disputes — and measures the clip's closure and release instead, which clears it.
Every other path acted on that finding and this one convicted anyway. A word
`check_contrasts` measures is now a note there, not an error, because a gate
that is red about a resolved question is a gate people learn to skip.

---

# 15. Accessibility

`accessibility.spec.ts` runs axe over every route in light and dark at both
project sizes for WCAG A and AA, and passes. `screens:audit` independently
measures contrast and touch-target size at seven device profiles including 200%
text and reports nothing at any of them. `status:qa` holds the two Home chips to
the same height, centre and touch target across 120 combinations of streak,
level, width and language; `modals:qa` measures 18 dialog states across six
widths in their longest language.

On device, `mobile:qa:safe-area` now runs **60/60** across six configurations of
navigation style, theme and text scale — see §18 for why it was 42/48.

---

# 16. Performance and delivery

Every enforced budget is met at 2,916 words:

```
first load                       235.8 kB /  460.0 kB   51%
corpus, first paint               46.0 kB /   64.0 kB   72%
corpus, whole                    221.8 kB /  900.0 kB   25%
largest route chunk               12.6 kB /   24.0 kB   52%
everything precached            1025.7 kB / 1400.0 kB   73%
```

First paint fetches the shared tables plus band 1 — a fixed 600 words — so it
costs the same at ten thousand headwords as at two and a half. That flat line is
the architecture working.

**The finding is a line that was not there.** `corpus, whole at 10,000` is
forecast and lands at 779.8 kB against 900 kB — 87%, which reads comfortable.
That row measures **one language**. The service worker precaches
`public/corpus` entire, every complete language's meanings included: 691 kB of
the 1,026 kB precached today, two thirds of it. The row carrying the total
budget was not being projected at all, and it is the one that breaks first:

```
everything precached at 10,000  2763.7 kB / 1400.0 kB  197%
```

Nearly twice the budget, and not a number a better gzip closes. It is a finding
about the delivery strategy rather than about the budget: precaching every
language's meanings is affordable at 2,916 headwords and is not affordable at
10,000, and the answer then is to precache the learner's own language and fetch
the rest in bands. Reported and not enforced, because what ships today fits.

---

# 17. Offline and failure

The app makes no network request during a lesson. The service worker precaches
the shell, the corpus and the audio manifest; a failed navigation is treated as
a miss rather than as the shell, so a broken route cannot be served the app
shell and look like a working page.

The offline end-to-end specs cut the network *after* the worker has claimed the
page — not merely become active, which was the cause of an earlier flake — and
pass. On the native build there is no worker at all, deliberately: nothing can
outlive an app update, verified on device as 0 workers and 0 caches.

---

# 18. Android and the native boundary

## **ANDROID EMULATOR VERIFIED / PHYSICAL DEVICE NOT VERIFIED**

There is no physical Android device on this machine. Everything below was done
on an emulated Pixel 7, Android 16, software-rendered.

## 18.1 The delivered artefact, installed and walked — **VERIFIED**

Not a debug build: the signed `app_result/hangyul-ganada-release.apk`.

* Home renders complete — brand, Unit 1 card, Letters and Words tiles, the
  vocabulary-level row, the quote, the tab bar.
* The lesson opens on its explainer, the demonstration draws ㅏ with numbered
  strokes and its sound, the canvas shows the guide with Undo, Clear and Check
  correctly disabled.
* Two swipes and Check produced the §7 fix on a real device: the verdict panel
  spanning the full content width, edges level with the canvas above it.
* Words renders the hub and the topic browse. Searching *dragon* returns **1
  match** — 용, authored in this cycle's third batch — so the expansion is in
  the delivered binary and not merely in the repository.
* `logcat` carries no `FATAL`, no `AndroidRuntime` and no ANR naming
  `com.talkhangyul.ganada`. The emulator's own SystemUI did ANR twice under
  software rendering, which is the emulator and not the app.

## 18.2 `mobile:qa` — 14/14 — **VERIFIED**

Capacitor native platform; every asset served from the bundle at
`https://localhost`; launch screen gone; **progress stored in native SQLite**;
insets reaching the layout at top 52 px, bottom 24 px and honoured exactly;
nothing drawn under the system bars; navigation and hardware back working; the
lesson clip playing once on arrival; the corrected 마디 recording served rather
than a cached older one; no service worker; no console error during the walk.

## 18.3 `mobile:qa:safe-area` — 60/60, and it was 42/48

Six failures, one check, repeated across six device configurations: the script
looked for a button called **Trace it** and the interface had renamed it **Write
it**. That check is the reason the script exists — its comment names the failure
photograph it was written from — so the thing it was built to watch had not been
watched since the rename. The web end-to-end suite was updated with the rename
and this file was missed, which is what a label duplicated in two places
eventually does.

## 18.4 A false alarm, recorded because it looked serious

Running `mobile:qa` after launching the activity twice reported *progress is
stored in native SQLite — not reported*, then threw. Attaching to DevTools by
hand found **two** `page` targets, one answering `sqlite` and one answering
`memory`. The second was a WebView left attached by the extra launch;
`launchMode` is `singleTask`, and a single clean launch has exactly one target
and 14/14 passes. The script takes the first `page` target and so picks
arbitrarily when two exist — worth knowing, not a customer defect.

## 18.5 The signed package — **VERIFIED**

Built from HEAD with a clean tree, using the existing production signing
identity found at `ANDROID_KEYSTORE_PATH`. **No key was generated.** The
keystore's certificate was read before the build and compared with the
superseded artefact:

```
keystore   SHA256 15:7A:2B:B1:…:33:23:DE:BC   CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR
old APK    157a2bb133f6aa3d…3323debc
new APK    157a2bb133f6aa3d…3323debc
```

| | |
| --- | --- |
| Signature schemes | v2 ✓ v3 ✓ (v1 off — `minSdk` 24) |
| Package | `com.talkhangyul.ganada`, versionCode 1, versionName 1.0.0 |
| SDK | min 24, target 36 |
| Native libraries | none, so 16 KB page-size compatibility holds by construction |

The APK grew from 68.0 MB to 76.0 MB across the whole cycle; the difference is
the audio for the 335 new words. `checksums.sha256` verifies in both `result/`
and `app_result/`.

**Two Android permissions, and neither is ever asked for.** The package declared
five before this cycle — the notification, boot and wake-lock permissions that
the optional daily reminder brought with it. The reminder was removed and they
went with it, leaving INTERNET, which the WebView bridge needs to serve the
bundled app over its own origin, and VIBRATE, which is the tap you feel when a
letter is accepted. Both are granted by Android at install without a prompt, so
there is no permission dialog anywhere in this product. `aapt2 dump permissions`
on the shipped package prints those two and the Capacitor receiver guard, and
`audit-release-security` fails the build if any of the four removed ones comes
back.

No keystore, password or key value appears in this repository, in `result/`, or
in any log written during this build. A second keystore on this machine
(`qa-not-for-store.jks`) carries a different certificate and was not used.

## 18.6 iOS — **NOT BUILT**

macOS and Xcode are unavailable in this environment. The Xcode project is
delivered in `result/ios-project`; `result/BUILD_OR_SIGNING_BLOCKERS.md` records
what a Mac would need to do.

## 18.7 The onward hand-off — **blocked outside this repository**

`HANGYUL_URL` reads `VITE_HANGYUL_URL` at build time and is unset in a plain
checkout, documented in `.env.example`. `NextStepCard` returns null when it is
unset, so the card and the My Learning row render nothing rather than a link
that goes nowhere. Neither repository on this machine declares a learner-facing
web address for the main Hangyul app; the one occurrence of `https://hangyul.app`
is a fallback inside a `catch` in a billing modal. Inventing a destination would
ship a link to a page that may not exist (I-03).

---

# 19. Release engineering and the gates

## 19.1 The suites — **run in full on this tree**

| Suite | Cases |
| --- | --- |
| Web unit (`vitest`) | **771** (49 files) |
| Handwriting core (`vitest`) | **96** |
| Korean morphology (`vitest`) | **146** |
| End-to-end (`playwright`) | **338** (169 × 2 projects) |

Two projects — mobile 390×844 and desktop 1440×900 — one worker, no retries,
run in full from the commit this report describes.

**One of those runs found an eleventh defect, in a test.** A full run failed on
*a ta session never offers an English answer* while the same six cases passed in
56 seconds on an idle machine. The walk that drives a real sitting advanced with
`click()` then `waitForTimeout(300)`, and 300 ms is a bet about how fast the
machine is. When the bet loses, the next step samples a screen that has not
rendered, reads no option group, concludes there is no question here, and clicks
*past the question it came to read*. Fourteen steps later it has collected
nothing and reports "no question appeared in ta" — which reads as missing Tamil
content and is a stopwatch.

It now waits for the main region to say something different from what it said
before the click, up to two seconds, and carries on either way. A screen that
has changed is ready to be read; a clock is not evidence that anything happened.
It is also faster, because settling returns as soon as the screen changes rather
than always paying the delay.

That is the third time this one walk has been fixed for a timing assumption, and
the class is now named in the file rather than the instance.

**Three more walks were fixed for the same class of reason, and the class is
worth naming because it is not flakiness.** A session now schedules a `build`
question — assemble the word from its own syllables — wherever a gap-fill was
refused, which is more often than before. Three end-to-end walks did not know
what to do in front of one:

* two pinned the *label* on the button that moves on, and a build question's
  reads **Next word** rather than **Next**, because there the next thing
  genuinely is a word. Both now share one anchored matcher;
* one clicked the first enabled button on the screen, and on a build question
  the first enabled button is a *filled slot*, whose job is to put the syllable
  back. It placed a syllable, removed it, placed it, for the whole of its
  budget — and reported "the matching grid never appeared". It is scoped to
  `[role="group"]` now, which is where every answer lives and no slot does.

None of the three was a defect in the product and all three were correct to
fail: the sitting genuinely changed shape. What they had in common is that each
pinned a *rendering* — a label, a position — where the thing being tested was a
behaviour. Two more specs were unpinned from the wording of a unit title for the
same reason, and read it from the shipped bundle instead.

The suite was then run in full again from the final source:

```
338 passed (20.2m)
```

**338 of 338, no failures, no flakes, no retries** — and that run is the one this
report describes, taken after the last edit rather than before it.

## 19.2 `verify:release` does not pass today, by design — **VERIFIED**

This has to be said plainly, because a reader who runs one command and sees it
fail should know why.

`verify:release` is 34 steps, and one of them is `vocabulary:qa:target`:

```
1 error(s):
  2,916 headwords — 7,084 short of the 10,000 target
```

That gate exists to fail. It is the corpus target held open in the release
chain so the shortfall cannot be forgotten, and it cannot pass until the corpus
reaches 10,000 — which is the honest state of the product and the subject of
§8.3.

The other 33 steps were run individually against this tree and all pass:
`verify:quick` (29 checks), the store listing, the curriculum export, the fonts,
the three jamo and face measurements, the status group, the modals, the 143
rendered screens, the app icons, the relations, the four content builds, the
four dictionary gates, the dictionary performance budget, the content and
example QA, **the learner-safety gate and the composite Korean-education gate**,
Word Detail, the audio and pronunciation gates, the coverage report, the issue
tables, the documentation figures, the stroke measurements, the end-to-end suite
and the release currency check.

## 19.3 What the release gate enforces — **VERIFIED**

`release:current` compares `build-info.json`'s commit against HEAD and lists
every product file changed since, excluding `docs/`, `result/`, `app_result/`,
`README.md`, `.gitattributes` and `.gitignore`. It also refuses a dirty tree, so
the bytes delivered are the bytes committed. Run before the rebuild, it
correctly reported the delivered package 1,337 product files behind.

## 19.4 Breaking the gates on purpose

A gate that has never failed is a gate nobody has tested.

| gate | what was broken | what it said |
| --- | --- | --- |
| the id ledger | deleted it and rebuilt | 젖다 flipped to `word_jeotda_2`; restoring it flipped it back |
| `hints:qa` | put the mark-stripping back | **8** leaking hints across hi and te |
| `name:check` | restored the Korean brand typo | one finding, with the file, line and allowed spellings |
| `screens:audit` | reverted the verdict-panel CSS | 8 narrow panels, 4 mismatched pairs |

Four more were negative-tested by the work itself, which is better evidence:
`examples:qa` refused six of the 263 new entries, `vocabulary:sense:qa` refused
three double-sense glosses, `content:qa` warned on the fifth word to become
*antes*, and `store:check` refused a listing that undersold the corpus in three
different thousands separators.

**Everything added in the second half of the cycle was broken on purpose too**,
because a gate written to catch a photograph is worth nothing until it has
caught it again:

| gate | what was broken | what it said |
| --- | --- | --- |
| `content:safety:qa` | put 여자 back among the options of a 타다 frame | `겨울에 여자를 타요` — 타다 takes a vehicle, and with a person it is sexual; exit 1 |
| `leveltest:ambiguity` | injected the three newly-named photographs — 여자 in `____을 안 마셔요`, the bare `____가 있어요` frame, 끝없다 beside itself | three `photographed-regression` findings; exit 1 |
| `korean:education:qa` | removed a gate's ledger row, then claimed a native reviewer for one | refused before running a single check, naming the file and the row |
| `qa:locales` | restored `text-overflow: ellipsis` to the app header | `ta/language ellipsed: ஒரு மொழியைத் தேர்ந்தெடுங்கள் — 330>270px` |
| `packages/korean-morphology` | narrowed the 르-compound rule back to an exact-set lookup | 뒤따르다 → 뒤딸라요 and 잇따르다 → 잇딸라요; two fixtures failed |
| `endsSession` | put `index + 1 >= queue.length` back | fixtures K and M failed: the button offered to finish with a word still owed |
| `ChoiceExercise` | printed 정답은 "…"예요 under the options again | fixtures N and O failed on the option appearing twice |
| `content:coverage` | removed one word's line from `unobserved.json` | named 담백하다 and asked for the reason; exit 1 |

## 19.5 A gate that was sampling by position

`hint-usefulness-qa` checked every fourth word **by index**, so which quarter of
the corpus it examined depended on how many words existed. Adding 113 words
shifted the sample onto 돈 and surfaced a leak that had always been there. It now
checks all 2,916 words — 623,264 rungs across 32 languages in 43 seconds.

## 19.6 The store listings

Eight listings, the release notes, the age-rating note and the review notes were
all still selling 2,581 words. `store:check` caught it, and half of it would
have been invisible to a search for "2,581": Spanish and Portuguese write
*2.581*, French writes *2 581*. The gate matches all three separators, which is
what it was written for. The release-notes preamble keeps its old figure — it is
the sentence recording what a previous draft got wrong, and the gate reads only
from the first customer heading down, so an audit trail does not have to be
deleted to stay green.

---

# 20. What this pass found

Eleven defects, in the order they would matter to a customer. The eleventh is
last because it is in a test rather than in the product, and it is here at all
because the audit's own final run is what found it.

1. **The verdict panel was 41% wide and changed shape with the answer** (§7).
   Invisible to every existing gate. Now gated three ways.
2. **A content change renamed a word out from under saved progress** (§13).
   Would have lost one word's history and mis-credited another on update.
3. **The answer-leak guard was blind in every abugida** (§21, I-67). Learners in
   Bengali, Hindi and Telugu asking for help on 돈 were shown the answer.
4. **The Portuguese pack was European, in a pt-BR product** (§11). 143 strings,
   two of which taught the wrong word.
5. **The Korean interface called the app by the wrong name** (§12), and three
   more locales had invented a brand.
6. **Three level-test items had two right answers** (§10).
7. **A native safe-area check had stopped running** (§18.3) after a button was
   renamed, on the exact screen it was written for.
8. **The store listings undersold the product** (§19.6) in eight languages.
9. **The precache had no forecast at the target** (§16) — 197% when made.
10. **A level-test result showed "between 1 and 1"** and its screen left 383 px
    of dead space beneath the card a learner had spent eight minutes earning.
    Both fixed earlier in this pass.

11. **A test walked past the question it was checking** (§19.1), on a loaded
    machine, and reported it as missing Tamil content.

The pattern across 1, 3, 7 and 10 is one sentence: **"nothing is broken" and
"this is right" are different questions, and only the first one had gates.**

## 20.1 Real-device follow-up findings

A second pass, driven entirely by photographs of the app running on a real
device. Each screenshot was read as a *class* of defect rather than as one
sentence to patch, and this section states what each class turned out to cost.
The counts are the counts; where a number is small it is written small.

### What was found, by class

| Class | Photographed as | In the corpus, once counted | Where the fix lives |
| --- | --- | --- | --- |
| A question with more than one right answer | 힘찬 / 활기찬 in *____ 목소리로 말했어요* | **a quarter of the contextual bank** | `build_level_test.mjs`, 13 rules |
| A word safe alone and unsafe in a sentence | *겨울에 여자를 타요* | 2 compositions, out of 4,168 the gate now builds | `content-safety-qa.mjs`, 6 frame rules over 234 classified nouns |
| A blank that does not match its options | *빵을 ___어요* offered 만들다 | every gap-fill the browser built — **508 questions**, on three screens | one builder, `data/generated/cloze.json`, read by all of them |
| Korean conjugated wrongly on a card | 맛없은, 계셌어요, 죽여 주세요 | 3 classes: adnominal 있/없, the honorific 주시, and the request form of **every** verb | `packages/korean-morphology`, 146 fixtures |
| Korean broken mid-word on a button | 레벨 1부/터, 레벨 테/스트 | reproduced at 320, 360 and 390 px | `word-break: keep-all` on `body`, checked by `modals:qa` |
| A heading truncated in a long language | இன்றைய சொற்... | 1 screen measurably clipped, in 1 of 32 languages | the header wraps to two lines; `qa:locales` now measures every `text-overflow: ellipsis` |
| Progress that counted screens, not answers | 10/10 with two words missed | the whole daily model | `dayProgress` and `sessionProgress`, 15 fixtures |
| Feedback repeating the answer above it | 정답은 "어떤 종류의"예요 | every multiple-choice question | the card carries the verdict and nothing else, 2 fixtures |
| A result showing a range | 15~21, and a translation apology under it | 1 screen | one level, and the band, ceiling and word-count lines removed |
| A translation inventing a person the Korean has none of | *Her voice is affectionate* | **125** French and German translations; English, Spanish, Portuguese and Chinese had already been done | `examples_qa`, now gating all six |

### The counts, stated plainly

| | |
| --- | --- |
| Korean teaching examples read, one at a time | **2,916** |
| Examples rewritten after that reading | 18 |
| Parts of speech corrected | 15 |
| Glosses corrected | 2 |
| French and German translations rewritten to stop inventing a person | 125 |
| Korean examples rebalanced away from a gendered default | 10 |
| Contextual Level Test items, all read by rule | **506** |
| Composed sentences the safety gate builds and reads | **4,168** |
| Photographed regressions held as named fixtures | 9 |
| New vocabulary entries authored | 60 |
| Corpus, before → after | 2,856 → **2,916** |
| Gates added | 3 (`content:safety:qa`, `korean:education:qa`, `mobile:walk`) |
| Defects this pass introduced, then found and fixed | 1 — the partial-locale sitting with no questions in it |
| Gate rules widened rather than waived | 4 |

### The one this pass broke, and how it was found

Moving gap-fill construction to one validated place had a consequence nobody
looked for. Only 536 of the 2,916 words survive the rules — a good teaching
example is often not a good question — where the browser had previously built a
gap-fill for *any* word with an example, badly. In the ten complete languages
that is a straight improvement. In the other twenty-two it was not.

Those languages have word meanings for a hundred words, and `strictMeaning`
refuses — correctly, and this is I-19 working as designed — to put one English
choice beside three Hindi ones. So `meaning`, `produce` and `match` cannot be
built for the other 2,816 words, and the sitting rested entirely on the
gap-fill. Take most of those away and a level-1 Hindi session is **ten
introduction cards and no questions at all**. The session-complete card said
*0 शब्द सीखा* — zero words learned — and it was telling the truth.

It was caught by an end-to-end case that has failed for a timing reason three
times before, which is the uncomfortable part: `a hi session never offers an
English answer` reported *no question appeared in hi*, the same sentence a
loaded machine produces, and the screenshot in the trace is what separated them.

The fix is not a patch. `build` — assemble the word from its own syllables —
needs no translation, no example sentence and no distractor pool, so it is the
question those learners can always be asked, and it was already one of the steps
a familiar word owes. `buildDailyQuestions` now falls back to it when the
planned step cannot be built, in that order, so no learner in a complete
language sees a different sitting. A level-1 Hindi session goes from 0
questions to 7. Five fixtures hold both halves of the rule.

### What the emulator walk says, and what it does not

`npm run mobile:walk` drives the debug build on the Pixel 7 emulator through the
screens the photographs came from and re-reads each one: 6/6. `npm run mobile:qa`
is 14/14 on the same build. Screenshots are written to `.walk-shots/`.

**One of those fourteen was sampling rather than waiting, and the larger bundle
found it.** *Progress is stored in native SQLite* read the `data-storage-engine`
attribute once, immediately after first paint. The attribute genuinely starts at
`memory` and becomes `sqlite` when the native driver finishes opening the
database, so the check was a race the app won on the old bundle and lost on one
with sixty more words of audio in it. Probed by hand a second later it said
`sqlite`. It waits now. That is the third instance today of the same class —
sample an unrendered state, report the product as broken — and it is recorded in
§19.1 alongside the other two.

**This is an emulator. No physical device was used, and nothing in this section
is evidence about one.** The distinction matters most for the two things an
emulator models worst — real touch latency and a real speaker — and neither is
checked here.

### The thing this pass did not fix

Nothing above proves the Korean is *natural*. Every gate in
`npm run korean:education:qa` says so in its own output, and
`docs/LEVEL_TEST_KOREAN_REVIEW.md` records, dimension by dimension, who read
what: eleven rows read by a program, three read by an AI assistant, and one row
— naturalness — read by nobody. That row is closed by a Korean native speaker
and by nothing else.

---

# 21. Issues

`docs/issues.json` is the single place in this repository that states an issue's
status — `issues:check` fails the build if a sentence anywhere else contradicts
it.

One reading note. The evidence written on a **resolved** issue is a record of
what was found in the cycle that closed it, and where it cites a section number
that number is the one the report carried at the time. The report has been
rewritten since and renumbered; the citations on the four open, four partial and
one blocked issues were brought forward to this numbering, and the resolved ones
were deliberately left as written rather than edited into agreement with a
document they predate.

<!-- issues:what -->

| ID | Area | Sev | Issue | Customer impact | Status |
| --- | --- | --- | --- | --- | --- |
| **I-04** | Vocabulary | **P1** | 2,916 of a stated 10,000 words | Buyers compare corpus size | **OPEN** |
| **I-12** | Persistence | **P2** | No export: clearing site data destroys the history irrecoverably | A learner who clears browser data loses everything | **OPEN** |
| **I-13** | Relations | **P2** | 252 of 2,916 words carry any verified lexical relation | Synonym and antonym sections rarely appear | **OPEN** |
| **I-17** | i18n copy | **P2** | No locale has been reviewed by a native speaker, across 32 interfaces | Unknown awkwardness in thirty-one languages, and in Korean | **OPEN** |
| **I-03** | Product | **P1** | The Hangyul hand-off is built but has no destination | A learner who finishes the alphabet finishes the product and stops. The card and the My Learning row render nothing rather than leading nowhere. | **BLOCKED** — The value is not in this repository and must not be guessed. |
| **I-19** | Vocabulary | **P1** | Word meanings are complete in ten languages and a hundred words deep in twenty-two | A learner in one of the twenty-two has a fully translated interface and word meanings for the first hundred words only. Past that the card shows the English gloss, marked as English — and the *quiz* shows nothing, because the product forbids a mixed-language question: a word with no meaning in the learner's language is not asked about rather than asked in English. | **PARTIAL** |
| **I-39** | i18n copy | **P2** | The rendered interface has had a mechanical editorial pass, not a native reading, in 31 of 32 languages | Better than it was and still unmeasured where it matters. Seventy-eight real defects were found and fixed — five German screens addressed the learner as *Sie* in a product that says *du* everywhere else, and Italian, French, Turkish, Dutch and Filipino wrote the ASCII apostrophe on pages whose other sentences use the typographic one. Whether the *prose* reads naturally in Tamil or Kazakh is still not known. | **PARTIAL** |
| **I-20** | Vocabulary | **P3** | The hand-written *More about it* block is on 35 words of 2,916 | Word Detail is no longer a short page followed by nothing, but the paragraph written by a person for the words where one line genuinely is not enough is on 35 of them. | **PARTIAL** |
| **I-01** | Release | **P0** | The shipped APK/AAB predate the current product code by one commit | Anyone installing the delivered binary today gets the previous stroke geometry and the retired video splash. The eight syllables re-measured in `e026697` — 구 오 밤 밥 옷 국 꽃 글 — render from the older table, and the launch screen is the MP4 clip the product has stopped shipping. | **RESOLVED** |
| **I-02** | Repo | **P0** | A whole cycle's work was uncommitted when the artefacts were built | A fresh checkout does not contain what was shipped | **RESOLVED** |
| **I-23** | Strokes | **P0** | The stroke demonstration showed ownership wedges at junctions and a polygonal ㅇ | ㅂ's uprights grew triangular spurs into crossbars that had not been written yet; ㅅ's first stroke grew a chunk of the second one's shoulder; ㅈ chipped into its own fork; ㅇ read as a lumpy ring rather than a circle. A learner watching stroke one of ㅂ could see a piece of stroke three already on the paper. | **RESOLVED** — supersedes I-14 |
| **I-05** | Performance | **P1** | The taught corpus at 10,000 words no longer has to fit in the bundle | The delivery architecture can carry the stated plan. The first load halved to 219 kB and the part of it that is corpus — 45.7 kB — does not grow with the corpus at all. | **RESOLVED** |
| **I-06** | Word Detail | **P1** | Longer explanations were English-only dictionary scrapings | Non-English learners never saw the block; English learners read "phylum" under 문 | **RESOLVED** |
| **I-07** | Vocabulary | **P1** | Vietnamese and Thai vocabulary covered 500 of 2,581 words | Past word 500 a vi/th learner read marked English | **RESOLVED** |
| **I-08** | Content | **P1** | Entries whose gloss contradicted their own example | 열 read "fever" above a sentence about counting to ten | **RESOLVED** |
| **I-34** | Handwriting | **P1** | The ㄱ taught beside a vowel had a leg a third too short | A learner tracing 가 or 거 saw one letter under the pen and a different one in *Watch it written*: the demonstration's ㄱ stopped short and read as top-heavy. Reported from a screenshot, not by any check. | **RESOLVED** |
| **I-35** | Handwriting | **P1** | Every jamo proportion was measured off a fallback face, not off Pretendard | ㅗ was demonstrated with a stem two fifths shorter than the letter the learner traces, and ㅛ the same. 30 of the 40 letters were built to proportions taken from the wrong typeface. | **RESOLVED** |
| **I-09** | Vocabulary UX | **P2** | No matching exercise; production is tiles, not a keyboard | Vocabulary still feels mostly like recognition on cards | **RESOLVED** |
| **I-10** | Content | **P2** | Korean and English glosses describe different senses for some polysemous words | The meaning changes when the interface language changes. 차 read "a car" in English and 車、お茶 — a car, or the tea you drink — in Japanese, on a card whose sentence is 차를 타요 and whose four options have one right answer. | **RESOLVED** |
| **I-11** | Accessibility | **P2** | Vocabulary listening questions relied on the hint ladder for a text alternative | Usable, but scored as a reveal rather than as an accommodation | **RESOLVED** |
| **I-21** | Accessibility | **P2** | `sound_recognition` and `distinguish` letter exercises are heard-only, and the toggle that skipped them is gone | A deaf learner arriving today meets letter questions they cannot answer. Anyone who had already turned the setting on keeps it — the stored `sound_free` flag is still honoured. | **RESOLVED** |
| **I-24** | Handwriting | **P2** | The traced guide is smaller than the demonstration for a single letter | On a letter lesson the grey glyph a learner traces fills about two-thirds of the writing square while the demonstration below it fills 0.84 of its own, and it does not sit on the crosshair drawn under it. Same letter, two sizes, one screen. It also costs accuracy: on Pretendard, the default face, 1.04% of correct attempts are rejected — five times the overall average — and every one of those rejections is a letter written *small and drifted*, which is what tracing a small off-centre guide produces. | **RESOLVED** |
| **I-25** | Build | **P2** | `strokes:measure:check` is not on the release gate | None directly. The table is now reproducible and the check exists, but nothing runs it automatically, so a face upgrade could move the measurements without anyone being told. | **RESOLVED** |
| **I-29** | Build | **P2** | Two end-to-end tests fail, and no `verify` target runs the suite that would have said so | None directly — the failing assertion is about a mouse wheel on the Activity screen's range row, and the behaviour works a second after the screen opens. It matters because the previous report recorded `test:e2e` as PASS with both projects run in full, and this cycle it is 228 of 230. | **RESOLVED** |
| **I-36** | Design | **P2** | The listening question drew a decorative speaker emoji above the real audio control | The same action appeared twice — a 44px 🔊 and, under it, the button that actually plays the clip. The emoji belonged to no part of the product's drawing and was `aria-hidden`, so it was decoration standing where the prompt would be. | **RESOLVED** |
| **I-15** | Audio | **P3** | 마디 was mispronounced in one voice | One word sounded wrong | **RESOLVED** |
| **I-16** | Audio | **P3** | The recogniser screen reported 낳다 as 낫다 in both voices | None — the recordings are correct. The open question was the defect. | **RESOLVED** |
| **I-18** | Content | **P3** | 103 glosses carried more than one sense in some language | A learner asked what 차 means had two right answers and one button: the card read 車、お茶 in Japanese and "coche, té" in Spanish over the sentence 차를 타요. | **RESOLVED** |
| **I-22** | Vocabulary UX | **P3** | A beginner's first sitting alternates two question layouts rather than four | Ten new words, two shapes. The variety returns within days as words reach `review` and `familiar`. | **RESOLVED** |
| **I-26** | Splash | **P3** | The native launch screen shows the English wordmark in every locale | A Korean learner opening the Android app sees “Han gyul — Like a slice of tangerine, one letter a day” in English for the moment before the WebView paints, then the Korean artwork replaces it. Two wordmarks in two languages, one launch. | **RESOLVED** |
| **I-27** | UI | **P3** | Between 430 px and 560 px the bottom navigation floats clear of the screen edges | On a large phone in landscape, a small tablet or a split-screen window, the tab bar is 430 px wide on a wider page, so warm ground shows down both sides of it and it does not reach the bottom corners. It reads as a bar that has come loose from the app — the same symptom that was fixed above 560 px. | **RESOLVED** |
| **I-28** | Build | **P3** | `docs:consistency` cannot see four of the figures it tracks, and one of them had drifted | None to a learner. It matters because this report's credibility rests on its numbers, and a gate that ends with “No document states two different current values for the same metric” while a stale value sits in §2.3 reads as stronger than it is. | **RESOLVED** |
| **I-30** | Docs | **P3** | The report's screenshots have no working generator, and one had gone two cycles stale | None to a learner. It matters to anyone reading this report to decide what the product is: Figure 8 showed two vocabulary listening questions a few hundred lines below the prose explaining that none exists or can be generated. | **RESOLVED** |
| **I-31** | Handwriting | **P3** | Gaegu drew small letters, and the correction to its reading size was fitted to one axis | A learner who picks the handwriting typeface reads and traces letters drawn smaller than the same letters in the same app a moment earlier. The traced reference was fixed a cycle ago; the reading size was corrected to 127% and, rendered beside the other five faces, plainly read *larger* than them. | **RESOLVED** |
| **I-32** | Performance | **P3** | Dictionary search scanned every row on every keystroke | None reached a customer — it was caught by its own budget at 9.0 ms before shipping — but the design had no headroom: another 15% of corpus growth and search results would have begun trailing the cursor on a mid-range phone. | **RESOLVED** |
| **I-33** | Content | **P4** | Secondary categories were inherited from senses the card does not teach | 김치 was tagged *communication* as well as *food*; 눈, taught as the eye, was tagged *animals-nature* from the snow sense; 돈 was *time-numbers*. Secondary tags feed search and recommendations, so a wrong one sends a learner to a word that does not belong there. | **RESOLVED** |
| **I-37** | Product | **P1** | The adaptive Hangyul Vocabulary Level Test (1–30) is built | A learner can now find out roughly where they stand in 3–6 minutes, and somebody who already knows some Korean has a way into the product that is not "start at ㄱ". | **RESOLVED** |
| **I-38** | Performance | **P1** | The learning corpus is fetched in priority bands instead of shipped whole | The first load halved — 437 kB gzipped to 219 kB — and stopped growing with the curriculum. What a learner waits for before the home screen paints is now a fixed 46 kB whatever the corpus becomes. | **RESOLVED** |
| **I-40** | Review | **P1** | Review was a dashboard; the learner's saved words and wrong answers were not screens they could open | The two lists a learner thinks of as *theirs* — what they bookmarked and what they keep getting wrong — now have their own screens, reachable in one tap from Review, each with a practice session behind it. Before this, Review answered a question the app had (what is due) and neither of the two the learner has. | **RESOLVED** |
| **I-41** | Dictionary | **P1** | The dictionary ingestion silently dropped 3,384 headwords it had already downloaded | Ordinary words a learner would type were missing from a dictionary that claimed 26,675 entries — including 것 and 거, two of the commonest nouns in the language. Searching for one returned nothing, which reads as the product not knowing the word. | **RESOLVED** |
| **I-42** | Audio | **P1** | The ElevenLabs voice migration was rolled back to the original Microsoft neural voices | The two ElevenLabs voices were rejected as too synthetic, and every clip in the product is now the recording that shipped before them again — Microsoft's ko-KR neural voices, SunHi and InJoon, spoken at 0.82x for beginners. A learner hears the voices the curriculum was checked against, offline, with no account and no network call. | **RESOLVED** |
| **I-44** | i18n content | **P1** | A Tamil learner was asked a Tamil question and offered four English answers | Twenty-two of the thirty-two interface languages were showing quiz prompts in the learner's language over answer choices in English. The question was unanswerable by the person it was built for, and it looked like carelessness rather than a missing translation. | **RESOLVED** |
| **I-48** | Word Detail | **P1** | A taught word card unfolded into every upstream sense of its headword | Word Detail ended in "More from the dictionary", which on 발 — a card teaching "foot" — listed leg, Counter: steps, a blind or screen, strands of noodles, and rounds of ammunition. All true, none asked for, and the effect on a reader is that the product looks less trustworthy rather than more complete. | **RESOLVED** |
| **I-49** | Vocabulary | **P1** | The daily progress bar counted cards seen, not words learned | Reading ten introduction cards filled the bar. A wrong answer filled it. A session could finish 10/10 having missed two words — a number that means nothing, and a learner who notices stops trusting it. | **RESOLVED** |
| **I-50** | Dictionary | **P1** | The dictionary showed wikitext, empty parentheses and duplicate meanings | A learner looking a word up read markup instead of a definition. 핵 said "core of planets or other [[celestial body". 252 entries — trees, fish, mosses — showed "()" and nothing else. 340 adjectives carried Wiktionary's "(to be) " marker, which tells an English reader something the part-of-speech line beside it already says. 내일 offered "tomorrow" twice, the second time under "1 other meaning". Example sentences carried `&mdash;` and the transliteration caret. | **RESOLVED** |
| **I-51** | Localization | **P1** | 3,211 dictionary senses showed an English part of speech in every language | A Tamil, Arabic or Korean reader opening a proper noun, an ideophone, a counter, a phrase or a contraction saw the label in English — 2,310 pages for "proper noun" alone — on an interface that was otherwise fully translated. | **RESOLVED** |
| **I-52** | Accessibility | **P1** | Four controls were under 44 px and two colour pairs failed AA | The streak chip on Home, the vocabulary search field, the nine daily-goal chips and the skip link — the first tab stop in the product — were all below the 44 px minimum. The search field was the worst of them: 25 px tall inside a 48 px row that plainly invites a tap. The dialog's quiet button was white on #ADB4BA at 2.10:1, and "Reset learning progress" — the one destructive action in the app — was the hardest sentence in it to read at 3.39:1. | **RESOLVED** |
| **I-55** | Level Test | **P1** | Contextual level-test items shipped with two defensible answers | A learner who knows Korean well enough to see that 연필을 사고 있어요 is a perfectly good sentence marks the item wrong, and the test places them lower than they are. The strongest learners are the ones most likely to be penalised, which is the worst possible direction for a placement test to be wrong in. | **RESOLVED** |
| **I-56** | Build | **P1** | The level-test ambiguity gate had been crashing on the first item it read | None directly, and it is the reason I-55 reached a customer. Meaning items started carrying ids instead of strings when the bank was localised; the gate read `item.options`, found `undefined`, and threw on item one. It printed a stack trace and no findings, which in a long build log reads like a step that had nothing to say. | **RESOLVED** |
| **I-58** | Content | **P1** | 계셌어요 — the honorific verbs conjugated into strings that are not Korean | Two of them were in the level test as answer options. 계시다, 주무시다, 드시다, 잡수시다 and 돌아가시다 all produced a past tense no Korean speaker has written, and a request form to match: 계세 주세요. | **RESOLVED** |
| **I-59** | i18n content | **P1** | Example translations invented a person the Korean does not have | Korean drops the subject, and 262 translations filled the gap. 발을 밟았어요 — a foot was stepped on, no owner named — read "I stepped on his foot", teaching a possessive that is not in the sentence. And the distribution is its own finding: of the 58 in English, fifty said *he* and eight said *she*, and the eight were the elegant, the graceful, the sweetly-spoken, the one who dressed up and the one who plays the piano. | **RESOLVED** |
| **I-64** | Feedback | **P1** | The handwriting verdict panel was 41% of the width it sat in, and a different width when you got it right | The moment a learner has been working toward — the pen lifts, the app says whether the letter is right — was delivered on a card narrower than everything around it, floating in the middle of the column. And because "Correct." is a shorter word than "Incorrect.", the card physically changed shape according to the answer: 180 px when right, 143 px when wrong, in a 350 px column. The most emotionally loaded surface in the product looked unfinished, and looked unfinished in two different ways. | **RESOLVED** |
| **I-65** | Persistence | **P1** | Adding a word to the corpus renamed a different word's id, and word ids key saved progress | A learner who updated would lose 젖다's history and find it credited to 젓다 — a word they had never seen, now treated as one they knew. Progress is device-local with no cloud copy, so there is nothing to restore it from. The storage layer's own opening comment says an update that silently resets progress is unacceptable for a paid app; this defeated that from the content side. | **RESOLVED** |
| **I-66** | i18n content | **P1** | The Portuguese pack was written in European Portuguese, in a pt-BR product | 143 strings. Most of it merely reads foreign to the reader it is for — telemóvel, comboio, palavra-passe, estou a aprender, toda a gente. Two of them teach the wrong word: camisola was given as the meaning of 스웨터, and in Brazil that is a nightgown; constipação was used for 독감's symptoms, and in Brazil that is constipation. | **RESOLVED** |
| **I-67** | Review | **P1** | The answer-leak guard on hints was blind in every abugida | A learner in Bengali, Hindi or Telugu who asked for help on 돈 was shown the answer. The category rung reads "টাকা ও কেনাকাটা-এর কিছু" — something to do with money and shopping — and the answer is টাকা. The identical hint in English was caught and withheld. Retrieval is the exercise, so a hint that hands the answer over does not merely fail to help: it removes the thing the question was for. | **RESOLVED** |
| **I-70** | Vocabulary session | **P1** | A sitting in twenty-two of the interface languages contained no questions | A learner whose interface is Hindi, Tamil, Telugu, Bengali, Arabic or one of seventeen more opened Today's Vocabulary, pressed through ten introduction cards, and was shown a closing card reading "0 words learned". Not a slow session or a short one — a session with nothing in it to answer, on the screen the product is bought for. | **RESOLVED** |
| **I-45** | Onboarding | **P2** | Nothing ever asked a new learner what level they were, and the level they had was buried | A learner could use the app for weeks, be taught from Level 1 throughout, and never discover that a two-minute test would give them words that fit. The Vocabulary Level itself sat on a card two thirds of the way down Home, which is where a number goes when nobody is meant to look at it. | **RESOLVED** |
| **I-46** | Handwriting | **P2** | Five vowels were drawn visibly off centre, and every attempt ended in a panel of praise | Two things a learner meets on every letter. The reference character sat to one side of the square they were being asked to copy it into, and each attempt — right or wrong — was answered with a headline, a compliment, a stroke-order note and a details toggle. | **RESOLVED** |
| **I-47** | Home | **P2** | The quotation slot held a hundred lines, eighty-eight of which the app had written itself | A learner reading the foot of Home could not tell a sentence Seneca wrote from a sentence a product manager wrote, because both were set the same way in the same slot. Twenty attributed quotations replace them. | **RESOLVED** |
| **I-53** | Copy | **P2** | The Review hub called one list "Saved words" and the other "Wrong vocabulary" | Two chips ten pixels apart named the same kind of thing with two different nouns, so they read as two features that arrived separately rather than as a pair. | **RESOLVED** |
| **I-54** | Build | **P2** | Two gates failed on every run once twenty-two languages went partial | None directly — but a suite that is red on every commit is a suite people route around, and this one was red on 44 findings that were the content backlog rather than a fault. | **RESOLVED** |
| **I-57** | Level Test | **P2** | The test reported a level out of 30 without saying how far it could ask in that language | A learner in Hungarian is never asked a question above level 23, because the levels above are ranked from the dictionary and only English carries those glosses. They were then shown a number "of 30". A ceiling presented as a result reads as a verdict on the learner rather than a limit of the bank. | **RESOLVED** |
| **I-60** | Copy | **P2** | The Korean interface called one thing two things, on screens a learner moves between | The home card read 오늘의 어휘 directly above a tab reading 단어; the saved list was 저장한 어휘, filled by a button reading 단어 저장, and its empty state read 어휘의 북마크를 누르면, which is not a thing anyone says. Unit 1 teaches that 낱자 combine into a 글자 and the product then called the letters tab 글자, counted 완료한 글자 in the activity page and 배운 낱자 in the settings. Six strings were in 합쇼체 in a product that speaks 해요체, one of them mixing both inside a single pair of sentences. | **RESOLVED** |
| **I-61** | Copy | **P2** | Two screens said the same thing twice | "Today's words · 0/10 · A short set of 10 words." — three lines and two of them carry the ten. Home's letters card said 40 the same way. And eight of the twelve units are named after their first lesson, so a unit heading and the card beneath it said the same words forty vertical pixels apart. | **RESOLVED** |
| **I-62** | Feedback | **P2** | Two review exercises kept their own idea of what being right is called | The shared verdict reached the writing box, the recognition step and the review session, and not the two components those sessions render. A learner answering a word question read "That's it." or "Not quite. Here it is." while the same learner, two taps earlier, had read "Correct." | **RESOLVED** |
| **I-63** | Build | **P2** | Two end-to-end tests failed only when the machine was busy, and neither was about the machine | None directly. It matters because a suite with two tests that fail on a loaded run and pass on a quiet one is a suite whose result nobody can read, and the word for that is usually "flaky" — which is where an investigation stops. | **RESOLVED** |
| **I-68** | Level Test | **P2** | Three contextual items had a second answer that also works | A placement item with two right answers measures nothing, and marks a learner wrong for knowing Korean. `____에서 십 년을 보냈어요` keyed 감옥 and offered 바다, and spending ten years at sea is ordinary Korean. | **RESOLVED** |
| **I-69** | Build | **P2** | The locale walk advanced on a stopwatch and clicked past the question it came to read | None directly, and it matters for the same reason the last two of these did: a suite that fails somewhere different each run is a suite whose result nobody can read. This one failed as "no question appeared in ta", which reads as missing Tamil content rather than as a timing assumption, so the next person to see it would have gone looking in the wrong place. | **RESOLVED** |
| **I-43** | Home | **P3** | The line at the foot of Home was one of twelve, then a hundred, and is now twenty real quotations | Twelve lines were exhausted in a fortnight. A hundred fixed that and created a worse problem — eighty-eight of them were written by the app and set exactly like the twelve that were not. Twenty attributed quotations replace both, superseded by I-47. | **RESOLVED** |

<!-- /issues:what -->

<!-- issues:counts -->

**Open — P0: 0 · P1: 1 · P2: 3 · P3: 0**

**Blocked outside this repository: 1 · Partial: 3 · Resolved: 61**

<!-- /issues:counts -->

<!-- issues:how -->

| ID | Evidence | Recommended fix |
| --- | --- | --- |
| **I-04** | `vocabulary:qa:check` reports the shortfall against the target. Unchanged this cycle — no words were authored — but the order changed: authoring no longer makes a delivery problem worse, because there is no longer a delivery problem to make worse.  **Unchanged again, and now unambiguous.** §8.4 of the current report separates the two products: the dictionary is 30,229 searchable headwords and none of them is ever scheduled, while the taught corpus is 2,844. Nothing was authored this cycle. `vocabulary:qa:target` — the release variant — fails on exactly this and is the one gate in `verify:release` that does not pass.  **Re-audited 23 August 2026 at 2,844 words.** 263 entries were authored across three batches this pass — 2,581 → 2,844 — and every one of them passed the production gates before being counted. The shortfall is 7,156. Batch 3 changed the selection rule: the pool was read rather than filtered, and it showed the corpus had holes in its *core* (앞, 뒤, 때, 일, 말, 불, 힘, 꿈, 죽다 were untaught while 위, 아래 and 옆 were taught), so 113 of the 263 fill those rather than extend the tail. The rate is the finding: one entry is 20 authored strings across ten complete locales, and the remaining 7,156 are therefore about 143,000 strings. That is the honest distance, and it is not closable by generation without lowering the bar the gates enforce.  **Re-audited 24 August 2026 at 2,916 words.** Sixty more entries were authored this pass — batch 4, and the selection rule changed again: batches 1–3 chose from a candidate list, and this one chose from what reading all 2,856 examples showed was missing. Twelve adjectives and eight adverbs, because a learner had 춥다 and 덥다 and nothing between them, and 맛있다 and 맛없다 with no 고소하다 or 담백하다. The shortfall is 7,084, about 142,000 authored strings. `vocabulary:qa:target` still fails on exactly this and has not been touched. | Author. I-05 was the reason to wait and it is resolved: the delivery architecture is built, the bands are generated from the corpus by `split_corpus.py`, and adding words changes the number of bands rather than the first load. |
| **I-12** | A consequence of having no account and device-local persistence. §13.3 of the current report. | None that is customer-facing — a developer-style JSON export was tried and rejected. Keep IndexedDB robust, keep persistent storage requested, and do not warn normal users about it. |
| **I-13** | `vocabulary:relations:qa`.  **Re-audited 23 August 2026 at 2,844 words.** Rebuilt after the expansion: still 245 words and 274 relations, because the builder records only what two Wiktionary headwords state about the taught sense and the 263 new words brought no new evidence. Checked separately that the sparse graph is not letting an unrecorded opposite into the Level Test — no bank item offers 앞 against 뒤, 전 against 후 or 죽다 against 살다.  **Re-audited 24 August 2026 at 2,916 words.** 252 words and 282 relations, up from 245 and 274. Seven of the increase are batch-4 words the wiki happens to describe; four are a correction. Scoping a page to the part of speech this app teaches is what stops 쪼다 the verb inheriting 쪼다 the insult's 유의어 바보 — and it also dropped 밝다 ↔ 어둡다, because ko.wiktionary states that pair under 밝다's 동사 heading (*해가 떠올라 날이 새다*, to dawn) while this app teaches the adjective. Twenty-nine taught words have relations under another heading; twenty-five are genuine homographs and are still ignored. The four that are not are named in `content/vocabulary/relation-headings.json` with a reason each. Nothing else changed: a relation still has to be stated on the page, still has to be mutual, and still has to point at a word the app ships. | Nothing, unless a conservative source can be found. Sparse trustworthy data is not a defect and inventing similar words would be. |
| **I-17** | `docs/LOCALIZATION_NATIVE_REVIEW.md` states it. The severity was raised when the surface tripled.  **Re-audited 23 August 2026 at 2,844 words.** Still true, and this pass produced a concrete demonstration of what goes unnoticed without it: the Portuguese pack had been written in European Portuguese in a pt-BR product for four batches — camisola, a nightgown in Brazil, taught as the meaning of 스웨터, and constipação, constipation, used for a head cold. No gate reads for the variety of a language. A native reader finds that in a minute.  **Re-audited 24 August 2026 at 2,916 words.** Unchanged, and now stated in a second place a reader will actually reach: `docs/LEVEL_TEST_KOREAN_REVIEW.md` records, dimension by dimension, what has been read and by whom — eleven rows by a program, three by an AI assistant, and one row, naturalness, by nobody. `npm run korean:education:qa` refuses to pass if that file claims a native reviewer, and prints THIS DOES NOT PROVE NATIVE NATURALNESS on every run. | Native review. Nothing automated substitutes for it, and no document here may claim it has happened. |
| **I-03** | `HANGYUL_URL` is null in a plain checkout; `NextStepCard` returns null; `routing:check` reports which way a build went. Searching both repositories on this machine finds the main product — the Expo app `Hangyul`, bundle `com.hangyul.app`, scheme `hangyul` — and its backend `api.talkhangyul.com`, and this app's own host `ganada.talkhangyul.com`. Neither repository declares a learner-facing web address for the main app. The one occurrence of `https://hangyul.app` is a fallback inside a `catch` in a billing modal, not a declared destination. | Whoever owns the product supplies the destination — a landing page, a store listing or a universal link — and it is set as `VITE_HANGYUL_URL` at build time. Documented in `.env.example`. |
| **I-19** | Stated on the row in the language picker before the learner chooses, which is what makes it a limitation rather than a misrepresentation. §11.1 of the current report.  **Twenty-two locale packs were written this cycle** — ar, bn, cs, el, fil, hi, hu, id, it, kk, ky, mn, nl, pl, ro, ru, sv, ta, te, tr, uk, uz — a hundred words each, with the meaning and the example translation, and the nine polysemy notes that fall inside those hundred. `strictMeaning` in `wordCopy.ts` resolves in the learner's own language or not at all, so the gap removes words from a quiz pool instead of switching it to English; `e2e/locale-quiz.spec.ts` renders six non-Latin locales and fails on any Latin-script option. `locale:content:check` prints the coverage per language, and `lib/locale-status.mjs` names the ten that must stay complete, so a hole in one of those still fails the build.  **Re-audited 23 August 2026 at 2,844 words.** The ten complete locales are complete at 2,844 — every batch carried all twenty strings, including the Thai and Vietnamese rows that live in content/vocabulary/copy/ rather than on the pack entry. The twenty-two partial locales are unchanged at 100 rows, so growing the corpus lowered their coverage from 3.9% to 3.5%: expansion widens this gap rather than narrowing it. The outstanding translation is now 22 × 2,744 = 60,368 rows.  **Re-audited 24 August 2026 at 2,916 words.** The ten complete locales are complete at 2,916 — batch 4 carried all twenty strings including the Thai and Vietnamese rows. The twenty-two partial locales are unchanged at 100 rows, so their coverage fell from 3.5% to 3.4% and the outstanding translation is now 22 × 2,816 = 61,952 rows. | 2,744 more rows in each of twenty-two languages — 60,368 lines of translation. The mechanism, the gate and the honesty are in place. Note that every word added to the corpus adds twenty-two rows to this number. |
| **I-39** | `npm run locale:editorial` is new, and it reads for four things nothing else looked at:  * **Register.** Twenty-one of the shipping languages choose between a familiar and a polite second person, and the choice has to be the same on every screen. It counts the markers of each and fails the build on a language that uses both. It found **five languages mixing them** — de (12 strings), el (3), id (6), ro (2), and, once its own false positives were fixed, none in cs. All are now consistent with the register that language already used. * **One English sentence, two translations.** Where two keys hold the same English string their translations should match. Found the Level Test asking "What does this word mean?" in wording that differed from the reading exercise's in six languages; unified. * **Typography.** 71 straight apostrophes in languages whose English source writes the typographic one; all replaced. * **A label that became a paragraph.** A short English label translated several times longer, which is what breaks a layout at 200% text.  Writing it also found the writer out. Its first run reported seven mixed-register languages and three were its own fault: JavaScript's `\b` is defined against ASCII, so `\btes\b` matched inside *prêtes* and French "revisions ready" was reported as addressing the reader familiarly. Every pattern now goes through a Unicode-aware boundary, German and Italian are read with sentence-initial capitals lowered (so *Sie* meaning *she* is not counted), and the ambiguous markers — Spanish `su`, Czech `ty`, Dutch `u` as the abbreviation for hours — are named and excluded with the reason. **A linguistic check that cries wolf is worse than none**, because it is the kind people switch off.  **What is still not done, and this is the whole of the remaining item.** Nothing here reads a sentence for whether it is *good*. Register consistency is not naturalness, and an apostrophe is not a register. The 15 findings it still reports are deliberately left as warnings for a person: they are places where two screens word the same idea differently and only somebody who reads the language can say which is right, or whether both are.  Distinct from I-17, which is native-speaker review. This is the pass that should happen before one, and the mechanical half of it is now done and enforced in `verify:quick`.  **This cycle: Korean, read on the rendered screens.** Three classes of defect that no check looked for — one thing called two things (I-60), a register that slipped into 합쇼체 six times, and 262 example translations that invented a person the Korean does not have (I-59). All three are rules in `locale:editorial` or `examples:qa` now. What has still not happened is a native reading, in any of the thirty-two. | A reading pass per locale, screen by screen, by somebody who speaks it. The 15 remaining warnings from `locale:editorial` are where to start. |
| **I-20** | The page now carries the dictionary's own senses for the same spelling, behind a disclosure and attributed: 419 words gain 581 additional examples of the sense the card teaches, and 399 gain 721 more under other senses, each beneath the meaning it demonstrates. 2,564 of 2,581 taught words have a dictionary entry at all.  What is still on 25 words is the hand-written block, and that is deliberate — a paragraph under every word is a paragraph nobody reads. The gap this leaves is the words where the dictionary has neither a second sense nor an example: those still show a headword, a romanisation, a gloss, a part of speech and one sentence.  **The nine notes inside the written hundred are now in all 32 languages.** They were English-only, which meant a Tamil learner read the meaning in Tamil and the disambiguation in English — and these are the polysemy notes, the content that most needs to be readable: 눈 eye against snow, 다리 leg against bridge, 차 car against tea, 밤 night against chestnut. `vocabulary:sense:qa` compares the long-definition set across languages and now scopes an unfinished language to the rows it has actually written, so the check reports coverage instead of failing on the backlog.  **Re-audited 23 August 2026 at 2,844 words.** Ten were written this pass, in all ten complete languages, for homographs batch 3 introduced: 말 is also a horse, 배 also a boat and a pear, 병 also an illness, 반 also a school class, 김 also the commonest surname and steam, 벌 also a punishment and a counter for clothes, 일 also one and day, 금 also a crack, 전 also war and a savoury pancake, 키 also a key. Adding a homograph to the corpus without a note is a regression the gates do not catch, so this is now part of what a batch owes.  **Re-audited 24 August 2026 at 2,916 words.** Twelve long definitions were written this pass, in all ten complete languages, for the 사자성어 batch: a four-syllable idiom searched in the dictionary must not look like an ordinary unexplained word, so 일석이조, 작심삼일, 설상가상, 전화위복, 금상첨화, 새옹지마, 자업자득, 고진감래, 다다익선, 과유불급, 유비무환 and 동문서답 each carry a plain explanation of what the phrase means and when it is said. | Content, not code: write the block for the words a learner most often stops on. The machinery to show it has been there since the block existed. |
| **I-01** | Rebuilt from HEAD (`a672dad`) with the working tree clean, and verified by unpacking the delivered APK rather than by trusting the build: `assets/public/brand/splash/` holds `splash-ko.png` and `splash-en.png` and no MP4; the curriculum chunk carries `국:{aspect:.9669,cut:"bar",parts:[[.1257,0,.8686,.3646],…]}`, the current measurement; the matching grid, the sound-free control, the Home nudge and the `noindex` metadata are all present; and all ten native launch bitmaps test wordless. Signed v2 + v3 with the production identity `157a2bb1…debc`, read out of the APK Signing Block. **And `npm run release:current` now exists**: it reads the commit out of `build-info.json`, diffs it against HEAD, and fails on any changed product file or any uncommitted one. It is in `verify:release`. | done |
| **I-02** | Committed before the build, in that order, this cycle and the two before it. | done |
| **I-23** | Reproduced by rendering the shipped assets before any change was made. Fixed by replacing the architecture — see the entry for it in §11. Now: `strokes:qa` clean on 73 items / 269 strokes; `strokes:visual` clean on 1,345 frames; the gallery read by eye at 160 px and at 96 px, which is the size the defect was reported at. | done |
| **I-05** | Fixed by the band architecture in **I-38**; this is the budget half of the same work and is closed by it. `bundle:budget` no longer forecasts the corpus into the first load, because the corpus is not in the first load: it is fetched from `public/corpus/` a band at a time.  ```   corpus, first paint              45.7 kB /  64.0 kB   enforced   corpus, first paint at 10,000    45.7 kB /  64.0 kB   enforced, and flat by construction   corpus, whole at 10,000         776.8 kB / 900.0 kB   forecast, background, precached ```  The forecast that used to read 302% of budget was measuring a *first-load* cost. What replaced it is two rows: an enforced first-paint budget that a growing corpus cannot break, and a background figure whose ceiling was re-derived for what a background download may fairly cost. See I-38 for why the second number is 900 kB rather than the old 220, and why that is a retirement rather than a raise. | Done. |
| **I-06** | 25 written words in ten languages; §15.2. | done |
| **I-07** | 2,581 non-null rows in both. | done |
| **I-08** | Eleven found, all authored and pinned; `vocabulary:sense:qa:check` passes. | done |
| **I-34** | The leg's toe, as a fraction of the letter's width, measured off Pretendard with the ㄱ's region taken from the measured composition: 0.120 in 가, 0.116 in 거, 0.113 in 기. It was authored at a lean of 0.28, putting the toe at 0.72.  The rule was already right — a leaning form beside a vowel, an upright one above or alone — and only the magnitude was wrong, so the fix is one constant and a refitted curve, not a per-syllable exception. `GIYEOK_LEAN` is 0.885, the leg's two controls least-squares fitted to the face's own profile at 25/50/75/98% of its height, and the corner held square. Fitted twice: the first fit was against the bare curve, and the samples are of rendered ink whose box is half a pen larger at each end — worth 0.057 of the width through the middle.  Now 0.166 / 0.175 / 0.167 against the face's 0.120 / 0.116 / 0.113, inside the face's own variation between the three. All 14 taught items containing ㄱ, ㅋ or ㄲ were re-rendered against the face and read by eye. Stroke integrity is unchanged: `strokes:qa`, `strokes:visual` and `strokes:measure:check` clean on 73 items and 1,345 frames. Pinned by `giyeokShape.test.ts` without a browser and by `glyphshape:qa` with one. | Done. |
| **I-35** | `measure-jamo.mjs` set a page whose only content was a `<canvas>`, awaited `document.fonts.ready` — which resolves immediately when nothing on the page uses the family — and then drew with a font that had never loaded. The canvas substituted a system Korean face and drew perfectly good, wrong letters. Nothing errored and the check said the file was up to date, because it faithfully reproduced its own mistake.  ㅗ was recorded at an aspect of 2.894 where Pretendard draws it at 1.826; ㅛ 2.894 against 1.746; ㅊ, ㅈ, ㅑ, ㅏ, ㅐ, ㅎ and 23 others moved by more than 5%. The generator now loads the face for the letters it is about to measure and refuses to run if it did not — checking for a family only its own `@font-face` can supply, because the fallback is another Korean face and passes a weaker test.  Found by following the ㄱ report rather than by any gate. The first attempt to measure it independently had the identical bug and produced eight confident, wrong findings about compound vowels before the numbers were checked against the font file itself. | Done. |
| **I-09** | `MatchExercise` — four Korean words, four meanings, tap-tap. It is a genuine group exercise rather than a screen: `ScheduledStep` gained `group` and `completes`, `scheduleSteps` holds words back until four are waiting so a grid is only ever made of words already met in that sitting, and the session credits every word a step finishes from one code path. Seven component tests cover the accounting, including that a grid reports one result per word, that both sides of a wrong attempt are marked, and that a double tap on the last pair cannot report twice. Four scheduler tests cover the invariants: every word finished exactly once, no word in two grids, and no grid before its words were introduced. | done |
| **I-10** | The recommended fix is in: every entry carries a canonical `senseId` derived from its English gloss — 2,581 of 2,581, no collisions — and English is the arbiter because it was the one locale already single-sense throughout. 103 separator-split glosses were read against the sentence each card actually asks; 35 named a sense the sentence never demonstrates and were trimmed, ten cards moved sense outright, and three illustrations moved with them. The remaining 38 are classified in `REVIEWED_SPLIT` and `vocabulary:sense:qa:check` now fails on a split gloss that is not on that list, and on a listed one that has stopped being split. Both directions are negative-tested.  What is still unguarded: a gloss merged with a **comma** rather than a semicolon, 또는 or 、. The comma cases among those 103 words were fixed by hand — "coche, té" for 차 is now "coche" — but the rule cannot be widened to catch a new one. Measured over the corpus, "this locale has more comma-separated parts than the English" flags 228 glosses and is dominated by descriptive commas: 얼굴 is "눈, 코, 입이 있는 앞부분", one definition containing a list, not two senses.  **Closed this cycle by doing the reading pass the fix asked for.** The decidable half was already gated; what remained was comma-bearing glosses, which no separator rule can judge because "we, us" and "mum, mummy" are one sense written twice. The dictionary judges them instead: a comma gloss whose parts land on different dictionary senses is a shortlist, and it is 55 words long. All 55 were read across the ten complete languages side by side, and five were genuinely teaching two senses — 목 (every example said throat, eight glosses said neck), 밥 (English translated its own example "a meal"), 근데 (four glosses said "but", every example was the discourse marker), 그쪽 (the polite second person, not the direction) and 기술 (the Korean gloss is 솜씨). All five are fixed in every language that carries them. The other fifty are named in `REVIEWED_COMMA`, so a new comma gloss that splits senses fails `vocabulary:sense:qa` — proved by putting "a neck, a throat" back. Cross-language part-count drift was measured at the same time: one word of 2,581 differs by two or more parts across the ten, and it is 얼굴, whose Korean gloss is a descriptive phrase. | Done. The gate is `vocabulary:sense:qa`, in `verify:quick`. |
| **I-11** | There is no vocabulary listening question left to accommodate; §16.5. The letter exercises are I-21. | done |
| **I-21** | A per-question *Can't use audio?* on the two heard-only letter exercises, in all 32 languages. `listen` swaps the clip for the written romanisation and keeps the same four letters; `distinguish` turns the question round and asks which of two sounds the letter makes, because printing the romanisation there would hand over the answer its options already carry as labels. Same item, same skill, same scoring, no penalty and no setting. `accessibility.spec.ts` drives the Listen practice entry, asserts the control is a real button reachable and operable by keyboard, and runs axe over the substituted question. | done |
| **I-24** | `fitGlyph` measures the drawn ink and solves for the size and origin that centre it, rather than sizing the em. Measured on the running app: ㅏ went from 0.228 × 0.672 centred at (0.556, 0.460) to **0.243 × 0.718 at (0.499, 0.499)**, and the worst centring error across all 270 glyph-and-face pairs is 1.2% of the box. The grading half — the reason the previous attempt was reverted at 21% false rejections — is `GAP_EROSION_RATIO`, which erases the rim a too-wide reference stroke leaves before the structural term counts it, mirroring what the blot term already did. Swept jointly against the corpus: **0.28% false reject / 0.28% false accept**, against 0.21% / 0.78% before, with Pretendard — the default face — improving on both from 1.04% / 0.55% to 0.42% / 0.00%. The fixtures were regenerated because they had been rendering their own layout and so measuring a geometry the product does not use. | done |
| **I-25** | `measure-composition.mjs` starts its own `vite preview` when nothing is listening on :4477 and reuses one when something is, so it runs unattended. `strokes:measure:check` is in `verify:release`. | done |
| **I-29** | The failing case was the launch screen, not the feature: `page.mouse.*` has no actionability check, so a wheel dispatched during the 900 ms brand screen landed on the splash. `e2e/helpers/launch.ts` makes the wait explicit and says why. The suite is **236 of 236** across both projects, and `test:e2e` is in `verify:release`. | done |
| **I-36** | Removed, with nothing in its place: the question is the line of text above and the action is the one button below. One shared `ChoiceExercise` renders every choice question in the lesson and in Review, so it is gone from every route at once.  Removing it exposed an accessibility defect. The button's name is built as "Play the pronunciation of {text}" and a listening question shows no Korean — that being the question — so the caller had nothing to pass and screen-reader users heard "Play the pronunciation of " and then nothing. Naming the letter would read out the answer, so an unnamed button now says "Play the sound", in all 32 languages.  A test asserts the absence of *any* pictograph rather than of one character, plus the positive shape — one hit-sized control, named for what it does, with "Can't use audio?" still under it — in both themes, with an axe scan. | Done. |
| **I-15** | Regenerated, fixtured, checked on-device. | done |
| **I-16** | The two readings differ measurably: 낳다 is [나타], an aspirated ㅌ with a short closure and a weak breathy release; 낫다 and 낮다 are both [낟따], a long closure and a sharp tense release. Measured off the shipped clips, both voices: 낫다 250/190 ms closure and −4.1/−2.9 dB release, 낮다 250/190 ms and −4.1/−2.8 dB, 낳다 170/170 ms and −6.9/−5.8 dB. The two [낟따] words are near-identical to each other and 낳다 is apart from both, in the direction aspiration predicts. `check_contrasts` in `qa_pronunciation.py` asserts this on every run, and fails if the pair is asserted the other way round. | done — the recogniser is not a normative judge of a clip and no longer gates this word. |
| **I-18** | All 103 were read against the sentence each card asks. 35 named a sense the sentence never demonstrates and were trimmed across ten languages; ten cards moved sense outright — 맡다 was glossed "to take charge of" over 냄새를 맡아 보세요, 시키다 was "to make someone do" over "I ordered pizza" — and three illustrations moved with them. The remaining 38 were read and kept: Japanese has no single verb for 있다 and must write ある、いる, which is one sense in the two renderings the language requires. `vocabulary:sense:qa:check` now fails on a split gloss that is not on the reviewed list, and on a listed one that has stopped being split; both directions are negative-tested. Comma-merged glosses remain outside the rule and are tracked under I-10. | Done. |
| **I-22** | `NEW_WORD_CHECKS` is `['meaning', 'context', 'match']`. A new word still owes two steps — its introduction and one check — so a sitting is the same length, and roughly a third of the words now owe a matching grid, which is enough to make one. Three shapes in a first sitting instead of two. | done |
| **I-26** | `_wordless` in `scripts/content/build_app_icons.py` paints the type out of the artwork and reconstructs what was under it by radial median, leaving the ground, the wash and the scattered jamo. All ten Android launch bitmaps and the iOS launch image are generated from it, and all eleven test wordless inside the delivered APK. The in-app splash still picks Korean or English from `LocaleContext`, on the same `#FFF1E1` ground, so the handover is one colour and no language. | done |
| **I-27** | `max-width` came off `.shell`; `#root` is the only thing deciding the app's width at any viewport. Measured at 360, 390, 412, 430, 440, 480, 520, 560, 600, 768, 1024 and 1440 px: the navigation and the frame share both edges exactly at every one, and no width scrolls horizontally. | done |
| **I-28** | `check-docs-consistency.mjs` now fails on a metric it tracks and cannot find, not only on one that disagrees — a figure nothing states is a figure nothing guards. The four patterns that were silently matching nothing were fixed rather than the prose bent to suit them: they accept the bold and the annotations the report has always used, and both spellings of the APK and AAB row headings. It caught two real drifts on its first run. | done |
| **I-30** | `capture-report-shots.mjs` takes all seven figures the report embeds, in their own block and first, and composes the six-panel session figure from a real sitting rather than by hand. The reference captures that nothing links to are wrapped so a stale selector reports itself and steps over instead of stranding everything after it — which is how the figures went two cycles without being retaken. The category selector it died on is fixed and the capture step for a screen that no longer exists is deleted. | done |
| **I-31** | Fixed by the recommended route: a per-face `glyph_scale` in `data/fonts.ts`, calibrated against the robustness corpus for that face alone, threaded through `glyphSpecFor` and mirrored by `FACE_SCALE` in `render-fixtures.py` — `data.test.ts` asserts the two agree, so the fixtures cannot drift into measuring a geometry the product does not draw.  Gaegu 0.78 → 1.00. Mean ink extent 0.524 → 0.610; smallest glyph 0.27 → 0.35; glyphs below target 37/45 → 25/45. Grading improved rather than degrading: Gaegu's false rejection 1.04% → 0.63%, all-face 0.28% → 0.21%, false acceptance unchanged at 0.28%. A bigger reference is a bigger target for an honest hand, and Gaegu's was small enough that the pen's own width was a large fraction of it.  Why it stops there. The sweep is jagged — about 480 genuine attempts per face, so one crossing threshold moves the rate 0.21% — and there is a cliff just above: 1.02 reads 0.21% and 1.04 reads 3.33%. 1.00 sits on a plateau with 0.98, two steps clear of it; 1.02 is the minimum and is adjacent to the cliff, which would be fitting to which attempts happen to be in the corpus. Beyond about 1.04 the binding constraint is `MAX_FIT_SCALE`, whose own sweep already showed that raising it costs false rejection.  What remains is the typeface. Gaegu's mean extent is 0.610 against 0.653–0.697 for the other five, because it genuinely draws small letters inside its em, and closing that last gap means telling a learner they wrote it wrong more often.  **§51 asked for a rendered comparison rather than a closing argument, and it found a second half nobody had measured.** `scripts/face-size-qa.mjs` renders fifteen syllables in each of the six faces at one font size and measures the ink band as a fraction of the em: nanum-myeongjo 0.919, nanum-gothic 0.908, gowun-batang 0.905, gowun-dodum 0.882, pretendard 0.848, **gaegu 0.712** — 21.3% under the median. That is every letter on every screen, not the traced reference, and nothing grades it. It is fixed with a second `@font-face` at `size-adjust: 127%`, named in a new `text_family` and used by every reading surface through `textFamily()`; `font_family` keeps feeding `PracticeCanvasCard`, so the mask is untouched. Confirmed by looking — the picker's own previews — and by re-running the clipping sweep at 320 and 390 px with the face selected: the same 19 findings as the default face, none of them new. `face:size:check` is in `verify:release`.  **And the reading size, re-audited this cycle by looking.** §48 asks for a rendered comparison rather than the arithmetic, so the six practice faces were rendered side by side at one font size. Gaegu's line was the longest on the page by a clear margin. `face:size` measured the ink band in both directions and gated only the height, and 0.905 / 0.712 is the 127% that shipped; in width that put Gaegu 9.3% above the median, wider than any other face, where the five that were never in question span 0.785 to 0.881. Height wants 1.27 and width wants 1.16, and no single scalar gives both — 121% is the geometric mean, -4.7% in height and +4.1% in width, inside the 8% the five vary by among themselves. Both axes are gated now. | Done. |
| **I-32** | Replaced with an index built when the corpus loads, at no download cost: an exact map from headword and gloss, a prefix map keyed on the first character for Hangul and the first two for Latin, and a bigram posting list for substring queries built the first time one is asked. A keystroke narrows through those three instead of touching 26,675 rows.  Benchmarked against the ranker the app runs, over a spread of real query shapes — growing prefixes, exact hits, romanisation, gloss words, mid-word substrings — with every figure multiplied by four for a phone:  ```   rows      index gz    build     p50       p95   26,675      336 kB    314 ms   0.03 ms   0.79 ms   50,000      631 kB    482 ms   0.05 ms   0.65 ms  100,000    1,274 kB   1001 ms   0.12 ms   1.50 ms   ------   shipping    449 kB    182 ms   0.02 ms   0.55 ms ```  Targets were p50 under 4 ms and p95 under 8 ms; both are met at every size with two orders of magnitude to spare. The synthetic rows were also fixed to have the real corpus's prefix spread — 1,210 distinct first characters, largest bucket 328 — because the previous ones all began with 가, which is the right hostility for a scan and measures an index as a scan.  What still grows with the corpus is the **one-time build**: 1,001 ms at 100,000 against a 1,000 ms budget. That is a once-per-session cost behind a visible loading line, and past that size it belongs in a worker or a prebuilt file rather than in the first search. | Done. |
| **I-33** | Two kinds of evidence were being pooled and only one of them knows which sense is taught. The **gloss** is the taught sense — that is what `senseId` means — so a category matched against it belongs to the card. A Wiktionary **topic** is attached to a *page*, which describes every sense the word has: 김치's page carries `Photography`, because 김치 is what Koreans say instead of "cheese" for a photograph.  `classify` no longer pools them. A topic may name the category of a word the gloss could not classify at all — better than falling back to its part of speech — but it can never add a second category on top of a gloss match, which is where the wrong ones were getting in.  Measured over the corpus: **73 secondary tags removed across 70 words** (504 → 431), and **no primary category changed**, so nothing was made worse to achieve it. 김치, 교실 and 만두 now carry food, school-work and food with no secondary; 눈 is body-health; 돈 is money-shopping. Wrong metadata is worse than missing metadata, and this prefers missing. | Done. |
| **I-37** | Built as its own feature, with its own bank, its own scale and its own simulation harness.  **The scale.** The Hangyul Vocabulary Level is 1–30, cumulative and non-linear: Lv1 ≈ 147 words, Lv10 ≈ 1,835, Lv20 ≈ 5,690, Lv30 ≈ 10,635+. It is **not** the teaching corpus cut into thirty equal bands — that would have made a "level" mean 86 words, which is not a proficiency scale, it is a progress bar. The 2,581 taught words are used as *calibrated anchors* inside it, together with quality-gated dictionary entries, all ranked by the same `frequency.measure` the corpus uses.  **The bank.** `scripts/content/build_level_test.py` selects the anchors and `build_level_test.mjs` generates 3,960 items across the 30 levels (min 121 each) to `public/level-test/`, content-hashed and lazily fetched — it is not in the bundle and not on any critical path. Items are Korean→meaning, meaning→Korean and context, and **context items use conjugated Korean** — 마셔요, not 마시다 — generated through `packages/korean-morphology`, which carries 99 unit tests and a named regression table across ten irregular classes and is checked against 1,306 corpus predicates by `npm run conjugation:qa`. `npm run leveltest:ambiguity` applied eight rules to the whole bank when this was written; it applies twelve now and reports **0 findings** — the four it gained are I-55. A 143-word blocklist keeps unsuitable subject matter out of both the anchors and the distractors; an anchor must be Hangul, 1–4 syllables, a noun/verb/adjective/adverb, and carry a gloss of 3–60 characters that is not a grammatical form page.  **The scoring.** A 3PL/Rasch model with a guessing floor of 1/4, EAP over a grid, Fisher-information item selection. **Exactly 30 items — 12 context, 9 Korean→meaning, 9 meaning→Korean — under one 8-minute clock**, replacing an adaptive stopping rule that ran 18–36 items until SE fell under 1.6 levels: a test whose length depends on how well you are doing tells you how well you are doing while you sit it. Difficulty still adapts; the count does not. On expiry the answers given are kept, the rest are recorded as *I don't know*, and the sitting is scored. "I don't know" is an answer and is weighted as cleaner evidence than a wrong guess, not as a skip. `npm run leveltest:qa` simulates 200 sittings at each of the 30 levels against the real bank: **MAE 1.34 levels, 95.3% within ±3, 99.7% within ±5, exactly 30 items, composition 12.0/9.0/9.0.** Fixing the length cost 0.07 levels of mean error.  **What it does not do.** No listening, no handwriting, no hints, no answer reveal, no running score. It writes `settings.level_test` and nothing else — an e2e test takes the whole assessment and asserts that every other IndexedDB store is byte-for-byte unchanged. The result screen names the scale as **the Hangyul Vocabulary Level** in all 32 languages, so what the learner is given is our own number rather than an implied TOPIK or CEFR grade. The four disclaimer sentences that used to open the intro — no hints, answers not shown, nothing here changes your lessons, not an official proficiency grade — were removed: four caveats to read before a beginner is allowed to find out how much Korean they know is a methodology page, not an invitation. The promises they made are still kept and are asserted against the DOM by `e2e/level-test.spec.ts`, which is stronger than a sentence claiming them. | Done. |
| **I-38** | `scripts/content/split_corpus.py` cuts the generated corpus into bands under `public/corpus/` — shared tables, then band 1 of 600 words and bands of 800 after it, each with the matching slice of all ten languages' meanings, every file named by its own content hash. `data/corpus.ts` fetches them: the tables and band 1 are awaited inside the launch screen's existing 900 ms, the rest arrive in the background once the learner is looking at something.  **The bands are cut on the same key the app reads the corpus in** — `difficulty_score`, then the headword — and that is the load-bearing part. It makes a partly-loaded corpus a *prefix* of the curriculum rather than a subset of it, so a category only ever grows at the end and `vocab-food-2` cannot quietly become a different five words. `data/corpus.test.ts` rebuilds every study set from the finished corpus in one pass and requires it to equal what four incremental passes produced.  `data/vocabulary.ts` is now a live registry: `VOCABULARY` is one array that grows and every derived structure is filled in place, so roughly thirty consumers stayed synchronous and unchanged. The screens that read the corpus *whole* — browse, search, the progress summary, the sound-change examples — use `useCorpusMemo` so they recompute when a band lands, and search says "still loading the rest of the vocabulary" rather than "nothing matches" while it is incomplete. Every "x of y words" reads `corpusTotal()` from the manifest, so the denominator is right on the first frame instead of climbing.  Measured (`npm run bundle:budget`):  ```   first load                      219.0 kB / 460.0 kB    was 437 kB   corpus, first paint              45.7 kB /  64.0 kB   corpus, first paint at 10,000    45.7 kB /  64.0 kB    flat, by construction   corpus, whole                   200.5 kB / 900.0 kB   corpus, whole at 10,000         776.8 kB / 900.0 kB    forecast ```  The old `LAZY_REQUIRED_HEADWORDS = 4_000` gate is gone because there is nothing left for it to gate; in its place the budget now fails the build if a `word-corpus-*.js` chunk reappears in the eager graph, or if `public/corpus` is missing from the build. The whole-corpus budget was **re-derived rather than raised**: 220 kB was a first-load figure for a chunk that no longer exists, and 900 kB is what a background download for a bought product may cost — the property the old number protected is now protected by the first-paint row, which is stricter and flat.  Offline is unchanged: the service worker precaches every band in all ten languages out of the corpus manifest, because unlike the dictionary this *is* the product. | Done. |
| **I-40** | `pages/ReviewPage.tsx` is a hub: one session card, the manual modes, and two rows — Saved words and Wrong vocabulary — each carrying its own count. The two scheduler figures that used to sit there (*needs practice*, *due today*) and the eight-item preview list are gone: both were true, both restated the number already on the Start button, and the preview told the learner what they were about to be asked.  `pages/SavedWordsPage.tsx` and `pages/MistakesPage.tsx` are the two destinations. Both have search or filtering, an empty state that names the action which fills the list, manual removal, and a practice button.  **One canonical saved state.** `toggleSavedHeadword` resolves a Korean spelling to the taught card when the app teaches it and stores `dict:<headword>` when it does not, so saving 하다 from the dictionary and from its word card is one bookmark and not two rows that disagree. A dictionary-only word is saved but not quizzable — there is no distractor pool to build a fair question from — and the screen says so rather than offering a button that opens an empty session.  **Session length is computed, not listed.** `features/review/sessionSizes.ts` returns the standard rungs that fit plus the whole list, so with seven saved words the options are 5 and All 7 — never a 20 that silently gives seven. `defaultSessionSize` starts at ten, which is the daily goal and therefore a length this learner already knows the shape of.  **Removal is removal.** Clearing a notebook row leaves the word in the corpus and the learner's memory of it untouched; unsaving leaves the mistake; clearing the mistake leaves it saved. `store/reviewLists.test.tsx` is 19 tests over the real provider and a persisting driver, including both directions of that independence, the one-bookmark rule, five wrong answers producing one row with `wrongCount` 5, and a practice plan that resolves to more than one exercise type — which is §17 measured rather than asserted.  `e2e/review-hub.spec.ts` covers the same ground from outside: the count on a hub row equals the number of rows on the screen it opens, the size control never offers a session it cannot run, a removed mistake stays removed across a reload, and both empty states name a next step that is not the button the learner just pressed. |  |
| **I-41** | Found by treating one reported miss as a symptom rather than a bug to patch. 귀족 turned out to be present and first in its result list; the report was still right that something was wrong, so the cache was counted instead of the complaint. Of 52,799 downloaded pages: 20,706 have no Wiktionary page at all (correctly — they are inflected forms, and §33 forbids those from becoming headwords), **4,456 had a Korean section the parser could not read**, and 833 had only senses the blocklist rejects.  Two causes, both in the parser. `POS_MAP` did not know ten part-of-speech headings that Korean entries actually use — *Dependent noun*, *Proper noun*, *Counter*, *Postposition*, *Ideophone*, *Contraction*, *Phrase*, *Idiom*, *Proverb*, *Number* — and a section it cannot name is a section it drops. And definitions written as templates rather than prose (`{{lb\|ko\|...}}`, cross-reference and gloss templates) were run through `clean_markup`, which deletes markup, so the sense came out empty and the entry was discarded as senseless. `render_definition_templates()` now runs first and turns them into the sentence they were meant to be.  Result: **3,384 headwords recovered**, 것 and 거 among them.  `scripts/dictionary-coverage-qa.mjs` is the gate that would have caught this and now does. It is not a headword count — a count said 26,675 while the words were missing. It asks three questions: a named fixture of 160 ordinary words across 16 domains that a general Korean dictionary must have (160/160 present); what share of the commonest spoken Korean reaches an entry, at four depths, exactly and after morphology; and it fails the build on any fixture miss that is not in `UPSTREAM_GAPS`.  `UPSTREAM_GAPS` holds exactly one word. **왕족 is absent from both the English and the Korean Wiktionary** — checked by hand against both APIs, so no change to the ingestion can find it. It is recorded as a gap in the source rather than hidden as a passing test, and the list should empty rather than grow. |  |
| **I-42** | Restored from `bfe0fbf0`, the last commit before the migration, rather than re-synthesised: all 10,454 clips were in git and were checked out, so what ships is byte-identical to what was verified before rather than a fresh generation that would need verifying again.  **The repairs came back with the voices.** 마디 is in `speech_repairs.py` again, because the defect it corrects belongs to Microsoft's male voice — it reads the isolated word as [마지], palatalising across a boundary that is not there. It had been deleted a few hours earlier on good evidence: re-synthesised unrepaired on the ElevenLabs voice, the recogniser heard 마디. That evidence stopped being about the shipping voice the moment the voice changed, which is the rule this file now states: a repair is evidence about *a specific voice*, and every entry has to earn its place again when the voice does.  **Provenance follows the audio.** `sources.py` credits Microsoft Azure Neural TTS again, so the Legal screen names the engine whose recordings are in the package, and the generated corpus was rebuilt to carry it. Removed with the vendor: the provider class and its two voice IDs, the key reader (`scripts/lib/secrets.mjs`), the backoff helper, and the registry entry — **0 references to ElevenLabs remain in any source, script or generated file**.  `qa_audio.py` kept the improvement and lost the vendor name: it no longer tests for a hard-coded engine but resolves the pace a corpus was spoken at from the provider that made it, which is the general form of the rule and keeps working if an engine that cannot be slowed down is added later.  **A guard was added because this went wrong once.** Run with no provider named, `generate_audio.py` falls back to `edge` — which is correct for somebody trying the pipeline out and wrong for a rebuild. It re-walked 10,454 existing clips, regenerated none of them, and rewrote the manifest to credit an engine that had not touched them, at a rate they were not made at. Nothing failed; the audio was right and its provenance was fiction. It now refuses to change a manifest's provider unless `--provider` says so on purpose.  Verified after the restore: `audio:qa` **0 errors, 0 warnings** over 10,550 clips (48.9 MB, median 1,010 ms), `audio:pronunciation:check` **0 errors**, and a listening pass over the sample §3 names — every full example sentence and every multi-syllable word transcribed exactly in both voices. Isolated single syllables are beyond the recogniser (it returns empty strings and YouTube boilerplate for 300 ms of context-free audio, for clips that are known good), so those rest on the duration, loudness and shape checks instead, which is stated rather than papered over. |  |
| **I-44** | Not one screen's bug. The curriculum shipped word meanings in **ten** languages and the interface in **thirty-two**; every screen that glossed a word passed the *interface* locale to `wordCopy`, which walked its fallback chain and returned English. Each call was correct in isolation and the product was incoherent.  **The first fix was wrong and is worth recording.** It resolved one *content locale* per learner and made every option share it — so a Tamil session was uniformly English rather than mixed, the gate went green, and the learner was no better off. Consistency was never the requirement; **being readable by the person who chose the language** is.  `strictMeaning` now resolves a meaning in the learner's own language or not at all, and `buildExercise` refuses to build a question whose options are not all present. A locale with no pack has no vocabulary questions rather than English ones — the cost the product decision chose, because a smaller coherent lesson beats a mixed-language one. `wordCopy` keeps its fallback for *reading* a word card, where English marked as English is honest and a blank is not.  **And the content started.** The build already supported hand-written packs for late-arriving locales — that is how Thai and Vietnamese got in — and already tolerated partial ones. All 22 missing languages are now real content locales with **100 of 2,581 words** each, written against the canonical taught sense so a polysemous headword cannot drift.  Partial stopped being the failing condition in `locale:content:check`: it used to mean *mixed*, and now means *smaller*. The gate gained a script check, which earned its place immediately — a Russian row came back as `День长长…` during authoring, Cyrillic then two Han characters, and it reads as correct until the second word.  Verified on the screen, not in the data: `locale-quiz.spec.ts` opens today's vocabulary in Tamil, Telugu, Bengali, Hindi, Arabic and Russian, reads the answer choices, and fails on three Latin letters in a row. **Zero leakage.** Bengali asks with তুমি / এখানে / আমি / হ্যাঁ, Arabic with رأس / مرة أخرى / نحن / ساق. |  |
| **I-48** | The block is gone. Dictionary **search** is untouched — 30,059 headwords, and a search result still opens the full entry — but a taught card has stopped borrowing the dictionary's other senses. One card, one sense, which is what the rest of the screen already promised.  What survives is the half that was pedagogy: extra example sentences **for the sense the card teaches**, shown in the open rather than behind a tap. They needed a filter, and the filter was written by reading what the old block had been showing — `^서울에 가요` with a stray caret from the wikitext, `새들-이` with a morpheme hyphen, `거겠--어`, the fragment 여자친구, a citation about parasite eggs under "a body", and 술을 먹다 ("to drink wine") under 먹다 meaning "to eat".  Measured across all 2,578 cards with a dictionary entry: **605 candidate sentences upstream, 228 fit to show, 195 cards gaining one** — the yield rose with the ingestion fixes in I-50, because sentences that used to carry wikitext now do not. Rejecting two thirds is the point.  `worddetail:qa:check` runs every rule over every card and reports the yield, so a filter that quietly stops filtering fails the build. Two defects were caught while building it: the gloss comparison ignored words shorter than three letters, which emptied the taught side for every "to go" and "to do" — the commonest verbs gained nothing and nobody would have noticed — and the gate began as a copy of the module's rules, drifted within the hour, and accused six correct cards of showing the wrong sense. It imports them now. |  |
| **I-49** | The rule is now one line: **ten words means ten words answered correctly.**  * An introduction credits nothing. A learner who reads all ten cards and answers nothing reads 0/10. * Only a correct answer completes a word. `advance` used to credit unconditionally; it reads the recorded outcome now. * A missed word comes back — at the end of the pass, as a *different* exercise on the same taught sense, because asked the identical multiple-choice a minute later a learner answers from the shape of the screen rather than the word. The session does not end at 8/10 having dropped two.  **The retry queue is not stored anywhere, and that is the design.** What is owed is derived from the plan — the words not in `completed` — and the plan already persists. A reload cannot lose a pending retry without also losing the progress bar, so the two can never disagree.  `dayProgress` also stopped counting the length of the completed list and started counting distinct words in it. Nothing was wrong today, because `completeDailyWord` ignores repeats; counting a log to answer "how many words are finished" is the kind of thing that goes wrong later, quietly, in the learner's favour.  `dailyProgress.test.ts` holds the seven cases: ten intros and no answers is 0/10; five correct is 5/10; four right and one wrong is 4/5 with the wrong one requeued as a different question; the retry finishing the day; the same word wrong twice staying one incomplete word; a reload keeping both the progress and what is owed; and fifteen against a goal of ten reading 150% with the bar full rather than overflowing. |  |
| **I-50** | §16 asked for the whole dictionary rather than the one word in the screenshot, so all 30,059 entries were swept and five defect classes came back, each with one cause in the ingestion and each fixed there:  * `_template_args` split a template body on every `\|`, including the one inside `[[celestial body\|celestial bodies]]`. It now splits at brace depth zero, using the helper the file already had. 84 glosses. * `{{vern\|…}}` and `{{taxlink\|…}}` were unknown templates, deleted as unrecognised, and "()" was what remained of 너도밤나무's second sense. Species and vernacular names now render, and a gloss with fewer than two letters is refused. 252 glosses, and 184 headwords came back with them. * The "(to be) " marker is stripped. 340 glosses. * A repeated gloss under one headword is folded into the first, which absorbs the later one's examples. 212 headwords. * HTML entities are decoded and the transliteration caret removed — from glosses only where it is bound to what follows, because the gloss of 캐럿 is "caret (^)".  Two smaller causes fell out of the same sweep: a definition wrapping another template was deleted before it could be read (어쭈 began with a full stop), and a piped link whose display text contained a `]` stayed as wikitext. `dictionary:qa` now fails on any of it, because the source gets refetched and the cleaner will meet templates it has not met before.  Net: 30,243 headwords, 39,647 senses, and the usable-example yield on a taught card rose from 34% to 38%.  **And swept again.** Fixing five classes is not evidence that there is no sixth. A second pass over the whole corpus against a wider net found six more — a citation left in a definition, a MediaWiki interwiki prefix, an unbalanced bracket, a reference whose target had already been dropped, a replacement character, and glosses long enough to be an encyclopaedia entry. All six are rules in `dictionary:qa`, each negative-tested. 30,243 → **30,229 headwords, 39,610 senses**: the fourteen lost had a dangling reference as their only sense, and an entry that trails off mid-phrase is worse than no entry. Twenty-seven long glosses are kept on purpose and the *count* is the gate — truncating manufactures the defect the sweep exists to remove. | Done, in `scripts/content/wiktionary.py` and gated by `dictionary:qa`. |
| **I-51** | The label is `t('partOfSpeech.<value>')` with the raw value as its default, so an untranslated part of speech does not fail: it prints the English word and looks deliberate. Five of the fourteen the dictionary uses were in that state. All five are now named in all 32 languages, and `dictionary:qa` fails when a part of speech the dictionary uses has no name in one of them — the default is what made it silent, so the silence is broken outside the component. | Done. |
| **I-52** | `screens:audit` renders seventeen screens at 320, 390 and 430 px, in dark, and at 200% root font size: 85 renders, measuring clipping, sideways scroll, tap targets, overlapping controls, dead space and contrast against WCAG 1.4.3's own two thresholds. The first run reported 355 findings and most were the measurement's fault — 121 collisions between a card and a tab in different scroll containers, 110 instances of the disclosed brand pair, 5 inline links WCAG 2.5.8 exempts. The rest were real and are fixed. The two colour failures are fixed in the palette rather than the component: `negativeText` and `positiveText` join `primaryText`, which existed for this reason. `positiveText` was not found by the sweep — a correct-answer label is a state no page load reaches — but #547CF1 measures 3.80:1 on white and is the same defect in the other accent. All 85 renders come back clean and `screens:audit:check` is in `verify:release`. | Done. |
| **I-55** | All 390 contextual items were read, because the gate that checks them says out loud that nothing in it reads Korean — every rule is a proxy and the judgement is a person's. Four classes came back, and each is a rule now rather than four fixes.  **A verb that fits any object.** 연필을 ____ 있어요 offered 사고 beside 가지고; also 두 줄을 생각했어요, 동생을 학교에 보내요, 저를 친구로 불러요. The collocation guard was evidence-based — it rejects a distractor whose own example acts on the same noun — which catches the ones that share *a* noun and misses the ones that share every noun. 33 general verbs are listed in `scripts/lib/level-test-rules.mjs`, excluded as distractors and still perfectly good answers; 25 distractors swapped.  **Another thing you can simply do.** 친구와 ____를 해요 took 축구 and offered 낚시. Where the verb is 하다 and the blank is a noun, every noun with a 하다 form fits; 16 swapped.  **A recorded synonym or antonym**, from `relations.json`, which is only there because two Wiktionary headwords state the relation about the taught sense. 118 pairs sat close enough in level and part of speech to have been drawn together.  **The same sentence, built twice.** 불을 ____ 주세요 was made from 끄다 and from 켜다 and both shipped — six characters asking for opposite verbs. Also 소리를 ____ 주세요 (줄이다/낮추다), 둘에 셋을 ____ (더하다/곱하다) and eleven more. Each item is answerable alone; the bank is its own proof that the sentence does not pin the meaning down. All 30 removed.  360 contextual items, down from 390. `leveltest:ambiguity` carries all four, and is twelve rules now. | Done. |
| **I-56** | `verify:quick` was recorded as passing while the log ended at `leveltest:ambiguity:check` with a `TypeError`. The exit status had not been read: the command was `npm run verify:quick > log; echo $?`, and `;` makes the echo's status the command's. The gate now reads `options ?? optionIds` and checks all 3,960 items; the aggregate scripts were left alone but every result in this cycle's report was taken from a run whose exit code is quoted. | Done. |
| **I-58** | `SUPPLETIVE` pinned the whole stem to 계세, which is right for the polite present — 시 + 어 fuses to 세요, not 셔요 — and everything else was derived from it. The past is one operation on the 아/어 form, so 계세 became 계셌어요. The suffix is irregular in exactly two forms, not nine: 계세요 and the honorific are pinned, and the rest derives from the regular 계셔. 있으시다 and 자시다 joined the list. It survived because `conjugate.test.ts` had no honorific row — the table is written from the grammar, so a form nobody wrote a row for is a form nothing disagrees with. There are eight rows now, including 마시다 and 가시다, which end in the same syllable and are not honorific. | Done. |
| **I-59** | Found by reading a spread of 25 taught entries, then counted across the pack. Rewritten where the language has somewhere to go: 58 English (singular *they*, or *someone* where an object needs naming), 67 Chinese, 59 Portuguese, 2 Spanish, and 30 German — the possessive that marks its owner's gender, the gendered object, and five 마세요 sentences that had answered in *du* inside a product that speaks *Sie*.  **What is left: 72 French and 51 German subject pronouns.** Neither language has a third-person singular that is not gendered and in both the masculine is the unmarked form, so "Il ronfle" does not assert what "He snores" asserts. French possessives agree with the thing possessed, so *sa voix* was never the problem; German's agree with the owner, which is why thirty of its could go. Recasting the remainder with *quelqu'un* and *jemand* is faithful and reads like a grammar exercise, and which is worse is a judgement for a speaker of each language. `examples:qa` gates the rule in the five languages where it is decidable.  **Re-audited 23 August 2026 at 2,844 words.** The rule held on new authoring: 15/invented-person fired once during batch 3, on a Portuguese translation that had grown an *Ela*, and refused the build. The 123 French and German cases the issue describes are unchanged and still need a native speaker.  **Re-audited 24 August 2026 at 2,916 words, and closed.** The 123 French and German cases are done: 125 translations rewritten, and the reasoning that had left them open turned out to be about the *pronoun* rather than about the *sentence*. It is true that neither language has an ungendered third-person singular. It is not true that a translator must therefore choose one, because both languages can decline to name a third person at all — by taking the Korean's own subject where it has one (목소리가 다정해요 is a sentence about a voice: *La voix est tendre*, *Die Stimme ist sanft*, where it had been *Sa voix* and *Ihre Stimme*), by `on` and `man` for a general statement, and by `cette personne` / `diese Person` for a specific person the Korean leaves unnamed, which is exactly as specific as 그분.  What that was worth is in the distribution. Before the rewrite the German translations of subjectless examples were masculine 49 times out of 49, and the four French feminines were the piano player, the one who dressed up, the one who walked with poise, and the pregnancy. The unmarked form is not neutral when the marked form is only ever used for that.  `examples:qa` now gates all six languages rather than four; the French rule carries an impersonal list so `Il pleut` is not read as a man, and both languages carry an antecedent guard so a pronoun bound to a noun already in the sentence is not a finding. Negative-tested by restoring *Ses gestes sont élégants* and *Er bewegt sich anmutig* to 우아하다, which fails the build. `npm run examples:stereotypes` counts what is left, in every language at once, and prints zero. | Nothing outstanding. The Korean side is a separate and smaller question, and it has been counted rather than left: of 66 examples that name a gendered person, ten were rebalanced away from a default that put the father in the hospital and the mother in the kitchen. The report of record is `npm run examples:stereotypes`, and reading it is the recurring task. |
| **I-64** | Measured at 390 px on `/letters/lesson-vowels-core` before anything was changed. `FeedbackState` declared no width and `.after` was a flex column with `align-items: center`, which sizes children to their content. Nothing was clipped, nothing overlapped, every contrast ratio passed — which is why `screens:audit` had been green on this screen for its whole life. The existing checks only ever asked whether something had gone *outside* its box. | Done. |
| **I-65** | Ids are `word_` plus the romanisation, and two Korean words can romanise the same — 젓다 (to stir) and 젖다 (to get wet) are both `word_jeotda`, so the second to ask gets `_2`. Which asked first was decided by `sorted(words, key=lambda w: (levels[w], scores[w], w))` in `build_vocabulary.py`: difficulty order, which every content change perturbs. Adding 젓다 in batch 3 renamed the already-shipped 젖다. `progressKey(kind, itemKey)` in `apps/web/src/storage/schema.ts` keys every progress row by that id. | Done. |
| **I-66** | The locale is pt-BR and the pre-existing pack is unambiguously Brazilian — você ×44, trem, celular, banheiro, resfriado, xícara. Every batch authored during this pass drifted European and nothing noticed for four of them. What finally caught it was `content:qa`'s meaning-collision warning: five words had become *antes* (예전, 이전, 앞서, 차라리, 전), a warning about learnability that happened to point at a register defect it was not looking for. | Done for Portuguese. There is still no gate that reads for the *variety* of a language, and writing one is not obviously possible; the marker list used here is recorded in docs/final-launch-audit.md. This is one of the things native review is for — see I-17. |
| **I-67** | `revealsAnswer` stripped everything outside `\p{L}\p{N}`, and a Bengali vowel sign is `\p{M}`. টাকা is ট + া + ক + া, so the needle became টক while the token trim — which removes marks only at the *edges* — made টাক, and the two could never match. Bengali, Devanagari, Telugu and Tamil were all affected: the guard worked in the scripts that write their vowels as letters and nowhere else. | Done. |
| **I-70** | Introduced by this pass and found by it. Gap-fills moved from the browser to a single validated builder, and only 536 of the 2,916 words survive its rules — which is right, and is the point: the browser had been building a gap-fill for any word with an example, and building it badly.  The twenty-two partial locales have meanings for a hundred words, and `strictMeaning` refuses to mix languages inside one question (I-19, working as designed), so `meaning`, `produce` and `match` cannot be built for the other 2,816. With most gap-fills gone as well, the plan's checks all dropped and only the introductions were left. Measured at three levels before the fix: 0 of 8 planned checks askable in Hindi at level 1, 1 of 8 at levels 3 and 6.  Found by `e2e/locale-quiz.spec.ts`, which reported *no question appeared in hi* — the same sentence that walk produces when it loses a race on a loaded machine, three times before. The screenshot in the trace is what separated them: a session-complete card reading 0 शब्द सीखा over an introduction card.  Fixed in `buildDailyQuestions`: when the planned step cannot be built, fall back to `build` — assemble the word from its own syllables — which needs no translation, no example sentence and no distractor pool. The planned step is tried first and always wins, so no learner in a complete language sees a different sitting. A level-1 Hindi session goes from 0 questions to 7. `dailyQuestions.test.ts` holds five cases including the two negatives: a word too short to assemble is still not asked about, and an introduction is still an introduction. | Nothing outstanding for the defect. The underlying asymmetry is I-19 and is unchanged: twenty-two languages have a hundred words written, and the fallback makes their sittings answerable rather than complete. |
| **I-45** | **Asked once, before the first vocabulary session.** A learner who has never been placed is offered the test with two answers: take it, or start at Level 1. It is not a gate — declining begins the session immediately — and it is never asked again, because a prompt that returns tomorrow is a toll rather than a recommendation. An assessed learner never sees it.  **`placement_skipped_at` is a new field and deliberately not part of `level_test`.** Those are different facts: one is what was measured, the other is what was decided about measuring. Collapsed into one, a learner who declined becomes indistinguishable from one assessed at Level 1, and the app loses the difference between *we know* and *we have not asked*. Schema 12, migrated to null for everybody including existing learners with a result — who never declined anything.  The prompt waits for the profile to load. Without that, every learner looks untested for as long as IndexedDB takes to answer, and somebody assessed months ago opens today's words and is asked whether they would like to be assessed.  **The level now sits beside the streak**, in the status corner every learner passes on every launch — outlined rather than filled, "Lv." small and the number bold. A measurement, not a medal: no badge, no gradient, no crown. And the test's result screen now ends on *Learn words at my level* rather than *Done*, which used to return the learner to the settings screen they came from after thirty questions about what to teach them next.  **What the level does and does not do is stated rather than implied.** For a learner who has never been assessed it rises with what they have learned; for one who has, it is the measurement and holds until they retake. No progress bar was added toward the next level, because for an assessed learner ordinary study does not move it and a bar would say otherwise.  `store/placement.test.tsx` covers §59 A–E, including the case easiest to get wrong: retaking mid-day leaves today's words exactly as they were, because a plan is built once and stored and a new level is a fact about tomorrow. |  |
| **I-46** | **The centring was a font-metrics bug, and it was measured.** `text-align: center` centres a glyph's advance width and a line box centres its ascent-to-descent band; neither is the ink. Compatibility jamo are drawn to read in isolation rather than to fill their em, so off Pretendard at weight 600: ㅜ and ㅠ sit 7.8% and 7.5% of an em too low, ㅏ 6.8% too far right, ㅑ 4.0%, ㅗ 3.8%. About seven pixels at lesson size, and worse in context — the guide square *is* centred, so the model and the target disagreed about where the letter belongs.  `measure-jamo.mjs` already renders each letter in the real face to measure its proportions; it now also records how far the ink falls from the centre of the box centring gives it, and `CenteredGlyph` subtracts that. Nobody types the numbers, which is the difference between this and a per-letter margin.  **Three of the four surfaces were already correct.** The handwriting guide, the stroke-order animation and the *Watch it written* preview are drawn from `strokeVectors.ts`, which fits authored strokes to the ink bounds of the measured box and centres those — ink-centred by construction. Only the reference character is rendered as text. Composed syllables measure within 2.5% and need nothing, because a syllable block is designed to fill its em. `jamo:centering:check` gates the **residual** — the face's offset less the shipped correction — so a font update that moves a glyph without a re-measure fails the build.  **The feedback card is gone.** A headline, a line of praise, a stroke-order note, a Show details toggle and a numeric breakdown, under a two-stroke letter, every attempt. A learner writing ㄱ for the fourth time does not read "That's it!" — they have read it three times, and repeated praise stops carrying information the moment it becomes certain. Correct is now one button; wrong is one actionable sentence and Retry. The grade is unchanged and still recorded; what went is the ceremony around reporting it. The percentages and stroke-order notes were deleted rather than moved behind a toggle — a mismatch percentage is the grader talking about itself. `i18n:check` caught the three strings the panel owned and they are gone from all 32 locales. |  |
| **I-47** | Twelve of the hundred were quotations. The rest were encouragement written for this app — "Two words a day is seven hundred a year", "Progress is quiet" — labelled honestly in the data and not on the screen, which is the only place it counts.  The library is now **20 quotations, each by a named person, each from a work and a place in it a reader can check**: Confucius to Analects II.15 and XV.30, Seneca to letters 7 and 76, Aristotle to Nicomachean Ethics 1103a, and King Sejong to the preface of the Hunminjeongeum — which is the right quotation for this product to carry.  **Proverbs went with the app-authored lines.** A byline reading "Korean proverb" is a category where a name should be, and a proverb has no author to verify. 꿈을 크게 가져라 is withdrawn for the same reason: it used to ship deliberately unattributed because its three circulating attributions are all wrong, and under a policy requiring a person, a quotation nobody can be credited with is not one.  **A fresh line on every open**, never the same one twice running, nothing persisted. Pinning it to the calendar day had made decoration into stored state — a key, a date, a migration — for a sentence at the foot of a screen.  `quotes:qa:check` enforces the policy: 16–24 lines, no duplicate sentence in any locale, every byline a person and not a category, every source carrying a work and a date with no hedging words, all 640 renderings present, and nothing written to storage — proved by handing the module a `localStorage` and failing if anything lands in it. |  |
| **I-53** | Thirty-one languages already used one noun for both — Uložená slova / Chybná slova, 保存した単語 / 間違えた単語, 저장한 어휘 / 틀린 어휘 — so English was the only string that changed, to "Wrong words". `copy:audit` now compares the pair in every language by shared token, falling back to a two-character run for the three languages that write without spaces. Not by last word (the head noun is last in German and first in Vietnamese) and not by longest shared run, which was the first attempt and passed "Gemerkte Wörter" against "Verpasste Vokabeln" on the "te " in the middle of two unrelated adjectives. Proved by breaking German, English and Chinese in turn. | Done. |
| **I-54** | Every content locale used to be all-or-nothing, so any hole meant the build had gone wrong. §33 changed that: `strictMeaning` resolves in the learner's own language or not at all, so an unwritten row removes a word from that language's quiz pool, which is the designed behaviour. A measurement cannot tell an unfinished language from a broken one, so the promise is declared: `scripts/lib/locale-status.mjs` names the ten that must be perfect, and `vocabulary:qa` and `vocabulary:sense:qa` import it rather than keeping their own copy. A gap in one of the ten still fails, verified by blanking a row in the Japanese pack. The other twenty-two are reported as coverage.  The two browser gates had a related fragility: they assumed somebody had left `vite preview` running, and passed inside `verify:release` for exactly as long as that was true. `scripts/lib/preview.mjs` starts one if the port is silent and leaves an existing server alone. | Done. |
| **I-57** | `reach` in the level-test manifest had said 30 for ten languages, from a manifest that had not been rebuilt. Rebuilt, it is 30 for English, 25 for the nine other complete packs and 23 for the twenty-two — see the matrix in §23. `levelTest:result.ceiling` is written in all 32 and shown only where the ceiling is below the scale, with an end-to-end test in Hungarian asserting it appears and one in English asserting it does not. | Done. |
| **I-60** | Found by rendering the Korean screens and reading them, not by grepping. Eleven strings moved from 어휘 to 단어 — 어휘 is a person's lexicon and stays in the level test — and twenty-eight from 글자 to 낱자, wherever the English says "letter"; 글자 stays wherever the thing is a block, which is fourteen more. `review.prompt.build` was a mistranslation rather than a slip: English says "Put the word together" over a tray of syllables and Korean said 글자를 순서대로 놓아 보세요.  All three are gates in `locale:editorial`, each negative-tested by putting the defect back. The register rule reads sentence endings rather than pronouns, which is where Korean marks it — the file had said Korean needed no rule because 해요체 "has no competing form in this product's copy", a claim about the copy the copy did not support. The 낱자 rule uses the English as the referent and exempts any Korean string using both words, because that is a sentence drawing the distinction on purpose. | Done. |
| **I-61** | Not findable in a bundle: every string involved is correct on its own. `screens:audit` already renders 17 routes and 6 states across 7 profiles, and now reads the text it has in front of it for a sentence rendered twice and a number rendered twice inside one card. `LettersPage` had suppressed the heading case with a proxy — `lessons.length > 1` — which passed unit 11, a two-lesson unit still named after the first of them. The rules had to learn two exemptions: a licences list printing "· OFL 1.1" on six rows is a template, and the first version of the count rule passed the very card it was written for, because "0/10" sits in a `<strong>` inside the `<p>`. | Done. |
| **I-62** | `BuildExercise` and `ChoiceExercise` now use `common:verdict.*`, so the wording is decided in one place and is already written in all 32 languages; `learning:review.right` and `.notQuite` are gone from every bundle. The answer stays on the screen below the verdict on purpose — a choice question cannot be retried where it stands, so "Incorrect." alone would be a review that teaches nothing. What is forbidden is the verdict and the answer fused into one breath, 맞아요, 고예요, and that is gone. `feedback.spec.ts` walks a vocabulary session to a real question and answers it, which is how the gap was found. | Done. |
| **I-63** | **The locale walk waited thirty seconds for every click it expected to fail.** `locale-quiz` walks a session in six languages clicking opportunistically; both clicks are written as try-it-and-carry-on and the `.catch()` says so. A bare `click()` carries Playwright's default 30-second actionability timeout and waits the whole of it out *before* the catch runs, so one covered button costs half a minute and fourteen steps of that is 420 seconds against a 180-second test. That is what the failure had looked like every time: a different language each run, three minutes long, no assertion in the trace. Two seconds a click — six locales in 51 seconds, down from 4.4 minutes with one failure.  **The offline test cut the network before the worker was in charge.** `navigator.serviceWorker.ready` resolves when a worker is *active*; a worker that is active and has not claimed the page controls nothing, so the fetch went to a network that had just been switched off. "Failed to fetch" was a race with `clients.claim()`. The test waits for `serviceWorker.controller` now, which is the thing it actually depends on.  Both were found by running the whole suite from the final commit rather than the specs that had changed, and the clean run after them is 336 of 336, exit 0. | Done. |
| **I-68** | `leveltest:ambiguity` passed all 420 contextual items before and after, on all twelve of its rules. These were found by reading the 60 the new vocabulary added, one at a time against their three distractors. All three shared one cause: the example sentence was a bare frame whose only verb fits anything — 보내다, 하다, 사다 — so nothing constrained the blank. | Done. The class is recorded rather than gated; see docs/final-launch-audit.md §7. |
| **I-69** | One full run of the end-to-end suite failed on `a ta session never offers an English answer` at 16.1 s while the same six cases passed in 56 s on an idle machine, and the mobile project passed the identical case in the same run. The walk advanced with `click()` then `waitForTimeout(300)`. When 300 ms is not enough the next step samples a screen that has not rendered, finds no option group, concludes there is no question on this screen, and clicks onward — past the question. Fourteen steps of that collects nothing and trips the guard that says a question must have appeared. | Done. |
| **I-43** | Kept as the record of a decision that was made and then reversed. Expanding to a hundred solved the repetition and introduced app-authored copy into a slot a reader takes for quotation; **I-47** cut it back to twenty, all named and all citable, and changed the selection from a persisted daily pin to a fresh line on every open. The intermediate state shipped in no release. |  |

<!-- /issues:how -->

---

# 22. The limits of this report

**Everything here was produced by one automated pass on one machine.** No human
has used this product, no native speaker has read any of its 32 languages, and
no physical Android device has run the binary.

**Three things cannot be settled from here and are not claimed:**

* **Native review** of any locale, including Korean and the 123 French and
  German example translations that use an unmarked masculine for a subject
  Korean does not name (I-59).
* **Physical-device behaviour** — real touch latency on a slow phone, real
  handwriting from a real finger, battery, thermal, and the four-year-old
  midrange Android the target customer is most likely holding.
* **The onward destination** for the Hangyul hand-off, which is a business fact
  somebody outside this repository owns (I-03).

**One thing is deliberately not solved:** there is no gate that reads for the
*variety* of a language. §11.2 is what that costs, and the marker list used to
find it this time is recorded in `docs/final-launch-audit.md` rather than
presented as a check.

---

# 23. Verdict

## **LAUNCH READY WITH DISCLOSED NON-BLOCKING LIMITATIONS**

**Why not NOT LAUNCH READY.** Nothing open causes a customer to lose data, see
wrong Korean, or be unable to complete the product's core journey. The one
data-loss mechanism found this pass — word ids renaming under saved progress —
was caught before it shipped and is now pinned and negative-tested. The suites
run green in full: 338 end-to-end, 953 unit, 143 rendered screens, 60/60 on
device. The delivered binary was installed on an emulator and walked from Home
to a graded letter to a word authored the same day.

**Why not LAUNCH READY.** Four limitations are real, none is a defect, and a
buyer is entitled to know each of them before release:

1. **2,916 taught words against a stated target of 10,000.** The store copy now
   says 2,916 everywhere, so the product does not overstate itself — but anyone
   who was told 10,000 is coming should read §8.3 and §16 for what that
   actually costs.
2. **Twenty-two of the 32 interface languages have word meanings 100 words
   deep.** The interface is complete in all 32; the *content* is not, the
   picker says so before the learner chooses, and the gap widens with every word
   added.
3. **No locale has been read by a native speaker**, including Korean. §11.2 is
   the evidence that this matters and not a formality.
4. **No physical device has run this binary**, and no human has used the
   product.

**What would change the verdict.** A native reading of Korean and of the ten
complete content locales, and one hour with the app on a real mid-range Android
phone. Neither is available from this machine, and neither is an engineering
task.

<!-- issues:next -->

| ID | What | Why it matters | Effort |
| --- | --- | --- | --- |
| **I-04** | 2,916 of a stated 10,000 words | Buyers compare corpus size | HIGH (content) |
| **I-12** | No export: clearing site data destroys the history irrecoverably | A learner who clears browser data loses everything | NONE — closed by decision |
| **I-13** | 252 of 2,916 words carry any verified lexical relation | Synonym and antonym sections rarely appear | NONE unless a conservative source appears |
| **I-17** | No locale has been reviewed by a native speaker, across 32 interfaces | Unknown awkwardness in thirty-one languages, and in Korean | HIGH (people, not engineering) |
| **I-03** | The Hangyul hand-off is built but has no destination | A learner who finishes the alphabet finishes the product and stops. The card and the My Learning row render nothing rather than leading nowhere. | LOW — one environment variable, once the value exists |
| **I-19** | Word meanings are complete in ten languages and a hundred words deep in twenty-two | A learner in one of the twenty-two has a fully translated interface and word meanings for the first hundred words only. Past that the card shows the English gloss, marked as English — and the *quiz* shows nothing, because the product forbids a mixed-language question: a word with no meaning in the learner's language is not asked about rather than asked in English. | HIGH (content) — 22 locales × 2,581 words |
| **I-39** | The rendered interface has had a mechanical editorial pass, not a native reading, in 31 of 32 languages | Better than it was and still unmeasured where it matters. Seventy-eight real defects were found and fixed — five German screens addressed the learner as *Sie* in a product that says *du* everywhere else, and Italian, French, Turkish, Dutch and Filipino wrote the ASCII apostrophe on pages whose other sentences use the typographic one. Whether the *prose* reads naturally in Tamil or Kazakh is still not known. | HIGH (people) — 32 languages × 10 surfaces |
| **I-20** | The hand-written *More about it* block is on 35 words of 2,916 | Word Detail is no longer a short page followed by nothing, but the paragraph written by a person for the words where one line genuinely is not enough is on 35 of them. | MEDIUM (content) — one paragraph per word, in ten languages |

<!-- /issues:next -->
