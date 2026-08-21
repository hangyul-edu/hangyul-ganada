---
title: Hangyul ganada
title_ko: 한귤 가나다
subtitle: A zero-beginner Korean foundation app — Hangul reading and writing, then practical vocabulary — running entirely on the learner's own device.
document: Product Truth Report
version: 0.1.0
date: 21 August 2026
describes: A full re-audit after the final product-quality cycle — thirty-two interface languages, Revised Romanization in place of IPA, the stroke cut read item by item, and three screens that said the same thing twice
mark: report-assets/mark.png
---

# 1. About this report

This is an **internal product truth document** — not marketing, not a changelog.
It is regenerated after each development cycle and handed to a reviewer, usually
another model, as the authoritative description of what Hangyul ganada
*currently is*.

It was written by re-auditing the running product and the current source, not by
editing the previous report. Where the code and older documents disagreed, the
code won and the disagreement is recorded.

## How to read the claims

Every substantive claim carries one of these labels. They are not decoration:
they are how a reader knows which sentences to trust without re-checking.

| Label | Means |
| --- | --- |
| **VERIFIED** | Confirmed by running the product, reading the code, or a script whose output is quoted here |
| **INFERRED** | Follows from the architecture but was not directly observed this cycle |
| **RECOMMENDED** | A product suggestion, not a statement of fact |
| **EXTERNAL** | From outside the repository; see §30 for the limits on this |

Feature status uses a second scale:

| Status | Means |
| --- | --- |
| **VERIFIED WORKING** | Does what it should, checked this cycle |
| **PARTIALLY WORKING** | Works for the common path; a real case is unhandled |
| **UX-PROBLEMATIC** | The code is correct and the customer experience is not |
| **BROKEN** | Does not work |
| **NOT IMPLEMENTED** | Does not exist |
| **NEEDS VERIFICATION** | Could not be settled from this machine |

## What this report will not do

It will not call something finished because a UI exists, a test passes, or a
previous document said so. §33 lists what is wrong, including work that was
reported fixed and is only partly fixed.

---

# 2. Audit metadata

| | |
| --- | --- |
| Report generated | 21 August 2026, after the build it describes |
| Product | Hangyul ganada (한귤 가나다) |
| Application version | 0.1.0 |
| Git branch | `quality-pass-strokes-and-splash` |
| Git commit | `557edfb2e36abb8259934d1f11bec6655c250cb9` |
| Working tree | **Clean.** The artefacts were built from that commit and from nothing else. See §2.2 |
| Signed APK | 63.5 MB · `ba5dbe787cba935c…` |
| Signed AAB | 62.2 MB · `7c4930804e305a6e…` |
| Signing certificate | `157a2bb133f6aa3d…` — `CN=Hangyul GaNaDa, O=Talk Hangyul` — the same identity as the previous release |
| Production URL | `https://ganada.talkhangyul.com` |
| Target platforms | Web (primary), Android (Capacitor), iOS (project only — no IPA) |
| Interface languages | 32 |
| Words shipping | 2,581 |
| Categories | 18 |
| Study sets | 524 (five words each) |
| Characters taught | 73 |
| Pronunciation notes | 503 |
| Audio clips | 10,454 |
| Architecture | Static React SPA, no backend, IndexedDB persistence, build-time content |

## 2.1 Package versions

| Package | Version |
| --- | --- |
| react / react-dom | ^19.0.0 |
| react-router-dom | ^7.1.5 |
| vite | ^7.3.6 |
| typescript | ^5.7.3 |
| i18next | ^25.10.10 |
| vitest | ^3.0.5 |
| @playwright/test | ^1.50.1 |
| @capacitor/core | ^8.5.0 |

## 2.2 Commit and artefact state — **VERIFIED**

This section carried a P0 in three reports, and last cycle it half-slipped again:
the work was built from an uncommitted working tree and the report said so. This
time the order was followed.

```
557edfb  draw the strokes instead of cutting them out of the glyph
         ↓  working tree clean — `git status` empty, verified before the build
         ↓  then npm run build + cap sync android
         ↓  then gradlew assembleRelease bundleRelease, signed with the
         ↓     production key from ANDROID_KEYSTORE_PATH
         ↓  then unpack the delivered APK and check what is inside it
result/hangyul-ganada-release.apk    from 557edfb, nothing else
app_result/                          the same two binaries, on their own
```

### What the working tree turned out to be

`git status` reported 501 modified files. Forty-four of them carried this
cycle's work. The other 435 differed from `HEAD` by **nothing but their line
endings** — a CRLF conversion from editing on WSL — and between them accounted
for about 98,000 lines of a 100,000-line diff.

That is not a tidiness problem. A commit nobody can read is a commit nobody
reviews, and "the working tree was modified" has been this project's most
repeated finding precisely because the tree was always too noisy to look at. The
435 were restored to what `HEAD` already held, and `.gitattributes` now pins
`text=auto eol=lf` so it cannot happen again.

It also settled a question the last report left open. That report described a
"quick patch in the working tree, uncommitted" — the Language row's flag and the
removal of the vocabulary listening questions. Those files are content-identical
to `HEAD`: the patch *was* committed, in `10148ea`, and the report's own claim
about it was the stale thing.

### What is inside the delivered package — **VERIFIED**

Unpacked and checked in both directions, because "it built" is not evidence that
what was built is what was written.

| Looking for | Found |
| --- | --- |
| The new geometry | one `stroke-geometry-*.js` chunk, 11.6 kB — carries the Bézier κ constant and the measured per-letter aspect table |
| Its CSS | `stroke-linecap:butt`, `stroke-linejoin:miter`, `fill:none` |
| The desktop phone shell | the `min-width:560px` block |
| Splash media | `splash-ko.mp4`, `splash-en.mp4` and both WebP posters under `assets/public/brand/splash/` |
| Native launch bitmap | `res/-u.png` and ten more: ground `#FFF6E9`, the circle at centre — frame zero of the animation |
| Android 12+ splash colour | `color/splashBackground` = `#fffff6e9`, matching the bitmap |
| **The old raster cut** | **absent** — `strokeAssets`, `strokeReveal`, `segmentation` and any `strokeAssets*.json` all return nothing |

The one `fillRule` left in the package belongs to React's own attribute table,
not to the app.

### Signing — **VERIFIED, and it is the same key**

```
previous release  SHA-256 157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc
this release      SHA-256 157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc
                  CN=Hangyul GaNaDa, OU=Mobile, O=Talk Hangyul, L=Seoul, C=KR
```

No new keystore, no debug fallback, v2 + v3 schemes, `applicationId` unchanged
at `com.talkhangyul.ganada`. The key was read from `ANDROID_KEYSTORE_PATH`; no
secret is in this repository or in this document.

## 2.3 Figures for the next report to diff against

| Metric | Now | Last report |
| --- | --- | --- |
| Interface languages | **32** | 10 |
| Vocabulary headwords | 2,581 (target 10,000 — **7,419 short**) | 2,581 |
| Vocabulary meanings in every shipping language | 10 of 32 locales at 2,581 — the other 22 fall back to English, and the picker says so | 10 of 10 |
| Lesson titles translated | **32 of 32** | 10 of 10 |
| Letter copy translated | **32 of 32** | 10 of 10 |
| Learning quotations translated | **32 of 32** | 10 of 10 |
| Practice typefaces named and described | **32 of 32** | 2 of 10 — undetected |
| Customer-facing phonetic notation | **Revised Romanization, from the standard pronunciation** | IPA |
| Verified synonym pairs | 71 | 71 |
| Verified antonym pairs | 65 | 65 |
| Words with any verified relation | 243 of 2,581 (9.4%) | 243 |
| Longer explanations (`definition`) | 25, written, in 10 languages | 25 |
| Words whose taught sense is pinned by exact string | 11 | 11 |
| Web unit (`vitest`) | **664** (39 files) | 651 |
| Handwriting core (`vitest`) | 95 | 95 |
| End-to-end (`playwright`) | 230 (115 × 2 projects) — the mobile project re-run in full this cycle, 115 passed | 230 |
| Rendered stroke frames measured in pixels | 1,345 | 1,345 |
| Handwriting false-accept / false-reject | 0.21% / 0.78% | 0.21% / 0.78% |
| First load | **384.3 kB gz of a 460 kB budget** | 460 kB budget, 96% used |
| Word-corpus bundle | 171.3 kB gz of a 220 kB budget | 169.1 kB |
| Everything precached | **491.3 kB gz of a 900 kB budget** | 854 kB |

The three relation rows did not move this cycle, which is the expected reading:
no relation work was done and none of the sense pins changed. They are kept in
the table because last cycle they moved by one *without* a relation being
touched — a corrected part of speech propagating through `teaches_first_sense` —
and a row that can drift silently is worth watching even in the cycles it does
not.

The two bundle rows moved the *opposite* way to the language count, which is the
finding worth carrying forward. Going from ten interface languages to
thirty-two, and from ten to thirty-two languages of letter copy, made the first
load **smaller** — because the same change forced all three bodies of
per-language content off the critical path: the interface bundles, the word
packs and now the letter explanations are fetched for the one language the
learner reads. Precached bytes fell by 42%.

---

# 3. Executive summary

**The product now speaks thirty-two languages, romanises Korean the way Korea
does, and got smaller doing it.** The three defects a learner could see most
clearly — a phonetic alphabet nobody outside linguistics reads, an alphabet
course in English under a translated interface, and a home screen that said the
same thing three times — are fixed at the level they were wrong at.

**The notation was replaced, not renamed.** Every word carried IPA, bracketed,
including in front of beginners: [t͡ɕa̠ɾi] over 자리. It now carries **Revised
Romanization derived from the standard pronunciation** — *jari*, and 국민 →
*gungmin*, not *gukmin*. The distinction between deriving it from the spelling
and deriving it from the sound is the whole of the work: the same sound-change
machinery that produces the audio now produces the notation, so the two cannot
disagree. Five QA layers check it, one of which re-derives all 2,581 through the
Python and compares byte-for-byte with what ships, and a rendering test matches
the *displayed* string against an IPA character class so the old values cannot
return under a new label.

**Twenty-two languages were added, and four separate bodies of content turned
out to be English underneath a translated interface.** Not one of them was
visible to `i18n:check`, which reports 100% and is right about the files it
reads. Lesson titles were the finding last cycle; this cycle it was the six
practice typefaces, the twelve quotations, the tab bar, and — in twenty-eight of
the thirty-two languages — a unit heading and the lesson card beneath it using
two different phrasings of the same English sentence, three centimetres apart.

**Two of those were only findable by looking at a rendered screen.** The
quotation renderer throws rather than falling back and is mounted inside Home, so
a language with no quotations rendered **a white page**: that was the Arabic home
screen. And the bottom navigation, which has no state, no context and no changing
props, never re-renders — so when a stored language's strings arrived after the
first paint it kept the English it resolved on frame one, reading *Home /
Letters / Words* under a fully Arabic screen. Both now have tests; both were
invisible to a green suite for as long as they existed.

**Thirty-two languages made the app faster, which is the architectural finding.**
Going from ten to thirty-two took the first load from 460 kB of budget almost
exhausted to **384.3 kB, 84% of it**, and precached bytes down 42% to 491.3 kB.
The same change forced the third and last body of per-language content off the
critical path: interface bundles, word packs and now letter explanations are all
fetched for the one language the learner reads. Splitting the letter copy out of
its module bought nothing at all until a `manualChunks` line stopped sweeping the
thirty emitted files into the chunk that loads before the home screen paints —
recorded because that is the failure mode of every lazy-loading change.

**Less on the screen, in three specific places.** The home screen offered the
day's words twice and Review twice, on the first screen anybody sees; each now
appears once. The writing feedback was a headline, a sentence, a heading, up to
three bullets and a closing paragraph about what stroke order is for — six
paragraphs under a two-stroke letter, every attempt — and is now a status, one
sentence of advice, one note, and the next action. And the finished-alphabet card
no longer prints "0 %" beside the words *You can read Hangul*.

**The strokes were not holding, and the last report said they were.** It called
the renderer *release quality* and claimed all 73 items had been read by eye. The
customer answered with four screenshots — ㅂ, ㅅ, ㅇ, ㅈ — and all four defects
were real: wedges of not-yet-written crossbars showing inside finished uprights,
a first stroke growing into a second one's shoulder, and a ㅇ that was a lumpy
polygon. They were reproduced here from the shipped assets before anything was
touched.

**So the architecture was replaced rather than patched a fifth time.** The
demonstration used to be cut out of a rasterised glyph: award each pixel of ink
to a stroke, trace the regions, animate the polygons. That produces a boundary
wherever two strokes genuinely share ink, and the boundary is visible the moment
one side is black and the other grey — there is nothing to divide, because the
ink at a junction is written twice. It also produces polygons, which is why ㅇ was
one. The reference glyph is now the typeface, and the instruction is authored
vector centrelines drawn as *stroked* paths. Two strokes that meet simply
overlap. §11 is the whole account, including how the QA passed 73 items and 269
strokes through every round in which the product was visibly wrong.

Six more defects were found on the way and none of them by a test — 글's 받침
arriving as a smudge, ㅎ's bowl merged into its bar, a mitred beak on ㄹ, ㅋ's bar
hanging in open paper, ㅐ and ㅒ's connectors touching a stem they should stop
short of, and a centre cross that had never once been drawn because its CSS rule
did not exist. All were found by rendering the letters and looking at them.

**The product also gained a brand launch screen and stopped stretching on a
desktop.** The native splash is frame zero of the brand animation — ground and
one circle, no words — and the WebView picks the animation up and plays it out,
in Korean when the interface is Korean and in English otherwise; one picture
across the handover instead of two brand screens back to back. On a wide screen
the app now sits in a phone-sized shell rather than spreading a thumb-designed
layout across a monitor. §11.8 covers both.

**And 낳다 is finally settled.** Three cycles of "the recogniser hears 낫다" ended
by measuring the recordings instead of transcribing them: 낳다 is [나타], a short
closure and a weak breathy release, and 낫다 and 낮다 are [낟따], a long closure
and a sharp one. The clips are right; the recogniser was not. A check asserts it
now, and fails if the pair is asserted the other way round.

Three things still stand between this and a paid release.

**1 · The corpus is a quarter of its stated size, and its delivery does not
scale.** 2,581 words against a 10,000 target, and the bundle forecast says the
current mechanism could not carry 10,000 anyway — 663.7 kB gz against a 220 kB
budget, **302%**. Unchanged this cycle; §13.4 costs the three remedies.

**2 · Word meanings exist in ten of the thirty-two languages.** 2,581 × 22 is
about 57,000 lines, and writing them without a speaker of each language would
produce the machine-translation register `LOCALIZATION_NATIVE_REVIEW.md` exists
to refuse, at a scale nobody could audit. So the English fallback stands and is
**said out loud before the learner chooses the language**, on the row itself. The
first version of that caption was wrong in the opposite direction — it told
Vietnamese and Thai learners their meanings were English while shipping 2,581 of
each — and is now tied to the emitted packs by a test.

**3 · No language has been read by a native speaker.** Not one of the thirty-two,
including the two the product is about. That is stated in the first paragraph of
`LOCALIZATION_NATIVE_REVIEW.md` and no table in it softens the claim.

Against that: nothing that was reported broken is still broken — with the one
exception that this cycle introduced I-21 itself, and said so.

**Current sellability: *Barely ready* standalone; *Good* as a funnel product.**
Reasoning in §32.

---

# 4. Product definition

## 4.1 What it is — **VERIFIED**

A single-purpose application that takes someone who cannot read Hangul to the
point where they can read it, write it by hand, and know a few hundred words. It
is deliberately small: two learning tracks (letters, words), one review system,
one settings screen.

It runs as a web app at `ganada.talkhangyul.com` and as an Android app wrapping
the same build. No account, no server, no network requirement after first load.

## 4.2 The intended journey

```
interest in Korean
   → speaking/TOPIK feels too difficult
      → Hangyul ganada          ← this product
         → Hangul foundations
         → practical basic vocabulary
         → confidence
      → back to main Hangyul for speaking and TOPIK
```

## 4.3 Does the product support that positioning?

**Partly — and one link is missing entirely.**

| Stage | Supported? | Evidence |
| --- | --- | --- |
| Hangul foundations | **Yes** | 73 characters across 12 ordered lessons, demonstration, guided writing, recognition |
| Practical basic vocabulary | **Partly** | 2,581 words, 5–20 a day, quiz-first. Months of study; a quarter of the ambition |
| Confidence | **Yes, mechanically** | Daily goals, streak, activity calendar, a review system that does not pile up |
| Return to main Hangyul | **BUILT, NOT CONFIGURED** | The hand-off exists — a card at the end of the alphabet and a permanent row in My Learning — and renders nothing until a destination is set |

That last row changed this cycle, and it changed to *almost*.

The hand-off is built. When the learner finishes all forty letters, the letters
screen shows a quiet card under the alphabet: *"You can read Hangul now.
Speaking and TOPIK practice continue in Hangyul."* A permanent row sits in My
Learning under the learner's own activity, shaped like every other row and given
none of the emphasis. Neither interrupts a lesson; neither repeats; neither has
a dismiss button, because there is nothing to dismiss.

**It renders nothing at all, because nobody has supplied the URL.** The
destination is not in this repository and cannot be guessed, so `HANGYUL_URL` is
read from `VITE_HANGYUL_URL` at build time and every piece of the hand-off is
absent when it is unset — which is the state of a plain checkout. Shipping a
card that leads nowhere would be worse than the dead end it was built to fix.

Setting one environment variable turns it on. Until somebody does, **the product
is still described as a funnel and still contains no funnel**, and this stays on
the P1 list.

---

# 5. Current product decisions, audited

Each decision is stated as intended, then checked against the implementation.
This is the fastest way to see what must not be accidentally reversed.

| # | Decision | Current implementation | Status |
| --- | --- | --- | --- |
| 1 | No mandatory login | No auth code anywhere; no server | **VERIFIED WORKING** |
| 2 | Device-local persistence | IndexedDB via a driver seam; SQLite on native | **VERIFIED WORKING** |
| 3 | Hangul foundation learning | 12 lessons, 73 items | **VERIFIED WORKING** |
| 4 | Handwriting only where it teaches | Letters and syllables only | **VERIFIED WORKING** |
| 5 | Vocabulary never handwritten | No canvas reachable from any word screen; e2e asserts it | **VERIFIED WORKING** |
| 6 | Vocabulary is quiz-first | Meet → choose → recognise; six step types | **VERIFIED WORKING** |
| 7 | Vocabulary daily goals | 5 / 10 / 15 / 20, persisted | **VERIFIED WORKING** |
| 8 | 10,000-word corpus as depth | 2,581 shipping | **PARTIALLY WORKING** |
| 9 | Never expose the corpus as one list | The day's plan is the entry point | **VERIFIED WORKING** |
| 10 | Categories/search secondary | Both below the day card on `/words` | **VERIFIED WORKING** |
| 11 | No vocabulary images | e2e asserts zero `<img>` on word screens | **VERIFIED WORKING** |
| 12 | Rich Word Detail | Headword, romanization, audio, POS, gloss, example, Save, relations | **PARTIALLY WORKING** (§15) |
| 13 | Pronunciation notation | Revised Romanization on every word, from the standard pronunciation | **VERIFIED WORKING** |
| 14 | Pronunciation audio | 10,454 clips, two voices | **VERIFIED WORKING** |
| 15 | Example sentences | 2,581 of 2,581 | **VERIFIED WORKING** |
| 16 | Saved Words | Toggle on card and detail; own screen | **VERIFIED WORKING** |
| 17 | Wrong Answer Notebook | One row per item; retires after 2 correct | **VERIFIED WORKING** |
| 18 | Memory-based Review | Per-item, per-skill recall model | **VERIFIED WORKING** |
| 19 | Sentences are context, not SRS items | No sentence is a memory key | **VERIFIED WORKING** (§21.6) |
| 20 | Multiple quiz formats | 6 vocabulary steps, 7 review modes | **VERIFIED WORKING** |
| 21 | Listening autoplay | Once per arrival at an item | **VERIFIED WORKING** |
| 22 | Daily goal completion state | Completion card with a mascot | **VERIFIED WORKING** |
| 23 | Optional extra learning | 5 / 10 / 20 more, appended to the day | **VERIFIED WORKING** |
| 24 | Progress above 100% | 12/10 reads 120%; the bar caps at full | **VERIFIED WORKING** |
| 25 | Language first in settings | First card under the stats on `/me` | **VERIFIED WORKING** |
| 26 | Device-language detection | Navigator languages → fallback chain | **VERIFIED WORKING** |
| 27 | Dark Mode | System / light / dark, semantic tokens | **VERIFIED WORKING** |
| 28 | Simplified Hangul learning | Intro reduced to demo + sound + one line | **VERIFIED WORKING** |
| 29 | Automatic stroke animation | Plays once on arrival, rests on the finished glyph | **VERIFIED WORKING** |
| 30 | One guided writing attempt | Write, then a recognition check | **VERIFIED WORKING** |
| 31 | No second faded-guide stage | Removed; e2e asserts the step list | **VERIFIED WORKING** |
| 32 | Tolerant of beginner writing | 0.78% false reject, measured | **VERIFIED WORKING** |
| 33 | Scribbles must fail | 0.21% false accept, measured | **VERIFIED WORKING** |
| 34 | Clean canonical stroke animation | Rebuilt this cycle | **VERIFIED WORKING** (uncommitted) |
| 35 | SPA routes survive refresh | Hosting rules + a service-worker guard | **VERIFIED WORKING** |
| 36 | Progress survives refresh/reopen | 6 end-to-end cases | **VERIFIED WORKING** |

Two decisions are enforced by test rather than by convention, which is worth
knowing before touching them:

**Decision 5** — `journey.spec.ts` asserts no `writing-canvas` element exists
anywhere in a word session. Adding word handwriting will fail CI, by design.

**Decision 19** — memory keys are `${kind}:${itemKey}` with kind ∈ {`character`,
`word`}. There is no sentence key, so a sentence cannot become an SRS item by
accident.

---

# 6. Target customer and job to be done

## 6.1 The person — **RECOMMENDED framing**

A complete beginner who knows little or no Hangul and may not read English well
either; is learning casually, quite possibly lying down, on a phone; has low
commitment in week one and will quit anything that feels like homework; finds
handwriting on glass tiring if asked for too much of it; and wants visible
progress fast enough to come back tomorrow.

## 6.2 The job

> *Help me start Korean easily enough that I don't give up before I can use a
> speaking-focused product.*

## 6.3 Does the product do the job?

| Requirement | Current product | Verdict |
| --- | --- | --- |
| Start in seconds, no account | Opens into Unit 1 with a Start button | **Yes** |
| Readable without English | 32 languages, device-detected, language is the first settings row | **Yes** — word meanings reach 10 of them and the picker says so |
| Short sessions | Letter lesson ≈ 6 items; vocabulary default 10 words | **Yes** |
| Not tiring | One guided write per letter, none per word | **Yes** |
| Visible progress | Letters *n*/40, words learned, streak, calendar, daily ring | **Yes** |
| Comes back tomorrow | Daily goal resets; totals do not | **Yes** |
| Hands off to the next product | — | **No** (§4.3) |

**The job is done except for its last clause** — the clause that justifies this
product existing alongside another one.

---

# 7. Technical architecture

**VERIFIED** by inspecting `apps/`, `packages/`, `vercel.json`, and the absence
of any server directory.

```
                      ┌──────────────────────────────────────────┐
                      │  BUILD TIME (never runs on a device)     │
   Wiktionary  ──┐    │                                          │
   OpenSubtitles ├───▶│  scripts/content/*.py    vocabulary      │
   editorial pack┘    │  scripts/*.mjs           strokes         │
   Azure TTS     ────▶│                          audio, curriculum│
                      └───────────────┬──────────────────────────┘
                                      │ generated JSON + mp3
                                      ▼
   ┌────────────────────────────────────────────────────────────────┐
   │  apps/web  —  React 19 + Vite + TypeScript, one static bundle  │
   │                                                                │
   │   pages/      routes             features/  session flows      │
   │   domain/     memory · review · plan · mastery · activity      │
   │   data/       generated corpus · strokes · fonts               │
   │   storage/    driver seam ▸ IndexedDB | SQLite | Memory        │
   │   i18n/       8 locales (i18next)                              │
   │   ui/ + design-tokens   themed components                      │
   └───────────────┬──────────────────────────────┬────────────────┘
                   │                              │
        ┌──────────▼──────────┐       ┌───────────▼────────────┐
        │  Web                │       │  Android (Capacitor 8) │
        │  static host +      │       │  same bundle +         │
        │  service worker     │       │  SQLite, haptics,      │
        │  IndexedDB          │       │  notifications         │
        └─────────────────────┘       └────────────────────────┘

   NO BACKEND. No API, no database, no session, no telemetry.
   The only runtime fetch() in the whole app loads an audio file.
```

**There is no FastAPI service and no backend of any kind.** The brief for this
audit assumed one; the repository does not contain one. `vercel.json` reserves
`/api/*` out of the SPA fallback so a backend *could* be added later without
being shadowed, and `docs/DEPLOYMENT.md` states plainly that there is no server
component. **VERIFIED**: grepping `fetch(`, `XMLHttpRequest`, `axios` and
`WebSocket` across `apps/web/src` returns exactly one hit —
`PronunciationPlayer.ts`, loading an mp3.

## 7.1 Why this matters to the product

Every learner-facing consequence follows from one choice: **the learner's data
never leaves the device.** That gives the product its best properties — works
offline, no signup, nothing to breach, no running cost — and its worst risk
(§24.5: one copy, no export, no recovery).

---

# 8. Information architecture

## 8.1 Sitemap

```
/                        Home — today's unit, two counters, review nudge, quote
│
├── /letters             Learn letters — 12 lessons, alphabet progress
│   ├── /letters/:lessonId       Letter session (intro → write → read)
│   └── /letters/sounds          When sounds meet — 6 sound-change patterns
│
├── /words               Learn words — today's card, saved link, categories, search
│   ├── /words/today             Vocabulary session (the day's plan)
│   ├── /words/category/:id      One category's word list
│   ├── /words/word/:wordId      Word Detail
│   └── /words/saved             Saved words (search, order, review)
│
├── /review              Review — resolved plan count, modes, two counters
│   ├── /review/session          Review session
│   └── /review/mistakes         Missed answers (wrong-answer notebook)
│
├── /me                  My Learning — stats, language, goals, voice, typeface…
│   ├── /me/activity             Learning activity — calendar, streak, insights
│   ├── /me/language             Choose a language (8, native names, search)
│   ├── /me/privacy              Privacy
│   └── /me/legal                Legal & Licences
│
└── /dev/stroke-gallery  Development only — not in production navigation
```

**VERIFIED**: all 14 customer-facing routes were opened this cycle and rendered
with **no console or page errors**.

## 8.2 Screen by screen

| Route | Purpose | Primary action | Persists | Status |
| --- | --- | --- | --- | --- |
| `/` | Answer "what do I do now" | **Start now** | reads only | **VERIFIED WORKING** |
| `/letters` | The alphabet as 12 lessons | open a lesson | reads only | **VERIFIED WORKING** |
| `/letters/:lessonId` | Teach one letter | Write it → Check | progress, memory, attempts, mistakes, activity, session | **VERIFIED WORKING** |
| `/letters/sounds` | The 6 sound changes | read | — | **VERIFIED WORKING** |
| `/words` | The day + discovery | **Start / Keep going** | settings (goal, plan) | **VERIFIED WORKING** |
| `/words/today` | Run the day's plan | answer | plan, progress, memory, mistakes | **VERIFIED WORKING** |
| `/words/category/:id` | Browse one shelf | tap a word | saved | **VERIFIED WORKING** |
| `/words/word/:wordId` | The dictionary entry | listen / Save | saved | **VERIFIED WORKING** (§15) |
| `/words/saved` | The learner's own list | search, open, review | saved | **VERIFIED WORKING** |
| `/review` | What needs practice | Start, or pick a mode | reads a resolved plan | **VERIFIED WORKING** |
| `/review/session` | Run the plan | answer | memory, mistakes, attempts | **VERIFIED WORKING** |
| `/review/mistakes` | What went wrong | retry | mistakes | **VERIFIED WORKING** |
| `/me` | Record + every setting | change a setting | settings | **VERIFIED WORKING** |
| `/me/activity` | Streak, calendar, insights | read | reads only | **VERIFIED WORKING** |
| `/me/language` | Change interface language | pick | localStorage | **VERIFIED WORKING** |
| `/me/privacy`, `/me/legal` | Required notices | read | — | **VERIFIED WORKING** |

![Home at a 390 px phone width: one unit, one button, two counters.](report-assets/audit-home.png)

*Figure 1 — Home. One unit, one button, two counters, and a review row that
disappears when there is nothing to review.*

### Two screens said the same thing twice, and now do not

**Home offered the day's words twice and Review twice.** The Words card said
*Words 0/10 · today's words*; four rows below it, a *Today's words · 10 left
today* row said the same fraction in different words and linked to the same
screen. Above the fold, a practice card said *8 reviews ready* with a Start
button; below it, a review row said *8 to go over* and linked to the screen whose
job is to offer that session. Two entry points to one action is not two chances
to take it — it is a screen that cannot decide what it is asking for.

Each now appears once. The review row survives only for the empty state, where it
is not a duplicate but the one place that says Review exists and has nothing in
it yet.

**The finished-alphabet card no longer prints a percentage.** It headlined *You
can read Hangul* with a ring beside it reading **0 %** — the day's *words*
progress, correctly labelled and impossible to read as anything other than a
contradiction of the sentence next to it. The fraction below says the same thing
without arguing with the headline.

### My Learning, re-audited — **kept as it is, deliberately**

Every row was checked against the question "would a beginner act on this": the
learner's own record and the language at the top; the two daily goals; the
reading voice, the practice typeface and the two writing guides, all of which
change the core exercise; the sound-free switch, which is an accommodation;
appearance; the required notices; and the reset. Nothing on it is decoration and
nothing was removed.

**Saved Words and the Wrong Answer Notebook are not on it, and that is the
finding rather than an omission.** Both are the learner's own lists and both
belong to them, so the obvious move is to put them on the screen called My
Learning. They are already on Review — in *both* of its states, with their
counts, deliberately, because a quiet day is exactly when somebody wants to look
back at what they got wrong — and saved words are also on Words. Adding a third
and fourth entry point is the same defect that was just removed from Home. They
are kept, they are distinct from each other and from Review, and they are one tap
away; they are not duplicated onto a fourth screen to satisfy the shape of a
list.

---

# 9. User flows

Each flow was walked this cycle unless marked otherwise.

## 9.1 First launch — **VERIFIED**

Open → Home renders immediately with Unit 1 ("Six vowels to start"), `0 days`
streak, `Letters 0/40`, `Words 0/10` and **Start now**. No account wall, no
onboarding carousel, no permission prompts. The interface is already in the
device's language if it is one of the thirty-two.

**Friction: LOW.** The one thing missing is any statement of what the product is
*for* — a first-time visitor sees a lesson, not a proposition.

## 9.2 Change language — **VERIFIED**

`/me` → **Language** is the first row after the stats → `/me/language` →
thirty-two languages in their own names, each with a flag, the English name
beneath, and — where its word meanings are still English — a line saying so →
a search box that matches endonym, English name and alias → tap → the interface
changes immediately and the choice is written to `localStorage`.

**Friction: LOW.** This is the flow a non-English reader needs most, and it is
placed correctly.

## 9.3 Learn a first Hangul character — **VERIFIED**

`/letters/lesson-vowels-core` → a one-card unit explainer → **Got it** → the
letter screen.

![The letter introduction: the demonstration plays by itself, then the name and sound rows, then one line about the sound.](report-assets/audit-letter-intro.png)

*Figure 2 — The letter introduction after this cycle's simplification. The
demonstration is the only glyph on the screen and starts on arrival; the still
picture that used to sit above it is gone.*

The demonstration begins automatically and settles on the finished character.
The letter says itself once. Below: the letter's name, its sound with an example
syllable, and one line about that sound. Primary action: **Write it**.

**Friction: LOW.** This screen was three times longer two cycles ago.

## 9.4 Write a character — **VERIFIED**

**Write it** → a large box with a grey reference glyph and crosshair guides →
trace with a finger → **Undo** / **Clear** → **Check**. Below the fold, a *Watch
it written* helper replays the demonstration.

![The writing step: guide glyph, undo and clear, and the stroke helper below the canvas.](report-assets/audit-letter-writing.png)

*Figure 3 — The writing step. The demonstration sits under the canvas so the pen
is above the fold on a small phone.*

Passing advances to a recognition check ("Now read it") — pick the letter out of
look-alikes — then the next letter.

**Friction: LOW–MEDIUM.** One guided write per letter is the right amount. The
remaining friction is inherent: writing on glass.

## 9.5 Start today's vocabulary — **VERIFIED**

`/words` → the day card shows `0/10` and **Start** → `/words/today`. The first
screen is a *meeting card*: the word, its sound (played automatically), its
meaning and the sentence it lives in, with **Save**. **Got it** moves on. Words
interleave — you meet two or three before being asked about the first.

## 9.6 Complete a vocabulary item — **VERIFIED**

A word is complete for the day when every step the plan scheduled for it is
done. The counter moves by **one word**, never by one question, and a repeat is
ignored.

## 9.7 Reach the goal, then study more — **VERIFIED in the browser this cycle**

10 of 10 → the card switches to a completion state with a mascot and **A little
more** → tapping offers **5 more / 10 more / 20 more** → the chosen number is
*appended* to the day, `completed` is untouched, and the goal does not move.
Twelve of a goal of ten reads **12/10, 120%**, and the progress ring stays full
rather than overflowing.

## 9.8 Save a word and find it again — **VERIFIED**

Save is on the meeting card and on Word Detail. `/words/saved` lists them newest
first with search, three orderings, and a **Review** link that builds a plan from
saved words only.

## 9.9 Answer wrongly — **VERIFIED**

A wrong answer writes a row to the `mistakes` store keyed by the *item*, not the
attempt. `/review/mistakes` shows what was asked, what was chosen and what was
right. Two correct answers retire the row from the active list without deleting
the history.

## 9.10 Review — **VERIFIED**

`/review` shows a number that comes from a *resolved plan* — the same object the
session iterates — plus per-mode counts, each disabled when its plan is empty.

![Review with nothing due: an explanation and a way forward rather than a zero.](report-assets/audit-review.png)

*Figure 4 — Review on a fresh profile. The empty state routes the learner to a
new letter instead of showing an empty list.*

## 9.11 Resume, refresh, reopen — **VERIFIED**

Leaving mid-session and returning resumes the same day's plan with the same
remaining words. Refreshing any nested route reloads the app at that route with
the profile intact. Closing the tab and reopening does the same. Six end-to-end
cases cover this; §24 has the detail.

---

# 10. Hangul learning system

## 10.1 Curriculum shape — **VERIFIED**

73 taught items across 12 lessons, in a deliberate order:

| Unit | Lesson | Teaches |
| --- | --- | --- |
| 1 | Six vowels to start | ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ |
| 2 | Your first consonants | ㄱ ㄴ ㄷ ㄹ ㅁ |
| 3 | Syllables — 가 | consonant + vowel, side by side |
| 3 | The vowel moves | consonant + vowel, stacked |
| 4 | More consonants | ㅂ ㅅ ㅇ ㅈ ㅎ |
| 5 | More syllables / silent ㅇ | blocks, and ㅇ's two jobs |
| 6 | Y vowels | ㅑ ㅕ ㅛ ㅠ |
| 7 | Aspirated consonants | ㅊ ㅋ ㅌ ㅍ |
| 8 | E vowels | ㅐ ㅔ ㅒ ㅖ |
| 9 | Tense consonants | ㄲ ㄸ ㅃ ㅆ ㅉ |
| 10 | W vowels | ㅘ ㅝ ㅚ ㅟ ㅢ … |

Syllables are taught as a *third thing*, after their parts — which is the
pedagogically correct order, and why the curriculum is 73 items rather than 40.

## 10.2 The mastery ladder — **VERIFIED**

`unseen → introduced → practised → learned`. What "learned" requires depends on
the kind:

| | Letter / syllable | Word |
| --- | --- | --- |
| Demonstration watched | required | not applicable |
| Written over a guide | required | **never** |
| Recognised among look-alikes | required | required |
| Heard | recorded, **not required** | recorded, **not required** |

**The `heard` rung was removed as a requirement this cycle**, and the reason
belongs in the record: it was set from an autoplayed clip, and desktop browsers
block autoplay until the page has been interacted with. The rung was therefore
not "has the learner heard this" but "did this browser allow sound", and a
learner whose browser never allowed it could never complete anything — silently.
Hearing is still recorded and still feeds the scheduler.

## 10.3 Progress and daily goals — **VERIFIED**

* Letters: `n / 40` — the forty letters, not the 73 items, because 40 is a
  number a beginner can hold in their head.
* Daily letter goal: 3 / 5 / 10 / 15 / 20, default 5.
* Daily word goal: 5 / 10 / 15 / 20, default 10.

## 10.4 Audio in the lesson — **VERIFIED WORKING**

`useEntryAudio` plays one clip per *arrival at an item*, guarded by a ref so a
re-render, a locale change or returning from the background cannot make it speak
twice. Leaving stops playback so a clip cannot follow the learner onward.

---

# 11. Stroke renderer

## 11.1 Verdict — **REBUILT this cycle, and the previous verdict was wrong**

The demonstration is now sound: 73 items, 269 strokes, 1,345 rendered frames,
clean on the data gate and the pixel gate, and read by eye at both the size a
desktop draws it and the 96 px a phone does. What follows is mostly about how it
got to be wrong, because that is the part with anything to teach.

## 11.2 The previous report said this was release quality. It was not.

The last report stated that the stroke renderer was **RELEASE QUALITY** and that
all 73 items had been visually inspected. Both statements were false, and the
customer disproved them with four screenshots:

* **ㅂ** — the black uprights carried triangular wedges into the crossbars, so a
  learner watching stroke one could see a piece of stroke three already on the
  paper.
* **ㅅ** — the first stroke grew an angular chunk into the second one's shoulder.
* **ㅇ** — a visibly lumpy ring: flat spots, uneven sides, and a staircase where
  the tracer met the rasteriser. Not a circle.
* **ㅈ** — the lid chipped into the fork.

They were reproduced here before anything was changed, by rendering the shipped
`strokeAssets.json` directly. They were all real.

### How the QA missed it

Not by being weak. By asking the wrong question, in two distinct ways.

**The data gate could not see it.** `strokes:qa` checked that no path had a NaN
in it, that nothing fell outside the box, that no stroke claimed no ink, and that
every taught item had an asset. All of that was true of a glyph with a wedge in
it, because the wedge was *valid geometry*. It passed 73 items and 269 strokes
through every round in which the product was visibly broken.

**The pixel gate asked about ownership, and ownership was the bug.** The
invariant it enforced was that ink beyond the end of stroke *i*'s route must not
fall inside stroke *j*'s body, for *j* later than *i*. That is a sound statement
about a *correct* cut. It is silent about a cut whose regions are already
disjoint by construction — which these were, because they were carved out of one
glyph. The check could never fire on the thing that was wrong.

And the report then wrote "all 73 read by eye this cycle", which is the part with
no excuse. A number in a table is not a pair of eyes.

## 11.3 What was replaced

The old architecture, stated plainly:

```
Pretendard glyph
  → rasterise
  → award each pixel of ink to whichever stroke's centreline reaches it first
  → trace each awarded region back to a contour
  → simplify
  → animate the resulting filled polygons behind reveal masks
```

Its appeal was a real invariant: `union(strokes)` was the glyph exactly, so the
finished frame could not drift from the letter above it. It bought that with two
defects that four rounds of corrective heuristics did not remove, and could not
have:

**Ownership artefacts.** A T-junction is ink that two strokes both pass through.
Whatever rule divides it draws a *boundary*, and the boundary becomes visible the
moment one side is black and the other grey. There is nothing to divide — the ink
at a junction belongs to both strokes and is written twice — so no division rule
fixes it.

**Polygons.** A traced raster contour is a polygon. ㅇ came back with about thirty
segments a side. This one is not a tuning problem at all: no ownership rule turns
a traced polygon into a smooth curve.

## 11.4 What replaced it — **VERIFIED**

The reference glyph and the writing animation now answer different questions and
no longer share geometry.

| | |
| --- | --- |
| **The reference glyph** — the large character a learner studies | Set in the real typeface. `ui/ReferenceGlyph`. A type designer has already solved what the letter looks like. |
| **The instruction** — the animation, the numbered diagram, the grey guide | `data/strokeVectors`: authored vector centrelines, drawn as *stroked* paths with `fill="none"` and revealed with a dash offset. |

A stroked centreline cannot have an ownership artefact, because ownership is not
a concept it contains. Two strokes that meet simply overlap, as two pen strokes
on paper do. There is no boundary to see, so the rule that a learner must never
be able to infer how the renderer divided a glyph now holds by construction
rather than by care.

### The geometry is not new, and that is the point

`data/strokes.ts` has always held the pedagogical truth — which strokes, in what
order, from which end, travelling which way — as parametric jamo primitives, and
`data/compose.ts` has always placed those into syllable blocks using part boxes
measured off the reference face. Both were sound. They were being used only to
steer a raster cut; now they are drawn directly. Three things were added:

1. **Curved strokes carry the curve.** ㅇ is four cubic segments — a true circle,
   and a true ellipse after a block flattens it, because the per-axis fit in
   `compose.ts` maps a cubic exactly. ㄱ's leg is one cubic. The polyline that
   every other consumer reads is now *sampled from* the curve rather than
   authored beside it, so the two cannot disagree.
2. **Ends are classified, not decreed.** Each stroke end is read off the geometry
   as `join` (it lands inside another stroke — cut square, no terminal, because
   the terminal would be under that stroke's ink anyway), `corner` (it meets
   another stroke's own end, and this stroke is the later one — extended half a
   pen to close the corner) or `free`. Only the *later* stroke of a corner
   extends, which is what keeps a completed stroke from growing a millimetre
   towards one not yet written.
3. **Proportions come from the face.** `scripts/measure-jamo.mjs` measures each
   letter's ink-box aspect off Pretendard, and the authored strokes are fitted
   into a box of that shape, so the demonstration and the reference character are
   the same letter in the same proportions.

### Two letters the face draws twice

Pretendard gives ㄱ a **vertical** leg on its own and a **leaning, curved** one in
가 and 거 — and a vertical one again in 고 and 국, where the block squashes it.
The old data had only the leaning form, so a lesson on ㄱ drew a leaning leg
directly under a reference glyph with a straight one. `STROKE_ORDER_ALONE` holds
the isolated forms for ㄱ, ㅋ and ㄲ; composition never reads it.

## 11.5 What the gates check now — **VERIFIED**

`strokes:qa` is shorter than it was, deliberately. Most of it defended against
what a raster cut could produce — a stroke with no ink, a region traced into two
islands, a reveal ribbon that did not match its outline, ink awarded to a stroke
not yet written — and none of those are reachable. Checks that can no longer fail
were removed rather than left in to look thorough. What it asserts now: every
taught item has geometry; stroke counts agree with what the lesson tells the
learner; nothing including the pen falls outside the box; an end marked `join`
genuinely lands within half a pen of another stroke; a ring's sample never turns
more than 15° between points; no two markers overlap.

`strokes:visual` renders all 1,345 frames in Chromium — with the same paths, pen,
caps, mitre limit and dash offset the shipping component uses, so a frame that
passes is a frame that shipped — and asserts what a stroked, dash-revealed path
can still get wrong: a stroke that draws nothing, ink that does not arrive in
step with its fraction, ink that shrinks as the fraction grows, ink touching the
edge of the box, a marker off its own start, and a finished frame that is not the
union of its strokes.

**And then it writes the gallery, at 160 px and at 96 px, and the answer to
"does ㅅ look like ㅅ" comes from looking at it.** The reported defect was seen on
an Android browser, not a desktop; a 150 px review of a 96 px picture is a
different question, so both sizes are rendered.

## 11.6 Evidence, by layer

| Layer | Result |
| --- | --- |
| Source | 73 items, 269 strokes, `strokes:qa` clean |
| Automated pixels | 1,345 frames, `strokes:visual` clean |
| Rendered web | Gallery read by eye at 160 px; each item beside the typeface glyph it must agree with |
| Rendered mobile | Same gallery at 96 px; lesson screens captured at 390 × 844 |
| Packaged Android | See §2.2 — the built assets grepped out of the delivered package |

## 11.7 What it cost, and what it saved

The instructional geometry was 79 kB of generated JSON — about 190 kB of path
outlines — in its own lazily-loaded chunk. It is now the code that draws the
strokes: **5.0 kB gzipped**. `scripts/build-stroke-assets.mjs`, 1,889 lines of
rasterising, distance transforms, contour tracing and four generations of
corrective heuristics, is deleted.

## 11.8 Launch screen and the desktop shell — **NEW this cycle**

### The splash, and why it is one picture rather than two

The brand supplied two short animations — 한귤 with 작은 귤 한 조각처럼, 매일 한
문장씩, and *Han gyul* with *When life gives you a tangerine* — as a 3.4-second
MP4 and a 5.6-second MOV, both 744 × 1622 with an audio track.

Neither ships as delivered. The audio is stripped, because a splash that makes a
sound is one people learn to dread and autoplay with sound is refused anyway.
And both are **trimmed to 1.8 seconds**, which is the animation: the English art
settles at about 1.2 s and then holds still for another four, the Korean at about
1.6 s and holds for two. Shipped whole and dismissed on readiness, a learner saw
a growing circle and never once the wordmark. Re-encoded at 540 px wide they are
76 kB and 49 kB, from 1.2 MB and 737 kB.

The harder question was the *native* launch screen, which runs before any of the
app's code does and therefore cannot know what language the learner has chosen.
Showing the Korean artwork to a Spanish learner is wrong; showing the app icon
first and the brand animation second is two brand screens back to back.

**Frame zero solves it.** The first frame of the animation is the ground and one
soft circle — no wordmark, no copy, nothing language-specific. That is what the
Android drawables and the iOS launch image are generated from, so the native
screen holds frame zero, the WebView takes over, and the animation carries on
from exactly where the native screen left it. One picture across the handover.

Four things have to be the same colour for that to work, and all four are now
`#FFF6E9`: the artwork's own ground, `splashGround` in the design tokens,
`backgroundColor` under `SplashScreen` in the Capacitor config, and
`color/splashBackground` in the Android resources — which is what Android 12 and
newer actually paint, and which was still `#FFF8F1` until it was checked in the
built package.

| | |
| --- | --- |
| Korean interface | `splash-ko.mp4` — 한귤 |
| Every other language | `splash-en.mp4` — Han gyul |
| Reduced motion | The still, same picture at rest |
| Autoplay refused | The poster is already underneath; nothing changes |
| Native, before the WebView | Frame zero, no words, no language |

The language is read from `LocaleContext`, which is the only source that is right
at that moment. Two nearer-looking ones are both wrong by exactly one render:
`<html lang>` is set by an effect, and effects run after children render, so it
still says `en`; and i18next is seeded by the same provider after its own first
render. Both were tried; both gave a Korean learner the English splash.

### The desktop shell

Every screen in this product is designed for a thumb: one column, a bottom tab
bar, a writing square the width of the content, type sized for arm's length.
Stretched across a desktop browser that does not become a desktop app — it
becomes the phone app with its buttons pulled apart and a writing box the size of
a dinner plate.

So above 560 px the app is centred in a phone-sized shell — 430 px wide, at most
932 px tall, on a surface a shade off its own ground. It is a media query on the
root element rather than a component, which is the whole reason it is reliable:
there is nothing to decide at runtime, so it covers every route, the launch
splash, a refresh in the middle of a lesson and a cold start alike, and there is
no wrapper for one of them to have been left out of.

The `transform` on that rule is load-bearing rather than decorative: it makes the
shell the containing block for `position: fixed` descendants, which is the
difference between a modal appearing inside the phone and a modal covering the
whole desktop while the phone sits behind it. `ui/Modal` is the only fixed thing
in the app.

---

# 12. Handwriting recognition

## 12.1 How it works — **VERIFIED**

The learner's ink and the reference glyph are rasterised to a 128×128 mask and
compared. Two error terms are measured separately and **added**:

* `outsideStrokeRatio` — of the ink laid down, how much is not part of the glyph.
  Catches scribbles, wrong shapes, oversized writing, writing in the wrong place.
* `missingCoverageRatio` — of the glyph, how much was never written. Catches
  half-finished characters and missing strokes.

Errors are **graded, not binary**: a pixel within 4% of the resolution costs
nothing, then ramps to full cost over 1.5× that distance. A hard in-band test
makes every attempt inside the band score identically, destroying the signal.

A **contiguous unwritten blob** is weighted 2.5×. Mean coverage alone dilutes a
missing stroke: dropping the branch of ㅏ in 가 is 4% of the glyph and the
difference between 가 and 기, and it used to score as a rounding error.

Nothing re-centres or re-scales the learner's ink — placement in the box is part
of the task.

| Constant | Value | Meaning |
| --- | --- | --- |
| `MAX_MISMATCH_RATIO` | 0.10 | pass threshold |
| `GLYPH_TOLERANCE_RATIO` | 0.04 | free distance |
| `TOLERANCE_FALLOFF_MULTIPLIER` | 1.5 | ramp width |
| `STRUCTURAL_GAP_WEIGHT` | 2.5 | missing-blob penalty |
| `MIN_INK_RATIO` | 0.08 | too little ink to judge |
| `MAX_PATH_LENGTH_RATIO` | 2.5 | path far longer than the glyph ⇒ scribble |
| `MAX_REVERSAL_DENSITY` | 6 | direction changes per unit ⇒ scribble |

## 12.2 Is the balance right? — **VERIFIED, measured**

`npm run handwriting:robustness` replays fixture strokes across all six shipping
typefaces:

| Typeface | False accept | False reject |
| --- | --- | --- |
| nanum-gothic | 0.00% | 0.28% |
| nanum-myeongjo | 0.00% | 1.38% |
| gowun-batang | 0.00% | 0.55% |
| gaegu | 0.21% | 1.10% |
| gowun-dodum | 0.00% | 0.83% |
| **overall** | **0.21%** | **0.78%** |

The confusions are ones a human makes too: ㅈ←ㅊ, ㅐ←ㅒ, ㅂ←ㅍ — pairs differing
by one short stroke.

**Assessment: the balance is correct and slightly generous, which is the right
direction for a beginner product.** The earlier complaints — tiring repetition,
scribbles passing — are not reproducible against the current constants. 95
handwriting-core tests pass.

## 12.3 The limitation this does not solve — **VERIFIED**

The evaluator compares *ink*, not *strokes in order*. A learner who draws the
right shape in the wrong order passes. Stroke order is taught by the
demonstration and commented on afterwards in the notes, but it is not graded.
**Deliberate, not a gap** — grading order would fail beginners for something the
demonstration has only just shown them.

---

# 13. Vocabulary data

## 13.1 Scale — **VERIFIED**

| | |
| --- | --- |
| Headwords shipping | 2,581 |
| Target | 10,000 |
| Gap | **7,419** |
| Categories | 18 |
| Study sets | 524 |
| Removed during curation | 328, each with a recorded reason |

Part of speech: 1,023 verbs, 996 nouns, 283 adjectives, 208 adverbs, 27
pronouns, 21 interjections, 13 determiners, 10 numerals.

## 13.2 Sources — **VERIFIED**

| Field | Source | Licence |
| --- | --- | --- |
| Part of speech, topic categories | English Wiktionary | CC BY-SA 4.0 |
| Synonyms (유의어), antonyms (반의어) | Korean Wiktionary | CC BY-SA 4.0 |
| Frequency band, rank, rate | OpenSubtitles Korean corpora | MIT / CC BY-SA |
| Meanings, examples, translations | Hangyul ganada editorial pack | ours |
| Pronunciation, syllables, difficulty, readiness | computed | ours |
| Audio | Azure Neural TTS, two Korean voices | vendor terms |

Every word carries a `sources` array naming which source supplied which field.
Licences requiring attribution are shown in-app under **Legal & Licences**.

## 13.3 Field coverage — **VERIFIED**

| Field | Coverage |
| --- | --- |
| Headword, romanization, part of speech, category | 2,581 / 2,581 |
| Example sentence | 2,581 / 2,581 |
| Word audio, example audio | 2,581 / 2,581 |
| Pronunciation note (spoken ≠ written) | 503 |
| Meaning, each of 8 original languages | 2,581 |
| Meaning, Vietnamese and Thai | **2,581 each** — see §23.4 |
| Example translation | 2,581 in 9 languages (Korean has none — the example *is* Korean) |
| **Longer explanation (`definition`)** | **25, in all 10 languages** — see §15 |
| Verified synonym or antonym | **243** |

Two of these rows moved this cycle and they moved in opposite directions, which
is the point.

Vietnamese and Thai went from 500 words to all 2,581, so no locale is partial
any more. The longer explanation went from 784 to 25 — *down* — because the 784
were derived from a dictionary and were not worth reading. §15 has what they
said. What replaced them is written, and written only where a one-line gloss
genuinely misleads.

The relations row is the remaining content gap and it is not a schema gap: the
field exists, the sources are conservative, and 243 of 2,581 is what two
licensed sources actually state.

## 13.4 The 10,000-word strategy — **PARTIALLY WORKING**

The intent is a corpus deep enough that the app never runs out, surfaced a
handful of words a day rather than as a list. **The surfacing is built and
works. The corpus is at 26% of target.**

**And the delivery path for the rest is unsolved.** `npm run bundle:budget`
forecasts the corpus at 10,000 headwords as **655.3 kB gzipped against a 220 kB
budget — 298%**. The forecast is printed but *not enforced*. Today's corpus is
169.1 kB gz and still ships in the **first load**. Growing it without splitting
would roughly quadruple the initial download.

**RECOMMENDED:** decide the delivery mechanism — per-category chunks, or an
on-demand fetch with an offline-first cache — *before* authoring more words,
because the choice changes the data shape.

### Why it was not done this cycle, stated rather than implied

It was looked at properly and left alone, and the reasoning belongs in the
report rather than in a commit nobody reads.

The three remedies the budget script names were each costed against the code:

* **Drop the corpus out of the eager module graph.** `LearnerProvider` builds
  today's plan from `vocabularyByPriority()` and the home screen renders that
  plan, so the corpus is needed *before the first screen paints*. Making it
  lazy is not a bundler setting; it is a loading state on the home screen and a
  change to what the app promises on a cold start. That is a product decision,
  and §62 of the brief lists the home screen's behaviour among the things not
  to reverse.
* **Ship only the fields the learning path reads.** Measured field by field:
  dropping provenance saves 2.1 kB gzipped, difficulty 8.4 kB, the frequency
  triple 22 kB. All of them are consumed inside `data/vocabulary.ts` into one
  normalised `VocabularyWord`, so splitting them makes that shape partial and
  asynchronous across fifteen call sites, for ~30 kB.
* **Shard by the session's plan.** The largest change of the three, and the
  only one that actually scales to 10,000.

At 2,581 words the first load is at 95% of its budget with every budget green,
and the corpus is 77% of its own. The gate that forces the work exists and is
enforced: `LAZY_REQUIRED_HEADWORDS = 4_000` in `check-bundle-budget.mjs` fails
the build at the commit where the current architecture becomes the wrong one.
Doing the refactor now would be a large, risky change to the whole data layer
for a benefit the product does not yet need; doing it at 4,000 is the same work
with a reason. **What would be wrong is authoring 7,419 more words first**, and
that is exactly what the gate prevents.

---

# 14. Vocabulary content quality

## 14.1 Automated checks — **VERIFIED, run this cycle**

| Check | Result |
| --- | --- |
| `content:qa:check` | 2,581 kept, 328 removed; **4 warnings** |
| `examples:qa:check` | 2,581 PASS, 0 REVIEW, 0 REWRITE; 2,173 distinct sentence shapes; largest shared template used 8 times; 1,303 inflected target forms |
| `audio:pronunciation:check` | 2,612 items, 0 errors, 0 warnings |
| `content:coverage:check` | every applicable row at 100% |
| `vocabulary:sense:qa:check` | 2,581 words, 8 complete languages, 11 pinned senses held; `vi`/`th` at 2,581 each; 25 long definitions present in all 10 |
| `audio:qa` | 10,550 clip slots, 48.9 MB, 0 errors, 0 warnings |
| `copy:audit:check` | 17,832 strings across 32 languages, 0 errors |

The four content warnings are loanwords whose translations are the same word in
Latin script — 호텔 → *hotel*, 골프 → *golf*, 위스키 → *whisky*, 요가 → *yoga*.
**Correct, not defects**: the checker flags identical strings, and these
genuinely are identical.

## 14.2 Manual sample — **VERIFIED**

Sampling by hand (엄마, 고기, 하다, 밝다, 남자, 좋다):

* **Meanings are learner-shaped, not dictionary-shaped.** 엄마 → "mum, mummy",
  not "a term of address for one's female parent".
* **Examples are short and natural.** 엄마가 요리해요 / 방이 밝아요 / 고기를 구워요.
* **Inflection is handled.** 먹다's sentence says 먹어요, and the card says so.

**Eleven glosses contradicted their own example, and all eleven are fixed.**

This is the defect §18 of the brief names, and it had a single cause. The seven
non-English meanings are written per entry in the editorial pack, and `pack.py`
refuses an entry that is missing one. English was not: it fell through to the
first usable dictionary sense, and a derivation has to *pick* a sense, so on a
polysemous headword it picks one and the example demonstrates the other.

| Word | Gloss said | Its own example says | Gloss now |
| --- | --- | --- | --- |
| 네 | "who, whom" | "Yes, that's right." | "yes" |
| 열 | "fever" | "Please count to ten." | "ten" |
| 찍다 | "to take a photo" | "I stamped it with a seal." | "to stamp" |
| 쓰다 | "to wear, to put on" | "I write my name." | "to write" |
| 타다 | "to burn" | "I take the bus." | "to ride, to get on" |
| 정말 | "that which is true or genuine" | "Thank you very much." | "really, truly" |
| 수도 | "waterworks" | "The capital of Korea is Seoul." | "the capital city" |
| 있다 | "to exist" | "The book is on the desk." | "to be in a place" |
| 적다 | "to write, to write down" | "There is little money." | "to be few, to be little" |
| 전기 | "first period, early period" | "The power went out." | "electricity" |
| 마디 | "a joint" | "Let me say just one word." | "a word, a remark" |

Each now carries an authored `en` in the pack, which the build prefers over
anything derived. 적다 needed its part of speech corrected as well: the
derivation had taken the verb "to write down" for a headword whose example is
the adjective. That changed its difficulty score, which re-ordered the corpus
slightly — harmless, because every id is stable and all copy is keyed by id, and
worth noting because it is why some figures in this report moved by one.

### How they are held

`npm run vocabulary:sense:qa` is new and does three things a machine can
actually decide:

* **Coverage** — every shipping word has a meaning in every language that
  claims to be complete. Hard failure.
* **Part of speech against the shape of the gloss** — an infinitive gloss on a
  noun, or a verb glossed as a bare noun. Hard failure, with one documented
  exception (실컷, an adverbial phrase that begins with the word "to").
* **The eleven pinned senses, matched by exact string.** Hard failure. A
  near-match would let a regeneration replace "ten" with "the number ten, a
  count" and call it unchanged, and the point of pinning is that the sense stops
  moving.

It also *reports*, without gating, the 103 glosses that carry more than one
sense in some language — 차 is "a car, or the tea you drink" in Korean and
車、お茶 in Japanese. Those are real and they are content work, so they are
listed rather than made to block a build nobody can unblock.

### What it deliberately does not claim

**It cannot decide that two glosses in two languages mean the same thing.** That
was attempted twice. Comparing the English gloss against the example translation
by word overlap flags 11% of the corpus and is mostly noise. Comparing the
English and Korean glosses by grammatical *shape* flags 21 entries of which most
are correct. Neither is a check; both are a way of generating work, and both
were discarded rather than shipped as a number that looks like rigour.

So the honest state of §14.2's older finding — Korean and English describing
different senses of a polysemous word — is that the three named cases (쓰다, 적다,
밝다) are fixed, eight more were found and fixed, and **there is no automated
guarantee that a twelfth does not exist**. Finding one still takes a person
reading a card. What changed is that finding one now has somewhere to put it.

## 14.3 Lexical relations — the fix from last cycle, audited

**Previously:** Word Detail carried a section headed *비슷한 낱말* whose contents
were computed — the four words nearest in the same category. Under 고기 that
printed 사과, 음식, 먹다, 우유: the food shelf, under a heading claiming a
dictionary had found them alike.

**Now — VERIFIED WORKING.** That section is gone. In its place, two explicitly
typed sections that appear only when there is something true to put in them:

* **유의어 / Synonyms** and **반의어 / Opposites**, built from the Korean
  Wiktionary's own `유의어` / `반의어` metadata.
* A relation ships only when the dictionary states it, *as that relation*, scoped
  to the part of speech and primary sense this app teaches; **both headwords
  state it**; and both words ship, so every chip opens.
* 고기 shows **neither section**. Its stated synonyms are 살 and 육, neither in
  the corpus. That is the correct answer.

`vocabulary:relations:qa` enforces the rules — typed relations only, no
self-reference, no duplicates, no dangling target, both directions stated, and a
guard that the old `nearby` key has not returned. It passes.

**The honest trade:** 243 of 2,581 words have any relation. The dictionary is now
trustworthy and sparse. That is the right order to fix it in, but the sparseness
is visible.

**One caveat — NEEDS VERIFICATION.** NAVER's Korean dictionary is the reference
the product brief names, and it is unreachable from the build environment
(`ko.dict.naver.com` answers with its own service-unavailable page; there is no
relation API; the terms do not grant redistribution of extracted metadata). The
Korean Wiktionary was used instead. A reviewer with NAVER access should
spot-check a sample of the 136 pairs.

---

# 15. Word Detail

## 15.1 What a learner sees — **VERIFIED**

![Word Detail for 엄마.](report-assets/audit-word-detail.png)

*Figure 7 — Word Detail. Headword, romanization, meaning, part of speech, Save, the
example with its own audio, and a verified synonym.*

| Element | Present for | Status |
| --- | --- | --- |
| Headword, large, in the chosen typeface | 2,581 | **VERIFIED WORKING** |
| Revised Romanization | 2,581 | **VERIFIED WORKING** |
| Word audio | 2,581 | **VERIFIED WORKING** |
| Part of speech | 2,581 | **VERIFIED WORKING** |
| Meaning in the learner's language | 2,581 | **VERIFIED WORKING** |
| Save | 2,581 | **VERIFIED WORKING** |
| Example + translation + example audio | 2,581 | **VERIFIED WORKING** |
| Sound-change note | 503 | **VERIFIED WORKING** |
| **Longer explanation** | **25, all 10 languages** | **VERIFIED WORKING** |
| Synonyms / Opposites | 243 | **PARTIALLY WORKING** — correct when present |

## 15.2 The *More about it* block, rewritten from the ground up

The row above went from 784 words to 25 and that is an improvement, which needs
explaining.

**What it used to be.** The build filled the block with the dictionary's second
and third senses for the headword, joined with a semicolon. Nobody wrote a word
of it. Reading the 784 words that had one is what settled its fate:

```
  개    "someone who does the bidding of another"
  문    "phylum"
  산    "graveyard"
  얼굴  "visage"
  새    "straw thatch used for roofing"
  전기  "prophase"
```

Under a heading that reads *More about it*, in English only, on a screen whose
whole purpose is to be trustworthy about a word. And English only meant a
Japanese or Spanish learner never saw the heading at all — the previous report
called that the defect, and it had the diagnosis backwards. The absence was not
the problem. The presence was.

**Two filters were written and both were abandoned.** Putting each clause
through the same `gloss.py` bar the primary meaning has to clear leaves 좋다
reading "to be good; to be good" and 알다 repeating its own meaning. A stricter
pass that also drops anything duplicating the gloss still keeps the thatch and
the graveyard. The text is a dictionary talking *about* a word, which is the
precise thing `gloss.py` exists to keep away from a beginner, and no shape rule
turns it into writing.

**What it is now.** Nothing is derived. 25 words carry a written explanation in
all ten languages that have word copy, and they are the words where one line genuinely misleads:

* **The sibling terms** — 오빠, 형, 언니, 누나, 동생. Korean picks the word by the
  *speaker's* gender, so 오빠 and 형 are the same brother seen from two sides.
  No gloss carries that; the block says it in a sentence.
* **The eleven pinned polysemous entries** from §14.2, each naming the sense it
  is *not* teaching: 차 is a car and also tea, 열 is ten and also a fever, 파리
  is a fly and also Paris.
* **The words whose grammar is the point** — 하다 is how most Korean verbs are
  built, 있다 is one word where English needs both "be" and "have", 되다 is heard
  far more often as 안 돼요 than as "become".

The other 2,556 words have no block, deliberately. A paragraph under every word
is a paragraph a learner scrolls past, and this one is worth reading precisely
because it does not always appear.

**How it is held.** `pack.py` refuses an entry whose long definition is written
in some of the eight entry-carried languages and not the rest. `vocabulary:sense:qa`
compares all ten packs index by index, so the block cannot appear in Vietnamese
and vanish in Thai — verified by deleting one row and watching the check fail.
`wordDefinition.test.tsx` holds the two properties a screen can check: the block
appears on 차 and mentions tea, and it is absent from 사과, which is an apple and
nothing else.

## 15.3 Assessment

**A credible dictionary entry, now in ten languages rather than one.** The
remaining thinness is relations: 243 of 2,581 words show a synonym or an
opposite, and that is a source-coverage limit rather than a defect — see §14.3.

**Customer impact:** none outstanding for the meanings. **Severity: closed.**

---

# 16. Vocabulary learning experience

## 16.1 The shape — **VERIFIED**

```
today's goal (10)  →  meet · choose · recognise  →  progress  →  completion
                       interleaved across words
```

Not "browse 10,000 words", and not "handwrite every word". Both alternatives were
built at some point and both were removed.

## 16.2 Question types actually implemented — **VERIFIED**

| Step | On screen | Layout | Tests |
| --- | --- | --- | --- |
| `intro` | the word, sound, meaning, sentence | card | nothing — this is the teaching |
| `meaning` | Korean, four meanings | full-width rows | can they read it |
| `produce` | a meaning, four Korean words | **2 × 2 tiles** | can they find it from the idea |
| `build` | its own syllables, shuffled | **syllable tiles** | can they spell it from the idea |
| `context` | its sentence with a gap | **chips under the sentence** | do they know which word it wants |

**There is no listening question in this table any more, and there is no code
path that could add one back.** `listen` — a clip and four words — and
`listenMeaning` — a clip and four meanings — were both here in the previous
report and are gone as of this cycle. `WordStep` has no heard-only member, so
nothing can schedule one; `buildExercise` returns `null` for both modes when the
item is a word, so nothing can render one; and `listening_recognition` is no
longer one of `WORD_SKILLS`, so the review scheduler cannot select one. The
delivered APK was unpacked and searched: `review.prompt.listen` and
`review.prompt.listenMeaning` do not appear in it at all, and the only listening
prompt key that survives is `review.prompt.listenLetter`, which belongs to the
Hangul alphabet and is out of this patch's scope. See §16.5.

**Matching and keyboard recall are still NOT IMPLEMENTED**, and are not promised
anywhere in the code. A matching exercise spans four words at once and the plan
is a per-word object — `completesWord`, `wordId` — so it is a scheduling change
rather than a screen, and it was not attempted here rather than half-attempted.

## 16.3 What changed this cycle, and why it was the right level

The complaint was that a session feels like one screen shown ten times. Walking
a real first session showed that it literally was:

> A beginner's plan is ten **new** words. Every new word owed `intro → meaning`.
> So a first-time learner's entire experience of the vocabulary half of the
> product was *meet a word, pick its meaning*, ten times, in one layout.

Two changes, at two different levels:

**The new-word check now rotates by position** — it was `meaning`, `listen`,
`listenMeaning`, `context`, and it is `meaning`, `context` after the listening
questions were removed. Both remaining checks are recognition, deliberately: a
word met thirty seconds ago should not be asked to be produced, which is the
same reason `produce` waits for the word to be familiar. The rotation is by
index and therefore deterministic, so a learner who leaves and returns finds the
same session. The narrowing this cycle caused is stated honestly in §16.5 rather
than left for a reader to notice from the table.

**The options take the shape of what they are.** A Korean word is two or three
syllables and is a short label adrift in a full-width row; in a square tile it
is the object being chosen. A meaning is a phrase — *to stay, remain in a
location* — and a phrase in a square is two awkward line breaks. A gap-fill's
candidates go on one line under the sentence, because four tall rectangles push
the sentence off the top of a phone and the learner is holding that sentence in
their head.

That last point is the distinction §16 of the brief draws and the reason this is
not decoration: the layout follows the content, so it changes exactly when the
question changes and never merely for variety.

![Six consecutive screens of a first vocabulary session.](report-assets/audit-session-variety.png)

*Figure 8 — the first six screens of a first session. Three introduction cards,
then three different question shapes in three different layouts, where the same
six screens previously held one.*

## 16.4 Question quality — **VERIFIED**

* **Distractors** come from the same category and difficulty band, so a question
  cannot be answered by eliminating implausible options.
* **Answerability is checked before a question is offered.** A candidate that
  cannot produce four distinct options is never asked — the same filter the
  Review counts use, which is why those counts cannot over-promise.
* **Audio is support on every question, and is the question on none of them.**
  The clip still plays beside the Korean on `meaning`, beside the meaning on
  `produce` and beside the sentence on `context`, and every word still has a
  speaker button in its introduction, in Word Detail and beside its example.
  What no longer exists is the question whose entire prompt was the recording —
  see §16.5.

## 16.5 Listening questions removed — **this cycle**

The product no longer tests vocabulary by ear. This is a deliberate removal, not
a defect and not a regression, and it is written up here in full because the
previous report described listening questions as an active feature and a reader
comparing the two needs to know which claim is current.

**What was removed**

| Where | Before | Now |
| --- | --- | --- |
| Today's Vocabulary, extra learning | `listen` and `listenMeaning` in the step plan for new, review, familiar and weak words | neither step exists in `WordStep` |
| The exercise builder | `wordExercise` had a `listen` and a `listenMeaning` arm | both arms return `null`, the way `write` already did for words |
| Review scheduling | `listening_recognition` was one of four `WORD_SKILLS` | three word skills; the name is retained in `Skill` for stored data only |
| Saved Words, Wrong Answer retry | reused the same generator, so both could produce one | both reuse the same generator, which can no longer produce one |
| My Learning | a *Skip listening questions* / *듣기 문제 건너뛰기* toggle | removed, in all 32 languages |
| Localisation | `review.prompt.listen`, `review.prompt.listenMeaning`, `settings.soundFree.*` | deleted from all 32 bundles |

Five routes, one mechanism: a word cannot be *built* into a listening exercise,
so no screen, plan, saved-word flow or wrong-answer retry can reach one. This is
the same discipline handwriting removal used and it is the reason the claim can
be made about the whole application rather than about the screens that were
checked.

**What was deliberately kept**

Pronunciation audio is untouched, and that distinction is the entire point of
the change. Word Detail plays the word. The `intro` card plays the word. Example
sentences play. Hangul lessons play. `meaning`, `produce` and `context` all
still carry the clip beside the question. Removing the *quiz format where
listening is the question* is not the same act as removing audio, and a reader
of this report should not come away thinking the product went quiet.

The Hangul side is also untouched: `sound_recognition` — a clip and four letters
— and `distinguish` — a clip and two — are letter exercises, the alphabet
curriculum owns them, and they were out of scope. The Review screen's **Listen**
mode therefore still exists and now offers letters only.

**Stored data**

Nothing was migrated and nothing was deleted from any device.
`listening_recognition` stays in the `Skill` union, so a profile carrying years
of listening history still parses, still round-trips and still passes schema
validation; it is simply never selected, because `candidates()` iterates
`skillsFor(kind)` and the name is no longer in the word list. A stored
`sound_free: true` likewise keeps working — it still governs the letter
exercises that really are heard-only, exactly as before. There is no migration
step, so there is no migration to fail: a learner who updates sees their next
session built from the remaining question types with their history intact.

**Rebalancing**

Removing two of six steps would have made sessions repetitive if the remaining
steps had been left as they were, so the per-tier plans were re-cut:

| Tier | Before | Now |
| --- | --- | --- |
| new | `intro` → one of `meaning`, `listen`, `listenMeaning`, `context` | `intro` → `meaning` or `context`, alternating |
| review | `meaning` → `listen` | `meaning` → `produce` or `context`, alternating |
| familiar | `produce` \| `build` → `listenMeaning` → `context` | `produce` \| `build` → `context` |
| weak | `listen` → `meaning` → `context` | `meaning` → `context` → `produce` |

Nothing new was invented for this; every step in the right-hand column already
existed and already worked. `produce` moved into the `review` and `weak` tiers
because those are words the learner has met, which is the condition the product
has always attached to asking for production.

**The honest cost.** A beginner's very first sitting is ten new words, and its
check now alternates between two layouts rather than four. That is a real
narrowing of the thing §16 of the brief was about, and it was not papered over
by promoting `produce` into the new-word rotation — asking a learner to recall a
word they met thirty seconds ago would be a harder session, not a more varied
one. The variety returns within days, as words reach `review` and `familiar` and
bring their own steps with them. It is listed in §33 so it is not lost.

## 16.6 Weaknesses that remain

* **Still four options on a card, most of the time.** Three layouts is more than
  one and is not the same thing as a genuinely different interaction. Matching
  and limited keyboard recall are the two that would change the rhythm rather
  than its presentation, and neither is built.
* **Everything is still recognition.** Nothing asks the learner to produce
  Korean from memory — `produce` asks them to pick it out of four.
* **A session is still roughly 20 taps.** Fewer of them are identical now.

---

# 17. Hints and help

This is a new section. The system it describes did not exist last cycle; what
existed was one line of code repeated six times.

## 17.1 The defect — **VERIFIED, and it was the worst one in the product**

```ts
hint: copy.value,   // the word's meaning
```

On "what does 사과 mean?", with four meanings to choose between, pressing
*Hint* printed **apple**. Not a strong hint. The answer, in the option list, in
the learner's own language.

The same line was on the letter questions, where the hint was the romanisation
and the options *were* romanisations. Five of the nine question types handed
over their own answer:

| Question | Options were | Hint was |
| --- | --- | --- |
| word `read` | meanings | **the meaning** |
| letter `read` | romanisations | **the romanisation** |
| letter `distinguish` | letters labelled with romanisations | **the romanisation** |
| word `context` | Korean words | the target's meaning |
| word `listen` | Korean words | the meaning — collapsing it into a different question |

A question you are told the answer to has not been practised, it has been read.
Retrieval *is* the exercise, so this did not weaken the vocabulary system, it
switched it off for anyone who pressed the button — and the learner most likely
to press it is the one who most needed the retrieval.

## 17.2 The rule

```
A hint helps a learner reason toward the answer.
An answer tells them what it is.
The first press must never be the second.
```

## 17.3 The ladder — **VERIFIED**

One control that gets stronger, not four buttons. A learner who is stuck is the
last person to hand a menu to.

| Rung | Gives | Example |
| --- | --- | --- |
| `light` | what kind of thing it is | "It's a verb — something in Everyday Actions." |
| `strong` | narrows it | "It's used like this: 저는 공부를 해요." |
| `answer` | tells them, and says so on the button | "The answer is to do." |

What each question may say depends entirely on which direction it runs, which is
what the old code missed — the meaning is safe help when the learner is choosing
a *Korean word* and is the answer itself when they are choosing a meaning:

| Mode | Light | Strong | Reveal |
| --- | --- | --- | --- |
| `read` · `listenMeaning` | part of speech + category | the word in its own sentence | the meaning |
| `produce` | part of speech + category | first syllable — "사…" | the word |
| `listen` | play it again | first syllable | show the word (the §37 accessibility fallback) |
| `context` | part of speech only | first syllable | the word |
| letter `read` | consonant / vowel / doubled … | a word it starts | the sound |
| letter `listen` · `distinguish` | play it again | a word it starts | the letter |
| letter `write` | the sound — genuinely help here | — | watch the strokes again |

The strong rung for `read` is the word in a sentence, and that is the one worth
justifying. The light rung is weak on purpose *and weaker than it looks*: good
distractors share a category with the answer, so being told 하다 is a verb from
Everyday Actions rules out nothing when the options are *to go*, *to stay*, *to
do* and *to be late*. That is not a bug in the hint, it is what a plausible
distractor set costs — and it is why there is a second rung. Context is how a
person actually works out a word they half-know, and it cannot leak, because the
sentence is Korean and the answer is not.

Letter `write` is the one place the old hint was doing its job: the answer there
is a shape drawn on a canvas, and naming the sound does not give the strokes
away. It stays, as the light rung.

## 17.4 Scoring — **VERIFIED**

Asking for help is not getting it wrong, and a product that punishes the ask
teaches people not to ask. What changes is what the success is worth as
*evidence*:

| Rungs taken | Stability growth on a success | First-time stability |
| --- | --- | --- |
| 0 — unaided | ×2.2 | 1.0–1.5 days |
| 1 — light | ×1.7 | 0.5 days |
| 2 — narrowing | ×1.35 | 0.5 days |
| 3 — the answer was shown | ×1.0 — no growth | 0.25 days |

The zero-growth row is the honest one. A learner who was shown the answer and
then clicked it has demonstrated that they can click; treating that as recall
would let someone press through to the reveal on every question and be told they
had learned the day's words.

`hint_level` is stored alongside the old `hint_used` boolean rather than
replacing it, because every attempt written before the ladder existed has the
boolean and no level, and reading a missing level as 0 would silently re-score
that whole history as unaided recall.

## 17.5 How it is checked — **VERIFIED**

`features/review/hints.test.ts` renders every rung of every question type for a
spread across the corpus, **in all thirty-two languages**, and looks for the answer
inside the rendered sentence. 23 assertions.

It found two things immediately.

**One in the Korean copy.** The hint "…로 시작해요" contains 시작, which is itself
a taught word — so a Korean-interface learner asked about 시작 was handed it. The
copy was reworded to "첫 글자는 ‘시’예요".

**One that no amount of care in English could have predicted.** 배우다 is *học*
in Vietnamese, and its category is *Học tập & Công việc*. The category hint —
correct, natural, and safe in the other nine languages — printed the answer for
Vietnamese learners. The fix is general: `wordHints` now receives the localised
answer and drops the category from the hint when naming it would give it away,
falling back to the part of speech alone. Renaming the category would have been
fixing a correct translation to work around one word out of 2,581.

The matcher is shared between the product and the test rather than duplicated,
which matters more than it sounds: a second copy would be a second opinion about
what counts as giving the answer away, and the day they disagreed the test would
be certifying a rule the product does not follow. That is precisely the failure
mode that let the original defect ship with a green suite.

### Two more found this cycle, and why the second one moved the check

**The Korean template, again, on a different word.** `첫 글자는 ‘{{start}}’예요`
appends 예요 after the interpolated syllable, so for 아예 the rendered line is
첫 글자는 ‘아’예요 — and with punctuation stripped, that spells the answer. The
template now ends in an ellipsis like the other nine languages do.

It surfaced only because 적다's part-of-speech correction re-ordered the corpus
and dropped 아예 onto a sampled index. The sample was every thirty-seventh word;
a sample that finds a *template* defect only when a particular word falls into
it is a sample that reports luck, so it is now every seventh — the whole file
runs in about four seconds.

**The one a template fix cannot reach.** Tightening the sample found:

```
  이렇게, meaning in de   →  "so"
  review.hint.inSentence  →  "So wird es benutzt: 이렇게 써 보세요."
                              ▲▲
```

The German is a correct rendering of "Here's how it's used". The Korean sentence
is safe. The answer is a real gloss. The collision exists only once the three
are put together — and in Spanish and Portuguese too, because *así* and *assim*
open the same sentence. There is nothing to fix upstream short of picking
lead-ins that avoid every gloss in thirty-two languages, which is not a rule anybody
could keep.

So the check moved to where the string finally exists. `usableHints` renders
each rung with the component's own `t` and drops any that hands the answer over;
`ChoiceExercise` and `BuildExercise` both run it, so this is a runtime
guarantee and not only a test. The rung is simply gone and the ladder is
shorter, which is the right trade — a hint that gives the answer away is worse
than a missing hint, and the reveal rung is never dropped, so a learner can
always get out.

The test now audits the *filtered* ladder, and bounds how much the filter has to
remove: today it drops two rungs each in German, Spanish and Portuguese out of
1,845 questions per language, and strands nothing. A safety net doing heavy
lifting would mean the hints are badly written, and the bound is what would say
so.

## 17.6 What the unit test could not catch

The ladder was correct, safe in every language, and rendered on screen as:

> It's a **vocabulary:partOfSpeech.verb** — something in
> **vocabulary:categories.actions**.

The hints carry translation keys and the *pages* had not been given anything to
resolve them with. A unit test on `wordHints` sees key names and is happy,
because key names are what that function returns. Only a browser sees the
sentence — so `e2e/hints.spec.ts` now opens a session, presses the button, and
asserts that no translation key reaches the page.

Found by opening the app and looking at it, which is the argument of this whole
report in one screenshot.

---

# 18. Daily goals

## 18.1 Behaviour — **VERIFIED in the browser this cycle**

| Situation | Displayed | Verified |
| --- | --- | --- |
| Nothing done | `0/10` | yes |
| Five words | `5/10`, 50% | yes |
| Goal reached | `10/10`, 100%, completion card + **A little more** | yes |
| +5 chosen | still `10/10`, 100% — **not reset** | yes |
| Two extra done | `12/10`, **120%**, ring stays full | yes |
| After reload | `12/10`, 120% | yes |

## 18.2 Counting rules — **VERIFIED**

* **Unique words, not questions.** Ten means ten words.
* **A retry does not double count** — `completeWord` ignores a repeat.
* **Review does not inflate the learned total** — the daily plan and the mastery
  ladder are separate stores.
* **A new local day resets today's counters** and nothing else. Totals, saved
  words, the notebook, memory state and preferences all persist.

## 18.3 Two bugs fixed here this cycle — **VERIFIED**

1. **"Studied ten words, counter still 0/10 after reload."** The plan was built
   from the *placeholder* state on the first render, before the asynchronous read
   of the store had finished, and the resulting empty plan was written to
   storage — racing, and sometimes beating, the read still in flight. Fixed by
   gating plan derivation and persistence on hydration.
2. **"Tapped 더 학습하기 and the counter went back to 0/10."** Extending rebuilt
   the plan from scratch, emptying `completed`. It now appends.

---

# 19. Saved Words

**VERIFIED WORKING.**

| | |
| --- | --- |
| Where it is set | Meeting card during a session; Word Detail |
| Where it lives | `settings.saved_items`, an append-ordered list of memory keys |
| Where it is read | `/words/saved`, linked from `/words` and `/review` |
| List features | Search (Korean or meaning), three orderings (recent, A–Z, needs work), unsave in place |
| Review | A **Review** action that builds a plan from saved words only |

Ordering by "needs work" reads the memory model's stability for each saved word,
so the learner's own list can be sorted by the system's opinion of what they are
losing.

**Saved ≠ Review ≠ Mistake**, kept apart deliberately:

| | Whose decision | Means |
| --- | --- | --- |
| Saved word | the learner's | *I want to keep this* |
| Review | the system's | *this is fading* |
| Mistake | neither — a fact | *I answered this wrong* |

---

# 20. Wrong Answer Notebook

**VERIFIED WORKING.**

* **What creates an entry:** any wrong answer, in any session type.
* **Stored fields:** `id`, `kind`, `itemKey`, `mode`, `skill`, `chose`,
  `answer`, `firstAt`, `lastAt`, `wrongCount`, `correctSince`.
* **One row per item, not per attempt.** Missing 엄마 three times is one thing to
  fix, not three things to read. The row accumulates and shows the most recent
  question.
* **Ids, not text.** `chose` and `answer` store option ids, so the notebook does
  not go stale when the interface language changes.
* **Mistakes are meant to be finished with.** Two correct answers retire the row
  from the active list; the history is kept so the scheduler still knows the item
  was difficult.

## 20.1 Does it help, or is it just a log?

**It helps, narrowly.** The retry action and the recovery rule make it a task
list rather than a record. What it does *not* do is explain *why* the answer was
wrong — it shows what was chosen and what was right, and leaves the learner to
work out the difference. For a confusable pair (ㅈ/ㅊ) that is often enough; for a
meaning mix-up it is not.

**RECOMMENDED (post-release):** when the mistake was a meaning confusion, show
the two words side by side with their examples.

---

# 21. Review system

## 21.1 The principle — **VERIFIED implemented**

> Do not review everything the learner has ever seen. Review what they are about
> to forget.

`ReviewSummary.total` counts *items with something worth doing now*, not items
ever met. Items whose memory is holding are not counted. This is why the Review
screen does not grow without limit as the learner progresses.

## 21.2 The memory model — **VERIFIED**

Memory is tracked **per item and per skill**, not per item. A learner can read 가
and not recognise it by ear, and the model says so.

| Kind | Skills tracked |
| --- | --- |
| Letter / syllable | read, listen, write, (distinguish) |
| Word | meaning recognition, reading recognition, sentence comprehension |

Listening was a word skill and is not one as of this cycle — see §16.5. The
skill *name* is still a valid `Skill` so that stored rows parse, and it is
simply never scheduled. The letter row is unchanged: hearing a letter is still a
Hangul exercise and the alphabet curriculum was out of scope for that change.

Each pair carries a stability in days and a last-seen date; recall decays from
those. Signals that move it: correct/incorrect, how many times the item has
lapsed, and *which* wrong option was chosen — which feeds a confusion pair so the
learner can later be shown the two side by side.

## 21.3 Session construction — **VERIFIED**

The scheduler deliberately does *not* always pick the weakest item, because that
produces `ㄹ ㄹ ㄹ ㄹ ㄹ` and is the last session that learner ever does. It
interleaves across items and skills, caps how much of a session one item may
take, and prefers a skill not asked recently.

Seven exercise modes: `read`, `produce`, `listen`, `listenMeaning`, `write`,
`distinguish`, `context`. `write` is letters-only — no word has a writing skill,
so the scheduler cannot generate one.

## 21.4 Is it better than a fixed queue? — **VERIFIED, measured**

`npm run review:benchmark` simulates seven learner profiles against a
non-adaptive baseline. Result: **adaptive retains more in total for 7 of 7
profiles.** The benchmark reports coverage, retained recall, late repeats, final
interval and chronic items.

## 21.5 The "says N, opens empty" bug — **VERIFIED FIXED**

**Previously:** the Review screen printed a count derived from a *candidate
pool*; the session then filtered that pool through the question generator and
could arrive at zero. Start led to a dead end.

**Now:** `practicePlan()` resolves a `PracticePlan` — `{ id, items, count, modes,
source, emptyReason }` — in which every item is already known to be answerable.
The screen prints `plan.count`, which is `plan.items.length`, and the session
iterates the same object. A mode whose plan is empty renders disabled. **The
displayed count and the session length are the same number by construction, not
by agreement.**

`emptyReason` distinguishes four cases the learner can act on: `nothing-due`,
`mode-empty`, `none-saved`, `no-mistakes`.

## 21.6 Sentences are not SRS items — **VERIFIED**

Memory keys are `${kind}:${itemKey}` with kind ∈ {`character`, `word`}. There is
no sentence key and no code path that could create one. Example sentences appear
only as the `context` exercise — the sentence with a gap where the word goes.

---

# 22. Audio and pronunciation

## 22.1 Audio — **VERIFIED WORKING**

| | |
| --- | --- |
| Clips | 10,454 distinct files — 5,275 entries × two voices |
| Voices | Azure Neural TTS, one female and one male Korean voice |
| Generated | at build time, not at runtime |
| Spoken | letter names, letter sounds, syllables, every word, every example sentence |
| Delivery | cached by the service worker **on play**, not precached |
| Rate | slower than native pace, deliberately |

Audio is generated at build time because a runtime TTS call would need a network,
a key and a per-play cost, and would make the app's core promise — works offline,
costs nothing to run — untrue.

**The audio cache is versioned by the audio build's own date stamp**
(`20260818-31822f90`), so a corrected recording replaces the old one. This exists
because a fixed clip would otherwise never reach a learner whose app had already
played the wrong one.

## 22.2 Autoplay — **VERIFIED WORKING**

`useEntryAudio` plays once per arrival, guarded by a ref rather than an effect
dependency, so a re-render cannot make it speak twice; leaving stops it. This is
also the mechanism that revealed the mastery bug in §10.2: on the web an
autoplayed clip may simply never play, so nothing downstream may depend on it.

## 22.3 Pronunciation notation — **REPLACED this cycle, and it was a data migration**

**The customer-facing notation is now Revised Romanization (국어의 로마자 표기법),
not IPA.** Every word: 2,581 of 2,581.

The distinction that matters is what it is derived *from*. A romanization taken
off the spelling gives 국민 → *gukmin* and 자리 → *chari*, both wrong. These are
taken off the **standard pronunciation** — 국민 → **gungmin**, 자리 → **jari** —
which means the same sound-change machinery that drives the audio drives the
notation, and the two can no longer disagree with each other.

This is stated as a migration rather than a rename because the tempting version
of this change is to rename the `ipa` field to `romanization` and leave IPA
strings in it. The field was regenerated from `revised_romanization(word,
spoken_form)` in `scripts/content/hangul.py`, and `wordRomanization.test.tsx`
matches the *rendered* string against an IPA character class so that
[t͡ɕa̠ɾi] cannot return under a Latin-sounding label.

* No brackets. IPA is conventionally bracketed and a romanization is not; the
  brackets were what made the old value read as a phonetic transcription.
* `lang="ko-Latn"` on the run, so a screen reader does not read *jari* with
  Korean phonology.
* The label is localised in all thirty-two languages and in none of them says
  "phonetic alphabet". Where a language has a settled word for romanised Korean
  it uses it; where it does not, it says "in Latin letters".
* **503 words carry a sound-change note** naming which of six patterns applies
  (tensing, aspiration, nasal, lateral, palatal, liaison), so the app explains
  the *pattern* rather than the instance.
* `/letters/sounds` teaches those six patterns as a screen of its own.

`romanization:qa:check` runs five layers, A–E: the source rules, 41 rule-family
fixtures plus **all 2,581 words re-derived through the Python and compared
byte-for-byte with what ships**, id and pack alignment, agreement with the audio,
and a grep of the source for the retired label. 자리 → *jari* is a permanent
fixture, and the 마디 recording fixture below is untouched by any of it.

`audio:pronunciation:check` reports **0 errors, 0 warnings** over 2,612 items. It
notes 52 compounds where §30 of the standard would insert an ㄴ if the second
half were a word on its own; they are read as ordinary liaison, correct for the
Sino-Korean ones.

## 22.4 The 마디 defect — **VERIFIED FIXED**, and what its screen says now

The male voice read **마디** as [마지], and this report carried it as an open P3
for two cycles. It is fixed: the clip was regenerated, the manifest agrees with
the file on disk, 마디 is a permanent entry in the pronunciation fixture set, and
`scripts/qa-native-android.mjs` checks on-device that the byte length served
matches the manifest — so a cached older recording cannot quietly survive an
update.

Three layers ran this cycle, and they answer different questions:

| Layer | Question | Result |
| --- | --- | --- |
| A. Asset integrity | Is this a real, well-formed recording? | 10,550 slots, 48.9 MB, **0 errors, 0 warnings** |
| B. Utterance mapping | Right item, right text, matching note? | 2,612 items, **0 errors, 0 warnings** |
| C. Linguistic pronunciation | Does it sound like correct Korean? | screen only — see below |

**Layer C reported one disagreement and it is not being called a defect.** The
recogniser transcribes both 낳다 clips as 낫다. The fixture comment used to claim
both voices had been confirmed correct; neither claim survives contact with the
same clips at a different decoder setting:

```
  낳다 [male]    → '낫타'      ← aspirated, so the ㅌ *is* in the recording
  낳다 [female]  → '락타'      ← not a Korean word
  마디 [female]  → '바티'      ← a clip nobody has ever disputed
```

An engine that writes 바티 for the female 마디 is not in a position to convict
the female 낳다. So the fixture stays — it is the right thing to keep watching —
and the comment now records the instability instead of a confidence nothing
supports. **What would settle it is a person listening, which is exactly what
layer C is documented as not being.** No claim is made here in either direction.

**Severity: 마디 closed. 낳다 unknown, and stated as unknown.**

---

# 23. Localization

## 23.1 Languages — **VERIFIED**

**Thirty-two.** English, 한국어, 日本語, 简体中文, Español, Français, Deutsch,
Português (BR), Tiếng Việt, ไทย — and, added this cycle — **العربية, বাংলা,
Čeština, Ελληνικά, Filipino, हिन्दी, Magyar, Bahasa Indonesia, Italiano,
Қазақ тілі, Кыргызча, Монгол хэл, Nederlands, Polski, Română, Русский, Svenska,
தமிழ், తెలుగు, Türkçe, Українська, O‘zbekcha**.

None of the twenty-two needed a code change to appear. Locales are discovered
from the filesystem, the curated descriptor table already carried their endonyms
and their direction, and dropping `src/locales/<code>/*.json` into place is the
whole registration. Device detection picks each of them up through the same
region → language → English negotiation as every other locale.

Two things did change, and both were forced by the size of the set rather than
by any one language:

* **The picker got a search box**, at the top, matching endonym, English name
  and common aliases with accents folded away — `mandarin` finds 简体中文,
  `espanol` finds Español. Thirty-two rows is past the length anybody scans.
* **SVG flags** from `apps/common_assets/flags` replaced emoji, which rendered
  as country codes on most Android builds and not at all on some.

## 23.2 Coverage — **VERIFIED**

Three claims of different sizes, kept apart. The full per-language table is in
`docs/LOCALIZATION_NATIVE_REVIEW.md`; this is the shape of it.

| Layer | Languages complete | What it covers |
| --- | --- | --- |
| Interface | **32 / 32** | every screen, button, label, empty state, error, accessibility string |
| Alphabet course | **32 / 32** | 15 lesson titles, 12 unit introductions, 73 letters' hints and mnemonics, 12 quotations, 6 typeface descriptions |
| Vocabulary | 10 / 32 | 2,581 meanings, parts of speech, example translations |

The key count per language is not the same number, and should not be: Arabic
carries six plural forms of a counted noun, Russian and Polish four, Korean and
Japanese one. The bundles hold whichever the language actually has, taken from
`Intl.PluralRules`, and `i18n:check` fails a locale that is missing a category
it needs — or that carries one it does not.

## 23.3 The twenty-two without word meanings — a stated gap, not a claim

2,581 words × 22 languages is roughly **57,000 lines** of meaning, part of speech
and example translation. They were not written, and this is the reasoning rather
than an apology:

* Writing them without a speaker of each language produces exactly the
  machine-translation register that `LOCALIZATION_NATIVE_REVIEW.md` exists to
  refuse, at a scale where nobody could audit it afterwards.
* Shipping them would convert an honest, visible English fallback into 57,000
  sentences that *look* authored. That is a worse product, not a bigger one.

So the fallback stands, and it is said out loud in three places rather than
discovered: **on the row in the language picker before the learner chooses it**
("Word meanings in English"), at the foot of the picker, and in the markup —
`LocalizedText` stamps every fallen-back run with the `lang` and `dir` it is
actually in, so the bidi algorithm and the screen reader both get the truth.

`WORD_COPY_LOCALES` is derived from the emitted packs and tied to them by a
test, because the first version of that caption was **wrong in the other
direction**: the generated `locales` list named only the eight languages the
corpus entries carry, so the picker told Vietnamese and Thai learners their word
meanings were in English while shipping 2,581 of each. A false warning is worse
than no warning.

## 23.4 The gap a 100% coverage report could not see — again, and wider

Last cycle this section reported that **lesson titles existed only in English and
Korean** while `i18n:check` said 100%, because lesson titles live in
`data/characters.ts` with the curriculum and not in the translation bundles.

This cycle the same shape of defect turned up in four more places, and all four
were found by *rendering screens*, not by any check:

1. **Practice typeface names and descriptions** — six faces, English and Korean
   only, sitting under a fully translated My Learning screen in the other
   thirty.
2. **Quotations** — twelve, in ten languages. `renderQuote` throws rather than
   falling back, and it is mounted inside Home, so the twenty-two new languages
   took **the entire React tree down**: the Arabic home screen was a white page
   with no message.
3. **The bottom navigation, stuck in English.** The strings for a stored
   language arrive after the first paint. Everything that re-renders for any
   other reason picks them up — `t` reads the store when it is called — and the
   tab bar, which has no state, no context and no changing props, never
   re-renders. It kept the English it resolved on frame one, under a fully
   Arabic home screen.
4. **Unit and lesson headings disagreeing.** A unit heading and the lesson card
   beneath it use one phrase in English — *The e vowels*, *A letter at the foot*
   — and in **twenty-eight of the thirty-two languages** they had drifted into
   two different phrasings, three centimetres apart on the Letters screen.
   English had none, so nobody reading the app in English could see it.

Every one now has a test that reads `AVAILABLE_LOCALES` rather than a
hand-written list of languages, which is the actual lesson: the list was the bug
each time, not the translation.

## 23.5 Language UX — **VERIFIED WORKING**

* **Detected from the device** on first launch, walking region → language →
  English (pt-BR → pt → en; vi-VN → vi; th-TH → th).
* **First row of settings**, above every other option, because a learner who
  cannot read the interface must be able to find the way out of it.
* **The row leads with the selected language's flag** — an SVG from
  `apps/common_assets/flags`, not an emoji — where it used to lead with a
  generic globe. The globe said *this row is about languages*, which a learner
  looking at a row labelled Language mostly knew; the flag says *which language
  is on*, which is the fact the one person who most needs this row cannot get
  from anything else on the screen when the label is in a script they do not
  read. It comes from `flagFor`, the same mapping the picker uses, so the mark
  on this row and the mark on the row they tapped are the same image and cannot
  drift apart. Every one of the 32 shipped locales has one, and a test over
  `AVAILABLE_LOCALES` fails the build if that stops being true — the globe
  survives only as the fallback for a tag that can be stored but is never
  offered, where a wrong flag would be worse than no flag. Checked by eye in
  light and dark at 390 × 844 for Korean, English, Simplified Chinese,
  Japanese, Vietnamese, Thai and Arabic, including that the row mirrors for
  Arabic and the flag inside it does not.
* **Native names first** — 日本語, தமிழ், Кыргызча — with the English name
  beneath and a search box above.
* **Search matches three ways**: endonym, English name, and alias. Diacritics
  and apostrophes fold, so `espanol` and `o'zbekcha` both work.
* **Switches immediately**, no reload, no Save button.
* **Korean never mirrors** in RTL layouts; previews pin `dir="ltr"`.
* **A learner is told what they are choosing**: rows without a vocabulary pack
  say so before the tap, not after it.

## 23.6 Script and direction — **VERIFIED by looking**

Read screen by screen at 390 × 844 in a real browser — home, letters, words, a
word card, review, my learning — not asserted by a test.

**Arabic, and right-to-left as behaviour rather than as strings.** `dir="rtl"`
is set on the document element from the resolved locale, so the layout mirrors:
the tab bar reverses, chevrons point the way forward *for the reader*, cards
align right, progress fills from the right. Numerals and the Korean being taught
stay left-to-right inside it, isolated with `<bdi>` and an explicit `dir="ltr"`,
because a syllable block read right-to-left is a different syllable.

**Thai.** Diacritics stack above and below the line at every size the interface
uses, including the tab bar. Thai is written without spaces between words and
nothing in the layout assumes otherwise — normal flow and `text-wrap: pretty`,
never a per-word break.

**Devanagari, Bengali, Tamil, Telugu.** Conjuncts and the multi-part vowel signs
compose correctly and clear the line box; nothing clips in a card, a badge or the
tab bar.

**Greek and the Cyrillic five.** Every letter renders, including the Kazakh and
Kyrgyz letters outside the Russian alphabet (ә, ғ, қ, ң, ө, ұ, ү, һ, і). Russian,
Ukrainian, Polish and Czech are also the longest of the thirty-two and nothing
truncates at 390 px.

This section deliberately claims no typeface. The interface asks for Pretendard
and then the platform stack, and which of the two draws a given script is the
platform's decision — a phone, a desktop browser and a CI container each answer
differently. What was checked is what a learner can see: every mark composes,
nothing renders as a box, nothing clips.

The letter copy is written from each reader's own sound system rather than
translated, which for several languages is a real gain and not a formality: ㅓ is
simply *ơ* in Vietnamese and ㅡ is *ư*; Russian and Kazakh have ы for ㅡ; Turkish
has ı; Thai has อือ — where the English has to reach for "the o in song" and
"lips flat and wide, no English equivalent".

## 23.7 Naturalness, as distinct from coverage

**PARTIALLY VERIFIED, and the honest answer is in a file of its own.**
`copy:audit:check` passes over **17,832 strings in thirty-two languages** with 0
errors, and `i18n:check` reports 100% for all thirty-two — but both check
structure. Neither can tell whether a sentence reads well to someone who grew up
speaking the language.

**No locale has been reviewed by a native speaker.** Not one of the thirty-two,
including the two the product is about. `docs/LOCALIZATION_NATIVE_REVIEW.md`
records that per language, separates automated status from human status, and
lists what a review would have to cover in priority order. Nothing in this
product is marked native-reviewed, and nothing should be until somebody has read
it.

That document also records eleven vocabulary entries whose English gloss
contradicts its own example sentence — 열 glossed "fever" beside "please count to
ten", 찍다 glossed "to take a photo" beside "I stamped it with a seal" — found by
translating them, which forces a reading of every gloss against its example.
Those are English-side defects that propagate into every language. See §14.

One check was loosened this cycle and it is worth recording why. The copy audit
forbids the string `TOPIK`, because this product does not teach to that exam. It
matched case-insensitively, and *topik* is the ordinary Indonesian and Malay word
for "topic" — so "Telusuri per topik", the Indonesian for "Browse by topic", was
reported as a claim about a proficiency exam. The rule is now case-sensitive,
which is correct rather than lenient: TOPIK is an acronym and is written in
capitals in every language that names it. A rule that cries wolf on a category
heading is a rule somebody eventually switches off.

---

# 24. Persistence

The most important system in a product with no account, and the source of the
most damaging recent bug.

## 24.1 Architecture — **VERIFIED**

```
   learning action (a tap)
        ↓
   LearnerProvider callback — the only writer
        ↓  updates memory immediately (the UI moves this frame)
        ↓  void repo.save(...)  — fire and forget
   Repository (settings | progress | sessions | attempts | activity | memory | mistakes)
        ↓
   PersistenceDriver ── IndexedDB (web) │ SQLite (native) │ Memory (fallback)
```

Eight object stores. Small preferences that must be known before the first paint
— the locale — use `localStorage`, deliberately.

## 24.2 Startup order — **VERIFIED, and this is where the bug was**

```
   open driver (retried once)
        → run schema migrations
        → read all eight stores in parallel  ─┬─ and probe write/read/erase
        → setState(everything)                │
        → ready = true                        │
        → ONLY NOW may anything derive or persist a daily plan
```

The `ready` gate is the fix for the reported data loss. Before it, the daily plan
was derived from the *placeholder* state on the first render — default settings,
no plan, no progress, because hydration had not finished — and an effect
persisted that empty plan, racing the read still in flight. When the write won,
ten minutes of work was overwritten before the learner touched anything. It never
reproduced in a quick click-through, because which promise settled first decided
whether it happened at all.

## 24.3 What survives — **VERIFIED by end-to-end test**

A profile touching every store — both daily goals, appearance, interface
language, a saved word, three learned letters, three finished words, a notebook
entry — was built through the interface and reloaded three ways:

| | Result |
| --- | --- |
| Plain refresh | everything intact |
| Refresh from `/words/word/…`, `/review`, `/me/activity`, `/letters` | everything intact, no 404 |
| Fresh tab over the same profile | everything intact |

**Status: WORKING.** Six e2e cases hold it.

## 24.4 Defensive behaviour — **VERIFIED**

* **A corrupt row is skipped, not fatal.** `progressRepo.loadAll()` returns
  `{ rows, dropped }`, and the dropped count is surfaced in settings.
* **A failed hydration does not wipe anything.** It leaves the learner with a
  working session and re-asks the storage question rather than declaring storage
  broken.
* **Migrations run forward only**, and the legacy `localStorage` blob import is
  guarded so a browser refusing `localStorage` cannot throw the launch.
* **`onversionchange` reopens.** Another tab upgrading the database used to leave
  this one holding a dead handle, silently swallowing every later write.

## 24.5 Persistent storage is now requested — **VERIFIED**

Last cycle's recommendation is implemented. `navigator.storage.persist()` is
called once, **after the learner's first finished lesson**, which is the first
moment the request has a reason and the moment a person is most likely to grant
it — they have just invested in the thing being kept.

Not at startup, deliberately. `persist()` is a permission request: Firefox puts
a prompt in front of the learner and Chromium decides silently on how engaged
the site looks. Both go badly on a first paint, where there is nothing stored
and nothing to be engaged about.

**A refusal changes nothing and is never mentioned.** Storage without the
persistent flag is still storage; it is merely evictable under disk pressure,
which for a few hundred kilobytes on a daily-use device is close to theoretical.
The only storage message a learner can ever see is the one that follows a real,
measured write-then-read failure — see §25.

## 24.6 The remaining risk — honest statement

There is still exactly one copy of the learner's history and **no export in the
web build**. A learner who clears site data loses everything with no recovery,
and requesting persistence does not change that — it reduces the chance of
*eviction*, not of deletion.

No raw JSON export was added, deliberately: the technical backup screen was
removed in an earlier cycle for being a developer feature wearing a customer
label, and reintroducing it would undo that. A real backup feature is a designed
thing — an account, or a file the learner recognises — and neither is in scope
for a product with no login.

---

# 25. The storage warning

**VERIFIED WORKING.**

**Previously:** ordinary desktop browsers were shown a red panel saying learning
data was not being saved.

**Now:** the warning is driven by one thing — a real write/read/verify/erase
round trip through the app's own persistence layer, on the driver actually in
use.

* `navigator.storage.persisted() === false` **cannot** produce the warning. It is
  the default for nearly every origin and says only that the browser may evict
  under pressure. An e2e test forces it false and asserts silence.
* **No private-mode detection exists anywhere**, and a unit test asserts on the
  source that none has crept back in (`/incognito|private|estimate|quota/`).
* A hydration failure no longer implies a storage failure.
* Three states, not two: *not yet known*, *known good*, *known bad*. Only the
  third may say anything.

An e2e case removes IndexedDB entirely and confirms the warning **does** appear
then, so the fix did not simply delete the feature.

---

# 26. Routing and deployment

## 26.1 Configuration — **VERIFIED**

| | |
| --- | --- |
| Build output | `apps/web/dist`, a static bundle |
| Router | `BrowserRouter`, clean URLs |
| Vercel | `vercel.json` rewrites everything except `/api/*` and `/assets/*` to `/index.html` |
| Netlify-style hosts | `public/_redirects`, shipped inside the build |
| Service worker | network-first for the app, cache-first for audio |

## 26.2 Refresh and deep links — **VERIFIED WORKING**

`npm run routing:check` serves the **built** `dist` the way a static host would,
applying the repository's own rewrite rules:

```
ok  17 application routes survive a direct request
ok  6 static files are served as themselves
ok  /api/* and missing bundles are left alone
ok  the worker treats a failed navigation as a miss, not as the shell
```

That last line is a code-level fix from this cycle worth recording. `fetch`
*resolves* on a 404 — it only rejects when the request never completes — so the
service worker took a host's 404 page as a valid navigation response and wrote it
into the cache **as the app shell**. From then on every navigation served the
error page, offline included, and repairing the hosting rule would not have
cleared it. Non-OK navigations are now treated as a miss.

## 26.3 Consequence

The app now survives a host with *no* SPA fallback at all: the first request
404s, the worker falls back to the cached shell, and the learner lands on the
route they asked for.

---

# 27. Design system and dark mode

## 27.1 Tokens — **VERIFIED**

Generated from `packages/design-tokens/src/index.ts` into `tokens.css`;
`tokens:check` fails the build if they drift. Three layers: a raw ramp
(`--hg-orange-*`, `--hg-gray-*`, `--hg-warm-*`), semantic roles
(`--hg-surface`, `--hg-text-secondary`, `--hg-border-selected`), and per-theme
overrides.

Themes: **system / light / dark**, applied as `data-theme` on `<html>`, with
"system" removing the attribute so `prefers-color-scheme` decides.

## 27.2 The dark-mode contrast bug — **VERIFIED FIXED**

**Previously:** hovering a typeface card in dark mode painted it near-white
(`#FFF8F1`) while the text stayed near-white (`#F6F0EA`). The card's entire
contents vanished under the mouse.

**Root cause:** hover states reached into the *raw palette ramp* instead of a
semantic token. A ramp value is one colour in both appearances — correctly,
because a palette that flipped with the theme would be unusable — so every hover
using one was light in dark mode.

**Fix:** two semantic tokens, `--hg-surface-hover` (#FFF8F1 light / #2C241E
dark) and `--hg-primary-subtle-hover` (#FFEAB1 / #4A2E19), applied to every hover
the audit found: typeface cards, language rows, locale options, chips, secondary
buttons, the streak pill, the modal close.

Two further findings from the same sweep:

* **The page ground had the same mistake.** `.shell`, `.warm` and `body` painted
  from the ramp, so dark mode had a near-white surround around a dark app on
  desktop. Now `--hg-bg-warm`, byte-identical in light mode.
* **Hover is now inside `@media (hover: hover)`.** A touch browser applies
  `:hover` on tap and leaves it applied, which is how a card gets stuck in a
  state the finger has already left.

![The typeface picker in dark mode with the second card hovered.](report-assets/audit-dark-hover.png)

*Figure 8 — Dark mode, hovering "Myeongjo". Name, Korean label, description and
licence line all remain readable, and selection still reads stronger than hover.*

**States checked this cycle:** normal, hover, selected, selected + hover, and
keyboard focus — the last with a visible orange ring, which was not removed.

---

# 28. Typefaces

**VERIFIED.** Six practice faces, all open-licensed, all visually distinct:

| Shown as | Family | Licence | Character |
| --- | --- | --- | --- |
| Standard 기본체 | Pretendard | OFL 1.1 | even, modern; the default, and the face the strokes are cut from |
| Sans Serif 고딕체 | Nanum Gothic | OFL 1.1 | wider, softer, no stroke decoration |
| Myeongjo 명조체 | Nanum Myeongjo | OFL 1.1 | serif; strokes start thick, finish thin |
| Traditional 바탕체 | Gowun Batang | OFL 1.1 | brush tradition; the hardest to trace |
| Handwriting 손글씨체 | Gaegu | OFL 1.1 | a pencil hand, upright and unhurried |
| Rounded 둥근체 | Gowun Dodum | OFL 1.1 | soft, no sharp corners; the gentlest to trace |

The choice is meaningful rather than cosmetic: the reference mask the evaluator
grades against is rendered from the chosen face, and §12.2 shows the false-reject
rate differs by face (0.28% for Nanum Gothic, 1.38% for Nanum Myeongjo). Each
card previews 가나다 / 한글 in its own face.

---

# 29. Mobile UX, accessibility, performance, offline

## 29.1 Mobile — **VERIFIED WORKING**

* **Safe areas** are covered by a dedicated `safe-area.spec.ts` suite that
  emulates Android three-button navigation and gesture bars and asserts every
  bottom control clears the system bar, including while focused.
* **Primary actions are pinned** in a footer that is part of the layout grid and
  are the last tab stop — checked by test.
* **Touch targets** are 44 px minimum on the controls audited this cycle.
* **The lesson fits one phone screen** with no scroll after this cycle's
  simplification.

## 29.2 Accessibility — **PARTIALLY VERIFIED**

| Item | Status |
| --- | --- |
| Focus ring, visible in both themes | **VERIFIED** — `:focus-visible`, 2 px, brand orange |
| Keyboard reachability | **VERIFIED** — an e2e case tabs the whole app |
| Semantic buttons, `aria-pressed` on toggles | **VERIFIED** |
| Skip link | **VERIFIED** — first tab stop on every screen |
| Korean marked `lang="ko"` | **VERIFIED** |
| Audio-only questions, vocabulary | **RESOLVED** — there are none; §16.5 |
| Audio-only questions, letters | **UX-PROBLEMATIC** — `sound_recognition` and `distinguish` are still heard-only, and the toggle that used to skip them went with the vocabulary ones. I-21 |
| Colour-only state | **VERIFIED OK** — selection carries a border *and* a check mark |
| Text scaling | **NEEDS VERIFICATION** — one e2e case covers enlarged system text on the session footer; the rest is unchecked |
| Screen-reader walkthrough | **NOT DONE** |

## 29.3 Performance — **VERIFIED**

`bundle:budget:check` — every budget met:

| | Now | Budget |
| --- | --- | --- |
| First load | 439.2 kB gz, 6 chunks | 460 kB |
| Largest locale pack | 38.2 kB gz | 44 kB |
| Largest route chunk | 4.7 kB gz | 24 kB |
| Stroke assets | 22.1 kB gz | 32 kB |
| **Word corpus** | **169.1 kB gz** | 220 kB |
| Everything precached | 854.0 kB gz, 73 files | 900 kB |
| *Forecast at 10,000 words* | *655.3 kB gz* | *220 kB — **298%*** |

The precache budget was raised twice this release for the same two languages —
800 → 840 kB when Vietnamese and Thai arrived at 500 words each, and 840 → 900 kB
when their copy was finished to all 2,581. **Two raises in one release is the
finding, not the kilobytes.** The service worker precaches every locale's word
copy so that a learner who installs and goes offline before opening a word
screen still has their own language; that is right, and it does not scale — the
total grows by a locale pack per language and by the whole corpus per word. The
architecture that fixes it is the same one §13.4 is about.

The word corpus is in the **first load**, not a lazy chunk. At today's size that
is affordable; at the target size it is not (§13.4).

Search is a linear scan over the corpus, deferred with `useDeferredValue` so
typing stays responsive. **INFERRED**: at 10,000 words this remains a fraction of
a frame, but it has not been measured at that size.

## 29.4 Offline — **VERIFIED**

Tested by loading the app, visiting a lesson and a word, then cutting the
network:

| Route | Offline |
| --- | --- |
| `/` | renders |
| `/letters/lesson-vowels-core` | renders |
| `/words/word/word_eomma` | renders |
| `/review` | renders |
| `/me` | renders |

Caches after that visit: app shell 2 entries, content 79 entries, audio 1 entry.

**Precisely what that means:** the interface, the curriculum, the corpus and the
learner's history are fully offline. **Audio is not** — clips are cached as they
are played, so a lesson never opened online will be silent offline. The 47 MB
audio set is deliberately not precached: downloading it before the learner has
met a single letter would be a hostile way to introduce a product.

The Android build has no such caveat — every asset is inside the app bundle.

---

# 30. Competitive benchmark

## 30.1 A necessary caveat

**EXTERNAL — and only partly verifiable.** What follows compares **product
categories and well-established characteristics**, not a feature-by-feature
audit of current competitor releases. **No competitor feature has been
invented**, and every claim that could not be checked from here carries a ¹.

Network access is available this cycle and was used, which produced one useful
correction and one warning. The correction is in §30.3. The warning is that
`drops.com` is an Italian umbrella manufacturer — the language app is
`languagedrops.com` — and a benchmark assembled by fetching plausible domains
would have described the wrong company with a straight face. Every fetch below
was confirmed to be the right product before anything was read from it.

What still cannot be checked from here is the part that matters most: the first
five minutes of each app. Those are behind an account, a mobile install, or
both, and no amount of page-fetching substitutes for using them. A reviewer with
the apps installed should re-verify before using this for positioning.

## 30.2 Comparison

| Dimension | Hangyul ganada | Duolingo | Drops | Memrise | LingoDeer | Quizlet | 말해보카 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| First launch | straight into Unit 1, no account | account/goal funnel¹ | account¹ | account¹ | account¹ | account¹ | account¹ |
| Zero-beginner Hangul | **core purpose** | brief alphabet section¹ | minimal¹ | some¹ | dedicated section¹ | user-made sets | not the focus¹ |
| Handwriting | **yes, graded** | no¹ | no¹ | no¹ | no¹ | no | no¹ |
| Stroke order taught | **yes, animated per stroke** | no¹ | no¹ | no¹ | limited¹ | no | no¹ |
| Session length | 5–10 min | 5 min¹ | 5 min¹ | ~10 min¹ | ~10 min¹ | variable | ~10 min¹ |
| Spaced repetition | per-item **per-skill** memory model | proprietary¹ | yes¹ | yes¹ | yes¹ | basic | yes¹ |
| Mistake notebook | **yes, with recovery** | limited¹ | no¹ | yes¹ | yes¹ | no | yes¹ |
| Saved words | yes, with its own review | no¹ | no¹ | yes¹ | yes¹ | yes | yes¹ |
| Dictionary depth per word | romanization, audio, example, relations | shallow¹ | shallow¹ | medium¹ | medium¹ | user-defined | deep¹ |
| Audio | 10,454 pre-generated clips, 2 voices | yes¹ | yes¹ | native speakers¹ | yes¹ | TTS | yes¹ |
| Offline | **UI + content fully; audio partial** | partial¹ | partial¹ | partial¹ | partial¹ | partial | partial¹ |
| Gamification | streak + calendar only | heavy¹ | medium¹ | medium¹ | light¹ | light | heavy¹ |
| Localisation | 32 languages | many¹ | many¹ | many¹ | 16, verified | many | Korean-first¹ |
| Ads / subscription | none — paid once | freemium + ads¹ | freemium¹ | freemium¹ | subscription¹ | freemium¹ | subscription¹ |
| Data leaves device | **never** | yes¹ | yes¹ | yes¹ | yes¹ | yes¹ | yes¹ |

¹ **EXTERNAL, not freshly verified this cycle.**

## 30.3 The question that matters

> **Why would someone use this instead of a free Hangul YouTube video, a free
> chart, or Duolingo?**

Answered honestly rather than as marketing:

**The defensible answer today is handwriting plus stroke order, graded.** A
YouTube video can show you how ㄹ is written; it cannot tell you that *your* ㄹ is
wrong, and a chart cannot either. Duolingo teaches Hangul reading and does not
ask you to write anything. This app watches you write, grades the shape against
the real typeface outline, and tells you which stroke you missed. That is a
genuine capability difference, and it is *measured* (0.21% false accept, 0.78%
false reject) rather than asserted.

**The second answer is that nothing leaves the device and there is no account.**
For a casual learner who does not want another login, that is real. Verified
this cycle from their own sites: Duolingo, Drops, Memrise, LingoDeer and Quizlet
all open on a sign-in or sign-up path.

## 30.3 One claim corrected by checking

The previous report implied the ten-language interface was a differentiator.
Checked directly: **LingoDeer's own site offers its interface in sixteen
languages, including Tiếng Việt and ไทย** — the two added here this cycle — and
Drops advertises 55+ target languages.

So a wide interface-language list is table stakes in this category, not an
advantage. It is still the right thing to have built, for the reason in §23: a
beginner who cannot read the interface cannot start. It is not a reason anyone
would choose this product over another, and the previous report should not have
suggested it was.

**What is *not* a defensible answer today:**

* **Vocabulary depth.** 2,581 words with 243 relation entries does not beat a
  dedicated vocabulary product.
* **Motivation.** A streak and a calendar against Duolingo's entire machine.
* **Content volume.** Free Hangul material is abundant and good.

**So the product has one clear reason to exist, and it is the handwriting
track.** Everything else is competent rather than distinctive. **That is a viable
position for a companion product and a weak one for a standalone purchase** —
which is exactly what §32 concludes.

---

# 31. Customer experience audit

Assume the learner paid for this.

| Question | Answer | Evidence |
| --- | --- | --- |
| Does it feel professionally made? | **Yes.** Consistent type, spacing and motion; no placeholder text anywhere | 4,137 copy strings pass audit |
| Does it feel rushed? | **In two places.** Word Detail is thin for non-English learners; the vocabulary quiz is still four options on a card | §15, §16.6 |
| Is the purpose immediately clear? | **No.** The first screen is a lesson, not a proposition | §9.1 |
| Is anything confusing? | Not in navigation. The one confusion is what happens after the alphabet | §4.3 |
| Too much text? | **No — not any more.** The letter screen was three times longer two cycles ago | §9.3 |
| Is handwriting tiring? | **No.** One guided write per letter, none per word | Decisions 4–5 |
| Does the learner know what to do next? | **Yes.** Home answers it with one button | Figure 1 |
| Does progress feel meaningful? | **Yes.** Letters *n*/40, words learned, streak, calendar, daily ring | §10.3 |
| Does Review feel intelligent? | **Yes**, and it is | §21.4 |
| Does the app remember the learner? | **Yes**, now | §24.3 |
| Better than free alternatives? | **For writing, yes. For vocabulary, not clearly** | §30.3 |
| Would they recommend it? | **To a friend starting Hangul, plausibly** | — |

## 31.1 What could produce a 1–3 star review

Ranked by likelihood from the current state:

1. **"It has 2,500 words, not the vocabulary app I expected."**
2. **"The word quizzes get boring."**
3. **"There's no explanation for most words in my language."**
4. **"I cleared my browser and lost everything."**
5. **"It taught me the alphabet and then stopped being useful."**

**None of the top five is a bug.** The bugs that would have generated one-star
reviews — lost progress, false storage warnings, empty review sessions — are
fixed. What remains is product shape.

---

# 32. Paid-product value

## 32.1 As a standalone paid app: **Barely ready**

The engineering quality supports a paid price: stable, offline, private, tested,
and it does one thing free alternatives genuinely cannot. But a buyer comparing
it to other paid Korean apps will compare vocabulary counts, and 2,581 against a
stated 10,000 is a gap they will notice. The quiz loop is monotonous. None of
that is broken; all of it is thin.

**Thirty-two languages changes the reach and not the depth**, and it is worth
being precise about which. A learner in Tamil or Kazakh can now do the whole
alphabet course in their own language — every screen, every lesson, every
letter's sound hint and mnemonic — which is the half of the product that is
actually good. The word cards will read English at them, and the picker tells
them so before they choose. That is a real limitation honestly presented, which
is a better position than the alternative and is not the same thing as being
finished.

It would survive release. It would not delight.

## 32.2 As a Hangyul funnel product: **Good**

For its actual job — get someone from "cannot read Hangul" to "can read and write
it, knows a few hundred words, and is not intimidated" — it is well made and
complete. The alphabet track is genuinely good. The review system is better than
it needs to be. Persistence is now trustworthy.

**But the funnel has no exit.** The product never mentions the thing it is
supposed to funnel into. Adding that is small work with an outsized effect on the
product's stated purpose.

## 32.3 The distinction

These are different questions with different answers. **The product is a good
foundation course and a mediocre vocabulary app**, and its own information
architecture currently presents it as both.

---

# 33. Known issues

Split across two tables so that every column stays legible at A4: what the
problem is, then how to confirm and fix it. The IDs line up row for row.

## 33.1 What is wrong, and who it hurts

<!-- issues:what -->

| ID | Area | Sev | Issue | Customer impact | Status |
| --- | --- | --- | --- | --- | --- |
| **I-04** | Vocabulary | **P1** | 2,581 of a stated 10,000 words | Buyers compare corpus size | **OPEN** |
| **I-05** | Performance | **P1** | The corpus at 10,000 words is three times the bundle budget | The delivery architecture cannot carry the stated plan | **OPEN** |
| **I-19** | Vocabulary | **P1** | Word meanings exist in ten of the thirty-two interface languages | Twenty-two languages read a fully translated app with English word cards | **OPEN** |
| **I-12** | Persistence | **P2** | No export: clearing site data destroys the history irrecoverably | A learner who clears browser data loses everything | **OPEN** |
| **I-13** | Relations | **P2** | 243 of 2,581 words carry any verified lexical relation | Synonym and antonym sections rarely appear | **OPEN** |
| **I-17** | i18n copy | **P2** | No locale has been reviewed by a native speaker, across 32 interfaces | Unknown awkwardness in thirty-one languages, and in Korean | **OPEN** |
| **I-21** | Accessibility | **P2** | `sound_recognition` and `distinguish` letter exercises are heard-only, and the toggle that skipped them is gone | A deaf learner arriving today meets letter questions they cannot answer. Anyone who had already turned the setting on keeps it — the stored `sound_free` flag is still honoured. | **OPEN** |
| **I-24** | Handwriting | **P2** | The traced guide is smaller than the demonstration for a single letter | On a letter lesson the grey glyph a learner traces fills about half the writing square while the demonstration below it fills 0.84 of its own. Same letter, two sizes, one screen. | **OPEN** |
| **I-25** | Build | **P2** | `composition.json` cannot be reproduced by its own generator | None directly — the committed measurements are good, and the syllables built from them were read by eye this cycle. The risk is that nobody can tell whether a future regeneration is a correction or a regression. | **OPEN** |
| **I-18** | Content | **P3** | 103 glosses carry more than one sense in some language | 차 is "a car, or the tea you drink" on a beginner's card | **OPEN** |
| **I-20** | Vocabulary | **P3** | The *More about it* block is written for 25 words | The other 2,556 word cards end at the example | **OPEN** |
| **I-22** | Vocabulary UX | **P3** | A beginner's first sitting alternates two question layouts rather than four | Ten new words, two shapes. The variety returns within days as words reach `review` and `familiar`. | **OPEN** |
| **I-03** | Product | **P1** | The Hangyul hand-off is built but has no destination | A learner who finishes the alphabet finishes the product and stops. The card and the My Learning row render nothing rather than leading nowhere. | **BLOCKED** — The value is not in this repository and must not be guessed. |
| **I-09** | Vocabulary UX | **P2** | No matching exercise; production is tiles, not a keyboard | Vocabulary still feels mostly like recognition on cards | **PARTIAL** |
| **I-10** | Content | **P2** | Korean and English glosses describe different senses for some polysemous words | The meaning changes when the interface language changes | **PARTIAL** |
| **I-01** | Release | **P0** | Shipped Android AAB/APK predated every fix in the report | Anyone installing today gets a product two cycles old | **RESOLVED** |
| **I-02** | Repo | **P0** | A whole cycle's work was uncommitted when the artefacts were built | A fresh checkout does not contain what was shipped | **RESOLVED** |
| **I-23** | Strokes | **P0** | The stroke demonstration showed ownership wedges at junctions and a polygonal ㅇ | ㅂ's uprights grew triangular spurs into crossbars that had not been written yet; ㅅ's first stroke grew a chunk of the second one's shoulder; ㅈ chipped into its own fork; ㅇ read as a lumpy ring rather than a circle. A learner watching stroke one of ㅂ could see a piece of stroke three already on the paper. | **RESOLVED** — supersedes I-14 |
| **I-06** | Word Detail | **P1** | Longer explanations were English-only dictionary scrapings | Non-English learners never saw the block; English learners read "phylum" under 문 | **RESOLVED** |
| **I-07** | Vocabulary | **P1** | Vietnamese and Thai vocabulary covered 500 of 2,581 words | Past word 500 a vi/th learner read marked English | **RESOLVED** |
| **I-08** | Content | **P1** | Entries whose gloss contradicted their own example | 열 read "fever" above a sentence about counting to ten | **RESOLVED** |
| **I-11** | Accessibility | **P2** | Vocabulary listening questions relied on the hint ladder for a text alternative | Usable, but scored as a reveal rather than as an accommodation | **RESOLVED** |
| **I-15** | Audio | **P3** | 마디 was mispronounced in one voice | One word sounded wrong | **RESOLVED** |
| **I-16** | Audio | **P3** | The recogniser screen reported 낳다 as 낫다 in both voices | None — the recordings are correct. The open question was the defect. | **RESOLVED** |

<!-- /issues:what -->

<!-- issues:counts -->

**Open — P0: 0 · P1: 3 · P2: 6 · P3: 3**

**Blocked outside this repository: 1 · Partial: 2 · Resolved: 9**

<!-- /issues:counts -->

Resolved rows stay in the table rather than being deleted. Two of them — **I-01**
and **I-02**, the shipped binary predating the fixes, and the cycle's work being
uncommitted when it was built — are the most repeated findings in this product's
history, and a resolved row is the only thing that stops the same finding being
written a fourth time. **I-23** stays for a sharper reason: the previous report
called the stroke renderer *release quality* and said all 73 items had been
inspected, and the customer's own screenshots showed that both statements were
false. §11.2 is about how that happened.

## 33.2 How to confirm it, and what to do

<!-- issues:how -->

| ID | Evidence | Recommended fix |
| --- | --- | --- |
| **I-04** | `vocabulary:qa:check` reports the shortfall against the target. | Decide I-05 first, then author. Authoring into the current delivery model makes I-05 worse. |
| **I-05** | `bundle:budget` forecasts 663.7 kB gzipped against a 220 kB budget from the measured 68 B/word. Not enforced; gated at 4,000 headwords. | Chunk the corpus by frequency band, split per locale, precache the shell and one locale and cache the rest on use. |
| **I-19** | Stated on the row in the language picker before the learner chooses, which is what makes it a limitation rather than a misrepresentation. §23.3. | Complete the shipping vocabulary content for the remaining twenty-two locales. |
| **I-12** | A consequence of having no account and device-local persistence. §24.6. | None that is customer-facing — a developer-style JSON export was tried and rejected. Keep IndexedDB robust, keep persistent storage requested, and do not warn normal users about it. |
| **I-13** | `vocabulary:relations:qa`. | Nothing, unless a conservative source can be found. Sparse trustworthy data is not a defect and inventing similar words would be. |
| **I-17** | `docs/LOCALIZATION_NATIVE_REVIEW.md` states it. The severity was raised when the surface tripled. | Native review. Nothing automated substitutes for it, and no document here may claim it has happened. |
| **I-21** | No sound-free control in My Learning; `candidates()` still reads `sound_free` and still filters the letter modes. | A small per-question fallback on an audio-only letter question — "Can't use audio?" swapping in an equivalent visual recognition question, not revealing the answer and not penalised — rather than restoring a global setting. |
| **I-24** | Measured: Pretendard sets an isolated ㄱ at 0.53 × 0.42 of the box and eight per cent above its centre. Scaling the glyph to match was implemented and reverted: it scales the glyph's stroke too, from 0.057 of the box to 0.090 against a fixed 0.062 pen, and the robustness corpus went from 0.21% false rejections to 21% — one correct letter in five told it was wrong. See `features/writing/glyphSpec.ts`. | A grading model that does not measure coverage against a stroke the pen cannot fill, then the glyph can be sized for the eye. Its own calibration, not a side effect of a layout change. |
| **I-25** | Running `npm run strokes:measure` against the current font rewrites 23 of 33 syllables, including ones the current generator's code path cannot reach. The committed file was produced by an earlier version of the script, or against a different build of the face. There is no `--check` variant to have caught it. | Re-derive the measurements, review all 33 by eye against the reference glyph, commit both together, and add `strokes:measure:check` to the release gate the way `jamo:measure:check` now is. |
| **I-18** | Reported by `vocabulary:sense:qa`; not gated. | One card, one taught sense. Additional senses belong in the Word Detail block, not in the quiz answer. |
| **I-20** | The alternative was 784 dictionary scrapings, which is why they were deleted. | Write it for the words that need it — polysemous, grammar-heavy, high-frequency functional, culturally specific, easily confused — starting with the top 500. Not a paragraph under every word. |
| **I-22** | `stepsFor('new', i)` alternates `meaning` and `context`; two of the four checks were listening. | A non-listening third check for new words, if one can be recognition-only. The accepted cost of §16.5. |
| **I-03** | `HANGYUL_URL` is null in a plain checkout; `NextStepCard` returns null; `routing:check` reports which way a build went. Searching both repositories on this machine finds the main product — the Expo app `Hangyul`, bundle `com.hangyul.app`, scheme `hangyul` — and its backend `api.talkhangyul.com`, and this app's own host `ganada.talkhangyul.com`. Neither repository declares a learner-facing web address for the main app. The one occurrence of `https://hangyul.app` is a fallback inside a `catch` in a billing modal, not a declared destination. | Whoever owns the product supplies the destination — a landing page, a store listing or a universal link — and it is set as `VITE_HANGYUL_URL` at build time. Documented in `.env.example`. |
| **I-09** | `build` was added; matching is still absent. Matching spans four words and the learning plan is per-word. | A session-level group exercise that can cover several word ids while crediting each word's evidence once. A scheduling change, not a screen. |
| **I-10** | The eleven known cases are pinned. There is no automated guarantee a twelfth does not exist. | A canonical taught `senseId` per entry that every language's representation derives from. |
| **I-01** | Rebuilt from the verified commit; markers grepped in both directions out of the delivered package; signing identity compared against the previous artefact. | done |
| **I-02** | Committed before the build, in that order, this cycle and the two before it. | done |
| **I-23** | Reproduced by rendering the shipped assets before any change was made. Fixed by replacing the architecture — see the entry for it in §11. Now: `strokes:qa` clean on 73 items / 269 strokes; `strokes:visual` clean on 1,345 frames; the gallery read by eye at 160 px and at 96 px, which is the size the defect was reported at. | done |
| **I-06** | 25 written words in ten languages; §15.2. | done |
| **I-07** | 2,581 non-null rows in both. | done |
| **I-08** | Eleven found, all authored and pinned; `vocabulary:sense:qa:check` passes. | done |
| **I-11** | There is no vocabulary listening question left to accommodate; §16.5. The letter exercises are I-21. | done |
| **I-15** | Regenerated, fixtured, checked on-device. | done |
| **I-16** | The two readings differ measurably: 낳다 is [나타], an aspirated ㅌ with a short closure and a weak breathy release; 낫다 and 낮다 are both [낟따], a long closure and a sharp tense release. Measured off the shipped clips, both voices: 낫다 250/190 ms closure and −4.1/−2.9 dB release, 낮다 250/190 ms and −4.1/−2.8 dB, 낳다 170/170 ms and −6.9/−5.8 dB. The two [낟따] words are near-identical to each other and 낳다 is apart from both, in the direction aspiration predicts. `check_contrasts` in `qa_pronunciation.py` asserts this on every run, and fails if the pair is asserted the other way round. | done — the recogniser is not a normative judge of a clip and no longer gates this word. |

<!-- /issues:how -->

### Where these come from

Every row above is generated from `docs/issues.json`, which is the only place in
this repository that states an issue's status. `npm run issues:check` fails the
build if the tables have drifted from it, if the report mentions an id that does
not exist, or — the one that actually caught things — if a *sentence* anywhere
else in this document gives an issue a status the source disagrees with.

That last check exists because the previous reports were internally
contradictory, and not through carelessness: the same fact was written down in
six places, and six copies of a fact kept in step by hand do not stay in step.

# 34. Recently resolved

These were real, are fixed, and are covered by tests. **They should not be
re-reported as open.**

| Was | Now | Held by |
| --- | --- | --- |
| **The Language row led with a generic globe** — it said the row was about languages, not which one was on | The selected locale's SVG flag, from the same `flagFor` the picker uses | `languageFlag.test.tsx` — 11 assertions, including a render per locale and a coverage check over all 32 |
| **Vocabulary tested by ear** — `listen` and `listenMeaning` in the daily plan, the review scheduler and the wrong-answer retry | Removed at the model, the plan and the builder, so no route can reach one; pronunciation audio untouched | `vocabularyDay.test.ts`, `soundFree.test.ts`, and the packaged APK grepped for the prompt keys |
| **Pressing *Hint* printed the answer**, on five of nine question types | A three-rung ladder whose first rung never reveals | 23 assertions across ten languages |
| Hints rendered as `vocabulary:partOfSpeech.verb` on screen | The pages resolve the keys | `e2e/hints.spec.ts` |
| The Vietnamese category hint gave away 배우다 | The hint drops the category when it collides with the answer | the same suite, per locale |
| **어's second stroke painting a block of its third** | Routes trimmed out of later strokes; ink settled against the shipped route | pixel QA, 1,345 frames |
| ㅎ's bar growing a blob into the still-grey ring | Cap ink handed to the stroke whose body holds it | pixel QA |
| Detached chips beside ㅊ, ㅎ, ㅍ appearing from nowhere | Chips handed to the ink they touch, ties to the later stroke | pixel QA |
| ㅞ's pen travelling through blank paper | Authored connector corrected; route kept on its own ink | pixel QA |
| ㅊ's tick authored vertical against a horizontal face | Authored horizontal | pixel QA |
| **Lesson titles in English for six locales**, undetected for two cycles | All fifteen in all ten | `e2e/hints.spec.ts` asserts Thai on the home heading |
| A first vocabulary session asking one question shape ten times | Two skills in two layouts — it was four before the listening questions were removed; see I-22 | `vocabularyDay.test.ts` |
| A first-time visitor never told what the app is for | One sentence, on a fresh profile only | — |
| Persistent storage never requested | Requested after the first finished lesson, silently | — |
| `vocabulary:saved.order.alphabetical` untranslated in four locales | Recorded as a deliberate cognate — "A–Z" *is* the label | `i18n:check` |
| `docs:consistency` silently skipping the APK/AAB sizes for two cycles | Matches by extension; reports 62.9 MB and 61.7 MB | the checker itself |
| Learning data lost after a browser refresh | Plan derivation and persistence gated on hydration | 6 e2e + 7 store tests |
| "배운 단어" stuck at 0 after studying | `heard` removed as a completion gate | store tests |
| 더 학습하기 resetting the counter to 0/10 | Extension appends instead of rebuilding | store tests |
| Progress could not exceed 100% | `percent` uncapped; `ratio` capped for the bar | store tests |
| Dark-mode hover painting white on white | Semantic `surfaceHover` / `primarySubtleHover` tokens | token build |
| Refresh 404 on internal routes | SPA fallback, and the worker no longer caches a 404 as the shell | `routing:check` |
| **Vietnamese and Thai vocabulary at 500 of 2,581** | All 2,581 in both; ten locales complete | `vocabulary:sense:qa:check` |
| **Eleven glosses contradicting their own example** | Authored `en`, pinned by exact string | `vocabulary:sense:qa:check` |
| 적다 filed as a verb because the derivation took the wrong sense | An adjective, in the pack | the same check's POS rule |
| ***More about it* filled with "phylum", "graveyard", "prophase"** on 784 words | 25 words, written, in all ten languages | `wordDefinition.test.tsx` + pack-level parity |
| The same block appearing in English and nowhere else | Refused by `pack.py`; ten packs compared index by index | `vocabulary:sense:qa:check` |
| 첫 글자는 ‘아’예요 spelling 아예 once punctuation is stripped | Template ends in an ellipsis, like the other nine | `hints.test.ts`, now every 7th word |
| "So wird es benutzt" handing over 이렇게 in de, es, pt-BR | `usableHints` drops a rung that reveals, at render time | the same suite, bounded |
| **마디 read as [마지] by the male voice**, open for two cycles | Regenerated; permanent fixture; checked on-device by byte length | `audio:qa`, `audio:pronunciation:check`, `qa-native-android` |
| The 낳다 fixture claiming both voices confirmed correct | The comment records the recogniser's instability instead | — it is now stated as unknown |
| **Bracketed IPA in front of beginners** — [t͡ɕa̠ɾi] over 자리 | Revised Romanization from the standard pronunciation — *jari*, 작년 → *jangnyeon* | `romanization:qa` layers A–E; `wordRomanization.test.tsx` matches the rendered string against an IPA character class |
| **The Arabic home screen rendering as a white page** | All twelve quotations in all thirty-two languages | `QUOTE_LOCALES` tied to `AVAILABLE_LOCALES` in `data.test.ts` |
| **The tab bar reading Home / Letters / Words under an Arabic screen** | `LocaleProvider` tells i18next when late-arriving strings land | `LocaleProvider.test.tsx`, with the bundle deliberately absent at construction |
| Six practice typefaces named and described in English only | All six in all thirty-two | `i18n.test.ts`, per face per locale |
| A unit heading and its lesson card phrasing one sentence two ways, in 28 languages | One phrase, checked pair by pair | `i18n.test.ts`, for every lesson whose English title is also a unit title |
| Letter sound hints and mnemonics in ten languages of thirty-two | All 73 in all thirty-two | `i18n.test.ts` walks `AVAILABLE_LOCALES`, not a list |
| **The picker telling vi and th learners their word meanings were English** while shipping 2,581 of each | `WORD_COPY_LOCALES` derived from the emitted packs | `data.test.ts` ties the two together |
| Home offering the day's words twice and Review twice | Each once | — a screen, read |
| Writing feedback as six stacked paragraphs under a two-stroke letter | Status, one sentence, one note, next action | — a screen, read |
| "0 %" printed beside the words "You can read Hangul" | The ring is gone; the fraction stays | — a screen, read |
| Eighteen residual stroke intrusions, largest ㅈ at 3.14 units | One, at 0.39 units, examined and explained | `strokes:visual --check` |
| `build-info.json` reporting storage schema 6 while the app was on 9 | Read from `storage/schema.ts` | the build script itself |
| The copy audit reporting Indonesian *topik* ("topic") as a claim about the TOPIK exam | Case-sensitive, because the exam is an acronym | `copy:audit:check` |

---

# 35. Regression inventory

Behaviours that must stay tested. Each maps to a real past failure.

| # | Regression | Guarded by |
| --- | --- | --- |
| 1 | A stroke bleeding into the next stroke's area | visual review of all 73; `strokes:qa` |
| 2 | Stroke protrusions, wedges, spikes at junctions | same |
| 3 | Marker detached from its stroke start | `strokeMarkers.test.ts` — anchor on ink, at the tip |
| 4 | Scribble accepted as valid handwriting | `handwriting:robustness` false-accept rate |
| 5 | Reasonable beginner writing rejected | same, false-reject rate |
| 6 | Review reports N and opens empty | one `PracticePlan` object |
| 7 | Listening audio does not autoplay | `entry.spec.ts` |
| 8 | Audio plays twice on a re-render | `useEntryAudio` ref guard + unit tests |
| 9 | Saved word unreachable | `journey.spec.ts` |
| 10 | Data lost on refresh | `persistence.spec.ts` × 6 |
| 11 | False storage warning | `storageWarning.test.tsx`, `capability.test.ts`, e2e |
| 12 | Nested-route refresh 404 | `routing:check` |
| 13 | Dark-mode light-on-light hover | semantic tokens; visual check |
| 14 | Vocabulary progress returning to 0 | `vocabularyProgress.test.tsx` |
| 15 | Learned-word count not updating | same |
| 16 | Extra-learning percentages | same |
| 17 | Vocabulary never handwritten | `journey.spec.ts` asserts no canvas |
| 18 | A sentence becoming an SRS item | memory keys admit only character/word |
| 19 | Session opening empty on a slow store | `wordSessionHydration.test.tsx` |
| 20 | **A hint containing the answer**, in any of thirty-two languages | `hints.test.ts` — every rung, every mode, every locale |
| 21 | **A translation key rendering on screen** | `e2e/hints.spec.ts` |
| 22 | A hint ladder that starts with the reveal, or never reaches one | `hints.test.ts` |
| 23 | **A stroke holding ink past its own end inside a later stroke** | `strokes:visual --check`, 1,345 rasterised frames |
| 24 | A stroke arriving in disconnected pieces | same |
| 25 | A pen travelling where its stroke's ink is not | same |
| 26 | Curriculum content untranslated in a shipping locale | `e2e/hints.spec.ts` for th and vi; `data.test.ts` for the maps |
| 27 | A first session asking one question shape ten times | `vocabularyDay.test.ts` on the new-word rotation |
| 28 | A learner who cannot hear being left with no session | `soundFree.test.ts` — heard-only steps gone, session still varied |
| 29 | **A rendered hint containing the answer** even when the rung is safe | `usableHints` at render time; `hints.test.ts` audits the filtered ladder |
| 30 | A hint filter quietly removing so much that the ladder is a reveal | the same test bounds drops and strandings per locale |
| 31 | **A gloss drifting back to a sense its own example contradicts** | `vocabulary:sense:qa:check` — eleven pins, exact string |
| 32 | A locale's word copy silently going partial | the same check, coverage rule |
| 33 | **A *More about it* block in one language and not another** | `pack.py` refuses a partial `d`; the same check compares ten packs |
| 34 | A derived dictionary fragment returning to that block | `wordDefinition.test.tsx` — it must not restate the meaning, and must stay rare |
| 35 | A corrected recording being replaced by a cached older one | `qa-native-android.mjs` compares served bytes to the manifest |
| 36 | **IPA returning to a customer-facing screen** under any label | `wordRomanization.test.tsx` — the rendered string is matched against an IPA character class; `romanization-qa` layer E greps the source |
| 37 | A romanization drifting off the standard pronunciation | `romanization:qa:check` layer B — 41 rule fixtures, and all 2,581 words re-derived through the Python and compared |
| 38 | 자리 romanised from its spelling rather than its sound | the same fixtures, pinned by exact string |
| 39 | **A shipping language with no quotations**, which blanks the home screen | `data.test.ts` ties `QUOTE_LOCALES` to `AVAILABLE_LOCALES` |
| 40 | A quotation author falling through to English | the same test asserts the entry exists, not merely that something renders |
| 41 | **Chrome left in the previous language** when a stored locale's strings arrive after the first paint | `LocaleProvider.test.tsx` renders a memoised component with the bundle deliberately absent at construction |
| 42 | A letter taught in English under a translated interface | `i18n.test.ts` walks `AVAILABLE_LOCALES`, not a hand-written list |
| 43 | A mnemonic present in one language and missing in another | the same suite, parity against English |
| 44 | A lesson titled in English on the home screen | the same suite, per lesson per locale |
| 45 | **A unit named one thing in its heading and another on its card** | the same suite, for every lesson whose English title is also a unit title |
| 46 | A practice typeface named or described only in English | the same suite, per face per locale |
| 47 | **The language picker claiming a language has no word meanings when it ships 2,581** | `data.test.ts` ties `WORD_COPY_LOCALES` to the emitted packs |
| 48 | Letter copy generated and the emitted packs left stale | `letters:copy:check`, in `verify:quick` |

Rows 20–25 are the ones worth noting. Every one of them guards a defect that
**shipped past a full green suite**, because the suite was testing the artefact
one level away from the thing that was wrong: path data instead of pixels, hint
objects instead of rendered sentences, translation files instead of screens.

---

# 36. QA and test coverage

## 36.1 Commands that exist and pass — **VERIFIED, run this cycle**

| Command | Purpose | Result |
| --- | --- | --- |
| `verify:quick` | The gate: name, i18n, copy, strokes, **stroke pixels**, vocabulary, relations, sense, tokens, lint, typecheck, unit tests, build, bundle budget, routing | **PASS** |
| `verify:release` | `verify:quick` plus store, curriculum, fonts, icons, content, examples, audio mapping, coverage, docs consistency | **PASS** |
| `test` | 652 web unit + 95 handwriting-core | **PASS** |
| `test:e2e` | 230 Playwright cases (115 × 2 projects) | **PASS**, both projects run in full this cycle |
| `strokes:qa:check` | 73 items, 269 strokes — geometry, junction classification, curve sampling, markers | **PASS** |
| **`strokes:visual:check`** | 1,345 frames **rasterised and measured**, then written out as a gallery at 160 px and 96 px | **PASS**, nothing reported |
| `vocabulary:qa:check` | corpus shape, categories, locales | **PASS** |
| `vocabulary:relations:qa` | typed, bidirectional, non-dangling relations | **PASS** |
| `content:qa:check` | editorial pack quality | **PASS**, 4 benign warnings |
| `examples:qa:check` | 2,581 sentences | **PASS**, 0 review, 0 rewrite |
| `audio:pronunciation:check` | 2,612 items | **PASS**, 0 errors |
| `audio:qa` | 10,550 clip slots, 48.9 MB | **PASS**, 0 errors, 0 warnings |
| `vocabulary:sense:qa:check` | one taught sense per word, 11 pins, definition parity across 10 packs | **PASS** |
| **`romanization:qa:check`** | five layers: source rules, 41 fixtures **plus all 2,581 re-derived**, id and pack alignment, agreement with the audio, and a grep for the retired label | **PASS** |
| **`letters:copy:check`** | the 30 emitted letter packs match `content/letters/` | **PASS** |
| `content:coverage:check` | field completeness matrix | **PASS**, every row 100% |
| `copy:audit:check` | **17,832 strings, 32 languages** | **PASS** |
| `handwriting:robustness` | false accept / reject by typeface | **0.21% / 0.78%** |
| `review:benchmark` | adaptive vs fixed scheduler | adaptive wins **7 of 7** |
| `bundle:budget:check` | size budgets | **PASS**, forecast flagged; **first load 84%, precache 55%** — both fell while the language count tripled |
| `routing:check` | SPA fallback against the built dist | **PASS** |
| `i18n:check` | translation completeness | **PASS**, **32 locales at 100%** |
| `docs:consistency:check` | one value per metric across docs | **PASS** |
| **`issues:check`** | the report's issue tables against `docs/issues.json`, and any sentence elsewhere that contradicts a status | **PASS** |
| **`jamo:measure:check`** | the per-letter proportions still match the reference face | **PASS** |
| `tokens:check` | tokens.css matches its source | **PASS** |

`verify:quick` is not the whole gate, and last cycle proved it three times. This
cycle it proved it twice more, and both were caused by moving content rather than
by writing it:

* `content/curriculum.json`, the generated export, stale again after the letter
  copy moved out of `characters.ts` — caught by `curriculum:check`;
* `report_coverage.py`, which read letter copy out of `curriculum.json` and
  therefore reported **0% for six languages that were at 100%**, and which read
  a field named `pronunciation` that no longer exists. It now reads
  `content/letters/` and reports against all thirty-two.

That second one is worth a sentence, because it failed in the *safe* direction
and would have been easy to wave through: a check that reports a gap where there
is none costs an afternoon, and a check that reports none where there is one
costs a release. Both were fixed by pointing the check at the file that is now
the source of truth.

**`letters:copy:check` was added to `verify:quick`** for the same class of
reason: the emitted per-locale packs are generated, and a generated file that
nothing checks is a generated file that goes stale.

**`verify:release` cannot exit zero today, by design.** `vocabulary:qa:target`
fails on "2,581 headwords — 7,419 short of the 10,000 target", which is I-04
stated as a build failure rather than as a note. Every other check in it passes.
A future reader should not read that non-zero exit as a broken suite.

## 36.2 What these gates learned this cycle

Two of them were rewritten, and the reason is the same in both cases: they were
asking a question whose answer stayed *yes* while the product was wrong.

`strokes:qa` used to check that no path had a NaN in it, that nothing fell
outside the box, and that every taught item had an asset. All true of a glyph
with a visible wedge in it, because a wedge is valid geometry. Most of what it
contained was defending against what a raster cut could produce — a stroke with
no ink, a region traced into two islands, a reveal ribbon that did not match its
outline — and none of that is reachable now. **Checks that can no longer fail
were deleted rather than left in to look thorough.** What it asserts now is what
a stroked centreline can still get wrong.

`strokes:visual` used to enforce an invariant about *ownership*: ink beyond the
end of stroke *i*'s route must not fall inside stroke *j*'s body, for later *j*.
That is a sound statement about a correct cut and silent about a cut whose
regions are disjoint by construction — which they were. It could never fire on
the thing that was wrong. It now measures what a dash-revealed path can get
wrong: a stroke that draws nothing, ink that does not arrive in step with its
fraction, ink that shrinks, ink at the edge of the box, a marker off its own
start, a final frame that is not the union of its strokes.

**And then it writes the gallery and stops.** Both sizes, 160 px and the 96 px a
phone actually draws, because the reported defect was seen on an Android browser
and a desktop-sized review of a phone-sized picture is a different question. The
last line it prints is that pixels cannot tell you whether ㅅ looks like ㅅ.

### The gate that stops the report drifting

`issues:check` is new and it is not about the product. `docs/issues.json` is now
the only place an issue's status is written down; the report's tables are
generated from it, and the check fails if a *sentence* anywhere else contradicts
one. It found two things on its first run: a quick-wins table whose every row
referenced an issue that no longer meant what the row said, and a scorecard line
calling 낳다 unresolved two hundred lines after the table said otherwise.

### A test that measures a recording

`check_contrasts` in `qa_pronunciation.py` decodes the shipped clips for a
minimal pair and compares the stop closure and the release energy. It exists
because a recogniser is not a normative judge of a recording, and because
"somebody should listen to it" had been the recommended fix for three cycles. It
was verified by asserting the pair in the wrong direction and watching it fail.

# 37. Product scorecard

Each score carries its evidence. Nothing here is a feeling. Arrows show movement
since the last report.

| Area | Score | Evidence |
| --- | --- | --- |
| Product positioning | **7/10** ▲ | The funnel is built and waiting for a URL (§4.3, I-03) |
| Onboarding | **8/10** ▲ | No account, device language detected, and now one line saying what the app is for on a fresh profile |
| Hangul learning | **9/10** = | 73 items, 12 lessons, correct order, syllables taught as their own thing |
| Handwriting UX | **8/10** = | One guided write, undo/clear, helper below the canvas; inherently tiring on glass |
| Stroke animation quality | **9/10** ▲ | Zero visible intrusions, **one** sub-visible overlap left of eighteen, examined rather than rounded off (§11.6), and all 73 items read by eye |
| Vocabulary depth | **5/10** = | 2,581 of 10,000 and delivery unsolved at target (I-04, I-05). Every word carries a meaning and an example in ten languages and falls back to English in twenty-two (I-19) |
| Vocabulary learning | **7/10** ▲ | Four skills in three layouts on a first session, where there was one. Still four options on a card (I-09) |
| **Hints and help** | **8/10** = | Was 2/10 two cycles ago: the button printed the answer. Now a graded ladder, audited in all thirty-two languages |
| Dictionary quality | **6/10** ▲ | Trustworthy and sparse: 243 relation entries, and a *More about it* block that is now written rather than scraped — 25 words, ten languages (§15.2) |
| Review | **9/10** = | Per-skill memory, interleaving, measured against a baseline, counts that cannot lie |
| Saved Words | **8/10** = | Search, three orderings, its own review plan |
| Wrong Answer Notebook | **7/10** = | One row per item, recovery rule, retry. Does not explain *why* |
| Audio / pronunciation | **9/10** = | 10,454 clips, two voices, 503 sound-change notes, and the written notation is now Revised Romanization taken from the same standard pronunciation the audio is — so they cannot disagree. The one recogniser disagreement that stood open for three cycles is settled — the 낳다 recordings were measured against their minimal pair rather than transcribed, and they are right (I-16) |
| Localization | **8/10** = | Thirty-two languages at 100% UI and 100% of the alphabet course, right-to-left working as behaviour rather than as strings. Flat, not up: word meanings reach ten of the thirty-two (I-19), none of it has been read by a native speaker (I-17), and four more bodies of content turned out to be English under a green coverage report |
| Progress / persistence | **9/10** = | Eight stores, migrations, corrupt-row recovery, six e2e cases, persistence now requested. No export (I-12) |
| Web reliability | **9/10** = | Every route survives refresh, fresh tab and offline |
| Mobile UX | **8/10** = | Safe-area suite, pinned actions, 44 px targets, one-screen lesson |
| Visual polish | **8/10** = | Coherent tokens, both themes audited, no placeholder content |
| Accessibility | **6/10** = | Focus, keyboard, semantics, skip link. Vocabulary no longer has a listening question to accommodate (I-11); the **letter** exercises still do and the control that skipped them is gone (I-21). No screen-reader pass |
| Performance | **8/10** ▲ | Every budget met with room: first load 84%, precache 55% — both **fell** while the language count tripled, because the last per-language content moved off the critical path. The corpus target still breaks the forecast (I-05) |
| Paid-product value | **5/10** = | Sound engineering, thin content, one genuine differentiator (§30.3) |

**Mean: 7.5 / 10**, up from 7.4. The spread still matters more: the learning
machinery scores 8–9 and the content scores 5–6, and nothing this cycle moved
the corpus.

**Localization deserves its flat score explained, for the second cycle running.**
The language count tripled, every one of the thirty-two reached 100% on the
interface and on the alphabet course, right-to-left works as layout rather than
as translated strings — and the score did not move. Because the same work
uncovered that the six practice typefaces, the twelve quotations, the tab bar and
twenty-eight languages' unit headings had all been English or inconsistent under
a green coverage report, and because word meanings reach ten languages of
thirty-two. A number that only goes up when features are added, and never down
when a measurement turns out to have been wrong, is not a score.

**Performance moved for a reason worth stating.** Adding twenty-two languages
made the app smaller. That is not a paradox: the same change forced the last body
of per-language content off the critical path, and three separate bodies of it
are now fetched for the one language the learner reads.

---

# 38. Customer journey friction map

| Stage | Friction | Why |
| --- | --- | --- |
| First launch | **LOW** | One button. No account. Right language already |
| First letter lesson | **LOW** | Demo plays itself, sound plays itself, one line of text |
| First writing attempt | **MEDIUM** | Writing on glass is effortful; tolerance is generous (0.78% false reject) but the physical act remains |
| First completion | **LOW** | Immediate, and the counter moves |
| Moving to vocabulary | **MEDIUM** | Nothing tells the learner *when* to start words; both tracks are simply available |
| Daily vocabulary goal | **LOW** | 10 words, ~5 minutes, honest counter |
| Repeated vocabulary sittings | **HIGH** | The same four-option card, six shapes, every day (I-07) |
| Review | **LOW** | Small, targeted, never a wall of everything ever learned |
| Returning next day | **LOW** | Streak, calendar, today's counters reset, totals do not |
| Finishing the alphabet | **HIGH** | Nothing happens. No hand-off, no "what now" (I-03) |

---

# 39. What is left, in the order it is worth doing

This used to be four sections — a top ten, a must-fix-before-a-paid-release, a
should-fix-after, and a quick-wins table. All four were restatements of the same
list in §33, all four had to be re-derived by hand every cycle, and all four had
drifted. The quick-wins table had drifted furthest: by the last report every
single id in it referred to an issue that no longer meant what its row said —
"translate the one missing i18n key (I-14)" against an I-14 that was a stroke
overlap, "regenerate the 마디 clip (I-13)" against an I-13 that was lexical
relations. Nobody had been careless. The list had simply been copied forward
while the ids underneath it moved.

So there is one list, generated from `docs/issues.json`, ordered by severity and
then by how cheap the fix is. Effort is an engineering estimate, not a promise.

<!-- issues:next -->

| ID | What | Why it matters | Effort |
| --- | --- | --- | --- |
| **I-04** | 2,581 of a stated 10,000 words | Buyers compare corpus size | HIGH (content) |
| **I-05** | The corpus at 10,000 words is three times the bundle budget | The delivery architecture cannot carry the stated plan | MEDIUM — chunking and a cache policy |
| **I-19** | Word meanings exist in ten of the thirty-two interface languages | Twenty-two languages read a fully translated app with English word cards | HIGH (content) — 22 locales × 2,581 words |
| **I-12** | No export: clearing site data destroys the history irrecoverably | A learner who clears browser data loses everything | NONE — closed by decision |
| **I-13** | 243 of 2,581 words carry any verified lexical relation | Synonym and antonym sections rarely appear | NONE unless a conservative source appears |
| **I-17** | No locale has been reviewed by a native speaker, across 32 interfaces | Unknown awkwardness in thirty-one languages, and in Korean | HIGH (people, not engineering) |
| **I-21** | `sound_recognition` and `distinguish` letter exercises are heard-only, and the toggle that skipped them is gone | A deaf learner arriving today meets letter questions they cannot answer. Anyone who had already turned the setting on keeps it — the stored `sound_free` flag is still honoured. | LOW–MEDIUM — one per-question fallback, in 32 languages |
| **I-24** | The traced guide is smaller than the demonstration for a single letter | On a letter lesson the grey glyph a learner traces fills about half the writing square while the demonstration below it fills 0.84 of its own. Same letter, two sizes, one screen. | MEDIUM–HIGH — a grading recalibration with its own corpus run |
| **I-25** | `composition.json` cannot be reproduced by its own generator | None directly — the committed measurements are good, and the syllables built from them were read by eye this cycle. The risk is that nobody can tell whether a future regeneration is a correction or a regression. | LOW–MEDIUM — re-measure, then read 33 syllables by eye |
| **I-18** | 103 glosses carry more than one sense in some language | 차 is "a car, or the tea you drink" on a beginner's card | MEDIUM (content) |
| **I-20** | The *More about it* block is written for 25 words | The other 2,556 word cards end at the example | HIGH (content) — start at the top 500 |
| **I-22** | A beginner's first sitting alternates two question layouts rather than four | Ten new words, two shapes. The variety returns within days as words reach `review` and `familiar`. | MEDIUM — a third non-listening check for new words |
| **I-03** | The Hangyul hand-off is built but has no destination | A learner who finishes the alphabet finishes the product and stops. The card and the My Learning row render nothing rather than leading nowhere. | LOW — one environment variable, once the value exists |
| **I-09** | No matching exercise; production is tiles, not a keyboard | Vocabulary still feels mostly like recognition on cards | MEDIUM — a session-level exercise concept, not a screen |
| **I-10** | Korean and English glosses describe different senses for some polysemous words | The meaning changes when the interface language changes | MEDIUM (content) — a senseId per entry |

<!-- /issues:next -->

## 39.1 The three that decide whether this is sellable

Reading the table top-down gives the order. Reading it as a *product* gives three:

**I-03 — the funnel is built and switched off.** This product's stated reason to
exist is to hand a beginner to the main Hangyul product once they can read. The
card and the row are built, tested and rendering nothing, because the destination
is not in this repository and guessing it would ship a card that leads nowhere.
This is one environment variable away from working and cannot be closed from
here. It is the single external blocker in this report.

**I-04 with I-05 — the corpus is a quarter of its promise, and the way to deliver
the rest does not exist yet.** These are one problem written twice, and the order
matters: authoring 7,419 more words into the current eager delivery model makes
I-05 worse rather than better. The architecture comes first.

**I-19 — word meanings reach ten of thirty-two languages.** Twenty-two languages
read a fully translated interface with English word cards. What keeps it a
limitation rather than a misrepresentation is that the language picker says so on
the row, before the learner chooses.

## 39.2 What was deliberately not done

**I-12, no export.** A developer-style JSON export was built once and rejected.
Device-local persistence without an account means clearing site data destroys the
history, and the answer is to make that unlikely — IndexedDB kept robust,
persistent storage requested, migrations tested — rather than to hand a learner a
file to look after and warn them about it.

**I-13, sparse lexical relations.** 243 of 2,581 words carry a verified synonym or
antonym, and the rest show nothing. Sparse trustworthy data is not a defect.
Filling the gap with invented "similar words" would be.

# 43. ChatGPT handoff brief

## Product in 10 sentences

1. Hangyul ganada teaches a complete beginner to read and write Hangul, then
   gives them practical basic vocabulary.
2. It is a static React SPA with **no backend, no account and no telemetry**;
   everything lives on the learner's device.
3. The alphabet track is 73 items across 12 lessons: meet the letter, watch it
   written, write it once over a guide, then recognise it.
4. Handwriting is graded by comparing rasterised ink against the real typeface
   outline, measured at 0.21% false accept and 0.78% false reject.
5. Vocabulary is quiz-first and never handwritten: a daily goal of 5–20 words,
   six step types in three layouts, with optional extra study past the goal.
   Help is a three-rung ladder that never opens with the answer.
6. The corpus is 2,581 words against a stated 10,000 target, each with Revised
   Romanization taken from its standard pronunciation, audio, an example
   sentence and — for 243 words — verified synonyms or antonyms.
7. Review is a per-item, per-skill memory model that surfaces only what is
   fading; its displayed count and its session are the same object.
8. There is a Saved Words list and a Wrong Answer Notebook, and they are
   deliberately three different things from Review.
9. **Thirty-two** interface languages, detected from the device, switchable from
   the first row of settings; twenty-two were added this cycle and Arabic brought
   real right-to-left layout with it. Word meanings reach ten of the thirty-two,
   and the picker says so on the row before the learner chooses.
10. The product is positioned as a foundation course that hands the learner on to
    the main Hangyul product — the hand-off is now **built and renders nothing**,
    because no destination URL exists in this repository.

## Current architecture

Static bundle from `apps/web` (React 19, Vite 7, TypeScript 5.7, react-router 7).
Content — vocabulary, strokes, curriculum, audio — is generated at build time by
scripts in `scripts/` and `scripts/content/` and shipped as JSON and mp3.
Persistence goes through a `PersistenceDriver` seam: IndexedDB on the web, SQLite
on native, an in-memory fallback. Android ships the same bundle inside
Capacitor 8. Hosting is any static host with an SPA fallback.

## Current learning model

`unseen → introduced → practised → learned`. Letters require the demonstration
watched, one guided write and a recognition pass. Words require recognition only
and are never written. Hearing is **recorded but not required** — it depended on
autoplay, which browsers block.

## Current vocabulary model

A `DailyPlan` is built once per calendar day, persisted, and extended only on
request. A word counts as done when every step the plan scheduled for it is
complete — once, however many questions that took.

## Current review model

`memory.ts` models one item-and-skill's stability and recall. `review.ts` turns a
profile into a sitting, interleaving so no session becomes one item five times.
`plan.ts` resolves a `PracticePlan` whose every item is already known to be
answerable; screens print `plan.count`.

## Current persistence model

Eight IndexedDB stores; locale in `localStorage`. Startup: open driver (retry
once) → migrate → read all stores in parallel while probing write/read/erase →
`setState` → `ready = true`. **Nothing derives or persists a daily plan before
`ready`** — that gate is the fix for the data-loss bug.

## Current UI/design system

Semantic tokens generated from TypeScript into `tokens.css`, checked in CI.
Themes: system/light/dark via `data-theme`. Hover uses `--hg-surface-hover` and
`--hg-primary-subtle-hover`, wrapped in `@media (hover: hover)`.

## Biggest strengths

Handwriting grading; the review scheduler; persistence reliability; offline
capability; content-pipeline discipline (every field traceable to a source);
restraint in the interface.

## Biggest weaknesses

Corpus size and its delivery path; sparse lexical relations; vocabulary
interaction still mostly four options on a card; a funnel exit that is built and
switched off; thirty-two languages of copy that no native speaker has read.

## The pattern worth carrying forward

Defects shipped past a full green suite all cycle, and they are the same mistake
repeated: **the check measured the artefact one level away from the thing that
could be wrong.** Path data instead of rendered pixels. Hint objects instead of
rendered sentences. Translation files instead of screens. A hint audited before
translation instead of after it. When something is reported broken and the tests
are green, suspect the level the test is looking at before suspecting the report.

The second pattern is quieter and appears three times in this report. **Doing
the content work is what found the content bugs.** Translating 2,081 words into
two languages surfaced three glosses that contradicted their own examples;
reading the 784 derived explanations is what established they should be deleted
rather than translated; listening-layer QA only became meaningful once somebody
checked what the recogniser said about a clip nobody disputed. None of the three
was reachable by a check written in advance.

## P0 bugs

None open. **I-01** (stale artefacts) and **I-02** (uncommitted cycle) were both
closed, in that order — commit, then build, then unpack the delivered APK and
check the bytes.

## P1 bugs

**I-03** hand-off built but unconfigured · **I-04** corpus at 26% of target ·
**I-05** corpus delivery breaks the bundle budget at target, costed and gated at
4,000 headwords.

Three P1s closed this cycle: **I-06** (the *More about it* block), **I-07**
(Vietnamese and Thai vocabulary) and **I-08** (glosses contradicting their own
example).

## Current UX inconsistencies

* Nothing indicates when a learner should move from letters to words.
* Synonyms and opposites appear on 243 words of 2,581, and the absence is silent
  — correct, and it makes the section feel arbitrary when it does appear.
* Sound-free practice removes the audio-only questions but the per-question
  fallback for a listening step is still the reveal rung, scored as a reveal.

## Product decisions that must NOT be reversed accidentally

1. **Vocabulary is never handwritten** — enforced by an e2e assertion.
2. **Sentences are context, not SRS items** — memory keys admit only
   `character:` and `word:`.
3. **The corpus is never shown as one list.**
4. **No account, no server, no telemetry.**
5. **No vocabulary images.**
6. **Only verified lexical relations are shown; absence shows nothing.**
7. **The storage warning requires a proven write/read failure.**
8. **`heard` is recorded, never required for completion.**
9. **One guided writing attempt — no second faded-guide stage.**
10. **Nothing may derive or persist a daily plan before `ready`.**
11. **No first-level hint may contain the answer** — in any of the thirty-two
    languages. `hints.test.ts` enforces it; the matcher is shared with the
    product so the two cannot drift.
12. **No stroke may hold ink past its own end inside a later stroke.**
    `strokes:visual` enforces it on rasterised frames, not on path data.
13. **The hand-off renders nothing when no destination is configured** — a card
    that leads nowhere is worse than the dead end it replaces.
14. **The *More about it* block is written, never derived** — and appears in all
    ten languages or in none. `pack.py` refuses a partial one;
    `vocabulary:sense:qa` compares the ten packs index by index. Reinstating a
    generated block would undo §15.2.
15. **A taught sense, once pinned, does not move** — eleven entries are matched
    by exact string, so a regeneration cannot quietly restore a gloss that
    contradicts its own example.
16. **The customer-facing notation is Revised Romanization, derived from the
    standard pronunciation** — not IPA, not derived from the spelling, and not
    bracketed. Renaming a field and leaving IPA in it is the specific failure
    `wordRomanization.test.tsx` exists to prevent: it matches the *rendered*
    string against an IPA character class.
17. **A check that enumerates languages reads `AVAILABLE_LOCALES`** — never a
    hand-written list. Every content gap this cycle found was a hand-written list
    of eight or ten that stopped being the truth when the eleventh language
    shipped.
18. **Per-language content is fetched, never bundled** — interface strings, word
    packs and letter explanations alike. Thirty-two languages on the critical
    path is 300 kB served to somebody who reads one of them, and it is what the
    first-load budget exists to catch.
19. **A language's limitations are stated before it is chosen** — the picker
    marks the rows whose word meanings are English. A gap the learner discovers
    on a word card is a different thing from a gap they were told about.

## Technical areas that are fragile

* **The stroke generator** (`scripts/build-stroke-assets.mjs`) — three
  interacting passes plus a settling loop; changing one constant moves geometry
  everywhere. It needs a server on port 4477 to build, which the script does not
  start and does not document. It is *less* fragile than last cycle only in that
  `strokes:visual` now tells you immediately when a change has broken something,
  and every fix this cycle came from reading its output rather than from
  guessing.
* **The authored skeletons** (`apps/web/src/data/strokes.ts`) — they are matched
  against a real typeface, so a polyline that disagrees with the face is a bug in
  the polyline. Two were wrong for as long as they have existed (ㅊ, ㅞ). Nothing
  checks them except the pixel QA, indirectly.
* **The hydration gate** — anything reading `vocabularyDay` before `ready`
  reintroduces the data-loss bug. `WordSessionPage` already did once.
* **The audio cache version** — a corrected clip only reaches learners because
  the cache key carries the audio build's date stamp.
* **Fire-and-forget writes** — a rejected write is invisible; a store failing
  mid-session is not currently detected.

## Highest-priority next development work

Commit (I-02), then rebuild the release from that tree (I-01) — in that order,
because rebuilding first produces a signed artefact that looks current and is
not. Then set the hand-off URL (I-03), which is one variable. Then the content
work: finish Vietnamese and Thai (I-07) and pin the taught senses (I-08).

## Files to inspect first

| Area | Path |
| --- | --- |
| Routes | `apps/web/src/App.tsx` |
| Home | `apps/web/src/pages/HomePage.tsx` |
| Letter lesson | `apps/web/src/pages/LetterSessionPage.tsx`, `features/learning/CharacterIntro.tsx` |
| Stroke renderer | `apps/web/src/ui/StrokeOrder.tsx`, `data/strokeAssets.ts`, `ui/strokeMarkers.ts` |
| Stroke generator | `scripts/build-stroke-assets.mjs` |
| Handwriting | `packages/handwriting-core/src/evaluate.ts`, `config.ts` |
| Vocabulary data | `apps/web/src/data/vocabulary.ts`, `data/generated/vocabulary*.json` |
| Vocabulary session | `apps/web/src/pages/WordSessionPage.tsx`, `domain/vocabularyDay.ts` |
| Word Detail | `apps/web/src/pages/WordDetailPage.tsx`, `data/relations.ts` |
| Saved Words | `apps/web/src/pages/SavedWordsPage.tsx` |
| Review | `apps/web/src/domain/{memory,review,plan}.ts`, `pages/ReviewPage.tsx` |
| Notebook | `apps/web/src/domain/mistakes.ts`, `pages/MistakesPage.tsx` |
| Persistence | `apps/web/src/store/LearnerProvider.tsx`, `storage/*` |
| Settings | `apps/web/src/pages/MyPage.tsx` |
| Localization | `apps/web/src/i18n/*`, `src/locales/*` |
| Themes | `packages/design-tokens/src/index.ts` |
| Deployment | `vercel.json`, `apps/web/public/_redirects`, `public/sw.js` |

---

# 44. Recommended next development pass

**Not to be implemented as part of this report.**

The previous report's recommended pass is done — the hand-off is built, the
purpose line ships, persistence is requested — with two exceptions that carried
forward because they are the same two P0s, and one decision that was deferred
again and should not be a third time.

## Goal

Get what is already fixed into a customer's hands, then stop the content from
being the thing that holds the product back.

## Scope

**1 · Ship what is already fixed.** Commit the cycle — 60 files. Rebuild and
re-sign the Android artefacts *from that commit*, not from the working tree.
Update `result/RELEASE_VALIDATION.md` and `build-info.json`. Verify by grepping
the packaged bundle for `capability-probe` and for a hint key, the same way this
report verified that the current artefacts lack them.

**2 · Turn the hand-off on.** Set `VITE_HANGYUL_URL` in the release build. This
is one environment variable and the entire feature is behind it; it renders
nothing today for exactly that reason.

**3 · Decide corpus delivery — a written decision, not code.** Deferred by the
last report and deferred again by this one. It is now being reported by two
independent budgets: the 298%-of-budget forecast at 10,000 words, and the
precache total that had to be raised from 800 kB to 840 kB purely to fit two
more languages. Per-category chunks, or on-demand fetch with an offline-first
cache. Record it in `docs/VOCABULARY_DATA.md`. **Do not author the remaining
7,419 words before this exists**, because the delivery mechanism decides how the
content has to be shaped.

**4 · Pin one taught sense per entry.** A `senseId` on every vocabulary record,
with the gloss, example, example translation, audio, relations and distractors
all derived against it. Eight entries currently contradict their own example
sentence in English; the same defect in a different form makes 쓰다 mean "write"
in Korean and "wear" in English. Fixing them one at a time fixes eight cards;
fixing the identity stops the class.

**5 · Finish Vietnamese and Thai vocabulary.** 2,081 words × 2 languages, keyed
by word id into `content/vocabulary/copy/`. Content work only — the pipeline
merges whatever is there and a missing word already falls back correctly.

## What is deliberately *not* in this pass

* **Another stroke fix.** The renderer is measured now. If it regresses,
  `strokes:visual` says so in the same run; if it does not, leave it alone.
* **A matching or keyboard-recall exercise.** It is the right next step for
  vocabulary variety, and it is a scheduling change — the plan is a per-word
  object and matching spans four. It deserves its own pass rather than being
  wedged into a release one.
* **Native-speaker review.** Necessary before a paid launch, not achievable by
  writing code, and tracked in `docs/LOCALIZATION_NATIVE_REVIEW.md`.

## Files affected

`result/`, `docs/VOCABULARY_DATA.md`, `content/vocabulary/copy/*.json`,
`packages/shared-types/src/index.ts`, `scripts/content/`.

## Expected customer improvement

Everything in §34 reaches an actual customer for the first time. A learner who
finishes the alphabet gets a next step. A Vietnamese or Thai learner stops
hitting English at word 501. Eight cards stop contradicting themselves.

## Acceptance criteria

* `git status` clean; `verify:quick` passes on the committed tree.
* Release artefacts rebuilt **from that commit**, and the packaged bundle
  verified to contain this cycle's code.
* The hand-off card appears on completing the fortieth letter, in all ten
  languages, and opens the configured URL.
* `vocabulary.vi.json` and `vocabulary.th.json` have 2,581 non-null rows.
* No entry's gloss contradicts its own example — checkable, and worth a check.
* The corpus-delivery decision is written down with its reasoning.

---

# 45. Technical appendix

## 45.1 Data model

| Type | Where | Key | Holds |
| --- | --- | --- | --- |
| `VocabularyWord` | `shared-types` | `id` | headword, romanization, POS, example, frequency, difficulty, category, syllables, required jamo, audio ids, sources |
| `HangulCharacter` | `data/characters.ts` | `character` | letter name, sound example, stroke count, group, translations |
| `StrokeAsset` | `data/generated/strokeAssets.json` | character | `viewBox`, `pen`, and per stroke `shape`, `draw`, `start`, `reveal` |
| `ItemProgress` | `progress` store | `${kind}:${itemKey}` | stage, attempts, passes, fails, trace/practice passes, demo seen, recognition passes, heard, learned, review due |
| `ItemMemory` | `memory` store | `${kind}:${itemKey}` | per-skill stability, last seen, lapses, confusion partner |
| `Mistake` | `mistakes` store | `${kind}:${itemKey}` | mode, skill, chose, answer, firstAt, lastAt, wrongCount, correctSince |
| `DailyPlan` | inside `settings` | — | date, goal, planned words with their steps, completed ids |
| `StoredSettings` | `settings` store | `preferences` | daily goals, saved items, appearance, voice, typeface, daily plan |
| `DailyActivity` | `activity` store | `YYYY-MM-DD` | per-day roll-up feeding streak and calendar |
| `LearningSession` | `sessions` store | id | kind, size, started/finished |
| `AttemptRecord` | `attempts` store | id | one review exercise; pruned |
| `PracticePlan` | derived, not stored | — | id, items, count, modes, source, emptyReason |

**Relationships.** `ItemProgress` answers *where is this learner with this item*;
`ItemMemory` answers *how well is it held right now*; `Mistake` answers *what
went wrong*. They are keyed identically and deliberately kept separate.

## 45.2 Storage schema

Stores: `meta`, `settings`, `progress`, `sessions`, `attempts`, `activity`,
`memory`, `mistakes`. IndexedDB structure version 2; the data schema version is
migrated separately by `runMigrations`, so a record-shape change does not need an
`onupgradeneeded` dance.

## 45.3 Content pipeline

```
content/vocabulary/entries/*.jsonl        editorial pack, hand-authored
        │  scripts/content/build_vocabulary.py
        ▼
apps/web/src/data/generated/vocabulary.json + vocabulary.<locale>.json

content-cache/relations-wikitext.jsonl    fetched, git-ignored
        │  scripts/content/build_relations.py
        ▼
content/vocabulary/relations.json  →  data/generated/relations.json

data/strokes.ts (order + direction) + Pretendard
        │  scripts/build-stroke-assets.mjs   (needs a server on :4477)
        ▼
data/generated/strokeAssets.json

speech plan  →  Azure Neural TTS  →  public/audio/*.mp3 + manifest.json
```

## 45.4 Release status

| Artefact | State |
| --- | --- |
| Web build | current, deployable |
| `result/hangyul-ganada-release.apk` | built from `6fa90bb` + this cycle's patch, **current**, 63.4 MB |
| `result/hangyul-ganada-release.aab` | built from the same tree, **current**, signed, 62.2 MB |
| `app_result/` | the same two binaries with their checksums and a README |
| Signing identity | `157a2bb133f6aa3d…` — unchanged from every previous release |
| iOS `.ipa` | **not built** — needs macOS, Xcode and an Apple Developer signing identity. Not faked; see §2.2 |

Eight blockers are recorded in `result/BUILD_OR_SIGNING_BLOCKERS.md`; six are
external (credentials, hosting, a designer, human testing) and none is a code
problem. The iOS one is the only one that stops an artefact existing at all, and
it is a property of the machine rather than of this codebase: the Xcode project
is complete and is delivered.
