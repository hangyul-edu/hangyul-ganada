#!/usr/bin/env node
/**
 * Markdown → PDF, with Korean that renders.
 *
 *   node scripts/build-pdf.mjs <in.md> <out.pdf> "Title" ["Subtitle"]
 *
 * ## Why Chromium and not a PDF library
 *
 * The documents this renders contain Korean, English, tables, and inline SVG
 * figures with bilingual labels. A PDF library would need a CJK-capable font
 * stack, a table layouter and an SVG rasteriser, and would get one of the three
 * wrong. Chromium already has all of them and is already a dependency —
 * Playwright drives the visual QA in this repository.
 *
 * ## Fonts are embedded from `node_modules`, not from the system
 *
 * The failure this avoids is silent and specific: a headless container with no
 * Korean font renders every Hangul glyph as a tofu box, and the PDF *looks*
 * fine to a script that only checks the page count. Pretendard ships in
 * `node_modules` for the app itself, so it is embedded here as a data URI and
 * the rendering cannot fall back to something that may not exist.
 *
 * `build-report.mjs` and the patent build both call this, so a change to
 * pagination or headers moves both together.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [, , inPath, outPath, title, subtitle = ''] = process.argv;

if (!inPath || !outPath || !title) {
  console.error('usage: build-pdf.mjs <in.md> <out.pdf> "Title" ["Subtitle"]');
  process.exit(2);
}

const source = readFileSync(inPath, 'utf8');

/**
 * The variable Pretendard, embedded.
 *
 * The same file the app loads, so the PDF and the product agree about what a
 * Korean letter looks like — which matters here more than in most documents,
 * because several figures are *about* letterforms.
 */
const FONT = readFileSync(
  join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
).toString('base64');

/**
 * Inline SVG figures.
 *
 * `![](figures/x.svg)` becomes the SVG itself rather than an `<img>`, because
 * an `<img>` pointing at a relative path resolves against `about:blank` in a
 * page built with `setContent` and silently renders nothing. Inlining also
 * keeps the vector crisp at print resolution.
 */
const withFigures = source.replace(
  /!\[([^\]]*)\]\(([^)]+\.svg)\)/g,
  (whole, alt, src) => {
    const abs = resolve(dirname(inPath), src);
    if (!existsSync(abs)) return `<p><em>[missing figure: ${src}]</em></p>`;
    const svg = readFileSync(abs, 'utf8').replace(/width="\d+"\s+height="\d+"/, 'width="100%"');
    return `<figure class="fig">${svg}<figcaption>${alt}</figcaption></figure>`;
  },
);

/**
 * Inline raster figures, for the same reason and with the same consequence.
 *
 * A `<img src="report-assets/x.png">` resolves against `about:blank` in a page
 * built with `setContent` and renders as a broken-image box with its alt text
 * beside it — which is what every screenshot in the report had been doing,
 * silently, for as long as the report has had screenshots. Nothing failed and
 * nothing said so; it was found by looking at a page of the PDF. The bytes are
 * inlined as a data URI so the page needs no file access at all.
 */
const withRasters = withFigures.replace(
  /!\[([^\]]*)\]\(([^)]+\.(?:png|jpe?g))\)/g,
  (whole, alt, src) => {
    const abs = resolve(dirname(inPath), src);
    if (!existsSync(abs)) return `<p><em>[missing image: ${src}]</em></p>`;
    const mime = /\.png$/i.test(abs) ? 'image/png' : 'image/jpeg';
    const data = readFileSync(abs).toString('base64');
    return `<figure class="fig"><img src="data:${mime};base64,${data}" alt="${alt}"><figcaption>${alt}</figcaption></figure>`;
  },
);

const body = marked.parse(withRasters, { async: false });

/** Headings become anchors so a table of contents can link to them. */
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

const headings = [];
const anchored = body.replace(/<h([12])>(.*?)<\/h\1>/g, (whole, level, text) => {
  const id = slug(text) || `h-${headings.length}`;
  headings.push({ level: Number(level), text: text.replace(/<[^>]+>/g, ''), id });
  return `<h${level} id="${id}">${text}</h${level}>`;
});

const toc =
  headings.length === 0
    ? ''
    : `<nav class="toc"><h2>Contents · 목차</h2><ul>${headings
        .map((h) => `<li class="l${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
        .join('')}</ul></nav>`;

const today = new Date().toISOString().slice(0, 10);

const html = `<!doctype html><meta charset="utf-8"><title>${title}</title><style>
@font-face{font-family:PD;src:url(data:font/woff2;base64,${FONT}) format('woff2');font-weight:100 900;font-display:block}
:root{--ink:#16191D;--muted:#5A636B;--line:#D6DBE0;--accent:#C2410C}
*{box-sizing:border-box}
body{font-family:PD,-apple-system,'Segoe UI',sans-serif;color:var(--ink);font-size:10.5pt;line-height:1.62;margin:0}
.cover{height:247mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always}
.cover h1{font-size:26pt;line-height:1.25;margin:0 0 10mm;font-weight:700}
.cover .sub{font-size:12pt;color:var(--muted);margin:0 0 22mm;line-height:1.5}
.cover .meta{font-size:9.5pt;color:var(--muted);border-top:2px solid var(--accent);padding-top:5mm}
.cover .conf{margin-top:14mm;font-size:9.5pt;color:var(--accent);font-weight:600}
.toc{page-break-after:always}
.toc h2{font-size:15pt;border:0;margin:0 0 6mm}
.toc ul{list-style:none;padding:0;margin:0}
.toc li{padding:1.6mm 0;border-bottom:1px dotted var(--line)}
.toc li.l2{padding-left:7mm;font-size:9.5pt;color:var(--muted)}
.toc a{color:inherit;text-decoration:none}
h1{font-size:17pt;margin:9mm 0 4mm;padding-bottom:2mm;border-bottom:2px solid var(--accent);page-break-after:avoid}
h2{font-size:13pt;margin:7mm 0 3mm;page-break-after:avoid}
h3{font-size:11pt;margin:5mm 0 2mm;page-break-after:avoid}
p{margin:0 0 3mm;orphans:3;widows:3}
ul,ol{margin:0 0 3mm;padding-left:6mm}
li{margin:0 0 1.2mm}
code{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:9pt;background:#F4F6F8;padding:0.4mm 1.2mm;border-radius:2px}
pre{background:#F4F6F8;padding:3mm 4mm;border-radius:3px;overflow:hidden;page-break-inside:avoid;border-left:3px solid var(--line)}
pre code{background:none;padding:0;font-size:8.5pt;line-height:1.5;white-space:pre-wrap;word-break:break-word}
table{border-collapse:collapse;width:100%;margin:0 0 4mm;font-size:8.8pt;page-break-inside:avoid}
th,td{border:1px solid var(--line);padding:1.8mm 2.2mm;text-align:left;vertical-align:top;word-break:normal;overflow-wrap:break-word}
/*
  break-word, not anywhere. Both wrap a word that does not fit; only "anywhere"
  also tells the layout engine that a column's minimum width is one character,
  and the auto table layout then believed a column headed ID could be 1ch wide
  and stacked I-0-4 vertically. "break-word" leaves the minimum at the longest
  word, so columns are sized by their content again. Long unbreakable tokens —
  a sha256, a file path — sit inside a code element, which keeps the older
  behaviour so they wrap instead of widening the table.
*/
th code,td code{overflow-wrap:anywhere}
.fig img{display:block;width:100%;height:auto}
th{background:#F4F6F8;font-weight:600}
blockquote{margin:0 0 3mm;padding:2mm 0 2mm 4mm;border-left:3px solid var(--accent);color:var(--muted)}
hr{border:0;border-top:1px solid var(--line);margin:6mm 0}
.fig{margin:5mm 0;page-break-inside:avoid;text-align:center}
.fig svg{max-width:100%;height:auto}
.fig figcaption{font-size:8.5pt;color:var(--muted);margin-top:2mm}
strong{font-weight:600}
</style>
<div class="cover">
  <h1>${title}</h1>
  <p class="sub">${subtitle}</p>
  <div class="meta">Hangyul ganada · 한귤 가나다 — v1.0.2 · ${today}</div>
  <div class="conf">CONFIDENTIAL · 대외비</div>
</div>
${toc}
${anchored}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(async () => {
  await document.fonts.ready;
});

/* Prove the Korean face is live before printing. A missing font renders every
   Hangul glyph as a box, and a page-count check would not notice. */
const fontOk = await page.evaluate(() => document.fonts.check('12pt PD', '한글'));
if (!fontOk) {
  await browser.close();
  console.error('Pretendard did not load; every Hangul glyph would print as tofu.');
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
await page.pdf({
  path: outPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '20mm', bottom: '18mm', left: '18mm', right: '18mm' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-family:sans-serif;font-size:7pt;color:#8A939B;width:100%;padding:0 18mm;display:flex;justify-content:space-between">
    <span>${title}</span><span>대외비 · CONFIDENTIAL</span></div>`,
  footerTemplate: `<div style="font-family:sans-serif;font-size:7pt;color:#8A939B;width:100%;padding:0 18mm;text-align:center">
    <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
});
await browser.close();

console.log(`wrote ${outPath}`);
