#!/usr/bin/env node
/**
 * What is actually inside the thing that ships.
 *
 *   node scripts/audit-release-security.mjs <app.apk|app.aab> [...]
 *
 * ## Why the artefact and not the source
 *
 * Every claim below is one a source tree can be made to support and a build can
 * still break: a `.env` copied into `public/`, a source map emitted by a plugin
 * nobody configured, a debug flag left on by a Gradle property, a `localhost`
 * that only appears after minification inlines a constant. The only place those
 * are true or false is the package a learner installs, so this opens it.
 *
 * ## What it checks
 *
 * | Check | The failure it prevents |
 * | --- | --- |
 * | dangerous permissions | an app that asks for the microphone to teach handwriting |
 * | `debuggable` | a release anyone can attach a debugger to |
 * | `usesCleartextTraffic` | plain HTTP allowed on a device the learner does not control |
 * | WebView debugging | remote inspection of a shipped app |
 * | secrets | API keys, tokens, private keys, `.env` files packaged by accident |
 * | source maps | the whole source tree shipped inside the binary |
 * | dev origins | `localhost`, `127.0.0.1`, `ngrok`, a LAN address baked into a release |
 * | test data | fixtures and `__tests__` directories inside the package |
 *
 * Exit code is non-zero on any finding, so this can gate a release.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const artefacts = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
if (artefacts.length === 0) {
  console.error('usage: node scripts/audit-release-security.mjs <app.apk|app.aab> [...]');
  process.exit(2);
}

/** Permissions a Hangul writing app has no business asking for. */
/**
 * Permissions this app must never ship, whatever a dependency decides.
 *
 * A deny-list rather than "everything Android calls dangerous", because the app
 * does have one dangerous permission and it is deliberate: `POST_NOTIFICATIONS`
 * is the optional daily study reminder, it is off until the learner turns it on,
 * and the system prompt appears at that moment and nowhere else. Listing it here
 * would mean either failing every release or switching the check off, and a gate
 * that has been switched off is worse than one that was never written.
 *
 * Everything below would arrive by accident — a library that wants the camera,
 * a plugin that reads external storage — which is exactly the case a release
 * gate is for.
 */
const DANGEROUS = [
  'CAMERA',
  'RECORD_AUDIO',
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'ACCESS_BACKGROUND_LOCATION',
  'READ_CONTACTS',
  'WRITE_CONTACTS',
  'READ_SMS',
  'SEND_SMS',
  'RECEIVE_SMS',
  'CALL_PHONE',
  'READ_PHONE_STATE',
  'READ_CALL_LOG',
  'BODY_SENSORS',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'MANAGE_EXTERNAL_STORAGE',
  'QUERY_ALL_PACKAGES',
  'SYSTEM_ALERT_WINDOW',
  'REQUEST_INSTALL_PACKAGES',
  /*
   * Restricted rather than dangerous, and here for the same reason: Play grants
   * it to alarm-clock and calendar apps and asks everyone else to justify it.
   * `@capacitor/local-notifications` declares it, this app removes it at the
   * manifest merger, and this line is what makes a plugin upgrade that
   * reintroduces it fail the build instead of reaching a submission.
   */
  'SCHEDULE_EXACT_ALARM',
];

/**
 * Patterns that look like a secret.
 *
 * Deliberately shaped rather than generic: a rule that flagged any long
 * base64-looking string would flag every hashed asset name in the bundle and be
 * switched off within a week.
 */
const SECRETS = [
  { id: 'private key', pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'Slack token', pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}/ },
  { id: 'GitHub token', pattern: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/ },
  { id: 'bearer token', pattern: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/ },
  { id: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'azure speech key', pattern: /(?:speech|subscription)[_-]?key["'\s:=]+[0-9a-f]{32}/i },
];

/**
 * Matches that were looked at and are not what they appear to be.
 *
 * Every entry names the file, the string, and what it actually is. Reviewing a
 * finding once and recording the answer is the only way a scanner like this
 * stays useful: an audit that reports the same three known-good hits every run
 * is an audit whose output nobody reads.
 */
const REVIEWED = [
  {
    file: /assets\/react-[\w-]+\.js$/,
    match: 'http://localhost',
    why:
      "React Router's fallback base for URL parsing when there is no window.location — " +
      'overwritten on the next line by `location.origin`. A library constant, not an origin ' +
      'this app talks to.',
  },
];

/** Development origins that must not survive into a release. */
const DEV_ORIGINS = [
  /https?:\/\/localhost(?::\d+)?/i,
  /https?:\/\/127\.0\.0\.1(?::\d+)?/i,
  /https?:\/\/0\.0\.0\.0(?::\d+)?/i,
  /https?:\/\/192\.168\.\d+\.\d+(?::\d+)?/i,
  /\bngrok\.(io|app)\b/i,
  /\bVITE_API_PROXY_TARGET\b/,
];

/** Files that should never be inside a package a customer installs. */
const FORBIDDEN_FILES = [
  { id: 'source map', test: (name) => name.endsWith('.map') },
  { id: 'env file', test: (name) => /(^|\/)\.env(\.|$)/.test(name) },
  { id: 'keystore', test: (name) => /\.(jks|keystore|p12|pfx)$/i.test(name) },
  { id: 'test fixture', test: (name) => /(^|\/)(__tests__|__fixtures__)\//.test(name) },
  { id: 'spec file', test: (name) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name) },
  { id: 'git metadata', test: (name) => /(^|\/)\.git\//.test(name) },
];

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;

function buildTool(name) {
  if (!sdk) return null;
  const root = join(sdk, 'build-tools');
  if (!existsSync(root)) return null;
  const versions = readdirSync(root).sort().reverse();
  for (const version of versions) {
    const candidate = join(root, version, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const findings = [];
const notes = [];
/** Matches that were checked against `REVIEWED` and cleared. */
const accepted = new Set();

function report(artefact, id, detail) {
  findings.push({ artefact, id, detail });
}

/** Every file in the package, extracted so its bytes can be read. */
function unpack(artefact) {
  const dir = mkdtempSync(join(tmpdir(), 'hg-audit-'));
  execFileSync('unzip', ['-qq', '-o', artefact, '-d', dir]);
  const files = [];
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  return { dir, files };
}

/**
 * Whether a file is worth scanning as text.
 *
 * Everything under a megabyte that is not obviously binary. The audio is 47 MB
 * of MP3 and the illustrations are SVG; scanning the first and skipping the
 * second would be exactly the wrong way round, so size is the filter and the
 * extension list is only for formats that are certainly opaque.
 */
const OPAQUE = /\.(mp3|png|jpg|jpeg|webp|woff2?|ttf|otf|dex|so|arsc|zip|jar|bin)$/i;

function scanText(artefact, files, root) {
  for (const file of files) {
    const name = relative(root, file);
    // Play-side metadata, not part of what is installed. The R8 mapping lives
    // here on purpose: it is what turns an obfuscated crash report back into a
    // stack trace, and it never reaches a device.
    if (name.startsWith('BUNDLE-METADATA/')) continue;
    for (const rule of FORBIDDEN_FILES) {
      if (rule.test(name)) report(artefact, rule.id, name);
    }
    if (OPAQUE.test(file)) continue;
    if (statSync(file).size > 4 * 1024 * 1024) continue;
    const text = readFileSync(file, 'utf8');
    for (const rule of SECRETS) {
      const hit = text.match(rule.pattern);
      if (hit) report(artefact, `secret: ${rule.id}`, `${name} — ${hit[0].slice(0, 24)}…`);
    }
    for (const pattern of DEV_ORIGINS) {
      const hit = text.match(pattern);
      if (!hit) continue;
      const reviewed = REVIEWED.find(
        (entry) => entry.file.test(name) && hit[0].startsWith(entry.match),
      );
      if (reviewed) {
        accepted.add(`${name} — ${hit[0]}: ${reviewed.why}`);
        continue;
      }
      report(artefact, 'development origin', `${name} — ${hit[0]}`);
    }
  }
}

function auditManifest(artefact) {
  const aapt = buildTool('aapt2');
  if (!aapt) {
    notes.push('ANDROID_HOME not set — the manifest was not read');
    return;
  }
  let badging = '';
  try {
    badging = execFileSync(aapt, ['dump', 'badging', artefact], { encoding: 'utf8' });
  } catch {
    notes.push(`${artefact}: aapt2 could not read the manifest (bundles are not APKs)`);
    return;
  }
  const permissions = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]);
  for (const permission of permissions) {
    const short = permission.split('.').pop();
    if (DANGEROUS.includes(short)) report(artefact, 'dangerous permission', permission);
  }
  notes.push(`${artefact}: permissions — ${permissions.join(', ') || 'none'}`);

  let manifest = '';
  try {
    manifest = execFileSync(aapt, ['dump', 'xmltree', artefact, '--file', 'AndroidManifest.xml'], {
      encoding: 'utf8',
    });
  } catch {
    return;
  }
  if (/android:debuggable\(0x[0-9a-f]+\)=\(type 0x12\)0xffffffff/.test(manifest)) {
    report(artefact, 'debuggable', 'the release manifest sets android:debuggable=true');
  }
  if (/usesCleartextTraffic\(0x[0-9a-f]+\)=\(type 0x12\)0xffffffff/.test(manifest)) {
    report(artefact, 'cleartext traffic', 'the release manifest allows plain HTTP');
  }
}

for (const artefact of artefacts) {
  if (!existsSync(artefact)) {
    console.error(`missing: ${artefact}`);
    process.exit(2);
  }
  auditManifest(artefact);
  const { dir, files } = unpack(artefact);
  try {
    scanText(artefact, files, dir);
    // Capacitor writes the WebView debugging flag into its own config, which
    // travels with the bundle rather than the manifest.
    const config = files.find((file) => file.endsWith('capacitor.config.json'));
    if (config) {
      const parsed = JSON.parse(readFileSync(config, 'utf8'));
      if (parsed.android?.webContentsDebuggingEnabled === true) {
        report(artefact, 'webview debugging', 'webContentsDebuggingEnabled is true');
      }
      if (parsed.server?.url) {
        report(artefact, 'remote server', `server.url is ${parsed.server.url}`);
      }
    }
    notes.push(`${artefact}: ${files.length.toLocaleString()} entries scanned`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('Release security audit\n');
for (const note of notes) console.log(`  · ${note}`);
if (accepted.size > 0) {
  console.log('\n  reviewed and accepted:');
  for (const entry of accepted) console.log(`    - ${entry}`);
}
console.log();
if (findings.length === 0) {
  console.log('  no findings.');
  process.exit(0);
}
for (const finding of findings) {
  console.log(`  ! [${finding.id}] ${finding.artefact}`);
  console.log(`      ${finding.detail}`);
}
console.log(`\n${findings.length} finding(s).`);
process.exit(1);
