#!/usr/bin/env node
/**
 * Child-safe content: the whole learner-facing inventory, read through the one
 * policy.
 *
 *   npm run content:safety:qa            # scan, write docs/child-safe-content-audit.json
 *   npm run content:safety:qa -- --check # scan, fail on any finding or a stale report
 *
 * ## What this replaced, and why
 *
 * The previous gate read one 66-term list, compared it against whole
 * headwords, and looked at the taught corpus, the Level Test's `produce`
 * options and the gap-fills. It was green on 10 September 2026 while
 * `dict_섹스하다` sat in the bank as a level-12 question and as a distractor in
 * two more: the list had 섹스 and the headword was 섹스하다, the meaning items
 * carry option *ids* the gate never resolved, and the dictionary — where the
 * anchor came from — was declared out of scope. A gate that reads one list on
 * one surface proves one list on one surface.
 *
 * This one reads every surface. Each content family below names its source of
 * truth, its generated form and its runtime consumer, and every string a
 * learner can be shown — headword, example, gloss, note, option, prompt, hint,
 * transcript, UI copy — in every supported locale is evaluated by
 * `@hangyul-ganada/content-safety`, the same evaluator the builders and the
 * runtime use. The composed-sentence frame rules from the old gate are kept:
 * they catch what no word list can (여자를 타요), and the policy does not claim
 * them.
 *
 * ## The report
 *
 * `docs/child-safe-content-audit.json` — per family and per locale: items,
 * fields, findings by category, and the reconciliation counts the report
 * quotes. `--check` regenerates it in memory and fails if the committed file
 * differs, so the numbers in `docs/report.md` cannot drift from the scan.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conjugate, FORMS } from '../packages/korean-morphology/src/index.ts';
import {
  evaluateSurface,
  POLICY_VERSION,
  verdictOf,
} from '../packages/content-safety/src/index.ts';

/*
 * `SAFETY_ROOT` points the scan at another checkout — a worktree of the commit
 * that shipped — so the audit can state what the policy finds in the artefact
 * that was delivered, not only in the tree that fixed it. The policy and the
 * evaluator always come from this tree.
 */
const ROOT = process.env.SAFETY_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const REPORT = process.env.SAFETY_REPORT ?? join(ROOT, 'docs', 'child-safe-content-audit.json');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const exists = (p) => existsSync(join(ROOT, p));

/** Supported locales, from the corpus manifest — the app's own list. */
const LOCALES = Object.keys(read('apps/web/public/corpus/manifest.json').bands[0].locales).sort();

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------
const findings = [];
const stats = new Map(); // family → { items, fields, byLocale: { locale → { items, fields, findings } } }

function bump(family, locale, kind, n = 1) {
  const f = stats.get(family) ?? { items: 0, fields: 0, findings: 0, byLocale: {} };
  const l = f.byLocale[locale] ?? { items: 0, fields: 0, findings: 0 };
  f[kind] += n;
  l[kind] += n;
  f.byLocale[locale] = l;
  stats.set(family, f);
}

/**
 * Evaluate one string and record what comes back.
 *
 * `random` marks surfaces a learner meets without asking — assessment
 * options, distractors, gap-fills — where CONTEXT_BLOCK also refuses.
 */
const contextual = []; // CONTEXT_BLOCK findings on the dictionary: allowed there, reported for the record.
function scan(family, locale, surface, facts, where) {
  bump(family, locale, 'fields');
  const result = evaluateSurface(surface, facts);
  const verdict = verdictOf(result, facts);
  if (verdict === 'ok') return;
  /*
   * A dictionary is allowed to define 사망 and 장례. CONTEXT_BLOCK is the
   * policy's word for "never at random, fine when looked up", and a
   * dictionary row is only ever looked up — so a review verdict there is
   * recorded, not failed. HARD_BLOCK rows are removed by the dictionary
   * builder and any that remain are findings like everywhere else.
   */
  if (verdict === 'review' && family === FAMILY_DICT) {
    for (const f of result) contextual.push({ family, locale, where, category: f.category, term: f.term, excerpt: f.excerpt });
    return;
  }
  bump(family, locale, 'findings');
  for (const f of result) {
    findings.push({
      family,
      locale,
      where,
      role: surface.role,
      verdict,
      category: f.category,
      severity: f.severity,
      concept: f.conceptId,
      term: f.term,
      mode: f.mode,
      excerpt: f.excerpt,
    });
  }
}

const koreanSurface = (text, role, field) => ({ text, lang: 'ko', role, field });
const FAMILY_DICT = 'dictionary';

// ---------------------------------------------------------------------------
// 1. The taught corpus — source pack, generated pack, runtime bands
// ---------------------------------------------------------------------------
const FAMILY_CORPUS = 'taught-corpus';
{
  // Source of truth: content/vocabulary/entries/*.jsonl (kept rows only).
  const dir = join(ROOT, 'content', 'vocabulary', 'entries');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (!row.k) continue;
      const facts = { headword: row.w };
      const where = `entries/${file}:${row.w}`;
      bump(FAMILY_CORPUS, 'ko', 'items');
      scan(FAMILY_CORPUS, 'ko', koreanSurface(row.w, 'headword', 'w'), facts, where);
      if (row.ex) scan(FAMILY_CORPUS, 'ko', koreanSurface(row.ex, 'sentence', 'ex'), facts, where);
      if (row.en) scan(FAMILY_CORPUS, 'en', { text: row.en, lang: 'en', role: 'gloss', field: 'en' }, facts, where);
      for (const [lc, text] of Object.entries(row.m ?? {})) {
        const lang = lc === 'zh' ? 'zh-CN' : lc === 'pt' ? 'pt-BR' : lc;
        if (text) scan(FAMILY_CORPUS, lang, { text, lang, role: 'gloss', field: `m.${lc}` }, facts, where);
      }
      for (const [lc, text] of Object.entries(row.t ?? {})) {
        const lang = lc === 'zh' ? 'zh-CN' : lc === 'pt' ? 'pt-BR' : lc;
        if (text) scan(FAMILY_CORPUS, lang, { text, lang, role: 'sentence', field: `t.${lc}` }, facts, where);
      }
    }
  }
  // Source of truth for the other twenty-four locales: content/vocabulary/copy/<locale>.json.
  const copyDir = join(ROOT, 'content', 'vocabulary', 'copy');
  const idToWord = new Map(Object.entries(read('content/vocabulary/word-ids.json')).map(([w, id]) => [id, w]));
  for (const file of readdirSync(copyDir).filter((f) => f.endsWith('.json')).sort()) {
    const locale = file.replace(/\.json$/, '');
    const pack = read(`content/vocabulary/copy/${file}`);
    for (const [id, row] of Object.entries(pack)) {
      if (id === '_comment' || !Array.isArray(row)) continue;
      const facts = { headword: idToWord.get(id) ?? undefined };
      const where = `copy/${file}:${id}`;
      const [meaning, example] = row;
      if (meaning) scan(FAMILY_CORPUS, locale, { text: meaning, lang: locale, role: 'gloss', field: 'meaning' }, facts, where);
      if (example) scan(FAMILY_CORPUS, locale, { text: example, lang: locale, role: 'sentence', field: 'example' }, facts, where);
    }
  }
}

// Generated pack — what the build wrote — and the bands the app fetches.
const FAMILY_GENERATED = 'generated-vocabulary';
const vocabulary = read('apps/web/src/data/generated/vocabulary.json');
{
  for (const word of vocabulary.words) {
    const facts = { headword: word.word, senseId: word.senseId };
    const where = `vocabulary.json:${word.id}`;
    bump(FAMILY_GENERATED, 'ko', 'items');
    scan(FAMILY_GENERATED, 'ko', koreanSurface(word.word, 'headword', 'word'), facts, where);
    if (word.example) scan(FAMILY_GENERATED, 'ko', koreanSurface(word.example, 'sentence', 'example'), facts, where);
    if (word.romanization) {
      scan(FAMILY_GENERATED, 'ko', { text: word.romanization, lang: 'en', role: 'romanization', field: 'romanization' }, facts, where);
    }
  }
  for (const locale of LOCALES) {
    const pack = read(`apps/web/src/data/generated/vocabulary.${locale}.json`);
    pack.words.forEach((row, index) => {
      const word = vocabulary.words[index];
      const facts = { headword: word.word, senseId: word.senseId };
      const where = `vocabulary.${locale}.json:${word.id}`;
      bump(FAMILY_GENERATED, locale, 'items');
      const [gloss, example, note] = row;
      if (gloss) scan(FAMILY_GENERATED, locale, { text: gloss, lang: locale, role: 'gloss', field: 'gloss' }, facts, where);
      if (example) scan(FAMILY_GENERATED, locale, { text: example, lang: locale, role: 'sentence', field: 'example' }, facts, where);
      if (note) scan(FAMILY_GENERATED, locale, { text: note, lang: locale, role: 'note', field: 'note' }, facts, where);
    });
  }
}

const FAMILY_BANDS = 'runtime-corpus-bands';
{
  const manifest = read('apps/web/public/corpus/manifest.json');
  for (const band of manifest.bands) {
    const core = read(`apps/web/public/corpus/${band.words}`);
    const words = core.words;
    for (const word of words) {
      const facts = { headword: word.word, senseId: word.senseId };
      const where = `corpus/${band.words}:${word.id}`;
      bump(FAMILY_BANDS, 'ko', 'items');
      scan(FAMILY_BANDS, 'ko', koreanSurface(word.word, 'headword', 'word'), facts, where);
      if (word.example) scan(FAMILY_BANDS, 'ko', koreanSurface(word.example, 'sentence', 'example'), facts, where);
    }
    for (const [locale, file] of Object.entries(band.locales)) {
      const pack = read(`apps/web/public/corpus/${file}`);
      pack.words.forEach((row, index) => {
        const word = words[index];
        const facts = { headword: word.word, senseId: word.senseId };
        const where = `corpus/${file}:${word.id}`;
        bump(FAMILY_BANDS, locale, 'items');
        const [gloss, example, note] = row;
        if (gloss) scan(FAMILY_BANDS, locale, { text: gloss, lang: locale, role: 'gloss', field: 'gloss' }, facts, where);
        if (example) scan(FAMILY_BANDS, locale, { text: example, lang: locale, role: 'sentence', field: 'example' }, facts, where);
        if (note) scan(FAMILY_BANDS, locale, { text: note, lang: locale, role: 'note', field: 'note' }, facts, where);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Gap-fills — Today's Vocabulary and Review
// ---------------------------------------------------------------------------
const FAMILY_CLOZE = 'gap-fills';
const clozeWords = read('apps/web/src/data/generated/cloze.json').words;
const byId = new Map(vocabulary.words.map((word) => [word.id, word.word]));
{
  for (const [wordId, gap] of Object.entries(clozeWords)) {
    bump(FAMILY_CLOZE, 'ko', 'items');
    const where = `cloze.json:${wordId}`;
    const facts = { headword: byId.get(wordId), random: true };
    scan(FAMILY_CLOZE, 'ko', koreanSurface(`${gap.before}____${gap.after}`, 'sentence', 'frame'), facts, where);
    for (const option of gap.options) {
      const sentence = `${gap.before}${option.surface}${gap.after}`;
      scan(FAMILY_CLOZE, 'ko', koreanSurface(option.surface, 'option', 'option'), { headword: byId.get(option.id), random: true }, where);
      scan(FAMILY_CLOZE, 'ko', koreanSurface(sentence, 'sentence', 'composed'), { headword: byId.get(wordId), random: true }, where);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. The Level Test — bank and meanings in every locale
// ---------------------------------------------------------------------------
const FAMILY_BANK = 'level-test';
const manifest = read('apps/web/public/level-test/manifest.json');
const bank = read(join('apps/web/public/level-test', manifest.bank));
const items = bank.items ?? bank;
const meanings = {};
for (const [locale, file] of Object.entries(manifest.meanings ?? {})) {
  meanings[locale] = read(join('apps/web/public/level-test', file)).meanings;
}
{
  /*
   * The facts the builder's publication gate uses, so the two agree: a prompt
   * and an answer belong to the item's own word, an option is judged as its
   * own card (or, conjugated, as any lemma the item was built from), and a
   * meaning belongs to the word it defines. An allowlisted card is allowed in
   * every slot; a word nobody named is refused at random surfaces.
   */
  const wordOfId = (id) => (id.startsWith('dict_') ? id.slice(5) : byId.get(id));
  for (const item of items) {
    bump(FAMILY_BANK, 'ko', 'items');
    const where = `bank:${item.id}`;
    const own = { random: true, headword: wordOfId(item.id.split(':')[0]) };
    if (item.prompt) scan(FAMILY_BANK, 'ko', koreanSurface(item.prompt, item.kind === 'meaning' ? 'headword' : 'sentence', 'prompt'), own, where);
    if (item.answer) scan(FAMILY_BANK, 'ko', koreanSurface(item.answer, 'option', 'answer'), own, where);
    const lemmas = [item.lemma, ...(item.distractorIds ?? []).map(wordOfId)].filter(Boolean);
    for (const option of item.options ?? []) {
      const candidates = [option, ...lemmas];
      const passes = candidates.some((headword) => verdictOf(evaluateSurface(koreanSurface(option, 'option', 'option'), { random: true, headword }), { random: true }) === 'ok');
      bump(FAMILY_BANK, 'ko', 'fields');
      if (!passes) scan(FAMILY_BANK, 'ko', koreanSurface(option, 'option', 'option'), { random: true, headword: option }, where);
    }
    // The strings a learner actually sees for a meaning item are the resolved
    // meanings in their language — the id list is not a surface.
    for (const id of [...(item.optionIds ?? []), ...(item.promptId ? [item.promptId] : [])]) {
      for (const [locale, table] of Object.entries(meanings)) {
        const text = table[id];
        if (!text) continue;
        bump(FAMILY_BANK, locale, 'items', 0);
        scan(FAMILY_BANK, locale, { text, lang: locale, role: 'option', field: `meaning:${id}` }, { random: true, headword: wordOfId(id) }, where);
      }
    }
  }
  for (const [locale, table] of Object.entries(meanings)) {
    for (const [id, text] of Object.entries(table)) {
      bump(FAMILY_BANK, locale, 'items');
      scan(FAMILY_BANK, locale, { text, lang: locale, role: 'gloss', field: 'meaning' }, { random: true, headword: wordOfId(id) }, `meanings-${locale}:${id}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. The dictionary — index and every entry chunk
// ---------------------------------------------------------------------------
{
  const dictManifest = read('apps/web/public/dictionary/manifest.json');
  const index = read(join('apps/web/public/dictionary', dictManifest.index));
  for (const [headword, romanization, gloss] of index.rows) {
    bump(FAMILY_DICT, 'ko', 'items');
    const facts = { headword };
    const where = `dictionary/index:${headword}`;
    scan(FAMILY_DICT, 'ko', koreanSurface(headword, 'headword', 'headword'), facts, where);
    if (romanization) scan(FAMILY_DICT, 'ko', { text: romanization, lang: 'en', role: 'romanization', field: 'romanization' }, facts, where);
    if (gloss) scan(FAMILY_DICT, 'en', { text: gloss, lang: 'en', role: 'gloss', field: 'gloss' }, facts, where);
  }
  for (const chunk of Object.values(dictManifest.chunks)) {
    const entries = read(join('apps/web/public/dictionary', chunk.file)).entries;
    for (const entry of entries) {
      const facts = { headword: entry.headword };
      const where = `dictionary/${chunk.file}:${entry.headword}`;
      for (const sense of entry.senses ?? []) {
        if (sense.gloss) scan(FAMILY_DICT, 'en', { text: sense.gloss, lang: 'en', role: 'gloss', field: 'sense.gloss' }, facts, where);
        for (const example of sense.examples ?? []) {
          const ko = typeof example === 'string' ? example : example.korean ?? example.ko ?? example.text;
          const en = typeof example === 'string' ? '' : example.english ?? example.en ?? example.translation ?? '';
          if (ko) scan(FAMILY_DICT, 'ko', koreanSurface(ko, 'sentence', 'sense.example'), facts, where);
          if (en) scan(FAMILY_DICT, 'en', { text: en, lang: 'en', role: 'sentence', field: 'sense.example.en' }, facts, where);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Letters, Numbers, UI copy, quotations, curriculum — every locale
// ---------------------------------------------------------------------------
const FAMILY_LETTERS = 'letters';
{
  for (const locale of LOCALES) {
    const path = `apps/web/src/data/generated/letters.${locale}.json`;
    if (!exists(path)) continue;
    const pack = read(path);
    for (const [letter, rows] of Object.entries(pack.letters ?? {})) {
      bump(FAMILY_LETTERS, locale, 'items');
      for (const [i, text] of (Array.isArray(rows) ? rows : [rows]).entries()) {
        if (typeof text === 'string' && text) scan(FAMILY_LETTERS, locale, { text, lang: locale, role: 'note', field: `letters.${i}` }, {}, `letters.${locale}:${letter}`);
      }
    }
  }
  const lettersDir = join(ROOT, 'content', 'letters');
  if (existsSync(lettersDir)) {
    for (const file of readdirSync(lettersDir).filter((f) => f.endsWith('.json'))) {
      const locale = file.replace(/\.json$/, '');
      walkStrings(read(`content/letters/${file}`), (text, path) => {
        scan(FAMILY_LETTERS, locale, { text, lang: locale, role: 'note', field: path }, {}, `content/letters/${file}`);
      });
    }
  }
}

const FAMILY_UI = 'ui-copy';
{
  const localesDir = join(ROOT, 'apps', 'web', 'src', 'locales');
  for (const locale of readdirSync(localesDir).sort()) {
    const dir = join(localesDir, locale);
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const file of files) {
      bump(FAMILY_UI, locale, 'items');
      walkStrings(read(`apps/web/src/locales/${locale}/${file}`), (text, path) => {
        scan(FAMILY_UI, locale, { text, lang: locale, role: 'ui', field: path }, {}, `locales/${locale}/${file}`);
      });
    }
  }
}

const FAMILY_NUMBERS = 'numbers';
{
  // The Korean side of the Numbers course lives in a TypeScript module; every
  // string literal in it is a surface.
  const source = readFileSync(join(ROOT, 'apps', 'web', 'src', 'data', 'numbers.ts'), 'utf8');
  const literals = source.match(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g) ?? [];
  let n = 0;
  for (const raw of literals) {
    const text = raw.slice(1, -1);
    if (!/[가-힣]/.test(text)) continue;
    n += 1;
    scan(FAMILY_NUMBERS, 'ko', koreanSurface(text, 'sentence', 'literal'), {}, 'numbers.ts');
  }
  bump(FAMILY_NUMBERS, 'ko', 'items', n);
}

const FAMILY_QUOTES = 'quotations';
{
  const source = readFileSync(join(ROOT, 'apps', 'web', 'src', 'data', 'quotes.ts'), 'utf8');
  const literals = source.match(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g) ?? [];
  let n = 0;
  for (const raw of literals) {
    const text = raw.slice(1, -1);
    if (text.length < 8) continue;
    n += 1;
    const lang = /[가-힣]/.test(text) ? 'ko' : 'en';
    scan(FAMILY_QUOTES, lang, { text, lang, role: 'sentence', field: 'literal' }, {}, 'quotes.ts');
  }
  bump(FAMILY_QUOTES, 'ko', 'items', n);
}

const FAMILY_CURRICULUM = 'curriculum';
{
  const curriculum = read('content/curriculum.json');
  // The curriculum export carries every locale's copy flattened together; the
  // locale packs above are its sources and are scanned as their own language.
  // Here only the Korean is read, as Korean.
  const curriculumWords = Array.isArray(curriculum.words) ? curriculum.words : [];
  walkStrings(curriculum, (text, path) => {
    if (path.startsWith('_comment') || path.startsWith('fonts')) return;
    if (!/[가-힣]/.test(text)) return;
    // A word's own strings are judged as that word, as everywhere else; a
    // lesson subtitle is the list of its words, and each is judged as itself.
    const m = /^words\[(\d+)\]/.exec(path);
    if (path.endsWith('.subtitle') && text.includes(' · ')) {
      for (const word of text.split(' · ')) {
        scan(FAMILY_CURRICULUM, 'ko', { text: word, lang: 'ko', role: 'headword', field: path }, { headword: word }, 'curriculum.json');
      }
      return;
    }
    const facts = m ? { headword: curriculumWords[Number(m[1])]?.word } : {};
    scan(FAMILY_CURRICULUM, 'ko', { text, lang: 'ko', role: 'note', field: path }, facts, 'curriculum.json');
  });
  bump(FAMILY_CURRICULUM, 'ko', 'items', 1);
}

// ---------------------------------------------------------------------------
// 6. Audio — every transcript the TTS was asked to speak
// ---------------------------------------------------------------------------
const FAMILY_AUDIO = 'audio-transcripts';
{
  // A recording is a word's own: the clip of 무덤 and the clip of its example
  // are judged as the card 무덤, exactly as the card's text is.
  const spokenBy = new Map();
  for (const word of vocabulary.words) {
    spokenBy.set(word.word, word.word);
    if (word.example) spokenBy.set(word.example, word.word);
  }
  const audio = read('apps/web/public/audio/manifest.json');
  for (const entry of audio.entries ?? []) {
    bump(FAMILY_AUDIO, 'ko', 'items');
    scan(FAMILY_AUDIO, 'ko', koreanSurface(entry.text, 'transcript', entry.kind), { headword: spokenBy.get(entry.text) }, `audio:${entry.id}`);
  }
  if (exists('content-cache/speech-plan.json')) {
    for (const entry of read('content-cache/speech-plan.json').entries ?? []) {
      scan(FAMILY_AUDIO, 'ko', koreanSurface(entry.text, 'transcript', `plan.${entry.kind}`), { headword: spokenBy.get(entry.text) }, `speech-plan:${entry.id}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Composed sentences — the frame rules the policy does not claim
// ---------------------------------------------------------------------------
const FAMILY_FRAMES = 'composed-frames';
const safety = read('content/vocabulary/learner-safety.json');
const classes = read('content/vocabulary/noun-classes.json').classes;
const NOT_STANDALONE = new Set(
  Object.entries(safety.notStandalone)
    .filter(([name]) => name !== '_comment')
    .flatMap(([, terms]) => terms),
);
const FRAMES = safety.frames.rules;
const PREDICATE_SURFACES = new Map();
for (const rule of FRAMES) {
  for (const predicate of rule.predicates) {
    const forms = new Set([predicate]);
    for (const form of FORMS) {
      const value = conjugate(predicate, form, { partOfSpeech: 'verb' });
      if (value) forms.add(value);
    }
    PREDICATE_SURFACES.set(predicate, [...forms]);
  }
}
const classOf = (word) => classes[word] ?? [];
function unsafeComposition(sentence, inserted) {
  const insertedClasses = classOf(inserted);
  if (insertedClasses.length === 0) return null;
  const at = sentence.indexOf(inserted);
  if (at < 0) return null;
  const rest = sentence.slice(at + inserted.length);
  if (!/^(을|를)/.test(rest)) return null;
  for (const rule of FRAMES) {
    if (!rule.forbidObject.some((c) => insertedClasses.includes(c))) continue;
    for (const predicate of rule.predicates) {
      for (const surface of PREDICATE_SURFACES.get(predicate) ?? []) {
        if (surface.length >= 2 && rest.includes(surface)) return rule.why;
      }
    }
  }
  return null;
}
let composed = 0;
{
  for (const item of items.filter((item) => item.kind === 'context')) {
    for (const option of item.options ?? []) {
      const sentence = item.prompt.replace('____', option);
      composed += 1;
      const why = unsafeComposition(sentence, option);
      if (why) findings.push({ family: FAMILY_FRAMES, locale: 'ko', where: `bank:${item.id}`, role: 'sentence', verdict: 'blocked', category: 'frame', severity: 'HARD_BLOCK', concept: 'frames', term: option, mode: 'frame', excerpt: `${sentence} — ${why}` });
      if (item.form === 'noun' && NOT_STANDALONE.has(option)) {
        findings.push({ family: FAMILY_FRAMES, locale: 'ko', where: `bank:${item.id}`, role: 'option', verdict: 'blocked', category: 'standalone', severity: 'HARD_BLOCK', concept: 'notStandalone', term: option, mode: 'headword', excerpt: `${option} may not stand alone inside a sentence` });
      }
    }
  }
  for (const [wordId, gap] of Object.entries(clozeWords)) {
    for (const option of gap.options) {
      const sentence = `${gap.before}${option.surface}${gap.after}`;
      composed += 1;
      const why = unsafeComposition(sentence, option.surface);
      if (why) findings.push({ family: FAMILY_FRAMES, locale: 'ko', where: `cloze:${wordId}`, role: 'sentence', verdict: 'blocked', category: 'frame', severity: 'HARD_BLOCK', concept: 'frames', term: option.surface, mode: 'frame', excerpt: `${sentence} — ${why}` });
      if (gap.form === 'noun' && NOT_STANDALONE.has(option.surface)) {
        findings.push({ family: FAMILY_FRAMES, locale: 'ko', where: `cloze:${wordId}`, role: 'option', verdict: 'blocked', category: 'standalone', severity: 'HARD_BLOCK', concept: 'notStandalone', term: option.surface, mode: 'headword', excerpt: `${option.surface} may not stand alone in a sentence` });
      }
    }
  }
  bump(FAMILY_FRAMES, 'ko', 'items', composed);
  bump(FAMILY_FRAMES, 'ko', 'fields', composed);
  bump(FAMILY_FRAMES, 'ko', 'findings', findings.filter((f) => f.family === FAMILY_FRAMES).length);
}

// ---------------------------------------------------------------------------
// 8. Retired items must not resurface anywhere a learner reaches
// ---------------------------------------------------------------------------
const FAMILY_RETIRED = 'retired-items';
{
  const retired = exists('content/vocabulary/retired-words.json') ? read('content/vocabulary/retired-words.json') : { words: {} };
  const retiredWords = new Set(Object.values(retired.words ?? {}).map((row) => row.word));
  const taught = new Set(vocabulary.words.map((w) => w.word));
  for (const word of retiredWords) {
    bump(FAMILY_RETIRED, 'ko', 'items');
    bump(FAMILY_RETIRED, 'ko', 'fields');
    if (taught.has(word)) {
      findings.push({ family: FAMILY_RETIRED, locale: 'ko', where: `vocabulary.json:${word}`, role: 'headword', verdict: 'blocked', category: 'retired', severity: 'HARD_BLOCK', concept: 'retired-words', term: word, mode: 'headword', excerpt: `${word} is retired and still in the taught corpus` });
    }
    for (const item of items) {
      const surfaces = [item.prompt, item.answer, ...(item.options ?? [])].filter(Boolean);
      if (surfaces.includes(word)) {
        findings.push({ family: FAMILY_RETIRED, locale: 'ko', where: `bank:${item.id}`, role: 'option', verdict: 'blocked', category: 'retired', severity: 'HARD_BLOCK', concept: 'retired-words', term: word, mode: 'headword', excerpt: `${word} is retired and still in the Level Test bank` });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function walkStrings(value, visit, path = '') {
  if (typeof value === 'string') {
    if (value.trim()) visit(value, path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, visit, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkStrings(v, visit, path ? `${path}.${k}` : k);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const byCategory = {};
const byLocale = {};
for (const f of findings) {
  byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  byLocale[f.locale] = (byLocale[f.locale] ?? 0) + 1;
}
const families = {};
let totalItems = 0;
let totalFields = 0;
for (const [family, s] of stats) {
  families[family] = { items: s.items, fields: s.fields, findings: s.findings, byLocale: s.byLocale };
  totalItems += s.items;
  totalFields += s.fields;
}
const locales = {};
for (const locale of new Set([...LOCALES, 'ko', 'en'])) {
  let itemsScanned = 0;
  let fieldsScanned = 0;
  for (const s of stats.values()) {
    const l = s.byLocale[locale];
    if (!l) continue;
    itemsScanned += l.items;
    fieldsScanned += l.fields;
  }
  const localeFindings = findings.filter((f) => f.locale === locale);
  const cats = {};
  for (const f of localeFindings) cats[f.category] = (cats[f.category] ?? 0) + 1;
  locales[locale] = { itemsScanned, fieldsScanned, findings: localeFindings.length, findingsByCategory: cats };
}

const report = {
  _comment:
    'GENERATED by scripts/content-safety-qa.mjs. The child-safe content scan of every learner-facing surface, in every supported locale. Regenerate with `npm run content:safety:qa`; `--check` fails on any finding or if this file is stale.',
  policyVersion: POLICY_VERSION,
  supportedLocales: LOCALES,
  totals: {
    families: Object.keys(families).length,
    items: totalItems,
    fields: totalFields,
    composedSentences: composed,
    findings: findings.length,
    blocked: findings.filter((f) => f.verdict === 'blocked').length,
    review: findings.filter((f) => f.verdict === 'review').length,
    dictionaryContextual: contextual.length,
  },
  dictionaryContextualByCategory: contextual.reduce((acc, f) => ({ ...acc, [f.category]: (acc[f.category] ?? 0) + 1 }), {}),
  findingsByCategory: byCategory,
  findingsByLocale: byLocale,
  families,
  locales,
  findings: findings.slice(0, Number(process.env.SAFETY_FINDINGS_LIMIT ?? 500)),
};

console.log(`Child-safe content scan — policy ${POLICY_VERSION}\n`);
console.log(`  families          ${report.totals.families}`);
console.log(`  locales           ${LOCALES.length}`);
console.log(`  items scanned     ${totalItems.toLocaleString('en')}`);
console.log(`  fields evaluated  ${totalFields.toLocaleString('en')}`);
console.log(`  sentences composed ${composed.toLocaleString('en')}`);
for (const [family, s] of stats) {
  console.log(`    ${family.padEnd(24)} items ${String(s.items).padStart(7)}  fields ${String(s.fields).padStart(8)}  findings ${s.findings}`);
}

if (findings.length === 0) {
  console.log('\nno learner-facing surface, in any locale, carries prohibited content.');
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const [cat, n] of Object.entries(byCategory)) console.log(`  ${String(n).padStart(5)} ${cat}`);
  for (const f of findings.slice(0, 60)) {
    console.log(`  ${f.verdict.padEnd(7)} ${f.category.padEnd(10)} ${f.locale.padEnd(6)} ${f.where.padEnd(44)} ${f.term} — ${f.excerpt}`);
  }
  if (findings.length > 60) console.log(`  … and ${findings.length - 60} more (see ${relative(ROOT, REPORT)})`);
}

const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (CHECK) {
  const current = existsSync(REPORT) ? readFileSync(REPORT, 'utf8') : '';
  if (findings.length > 0) process.exit(1);
  if (current !== rendered) {
    console.log(`\n${relative(ROOT, REPORT)} is stale — run \`npm run content:safety:qa\``);
    process.exit(1);
  }
} else {
  writeFileSync(REPORT, rendered);
  console.log(`\nwrote ${relative(ROOT, REPORT)}`);
}
