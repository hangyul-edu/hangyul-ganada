#!/usr/bin/env node
/**
 * The two things a store cannot let you take back.
 *
 *   node scripts/check-mobile-identity.mjs           report
 *   node scripts/check-mobile-identity.mjs --check   exit non-zero on a finding
 *
 * An app has two identities and they fail in opposite directions.
 *
 * The **application id** — `com.talkhangyul.ganada` on both platforms — is
 * permanent. Change it and Google Play and App Store Connect see a different
 * app: existing installs never update, reviews and ratings stay behind, and the
 * old id can never be reused. Nothing in this repository may rewrite it, and
 * this file is the check that nothing has.
 *
 * The **display name** is the opposite: cosmetic, changeable, and stored in
 * three places that no tool keeps in step. `cap sync` writes `appName` into the
 * two `capacitor.config.json` copies, but it does not touch Android's
 * `strings.xml` (written once, when the project was created) nor iOS's
 * `Info.plist`. So the supported way to rename the installed app — edit
 * `app.identity.json` and sync — silently renames nothing a learner can see.
 * That is the drift this guard exists for.
 *
 * ## Why the launcher label is capitalised and the prose name is not
 *
 * `scripts/check-product-name.mjs` forbids the spelling "Hangyul Ganada"
 * everywhere it can, because the product is **Hangyul ganada**: 가나다 is a
 * word, not three initials, and title-casing it in a sentence reads as a
 * different product. A launcher label is not a sentence. It sits in a grid
 * beside Photos, Maps and Settings, with no sentence around it to make the
 * lowercase deliberate, and there it reads as a typo. The two rules are
 * therefore split on purpose: this file owns the four native strings, that file
 * owns every other occurrence, and neither one's allowance widens the other's.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');

const read = (rel) => readFileSync(join(root, rel), 'utf8');

const identity = JSON.parse(read('apps/mobile/app.identity.json'));
const NAME = identity.appName;
const ID = identity.appId;

const findings = [];
const fail = (where, detail) => findings.push({ where, detail });

/** The launcher label has to survive a grid of one-word system apps. */
if (NAME !== 'Hangyul Ganada') {
  fail('app.identity.json', `appName is "${NAME}", not the agreed launcher label "Hangyul Ganada"`);
}
if (ID !== 'com.talkhangyul.ganada') {
  fail('app.identity.json', `appId is "${ID}" — the store identity may not change`);
}

/**
 * One value, four files, checked by reading rather than by trusting the sync.
 *
 * `pattern` pulls the value the platform actually uses at runtime; `must` is
 * what it has to equal. A file that has drifted names itself here rather than
 * being discovered on a device.
 */
const strings = read('apps/mobile/android/app/src/main/res/values/strings.xml');
const stringRes = (name) =>
  new RegExp(`<string name="${name}">([^<]*)</string>`).exec(strings)?.[1] ?? null;

for (const key of ['app_name', 'title_activity_main']) {
  const value = stringRes(key);
  if (value !== NAME) {
    fail('android strings.xml', `${key} is ${value === null ? 'missing' : `"${value}"`}, not "${NAME}"`);
  }
}
if (stringRes('package_name') !== ID) {
  fail('android strings.xml', `package_name is "${stringRes('package_name')}", not "${ID}"`);
}

/*
 * The manifest must point at the resource rather than carry a literal. A hard
 * coded `android:label` is how one source set ends up right and another wrong,
 * and the merger picks the wrong one without a word.
 */
const manifest = read('apps/mobile/android/app/src/main/AndroidManifest.xml');
for (const [attr, want] of [
  [/<application[^>]*android:label="([^"]*)"/, '@string/app_name'],
  [/<activity[^>]*android:label="([^"]*)"/, '@string/title_activity_main'],
]) {
  const found = attr.exec(manifest)?.[1] ?? null;
  if (found !== want) fail('AndroidManifest.xml', `android:label is "${found}", not "${want}"`);
}

/*
 * `build.gradle` reads the id from the identity file. If somebody has pasted a
 * literal in, the two projects can disagree again.
 */
const gradle = read('apps/mobile/android/app/build.gradle');
if (!/applicationId\s+identity\.appId/.test(gradle)) {
  fail('build.gradle', 'applicationId no longer comes from app.identity.json');
}
if (!new RegExp(`namespace\\s*=\\s*"${ID}"`).test(gradle)) {
  fail('build.gradle', `namespace is not "${ID}"`);
}

const plist = read('apps/mobile/ios/App/App/Info.plist');
const plistValue = (key) =>
  new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1]?.trim() ?? null;

for (const key of ['CFBundleDisplayName', 'CFBundleName']) {
  const value = plistValue(key);
  if (value !== NAME) {
    fail('iOS Info.plist', `${key} is ${value === null ? 'missing' : `"${value}"`}, not "${NAME}"`);
  }
}
/*
 * CFBundleName is shown where the display name will not fit, and iOS truncates
 * it at fifteen characters rather than eliding it. "Hangyul Ganada" is
 * fourteen; a longer name would need a short form here instead of the same one.
 */
if (NAME.length > 15) {
  fail('iOS Info.plist', `CFBundleName "${NAME}" is ${NAME.length} characters; iOS shows at most 15`);
}
if (plistValue('CFBundleIdentifier') !== '$(PRODUCT_BUNDLE_IDENTIFIER)') {
  fail('iOS Info.plist', 'CFBundleIdentifier no longer comes from the build setting');
}

/*
 * Both build configurations, because Debug and Release each carry their own
 * copy and a rename applied to one is the version that ships.
 */
const pbx = read('apps/mobile/ios/App/App.xcodeproj/project.pbxproj');
const bundleIds = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) =>
  m[1].trim().replace(/^"|"$/g, ''),
);
if (bundleIds.length < 2) {
  fail('project.pbxproj', `expected Debug and Release bundle ids, found ${bundleIds.length}`);
}
for (const found of bundleIds) {
  if (found !== ID) fail('project.pbxproj', `PRODUCT_BUNDLE_IDENTIFIER is "${found}", not "${ID}"`);
}

/*
 * The synced copies. They are build output, but they are committed, so a stale
 * one is a rename that looks applied and is not.
 */
for (const rel of [
  'apps/mobile/android/app/src/main/assets/capacitor.config.json',
  'apps/mobile/ios/App/App/capacitor.config.json',
]) {
  const config = JSON.parse(read(rel));
  if (config.appName !== NAME) fail(rel, `appName is "${config.appName}", not "${NAME}"`);
  if (config.appId !== ID) fail(rel, `appId is "${config.appId}", not "${ID}"`);
}

console.log('Mobile identity — one name, one id, read from every file that carries them\n');
console.log(`  display name          ${NAME}`);
console.log(`  application id        ${ID}`);
console.log(
  '  files checked         app.identity.json · strings.xml · AndroidManifest.xml · build.gradle ·\n' +
    '                        Info.plist · project.pbxproj · two synced capacitor.config.json',
);

if (findings.length === 0) {
  console.log('\n  every file agrees; the launcher label and the store identity are what they claim.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const finding of findings) console.log(`  ${finding.where.padEnd(24)} ${finding.detail}`);
}

if (CHECK && findings.length > 0) process.exit(1);
