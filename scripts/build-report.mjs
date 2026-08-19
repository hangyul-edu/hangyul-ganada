#!/usr/bin/env node
/**
 * Builds `docs/report.pdf` from `docs/report.md`.
 *
 *   npm run docs:report
 *
 * The report is regenerated after every development cycle and handed to a
 * reviewer — often another model — as the authoritative description of what the
 * product currently is. So the build has to be one command, repeatable, and
 * boring: Markdown in, a paginated PDF with a cover, a table of contents, real
 * page numbers and the screenshots out.
 *
 * ## Why Chromium rather than a PDF library
 *
 * The repository already has Playwright for its end-to-end tests, so printing
 * from a headless browser costs no new dependency and gets correct pagination,
 * web fonts, Korean text and embedded PNGs for free. A dedicated PDF toolchain
 * would be a second rendering engine to keep in step with the first.
 *
 * ## Screenshots
 *
 * Images referenced from the Markdown are inlined as data URIs, so the PDF is
 * self-contained and does not depend on `.visual-qa/` still being there when it
 * is opened. A missing image is a hard failure rather than a broken-image box
 * in a document somebody is about to review.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SOURCE = join(root, 'docs', 'report.md');
const OUTPUT = join(root, 'docs', 'report.pdf');

const markdown = await readFile(SOURCE, 'utf8');

/**
 * Front matter, in a fenced `yaml` block at the top of the document.
 *
 * A tiny hand-rolled reader rather than a YAML dependency: the cover needs a
 * title, a subtitle, a version and a date, and nothing here will ever be
 * nested.
 */
function readFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (pair) meta[pair[1]] = pair[2].replace(/^["']|["']$/g, '');
  }
  return { meta, body: text.slice(match[0].length) };
}

const { meta, body } = readFrontMatter(markdown);

// --- Rendering ---------------------------------------------------------------

const headings = [];

const renderer = new marked.Renderer();
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

renderer.heading = function heading({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const plain = text.replace(/<[^>]+>/g, '');
  const id = slug(plain);
  // Only the two levels a reader navigates by; deeper headings would make the
  // contents longer than the sections it points at.
  if (depth <= 2) headings.push({ depth, text: plain, id });
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};

/** Inlines a local image so the PDF stands alone. */
async function inlineImages(html) {
  const sources = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  let out = html;
  for (const src of new Set(sources)) {
    if (src.startsWith('data:')) continue;
    const file = resolve(join(root, 'docs'), src);
    if (!existsSync(file)) {
      throw new Error(`report.md references a missing image: ${src}`);
    }
    const bytes = await readFile(file);
    const mime = src.endsWith('.png') ? 'image/png' : 'image/jpeg';
    out = out.split(`src="${src}"`).join(`src="data:${mime};base64,${bytes.toString('base64')}"`);
  }
  return out;
}

const rendered = await inlineImages(marked.parse(body, { renderer, gfm: true }));

const contents = headings
  .map(
    (h) =>
      `<li class="toc-${h.depth}"><a href="#${h.id}"><span class="toc-text">${h.text}</span></a></li>`,
  )
  .join('\n');

/**
 * The page shell.
 *
 * Everything is inline: the PDF is printed from a `data:` URL with no server
 * and no network, which also means no web font can be fetched. The stack is
 * therefore whatever the rendering host has, which for Korean means a CJK
 * fallback has to be listed explicitly or Hangul in the document renders as
 * boxes.
 */
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${meta.title ?? 'Report'}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  :root {
    --ink: #262C31;
    --muted: #5A636A;
    --faint: #778088;
    --primary: #FF6700;
    --rule: #E6E8EB;
    --surface: #FFF8F1;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "DejaVu Sans", "Noto Sans", "Liberation Sans", Arial, sans-serif;
    font-size: 9.6pt;
    line-height: 1.5;
    color: var(--ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Korean in the body text and in tables. */
  .ko, code, td, th, p, li { font-synthesis: none; }

  /* --- cover --- */
  .cover {
    page-break-after: always;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 245mm;
  }
  /* Left-aligned with everything else on the cover; the body's centring rule
     for images does not apply here. */
  .cover-mark { width: 78px; margin: 0 0 14mm; align-self: flex-start; }
  .cover h1 {
    font-size: 30pt;
    line-height: 1.1;
    margin: 0 0 4mm;
    letter-spacing: -0.01em;
    /* The cover title is not a section heading: no rule, no page break. */
    border-bottom: 0;
    padding-bottom: 0;
    page-break-before: avoid;
  }
  .cover .ko-title { font-size: 15pt; color: var(--muted); margin: 0 0 10mm; font-weight: 600; }
  .cover .sub { font-size: 12pt; color: var(--muted); margin: 0 0 16mm; max-width: 130mm; }
  .cover dl { display: grid; grid-template-columns: 34mm 1fr; gap: 2mm 0; margin: 0; font-size: 9.5pt; }
  .cover dt { color: var(--faint); }
  .cover dd { margin: 0; }
  .cover .rule { height: 3px; width: 40mm; background: var(--primary); margin-bottom: 10mm; }

  /* --- contents --- */
  .contents { page-break-after: always; }
  .contents h2 { margin-top: 0; }
  /* Two columns: ninety-three headings down one column is four pages of
     contents in front of a fifty-page document. */
  .contents ol {
    list-style: none;
    padding: 0;
    margin: 0;
    column-count: 2;
    column-gap: 8mm;
  }
  .contents li {
    padding: 0.8mm 0;
    border-bottom: 1px dotted var(--rule);
    break-inside: avoid;
  }
  .contents a { color: var(--ink); text-decoration: none; display: block; font-size: 8.6pt; }
  .contents .toc-1 { break-before: auto; }
  .contents .toc-1 a { font-weight: 700; margin-top: 1mm; }
  .contents .toc-2 { padding-left: 4mm; }
  .contents .toc-2 a { font-size: 8.2pt; color: var(--muted); }

  /* --- body --- */
  h1 {
    font-size: 17pt;
    margin: 0 0 4mm;
    padding-bottom: 2mm;
    border-bottom: 2px solid var(--primary);
    page-break-before: always;
    page-break-after: avoid;
  }
  h1:first-of-type { page-break-before: avoid; }
  h2 { font-size: 12.5pt; margin: 7mm 0 2.5mm; page-break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 5mm 0 2mm; color: var(--muted); page-break-after: avoid; }
  p { margin: 0 0 3mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
  li { margin-bottom: 1mm; }
  strong { color: var(--ink); }
  a { color: var(--primary); text-decoration: none; }

  code {
    font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
    font-size: 8.4pt;
    background: var(--surface);
    padding: 0.4mm 1mm;
    border-radius: 2px;
  }
  pre {
    background: var(--surface);
    border-left: 2px solid var(--primary);
    padding: 3mm 4mm;
    border-radius: 3px;
    overflow: hidden;
    page-break-inside: avoid;
    margin: 0 0 4mm;
  }
  pre code {
    background: none;
    padding: 0;
    font-size: 7.9pt;
    line-height: 1.42;
    white-space: pre-wrap;
    word-break: break-word;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 4mm;
    font-size: 8.7pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid var(--rule);
    padding: 1.6mm 2mm;
    text-align: left;
    vertical-align: top;
    /* Breaks a word only when it genuinely cannot fit, rather than eagerly:
       word-break split "Recognise" across two lines in a narrow first column. */
    overflow-wrap: break-word;
    /* No hyphenation. The columns are wide enough, and "al-phabet" split across
       two lines of a table reads as a typesetting accident. */
    hyphens: none;
  }
  /* A first column of short labels should not be squeezed to nothing by a
     long one beside it. */
  td:first-child, th:first-child { min-width: 22mm; }
  th { background: var(--surface); font-weight: 700; }

  blockquote {
    margin: 0 0 4mm;
    padding: 2mm 4mm;
    border-left: 3px solid var(--primary);
    background: var(--surface);
    color: var(--muted);
  }
  blockquote p:last-child { margin-bottom: 0; }

  hr { border: 0; border-top: 1px solid var(--rule); margin: 6mm 0; }

  /* Screenshots: never wider than the text column, never split across pages. */
  img { max-width: 100%; height: auto; display: block; margin: 0 auto 2mm; border-radius: 4px; }
  figure { margin: 0 0 5mm; page-break-inside: avoid; text-align: center; }
  figcaption { font-size: 8pt; color: var(--faint); margin-top: 1mm; }

  /* A row of screenshots, side by side and each captioned. */
  .shots { display: flex; gap: 4mm; page-break-inside: avoid; margin-bottom: 5mm; }
  .shots figure { flex: 1; margin: 0; }
  .shots img { border: 1px solid var(--rule); }
</style>
</head>
<body>
  <section class="cover">
    ${meta.mark ? `<img class="cover-mark" src="${meta.mark}" alt="">` : ''}
    <div class="rule"></div>
    <h1>${meta.title ?? ''}</h1>
    <p class="ko-title">${meta.title_ko ?? ''}</p>
    <p class="sub">${meta.subtitle ?? ''}</p>
    <dl>
      <dt>Document</dt><dd>${meta.document ?? 'Product &amp; Architecture Report'}</dd>
      <dt>Application version</dt><dd>${meta.version ?? ''}</dd>
      <dt>Report generated</dt><dd>${meta.date ?? ''}</dd>
      <dt>Describes</dt><dd>${meta.describes ?? ''}</dd>
    </dl>
  </section>

  <section class="contents">
    <h2>Contents</h2>
    <ol>${contents}</ol>
  </section>

  ${rendered}
</body>
</html>`;

// The cover mark is a local file like everything else.
const finalHtml = await inlineImages(html);

await mkdir(dirname(OUTPUT), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(finalHtml, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: OUTPUT,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-family: sans-serif; font-size: 7pt; color: #778088;
      width: 100%; padding: 0 16mm; display: flex; justify-content: space-between;">
      <span>${meta.title ?? ''} — ${meta.document ?? ''}</span><span>${meta.version ?? ''}</span></div>`,
  footerTemplate: `<div style="font-family: sans-serif; font-size: 7pt; color: #778088;
      width: 100%; padding: 0 16mm; text-align: center;">
      <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  margin: { top: '20mm', bottom: '18mm', left: '16mm', right: '16mm' },
});
await browser.close();

const { size } = await import('node:fs').then((fs) => fs.promises.stat(OUTPUT));
console.log(`wrote ${OUTPUT} (${(size / 1024).toFixed(0)} KiB, ${headings.length} headings)`);
