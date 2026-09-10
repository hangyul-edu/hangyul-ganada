# The Korean content quality standard

*Written 10 September 2026, during the content-quality audit. It states what a
learner-facing Korean item has to be before it may ship, and — just as
importantly — which parts of that a program can decide and which parts it
cannot.*

---

## 1. Why this document exists

Every automated gate this repository had over the question bank asked one
question in different words: **is there a second right answer?**
`leveltest:ambiguity` asks it twenty-seven ways. `answerability` asks it of
every runtime-generated question in thirty-two languages. `leveltest:bank`
asks it of the glosses. They were right to ask it, and they got the bank to a
place where they all pass.

Nothing asked the other half. A four-option question fails in two directions:

| | |
|:---|:---|
| a distractor that is **also right** | the item has two answers |
| a distractor that is **obviously wrong** | the item has no wrong answers worth reading |

Only the first had a gate. A reader photographed the second:

```
창문으로 아침 ____이 들어와요.
목적 · 비빔밥 · 빛 · 환경
```

A purpose, a bibimbap and an environment do not come in through a window. The
item has exactly one defensible answer, which is why every gate was green; and
it teaches nothing, because a learner who has never met 빛 answers it correctly
by elimination and a learner who knows 빛 learns nothing from being right.

It was not a bad draw. The builder's rule said a distractor may not come from
the answer's own subject area — written to stop the *first* failure — so the
further apart two words were, the more certainly they satisfied it. **All 625
contextual items in that bank had every distractor from a different category
than the answer.** The rule was selecting for absurdity, at scale.

So: a standard, stated once, with the gate that enforces each clause named
beside it.

---

## 2. Grammar — machine-decidable, and gated

These are the clauses a program can settle, and each is settled.

| Clause | Gate |
|:---|:---|
| Particle allomorph agrees with the noun in front of it (은/는, 이/가, 을/를, 으로/로, ㄹ-final takes 로) | `leveltest:ambiguity`, `answerability` |
| Every option in a predicate slot is in the answer's own conjugated form | `leveltest:ambiguity` (`mixed-endings`) |
| No dictionary form in a slot that needs an inflected one | `leveltest:ambiguity` (`dictionary-form`) |
| Conjugation matches the stem class the morphology gives it | `conjugation:qa`, `korean:education` |
| Options share a part of speech | `leveltest:ambiguity` (`mixed-parts-of-speech`) |
| Unicode NFC; no duplicate option after normalising space and punctuation | `answerability`, `leveltest:distractors` |
| No empty stem, option or placeholder string | `answerability`, `content:qa` |
| Spacing and sentence-final punctuation | `content:qa`, `examples:qa` |
| Counter and number forms | `numbers:qa`, `numbers:domain` |
| Speech level is 해요체 throughout learner-facing Korean | `copy:audit`, and by reading |

**A green run on all of the above is a floor, not a ceiling.**
`scripts/korean-education-qa.mjs` says so in its own header and it is right:
저는 매일 물을 마시는 것을 합니다 passes every clause in this table and is not
Korean.

---

## 3. Naturalness — a person's judgement, recorded

No gate in this repository can decide whether a Korean speaker would say a
sentence. What the project does instead is make the judgement **explicit,
attributable and re-checkable**:

* Every taught example sentence is read. Findings go to
  `docs/CONTENT_REMEDIATION_LEDGER.md` with the corrected form beside the
  original.
* A sentence that is grammatical but not idiomatic is a **defect**, not a
  matter of taste. 창문으로 아침 빛이 들어와요 parses; the phrase is 아침 햇살 or
  아침 햇빛, and 아침 빛 is not what anyone says. It was rewritten to
  창문으로 빛이 들어와요.
* The specific things looked for: literal-translation word order, textbook-only
  phrasing, a modifier that no one attaches to that noun, a technically
  grammatical collocation the corpus never contains, an honorific or speech
  level that does not match the situation, and topic/subject marking that a
  native speaker would drop.

**This is a model's reading, not a native speaker's.** No locale in this
repository, Korean included, has been read by a qualified native speaker; see
§11.3 of the product report and I-17. Nothing in this document may be quoted as
native verification.

---

## 4. Educational value

| Clause | How it is held |
|:---|:---|
| One concept per beginner item | `leveltest:qa` shape checks; the difficulty model in `sentence_demand.py` |
| The item is levelled by its **whole sentence**, not by the word removed | `context_level` / `context_demand`, I-196 |
| No unexplained prerequisite | `dailyplan:level`, `synthetic:users:qa` |
| The stem relates to the learning objective | by reading |
| Useful real-life Korean, not a puzzle | by reading |
| No trick questions | by reading |

---

## 5. Question validity

Exactly one defensible answer, with **no hidden context**. The rules that
enforce it are in `scripts/content/build_level_test.mjs` and re-derived from the
artefact by `scripts/level-test-ambiguity-qa.mjs`. The frames refused outright,
because no distractor set rescues them:

| Frame | Example | Why |
|:---|:---|:---|
| nothing pins the blank down | `천천히 ____ 주세요.` | an adverb constrains no verb |
| the sentence says only *when* | `일곱 시에 ____.` | every predicate fits |
| a predicate that rules out no noun | `____이 마음에 들어요.` | every noun fits |
| a human agent slot | `____가 그림을 그려요.` | every person fits |
| the verb is 하다 and the blank is a doable noun | `친구와 ____를 해요.` | every activity fits |
| the object of a verb of eating, where the answer is food | `점심에 ____를 먹었어요.` | every food fits |
| a bare noun modifying the noun behind it | `____ 가방을 샀어요.` | every colour fits, or only one option is even a phrase |
| a time noun in a 에 slot | `____에 바다에 가요.` | every time fits |
| a place in a 에 slot under a verb of going | `일요일에 ____에 가요.` | every place fits |
| a subject under 있다/생기다/나오다 | `오늘 저녁에 ____이 있어요.` | everything fits |
| a general verb whose only argument is the blank | `____을 새로 샀어요.` | everything is bought |

The last five were written on 10 September 2026. The residue that no rule
decides is read and refused by hand in
the `ctx: 0` flag in `content/vocabulary/entries/*.jsonl`, whose `ctxWhy`
carries the rendered item and the reason.

---

## 6. Distractor quality — the clause that was missing

Every distractor must:

1. **Share the answer's subject area.** A noun distractor comes from the
   answer's browse category or one of its tags. This is the inversion of the
   old rule and it is enforced by `leveltest:distractors`
   (`implausibleDistractor`).
2. **Match the answer's part of speech and its inflected form** — already
   enforced.
3. **Sit within two levels of the answer**, so it is a word a learner at this
   level could plausibly hold.
4. **Be clearly wrong in the complete visible context** — enforced by the frame
   rules in §5, by the relation graph, by the reviewed conflict pairs, by the
   shared-argument rule and by the shared-predicate rule.
5. **Not become correct in another supported translation** —
   `leveltest:bank` compares options across all thirty-two meaning packs.

> A question that is easy only because three choices are nonsense is a
> low-quality question. It is a finding, not a pass.

**Predicates keep the opposite rule.** For a verb or an adjective a distractor
from the answer's own area usually *is* a second right answer — 내밀다 and 뻗다
both make `손을 ____` true — so `leveltest:ambiguity` still refuses a shared
category there. The two gates own opposite halves deliberately, and each names
the other; two gates asserting the same thing about one artefact is how §19.4a's
pair of self-checking gates happened.

---

## 7. Localisation

The Korean must be right **before** it is translated. A translation then has to
preserve the learning objective, the answer's uniqueness, the grammar point,
the difficulty and the tone. Held by `i18n:check`, `locale:content:check`,
`locale:ledger:check`, `copy:fresh:check`, `translation:semantics:check`,
`vocabulary:translation:check` and `leveltest:locale:check`; the ledger is
`docs/LOCALE_LEDGER.md`.

**Translation parity is not translation quality.** Parity is what those gates
measure. Quality is a native reader's judgement and remains outstanding.

---

## 8. What is still not decidable here

* Whether a *plausible* distractor is also a right answer. §5 removes the
  classes a program can see; the rest is `ctx: 0` in the entries.
* Whether a sentence sounds like Korean (§3).
* Whether the thirty levels correspond to anything a real learner would
  recognise. There is no learner response data — the app opens no network
  connection — so the difficulty model is curriculum-based and uncalibrated.

Related: `docs/CONTENT_QUALITY_AUDIT.md`,
`docs/CONTENT_REMEDIATION_LEDGER.md`,
`docs/CONTENT_GENERATION_AND_REVIEW_PIPELINE.md`.
