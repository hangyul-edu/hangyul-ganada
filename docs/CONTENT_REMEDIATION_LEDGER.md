# Content remediation ledger — 10 September 2026

*What was found in the learner-facing Korean content, what was done about it,
and what proves it. The machine-readable form is
`docs/content-quality-audit.json`; the per-item refusals are
the `ctx: 0` / `ctxWhy` pair in `content/vocabulary/entries/*.jsonl`.*

Severities: **P0** release-, data- or core-learning-blocking · **P1** major
educational or integrity weakness · **P2** meaningful quality improvement.

---

## C-001 — The photographed item, and the rule behind it — **P1**

**Evidence.** A reader photographed the Vocabulary Level Test at level 15:

```
창문으로 아침 ____이 들어와요.
목적 · 비빔밥 · 빛 · 환경
```

**Root cause — two, and they are independent.**

*The collocation.* 아침 빛 is not the phrase. Korean says 아침 햇살 or 아침 햇빛;
빛 takes no 아침 modifier. The sentence parses and no one says it.

*The distractors.* `build_level_test.mjs` forbade a distractor from the
answer's own browse category. It was written to stop two-right-answer items and
it made "unrelated to the sentence" the qualifying condition. **All 625
contextual items in the shipped bank had every distractor from a different
category than the answer** — measured, not estimated. The rule was selecting for
absurdity at the scale of the whole bank.

**Affected users.** Every learner who reaches a contextual item: the Level Test
above level 3, Today's Vocabulary and Review.

**User impact.** The item is answerable by elimination without knowing 빛, and a
learner who does know it learns nothing from being right. A placement test whose
items can be passed without Korean measures nothing.

**Business impact.** This is the paid product's headline assessment. A reviewer
photographed one screen and it was enough to disbelieve the bank.

**Fix.**
* The card's sentence is now `창문으로 빛이 들어와요.` — the modifier dropped
  rather than the noun swapped, because the card teaches 빛. Seven inline
  translations and twenty-four locale packs updated; two recordings remade.
* The distractor rule is **inverted for nouns**: a distractor must now share the
  answer's category or one of its tags. Predicates keep the old rule, where a
  same-area verb genuinely is a second right answer.
* `word_bit` is refused as a contextual item. Everything that comes in through a
  window — 바람, 소리, 공기, 냄새 — is a second right answer, and everything
  that does not is scenery. There is no defensible gap-fill here and the honest
  outcome is not to build one.

**Acceptance criteria.** No contextual item has a distractor from outside the
answer's subject area; the original item is a negative fixture that must fail.

**Verification.** `leveltest:distractors:check` — 451 contextual items, 0
findings. Negative-tested by restoring the old rule: **747 findings, exit 1**.

---

## C-002 — 292 words were filed by a match inside a longer word — **P1**

**Evidence.** `scripts/content/categories.py` writes its rules as alternations
`\b(head|face|…|pain|hurt|…)` — a word boundary in front and nothing behind, so
every alternative was also a prefix rule.

| word | gloss | matched | filed under |
|:---|:---|:---|:---|
| 화가 | a painter, an artist | `pain` | Body & Health |
| 그리다 | to draw, to paint | `pain` | Body & Health |
| 창문 | window | `wind` | Animals & Nature |
| 샌드위치 | a sandwich | `sand` | Animals & Nature |
| 생일 | a birthday | `birth` | Body & Health |
| 달러 | dollar | `doll` | Home |
| 베개 | a pillow | `pill` | Body & Health |
| 창고 | a warehouse | `war` | Society |
| 비밀번호 | a password | `pass` | Actions |
| 시작 | a start | `star` | Animals & Nature |

**Root cause.** The regex, and a `home` floor for any noun with no thematic
signal that swallowed a hundred-odd abstract nouns — 개념, 맥락, 전제 — into the
drawer for everyday objects.

**Affected users.** Everyone. The category is what the browse screen files a
word under, and it is what the Level Test's builder reads to choose a distractor,
so a wrong category is both a wrong shelf and a wrong wrong-answer.

**Fix.** A *no word character follows* lookahead on every rule, plus an English
inflection and derivation table so closing the accidental matches does not cost
the real ones. `-ter` is excluded deliberately (it gives *painter* → pain);
`-y` and `-ly` need a four-letter stem (*many* → man, *busy* → bus, *early* →
ear were each live miscategorisations on the first run). Then all eighteen
finished category listings were read word by word and the residue written down:
**`OVERRIDES` grew from 552 to 1,085 entries.**

**Result.** 134 words changed category. The two largest drawers shrank to
something a learner can browse: Home 328 → 186, Body & Health 240 → 198,
Time & Numbers 307 → 228.

**Verification.** `content:vocabulary:check`, `vocabulary:qa:check`,
`content:qa:check` green; the corrected assignments are spot-checked in
`docs/CONTENT_QUALITY_AUDIT.md`.

---

## C-003 — Two frame guards had never executed — **P1**

**Evidence.**

```js
if (inflects && isUnconstrainedPredicateFrame(anchor.example)) { … }
const eatingFrame = isConsumptionObjectFrame(anchor.example);
```

Both functions begin `if (!sentence.includes('____')) return false`. Both were
handed the sentence with the answer still in it.

```
isUnconstrainedPredicateFrame('일곱 시에 일어나요.')  → false
isUnconstrainedPredicateFrame('일곱 시에 ____.')      → true
```

**Root cause.** The wrong variable — `anchor.example` where `blanked` was meant.

**Why this matters beyond four items.** The first of the two is the fix that
I-185 and §20V.1 of the product report are about: the photographed
`일곱 시에 ____`, keyed 일어나요 and offering 연습해요. The rule was written, the
report recorded it as fixed, and **it has never once fired**.

**Why no gate saw it.** `leveltest:ambiguity` re-derives the frames from the
*shipped bank*, where the prompt does carry `____`, so it computed them
correctly and found nothing — because the distractor rule of the day was keeping
the offending options out for an unrelated reason. Inverting that rule (C-001)
removed the accidental cover and four items came straight through, which is how
this was found at all.

**Fix.** Pass `blanked`. **Verification.** `leveltest:ambiguity:check` reported
12 `consumable-option` findings against the repaired build and 0 after.

---

## C-004 — Five frame classes with no rule — **P1**

Found by reading all 625 contextual items. Each accepts the answer's whole kind,
so with plausible distractors every option is right:

| Class | Example | Items removed |
|:---|:---|---:|
| a bare noun modifying the noun behind it | `____ 가방을 샀어요.` | 51 |
| a time noun in a 에 slot | `____에 바다에 가요.` | — |
| a place in a 에 slot under a verb of going | `일요일에 ____에 가요.` | — |
| a subject under 있다 / 생기다 / 나오다 | `오늘 저녁에 ____이 있어요.` | — |
| a general verb whose only argument is the blank | `____을 새로 샀어요.` | — |

The last four are counted together: **74 items**, under
*the frame accepts the answer's whole kind*.

The general-verb rule needed one more correction to work: the "is there another
argument?" test read 으로/로 as well as 을/를/에/에서, and 새로 — an adverb —
parses as 새 + 로, so `____을 새로 샀어요` reported an argument it does not have.
서로, 따로 and 함부로 have the same shape.

---

## C-005 — Forty-eight items read and refused — **P1**

Where no rule decides, a person read the rendered item and wrote down the
verdict. The record is `ctx: 0` with a `ctxWhy` beside it, **in the entry
itself** — the flag the builder already consulted for six words refused by
earlier passes. 48 new entries; **54 in total**.

| Reason | Items | Example |
|:---|---:|:---|
| `twoAnswers` | 23 | `____에서 채소를 사요.` — 편의점에서 채소를 사요 is true |
| `absurdOptions` | 24 | `____가 물에서 놀아요.` — a wing and fog do not play |
| `collocation` | 1 | C-001 |

A first draft of this pass put those 48 in a new file,
`content/vocabulary/context-blocklist.json`, and the builder consulted both it
and `ctx`. That is two records of one decision, free to disagree — the fault
this repository keeps finding — so the file was deleted and its contents moved
into the entries.

An entry here is the last resort: each was checked first against "is there a
rule?", and the four classes in C-004 became rules instead.

---

## C-006 — Two Korean sentences a speaker would not write — **P2**

| Word | Was | Now | Why |
|:---|:---|:---|:---|
| 빛 | 창문으로 아침 빛이 들어와요. | 창문으로 빛이 들어와요. | C-001 |
| 핑크 | 핑크 색이 예뻐요. | 핑크색이 예뻐요. | 핑크색 is one word. A spacing error in a sentence shown to a beginner as a model, in an app that teaches spacing. |
| 금발 | 금발 머리가 눈에 띄어요. | 금발이 눈에 띄어요. | 금발 already means blond *hair*. 금발 머리 says hair twice. |

Found by scanning all 3,393 taught example sentences for a bare noun directly
modifying another noun — 496 pairs — and reading every one. The other 493 are
ordinary Korean (두 사람, 다음 주, 수업 시간, 회의 자료).

The 핑크 and 금발 translations were already "pink" and "blond hair", so none of
the thirty-one per-sentence translations changed; only the Korean and its two
recordings did.

---

## C-007 — A quality dimension with no gate — **P1**

`scripts/level-test-distractor-qa.mjs`, added to `verify:quick`. Nine checks,
eight negative fixtures that must fail, one corrected form that must pass.
Negative-tested: 747 findings against the pre-fix builder.

---

## C-008 — The rules took the beginner band's gap-fill with them — **P1**

**Evidence.** Two unit tests failed after the frame rules landed:
`reviewLists.test.tsx > asks about a wrong word in more than one way` (one mode
where two were required) and `honours the size the learner picked` (a plan of 2
where more than 5 was required). Measured:

| Gap-fills | before | after the rules |
|:---|---:|---:|
| levels 1–5 | 50 | 15 |
| levels 6–10 | 56 | 18 |

Of the top thirty words by teaching priority, **one** still had a gap-fill.

**Root cause.** Not a defect in the rules — the removed items really were
answerable by elimination. A contextual item needs a sentence with an argument
and a predicate that rules something out, and a level-2 card sentence is three
words long. The generator can only take a sentence written for a *card* and hope
it constrains a blank; at level 2 it does not.

**User impact.** A new learner is exactly who needs varied practice, and the
`context` exercise stopped being offered to them.

**Fix.** Twenty-two hand-written items in
`content/vocabulary/context-items.json`, validated by the builder against the
same rules the generated ones pass: particle agreement across all four options,
category sharing, level spread, the safety lists, and every one of the frame
rules. A curated item that fails is a build failure. The first draft had eleven
failures and the build printed each one — `고기 does not take 을`,
`____를 다쳐서 걷기 힘들어요 — nothing pins the blank down`,
`____을 씻고 밥을 먹어요 — 손 composes something unsafe here`.

Levels 1–5 recover to 36.

**Known limitation, stated rather than hidden.** Curated items carry **no
sentence audio**. The clip the renderer plays under a gap-fill is
`word.audio.example` — the *card's* sentence — and a curated item is a different
sentence, so playing it would be an audio/transcript mismatch. `cloze.json`
marks these `curated: true` and `exercises.ts` omits the audio rather than
playing the wrong recording. Recording them needs `export-speech-plan.mjs` to
learn about a second source of Korean sentences.

---

## C-009 — A unit test was asserting the defect — **P2**

`answerable.test.ts > never fills a gap with a word from the same corner of the
language` pinned the rule that produced the photographed item, and it was the
third place that rule lived — the builder, `leveltest:ambiguity`, and here.

It is now `fills a gap with words from the same corner of the language`, applied
to **noun blanks only**, with the reason and the photographed item in its body.
Predicates keep the old assertion, in `leveltest:ambiguity`, where it is right.

---

## What this pass did **not** fix

* **No native reader.** Every naturalness verdict here is a model's. The rows
  are written down so a native reader can disagree with a specific line.
* **Level calibration.** The difficulty model is curriculum-based and
  uncalibrated; there is no learner response data because the app opens no
  network connection.
* **The beginner band is thin in contextual items.** Levels 1, 2 and 4 have
  none: the rules that make a contextual item defensible need a sentence with an
  argument, and beginner sentences are short. The Level Test carries those levels
  on `meaning` and `produce` items, which is what it did before.

---

## Counts

| | |
|:---|---:|
| Rows in the audit | 8,254 |
| Contextual items before | 625 |
| Contextual items after | 473 |
| Removed by a new frame rule | 126 |
| Removed by editorial reading | 48 (54 including earlier passes) |
| Korean sentences rewritten | 3 |
| Contextual items written by hand | 22 |
| Words that changed category | 134 |
| `OVERRIDES` entries, before → after | 552 → 1,085 |
| New release-blocking gates | 2 (`leveltest:distractors`, `content:audit`) |
| Negative fixtures | 8 |
| Unit tests inverted | 1 |
