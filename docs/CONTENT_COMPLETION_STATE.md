# Content completion state — 32-locale paydown

Frozen corpus: **3,333 words** (3,334 at freeze minus 숙다, retired in the
headword audit — bare form not living usage; 숙이다 is taught). No new word
until 32/32 complete.
Missing per partial locale at start: 2,734 rows + 36 More-about-it notes.
Pipeline: scratchpad `tx/` — slim-0..3.jsonl (source), exemplars-<loc>.json,
PROMPT.md (agent contract), validate.py (merge gate), merged-<loc>.json (output).

| locale | generated | validated | reviewed | merged into copy/ | notes |
| --- | --- | --- | --- | --- | --- |
| ar bn cs el fil hi hu id it kk ky mn nl pl ro ru sv ta te tr uk uz | — | — | — | — | — |

Next action: wave generation (4 slices/locale), then validate.py, then per-locale
adversarial review sample, then merge + notes, then gates.
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
