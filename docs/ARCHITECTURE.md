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
* The **vocabulary** bar's denominator is the whole dataset, all 2,581 words,
  because all 2,581 are open. A bar measured against "what you may access" would
  read 100% for a learner who has studied nothing. It also counts *learned*
  only: opened is not studied, and seen is not learned.

## Recommendations, never permissions

Vocabulary has no locks. Every word is reachable from the first launch, in any
order, and the levels are advice: a level whose letters the learner has not met
says so — listing them, with a link to the lesson that teaches them — above a
list of word sets that opens either way. `usesKnownLetters()` in
`data/vocabulary.ts` answers "is this comfortable for you right now", which is
what the Words screen labels and the home screen's suggestion is chosen with,
and it is never consulted for access.

This is a paid, standalone app. Making a customer finish word 39 to look at word
40 is a retention mechanic borrowed from products that still had something to
sell them.

## Mastery is a ladder that only goes up

```
unseen → introduced → traced → written → learned
```

Each rung is earned by a different act, and each proves something the previous
one did not: tracing proves you can follow a line, writing proves you can
produce the shape, recognising it among its look-alikes proves you can *read*
it. A word's ladder is shorter — viewed, heard, every syllable written — because
a word is not a shape to pick out of near-identical shapes.

The ladder never goes backwards. A letter you once wrote from memory is a letter
you once wrote from memory, including on a day you get it wrong; that day sets
`needs_review`, which is a statement about now rather than a demotion. Demoting
progress for a bad attempt teaches learners to stop attempting.

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
| `FocusScreen` | the screen's `resetKey` | a different letter, word, step or review question |

Deliberately simple, and deliberately not browser-style restoration: a lesson is
a sequence of single screens, and arriving mid-screen costs more than not being
returned to where a list was left. A modal, a bottom sheet, an answer and a
re-render all leave the position alone, because none of them changes the key.

## Audio on entry is not a preference

A question whose prompt is a sound is not a question until the sound has been
heard. `useEntryAudio` plays an item's clip once when the learner arrives at it,
on every screen where hearing the Korean is how you answer: the letter
introduction, the word introduction, the "which letter makes this sound"
recognition step, the listening and sound-discrimination review questions, and
the write-what-you-hear dictation. The unit of arrival is a key that changes
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
