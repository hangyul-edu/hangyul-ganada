#!/usr/bin/env node
/**
 * `App.xcodeproj/project.pbxproj` is the same file it was, byte for byte.
 *
 *   node scripts/check-ios-project.mjs            report
 *   node scripts/check-ios-project.mjs --check    exit non-zero on a finding
 *   node scripts/check-ios-project.mjs --adopt    record the current file as the
 *                                                 expected one (a person's act)
 *
 * ## Why a file gets its own gate
 *
 * Everything that makes the iOS app *that* app is in this one file, and none of
 * it is generated: `DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE`,
 * `PRODUCT_BUNDLE_IDENTIFIER`, `PROVISIONING_PROFILE`,
 * `IPHONEOS_DEPLOYMENT_TARGET`, `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`
 * and the thirty `knownRegions` that decide which languages the App Store lists
 * the app in. It is maintained on a Mac, in Xcode, by the person who archives
 * the build.
 *
 * It is also the file most likely to be changed by accident from here. `cap
 * sync` rewrites parts of it; an icon script that resolves an output path
 * wrongly writes into the asset catalogue's parent; a version bump done with a
 * text substitution rewrites two settings and silently reflows a third. Any of
 * those is discovered weeks later, in App Store Connect, as a build that will
 * not sign or an app that has lost twenty-nine languages.
 *
 * The two most recent commits that touched it are the source of truth for what
 * it should contain:
 *
 * ```
 *   82e76434  Add iOS localization regions      +28 lines, knownRegions
 *   f177884e  Resolve stash merge conflict      MARKETING_VERSION, CURRENT_PROJECT_VERSION
 * ```
 *
 * ## What is checked
 *
 * The SHA-256 of the bytes and the Git blob id, against `expected` below, and
 * then the individual settings by name — because a checksum tells you that
 * *something* moved and the named list tells you *what*, which is the difference
 * between a five-minute fix and an afternoon with `git diff`.
 *
 * ## Changing it on purpose
 *
 * Edit the project in Xcode, on a Mac, then run `--adopt` in the same commit as
 * the change and say in the message what moved. There is no path here that
 * rewrites the project file itself.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');
const ADOPT = process.argv.includes('--adopt');

const PROJECT = 'apps/mobile/ios/App/App.xcodeproj/project.pbxproj';
const LOCK = 'apps/mobile/ios/project-file.lock.json';

/**
 * The settings named one at a time, so a finding says which one moved.
 *
 * `count` is how many times the setting appears — two for anything that is per
 * build configuration, and a number that changing is itself the finding: a
 * `DEVELOPMENT_TEAM` that appears once means one configuration lost it.
 */
const SETTINGS = [
  { name: 'DEVELOPMENT_TEAM', count: 2 },
  { name: 'CODE_SIGN_STYLE', count: 2 },
  { name: 'PRODUCT_BUNDLE_IDENTIFIER', count: 2 },
  // Four: the project's two configurations and the App target's two.
  { name: 'IPHONEOS_DEPLOYMENT_TARGET', count: 4 },
  { name: 'MARKETING_VERSION', count: 2 },
  { name: 'CURRENT_PROJECT_VERSION', count: 2 },
];

const bytes = readFileSync(join(root, PROJECT));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const blob = execFileSync('git', ['hash-object', PROJECT], { cwd: root, encoding: 'utf8' }).trim();
const text = bytes.toString('utf8');

const settingValues = Object.fromEntries(
  SETTINGS.map(({ name }) => [
    name,
    [...text.matchAll(new RegExp(`${name} = ([^;]+);`, 'g'))].map((m) => m[1].trim()),
  ]),
);
const knownRegions = (text.match(/knownRegions = \(([\s\S]*?)\);/)?.[1] ?? '')
  .split(',')
  .map((entry) => entry.trim().replace(/^"|"$/g, ''))
  .filter(Boolean);

if (ADOPT) {
  const lock = {
    _comment:
      'The expected state of App.xcodeproj/project.pbxproj. Written by ' +
      '`node scripts/check-ios-project.mjs --adopt`, and only ever after the project ' +
      'was changed deliberately, in Xcode, on a Mac. See the header of that script.',
    sha256,
    blob,
    settings: settingValues,
    knownRegions,
  };
  writeFileSync(join(root, LOCK), `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`recorded ${PROJECT}\n  sha256 ${sha256}\n  blob   ${blob}`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(join(root, LOCK), 'utf8'));
const findings = [];

if (sha256 !== expected.sha256) {
  findings.push(`sha256 is ${sha256}, expected ${expected.sha256}`);
}
if (blob !== expected.blob) {
  findings.push(`git blob id is ${blob}, expected ${expected.blob}`);
}
for (const { name, count } of SETTINGS) {
  const found = settingValues[name];
  const want = expected.settings?.[name] ?? [];
  if (found.length !== count) {
    findings.push(`${name} appears ${found.length} time(s); ${count} were expected`);
  }
  if (found.join('|') !== want.join('|')) {
    findings.push(`${name} is [${found.join(', ')}], expected [${want.join(', ')}]`);
  }
}
if (knownRegions.join(',') !== (expected.knownRegions ?? []).join(',')) {
  findings.push(
    `knownRegions is ${knownRegions.length} region(s), expected ${(expected.knownRegions ?? []).length}` +
      ` — [${knownRegions.join(' ')}]`,
  );
}

console.log('iOS project file — unchanged, and every protected setting where it was\n');
console.log(`  file                  ${PROJECT}`);
console.log(`  sha256                ${sha256}`);
console.log(`  git blob              ${blob}`);
console.log(`  marketing version     ${settingValues.MARKETING_VERSION.join(' / ')}`);
console.log(`  project version       ${settingValues.CURRENT_PROJECT_VERSION.join(' / ')}`);
console.log(`  development team      ${settingValues.DEVELOPMENT_TEAM.join(' / ')}`);
console.log(`  signing style         ${settingValues.CODE_SIGN_STYLE.join(' / ')}`);
console.log(`  bundle identifier     ${settingValues.PRODUCT_BUNDLE_IDENTIFIER.join(' / ')}`);
console.log(`  deployment target     ${settingValues.IPHONEOS_DEPLOYMENT_TARGET.join(' / ')}`);
console.log(`  known regions         ${knownRegions.length}`);

if (findings.length === 0) {
  console.log('\n  the project file is byte-for-byte what it was; nothing here was edited.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const finding of findings) console.log(`  ${finding}`);
  console.log(
    '\n  If the change was deliberate and made in Xcode, run:\n' +
      '    node scripts/check-ios-project.mjs --adopt\n' +
      '  and commit the lock file with it. If it was not, restore the file:\n' +
      `    git checkout -- ${PROJECT}`,
  );
}

if (CHECK && findings.length > 0) process.exit(1);
