# 32 UI locales — linguistic review state

**What this file is.** A per-locale record of what has been read, what was
changed, and what is still only *measured*. It is a checkpoint for the pass, not
a claim of quality.

**Native review status: NOT VERIFIED, in all 32.** No locale in this product has
been read by a native speaker, including Korean and English. Nothing in this
file, `docs/report.md` or `docs/issues.json` may say otherwise. A model-based
editorial pass is not a signoff — see §10.4 of the brief and
`docs/LOCALIZATION_NATIVE_REVIEW.md`.

## Technical QA — measured, all 32

| Check | Result |
| --- | --- |
| `i18n:check` — key parity both directions | pass |
| `locale:content:check` — no locale falls back silently | pass |
| `copy:audit` — forbidden claims, implementation words, answer restatement | 0 errors |
| `locale:editorial` — register, split translations, typography, label length | 0 errors, 37 warnings for a person |
| `qa:locales` — 32 languages × 8 screens = 256 renders | no measurable problem |
| `screens:audit` — 7 device profiles × 23 screens and states | clean |

## Script rendering — checked by rendering, not by assuming

**Tamil was broken, and it was the font stack.** Rendered at 390 px, ை (U+0BC8)
came out as a detached mark: சொற்களைப் drew as சொற்கஉளப், நிலையை as நிஉலயை.
The strings are correct in `apps/web/src/locales/ta/*.json` — the shaping was
wrong. Reproduced at 34 px against three faces:

| Face | சொற்களைப் கல்லைத் நிலையை |
| --- | --- |
| Noto Sans Tamil UI | correct |
| generic `sans-serif` on this machine | wrong — ை detached |
| DejaVu Sans | wrong — ை detached |

The product's stack ended at the generic `sans-serif` keyword, so on any
platform whose default resolves to DejaVu the vowel sign is mis-shaped. Android
and iOS resolve it to a face with a correct Noto chain and were never affected;
a desktop Linux browser reading the PWA was. Fixed by naming the Noto UI
families for the scripts Pretendard does not cover, ahead of the generic
keyword — a preference list, not a download, and nothing is fetched.

| Script | Rendered and read after the fix |
| --- | --- |
| Tamil | correct ligatures, no tofu, no clipped marks |
| Arabic | RTL correct; wordmark, Hangul and the Latin quotation stay LTR inside it |
| Korean, Japanese, Chinese | correct |
| Thai, Telugu, Bengali, Hindi, Greek, Kazakh, Kyrgyz, Mongolian | rendered in `qa:locales`, no measurable problem |

## Copy read in context

| Locale | State |
| --- | --- |
| `ko` | **Read on the rendered screens.** Three defect classes found and fixed — 단어/어휘, 낱자/글자, 해요체/합쇼체 — all three now gated in `locale:editorial`. See `docs/report.md` §23.3. |
| `en` | **Read.** Capitalisation reconciled (`Vocabulary level`), one redundant line removed, the verdict wording unified. |
| `fr` `de` | Subject-pronoun question in example sentences re-opened; see below. |
| `ta` | Rendering fixed. Prose not read by a speaker. |
| `pt-BR` | **Re-read, and the whole vocabulary pack was the wrong Portuguese.** See below. |
| `zh-CN` `ja` `ar` | Brand strings only: each had invented a name for the product. Fixed and gated. |
| the other 24 | Technically clean, warnings triaged, **prose not read by a speaker**. |

## The two findings that a technically clean locale still had

**`pt-BR` was written in European Portuguese, for four batches.** The locale is
pt-BR and the pre-existing pack is unambiguously Brazilian — você ×44, trem,
celular, banheiro, resfriado, xícara — and every entry authored during this pass
drifted European: 143 strings of *telemóvel*, *comboio*, *palavra-passe*,
*porta-bagagens*, *estou a aprender*, *toda a gente*, enclitic *doem-me*. Two of
them taught the wrong word outright: **camisola**, given as the meaning of
스웨터, is a nightgown in Brazil, and **constipação**, used for 독감's symptoms,
is constipation. All 143 rewritten, plus *autocarro* and *o teu livro* which
predated the pass, and 컴퓨터's *computadora* — the pack's Spanish being
Peninsular (coche ×11, autobús ×14, patata, gafas, conducir).

Spanish and Chinese were checked the same way and are consistent: the Spanish
batches used móvil, patata and billete, matching, and there is no traditional
character anywhere in the zh pack.

**Nothing was reading for this, and nothing is now.** It was caught by
`content:qa`'s meaning-collision warning — five words had become *antes* — which
is a warning about learnability that happened to point at a register defect four
batches late. A gate for "this locale is written in the wrong variety of its
language" is not obviously writable; the marker list used here is in
`docs/final-launch-audit.md`.

**Four locales had invented a brand**, against a policy `config/product.ts`
states in its opening comment. Korean misspelled its own official name — 한글
가나다 for 한귤 가나다, the writing system for the brand — Chinese showed that
same wrong Korean to a reader who cannot read it, Japanese said ハングルガナダ on
one screen and ハンギュル on another, and Arabic had transliterated the family
name five times. `name:check` now reads every locale bundle and fails on a brand
spelling the config does not define for that locale.

## Open linguistic risks

1. **123 French and German example translations** carry a third person the
   Korean does not have. Neither language has a non-gendered third-person
   singular and in both the masculine is the unmarked form, so this is a
   judgement for a speaker of each rather than a mechanical substitution.
   `examples:qa` gates the five languages where it *is* decidable.
2. **37 `locale:editorial` warnings** — mostly split translations, where one
   English string has two renderings in one language. Several are correct
   (a compact row label beside a dialog button); the rest need a reader.
3. **No native review anywhere.** I-17.
