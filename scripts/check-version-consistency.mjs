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
 * a build number that has been uploaded is spent, whatever happened to it. So
 * this checks that the number is ahead of whatever the last recorded build
 * actually used.
 *
 * ## iOS is checked against what it *says it is*, not against Android
 *
 * The Xcode project's `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` are
 * build settings Xcode owns. They are edited on a Mac, in the UI, by the person
 * who is going to archive the build; a text substitution performed from Linux
 * is how a project file silently loses a setting nobody was looking at, and it
 * is the single most expensive file in this repository to get wrong — signing,
 * the team id, the bundle identifier and the localisation regions all live in
 * it.
 *
 * So this gate stopped demanding that iOS equal Android. `app.identity.json`
 * declares, under `ios.xcode`, exactly what the project file carries, and this
 * asserts that the project file still carries it. That keeps the protection —
 * any *unexpected* change to those two settings fails — while allowing an
 * Android release to ship at 1.0.3 while iOS is still at 1.0.2, which is the
 * actual state of a project whose iOS half cannot be built from here.
 *
 * While the declared iOS values are behind `version` and `buildNumber`, the
 * report prints the pending action. It is a line for a person to act on, not a
 * failure: failing would mean no Android release could ever be cut without a
 * Mac in the room.
 *
 * ## The web release, and why it may lead the native one
 *
 * A web-only release changes `apps/web/dist` and nothing a store sees. The
 * number a learner reads on the Legal and Privacy screens has to move with it,
 * and the native number has to stay exactly what the delivered APK, AAB and
 * Xcode project carry — a versionName edited without a build is the drift
 * this gate was written to catch. So the web has its own pinned literal
 * (`WEB_RELEASE_VERSION`, held by `config/product.ts` and the web release
 * notes) and the native sites keep theirs (`RELEASE_VERSION`, held by
 * `app.identity.json` and everything that follows it). The relationship is
 * checked in one direction: the web may be *ahead* of the native deliveries,
 * never behind them, and while they differ the pending native release is
 * printed as a line for the person with the store consoles — exactly the
 * arrangement this file already used for an iOS project lagging Android.
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
  /*
   * `apps/web/src/config/product.ts` is not in this list any more: it holds the
   * *web* release, checked above against `WEB_RELEASE_VERSION` and against
   * this number's ordering rather than its equality.
   */
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
  /*
   * The two files a customer or a reviewer reads *first*, which were the two
   * this gate did not read. The release notes said 1.0.0 for three bumps and
   * the report's front matter said 1.0.6 under a tree that had been set back
   * to 1.0.4 — each the one place a wrong number would be quoted from.
   */
  {
    rel: 'store/release-notes.md',
    what: 'the release notes heading',
    pattern: /^# Release notes — ([0-9.]+)/m,
  },
  {
    rel: 'docs/report.md',
    what: 'the report front matter (the delivered native version)',
    pattern: /^version: ([0-9.]+)$/m,
  },
];


/*
 * The number itself, not only its agreement.
 *
 * Every site above is held to `app.identity.json`, so a tree in which every
 * copy had moved to the same wrong number would pass. The product's own unit
 * test (`apps/web/src/config/product.test.ts`) pins the literal, and this pins
 * the same literal here so the gate cannot go green on a wrong-but-consistent
 * tree without somebody editing both. Update both in the release commit.
 */
const RELEASE_VERSION = '1.0.5';
if (VERSION !== RELEASE_VERSION) {
  fail('app.identity.json', `version is "${VERSION}"; the native release is ${RELEASE_VERSION}`);
}

/*
 * The web product's own release number — see the header.
 *
 * Pinned here and in `apps/web/src/config/product.test.ts`, for the same
 * reason the native literal is pinned twice. It is held to `config/product.ts`
 * (what a learner reads) and to the web release notes (what a reviewer reads),
 * and it must not be *behind* the native number: a web build that reported an
 * older version than the binary built from the same tree would be the drift
 * this gate exists to catch, arriving from the other side.
 */
const WEB_RELEASE_VERSION = '1.0.5';
const productSource = read('apps/web/src/config/product.ts');
const WEB_VERSION = /version:\s*'([^']+)'/.exec(productSource)?.[1]?.trim();
if (WEB_VERSION === undefined) {
  fail('config/product.ts', 'no version found — the version shown in Settings is no longer stated');
} else if (WEB_VERSION !== WEB_RELEASE_VERSION) {
  fail('config/product.ts', `version is "${WEB_VERSION}"; the web release is ${WEB_RELEASE_VERSION}`);
}
const compareVersions = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
if (WEB_VERSION && compareVersions(WEB_VERSION, VERSION) < 0) {
  fail(
    'config/product.ts',
    `the web reports ${WEB_VERSION}, behind the native release ${VERSION} — the web may lead the ` +
      'native deliveries, never lag them',
  );
}
{
  const notes = 'docs/WEB_RELEASE_NOTES_v' + WEB_RELEASE_VERSION + '.md';
  if (!existsSync(join(root, notes))) {
    fail(notes, 'the web release notes for this version do not exist');
  } else {
    const heading = /^# Web release notes — ([0-9.]+)/m.exec(read(notes))?.[1];
    if (heading !== WEB_RELEASE_VERSION) {
      fail(notes, `the heading says "${heading ?? 'nothing'}", not "${WEB_RELEASE_VERSION}"`);
    }
  }
}
/*
 * The report's front matter names both numbers, so the PDF cover can say which
 * product each figure in it is about. `version:` stays the delivered native
 * artefact (docs:consistency holds it to `result/build-info.json`);
 * `web_version:` is the web product the pass tested.
 */
{
  const webStated = /^web_version: ([0-9.]+)$/m.exec(read('docs/report.md'))?.[1];
  if (webStated === undefined) {
    fail('docs/report.md', 'the front matter no longer states web_version');
  } else if (webStated !== WEB_RELEASE_VERSION) {
    fail('docs/report.md', `the front matter says web_version ${webStated}, not ${WEB_RELEASE_VERSION}`);
  }
}
/* The `v` form a learner reads. `v.1.0.4` and `v1.0.6` are the two shapes that were reported. */
const display = /displayVersion[\s\S]*?return `v\$\{PRODUCT\.version\}`/.test(productSource);
if (!display) fail('config/product.ts', 'displayVersion() no longer renders `v` + PRODUCT.version');

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
 * The Xcode project, against what the identity file says it contains.
 *
 * Both settings, both configurations. A value that is not the declared one is a
 * finding whichever direction it moved: somebody editing the project file from
 * a script fails here, and so does somebody updating it in Xcode and not saying
 * so in `app.identity.json`.
 */
const XCODE = identity.ios?.xcode;
const pbx = read('apps/mobile/ios/App/App.xcodeproj/project.pbxproj');
if (!XCODE || typeof XCODE.marketingVersion !== 'string' || !Number.isInteger(XCODE.currentProjectVersion)) {
  fail('app.identity.json', 'ios.xcode must declare marketingVersion and currentProjectVersion');
} else {
  const settings = [
    ['MARKETING_VERSION', String(XCODE.marketingVersion)],
    ['CURRENT_PROJECT_VERSION', String(XCODE.currentProjectVersion)],
  ];
  for (const [setting, declared] of settings) {
    const found = [...pbx.matchAll(new RegExp(`${setting} = ([^;]+);`, 'g'))].map((m) => m[1].trim());
    if (found.length !== 2) {
      fail('project.pbxproj', `${found.length} ${setting} where Debug and Release were expected`);
      continue;
    }
    for (const value of found) {
      if (value !== declared) {
        fail(
          'project.pbxproj',
          `${setting} is "${value}"; app.identity.json declares "${declared}". The Xcode ` +
            'project is edited in Xcode — update the declaration in the same commit.',
        );
      }
    }
  }
}

/**
 * The pending iOS release, if there is one.
 *
 * Reported rather than failed. See the header: the Android half of a release
 * can be cut from this machine and the iOS half cannot, so a lag is a state the
 * project is allowed to be in — as long as it is written down, which is what
 * `ios.xcode` is for.
 */
const iosPending =
  XCODE && (XCODE.marketingVersion !== VERSION || XCODE.currentProjectVersion !== BUILD)
    ? `iOS is at ${XCODE.marketingVersion} build ${XCODE.currentProjectVersion}; this release is ` +
      `${VERSION} build ${BUILD}. ${XCODE.pending ?? ''}`.trim()
    : null;

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
let staleDelivery = null;
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
      /*
       * While the web leads the native deliveries, this is not a finding about
       * *this* tree — it is the definition of that state: the artefacts were
       * built before the web moved on, and the next native build has to take a
       * new number. It is said in the pending line, where the person who will
       * cut that build reads it. The moment `app.identity.json` is moved up to
       * the web's number without the build number following, the two are equal
       * again and this fails exactly as it always did.
       */
      const message =
        `buildNumber ${BUILD} is the versionCode the delivered artefact already used, and a ` +
        `product file has changed since ${String(built.commit).slice(0, 8)} — a rebuild would ` +
        `reuse the code for different bytes, which Play refuses`;
      if (WEB_VERSION && compareVersions(WEB_VERSION, VERSION) > 0) staleDelivery = message;
      else fail(BUILD_INFO, message);
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
  // `store/` alongside `docs/`: listing copy is delivered beside the artefact,
  // never inside it. See `NOT_THE_PRODUCT` in check-release-current.mjs.
  const notProduct = [/^docs\//, /^result\//, /^app_result\//, /^store\//, /^README\.md$/, /^\.gitattributes$/, /^\.gitignore$/];
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

const webPending =
  WEB_VERSION && compareVersions(WEB_VERSION, VERSION) > 0
    ? `the web is at ${WEB_VERSION}; the Android and iOS deliveries are at ${VERSION} build ${BUILD}. ` +
      `A native release at ${WEB_VERSION} needs app.identity.json moved to it with a build number ` +
      `above ${BUILD}, then a build — neither is done from a web-only pass.`
    : null;

console.log('Release version — one number per product, every file that states one\n');
console.log(`  web version           ${WEB_VERSION ?? '(missing)'}   config/product.ts · web release notes · report web_version`);
console.log(`  native version        ${VERSION}   app.identity.json and everything that follows it`);
console.log(`  build number          ${BUILD}`);
console.log(
  '  files checked         app.identity.json · mobile package.json · config/product.ts ·\n' +
    '                        project.pbxproj (×2 configurations) · build.gradle ·\n' +
    '                        support.md · licences.md · privacy-policy.md ·\n' +
    '                        release-notes.md · report.md front matter · WEB_RELEASE_NOTES',
);
if (webPending) {
  console.log(`\n  pending, for a person with the store consoles:\n    ${webPending}`);
  if (staleDelivery) console.log(`    ${staleDelivery}.`);
}
if (XCODE) {
  console.log(`  iOS (Xcode-managed)   ${XCODE.marketingVersion} build ${XCODE.currentProjectVersion}`);
}
if (iosPending) console.log(`\n  pending, for a person with Xcode:\n    ${iosPending}`);

if (findings.length === 0) {
  console.log(
    webPending
      ? '\n  every file agrees with its own product; the number in Settings is the web release, and the native deliveries are named above.'
      : '\n  every file agrees; the number in Settings is the number in both stores.',
  );
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings) console.log(`  ${f.where.padEnd(46)} ${f.detail}`);
}

if (CHECK && findings.length > 0) process.exit(1);
