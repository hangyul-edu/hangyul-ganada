# Level test — the adaptive policy

What decides which question comes next, stated once so that the code, the gates
and the report cannot disagree about it. Every constant named here is exported
from `apps/web/src/domain/levelTest.ts` and asserted in
`apps/web/src/domain/levelTest.test.ts`; every measurement is reproduced by
`npm run leveltest:qa` and `npm run leveltest:simulations`.

## 1. The defect this policy replaces

A tester who had recently learnt Hangul sat the test and met this:

```
  Q1  L2   meaning   다시                        correct
  Q2  L4   context   밥 먹기 ____에 손을 씻어요.     correct
  Q3  L6   produce   …                           correct
  Q4  L8   context   그 사람 이름을 아직 ____.       ← four questions in
```

Three word-recognition answers and the fourth question is a level-8 sentence.
Another tester met `물을 안 줘서 화분의 꽃이 ____.` — two clauses, a negation, a
causal connective, and 화분, a level-28 word — as question four.

Two independent causes, and the second is the more instructive:

**The selector aimed high on no evidence.** The bracket's upper bound is 30
until something is missed, so after three correct answers its midpoint is 18.
The posterior is no better: its prior is centred at 15 and deliberately weak, so
for the first several questions it believes something close to 15 about
everybody. `MAX_STEP_UP` was the only thing holding the walk down, which meant
the sitting climbed two levels a question **whatever the learner said** — a
learner who answered *I don't know* to a level-4 word was shown level 6 next.

**Difficulty was a fact about the answer.** A contextual item took its level from
the word removed from it and from nothing else — 629 of 629 in the shipped bank.
`지갑에 ____이 있어요` was level 1 because 돈 is a level-1 word, and 지갑 is a
level-9 word. The frame was never measured.

A bound on step size limits how fast a sitting climbs. It says nothing about
whether the learner has given any reason to climb. That is what this policy adds.

## 2. Bands

Difficulty moves in bands, not in levels. A band is the unit a promotion opens
and the unit a rule can talk about.

| Band | Levels | What is in it |
|---:|:---|:---|
| 1 | 1–3 | foundation — the first few hundred words; one-clause sentences, present or past polite |
| 2 | 4–7 | elementary — everyday nouns and verbs, simple frames |
| 3 | 8–12 | lower intermediate — connectives, negation, longer frames |
| 4 | 13–18 | intermediate — relative clauses, nominalisers |
| 5 | 19–24 | upper intermediate — formal registers, abstract vocabulary |
| 6 | 25–30 | advanced — low-frequency words, 사자성어 |

The bands widen as they climb because the frequency bands they are cut from do.

## 3. The state the policy keeps

Recomputed from the response history before every question, so a resumed sitting
reproduces it exactly and nothing about it is stored.

| | |
|:---|:---|
| `band` | the highest band the learner has earned, 0-based |
| `correct` | net correct answers inside the band currently being proved |
| `kinds` | how many distinct question kinds those answers span |
| `confirming` | whether the learner is inside a confirmation window after a miss |
| `confirmCeiling` | the level a confirmation question may not exceed |

The posterior (`estimate`) is unchanged and still does the scoring. This is a
second mechanism, and the separation is the point: the posterior says where the
learner probably is, the band says what the sitting is allowed to ask.

## 4. Promotion

A band opens when, inside the band currently being proved:

* **`PROMOTE_CORRECT` correct answers** — 3 for the first two promotions,
  `PROMOTE_CORRECT_ABOVE` = 2 above them.
* **across `PROMOTE_KINDS` distinct kinds** — 2 for the first two promotions, 1
  above them.
* **and not inside a confirmation window.**

Only answers at or above the band's floor count toward it.

**Why three, and why two kinds.** A four-option question is answered correctly by
luck a quarter of the time. One correct answer is a coin; two in a row is one in
sixteen and still ordinary; three is one in sixty-four. The kind requirement is
the one that fixes the reported sequence: three correct `meaning` answers is
recognition of three words, and the band above holds sentences. Reading a
sentence is a different skill and the gate now says so.

**Why it relaxes above band 2.** The gate protects a learner who is still
decoding Hangul from being handed a sentence. That risk lives entirely in the
first two promotions — band 1→2 opens elementary sentences, band 2→3 opens
connectives and negation. A learner who has read those correctly is not the
learner being protected, and holding them to the same evidence for four more
bands costs accuracy at the top and buys nothing.

## 5. Wrong answers and *I don't know*

Treated identically here. They differ in the *scoring* model — `DECLINE` makes a
declared blank strictly stronger evidence of not knowing than a wrong answer —
and not in what happens next.

A miss:

1. **costs one unit of band evidence**, floored at zero. It does not wipe it.
2. **opens a confirmation window** of `CONFIRM_AFTER_MISS` = 2 questions.
3. **caps those questions** at `CONFIRM_DROP` = 1 level below the level missed,
   and never below the top of band 1.
4. **does not take the band away.**

**Why evidence counts down rather than resetting.** Both were built and measured.
Wiping the evidence looks stricter and is worse: a real learner at level 20
answers about one question in six wrongly, so every partial climb was erased
before it completed and the sitting never reached them — **13 points of ±3
accuracy**, over 6,000 simulated sittings. Counting down by one costs none of
it and still requires three net correct answers to open a band.

**Why the band is not taken away.** A learner who has proved band 4 and then
misses one question is still a band-4 learner. Demoting them produces the
oscillation between very easy and very hard questions that this mechanism exists
to prevent.

**Why the confirmation ceiling stops at band 1.** A learner who misses a level-1
question has nowhere easier to be sent. A ceiling of 1 left the sitting one level
wide and pinned an all-wrong sitting to level 1 for nineteen consecutive
questions, past the `REPEAT_LIMIT` that exists to stop exactly that.

## 6. The opening

* **Questions 1–`OPENING_ITEMS` (5) are word questions.** The kind plan used to
  cycle `meaning, context, produce, context`, so the second question of every
  sitting was a sentence before anything was known about whether the learner
  could read one. A gap-fill is a reading task before it is a vocabulary task.
  **The first sentence is question six**, in every profile simulated.
* **The warm-up ladder is capped by the ceiling.** It offers 2, 4, 6 and the
  band-1 ceiling clamps it to 2, 3, 3 for a learner with no evidence.
* **It ends at the first miss.** A learner who declines the level-2 word is not
  shown level 4 next.

## 7. What may never happen

Each is asserted, and each has a negative test that puts the defect back.

| | Held by |
|:---|:---|
| A question above the band the learner has earned | `reachCeiling`, applied to the target, the step and the pool fallback; `leveltest:policy` replays 6 beginner profiles × 8 seeds |
| A sentence in the first five questions | `planKinds`; `leveltest:policy` |
| A climb of more than `MAX_STEP_UP` = 2 on one answer | `nextLevel`; `leveltest:qa` gates the global maximum |
| A climb of more than `MAX_STEP` = 3 ever | the wide step is earned by `SUSTAINED_CORRECT` = 8 consecutive correct answers and withdrawn by one miss |
| A contextual item easier than its own sentence | `sentence_demand` at build time; `leveltest:policy` re-derives it from the shipped bank |
| A connective, negation, nominaliser or relative clause in band 1 | `leveltest:policy` |
| One level asked more than `REPEAT_LIMIT` = 2 times running | `nextLevel`; `leveltest:qa` |

## 8. Reaching the top

Advanced content is not removed, it is earned. Measured on the shipped bank:

* a learner who answers everything correctly reaches band 5 at **question 12**
  and level 30 by question 21, and is reported at 29;
* a learner who makes early mistakes and then succeeds consistently reaches band
  5 at question 17 and is reported at 21;
* 사자성어 sit entirely at level 30 and appear only as band-6 items.

## 9. What this cost

| | before | after |
|:---|:---|:---|
| Within ±3 levels, 6,000 sittings | 90.2% | **86.9%** |
| Mean absolute error | 1.64 | **1.80** |
| 26–30 band bias | −1.16 | **−1.68** |
| First sentence, any profile | Q2 | **Q6** |
| Level of question 4, learner who opens correctly | **8** | **5** |
| Questions above the learner's earned band | not bounded | **0** |

The four points were spent deliberately and the trade is stated rather than
hidden: a sitting spends its first ten to twelve questions climbing through bands
a strong learner would previously have skipped in four, and with a
thirty-question ceiling that leaves less evidence at the top. **A test that
measures an advanced learner half a level better by asking a beginner questions
they cannot read is not the better test.**

`leveltest:qa` fails below 85%, and the measured value is printed on every run.

## 10. What is still not known

The difficulty scale is curriculum-based — a word's frequency rank, or the level
the curriculum assigns it, and now also what its sentence demands. **It has never
been calibrated against a learner**, and it cannot be from here: the application
opens no network connection and collects nothing. Every figure above is against a
simulated learner answering the way the model says someone of that ability would.
That is a check on the machinery, not on the assumption underneath it.
