# Web release notes — 1.0.5

> Web product only. The Android and iOS projects were **not modified or built**
> in this release; the delivered native artefacts remain at 1.0.4, versionCode
> 25 / build 25. The web-facing marketing version is `v1.0.5`
> (`apps/web/src/config/product.ts`), and the version gate now lets the web
> release lead the native one while refusing to let it fall behind. See
> `docs/WEB_PRODUCT_CRITICAL_AUDIT_v1.0.5.md` for the audit this release came
> out of, `docs/WEB_QA_EVIDENCE_v1.0.5.md` for what was run, and
> `docs/WEB_UX_CONTENT_REMEDIATION_LEDGER_v1.0.5.md` for every finding.

## What a learner will notice

- **Try again gives a fresh canvas.** After a rejected letter, the second
  attempt is graded on its own ink; it was graded on the rejected ink plus the
  new stroke, so a correct second attempt could read *Incorrect*.
- **Matching says how many pairs were right.** After *Check*, a partly right
  grid reads "3 of 4 pairs right." in the learner's language instead of a bare
  *Incorrect*.
- **A gap-fill blank is announced.** The blank in a context question is read
  by a screen reader as "blank"; the label was on an element assistive
  technology ignores.
- **Level Test clock.** The remaining time no longer shows 8:01 or a stale
  minute on the first tick.
- **Numbers verdicts** use the same *Correct* / *Incorrect* copy as every other
  exercise (the Numbers-only wording is gone from all 32 languages).
- **Page not found** has a heading and the app header, not an empty title.
- **Hangul complete → words.** When the letters are finished, the next-step
  card sends the learner to *Words* inside the product; it no longer points at
  a URL the product does not own.
- **Language screen.** The "some words are shown in English" footnote appears
  only when a listed language really lacks word copy.
- **Layouts at 200 % text and in long-word languages.** Word categories, the
  progress bar label, the bottom tabs and conjugation rows no longer overflow
  at 320 px with doubled text; the tab label *My Learning* no longer breaks
  inside the word; the Numbers course list no longer pans sideways in
  German; a full-width button whose label is longer than the screen takes
  two lines instead of widening the page and cutting the lesson counter off;
  the reset dialog's two answers stack when they must. Search results clamp
  to two lines instead of a cut-off ellipsis; the word search field shows a
  focus ring.

## Content

- 30 English card glosses that were dictionary definitions are now glosses
  (*coffee, especially the beverage* → *coffee*; *unweaned baby, child* →
  *baby*; *older brother of a male* → *a man's older brother*) and 24 more words gained a
  *More about it* note in 32 languages — 99 words carry one now.
- Vocabulary levels re-calibrated at the source: the frequency reader now
  credits a verb's conjugated and contracted forms by form class instead of
  over-crediting shared strings (있다 is rank 1, not 118th; 잇다, 잘다 and 싸다
  are retired from the taught list). 419 of 3,370 words changed level
  (179 harder, 240 easier); the 161 anchor words held. `npm run
  frequency:check` pins 96 fixture forms.
- 17 new curated beginner gap-fills (gap-fills 510 → 531; levels 1–5: 36 → 53 after the level re-calibration), each with its own
  recorded sentence in both voices; a curated context question now plays its
  own sentence, never the card's example.
- The 거울 distractor 방 was replaced (수건).

## Child safety

- Spelled-out Hangul (ㅅㅔㄱㅅㅡ), a loose final after an open syllable
  (세ㄱ스), NFD text, and Latin-script terms hidden in a Korean, Japanese or
  other non-Latin field (우리 sex 하자, a `casino` option) are now refused;
  internationally borrowed profanity (`fuck`, `shit`, `porn` …) is refused in
  every language. 9 negative and 4 positive fixtures were added; both the
  TypeScript evaluator and its Python twin agree on all 368.
- The curriculum export's translated notes are scanned as their own language
  (a German note's "die" is an article).

## Gates and measurements

- Four "200 % text" checks (`screens:audit`, `modals:qa`,
  `accessibility.spec`, `confirm-dialog.spec`) measured normal-size text —
  root font-size and `text-size-adjust` do nothing to px design tokens on
  desktop Chromium — and eight of the nine sites corrected in 1.0.4 were
  injecting their token sheet before the document existed, so they measured
  normal text too. One shared injector now applies at `DOMContentLoaded`,
  every scaled check reads back the scale it got and refuses an unscaled
  page, and `screens:audit` gained a 320 px profile at 200 % (166 renders).
- A regression test seeds a Numbers session with stored attempts and proves
  the first question is built from the stored count (I-204 could not be
  reproduced: the phase has been gated on hydration since 8b489ebe).
- Version gate: web 1.0.5 may lead native 1.0.4; a web version behind native,
  or a missing `docs/WEB_RELEASE_NOTES_v1.0.5.md`, fails it.

## Not in this release

- Native deliveries (Android versionName/versionCode, iOS
  MARKETING_VERSION/CURRENT_PROJECT_VERSION) are untouched; no store build.
- Native-speaker review of the 30 non-Korean, non-English child-safety lists
  and of the 31 non-English packs remains external.
