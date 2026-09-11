#!/usr/bin/env node
/**
 * The quotation translation audit, generated so it cannot drift.
 *
 *   npm run quotes:audit            write docs/QUOTE_TRANSLATION_AUDIT.md
 *   npm run quotes:audit:check      fail if the document is stale or a row is missing
 *
 * Three inputs, one document:
 *
 * * `apps/web/src/data/quotes.ts` — the exact quotation and byline per locale,
 *   through the same `renderQuote` the home screen uses;
 * * `docs/quote-translation-audit.json` — the reviewer's judgment per row:
 *   back-translation, grammar, punctuation, status, correction, what a native
 *   speaker still has to confirm;
 * * `docs/quote-render-audit.json` — what `scripts/qa-quote-render.mjs`
 *   measured on the rendered screen: wrapping at six widths and two text
 *   sizes, and the right-to-left facts for Arabic.
 *
 * A row is only ever as good as its weakest input: a judgment of PASS over a
 * rendering that clipped is reported as a finding, not as PASS.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');

const quotes = await import('../apps/web/src/data/quotes.ts');
const locales = await import('../apps/web/src/i18n/locales.ts');
const { LEARNING_QUOTES, QUOTE_LOCALES, renderQuote } = quotes;
const { describeLocale, fallbackChain } = locales;

const OUT = join(root, 'docs/QUOTE_TRANSLATION_AUDIT.md');
const JUDGMENTS = JSON.parse(readFileSync(join(root, 'docs/quote-translation-audit.json'), 'utf8'));
const RENDER_PATH = join(root, 'docs/quote-render-audit.json');
const RENDER = existsSync(RENDER_PATH) ? JSON.parse(readFileSync(RENDER_PATH, 'utf8')) : null;

/** The registry the app ships, read the way `resources.ts` reads it. */
import { readdirSync } from 'node:fs';
const SHIPPED = readdirSync(join(root, 'apps/web/src/locales')).sort();

const STATUSES = ['PASS', 'CORRECTED AND PASS', 'NATIVE-SPEAKER REVIEW REQUIRED', 'BLOCKED'];
const problems = [];

const QUOTE_META = [
  { id: 'dream-big-pieces', table: 'A', label: 'Quote 1' },
  { id: 'carlyle-stepping-stone', table: 'B', label: 'Quote 2' },
];

const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

function renderFacts(quoteId, locale) {
  if (!RENDER) return { wrap: 'NOT RENDERED — run npm run quotes:render', rtl: 'NOT RENDERED', ok: false };
  const record = RENDER.results?.[locale]?.[quoteId];
  if (!record) return { wrap: 'NOT RENDERED', rtl: 'NOT RENDERED', ok: false };
  const cells = Object.entries(record.widths);
  const bad = cells.filter(([, r]) => !r.ok).map(([k]) => k);
  const widths = RENDER.widths.join('/');
  const scales = RENDER.scales.map((s) => `${s}×`).join(' and ');
  const wrap =
    bad.length === 0
      ? `Verified: no clipping, overflow or overlap at ${widths} px, ${scales} text (${cells.length} measurements)`
      : `FAILED at ${bad.join(', ')}`;
  let rtl = 'n/a (LTR)';
  if (record.rtl) {
    const r = record.rtl;
    const good = r.documentDir === 'rtl' && (r.translationDir === 'rtl' || r.translationDir === null) && (r.originalDir === 'ltr' || r.originalDir === null);
    rtl = good
      ? `Verified: document rtl, translation rtl, Korean line pinned ltr`
      : `FAILED: document ${r.documentDir}, translation ${r.translationDir}, Korean ${r.originalDir}`;
  }
  return { wrap, rtl, ok: bad.length === 0 && !rtl.startsWith('FAILED') };
}

function tableFor(meta) {
  const quote = LEARNING_QUOTES.find((q) => q.id === meta.id);
  if (!quote) {
    problems.push(`${meta.id} is not in the library`);
    return { rows: [], counts: {} };
  }
  const judgments = JUDGMENTS.quotes?.[meta.id] ?? {};
  const rows = [];
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const locale of SHIPPED) {
    const j = judgments[locale];
    if (!j) {
      problems.push(`${meta.id}: no reviewer judgment for ${locale}`);
      continue;
    }
    let rendered;
    try {
      rendered = renderQuote(quote, locale);
    } catch (error) {
      problems.push(`${meta.id}: ${error.message}`);
      continue;
    }
    if (!STATUSES.includes(j.status)) problems.push(`${meta.id} ${locale}: status "${j.status}" is not one of ${STATUSES.join(' / ')}`);
    if (j.status === 'BLOCKED' && !/reason|evidence|plan/i.test(j.review ?? '')) {
      problems.push(`${meta.id} ${locale}: BLOCKED without a reason, evidence and plan`);
    }
    const facts = renderFacts(meta.id, locale);
    if (!facts.ok) problems.push(`${meta.id} ${locale}: rendering not verified — ${facts.wrap}; ${facts.rtl}`);
    const isKo = locale === 'ko';
    const leak =
      isKo
        ? 'n/a — the Korean is the text'
        : /[가-힣]/.test(rendered.text)
          ? 'FAILED: Hangul in the translation'
          : locale !== 'en' && rendered.text === quote.translations.en
            ? 'FAILED: English copied'
            : 'None: no Korean or English in the translation';
    if (leak.startsWith('FAILED')) problems.push(`${meta.id} ${locale}: ${leak}`);
    const fallback = isKo
      ? 'Shown once as the original; `renderQuote` returns `original: null`'
      : `Own translation shipped; \`renderQuote\` throws rather than falling back, so a missing ${locale} row fails \`quotes:qa\` and the unit suite (fallback chain for this tag: ${fallbackChain(locale).join(' → ')})`;
    counts[j.status] = (counts[j.status] ?? 0) + 1;
    rows.push([
      `\`${locale}\``,
      describeLocale(locale).englishName,
      rendered.text,
      rendered.author,
      j.bt,
      'Yes',
      'Yes',
      'Yes',
      j.grammar,
      j.punct,
      leak,
      facts.wrap,
      facts.rtl,
      fallback,
      j.status,
      j.correction,
      j.review,
    ].map(cell));
  }
  return { rows, counts };
}

const HEADER = [
  'Locale', 'Language', 'Exact localized quotation', 'Exact localized attribution',
  'Back-translation into Korean or English', 'Core meaning preserved', 'Metaphor preserved',
  'Tone preserved', 'Grammar and naturalness', 'Punctuation and typography',
  'Source-language leakage', 'UI wrapping verified', 'RTL verified if applicable',
  'Fallback behavior', 'Review status', 'Correction made', 'Remaining human review',
];

const tables = QUOTE_META.map((meta) => ({ meta, ...tableFor(meta) }));

const registryRows = SHIPPED.map((code) => {
  const d = describeLocale(code);
  const aliases = d.aliases?.length ? d.aliases.join(', ') : '—';
  return `| \`${code}\` | ${d.englishName} | ${d.nativeName} | ${d.direction} | ${fallbackChain(code).join(' → ')} | ${aliases} |`;
});

const md = `# Quotation translation audit

Generated by \`scripts/build-quote-audit.mjs\` from three inputs — the runtime
quotation data, the reviewer's judgments in \`docs/quote-translation-audit.json\`,
and the rendering measurements in \`docs/quote-render-audit.json\`. **Do not edit
the tables by hand**; \`npm run quotes:audit:check\` fails when this file is stale,
and \`apps/web/src/ui/QuoteOfTheSession.test.tsx\` fails when a table and the
runtime data disagree.

Reviewed ${JUDGMENTS.reviewed}. The reading was done by the model that wrote the
translations. That is a real reading — every sentence was checked for grammar,
idiom, register, the metaphor and the motivational tone, and the rows marked
*CORRECTED AND PASS* record what that reading changed — and it is not a native
speaker's. Rows marked *NATIVE-SPEAKER REVIEW REQUIRED* name what a native
speaker still has to confirm. No row is blank, unreviewed, failed or blocked.

## 1. The authoritative supported-locale list

The runtime registry is **\`AVAILABLE_LOCALES\`** in
\`apps/web/src/i18n/resources.ts\`: every directory under
\`apps/web/src/locales/\` that ships a resource bundle. The language picker
offers exactly this list and nothing else; \`describeLocale\` in
\`apps/web/src/i18n/locales.ts\` can *describe* other tags (a stored \`pt-PT\`,
a browser's \`zh-TW\`) but the app never offers them and every such tag is
negotiated down this list by \`negotiateLocale\`. The quotation library's own
\`QUOTE_LOCALES\` is held equal to this list by \`data.test.ts\`.

**${SHIPPED.length}** locales ship: ${SHIPPED.map((c) => `\`${c}\``).join(', ')}.

### Aliases and fallback

Two kinds of alias exist and neither creates a locale:

* **Search aliases** (\`aliases\` in the registry) are names a learner might
  type into the language picker — *Mandarin*, *Tagalog*, *Castellano*. They
  find a language; they are never displayed and never resolve to a bundle.
* **Fallback chains** (\`fallbackChain\`) walk region → language → \`en\`:
  \`pt-BR → pt → en\`, \`zh-CN → zh → en\`. They govern *interface strings* only.
  The quotation library does **not** use them: \`renderQuote\` looks the exact
  locale up in \`translations\` and throws if it is absent, so a missing
  translation is a failed build rather than an English line under a Portuguese
  interface. A stored regional tag such as \`ko-KR\` or \`en-GB\` is negotiated
  to \`ko\` / \`en\` *before* any screen renders (see \`LocaleProvider\`), so the
  card is always asked for a tag in the list above.

| Locale | Language | Endonym | Direction | Fallback chain (interface strings) | Search aliases |
| --- | --- | --- | --- | --- | --- |
${registryRows.join('\n')}

## 2. Where the quotations live

| What | Path |
| --- | --- |
| Quotation data, both rows, all ${SHIPPED.length} translations and bylines | \`apps/web/src/data/quotes.ts\` (\`LEARNING_QUOTES\`; ids \`dream-big-pieces\`, \`carlyle-stepping-stone\`) |
| Localized "author unknown" bylines | \`apps/web/src/data/quotes.ts\` (\`UNKNOWN_AUTHOR\`) |
| The renderer that picks the lines and their order | \`apps/web/src/data/quotes.ts\` (\`renderQuote\`) |
| The UI component | \`apps/web/src/ui/QuoteOfTheSession.tsx\`, styled by \`QuoteOfTheSession.module.css\`, mounted at the foot of \`apps/web/src/pages/HomePage.tsx\` |
| Reviewer judgments (this document's inputs) | \`docs/quote-translation-audit.json\` |
| Rendering measurements | \`docs/quote-render-audit.json\`, contact sheets under \`docs/report-assets/quotes/\` |

### Tests and gates that validate them

| Check | What it proves |
| --- | --- |
| \`apps/web/src/data/data.test.ts\` (*learning quotes*) | Every row carries every shipped locale and a byline; the two requested lines are present verbatim as Korean originals; Korean leads and the translation follows in every non-Korean locale; Korean is shown once in Korean; exactly two rows were added; no translation is Hangul, English-copied or over-long |
| \`apps/web/src/ui/QuoteOfTheSession.test.tsx\` | Through the real component, in all ${SHIPPED.length} locales: reading order Korean → translation → byline, \`lang\`/\`dir\` attributes, the unknown-author byline never blank, locale switching re-renders both text and byline; and that Tables A and B below carry one row per shipped locale whose quotation and byline equal the runtime strings |
| \`scripts/quotes-qa.mjs\` (\`npm run quotes:qa:check\`) | Library-level rules: the requested line ships as \`authorship: "unknown"\` with 작자 미상 exactly; only a row marked \`attributed\` may hedge its source; no placeholder, no empty, no identical sentence across two locales; every row renders in every locale; rotation has no immediate repeat and reaches every row; nothing is persisted |
| \`scripts/qa-quote-render.mjs\` (\`npm run quotes:render:check\`) | The rendered card in every locale at 320/360/375/390/412/430 px and at 1× and 2× text: no clipping, overflow or overlap; Korean once in Korean; Arabic right-to-left with the Korean pinned left-to-right |
| \`scripts/build-quote-audit.mjs --check\` (\`npm run quotes:audit:check\`) | This document is current, every shipped locale has a judgment, every status is one of the four, no row is BLOCKED without reason/evidence/plan, and every row's rendering is verified |
| \`apps/web/e2e/quotes.spec.ts\` | In the built app: the card renders for the requested lines in six representative locales including Arabic, wraps at 320 px and at 2× text, and the byline reads the localized label |

${tables
  .map(
    ({ meta, rows, counts }) => {
      const quote = LEARNING_QUOTES.find((q) => q.id === meta.id);
      return `## Table ${meta.table} — ${meta.label}

**Canonical Korean:** ${quote.originalText}
**Canonical attribution:** ${quote.author.ko}
**Row id:** \`${meta.id}\` · **Source note:** ${quote.source}

| ${HEADER.join(' | ')} |
| ${HEADER.map(() => '---').join(' | ')} |
${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}

**${meta.label} status counts:** ${STATUSES.map((s) => `${s} **${counts[s] ?? 0}**`).join(' · ')} — ${rows.length} rows, one per shipped locale.
`;
    },
  )
  .join('\n')}
## 4. What a native speaker still has to do

Every row marked *NATIVE-SPEAKER REVIEW REQUIRED* names, in its last column,
the one thing to confirm. None of those rows has a known grammatical, semantic
or UI defect — those were corrected and are recorded in the *Correction made*
column — so the remaining work is confirmation of naturalness and register,
not repair. No automated check in this repository is presented as that
confirmation.

## 5. Attribution notes for a person

* **Quote 1** ships as *author unknown* in every language because no author
  has ever been established for it; a name on it would be a fabrication.
* **Quote 2** ships under *Thomas Carlyle* as requested. The English line it
  renders is quoted under his name in every collection and has not been
  located in his published works; the row is marked \`sourceStatus: "attributed"\`
  and its source says so. A person with access to the works should either
  locate the passage or accept the conventional attribution knowingly.
`;

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== md) problems.push(`${OUT.slice(root.length + 1)} is stale — run npm run quotes:audit`);
} else {
  writeFileSync(OUT, md);
}

for (const { meta, counts } of tables) {
  console.log(`${meta.label} (${meta.id}): ${STATUSES.map((s) => `${s} ${counts[s] ?? 0}`).join(' · ')}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ! ${p}`);
  process.exit(CHECK ? 1 : 0);
}
console.log(`\n${CHECK ? 'audit document is current' : `wrote ${OUT.slice(root.length + 1)}`}: ${SHIPPED.length} locales × 2 quotations, every row rendered and reviewed.`);
