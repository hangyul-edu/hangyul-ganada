# Architecture

Decisions that were not obvious, and the seams deliberately left open.

## Shape

```
apps/web        the product — Vite + React + TypeScript
apps/mobile     the Capacitor shells for Android and iOS
packages/design-tokens      one source for every colour, radius, shadow
packages/handwriting-core   the evaluator; no DOM, no React
packages/shared-types       the domain, shared across the workspaces
content/                    built content the pipeline reads and writes
scripts/content/            the content pipeline — dictionary, images, audio
```

Within `apps/web/src`:

```
audio/          the pronunciation player and its manifest
domain/         mastery stages and every progress calculation
storage/        the persistence layer — driver, repositories, migrations
i18n/           the localization layer — registry, resolution, formatting
locales/<code>/ translation bundles, one directory per BCP-47 tag
config/product  the product's name and slug, in one place
```

## There is no account, and now there is no server either

Hangyul ganada is bought once from an app store and runs entirely on the device.
No login, no sign-up, no profile, no analytics identity — and, as of this
release, **no backend at all.**

This happened in two steps. The API first lost `learners`,
`learning_sessions`, `character_attempts` and `item_progress`, along with
SQLAlchemy, Alembic, Postgres and the migrations: an endpoint that can create a
user is a user system whether or not the app calls it, and leaving one dormant
is not the same as not having one.

What was left was a read-only content service that mirrored the curriculum over
HTTP — and nothing in the shipping product ever called it. In this release it
was removed too. A workspace no production path depends on is not free: it is a
Python environment to install, 84 tests to run, a locale negotiator to keep in
step with the client's, and one more place for the curriculum to go stale. The
export it consumed now writes to `content/curriculum.json`, which the content
pipeline reads directly.

What remains is the content half — curriculum, typefaces, vocabulary, provenance
— served read-only for content preparation, review and QA tooling. **The app
never calls it.** Everything it serves is bundled into the app at build time,
which is what makes the lessons work on a plane.

## Progress lives in IndexedDB, behind repositories

`storage/driver.ts` is the seam. Above it, nothing knows whether the bytes end
up in IndexedDB, in SQLite on a phone, or in a `Map` during a test:

```
SettingsRepository    preferences, plus a localStorage mirror for first paint
ProgressRepository    one row per character or word — the large collection
LearningRepository    practice sessions, capped at 500
```

IndexedDB rather than `localStorage` because learning history is structured and
unbounded. `localStorage` is a synchronous 5 MB string bucket: writing the whole
history on every stroke blocks the main thread mid-drawing, and the quota is
reachable by a learner who practises for a year. Small preferences still use it,
where its synchronous read is a feature — the locale and the voice have to be
known *before* React renders anything, or a learner who reads right to left gets
a frame of left-to-right English on every launch.

A browser that refuses IndexedDB gets `MemoryDriver` and a working session.
`driver.durable` is false in that case and Settings says so, rather than letting
a learner believe their progress is safe.

### Migrations are not optional

There is one copy of a learner's history and it is on their device, so every
future release has to read what every past release wrote. `storage/schema.ts`
holds the version and the migrations; `storage/storage.test.ts` asserts that a
v2 `localStorage` profile arrives intact in v3, that an interrupted import is
retried rather than lost, and that a corrupt row costs the learner that row
rather than the whole history.

Shipping an update that silently resets progress is, for a paid app with no
cloud copy, indistinguishable from deleting the customer's purchase.

## The evaluator is a separate package for a reason

`handwriting-core` takes normalised strokes and a glyph mask and returns a
verdict. It has:

* **no DOM** — its tsconfig omits the DOM lib, which is what makes the claim
  real. When `CanvasGlyphRasterizer` lived here, that broke, and the class was
  moved to `apps/web` where it belongs.
* **no canvas** — stroke rasterisation is pure TypeScript, so it runs in Node
  tests today and under Hermes later.
* **normalised coordinates** — a stroke on a 320px phone canvas grades
  identically to the same stroke on a 560px desktop.

The one platform-specific piece, character → mask, sits behind
`GlyphRasterizer`.

## The guide and the mask share one function

This is the most important invariant in the codebase, and it was learned the
hard way.

The first implementation drew the on-screen reference glyph as DOM text centred
by CSS, and built the evaluation mask with canvas `textBaseline` metrics. CSS
centres the *line box* using font ascent and descent; canvas centres differently.
The two disagreed by more than the entire tolerance band, so **a learner traced
exactly what was on screen and was told they were wrong.**

Both now call `drawGlyph()` / `glyphLayout()`. Whatever is painted is, pixel for
pixel, what is graded.

The E2E suite traces by reading the guide canvas's own pixels rather than from
hard-coded coordinates — so if the two ever drift again, the test fails rather
than the learner.

## Grading is an interface, not a function

`HandwritingEvaluator` is what the learning flow depends on.
`GeometryHandwritingEvaluator` is today's implementation. Raw strokes cross the
interface, not a pre-baked mask, precisely so a future stroke-order or OCR
recogniser can use timing and order.

Attempts persist their **full score breakdown** plus `evaluator_id`, so the
threshold can be re-tuned and history re-scored without asking learners to write
everything again — and so geometry results are never silently compared against a
future recogniser's.

The client computes the verdict, because that is where the ink is. That makes it
untrusted input. What protects the data is the stored breakdown: an implausible
attempt can be identified later. Server-side re-scoring would need the strokes,
which is a deliberate future step rather than something quietly assumed.

## Curriculum is content, not user data

Characters, lessons and fonts are authored in `apps/web/src/data`; the
vocabulary is generated into `data/generated/vocabulary.json` by the content
pipeline. Both are exported to `content/curriculum.json` by
`npm run curriculum:build`, which is what the Python content and QA scripts read
so that they and the app are looking at one artefact.

* Not in a database: a reworded mnemonic should not need a migration.
* Not hand-copied into Python: two copies drift, and a font audit or a coverage
  report would eventually be run against a curriculum the app had moved past.
  `curriculum:check` gates the build on the export being current.

## Localization is a layer, not a feature

Three things are kept apart on purpose, because conflating any two of them is
how a localized app goes wrong:

| | what it is | where it lives |
| --- | --- | --- |
| **Interface copy** | text the app says | `apps/web/src/locales/<bcp47>/<ns>.json`, via i18next |
| **Explanatory content** | text *about* the Korean — meanings, mnemonics, hints | `translations` maps on the curriculum records |
| **Target content** | the Korean being learned | plain fields; never translated, never mirrored |

`가`, `사과` and `안녕하세요` are the subject of the lesson. They read the same in
every interface language, in the same order, in the same direction. Everything
around them follows the learner.

### The default is English, and it does not depend on where you are

Precedence is: **stored profile preference → persisted device mirror →
English**. The browser's locale is not in that list. It is used to *offer* a
language during onboarding and nothing else.

That is a product decision with a technical consequence. The audience is people
learning Korean, not people who already read it, so a learner opening the app
from Seoul gets English until they say otherwise. `preferences.locale` is
nullable and null by default precisely so "has not chosen" stays distinguishable
from "chose English" — a `DEFAULT 'en'` would have destroyed that distinction
and made the first precedence rule fire for everyone.

### Nothing enumerates the languages

`AVAILABLE_LOCALES` is derived from the filesystem (`import.meta.glob` over
`src/locales/*/*.json`); the API's is derived from the content. Adding a
language is adding a directory and, if the vocabulary is being translated too, a
key per word. No component, type, query or migration mentions a language.

The locale *registry* is separate from that and deliberately more permissive:
`describeLocale('yo-NG')` returns a usable descriptor built from
`Intl.DisplayNames` for a language nobody has translated into. That gap —
between *internationalization support* and *translation coverage* — is the whole
point, and `npm run i18n:report` measures the second without pretending it is
the first.

### One fallback chain, implemented twice, tested to agree

`pt-BR → pt → en`, always ending at English. It is implemented in
`apps/web/src/i18n/locales.ts` for the client and `hangyul_ganada/i18n.py` for
the API, because both need it and neither can call the other. Both are tested
against the same cases; a UI string and a word's meaning must never disagree
about where to look next.

Responses report the locale they actually resolved (`resolved_locale`), so a
client can mark English standing in for a missing translation rather than
implying the language was available.

### Vocabulary translations are content, not database rows

The obvious design is `vocabulary` + `vocabulary_translations` keyed by
`(vocabulary_id, locale)`. That is right when the content is user-editable. Here
it is not: the curriculum ships with the code and is already deliberately kept
out of the database (see above). So the same normalisation is applied to the
content — a `translations` map per record, keyed by BCP-47 tag — which has the
property that actually mattered: adding Japanese is adding data, and the map
maps one-to-one onto those two tables the day the curriculum becomes editable at
runtime.

### The writing canvas never mirrors

`<html dir>` follows the locale and the layout is built from logical properties,
so a right-to-left interface flips as it should. The writing box does not.
`WritingCanvas.module.css` pins `direction: ltr`, and so do the syllable
navigator, the prompt glyph and the example sentence. Hangul is written left to right
whatever language the surrounding interface speaks, and mirroring 사과 into 과사
would teach the word backwards. This is the one region of the app that is
deliberately immune to `dir`.

## The renames kept three identifiers

The product has been renamed twice: **Hangyul Start** → **Hangyul GaNaDa** →
**Hangyul ganada**. The last of those is cosmetic — 가나다 is a word, not three
initials, and the camel-cased spelling read like an acronym nobody could say —
which is exactly why it was not allowed to touch anything a device stores. Three
references to an old name survive on purpose, and `npm run name:check` fails if
a fourth appears without a documented reason:

* **`HangyulGaNaDa`, the iOS WebView scheme** — the origin the app's storage is
  keyed to. Changing it would move the origin and discard every existing
  learner's progress, in exchange for a string no human ever sees. The package
  ids (`com.talkhangyul.ganada`) are unchanged for the same reason.

* **`hangyul-start:learner` / `hangyul-start:locale`** — the old localStorage
  keys, read once on first load and retired on the first save. A learner who had
  already practised fifty characters keeps them. Renaming the product is our
  problem, not theirs.
The second exception, an Alembic revision id, retired with the database itself:
there is no longer a migrations directory to strand.

Everything else moved, including the Python package (`hangyul_ganada`) and the
npm scope (`@hangyul-ganada/*`). Those are identifiers that nothing deployed
stores, so renaming them cost nothing and leaving them would have been the
confusing choice.

## Design tokens generate the CSS

`packages/design-tokens/src/index.ts` is the source; `tokens.css` is generated
and committed, and `tokens:check` fails the build when it is stale. No component
contains a literal hex value, radius or shadow.

Values are either read off the design PDF's colour page or **sampled pixel by
pixel** from rendered reference screens — including the finding that Hangyul's
shadows are warm-tinted rather than neutral grey, which a neutral
`rgba(0,0,0,.1)` gets visibly wrong.

## Every progress bar is defined in one file

`domain/progress.ts` holds every figure the app displays, each as a named
function answering one question. A progress bar is a promise: if two bars on a
screen measure different things and neither says which, a learner learns to
ignore both.

Two of them deserve their reasoning stated, because the obvious choice is wrong:

* The **alphabet** bar counts letters only. Including the practice syllables
  would make it read 40% when the learner knows every letter in Korean.
* The **vocabulary** figure is *today*, not the catalogue. It reads `3 / 10` —
  words finished against the learner's daily goal — because a bar measured
  against a corpus heading for ten thousand entries is a line that never moves
  and a number that only ever says how much is left.

## The corpus is depth, and it is never the interface

Vocabulary has no locks and no browsing-as-curriculum. What a learner is offered
is **today's plan**: a small number they chose, built from words they are
losing, words that are fading, and the next few they have not met.
`domain/vocabularyDay.ts` decides which; `features/vocabulary/dailyQuestions.ts`
decides what each looks like. Categories and search still exist, one tap below
the day's card, for somebody who came to look a word up.

The screen this replaced was a browser: seventeen categories, each a stack of
numbered sets, each set six words to be written syllable by syllable. Two
decisions before any Korean, between things nobody has a basis to choose
between — "Set 13" is not something a person can want — and at ten thousand
words it would have been a dictionary with a progress bar on it.

The plan is persisted, so leaving at four of ten and coming back gives four of
ten and the same six words.

## Vocabulary is never handwritten

Not in a lesson, not in review, not in saved words, not in the daily session.
The rule is enforced in three independent places, because a single one would
leave a route open:

| Where | What it does |
| --- | --- |
| `WORD_SKILLS` in `domain/memory.ts` | has no `guided_writing`, so the scheduler cannot select it |
| `wordExercise` in `features/review/exercises.ts` | returns `null` for `write`, so a hand-built candidate produces no question |
| `writingRequired` in `domain/mastery.ts` | is false for words, so nothing waits on ink to be finished |

`npm run vocabulary:qa` asserts the first two from outside the type system.

## Deep where you are asking, shallow where you are working

A quiz screen carries a word, a sound and four options. Everything a dictionary
entry should have — IPA, part of speech, a fuller definition, the example with
its translation, how it is said when that differs from how it is written,
related words — lives on `/words/word/:id` and only there. The split is the
design: a question screen has two seconds of a learner's attention and
everything on it competes for them, and looking a word up is a different
activity that deserves the whole screen.

The pronunciation is derived rather than stored — see `data/pronunciation.ts`.
It transcribes the content pipeline's reviewed *spoken* form where one exists
(학교 → 학꾜 → [hak̚.k͈jo]) and applies the deterministic sound changes on top:
resyllabification, nasalisation, lateralisation, intervocalic voicing.
Transcribing the spelling would show the learner the letters they can already
see.

## Mastery is a ladder that only goes up

```
unseen → introduced → written → learned
```

Each rung is earned by a different act: writing it over a guide proves you can
produce the shape, recognising it among its look-alikes proves you can *read*
it. There is **one** writing rung, not two. There were two — the same movement
with a fainter model the second time — and the second could only measure whether
the learner was willing to do it twice, which for someone facing forty letters
is a lesson twice as long for the same learning. `traced` survives as a stage
name because old profiles are written in it; nothing produces one any more.

A word's ladder has no writing rung at all: met, heard, understood.

The ladder never goes backwards. A letter you once wrote is a letter you once
wrote, including on a day you get it wrong; that day sets `needs_review`, which
is a statement about now rather than a demotion. Demoting progress for a bad
attempt teaches learners to stop attempting.

## Review asks about what is slipping, not about what was learned

`candidates()` will not offer a skill whose memory is holding. That one rule is
what stopped the Review screen reading "500 to review" for a learner who had
learned five hundred words — a to-do list that lengthens every time you do
something. `reviewNeed()` in `domain/review.ts` classifies every item-and-skill
as one of five things:

| Need | Meaning | Counted? | Offered? |
| --- | --- | --- | --- |
| `wrong` | missed, and not yet answered right twice since | yes | yes, first |
| `weak` | keeps being lost | yes | yes |
| `due` | past its schedule | yes | yes |
| `consolidate` | this way of asking has never been tried | **no** | yes, capped |
| `settled` | answered right, recently, holding | no | **never** |

`consolidate` is the subtle one, and it is deliberately in the session and out
of the counts. It is worth *asking* — it is how "I can read it" becomes "I know
it" — and it is not a memory need, so putting a number on it would be the
catalogue-shaped figure all over again. The session builder already caps how
much new ground one sitting breaks.

Example sentences are never scheduled. A sentence is context for the word it
demonstrates: `sentence_comprehension` is a *skill of the word*, so 엄마 has one
memory row whatever its sentence is, and learning two hundred words does not
create two hundred sentences to review.

## Three lists that look alike and are not

| | Whose decision | What it means | Where |
| --- | --- | --- | --- |
| **Saved word** | the learner's | *I want to keep this* | `/words/saved` |
| **Review** | the system's | *this is fading* | `/review` |
| **Mistake** | neither; it is a fact | *this went wrong* | `/review/mistakes` |

Saving a word does not enrol it in every future review — that is how a save
button becomes a punishment. It puts the word somewhere the learner can find it
and gives them a button that reviews *those words* when they ask. A mistake
raises an item's priority and stops doing so once it has been answered right
twice; the row survives, because "this learner finds this one hard" is worth
knowing, and the notebook screen is for things still going wrong.

Mistakes are collected in `recordReview`, which every exercise in the app
reports through — not by the screens. A screen-by-screen implementation
collects mistakes from whichever screens remembered to.

## One resolved plan, and both screens read it

Review used to say *8 questions* and open a page reading "not found". Both
numbers were honest computations of different things: the screen counted what
the scheduler thought was worth asking, and the session counted what survived
the interleaving rules and the option generators.

`domain/plan.ts` resolves a `PracticePlan` in which every item has already been
proved to produce a question. The Review screen prints `plan.count` and hands
*that plan* to the session through the router's state; the session runs it. The
count and the questions are the same object, so they cannot drift — and each
manual mode gets its own resolved plan before its button is drawn, so an empty
mode is shown as empty rather than offered and then apologised for.

## A new screen starts at the top, and nothing else moves it

Nothing in this app scrolls the window. A tabbed screen scrolls inside
`AppShell`'s `<main>`; a learning screen scrolls inside `FocusScreen`'s middle
row, which exists so the action footer can stay pinned clear of the system
navigation bar. That is why `window.scrollTo(0, 0)` was not the fix for lessons
opening halfway down: it succeeds, scrolls something that was already at zero,
and changes nothing visible.

So the reset lives in the two components that own a scroll box (`useScrollReset`),
each keyed on what "new" means there:

| Owner | Key | What that means |
| --- | --- | --- |
| `AppShell` | `pathname + search` | a different route, including `?mode=` |
| `FocusScreen` | the screen's `resetKey` | a different letter, word, step or question |

Deliberately simple, and deliberately not browser-style restoration: a lesson is
a sequence of single screens, and arriving mid-screen costs more than not being
returned to where a list was left. A modal, a bottom sheet, an answer and a
re-render all leave the position alone, because none of them changes the key.

## Audio on entry is not a preference

A question whose prompt is a sound is not a question until the sound has been
heard. `useEntryAudio` plays an item's clip once when the learner arrives at it,
on every screen where hearing the Korean is how you answer: the letter
introduction, the word introduction, the "which letter makes this sound"
recognition step, the listening and sound-discrimination questions in review and
in the daily vocabulary session, and the write-what-you-hear dictation. The unit of arrival is a key that changes
when the item changes and for nothing else, so a re-render, an answer, a sheet,
a theme change or a return from the background cannot make the app speak.

There was a preference for this, and it could put a learner in front of a silent
listening question — a broken screen rather than a quieter one. The stored field
stays, unread, so that no profile has to be migrated.

Two rules keep the sound and the navigation honest about each other. Leaving a
screen stops its clip, because React runs the old cleanup before the new effect:
stop A, mount B, start B. And `PronunciationPlayer` carries a playback token, so
a clip whose `play()` promise resolves *after* the learner has moved on pauses
itself and reports `cancelled` rather than talking over the new screen. Tapping
Next four times quickly leaves exactly one clip audible.

## Offline is a feature, and it is tested

`public/sw.js` serves the app network-first and the content cache-first, and
precaches the shell — including the hashed bundle, read out of the HTML at
install time, because a first-ever visit is not yet controlled by the worker and
would otherwise cache an app with nothing to run in it.

The 21 MB audio set is deliberately **not** precached. Downloading all of it
before the learner has met a letter would be a hostile way to introduce a
product; clips cache as they are played, so the lessons a learner has actually
done are the lessons that work on a plane. `e2e/offline.spec.ts` cuts the
network and checks it.

## Sessions count distinct items, not attempts

Retrying a character until it passes must not push a session past its target.
The store counts distinct items passed, not attempts.

## Deliberately not built

* **React Native** — web first, as scoped. The architecture avoids making it
  harder; see `apps/mobile/README.md`.
* **Stroke-order recognition** — the interface exists; the implementation does
  not. Its absence is documented in `HANDWRITING_EVALUATION.md` as a known
  limitation rather than left for someone to discover.
* **Device-to-device sync** — nothing carries a learner's record to a new phone.
  Settings used to export and import a JSON backup; it was removed in this
  release because it asked a customer to understand, keep and restore a file,
  which is a chore delegated rather than a feature delivered. Doing it properly
  needs an account, and this product does not have one.
* **Leagues, points, subscriptions** — Hangyul has these; a beginner learning
  ㄱ does not need them, and a paid standalone app has nothing to sell them.
