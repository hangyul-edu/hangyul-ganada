# How learner-facing content is made, checked and approved

*Written 10 September 2026; the child-safety stage added 11 September 2026. It
describes the lifecycle a Korean item passes through before a learner can see
it, and names the file that holds each stage.*

---

## 1. The shape of the pipeline

```
   editorial source            content/vocabulary/entries/*.jsonl   (3,370 taught words)
        │                      content/vocabulary/copy/*.json       (24 locale packs)
        │                      content/vocabulary/retired-words.json (23 tombstones)
        │
        ▼  structural validation      build_vocabulary.py — schema, headword length,
        │                             part-of-speech override, gloss shape, sense id
        │
        ▼  child-safety validation    build_vocabulary.py → refuse_unsafe_rows, the
        │                             one policy (packages/content-safety); a row that
        │                             fails stops the build with the row named
        │
        ▼  deterministic language     korean-morphology (one conjugator), particle
        │  checks                     allomorphs, safety frames, noun classes
        │
        ▼  generation                 build_level_test.py  → ranked anchors (policy on
        │                             headword, gloss and example; retired words out)
        │                             build_level_test.mjs → the item bank + cloze.json
        │                             (policy on every distractor and every composed
        │                             sentence, then on the finished item in 32 languages)
        │                             build_dictionary.py  → the searchable dictionary
        │                             (policy on headword, every sense, every example)
        │                             content/vocabulary/context-items.json →
        │                             hand-written items, validated by the same rules
        │
        ▼  semantic-quality review    a person reads the rendered item.
        │                             refusals: ctx: 0 + ctxWhy in the entry
        │                             fixtures: context-negative-fixtures.json
        │
        ▼  localisation validation    i18n / locale:content / copy:fresh /
        │                             translation:semantics / leveltest:locale
        │
        ▼  approved                   the gates in verify:quick pass — including
        │                             content:safety:check over every family and locale
        │
        ▼  publishable                public/level-test, public/corpus, the APK —
                                      read again by content:safety:bundle:check, and
                                      once more on the device by the runtime gate
```

The lifecycle is `DRAFT → STRUCTURALLY_VALID → CHILD_SAFETY_VALID →
LANGUAGE_VALID → REVIEWED → PUBLISHABLE`; nothing that fails the child-safety
stage reaches the next one. The policy itself is `docs/CHILD_SAFE_CONTENT_POLICY.md`.

**Generated output is never the source of truth.** `apps/web/public/level-test/`
and `apps/web/src/data/generated/` are build products; a correction made there
is overwritten by the next build and was, historically, the way a fix appeared
to work and then vanished. Fix the entry, the copy pack, the classifier or the
builder, then rebuild.

---

## 2. Where bad content came from

Four causes, all found on 10 September 2026 and all fixed at the source.

### 2.1 A distractor rule that selected for absurdity

`build_level_test.mjs` forbade a distractor from the answer's own browse
category. Written to stop two-right-answer items, it made "unrelated" the
qualifying condition, so the winning distractors were the ones with nothing to
do with the sentence. Every one of the 625 shipped contextual items had all
three distractors from a different category than the answer.

**Fixed** by inverting the rule for nouns — a distractor must now *share* the
answer's category or one of its tags — and keeping it for predicates, where a
same-area verb genuinely is a second right answer. The frames where a same-area
noun would also be right are refused outright rather than filled with a distant
option (§5 of `CONTENT_QUALITY_STANDARD.md`).

### 2.2 A classifier that read words inside other words

The categories the rule above now depends on were themselves wrong. The rules
in `scripts/content/categories.py` are alternations written `\b(head|face|…|
pain|hurt|…)` — a word boundary in front and **nothing behind** — so every
alternative was also a prefix rule:

| gloss | matched | landed in |
|:---|:---|:---|
| a painter, an artist | `pain` | Body & Health |
| to draw, to paint | `pain` | Body & Health |
| a sandwich | `sand` | Animals & Nature |
| window | `wind` | Animals & Nature |
| a birthday | `birth` | Body & Health |
| dollar | `doll` | Home |
| a pillow | `pill` | Body & Health |
| a warehouse | `war` | Society |
| a password | `pass` | Actions |
| an example | `exam` | School & Work |

292 of 3,393 words took their category from a match that landed inside a longer
word. It is a customer-facing defect on its own — the browse screen files a word
by this — and it silently corrupted every rule that reads a category.

**Fixed** with a *no word character follows* lookahead on every rule, plus an
English inflection and derivation table so that closing the accidental matches
does not cost the real ones (`shoes` → shoe, `information` → inform). `-ter` is
deliberately excluded: it would give *laughter* → laugh and *painter* → pain.
`-y` and `-ly` need a four-letter stem, because *many* → man, *busy* → bus and
*early* → ear were each a live miscategorisation on the first run.

The residue is 1,085 hand-decided entries in `OVERRIDES`, up from 552 — the
output of reading all eighteen finished category listings word by word.

### 2.3 Two frame guards that had never executed

```js
if (inflects && isUnconstrainedPredicateFrame(anchor.example)) { … }
const eatingFrame = isConsumptionObjectFrame(anchor.example);
```

Both functions begin `if (!sentence.includes('____')) return false`, and both
were handed the sentence with the answer still in it. They returned false for
every item ever built. The first is the fix that I-185 and §20V.1 of the product
report are about — the photographed `일곱 시에 ____` — and it had never once
fired.

Neither gate over this file could see it: `leveltest:ambiguity` re-derives the
frames from the *shipped bank*, where the prompt does carry `____`, so it
computed them correctly and found nothing — because the distractor rule of the
day was keeping the offending options out for an unrelated reason. Inverting
that rule removed the accidental cover and four items came through immediately.

**Fixed** by passing `blanked`. The lesson is the one §7.2 of the report already
states: a green gate answers the question it was written to ask. It does not
prove the code it was written about ran.

### 2.4 A quality dimension with no gate at all

See §1 of `CONTENT_QUALITY_STANDARD.md`. **Fixed** by
`scripts/level-test-distractor-qa.mjs`, added to `verify:quick`.

### 2.5 Three word lists, none of which held the word that shipped

Found 11 September 2026: `dict_섹스하다` was a level-12 Level Test question and
a distractor in two more, and `npm run content:safety:check` was green. The
safety layer was three lists in three files — a whole-headword list in
`learner-safety.json` (it had 섹스; the headword was 섹스하다), a substring list
in `build_level_test.py` (it never had 섹스), and an English gloss test (it
looked for "sexual"; the gloss was "to have sex") — and the gate that read the
first list never resolved the option ids of `meaning` items, so a dictionary
anchor used as a distractor was invisible to it. The dictionary, the pool the
upper levels are drawn from, had been declared out of scope.

**Fixed** at the structure, not the word. One versioned policy
(`packages/content-safety/policy/child-safe-content-policy.json`) with two
evaluators held to the same 355 fixtures; every builder, the runtime and the
release scan read it; the dictionary is a learner-facing surface like every
other; a finished item is read in every language before it is written. The
old gate is reproduced in `packages/content-safety/src/legacy.test.ts` and
shown to pass the row. Full account: `docs/CHILD_SAFE_CONTENT_AUDIT.md`.

---

## 3. The review stage

Deterministic rules take the bank as far as a program can. What is left is a
person reading the rendered item, and it is recorded in two files rather than in
a conversation:

**`content/vocabulary/context-items.json`** — the other direction. Where the
rules leave a level with no defensible item, the item is *written*, and the
builder holds it to every rule it applies to its own output: particle agreement
across all four options, category sharing, level spread, the safety lists and
every frame test. A curated item that fails is a build failure, not an
exception, because an exception is a rule with a hole in it. Twenty-two items at
levels 1–5, where a card sentence is too short to constrain a blank.

**`ctx: 0` and `ctxWhy` in `content/vocabulary/entries/*.jsonl`** — 48 items
read and refused this pass, beside the 6 recorded by earlier ones,
each with the rendered item it was written against and why. Two reasons account
for all of them:

* `twoAnswers` — another option is also true (편의점에서 채소를 사요).
* `absurdOptions` — the frame is so narrow that no word of the answer's kind is
  a plausible wrong answer, so the item is answerable by elimination.

An entry here is the **last** resort. Every one was checked first against "is
there a rule here?", and four classes found this way became rules instead: the
bare modifier slot, the time-noun 에 slot, the destination verb and the
existential verb.

**`content/vocabulary/context-negative-fixtures.json`** — eight items that
shipped or nearly shipped. `leveltest:distractors` runs each through the same
checks it runs over the bank and fails if any fixture *passes*. A rule that
cannot fail is not a rule. The corrected forms are run too and must come back
clean.

---

## 4. What the runtime may and may not build

Today's Vocabulary, Review and the Level Test all read
`apps/web/src/data/generated/cloze.json`. **The browser builds no gap-fill of
its own.** It used to, differently: `splitSentence` blanked the *stem* of a verb
and left its ending on screen while the options were dictionary forms, and
nothing in that path knew about particle agreement, person nouns or unsafe
compositions. Three copies of the rules is three sets of bugs. One place decides
what a valid gap-fill is; everything else reads the answer.

`answerability` generates every runtime question in all thirty-two languages and
asserts the one property that makes a question a question.

---

## 5. Determinism

The builder seeds its own PRNG, so the same corpus produces the same bank twice;
the bank and every meanings file are content-hashed, so a rebuild that changes
nothing changes no filename. `content:leveltest:check` fails when the checked-in
artefact does not match what the current source produces, which is what stops a
hand-edit to a generated file from surviving.

---

## 6. Retiring a word

A word that the policy refuses is **retired, never deleted**: set `k: 0` on
its pack row with the reason, add a tombstone to
`content/vocabulary/retired-words.json` (id, word, policy category, reason,
date, previous example, replacement or `null`), remove its rows from the 24
copy packs, and rebuild. The id stays in `word-ids.json`;
`contentCompatibility.test.ts` allows an id to stop resolving only with a
tombstone. On a device, the plan repair drops the word from what is still
owed, the review builder stops asking it, the mistakes notebook stops listing
it, and every progress row is kept.

## 7. Rebuild order

Changing an example sentence touches thirty-one translations and two
recordings. The order is not optional:

1. edit the entry in `content/vocabulary/entries/*.jsonl`, **including its seven
   inline translations** (`en ja zh es fr de pt`);
2. edit all twenty-four `content/vocabulary/copy/<locale>.json` rows —
   `copy:fresh:check` fails if step 1 happens without step 2;
3. `content:vocabulary` (the child-safety gate runs here) → `content:corpus`
   → `content:dictionary` → `content:leveltest`;
4. `npm run copy:fresh`;
5. `npx tsx scripts/export-speech-plan.mjs`, then
   `python3 scripts/content/generate_audio.py` — the recorder needs the network
   and makes only the missing clips;
6. `npm run curriculum:build`, `npm run vocabulary:relations`;
7. `npm run policy:runtime` if the policy changed, then
   `npm run content:safety:qa` to rewrite `docs/child-safe-content-audit.json`.

`content:corpus` is the one people forget. Anything that loads content the way
the app does reads `public/corpus/*.json`, not the generated pack.
