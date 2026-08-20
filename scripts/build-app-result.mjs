/**
 * Assembles `./app_result` — the installable applications, and nothing else.
 *
 *   node scripts/build-app-result.mjs
 *
 * ## Why this exists beside `result/`
 *
 * `result/` is the whole delivery: two binaries, both native projects, the
 * store listings, the legal pack, the report. It is 130 MB and most of it is
 * source. The question "give me the app to install" has a much smaller answer,
 * and answering it by pointing at a directory that also contains an Xcode
 * project is how somebody ends up sideloading the wrong file.
 *
 * So this is the applications on their own, with the three facts a person needs
 * before installing one — what it is, what signed it, and what is *not* here.
 *
 * ## What it refuses to do
 *
 * Copy an artefact `result/` does not already have. This directory is derived
 * from that one on purpose: two paths that each build their own APK are two
 * paths that will eventually disagree about which APK shipped. And there is no
 * code path here that renames anything to `.ipa` — see §4 of the README it
 * writes.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'result');
const OUT = join(ROOT, 'app_result');

const infoPath = join(SOURCE, 'build-info.json');
if (!existsSync(infoPath)) {
  console.error('result/build-info.json is missing — run `npm run result:build` first.');
  process.exit(1);
}
const info = JSON.parse(readFileSync(infoPath, 'utf8'));

const WANTED = ['hangyul-ganada-release.apk', 'hangyul-ganada-release.aab', 'build-info.json'];
const missing = WANTED.filter((name) => !existsSync(join(SOURCE, name)));
if (missing.length) {
  console.error(`result/ is missing ${missing.join(', ')} — run \`npm run result:build\` first.`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const lines = [];
for (const name of WANTED) {
  const from = join(SOURCE, name);
  copyFileSync(from, join(OUT, name));
  lines.push(`${sha256(from)}  ${name}`);
}
writeFileSync(join(OUT, 'checksums.sha256'), `${lines.join('\n')}\n`);

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const a = info.android;

writeFileSync(
  join(OUT, 'README.md'),
  `# Hangyul ganada — the applications

Built from commit \`${info.commit}\` at ${info.built_at}.
Everything else about this release — both native projects, the store listings,
the legal pack and the full report — is in \`result/\`.

## What is here

| File | Size | What it is for |
| --- | --- | --- |
| \`hangyul-ganada-release.apk\` | ${mb(a.apk_bytes)} | sideloading, and testing on a device |
| \`hangyul-ganada-release.aab\` | ${mb(a.aab_bytes)} | the upload to Google Play |
| \`build-info.json\` | — | what these two are, in full |
| \`checksums.sha256\` | — | \`sha256sum -c checksums.sha256\` |

## What signed them

    ${a.apk_certificate_subject}
    SHA-256  ${a.apk_certificate_sha256}

**This is the same identity every previous release carries**, and that matters
more than it looks: Android ties an app's upgrade path to its signing
certificate, so an artefact signed with a different key is not an update of this
app — it is a different app that cannot replace it. The keystore is not in this
repository and no password, path or alias appears anywhere in this directory.

Signature schemes: ${a.apk_signature_schemes.join(' + ')}. Application id
\`${a.application_id}\`, version ${a.version_name} (${a.version_code}), min SDK
${a.min_sdk}, target SDK ${a.target_sdk}.

To confirm it yourself:

    apksigner verify --print-certs hangyul-ganada-release.apk

## What is not here, and will not be faked

**There is no \`.ipa\`.** ${info.ios.status}. An \`.ipa\` is a signed archive
produced by Xcode against an Apple Developer identity; a renamed zip is not one,
would not install, and would be a false artefact in a delivery directory. The
complete Xcode project ships in \`result/ios-project/\` and
\`result/BUILD_OR_SIGNING_BLOCKERS.md\` gives the exact commands and the exact
credentials still required.

## The web build

Not a separate file. It is inside the APK and the AAB, and it is what
\`https://ganada.talkhangyul.com\` serves; \`result/android-project/\` carries the
same \`dist\` under \`app/src/main/assets/public\`.
`,
);

console.log('app_result/ assembled\n');
for (const name of WANTED) {
  console.log(`  ${name.padEnd(34)}${mb(statSync(join(OUT, name)).size)}`);
}
console.log(`\n  certificate ${a.apk_certificate_sha256.slice(0, 16)}…`);
console.log(`  ${info.ios.status}`);
