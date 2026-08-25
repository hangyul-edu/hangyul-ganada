# Package size analysis

An inventory of the Android package taken before anything was changed, the
decisions it produced, and what each decision was worth. The **before** column
is the delivered `result/hangyul-ganada-release.apk` built from `a3c8ee31`;
the **after** figures are re-measured from the final rebuild of this pass and
recorded in `docs/report.md` §Package size, which supersedes any number here
if the two ever disagree.

## The package, before

| | |
| --- | --- |
| APK (file) | 87,413,933 bytes (87.4 MB) |
| AAB (file) | 85,627,920 bytes (85.6 MB) |
| APK contents, uncompressed | 107.8 MB in 13,978 files |

By directory, uncompressed inside the APK:

| Component | Size | Share | Verdict |
| --- | --- | --- | --- |
| `assets/public/audio` | 68.3 MB | 63% | keep; see the audio section |
| `assets/public/dictionary` | 16.0 MB | 15% | keep — the offline dictionary is the product; JSON deflates ~4× inside the APK |
| `assets/public/assets` (JS/CSS/fonts) | 12.6 MB | 12% | **5.2 MB removed** — every practice face shipped a `.woff` beside its `.woff2` |
| `assets/public/corpus` | 4.5 MB | 4% | keep — the taught corpus, offline |
| `assets/public/level-test` | 2.6 MB | 2% | keep — the placement bank, offline |
| `classes.dex` + resources | ~2.3 MB | 2% | Capacitor runtime and splash bitmaps; nothing to trim |
| `assets/public/brand` | 0.6 MB | <1% | **og image pruned** — the social-preview PNG is a crawler asset |

The largest single files: the audio manifest (2.4 MB JSON), the Gowun Batang
woff (1.68 MB — removed), the dictionary index (1.5 MB), the Gowun Dodum woff
(1.3 MB — removed), `classes.dex`, the Nanum Myeongjo woff (0.9 MB — removed),
and the English level-test bank (0.8 MB). The remaining ~13,000 files are the
audio clips, at a median of ~5 kB each.

## What was changed

**1. The duplicate font formats — ~5.2 MB.** The `@fontsource` stylesheets
declare a `woff2` source and a `woff` fallback, and Vite bundles both. No
supported engine ever downloads the `.woff`: the Android WebView is Chromium
(minSdk 24 → Chromium 51+), Safari has read woff2 since 12, and every
evergreen browser since 2016. `src/styles/practiceFaces.css` now declares the
five practice faces woff2-only against the same `@fontsource`-shipped
binaries, so the fallback bytes are gone from the web bundle and the APK
alike. Rendering is unchanged — the woff2 files are the ones every browser
was already using.

**2. Web-only files pruned from the native bundle — ~0.25 MB.**
`scripts/prune-native-assets.mjs` runs after `cap sync` and removes what only
web infrastructure reads: the social-preview PNG (fetched by link crawlers
against the production domain, linked by nothing in the app), `robots.txt`,
`_redirects`, and `sw.js` (the native build deliberately registers no service
worker). `manifest.webmanifest` stays because the HTML links it and a pruned
link would be a console 404.

## What was deliberately not changed

**Audio (68.3 MB, 63% of the package).** Measured before deciding: every clip
is already MP3, mono, 24 kHz, ~32–34 kbit/s, EBU R128-normalised, with no
leading or trailing silence (a −45 dB sweep over samples found none to trim),
and identical texts already share one recording (52 clips reuse another's
bytes). That is a voice-optimised encoding at MP3's practical floor — going
below ~32 kbit/s in MP3 audibly degrades speech.

A codec change was measured rather than assumed: Opus at 24 kbit/s
(`-application voip`) re-encodes a 30-clip sample to **77%** of the MP3 bytes
— roughly 14 MB across the corpus. It was rejected for this pass because it
cannot be shipped safely from this environment: Opus-in-Ogg is not reliably
playable across the Safari/iOS versions the web product supports, so shipping
it means a dual-format pipeline (Opus for Android, MP3 for the web) plus a
perceptual-equivalence pass over 13,000 re-encoded clips — and §35–37 of the
brief forbid trading audio quality or unverifiable compatibility for size.
The audio manifest's own note also records that a commercial release should
regenerate the audio under a paid Azure Speech licence, which is the moment a
codec decision belongs to.

**Dictionary, corpus, level test (23.1 MB uncompressed).** The product is
offline; these are the product. They are plain JSON and AAPT already deflates
them roughly 4× inside the APK, so their real cost in the delivered file is
about 6 MB. No content was removed.

**No language, voice, example, or dictionary entry was removed**, and no
audio was re-encoded. The package after this pass is functionally identical
to the package before it.

## Expected effect

About **5.4 MB** off the APK and AAB — fonts (~5.2 MB, stored compressed as
woff is already-compressed data) plus the pruned web-only files. The final
measured before/after table lives in `docs/report.md`.
