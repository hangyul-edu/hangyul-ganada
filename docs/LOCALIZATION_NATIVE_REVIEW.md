# Localisation — coverage and review status

**What this document is for.** An automated check can prove that a string
exists, that its placeholders survived, and that it is not a copy of the
English. It cannot prove that a sentence reads naturally to somebody who grew up
speaking the language. Those are different claims, and this file keeps them
apart, because a product that says "32 languages" and means "32 languages that
have been through a machine" is making the more impressive of the two claims and
delivering the other one.

Nothing here is marked native-reviewed. **No locale has been read by a native
speaker for this release** — not one of the thirty-two, including the two the
product is about. That sentence is the point of the document and no table below
softens it.

---

## 1. What "supported" means, exactly

The app ships thirty-two interface languages. They are not all supported to the
same depth, and the difference is visible to a learner, so it is stated here and
on the language picker itself rather than only here.

Three layers, and each is a separate claim:

| Layer | What it covers | Languages complete |
| --- | --- | --- |
| **Interface** | every screen, button, label, empty state, error and accessibility string | 32 / 32 |
| **Alphabet course** | 15 lesson titles, 12 unit introductions, 73 letters' sound hints and mnemonics, 12 quotations, 6 typeface descriptions | 32 / 32 |
| **Vocabulary** | 2,581 word meanings, parts of speech, example translations | 10 / 32 |

A learner in one of the twenty-two languages without a vocabulary pack sees a
completely translated app with English word meanings on the word cards. That is
said on the row in the language picker before they choose it
(`settings:language.wordsInEnglish`), said again at the foot of the picker, and
marked in the markup itself: `LocalizedText` stamps the run with the `lang` and
`dir` it is actually in, so the bidi algorithm and the screen reader both get
the truth rather than a guess.

## 2. Interface copy

Every interface string, in every language. The key count differs by language
because plural categories do: Arabic writes six forms of a counted noun, Russian
and Polish four, Korean and Japanese one, and the bundle carries whichever the
language actually uses rather than whichever English needs.

| Locale | Language | Keys | Plural forms | Vocabulary pack | Native review |
| --- | --- | --- | --- | --- | --- |
| `ar` | العربية | 667 | 6 | **English** | **not reviewed** |
| `bn` | বাংলা | 555 | 2 | **English** | **not reviewed** |
| `cs` | Čeština | 611 | 4 | **English** | **not reviewed** |
| `de` | Deutsch | 555 | 2 | yes | **not reviewed** |
| `el` | Ελληνικά | 555 | 2 | **English** | **not reviewed** |
| `en` | English | 555 | 2 | yes | source |
| `es` | Español | 583 | 3 | yes | **not reviewed** |
| `fil` | Filipino | 555 | 2 | **English** | **not reviewed** |
| `fr` | Français | 583 | 3 | yes | **not reviewed** |
| `hi` | हिन्दी | 555 | 2 | **English** | **not reviewed** |
| `hu` | Magyar | 555 | 2 | **English** | **not reviewed** |
| `id` | Bahasa Indonesia | 527 | 1 | **English** | **not reviewed** |
| `it` | Italiano | 583 | 3 | **English** | **not reviewed** |
| `ja` | 日本語 | 530 | 1 | yes | **not reviewed** |
| `kk` | Қазақ тілі | 555 | 2 | **English** | **not reviewed** |
| `ko` | 한국어 | 530 | 1 | yes | **not reviewed** |
| `ky` | Кыргызча | 555 | 2 | **English** | **not reviewed** |
| `mn` | Монгол хэл | 555 | 2 | **English** | **not reviewed** |
| `nl` | Nederlands | 555 | 2 | **English** | **not reviewed** |
| `pl` | Polski | 611 | 4 | **English** | **not reviewed** |
| `pt-BR` | Português (Brasil) | 583 | 3 | yes | **not reviewed** |
| `ro` | Română | 583 | 3 | **English** | **not reviewed** |
| `ru` | Русский | 611 | 4 | **English** | **not reviewed** |
| `sv` | Svenska | 555 | 2 | **English** | **not reviewed** |
| `ta` | தமிழ் | 555 | 2 | **English** | **not reviewed** |
| `te` | తెలుగు | 555 | 2 | **English** | **not reviewed** |
| `th` | ไทย | 555 | 1 | yes | **not reviewed** |
| `tr` | Türkçe | 555 | 2 | **English** | **not reviewed** |
| `uk` | Українська | 611 | 4 | **English** | **not reviewed** |
| `uz` | O‘zbekcha | 555 | 2 | **English** | **not reviewed** |
| `vi` | Tiếng Việt | 555 | 1 | yes | **not reviewed** |
| `zh-CN` | 简体中文 | 530 | 1 | yes | **not reviewed** |

What "automated QA pass" covers, via `npm run i18n:check` and
`npm run copy:audit:check` — which run over all thirty-two:

- no missing key, in any namespace
- no value byte-identical to the English one, except where the identity is
  deliberate and recorded per locale (`COGNATES` in `scripts/i18n-report.mjs`)
- every plural category the language actually has, from `Intl.PluralRules`
- every interpolation placeholder in the source present in the translation
- no hint that contains its own answer, in any language (`hints.test.ts`)
- no forbidden claim in any language — nothing calls itself official, nothing
  cites a TOPIK grade outside the hand-off card, nothing names the storage
  engine at a learner

What it does not cover, and cannot: register, idiom, whether a button label is
the verb a speaker of that language would actually use, whether an
encouragement sounds encouraging or arch.

## 3. Curriculum content

Content is not in the translation bundles — it lives with the curriculum — so
`i18n:check` never sees it, and a 100% key report says nothing about it. This
is the surface that has twice shipped in English under a fully translated
interface, so each piece now has a test that reads `AVAILABLE_LOCALES` rather
than a hand-written list of languages:

| Content | Where | Guarded by |
| --- | --- | --- |
| Lesson titles (15) | `data/characters.ts` | "titles every lesson in every shipping locale, with no fallback" |
| Letter sound hints and mnemonics (73) | `data/characterCopy.ts` | "explains every letter in every shipping locale, with no fallback" |
| Mnemonic presence | both | "keeps a mnemonic present or absent in every language alike" |
| Quotations and attributions (12) | `data/quotes.ts` | "carries a quotation in every language the product ships" |
| Typeface names and descriptions (6) | `data/fonts.ts` | "names and describes every practice typeface in every shipping locale" |
| Unit vs lesson heading agreement | both | "calls a unit the same thing in its heading and on its card" |

That last one is worth naming. A unit heading and the lesson card under it use
the same phrase in English — *The e vowels*, *A letter at the foot* — and in
twenty-eight of the thirty-two languages they had drifted into two different
phrasings, printed three centimetres apart on the Letters screen. English had
none, so nobody reading the app in English could see it.

The letter copy is written from each reader's own sound system rather than
translated from the English, which for several languages is a real gain and not
a formality: ㅓ is simply *ơ* in Vietnamese and ㅡ is *ư*; Russian and Kazakh have
ы for ㅡ; Turkish has ı; Thai has อือ — where the English has to reach for "the o
in song" and "lips flat and wide, no English equivalent".

## 4. Vocabulary meanings and example translations

| Locale | Words covered | Of | Source |
| --- | --- | --- | --- |
| `en` `ko` `ja` `zh-CN` `es` `fr` `de` `pt-BR` | 3,221 | 3,221 | the corpus entries; `pack.py` refuses an entry missing any of them |
| `vi` | 3,221 | 3,221 | `content/vocabulary/copy/vi.json`, written by hand |
| `th` | 3,221 | 3,221 | `content/vocabulary/copy/th.json`, written by hand |
| the other 22 | **600** | 3,221 | `content/vocabulary/copy/<locale>.json` — the 600-word core band, written by hand, **read by no native speaker** |

**The twenty-two moved from 0 to 100 and then to 600, and the reasoning that
kept them at 0 is worth reproducing rather than deleting.** It said: 2,581 words
× 22 languages is roughly 57,000 lines, writing them without a speaker of each
language would produce exactly the machine-translation tone this document exists
to refuse, and shipping them would convert an honest, visible English fallback
into 57,000 sentences that look authored.

Two things changed and neither of them is "a speaker was found".

First, the *quiz* stopped falling back. `strictMeaning` resolves in the
learner's own language or not at all, so a word with no meaning in Tamil is not
asked about rather than asked in English. That turned the gap from a
mixed-language defect into a smaller lesson, and it made depth worth buying: a
language with 100 words can ask a hundred questions and one with 600 can ask six
hundred.

Second, the scope was bounded. 600 is band 1 — the band the splitter puts on the
critical path and the worker precaches — so it is the band every learner meets
first, and it is 13,200 pairs rather than 57,000 lines. That is a quantity a
reviewer could actually be asked to read.

**They are still not reviewed.** This document does not claim otherwise and the
report does not either: `locale:content:qa` reports coverage, and coverage is not
review. The fallback machinery is unchanged for everything past word 600 —
`wordCopy` resolves down the chain to English and reports `isFallback`, the
interface renders it marked with its real language, and the language picker says
so before the learner picks.

`npm run vocabulary:sense:qa` prints the covered count each run, so the number
in this table is checkable rather than remembered.

**Covered is not reviewed.** The ten complete languages were written for this
release and not read by a native speaker of any of them, which is the whole
subject of this document and is not changed by the coverage being complete. The
specific risks, in order:

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

## 5. Script and direction, checked by looking

Rendered at 390 × 844 in a real browser and read, screen by screen — home,
letters, words, one word card, review, my learning — not asserted by a test.

**Arabic, and right-to-left as behaviour.** `dir="rtl"` is set on the document
element from the resolved locale, so the whole layout mirrors: the tab bar
reverses, chevrons point the way forward for the reader, cards align to the
right edge, and progress bars fill from the right. Numerals and the Korean being
taught stay left-to-right inside it — `<bdi>` and an explicit `dir="ltr"` on
those runs — because a syllable block read right-to-left is a different
syllable. The one thing right-to-left is *not* is a set of translated strings,
and that is why this was verified on rendered screens.

Two bugs were found this way and only this way:

1. **A blank Arabic home screen.** `renderQuote` throws rather than falling back
   when a quotation has no translation for the active locale, and it is mounted
   inside Home — so the twelve untranslated quotations took the entire React
   tree down. White page, no message. Fixed by translating all twelve into all
   thirty-two, and guarded by a test that ties `QUOTE_LOCALES` to
   `AVAILABLE_LOCALES` so adding a language without its quotations fails the
   build instead of the app.
2. **A tab bar stuck in English.** The interface strings for a stored language
   arrive after the first paint. Every component that re-renders for any other
   reason picks them up, because `t` reads the store when it is called — and the
   bottom navigation, which has no state, no context and no changing props,
   never re-renders, so it kept the English it resolved on frame one. Under a
   fully Arabic home screen it read *Home / Letters / Words*. Fixed in
   `LocaleProvider` and guarded by a test that renders memoised chrome with the
   bundle deliberately absent at construction.

A note on faces before the scripts. The interface asks for Pretendard and then
the platform's own stack, and which of the two ends up drawing a given script is
the platform's decision, not the app's — a phone, a desktop browser and this
container all answer differently. So nothing below claims a typeface. What was
checked is what a learner can see: that every mark composes, that nothing renders
as a box, and that no line clips or overflows.

**Thai.** Diacritics stack correctly above and below the line with no clipping
at any size used in the interface, including the tab bar. Thai is not written
with spaces between words, and nothing in the layout assumes it is — the app
uses `text-wrap: pretty` and normal flow, never a per-word break.

**Vietnamese.** Every tone mark and diacritic renders, including the stacked
ones (ế, ữ, ợ), with no clipping against the line above.

**Devanagari, Bengali, Tamil, Telugu.** Conjuncts, vowel signs above and below
the line, and the Tamil and Telugu multi-part vowels all compose correctly and
clear the line box; nothing clips in a card, a badge or the tab bar. Telugu and
Tamil are also the tallest lines in the product and the Letters screen was read
end to end in both.

**Greek and the Cyrillic five** (Russian, Ukrainian, Kazakh, Kyrgyz, Mongolian).
Every letter renders, including the Kazakh and Kyrgyz letters that are not in the
Russian alphabet (ә, ғ, қ, ң, ө, ұ, ү, һ, і). Russian, Ukrainian, Polish and
Czech are also the longest of the thirty-two — "Значения слов на английском" is
nearly twice its English — and nothing in the interface truncates or overflows
at 390 px.

**Chinese and Japanese.** No vertical clipping, and no mid-sentence change of
face inside a run.

## 6. What a native review would have to cover
Per locale, in order of how much it would change:

1. **Encouragement and feedback.** The verdict a learner sees after every
   answer is now two words — `common:verdict.correct` and `.incorrect`, written
   in all thirty-two — and the strings around it ("Nice work!", "Pick up where
   you left off.") are the ones a literal translation reads as a machine most
   quickly. Two words are easier to get right than a sentence and no easier to
   *know* are right without a speaker.
2. **The hint ladder.** Thirty-two languages × twelve hint templates, each of which has
   to be helpful without giving the answer away *in that language*. The
   automated check in `hints.test.ts` catches the mechanical failure — the
   answer appearing verbatim — and cannot judge whether the hint helps.
3. **Grammatical explanations.** The unit introductions, the sound-change notes,
   and the 받침 explanation, which is the hardest paragraph in the product.
4. **Family and person vocabulary.** 오빠, 형, 언니, 누나 have no single-word
   equivalent in most of these languages and are currently glossed with a
   parenthetical. A native speaker would know whether the parenthetical is how a
   learner's own language would say it.
5. **Polysemous entries.** See §7 below — several are wrong in English before
   they are translated at all.

## 7. Content defects found while translating, and what happened to them

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
the eleven, and none of the ones described in §2 could have.

파리 is not in the table and is not a defect of this kind: the gloss is "a fly"
and the example is about the insect, so they agree. The city is a second sense
the entry does not teach.

### A person the Korean does not have

Korean drops the subject, and the example translations filled the gap. 발을
밟았어요 — a foot was stepped on, no owner named — read "I stepped on his foot";
목소리가 다정해요 read "Her voice is affectionate". Counted across the pack:

| Language | Rewritten | Still carries an invented third person |
| --- | --- | --- |
| English | 58 | 0 |
| Chinese | 67 | 0 |
| Portuguese | 59 | 0 |
| Spanish | 2 | 0 |
| German | 30 | 51 |
| French | 0 | 72 |
| Japanese | 0 | 0 — Japanese drops the subject as Korean does |

The count is itself a finding: of the 58 English, fifty said *he* and eight said
*she*, and the eight were the elegant, the graceful, the sweetly-spoken, the one
who dressed up and the one who plays the piano.

**What is left, and why.** French and German have no third-person singular that
is not gendered, and in both the masculine is the unmarked form for an
unspecified person, so "Il ronfle" does not assert what "He snores" asserts.
German's *possessives* do mark the owner's gender, which is why thirty of its
seventy-four could go; French's agree with the thing possessed, so *sa voix* was
never the problem. Recasting the remaining hundred and twenty-three with
*quelqu'un* and *jemand* would be faithful and would read like a grammar
exercise, and which of those two is worse is a judgement for a speaker of each
language. It is on the
review list rather than done.

`examples:qa` gates the rule in the five languages where it is decidable.

## 8. The "More about it" section

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

