#!/usr/bin/env node
/**
 * The languages the app ships, declared to both operating systems.
 *
 *   node scripts/sync-native-locales.mjs           write the native declarations
 *   node scripts/sync-native-locales.mjs --check   fail if they have drifted
 *
 * ## The defect this closes
 *
 * The App Store listed the app as **"Languages: English"** while it shipped
 * thirty-two interface languages. Nothing was broken in the app — a Korean
 * phone opened it in Korean — because the web layer negotiates its own locale
 * and never asks the platform. What was missing was the *declaration*: the
 * stores read the binary, not the JavaScript inside it.
 *
 * Concretely, before this file:
 *
 * | | |
 * | --- | --- |
 * | `Info.plist` | no `CFBundleLocalizations` key at all, and only `Base.lproj` |
 * | Android | no `locales_config.xml` |
 * | `build.gradle` | `resourceConfigurations` listing **10** locales, by hand |
 *
 * The ten were maintained by somebody remembering to, and the comment above
 * them already records the last time nobody did: `vi` and `th` were added to
 * the app and left out here, so a Vietnamese phone got English system strings
 * inside an otherwise Vietnamese app.
 *
 * ## One source, and it is the one that cannot drift
 *
 * The list is read from `apps/web/src/locales/<code>/` — the directories themselves.
 * That is not *a* copy of the truth, it is the same thing `AVAILABLE_LOCALES`
 * is built from: `resources.ts` derives it with `import.meta.glob` over exactly
 * these directories. A language cannot be added to the app without adding a
 * directory, and adding a directory makes this file's output change. There is
 * no second list to forget.
 *
 * ## Where the platforms disagree, and why the mapping is data
 *
 * A BCP-47 tag is not what either platform wants written down:
 *
 * - **Apple** canonicalises Simplified Chinese as `zh-Hans`. `zh-CN` is
 *   tolerated in some places and not others, and the App Store language list
 *   is one of the places it reads poorly.
 * - **Android** resource qualifiers predate BCP-47: a region needs the `r`
 *   prefix (`pt-rBR`), while `locales_config.xml` — which is modern — takes the
 *   plain tag.
 *
 * So each platform gets its own column, written down once, rather than a regex
 * over the web tag at three call sites.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');

/** The shipped interface languages, from the directories `resources.ts` globs. */
export const WEB_LOCALES = readdirSync(join(root, 'apps/web/src/locales'), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/**
 * Web tag → platform identifier, only where they differ.
 *
 * Everything absent from a column is passed through unchanged, so this table
 * stays short and a new language usually needs no entry at all.
 */
const APPLE = { 'zh-CN': 'zh-Hans' };
const ANDROID_QUALIFIER = { 'pt-BR': 'pt-rBR', 'zh-CN': 'zh-rCN' };

const appleTag = (code) => APPLE[code] ?? code;
const androidQualifier = (code) => ANDROID_QUALIFIER[code] ?? code;

const findings = [];
const written = [];
const fail = (where, detail) => findings.push({ where, detail });

/** Writes a file, or records that it would have been written. */
function put(rel, content) {
  const path = join(root, rel);
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (before === content) return;
  if (CHECK) {
    fail(rel, before === null ? 'missing — run `npm run locales:native`' : 'out of date');
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  written.push(rel);
}

// --- iOS ---------------------------------------------------------------------

/*
 * `CFBundleLocalizations` is what App Store Connect reads for the listing's
 * language list, and what iOS uses to decide whether it can offer the app in a
 * language at all. `CFBundleDevelopmentRegion` stays `en`: it is the language
 * the bundle falls back to, not one of the ones on offer.
 */
const plistRel = 'apps/mobile/ios/App/App/Info.plist';
const plist = readFileSync(join(root, plistRel), 'utf8');
const localizationsBlock =
  `\t<key>CFBundleLocalizations</key>\n\t<array>\n` +
  WEB_LOCALES.map((code) => `\t\t<string>${appleTag(code)}</string>`).join('\n') +
  `\n\t</array>\n`;

const MARKER_START = '\t<key>CFBundleLocalizations</key>';
let nextPlist;
if (plist.includes(MARKER_START)) {
  nextPlist = plist.replace(
    /\t<key>CFBundleLocalizations<\/key>\n\t<array>[\s\S]*?<\/array>\n/,
    localizationsBlock,
  );
} else {
  // Inserted after the development region, which is the key it qualifies.
  nextPlist = plist.replace(
    /(\t<key>CFBundleDevelopmentRegion<\/key>\n\t<string>[^<]*<\/string>\n)/,
    `$1${localizationsBlock}`,
  );
  if (nextPlist === plist) {
    fail(plistRel, 'could not find CFBundleDevelopmentRegion to insert after');
  }
}
put(plistRel, nextPlist);

/*
 * An `.lproj` directory per language.
 *
 * `CFBundleLocalizations` alone is enough for the store listing, but iOS
 * decides the *bundle's* available localizations from the directories that are
 * actually in it — and a bundle with one `Base.lproj` reports one localization
 * however many strings the web layer carries. Each one gets an
 * `InfoPlist.strings` holding the display name, which is the string iOS shows
 * under the icon and the one place a localized bundle has to have content to
 * be counted.
 *
 * The name is deliberately the same in every language: `Hangyul Ganada` is a
 * brand, and `config/product.ts` already refuses to translate it. What differs
 * is that the language is now declared.
 */
const identity = JSON.parse(readFileSync(join(root, 'apps/mobile/app.identity.json'), 'utf8'));
for (const code of WEB_LOCALES) {
  const dir = `apps/mobile/ios/App/App/${appleTag(code)}.lproj`;
  put(
    `${dir}/InfoPlist.strings`,
    `/* Generated by scripts/sync-native-locales.mjs. Do not edit by hand. */\n` +
      `"CFBundleDisplayName" = "${identity.appName}";\n` +
      `"CFBundleName" = "${identity.appName}";\n`,
  );
}

// --- Android -----------------------------------------------------------------

/*
 * `locales_config.xml` is the modern declaration: it drives per-app language
 * selection in Android 13+ system settings, and Play reads it for the listing.
 * It takes plain BCP-47 tags rather than resource qualifiers.
 */
put(
  'apps/mobile/android/app/src/main/res/xml/locales_config.xml',
  `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<!-- Generated by scripts/sync-native-locales.mjs. Do not edit by hand. -->\n` +
    `<locale-config xmlns:android="http://schemas.android.com/apk/res/android">\n` +
    WEB_LOCALES.map((code) => `    <locale android:name="${code}"/>`).join('\n') +
    `\n</locale-config>\n`,
);

/*
 * A `values-<qualifier>/strings.xml` per language.
 *
 * This is what makes the locale *real* to the packaging tools: `aapt2` reports
 * a configuration only if some resource exists for it, so a `locales_config`
 * naming a language with no resources is a declaration the artefact does not
 * back up. Only `app_name` is needed, and it is the same brand string in every
 * language for the reason above.
 */
const baseStrings = readFileSync(
  join(root, 'apps/mobile/android/app/src/main/res/values/strings.xml'),
  'utf8',
);
const appName = /<string name="app_name">([^<]*)<\/string>/.exec(baseStrings)?.[1] ?? identity.appName;
const titleName =
  /<string name="title_activity_main">([^<]*)<\/string>/.exec(baseStrings)?.[1] ?? identity.appName;

for (const code of WEB_LOCALES) {
  if (code === 'en') continue; // `values/` is the English default.
  put(
    `apps/mobile/android/app/src/main/res/values-${androidQualifier(code)}/strings.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<!-- Generated by scripts/sync-native-locales.mjs. Do not edit by hand. -->\n` +
      `<resources>\n` +
      `    <string name="app_name">${appName}</string>\n` +
      `    <string name="title_activity_main">${titleName}</string>\n` +
      `</resources>\n`,
  );
}

/*
 * And the packaging filter, which used to be the hand-maintained list.
 *
 * `resourceConfigurations` tells the build which locales' resources to keep;
 * anything absent is stripped from the APK, including AndroidX's own
 * translations. Generating it from the same array is what stops it lagging the
 * app again.
 */
const gradleRel = 'apps/mobile/android/app/build.gradle';
const gradle = readFileSync(join(root, gradleRel), 'utf8');
const configLine =
  '        resourceConfigurations += [' +
  WEB_LOCALES.map((code) => `"${androidQualifier(code)}"`).join(', ') +
  ']';
const nextGradle = gradle.replace(/^ {8}resourceConfigurations \+= \[[^\]]*\]$/m, configLine);
if (nextGradle === gradle && !gradle.includes(configLine)) {
  fail(gradleRel, 'could not find a resourceConfigurations line to replace');
}
put(gradleRel, nextGradle);

/*
 * The manifest has to point at the locale config, or Android never reads it.
 */
const manifestRel = 'apps/mobile/android/app/src/main/AndroidManifest.xml';
const manifest = readFileSync(join(root, manifestRel), 'utf8');
if (!manifest.includes('android:localeConfig="@xml/locales_config"')) {
  const next = manifest.replace(
    /(<application\b)/,
    '$1\n        android:localeConfig="@xml/locales_config"',
  );
  if (next === manifest) fail(manifestRel, 'could not find <application> to add localeConfig to');
  else put(manifestRel, next);
}

// --- report ------------------------------------------------------------------

console.log(`Native locales — ${WEB_LOCALES.length} shipped languages, declared to both stores\n`);
console.log(`  source                apps/web/src/locales/*/  (what resources.ts globs)`);
console.log(`  iOS                   CFBundleLocalizations + ${WEB_LOCALES.length} .lproj bundles`);
console.log(
  `  Android               locales_config.xml + ${WEB_LOCALES.length - 1} values-* + resourceConfigurations`,
);
console.log(`  Apple renames         ${Object.entries(APPLE).map(([a, b]) => `${a}→${b}`).join(', ')}`);
console.log(
  `  Android qualifiers    ${Object.entries(ANDROID_QUALIFIER).map(([a, b]) => `${a}→${b}`).join(', ')}`,
);

if (written.length > 0) {
  console.log(`\n  wrote ${written.length} file(s).`);
}
if (findings.length === 0) {
  console.log('\n  every native declaration matches the shipped languages.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings) console.log(`  ${f.where.padEnd(64)} ${f.detail}`);
}

if (CHECK && findings.length > 0) process.exit(1);
