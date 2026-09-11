#!/usr/bin/env node
/**
 * Child-safe content, read out of the things that ship.
 *
 *   npm run content:safety:bundle          # scan dist/ and the native asset copies
 *   npm run content:safety:bundle -- --check
 *   npm run content:safety:bundle -- --apk app_result/hangyul-ganada-release.apk --aab app_result/hangyul-ganada-release.aab
 *
 * ## Why a second scanner
 *
 * `content-safety-qa.mjs` reads the sources and the generated files. This reads
 * the *package*: the production web bundle in `apps/web/dist`, the Android and
 * iOS copies of it under `apps/mobile`, and — given a path — the signed APK and
 * AAB, unpacked. A build copies files, a sync copies them again, and every
 * copy is a place a stale file can sit: the delivered artefact has lagged the
 * tree in four successive audits (issue I-01). The claim "no prohibited content
 * in the packaged assets" is only a claim about bytes if something read the
 * bytes.
 *
 * ## What is read
 *
 * - every `.json` under the package's `public` root — corpus bands, the Level
 *   Test bank and meanings, the dictionary index and chunks, the audio
 *   manifest — as the structured content it is, with the locale taken from the
 *   file name where it has one;
 * - every Hangul string literal in every `.js` chunk, as Korean; a Latin
 *   literal is not read, because a minified React runtime says "kill" and
 *   "abort" and means neither of them;
 * - the file list itself, which must not contain the negative fixtures or the
 *   full policy — INTERNAL_ONLY text is never packaged.
 *
 * Anything HARD_BLOCK is a failure; CONTEXT_BLOCK is reported for the
 * dictionary and refused elsewhere, exactly as in the source scan.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateSurface,
  POLICY_VERSION,
  verdictOf,
} from '../packages/content-safety/src/index.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : null;
};

const ROOTS = [
  { name: 'web dist', dir: join(ROOT, 'apps', 'web', 'dist') },
  { name: 'android assets', dir: join(ROOT, 'apps', 'mobile', 'android', 'app', 'src', 'main', 'assets', 'public') },
  { name: 'ios assets', dir: join(ROOT, 'apps', 'mobile', 'ios', 'App', 'App', 'public') },
];
const temp = [];
for (const [kind, name] of [
  ['apk', flag('--apk')],
  ['aab', flag('--aab')],
]) {
  if (!name) continue;
  const archive = join(ROOT, name);
  if (!existsSync(archive)) {
    console.error(`${name}: not found`);
    process.exit(2);
  }
  const dir = mkdtempSync(join(tmpdir(), `hangyul-${kind}-`));
  execFileSync('unzip', ['-q', '-o', archive, '-d', dir]);
  temp.push(dir);
  const inner = kind === 'apk' ? join(dir, 'assets', 'public') : join(dir, 'base', 'assets', 'public');
  ROOTS.push({ name: `${kind} ${basename(name)}`, dir: inner, archive });
}

const FORBIDDEN_FILES = [/negative\.json$/, /child-safe-content-policy\.json$/, /fixtures[\\/]/];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const findings = [];
const contextual = [];
const totals = { files: 0, json: 0, js: 0, fields: 0, literals: 0 };

function record(root, file, surface, facts, where) {
  totals.fields += 1;
  const result = evaluateSurface(surface, facts);
  const verdict = verdictOf(result, facts);
  if (verdict === 'ok') return;
  const row = { root: root.name, file: relative(root.dir, file), where, verdict, findings: result.slice(0, 3).map((f) => `${f.category}:${f.term}`), excerpt: result[0]?.excerpt };
  if (verdict === 'review' && /dictionary/.test(file)) contextual.push(row);
  else findings.push(row);
}

function localeOf(file) {
  const name = basename(file);
  const m2 = /^meanings-([a-z]{2,3}(?:-[A-Z]{2})?)-/.exec(name);
  if (m2) return m2[1];
  const m3 = /^([a-z]{2,3}(?:-[A-Z]{2})?)-\d+-/.exec(name);
  if (m3) return m3[1];
  return 'ko';
}

/** Every taught word by id, from the corpus bands packaged in this root. */
const wordsByRoot = new Map();
function wordOfId(root, id) {
  if (id.startsWith('dict_')) return id.slice(5);
  if (!wordsByRoot.has(root.dir)) {
    const map = new Map();
    const corpusDir = join(root.dir, 'corpus');
    if (existsSync(corpusDir)) {
      for (const band of readdirSync(corpusDir).filter((f) => /^band-\d+-/.test(f))) {
        for (const word of JSON.parse(readFileSync(join(corpusDir, band), 'utf8')).words ?? []) map.set(word.id, word.word);
      }
    }
    wordsByRoot.set(root.dir, map);
  }
  return wordsByRoot.get(root.dir).get(id);
}

function scanJson(root, file) {
  totals.json += 1;
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return;
  }
  const name = basename(file);
  const random = /level-test/.test(file);
  // The bank: options judged as their own words, prompts as the item's.
  if (/level-test[\\/]bank-/.test(file)) {
    for (const item of data.items ?? []) {
      const own = { random: true, headword: item.lemma ?? wordOfId(root, item.id.split(':')[0]) };
      if (item.prompt) record(root, file, { text: item.prompt, lang: 'ko', role: item.kind === 'meaning' ? 'headword' : 'sentence' }, own, item.id);
      if (item.answer) record(root, file, { text: item.answer, lang: 'ko', role: 'option' }, own, item.id);
      for (const option of item.options ?? []) {
        const lemmas = [option, item.lemma, ...(item.distractorIds ?? []).map((id) => wordOfId(root, id))].filter(Boolean);
        const ok = lemmas.some((headword) => verdictOf(evaluateSurface({ text: option, lang: 'ko', role: 'option' }, { random: true, headword }), { random: true }) === 'ok');
        totals.fields += 1;
        if (!ok) findings.push({ root: root.name, file: relative(root.dir, file), where: item.id, verdict: 'blocked', findings: ['option'], excerpt: option });
      }
      for (const id of [...(item.optionIds ?? []), item.promptId].filter(Boolean)) {
        if (id.startsWith('dict_')) record(root, file, { text: id.slice(5), lang: 'ko', role: 'option' }, { random: true, headword: id.slice(5) }, item.id);
      }
    }
    return;
  }
  if (/level-test[\\/]meanings-/.test(file)) {
    const locale = data.locale ?? localeOf(file);
    for (const [id, text] of Object.entries(data.meanings ?? {})) {
      record(root, file, { text, lang: locale, role: 'option' }, { random: true, headword: wordOfId(root, id) }, id);
    }
    return;
  }
  if (/corpus[\\/]band-/.test(file)) {
    for (const word of data.words ?? []) {
      const facts = { headword: word.word };
      record(root, file, { text: word.word, lang: 'ko', role: 'headword' }, facts, word.id);
      if (word.example) record(root, file, { text: word.example, lang: 'ko', role: 'sentence' }, facts, word.id);
    }
    return;
  }
  if (/corpus[\\/][a-z]{2,3}(-[A-Z]{2})?-\d+-/.test(file)) {
    const locale = data.locale ?? localeOf(file);
    const band = data.band;
    const core = [...walk(join(file, '..'))].find((f) => new RegExp(`band-${band}-`).test(basename(f)));
    const words = core ? JSON.parse(readFileSync(core, 'utf8')).words : [];
    (data.words ?? []).forEach((row, index) => {
      const facts = { headword: words[index]?.word };
      const [gloss, example, note] = row;
      if (gloss) record(root, file, { text: gloss, lang: locale, role: 'gloss' }, facts, words[index]?.id ?? String(index));
      if (example) record(root, file, { text: example, lang: locale, role: 'sentence' }, facts, words[index]?.id ?? String(index));
      if (note) record(root, file, { text: note, lang: locale, role: 'note' }, facts, words[index]?.id ?? String(index));
    });
    return;
  }
  if (/dictionary[\\/]index-/.test(file)) {
    for (const [headword, romanization, gloss] of data.rows ?? []) {
      const facts = { headword };
      record(root, file, { text: headword, lang: 'ko', role: 'headword' }, facts, headword);
      if (romanization) record(root, file, { text: romanization, lang: 'en', role: 'romanization' }, facts, headword);
      if (gloss) record(root, file, { text: gloss, lang: 'en', role: 'gloss' }, facts, headword);
    }
    return;
  }
  if (/dictionary[\\/]entries[\\/]/.test(file)) {
    for (const entry of data.entries ?? []) {
      const facts = { headword: entry.headword };
      for (const sense of entry.senses ?? []) {
        if (sense.gloss) record(root, file, { text: sense.gloss, lang: 'en', role: 'gloss' }, facts, entry.headword);
        for (const example of sense.examples ?? []) {
          if (example.korean) record(root, file, { text: example.korean, lang: 'ko', role: 'sentence' }, facts, entry.headword);
          if (example.translation) record(root, file, { text: example.translation, lang: 'en', role: 'sentence' }, facts, entry.headword);
        }
      }
    }
    return;
  }
  if (/audio[\\/]manifest\.json$/.test(file)) {
    // A recording is a word's own: judged as the card it belongs to, from the
    // corpus bands packaged beside it.
    const spokenBy = new Map();
    const corpusDir = join(root.dir, 'corpus');
    if (existsSync(corpusDir)) {
      for (const band of readdirSync(corpusDir).filter((f) => /^band-\d+-/.test(f))) {
        for (const word of JSON.parse(readFileSync(join(corpusDir, band), 'utf8')).words ?? []) {
          spokenBy.set(word.word, word.word);
          if (word.example) spokenBy.set(word.example, word.word);
        }
      }
    }
    for (const entry of data.entries ?? []) {
      record(root, file, { text: entry.text, lang: 'ko', role: 'transcript' }, { headword: spokenBy.get(entry.text) }, entry.id);
    }
    return;
  }
  // Anything else: every Korean string, as Korean.
  const visit = (value, path) => {
    if (typeof value === 'string') {
      if (/[가-힣]/.test(value)) record(root, file, { text: value, lang: 'ko', role: 'note' }, {}, path);
    } else if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) visit(v, path ? `${path}.${k}` : k);
  };
  visit(data, name);
  // `random` is unused for the generic case; it is here so a reader sees the distinction.
  void random;
}

/**
 * Korean text in a JavaScript chunk.
 *
 * The corpus, the gap-fills and the UI copy are bundled as JSON modules, so
 * their strings sit inside the chunk — often as one enormous string literal
 * holding a whole JSON document. So this does not parse literals; it lifts
 * every run of Hangul (with the spaces and punctuation between) out of the
 * source and reads each run as a Korean sentence. A run has no card to belong
 * to, so only HARD_BLOCK counts here: 죽었어요 in the gap-fill for 죽다 is a
 * CONTEXT_BLOCK finding in a file that cannot say which card it is, and the
 * source scan already judged it with its card.
 */
function scanJs(root, file) {
  totals.js += 1;
  // The policy's own chunk carries the prohibited terms by definition — it is
  // what refuses them. It is INTERNAL text, shipped because the runtime gate
  // needs it, and it is the one chunk whose literals are not learner content.
  if (/^content-safety-[\w-]+\.js$/.test(basename(file))) return;
  // The conjugator's chunk is code and verb-class tables — it names 죽이다
  // among the verbs whose request form is not a favour — and carries no copy.
  if (/^korean-morphology-[\w-]+\.js$/.test(basename(file))) return;
  const source = readFileSync(file, 'utf8').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const runs = source.match(/[가-힣][가-힣0-9A-Za-z .,!?~·…()'"-]*[가-힣.!?)]|[가-힣]/g) ?? [];
  for (const text of runs) {
    totals.literals += 1;
    if (text.includes(' · ')) {
      for (const word of text.split(' · ')) recordHard(root, file, { text: word, lang: 'ko', role: 'headword' }, { headword: word }, 'literal');
      continue;
    }
    recordHard(root, file, { text, lang: 'ko', role: 'sentence' }, {}, 'literal');
  }
}

function recordHard(root, file, surface, facts, where) {
  totals.fields += 1;
  const result = evaluateSurface(surface, facts).filter((f) => f.severity === 'HARD_BLOCK');
  if (result.length === 0) return;
  findings.push({ root: root.name, file: relative(root.dir, file), where, verdict: 'blocked', findings: result.slice(0, 3).map((f) => `${f.category}:${f.term}`), excerpt: result[0]?.excerpt });
}

let scannedRoots = 0;
for (const root of ROOTS) {
  if (!existsSync(root.dir)) {
    console.log(`  ${root.name.padEnd(28)} (absent)`);
    continue;
  }
  scannedRoots += 1;
  let files = 0;
  for (const file of walk(root.dir)) {
    files += 1;
    totals.files += 1;
    const rel = relative(root.dir, file);
    if (FORBIDDEN_FILES.some((re) => re.test(rel))) {
      findings.push({ root: root.name, file: rel, where: 'file list', verdict: 'blocked', findings: ['internal-only file packaged'], excerpt: rel });
    }
    if (file.endsWith('.json')) scanJson(root, file);
    else if (file.endsWith('.js')) scanJs(root, file);
  }
  if (root.archive) {
    // The archive itself must not name an internal-only file either.
    const listing = execFileSync('unzip', ['-Z1', root.archive], { encoding: 'utf8' }).split('\n');
    for (const name of listing) {
      if (FORBIDDEN_FILES.some((re) => re.test(name))) {
        findings.push({ root: root.name, file: name, where: 'archive listing', verdict: 'blocked', findings: ['internal-only file packaged'], excerpt: name });
      }
    }
  }
  console.log(`  ${root.name.padEnd(28)} ${String(files).padStart(6)} files`);
}

for (const dir of temp) rmSync(dir, { recursive: true, force: true });

console.log(`\nPackaged-artefact content scan — policy ${POLICY_VERSION}`);
console.log(`  roots scanned      ${scannedRoots}`);
console.log(`  files              ${totals.files.toLocaleString('en')} (${totals.json} json, ${totals.js} js)`);
console.log(`  fields evaluated   ${totals.fields.toLocaleString('en')}`);
console.log(`  Korean literals    ${totals.literals.toLocaleString('en')}`);
console.log(`  dictionary rows with death vocabulary (allowed there)  ${contextual.length}`);
if (findings.length === 0) {
  console.log('\nno packaged asset carries prohibited content.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  const perRoot = new Map();
  for (const f of findings) perRoot.set(f.root, (perRoot.get(f.root) ?? 0) + 1);
  for (const [name, n] of perRoot) console.log(`  ${String(n).padStart(6)} in ${name}`);
  for (const f of findings.slice(0, 60)) console.log(`  ${f.root.padEnd(24)} ${f.file.padEnd(48)} ${f.where.padEnd(28)} ${f.findings.join(', ')} — ${f.excerpt}`);
}
if (scannedRoots === 0) {
  console.log('\nnothing to scan — build the web app first (npm run build)');
  process.exit(CHECK ? 1 : 0);
}
if (CHECK && findings.length > 0) process.exit(1);
