#!/usr/bin/env node
/**
 * Files the Android runtime never reads, removed after `cap sync`.
 *
 * Capacitor copies `apps/web/dist` wholesale into the native project, which is
 * right for everything the WebView serves and wrong for the handful of files
 * that exist for web infrastructure the native app does not have:
 *
 * - `brand/og-hangyul-ganada.png` — the social-preview image, fetched by link
 *   crawlers against the production domain. Nothing inside the app links it.
 * - `robots.txt`, `_redirects` — instructions to hosts and crawlers. There is
 *   no host and no crawler inside an APK.
 * - `sw.js` — the service worker. The native build deliberately registers no
 *   worker (`offline.ts` returns before registering when `isNative`), so the
 *   file is dead weight.
 *
 * `manifest.webmanifest` stays although native ignores it: the HTML links it,
 * and a pruned link is a console 404 the native QA would rightly flag.
 * Everything else ships. Audio, corpus, dictionary and the level test are the
 * product working offline; fonts and JS are the app itself.
 */
import { existsSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PRUNE = ['brand/og-hangyul-ganada.png', 'robots.txt', '_redirects', 'sw.js'];

let total = 0;
for (const platform of ['android/app/src/main/assets/public', 'ios/App/App/public']) {
  const base = join(ROOT, 'apps/mobile', platform);
  if (!existsSync(base)) continue;
  for (const name of PRUNE) {
    const path = join(base, name);
    if (!existsSync(path)) continue;
    total += statSync(path).size;
    rmSync(path);
    console.log(`  pruned ${platform.split('/')[0]}: ${name}`);
  }
}
console.log(`pruned ${(total / 1024).toFixed(0)} kB of web-only files from the native bundles`);
