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

**Status** (`lessonStatus`) — `locked` (a prerequisite is not complete),
`available` (unlocked, never opened), `not_started` (opened, nothing done),
`in_progress`, `completed`, `mastered` (completed with a perfect mastery check),
`review_due` (completed and seven days since completion or the last review,
`REVIEW_INTERVAL_DAYS`). Only `completed`, `mastered` and `review_due` may be
drawn as finished; the overview's check mark is drawn for those and nothing else.

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

`apps/web/src/data/numbers.ts` — 6 modules, 19 lessons, 97 items, 9 exercise kinds.

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
path. Prerequisites are ids and point backwards only; a locked lesson is shown,
named and explained, and is not a link.

**Exercise kinds** (`apps/web/src/features/numbers/exercises.ts`): `read_choose`,
`listen_choose`, `digits_to_korean`, `korean_to_digits`, `choose_system`,
`counter_form`, `spot_mistake`, `fill_sentence`, `order_parts`. Distractors are
built from misconception classes — `system_swap`, `plain_form`, `adjacent`,
`sound_alike`, `irregular_month`, `wrong_counter`, `spacing`,
`wrong_system_context` — and the feedback shown after a wrong answer names the
class of the option that was chosen. Option order is a Fisher–Yates shuffle
seeded by `(lesson, item, kind, phase, attempt)`: stable within an attempt,
different on a retake, and never a function of the question index alone.

**Audio** — clip ids are the codepoint rule shared with the vocabulary corpus
(`word_<hex>`/`ex_<hex>`), so 일 the numeral and 일 the word are one recording.
`scripts/export-speech-plan.mjs` adds every word and example; `npm run audio:build`
records only what is missing; there is no runtime synthesis. `numbers:qa` fails
on any item whose clip is absent from the manifest or whose manifest text differs
from the Korean shown.

**Localisation** — 272 keys × 32 languages in `locales/<code>/numbers.json`.
`numbers:qa` fails on a missing key, a blank value, a broken `{{placeholder}}`
set, or a sentence identical to the English.

## 5. What proves it

| Suite | What it covers |
| --- | --- |
| `domain/numbersProgress.test.ts` | 21 journeys J01–J21 (fresh, opened, partial steps, all-wrong practice, failed mastery, threshold pass, item never right, mid-practice resume, interrupted mastery, better/worse retake, review due and cleared, locked/unlocked, module completion, every lesson completable, idempotence) and 6 negative tests N1–N6 (unlock ≠ completion, route mount ≠ completion, letter/word ids rejected, evidence-less flag cleared, wrong denominator, stale write) |
| `storage/numbersMigration.test.ts` | fixtures F1–F12: fresh, letter-only, contaminated, idempotent, no completion from old flags; partial, corrupted flag, retired lesson, retired items, malformed rows, round trip, Numbers-only clear |
| `features/numbers/exercises.test.ts` | ≥2 kinds per item, ≥3 options, answer not at a fixed index, seeded stability, misconception labels, mastery covers every item, `order_parts` rebuilds the word |
| `data/numbers.test.ts` | structure, namespacing, prerequisite order, audio manifest agreement, counting-form rule, readings, Intl meanings |
| `e2e/numbers.spec.ts` | N-e2e-1…5 in a real browser: fresh overview, all-wrong run not complete, diligent run completes and unlocks, reload resumes from the record, audio present and feedback names the mistake |
| `scripts/numbers-qa.mjs` | the release gate (§4) |

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
