/**
 * Practice-typeface stylesheets.
 *
 * Imported eagerly and all together: the reference glyph must be rendered in
 * the real face before the evaluator builds its mask, and a font that arrives
 * late would silently grade the learner against a fallback shape. Korean
 * subsets are per-unicode-range, so the browser still only downloads the ranges
 * it actually paints.
 *
 * The `korean-*.css` entry points rather than the family-wide ones: the whole
 * family would pull Latin, Cyrillic and Greek subsets nobody here will ever
 * render.
 *
 * Pretendard is not listed — it is the interface face and is loaded in
 * `main.tsx` before anything paints.
 *
 * Every face is SIL OFL 1.1 — see `src/data/fonts.ts` for licence, source and
 * the reasoning behind each choice.
 */
// The five faces, declared in our own stylesheet rather than @fontsource's —
// woff2 only, because the @fontsource rules also name a .woff fallback that no
// supported engine downloads and that added 5.2 MB to every package. The file
// documents the support matrix; the font binaries still come from @fontsource.
import './practiceFaces.css';

/*
 * And one family this app declares itself: Gaegu at reading size.
 *
 * Last, so it wins nothing by order — it is a different family name, not an
 * override. See `faceSize.css` for the measurement it comes from.
 */
import './faceSize.css';
