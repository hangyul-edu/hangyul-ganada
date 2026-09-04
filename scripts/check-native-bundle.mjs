#!/usr/bin/env node
/**
 * Is the web app *inside* the APK the web app you just built?
 *
 *   npm run native:bundle          report
 *   npm run native:bundle:check    the same; exit non-zero on a finding
 *
 * ## The defect this exists for, which is I-01 wearing a different coat
 *
 * "The shipped APK predates the fixes" has been written in five product-truth
 * reports. `release:current` closed one half of it: the artefact now records
 * the commit it was built from, and a build from a stale or dirty tree fails.
 *
 * This is the other half, and it got through that gate cleanly. Gradle packages
 * `app/src/main/assets/public`, which is **not** built by Gradle — it is copied
 * there by `npx cap sync`, and the build has no opinion about how old it is. So
 * a release built without a sync succeeds, reports the current commit, passes
 * `release:current`, and ships the web bundle from whenever somebody last ran
 * the sync.
 *
 * Measured on this pass: four release builds in a row over four hours produced
 * **byte-identical** APKs across a real source change, because `assets/public`
 * was four hours old. The identical digests were the only clue, and they read
 * as reassuring.
 *
 * ## What it compares
 *
 * The bundle in the delivered APK against the bundle in `apps/web/dist`, by
 * hashing the files themselves. Not timestamps — a sync copies mtimes around
 * and a clean checkout has none — and not `assets/public` on disk, because that
 * is the directory the sync writes and comparing it to `dist` would only prove
 * a copy happened, not that the copy is what got packaged.
 *
 * So the APK is opened and read. That is the file a customer installs, and it
 * is the only artefact whose contents are not a claim about a build step.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CHECK = process.argv.includes('--check');

const DIST = join(ROOT, 'apps/web/dist');
const APK = join(ROOT, 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk');

const findings = [];
const fail = (what) => findings.push(what);

/**
 * Files whose contents differ between a `dist/` and a packaged bundle for
 * reasons that are not staleness.
 *
 * `prune-native-assets.mjs` deliberately removes web-only files from the native
 * bundles — a service worker, `robots.txt`, the Open Graph image — so their
 * absence inside the APK is correct and is not compared. Everything else is.
 *
 * Skipping them is not the same as checking them, and the difference cost a
 * build. `apps/mobile`'s own `sync` script runs `cap sync` and stops; the root
 * `mobile:sync` runs the prune afterwards. Building through the first produced
 * an APK 209 kB larger carrying `sw.js`, `robots.txt`, `_redirects` and the
 * Open Graph image — a service worker inside an app that deliberately registers
 * none — and this gate said *0 missing, 0 different*, because the only four
 * files that were wrong were the four it had been told to look away from. So
 * they are checked in the opposite direction below: present in the package is
 * a finding.
 */
const PRUNED = new Set(['sw.js', 'robots.txt', '_redirects', 'brand/og-hangyul-ganada.png']);

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

if (!existsSync(DIST)) fail('apps/web/dist does not exist — run `npm run build` first');
if (!existsSync(APK)) fail('no release APK to read — run the Android build first');

if (findings.length === 0) {
  const dist = walk(DIST).filter((path) => !PRUNED.has(path));

  /*
   * Read out of the APK with `unzip -p`, one file at a time.
   *
   * An APK is a zip and the bundle sits under `assets/public/`. Extracting the
   * whole archive would cost a hundred megabytes of temporary files for a
   * comparison of a few hundred small ones.
   */
  const inApk = (path) => {
    try {
      return execFileSync('unzip', ['-p', APK, `assets/public/${path}`], {
        maxBuffer: 64 * 1024 * 1024,
        // A name that is not in the archive is an answer here, not a warning.
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return null;
    }
  };

  let compared = 0;
  const missing = [];
  const differ = [];
  for (const path of dist) {
    const built = readFileSync(join(DIST, path));
    const packaged = inApk(path);
    if (packaged === null) {
      missing.push(path);
      continue;
    }
    compared += 1;
    if (digest(built) !== digest(packaged)) differ.push(path);
  }

  console.log('Native bundle — the web app inside the APK against the one just built\n');
  console.log(`  files in apps/web/dist   ${dist.length}`);
  console.log(`  compared inside the APK  ${compared}`);
  console.log(`  missing from the APK     ${missing.length}`);
  console.log(`  different                ${differ.length}`);

  for (const path of missing.slice(0, 10)) {
    fail(`${path} is in the build and not in the APK — the native bundle is missing a file`);
  }
  for (const path of differ.slice(0, 10)) {
    fail(
      `${path} differs between apps/web/dist and the APK — the APK carries an older bundle. ` +
        'Run `npm run mobile:sync` and build again.',
    );
  }
  if (missing.length > 10) fail(`…and ${missing.length - 10} more missing`);
  if (differ.length > 10) fail(`…and ${differ.length - 10} more that differ`);
  if (compared === 0) fail('nothing was compared — is the bundle under assets/public?');

  /* The four the prune exists to remove: absent from the package, or a finding. */
  const notPruned = [...PRUNED].filter((path) => inApk(path) !== null);
  console.log(`  web-only files pruned    ${PRUNED.size - notPruned.length} of ${PRUNED.size}`);
  for (const path of notPruned) {
    fail(
      `${path} is inside the APK and should have been pruned — the build ran \`cap sync\` ` +
        'without `scripts/prune-native-assets.mjs`. Run `npm run mobile:sync`, not the ' +
        '`sync` script in apps/mobile, and build again.',
    );
  }
}

if (findings.length === 0) {
  console.log('\nthe app inside the package is the app that was built.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const finding of findings) console.log(`  - ${finding}`);
}
if (CHECK && findings.length > 0) process.exit(1);
