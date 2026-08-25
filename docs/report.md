---
title: Hangyul ganada
title_ko: 한귤 가나다
subtitle: A zero-beginner Korean foundation app — Hangul reading and writing, then practical vocabulary — running entirely on the learner's own device.
document: Product Truth Report
version: 0.1.0
date: 25 August 2026
describes: A final pre-launch pass that began with a photograph contradicting this report. The previous edition recorded the compound vowels ㅙ and ㅞ as fixed; the running product drew them as three separate letters. §7.2 states what was actually wrong — three defects at once, one of them mis-proportioning all forty jamo — why a green gate certified it, and what now checks it against a reference the app does not draw. Alongside that: the corpus grown to 3,221 words with 162 of the new ones at levels 28–30, the twenty-two partial languages taken from 100 words to the whole 600-word core band, two gates that passed a deliberately broken input and no longer do, and every figure below recomputed rather than carried forward.
mark: report-assets/mark.png
---

# 1. About this report

This is an **internal product truth document** — not marketing, not a changelog.
It is handed to a reviewer, usually another model, as the authoritative
description of what Hangyul ganada *currently is*.

Every claim below was re-derived this cycle from the running product, the
current source, or a script whose output is quoted. Nothing was carried forward
on the strength of having been true before.

That rule is not decoration this time. **This pass began with a photograph of
the running app contradicting the previous edition of this document.** The
previous edition recorded the compound vowels as fixed and quoted a gate that
agreed; the product drew ㅙ as three separate letters. §7.2 is about that
specifically — what was wrong, why a green gate said otherwise, and what changed
so that the class cannot recur — and it is the first thing a reader of this
report should read, because it is the reason to distrust the rest of it until
each sentence has been re-checked.

So each one was. Every figure in §2.2 was recomputed from the artefact that
holds it rather than copied from the previous table, and one of them did not
reproduce: the pronunciation-note count. The previous report said 699; the
module that decides it says **596** on this corpus, and the definition is stated
beside the number so the next reader can tell which question was answered.

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
is 3,221 taught words against a 10,000 target. §8 gives the honest distance in
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
| Commit | `622b29f5` |
| Working tree | clean outside `docs/` and the release directories |
| Node | v24.19.0 |
| Web | React 19, Vite 7, TypeScript |
| Native | Capacitor 8, `com.talkhangyul.ganada` |
| Signing | existing production identity, certificate `157a2bb1…3323debc` — no key generated |

## 2.2 Figures for the next report to diff against

Every number in this table was recomputed this cycle from the file that holds
it. The right-hand column says which file, so a reader can re-derive any row
without trusting the row.

| Metric | Value | Where it comes from |
| --- | --- | --- |
| Words shipping | 3,221 | `vocabulary.json` `words.length` |
| Categories | 18 | `vocabulary.json` `categories` |
| Study sets | 650 (five words each) | per category, ⌈words ÷ 5⌉ summed |
| Characters taught | 73 | `characters.ts` `ALL_CHARACTERS` |
| Hangul letters taught | 40 | `characters.ts` `ALL_LETTERS` |
| Curriculum units | 12 | `characters.ts` `CURRICULUM_UNITS` |
| Lessons | 15 | `characters.ts` `LETTER_LESSONS` |
| Pronunciation notes | 756 | words carrying a `say` field in `vocabulary.json` |
| Of those, shown as a note on a card | 596 | `pronunciation.note_for`; liaison is taught once in the lesson instead |
| Sound-change patterns taught | 6 | `vocabulary.json` `sound_patterns` |
| Patterns a word card may note | 5 | `vocabulary.json` `noted_patterns` |
| Dictionary headwords | 30,282 | `public/dictionary/manifest.json` |
| Dictionary senses | 39,676 | same |
| Dictionary examples | 3,830 | same |
| Interface languages | 32 | `src/locales/*/settings.json` |
| Vocabulary packs complete | 10 | `locale:content:qa` |
| Vocabulary packs at 600 words | 22 | `locale:content:qa` |
| Unwritten vocabulary rows | 57,662 | 32 × 3,221 − rows written |
| Long *More about it* definitions | 71 | third element in `vocabulary.en.json` |
| Level-test items, English | 4,166 | `public/level-test/manifest.json` |
| Level-test contextual items | 566 | the bank, `kind === "context"` |
| Level-test reach, 22 partial languages | 1,021 items each | `manifest.json` `reach` |
| Audio clips | 13,006 | distinct files in `public/audio/manifest.json` |
| Audio voice slots | 13,110 | the same manifest, two voices per entry |
| Vocabulary levels populated | 30 of 30 | distinct `level` in the corpus |
| Words at levels 28–30 | 383 | the corpus, by level |
| Level anchors held | 162 | `level-anchors.json` |
| Example sentences refused by review | 37 | `content/vocabulary/curation` |
| Unobserved words with a written reason | 33 | `content/vocabulary/unobserved.json` |
| Levels set by hand | 6 | `level-overrides.json` |
| Issues tracked | 95 | `docs/issues.json` |
| Signed APK | see §18 | `result/build-info.json` |
| Signed AAB | see §18 | same |

"Characters taught" counts every entry in the curriculum's character table — the
40 letters plus the syllable blocks and 받침 forms the lessons introduce — where
"Hangul letters taught" is the 40 a learner would name.

**The pronunciation-note row is the one that had to be pinned down.** The
previous report gave a single figure, 699, and there are two questions it could
have been answering. 756 words carry a recorded spoken form because some rule
changes them; 596 of those get a *note on the card*, because liaison applies to
so many words that a note for it would stop meaning "look at this one" and is
taught once in the sound-change lesson instead. Both numbers are now in the
table with their definitions, and `docs:consistency:check` holds the first of
them to the corpus — which is how the ambiguity was found, by the gate refusing
a figure that had no source.

Test counts are in §19; artefact hashes are in §18.

---

# 3. Executive summary

## What the product is

A paid, offline-first Korean foundation app for someone who cannot read Hangul
yet. It teaches the 40 letters by sight, sound and hand — the learner writes
each one with a finger and the app grades the strokes — then the syllable blocks
they build, then 3,221 everyday words, each with a hand-written example
sentence, a recording in two voices and a meaning in the learner's own language.
There is no account, no server and no network request during a lesson.

## What this cycle did

**It started with a photograph that contradicted this document.** The previous
edition recorded the compound vowels as fixed; the running app drew ㅙ as three
separate letters. §7.2 is the whole account. In short: three defects at once,
only one of which had been fixed; the third of them was in the code every letter
goes through, so **all forty jamo had the wrong proportion** and the compound
vowels were merely where it showed. The gate that had certified the fix was
comparing the app's tracing guide with the app's demonstration — two drawings
generated from the same authored centrelines, which agree perfectly whatever
they draw.

The response was not to patch the two letters in the photograph. Every compound
vowel was re-authored against **Pretendard**, a reference the app does not draw,
and `npm run letters:face:check` now makes that comparison on every build:
aspect, ink-island count, forty band profiles, anchor-aware upright positions
and crossbar reach. The before and after are in §7.2 as images rather than as
numbers, because the lesson of the whole episode is that a number is not a look.

**Two more gates were found passing a deliberately broken input**, which is the
same class one layer down. `conjugation:qa` accepted 있세요, 만들세요, 듣으세요
and 먹시어요 — none of which are Korean — because its stem-prefix escape
swallowed any ending. `locale:content:qa` carried a comment ending "and that is
what the simulation below checks" with no simulation below it. Both are fixed,
and the second now runs 12,800 four-option questions across 32 languages and
asserts that no option ever resolved outside the learner's own language.

**The corpus grew from 2,948 to 3,221 words**, and where they went matters more
than how many: 162 of the 273 land at levels 28–30, which took the top of the
scale from 221 words to 383 — a learner placed at 30 now has about five and a
half weeks of new vocabulary rather than three. The sample the simulation prints
for that learner is 야무지다, 감언이설, 씁쓸하다, 착잡하다, 애틋하다, 복용하다,
일사천리 — advanced and ordinary, rather than advanced and obscure.

**The twenty-two partial languages went from 100 words to the whole 600-word
core band.** 11,000 meanings, 11,000 example translations and 638 long
definitions, hand-written per language, in Arabic, Bengali, Czech, Filipino,
Greek, Hindi, Hungarian, Indonesian, Italian, Kazakh, Kyrgyz, Mongolian, Dutch,
Polish, Romanian, Russian, Swedish, Tamil, Telugu, Turkish, Ukrainian and Uzbek.
Their reachable Level Test goes from 645 items to 1,021. **They have not been
read by a native speaker**, and §11 says so in the same words it always has.

**Six more defects, each found by a gate rather than by reading**: a level-test
bank still holding 치닫아요 after the module had stopped producing it; two
category labels that named the answer they were hinting at; nineteen new words
the frequency corpora never saw and nobody had explained; a unit test that
asserted a shortage rather than the behaviour under one, and failed when the
corpus grew past it; and an offline precache 4% over budget, raised with the
reason written beside it rather than the packs trimmed to fit. §21 has all of
them as I-85 … I-96.

## What did not change

The 10,000-word target is not met and is not close: 3,221 of 10,000, a deficit
of 6,779 entries, which at the measured rate is about 142,000 authored strings.
No locale has been reviewed by a native speaker. The twenty-two languages are
deeper but still 19% of the corpus, not 100%. The onward hand-off to the main
Hangyul product still has no destination, and none was invented.

## The verdict

**LAUNCH READY WITH DISCLOSED NON-BLOCKING LIMITATIONS.** The reasoning is in
§23, and it is a narrower claim than it was: the product is ready, and the
evidence in this document is only as good as the independent references behind
it, which is why §7.2 is written the way it is.

---

# 4. Product definition

## 4.1 What it is — **VERIFIED**

A standalone paid application, web and Android from one codebase. Twelve
curriculum units, fifteen lessons, forty letters, 33 syllable blocks, 3,221
words. Everything a learner needs is in the binary: the curriculum, the fonts,
the stroke data and 13,006 pronunciation clips in two voices.

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
data, not cut from a raster asset. `strokes:visual:check` and
`jamo:measure:check` compare what the guide draws against what the demonstration
draws at 320 px: mean agreement 98.8%, floor 90%, tolerance 14 px of a 320 px
raster.

`glyphshape:qa:check` does the same comparison and now **defers six letters** —
ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ — to `letters:face:check` instead. Why is §7.2, and it is the
most important paragraph in this report.

## 7.2 The previous report said the compound vowels were fixed. They were not. — **the headline defect**

This section exists because the previous edition of this document recorded a
defect as resolved, quoted a green gate as the evidence, and was wrong. A
photograph of the running app is what said so.

### What the learner saw

ㅙ and ㅞ are **single vowels**. Korean writes each of them as several strokes
in one square, the way English writes *æ* as one letter. What the product drew
was ㅗ, then ㅏ, then ㅣ, spaced far enough apart that the right-hand upright
floated free of the rest — three marks in a row.

A learner copying that copies the wrong shape. It is the one thing a
handwriting app must not get wrong, and it had been reported fixed.

![The eleven vowels before the fix, app against Pretendard](report-assets/compound-vowels-before.png)

Eleven vowels, drawn by the app on the left, set in Pretendard in the middle,
and overlaid on the right. Blue is the app; red is the face. Look at ㅘ, ㅙ and
ㅞ: the app's horizontal bar sits high and short, and its uprights stand where
the face does not.

### Why a green gate said otherwise

`glyphshape:qa` compared the **tracing guide** with the **demonstration**. Both
are generated from the same authored centrelines. Two drawings of the same wrong
shape agree perfectly, and the gate scored 98.8% while the letter was wrong.

That is the class, and it is worth naming precisely: *a check that compares a
thing with itself is not a check.* The gate was not badly written; it was
answering "do our two renderers agree" and being read as "is this letter right".

### What was actually wrong — three defects, not one

The previous pass fixed one of them and reported the issue closed.

1. **The two uprights' x-positions.** Corrected last pass, using a
   one-dimensional metric. Real, and a third of the problem.

2. **The bars were authored too short.** ㅙ's left half did not reach its right
   half, so nothing tied the letter together.

3. **`shapeToFace` assumed the pen widens the ink box on all four sides.** It
   does not. With butt caps, a stroke is widened by the pen only
   *perpendicular* to its direction — a vertical stroke gets wider, not taller.
   Fitting every jamo as though the pen padded it in both axes therefore gave
   **all forty letters the wrong proportion**: ㅐ and ㅒ by 12%, and the
   compound vowels, which are the widest, worst of all.

The third is the one that matters, because it is not a compound-vowel bug at
all. It was in the code every letter goes through, and the compound vowels were
simply where it became visible.

### What was done

The whole vowel table was re-authored in fractions of the face's own ink box,
and `shapeToFace` was replaced with an iterative solve over a new
`drawnInkBox()` that pads each segment by the pen only perpendicular to it, then
centres the resulting box.

![All twenty-one vowels after the fix, app against Pretendard](report-assets/compound-vowels-after.png)

All twenty-one vowels, same three columns. The overlay column is now a single
purple — the app's ink and the face's ink coincide — for every letter including
ㅙ and ㅞ.

### And then the screen itself, from the built bundle

Two sheets of geometry are not a screen. These are the writing screens for ㅙ
and ㅞ, captured from `apps/web/dist` — the same bundle `cap sync` copies into
the Android package — rather than from a dev server:

![The writing screen for ㅙ, from the built bundle](report-assets/runtime-wae-writing.png)

![The writing screen for ㅞ, from the built bundle](report-assets/runtime-we-writing.png)

Four representations of the letter are on each of those screens and §4 of the
brief asks that they agree: the reference glyph beside the romanisation, set in
the face; the tracing guide on the canvas; the stroke demonstration under *Watch
it written*; and the numbered stroke order on it. They agree — the ㅜ's bar meets
the ㅔ's first upright, the two uprights stand close, the crossbar reaches the
second, and the numbers run 1–5 in the order a hand makes them.

### The gate that would have caught it

`scripts/letter-face-qa.mjs`, run as `npm run letters:face:check` and wired into
`verify:quick`. It compares each letter against **Pretendard**, which is a
reference the app does not draw and cannot be wrong in the same direction as:

| | |
| --- | --- |
| aspect ratio | ink box width ÷ height, ±4% |
| ink islands | connected components — ㅙ must have the same number of separate marks as the face |
| band profiles | 20 horizontal and 20 vertical bands of ink extent, ±8%, with the render's own stroke width subtracted so the comparison is not a comparison of pen sizes |
| upright positions | anchor-aware: an edge-pinned stem is compared at its edge, a free-standing one at its centre |
| bridges | where a crossbar must reach, ±5% |

Negative-tested: pulling one upright 4% out of place and shortening one crossbar
are both reported. The gallery it renders — `.letter-face-qa/index.html`, and
`docs/report-assets/letter-face-gallery.png` — is the internal QA sheet a person
reads, because the last lesson of this section is that a number is not a look.

### What this costs the rest of the report

It is the reason §1 says every figure was recomputed. A document that records a
fix without an independent check of the fix is a document that can be confidently
wrong, and this one was. The specific answers are: the gate now compares against
something the app does not draw; the six letters it used to certify by
self-comparison are deferred to it; and the before/after sheets above are in the
repository so the next reader can look rather than believe.

## 7.3 The verdict panel — **fixed in the previous cycle, and re-verified**

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

## 7.4 What recognition does not solve — **VERIFIED**

The grader compares stroke geometry and order. It cannot tell a learner *why* a
letter is wrong beyond accepting or rejecting it, and the feedback is
deliberately one word plus a way forward: no percentage, no score, no
stroke-by-stroke critique, no praise.

---

# 8. Vocabulary data

## 8.1 Scale — **VERIFIED**

3,221 taught words in 18 categories and 645 study sets of five. Every entry has
one taught sense, a hand-written Korean example, a meaning in ten complete
languages and an example translation in each; the twenty-two partial languages
carry the first 600 of them.

Every one of those 3,221 Korean examples has been **read**, one at a time,
rather than sampled — the 2,948 in the previous cycle and the 273 added in this
one. See §20.1 for what that found and §9.2 for how it was done.

## 8.2 What one entry costs, measured — **VERIFIED**

This is the number the 10,000 target has to be read against. One entry is
**twenty authored strings** for the ten complete languages, and it has become
**forty-two** for a word inside the core band:

| Where | Strings |
| --- | --- |
| pack entry `m` | 7 meanings — ko ja zh es fr de pt |
| pack entry `en` | 1 English meaning; a raw dictionary gloss is refused |
| pack entry `ex` | 1 Korean example |
| pack entry `t` | 7 example translations |
| `copy/th.json`, `copy/vi.json` | 2 meanings + 2 example translations |
| `copy/<22 partial>.json`, core band only | 22 meanings + 22 example translations |

The Thai and Vietnamese row was a discovery of the first batch: they are not
carried on pack entries, so a batch that ignores them silently regresses two of
the ten complete locales. The last row is this cycle's equivalent — a word that
lands in band 1 now owes twenty-two more pairs, and a long *More about it*
paragraph in each of the twenty-two if it has one in English.

## 8.3 The 10,000-word target — **the delivery is built; the words are not written**

3,221 of 10,000. The deficit is **6,779 entries, about 142,000 authored
strings**. That is the honest distance and it is not closable by generation
without lowering the bar the gates enforce — `examples:qa` refused six of the
263 entries authored two cycles ago, three of the 60 in the last one, and
thirty-three of the 273 in this one, for reasons a generator would reproduce at
scale: a German and a French translation that invented a gendered subject where
the Korean names nobody, a duplicated sentence, a positive English gloss on a
negative Korean sentence, and a Japanese question under a Korean statement.

`vocabulary:qa:target` fails on this tree and is meant to. It is the one gate
whose job is to state the distance rather than to be satisfied, and it prints
*3,221 headwords — 6,779 short of the 10,000 target*. It has not been disabled,
weakened or excluded from `verify:release`.

Two further facts belong with the number, because "we just need to write more"
is not the whole picture:

* Every word added also adds to the partial-locale backlog. The twenty-two
  languages went from 3.4% coverage to **19%** this cycle, and that was bought
  by writing 11,000 meanings rather than by the corpus standing still — the
  corpus grew 9% at the same time.
* The precache does not fit at the target. It does fit today, at 1,454 kB
  against a 1,500 kB budget raised this cycle for the core-band work; the
  projection at 10,000 words is 3,741 kB and that is a delivery-strategy finding
  rather than a budget one. See §16 and I-92.

## 8.4 The dictionary layer — **VERIFIED, and it is not the corpus**

30,282 searchable headwords, 39,676 senses and 3,830 examples, fetched from
`public/dictionary` at runtime in 84 chunks, read from
`public/dictionary/manifest.json` this cycle rather than carried forward. It is
a lookup surface: nothing in it is ever scheduled, taught or quizzed. Search
answers in p50 0.07 ms and p95 2.42 ms per keystroke, phone-adjusted.

## 8.5 The nineteen words the corpora never saw — **VERIFIED**

`content:coverage` requires every taught word to be observed in one of two
OpenSubtitles frequency lists, or else named in
`content/vocabulary/unobserved.json` with a reason a person wrote. Nineteen of
the 273 new words are unobserved, and each reason was checked against the
corpora rather than assumed:

| | |
| --- | --- |
| eight four-character idioms | 결자해지, 동병상련, 명실상부, 살신성인, 유유상종, 이심전심, 조삼모사, 천고마비 — neither list contains them in any form |
| five more idioms | held only as the 하다 verb: 노심초사했어요, 대동소이합니다, 비일비재하죠, 다재다능한, 일거양득이란 |
| 반려 | appears only inside 반려자 and 반려동물, never standing alone |
| 불거지다, 빚어지다 | -지다 verbs with no form anywhere in either list |
| 매만지다 | held as 매만지기 and 매만지자는, endings the fold does not strip |
| 저조하다, 지긋하다 | the only corpus form is the adnominal 저조한 / 지긋한, a complete token with nothing to strip because the ㄴ is fused into the syllable — so the frequency fold reaches neither |

The last row is the interesting one. It is the same mechanism that had 감사하다
filed at level 11 two cycles ago, and it is recorded rather than worked around:
crediting a fused adnominal would re-rank the whole corpus, which is a change to
make deliberately and not as a side effect of adding two adjectives.

---

# 9. Vocabulary content quality

## 9.1 The automated gates — **VERIFIED, run on this tree**

Run on this tree, this cycle. The counts are what the gates printed, not what
the previous edition of this table said.

| Gate | Result |
| --- | --- |
| `examples:qa` | 3,221 examples, all PASS; 0 REVIEW, 0 REWRITE; 1,455 inflected target forms checked |
| `vocabulary:qa` | passes except `--target`, which is meant to fail: *3,221 headwords — 6,779 short of the 10,000 target* |
| `vocabulary:sense:qa` | one taught sense per word in every complete language, and every written row in a partial one carries the long definition if English does |
| `content:qa` | warnings only, all genuine loanwords — yoga, tofu, gimbap — plus one Portuguese gloss collision on *passar por* |
| `worddetail:qa` | no card shows an example of a sense it does not teach |
| `conjugation:qa` | 1,458 predicates, 1,455 checked against the editorial pack's own surface form; clean, and no longer blind to a malformed honorific (§19.4) |
| `dailyvocab:qa` | clean |
| `content:coverage` | every applicable row at 100%, and all 33 unobserved words carry a written reason |
| `korean:education:qa` | all 11 composed gates pass, and it prints THIS DOES NOT PROVE NATIVE NATURALNESS before the summary |

## 9.2 Reading, which is the part that found things

**Six of the 263 new entries were refused by a gate** and rewritten: two example
sentences where the taught meaning was not recognisable in the translation, one
where the idiom read as a different sense of the headword, one with two clause
joins, and three glosses that split into two dictionary senses on one card.

**Three contextual level-test items had a second defensible answer**, found by
reading all 60 that the new vocabulary added, one at a time against their
distractors. See §10.

### Then all 2,948 were read, and this cycle the 273 new ones

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

### What reading the 273 new ones found

Eight records were corrected and twelve got an explanatory note. Thirty-three
were refused by `examples:qa` on the first pass and rewritten. The largest
single class was forty-three German and French translations that **invented a
gendered subject the Korean does not have** — the same class the previous cycle
found 125 of, arriving again in new content, which is why it is worth having a
gate rather than a memory. The rest: one duplicated sentence (하늘이 파래요), a
positive English gloss on a negative Korean sentence with 못, and a Japanese
question sitting under a Korean statement for 대기만성.

The corpus reads PASS 3,221 / REVIEW 0 / REWRITE 0. One conjugation
disagreement survived to `conjugation:qa`: 치닫다 is a ㄷ-irregular, the pack
said 치달았어요, the module said 치닫아요, and the module was wrong. Adding 치닫
to `D_IRREGULAR` fixed it — and left a stale level-test bank behind it, which is
I-90 and §19.4.

---

# 10. The Vocabulary Level Test

## 10.1 What it is — **VERIFIED**

A 30-item adaptive placement test over 30 levels and a **4,166-item** bank, 566
of them contextual, in three kinds: meaning shown / Korean chosen, meaning asked
/ Korean produced, and a word blanked out of a real sentence. Rebuilt this cycle
against the 3,221-word corpus — and it had to be, because the bank was still
holding a distractor the morphology module had stopped producing (I-90).

## 10.2 Calibration — **VERIFIED, re-run after the expansion**

```
mean absolute error   1.29 levels
within ±3 levels      95.9%
within ±5 levels      99.7%
items asked           30–30, median 30
kinds per sitting     context 12, meaning 9, produce 9
```

## 10.3 The per-language reach — **and every language now reaches the top**

| Languages | Askable items | Ceiling |
| --- | --- | --- |
| en | 4,166 | 30 |
| de es fr ja ko pt-BR th vi zh-CN | 1,541 | 30 |
| the other 22 | **1,021** | 30 |

**The 22 partial languages went from 645 items to 1,021**, which is the
core-band expansion arriving here. A language's bank is built from the words it
has meanings for, so six times the meanings is roughly 1.6 times the bank — the
ratio is not linear because a word yields a meaning item and a produce item
always, and a contextual item only when the corpus can build a valid frame for
it.

Every ceiling is 30. That was already true before this cycle at 645 items and it
is a weaker statement than it sounds: a bank can reach level 30 with two items
there. What changed is density, and density is what the adaptive walk spends.

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

**A note on how this number has moved, because it has moved in both
directions.** Two cycles ago the nine complete non-English locales had 1,374
askable items and a ceiling of 26; then 1,572 and a ceiling of 23; now 1,541 and
a ceiling of 30. None of those movements is a regression or an improvement on
its own — the bank is rebuilt from the corpus every time the corpus changes, and
which words are available at which level moves the tiers under it. The number
that matters to a learner is the one on their result screen, and it is stated
wherever it is below the full scale. Today it is not below the full scale for
anybody.

## 10.4 Item quality — **and the gate that passed on a quarter of the bank**

`leveltest:ambiguity` checks thirteen rules and six photographed regressions over
all 4,166 items and passes — **after** the bank was rebuilt. On the shipped bank
it reported `wrong-conjugation` on 치닫아요, which is I-90: the module had been
corrected two commits earlier and nothing had regenerated the artefact built
from it. **It passed before this cycle too, on a bank in
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
mnemonic. `i18n:check`, `copy:audit` (18,238 strings) and `locale:content:check`
pass, and no language can produce a mixed-language question.

**Word content**: 10 complete at 3,221 words; 22 at **600** words, which is 19%
of the corpus, up from 100 words and 3.4% at the start of this cycle. The row in
the language picker says so before the learner chooses, which is what makes it a
limitation rather than a misrepresentation.

### What the 600 are, and what they are not

600 is not an arbitrary round number: it is band 1, the band
`scripts/content/split_corpus.py` puts on the critical path, so it is the band a
learner in any language meets first and the one the service worker precaches.
Filling it is the difference between a language that can ask a hundred questions
and one that can ask six hundred.

Written this cycle, per language, by hand: 500 meanings, 500 example
translations and 29 long *More about it* paragraphs — 22,638 strings across the
twenty-two. `vocabulary:sense:qa` forced the last of those: a word carrying the
long definition in English must carry it in every language that has written that
word at all, or a learner discovers the asymmetry by switching language.

**They are model-written and no native speaker has read them.** That sentence is
the reason I-19 stays PARTIAL at 19% rather than closing at 600. Coverage is not
review, and this document may not use the second word for the first thing.

### Seventy of them said less than the card they were on

Reading the new packs against each other and against English found fourteen
groups where two or three words in one language had ended up with the same
example translation. Two of those are shared in English too and are right —
걷다 and 공원 both give *I walk in the park*. The other twelve were introduced
this cycle, and each erased the thing its card exists to teach:

| | |
| --- | --- |
| 감사합니다 / 고마워요 / 고마워 | three registers, one sentence under all three, in twenty-one languages |
| 벌써 다 끝났어요 vs 이미 끝났어요 | *all* over against over |
| 나는 한국어를 배워요 | the card teaches the pronoun 나, and nine languages dropped it |
| 잠깐만 vs 조금만 · 잠시 vs 조금 | *just* a moment against a moment |
| 네, 그래요 vs 네, 맞아요 | *that's so* against *that's right* |

One was a plain mistranslation rather than a flattening: Kyrgyz gave 그림을
그려요 and 사진을 찍어요 the same sentence, and сүрөт тартуу is drawing where
photographing is сүрөткө тартуу.

Seventy rows rewritten. The check is three lines, and it is the same shape as
everything else this cycle found: content compared with itself shows nothing,
and content compared with a reference that *does* make the distinction shows all
of it.

**Then the same three lines were pointed at the eight complete packs, which have
shipped for several cycles.** 66 colliding groups. 41 of them said materially
different things:

| | |
| --- | --- |
| ja | 이메일 and 문자 — an email and a text message — had one sentence |
| zh-CN, th, vi | 말리다 and 널다 — drying the washing and hanging it out |
| fr, de, th | 깨지다 and 유리 — a cup breaking and a pane of glass breaking |
| es, fr, de, th | 다니다 and 가다 — attending school and going to it |
| es | 도둑을 잡았어요 and 도둑이 잡혔어요 — an active and its passive |
| pt-BR | 말하다, 말씀하다 and 얘기하다 — three registers, one sentence |
| ja, zh-CN | 받들다 and 섬기다 — serving with reverence and serving |

138 rows rewritten across ja, zh-CN, es, fr, de, pt-BR, th and vi.

**25 groups are left and are deliberate.** They are near-synonym pairs the
target language merges: 멈추다 and 정지 are both *el coche se detuvo*, 종일 and
내내 are both *todo el día*, 오래 and 오랫동안 are both *lange*. Inventing a
distinction the language does not make is worse than sharing a sentence, and the
English pack itself shares 27 sentences for exactly that reason. Which merges
are legitimate is a question for a speaker, which is I-17.

**And it is a gate now.** `vocabulary:translation:check` compares all thirty
non-English packs against the English one and fails on a pair that shares a
sentence English separates, unless `content/vocabulary/shared-translations.json`
names the pair with a reason — the same shape as `unobserved.json`. The
twenty-five accepted merges are written down with why; the gate also reports a
ledger entry that has *stopped* merging, so the file cannot rot into a list of
excuses for things that are no longer true. Negative-tested by putting the
Japanese email-and-text-message collision back: one finding, exit 1.

**And `examples:qa` caught this work.** Two of the new Portuguese sentences
invented a feminine subject for a Korean sentence that names nobody — the same
class as the 125 the previous cycle found and the 43 this one found in the new
vocabulary. Rewritten without the pronoun. A gate that catches the person
repairing the content is a gate worth having.

### The mixed-language invariant, now actually simulated

`locale:content:qa` used to end its explanation with "and that is what the
simulation below checks", and there was no simulation below it — prose asserting
a check that does not run, which is the same defect as §7.2 one layer down. It
runs now: 12,800 four-option questions drawn from all 3,221 taught words, asked
of every one of the 32 interface languages through the rule `strictMeaning`
applies — the learner's own pack, or nothing.

```
questions simulated: 12,800 across 32 languages —
  5,694 askable, 7,106 refused for want of a meaning
```

7,106 refusals is not a defect; it is the product decision working. A word with
no meaning in the learner's language is not asked about rather than asked in
English. The simulation also asserts the routing, which is where I-44 actually
lived: point `contentLocale` at English for a language the corpus has, and it
fails naming the language.

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

`locale:editorial` reports **0 errors and 38 warnings** for a person to read,
re-run this cycle; the Korean ones were read and are correct — a unit title and
a sound-rule name that share an English word but not a context, two deliberately
distinguished question forms, and a Home button shorter than the dialog button
beside it. `qa:locales` renders 32 languages × 8 screens = 256 screens with no
measurable problem. Neither of those is a reading.

Two strings were changed this cycle for a mechanical reason rather than an
editorial one, and they are worth naming because they show what an unread
language costs. The Kyrgyz category *Адамдар жана үй-бүлө* is the hint shown for
가족, whose Kyrgyz meaning is үй-бүлө; the Uzbek *O'qish va ish* is the hint for
공부, meaning o'qish. Both handed the learner the answer. `hints:qa` found them
in 581,542 rungs; a speaker would have found them in a minute.

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

## 12.1 Re-audited this cycle — **VERIFIED**

All four of the above hold. `name:check` reads every locale bundle and fails on
a brand spelling `product.ts` does not define for that locale; it passes.

The Korean added this cycle is the 273 new entries and the strings that carry
them. What reading them and running the gates over them found:

* **43 translations invented a gender the Korean does not have**, in German and
  French. Refused by `examples:qa`, rewritten. This is the same class as the 125
  the previous cycle found, which is the argument for a gate rather than a
  reviewer's memory.
* **치닫다 was being conjugated wrongly by the module, not the pack.** The pack
  said 치달았어요 and the module said 치닫아요; 치닫다 is a ㄷ-irregular and the
  pack was right. `packages/korean-morphology` now knows.
* **Four malformed honorifics could have shipped.** 있세요, 만들세요, 듣으세요
  and 먹시어요 all passed `conjugation:qa` when injected. None of them is in the
  corpus; the point is that the gate would not have said so. §19.4.
* **Two morpheme boundaries needed a person.** 빚어지다 and 잦아들다 each put a
  받침 outside the seven in front of a vowel, where 표준발음법 §15 gives two
  different sounds depending on whether the vowel begins an ending or a word.
  Both are endings. §14.

None of that is a claim about naturalness. §11.3 and
`docs/LEVEL_TEST_KOREAN_REVIEW.md` say what is and is not known, in the same
words they said it in before.

---

# 13. Persistence

## 13.1 What is stored, and where — **VERIFIED**

Everything is device-local: IndexedDB in the browser, native SQLite in the
Android build — confirmed on device, not inferred. There is no account and no
server copy. Progress rows are keyed by `progressKey(kind, itemKey)`, and for a
word that key is the word's id.

The ledger that keeps those ids stable was negative-tested again this cycle:
renaming 가다 in `content/vocabulary/word-ids.json` made every generated file
report itself out of date and dropped the twenty-two copy packs from 600 written
words to 599, because a pack is keyed by id and an id that moves takes its row
with it. That is the harm, made visible in one command.

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

**13,006 distinct files over 13,110 voice slots, 63.1 MB**, two Korean neural
voices at 0.82× rate, recounted from `public/audio/manifest.json` this cycle.
`audio:qa` decodes a 600-clip sample and checks the rest for existence, manifest
agreement and duplication: 0 errors, 0 warnings, durations 240 ms to 2,880 ms,
median 1,030 ms.

Every one of the 3,221 taught words has a headword clip and an example clip in
both voices — 3,221 of each in the manifest, which is the check that the 273
words added this cycle were not left silent. The distinct-file count is lower
than the slot count because two texts that are identical strings share a
recording rather than being synthesised twice.

**Two new verbs needed a decision the rules cannot make, and then two more.**
쫓아오다 and 찢어지다 each put a 받침 outside the seven in front of a vowel, and
whether that vowel begins an ending or a new word changes the sound. Both are
endings — the connective -아 and the passive -어지다, exactly like 쫓아가다 and
흩어지다 already reviewed — so they liaise: 쪼차오다 and 찌저지다.

This cycle brought 빚어지다 and 잦아들다, the same question a third and fourth
time. 빚- plus the passive -어지다 is the shape of 찢어지다; 잦- plus the
connective -아 is the shape of 쫓아가다. Both liaise: 비저지다 and 자자들다.
`audio:pronunciation:check` fails on an unreviewed one rather than guessing, and
the reviewed set records that somebody read the word — not that the check was
switched off for it.

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

Every enforced budget is met at 3,221 words, and one of them was raised this
cycle to get there:

```
first load                       236.5 kB /  460.0 kB   51%
corpus, first paint               52.9 kB /   64.0 kB   83%
corpus, whole                    287.0 kB /  900.0 kB   32%
largest route chunk               12.2 kB /   24.0 kB   51%
everything precached            1454.1 kB / 1500.0 kB   97%
```

First paint fetches the shared tables plus band 1 — a fixed 600 words — so it
costs the same at ten thousand headwords as at three thousand. That flat line is
the architecture working, and it did not move this cycle even though band 1 now
carries twenty-two more languages: first paint fetches the learner's band-1 pack
and nobody else's.

**The precache budget was raised from 1,400 kB to 1,500 kB, and it is worth
saying what bought the 54 kB.** Band 1 is the band the worker precaches *for
every language*, so taking the twenty-two partial languages from 100 words to
600 put 500 words × 22 languages of meanings, example translations and long
definitions into this one row. The JavaScript half did not move — 367 kB before
and after — against 1,087 kB of corpus.

Raised rather than trimmed. Trimming means not precaching twenty-two languages a
learner might actually be using, to save 54 kB, and working offline is the
product. The budget's own note has said since the last raise that the corpus
half is meant to grow and that this row is where it should show up.

**The finding is still the line beneath it.** `corpus, whole at 10,000` is a
forecast for **one language** and lands at 891 kB against 900 kB, which reads
comfortable. The service worker precaches `public/corpus` entire:

```
everything precached at 10,000  3740.9 kB / 1500.0 kB  249%
```

Two and a half times the budget, and not a number a better gzip closes. It is a
finding about the delivery strategy rather than about the budget: precaching
every language is affordable at 3,221 headwords and is not affordable at 10,000,
and the answer then is to precache the learner's own language and fetch the rest
in bands. Reported and not enforced, because what ships today fits.

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
| Web unit (`vitest`) | **789** (50 files) |
| Handwriting core (`vitest`) | **96** (5 files) |
| Korean morphology (`vitest`) | **180** (2 files) |
| End-to-end (`playwright`) | **346** (173 × 2 projects) |

Counted from this cycle's runs. The morphology suite reads 180 where the
previous edition said 146; the difference is the irregular-class fixtures added
when 치닫다 and the 르-compounds were corrected, and it is another row that would
have been carried forward unchecked.

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

`verify:release` is 36 steps, and one of them is `vocabulary:qa:target`:

```
1 error(s):
  3,221 headwords — 6,779 short of the 10,000 target
```

That gate exists to fail. It is the corpus target held open in the release
chain so the shortfall cannot be forgotten, and it cannot pass until the corpus
reaches 10,000 — which is the honest state of the product and the subject of
§8.3.

The other 35 steps were run individually against this tree and all pass:
`verify:quick` (31 checks, two more than last cycle — the letter-face gate and
the two-words-one-sentence gate), the store listing, the curriculum export, the fonts,
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
the bytes delivered are the bytes committed. Run at the start of this cycle it
correctly reported the delivered package behind by every content and geometry
change described in §7.2 and §8; §18 records the rebuild that closed it.

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

### This cycle: six gates broken on purpose, and two of them did not notice

The brief for this pass asked for six named gates to be negative-tested. Four
reported what they should. **Two passed the broken input**, and those two are
findings rather than reassurance. A seventh gate did not exist yet and was
written this cycle; it is in the table because a gate written today is worth
nothing until it has caught the thing it was written for.

| gate | what was broken | what it said |
| --- | --- | --- |
| `letters:face` | pulled one upright 4% out of place; shortened one crossbar | both reported, naming the letter and the band |
| `vocabulary:translation` | put the Japanese email-and-text-message collision back | `ja 문자·이메일 — both: メールを送りました。 / en: I sent an email. / en: I sent a text message.` |
| `leveltest:ambiguity` | a cloze given the answer inside its own sentence and a duplicated option | four rules fired at once: `duplicate-option`, `self-answering`, `wrong-conjugation`, `photographed-regression` |
| the id ledger | renamed 가다 in `word-ids.json` | `content:vocabulary --check` reported every generated file out of date, and the copy packs dropped to 599 of 3,221 — which is the harm, visible |
| `vocabulary:sense:qa` | glossed 먹다 as *food* and 가족 as *to gather as a family* | *먹다 is a verb glossed as "food", which is not an action*; *가족 is a noun glossed as an infinitive* |
| `conjugation:qa` | 있세요, 만들세요, 듣으세요, 먹시어요 | **nothing. Green.** |
| `locale:content:qa` | pointed `contentLocale` at English for Thai | **nothing, because the simulation its own comment promised did not exist** |

The last two were fixed and re-tested, and both now report all four inputs.

`conjugation:qa`'s blindness is worth stating precisely, because it is the same
shape as §7.2. Every escape in it accepts a recorded surface form that merely
*starts* with the stem, and that is right for endings — an example may continue
past any form the module generates, 먹어서, 먹었는데. It is wrong for the
honorific, whose whole difficulty is in the joint between stem and ending: 있다
takes 계세요, a consonant stem takes 으세요, an ㄹ stem drops the ㄹ. A form
wearing the honorific is now held to the honorific, with one exception that is
itself evidence: 따라오세요 passes, because it starts with 따르다's *infinitive*
and the 세요 belongs to the 오다 that follows. A malformed joint never survives
its own infinitive.

`locale:content:qa` is the plainer case. A paragraph ended "and that is what the
simulation below checks" and nothing was below it. The sentence was written when
a simulation was planned and survived when it was not. It runs now — §11.1 has
the output — and a byte-comparison against the English string was tried inside
it and removed, because it flags 두부 *tofu*, 김치 *kimchi* and 택시 *taxi* in
every Latin pack: a loanword is the same word in both languages, and the
collision is the evidence working.

## 19.5 A gate that was sampling by position

`hint-usefulness-qa` checked every fourth word **by index**, so which quarter of
the corpus it examined depended on how many words existed. Adding 113 words
shifted the sample onto 돈 and surfaced a leak that had always been there. It now
checks all 3,221 words — **581,542 rungs across 32 languages**.

It earned its keep again this cycle. The core-band expansion introduced two new
leaks, both of the same shape: a category label that contains the answer it is
hinting at. Kyrgyz *Адамдар жана үй-бүлө* is the hint for 가족, whose Kyrgyz
meaning is үй-бүлө; Uzbek *O'qish va ish* is the hint for 공부, meaning o'qish.
The labels were renamed rather than the glosses — the gloss is the word being
taught — and the run is back to 0 leaking and 0 useless rungs.

## 19.5a A one-second bet that the corpus grew past

Testing-library's `waitFor` defaults to one second. Nothing in the unit suite
measures speed — `perf:dictionary` does that, against a budget, on purpose — so
every `waitFor` in it is waiting for a driver to load or for React to flush an
effect, and one second is a bet about how fast the machine is.

The bet started losing. `open()` in `vocabularyProgress.test.tsx` waits for the
day's plan to be built over the whole corpus; at 2,581 words that finished
inside a second under load and at 3,221 it did not. A full `verify:release`,
with fifty test files and a production build and a Playwright suite competing
for the same cores, reported `expected 0 to be greater than 0` for a plan that
was simply still being built — and it passed on its own every time.

**That is the third distinct place in this repository where a fixed delay became
a false failure as the content grew**, after two end-to-end walks. Fixed once
rather than three more times: `configure({ asyncUtilTimeout: 5_000 })` in the
shared setup, with the reasoning written there. A genuine hang still fails, five
seconds later, with the same message.

## 19.5d A spec that left the page while its own save was in flight

`a word can be saved, found again, and reviewed from its own list` clicked Save
and then navigated to the saved-words screen. The write to IndexedDB is
asynchronous; on a loaded machine the navigation won, and the screen rendered
*No saved words yet* about a word that had been saved a few milliseconds
earlier. That reads exactly like a data-loss defect and is not one.

**The first fix was wrong in a way worth keeping.** It waited for the button to
read *Saved*, and failed with `element(s) not found`. The button's accessible
name goes from "Save 하나" to "Remove 하나 from saved", so a locator written
around the word *Save* stops matching at the exact moment the thing it is
waiting for happens. It now waits on `aria-pressed` going false → true, which is
the same fact without the wording.

Fourth timing assumption found this cycle. Each was a clock or a rendering
standing in for evidence that something had happened, and each grew into a
failure as the product got bigger rather than as it got worse.

## 19.5c A spec that pinned a word the syllabus then taught

`dictionary.spec.ts` exists to prove that search reaches the 30,282-word
dictionary and not only the taught corpus, so it needs a headword the dictionary
has and the syllabus does not. That constant has now broken twice.

나가다 was the first choice and turned out to be *taught*, so the dedupe
correctly hid it from the results and the test failed for the one reason that
meant the feature was working. 가지 replaced it, survived three cycles, and this
cycle's vocabulary batch taught it — so the click landed on the word card and
the dictionary entry never opened.

**There is no safely untaught headword in a product whose plan is to grow the
syllabus toward ten thousand words.** The spec now reads the shipped dictionary
index and the shipped corpus and picks the most frequent Hangul headword that is
in the first and not in the second and carries at least three senses. Frequency
so the choice is a real word; three senses so the disclosure has something to
disclose. The assertion that the disclosure opened reads the last sense's gloss
out of the same entry rather than naming 가지's aubergine.

Deterministic, because the inputs are files: the same tree picks the same word
every time, and a tree that teaches that word picks the next one instead of
failing.

## 19.5b A test that measured the corpus instead of the code

`runs short and says so` asserted that ten days of level-1 recommendations
cannot be filled, and it was true: level 1's reachable pool held 93 words. The
core-band work took the pool to 102, the ten days filled, and a test whose whole
subject is *what happens when the pool empties* failed for the one reason that
is not a defect.

A test a content change can invert is measuring the content. The demand is now
set past whatever the pool holds — thirty days against the thin end of the scale
— and the assertion is the invariant it always meant: the gap between what was
asked for and what arrived is reported as a deficit, and every word still comes
from inside the teaching zone rather than from further down it. That is the
behaviour the old planner got wrong, and it is now asserted in a form the corpus
cannot take away.

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

**This section is cumulative and its subsections are dated by brief.** §20.1 to
§20.3 record the three passes that produced the previous edition of this report,
at 2,916 and then 2,948 words; §20.4 records the pass this edition describes, at
3,221. Their figures are as-of their own pass and were deliberately not edited
into agreement with today's — a record of what was found is not improved by
being rewritten in a later cycle's numbers.

The subsections below §20.4 therefore say 2,948 in places, and mean it.

## 20.0 The three earlier briefs, in the order they would matter to a customer

Eleven defects. The eleventh is last because it is in a test rather than in the
product, and it is here at all because the audit's own final run is what found
it.

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
| Korean teaching examples read, one at a time | **2,948** |
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
looked for. Only 551 of the 2,948 words survive the rules — a good teaching
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

## 20.2 The final quality pass

A third brief, and the last one. It named three P0 defects against the running
product and carried forward a longer list about terminology, iconography and
whether the learner's level means anything. Each is below with what it cost.

### The ㅊ that was missing its tick — **fixed**

A malformed letter is an educational defect, not a cosmetic one, so this was
measured before it was touched. The authored geometry was right: measured
against Pretendard at 300px, the tick above ㅊ's lid is an upright of the length
`data/strokes.ts` draws. What was wrong was the *marker*. `layoutMarkers` places
the numbered stroke-order discs by searching for a free position near each
stroke's start, and it never consulted any other stroke's ink — even though
`distanceToStroke` is defined in the same file. On ㅊ the disc for stroke 2 sat
squarely on stroke 1, and stroke 1 is the two-unit tick that is the whole
difference between ㅊ and ㅈ.

Fixed by giving the candidate search a clearance term against every stroke it is
not labelling. Two fixtures in `strokeMarkers.test.ts`, both negative-tested:
one asserts no disc sits on a stroke it does not label, over every taught
character; the other names ㅊ and its tick.

One thing this found is worth recording as a near miss. Shortening the tick from
8 to 13 units *looked* better in isolation and `glyphshape:qa` scored ㅊ at 92%,
its worst of 73 characters. The lid is a stroked centreline nine units wide, so
a tick ending at the lid's centre already shows only to the lid's top edge; 8 to
30 shows 23%, which is the face's own proportion. Reverted, with the arithmetic
written into the comment so the next person does not repeat it.

### 거의, and the sentences that reached a card — **fixed, as a class**

The reported sentence was 손님은 거의가 오셨습니다, under the card for 거의. The
sentence is not the defect and is not banned: it is the canonical illustration
of a *nominal* 거의 that Wiktionary labels "used exclusively with the particles
-가 and -를", and on the dictionary page it now sits under that label doing
exactly its job.

The defect is that it reached a card teaching the **adverb**. `WordDetailPage`
matched senses by comparing short glosses and nothing on that path looked at the
part of speech, so a nominal sense's case-marked citations were printed under an
adverb. Measured across the whole corpus: 250 sentences reach a taught card over
214 words, 9 of them from a sense of another part of speech, and one class of
those nine is wrong. `compatiblePartOfSpeech` refuses a nominal sense under a
non-nominal word and nothing else; it drops the two 거의 sentences and keeps 248.

Then all 248 were read, which found things no rule states:

- Six were citations rather than sentences — 우편을 외국으로 보내다, glossed *To
  send mail to a foreign country*. A plain `-다` ending is ordinary written
  Korean, so the Korean cannot tell them apart; the English infinitive can, and
  `INFINITIVE_GLOSS` drops exactly those six.
- One carried the opening words of a footnote — *The student came out of
  school.Example from* — because the parser stripped the `<ref>` tag and left
  its contents. References are removed whole now.
- Thirty-five are grammatical Korean that a Korean reader stops at: 예약할께요
  for 예약할게요, 뚫려진 for 뚫린, 이 이메뉴 for 이 메뉴, 제삼극 for nothing at
  all, a proverb standing in for usage, 드디어 남북통일이 되었다 stated as fact,
  and 딸이 미혼모가 된다니 체면이 서지 않게 되었다. No rule can catch those, so
  they are in `content/vocabulary/example-blocklist.json` with the reason for
  each written out, dropped at build time so the card and the dictionary page
  agree. `dictionary-qa` fails if one comes back.

The 2,948 hand-written teaching examples were scanned mechanically for the same
defects — zero hits — and 300 of them were read across the three level bands.
That found one: 밤새다's example was 밤새워 공부했어요, which is a form of
밤새우다. A learner conjugating the card's headword produces 밤새서. Corrected,
with a new recording.

### The dictionary on a phone and on a desktop — **tested, no difference found**

Recorded honestly in I-76. No viewport-dependent content branching exists: the
three `matchMedia`/`innerWidth` call sites in the repository are the colour
scheme, reduced motion and native inset padding. `e2e/dictionary-viewport.spec.ts`
now opens the same entry at 360, 390, 412, 430 and 1440 and compares a logical
fingerprint — headword, every readable string in order, and whether the "4 other
meanings" disclosure is open, because that is the one control on the page that
can really hide content. Identical at all five widths. What does change is the
layout, which is what a reader comparing two screens sees.

### 낱자 and 낱말 — **gone from customer copy, and rewritten rather than swapped**

41 interface strings and 26 content notes. The substitution the brief asks for
could not be run blindly, because 글자 already meant the *composed block* here:
unit 1 reads 낱자는 네모난 블록으로 묶이고, 블록 하나가 한 글자예요, and swapping
낱자 for 글자 makes that say a letter is grouped into a letter. The block is
called 음절 now, 글자 means one letter and only that, and the fifteen sentences
that named both were rewritten. 낱말 became 단어 everywhere except 위키낱말사전,
which is the name of Korean Wiktionary.

Two gates hold it. `audit-copy.mjs` fails on either term in any language.
`locale-editorial-qa.mjs` already refused two names for one thing; its canonical
terms were updated and it now runs in both directions — and it immediately
caught a string this pass had left inconsistent, the brand description still
calling a syllable block a 글자.

### Letters and Words — **redrawn as Hangul**

They were a sheet of paper with a folded corner and an open book: the icon every
application uses for a document and the icon every application uses for reading,
on the two tabs this product is entirely about. They are now the letter ㄱ and
the syllable 가 — one letter, and two letters joined, which is the difference
between the two courses stated in the alphabet the learner is here to read.

Proportions were set by rendering Pretendard beside each candidate at the same
size rather than by eye. A first version marked the start of ㄱ with a filled
disc the way the stroke-order animations do; at 20px in the tab bar it read as a
blob on the corner and was the only filled shape in a stroked set, so it is gone.
Home and the bottom navigation import the same two components and cannot drift.

### The level a learner is shown — **rebuilt, and it now changes what they get**

The old level was a frequency rank bucketed against a 10,635-word scale on a
corpus of under three thousand words, so every taught word fell in the bottom
half and levels 15–29 were empty. Simulated before anything was changed: a
learner at 15 and a learner at 20 received an *identical* list, so did 25 and
30, and a learner at 30 saw 82 distinct words in a thousand recommendations.
Every gate was green throughout.

The replacement is in `docs/VOCABULARY_LEVEL_CALIBRATION.md`: four weighted
components over 23 named signals, fixed absolute score boundaries rather than
quantiles, 162 anchors and 6 written overrides. What it is worth, from
`docs/VOCABULARY_LEVEL_RECOMMENDATION_QA.md` and 30,000 simulated events:

| | before | after |
| --- | --- | --- |
| Levels holding any word | 15 of 30 | 30 of 30 |
| Distinct words for a learner at 30, 100 days | 82 | 221 |
| Learner 15 and learner 20 lists | identical | disjoint at the median |
| Words outside the learner's teaching zone | not measured | 0 |
| Anchors held | — | 162 of 162 |

Two findings from inside that work are worth their own lines.

**Frequency could not see 감사합니다.** The corpus reader folds tokens by
stripping an ending, and 감사합니다 is 감사하 plus ㅂ니다 with the ㅂ *inside* 합
— the strip can never match. Nor can 감사해요, where nothing removable sits on
the end. 감사하다 was level 11. It is 4. 미안하다 9→4, 죄송하다 12→7, 마시다 6→4.
I-73.

**A fixture caught the report being wrong about its own product.** The
recommendation gate simulates a learner who never retains anything, so its pools
never run dry. The deterministic fixture in `vocabularyLevel.test.ts` simulates
one who does, and a learner at level 1 exhausts the 93 words at levels 1–2 in
ten days. What happens then is not what this report first said: the planner
looks one level outside the *zone* and then stops, returning the gap as a
deficit rather than reaching down the scale. Both the fixture and the document
now say that.

### The corpus

32 words added, all authored by hand and all passing `examples:qa` and
`preflight_batch` before being counted: the missing weekdays (a course that
taught five of seven), everyday food, the shops and stops a beginner needs, and
four adjectives. Thai and Vietnamese are declared complete packs, so 64 more
meanings and example translations were written to keep them complete —
`vocabulary:qa` fails otherwise, and it did.

## 20.3 The final audit

A fourth brief, and the one that read the running product screen by screen.

### The sound-change lesson was teaching five of its six rules — **fixed**

Reported as "the page has lost its content". The page renders in this build,
and always did; what it had lost was one of its six sections, and it had never
had it. 받침이 넘어가요 — liaison, the change that makes 한국어 sound like
한구거 — had a heading, an explanation in all 32 languages, and no card.

The cause is one line of classification. `pattern_of` used `liaison` as its
*catch-all*: the answer for a word that sounds different from its spelling and
matched none of the five named rules. What actually lands in that bucket is
받침 neutralisation — 옷 is [옫], 꽃 is [꼳] — and nothing slides anywhere in
either. `note_for` then excluded liaison from word cards, which is right, and
the build read the *lesson's* data from `note_for` too, which is what emptied
the card.

Liaison is a rule now rather than a default, neutralisation returns no pattern,
and the lesson and the word card read from two functions instead of one.
147 words carry it. The six leads are 있다 → 읻따, 좋다 → 조타, 끝나다 → 끈나다,
연락 → 열락, 같이 → 가치, 음악 → 으막; those and the twelve further examples
were checked against 표준발음법 one at a time. `e2e/sound-changes.spec.ts`
asserts a card per pattern *and three example pairs per card*, because
palatalisation has three words in the whole corpus and would disappear
silently. Negative-tested. I-77.

### A learner measured at 30 was taught 남자 — **fixed**

The worst defect in this report, because it makes the measurement worthless.
Not the level model: the search window for a learner at 30 is levels 27–30 and
남자 cannot come out of it. The plan *cache*. A day's plan was identified by its
date and its goal, so the plan written when the app first opened — at the
default level, before the test — was still "current" afterwards. Every new
learner meets this, because sitting the test is something you do minutes after
opening the app for the first time.

A plan now records the level it was built for. A goal change still waits until
tomorrow, because a goal is a preference; a level change takes effect at once,
because a level is a measurement. Four fixtures against the real corpus,
negative-tested. I-78.

Then read rather than counted, 30 days at seven levels:

| Learner | Day one |
| --- | --- |
| 1 | 차 · 당신 · 가다 · 엄마 · 오늘 · 사진 · 아니 · 왜 · 너 · 우리 |
| 10 | 아저씨 · 화가 · 운동 · 똑같다 · 번호 · 알려주다 · 옛날 · 짐승 · 계시다 · 교실 |
| 20 | 달려가다 · 장기 · 물리다 · 반응 · 깨끗이 · 비치다 · 수백 · 벗기다 · 건너 · 장군 |
| 30 | 기울다 · 물리치다 · 웅크리다 · 일석이조 · 부정하다 · 휩쓸다 · 사로잡다 · 새옹지마 · 죄다 · 불쾌하다 |

Zero words below level 28 in 300 recommendations at level 30. What that
measurement also found is I-79, which is open: levels 28–30 hold 221 words, so
an advanced learner exhausts the zone in about a fortnight. That is the corpus,
not the model, and it is stated rather than worked around.

### Every taught example read, one at a time

All 2,948, in level order, not sampled. Twenty-one were corrected, in four
classes, and the classes are more useful than the count:

- **The card taught a different word from its example.** 부모's sentence used
  부모님 and 실제's used 실제로 — both of which are separate cards.
- **The English gloss named a sense the Korean did not show.** 풀다 glossed
  *to untie* over 문제를 풀었어요; 마르다 *to dry* over 목이 말라요; 공식 *a
  formula* over 공식 발표; 밝히다 *to light up* over 사실을 밝혔어요; 전자 *an
  electron* over 전자 제품. On three of those every other language already said
  both senses and only the English was narrow.
- **Grammatical Korean nobody says.** 빵 그리고 우유를 샀어요 — 그리고 does not
  join two nouns. 의자가 둘 있어요, 사과가 셋 있어요, 의자가 넷이에요 — the bare
  numeral is used of people, not furniture. 그분은 학교 선생이에요 — 그분 is
  honorific and 선생 without 님 is not. 수고가 많으셨어요 — the set phrase has no
  particle.
- **Ambiguous or stilted.** 외상은 없어요 reads as *no credit here* as readily as
  *no injuries*; 자료 제시를 부탁해요 is a noun phrase where Korean uses a verb.

Each rewrite carried its seven locale translations, its Thai and Vietnamese
rows, and a new recording in both voices. `examples:qa` caught one of my own
translations on the way through — a French *il* the invented-person rule reads
as a man — which is the gate doing exactly what it is for.

### The Korean interface, read end to end

556 strings. Three were wrong and all three came from this pass's own
terminology rewrite or sat next to it: one lesson point still called the square
a 블록 where everything else now says 칸 and 음절; another said 초보자의 읽기가
막혀요, which is not something said about a person; and the palatalisation
heading used straight quotes around 이 where its own explanation uses curly
ones. The rest reads as Korean written by somebody who speaks it.

### The ㄱ in the writing screen — **checked, and correct**

Reported as malformed. It is not, and the check is worth recording because the
first two ways of looking at it both said it was.

Drawing the stroke data as plain polylines makes 가's ㄱ look like a 45° slash,
because the leg is a curve and its control points are not in the polyline. And
measuring Pretendard's *standalone* ㄱ gives a leg travel of 0.000 — perfectly
vertical — against the authored 0.885, which looks like a catastrophe until you
notice the app uses a different form standalone, exactly as the face does.

Measured properly — the app's own render and the face's, off one canvas with
one ruler — the leg travels 0.704 of the letter's width in 가 where Pretendard
travels 0.662, 0.642 against 0.617 in 기, 0.670 against 0.650 in 거. Four to six
per cent, on a curve fitted to the face on purpose. The upright form in 고, 구,
그, 국, 글 and 공 matches at 0.000 on both sides. `glyphshape:qa` scores ㄱ and
every block containing it at 100% in both directions, and the overlay sheet
shows guide and demonstration on top of each other.

Nothing was changed. A shape that a numerical check calls right and a person
calls wrong should be fixed for the person — but a shape two bad measurements
call wrong and a good one calls right should be left alone.

### ㅙ and ㅞ were two bars each — **fixed**

The compound vowels were reported as malformed, and two of the seven were.

ㅙ is ㅗ plus ㅐ. Its two uprights sat 31 of the ink box apart where Pretendard
puts them 24 — nearly a third too wide — so the ㅏ's branch reached out of the
first upright and stopped in open paper, and the second upright read as a bar
standing on its own rather than as the other half of a ㅐ. ㅞ had the mirror of
it: uprights at 76 and 95 against the face's 71 and 93, squeezed against the
right edge with the ㅔ's connector a stub between two bars.

**`glyphshape:qa` scored both at 100% in both directions the whole time**, and
that is the most useful thing in this section. It compares the tracing guide
with the stroke demonstration, and for the six compound vowels the face slants
*both come from the same authored centrelines* — so it was comparing the
product to itself and reporting agreement. Two representations agreeing says
nothing about either being Korean.

Measured against the face instead — the app's render and Pretendard's, off one
canvas with one ruler — the gaps are now 24 and 23 against 24 and 22. The
guide fixtures for all six practice typefaces were regenerated, and
`strokes:visual` still passes, which is the check the ㅞ connector's low
position exists for.

The other four were measured at the same time and left alone. Where they differ
from the face it is the slant Pretendard puts on ㅗ and ㅜ so the halves do not
collide at text sizes — an optical adjustment belonging to the typeface, which
a guide a learner traces should not teach.

### Search stopped splitting its answer in two — **fixed**

Typing a word gave taught results, a *Dictionary* heading, the line "Reference
only. These words are not part of your daily practice", and then more results.
Somebody who has typed a word into a search box wants to know whether the word
is there.

One list now, taught words first, with the count over the whole of it. The
distinction is not gone — it is made where a learner acts on it, on the entry
they open, which still opens with that line.

The empty state went with it. It had three branches where the hook has four
states, and the missing one was `unavailable`: a learner whose dictionary index
had failed to download — offline in a train, which is the case that state
exists for — was told "Nothing matches" about a word the dictionary certainly
has. Four branches now, one per state, and the search screen reads: *13
matches*, then the words; or *Nothing matches "…"*, and nothing else.

### The thing this pass did not fix

Nothing above proves the Korean is *natural*. Every gate in
`npm run korean:education:qa` says so in its own output, and
`docs/LEVEL_TEST_KOREAN_REVIEW.md` records, dimension by dimension, who read
what. Re-counted from the file this cycle: **ten rows read by a program, two by
a program and an assistant together, three by an assistant, and two by
nobody.** The two are naturalness, which has always been there, and a new one —
the 22,638 word meanings and example translations written this cycle in
twenty-two languages, whose script and completeness a gate checks and whose
prose nobody has read. Both are closed by a native speaker and by nothing else.

## 20.4 This pass, in the order the findings arrived

The brief opened with a photograph and an instruction not to trust the previous
report. Both were justified.

**1. The compound vowels were not fixed.** §7.2 in full. Three defects, one of
them mis-proportioning all forty jamo, certified by a gate comparing the app
with itself. Re-authored against Pretendard; `letters:face` is the gate that can
now say so.

**2. Two more gates passed a broken input.** §19.4. `conjugation:qa` accepted
four malformed honorifics; `locale:content:qa` promised a simulation that did not
exist. The class is the same as (1) and it is the reason this pass looked for it
in three places rather than one.

**3. The corpus went to 3,221, weighted to the top.** 162 of the 273 new words
land at levels 28–30, which is where I-79 said the shortage was. 30,000
simulated recommendation events, 0 short days, and the top of the scale goes
from 22 days of new vocabulary to 38.

**4. Twenty-two languages went from 100 words to 600.** §11.1. 22,638
hand-written strings, and their Level Test reach goes from 645 items to 1,021.
Still model-written, still unread by a speaker, still PARTIAL.

**5. Reading the 273 new entries found 33 refusals**, 43 of them a German or
French translation inventing a gender the Korean does not have — the same class
as the previous cycle's 125, arriving again in fresh content. §9.2.

**6. Seven gates found seven more things.** A level-test bank older than the rule
that built it (I-90); two category labels naming the answer they hinted at
(I-89); nineteen new words the frequency corpora never saw, each now explained
against the corpora rather than assumed (§8.5); a unit test asserting a shortage
instead of the behaviour under one (I-91); an offline precache 4% over budget,
raised with the arithmetic written beside it (I-92); a one-second test timeout
the corpus grew past (I-93); and an end-to-end spec pinned to a word the
syllabus then taught, for the second time in three cycles (I-94).

**What none of it did.** No native speaker read anything. The corpus is 32% of
its stated target. The hand-off has no destination and none was invented. Those
three are the same three as last cycle, and saying so is the point of a section
that lists what a pass found rather than what it achieved.

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
| **I-04** | Vocabulary | **P1** | 3,221 of a stated 10,000 words | Buyers compare corpus size | **OPEN** |
| **I-12** | Persistence | **P2** | No export: clearing site data destroys the history irrecoverably | A learner who clears browser data loses everything | **OPEN** |
| **I-13** | Relations | **P2** | 252 of 3,221 words carry any verified lexical relation | Synonym and antonym sections rarely appear | **OPEN** |
| **I-17** | i18n copy | **P2** | No locale has been reviewed by a native speaker, across 32 interfaces | Unknown awkwardness in thirty-one languages, and in Korean | **OPEN** |
| **I-79** | Vocabulary data | **P2** | A learner at the top of the scale runs out of new words in about five weeks | Levels 28–30 hold 383 words between them, up from 221. A learner placed at 30 is taught ten a day from that zone and has met all of them in about five and a half weeks, after which their days come up short. They are not being taught badly — the words they get are right — there are simply not enough of them yet. | **OPEN** |
| **I-03** | Product | **P1** | The Hangyul hand-off is built but has no destination | A learner who finishes the alphabet finishes the product and stops. The card and the My Learning row render nothing rather than leading nowhere. | **BLOCKED** — The value is not in this repository and must not be guessed. |
| **I-19** | Vocabulary | **P1** | Word meanings are complete in ten languages and six hundred words deep in twenty-two | A learner in one of the twenty-two has a fully translated interface and word meanings for the 600-word core band — the band the corpus splitter puts on the critical path, so it is the band they meet first. Past that the card shows the English gloss, marked as English, and the *quiz* shows nothing: the product forbids a mixed-language question, so a word with no meaning in the learner's language is not asked about rather than asked in English. | **PARTIAL** |
| **I-39** | i18n copy | **P2** | The rendered interface has had a mechanical editorial pass, not a native reading, in 31 of 32 languages | Better than it was and still unmeasured where it matters. Seventy-eight real defects were found and fixed — five German screens addressed the learner as *Sie* in a product that says *du* everywhere else, and Italian, French, Turkish, Dutch and Filipino wrote the ASCII apostrophe on pages whose other sentences use the typographic one. Whether the *prose* reads naturally in Tamil or Kazakh is still not known. | **PARTIAL** |
| **I-20** | Vocabulary | **P3** | The hand-written *More about it* block is on 71 words of 3,221 | Word Detail is no longer a short page followed by nothing, but the paragraph written by a person for the words where one line genuinely is not enough is on 71 of them — 2% of the corpus. | **PARTIAL** |
| **I-01** | Release | **P0** | The shipped APK/AAB predate the current product code by one commit | Anyone installing the delivered binary today gets the previous stroke geometry and the retired video splash. The eight syllables re-measured in `e026697` — 구 오 밤 밥 옷 국 꽃 글 — render from the older table, and the launch screen is the MP4 clip the product has stopped shipping. | **RESOLVED** |
| **I-02** | Repo | **P0** | A whole cycle's work was uncommitted when the artefacts were built | A fresh checkout does not contain what was shipped | **RESOLVED** |
| **I-23** | Strokes | **P0** | The stroke demonstration showed ownership wedges at junctions and a polygonal ㅇ | ㅂ's uprights grew triangular spurs into crossbars that had not been written yet; ㅅ's first stroke grew a chunk of the second one's shoulder; ㅈ chipped into its own fork; ㅇ read as a lumpy ring rather than a circle. A learner watching stroke one of ㅂ could see a piece of stroke three already on the paper. | **RESOLVED** — supersedes I-14 |
| **I-05** | Performance | **P1** | The taught corpus at 10,000 words no longer has to fit in the bundle | The delivery architecture can carry the stated plan. The first load halved to 219 kB and the part of it that is corpus — 45.7 kB — does not grow with the corpus at all. | **RESOLVED** |
| **I-06** | Word Detail | **P1** | Longer explanations were English-only dictionary scrapings | Non-English learners never saw the block; English learners read "phylum" under 문 | **RESOLVED** |
| **I-07** | Vocabulary | **P1** | Vietnamese and Thai vocabulary covered 500 of 2,581 words | Past word 500 a vi/th learner read marked English | **RESOLVED** |
| **I-08** | Content | **P1** | Entries whose gloss contradicted their own example | 열 read "fever" above a sentence about counting to ten | **RESOLVED** |
| **I-34** | Handwriting | **P1** | The ㄱ taught beside a vowel had a leg a third too short | A learner tracing 가 or 거 saw one letter under the pen and a different one in *Watch it written*: the demonstration's ㄱ stopped short and read as top-heavy. Reported from a screenshot, not by any check. | **RESOLVED** |
| **I-35** | Handwriting | **P1** | Every jamo proportion was measured off a fallback face, not off Pretendard | ㅗ was demonstrated with a stem two fifths shorter than the letter the learner traces, and ㅛ the same. 30 of the 40 letters were built to proportions taken from the wrong typeface. | **RESOLVED** |
| **I-37** | Product | **P1** | The adaptive Hangyul Vocabulary Level Test (1–30) is built | A learner can now find out roughly where they stand in 3–6 minutes, and somebody who already knows some Korean has a way into the product that is not "start at ㄱ". | **RESOLVED** |
| **I-38** | Performance | **P1** | The learning corpus is fetched in priority bands instead of shipped whole | The first load halved — 437 kB gzipped to 219 kB — and stopped growing with the curriculum. What a learner waits for before the home screen paints is now a fixed 46 kB whatever the corpus becomes. | **RESOLVED** |
| **I-40** | Review | **P1** | Review was a dashboard; the learner's saved words and wrong answers were not screens they could open | The two lists a learner thinks of as *theirs* — what they bookmarked and what they keep getting wrong — now have their own screens, reachable in one tap from Review, each with a practice session behind it. Before this, Review answered a question the app had (what is due) and neither of the two the learner has. | **RESOLVED** |
| **I-41** | Dictionary | **P1** | The dictionary ingestion silently dropped 3,384 headwords it had already downloaded | Ordinary words a learner would type were missing from a dictionary that claimed 26,675 entries — including 것 and 거, two of the commonest nouns in the language. Searching for one returned nothing, which reads as the product not knowing the word. | **RESOLVED** |
| **I-42** | Audio | **P1** | The ElevenLabs voice migration was rolled back to the original Microsoft neural voices | The two ElevenLabs voices were rejected as too synthetic, and every clip in the product is now the recording that shipped before them again — Microsoft's ko-KR neural voices, SunHi and InJoon, spoken at 0.82x for beginners. A learner hears the voices the curriculum was checked against, offline, with no account and no network call. | **RESOLVED** |
| **I-44** | i18n content | **P1** | A Tamil learner was asked a Tamil question and offered four English answers | Twenty-two of the thirty-two interface languages were showing quiz prompts in the learner's language over answer choices in English. The question was unanswerable by the person it was built for, and it looked like carelessness rather than a missing translation. | **RESOLVED** |
| **I-48** | Word Detail | **P1** | A taught word card unfolded into every upstream sense of its headword | Word Detail ended in "More from the dictionary", which on 발 — a card teaching "foot" — listed leg, Counter: steps, a blind or screen, strands of noodles, and rounds of ammunition. All true, none asked for, and the effect on a reader is that the product looks less trustworthy rather than more complete. | **RESOLVED** |
| **I-49** | Vocabulary | **P1** | The daily progress bar counted cards seen, not words learned | Reading ten introduction cards filled the bar. A wrong answer filled it. A session could finish 10/10 having missed two words — a number that means nothing, and a learner who notices stops trusting it. | **RESOLVED** |
| **I-09** | Vocabulary UX | **P2** | No matching exercise; production is tiles, not a keyboard | Vocabulary still feels mostly like recognition on cards | **RESOLVED** |
| **I-10** | Content | **P2** | Korean and English glosses describe different senses for some polysemous words | The meaning changes when the interface language changes. 차 read "a car" in English and 車、お茶 — a car, or the tea you drink — in Japanese, on a card whose sentence is 차를 타요 and whose four options have one right answer. | **RESOLVED** |
| **I-11** | Accessibility | **P2** | Vocabulary listening questions relied on the hint ladder for a text alternative | Usable, but scored as a reveal rather than as an accommodation | **RESOLVED** |
| **I-21** | Accessibility | **P2** | `sound_recognition` and `distinguish` letter exercises are heard-only, and the toggle that skipped them is gone | A deaf learner arriving today meets letter questions they cannot answer. Anyone who had already turned the setting on keeps it — the stored `sound_free` flag is still honoured. | **RESOLVED** |
| **I-24** | Handwriting | **P2** | The traced guide is smaller than the demonstration for a single letter | On a letter lesson the grey glyph a learner traces fills about two-thirds of the writing square while the demonstration below it fills 0.84 of its own, and it does not sit on the crosshair drawn under it. Same letter, two sizes, one screen. It also costs accuracy: on Pretendard, the default face, 1.04% of correct attempts are rejected — five times the overall average — and every one of those rejections is a letter written *small and drifted*, which is what tracing a small off-centre guide produces. | **RESOLVED** |
| **I-25** | Build | **P2** | `strokes:measure:check` is not on the release gate | None directly. The table is now reproducible and the check exists, but nothing runs it automatically, so a face upgrade could move the measurements without anyone being told. | **RESOLVED** |
| **I-29** | Build | **P2** | Two end-to-end tests fail, and no `verify` target runs the suite that would have said so | None directly — the failing assertion is about a mouse wheel on the Activity screen's range row, and the behaviour works a second after the screen opens. It matters because the previous report recorded `test:e2e` as PASS with both projects run in full, and this cycle it is 228 of 230. | **RESOLVED** |
| **I-36** | Design | **P2** | The listening question drew a decorative speaker emoji above the real audio control | The same action appeared twice — a 44px 🔊 and, under it, the button that actually plays the clip. The emoji belonged to no part of the product's drawing and was `aria-hidden`, so it was decoration standing where the prompt would be. | **RESOLVED** |
| **I-45** | Onboarding | **P2** | Nothing ever asked a new learner what level they were, and the level they had was buried | A learner could use the app for weeks, be taught from Level 1 throughout, and never discover that a two-minute test would give them words that fit. The Vocabulary Level itself sat on a card two thirds of the way down Home, which is where a number goes when nobody is meant to look at it. | **RESOLVED** |
| **I-46** | Handwriting | **P2** | Five vowels were drawn visibly off centre, and every attempt ended in a panel of praise | Two things a learner meets on every letter. The reference character sat to one side of the square they were being asked to copy it into, and each attempt — right or wrong — was answered with a headline, a compliment, a stroke-order note and a details toggle. | **RESOLVED** |
| **I-47** | Home | **P2** | The quotation slot held a hundred lines, eighty-eight of which the app had written itself | A learner reading the foot of Home could not tell a sentence Seneca wrote from a sentence a product manager wrote, because both were set the same way in the same slot. Twenty attributed quotations replace them. | **RESOLVED** |
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
| **I-78** | Vocabulary session | **P0** | A learner measured at level 30 was taught 남자 | Sit the Vocabulary Level Test, come out at 30, open Today's Vocabulary, and be taught 남자 — a level-1 noun. The number beside Lv. was measured correctly and then ignored, which is worse than not having it: the learner has just spent eight minutes being assessed and the app teaches them *man*. | **RESOLVED** |
| **I-85** | Hangul | **P0** | The compound vowels rendered as two and three separate letters | ㅙ and ㅞ are single vowels. On the screen the learner was shown ㅗ, then ㅏ, then ㅣ, spaced far enough apart that the right-hand upright floated away from the rest — three marks in a row rather than one letter. A learner copying that learns the wrong shape, and the previous report had recorded the defect as fixed. | **RESOLVED** |
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
| **I-71** | Dictionary | **P1** | A taught word's card showed example sentences from a dictionary sense of a different part of speech | The card for 거의 teaches the adverb — 거의 다 왔어요, almost there. Underneath it the app printed 손님은 거의가 오셨습니다 and 남은 시간의 거의를 공부를 하는 데 쓰더라, both of which decline 거의 as a noun with 가 and 를. A learner reading their own word card came away believing 거의 takes case particles, which for the word they had just been taught it does not. | **RESOLVED** |
| **I-73** | Vocabulary levels | **P1** | The frequency reader could not see 감사합니다 or 감사해요, so day-one words scored as rare | 감사하다 was level 11 of 30, 죄송하다 was 12, 미안하다 was 9. Those are the first sentences anybody learns in Korean, and the recommender was holding them back until a learner was a third of the way up the scale. | **RESOLVED** |
| **I-76** | Dictionary | **P1** | A report that a dictionary entry showed different content on mobile and on desktop | If true, a learner comparing the same word on two devices could not trust either. Reported against the running product. | **RESOLVED** |
| **I-77** | Hangul curriculum | **P1** | The sound-change lesson taught five of the six patterns it has copy for; liaison never appeared | 받침이 넘어가요 — the final consonant sliding onto the next block — is the first sound change a Korean teacher explains and the one that makes 한국어 sound like 한구거. The lesson had a heading for it, an explanation for it in all 32 languages, and no card. A learner finished the alphabet and was never shown it. | **RESOLVED** |
| **I-83** | Hangul curriculum | **P1** | ㅙ and ㅞ were drawn with their ㅐ and ㅔ halves too far apart to read as one letter | ㅙ is ㅗ plus ㅐ. Its two uprights sat 31 of the ink box apart where Pretendard puts them 24 — nearly a third too wide — so the branch reached out of the first upright and stopped in open paper and the second upright read as a bar standing on its own. A learner copying it writes ㅗ ㅏ ㅣ rather than ㅘ… ㅙ. ㅞ had the mirror problem: its uprights were pushed right and squeezed, 76 and 95 against the face's 71 and 93, so the ㅔ sat against the edge with its connector a stub between two bars. | **RESOLVED** |
| **I-86** | Release engineering | **P1** | The glyph-shape gate compared six letters with themselves | None directly. It is why I-85 was reported fixed while it was not: the gate that certified the compound vowels was comparing the tracing guide with the demonstration, and both are generated from the same authored centrelines. Two drawings of the same wrong shape agree perfectly. | **RESOLVED** |
| **I-53** | Copy | **P2** | The Review hub called one list "Saved words" and the other "Wrong vocabulary" | Two chips ten pixels apart named the same kind of thing with two different nouns, so they read as two features that arrived separately rather than as a pair. | **RESOLVED** |
| **I-54** | Build | **P2** | Two gates failed on every run once twenty-two languages went partial | None directly — but a suite that is red on every commit is a suite people route around, and this one was red on 44 findings that were the content backlog rather than a fault. | **RESOLVED** |
| **I-57** | Level Test | **P2** | The test reported a level out of 30 without saying how far it could ask in that language | A learner in Hungarian is never asked a question above level 23, because the levels above are ranked from the dictionary and only English carries those glosses. They were then shown a number "of 30". A ceiling presented as a result reads as a verdict on the learner rather than a limit of the bank. | **RESOLVED** |
| **I-60** | Copy | **P2** | The Korean interface called one thing two things, on screens a learner moves between | The home card read 오늘의 어휘 directly above a tab reading 단어; the saved list was 저장한 어휘, filled by a button reading 단어 저장, and its empty state read 어휘의 북마크를 누르면, which is not a thing anyone says. Unit 1 teaches that 낱자 combine into a 글자 and the product then called the letters tab 글자, counted 완료한 글자 in the activity page and 배운 낱자 in the settings. Six strings were in 합쇼체 in a product that speaks 해요체, one of them mixing both inside a single pair of sentences. | **RESOLVED** |
| **I-61** | Copy | **P2** | Two screens said the same thing twice | "Today's words · 0/10 · A short set of 10 words." — three lines and two of them carry the ten. Home's letters card said 40 the same way. And eight of the twelve units are named after their first lesson, so a unit heading and the card beneath it said the same words forty vertical pixels apart. | **RESOLVED** |
| **I-62** | Feedback | **P2** | Two review exercises kept their own idea of what being right is called | The shared verdict reached the writing box, the recognition step and the review session, and not the two components those sessions render. A learner answering a word question read "That's it." or "Not quite. Here it is." while the same learner, two taps earlier, had read "Correct." | **RESOLVED** |
| **I-63** | Build | **P2** | Two end-to-end tests failed only when the machine was busy, and neither was about the machine | None directly. It matters because a suite with two tests that fail on a loaded run and pass on a quiet one is a suite whose result nobody can read, and the word for that is usually "flaky" — which is where an investigation stops. | **RESOLVED** |
| **I-68** | Level Test | **P2** | Three contextual items had a second answer that also works | A placement item with two right answers measures nothing, and marks a learner wrong for knowing Korean. `____에서 십 년을 보냈어요` keyed 감옥 and offered 바다, and spending ten years at sea is ordinary Korean. | **RESOLVED** |
| **I-69** | Build | **P2** | The locale walk advanced on a stopwatch and clicked past the question it came to read | None directly, and it matters for the same reason the last two of these did: a suite that fails somewhere different each run is a suite whose result nobody can read. This one failed as "no question appeared in ta", which reads as missing Tamil content rather than as a timing assumption, so the next person to see it would have gone looking in the wrong place. | **RESOLVED** |
| **I-72** | Dictionary | **P2** | 142 usage labels shipped as unparsed wikitext, 65 of them the bare language code | The 거의 entry printed three labels — `used exclusively with the particles {{m`, `ko`, and `-가` — where the source has one. 치다 and 43 other headwords printed `ko` as though it were a usage note. Anyone reading a dictionary entry saw template syntax and a language code presented as lexicography. | **RESOLVED** |
| **I-74** | Design | **P2** | The Letters and Words icons were a sheet of paper and an open book | The two tabs the product is about were marked with the icon every application uses for a document and the icon every application uses for reading. Neither said anything about Hangul, and in a tab bar they read as "files" and "library". | **RESOLVED** |
| **I-75** | Korean copy | **P2** | The Korean interface named a letter 낱자 and a word 낱말, which is what a textbook says and not what a beginner reads | 41 interface strings and 26 content notes used the bookish term. A learner whose interface is Korean met one vocabulary in the tab bar and another in the lesson text for the same two things. | **RESOLVED** |
| **I-80** | Design | **P2** | The Letters and Words icons were a document and a book, and three redraws were needed to replace them | The two tabs the product is about were marked with the icon every application uses for a file and the icon every application uses for reading. Neither said anything about Hangul. | **RESOLVED** |
| **I-81** | Accessibility | **P2** | The only link on the empty Saved words and Wrong words screens failed AA contrast | Brand orange as 15px text on the warm empty-state card measures 2.77:1 where AA asks 4.5:1. On a screen with nothing else on it, the one thing to press was the least readable thing there. | **RESOLVED** |
| **I-82** | Release engineering | **P2** | The answer-leak gate reported a correct question as a leak | None to a learner. It fails the build on a question that is right, which is the kind of gate that gets switched off. | **RESOLVED** |
| **I-84** | Dictionary | **P2** | Search split its answer in two and made the learner read a paragraph to find out why | Typing a word gave taught results, then a *Dictionary* heading, then the line "Reference only. These words are not part of your daily practice", then more results. Somebody who has typed a word into a search box wants to know whether the word is there. | **RESOLVED** |
| **I-87** | Release engineering | **P2** | `conjugation:qa` passed every malformed honorific | None observed in shipped content; the gate was blind rather than the content wrong. A card or a distractor reading 있세요 or 만들세요 would have passed the gate that exists to catch exactly that. | **RESOLVED** |
| **I-88** | Release engineering | **P2** | `locale:content:qa` promised a simulation that did not exist | None directly, and it is the same shape of defect as a report claiming a fix nobody looked at: a comment ending "and that is what the simulation below checks" with nothing below it. | **RESOLVED** |
| **I-90** | Level test | **P2** | The shipped bank held a distractor the morphology module had stopped producing | A level-28 item offered 치닫아요 as an option. 치닫다 is a ㄷ-irregular and conjugates to 치달아요; the string in the bank was not Korean. | **RESOLVED** |
| **I-96** | Localization | **P2** | A hundred and seventy translations flattened the distinction their card teaches | A learner met 감사합니다, 고마워요 and 고마워 on three separate cards with one identical translation under all three, so the register — the whole reason those are three cards — was invisible. The same for 이메일 against 문자 in Japanese (email and text message, one sentence), 말리다 against 널다 in three languages (drying the washing and hanging it out), 깨지다 against 유리 (a cup and a pane of glass), and 다니다 against 가다 (attending school and going to it). | **RESOLVED** |
| **I-43** | Home | **P3** | The line at the foot of Home was one of twelve, then a hundred, and is now twenty real quotations | Twelve lines were exhausted in a fortnight. A hundred fixed that and created a worse problem — eighty-eight of them were written by the app and set exactly like the twelve that were not. Twenty attributed quotations replace both, superseded by I-47. | **RESOLVED** |
| **I-89** | i18n copy | **P3** | Two category labels named the answer they were hinting at | A Kyrgyz learner asked what 가족 means was shown the hint *Адамдар жана үй-бүлө*, and үй-бүлө is the answer. Same in Uzbek for 공부 under *O'qish va ish*. Two of 581,542 rungs, and both introduced by this cycle's expansion. | **RESOLVED** |
| **I-91** | Release engineering | **P3** | A unit test asserted a shortage instead of the behaviour under one | None. It failed the build for the one reason that is not a defect: the corpus grew past the shortage the test encoded. | **RESOLVED** |
| **I-92** | Performance | **P3** | The offline precache went 4% over its budget | A first install downloads 1,454 kB gzipped for offline use instead of the 1,400 kB the budget allowed. Nothing breaks; the number is a promise about how much a learner pays to be able to work on a plane. | **RESOLVED** |
| **I-93** | Release engineering | **P3** | A one-second test timeout became a false failure as the corpus grew | None. It failed a full release run for a plan that was still being built, which costs the next person a rerun and a doubt. | **RESOLVED** |
| **I-94** | Release engineering | **P3** | The dictionary end-to-end spec pinned a headword the syllabus then taught | None. It failed the suite for the second time in three cycles for the same reason, and each time the reason was that the product had got better. | **RESOLVED** |
| **I-95** | Release engineering | **P3** | A journey spec navigated away while the save it had just made was still in flight | None in the product — the save lands. In the suite it produced *No saved words yet* on a screen where a word had been saved a few milliseconds earlier, which reads exactly like a data-loss defect. | **RESOLVED** |

<!-- /issues:what -->

<!-- issues:counts -->

**Open — P0: 0 · P1: 1 · P2: 4 · P3: 0**

**Blocked outside this repository: 1 · Partial: 3 · Resolved: 86**

<!-- /issues:counts -->

<!-- issues:how -->

| ID | Evidence | Recommended fix |
| --- | --- | --- |
| **I-04** | 3,221 words ship today, counted from `apps/web/src/data/generated/vocabulary.json` rather than from any prose. The pass before this one took it from 2,581 to 2,948; this one added 273 more, every one authored by hand and passed through `content:build`, `examples:qa`, `vocabulary:sense:qa` and `conjugation:qa` before being counted.  The deficit is 6,779 entries. Measured against what one entry actually costs — a Korean headword, a sense, a hand-written example, a romanisation, and a meaning plus an example translation in each of the ten complete languages, roughly 21 authored strings — that is about 142,000 strings. The number moves by 6% a cycle; nothing about this pass makes the target reachable, and saying so is the point of leaving it open. | Either author them, or restate the target. The delivery machinery is built and proven at 3,221 — bands, audio, level assignment, 32 locales — so the constraint is authoring, not engineering. |
| **I-12** | A consequence of having no account and device-local persistence. §13.3 of the current report.  **Re-audited 24 August 2026.** Unchanged.  **Re-audited 25 August 2026.** Unchanged; still closed by decision rather than by work. | None that is customer-facing — a developer-style JSON export was tried and rejected. Keep IndexedDB robust, keep persistent storage requested, and do not warn normal users about it. |
| **I-13** | `vocabulary:relations:qa`.  **Re-audited 23 August 2026 at 2,844 words.** Rebuilt after the expansion: still 245 words and 274 relations, because the builder records only what two Wiktionary headwords state about the taught sense and the 263 new words brought no new evidence. Checked separately that the sparse graph is not letting an unrecorded opposite into the Level Test — no bank item offers 앞 against 뒤, 전 against 후 or 죽다 against 살다.  **Re-audited 24 August 2026 at 2,916 words.** 252 words and 282 relations, up from 245 and 274. Seven of the increase are batch-4 words the wiki happens to describe; four are a correction. Scoping a page to the part of speech this app teaches is what stops 쪼다 the verb inheriting 쪼다 the insult's 유의어 바보 — and it also dropped 밝다 ↔ 어둡다, because ko.wiktionary states that pair under 밝다's 동사 heading (*해가 떠올라 날이 새다*, to dawn) while this app teaches the adjective. Twenty-nine taught words have relations under another heading; twenty-five are genuine homographs and are still ignored. The four that are not are named in `content/vocabulary/relation-headings.json` with a reason each. Nothing else changed: a relation still has to be stated on the page, still has to be mutual, and still has to point at a word the app ships.  **Re-audited 24 August 2026 at 2,948 words.** Unchanged at 252 words and 282 relations: the thirty-two new entries are concrete nouns the wiki states nothing mutual about. The builder still records only what two headwords state about the taught sense.  **Re-audited 25 August 2026 at 3,221 words.** Unchanged at 252 words and 282 relations. The 273 words added this pass brought no new mutual evidence: the wiki states nothing about most of them, and the sixteen four-character idioms among them are exactly the kind of entry a synonym list would have to invent. Rebuilt, not assumed — `vocabulary:relations:check` passes. | Nothing, unless a conservative source can be found. Sparse trustworthy data is not a defect and inventing similar words would be. |
| **I-17** | `docs/LOCALIZATION_NATIVE_REVIEW.md` states it. The severity was raised when the surface tripled.  **Re-audited 23 August 2026 at 2,844 words.** Still true, and this pass produced a concrete demonstration of what goes unnoticed without it: the Portuguese pack had been written in European Portuguese in a pt-BR product for four batches — camisola, a nightgown in Brazil, taught as the meaning of 스웨터, and constipação, constipation, used for a head cold. No gate reads for the variety of a language. A native reader finds that in a minute.  **Re-audited 24 August 2026 at 2,916 words.** Unchanged, and now stated in a second place a reader will actually reach: `docs/LEVEL_TEST_KOREAN_REVIEW.md` records, dimension by dimension, what has been read and by whom — eleven rows by a program, three by an AI assistant, and one row, naturalness, by nobody. `npm run korean:education:qa` refuses to pass if that file claims a native reviewer, and prints THIS DOES NOT PROVE NATIVE NATURALNESS on every run.  **Re-audited 24 August 2026 at 2,948 words.** Unchanged. This pass added a Thai and a Vietnamese row for each new word, written by an AI assistant like every other row in those packs, so the surface needing native review grew by 64 strings.  **Re-audited 25 August 2026 at 3,221 words.** Unchanged in kind and larger in size. This pass wrote 22,638 strings in twenty-two languages nobody in this repository reads — 11,000 meanings, 11,000 example translations and 638 long definitions — so the surface needing native review grew by more this cycle than in all the previous ones together. Two of those strings were caught by a program rather than a reader, and only because they collided with an answer: the Kyrgyz and Uzbek category labels in I-89. | Native review. Nothing automated substitutes for it, and no document here may claim it has happened. |
| **I-79** | `npm run vocabulary:recommendation:qa`, 30,000 simulated events, 30 levels x 100 days x 10 words, 0 short days inside the simulated window. A learner at 30 now sees 383 distinct words before the zone is exhausted and one at 1 sees 102; the previous pass measured 221 and 93. The `fortnight` column — floor(distinct / 10) — reads 38 at level 30 where it read 22.  The 273 words added this pass were selected for this: 162 of them land in 28-30. The sample the simulation prints for a level-30 learner is 야무지다, 감언이설, 기울다, 씁쓸하다, 착잡하다, 감당하다, 복용하다, 애틋하다, 일사천리 and 저조하다 — advanced and ordinary rather than advanced and obscure, which is the harder half of the ask.  The shortfall is still reported rather than hidden. `planNewWords` returns a deficit and refuses to reach more than one level outside the teaching zone. | Keep authoring at the top. Five weeks is not a fortnight and it is not a year; the zone needs roughly 700 words per level before the ceiling stops being a thing a learner can reach. |
| **I-03** | `HANGYUL_URL` is null in a plain checkout; `NextStepCard` returns null; `routing:check` reports which way a build went. Searching both repositories on this machine finds the main product — the Expo app `Hangyul`, bundle `com.hangyul.app`, scheme `hangyul` — and its backend `api.talkhangyul.com`, and this app's own host `ganada.talkhangyul.com`. Neither repository declares a learner-facing web address for the main app. The one occurrence of `https://hangyul.app` is a fallback inside a `catch` in a billing modal, not a declared destination.  **Re-audited 24 August 2026.** Unchanged; the blocker is outside this repository.  **Re-audited 25 August 2026.** `VITE_HANGYUL_URL` is unset in the environment and declared nowhere in this repository; `HANGYUL_URL` is null and `NextStepCard` renders nothing. No destination was invented. | Whoever owns the product supplies the destination — a landing page, a store listing or a universal link — and it is set as `VITE_HANGYUL_URL` at build time. Documented in `.env.example`. |
| **I-19** | `npm run locale:content:qa`: 10 complete at 3,221 of 3,221, and 22 partial at 600 of 3,221 — 19% each, where the previous pass measured 100 and 3%. 500 words x 22 languages = 11,000 hand-written meanings and 11,000 example translations added this cycle, plus 638 long definitions, because `vocabulary:sense:qa` requires that a word carrying the *More about it* paragraph in one language carries it in every language that has written that word.  The reachable Level Test grows with it: those 22 languages go from 645 items to 1,021.  **These are model-written and have not been read by a native speaker.** That is the reason this stays PARTIAL rather than closing: coverage is not review, and `i18n:check` reporting 32/32 for the interface is a different question from this one. | Continue the expansion band by band, and get a speaker of each language to read what is there. The second half is the one that cannot be done from this machine. |
| **I-39** | `npm run locale:editorial` is new, and it reads for four things nothing else looked at:  * **Register.** Twenty-one of the shipping languages choose between a familiar and a polite second person, and the choice has to be the same on every screen. It counts the markers of each and fails the build on a language that uses both. It found **five languages mixing them** — de (12 strings), el (3), id (6), ro (2), and, once its own false positives were fixed, none in cs. All are now consistent with the register that language already used. * **One English sentence, two translations.** Where two keys hold the same English string their translations should match. Found the Level Test asking "What does this word mean?" in wording that differed from the reading exercise's in six languages; unified. * **Typography.** 71 straight apostrophes in languages whose English source writes the typographic one; all replaced. * **A label that became a paragraph.** A short English label translated several times longer, which is what breaks a layout at 200% text.  Writing it also found the writer out. Its first run reported seven mixed-register languages and three were its own fault: JavaScript's `\b` is defined against ASCII, so `\btes\b` matched inside *prêtes* and French "revisions ready" was reported as addressing the reader familiarly. Every pattern now goes through a Unicode-aware boundary, German and Italian are read with sentence-initial capitals lowered (so *Sie* meaning *she* is not counted), and the ambiguous markers — Spanish `su`, Czech `ty`, Dutch `u` as the abbreviation for hours — are named and excluded with the reason. **A linguistic check that cries wolf is worse than none**, because it is the kind people switch off.  **What is still not done, and this is the whole of the remaining item.** Nothing here reads a sentence for whether it is *good*. Register consistency is not naturalness, and an apostrophe is not a register. The 15 findings it still reports are deliberately left as warnings for a person: they are places where two screens word the same idea differently and only somebody who reads the language can say which is right, or whether both are.  Distinct from I-17, which is native-speaker review. This is the pass that should happen before one, and the mechanical half of it is now done and enforced in `verify:quick`.  **This cycle: Korean, read on the rendered screens.** Three classes of defect that no check looked for — one thing called two things (I-60), a register that slipped into 합쇼체 six times, and 262 example translations that invented a person the Korean does not have (I-59). All three are rules in `locale:editorial` or `examples:qa` now. What has still not happened is a native reading, in any of the thirty-two.  **Re-audited 24 August 2026.** The Korean interface was rewritten this pass to drop 낱자 and 낱말 (I-75), which is a mechanical editorial change and not a native reading. The row is unchanged: 31 of 32 languages have had a program read them and a person has not.  **Re-audited 25 August 2026.** Unchanged in substance. `qa:locales` renders 32 languages x 8 screens = 256 screens with no measurable problem, `locale:editorial` reports 0 errors and 38 warnings for a person to read, and neither of those is a native reading. Two category labels were renamed this cycle for a mechanical reason rather than an editorial one — Kyrgyz *Адамдар жана үй-бүлө* and Uzbek *O'qish va ish* each contained the answer to the question they were hinting at. | A reading pass per locale, screen by screen, by somebody who speaks it. The 15 remaining warnings from `locale:editorial` are where to start. |
| **I-20** | 71 words carry a third element in `vocabulary.en.json`, up from 35. They are the homographs and the usage traps: 배 is a stomach, a boat and a pear; 못 is the difference between will not and cannot; 아가씨 is a word to use about somebody and not to them. 38 of the 71 are inside the 600-word core band, and this pass wrote all 38 in each of the 22 partial languages — 638 paragraphs — because a note that exists in English and not in Tamil is an asymmetry a learner discovers by switching language. | Content, not code: write the block for the words a learner most often stops on. The machinery to show it has been there since the block existed. |
| **I-01** | Rebuilt from HEAD (`a672dad`) with the working tree clean, and verified by unpacking the delivered APK rather than by trusting the build: `assets/public/brand/splash/` holds `splash-ko.png` and `splash-en.png` and no MP4; the curriculum chunk carries `국:{aspect:.9669,cut:"bar",parts:[[.1257,0,.8686,.3646],…]}`, the current measurement; the matching grid, the sound-free control, the Home nudge and the `noindex` metadata are all present; and all ten native launch bitmaps test wordless. Signed v2 + v3 with the production identity `157a2bb1…debc`, read out of the APK Signing Block. **And `npm run release:current` now exists**: it reads the commit out of `build-info.json`, diffs it against HEAD, and fails on any changed product file or any uncommitted one. It is in `verify:release`. | done |
| **I-02** | Committed before the build, in that order, this cycle and the two before it. | done |
| **I-23** | Reproduced by rendering the shipped assets before any change was made. Fixed by replacing the architecture — see the entry for it in §11. Now: `strokes:qa` clean on 73 items / 269 strokes; `strokes:visual` clean on 1,345 frames; the gallery read by eye at 160 px and at 96 px, which is the size the defect was reported at. | done |
| **I-05** | Fixed by the band architecture in **I-38**; this is the budget half of the same work and is closed by it. `bundle:budget` no longer forecasts the corpus into the first load, because the corpus is not in the first load: it is fetched from `public/corpus/` a band at a time.  ```   corpus, first paint              45.7 kB /  64.0 kB   enforced   corpus, first paint at 10,000    45.7 kB /  64.0 kB   enforced, and flat by construction   corpus, whole at 10,000         776.8 kB / 900.0 kB   forecast, background, precached ```  The forecast that used to read 302% of budget was measuring a *first-load* cost. What replaced it is two rows: an enforced first-paint budget that a growing corpus cannot break, and a background figure whose ceiling was re-derived for what a background download may fairly cost. See I-38 for why the second number is 900 kB rather than the old 220, and why that is a retirement rather than a raise. | Done. |
| **I-06** | 25 written words in ten languages; §15.2. | done |
| **I-07** | 2,581 non-null rows in both. | done |
| **I-08** | Eleven found, all authored and pinned; `vocabulary:sense:qa:check` passes. | done |
| **I-34** | The leg's toe, as a fraction of the letter's width, measured off Pretendard with the ㄱ's region taken from the measured composition: 0.120 in 가, 0.116 in 거, 0.113 in 기. It was authored at a lean of 0.28, putting the toe at 0.72.  The rule was already right — a leaning form beside a vowel, an upright one above or alone — and only the magnitude was wrong, so the fix is one constant and a refitted curve, not a per-syllable exception. `GIYEOK_LEAN` is 0.885, the leg's two controls least-squares fitted to the face's own profile at 25/50/75/98% of its height, and the corner held square. Fitted twice: the first fit was against the bare curve, and the samples are of rendered ink whose box is half a pen larger at each end — worth 0.057 of the width through the middle.  Now 0.166 / 0.175 / 0.167 against the face's 0.120 / 0.116 / 0.113, inside the face's own variation between the three. All 14 taught items containing ㄱ, ㅋ or ㄲ were re-rendered against the face and read by eye. Stroke integrity is unchanged: `strokes:qa`, `strokes:visual` and `strokes:measure:check` clean on 73 items and 1,345 frames. Pinned by `giyeokShape.test.ts` without a browser and by `glyphshape:qa` with one. | Done. |
| **I-35** | `measure-jamo.mjs` set a page whose only content was a `<canvas>`, awaited `document.fonts.ready` — which resolves immediately when nothing on the page uses the family — and then drew with a font that had never loaded. The canvas substituted a system Korean face and drew perfectly good, wrong letters. Nothing errored and the check said the file was up to date, because it faithfully reproduced its own mistake.  ㅗ was recorded at an aspect of 2.894 where Pretendard draws it at 1.826; ㅛ 2.894 against 1.746; ㅊ, ㅈ, ㅑ, ㅏ, ㅐ, ㅎ and 23 others moved by more than 5%. The generator now loads the face for the letters it is about to measure and refuses to run if it did not — checking for a family only its own `@font-face` can supply, because the fallback is another Korean face and passes a weaker test.  Found by following the ㄱ report rather than by any gate. The first attempt to measure it independently had the identical bug and produced eight confident, wrong findings about compound vowels before the numbers were checked against the font file itself. | Done. |
| **I-37** | Built as its own feature, with its own bank, its own scale and its own simulation harness.  **The scale.** The Hangyul Vocabulary Level is 1–30, cumulative and non-linear: Lv1 ≈ 147 words, Lv10 ≈ 1,835, Lv20 ≈ 5,690, Lv30 ≈ 10,635+. It is **not** the teaching corpus cut into thirty equal bands — that would have made a "level" mean 86 words, which is not a proficiency scale, it is a progress bar. The 2,581 taught words are used as *calibrated anchors* inside it, together with quality-gated dictionary entries, all ranked by the same `frequency.measure` the corpus uses.  **The bank.** `scripts/content/build_level_test.py` selects the anchors and `build_level_test.mjs` generates 3,960 items across the 30 levels (min 121 each) to `public/level-test/`, content-hashed and lazily fetched — it is not in the bundle and not on any critical path. Items are Korean→meaning, meaning→Korean and context, and **context items use conjugated Korean** — 마셔요, not 마시다 — generated through `packages/korean-morphology`, which carries 99 unit tests and a named regression table across ten irregular classes and is checked against 1,306 corpus predicates by `npm run conjugation:qa`. `npm run leveltest:ambiguity` applied eight rules to the whole bank when this was written; it applies twelve now and reports **0 findings** — the four it gained are I-55. A 143-word blocklist keeps unsuitable subject matter out of both the anchors and the distractors; an anchor must be Hangul, 1–4 syllables, a noun/verb/adjective/adverb, and carry a gloss of 3–60 characters that is not a grammatical form page.  **The scoring.** A 3PL/Rasch model with a guessing floor of 1/4, EAP over a grid, Fisher-information item selection. **Exactly 30 items — 12 context, 9 Korean→meaning, 9 meaning→Korean — under one 8-minute clock**, replacing an adaptive stopping rule that ran 18–36 items until SE fell under 1.6 levels: a test whose length depends on how well you are doing tells you how well you are doing while you sit it. Difficulty still adapts; the count does not. On expiry the answers given are kept, the rest are recorded as *I don't know*, and the sitting is scored. "I don't know" is an answer and is weighted as cleaner evidence than a wrong guess, not as a skip. `npm run leveltest:qa` simulates 200 sittings at each of the 30 levels against the real bank: **MAE 1.34 levels, 95.3% within ±3, 99.7% within ±5, exactly 30 items, composition 12.0/9.0/9.0.** Fixing the length cost 0.07 levels of mean error.  **What it does not do.** No listening, no handwriting, no hints, no answer reveal, no running score. It writes `settings.level_test` and nothing else — an e2e test takes the whole assessment and asserts that every other IndexedDB store is byte-for-byte unchanged. The result screen names the scale as **the Hangyul Vocabulary Level** in all 32 languages, so what the learner is given is our own number rather than an implied TOPIK or CEFR grade. The four disclaimer sentences that used to open the intro — no hints, answers not shown, nothing here changes your lessons, not an official proficiency grade — were removed: four caveats to read before a beginner is allowed to find out how much Korean they know is a methodology page, not an invitation. The promises they made are still kept and are asserted against the DOM by `e2e/level-test.spec.ts`, which is stronger than a sentence claiming them. | Done. |
| **I-38** | `scripts/content/split_corpus.py` cuts the generated corpus into bands under `public/corpus/` — shared tables, then band 1 of 600 words and bands of 800 after it, each with the matching slice of all ten languages' meanings, every file named by its own content hash. `data/corpus.ts` fetches them: the tables and band 1 are awaited inside the launch screen's existing 900 ms, the rest arrive in the background once the learner is looking at something.  **The bands are cut on the same key the app reads the corpus in** — `difficulty_score`, then the headword — and that is the load-bearing part. It makes a partly-loaded corpus a *prefix* of the curriculum rather than a subset of it, so a category only ever grows at the end and `vocab-food-2` cannot quietly become a different five words. `data/corpus.test.ts` rebuilds every study set from the finished corpus in one pass and requires it to equal what four incremental passes produced.  `data/vocabulary.ts` is now a live registry: `VOCABULARY` is one array that grows and every derived structure is filled in place, so roughly thirty consumers stayed synchronous and unchanged. The screens that read the corpus *whole* — browse, search, the progress summary, the sound-change examples — use `useCorpusMemo` so they recompute when a band lands, and search says "still loading the rest of the vocabulary" rather than "nothing matches" while it is incomplete. Every "x of y words" reads `corpusTotal()` from the manifest, so the denominator is right on the first frame instead of climbing.  Measured (`npm run bundle:budget`):  ```   first load                      219.0 kB / 460.0 kB    was 437 kB   corpus, first paint              45.7 kB /  64.0 kB   corpus, first paint at 10,000    45.7 kB /  64.0 kB    flat, by construction   corpus, whole                   200.5 kB / 900.0 kB   corpus, whole at 10,000         776.8 kB / 900.0 kB    forecast ```  The old `LAZY_REQUIRED_HEADWORDS = 4_000` gate is gone because there is nothing left for it to gate; in its place the budget now fails the build if a `word-corpus-*.js` chunk reappears in the eager graph, or if `public/corpus` is missing from the build. The whole-corpus budget was **re-derived rather than raised**: 220 kB was a first-load figure for a chunk that no longer exists, and 900 kB is what a background download for a bought product may cost — the property the old number protected is now protected by the first-paint row, which is stricter and flat.  Offline is unchanged: the service worker precaches every band in all ten languages out of the corpus manifest, because unlike the dictionary this *is* the product. | Done. |
| **I-40** | `pages/ReviewPage.tsx` is a hub: one session card, the manual modes, and two rows — Saved words and Wrong vocabulary — each carrying its own count. The two scheduler figures that used to sit there (*needs practice*, *due today*) and the eight-item preview list are gone: both were true, both restated the number already on the Start button, and the preview told the learner what they were about to be asked.  `pages/SavedWordsPage.tsx` and `pages/MistakesPage.tsx` are the two destinations. Both have search or filtering, an empty state that names the action which fills the list, manual removal, and a practice button.  **One canonical saved state.** `toggleSavedHeadword` resolves a Korean spelling to the taught card when the app teaches it and stores `dict:<headword>` when it does not, so saving 하다 from the dictionary and from its word card is one bookmark and not two rows that disagree. A dictionary-only word is saved but not quizzable — there is no distractor pool to build a fair question from — and the screen says so rather than offering a button that opens an empty session.  **Session length is computed, not listed.** `features/review/sessionSizes.ts` returns the standard rungs that fit plus the whole list, so with seven saved words the options are 5 and All 7 — never a 20 that silently gives seven. `defaultSessionSize` starts at ten, which is the daily goal and therefore a length this learner already knows the shape of.  **Removal is removal.** Clearing a notebook row leaves the word in the corpus and the learner's memory of it untouched; unsaving leaves the mistake; clearing the mistake leaves it saved. `store/reviewLists.test.tsx` is 19 tests over the real provider and a persisting driver, including both directions of that independence, the one-bookmark rule, five wrong answers producing one row with `wrongCount` 5, and a practice plan that resolves to more than one exercise type — which is §17 measured rather than asserted.  `e2e/review-hub.spec.ts` covers the same ground from outside: the count on a hub row equals the number of rows on the screen it opens, the size control never offers a session it cannot run, a removed mistake stays removed across a reload, and both empty states name a next step that is not the button the learner just pressed. |  |
| **I-41** | Found by treating one reported miss as a symptom rather than a bug to patch. 귀족 turned out to be present and first in its result list; the report was still right that something was wrong, so the cache was counted instead of the complaint. Of 52,799 downloaded pages: 20,706 have no Wiktionary page at all (correctly — they are inflected forms, and §33 forbids those from becoming headwords), **4,456 had a Korean section the parser could not read**, and 833 had only senses the blocklist rejects.  Two causes, both in the parser. `POS_MAP` did not know ten part-of-speech headings that Korean entries actually use — *Dependent noun*, *Proper noun*, *Counter*, *Postposition*, *Ideophone*, *Contraction*, *Phrase*, *Idiom*, *Proverb*, *Number* — and a section it cannot name is a section it drops. And definitions written as templates rather than prose (`{{lb\|ko\|...}}`, cross-reference and gloss templates) were run through `clean_markup`, which deletes markup, so the sense came out empty and the entry was discarded as senseless. `render_definition_templates()` now runs first and turns them into the sentence they were meant to be.  Result: **3,384 headwords recovered**, 것 and 거 among them.  `scripts/dictionary-coverage-qa.mjs` is the gate that would have caught this and now does. It is not a headword count — a count said 26,675 while the words were missing. It asks three questions: a named fixture of 160 ordinary words across 16 domains that a general Korean dictionary must have (160/160 present); what share of the commonest spoken Korean reaches an entry, at four depths, exactly and after morphology; and it fails the build on any fixture miss that is not in `UPSTREAM_GAPS`.  `UPSTREAM_GAPS` holds exactly one word. **왕족 is absent from both the English and the Korean Wiktionary** — checked by hand against both APIs, so no change to the ingestion can find it. It is recorded as a gap in the source rather than hidden as a passing test, and the list should empty rather than grow. |  |
| **I-42** | Restored from `bfe0fbf0`, the last commit before the migration, rather than re-synthesised: all 10,454 clips were in git and were checked out, so what ships is byte-identical to what was verified before rather than a fresh generation that would need verifying again.  **The repairs came back with the voices.** 마디 is in `speech_repairs.py` again, because the defect it corrects belongs to Microsoft's male voice — it reads the isolated word as [마지], palatalising across a boundary that is not there. It had been deleted a few hours earlier on good evidence: re-synthesised unrepaired on the ElevenLabs voice, the recogniser heard 마디. That evidence stopped being about the shipping voice the moment the voice changed, which is the rule this file now states: a repair is evidence about *a specific voice*, and every entry has to earn its place again when the voice does.  **Provenance follows the audio.** `sources.py` credits Microsoft Azure Neural TTS again, so the Legal screen names the engine whose recordings are in the package, and the generated corpus was rebuilt to carry it. Removed with the vendor: the provider class and its two voice IDs, the key reader (`scripts/lib/secrets.mjs`), the backoff helper, and the registry entry — **0 references to ElevenLabs remain in any source, script or generated file**.  `qa_audio.py` kept the improvement and lost the vendor name: it no longer tests for a hard-coded engine but resolves the pace a corpus was spoken at from the provider that made it, which is the general form of the rule and keeps working if an engine that cannot be slowed down is added later.  **A guard was added because this went wrong once.** Run with no provider named, `generate_audio.py` falls back to `edge` — which is correct for somebody trying the pipeline out and wrong for a rebuild. It re-walked 10,454 existing clips, regenerated none of them, and rewrote the manifest to credit an engine that had not touched them, at a rate they were not made at. Nothing failed; the audio was right and its provenance was fiction. It now refuses to change a manifest's provider unless `--provider` says so on purpose.  Verified after the restore: `audio:qa` **0 errors, 0 warnings** over 10,550 clips (48.9 MB, median 1,010 ms), `audio:pronunciation:check` **0 errors**, and a listening pass over the sample §3 names — every full example sentence and every multi-syllable word transcribed exactly in both voices. Isolated single syllables are beyond the recogniser (it returns empty strings and YouTube boilerplate for 300 ms of context-free audio, for clips that are known good), so those rest on the duration, loudness and shape checks instead, which is stated rather than papered over. |  |
| **I-44** | Not one screen's bug. The curriculum shipped word meanings in **ten** languages and the interface in **thirty-two**; every screen that glossed a word passed the *interface* locale to `wordCopy`, which walked its fallback chain and returned English. Each call was correct in isolation and the product was incoherent.  **The first fix was wrong and is worth recording.** It resolved one *content locale* per learner and made every option share it — so a Tamil session was uniformly English rather than mixed, the gate went green, and the learner was no better off. Consistency was never the requirement; **being readable by the person who chose the language** is.  `strictMeaning` now resolves a meaning in the learner's own language or not at all, and `buildExercise` refuses to build a question whose options are not all present. A locale with no pack has no vocabulary questions rather than English ones — the cost the product decision chose, because a smaller coherent lesson beats a mixed-language one. `wordCopy` keeps its fallback for *reading* a word card, where English marked as English is honest and a blank is not.  **And the content started.** The build already supported hand-written packs for late-arriving locales — that is how Thai and Vietnamese got in — and already tolerated partial ones. All 22 missing languages are now real content locales with **100 of 2,581 words** each, written against the canonical taught sense so a polysemous headword cannot drift.  Partial stopped being the failing condition in `locale:content:check`: it used to mean *mixed*, and now means *smaller*. The gate gained a script check, which earned its place immediately — a Russian row came back as `День长长…` during authoring, Cyrillic then two Han characters, and it reads as correct until the second word.  Verified on the screen, not in the data: `locale-quiz.spec.ts` opens today's vocabulary in Tamil, Telugu, Bengali, Hindi, Arabic and Russian, reads the answer choices, and fails on three Latin letters in a row. **Zero leakage.** Bengali asks with তুমি / এখানে / আমি / হ্যাঁ, Arabic with رأس / مرة أخرى / نحن / ساق. |  |
| **I-48** | The block is gone. Dictionary **search** is untouched — 30,059 headwords, and a search result still opens the full entry — but a taught card has stopped borrowing the dictionary's other senses. One card, one sense, which is what the rest of the screen already promised.  What survives is the half that was pedagogy: extra example sentences **for the sense the card teaches**, shown in the open rather than behind a tap. They needed a filter, and the filter was written by reading what the old block had been showing — `^서울에 가요` with a stray caret from the wikitext, `새들-이` with a morpheme hyphen, `거겠--어`, the fragment 여자친구, a citation about parasite eggs under "a body", and 술을 먹다 ("to drink wine") under 먹다 meaning "to eat".  Measured across all 2,578 cards with a dictionary entry: **605 candidate sentences upstream, 228 fit to show, 195 cards gaining one** — the yield rose with the ingestion fixes in I-50, because sentences that used to carry wikitext now do not. Rejecting two thirds is the point.  `worddetail:qa:check` runs every rule over every card and reports the yield, so a filter that quietly stops filtering fails the build. Two defects were caught while building it: the gloss comparison ignored words shorter than three letters, which emptied the taught side for every "to go" and "to do" — the commonest verbs gained nothing and nobody would have noticed — and the gate began as a copy of the module's rules, drifted within the hour, and accused six correct cards of showing the wrong sense. It imports them now. |  |
| **I-49** | The rule is now one line: **ten words means ten words answered correctly.**  * An introduction credits nothing. A learner who reads all ten cards and answers nothing reads 0/10. * Only a correct answer completes a word. `advance` used to credit unconditionally; it reads the recorded outcome now. * A missed word comes back — at the end of the pass, as a *different* exercise on the same taught sense, because asked the identical multiple-choice a minute later a learner answers from the shape of the screen rather than the word. The session does not end at 8/10 having dropped two.  **The retry queue is not stored anywhere, and that is the design.** What is owed is derived from the plan — the words not in `completed` — and the plan already persists. A reload cannot lose a pending retry without also losing the progress bar, so the two can never disagree.  `dayProgress` also stopped counting the length of the completed list and started counting distinct words in it. Nothing was wrong today, because `completeDailyWord` ignores repeats; counting a log to answer "how many words are finished" is the kind of thing that goes wrong later, quietly, in the learner's favour.  `dailyProgress.test.ts` holds the seven cases: ten intros and no answers is 0/10; five correct is 5/10; four right and one wrong is 4/5 with the wrong one requeued as a different question; the retry finishing the day; the same word wrong twice staying one incomplete word; a reload keeping both the progress and what is owed; and fifteen against a goal of ten reading 150% with the bar full rather than overflowing. |  |
| **I-09** | `MatchExercise` — four Korean words, four meanings, tap-tap. It is a genuine group exercise rather than a screen: `ScheduledStep` gained `group` and `completes`, `scheduleSteps` holds words back until four are waiting so a grid is only ever made of words already met in that sitting, and the session credits every word a step finishes from one code path. Seven component tests cover the accounting, including that a grid reports one result per word, that both sides of a wrong attempt are marked, and that a double tap on the last pair cannot report twice. Four scheduler tests cover the invariants: every word finished exactly once, no word in two grids, and no grid before its words were introduced. | done |
| **I-10** | The recommended fix is in: every entry carries a canonical `senseId` derived from its English gloss — 2,581 of 2,581, no collisions — and English is the arbiter because it was the one locale already single-sense throughout. 103 separator-split glosses were read against the sentence each card actually asks; 35 named a sense the sentence never demonstrates and were trimmed, ten cards moved sense outright, and three illustrations moved with them. The remaining 38 are classified in `REVIEWED_SPLIT` and `vocabulary:sense:qa:check` now fails on a split gloss that is not on that list, and on a listed one that has stopped being split. Both directions are negative-tested.  What is still unguarded: a gloss merged with a **comma** rather than a semicolon, 또는 or 、. The comma cases among those 103 words were fixed by hand — "coche, té" for 차 is now "coche" — but the rule cannot be widened to catch a new one. Measured over the corpus, "this locale has more comma-separated parts than the English" flags 228 glosses and is dominated by descriptive commas: 얼굴 is "눈, 코, 입이 있는 앞부분", one definition containing a list, not two senses.  **Closed this cycle by doing the reading pass the fix asked for.** The decidable half was already gated; what remained was comma-bearing glosses, which no separator rule can judge because "we, us" and "mum, mummy" are one sense written twice. The dictionary judges them instead: a comma gloss whose parts land on different dictionary senses is a shortlist, and it is 55 words long. All 55 were read across the ten complete languages side by side, and five were genuinely teaching two senses — 목 (every example said throat, eight glosses said neck), 밥 (English translated its own example "a meal"), 근데 (four glosses said "but", every example was the discourse marker), 그쪽 (the polite second person, not the direction) and 기술 (the Korean gloss is 솜씨). All five are fixed in every language that carries them. The other fifty are named in `REVIEWED_COMMA`, so a new comma gloss that splits senses fails `vocabulary:sense:qa` — proved by putting "a neck, a throat" back. Cross-language part-count drift was measured at the same time: one word of 2,581 differs by two or more parts across the ten, and it is 얼굴, whose Korean gloss is a descriptive phrase. | Done. The gate is `vocabulary:sense:qa`, in `verify:quick`. |
| **I-11** | There is no vocabulary listening question left to accommodate; §16.5. The letter exercises are I-21. | done |
| **I-21** | A per-question *Can't use audio?* on the two heard-only letter exercises, in all 32 languages. `listen` swaps the clip for the written romanisation and keeps the same four letters; `distinguish` turns the question round and asks which of two sounds the letter makes, because printing the romanisation there would hand over the answer its options already carry as labels. Same item, same skill, same scoring, no penalty and no setting. `accessibility.spec.ts` drives the Listen practice entry, asserts the control is a real button reachable and operable by keyboard, and runs axe over the substituted question. | done |
| **I-24** | `fitGlyph` measures the drawn ink and solves for the size and origin that centre it, rather than sizing the em. Measured on the running app: ㅏ went from 0.228 × 0.672 centred at (0.556, 0.460) to **0.243 × 0.718 at (0.499, 0.499)**, and the worst centring error across all 270 glyph-and-face pairs is 1.2% of the box. The grading half — the reason the previous attempt was reverted at 21% false rejections — is `GAP_EROSION_RATIO`, which erases the rim a too-wide reference stroke leaves before the structural term counts it, mirroring what the blot term already did. Swept jointly against the corpus: **0.28% false reject / 0.28% false accept**, against 0.21% / 0.78% before, with Pretendard — the default face — improving on both from 1.04% / 0.55% to 0.42% / 0.00%. The fixtures were regenerated because they had been rendering their own layout and so measuring a geometry the product does not use. | done |
| **I-25** | `measure-composition.mjs` starts its own `vite preview` when nothing is listening on :4477 and reuses one when something is, so it runs unattended. `strokes:measure:check` is in `verify:release`. | done |
| **I-29** | The failing case was the launch screen, not the feature: `page.mouse.*` has no actionability check, so a wheel dispatched during the 900 ms brand screen landed on the splash. `e2e/helpers/launch.ts` makes the wait explicit and says why. The suite is **236 of 236** across both projects, and `test:e2e` is in `verify:release`. | done |
| **I-36** | Removed, with nothing in its place: the question is the line of text above and the action is the one button below. One shared `ChoiceExercise` renders every choice question in the lesson and in Review, so it is gone from every route at once.  Removing it exposed an accessibility defect. The button's name is built as "Play the pronunciation of {text}" and a listening question shows no Korean — that being the question — so the caller had nothing to pass and screen-reader users heard "Play the pronunciation of " and then nothing. Naming the letter would read out the answer, so an unnamed button now says "Play the sound", in all 32 languages.  A test asserts the absence of *any* pictograph rather than of one character, plus the positive shape — one hit-sized control, named for what it does, with "Can't use audio?" still under it — in both themes, with an axe scan. | Done. |
| **I-45** | **Asked once, before the first vocabulary session.** A learner who has never been placed is offered the test with two answers: take it, or start at Level 1. It is not a gate — declining begins the session immediately — and it is never asked again, because a prompt that returns tomorrow is a toll rather than a recommendation. An assessed learner never sees it.  **`placement_skipped_at` is a new field and deliberately not part of `level_test`.** Those are different facts: one is what was measured, the other is what was decided about measuring. Collapsed into one, a learner who declined becomes indistinguishable from one assessed at Level 1, and the app loses the difference between *we know* and *we have not asked*. Schema 12, migrated to null for everybody including existing learners with a result — who never declined anything.  The prompt waits for the profile to load. Without that, every learner looks untested for as long as IndexedDB takes to answer, and somebody assessed months ago opens today's words and is asked whether they would like to be assessed.  **The level now sits beside the streak**, in the status corner every learner passes on every launch — outlined rather than filled, "Lv." small and the number bold. A measurement, not a medal: no badge, no gradient, no crown. And the test's result screen now ends on *Learn words at my level* rather than *Done*, which used to return the learner to the settings screen they came from after thirty questions about what to teach them next.  **What the level does and does not do is stated rather than implied.** For a learner who has never been assessed it rises with what they have learned; for one who has, it is the measurement and holds until they retake. No progress bar was added toward the next level, because for an assessed learner ordinary study does not move it and a bar would say otherwise.  `store/placement.test.tsx` covers §59 A–E, including the case easiest to get wrong: retaking mid-day leaves today's words exactly as they were, because a plan is built once and stored and a new level is a fact about tomorrow. |  |
| **I-46** | **The centring was a font-metrics bug, and it was measured.** `text-align: center` centres a glyph's advance width and a line box centres its ascent-to-descent band; neither is the ink. Compatibility jamo are drawn to read in isolation rather than to fill their em, so off Pretendard at weight 600: ㅜ and ㅠ sit 7.8% and 7.5% of an em too low, ㅏ 6.8% too far right, ㅑ 4.0%, ㅗ 3.8%. About seven pixels at lesson size, and worse in context — the guide square *is* centred, so the model and the target disagreed about where the letter belongs.  `measure-jamo.mjs` already renders each letter in the real face to measure its proportions; it now also records how far the ink falls from the centre of the box centring gives it, and `CenteredGlyph` subtracts that. Nobody types the numbers, which is the difference between this and a per-letter margin.  **Three of the four surfaces were already correct.** The handwriting guide, the stroke-order animation and the *Watch it written* preview are drawn from `strokeVectors.ts`, which fits authored strokes to the ink bounds of the measured box and centres those — ink-centred by construction. Only the reference character is rendered as text. Composed syllables measure within 2.5% and need nothing, because a syllable block is designed to fill its em. `jamo:centering:check` gates the **residual** — the face's offset less the shipped correction — so a font update that moves a glyph without a re-measure fails the build.  **The feedback card is gone.** A headline, a line of praise, a stroke-order note, a Show details toggle and a numeric breakdown, under a two-stroke letter, every attempt. A learner writing ㄱ for the fourth time does not read "That's it!" — they have read it three times, and repeated praise stops carrying information the moment it becomes certain. Correct is now one button; wrong is one actionable sentence and Retry. The grade is unchanged and still recorded; what went is the ceremony around reporting it. The percentages and stroke-order notes were deleted rather than moved behind a toggle — a mismatch percentage is the grader talking about itself. `i18n:check` caught the three strings the panel owned and they are gone from all 32 locales. |  |
| **I-47** | Twelve of the hundred were quotations. The rest were encouragement written for this app — "Two words a day is seven hundred a year", "Progress is quiet" — labelled honestly in the data and not on the screen, which is the only place it counts.  The library is now **20 quotations, each by a named person, each from a work and a place in it a reader can check**: Confucius to Analects II.15 and XV.30, Seneca to letters 7 and 76, Aristotle to Nicomachean Ethics 1103a, and King Sejong to the preface of the Hunminjeongeum — which is the right quotation for this product to carry.  **Proverbs went with the app-authored lines.** A byline reading "Korean proverb" is a category where a name should be, and a proverb has no author to verify. 꿈을 크게 가져라 is withdrawn for the same reason: it used to ship deliberately unattributed because its three circulating attributions are all wrong, and under a policy requiring a person, a quotation nobody can be credited with is not one.  **A fresh line on every open**, never the same one twice running, nothing persisted. Pinning it to the calendar day had made decoration into stored state — a key, a date, a migration — for a sentence at the foot of a screen.  `quotes:qa:check` enforces the policy: 16–24 lines, no duplicate sentence in any locale, every byline a person and not a category, every source carrying a work and a date with no hedging words, all 640 renderings present, and nothing written to storage — proved by handing the module a `localStorage` and failing if anything lands in it. |  |
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
| **I-78** | Not the level model and not `planNewWords`, both of which are correct — the search window for a learner at 30 is levels 27–30 and 남자 cannot come out of it. It was the plan cache. A `DailyPlan` was identified by its date and its goal, so the plan built when the app first opened, at the default level, was still "current" after the test. Every new learner meets this, because sitting the test is something you do just after opening the app for the first time, which is exactly when a default-level plan has been written.  `DailyPlan` now records the level it was built for and `planIsCurrent` compares it. A goal change still takes effect tomorrow — a goal is a preference — and a level change takes effect at once, because a level is a measurement. A plan stored before the field existed is kept rather than discarding somebody's day on upgrade.  `domain/vocabularyLevel.test.ts` holds four fixtures against the real corpus: a level-30 plan contains nothing below 27 and does not contain 남자, a level-1 plan contains nothing above 3, a plan built at 1 is refused for a learner at 30, and a plan with no level is kept. Negative-tested.  Read rather than counted afterwards, 30 days at seven levels: level 1 gets 차, 당신, 가다, 엄마, 오늘; level 30 gets 기울다, 물리치다, 웅크리다, 일석이조, 새옹지마. Zero words below 28 in 300 recommendations at level 30. | Nothing outstanding for the defect. The corpus limit behind it is I-79. |
| **I-85** | Photographed on the running product after the previous pass reported PASS. Reproduced from the shipped `dist` on a local preview, so the contradiction was in the artefact and not in the photograph.  Three simultaneous defects, only one of which the previous pass had touched:  1. **The two uprights' x-positions** — corrected last pass, by a one-dimensional metric. 2. **The bars were authored too short**, so the left half of ㅙ did not reach the right half. 3. **`shapeToFace` assumed the pen widens the ink box on all four sides.** It does not: with butt caps a stroke is widened only perpendicular to its direction. Every one of the 40 jamo therefore had the wrong proportion — ㅐ and ㅒ by 12% — and the compound vowels, which are the widest, were worst.  Fixed by re-authoring the whole vowel table in face ink-box fractions and replacing `shapeToFace` with an iterative solve over a `drawnInkBox` that pads each segment by the pen only perpendicular to it. Verified against Pretendard rather than against the app's own other drawing: `docs/report-assets/compound-vowels-before.png` and `compound-vowels-after.png` are the same eleven letters overlaid on the face, before and after. | Done. The gate that would have caught it is I-86. |
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
| **I-71** | Root-caused rather than patched. `WordDetailPage` matched dictionary senses to the taught word by comparing short glosses, and nothing on that path looked at the part of speech. Wiktionary carries a rare *nominal* 거의 glossed "almost", the gloss matched the taught adverb's, and its citations came through.  Measured before changing anything: 250 sentences reach a taught card across 214 words, 9 of them from a sense of another part of speech. Eight are harmless — 오늘 and 지금 are taught as nouns and Wiktionary files an adverb sense for each, and 오늘 뭐 했어요 is the ordinary sentence. One class is not: a *nominal* sense under a non-nominal card, whose citations demonstrate case marking the card never taught.  Fixed with `compatiblePartOfSpeech` in `data/exampleQuality.ts`, a one-way rule — a nominal sense may only lend sentences to a nominal word, and nothing stops the reverse. It drops exactly the two 거의 sentences and keeps the other 248. `exampleQuality.test.ts` holds the fixture and was negative-tested: with the rule stubbed to `true` it fails.  The sentences are not banned. On the dictionary page they now sit under "noun · used exclusively with the particles -가 and -를" and illustrate precisely what that label says, which is what a reference entry is for. | Nothing outstanding. |
| **I-73** | The reader folds a corpus by stripping an ending off each token — 먹었어 gives its count to 먹 — and two of the commonest endings cannot be stripped as strings. 감사합니다 is 감사하 plus ㅂ니다, where the ㅂ is the final consonant *inside* 합, so `endswith('ㅂ니다')` is false and always was. 감사해요 is 감사해 plus 요, and neither 해요 nor 어요 comes off it; 요 cannot go in the fold's list because it is also a case particle.  `conjugate.written_forms` now generates those finished tokens and they are matched whole, with `_reachable_by_fold` skipping any form the fold already credited so nothing is counted twice. Effect: 감사하다 11→4, 미안하다 9→4, 죄송하다 12→7, 마시다 6→4, 고맙다 6→4, 축하하다 11→8. All 162 anchors still hold and every level stayed populated. | Nothing outstanding. The residual is that a subtitle corpus under-represents concrete nouns generally — 딸기 and 수박 sit at 11 — which the editorial `usefulness` score is the dial for. |
| **I-76** | No content difference exists and none could be produced. A repository-wide search for `matchMedia`, `innerWidth`, `isMobile`, `isDesktop` and `useMediaQuery` returns three call sites — the colour scheme, reduced motion, and native inset padding — and none is near the dictionary, which fetches one manifest, one index and one content-hashed chunk regardless of window width.  That is an argument, not evidence, so `e2e/dictionary-viewport.spec.ts` was written to answer the question the report actually raises. It opens the same entry at 360, 390, 412, 430 and 1440 in one browser session and compares a logical fingerprint: the headword, every readable string on the page in order, and — because it is the one control that really can hide content — whether the "4 other meanings" disclosure is open. Identical at all five widths, for a taught headword and an untaught one.  What is different at the two sizes is the layout: the senses reflow and the source line wraps. That is what a reader comparing two screens sees. | If the reporter can reproduce it, the fingerprint in that spec is the thing to capture on both devices; a difference will show as a diff rather than as an impression. |
| **I-77** | Root cause in `pronunciation.py`. `pattern_of` returned `liaison` as its *catch-all* — the answer for a word that sounds different from its spelling and matched none of the five named rules. What actually lands there is 받침 neutralisation: 옷 is [옫], 꽃 is [꼳], and nothing slides anywhere in either. `note_for` then excluded liaison from word cards, correctly, because a note on every liaison word would be a note on hundreds of cards. The build took the *lesson's* data from `note_for` as well, so the pattern the file's own comment calls "taught once, in the sound-change lesson, where it belongs" was taught nowhere.  Three changes. `_fires` now has a liaison rule — a 받침 with a vowel behind it, which is the whole rule — and `pattern_of` returns None for a word whose only difference is neutralisation. `sound_for` is what the build reads and includes liaison; `note_for` keeps the smaller `NOTEWORTHY` set for cards, and the app is told which those are through a new `noted_patterns` table rather than repeating the judgement in TypeScript.  147 taught words now carry liaison. The lesson shows six sections, and the six leads are 있다 → 읻따, 좋다 → 조타, 끝나다 → 끈나다, 연락 → 열락, 같이 → 가치, 음악 → 으막 — read and checked against 표준발음법, along with the twelve further examples.  `e2e/sound-changes.spec.ts` is the guard, and it is not a DOM count: it asserts a card per pattern that has copy, and three example pairs *per card*, because palatalisation has three words in the whole corpus and would vanish silently if one moved. Negative-tested by disabling the liaison rule — both tests fail, one on the missing section and one on “The sound slides over” showing 2 examples rather than 3. | Nothing outstanding. |
| **I-83** | These two are in `HANDWRITTEN_GUIDE`, so both the tracing guide and the stroke demonstration come from the authored centrelines — which means the geometry is the product's own and not the face's, and `glyphshape:qa` scored them 100% in both directions the whole time. It compares the two representations to each other; when both are authored, agreeing with each other says nothing about agreeing with Korean.  Measured instead against Pretendard, off one canvas with one ruler: the app's uprights against the face's, as a percentage of each letter's own ink box. ㅙ 64/95 against 69/93; ㅞ 76/95 against 71/93. Reauthored to 63/84 and 65/86, which measure 71/95 and 72/95 — gaps of 24 and 23 against the face's 24 and 22.  The six-face guide fixtures were regenerated (36 entries changed) and `strokes:visual` still passes, which is the check the ㅞ connector's low position exists for. | Nothing outstanding. |
| **I-86** | `glyphshape:qa` scored the six `HANDWRITTEN_GUIDE` letters — ㅙ ㅞ among them — against geometry with the same origin. It now defers them, and `scripts/letter-face-qa.mjs` is the gate that reads them, rasterising each letter and the same letter set in Pretendard at 1024 px and comparing aspect, ink-island count, twenty-band horizontal and vertical profiles, and anchor-aware upright positions. Negative-tested by pulling one upright 4% out of place and by shortening one crossbar: both reported. | Done. `npm run letters:face:check` is in `verify:quick`. |
| **I-53** | Thirty-one languages already used one noun for both — Uložená slova / Chybná slova, 保存した単語 / 間違えた単語, 저장한 어휘 / 틀린 어휘 — so English was the only string that changed, to "Wrong words". `copy:audit` now compares the pair in every language by shared token, falling back to a two-character run for the three languages that write without spaces. Not by last word (the head noun is last in German and first in Vietnamese) and not by longest shared run, which was the first attempt and passed "Gemerkte Wörter" against "Verpasste Vokabeln" on the "te " in the middle of two unrelated adjectives. Proved by breaking German, English and Chinese in turn. | Done. |
| **I-54** | Every content locale used to be all-or-nothing, so any hole meant the build had gone wrong. §33 changed that: `strictMeaning` resolves in the learner's own language or not at all, so an unwritten row removes a word from that language's quiz pool, which is the designed behaviour. A measurement cannot tell an unfinished language from a broken one, so the promise is declared: `scripts/lib/locale-status.mjs` names the ten that must be perfect, and `vocabulary:qa` and `vocabulary:sense:qa` import it rather than keeping their own copy. A gap in one of the ten still fails, verified by blanking a row in the Japanese pack. The other twenty-two are reported as coverage.  The two browser gates had a related fragility: they assumed somebody had left `vite preview` running, and passed inside `verify:release` for exactly as long as that was true. `scripts/lib/preview.mjs` starts one if the port is silent and leaves an existing server alone. | Done. |
| **I-57** | `reach` in the level-test manifest had said 30 for ten languages, from a manifest that had not been rebuilt. Rebuilt, it is 30 for English, 25 for the nine other complete packs and 23 for the twenty-two — see the matrix in §23. `levelTest:result.ceiling` is written in all 32 and shown only where the ceiling is below the scale, with an end-to-end test in Hungarian asserting it appears and one in English asserting it does not. | Done. |
| **I-60** | Found by rendering the Korean screens and reading them, not by grepping. Eleven strings moved from 어휘 to 단어 — 어휘 is a person's lexicon and stays in the level test — and twenty-eight from 글자 to 낱자, wherever the English says "letter"; 글자 stays wherever the thing is a block, which is fourteen more. `review.prompt.build` was a mistranslation rather than a slip: English says "Put the word together" over a tray of syllables and Korean said 글자를 순서대로 놓아 보세요.  All three are gates in `locale:editorial`, each negative-tested by putting the defect back. The register rule reads sentence endings rather than pronouns, which is where Korean marks it — the file had said Korean needed no rule because 해요체 "has no competing form in this product's copy", a claim about the copy the copy did not support. The 낱자 rule uses the English as the referent and exempts any Korean string using both words, because that is a sentence drawing the distinction on purpose. | Done. |
| **I-61** | Not findable in a bundle: every string involved is correct on its own. `screens:audit` already renders 17 routes and 6 states across 7 profiles, and now reads the text it has in front of it for a sentence rendered twice and a number rendered twice inside one card. `LettersPage` had suppressed the heading case with a proxy — `lessons.length > 1` — which passed unit 11, a two-lesson unit still named after the first of them. The rules had to learn two exemptions: a licences list printing "· OFL 1.1" on six rows is a template, and the first version of the count rule passed the very card it was written for, because "0/10" sits in a `<strong>` inside the `<p>`. | Done. |
| **I-62** | `BuildExercise` and `ChoiceExercise` now use `common:verdict.*`, so the wording is decided in one place and is already written in all 32 languages; `learning:review.right` and `.notQuite` are gone from every bundle. The answer stays on the screen below the verdict on purpose — a choice question cannot be retried where it stands, so "Incorrect." alone would be a review that teaches nothing. What is forbidden is the verdict and the answer fused into one breath, 맞아요, 고예요, and that is gone. `feedback.spec.ts` walks a vocabulary session to a real question and answers it, which is how the gap was found. | Done. |
| **I-63** | **The locale walk waited thirty seconds for every click it expected to fail.** `locale-quiz` walks a session in six languages clicking opportunistically; both clicks are written as try-it-and-carry-on and the `.catch()` says so. A bare `click()` carries Playwright's default 30-second actionability timeout and waits the whole of it out *before* the catch runs, so one covered button costs half a minute and fourteen steps of that is 420 seconds against a 180-second test. That is what the failure had looked like every time: a different language each run, three minutes long, no assertion in the trace. Two seconds a click — six locales in 51 seconds, down from 4.4 minutes with one failure.  **The offline test cut the network before the worker was in charge.** `navigator.serviceWorker.ready` resolves when a worker is *active*; a worker that is active and has not claimed the page controls nothing, so the fetch went to a network that had just been switched off. "Failed to fetch" was a race with `clients.claim()`. The test waits for `serviceWorker.controller` now, which is the thing it actually depends on.  Both were found by running the whole suite from the final commit rather than the specs that had changed, and the clean run after them is 336 of 336, exit 0. | Done. |
| **I-68** | `leveltest:ambiguity` passed all 420 contextual items before and after, on all twelve of its rules. These were found by reading the 60 the new vocabulary added, one at a time against their three distractors. All three shared one cause: the example sentence was a bare frame whose only verb fits anything — 보내다, 하다, 사다 — so nothing constrained the blank. | Done. The class is recorded rather than gated; see docs/final-launch-audit.md §7. |
| **I-69** | One full run of the end-to-end suite failed on `a ta session never offers an English answer` at 16.1 s while the same six cases passed in 56 s on an idle machine, and the mobile project passed the identical case in the same run. The walk advanced with `click()` then `waitForTimeout(300)`. When 300 ms is not enough the next step samples a screen that has not rendered, finds no option group, concludes there is no question on this screen, and clicks onward — past the question. Fourteen steps of that collects nothing and trips the guard that says a question must have appeared. | Done. |
| **I-72** | `_labels` in `scripts/content/wiktionary.py` read `{{lb\|ko\|…}}` with `\{\{(?:lb\|lbl\|label)\\|ko\\|([^}]*)\}\}` and split the capture on every pipe. `[^}]*` stops at the first brace, so a label containing a nested `{{m\|ko\|-가}}` was cut mid-template and the pieces became separate labels.  Rewritten to take the body by counting braces, split only on the pipes at its own depth, and render each part through the same cleaner the gloss uses. A second bug surfaced underneath: `_is_named` tested the text before an `=` without requiring that there be one, so every plain-ASCII positional argument looked like a named one and `{{w\|Joseon}}` rendered as nothing — 나그네's label read "of the period".  After the rebuild: 11,825 labels, 0 malformed. `dictionary-qa.mjs` now fails on a label containing markup, a pipe, or the string `ko`, and was negative-tested by putting one back. | Nothing outstanding. |
| **I-74** | Redrawn as the letter ㄱ and the syllable 가 — one letter, and two letters joined, which is the difference between the two courses stated in the alphabet the learner is here to read. Proportions were set by rendering Pretendard beside each candidate at the same size: the consonant's bar level with the vowel's top, the leg reaching two-thirds down, a lean of about ten degrees rather than the twenty the first draft had.  A first version marked the start of ㄱ with a filled disc, the way the stroke-order animations do. At the sizes these are used — 20px in the tab bar, 26px on the home cards — it read as a blob on the corner and was the only filled shape in an otherwise stroked set, so it is gone. Checked at 20, 24, 26, 40 and 72px in both colour schemes, and against the four neighbouring icons at tab-bar size. | Nothing outstanding. |
| **I-75** | Not a substitution. 글자 already meant the composed syllable block here, so replacing 낱자 with it would have made unit 1 read "a letter is grouped into a letter" — 낱자는 네모난 블록으로 묶이고, 블록 하나가 한 글자예요. The block is called 음절 now, 글자 means one letter and only that, and the fifteen sentences that named both were rewritten rather than swapped.  낱말 became 단어 everywhere except 위키낱말사전, which is the proper name of Korean Wiktionary. `audit-copy.mjs` now fails on either term in any language and was negative-tested. `locale-editorial-qa.mjs` already held a rule that one thing must have one name; its canonical terms were updated and it now runs in both directions, and it immediately caught a string this pass had left inconsistent — the brand description still called a syllable block a 글자. | Nothing outstanding. |
| **I-80** | Letters is ㄱㄴㄷ — the Korean for the alphabet the way ABC is the English. Words is a card with 가 on it, which is what a vocabulary card is.  Three things were got wrong on the way and each was found by rendering the icon at the size it is actually used rather than zoomed in. The first ㄱㄴㄷ ran together, because a 2px stroke with round caps puts a unit of ink past each endpoint and a nominal 1.9-unit gap is 0.1 units of daylight; the spacing is computed in ink now. The first Words icon was an open book, which says "reading" and not "words". The 가 on the card then took two passes: level tops and a leaned leg fixed the strokes but not the block, because with a short leg all of the ㄱ's ink sits in the upper left and the two components read as two pieces. The face runs the leg most of the way down so they overlap; that is what it does now.  Checked at 16, 20, 24, 26, 32 and 96px, in both colour schemes, in a 320px tab bar beside its four neighbours, and in the home cards on their amber squares. | Nothing outstanding. |
| **I-81** | `ListPage.module.css` used `--hg-primary`, the fill colour, where `ReviewPage.module.css` already used `--hg-primary-text` for the same link — the same hue at the brightest value that clears 4.5:1 on white and on the warm tint. Found by `e2e/accessibility.spec.ts`, which reports axe's colour-contrast rule; fixed and re-run. | Nothing outstanding. |
| **I-82** | The check counted occurrences of each answer option in the page text after a hint and required fewer than two, on the reasoning that each option appears once in its own button. It reported 여기 offered against *there*, *over there*, *here* and *I, me*: "there" occurs twice and both are buttons, because one option is a substring of another.  Rewritten to measure what it is named for — the page is read before and after the hint and no option may occur more often afterwards. Stricter than the count as well as correct: a hint that repeated an option already on screen twice would now be caught. | Nothing outstanding. |
| **I-84** | One list now, taught words first, with the count over the whole of it. The distinction has not been dropped — it is made where a learner acts on it, on the entry they open, which still opens with exactly that line. `e2e/dictionary.spec.ts` follows them there rather than asserting the heading.  The empty state was fixed in the same place. It had three branches where the hook has four states, and the missing one was `unavailable`: a learner whose dictionary index had failed to download — offline in a train, which is the case that state exists for — was told "Nothing matches", about a word the dictionary certainly has. Four branches now, one per state. | Nothing outstanding. |
| **I-87** | Every escape in the gate accepted a recorded surface form that merely *starts* with the stem, because an example may continue past any ending the module generates — 먹어서, 먹었는데. The honorific's whole difficulty is in the joint between stem and ending: 있다 takes 계세요, a consonant stem takes 으세요, an ㄹ stem drops the ㄹ. Injecting 있세요, 만들세요, 듣으세요 and 먹시어요 produced a green run.  A form wearing the honorific is now held to the honorific. All four are reported; the corpus's own five honorific forms — 따라오세요, 건강하세요, 안녕하세요, 편찮으세요, 엄하세요 — still pass. | Done. |
| **I-88** | The paragraph was written when a simulation was planned and survived when it was not. It now runs: 12,800 four-option questions drawn from all 3,221 taught words, asked of every interface language through `strictMeaning`'s rule — the learner's own pack or nothing. 5,694 askable, 7,106 refused for want of a meaning, and no option resolved outside the learner's own language. It also asserts the routing, which is where the defect I-44 records actually lived; pointing `contentLocale` at English for a language the corpus has fails it.  A byte-comparison against the English string was tried and removed: it flags 두부 "tofu", 김치 "kimchi" and 택시 "taxi" in every Latin pack, because a loanword is the same word in both languages. | Done. |
| **I-90** | The previous pass added 치닫 to `D_IRREGULAR`, which fixed the module and the editorial pack. The bank had been built before that change and nothing rebuilt it, so `leveltest:ambiguity` reported `wrong-conjugation` on the shipped artefact. Rebuilt: 4,166 items, 566 contextual, and the 22 expanded languages rise from 645 reachable items to 1,021. | Done. The class — a generated artefact older than the rule that generated it — is the same one `release:current` exists for at the package level. |
| **I-96** | Found by comparing every pack's example translations against each other and against the English pack, which does make these distinctions. The check is three lines and had never been run.  **In the twenty-two partial packs**, written this cycle: 14 colliding groups, 12 of them wrong. 70 rows rewritten. One was a plain mistranslation rather than a flattening — Kyrgyz gave 그림을 그려요 and 사진을 찍어요 the same sentence, and сүрөт тартуу is drawing where photographing is сүрөткө тартуу.  **In the eight complete non-English packs**, shipped for several cycles and never checked this way: 66 colliding groups. 41 of them said materially different things — an email against a text message, a cup against a pane, attending school against going to it, an active against a passive, three registers of thank-you under one sentence — and 138 rows were rewritten across ja, zh-CN, es, fr, de, pt-BR, th and vi.  **25 groups are left and are deliberate.** They are near-synonym pairs the target language merges: 멈추다 and 정지 are both *el coche se detuvo*, 종일 and 내내 are both *todo el día*, 오래 and 오랫동안 are both *lange*. Inventing a distinction the language does not make would be worse than sharing a sentence, and the English pack itself shares 27 sentences for the same reason.  The gate that caught the last two rows was `examples:qa`, and it caught *this* work: two new Portuguese sentences invented a feminine subject for a Korean sentence that names nobody. Rewritten without the pronoun. | Done, and gated. `vocabulary:translation:check` compares every language's example translations against the English pack and fails on a pair that shares a sentence English separates, unless `content/vocabulary/shared-translations.json` names the pair with a reason — the same shape as `unobserved.json`. 25 accepted merges are written down; the ledger also reports an entry that has stopped merging, so it cannot rot. Negative-tested by putting the Japanese email-and-text-message collision back. |
| **I-43** | Kept as the record of a decision that was made and then reversed. Expanding to a hundred solved the repetition and introduced app-authored copy into a slot a reader takes for quotation; **I-47** cut it back to twenty, all named and all citable, and changed the selection from a persisted daily pin to a fresh line on every open. The intermediate state shipped in no release. |  |
| **I-89** | `hints:qa` reported both. The labels were renamed rather than the glosses, because the gloss is the word being taught: *Адамдар жана туугандар* and *Ta'lim va mehnat*. 0 leaking and 0 useless rungs afterwards. | Done. |
| **I-91** | `runs short and says so` asserted that ten days of level-1 recommendations cannot be filled, which was true while level 1's reachable pool held 93 words. The core-band work took it to 102 and the ten days filled. The demand is now set past whatever the pool holds — thirty days at the thin end — and the assertion is the invariant it always meant: the gap is reported as a deficit, and every word still comes from inside the zone. | Done. |
| **I-92** | `bundle:budget:check` reported 1454.1 kB / 1400.0 kB. The whole increase is the corpus half: band 1 is the band the splitter precaches in every language, so taking the twenty-two partial languages from 100 words to the 600-word core band put 500 words x 22 languages of meanings, example translations and 38 long definitions each into this one row. The JavaScript half did not move — 367 kB before and after, against 1,087 kB of corpus.  Budget raised to 1,500 kB with the reason written beside it, rather than the packs being trimmed to fit a round figure. Trimming would mean not precaching twenty-two languages a learner might be using, to save 54 kB.  The row that is still a finding is the projection beneath it: 3,741 kB at 10,000 words. It is reported and not enforced, and the answer when it arrives is to precache the learner's own language and fetch the rest on demand — the same band mechanism that already keeps first paint flat at 52.9 kB. | Done for today's size. The projection is tracked by I-04's arithmetic rather than separately. |
| **I-93** | `open()` in `vocabularyProgress.test.tsx` waits for the day's plan to be built over the whole corpus. At 2,581 words that finished inside testing-library's one-second default on a loaded machine; at 3,221 it did not, and a full `verify:release` — fifty test files, a production build and a Playwright suite competing for the same cores — reported `expected 0 to be greater than 0`. It passed on its own every time.  The third distinct place in this repository where a fixed delay became a false failure as the content grew, after two end-to-end walks. Fixed once rather than three more times: `configure({ asyncUtilTimeout: 5_000 })` in the shared setup, with the reasoning written there. Nothing in the unit suite measures speed — `perf:dictionary` does that, against a budget, on purpose — and a genuine hang still fails, five seconds later, with the same message. | Done. |
| **I-94** | `dictionary.spec.ts` exists to prove that search reaches the 30,282-word dictionary and not only the taught corpus, so it needs a headword the dictionary has and the syllabus does not. 나가다 was the first choice and turned out to be taught, so the dedupe correctly hid it and the test failed for the one reason that meant the feature worked. 가지 replaced it, survived three cycles, and this cycle's vocabulary batch taught it — the click landed on the word card and the entry never opened.  There is no safely untaught headword in a product whose plan is to grow the syllabus toward ten thousand words. The spec now reads the shipped dictionary index and the shipped corpus and picks the most frequent Hangul headword that is in the first and not in the second and carries at least three senses — frequency so the choice is a real word, three senses so the disclosure has something to disclose. The assertion that the disclosure opened reads the last sense's gloss out of the same entry instead of naming 가지's aubergine.  Deterministic, because the inputs are files: the same tree picks the same word every time, and a tree that teaches that word picks the next one instead of failing. | Done. |
| **I-95** | `a word can be saved, found again, and reviewed from its own list` clicked Save and then called `goto('/words/saved')`. The write to IndexedDB is asynchronous and on a loaded machine the navigation won.  The first fix was wrong in an instructive way: it waited for the button to read *Saved*, and failed with `element(s) not found`. The button's accessible name goes from "Save 하나" to "Remove 하나 from saved", so a locator written around the word *Save* stops matching at the exact moment the thing it is waiting for happens. That reads like the button vanishing and is the button answering correctly.  It now waits on `aria-pressed` going false → true, which is the same fact without the wording. Fourth timing assumption found this cycle, after two in the unit suite and one in the e2e walk before them; each was a clock or a rendering standing in for evidence that something had happened. | Done. |

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

**And one limit this cycle demonstrated rather than asserted.** A gate can only
compare a thing against something else. When the something else is generated by
the same code, the comparison is decorative — that is §7.2 and it is the reason
the previous edition of this document was confidently wrong. Where an
independent reference exists it is now used: Pretendard for letter shapes, two
OpenSubtitles corpora for frequency, the editorial pack's own recorded surface
forms for conjugation, the learner's own pack for question options, ko.wiktionary
for lexical relations. Where none exists — naturalness, register, variety, and
whether a level-20 learner *wants* the words level 20 holds — the report says
nobody has checked, and that list has not got shorter this cycle.

---

# 23. Verdict

## **LAUNCH READY WITH DISCLOSED NON-BLOCKING LIMITATIONS**

**A word about how much this verdict is worth.** The previous edition of this
document also said LAUNCH READY, and the compound vowels were broken on the
screen while it said so. That is the reason §7.2 is written the way it is and
the reason §2.2 now names the file each figure came from. A verdict is a summary
of evidence, and evidence that compares a thing with itself is not evidence. The
gates that were doing that have been replaced with ones that compare against
something outside the product: Pretendard for the letters, the learner's own
pack for the questions, the frequency corpora for the levels, the editorial
pack's own recorded surface forms for the conjugations.

**Why not NOT LAUNCH READY.** Nothing open causes a customer to lose data, see
wrong Korean, or be unable to complete the product's core journey. The one
data-loss mechanism found in these passes — word ids renaming under saved
progress — is pinned and negative-tested, and was negative-tested again this
cycle by renaming 가다 in the ledger and watching the copy packs drop a word.
The suites run green in full: 1,065 unit cases across three packages — 789 web,
180 Korean morphology, 96 handwriting — 346 end-to-end, 143 rendered screens,
256 locale screens, 60/60 on device. The
letters are checked against a face the app does not draw.

**Why not LAUNCH READY.** Four limitations are real, none is a defect, and a
buyer is entitled to know each of them before release:

1. **3,221 taught words against a stated target of 10,000.** The store copy says
   3,221 in all eight languages, so the product does not overstate itself — but
   anyone who was told 10,000 is coming should read §8.3 and §16 for what that
   actually costs, including the delivery line that does not fit at the target.
2. **Twenty-two of the 32 interface languages have word meanings 600 words
   deep** — 19% of the corpus, up from 3.4% this cycle. The interface is
   complete in all 32; the *content* is not, and the picker says so before the
   learner chooses.
3. **No locale has been read by a native speaker**, including Korean. §11.2 is
   the evidence that this matters and not a formality, and the 22,638 strings
   written this cycle are 22,638 more strings nobody has read.
4. **No physical device has run this binary**, and no human has used the
   product.

**What would change the verdict.** A native reading of Korean and of the ten
complete content locales, and one hour with the app on a real mid-range Android
phone. Neither is available from this machine, and neither is an engineering
task. The photograph that opened this cycle is the argument: a person looking at
the running product for one minute found what four green suites had not.

<!-- issues:next -->

| ID | What | Why it matters | Effort |
| --- | --- | --- | --- |
| **I-04** | 3,221 of a stated 10,000 words | Buyers compare corpus size | HIGH (content) |
| **I-12** | No export: clearing site data destroys the history irrecoverably | A learner who clears browser data loses everything | NONE — closed by decision |
| **I-13** | 252 of 3,221 words carry any verified lexical relation | Synonym and antonym sections rarely appear | NONE unless a conservative source appears |
| **I-17** | No locale has been reviewed by a native speaker, across 32 interfaces | Unknown awkwardness in thirty-one languages, and in Korean | HIGH (people, not engineering) |
| **I-79** | A learner at the top of the scale runs out of new words in about five weeks | Levels 28–30 hold 383 words between them, up from 221. A learner placed at 30 is taught ten a day from that zone and has met all of them in about five and a half weeks, after which their days come up short. They are not being taught badly — the words they get are right — there are simply not enough of them yet. | HIGH (content) — the hard half: words that are advanced and ordinary |
| **I-03** | The Hangyul hand-off is built but has no destination | A learner who finishes the alphabet finishes the product and stops. The card and the My Learning row render nothing rather than leading nowhere. | LOW — one environment variable, once the value exists |
| **I-19** | Word meanings are complete in ten languages and six hundred words deep in twenty-two | A learner in one of the twenty-two has a fully translated interface and word meanings for the 600-word core band — the band the corpus splitter puts on the critical path, so it is the band they meet first. Past that the card shows the English gloss, marked as English, and the *quiz* shows nothing: the product forbids a mixed-language question, so a word with no meaning in the learner's language is not asked about rather than asked in English. | HIGH (content) — 22 locales × 2,621 words to finish, and a speaker for each |
| **I-39** | The rendered interface has had a mechanical editorial pass, not a native reading, in 31 of 32 languages | Better than it was and still unmeasured where it matters. Seventy-eight real defects were found and fixed — five German screens addressed the learner as *Sie* in a product that says *du* everywhere else, and Italian, French, Turkish, Dutch and Filipino wrote the ASCII apostrophe on pages whose other sentences use the typographic one. Whether the *prose* reads naturally in Tamil or Kazakh is still not known. | HIGH (people) — 32 languages × 10 surfaces |
| **I-20** | The hand-written *More about it* block is on 71 words of 3,221 | Word Detail is no longer a short page followed by nothing, but the paragraph written by a person for the words where one line genuinely is not enough is on 71 of them — 2% of the corpus. | MEDIUM (content) — one paragraph per word, in ten languages |

<!-- /issues:next -->
