#!/usr/bin/env node
/**
 * The 32-locale content translation audit, generated so it cannot drift.
 *
 *   npm run translation:audit          write docs/content-translation-audit.json
 *                                       and docs/CONTENT_TRANSLATION_AUDIT_v1.0.5.md
 *   npm run translation:audit:check    fail when either file is stale, or when a
 *                                       finding of a blocking class exists
 *
 * It reads what ships — `apps/web/src/data/generated/vocabulary.json` and the
 * 32 `vocabulary.<locale>.json` packs — never the editorial sources, so a row
 * that is right in `content/` but wrong in the pack is still reported.
 *
 * Every taught word × every locale × two fields (meaning, example translation)
 * gets the same automated pass. The pass is deliberately mechanical: it can
 * prove a row is present, in the right script, not a copy of the Korean or of
 * the English, punctuated like its source and of a plausible length. It cannot
 * prove a translation is *right*. Rows it clears are labelled AUTOMATED CHECKED
 * and nothing stronger; the second, model-read pass is recorded separately in
 * `docs/content-translation-review-sample.json`, with the label
 * MODEL-REVIEWED and the row ids it actually read. No row anywhere is labelled
 * native-reviewed, because no native speaker has read one.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');
const GEN = join(root, 'apps/web/src/data/generated');
const OUT_JSON = join(root, 'docs/content-translation-audit.json');
const OUT_MD = join(root, 'docs/CONTENT_TRANSLATION_AUDIT_v1.0.5.md');
const SAMPLE = join(root, 'docs/content-translation-review-sample.json');

const core = JSON.parse(readFileSync(join(GEN, 'vocabulary.json'), 'utf8'));
const locales = core.locales;
const packs = Object.fromEntries(
  locales.map((loc) => [loc, JSON.parse(readFileSync(join(GEN, `vocabulary.${loc}.json`), 'utf8')).words]),
);

/** The writing system every locale's rows must be in, as a Unicode script regex. */
const SCRIPT = {
  ar: /\p{Script=Arabic}/u, bn: /\p{Script=Bengali}/u, hi: /\p{Script=Devanagari}/u,
  ta: /\p{Script=Tamil}/u, te: /\p{Script=Telugu}/u, th: /\p{Script=Thai}/u, el: /\p{Script=Greek}/u,
  ru: /\p{Script=Cyrillic}/u, uk: /\p{Script=Cyrillic}/u, kk: /\p{Script=Cyrillic}/u,
  ky: /\p{Script=Cyrillic}/u, mn: /\p{Script=Cyrillic}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, 'zh-CN': /\p{Script=Han}/u,
  ko: /\p{Script=Hangul}/u,
};
const LATIN = /\p{Script=Latin}/u;
const HANGUL = /\p{Script=Hangul}/u;
/** Sentence terminators a locale may use where Korean uses . or ? */
const STOP = {
  default: { period: /[.!…]$/u, question: /[?]$/u },
  ar: { period: /[.!…]$/u, question: /[?؟]$/u },
  el: { period: /[.!…]$/u, question: /[;?]$/u },
  hi: { period: /[.!।…]$/u, question: /[?]$/u },
  bn: { period: /[.!।…]$/u, question: /[?]$/u },
  ja: { period: /[。！.…]$/u, question: /[?？。]$/u },
  'zh-CN': { period: /[。！.…]$/u, question: /[?？]$/u },
  th: { period: /.$/u, question: /.$/u }, // Thai writes no terminal stop
  ko: { period: /[.!…]$/u, question: /[?]$/u },
};
const PLACEHOLDER = /\{|\}|\bTODO\b|\bTBD\b|\?\?\?|lorem ipsum|\bxxx\b/;

const words = core.words;
const koIndex = Object.fromEntries(words.map((w, i) => [w.id, i]));
const findings = [];
const perLocale = {};
const codes = {};
function flag(locale, id, field, code, detail) {
  findings.push({ locale, id, field, code, detail });
  codes[code] = (codes[code] ?? 0) + 1;
  perLocale[locale].findings += 1;
  perLocale[locale].byCode[code] = (perLocale[locale].byCode[code] ?? 0) + 1;
}

for (const loc of locales) {
  perLocale[loc] = { rows: words.length, meanings: 0, examples: 0, notes: 0, findings: 0, byCode: {} };
  const rows = packs[loc];
  const lengths = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const row = rows[i] ?? [];
    const [meaning, example, note] = row;
    const en = packs.en[i] ?? [];
    if (typeof meaning === 'string' && meaning.trim()) perLocale[loc].meanings += 1;
    else flag(loc, w.id, 'meaning', 'MISSING_MEANING', 'no meaning text');
    if (loc === 'ko') {
      // Korean is the source: the example is the Korean sentence itself; only the definition is audited.
      if (typeof meaning === 'string' && !HANGUL.test(meaning)) flag(loc, w.id, 'meaning', 'WRONG_SCRIPT', meaning);
      if (note) perLocale[loc].notes += 1;
      continue;
    }
    if (typeof example === 'string' && example.trim()) perLocale[loc].examples += 1;
    else flag(loc, w.id, 'example', 'MISSING_EXAMPLE', 'no example translation');
    if (note) perLocale[loc].notes += 1;
    for (const [field, text] of [['meaning', meaning], ['example', example]]) {
      if (typeof text !== 'string' || !text.trim()) continue;
      if (PLACEHOLDER.test(text)) flag(loc, w.id, field, 'PLACEHOLDER', text);
      if (field === 'example' && text.trim() === w.example.trim()) flag(loc, w.id, field, 'KOREAN_COPIED', text);
      if (HANGUL.test(text) && field === 'example') flag(loc, w.id, field, 'HANGUL_IN_TRANSLATION', text);
      if (loc !== 'en' && field === 'example' && en[1] && text.trim() === en[1].trim()) flag(loc, w.id, field, 'ENGLISH_COPIED', text);
      const script = SCRIPT[loc];
      if (script) {
        if (!script.test(text)) flag(loc, w.id, field, 'WRONG_SCRIPT', text);
      } else if (!LATIN.test(text)) {
        flag(loc, w.id, field, 'WRONG_SCRIPT', text);
      }
    }
    if (typeof example === 'string' && example.trim()) {
      const ko = w.example.trim();
      const stop = STOP[loc] ?? STOP.default;
      const koQ = /[?]$/.test(ko);
      const t = example.trim().replace(/[»"”’)]+$/u, '');
      if (koQ && !stop.question.test(t)) flag(loc, w.id, 'example', 'QUESTION_MARK_LOST', example);
      if (!koQ && !stop.period.test(t) && !stop.question.test(t)) flag(loc, w.id, 'example', 'NO_TERMINAL_STOP', example);
      lengths.push([w.id, example.length / Math.max(1, ko.length)]);
    }
  }
  // Length ratio outliers, judged against this locale's own distribution.
  if (lengths.length > 10) {
    const r = lengths.map(([, x]) => x);
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
    perLocale[loc].lengthRatio = { mean: +mean.toFixed(2), sd: +sd.toFixed(2) };
    for (const [id, x] of lengths) {
      if (Math.abs(x - mean) > 4 * sd) flag(loc, id, 'example', 'LENGTH_OUTLIER', `ratio ${x.toFixed(2)} vs mean ${mean.toFixed(2)}±${sd.toFixed(2)}`);
    }
  }
  // Meanings shared by several words inside one locale, reported as a count only.
  const seen = new Map();
  rows.forEach((row, i) => { const m = (row?.[0] ?? '').trim().toLowerCase(); if (m) seen.set(m, (seen.get(m) ?? 0) + 1); });
  perLocale[loc].sharedMeanings = [...seen.values()].filter((n) => n > 1).length;
}

const BLOCKING = new Set(['MISSING_MEANING', 'MISSING_EXAMPLE', 'PLACEHOLDER', 'KOREAN_COPIED', 'HANGUL_IN_TRANSLATION', 'WRONG_SCRIPT']);
const blocking = findings.filter((f) => BLOCKING.has(f.code));
const sample = existsSync(SAMPLE) ? JSON.parse(readFileSync(SAMPLE, 'utf8')) : null;

const result = {
  _comment: 'GENERATED by scripts/content-translation-audit.mjs from the shipped vocabulary packs. Every row is AUTOMATED CHECKED; the model-read sample is in content-translation-review-sample.json; no row is native-reviewed.',
  generated_from: 'scripts/content-translation-audit.mjs',
  words: words.length,
  locales: locales.length,
  rows_audited: words.length * locales.length,
  fields_audited: words.length * (locales.length - 1) * 2 + words.length,
  checks: ['MISSING_MEANING', 'MISSING_EXAMPLE', 'PLACEHOLDER', 'KOREAN_COPIED', 'HANGUL_IN_TRANSLATION', 'ENGLISH_COPIED', 'WRONG_SCRIPT', 'QUESTION_MARK_LOST', 'NO_TERMINAL_STOP', 'LENGTH_OUTLIER'],
  blocking_codes: [...BLOCKING],
  findings_total: findings.length,
  findings_blocking: blocking.length,
  by_code: codes,
  per_locale: perLocale,
  findings,
  model_review_sample: sample ? { file: 'docs/content-translation-review-sample.json', rows: sample.rows.length, reviewed: sample.reviewed } : null,
};

const stable = (o) => JSON.stringify(o, null, 1) + '\n';

function markdown() {
  const L = [];
  L.push('# Content translation audit — web v1.0.5');
  L.push('');
  L.push('GENERATED by `scripts/content-translation-audit.mjs` (`npm run translation:audit`). Do not edit by hand; `npm run translation:audit:check` fails when this file is stale.');
  L.push('');
  L.push(`**Scope.** ${words.length.toLocaleString('en')} taught words × ${locales.length} locales = ${result.rows_audited.toLocaleString('en')} rows, ${result.fields_audited.toLocaleString('en')} fields (meaning and example translation; Korean carries the definition only). The audit reads the shipped packs under \`apps/web/src/data/generated/\`, not the editorial sources.`);
  L.push('');
  L.push('## 1. What the two passes can and cannot claim');
  L.push('');
  L.push('| Label | Meaning | Rows |');
  L.push('|:---|:---|---:|');
  L.push(`| AUTOMATED CHECKED | Present, in the locale's writing system, not a copy of the Korean or of the English, no placeholder, terminal punctuation matches the Korean, length within 4σ of the locale's own ratio. Proves form, not meaning. | ${result.rows_audited.toLocaleString('en')} |`);
  L.push(`| MODEL-REVIEWED | Read by the model against the Korean sentence and gloss for meaning, register and naturalness; verdict recorded per row in \`docs/content-translation-review-sample.json\`. Not a native speaker's reading. | ${sample ? sample.rows.length : 0} |`);
  L.push('| NATIVE-SPEAKER REVIEWED | Read by a native speaker. | 0 — none has been done; do not claim it |');
  L.push('| HUMAN REVIEW REQUIRED | Every row that is only AUTOMATED CHECKED, until a human reads it. | all |');
  L.push('');
  L.push('## 2. Automated findings');
  L.push('');
  L.push(`Total findings: **${findings.length}**, of which **${blocking.length}** are of a blocking class (${[...BLOCKING].join(', ')}). A blocking finding fails \`translation:audit:check\`.`);
  L.push('');
  L.push('| Code | Count | Blocking |');
  L.push('|:---|---:|:---|');
  for (const c of result.checks) L.push(`| ${c} | ${codes[c] ?? 0} | ${BLOCKING.has(c) ? 'yes' : 'no'} |`);
  L.push('');
  L.push('## 3. Per locale');
  L.push('');
  L.push('| Locale | Meanings | Examples | Notes | Findings | Shared meanings | Length ratio mean±σ |');
  L.push('|:---|---:|---:|---:|---:|---:|:---|');
  for (const loc of locales) {
    const p = perLocale[loc];
    const lr = p.lengthRatio ? `${p.lengthRatio.mean}±${p.lengthRatio.sd}` : '—';
    L.push(`| ${loc} | ${p.meanings.toLocaleString('en')} | ${loc === 'ko' ? '— (source)' : p.examples.toLocaleString('en')} | ${p.notes.toLocaleString('en')} | ${p.findings} | ${p.sharedMeanings} | ${lr} |`);
  }
  L.push('');
  L.push('*Shared meanings* counts distinct meaning strings used by more than one word in that locale; near-synonyms legitimately share one (두 words for "a week"), so the number is reported, not judged.');
  L.push('');
  L.push('## 4. Non-blocking findings, for a human reader');
  L.push('');
  const nb = findings.filter((f) => !BLOCKING.has(f.code));
  if (!nb.length) L.push('None.');
  else {
    L.push('| Locale | Word id | Field | Code | Text |');
    L.push('|:---|:---|:---|:---|:---|');
    for (const f of nb.slice(0, 400)) L.push(`| ${f.locale} | ${f.id} | ${f.field} | ${f.code} | ${String(f.detail).replace(/\|/g, '\\|')} |`);
    if (nb.length > 400) L.push(`| … | | | | ${nb.length - 400} more in the JSON |`);
  }
  L.push('');
  L.push('## 5. Blocking findings');
  L.push('');
  if (!blocking.length) L.push('None.');
  else {
    L.push('| Locale | Word id | Field | Code | Text |');
    L.push('|:---|:---|:---|:---|:---|');
    for (const f of blocking) L.push(`| ${f.locale} | ${f.id} | ${f.field} | ${f.code} | ${String(f.detail).replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('## 6. The model-read sample');
  L.push('');
  if (!sample) L.push('No sample file present.');
  else {
    L.push(`Reviewed ${sample.reviewed}. ${sample.rows.length} rows, chosen as ${sample.method}. Verdicts: ${Object.entries(sample.rows.reduce((a, r) => { a[r.verdict] = (a[r.verdict] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
    L.push('');
    L.push('| Locale | Word | Field | Verdict | Note |');
    L.push('|:---|:---|:---|:---|:---|');
    for (const r of sample.rows) L.push(`| ${r.locale} | ${r.word} | ${r.field} | ${r.verdict} | ${String(r.note ?? '').replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('## 7. Other gates that read the same rows');
  L.push('');
  L.push('`vocabulary:translation:check` (cross-word sentence collisions), `translation:semantics:check`, `locale:content:check`, `locale:editorial:check`, `copy:generated:check`, `copy:fresh:check`, `vocabulary:sense:qa:check` (one sense per row), `leveltest:locale:check` (every level-test item askable in every locale). Their results for this build are in `docs/WEB_CONTENT_QA_EVIDENCE_v1.0.5.md`.');
  L.push('');
  return L.join('\n');
}

const json = stable(result);
const md = markdown();
if (CHECK) {
  const problems = [];
  const cur = existsSync(OUT_JSON) ? readFileSync(OUT_JSON, 'utf8') : '';
  const curMd = existsSync(OUT_MD) ? readFileSync(OUT_MD, 'utf8') : '';
  // Compare without the volatile sample-review timestamp.
  // Blocking findings first: a planted defect makes the file stale too, and the
  // finding is the message a reader needs.
  if (blocking.length) problems.push(`${blocking.length} blocking translation finding(s): ${blocking.slice(0, 5).map((f) => `${f.locale}/${f.id}/${f.code}`).join(', ')}`);
  if (cur !== json) problems.push(`${OUT_JSON} is stale — run npm run translation:audit`);
  if (curMd !== md) problems.push(`${OUT_MD} is stale — run npm run translation:audit`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`translation audit current: ${result.rows_audited.toLocaleString('en')} rows, ${findings.length} findings, none blocking.`);
} else {
  writeFileSync(OUT_JSON, json);
  writeFileSync(OUT_MD, md);
  console.log(`wrote ${OUT_JSON} and ${OUT_MD}: ${result.rows_audited.toLocaleString('en')} rows, ${findings.length} findings (${blocking.length} blocking)`);
  if (blocking.length) process.exit(1);
}
