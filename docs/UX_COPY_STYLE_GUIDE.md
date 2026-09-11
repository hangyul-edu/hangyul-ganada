# UX copy style guide

The rules every learner-facing string in Hangyul ganada is held to. Written in
September 2026 from the audit in `docs/UX_COPY_AUDIT.md`; the machine-checked
rules name the gate that enforces them, the editorial rules name the ledger
that records that a person read the string.

## 1. Who is speaking, to whom

* **The app speaks to one learner, plainly, as a patient tutor.** Never as a
  system ("Operation completed"), never as a coach who scolds ("You got it
  wrong again"), never as marketing ("Master Korean in 30 days!").
* **Korean register is 해요체**, consistently: 맞았어요, 다시 들어 보세요, 저장됐어요.
  Not 합쇼체 (맞았습니다) and not 반말. A heading may be a noun phrase (학습
  기록, 오늘의 단어); a sentence ends in 요.
* **Every other language keeps one register throughout** — the familiar
  *du/tu/kamu/чи* or the polite *Sie/vous/Anda/та*, whichever that locale's
  bundle established — and `locale:editorial:check` fails a bundle that mixes
  them.
* **The learner is never told the scheduler's reasoning** ("your listening is
  weak"). They are told what to do and whether they did it.

## 2. Instructions say the action, not the goal

* An instruction names **the first thing to tap and where it is**. *Tap a
  Korean word on the left, then its meaning on the right* — not *match each
  word to its meaning*. *Tap the syllables below in order to complete the
  word* — not *put the word together*.
* A caption that changes with state says **the next action** (*now tap the
  meaning of 물*), never a disconnected fragment (*한국어 단어를 골라요*).
* A control that cannot act yet is **disabled**, not explained.

## 3. Feedback says the verdict once

* Where the options already carry the verdict — the blue box, the red box —
  the card says 맞았어요 or 틀렸어요 and stops. It never restates the option
  the learner is looking at (*정답은 …예요* under a highlighted answer is
  forbidden; `choiceFeedback.test.tsx`).
* A shown answer is **not a verdict**. The card says the answer was seen and
  that the item comes back; it never congratulates and never corrects.
* Nothing in feedback copy is a judgement of the learner: no *wrong again*,
  *bad*, *lazy*, *should have*. `copy:audit:check` flags the vocabulary of
  scolding in every language for a person to read.

## 4. Statistics say exactly what was measured

* A sentence about a number names the number's definition. *You got 32 right
  without a hint this week* is true of `passed && !hint_used`; *you remembered
  32 things on the first try* was not, and was replaced.
* Two counters on one screen measure the same unit or one of them goes
  (`wordSessionCounts.test.tsx`). *x / y* means words finished today, nowhere
  else and nothing else.
* No claim is made below its evidence floor: an insight needs `MIN_EVIDENCE`
  observations before it is shown (`domain/review.ts`).

## 5. Terminology — one word for one thing

| Thing | Korean | English | Not |
| --- | --- | --- | --- |
| a letter (jamo) | 글자 | letter | 낱자 |
| the composed block | 음절 | syllable block | 글자 (for the block), 블록 |
| a word | 단어 | word | 낱말 |
| the daily set | 오늘의 단어 | Today's words | 일일 단어 |
| the answer choices | 보기 | options | 선택지 |
| the correct choice | 정답 | correct | 답 (as a verdict) |
| a hint | 힌트 | hint | 도움말 |
| the counter noun | 세는 말 | counter | 단위명사 (in lessons) |
| the Sino / native number sets | 한자어식 / 고유어식 | Sino-Korean / native Korean | 한자어 수 / 순우리말 수 |
| the vocabulary level | 어휘 레벨 | vocabulary level | 등급, 급수 |

`copy:audit:check` forbids 낱자 and 낱말; `locale:editorial:check` flags 글자
used for the block; `numbers:copy:check` holds the number-set names.

## 6. Claims the product may not make

* Nothing is *official*, *certified* or *accredited*; the level is the
  product's own model and its disclaimer says so.
* No TOPIK preparation, no fluency or speed promise, no *free* and no
  subscription language — this is bought once.
* The app never claims to be on line: it works offline, and copy that names
  a connection (the dictionary's first open on the web) says exactly when.

## 7. Punctuation and typography

* Korean sentences end with a full stop; headings, labels and button text do
  not. Ellipsis is the single character …, never three stops.
* Typographic quotes in the languages that use them (“ ” for Korean and
  English, « » for French where established, 「」 for Japanese terms); the
  straight ASCII pair only inside code.
* Numbers are formatted by `Intl` through `{{count, number}}`; digits are
  never concatenated to a unit by hand. Korean particles that agree with a
  variable use the formatter (`{{word, eunneun}}`), never a slash pair.
* Plural keys carry every category the language needs (`_one`, `_other`,
  and the Slavic `_few`/`_many`); `i18n:check` fails on a missing category.

## 8. Accessibility text

* Every control has an accessible name that says what it does *and* to what:
  *Slot 2: 학. Tap to take it back*, not *Remove*.
* A live region announces state changes politely and briefly; it never
  repeats the instruction.
* Marks that carry a verdict by colour also carry it in words for a screen
  reader (`hg-sr-only`).

## 9. Translation

* A translation renders the *sense* of the Korean or English source, in the
  idiom of the target language, at the register the bundle uses. Word order is
  the target language's, never the source's.
* Nothing is left in the source language unless it is the thing being taught
  (a Korean word, a syllable) or a brand (Hangyul Ganada).
* No two unrelated languages carry the identical string; identical text is
  the signature of an untranslated slot (`quotes-qa`, `locale-content-qa`).
* Every string a learner can read in Korean has a reading recorded in
  `docs/copy-audit-ko.json`; a string whose text changes must be read again
  (`copy:ledger:check`).
* The reading recorded there is the model's, not a native speaker's. Where
  naturalness cannot be established without one, the row says so
  (*NATIVE-SPEAKER REVIEW REQUIRED* in the quotation audit) and it is not
  presented as verified.
