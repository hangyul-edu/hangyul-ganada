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
| the other 27 | Technically clean, warnings triaged, **prose not read by a speaker**. |

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
