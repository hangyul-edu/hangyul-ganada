# Level test — the difficulty audit

How a question's difficulty is decided, what was wrong with it, and what each
number in the model is for. The model itself is
`scripts/content/sentence_demand.py`; it runs when the anchors are built and the
result is carried on every contextual item as `demand`, so a reader of the bank
can see *why* an item sits where it does.

## 1. What was wrong

**A contextual item took its level from the word removed from it, and from
nothing else.** Measured on the bank shipped at `700c78db`: 629 of 629.

Two consequences, both met by testers:

```
  지갑에 ____이 있어요.   → 돈          level 1, because 돈 is a level-1 word
                                     지갑 is a level-9 word

  물을 안 줘서 화분의 꽃이 ____. → 죽었어요  level 7, because 죽다 is a level-7 word
                                     화분 is a level-28 word, and the sentence
                                     also carries a negation, a causal
                                     connective and an inference
```

The second was presented as **question four** to a learner who had answered three
word questions correctly.

The answer's frequency rank is a fact about the answer. It says nothing about the
sentence the learner has to read to reach it, and a gap-fill is a reading task
before it is a vocabulary task.

61 of the 629 items — **10%** — contained a word ranked above the item's own
level. The worst gap was 21 levels.

## 2. The model

```
level = max(answer_level, noun_demand, grammar_demand, length_demand)
```

It can only raise. A simple sentence around a hard word stays at the word's
level, which is right: 나물 is hard whatever frame it sits in.

### Noun demand

The level of the hardest ordinary word in the frame, looked up in the same table
the test levels its answers with — so a noun's demand and an answer's difficulty
are on one scale and can be compared.

Exact matches only, after stripping one particle. A first draft matched prefixes
and reported five words that are not in the sentence: 기다 from 기다려요, 유명
from 유명한, 나물 from 밥과 나물을. Function words (저는, 안, 잘, 그리고 …) are
skipped.

### Grammar demand

Each construction carries the level at or above which a learner can be expected
to have met it. The floors are **judgements**, and they are written down rather
than buried so that they can be argued with:

| Construction | Floor | Why there |
|:---|---:|:---|
| `past` | 3 | taught in the first weeks, but after the present |
| `negation` | 5 | 안/못 and the long forms; one new idea, no new clause |
| `connective` | 8 | -고, -아서, -면, -지만, -는데 … the first sentence with two clauses in it |
| `adnominal` | 10 | a verb modifying a noun; the learner must parse a clause inside a phrase |
| `nominaliser` | 10 | -기 as a noun: 먹기 전에, 가기 위해 |
| `honorific` | 12 | 께, 드리다, 계시다, -시-; the load is the joint between stem and ending |
| `uncommon-particle` | 12 | 밖에, 조차, 마저, 커녕, 뿐, 만큼, 처럼, 보다, 대로 |
| `two-clauses` | 14 | two connectives is a paragraph, not a sentence |
| `formal` | 16 | 합쇼체 — correct, formal, and not what this product teaches in |
| `quoted` | 18 | reported speech |
| `passive-causative` | 18 | -어지다, -시키다 |
| `formal-connective` | 22 | 에 따라, 에 의해, 으로 인해, 함으로써 |

Grammar is read from the **whole sentence**, vocabulary from the **frame**. The
learner sees all four options, so the construction the answer completes is one
they have to read: `저는 커피를 마시지 ____` with 않아요 among its options is a
negation question, and reading the frame alone finds no negation because the
negation *is* the answer. Vocabulary is the other way round — the answer's own
difficulty is already `answer_level`, and counting it twice would level every
item by its answer again.

### Length demand

Eojeol in the frame, not counting the blank. A four-word sentence is not a
two-word sentence whatever it is made of.

| Eojeol | Floor |
|---:|---:|
| ≤ 3 | 1 |
| 4 | 5 |
| 5 | 9 |
| 6 | 13 |
| ≥ 7 | 17 |

### Two traps, both hit

**`저는` and `넘어진` are the same shape.** A noun with a topic particle and a
verb with an adnominal ending cannot be told apart by a pattern. The test is
whether what remains after the ending is *already a word*: 저 is, 넘어지 is not.
Without it, `저는 공부를 ____.` was reported as carrying a relative clause and
lifted from level 1 to level 10.

**`모기를` is a mosquito, not a nominalised verb.** Same trap one syllable along,
and the same test resolves it.

**`문을` ends in ㄹ.** The adnominal ㄴ/ㄹ fuses into the stem's last syllable
(넘어지 + ㄴ = 넘어진), so finding it means decomposing the syllable — and the
object particle 을 has a final ㄹ of its own, which turned every object in the
corpus into a relative clause until the particle was stripped first.

## 3. What moved

| | |
|:---|:---|
| Contextual items | 625 |
| Level unchanged | 557 (89%) |
| Level raised | 68 (11%) |
| Largest single move | +21 levels |

```
  +1  … 7 items        +7  … 6 items
  +2  … 7              +8  … 3
  +3  … 7              +9  … 3
  +4  … 10            +10  … 1
  +5  … 7             +11  … 3
  +6  … 7             +12  … 2
                      +14  … 3
                      +16  … 1
                      +21  … 1
```

The ten largest:

| was | now | Sentence | Why |
|---:|---:|:---|:---|
| 7 | 28 | 물을 안 줘서 화분의 꽃이 ____. | negation, past; 화분 L28; 5 eojeol |
| 9 | 25 | 방에 들어온 모기를 ____. | relative clause; 모기 L25 |
| 3 | 17 | 알람 소리에 침대에서 ____. | 알람 L17 |
| 8 | 22 | 방학 ____ 여행을 했어요. | 방학 L22 |
| 16 | 30 | 밥과 나물을 ____. | 나물 L30 |
| 14 | 26 | ____이 과녁에 맞았어요. | 과녁 L26 |
| 18 | 30 | 유리컵에 ____이 남았어요. | 유리컵 L30 |
| 1 | 12 | ____으로 글씨를 써요. | 글씨 L12 |
| 2 | 13 | ____이 피아노를 배워요. | 피아노 L13 |
| 12 | 23 | 작은 ____가 큰 차이를 만들어요. | relative clause; 차이 L23 |

Grammar found across the bank: 174 past, 82 relative clauses, 40 connectives,
7 honorifics, 6 negations, 6 nominalisers, 3 passives.

## 4. What the foundation band holds now

**Three sentences, at levels 1–3, and no others are reachable by a learner who
has proved nothing:**

```
  아침에 ____가 떠요.        가게 · 여자 · 학교 · 해
  저는 커피를 ____.         가요 · 나와요 · 닫아요 · 좋아해요
  ____가 문을 닫았어요.       가게 · 비행기 · 영화 · 해
```

One clause each, present or past polite, three eojeol or fewer, every supporting
word inside the first few hundred by frequency. `leveltest:policy` fails the
build on a connective, negation, nominaliser, relative clause, honorific or
formal ending anywhere in this band, or on a frame longer than four eojeol.

Band 2 (levels 4–7) holds 31 sentences, all single-clause.

## 5. What the model does not do

* **It does not judge whether a sentence is good.** That is `examples_qa` and a
  person.
* **It does not lower anything.** A mis-levelled *word* stays mis-levelled; the
  model inherits the word table's judgements and is deliberately consistent with
  them rather than second-guessing them. `방학` is level 22 by frequency in this
  corpus, and a frame containing it is therefore a level-22 frame, whatever a
  syllabus would say about when 방학 is taught.
* **It is not calibrated against learners.** The floors are reasoned, not
  measured. No learner response data exists in this repository and none can be
  collected — the application opens no network connection at runtime. A
  simulation will report excellent behaviour for a badly calibrated bank for
  exactly as long as the bank is wrong in the same way the simulation is.

## 6. Where it is enforced

| | |
|:---|:---|
| `scripts/content/sentence_demand.py` | the model |
| `scripts/content/build_level_test.py` | applies it when the anchors are built, and records `context_demand` |
| `scripts/content/build_level_test.mjs` | reads `context_level` onto the item |
| `npm run leveltest:policy:check` | re-derives every level from the item's own recorded demand, and fails if the bank disagrees with itself |
| `npm run leveltest:bank:check` | a contextual item may sit above its anchor and never below |
| `scripts/regression-gates-negative.sh` G9 | puts the reported item back at level 7 and requires the gate to fail |
| `scripts/regression-gates-negative.sh` G10 | drops a two-clause sentence into band 1 and requires the gate to fail |
