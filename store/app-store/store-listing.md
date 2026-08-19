# App Store listing — what goes in which field

The copy is in `../listing/<locale>.md`, one file per language, checked against
Apple's limits by `npm run store:check`.

## Fields

| App Store Connect field | Source | Limit |
| --- | --- | --- |
| Name | `## Title / App name` | 30 |
| Subtitle | `## Subtitle (App Store)` | 30 |
| Keywords | `## Keywords (App Store)` | 100, comma-separated, **no spaces after commas** |
| Description | `## Full description` | 4000 |
| Promotional text | not used | 170 |
| What's New | `../release-notes.md` | 4000 |

`## Short description (Play)` has no App Store equivalent — Apple uses the
subtitle for that job and indexes the keywords field rather than the description.

## Localisations

Primary language English (UK). Seven more: 한국어, 日本語, 简体中文, Español,
Français, Deutsch, Português (Brasil). These are the eight the app itself ships,
so a customer who finds it in their language finds it *in* their language.

## Categories

| | |
| --- | --- |
| Primary | Education |
| Secondary | Reference |
| Age rating | 4+ — see `age-rating.md` |
| Price | Paid, one-time. No in-app purchases, no subscription |

## Screenshots

Required sizes: 6.9" (1320 × 2868) and 6.5" (1242 × 2688) iPhone, plus 13" iPad
if the app is offered on iPad — which it is, since the project builds a
universal binary and `HangyulViewController` supports every orientation there.

**Not produced.** The Android screenshots in `docs/store-assets/android/` are
real frames from a real device and are the right *content*, but they are the
wrong aspect ratio and show Android system bars. Capturing iOS screenshots needs
a Simulator, which needs macOS. See `../../result/BUILD_OR_SIGNING_BLOCKERS.md`.

Submitting the Android frames rescaled would be submitting a picture of a
different operating system, which is exactly the kind of thing App Review
notices and rejects for.

## App Privacy

Every category **Data Not Collected** — `app-privacy.md`.

## URLs

Support URL and privacy policy URL are required and are **not set**. The pages
are written; nothing hosts them. See `support-and-privacy-urls.md`.
