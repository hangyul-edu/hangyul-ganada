#!/usr/bin/env node
/**
 * Is the delivered package built from the source in front of you?
 *
 *   npm run release:current
 *
 * ## The finding this exists to make impossible
 *
 * "The shipped APK/AAB predate the fixes in this report" has been written in
 * four consecutive product-truth reports. Each time it was closed, and each
 * time the next report opened with it again. It is the single most repeated
 * defect in this product's history and it has never been caused by the build
 * failing — the build works. It is caused by product work landing *after* the
 * build and nothing noticing.
 *
 * And nothing could notice, because every other gate in this repository checks
 * the **working tree**. `verify:release` can be green from end to end, the tree
 * can be clean, the history can be readable, and the file a customer downloads
 * can still be from a different commit. The last occurrence shipped an APK that
 * still contained a retired video splash and the previous syllable geometry,
 * three hours after both were replaced.
 *
 * This is the check that closes it, and it is thirty lines. `build-info.json`
 * already records the commit each artefact was built from. Nothing had ever
 * read it back.
 *
 * ## What it compares
 *
 * `git diff --name-only <built-commit>..HEAD`, filtered to files that can
 * change the product. Documents, the report, and the release directories
 * themselves are excluded — regenerating a report after a build is the normal
 * order of work and must not fail this.
 *
 * A dirty working tree fails too, and for the same reason: a build made from
 * uncommitted changes cannot be reproduced from any commit, so the question
 * "was this built from the source" has no answer rather than a good one.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/**
 * Paths whose contents cannot change what the app does.
 *
 * `docs/` because the report is written *after* the build it describes, which
 * is the correct order. The two release directories because they hold the
 * artefacts themselves and their own metadata.
 */
const NOT_THE_PRODUCT = [
  /^docs\//,
  /^result\//,
  /^app_result\//,
  /^README\.md$/,
  /^\.gitattributes$/,
  /^\.gitignore$/,
];

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

/**
 * `git status --porcelain`, as a list of paths.
 *
 * Parsed with a pattern rather than by slicing three characters off each line.
 * A porcelain line is two status characters and a space — ` M path` — and the
 * first one therefore *starts* with a space, which `git()` above trims off.
 * Slicing a fixed three then ate the first character of the first filename and
 * of no others, which is the kind of bug that looks like a rendering glitch in
 * the output and is a real off-by-one in the parser.
 */
function changedPaths() {
  return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((line) => /^..\s+(?:.*? -> )?(.*)$/.exec(line)?.[1] ?? '')
    .filter(Boolean);
}

const problems = [];
const notes = [];

const manifests = ['app_result/build-info.json', 'result/build-info.json'].filter((path) =>
  existsSync(join(root, path)),
);

if (manifests.length === 0) {
  console.log('Release currency — no build-info.json, so nothing has been delivered yet.\n');
  console.log('0 error(s).');
  process.exit(0);
}

const head = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain');

console.log('Release currency — the delivered package against the source\n');
console.log(`  HEAD          ${head}`);

for (const path of manifests) {
  const info = JSON.parse(readFileSync(join(root, path), 'utf8'));
  const built = info.commit;
  if (!built) {
    problems.push(`${path} does not record the commit it was built from`);
    continue;
  }

  let known = true;
  try {
    git('cat-file', '-e', `${built}^{commit}`);
  } catch {
    known = false;
  }
  if (!known) {
    problems.push(`${path} names commit ${built.slice(0, 8)}, which is not in this repository`);
    continue;
  }

  console.log(`  ${path.padEnd(26)} built from ${built.slice(0, 8)}`);

  if (built === head) {
    notes.push(`${path} is at HEAD`);
    continue;
  }

  const changed = git('diff', '--name-only', `${built}..HEAD`)
    .split('\n')
    .filter(Boolean)
    .filter((file) => !NOT_THE_PRODUCT.some((pattern) => pattern.test(file)));

  if (changed.length === 0) {
    notes.push(
      `${path} is behind HEAD by ${git('rev-list', '--count', `${built}..HEAD`)} commit(s), ` +
        'but nothing outside docs and the release directories changed',
    );
    continue;
  }

  problems.push(
    `${path} was built from ${built.slice(0, 8)} and ${changed.length} product file(s) have ` +
      `changed since:\n      ${changed.slice(0, 12).join('\n      ')}` +
      (changed.length > 12 ? `\n      …and ${changed.length - 12} more` : ''),
  );
}

/*
 * A dirty tree is not automatically a stale release — the edits may be the
 * report being written about the build that just happened, which is the normal
 * order. So this only objects to uncommitted changes that could change the app.
 */
const dirtyProduct = changedPaths().filter(
  (file) => !NOT_THE_PRODUCT.some((pattern) => pattern.test(file)),
);

if (dirtyProduct.length > 0) {
  problems.push(
    `the working tree has ${dirtyProduct.length} uncommitted product file(s), so no commit ` +
      `describes what would be built:\n      ${dirtyProduct.slice(0, 12).join('\n      ')}` +
      (dirtyProduct.length > 12 ? `\n      …and ${dirtyProduct.length - 12} more` : ''),
  );
} else if (dirty) {
  notes.push('the working tree is dirty, but only in docs and the release directories');
}

console.log('');
for (const note of notes) console.log(`  ok  ${note}`);
if (problems.length) {
  console.log('');
  for (const problem of problems) console.log(`  ✗  ${problem}`);
  console.log(
    `\n${problems.length} problem(s). Rebuild the release from HEAD with a clean tree, ` +
      'or commit what is outstanding first.',
  );
  process.exit(1);
}
console.log('\n0 error(s).');
