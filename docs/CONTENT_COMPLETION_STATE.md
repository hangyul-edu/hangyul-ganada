# Content completion state — 32-locale paydown

## Done. The freeze is lifted.

`locale:content:check` reads **32 complete · 0 partial**, and 12,800 simulated
questions across the thirty-two languages are all askable with none refused for
want of a meaning. The corpus freeze that this file existed to enforce — *no new
word until 32/32 complete* — was lifted the moment that line first printed, and
sixty words were added immediately after. The corpus is **3,393 words**.

What the last twelve locales cost, on top of the 2,724 meaning rows and 2,724
example translations each:

* **36 More-about-it notes** per locale, hand-written, as `vocabulary:sense:qa`
  requires of any language claiming to be complete.
* **192 example-translation collisions** — two Korean sentences arriving at one
  target sentence in a language where the English pack keeps them apart. Every
  one was given a distinct sentence on the distinction its own Korean makes.
  None was moved to `shared-translations.json`.
* **43 polarity and question findings** from `translation:semantics:qa`. Forty
  were content: «Lütfen arkadaşına ihanet etme» became «etmeyin», which is the
  politer register the Korean asks for *and* a form the gate can see. One was a
  real defect — 어쩌다 이렇게 됐어요? had become a Turkish statement. Three were
  the gate's fault: Kyrgyz harmonises the negative suffix across four vowels and
  the marker list enumerated two, so «Коркпоңуз» read as having lost a negation
  it plainly carries. The class was completed rather than the Kyrgyz bent.
* **Twelve gloss collisions that were mistranslations**, not honest merges:
  아저씨 as «amca» (uncle) in Turkish, 탐정 as «тыңшы» (spy) in Kazakh, 알아채다
  as «கவனித்துக்கொள்» (to look after) in Tamil.

The historical record of how the twelve were filled follows.

---

Frozen corpus: **3,333 words** (3,334 at freeze minus 숙다, retired in the
headword audit — bare form not living usage; 숙이다 is taught). No new word
until 32/32 complete.
Missing per partial locale at start: 2,734 rows + 36 More-about-it notes.
Pipeline: scratchpad `tx/` — slim-0..3.jsonl (source), exemplars-<loc>.json,
PROMPT.md (agent contract), validate.py (merge gate), merged-<loc>.json (output).
Latest QA baseline: verify:quick green at f4b80943; report-truth commit cd4e1a88.

## Session-limit interruption record (window 1)
The first generation wave hit the account session limit; 18 agents died
mid-write. All partial outputs were kept (monotonic, no dupes), PROMPT.md
gained a resume-from-last-index rule, and every dead job was relaunched with
resume. Complete at interruption: ru-0, it-3 (+6,803 rows on disk total).

## Session-limit interruption record (window 2)
The second wave — el 2–3, fil 0–3, hi 0–3, hu 0–3, id 0–3 — was killed by the
account session limit with one slice (el-1) finished. Fifteen partial slice
files were re-parsed on resume: every line valid JSON, indexes strictly
monotonic, no duplicates, nothing discarded.

## Resumed pass, 27 August 2026
Sequential from here: one translation agent at a time, its output validated and
merged before the next is started. `docs/resume-manifest.json` is the checklist;
this file is the narrative.

Completing a locale costs more than 2,733 meaning rows, and each of these was
found by a gate rather than predicted:

* **36 notes.** `vocabulary:sense:qa` requires that a word carrying the *More
  about it* paragraph in English carries it in any language claiming to be
  complete. Written by hand per locale, not generated.
* **~15 example-translation collisions.** Two different Korean sentences
  arriving at one target sentence. `vocabulary:translation:check` finds them;
  each is separated on the distinction its own Korean makes.
* **Occasional two-sense glosses**, trimmed to the sense the card teaches.
* **A semantics warning or two**, where the language absorbs a Korean negative
  idiomatically. Either the marker list learns the word or the exception ledger
  records the reading.

**Regenerate the packs after merging.** `content/vocabulary/copy/*.json` is
source; `apps/web/src/data/generated/` and `apps/web/public/corpus/` are build
output, and nothing in `verify:quick` compared them until this pass added
`content:fresh:check`. Five locales sat complete in source and 600 rows deep in
the shipped app for two commits because of it.

**Installed app name.** The launcher label is `Hangyul Ganada`, title-cased,
and lives in `apps/mobile/app.identity.json`; `scripts/check-mobile-identity.mjs`
holds the eight files that carry it in step. The prose product name is unchanged
and stays `Hangyul ganada` everywhere else — 가나다 is a word, not three
initials, and `scripts/check-product-name.mjs` still forbids the title-cased
spelling outside those four native strings.


## The sixty words that followed, 6 September 2026

The freeze existed so that a corpus growing under twelve half-written packs
could not make the gap permanent. With the gap closed, sixty entries were
authored against the top of the level scale, which is where the course runs out
first: `docs/report.md` §8 and issue I-79 measure a learner at the top of the
scale exhausting the new-word supply in about five weeks.

Forty-eight of the sixty landed at levels 28–30 and eleven more at 27, taking
the top band from **477 to 524 words**. Level assignment is computed from
frequency, usefulness, concreteness, length and irregularity — it is not
declared — so where a word lands is a measurement, not a choice, and these are
reported as measured.

Each entry cost, in the unit the work is actually done in: one Korean headword,
one example sentence, an English gloss, meanings in ko/ja/zh/es/fr/de/pt,
sentence translations in en/ja/zh/es/fr/de/pt, and a meaning plus an example
translation in each of the twenty-four copy locales — **63 authored strings per
word**, 3,780 for the batch, plus 240 new pronunciation clips in two voices.

`preflight_batch.py` refused two of them before any build ran: 불가피하다 is five
syllables where the pack takes one to four, and a French translation invented a
subject the Korean does not have. Both were fixed at the cost of one preflight
run rather than one pipeline round trip, which is what that script is for.
