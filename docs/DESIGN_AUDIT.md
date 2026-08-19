# Hangyul Design Audit — source of truth for Hangyul ganada

Extracted from `앱서비스 디자인_최종안.pdf` (547 pages, Figma export, artboards **375 × 812 pt**).
Working copy of rendered reference pages lives in `docs/design-refs/`.

| Ref page | Screen | What it establishes |
| --- | --- | --- |
| `p011` | Component sheet | buttons, chips, badges, inputs, checkboxes, cards |
| `p092` | Home | streak card, folder-tab card, circular gauge, primary CTA, bottom nav |
| `p119` | Learning stats | warm stat card, bar chart, dropdown pill |
| `p229` | Custom learning | folder tabs, mascot ground, warm gradient |
| `p235` | Session — correct | blue-bordered feedback card, linear progress, count pill |
| `p237` | Session — incorrect | red-bordered feedback card, mint blank fill, secondary buttons |
| `p243` | Session complete | celebration modal, dashed ring, +P badge |
| `p294` | Level / goal select | numbered sections, selection tiles, fixed bottom CTA |

## 1. Colour

Values below marked **(spec)** come from the PDF colour page; values marked **(sampled)** were read
pixel-by-pixel out of rendered screens, because the spec page only documents the core ramp.

### Core (spec)

| Token | Hex |
| --- | --- |
| Primary | `#FF6700` |
| Secondary / mint | `#66CCCC` |
| Black | `#000000` |
| Gray 900 (text) | `#262C31` |
| Gray 700 | `#5A636A` |
| Gray 600 | `#778088` |
| Gray 400 | `#ADB4BA` |
| Gray 200 (border) | `#E6E8EB` |
| Gray 100 (bg) | `#F2F4F5` |
| White | `#FFFFFF` |
| Positive | `#547CF1` |
| Negative | `#F24147` |

### Primary tint ramp (spec)

`#FF6700` → `#FF8700` → `#FF9900` → `#FFAC00` → `#FFBA00` → `#FFC41F` → `#FFD04A` → `#FFDC7E` → `#FFEAB1` → `#FFF7E0`

### Warm surfaces (sampled)

| Token | Hex | Where |
| --- | --- | --- |
| `warm-50` | `#FFF8F1` | stat cards, warm page tint (p092, p119) |
| `warm-100` | `#FFEFE5` | selected tile background (p294) |
| `warm-200` | `#FFDCC2` | mascot ground / bottom gradient end (p229) |
| session gradient | `#FFFEFC` → `#FFEAD1` | learning-session page background (p235) |
| card gradient | `#FFFFFF` → `#FFF2E0` | featured learning card, top → bottom (p092) |

**Key finding:** Hangyul's warmth comes from *surfaces*, not from more orange. Orange is reserved for
the primary action, the progress arc, active nav, and numerals. The page itself is white drifting to
peach.

**Key finding:** shadows are **warm-tinted**, not neutral grey. Sampled shadow peak under the home
cards is `#C4B6A6` on white — a neutral `rgba(0,0,0,.1)` looks visibly wrong next to the reference.

**Key finding:** the primary CTA is **flat `#FF6700`** — no gradient. Sampled across the whole
button face on p092.

## 2. Typography

The PDF embeds Type-3 subsetted fonts with no usable names, so the exact UI face cannot be read out
of the file. The letterforms match **Pretendard**, which is the de-facto Korean product UI face and
is OFL-1.1 licensed — adopted here. Scale measured off the 375 pt artboards:

| Role | Size / weight |
| --- | --- |
| Featured card title (`실전 회화`) | 28 / 700 |
| Page heading | 20 / 700 |
| Nav bar title | 17 / 600 |
| Body | 15–16 / 400–500 |
| Button label | 16–17 / 700 |
| Caption | 13 / 500 |
| Nav label, micro | 11–12 / 500 |

Numerals inside progress gauges are set noticeably larger than their `%` sign and always in primary
orange.

## 3. Shape

* Pills (buttons in the component sheet, chips, badges, count pills): fully rounded.
* Primary CTA inside cards: ~12 radius.
* Cards: 16 (list / stat) to 20–24 (featured, modal).
* Inputs: 10–12.
* Selection tiles: 12.

## 4. Component patterns worth carrying over

* **Folder-tab card** (p092, p229) — tabs visually attached to the top edge of the card they switch,
  like index tabs on a folder. Distinctive to Hangyul; reused in Hangyul ganada for practice modes.
* **Circular gauge** — ~270° arc, thick rounded cap, light grey track, large orange numeral inside.
* **Feedback card** — white card, 1px semantic border, semantic icon + headline in the semantic
  colour, content below. Blue `#547CF1` for correct, red `#F24147` for incorrect. Never a filled
  red/green banner.
* **Celebration modal** — cream card, illustration inside a dashed orange ring, `+NNP` badge, orange
  headline, grey subline, full-width orange confirm.
* **Selection tile** — white + grey border by default; selected becomes peach fill + orange border +
  orange label. Sampled selected fill `#FFEFE5`.
* **Numbered section headers** — small filled orange circle with a numeral, then the label.
* **Bottom navigation** — 5 items, icon + label, active in primary orange, inactive `#ADB4BA`.
* **Mascot ground** — a peach gradient band at the bottom of a screen with mascots standing on it and
  a speech bubble. Used for encouragement, never as decoration in dense screens.

## 5. Brand assets

Official logo files copied to `apps/web/public/brand/` from the delivered logo package:
`logo-lockup`, `logo-symbol`, `logo-wordmark-en`, `logo-wordmark-ko`, `app-icon`.

The symbol is a tangerine whose face is drawn from **ㄱ ㄴ ㄷ** — the first three Hangul consonants.
That is a direct thematic hook for Hangyul ganada, and the product wordmark leans on it.

The mascot is a tangerine with a green leaf, mint `#66CCCC` round glasses, black dot eyes and a
simple smile, with a body gradient running amber → pale yellow. Reproduced as a vector component
(`HangyulMascot`) rather than a raster crop so it scales and can express states.

## 6. What Hangyul ganada changes

Hangyul ganada is a sibling, not a clone. It keeps every token, shape and component pattern above,
and departs only where handwriting demands it:

* The **writing canvas becomes the primary visual object** — the featured card slot on the home
  screen of the parent app becomes the practice surface here.
* The grid guides inside the canvas use `#E6E8EB` and `#FFDCC2` rather than the calligraphy-app
  convention of red 田 guides.
* Correct/incorrect feedback reuses the p235/p237 feedback card exactly, so a Hangyul user reads it
  instantly.
