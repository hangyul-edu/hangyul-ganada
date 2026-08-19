# Hangyul ganada · 한귤 가나다

**A Hangul letter-learning and handwriting practice application for Korean
learners worldwide.**

> Learn Hangul, one stroke at a time.
> 한 획씩 시작하는 한글 공부

A **standalone, paid application**. Buy it, install it, open it, learn Hangul.
No account, no login, no subscription, no premium tier — and no network:
every lesson and recording is bundled with the app.

```
see a letter ─▶ hear it ─▶ understand it ─▶ trace it ─▶ write it
      ─▶ recognise it ─▶ combine letters ─▶ read a real Korean word
      ─▶ see what it means ─▶ hear it ─▶ write it
```

| | |
| --- | --- |
| Hangul letters | 40, in 12 units |
| Syllable blocks | 33, including 받침 |
| Vocabulary | 2,581 words across 18 semantic categories, all open from the start |
| Pronunciation | 5,275 utterances × 2 voices at 0.82×, 48.7 MB, bundled |
| Practice typefaces | 6, all SIL OFL 1.1 |
| Interface languages | 8 |

The learner traces a character in the typeface of their choice, and the drawing
is compared against the real glyph geometry. Writing something that is not the
character does not pass.

The interface speaks the learner's language. **The Korean does not change.**

---

## Naming

| | |
| --- | --- |
| English product name | `Hangyul ganada` |
| Korean product name | `한귤 가나다` |
| Repository / project slug | `hangyul_ganada` |
| npm scope, container names | `hangyul-ganada` |
| Default locale | `en` |

The brand is **not** translated. Every locale shows the Latin wordmark except
Korean, which has an official representation. All of this lives in
[`apps/web/src/config/product.ts`](apps/web/src/config/product.ts) — one file to
change if it ever moves again. `npm run name:check` fails the build if the old
name reappears.

---

## Quick start

Requires **Node ≥ 20**. Nothing else — there is no database and no service to
start.

```bash
git clone <repo> && cd hangyul_ganada
npm install
npm run dev                      # http://localhost:5173
```

That is the whole product. There is no service to start alongside it: the
curriculum, the fonts and every pronunciation are bundled, and the app makes no
network request while a learner is using it.

A FastAPI content service used to live in `apps/api`. It mirrored the curriculum
over HTTP, nothing in the product ever called it, and it cost a Python
environment, its own test suite and its own place to go stale on every cycle. It
was removed in this release; the curriculum export it consumed now lands in
`content/curriculum.json`, where the content pipeline reads it directly.

---

## What you can do

Open the app → no login → **Start now** → an explainer says what Hangul is →
meet ㅏ, hear it → **trace** it over the full shape → **copy** it over a ghost →
**write** it with nothing on screen, and ask to see it again whenever you want →
pick it out of ㅑ ㅓ ㅕ → progress moves → open the Words tab whenever you like,
because every one of the 2,581 words is there from the first launch → hear the
word, read its meaning, meet it in a Korean sentence, write each syllable →
get it wrong and
it appears in **Review**, which is a practice session rather than a list → tap
your streak to see the days you actually practised → close the app, reopen it,
everything is still there.

Change the pronunciation voice, the practice typeface, the interface language or
the daily goal in **My Learning**, which is also where you can start the whole
thing again.

The full picture — what every screen does, how the data is stored, what is
weak — is in **[`docs/report.pdf`](docs/report.pdf)**, regenerated each cycle
from [`docs/report.md`](docs/report.md).

---

## Repository layout

```
apps/
  web/                 Vite + React + TypeScript. The product.
    src/audio/           the pronunciation player
    src/domain/          mastery stages and every progress calculation
    src/storage/         persistence — driver, repositories, migrations
    src/data/generated/  the built curriculum
    src/i18n/            the localization layer
    src/locales/<code>/  translation bundles, one directory per BCP-47 tag
    public/audio/        10,550 pronunciation clips and their manifest
  mobile/              Capacitor shells for Android and iOS.
packages/
  design-tokens/       Hangyul design tokens; generates tokens.css.
  handwriting-core/    Platform-independent handwriting comparison.
  shared-types/        Domain types shared across the workspaces.
content/               Built content the pipeline reads and writes.
scripts/content/       The content pipeline — dictionary, images, audio, QA.
docs/
  DESIGN_AUDIT.md            The Hangyul visual language, extracted from the design PDF.
  HANDWRITING_EVALUATION.md  How grading works and how it was calibrated.
  VOCABULARY_DATA.md         Where the words come from, and what the levels are not.
  AUDIO.md                   How the pronunciation is generated, checked and played.
  ARCHITECTURE.md            Decisions and the seams left for later.
```

### Why the packages are separate

`handwriting-core` has no DOM and no React dependency: it takes normalised
strokes and a glyph mask and returns a verdict. That keeps it testable in Node,
runnable in a worker, and reusable from React Native later without dragging the
web app along. `design-tokens` is the single source for every colour, radius and
shadow — no component contains a literal hex value.

---

## Localization

### Default locale

**English**, always. The precedence chain is:

```
1. stored profile preference     (IndexedDB, written by Settings)
2. persisted device mirror       (localStorage, read before first paint)
3. English
```

The browser's locale is deliberately **not** in that list. It is used to *offer*
a language during onboarding and nothing more — a learner opening the app from
Seoul gets English until they say otherwise, because the audience is people
learning Korean rather than people who already read it.

An explicit choice takes precedence and persists immediately.

### Locale registry

[`apps/web/src/i18n/locales.ts`](apps/web/src/i18n/locales.ts) is the only place
that knows what a locale is:

```ts
{ code: 'he', nativeName: 'עברית', englishName: 'Hebrew', direction: 'rtl' }
```

It accepts **any valid BCP-47 tag**. A curated table supplies hand-checked
endonyms for common languages; anything else is described from
`Intl.DisplayNames`, so a language nobody has translated into still renders
correctly in a picker. No component holds a list of languages.

### Translation files

```
apps/web/src/locales/
  en/  common.json navigation.json home.json learning.json
       handwriting.json vocabulary.json settings.json errors.json
  ko/  …
  ja/ zh-CN/ es/ fr/ de/ pt-BR/
```

Bundles are discovered from the filesystem with `import.meta.glob`. Keys are
semantic (`handwriting.feedback.correct.headline`), never a sentence and never
`text1`.

### Adding a new language

1. `mkdir apps/web/src/locales/<bcp47-tag>`
2. Copy the eight JSON files from `en/` and translate the values.
3. `npm run i18n:check` — it will tell you what is missing, including any plural
   category your language needs that English does not have.

That is the whole procedure. **No React component, type, route or migration
changes.** The language appears in the picker, with its own name, on the next
build.

Optionally, to translate the *curriculum* as well (word meanings, letter
mnemonics, lesson titles), add your tag to the `translations` maps in
`apps/web/src/data/*.ts` and run `npm run curriculum:build`. This is separate
work and can be done later — untranslated entries fall back to English.

### Fallback rules

```
requested locale  →  base locale  →  English
     pt-BR        →      pt       →     en
```

English is the source language and terminates every chain, so a missing
translation always resolves to readable text. **A raw key is never shown**; an
E2E test walks every screen in every shipped language asserting exactly that.

When no exact or base match exists, a sibling regional variant wins over English
(`pt-PT` → `pt-BR`), because Brazilian Portuguese serves a Portuguese reader far
better than English does.

The chain covers interface strings and curriculum text. It does **not** cover
the home-screen quotations: those are required to exist in the selected
language. `renderQuote()` throws rather than show a learner an English sentence
on a Korean-learning home screen, and a unit test asserts every quote in every
locale so that throw can never reach a learner. All eight are complete, which is
why the rule can be that strict.

Content resolution reports where the text came from, so an English fallback is
tagged `lang="en" dir="ltr"` inside a right-to-left page rather than left for
the bidi algorithm to mangle.

### RTL support

`<html lang>` and `<html dir>` follow the active locale. Layout uses logical
properties (`margin-inline-*`, `inset-inline-*`, `text-align: start`), so a
right-to-left interface mirrors correctly, including the chevrons — which mean
"onward", not "east".

**No right-to-left language currently ships.** Arabic was withdrawn as a
supported interface language; the direction handling stays because it is correct
and because a future Hebrew or Persian bundle would otherwise have to rebuild it
from nothing. `LocaleProvider.test.tsx` exercises it against a language with no
bundle, which is exactly that starting state.

**The Korean writing surface never mirrors.** `WritingCanvas`, the syllable row,
the prompt glyph and the example sentence all pin `direction: ltr`. Hangul is
written left to right whatever the interface speaks, and mirroring 사과 into
과사 would teach the word backwards.

### Text expansion

No component is sized against an English string. Headings use `clamp()` and
`text-wrap: balance`, rows use `min-height` rather than `height`, and text boxes
wrap rather than clip. `npm run qa:i18n` renders every screen in English,
Korean, German (longest strings) and Japanese (no spaces to wrap at) at
375/390/430 px and reports
horizontal overflow, clipping and off-screen content.

### Locale handling in the content pipeline

The pipeline resolves a locale exactly the way the app does — same chain, same
fallbacks — so a translation that reads correctly in the built bundle cannot be
one the app resolves differently. Korean source content is byte-identical in
every locale, and a test asserts it.

---

### Translation validation

| Command | Does |
| --- | --- |
| `npm run i18n:report` | Coverage per locale, plus missing / untranslated / unused keys |
| `npm run i18n:check` | The same, failing the build on a blocking problem |
| `npm run qa:i18n` | Renders every screen in 4 languages × 3 widths and reports layout breakage |
| `npm run name:check` | Fails if an unintended `Hangyul Start` reference reappears |

"Blocking" is narrow on purpose: a gap in **English** fails the build, because
English ends every fallback chain and a gap there reaches a learner. A gap in
Japanese does not — it falls back, which is a planned state. So does an
incomplete plural set, a dropped `{{placeholder}}`, and a key that exists in a
translation but not in English.

### Translation coverage

Internationalization support and translation coverage are different things. The
architecture supports essentially any world language; these are the languages
that currently ship a maintained translation:

| Locale | | Interface | Curriculum content |
| --- | --- | --- | --- |
| `en` | English | complete (source) | complete |
| `ko` | 한국어 | complete | complete |
| `ja` | 日本語 | complete | falls back to English |
| `zh-CN` | 简体中文 | complete | falls back to English |
| `es` | Español | complete | falls back to English |
| `fr` | Français | complete | falls back to English |
| `de` | Deutsch | complete | falls back to English |
| `pt-BR` | Português (Brasil) | complete | falls back to English |

"Curriculum content" is the per-word meanings and per-letter mnemonics — a much
larger body of text than the interface, and one that should be translated by
someone who can maintain it. The gap is reported, not hidden.

---

## Commands

Run from the repository root unless noted.

| Command | Does |
| --- | --- |
| `npm run dev` | Web dev server |
| `npm run build` | Typecheck and build the web app |
| `npm test` | Unit tests across all workspaces |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` across workspaces |
| `npm run test:e2e` | Playwright, mobile and desktop viewports |
| `npm run tokens:build` | Regenerate `tokens.css` from the token source |
| `npm run curriculum:build` | Export the curriculum to `content/curriculum.json` for the content pipeline |
| `npm run i18n:report` | Translation coverage report |
| `npm run qa:i18n` | Localization visual QA (needs the preview server running) |
| `npm run fonts:audit` | Practice-typeface licences and Korean glyph coverage |
| `npm run docs:shots` | Retake the screenshots the report embeds (needs the preview server) |
| `npm run docs:report` | Build `docs/report.pdf` from `docs/report.md` |
| `npm run examples:qa` | Example-sentence teaching quality — a release blocker |
| `npm run review:benchmark` | The adaptive review scheduler against the fixed-interval one it replaced |
| `npm run result:build` | Assemble `./result`: artefacts, checksums, build info |
| `npm run verify:quick` | Name, i18n, copy, tokens, lint, types, unit tests, build, bundle budget — the tier for an ordinary UI or copy change |
| `npm run verify:release` | `verify:quick`, then every content, asset and store-listing check — the tier for a release candidate |
| `npm run verify` | Alias for `verify:release` |

Two tiers, because one was making every change expensive: `verify` regenerated
and re-audited the vocabulary, the fonts and the example sentences on its way to
telling you whether a settings label was spelled right. Neither tier rebuilds
content — `audio:build`, `content:fetch` and `review:benchmark` are run when the
thing they build actually changes.

Content pipeline — see [`docs/VOCABULARY_DATA.md`](docs/VOCABULARY_DATA.md) and
[`docs/AUDIO.md`](docs/AUDIO.md):

| Command | Does |
| --- | --- |
| `npm run content:fetch` | Download the corpus and the dictionary pages |
| `npm run content:vocabulary` | Build the dataset from the cache and the curation layer |
| `npm run audio:plan` | List every utterance the app can play |
| `npm run audio:build` | Generate it, both voices, normalised |
| `npm run audio:qa` | Check all 10,550 voice slots over 10,454 files |
| `npm run audio:pronunciation` | Check every clip is filed under the right item and its note is right |
| `npm run audio:listen` | Listen to the clips with a recogniser and report disagreements |

Handwriting evaluator calibration, from `packages/handwriting-core`:

```bash
npm run calibrate:glyphs    # response curve against real Korean glyphs
npm run calibrate           # response curve against synthetic strokes
npm run fixtures            # regenerate the glyph fixtures (needs Pillow)
```

---

## Environment

Copy `.env.example` to `.env`. Secrets never belong in source control.

Nothing here is needed to run the app.

| Variable | Default | Notes |
| --- | --- | --- |
| `HANGYUL_TTS_PROVIDER` | `edge` | `azure` or `google` for a licensed release |
| `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | unset | Only for `azure` |
| `GOOGLE_TTS_API_KEY` | unset | Only for `google` |
| `HANGYUL_MAX_MISMATCH_RATIO` | `0.10` | The pass rule, shared by the evaluator and its calibration |

### There is no database

There is nothing to provision, migrate or back up. A learner's progress lives on
their own device — IndexedDB in a browser, SQLite inside the app's container on
a phone — and the curriculum ships as a file. That is not a simplification of a
bigger design; it is the design.

---

## How grading works

Full detail, including the calibration data, is in
[`docs/HANDWRITING_EVALUATION.md`](docs/HANDWRITING_EVALUATION.md).

```
mismatchRatio = outsideStrokeRatio + missingCoverageRatio    (clamped 0..1)
PASS when mismatchRatio <= 0.10
```

* **outsideStrokeRatio** — of the ink the learner laid down, how much does not
  belong to the glyph. Catches scribbles, wrong shapes, oversized writing.
* **missingCoverageRatio** — of the glyph, how much they never wrote. Catches
  half-finished characters and undersized writing.

Errors are graded by distance rather than tested in-band/out-of-band, so `score`
carries real information. A contiguous unwritten piece counts for more than its
bare area, because omitting a stroke changes which character was written.

Nothing re-centres or re-scales the learner's ink — **where you write inside the
box is part of the task.**

The threshold, the tolerance band and the weights are all configurable in
`packages/handwriting-core/src/config.ts`, and every one of them was tuned
against real Korean outlines — one fixture set per bundled typeface — rather
than by intuition.

---

## Fonts and data

Six practice typefaces, chosen as the Korean writing *styles* a learner would
be shown by a teacher rather than as a list of font names:

| In the app | Korean | Typeface | Why it is here |
| --- | --- | --- | --- |
| Standard | 기본체 | Pretendard | The app's own interface face; the plainest place to start |
| Sans Serif | 고딕체 | Nanum Gothic | The gothic on most Korean websites |
| Myeongjo | 명조체 | Nanum Myeongjo | The serif of books and newspapers |
| Traditional | 바탕체 | Gowun Batang | The brush-written tradition 궁서체 belongs to |
| Handwriting | 손글씨체 | Gaegu | A pencil hand, close to a learner's own writing |
| Rounded | 둥근체 | Gowun Dodum | Soft, cornerless, the gentlest to trace |

Every one is **SIL OFL 1.1** and self-hosted via `@fontsource` or npm; nothing
is fetched from a third party at runtime and nothing proprietary is bundled.
Licence, source and family are carried in the data, shown in the picker, and
checked by `npm run fonts:audit`, which also verifies that each file's character
map covers every Korean character the app will ever render in a practice face.
That last check needs `pip install 'fonttools[woff]'`; without it the audit warns
and skips it, and `npm run fonts:audit:strict` refuses to — use that one in a
release build.

**Genuine 궁서체 is not here, and the substitute says so.** The palace script
that ships as Gungsuh on Windows is proprietary and may not be extracted from an
operating system and packaged into a product. Gowun Batang stands in its place
and is labelled 바탕체 / "Traditional" rather than 궁서체, because a learner who
came here to find out what Korean looks like should not be told a small lie
about it.

Two well-known faces were rejected on measurements rather than on taste: **Jua**
draws at roughly twice the width of the learner's pen, so an honest attempt
scored worse than a wrong character at every tolerance tried, and **Nanum Pen
Script** leaves 사 and 가 about 0.014 apart, inside the noise of real
handwriting. `font-tolerance.test.ts` re-runs both measurements on every build.

The bundled vocabulary is **2,581 words**, hand-reviewed, using English
Wiktionary (CC BY-SA 4.0) for part of speech and the OpenSubtitles Korean
frequency lists for how often each word is actually said. Every meaning,
example sentence and translation was written for this app, and every sentence
passes a teaching-quality gate (`npm run examples:qa`) before it can ship.
There are no illustrations: vocabulary imagery was removed from the product,
because a picture gives a word's meaning away before any Korean has been read.

Every field on every word names the source that supplied it, and Hangyul
GaNaDa's own calculations are marked as ours. The app lists the sources whose
licence requires it under **My Learning → Legal & Licences**.

Three numbers are kept deliberately apart. `frequency` is what two Korean
corpora actually saw. `difficulty_level` is our own 1–8 rating of how hard a
word is to *learn*, used to order each category and never shown to a learner.
`letters_ready_after` is whether the alphabet curriculum has introduced every
letter in it yet, which gates nothing. **None of them is a TOPIK grade** —
TOPIK is not represented in this product at all. See
[`docs/VOCABULARY_DATA.md`](docs/VOCABULARY_DATA.md).

---

## Accessibility

Every canvas action — undo, clear, reveal, check — is a real button, so the
writing box is an enhancement rather than the only way in. The app ships a skip
link, keyboard-only focus rings, 44px minimum hit targets, `role="status"`
feedback that announces a verdict without stealing focus, and honours
`prefers-reduced-motion`.

Text that is not in the interface language — an English fallback inside an
right-to-left page, a Korean word inside an English sentence — is tagged with
its own
`lang` and `dir`, so a screen reader uses the right voice and the bidi algorithm
does not reorder punctuation.

---

## Testing

| Suite | Covers |
| --- | --- |
| `packages/handwriting-core` | 69 tests: mask geometry, the evaluator, real-glyph calibration, six-typeface tolerance |
| `apps/web` unit | 363 tests: curriculum content, mastery ladder, every progress calculation, the daily activity roll-ups and streaks, storage migrations, the pronunciation player and its entry-audio rule, scroll reset, Korean particle agreement, generated-question answer keys, locale resolution, quote attribution |
| `apps/web` e2e | the fresh-install journey, the four-step writing progression and the hint, word learning, review, the learning record, the simplified settings screen, horizontal scrolling by wheel and drag, persistence across a restart, offline, no-monetisation, 8 languages — each run at a phone and a desktop viewport |
| `npm run audio:qa` | All 10,550 voice slots over 10,454 files: decode, duration, loudness, voice distinctness, manifest and rate agreement |
| `npm run audio:pronunciation` | The chain from the word on screen to the file on disk: ids, plan, manifest, notes against the sound-change rules, example ownership, and the service worker's audio-cache stamp |
| `npm run audio:listen` | A speech recogniser over the clips. A screen for a person to read, not a gate — see [`docs/AUDIO.md`](docs/AUDIO.md) |
| `npm run fonts:audit:strict` | Six typefaces: licence allowlist, files on disk, all 846 practice glyphs present |

The E2E suite traces the reference glyph by reading the guide canvas's own
pixels. That is deliberate: a test that traces where the guide actually is will
fail if the guide and the evaluation mask ever drift apart — which is a bug this
codebase has already had once.

---

## The renames

This product was called **Hangyul Start** (한귤 스타트), then **Hangyul GaNaDa**,
and is now **Hangyul ganada**. The last change is cosmetic — 가나다 is a word,
not three initials — and it was not allowed to touch anything a device stores.

Identifiers that deliberately did **not** move, because changing them would
break data that already exists:

* **`hangyul-start:learner` / `hangyul-start:locale`** — the old localStorage
  keys. They are read once on first load and retired on the first save, so a
  learner who had already practised under the old name keeps their progress and
  their chosen language.
* **`HangyulGaNaDa`, the iOS WebView scheme** — the origin the app's storage is
  keyed to. Renaming it would move the origin and discard every existing
  learner's progress in exchange for a string nobody ever sees. The package ids
  (`com.talkhangyul.ganada`) are unchanged for the same reason, and so is the
  subject line inside the signing certificate.

The Alembic revision id that used to be the second exception retired with the
database itself when the server-side learner was removed.

`npm run name:check` enforces this: the surviving exceptions are listed with
their reasons, and any new reference to the old name fails the build.

---

## Status

The web app is complete and shippable in eight languages: a full Hangul
curriculum, 2,581 words, bundled pronunciation in two voices, offline support
and local-first storage with migrations. The Android application is built,
signed, installed and exercised on a device each cycle; the iOS project is
complete and has never been run, because this environment has no macOS.

Not built yet:

* **Stroke-order recognition.** The `HandwritingEvaluator` interface exists
  precisely so it can be added without touching the learning flow.
* **Device-to-device sync.** Nothing carries a learner's record to a new phone.
  A JSON export used to, and it was removed: asking someone who bought a Korean
  course to keep a file safe and restore it by hand is not a feature, it is a
  chore delegated to the customer. Doing it properly needs an account, and this
  product does not have one.

One release step is deliberately left for the business: regenerate the audio
with `HANGYUL_TTS_PROVIDER=azure` and a paid Azure Speech subscription, which is
the licence that covers redistributing synthesised speech inside a product. Same
voices, same output, one command — see [`docs/AUDIO.md`](docs/AUDIO.md).
