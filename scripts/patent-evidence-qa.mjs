#!/usr/bin/env node
/**
 * Does the patent package still point at things that exist?
 *
 *   npm run patent:evidence            print the audit
 *   npm run patent:evidence -- --check fail the build on a broken reference
 *
 * ## Why a gate and not a proofread
 *
 * `evidence_map.md` is the document that makes the disclosure checkable: every
 * labelled statement in it names a source file, a symbol and, where the claim is
 * a measurement, the command that produced the number. That is exactly the kind
 * of document that rots silently — a file is renamed, a script is retired, a
 * measurement is quoted from a run three months old — and the failure is
 * invisible until somebody outside the repository tries to follow a reference
 * and cannot.
 *
 * The stakes are higher here than for ordinary documentation. A disclosure is
 * read by counsel and, if it goes further, by an examiner. A citation to a file
 * that is not there is not a typo; it is an unsupported claim.
 *
 * ## What it checks
 *
 * | | |
 * | --- | --- |
 * | every repository path cited in the patent package exists | a renamed module |
 * | every `npm run` command cited is a real script | a retired gate |
 * | every figure referenced is on disk | a diagram that was never built |
 * | the two disclosures cite the same evidence | the Korean half drifting from the English |
 * | no statement is marked TESTED without a command | a status stronger than its evidence |
 *
 * ## What it cannot check
 *
 * Whether the number quoted is the number the command prints today. That needs
 * the command run, which is what `verify:release` is; this gate is the cheap
 * half that catches the references, and the disclosure says which figures were
 * produced on which tree.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PATENT = join(ROOT, 'patent');
const CHECK = process.argv.includes('--check');

const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;

/*
  `patent/` is in `.gitignore`, and deliberately: the remote is public, a commit
  to it is a publication, and the disclosure is marked confidential. So a fresh
  clone does not have the directory this gate reads — and a release check that
  fails for everyone but the one machine holding the package would be a check
  nobody could act on.

  Absent is therefore a *skip*, announced rather than silent. Present is a real
  run. That is the only branch: there is no partial mode, because a package that
  is half here is a package whose cross-references cannot be resolved.
*/
if (!existsSync(PATENT)) {
  console.log('\npatent/ is not in this checkout — skipping. It is gitignored by design.\n');
  process.exit(0);
}

const DOCS = readdirSync(PATENT).filter((name) => name.endsWith('.md'));

/**
 * A backticked token that looks like a repository path.
 *
 * Deliberately conservative: it has to contain a slash and end in an extension
 * this repository actually uses, so `evaluate()` and `AnswerDomain` are not
 * mistaken for files and a prose mention of `apps/web` is not either.
 */
const PATH_LIKE = /`([A-Za-z0-9._@/-]+\.(?:ts|tsx|mjs|mts|py|json|svg|css|md))`/g;
const NPM_RUN = /`npm run ([a-z0-9:._-]+)(?:\s+--\s+--check)?`/g;
const FIGURE = /!\[[^\]]*\]\((figures\/[^)]+)\)/g;

const findings = [];
const note = (rule, detail) => findings.push({ rule, detail });

/**
 * Where a cited path might live.
 *
 * The documents name modules the way a reader would — `evaluate.ts`,
 * `config.ts` — relative to the package being discussed rather than to the
 * repository root, so a bare filename is resolved by searching. A path that
 * resolves nowhere is the finding.
 */
const index = new Map();
(function walk(dir, depth = 0) {
  if (depth > 8) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, depth + 1);
    else {
      const list = index.get(entry.name) ?? [];
      list.push(full.slice(ROOT.length + 1));
      index.set(entry.name, list);
    }
  }
})(ROOT);

/**
 * Whether a cited path names something in this repository.
 *
 * Three ways, in order of strictness. The second and third exist because the
 * documents cite modules the way a reader would rather than the way a build
 * would: `handwriting-core/evaluate.ts` is how somebody discussing the package
 * refers to `packages/handwriting-core/src/evaluate.ts`, and spelling every
 * path in full would make the prose unreadable to the audience it is for.
 *
 * So a citation resolves if its segments appear **in order** somewhere in a real
 * path ending in that filename. That accepts the abbreviation and still rejects
 * `handwriting-core/nonexistent.ts` and `korean-morphology/evaluate.ts`, which
 * is the distinction the gate is for.
 */
function resolves(cited) {
  if (existsSync(join(ROOT, cited))) return true;
  const wanted = cited.split('/');
  const base = wanted[wanted.length - 1];
  return (index.get(base) ?? []).some((known) => {
    const parts = known.split('/');
    let at = 0;
    for (const segment of wanted) {
      at = parts.indexOf(segment, at);
      if (at === -1) return false;
      at += 1;
    }
    return true;
  });
}

const citedPaths = new Map();
const citedScripts = new Map();

for (const doc of DOCS) {
  const text = readFileSync(join(PATENT, doc), 'utf8');

  for (const [, cited] of text.matchAll(PATH_LIKE)) {
    (citedPaths.get(cited) ?? citedPaths.set(cited, []).get(cited)).push(doc);
    if (!resolves(cited)) note('cited path does not exist', `${doc}: ${cited}`);
  }
  for (const [, name] of text.matchAll(NPM_RUN)) {
    (citedScripts.get(name) ?? citedScripts.set(name, []).get(name)).push(doc);
    if (!scripts[name]) note('cited npm script does not exist', `${doc}: npm run ${name}`);
  }
  for (const [, figure] of text.matchAll(FIGURE)) {
    if (!existsSync(join(PATENT, figure))) note('figure is missing', `${doc}: ${figure}`);
  }

  /*
    A status is a promise about what backs a statement, and the strongest one
    promises a command. `evidence_map.md` says so in its own preamble: a row
    with a reproduction command is TESTED, a row without is IMPLEMENTED. A row
    that claims TESTED with an empty command column is claiming more evidence
    than it has.
  */
  if (doc === 'evidence_map.md') {
    for (const line of text.split('\n')) {
      if (!line.startsWith('|') || !line.includes('TESTED')) continue;
      const cells = line.split('|').map((cell) => cell.trim());
      const status = cells[cells.length - 2];
      if (status !== 'TESTED') continue;
      const command = cells[cells.length - 3] ?? '';
      if (!command || command === '—') {
        note('TESTED with no reproduction', line.slice(0, 110));
      }
    }
  }
}

/*
  The two disclosures are one document in two languages, not two documents. A
  path cited in one and not the other is a section that has drifted — which is
  how a translation stops being a translation.
*/
const en = readFileSync(join(PATENT, 'technical_disclosure_en.md'), 'utf8');
const ko = readFileSync(join(PATENT, 'technical_disclosure_ko.md'), 'utf8');
const pathsIn = (text) => new Set([...text.matchAll(PATH_LIKE)].map(([, cited]) => cited));
const enPaths = pathsIn(en);
const koPaths = pathsIn(ko);
for (const cited of enPaths) {
  if (!koPaths.has(cited)) note('cited in English, not in Korean', cited);
}
for (const cited of koPaths) {
  if (!enPaths.has(cited)) note('cited in Korean, not in English', cited);
}

console.log(
  `\nPatent package — ${DOCS.length} documents, ${citedPaths.size} distinct paths cited, ` +
    `${citedScripts.size} commands cited\n`,
);
console.log(`  English disclosure  ${en.split('\n').length} lines, ${enPaths.size} paths`);
console.log(`  Korean disclosure   ${ko.split('\n').length} lines, ${koPaths.size} paths`);

if (findings.length === 0) {
  console.log('\n  every path, command and figure the patent package cites is present.');
} else {
  const byRule = new Map();
  for (const { rule, detail } of findings) {
    const list = byRule.get(rule) ?? [];
    list.push(detail);
    byRule.set(rule, list);
  }
  console.log(`\n  ${findings.length} finding(s):\n`);
  for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${String(list.length).padStart(4)}  ${rule}`);
    for (const detail of list.slice(0, 10)) console.log(`          ${detail}`);
    if (list.length > 10) console.log(`          … and ${list.length - 10} more`);
  }
}

if (CHECK && findings.length > 0) {
  console.log('\nfailing: a disclosure must not cite something that is not there.');
  process.exit(1);
}
