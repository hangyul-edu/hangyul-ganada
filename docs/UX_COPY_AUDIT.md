# UX copy audit — September 2026

A reading of every learner-facing string, in the pass that began with a
customer's screenshot of *이번 주에 32개를 첫 번에 떠올렸어요*. This document
records what was read, by what method, what was found, and what was changed;
the changes themselves are in `docs/UX_COPY_REMEDIATION_LEDGER.md` and the
rules they were held to are `docs/UX_COPY_STYLE_GUIDE.md`.

## 1. What "every learner-facing string" is

| Surface | Where it lives | Count | How it was audited |
| --- | --- | --- | --- |
| Interface strings, Korean | `apps/web/src/locales/ko/*.json` (11 namespaces) | 881 | **Read in full, string by string**, in this pass; every row carries a reading in `docs/copy-audit-ko.json` and `copy:ledger:check` fails on any string whose text changes without a new reading |
| Interface strings, English (source) | `apps/web/src/locales/en/*.json` | 902 | Read in full in this pass; English is the fallback every other bundle ends at |
| Interface strings, the other 30 languages | `apps/web/src/locales/<code>/*.json` | 26,794 | Machine-checked in every language (`copy:audit`: forbidden claims, placeholders, unresolved interpolation, scolding vocabulary; `locale:editorial`: register consistency, terminology, source-language leakage; `i18n:check`: coverage, plural categories, unused keys). **Read by hand only where this pass wrote or changed them** — the 720 rows in the remediation ledger — and not otherwise; this document does not claim a native reading of 26,794 strings |
| Headings, buttons, instructions, empty states, errors, hints, explanations, assessment instructions, accessibility labels, progress and streak summaries, recall statistics | All inside the bundles above; each namespace is one surface (`home`, `learning`, `handwriting`, `vocabulary`, `activity`, `settings`, `levelTest`, `numbers`, `errors`, `common`, `navigation`) | included above | As above; `hints:qa:check` proves no hint template reveals its answer in any language; `copy:generated:check` proves no generated feedback composes a sentence that restates an option |
| Definitions, examples, example translations | `apps/web/src/data/generated/vocabulary.<locale>.json` — 3,370 words, 24 translated packs | 3,370 × (gloss + example) × 24 | Not re-read in this pass. Held by the existing content gates: `vocabulary:qa`, `vocabulary:sense:qa`, `vocabulary:translation:check`, `translation:semantics:check`, `examples:qa`, `copy:fresh:check` (every translated example was written against the Korean sentence the corpus still carries), and the child-safe content policy (`content:safety:check`). See `docs/CONTENT_QUALITY_AUDIT.md` |
| Number-learning content and explanations | `numbers` namespace (lessons, glosses, examples, notes) | 292 (ko) | Read in full in Korean; `numbers:copy:check` holds the two number-set names in every language and forbids a retired sentence returning |
| Generated text templates | hint ladder (`features/review/hints.ts`), stroke guides (`handwriting:strokeGuide.*`), Korean particles (`{{word, eunneun}}`) | — | `hints:qa:check`, `copy:generated:check`, `josa.test.ts` |
| Native strings | Android `values-*/strings.xml`, iOS `*.lproj/InfoPlist.strings` | 2 per locale | Only the launcher label; generated from `app.identity.json` by `locales:native` and held by `mobile:identity:check` |
| Notifications | none — the reminder feature was removed with its permission | 0 | `AndroidManifest.xml` requests no notification permission |
| Hardcoded strings in components | none reachable: `i18n:report` proves every key in the source has a bundle and every bundle key a use; JSX literals are limited to symbols (·, —, /) | 0 | `i18n:check` |
| Store listing and release notes | `store/` | 8 languages | `store:check` |
| The two new quotations, 32 translations each, with bylines | `apps/web/src/data/quotes.ts` | 64 + 64 | Read row by row; `docs/QUOTE_TRANSLATION_AUDIT.md` |

## 2. Method

1. Every Korean and English interface string was dumped to a table and read
   in sequence, namespace by namespace, against the screen it appears on
   (the component that calls the key was located for each rewrite).
2. Each was judged on the criteria the request names: grammar, spacing,
   natural Korean, collocation, register, meaning, **metric accuracy** (does
   the sentence describe what the code computes), concision, consistent
   terminology, interpolation and plural handling, truncation risk.
3. Where a sentence describes a number, the code that produces the number
   was read first (`domain/review.ts`, `domain/vocabularyDay.ts`,
   `domain/activity.ts`) and the sentence was held to it.
4. Every change was made in the source bundle, propagated to all 32 locales
   where the string exists in all 32, re-read there, and recorded with a
   reason in the remediation ledger; the Korean reading ledger was re-run so
   the changed rows carry `rewritten` and a `why`.
5. The gates were run after every batch: `copy:audit:check`,
   `copy:ledger:check`, `copy:generated:check`, `copy:fresh:check`,
   `locale:editorial:check`, `locale:content:check`, `numbers:copy:check`,
   `hints:qa:check`, `i18n:check`. All green at the end of the pass.

## 3. Findings

### 3.1 Metric accuracy — the reported sentence

`activity:memory.firstTry` read *이번 주에 32개를 첫 번에 떠올렸어요* in Korean
and *You remembered 32 things on the first try this week* in English. The
metric behind it (`weeklyInsights` in `domain/review.ts`) counts **attempts
in the last seven days that passed with no hint used**. It is not a
first-attempt count: a word answered wrong and then right without a hint is
counted, because the attempt row carries no recovery flag. Nor is it
"immediate recall": response time is not consulted. So both of the request's
candidate wordings would have been inaccurate, and the sentence now says what
is measured — *이번 주에는 힌트 없이 32개를 맞혔어요* / *You got 32 right without
a hint this week* — in all 32 languages. `첫 번에` is gone.

The section heading over it, `activity:memory.title` *얼마나 잘 떠오르는지*, is
an unfinished clause; it now reads *얼마나 잘 기억하고 있는지*, which is what the
three notes under it are about (unaided answers, strongest skill, a
confusion that is clearing). The metric was left as it is: it is a sound
measurement and the fix was to describe it, not to change it.

### 3.2 Instructions that named the goal rather than the action

* `learning:review.prompt.build` *단어를 맞춰 보세요* → *아래 음절을 순서대로
  눌러 단어를 완성하세요* (32 locales). The word for the tile is 음절, the app's
  term for the block, which `locale:editorial:check` enforces.
* `learning:review.prompt.match` *단어와 뜻을 짝지어 보세요* → *왼쪽에서 한국어
  단어를 먼저 누른 다음, 오른쪽에서 알맞은 뜻을 선택하세요* (32).
* `learning:review.matchPickWord` *한국어 단어를 골라요* — the fragment the
  customer photographed — → *먼저 왼쪽에서 한국어 단어를 누르세요*; and
  `matchPickMeaning` now names the held word (32).

### 3.3 Fragments, collocations and labels (Korean)

| Key | Was | Now | Why |
| --- | --- | --- | --- |
| `activity:week.quiet` | 이번 주는 아직이네요. 시간은 남았어요. | 이번 주에는 아직 기록이 없어요. 아직 시간은 있어요. | elliptical fragment |
| `numbers:status.review_due` | 복습할 때 | 복습 필요 | a clause used as a status label |
| `numbers:lesson.counters.step2` | …사람도 사람을 세는데, 조금 덜 격식적이에요. | …사람도 사람을 세는 말인데, 명보다 조금 편한 말이에요. | ungrammatical fragment |
| `numbers:lesson.pitfalls.step2` | …세는 말 앞은 띄어쓰기. | …세는 말 앞은 띄어 써요. | noun fragment among sentences |
| `vocabulary:today.doneBlurb` | 오늘 몫은 끝났어요. | 오늘 분량은 다 했어요. | odd collocation |
| `vocabulary:saved.order.needed` | 약한 것부터 | 복습이 필요한 순 | does not say what is weak |

### 3.4 Register

`locale:editorial:check` caught two of this pass's own new strings addressing
the reader politely in bundles that use the familiar form (Indonesian *Anda*,
Mongolian *та*); both were rewritten to the bundle's register before commit.
No pre-existing register mix was found in any language.

### 3.5 The version line

`settings:about.version` (*Version {{version}}*, 32 locales) was removed: the
version is rendered by `displayVersion()` as `v1.0.4` in one place, so the
learner-facing form cannot drift between languages or from the number the
stores carry.

### 3.6 Strings read and left alone

The remaining 869 Korean strings were read and kept. Notable cases that were
considered and deliberately not changed:

* `learning:review.markWrong` *내가 고른 답, 틀렸어요* — screen-reader text after
  a wrong pick; terse by design, reads correctly when announced.
* `levelTest:unavailable` / `vocabulary:dictionary.unavailable` — say a first
  open needs a connection. True only on the web (the native bundle ships the
  data) and the strings are reached only when the fetch fails, so they are
  accurate where shown.
* `settings:language.meaningsBody` *…{{language}}(으)로 보여줘요* — 보여줘요 is
  the accepted attached spelling of the auxiliary.
* The Numbers lessons' phonetic notes (십육 → 심뉵, 열여섯 → 열려섣) were checked
  against standard pronunciation and are correct.

### 3.7 Translations (the other 30 languages)

The 720 ledger rows this pass wrote in every language were each read at the
time of writing, at the bundle's register, and checked by the gates. Beyond
those rows, the 26,794 pre-existing strings were **not** individually re-read;
they are covered by the machine gates listed in §1 and by the earlier
reviews in `docs/i18n-quality-review.md` and `docs/LOCALIZATION_NATIVE_REVIEW.md`.
No gate finding was open at the end of the pass. This is stated so that the
scope of "audited" is not larger than the work done.

### 3.8 The quotations

Both requested quotations were translated into all 32 languages and read row
by row against the criteria in the request; nine translations were corrected
in the reading and twenty-one rows are marked for native-speaker
confirmation. The full table, one row per locale per quotation, is
`docs/QUOTE_TRANSLATION_AUDIT.md`.

## 4. Totals

| | |
| --- | --- |
| Korean interface strings read | 881 (all) |
| English interface strings read | 902 (all) |
| Korean strings rewritten in this pass | 13 keys |
| Keys rewritten in all 32 locales | 5 (`activity:memory.firstTry`, `learning:review.prompt.build`, `learning:review.prompt.match`, `learning:review.matchPickWord`, `learning:review.matchPickMeaning`) |
| Keys added in all 32 locales | 18 (the reveal card, the tray, the grid) |
| Keys removed in all 32 locales | 2 (`settings:about.version`, `learning:review.buildRemove`) |
| Quotation translations corrected | 9 |
| Ledger rows (string × locale) | 752 |
| Gate findings open at the end of the pass | 0 |
| Strings with a recorded human (non-model) native review | 0 — none is claimed |

## 5. What remains for a person

* A native reading of the 30 non-Korean, non-English bundles beyond the rows
  this pass wrote. The gates hold shape, register and coverage; they do not
  hold idiom.
* The 21 quotation rows marked *NATIVE-SPEAKER REVIEW REQUIRED*.
