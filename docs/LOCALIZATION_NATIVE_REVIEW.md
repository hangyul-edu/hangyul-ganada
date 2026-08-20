# Localisation — coverage and review status

**What this document is for.** An automated check can prove that a string
exists, that its placeholders survived, and that it is not a copy of the
English. It cannot prove that a sentence reads naturally to somebody who grew up
speaking the language. Those are different claims, and this file keeps them
apart, because a product that says "10 languages" and means "10 languages that
have been through a machine" is making the more impressive of the two claims and
delivering the other one.

Nothing here is marked native-reviewed. No locale has been read by a native
speaker for this release.

---

## 1. Interface copy

All 554 interface strings, in all ten languages.

| Locale | Language | Keys | Automated QA | Native review |
| --- | --- | --- | --- | --- |
| `en` | English | 554 / 554 | pass — source language | source |
| `ko` | 한국어 | 554 / 554 | pass | **not reviewed** |
| `ja` | 日本語 | 554 / 554 | pass | **not reviewed** |
| `zh-CN` | 简体中文 | 554 / 554 | pass | **not reviewed** |
| `es` | Español | 554 / 554 | pass | **not reviewed** |
| `fr` | Français | 554 / 554 | pass | **not reviewed** |
| `de` | Deutsch | 554 / 554 | pass | **not reviewed** |
| `pt-BR` | Português (Brasil) | 554 / 554 | pass | **not reviewed** |
| `vi` | Tiếng Việt | 554 / 554 | pass | **not reviewed** |
| `th` | ไทย | 554 / 554 | pass | **not reviewed** |

What "automated QA pass" covers, via `npm run i18n:check` and
`npm run copy:audit:check`:

- no missing key, in any namespace
- no value byte-identical to the English one, except where the identity is
  deliberate and recorded per locale (`COGNATES` in `scripts/i18n-report.mjs`)
- every plural category the language actually has
- every interpolation placeholder in the source present in the translation
- no forbidden claim in any language — nothing calls itself official, nothing
  cites a TOPIK grade outside the hand-off card, nothing names the storage
  engine at a learner

What it does not cover, and cannot: register, idiom, whether a button label is
the verb a speaker of that language would actually use, whether an
encouragement sounds encouraging or arch.

## 2. Curriculum content

Content is not in the translation bundles — it lives with the curriculum — so
`i18n:check` never saw it. Two gaps were found by looking at the running app in
Thai, not by any check:

| Content | Coverage before | Coverage now |
| --- | --- | --- |
| Lesson titles (15) | `en`, `ko` only | all 10 |
| Letter copy — sound hint and mnemonic (73) | 8 locales | all 10 |
| Learning quotations (12) and their attributions | 8 locales | all 10 |

The lesson-title gap means **`ja`, `zh-CN`, `es`, `fr`, `de` and `pt-BR` have
been showing English lesson headings on the home screen since the curriculum
shipped**, in an app that reported 100% translation coverage. The checker was
right about what it measured and was measuring the wrong surface.

Vietnamese and Thai letter copy is written from the reader's own sound system
rather than translated from the English, which in these two languages is a real
gain and not a formality: ㅓ is simply *ơ* in Vietnamese and ㅡ is *ư*, where the
English has to reach for "the o in song" and "lips flat and wide, no English
equivalent". Thai has the same advantage with อือ.

## 3. Vocabulary meanings and example translations

| Locale | Words covered | Of | Source |
| --- | --- | --- | --- |
| `en` `ko` `ja` `zh-CN` `es` `fr` `de` `pt-BR` | 2,581 | 2,581 | the corpus entries; `pack.py` refuses an entry missing any of them |
| `vi` | 2,581 | 2,581 | `content/vocabulary/copy/vi.json`, written by hand |
| `th` | 2,581 | 2,581 | `content/vocabulary/copy/th.json`, written by hand |

All ten languages now carry a meaning and an example translation for every word
that ships. Vietnamese and Thai got there last, and by a different route: the
other seven are a property of every corpus entry and `pack.py` refuses an entry
that is missing one, whereas these two are separate files keyed by word id, so
a word with no line in them still builds and gets a `null` row.

That fallback is still live and still correct — `wordCopy` resolves a null row
down the chain to English and reports `isFallback`, which the interface renders
marked with its source language. Nothing about finishing the coverage removed
the machinery; a word added to the corpus tomorrow ships in eight languages and
falls back in two until somebody writes those two lines. `npm run
vocabulary:sense:qa` prints the count each run, so the number in this table is
checkable rather than remembered.

**Covered is not reviewed.** These 5,162 lines were written for this release and
not read by a native speaker of either language, which is the whole subject of
this document and is not changed by the coverage being complete. The specific
risks, in order:

- **Register.** Korean example sentences are in 해요체 and the translations are
  written as ordinary polite speech, but Vietnamese and Thai both encode social
  distance in ways that a sentence-by-sentence translation does not force you to
  decide. A native reader would notice a card that addresses the learner more
  familiarly than the rest of the app.
- **Thai spacing and word choice.** Thai is written without spaces between
  words, and the copy follows that. Where a Thai reading needs a space for
  clarity the choice was made by ear and is exactly the kind of thing a native
  speaker corrects at a glance.
- **Classifiers and counters.** 마디, 개, 명, 번 and the rest are counted words,
  and both languages have rich classifier systems whose correct choice depends
  on the noun. These were written case by case and not checked against a
  classifier table.
- **Verb glosses.** The Korean headword is an infinitive and English marks it
  with "to"; neither Vietnamese nor Thai has that marker, so a verb and its
  related noun can be glossed with the same word. Where the distinction
  mattered the gloss says so, and there will be entries where it should and
  does not.

## 4. Language-specific rendering

Checked by rendering the running app at 390 × 844 and looking at it.

**Thai.** Diacritics stack correctly above and below the line with no clipping
at any size used in the interface, including the tab bar. Thai is not written
with spaces between words, and nothing in the layout assumes it is — the app
uses `text-wrap: pretty` and normal flow, never a per-word break. Pretendard
carries no Thai, so Thai falls through the stack to the platform face, which is
the correct outcome and needs no font download.

**Vietnamese.** Every tone mark and diacritic renders, including stacked ones
(ế, ữ, ợ). Pretendard covers Vietnamese, so it is set in the same face as the
rest of the interface rather than falling back mid-sentence. Line height is
unchanged from the other Latin locales and clears the tone marks.

Neither language overflows a button or a card at the sizes used, and neither
truncates in the tab bar.

## 5. What a native review would have to cover

Per locale, in order of how much it would change:

1. **Encouragement and feedback.** "That's it.", "Not quite. Here it is.",
   "Nice work!" — the strings a learner sees most, and the ones where a literal
   translation reads as a machine most quickly.
2. **The hint ladder.** Ten languages × twelve hint templates, each of which has
   to be helpful without giving the answer away *in that language*. The
   automated check in `hints.test.ts` catches the mechanical failure — the
   answer appearing verbatim — and cannot judge whether the hint helps.
3. **Grammatical explanations.** The unit introductions, the sound-change notes,
   and the 받침 explanation, which is the hardest paragraph in the product.
4. **Family and person vocabulary.** 오빠, 형, 언니, 누나 have no single-word
   equivalent in most of these languages and are currently glossed with a
   parenthetical. A native speaker would know whether the parenthetical is how a
   learner's own language would say it.
5. **Polysemous entries.** See §6 below — several are wrong in English before
   they are translated at all.

## 6. Content defects found while translating, and what happened to them

Translating forces a reading of every gloss against its own example sentence,
and eleven disagreed. All eleven were English-side defects: the other seven
languages are written per entry and were right, and the English fell through to
a derived dictionary sense, which on a polysemous headword is a coin toss
against the example.

| Word | Gloss said | Example says | Gloss now |
| --- | --- | --- | --- |
| 네 | "who, whom" | "Yes, that's right." | "yes" |
| 열 | "fever" | "Please count to ten." | "ten" |
| 찍다 | "to take a photo" | "I stamped it with a seal." | "to stamp" |
| 쓰다 | "to wear, to put on" | "I write my name." | "to write" |
| 타다 | "to burn" | "I take the bus." | "to ride, to get on" |
| 정말 | "that which is true or genuine" | "Thank you very much." | "really, truly" |
| 수도 | "waterworks" | "The capital of Korea is Seoul." | "the capital city" |
| 있다 | "to exist" | "The book is on the desk." | "to be in a place" |
| 적다 | "to write, to write down" | "There is little money." | "to be few, to be little" |
| 전기 | "first period, early period" | "The power went out." | "electricity" |
| 마디 | "a joint" | "Let me say just one word." | "a word, a remark" |

Each now carries an authored `en` in the editorial pack, which the build prefers
over anything derived, and each is pinned by exact string in
`scripts/vocabulary-sense-qa.mjs` so a regeneration cannot quietly move the
sense back. 적다 needed its part of speech corrected too — the derivation had
taken the verb "to write down" for a headword whose example is the adjective.

The last three were found by finishing this translation, which is the argument
for doing it: a translator working from the example sentence writes
"electricity" beside a gloss that says "first period", and the disagreement has
to be resolved before the line can be written. No automated check found any of
the eleven, and none of the ones described in §1 could have.

파리 is not in the table and is not a defect of this kind: the gloss is "a fly"
and the example is about the insect, so they agree. The city is a second sense
the entry does not teach.

## 7. The "More about it" section

`WordDetailPage` has a section headed *More about it*, and until this release it
was filled by the build with the dictionary's second and third senses for the
word. It appeared on 784 of the 2,581 words and it said things like 개 "someone
who does the bidding of another", 문 "phylum", 산 "graveyard", 얼굴 "visage",
새 "straw thatch used for roofing", 전기 "prophase".

Two filters were written to salvage it. The looser one leaves 좋다 reading "to
be good; to be good" and 알다 repeating its own meaning; the stricter one still
keeps the thatch and the graveyard. That text is a dictionary talking *about* a
word, which is the precise thing `scripts/content/gloss.py` exists to keep away
from a beginner, and no shape rule turns it into writing.

So the section now renders only when there is authored copy for it, and there is
none yet in any language — the third slot of every copy row is `null`. §20 of
the brief asks for written multilingual depth on the top 500 words, which is
what belongs there. Until it is written, the answer to "more about it" is
nothing rather than trivia.

