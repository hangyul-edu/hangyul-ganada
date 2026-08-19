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
import '@fontsource/nanum-gothic/korean-400.css';
import '@fontsource/nanum-myeongjo/korean-400.css';
import '@fontsource/gowun-batang/korean-400.css';
import '@fontsource/gaegu/korean-400.css';
import '@fontsource/gowun-dodum/korean-400.css';
