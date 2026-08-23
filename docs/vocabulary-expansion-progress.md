# Vocabulary expansion — batch ledger

**Target:** 10,000 taught entries. **Starting total:** 2,581 (verified from
`apps/web/src/data/generated/vocabulary.json`, not from the previous report).

Quality outranks the number. A batch is counted here only when every one of its
entries has passed the production gates — `content:vocabulary`, `examples:qa`,
`vocabulary:sense:qa`, `vocabulary:qa`, `conjugation:qa`, `content:qa`. Rejected
candidates are recorded, not hidden.

## What one entry costs

Measured on batch 1a rather than estimated. Each taught entry needs **20
authored strings**:

| Where | Strings |
| --- | --- |
| `content/vocabulary/entries/*.jsonl` — `m` | 7 meanings: ko ja zh es fr de pt |
| — `en` | 1 English meaning (an override; a raw dictionary gloss is refused by `gloss.problems`) |
| — `ex` | 1 Korean example |
| — `t` | 7 example translations: en ja zh es fr de pt |
| `content/vocabulary/copy/th.json`, `vi.json` | 2 meanings + 2 example translations |

The last row was a discovery of batch 1a: Thai and Vietnamese are *not* carried
on pack entries, so a batch that ignores them silently regresses two of the ten
complete locales from 2,581/2,581 to 2,581/2,631. `vocabulary:qa` catches it.

## Batches

### Batch 1a — 50 entries · 2,581 → 2,631

| | |
| --- | --- |
| Candidates considered | ~13,200 filtered from the 14,517 dictionary anchors |
| Selection | hand-picked useful modern vocabulary, levels 8–20: health, home, work, money, feelings, law, language, food |
| Authored | 50 |
| Accepted first pass | 48 |
| Rejected, then repaired | 2 |
| Duplicate removals | 0 words; 2 **sentences** |
| Final total | **2,631** |
| Remaining to target | 7,369 |

**Findings, both mine, both now gated.**

`14/duplicate` ×2 — 담배 was given 여기서 담배를 피우지 마세요, which 피우다
already owns, and 건강 was given 건강이 제일 중요해요, which belongs to 중요하다.
Rewritten as 담배 냄새가 옷에 배었어요 and 건강을 위해 매일 걸어요.

`15/meaning-absent` ×1 — "a cigarette" is not recognisable in "Please do not
smoke here." The same rewrite fixed it.

**`scripts/content/preflight_batch.py` is the response.** Both defects were
decidable without building anything, and finding them through
`content:vocabulary` → `examples:qa` costs minutes per round trip. The preflight
reads a candidate file *before* it is copied into the pack and refuses: a
missing field, a non-Hangul or over-long headword, a word already in the pack, a
word twice in one batch, a sentence another word already owns, a sentence
repeated inside the batch, an example the target does not appear in, a length
outside 2–8 eojeol, and a translation that invents a person the Korean does not
have. Negative-tested by giving one entry 가다's sentence and another an English
translation with "He" in it; both are reported.

It reports sentence-shape concentration rather than failing on it. The first
version failed a batch because eight of fifty sentences shared "… @… …." —
which is not a template, it is Korean. A batch cannot see the 2,600 sentences
already written; `examples:qa` can, and its rule is 1% of the whole corpus.

### Batch 1b — 50 entries · 2,631 → 2,681

| | |
| --- | --- |
| Selection | everyday nouns across body, home, clothing, travel, food, health, work, feeling — levels 12–22 |
| Authored | 50 |
| Refused by preflight, before any build | 1 (고객 was already in the pack; replaced with 감자튀김) |
| Accepted first pass through the gates | 48 |
| Rejected by `examples:qa`, then repaired | 2 |
| Final total | **2,681** |
| Remaining to target | 7,319 |

**Findings, both mine.**

`15/question` ×5 locales — 추천 좀 해 주세요 is a *statement* in Korean, a polite
request, and I had translated it as a question in five languages ("Could you
give me a recommendation?"). The gate compares mood across every translation and
was right. Rewritten as imperatives.

`O/advanced-grammar` + `O/register` — 양심에 따라 행동해요 uses 에 따라, a formal
connective the product does not teach at this level. Rewritten as 양심이
허락하지 않아요.

**The preflight paid for itself immediately**: 고객 was caught before a build
rather than after two.

### Batch 2a — 50 entries · 2,681 → 2,731

Deliberately **not nouns**: the first two batches were noun-heavy and the corpus
needed verbs, adjectives and adverbs to keep its part-of-speech balance.

| | |
| --- | --- |
| Selection | 30 verbs, 4 adjectives, 16 adverbs — work, travel, tech, shopping, health |
| Authored | 50 |
| Refused by preflight | 5 (연결되다 해결되다 확인되다 진행되다 제법 were already taught; replaced with 충전하다 환불하다 탑승하다 수리하다 어느새) |
| Rejected by the gates, then repaired | 2 |
| Final total | **2,731** |
| Remaining to target | 7,269 |

**A defect in the preflight itself, found by this batch.** It reported 쫓아오다,
합류하다 and 지시하다 as missing from their own examples. They were not: the
check stripped the final 다 and looked for the rest, and 쫓아오 + 았어요
contracts to 쫓아왔 — no amount of string-slicing knows that. It calls
`conjugate.appears_in` now, the same function the build uses. Korean morphology
has one implementation in this repository, and a second one written in a hurry
is a second one to be wrong.

**Two gate findings.**

`H/unknown-support` — 은행잎이 노랗게 물들었어요 leans on 은행잎 and 물들다,
neither taught nor common, for a word at 노랗다's level. Rewritten as 이 꽃은
노란색이에요.

`vocabulary:sense:qa` — 탑승하다 came out of the dictionary as a *noun* glossed
with an infinitive, "to board". Fixed with a `pos` override in the pack, which
is what that field is for.

**Part-of-speech balance after three batches:** verb 1,054 · noun 1,100 ·
adjective 288 · adverb 218 · pronoun 27 · interjection 21 · determiner 13 ·
numeral 10.

### Batch 3 — 113 entries · 2,731 → 2,844

| | |
| --- | --- |
| Candidates considered | 2,443 untaught anchors at level ≤18, read rather than filtered |
| Selection | **holes in the core**, not rarities — see below |
| Authored | 113 (103.jsonl 40, 104.jsonl 73) |
| Accepted first pass | 108 |
| Rejected, then repaired | 5 |
| Final total | **2,844** |
| Remaining to target | 7,156 |

**Selection changed, and the reason is worth writing down.** Batches 1 and 2
worked down the frequency list, which is how a corpus grows outward. Reading
the candidate pool this time showed it grows *inward* too: 앞, 뒤, 때, 일, 말,
불, 힘, 꿈, 잠, 끝, 곳, 후, 전, 또, 곧, 늘 and 죽다 were all untaught, while
위, 아래, 옆, 사이, 오른쪽 and 왼쪽 were taught. A learner could say "to the
left of the desk" and not "in front of the shop". Sixty of the 113 are that
kind of word. They cost the same to author as a rare one and are worth more.

**Rejections, all caught by a gate.**

* `15/meaning-absent` — 뒤 "집 뒤에 큰 나무가 있어요" translated as "There is a
  big tree behind the house", where the taught meaning *the back* is not
  visible. Rewritten as 공책 뒤에 이름을 썼어요.
* `A/wrong-sense` — 배 taught as *the stomach* but demonstrated with 배가
  불러요, which reads as the idiom. Rewritten as 배가 아파서 병원에 갔어요.
* `13/clauses` — 곳 "조용한 곳에서 쉬고 싶어요", two joins. Now 조용한 곳을
  찾았어요.
* `vocabulary:sense:qa` ×3 — 잔 "a glass, a cup", 배 "the stomach, the belly"
  and 자료 "materials, data" each split into two dictionary senses on one card.
  Trimmed to one.
* `15/invented-person:pt` ×1 — introduced during the Portuguese rewrite below,
  and caught by the same gate that catches it in authoring.

**Two defects the batch exposed that were not about the batch.** Both are
written up in `docs/final-launch-audit.md`: the word-id renaming (§13) and the
Portuguese pack being European (§11).

**Level Test after the rebuild.** Bank 4,020 → 4,072 items; the nine complete
non-English locales go from 1,374 askable items to 1,549, and their ceiling from
26 back to **25**. The ceiling moved *down* because the new words are core words
and land at low levels, which shifts the difficulty tiers; the test got deeper
where learners actually sit rather than taller at the top. Calibration is
unchanged: mean absolute error 1.34 levels, 95.3% within ±3.
