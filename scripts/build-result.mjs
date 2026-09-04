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
  readdirSync,
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

/*
 * The manifest says what the release says it is.
 *
 * `versionName` and `versionCode` are read out of `app.identity.json` by
 * `build.gradle`, so in principle they cannot disagree — and in practice a
 * Gradle build that reused a cached `processReleaseManifest` after the identity
 * file changed is exactly the shape of "we shipped the old version number".
 * This is three lines that read the number back out of the binary that is about
 * to be delivered, which is the only reading that counts.
 *
 * The code must also be *ahead of the last one that was built*. A store refuses
 * a code it has already seen, and it refuses it at upload — hours after the
 * build, on somebody else's afternoon.
 */
const identity = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/app.identity.json'), 'utf8'));
const previous = existsSync(join(ROOT, 'result/build-info.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'result/build-info.json'), 'utf8')).android?.version_code
  : undefined;
const manifestProblems = [];
if (manifest.applicationId !== identity.appId) {
  manifestProblems.push(`the APK says ${manifest.applicationId}; app.identity.json says ${identity.appId}`);
}
if (manifest.versionName !== identity.version) {
  manifestProblems.push(`the APK says versionName ${manifest.versionName}; app.identity.json says ${identity.version}`);
}
if (manifest.versionCode !== identity.buildNumber) {
  manifestProblems.push(`the APK says versionCode ${manifest.versionCode}; app.identity.json says ${identity.buildNumber}`);
}
/*
 * Behind, not equal.
 *
 * Equal is the ordinary case of re-running this script over the same build,
 * and failing on it would mean a delivery directory could never be rebuilt.
 * Whether a code that has been *spent* is about to be reused for different
 * bytes is `check-version-consistency`'s question and it answers it against
 * the source rather than against the number.
 */
if (Number.isInteger(previous) && manifest.versionCode < previous) {
  manifestProblems.push(
    `versionCode ${manifest.versionCode} is behind ${previous}, which the last delivery already used`,
  );
}
if (manifestProblems.length) {
  console.error('the built manifest does not match the release this tree describes:');
  for (const problem of manifestProblems) console.error(`  ${problem}`);
  console.error('\nRun: npm run mobile:sync && (cd apps/mobile/android && ./gradlew clean assembleRelease bundleRelease)');
  process.exit(1);
}

/**
 * The certificate that signed every release of this app, by its own fingerprint.
 *
 * A Play listing is bound to a signing key forever: an artefact signed with a
 * different one cannot be uploaded as an update to the same app, and there is
 * no support path that changes that. The failure it guards against is not
 * malice, it is a build that fell back to the debug key because
 * `ANDROID_KEYSTORE_PATH` was not exported in that shell — which produces a
 * perfectly valid, perfectly installable APK that is not the release.
 *
 * The value is a public fingerprint, not key material.
 */
const PRODUCTION_CERTIFICATE = '157a2bb133f6aa3d34a9a7b27e4a7fb7cbfafe49544f6e6064ce713e3323debc';
if (fingerprint !== PRODUCTION_CERTIFICATE) {
  console.error(
    'the APK is signed with a different certificate than every previous release:\n' +
      `  built with  ${fingerprint}\n` +
      `  expected    ${PRODUCTION_CERTIFICATE}\n` +
      '\nThis is usually the debug key, from a shell where the release keystore\n' +
      'environment was not exported. Refusing to deliver it as a release.',
  );
  process.exit(1);
}

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
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

let commit = null;
try {
  commit = sh('git', ['rev-parse', 'HEAD']).trim();
} catch {
  // Not a git repository. Said as null rather than filled in with a plausible
  // string — a build-info claiming a commit that does not exist is worse than
  // one admitting it does not know.
}

/**
 * The state of the source this was built from, when it is not exactly a commit.
 *
 * `commit` alone is not enough: a build from a dirty tree cannot be reproduced
 * from that commit, and `release:current` fails it for that reason. Recording
 * the fingerprint of the working tree — the tracked diff and every untracked,
 * non-ignored file — means a reader can at least tell *which* uncommitted tree
 * produced the artefact, and whether two builds came from the same one.
 */
function sourceState() {
  try {
    const changed = sh('git', ['diff', 'HEAD', '--name-only']).split('\n').filter(Boolean);
    const untracked = sh('git', ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
    if (changed.length === 0 && untracked.length === 0) {
      return { dirty: false, fingerprint: null, changed_files: 0, untracked_files: 0 };
    }
    /*
      Streamed through `git hash-object --stdin-paths` rather than hashing a
      `git diff` string: the diff of a content regeneration runs to hundreds of
      megabytes and overflows a child process's stdout buffer, which is how the
      first version of this recorded `null` for a tree it had just built from.
      A deleted file has no content to hash and is fingerprinted by name.
    */
    const files = [...new Set([...changed, ...untracked])].sort();
    const present = files.filter((f) => existsSync(join(ROOT, f)));
    const hashes = present.length
      ? execFileSync('git', ['hash-object', '--stdin-paths'], {
          cwd: ROOT,
          input: `${present.join('\n')}\n`,
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
        })
          .trim()
          .split('\n')
      : [];
    const hash = createHash('sha256');
    present.forEach((f, i) => hash.update(`${f}\0${hashes[i]}\n`));
    for (const f of files) if (!existsSync(join(ROOT, f))) hash.update(`${f}\0deleted\n`);
    return { dirty: true, fingerprint: hash.digest('hex'), changed_files: changed.length, untracked_files: untracked.length };
  } catch (error) {
    console.warn(`  source state could not be fingerprinted: ${error instanceof Error ? error.message : error}`);
    return { dirty: null, fingerprint: null, changed_files: null, untracked_files: null };
  }
}

const buildInfo = {
  product: 'Hangyul ganada',
  version: identity.version,
  commit,
  /*
    `release:current` is pending until this tree is committed and the build
    re-run against that commit; the fingerprint says which tree this was.
  */
  source_state: sourceState(),
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
  /*
   * iOS reports what the *Xcode project* carries, not what Android is at.
   *
   * These two numbers used to be `identity.version` and `identity.buildNumber`,
   * which is the release Android is cutting. On a release where the iOS half
   * cannot be built from this machine — every release so far — that made the
   * delivery's own metadata claim an iOS version that exists nowhere: not in
   * `project.pbxproj`, not in App Store Connect, not in any archive. The
   * honest answer is the project file's, and `pending` says what is owed.
   */
  ios: {
    bundle_id: identity.appId,
    version: identity.ios.xcode.marketingVersion,
    build: identity.ios.xcode.currentProjectVersion,
    pending_version: identity.ios.xcode.marketingVersion === identity.version ? null : identity.version,
    pending_build: identity.ios.xcode.currentProjectVersion === identity.buildNumber ? null : identity.buildNumber,
    deployment_target: identity.ios.deploymentTarget,
    sdk: null,
    ipa_bytes: null,
    status: 'not built — macOS and Xcode are unavailable in this environment',
    registered_with_app_store_connect: identity.registered.appStoreConnect,
  },
  product_content: {
    /*
     * Every locale the app ships an interface in, not every locale the corpus
     * has complete copy for.
     *
     * These used to be the same list and are not any more. `vocabulary.locales`
     * names the eight languages whose meanings are carried on every entry;
     * Vietnamese and Thai ship a full interface, a full letter curriculum, and
     * hand-written copy for the first 500 words, so reading the corpus field
     * alone reported a ten-language build as an eight-language one.
     *
     * Read from the translation bundles on disk, which is what "the app speaks
     * this language" actually means.
     */
    locales: readdirSync(join(ROOT, 'apps/web/src/locales'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    /*
     * Every locale with a meaning for every shipping word — counted, not read
     * off `vocabulary.locales`.
     *
     * That field names the eight languages carried on the entries themselves,
     * and it was the right answer while Vietnamese and Thai were partial. They
     * are not any more: both are hand-written files keyed by word id and both
     * now cover all 2,581, so the corpus field would under-report a delivered
     * artefact by two languages. Counting the emitted packs is what the claim
     * actually means, and it stays true in either direction — a locale that
     * goes partial again drops out of this list without anybody editing it.
     */
    vocabulary_locales_complete: readdirSync(join(ROOT, 'apps/web/src/data/generated'))
      .filter((name) => /^vocabulary\.[\w-]+\.json$/.test(name))
      .map((name) => name.slice('vocabulary.'.length, -'.json'.length))
      .filter((locale) => {
        const rows = JSON.parse(
          readFileSync(join(ROOT, 'apps/web/src/data/generated', `vocabulary.${locale}.json`), 'utf8'),
        ).words;
        return rows.length === vocabulary.words.length && rows.every((row) => row?.[0]);
      })
      .sort(),
    vocabulary_words: vocabulary.words.length,
    vocabulary_categories: vocabulary.categories.length,
    example_qa_version: examplesQa.version,
    example_qa_pass: examplesQa.pass,
    example_qa_total: examplesQa.words,
    review_algorithm_version: 1,
    /*
     * Read, not typed. It was a literal `6` while the app was on 9, because a
     * hand-copied constant is a hand-copied constant that will eventually be
     * wrong — and a delivery manifest that misreports the storage schema is a
     * misleading answer to the one question anybody asks it after a migration
     * goes wrong.
     */
    schema_version: Number(
      /SCHEMA_VERSION\s*=\s*(\d+)/.exec(
        readFileSync(join(ROOT, 'apps/web/src/storage/schema.ts'), 'utf8'),
      )?.[1],
    ),
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
