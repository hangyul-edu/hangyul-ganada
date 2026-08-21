#!/usr/bin/env node
/**
 * The issue tables in `docs/report.md`, generated from `docs/issues.json`.
 *
 *   npm run issues            rewrite the tables and the counts
 *   npm run issues -- --check fail if they are out of date, or contradicted
 *
 * ## The bug this exists to make impossible
 *
 * The report used to state each issue's status in six places: the executive
 * summary, the known-issues table, the reproduction table, the top-ten list, the
 * quick-wins list and the hand-off section. Six copies of one fact, kept in step
 * by hand, in a document that is rewritten every cycle. They did not stay in
 * step. A reader could find the same issue marked RESOLVED in one section and
 * OPEN two hundred lines later, and no amount of care during the rewrite fixed
 * it, because the failure is not carelessness — it is that the same fact was
 * written down more than once.
 *
 * So it is written down once, in `docs/issues.json`, and the tables are
 * generated from it between markers. Prose around them stays hand-written,
 * because prose is where the reasoning goes and reasoning is not a field.
 *
 * ## What `--check` checks
 *
 * Three things, and the third is the one that catches the recurrence:
 *
 * 1. The generated tables in the report match what this would write.
 * 2. Every issue id the report mentions exists in the source.
 * 3. No sentence *outside* the generated tables gives an issue a status that
 *    contradicts the source. Writing "I-03 is resolved" in a paragraph is how
 *    the stale claim got in last time, and a generator alone would not have
 *    stopped it — the paragraph was not in the table.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SOURCE = join(root, 'docs', 'issues.json');
const REPORT = join(root, 'docs', 'report.md');

const CHECK = process.argv.includes('--check');

const BEGIN_WHAT = '<!-- issues:what -->';
const END_WHAT = '<!-- /issues:what -->';
const BEGIN_HOW = '<!-- issues:how -->';
const END_HOW = '<!-- /issues:how -->';
const BEGIN_COUNTS = '<!-- issues:counts -->';
const END_COUNTS = '<!-- /issues:counts -->';
const BEGIN_NEXT = '<!-- issues:next -->';
const END_NEXT = '<!-- /issues:next -->';

const { issues } = JSON.parse(readFileSync(SOURCE, 'utf8'));

/** Table cells may not contain a bare pipe, and a status is always bold. */
const cell = (text) => String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');

const ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const RANK = { OPEN: 0, BLOCKED: 1, PARTIAL: 2, RESOLVED: 3 };
const sorted = [...issues].sort(
  (a, b) =>
    RANK[a.status] - RANK[b.status] ||
    ORDER[a.severity] - ORDER[b.severity] ||
    a.id.localeCompare(b.id),
);

function statusText(issue) {
  const bold = `**${issue.status}**`;
  if (issue.status === 'BLOCKED' && issue.blocker) return `${bold} — ${cell(issue.blocker)}`;
  if (issue.status === 'RESOLVED' && issue.supersedes) {
    return `${bold} — supersedes ${issue.supersedes}`;
  }
  return bold;
}

const whatTable = [
  '| ID | Area | Sev | Issue | Customer impact | Status |',
  '| --- | --- | --- | --- | --- | --- |',
  ...sorted.map(
    (i) =>
      `| **${i.id}** | ${cell(i.area)} | **${i.severity}** | ${cell(i.summary)} | ${cell(
        i.customerImpact,
      )} | ${statusText(i)} |`,
  ),
].join('\n');

const howTable = [
  '| ID | Evidence | Recommended fix |',
  '| --- | --- | --- |',
  ...sorted.map((i) => `| **${i.id}** | ${cell(i.evidence)} | ${cell(i.recommendedFix)} |`),
].join('\n');

const counts = (status) => issues.filter((i) => i.status === status).length;
const bySeverity = (status) => {
  const open = issues.filter((i) => i.status === status);
  return ['P0', 'P1', 'P2', 'P3']
    .map((s) => `${s}: ${open.filter((i) => i.severity === s).length}`)
    .join(' · ');
};

const countsBlock = [
  `**Open — ${bySeverity('OPEN')}**`,
  '',
  `**Blocked outside this repository: ${counts('BLOCKED')} · Partial: ${counts(
    'PARTIAL',
  )} · Resolved: ${counts('RESOLVED')}**`,
].join('\n');

/**
 * What is left to do, in the order it is worth doing.
 *
 * This replaces four separate hand-written lists — a top ten, a must-fix, a
 * should-fix and a quick-wins table. All four were restatements of the same
 * issue list, all four had drifted, and the quick-wins table had drifted so far
 * that every id in it referred to an issue that no longer meant what the row
 * said. One list, generated, ordered by severity and then by how cheap it is.
 */
const nextTable = [
  '| ID | What | Why it matters | Effort |',
  '| --- | --- | --- | --- |',
  ...sorted
    .filter((i) => i.status !== 'RESOLVED')
    .map(
      (i) =>
        `| **${i.id}** | ${cell(i.summary)} | ${cell(i.customerImpact)} | ${cell(
          i.effort ?? '—',
        )} |`,
    ),
].join('\n');

// --- write, or check ----------------------------------------------------------

const report = readFileSync(REPORT, 'utf8');

function replaceBetween(text, begin, end, body) {
  const from = text.indexOf(begin);
  const to = text.indexOf(end);
  if (from === -1 || to === -1) {
    throw new Error(`docs/report.md is missing the ${begin} … ${end} markers.`);
  }
  return `${text.slice(0, from + begin.length)}\n\n${body}\n\n${text.slice(to)}`;
}

let next = report;
next = replaceBetween(next, BEGIN_WHAT, END_WHAT, whatTable);
next = replaceBetween(next, BEGIN_HOW, END_HOW, howTable);
next = replaceBetween(next, BEGIN_COUNTS, END_COUNTS, countsBlock);
next = replaceBetween(next, BEGIN_NEXT, END_NEXT, nextTable);

const problems = [];

// 2. Every id the report mentions exists.
const known = new Set(issues.flatMap((i) => [i.id, i.supersedes].filter(Boolean)));
for (const id of new Set(report.match(/\bI-\d{2}\b/g) ?? [])) {
  if (!known.has(id)) problems.push(`report.md mentions ${id}, which is not in docs/issues.json`);
}

/*
 * 3. No prose outside the tables contradicts a status.
 *
 * Deliberately narrow: it looks for an id and a status word close together,
 * outside the generated blocks, and complains only when the status word is not
 * the one the source gives. A looser rule would fire on every sentence that
 * happens to contain "open".
 */
const generated = [
  [BEGIN_WHAT, END_WHAT],
  [BEGIN_HOW, END_HOW],
  [BEGIN_COUNTS, END_COUNTS],
  [BEGIN_NEXT, END_NEXT],
];
let prose = report;
for (const [begin, end] of generated) {
  const from = prose.indexOf(begin);
  const to = prose.indexOf(end);
  if (from !== -1 && to !== -1) prose = prose.slice(0, from) + prose.slice(to);
}

/*
 * Status words, including the lower-case ways a paragraph says the same thing.
 *
 * "I-16 … unresolved" was in two sections of the previous report and neither was
 * a table, so a generator alone would not have found it. The mapping is from
 * what the prose says to the status it implies.
 */
const SAID_AS = {
  OPEN: 'OPEN',
  PARTIAL: 'PARTIAL',
  RESOLVED: 'RESOLVED',
  BLOCKED: 'BLOCKED',
  unresolved: 'OPEN',
  'still open': 'OPEN',
  'not fixed': 'OPEN',
  fixed: 'RESOLVED',
  done: 'RESOLVED',
};
const STATUS_WORDS = new RegExp(`\\b(${Object.keys(SAID_AS).join('|')})\\b`, 'g');
for (const issue of issues) {
  // Both ways round the id. "(I-16) is unresolved" and "stands unresolved
  // (I-16)" are the same claim, and the previous report used the second form.
  const near = new RegExp(`[^.\\n]{0,90}${issue.id}[^.\\n]{0,90}`, 'g');
  for (const sentence of prose.match(near) ?? []) {
    for (const [word] of sentence.matchAll(STATUS_WORDS)) {
      if (SAID_AS[word] !== issue.status) {
        problems.push(
          `report.md says "${issue.id} … ${word}" outside the generated tables, but docs/issues.json says ${issue.status}: ${sentence.trim()}`,
        );
      }
    }
  }
}

if (CHECK) {
  if (next !== report) {
    problems.unshift('the issue tables in docs/report.md are out of date — run `npm run issues`');
  }
  if (problems.length > 0) {
    console.error(`Issue source — ${problems.length} problem(s):`);
    for (const line of problems) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(`Issue source — ${issues.length} issues, report tables up to date.`);
} else {
  writeFileSync(REPORT, next);
  console.log(
    `Issue source — ${issues.length} issues written into docs/report.md (${counts(
      'OPEN',
    )} open, ${counts('BLOCKED')} blocked, ${counts('PARTIAL')} partial, ${counts(
      'RESOLVED',
    )} resolved).`,
  );
  if (problems.length > 0) {
    console.log(`\n  ${problems.length} thing(s) to fix in the prose:`);
    for (const line of problems) console.log(`    ${line}`);
  }
}
