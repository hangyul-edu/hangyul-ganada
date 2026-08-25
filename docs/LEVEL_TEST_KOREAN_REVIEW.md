# Korean review ledger

What has been read, by whom, and by what method. One row per dimension.

**No Korean native speaker has reviewed any part of this corpus.** Every row
below whose reviewer is `assistant` was read by an AI assistant against
published references, and every row whose reviewer is `gate` was checked by a
program. Neither is a native reading. Nothing in this repository — not a green
gate, not a full-corpus pass, not this file — may be quoted as evidence that the
Korean sounds natural to a Korean.

This file is read by `npm run korean:education:qa`, which refuses to pass if a
gate has no row here or if a row claims a native reviewer without naming one.

<!-- ledger:start -->

| dimension | id | population | read | method | reviewer | last pass |
| --- | --- | --- | --- | --- | --- | --- |
| Conjugation on word cards | morphology | 1,458 inflecting words × 9 forms | all | every generated form re-derived from the stem class and compared against the editorial pack's own recorded surface form on 1,455 of them, plus 180 hand-written fixtures; a form wearing the honorific is now held to the honorific rather than to the stem | gate + assistant | 2026-08-25 |
| Dictionary inflection | dictionary-morphology | 30,282 entries | all | stems checked for shapes no Korean verb can take | gate | 2026-08-25 |
| Level Test bank, structure | level-test | 4,166 items | all | answer present, level assigned, options distinct | gate | 2026-08-25 |
| Level Test bank, one-answer | ambiguity | 566 contextual items | all | 13 rules over particle, semantic class, conjugated surface, plus 6 photographed regressions; rebuilt this cycle after the bank was found holding 치닫아요 | gate + assistant | 2026-08-25 |
| Daily and review gap-fills | daily-vocabulary | 536 cloze frames | all | built from the same anchors as the bank, then re-read as four composed sentences each | gate | 2026-08-24 |
| Learner safety, words | safety | 3,221 taught words, 4,166 bank options | all | 65 excluded terms and 14 never-standalone terms, matched whole-word | gate | 2026-08-25 |
| Learner safety, sentences | safety | 2,024 contextual + 2,144 gap-fill compositions | all | 6 frame rules over 234 classified nouns, run on the composed sentence | gate | 2026-08-24 |
| Teaching examples | examples | 3,221 examples | all | 2,856 read one at a time in an earlier pass, 60 then, and the 273 authored in this one read the same way — 33 refused by the gate and rewritten, 43 of those a German or French translation inventing a gender the Korean does not have | assistant | 2026-08-25 |
| Example structure | examples | 3,221 examples | all | headword present, level respected, one clause style, no invented person | gate | 2026-08-25 |
| One card, one sense | senses | 3,221 headwords × 10 complete locales, and the 600-word core band in 22 more | all | every translation checked against the taught sense, not the headword; a word carrying the long definition in English must carry it in every language that has written that word | gate | 2026-08-25 |
| Request forms | morphology | 1,062 verbs | all | the `-아/어 주세요` row of every verb read by the assistant; `packages/korean-morphology/src/request.ts` is the result | assistant | 2026-08-24 |
| Pack completeness | pack | 32 locale packs | all | every locale that declares itself complete is complete, and the rest declare what they are | gate | 2026-08-24 |
| Word detail rows | word-detail | every taught word | all | each promised row present and non-empty | gate | 2026-08-24 |
| Romanisation | romanization | 3,221 headwords | all | Revised Romanization re-derived, 41 rule fixtures, 540 against an authoritative pronunciation | gate | 2026-08-25 |
| Gendered attribution | examples | 66 examples naming a person, 6 languages of translation | all | counted by domain and by marker; 125 French and German translations rewritten to stop inventing a third person, 10 Korean examples rebalanced | assistant | 2026-08-24 |
| Word meanings, 22 partial languages | — | 600 words × 22 languages, 22,638 strings | none | written by the assistant this cycle; script and completeness checked by a gate, prose read by nobody | nobody | never |
| Naturalness | — | everything above | none | — | nobody | never |

<!-- ledger:end -->

## What the last row means

Every other row in this table is decidable: a program or a careful reader can
say yes or no and be right. Naturalness is not. 저는 매일 물을 마시는 것을
합니다 satisfies every row above and is not a sentence anybody says.

The route to closing that row is a Korean native speaker reading the corpus,
locale by locale, and signing for it. `docs/LOCALIZATION_NATIVE_REVIEW.md`
records the same gap for the other thirty-one languages.
