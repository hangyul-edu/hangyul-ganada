# The Numbers course — content, progress model, migration, and how it is proven

Status, 2 September 2026: rebuilt in the v1.0.2 pass after a P0 — lessons showed
as completed without having been studied. Numbers had never shipped (the
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

**Status** (`lessonStatus`) — `available` (never opened), `not_started`
(opened, nothing done), `in_progress`, `completed`, `mastered` (completed with a
perfect mastery check), `review_due` (completed and seven days since completion
or the last review, `REVIEW_INTERVAL_DAYS`). Only `completed`, `mastered` and
`review_due` may be drawn as finished; the overview's check mark is drawn for
those and nothing else.

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

`apps/web/src/data/numbers.ts` — 6 modules, 19 lessons, 95 items, 9 exercise
kinds, 10 question types.

| # | Module | Lessons |
| --- | --- | --- |
| 1 | Two kinds of number | Sino 1–10 · native 1–10 · the two zeroes · which system when |
| 2 | Past ten | Sino building · native building · the five counting forms |
| 3 | Counting things | people and things · everyday counters · age |
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
build.** `numbers:qa` §8 generates practice *and* mastery for all nineteen
lessons over three attempts, deduplicates, and checks each of the 284 distinct
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

**Spacing: a counted quantity is open, an ordinal is closed.** 한글 맞춤법 §43
spaces a unit noun from its numeral and its 다만 clause closes the same noun
when the number is an order. A date is an order:

| | |
| --- | --- |
| quantity, open | 한 개 · 세 명 · 두 잔 · 스무 살 · 세 시 · 삼십 분 · 오천 원 |
| ordinal, closed | 삼월 일일 · 유월 육일 · 시월 십일 · 십오일 · 이천이십육년 |

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
| `scripts/numbers-qa.mjs` | the release gate (§4) — structure, meaning, audio, localisation, Korean, answer positions, question types, one-answer over 284 distinct questions, date spacing, example headings |
| `scripts/numbers-qa-negative.sh` | ten sabotage runs, each restoring one defect and asserting the gate fires: the old prompt, an undeclared explanation gloss, 삼월 일 일 in the data and in a bundle, a pronunciation card labelled a spelling rule, the context-free blank, the two same-meaning options, a locale missing a prompt, a slot-mate as a distractor — then restores and confirms green |

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
