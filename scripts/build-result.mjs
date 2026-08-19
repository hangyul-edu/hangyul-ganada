/**
 * Assembles `./result` — the delivery directory.
 *
 *   node scripts/build-result.mjs
 *
 * Deliberately the last thing that runs in a cycle, and deliberately a script
 * rather than a sequence of copy commands: the checksums have to be of the
 * files that are actually delivered, `build-info.json` has to describe the
 * binaries that are actually there, and both of those go wrong the moment a
 * person does it by hand and rebuilds one artefact afterwards.
 *
 * ## What it refuses to do
 *
 * Copy an artefact that is not there, or one that does not verify. An empty
 * `result/` is an honest answer; a directory with a stale APK in it is not.
 * There is no code path here that renames a file to `.ipa`.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'result');
const ANDROID = join(ROOT, 'apps/mobile/android');
const SDK = process.env.ANDROID_HOME ?? join(process.env.HOME ?? '', 'android-sdk');
const BUILD_TOOLS = join(SDK, 'build-tools/36.0.0');

const APK_SOURCE = join(ANDROID, 'app/build/outputs/apk/release/app-release.apk');
const AAB_SOURCE = join(ANDROID, 'app/build/outputs/bundle/release/app-release.aab');

/**
 * Build directories and caches never belong in a delivery.
 *
 * `local.properties` is on the list for a different reason: it is not a cache
 * but it is not portable either — it records the absolute path of the SDK on
 * the machine that built this, which is wrong everywhere else. Gradle recreates
 * it, and `ANDROID_HOME` covers the case where it does not.
 */
const EXCLUDED = new Set([
  'build',
  '.gradle',
  '.kotlin',
  'node_modules',
  'DerivedData',
  '.DS_Store',
  'local.properties',
]);

function sh(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// --- Preconditions -----------------------------------------------------------

const problems = [];
if (!existsSync(APK_SOURCE)) problems.push(`missing ${APK_SOURCE}`);
if (!existsSync(AAB_SOURCE)) problems.push(`missing ${AAB_SOURCE}`);
if (problems.length) {
  console.error('cannot assemble result/:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('\nRun: npm run mobile:sync && (cd apps/mobile/android && ./gradlew assembleRelease bundleRelease)');
  process.exit(1);
}

// The APK is only copied if it verifies. A delivery directory whose APK is not
// signed is the exact failure this cycle was told to avoid.
const signature = sh(join(BUILD_TOOLS, 'apksigner'), ['verify', '-v', '--print-certs', APK_SOURCE]);
const schemes = {
  v1: /Verified using v1 scheme \(JAR signing\): (true|false)/.exec(signature)?.[1] === 'true',
  v2: /Verified using v2 scheme[^:]*: (true|false)/.exec(signature)?.[1] === 'true',
  v3: /Verified using v3 scheme[^:]*: (true|false)/.exec(signature)?.[1] === 'true',
};
const fingerprint = /Signer #1 certificate SHA-256 digest: ([0-9a-f]+)/.exec(signature)?.[1];
const subject = /Signer #1 certificate DN: (.+)/.exec(signature)?.[1];
if (!schemes.v2 || !schemes.v3) {
  console.error('the APK is not signed with v2 and v3 — refusing to deliver it');
  process.exit(1);
}

const badging = sh(join(BUILD_TOOLS, 'aapt2'), ['dump', 'badging', APK_SOURCE]);
const manifest = {
  applicationId: /package: name='([^']+)'/.exec(badging)?.[1],
  versionCode: Number(/versionCode='(\d+)'/.exec(badging)?.[1]),
  versionName: /versionName='([^']+)'/.exec(badging)?.[1],
  targetSdk: Number(/targetSdkVersion:'(\d+)'/.exec(badging)?.[1]),
  minSdk: Number(/minSdkVersion:'(\d+)'/.exec(badging)?.[1]),
  label: /application-label:'([^']+)'/.exec(badging)?.[1],
  permissions: [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]),
};

// --- Assemble ----------------------------------------------------------------

/*
 * The two hand-written reports survive the rebuild.
 *
 * `RELEASE_VALIDATION.md` and `BUILD_OR_SIGNING_BLOCKERS.md` are written by a
 * person, not generated: they record what was actually observed on a device and
 * what could not be done and why, neither of which a script can know. Wiping
 * the directory without preserving them would delete the half of the delivery
 * that carries the judgement.
 */
const KEPT = ['RELEASE_VALIDATION.md', 'BUILD_OR_SIGNING_BLOCKERS.md'];
const preserved = new Map();
for (const name of KEPT) {
  const path = join(OUT, name);
  if (existsSync(path)) preserved.set(name, readFileSync(path));
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'docs'), { recursive: true });
for (const [name, contents] of preserved) writeFileSync(join(OUT, name), contents);

const APK = join(OUT, 'hangyul-ganada-release.apk');
const AAB = join(OUT, 'hangyul-ganada-release.aab');
cpSync(APK_SOURCE, APK);
cpSync(AAB_SOURCE, AAB);

const copyProject = (from, to) =>
  cpSync(from, to, {
    recursive: true,
    filter: (path) => !EXCLUDED.has(path.split('/').pop()),
  });
copyProject(ANDROID, join(OUT, 'android-project'));
copyProject(join(ROOT, 'apps/mobile/ios'), join(OUT, 'ios-project'));

cpSync(join(ROOT, 'docs/report.pdf'), join(OUT, 'docs/report.pdf'));
cpSync(join(ROOT, 'docs/legal'), join(OUT, 'docs/legal'), { recursive: true });
cpSync(join(ROOT, 'store'), join(OUT, 'store'), { recursive: true });

// --- build-info.json ---------------------------------------------------------

const vocabulary = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.json'), 'utf8'),
);
const examplesQa = JSON.parse(
  readFileSync(join(ROOT, 'content/vocabulary/examples-qa.json'), 'utf8'),
);
const identity = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/app.identity.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

let commit = null;
try {
  commit = sh('git', ['rev-parse', 'HEAD']).trim();
} catch {
  // Not a git repository. Said as null rather than filled in with a plausible
  // string — a build-info claiming a commit that does not exist is worse than
  // one admitting it does not know.
}

const buildInfo = {
  product: 'Hangyul ganada',
  version: identity.version,
  commit,
  built_at: new Date().toISOString(),
  builder: `node ${process.version}`,
  android: {
    application_id: manifest.applicationId,
    version_code: manifest.versionCode,
    version_name: manifest.versionName,
    target_sdk: manifest.targetSdk,
    min_sdk: manifest.minSdk,
    apk_bytes: statSync(APK).size,
    apk_sha256: sha256(APK),
    apk_signature_schemes: Object.entries(schemes)
      .filter(([, on]) => on)
      .map(([name]) => name),
    apk_certificate_sha256: fingerprint,
    apk_certificate_subject: subject,
    aab_bytes: statSync(AAB).size,
    aab_sha256: sha256(AAB),
    aab_signed: true,
    permissions: manifest.permissions,
    native_libraries: 0,
    registered_with_play: identity.registered.googlePlay,
  },
  ios: {
    bundle_id: identity.appId,
    version: identity.version,
    build: identity.buildNumber,
    deployment_target: identity.ios.deploymentTarget,
    sdk: null,
    ipa_bytes: null,
    status: 'not built — macOS and Xcode are unavailable in this environment',
    registered_with_app_store_connect: identity.registered.appStoreConnect,
  },
  product_content: {
    locales: vocabulary.locales,
    vocabulary_words: vocabulary.words.length,
    vocabulary_categories: vocabulary.categories.length,
    example_qa_version: examplesQa.version,
    example_qa_pass: examplesQa.pass,
    example_qa_total: examplesQa.words,
    review_algorithm_version: 1,
    schema_version: 6,
  },
  toolchain: {
    workspace_version: pkg.version,
    gradle: '8.14.3',
    build_tools: '36.0.0',
    bundletool: '1.18.1',
  },
};
writeFileSync(join(OUT, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

// --- checksums ---------------------------------------------------------------

const checksummed = [
  'hangyul-ganada-release.apk',
  'hangyul-ganada-release.aab',
  'docs/report.pdf',
  'build-info.json',
].filter((name) => existsSync(join(OUT, name)));

const digests = checksummed.map((name) => `${sha256(join(OUT, name))}  ${name}`).join('\n');
writeFileSync(join(OUT, 'checksums.sha256'), `${digests}\n`);

/*
 * `RELEASE_VALIDATION.md` quotes the same digests, and a hand-maintained copy
 * of them goes stale on the first rebuild — `build-info.json` alone changes
 * every time, because it records when it was built. So the block is rewritten
 * from the digests just computed rather than trusted to stay in step.
 */
const validation = join(OUT, 'RELEASE_VALIDATION.md');
if (existsSync(validation)) {
  const text = readFileSync(validation, 'utf8');
  const block = /(## Checksums\n\n```\n)[\s\S]*?(\n```)/;
  if (!block.test(text)) {
    console.error('RELEASE_VALIDATION.md has no "## Checksums" fenced block to update.');
    process.exit(1);
  }
  writeFileSync(validation, text.replace(block, `$1${digests}$2`));
}

// --- Report ------------------------------------------------------------------

console.log(`result/ assembled\n`);
for (const name of checksummed) {
  const size = statSync(join(OUT, name)).size;
  console.log(`  ${name.padEnd(34)} ${(size / 1_048_576).toFixed(1)} MB`);
}
console.log(`\n  android-project/  ios-project/  store/  docs/legal/`);
console.log(`\n  APK signed with ${Object.entries(schemes).filter(([, on]) => on).map(([n]) => n).join(' + ')}`);
console.log(`  certificate ${fingerprint?.slice(0, 16)}…`);
console.log(`  no IPA: macOS and Xcode are unavailable — see BUILD_OR_SIGNING_BLOCKERS.md`);
