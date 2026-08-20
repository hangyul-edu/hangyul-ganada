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
| `vi` | 500 | 2,581 | `content/vocabulary/copy/vi.json`, written by hand |
| `th` | 500 | 2,581 | `content/vocabulary/copy/th.json`, written by hand |

**Vietnamese and Thai vocabulary is deliberately partial, and this is the honest
number.** The 500 are the first 500 words of the corpus, which is not an
arbitrary slice: the corpus is ordered by priority and the daily planner takes
new words from the front of it, so those 500 are exactly the words a learner
meets in their first fifty days at the default goal of ten a day.

Beyond word 500, `wordCopy` resolves down the fallback chain to English and
reports `isFallback`, which the interface renders marked with its source
language. That behaviour is not a workaround added for this — it is what that
module was written for, and until now no shipping locale had exercised it.

Filling the remaining 2,081 words × 2 languages is content work, not
engineering: drop the entries into the two files keyed by word id and re-run
`npm run content:vocabulary`. Nothing in the app or the build needs to change.

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

## 6. Known content defects found while translating

Translating forces a reading of every gloss against its own example sentence,
and several disagree. These are English-side defects, and they propagate into
every language:

| Word | Gloss says | Example says |
| --- | --- | --- |
| 네 | "who, whom" | "Yes, that's right." |
| 열 | "fever" | "Please count to ten." |
| 찍다 | "to take a photo" | "I stamped it with a seal." |
| 쓰다 | "to wear, to put on" | "I write my name." |
| 타다 | "to burn" | "I take the bus." |
| 정말 | "that which is true or genuine" | "Thank you very much." |
| 수도 | "waterworks" | "The capital of Korea is Seoul." |
| 파리 | "a fly" | (also the city; the example is the insect) |

The Vietnamese and Thai copy for these follows the **example sentence**, because
the example is what the learner reads on the card and it is the sense the
question is built around. That makes those eight entries deliberately
inconsistent with their own English gloss, which is the lesser of the two
wrongs and is recorded here rather than hidden.

The underlying fix is §18 of the brief — a stable taught sense per entry, with
the gloss, the example, the audio and the distractors all pinned to it. It is
not done.
