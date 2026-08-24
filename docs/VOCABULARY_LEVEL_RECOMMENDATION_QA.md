# Vocabulary recommendation QA

Whether a learner's level actually changes what they are taught, measured over
thirty thousand recommendation events and then read.

Gate: `npm run vocabulary:recommendation:qa` (in `verify:release`).
Model: `docs/VOCABULARY_LEVEL_CALIBRATION.md`.
Code: `apps/web/src/domain/vocabularyLevel.ts`.

---

## 1. The question

Not "does the learner have a level" — they always did. The question is whether
two learners with different levels receive different words, whether those words
are at the right difficulty, and whether there are enough of them to keep going.

Before this pass the answer to all three was no, and the evidence is in
`VOCABULARY_LEVEL_CALIBRATION.md` §1: learners at 15 and 20 received an
identical list, and a learner at 30 saw 82 distinct words in a thousand draws.

## 2. The teaching zone

A learner at level L is taught from L−1 to L+1, mixed:

```
MIX = { atLevel: 6, easier: 2, harder: 2 }
```

Six words at the learner's own level, two below, two above — the 60/20/20 the
brief asks for, as a count rather than a proportion because a day is ten words
and a proportion of ten is a count anyway.

Two edges are handled explicitly:

**The top.** A learner at 30 has no L+1. `teachingZone` widens the top band to
28–30 rather than silently narrowing to two levels, so the hardest learners
still get ten words a day from three levels.

**The bottom is a floor, one level deep.** When a target level has nothing left,
`search` looks one level either side of the *zone* — for a learner at 20 that is
levels 18 to 22 — and then stops. It does not keep walking outward. The previous
planner did, across all thirty levels, which is how a learner placed at 25 was
handed level-14 vocabulary with nothing anywhere reporting a problem.

When even that cannot supply ten words, the day is short and the shortfall comes
back as a `deficit` on the return value rather than being absorbed. A short day
is visible; a silently widened range is not. `apps/web/src/domain/vocabularyLevel.test.ts`
holds the fixture: a learner at level 1, learning what they are given, exhausts
the 93 words at levels 1–2 inside ten days and the plan reports every missing
word rather than substituting a harder one.

## 3. What was measured

30 levels × 100 days × 10 words = **30,000 recommendation events**.

```
  simulated             30,000 recommendation events
  learners              30 levels x 100 days x 10 words
  short days            0 word(s) the zone could not supply
```

| Learner | Zone | min | P50 | max | mean | distinct words | days before a repeat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1–2 | 1 | 1 | 2 | 1.20 | 93 | 9 |
| 10 | 9–11 | 9 | 10 | 11 | 10.01 | 297 | 29 |
| 20 | 19–21 | 19 | 20 | 21 | 20.00 | 393 | 39 |
| 30 | 28–30 | 29 | 30 | 30 | 29.80 | 221 | 22 |

Every level between behaves the same way; the full table is the gate's own
output. What the four rows show:

- **No word ever falls outside its learner's zone.** min and max equal the zone
  bounds at every one of the 30 levels.
- **The mean tracks the learner.** 1.20, 10.01, 20.00, 29.80.
- **The two ends do not meet.** Zero overlap between learner 1's words and
  learner 30's.
- **Medians are strictly increasing** across all 30 learners.
- **The pool is deep enough.** The thinnest zone (level 1, 93 words) supplies
  nine days before anything repeats; the deepest supplies forty-one. Nine days
  is the floor of the scale rather than a shortage: `levelFromProgress` moves a
  learner up once two-thirds of a level is learned, which happens sooner than
  that, and `short days` is zero at every one of the thirty levels.

## 4. Reading the words

Distributions can be right while the words are wrong, so a day at each of four
levels was read rather than counted:

**Learner 1** — 아빠, 살다, 가족, 있다, 밤, 그리고, 방, 네, 너무, 없다.
First-week Korean. 네 and 그리고 are function words a beginner meets on day one;
있다 and 없다 are the pair every course teaches together.

**Learner 10** — 세다, 걱정하다, 그리다, 연기, 왕, 출발, 도착, 이쪽, 이기다,
월요일. Concrete, high-utility, nothing abstract. 출발 and 도착 arriving on the
same day is the pairing working as intended, not a coincidence.

**Learner 20** — 다가가다, 다행히, 신선하다, 망가지다, 조직, 인류, 나란히,
떠나가다, 배터리, 유령. Compound verbs and adverbs — the level where Korean
stops being nouns. Not one of these is a word a beginner would meet.

**Learner 30** — 감당하다, 기울다, 복용하다, 강화하다, 해당하다, 무단, 휩쓸다,
바래다, 일석이조, 나약하다. Sino-Korean verbs, an idiom, and 무단 — written
Korean. Correct for the top of the scale and unusable at the bottom, which is
the whole point.

## 5. The measured level and the planning level

They are not the same number and the distinction is deliberate.

`vocabularyLevel` is what the learner is **shown**: the level the Level Test
measured. `planningLevel` is what `buildDailyPlan` **uses**. They diverge when a
learner has already learned most of what their measured level holds —
`levelFromProgress` finds the lowest level still under two-thirds learned, and
`teachingLevel(measured, outgrown)` takes the higher of the two.

Without that split, a learner who tested at 12 and then finished levels 12 and
13 would keep being offered level 12 words they already knew, and the only way
out would be to sit the test again.

## 6. What this does not claim

It does not claim a learner at 20 *wants* these particular words. That is an
editorial judgement, and §4 is a person reading forty of them rather than a
statistic. It does not claim the placement is correct — that is the Level Test's
accuracy, in `VOCABULARY_LEVEL_CALIBRATION.md` §6. And no simulation here says
anything about whether a real learner retains what they are given.
