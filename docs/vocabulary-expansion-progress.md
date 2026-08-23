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
