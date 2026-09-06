# The Numbers course — content, progress model, migration, and how it is proven

Status, 6 September 2026: the ordinals lesson added (§4b) and the course re-read
end to end for the third time. What that reading found is in §4b: an
explanation that named the wrong consonant for the sound change in 십육 and
열여섯, three ways of asking an age whose glosses overlapped (and in two
languages read as the same sentence), a listening pool that drew *zero* into
questions about counting words, and a spacing rule this document itself stated
backwards. Earlier —

Rebuilt in the v1.0.2 pass after a P0 — lessons showed
as completed without having been studied — and read end to end again in the
sixth screenshot pass, which found the list screen reserving a column for an
icon most rows do not draw, 224 translated strings no screen could show, and no
route through the course at all for a learner who cannot hear (§4a). Numbers had never shipped (the
committed artefacts are v1.0.0 at `86d0babd`, without the feature), so the
migration below is a namespace cleanup rather than a data conversion.

## 1. What went wrong, and how it was reproduced

Before any fix, on a fresh profile in a headless browser:

| Observation | Measurement |
| --- | --- |
| All-wrong run of `num-lesson-native-basics` | 7 of 10 incorrect; end screen said **Lesson complete** |
| Correct option position, sino lesson | index 1 in 10 of 10 questions |
| Correct option position, counters lesson | cycle 0, 3, 2, 1, 0, 3, 2 |
| Stored progress keys | `number:number:num-sino-1` … (kind prefixed twice) |
| Overview after the all-wrong run | 0 / 10 — never showed progress at all |
| Daily activity | the completion was counted as a **word** learned |
| Fresh and letter-only profiles | 0 / 81 — no cross-leak from letters or words |

Three root causes: the session page wrote `learned` for every item on the last
question regardless of the answers; the caller prefixed the item key and the
store prefixed it again; hydration coerced an unknown `kind` to `character`.

## 2. The progress model

Files: `packages/shared-types/src/index.ts` (types), `apps/web/src/domain/numbersProgress.ts`
(the only place completion is decided), `apps/web/src/storage/repositories.ts`
→ `NumbersRepository`, IndexedDB store `numbers` (structure version 3), key
`lesson:<lesson_id>`.

**Record** — `NumbersLessonProgress`, `schema: 1`, one per lesson: `opened_at`,
`started_at`, `explanation_steps_viewed[]`, `examples_viewed[]`,
`practice_completed_at`, `mastery {taken_at, correct, total, passed}`,
`mastery_attempts`, `reviewed_at`, per-item `items[id] {correct, incorrect,
mastered_at}`, `attempts {total, correct, incorrect}`, `completed_at`, `updated_at`.

**Events** — `lesson_opened`, `explanation_viewed(step)`, `example_viewed(item)`,
`exercise_attempted(exercise, item, correct, phase)`, `practice_completed`,
`mastery_completed(correct, total)`, `review_completed(item, correct)`. Facts
are idempotent (viewing a step twice records it once); counts are not.

**Completion** is derived, never set. `isComplete` requires all five:

1. every explanation step viewed;
2. every item's example viewed;
3. practice finished;
4. a mastery check at or above `MASTERY_PASS = 0.8`;
5. every item answered correctly at least once *in a mastery check*.

`applyNumbersEvent` is the only writer of `completed_at`, and it writes it once,
after applying an event, by asking `isComplete` of the new record.

**Status** (`lessonStatus`) — `available` (no evidence at all), `not_started`
(opened, nothing done), `in_progress`, `completed`, `mastered` (completed with a
perfect mastery check), `review_due` (completed and seven days since completion
or the last review, `REVIEW_INTERVAL_DAYS`).

Three of those count as *finished* for the overview's progress arithmetic —
`completed`, `mastered` and `review_due`, since a lesson that has come round
again was completed once. **The check mark is a narrower claim and is drawn for
`completed` and `mastered` only.** It was drawn for all three, and a tick beside
*Review due* — the one status on that screen asking the learner to act — says
the opposite of the word next to it. The mark now sits inside the status pill
rather than in a column of its own; see §20Q.2 of the report and I-150.

`available` asks the **evidence** before it asks about the visit. It read
`opened_at === null → available`, which is right in every ordinary sitting — the
page fires `lesson_opened` first — and wrong in the one case worth guarding: the
stores are written optimistically, so `lesson_opened` can be the write that
loses a race with a reload while the work that followed it was saved. A learner
who had read two explanation steps would come back to a row reading *you have
not started this*. `started_at` is set by the first step read, the first example
seen and the first answer given, so asking it first means the status can only be
wrong in the safe direction (I-151).

There is no `locked`. There was, and it is gone from the type itself so it
cannot return by accident — see the note under *Prerequisites* below. The three
words before `completed` are kept apart deliberately: with nothing locked, the
mistake available to a future implementation is reading "a learner may open
this" as "a learner has done some of this", and `available`, `not_started` and
`in_progress` are three different answers to three different questions.

**Repair on read** — `repairLessonProgress` runs on every load and in the
migration. Unknown lesson ids are dropped; evidence for items no longer in the
lesson is dropped; counters are defaulted; and a `completed_at` the evidence does
not support is **cleared** (`downgraded` is counted). A stale write from an old
build cannot restore a completion.

**Denominators** — a lesson card counts *activities* (steps + items + practice +
mastery) and says so; a module counts *lessons completed*; the course header
counts lessons completed of the total.

## 3. Migration 13 — `numbersNamespaceCleanup`

`apps/web/src/storage/schema.ts`. Rows in `progress`, `memory` and `mistakes`
whose kind is `number`, or whose key or item key starts with `number:`,
`character:number:` or `num-`, are snapshotted to `meta` key
`numbers_v13_snapshot` and then removed. Letter and word rows are untouched
(fixture F2 proves byte-for-byte). Idempotent (F4). Nothing is converted into the
new store: the old flags were written on the way in and are not evidence.
Web and native share the same IndexedDB driver; the fixtures run against the
in-memory driver that implements the same interface.

## 4. The curriculum

`apps/web/src/data/numbers.ts` — 6 modules, 20 lessons, 112 items, 9 exercise
kinds, 10 question types.

| # | Module | Lessons |
| --- | --- | --- |
| 1 | Two kinds of number | Sino 1–10 · native 1–10 · the two zeroes · which system when |
| 2 | Past ten | Sino building · native building · the five counting forms |
| 3 | Counting things | people and things · everyday counters · age · order |
| 4 | Time and dates | hours · minutes · dates and the irregular months · weekdays |
| 5 | Money and identifiers | prices · digit-by-digit · 만 억 조 |
| 6 | Review | the five mistakes · mixed review |

Every lesson: an objective (`lesson.<key>.objective`), two or three explanation
steps, items with reading (where spelling ≠ pronunciation: 십육 → 심뉵, 여덟 → 여덜),
a worked example, recorded audio for the word and the example, guided practice
from at least two exercise kinds per item, a mastery check that asks every item
(`mastery_count` questions), a summary that lists what is still owed, and a review
path.

**Prerequisites are a recommendation, not a gate.** They are ids, they point
backwards only, and they decide the course order and which lesson **Continue**
opens. They do not decide what a learner may open: every lesson is a link, from
the first day, on a profile that has done nothing.

They used to. A lesson whose prerequisites were unfinished was shown, named,
explained and not openable, on the argument that "hours" assumes "counting
forms" and a learner meeting 두 시 without them cannot know why it is not
둘 시. That argument is right about the *order* and wrong about the door.
Somebody who has just been asked their age in Korean wants 몇 살이에요? today,
and a course that answers "finish four other lessons first" has sent them
somewhere else to find out. Numbers are also the wrong subject for a gate: they
are what a learner meets on the first day, out of order, on a price tag and a
bus.

**Exercise kinds** (`apps/web/src/features/numbers/exercises.ts`): `read_choose`,
`listen_choose`, `digits_to_korean`, `korean_to_digits`, `choose_system`,
`counter_form`, `spot_mistake`, `fill_sentence`, `order_parts`. Distractors are
built from misconception classes — `system_swap`, `plain_form`, `adjacent`,
`sound_alike`, `irregular_month`, `wrong_counter`, `spacing` — and the feedback
shown after a wrong answer names the class of the option that was chosen.

**Question types are separate from exercise kinds, and they are what the screen
reads.** A kind says how the options were assembled; a *question type* says what
the learner is being asked to do, and the two are not the same fact. Choosing
the instruction from the kind produced this, in every language:

> 어느 쪽이 맞을까요? — *which one is right?*
> 세 시 · 두 개 · 한 명 · **셋 시**

Three of those four are right. The answer is 셋 시, the one that is wrong,
because the question was built by `spot_mistake`. A learner who read the
instruction and obeyed it was marked incorrect. The same mechanism put *이건
무슨 뜻일까요?* over 한 개 with four whole grammar rules to choose between — 한
개 does not *mean* that counting words take a space.

`NumbersQuestionType` is carried on the exercise, resolved once where it is
built, and `NumberSessionPage` switches on it and on nothing else:

| type | instruction | built by |
| --- | --- | --- |
| `findIncorrectExpression` | 다음 중 틀린 표현을 고르세요. | `spot_mistake` |
| `chooseCorrectExplanation` | 다음 중 올바른 설명을 고르세요. | `read_choose` over an `explanation` gloss |
| `listenAndChoose` | 무엇이라고 들렸나요? | `listen_choose` |
| `chooseMeaning` | 무슨 뜻일까요? | `read_choose` over a `meaning` gloss |
| `chooseSystem` · `sayTheNumber` · `writeTheDigits` · `chooseCounterForm` · `fillTheBlank` · `orderTheParts` | their own | the remaining kinds |

Which of the two `read_choose` types applies is **declared content**, not
sniffed from the option strings: `NumberItem.gloss_kind` is `meaning` or
`explanation`, and the five items of the review lesson are the `explanation`
ones. An explanation question is also shown the item's *contrast pair* rather
than its bare word — `한 개 (✓) · 한개 (✗)` — because 한 개 alone is explained by
two of the five rules at once and the pair by exactly one.

**Exactly one answer, and it is gated over every question the engine can
build.** `numbers:qa` §8 generates practice *and* mastery for all twenty
lessons over three attempts, deduplicates, and checks each of the 311 distinct
questions against its type: the find-the-mistake options must contain exactly
one expression the curriculum classifies as not Korean and no option it cannot
classify at all; a meaning question's options must be one gloss kind and must
not contain two glosses that name the same thing; a fill-the-blank's sentence
must contain a word that decides the answer. Three defects it found and that are
fixed in the data rather than in the gate:

* `두 ____` with 개 · 명 · 마리 · 사람 to choose from. All four are Korean. A
  blank after a bare numeral is not a question, so `fill_sentence` now requires
  a context word — 고양이 두 ____, 책 세 ____ — and drops the rest.
* 명 asked with both *사람* and *사람 — 일상적인 말* on screen. `gloss_group`
  declares the pair and they are never offered against each other.
* 맥주 한 ____ with 잔 among the distractors, and `____에 만나요.` with 금요일
  and 월요일. `slot_group` declares words that fit the same hole.

Option order is a Fisher–Yates shuffle seeded by
`(lesson, item, kind, phase, attempt)`: stable within an attempt, different on a
retake, and never a function of the question index alone. A mastery check then
*assigns* the columns — a hashed permutation of 0–3, each question's options
rotated (not reshuffled) until its answer lands on the column it was given —
because independent per-question shuffles are exactly what allowed the zero
lesson to put all four answers at index 2, where tapping the third button four
times passed the check.

**Spacing: a unit noun is open, and a date closes.** 한글 맞춤법 §43 spaces a
unit noun from its numeral and its 다만 clause **permits** closing the same noun
where the number is an order or is written in figures. Permits, not requires —
and this document and the file it describes both said *an ordinal is closed* for
three passes, which is true of 삼월 일일 and false of 첫 번째. 번째 is a
dependent noun and stays apart; 째 is a suffix and attaches. The course takes the
permission where a Korean reader expects it and nowhere else:

| | |
| --- | --- |
| quantity, open | 한 개 · 세 명 · 두 잔 · 스무 살 · 세 시 · 삼십 분 · 오천 원 |
| ordinal with 번째, open | 첫 번째 · 두 번째 · 세 번째 · 네 번째 |
| ordinal with 째, closed | 첫째 · 둘째 · 셋째 · 넷째 · 다섯째 |
| a date, closed | 삼월 일일 · 유월 육일 · 시월 십일 · 십오일 · 이천이십육년 |

The course shipped *삼월 일 일*, *삼월 이 일*, *유월 육 일*, *시월 십 일*,
*십오 일* and *이천이십육 년*. Every one is the 원칙 form and none is written by
anybody; *일 일* in particular reads as two ones, on the screen of the lesson
explaining that 일 is both. `numbers:qa` §9 fails on the old forms and on their
absence, over the item data, all thirty-two bundles and the audio manifest — and
the five clips that said the old sentences were deleted, so a cached id cannot
keep playing 삼월 일 일.

**An example says whether it is about writing or about sound.** *이렇게 써요* is
two sentences in Korean — *this is how you write it* and *this is how you use
it* — and it headed every example card. On 유월 육일 a learner takes the first
reading, and the card exists to teach the second. `NumberItem.example_kind` is
`pronunciation` (유월 육일, 시월 십일, 십육 (심뉵), 공일공에 일이삼사에 오륙칠팔,
유월 · 육월), `writing` (the three cards that show a written contrast) or
`example`, and the heading is `exampleLabel.{writing,pronunciation,example}` —
*이렇게 발음해요* / *이렇게 써요* / *이렇게 말해요*.

**Audio** — clip ids are the codepoint rule shared with the vocabulary corpus
(`word_<hex>`/`ex_<hex>`), so 일 the numeral and 일 the word are one recording.
`scripts/export-speech-plan.mjs` adds every word and example; `npm run audio:build`
records only what is missing; there is no runtime synthesis. `numbers:qa` fails
on any item whose clip is absent from the manifest or whose manifest text differs
from the Korean shown.

**Localisation** — 277 keys × 32 languages in `locales/<code>/numbers.json`.
`numbers:qa` fails on a missing key, a blank value, a broken `{{placeholder}}`
set, or a sentence identical to the English. It also fails on a bundle that has
lost one of the ten question-type prompts or one of the three example headings,
and on a bundle still carrying `prompt.spotMistake`, `prompt.read` or
`prompt.listen` — the three keys that were chosen by exercise kind. The Korean
bundle's four question instructions are checked literally, because *find the
wrong one* and *choose the right explanation* are opposite instructions and a
bundle that swaps them is a broken lesson rather than a translation problem.

No native-speaker review of the thirty-one non-Korean bundles has been carried
out for these strings. They were written for this pass and are consistent,
short and unreversed by construction and by gate; they have not been read by a
speaker of each language, and that is an outstanding item rather than a claim.

## 4a. A learner who cannot hear

A `listen_choose` question's whole stimulus is a clip: `prompt` carries an audio
id and deliberately no text, because printing the word would print the answer.
That is right for a listening question, and it was the whole route through the
course for a learner who could not use it — **all twenty lessons list that
kind**, a mastery check asks every item, and passing a mastery check is what
completes a lesson. There was no slower path; there was none.

`settings.sound_free` has existed since §36 of the brief and `domain/review.ts`
has always honoured it. This course never asked it, and never asked the player
either, so a build with no clips in it or a manifest that failed to load
produced the same dead end from the other direction.

`practiceExercises`, `masteryExercises` and `exerciseCoverage` take
`{ soundFree }` and drop the heard-only kind. `NumberSessionPage` decides from
`settings.sound_free || (audio.ready && !audio.available)` — `ready &&
!available`, so *the manifest has not answered yet* is never mistaken for *there
is no audio* — and it decides **once, when a run mounts**, so a manifest that
finishes loading mid-check cannot change the questions under the learner or the
count printed on the way in.

Dropping the kind is enough rather than a degradation, and `numbers:qa` §11
measures it rather than assuming it: every lesson still asks every item, in
guided practice and in the mastery check. Two lessons — `minutes` and
`weekdays` — fall to one question shape, which the gate reports as a note. A
shorter lesson somebody can finish beats a richer one they cannot.

**And the second accommodation, because the first is unreachable.** `MyPage`
removed the switch that turns `sound_free` on, because the *word* questions it
existed to avoid no longer exist — so a learner arriving today cannot set it and
only a migrated profile carries it. Honouring a preference nobody can express is
not an accommodation.

The letter side had already solved that, and the note in
`features/review/ChoiceExercise.tsx` is the argument: a setting is remembered,
and the cost of a remembered setting is that nobody who has not already found it
can turn it on. Its answer is a small **Can't use audio?** under the prompt, per
question, which swaps the clip for an equivalent visual one. This course does
the same, on the same string (`learning:review.cannotUseAudio`), reset with the
question and one-way while it is on screen.

`soundFreeFor` decides the substitute **from the options**, not from the item:

* a numeral gets *Say this number with 일, 이, 삼* over its digits. Not the
  digits alone — a numeral's distractors include the other system's word for the
  same value, and 하나 and 일 are both 1;
* anything else gets its gloss under *Which of these means this?*;
* and where neither identifies exactly one of the options actually on screen —
  시월 beside 십, 만 원 beside 만 — it returns nothing and the button is not
  drawn.

349 of the 352 listening questions the engine can build carry one. `numbers:qa`
§11 recomputes the uniqueness rather than reading a declaration back, and
resolves each option through the id it was built with: 오천 원 is both a price
and a context phrase, and 세 시 삼십 분 is both a clock time and a pitfall, so
matching on text answers with whichever comes first in the file.

## 4b. Order — the ordinals lesson, and what re-reading the course found

`num-lesson-ordinals`, tenth in the course and fourth in module 3, after
`num-lesson-age`. Ten items, four explanation steps, a mastery check of ten,
prerequisites `num-lesson-forms` and `num-lesson-counters` — the counting forms,
because 번째 takes them, and the counters, because 번째 is one.

### The two families, and why they are two answer domains

```
 첫 번째 · 두 번째 · 세 번째 · 네 번째    where something stands in a line
 첫째 · 둘째 · 셋째 · 넷째 · 다섯째      counting off: 첫째, 값이 싸요.
                                        둘째, 가까워요. — and birth order
```

They overlap in ordinary speech and the beginner-safe rule does not, so the
course teaches the rule: 번째 for a position, 째 for listing points and for which
child. `AnswerDomain` grew `ordinalPosition` and `ordinalRank` for them, and the
reason is not tidiness. Both families name position one; under one instruction
*which position is this?* both 첫 번째 and 첫째 would be defensible and the
question would have two answers. Two domains make that unbuildable, and
`gloss_group: 'ordinal-1'` states the relationship the domains only imply — so
`numbers:qa` can hold it independently (its `SAME_MEANING` list names the four
pairs, which is the *finding*; the declaration is the fix).

**No `value`, deliberately.** 첫 번째 is *first*, not 1. An item carrying
`value: 1` would build `digits_to_korean` — the numeral **1** over 첫 번째, 두
번째, 세 번째 under *say this number* — and a sound-free substitute showing the
digit 1. Both are the cardinal question wearing the ordinal lesson's options.
`system: 'native'` is kept, because *which set goes in front of 번째* is the
lesson's central rule and `choose_system` is the question that asks it.

### The five forms a beginner writes, and the one place each is allowed

| written | why it is not Korean | class |
| --- | --- | --- |
| 한 번째 | 한 is the counting form, right before 개 and wrong here | `ordinal_form` |
| 일 번째 · 이 번째 | the Sino-Korean set never stands before 번째 | `system_swap` |
| 첫번째 · 세번째 | 번째 is a dependent noun; §43 spaces it | `spacing` |
| 넷 번째 | the plain numeral where the counting form belongs | `plain_form` |
| 첫 째 | 째 is a suffix and attaches | — |

`ordinal_form` is a new misconception class and it is new because none of the
seven that existed described 한 번째: the *plain* numeral is 하나, and nobody
writes 하나 번째, so calling it `plain_form` would have been a label rather than
a reading of the mistake. `wrongHalfClass` in `exercises.ts` chooses between the
four, in that order, from the two halves of the item's own contrast example.

**`numbers:qa` §18 rejects all of them — and knows where each is taught.** A
substring ban would forbid the teaching along with the mistake, which is the
failure mode §9 already had to solve once. So a hit is *licensed* or it is a
finding, and the licence is structural wherever it can be: the ✗ half of an
item's own contrast example, the caption generated from that half
(`example_gloss`), the answer of a `findIncorrectExpression` question, and any
option carrying a declared `misconception`. One key is declared rather than
derived — `lesson.ordinals.step2`, which says in thirty-two languages that 한
번째 and 일 번째 do not exist — and even there the correct counterpart has to be
in the same sentence. N15 of the negative suite proves the structural half by
changing an item's ✗ half and watching the caption that was licensed by it stop
being licensed.

### What the questions are

Five question types over ten items: `chooseMeaning` in both new domains
(*몇 번째일까요?* and *몇째일까요?*), `listenAndChoose`, `chooseCounterForm`
(두 번째 against 두번째 · 이 번째 · 둘 번째 — the three mistakes on one screen),
`findIncorrectExpression` (one per wrong form), and `chooseSystem`.
`fill_sentence` is deliberately absent: every ordinal in the lesson fits every
ordinal's hole, so a blank would have four answers — the `slot_group` case one
step further, where the whole option pool is the slot.

The nine `chooseSystem` questions all have the same answer, because every Korean
ordinal is native. That is recorded in the question ledger as `noted` rather than
left to be discovered: it is the rule the lesson exists to teach, it is the
second question shape a learner who cannot hear has, and the discrimination it
looks thin on is made where it bites — 이 번째 is on the screen in
`counter_form` and is the answer in `spot_mistake`.

### What re-reading the rest of the course found

| Where | Finding |
| --- | --- |
| `lesson.sinoBuild.step2`, `lesson.nativeBuild.step3` | Both said the sound inserted in 십육 → 심뉵 is **ㄹ**. It is ㄴ: ㄴ-첨가 puts a ㄴ in front of 육 and 십 assimilates to 심. In 열여섯 → 열려섣 the inserted ㄴ *becomes* ㄹ after ㄹ, which is why the two look alike and are one rule. Corrected in all 32 bundles, and the two steps now say the rule rather than naming a letter that is not in the word. |
| `gloss.howOld`, `howOldNeutral`, `howOldPolite` | Three ways of asking an age, glossed *the phrase for asking someone's age*, *the everyday polite way to ask an adult's age* and *the polite way to ask an older person's age*. The first is true of all three; the other two both say *polite*. In Thai and Telugu two of them read as the same sentence. Each now names who you say it to — a friend, an adult you have just met, someone much older — which is what `lesson.age.step3` teaches, and that step now teaches all three registers rather than skipping the middle one. |
| `listenChoose` | A clip of 번째 offered against 영, 공 and 영하 — three ways of saying zero, in the lesson about counting words. The pool now prefers taught items of the same **role** before the rest, which is the two-stage pool `readChoose` already used. Twelve questions changed and each is re-read in the ledger. |
| §9 of this document, and the header of `numbers.ts` | Both said **an ordinal is closed**. §43's 다만 clause *permits* closing, and a date takes the permission; 첫 번째 does not. The rule as written would have had the ordinals lesson writing 첫번째. |
| `gloss.zeroDigit` [en] | *nought, as a digit* — a British word a beginner will not have met, and it broke the contrast the lesson is making, which is quantity against digit rather than zero against nought. Now *zero, as a digit*. |
| `example.weekend` [ko] | The caption under 주말에 만나요. was 주말에 만나요. — the same sentence twice on one card. Now 토요일이나 일요일에 만나요., which says what 주말 is. |
| `lesson.weekdays.step1` [ko] | *요일은 요일로 끝나요* — *the weekday ends in 요일*, which is circular. Now 요일 이름은 모두 요일로 끝나요. |
| `lesson.digits.step2` [ko] | Began *에는 줄표(-) 자리에…*, where 에는 reads as the particle 에 + 는 rather than as the item 에 followed by a topic marker. Rewritten so the sentence starts with the slot rather than the word. |
| `prompt.meaning.ordinalPosition` [vi] | Written *Đây là thứ mấy?*, which is Vietnamese for both *which weekday* and *which position* — and was already the weekday prompt. Now *Đây là vị trí thứ mấy?*. |

### Three gates that did not exist

**§19, romanisation.** 112 hand-typed transliterations, none of them checked:
`romanization:qa` reads the vocabulary corpus and has never looked at this
course. Each is now recomputed by `scripts/content/hangul.py` — the
transliterator the vocabulary pipeline and the dictionary already use — from the
item's `reading` where it has one, because 십육 is spelled *sibyuk* and said
*simnyuk* and the second is what a learner sounding it out needs. All 112 were
already right; the point is that nothing had said so.

**§20, the shape of the course.** Every lesson has all six stages; every lesson
id that has ever shipped is still there (a rename is a wipe — `lesson:<id>` is
the row, and `repairLessonProgress` drops a row whose lesson no longer exists,
correctly and silently); the modules partition the lesson list exactly once; and
the activity denominator a card prints is the one `lessonActivityProgress`
derives.

**§8, a blank option.** A builder that splits on a separator it did not find
returns an empty string, which renders as a button with nothing on it —
tappable, gradeable, impossible to choose on purpose, and passing every other
rule in the section.

### Migration

The lesson id is new, every existing id is unchanged, and a record is one row per
lesson keyed `lesson:<id>` — so a profile written before this pass arrives with
the ordinals row simply *absent*, and absent is `available`. J-series M1–M9 in
`domain/numbersProgress.test.ts` walk it: the counting module's three lessons
stay complete, the module stops being complete and says so rather than either
granting the new lesson or taking the old ones back, the course denominator grows
by one while the learner's numerator does not, one activity counts once however
often the lesson is reopened, and a backup taken before the lesson existed
restores without granting it. F13 in `storage/numbersMigration.test.ts` is the
same thing through the store, and asserts `dropped === 0` — a drop is what a
*renamed* id would look like, and the two must not be confused.

## 5. What proves it

| Suite | What it covers |
| --- | --- |
| `domain/numbersProgress.test.ts` | 21 journeys J01–J21 (fresh, opened, partial steps, all-wrong practice, failed mastery, threshold pass, item never right, mid-practice resume, interrupted mastery, better/worse retake, review due and cleared, open-not-locked, module completion, every lesson completable, idempotence) and 6 negative tests N1–N6 (open ≠ completion, route mount ≠ completion, letter/word ids rejected, evidence-less flag cleared, wrong denominator, stale write) |
| `storage/numbersMigration.test.ts` | fixtures F1–F12: fresh, letter-only, contaminated, idempotent, no completion from old flags; partial, corrupted flag, retired lesson, retired items, malformed rows, round trip, Numbers-only clear |
| `features/numbers/exercises.test.ts` | ≥2 kinds per item, ≥3 options, answer not at a fixed index, seeded stability, misconception labels, mastery covers every item, `order_parts` rebuilds the word |
| `data/numbers.test.ts` | structure, namespacing, prerequisite order, audio manifest agreement, counting-form rule, readings, Intl meanings |
| `e2e/numbers.spec.ts` | N-e2e-1…8 in a real browser: fresh overview with all eighteen rows available and every one a link, all-wrong run not complete, diligent run completes exactly the lesson the work was done in, reload resumes from the record, audio present and feedback names the mistake, a new learner opening the last lesson of every module directly, Continue leading without forcing, and the back control on a deep link |
| `features/numbers/questionTypes.test.ts` | 14 cases: which type each builder produces, the four Korean instructions verbatim, the contrast-pair stimulus, ten prompts and three headings present in all 32 bundles, the three retired keys absent, the pronunciation and writing headings on the right items, the closed date forms in the data, the bundles and the manifest, and the deleted stale clips |
| `e2e/numbers-prompts.spec.ts` | the instruction on the real page: the find-the-mistake question named and its answer accepted, the explanation question over its pair, listening and meaning keeping their own, the pronunciation heading on the dates cards, and prompt + options + feedback + Continue reachable at 320×568 and 375×667 and at 22px root text |
| `scripts/numbers-qa.mjs` | the release gate (§4), in twenty sections — structure, meaning, audio, localisation, Korean, answer positions, question types, one-answer over 311 distinct questions, date spacing, example headings, and then: every lesson completable sound-free; nothing asked about before it is taught, with every forward distractor a declared misconception; no question twice in one sitting; a listening clip that says the answer it accepts; no key nothing can show; no particle pair written longhand; the completion state machine walked per lesson; the five non-Korean ordinal forms rejected everywhere except the one place each is taught against; every romanisation recomputed by the transliterator the vocabulary pipeline uses; and the six stages, the twenty shipped lesson ids and the three printed denominators |
| `scripts/numbers-layout-qa.mjs` | the list screen, measured as **ink**: one rail for the module number, module goal, summary and every lesson title; one rule for the chevrons and lesson counts; no reserved column and no unused width beside a title; nothing overlapping, nothing clipped, no sideways scroll, every row a link at least a thumb tall, and the last lesson reachable after a real scroll. 45 cases — seven sizes including landscape, 100/150/200% text, light and dark, and all 32 languages at 320 px — with four lessons seeded to real evidence so the badges are on screen |
| `scripts/numbers-qa-negative.sh` | fifteen sabotage runs, each restoring one defect and asserting the gate fires: the old prompt, an undeclared explanation gloss, 삼월 일 일 in the data and in a bundle, a pronunciation card labelled a spelling rule, the context-free blank, the two same-meaning options, a locale missing a prompt, a slot-mate as a distractor — and then 세번째 as an item, 일 번째 in a gloss, a romanisation that stops being the reading, a shipped lesson id renamed, and a contrast pair changed under the caption that was licensed by it — then restores and confirms green |
| `domain/numbersProgress.test.ts` (M1–M9) | the curriculum growing under a learner who is part-way through it: the lessons they finished stay finished, the new one is available and not started, a module they had completed is no longer complete and says so, the course denominator grows while their numerator does not, a new learner can open the ordinals lesson first, one activity counts once however often it is reopened, leaving part-way is `in_progress`, the final check's pass mark is enforced at the mark and one below it, and a backup taken before the lesson existed restores without granting it |
| `storage/numbersMigration.test.ts` (F13) | the same through the store: a profile saved before the lesson was added keeps every row, reports no drop, is granted nothing, and takes a row for the new lesson afterwards without touching the others |
| `features/numbers/questionTypes.test.ts` (the ordinal lesson) | both families in separate domains and grouped across them, no `value` on either so the cardinal builders cannot fire, the four contrast pairs, no wrong ordinal ever accepted or voiced, the four mistakes each asked with the class that names it, 이 번째 offered before 번째 as a swap of sets, both new meaning instructions in all 32 bundles and distinct from each other and from the weekday prompt, and a wrong form in a bundle only at a key that is teaching against it |
| `e2e/numbers-prompts.spec.ts` (the ordinal lesson) | in a browser: the find-the-mistake question named and 한 번째 accepted as its answer, the position question headed *몇 번째일까요?* and not the counting instruction, and four two-word ordinal options on a 320-wide screen at 32px root text with no sideways scroll and Continue reachable |
| `scripts/regression-gates-negative.sh` | five more, for the gates added after the sixth screenshot pass: the empty icon column at the head of every row, a badge bounded by its fill rather than by its ring, a blank whose option list holds two words that fit it, 둘 개, and a `completed_at` with no evidence behind it |

## 6. Level Test feedback policy (§10 of the v1.0.2 request)

The Level Test shows **no correct/incorrect verdict** by design: it is a
measurement, and revealing answers would teach the bank. What a tap gets:
an unmistakable pressed state, the next question arriving, and — for assistive
technology — a polite live region announcing *Answer N recorded* (`levelTest:answerRecorded`,
32 languages). Two guards against double submission, neither of which disables
anything: a second tap on the same question is dropped, and a tap on the *same
option position* within 250 ms of the previous answer is dropped — that is what
a double tap is, and React has already committed the next question between the
two taps. A tap elsewhere is accepted at once, so there is no dead zone; the
option list is never disabled, it is replaced. "I don't know" is exempt. Vocabulary practice (`ChoiceExercise`) is the opposite
policy and shows an explicit correct/incorrect mark and word. Tests:
`e2e/level-test.spec.ts` (announcement, single scoring), `features/review/choiceFeedback.test.tsx`.
