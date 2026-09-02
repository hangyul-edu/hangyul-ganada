#!/usr/bin/env node
/**
 * One release number, in every file that states one.
 *
 *   node scripts/check-version-consistency.mjs           report
 *   node scripts/check-version-consistency.mjs --check   exit non-zero on a finding
 *
 * ## Why this is separate from `check-mobile-identity.mjs`
 *
 * That file guards the two identifiers that must **never** change — the
 * application id and the launcher label. This one guards the number that must
 * change *together, everywhere*, on every release. They fail in opposite
 * directions and mixing them produces a check that cannot say plainly what it
 * wants: an appId finding means "somebody broke the store identity", a version
 * finding means "somebody did half a release".
 *
 * ## What half a release looks like
 *
 * The version is written down in eight places across three platforms and no
 * tool keeps them in step. `cap sync` does not carry it. Android reads it out
 * of `app.identity.json` at build time, so Android is usually right; iOS holds
 * its own copy in two build configurations inside `project.pbxproj`, and the
 * web app holds a third in `config/product.ts` because that is the string a
 * learner reads in Settings and quotes in a support message.
 *
 * So the failure is silent and asymmetric: the store console shows 1.0.2, the
 * About screen says 1.0.0, and the only person who finds out is a customer
 * writing in with a version number that does not match the build their crash
 * came from. Nothing in the build objects, because nothing was ever asked to.
 *
 * ## The build number, and why it is checked differently
 *
 * `version` is a marketing string and has to be *equal* everywhere. The build
 * number is an integer both stores require to increase, and never to repeat —
 * a build number that has been uploaded is spent, whatever happened to it.
 * So this checks that iOS's `CURRENT_PROJECT_VERSION` equals the identity
 * file's `buildNumber`, and separately that the number is ahead of whatever
 * the last recorded build actually used.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');

const read = (rel) => readFileSync(join(root, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

const findings = [];
const fail = (where, detail) => findings.push({ where, detail });

const identity = readJson('apps/mobile/app.identity.json');
const VERSION = identity.version;
const BUILD = identity.buildNumber;

if (!/^\d+\.\d+\.\d+$/.test(VERSION ?? '')) {
  fail('app.identity.json', `version "${VERSION}" is not a three-part release number`);
}
if (!Number.isInteger(BUILD) || BUILD < 1) {
  fail('app.identity.json', `buildNumber "${BUILD}" is not a positive integer`);
}

/**
 * Every file that states the marketing version, and how to pull it out.
 *
 * `all` means the file may carry the value more than once — iOS keeps one per
 * build configuration — and every occurrence has to agree. A file that has
 * stopped carrying it at all fails too: a regex that silently matches nothing
 * is how a gate goes green on a file somebody restructured.
 */
const VERSION_SITES = [
  {
    rel: 'apps/mobile/package.json',
    what: 'the mobile workspace package',
    pattern: /"version":\s*"([^"]+)"/,
  },
  {
    rel: 'apps/web/src/config/product.ts',
    what: 'the version shown in Settings',
    pattern: /version:\s*'([^']+)'/,
  },
  {
    rel: 'apps/mobile/ios/App/App.xcodeproj/project.pbxproj',
    what: 'iOS MARKETING_VERSION',
    pattern: /MARKETING_VERSION = ([^;]+);/g,
    all: true,
    expect: 2,
  },
  {
    rel: 'docs/legal/support.md',
    what: 'the support document header',
    pattern: /\*\*Hangyul ganada\*\* · version ([0-9.]+)/,
  },
  {
    rel: 'docs/legal/licences.md',
    what: 'the licences document header',
    pattern: /\*\*Hangyul ganada\*\* · version ([0-9.]+)/,
  },
  {
    rel: 'docs/legal/privacy-policy.md',
    what: 'the privacy policy header',
    pattern: /\*\*Hangyul ganada\*\* · version ([0-9.]+)/,
  },
];

for (const site of VERSION_SITES) {
  const text = read(site.rel);
  const found = site.all
    ? [...text.matchAll(site.pattern)].map((m) => m[1].trim())
    : [site.pattern.exec(text)?.[1]?.trim()].filter((v) => v !== undefined);

  if (found.length === 0) {
    fail(site.rel, `no version found — ${site.what} no longer states one`);
    continue;
  }
  if (site.expect !== undefined && found.length !== site.expect) {
    fail(site.rel, `${found.length} version(s) where ${site.expect} were expected (${site.what})`);
  }
  for (const value of found) {
    if (value !== VERSION) {
      fail(site.rel, `${site.what} says "${value}", not "${VERSION}"`);
    }
  }
}

/*
 * iOS's build number, which is an integer rather than the marketing string.
 */
const pbx = read('apps/mobile/ios/App/App.xcodeproj/project.pbxproj');
const projectVersions = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) =>
  m[1].trim(),
);
if (projectVersions.length !== 2) {
  fail(
    'project.pbxproj',
    `${projectVersions.length} CURRENT_PROJECT_VERSION where Debug and Release were expected`,
  );
}
for (const value of projectVersions) {
  if (value !== String(BUILD)) {
    fail('project.pbxproj', `CURRENT_PROJECT_VERSION is "${value}", not "${BUILD}"`);
  }
}

/*
 * Android does not carry a copy — it reads the identity file at build time —
 * so what is checked is that it still does. A literal pasted into the gradle
 * file is the drift this whole gate exists to catch, arriving by a different
 * door.
 */
const gradle = read('apps/mobile/android/app/build.gradle');
if (!/versionName\s+identity\.version/.test(gradle)) {
  fail('build.gradle', 'versionName is no longer read from app.identity.json');
}
if (!/versionCode\s+identity\.buildNumber/.test(gradle)) {
  fail('build.gradle', 'versionCode is no longer read from app.identity.json');
}

/*
 * The last artefact that was actually built.
 *
 * This does not require the artefact to be current — `npm run release:current`
 * owns that question and answers it against the commit. What it requires is
 * that the number about to be uploaded has not already been spent, because a
 * build number is the one value a store will not let you reuse.
 */
const BUILD_INFO = 'result/build-info.json';
if (existsSync(join(root, BUILD_INFO))) {
  const built = readJson(BUILD_INFO);
  const builtCode = built.android?.version_code;
  /*
   * A spent versionCode is spent — but the delivered artefact is not spending
   * it, it *is* it.
   *
   * This has now been wrong in both directions. It first required
   * `built.version !== VERSION` as well, which let a second 1.0.2 build reuse
   * versionCode 3: Google Play refuses a reused code whatever the version name
   * says, and `versionName` is a string it does not care about. Removing that
   * condition then made the check fire against the artefact the current build
   * number had just produced — identity 4, artefact 4 — which is not a reuse,
   * it is agreement.
   *
   * The question is whether a *rebuild at this number would produce different
   * bytes*, and that is a question about the source, not about the number:
   *
   *   artefact code > build number   the identity went backwards
   *   equal, delivery is current     correct — this artefact is this number
   *   equal, delivery is stale       a rebuild reuses the code for new bytes
   *
   * "Stale" is `release:current`'s subject and its definition is borrowed here
   * rather than restated: a product file — anything outside `docs/` and the
   * release directories — changed since the commit the artefact records.
   */
  if (Number.isInteger(builtCode)) {
    if (builtCode > BUILD) {
      fail(
        BUILD_INFO,
        `buildNumber ${BUILD} is behind the delivered artefact's versionCode ${builtCode}`,
      );
    } else if (builtCode === BUILD && deliveryIsStale(built.commit)) {
      fail(
        BUILD_INFO,
        `buildNumber ${BUILD} is the versionCode the delivered artefact already used, and a ` +
          `product file has changed since ${String(built.commit).slice(0, 8)} — a rebuild would ` +
          `reuse the code for different bytes, which Play refuses`,
      );
    }
  }
}

/**
 * Whether a product file changed since the commit the delivery was built from.
 *
 * Docs and the release directories do not count, for the reason
 * `check-release-current.mjs` gives: they are written *by* the release, so a
 * build necessarily dirties them and a check that read that as staleness could
 * never be green. Anything else changing means the delivered bytes are no
 * longer what this tree would produce.
 */
function deliveryIsStale(commit) {
  if (typeof commit !== 'string' || commit.length < 7) return false;
  const notProduct = [/^docs\//, /^result\//, /^app_result\//, /^README\.md$/, /^\.gitattributes$/, /^\.gitignore$/];
  const isProduct = (path) => path && !notProduct.some((shape) => shape.test(path));
  const run = (...args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    } catch {
      return '';
    }
  };
  const since = run('diff', '--name-only', `${commit}..HEAD`).split('\n').filter(Boolean);
  const uncommitted = run('status', '--porcelain')
    .split('\n')
    .filter(Boolean)
    .map((line) => /^..\s+(?:.*? -> )?(.*)$/.exec(line)?.[1] ?? '');
  return [...since, ...uncommitted].some(isProduct);
}

console.log('Release version — one number, every file that states one\n');
console.log(`  version               ${VERSION}`);
console.log(`  build number          ${BUILD}`);
console.log(
  '  files checked         app.identity.json · mobile package.json · config/product.ts ·\n' +
    '                        project.pbxproj (×2 configurations) · build.gradle ·\n' +
    '                        support.md · licences.md · privacy-policy.md',
);

if (findings.length === 0) {
  console.log('\n  every file agrees; the number in Settings is the number in both stores.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings) console.log(`  ${f.where.padEnd(46)} ${f.detail}`);
}

if (CHECK && findings.length > 0) process.exit(1);
