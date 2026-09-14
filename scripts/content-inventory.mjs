#!/usr/bin/env tsx
/**
 * One machine-readable inventory of the educational content, derived from the
 * sources of truth and nothing else.
 *
 *   npm run content:inventory          write docs/content-inventory.json
 *   npm run content:inventory:check    fail if the file on disk is stale
 *
 * ## Why
 *
 * The product report carried three different taught-word counts (3,333, 3,370
 * and 3,393), two answers for how many locale packs are complete, two counts of
 * beginner gap-fills and three sets of dictionary figures — each true of some
 * earlier tree, each written by hand, and none of them checked against the
 * file that holds the fact. This inventory is the one place a *current* content
 * figure comes from. `check-docs-consistency.mjs` embeds it in
 * `docs/report-metrics.json`, the report's current-state sections quote it,
 * and a figure that is not in here is a figure a reader should treat as prose.
 *
 * ## What is measured, and from where
 *
 * | Group | Source of truth |
 * | --- | --- |
 * | taught entries, headwords, senses, POS, levels, categories, bands | `apps/web/src/data/generated/vocabulary.json` — the built pack, and it must agree with `content/vocabulary/entries/*.jsonl`, which is checked here |
 * | translations per locale, notes | `apps/web/src/data/generated/vocabulary.<locale>.json`, index-aligned with the pack |
 * | audio coverage | `apps/web/public/audio/manifest.json`, by the same id the app builds |
 * | Level Test items | `apps/web/public/level-test/manifest.json` and its bank |
 * | gap-fills | `apps/web/src/data/generated/cloze.json` and `content/vocabulary/context-items.json` |
 * | lexical relations | `content/vocabulary/relations.json` (mutually stated, sense-scoped) |
 * | safety findings | `docs/child-safe-content-audit.json` (`content:safety:qa`) |
 * | retired entries | `content/vocabulary/retired-words.json` and `k: 0` rows |
 * | recommendation zones and exhaustion | the app's own `teachingZone` and `DAILY_WORD_GOALS` |
 *
 * Nothing here is typed in. A number that cannot be derived is reported as
 * `null` with a note, never estimated.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'content-inventory.json');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

/** The audio id the app builds for a text — see `audioId` in `data/vocabulary.ts`. */
const audioId = (prefix, text) =>
  `${prefix}_${[...text].map((ch) => ch.codePointAt(0).toString(16)).join('')}`;

const { teachingZone } = await import('../apps/web/src/domain/vocabularyLevel.ts');
const { DAILY_WORD_GOALS, newWordAllowance } = await import(
  '../apps/web/src/domain/vocabularyDay.ts'
);

export function computeInventory() {
  const problems = [];
  const pack = read('apps/web/src/data/generated/vocabulary.json');
  const words = pack.words;

  // --- the editorial source, read independently of the build ---------------
  const entriesDir = join(ROOT, 'content/vocabulary/entries');
  const sourceRows = [];
  for (const name of readdirSync(entriesDir).filter((n) => n.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(join(entriesDir, name), 'utf8').split('\n')) {
      if (line.trim()) sourceRows.push(JSON.parse(line));
    }
  }
  const sourceKept = sourceRows.filter((r) => r.k !== 0);
  const sourceCut = sourceRows.filter((r) => r.k === 0);
  const sourceHeadwords = new Set(sourceKept.map((r) => r.w));
  const builtHeadwords = new Set(words.map((w) => w.word));
  if (sourceHeadwords.size !== sourceKept.length) {
    problems.push(`the editorial pack lists a headword twice (${sourceKept.length - sourceHeadwords.size})`);
  }
  for (const w of sourceHeadwords) if (!builtHeadwords.has(w)) problems.push(`kept in the pack, not built: ${w}`);
  for (const w of builtHeadwords) if (!sourceHeadwords.has(w)) problems.push(`built, not in the pack: ${w}`);

  // --- distinct entries, headwords, senses -------------------------------
  const ids = new Set(words.map((w) => w.id));
  const senses = new Set(words.map((w) => w.senseId));
  if (ids.size !== words.length) problems.push('duplicate word ids in the built pack');

  const countBy = (fn) => {
    const out = {};
    for (const w of words) {
      const key = fn(w);
      out[key] = (out[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (isNaN(a) ? a.localeCompare(b) : a - b)));
  };
  const byPos = countBy((w) => w.part_of_speech);
  const byLevel = {};
  for (let level = 1; level <= 30; level += 1) byLevel[level] = 0;
  for (const w of words) byLevel[w.level] = (byLevel[w.level] ?? 0) + 1;
  const byCategory = countBy((w) => pack.categories[w.c]);
  const byBand = countBy((w) => pack.frequency_bands[w.f[0]]);
  const byUsefulness = countBy((w) => w.usefulness);

  // --- duplicates and near-duplicates ------------------------------------
  // Exact duplicates cannot exist (the build refuses them); what can is the
  // same word taught twice under two spellings, a spacing variant, or two
  // rows whose English gloss and example are identical. Reported, not judged.
  const nfc = (s) => s.normalize('NFC');
  const compact = new Map();
  for (const w of words) {
    const key = nfc(w.word).replace(/\s+/g, '');
    compact.set(key, [...(compact.get(key) ?? []), w.word]);
  }
  const spacingVariants = [...compact.values()].filter((v) => v.length > 1);
  const en = read('apps/web/src/data/generated/vocabulary.en.json').words;
  const byGloss = new Map();
  words.forEach((w, i) => {
    const gloss = (en[i]?.[0] ?? '').toLowerCase().trim();
    if (!gloss) return;
    byGloss.set(gloss, [...(byGloss.get(gloss) ?? []), w.word]);
  });
  const sharedGlosses = [...byGloss.entries()].filter(([, v]) => v.length > 1);
  const byExample = new Map();
  for (const w of words) byExample.set(w.example, [...(byExample.get(w.example) ?? []), w.word]);
  const sharedExamples = [...byExample.entries()].filter(([, v]) => v.length > 1);

  // --- translations per locale -------------------------------------------
  const localeFiles = readdirSync(join(ROOT, 'apps/web/src/data/generated'))
    .filter((n) => /^vocabulary\.[\w-]+\.json$/.test(n))
    .sort();
  const locales = {};
  for (const file of localeFiles) {
    const doc = read(`apps/web/src/data/generated/${file}`);
    const rows = doc.words;
    const missingMeaning = rows.filter((r) => !r || !r[0]).length;
    const missingExample =
      doc.locale === 'ko' ? 0 : rows.filter((r) => !r || !r[1]).length;
    const notes = rows.filter((r) => r && r[2]).length;
    locales[doc.locale] = {
      rows: rows.length,
      meanings: rows.length - missingMeaning,
      example_translations: doc.locale === 'ko' ? null : rows.length - missingExample,
      notes,
      missing_meanings: missingMeaning,
      missing_example_translations: doc.locale === 'ko' ? null : missingExample,
      complete: missingMeaning === 0 && missingExample === 0,
    };
    if (rows.length !== words.length) problems.push(`${doc.locale}: ${rows.length} rows for ${words.length} words`);
  }
  const completeLocales = Object.values(locales).filter((l) => l.complete).length;
  const noteCountsDiffer = new Set(Object.values(locales).map((l) => l.notes)).size > 1;
  if (noteCountsDiffer) problems.push('More-about-it note counts differ between locales');

  // --- audio ---------------------------------------------------------------
  const audio = read('apps/web/public/audio/manifest.json');
  const clips = new Map(audio.entries.map((e) => [e.id, e]));
  let headwordAudio = 0;
  let exampleAudio = 0;
  const missingAudio = [];
  for (const w of words) {
    const wordClip = clips.get(audioId('word', w.word));
    const exClip = clips.get(audioId('ex', w.example));
    const both = (c) => c && c.female && c.male;
    if (both(wordClip)) headwordAudio += 1;
    else missingAudio.push({ word: w.word, kind: 'word' });
    if (both(exClip)) exampleAudio += 1;
    else missingAudio.push({ word: w.word, kind: 'example' });
  }
  const cloze = read('apps/web/src/data/generated/cloze.json').words;
  const curatedSource = read('content/vocabulary/context-items.json').items;
  let curatedWithAudio = 0;
  const curatedMissingAudio = [];
  const curatedInBank = Object.values(cloze).filter((g) => g.curated);
  for (const gap of curatedInBank) {
    const clip = clips.get(gap.audioId);
    if (clip && clip.female && clip.male) curatedWithAudio += 1;
    else curatedMissingAudio.push(gap.before + gap.target + gap.after);
  }
  const distinctFiles = new Set();
  for (const e of audio.entries) for (const v of ['female', 'male']) if (e[v]) distinctFiles.add(e[v].src);

  // --- Level Test -----------------------------------------------------------
  const ltManifest = read('apps/web/public/level-test/manifest.json');
  const bank = read(`apps/web/public/level-test/${ltManifest.bank}`);
  const ltByLevel = {};
  for (let level = 1; level <= 30; level += 1) ltByLevel[level] = { meaning: 0, produce: 0, context: 0, total: 0 };
  const ltWords = new Set();
  for (const item of bank.items) {
    ltByLevel[item.level][item.kind] += 1;
    ltByLevel[item.level].total += 1;
    ltWords.add(item.answerId);
  }
  const ltByKind = countByItems(bank.items, (i) => i.kind);
  const taughtIds = new Set(words.map((w) => w.id));
  const ltTaughtWords = [...ltWords].filter((id) => taughtIds.has(id)).length;
  const ltDictionaryWords = ltWords.size - ltTaughtWords;

  // --- gap-fills -------------------------------------------------------------
  const wordById = new Map(words.map((w) => [w.id, w]));
  const gapByLevel = {};
  for (let level = 1; level <= 30; level += 1) gapByLevel[level] = { generated: 0, curated: 0 };
  for (const [id, gap] of Object.entries(cloze)) {
    const level = wordById.get(id)?.level;
    if (!level) continue;
    gapByLevel[level][gap.curated ? 'curated' : 'generated'] += 1;
  }
  const gapLevels1to5 = [1, 2, 3, 4, 5].reduce(
    (n, l) => n + gapByLevel[l].generated + gapByLevel[l].curated,
    0,
  );

  // --- More about it, pronunciation, relations ------------------------------
  const notesEn = en.filter((r) => r && r[2]).length;
  const pronunciationNotes = words.filter((w) => w.say).length;
  const noted = new Set(pack.noted_patterns);
  const pronunciationCards = words.filter((w) => w.sayWhy && noted.has(w.sayWhy)).length;
  const relations = read('content/vocabulary/relations.json');
  const relationWords = relations.counts.words_with_relations;

  // --- safety ---------------------------------------------------------------
  const safety = read('docs/child-safe-content-audit.json');

  // --- retired --------------------------------------------------------------
  const retired = read('content/vocabulary/retired-words.json');
  const tombstones = Array.isArray(retired.words) ? retired.words.length : Object.keys(retired.words ?? {}).length;

  // --- recommendation zones and exhaustion ----------------------------------
  // `teachingZone(level)` is the band a learner at that level is taught from.
  // The days-to-exhaustion figure is the zone's size divided by the number of
  // *new* words a day: at worst the whole goal (a learner with nothing to
  // consolidate, which is every learner on day one), and in steady state the
  // reserved allowance `newWordAllowance(goal)`. Both are reported. This is a
  // static bound: a real learner's taught level moves with mastery, so the
  // measured journeys in `vocabulary:level:audit` run longer than this table.
  const zones = {};
  for (let level = 1; level <= 30; level += 1) {
    const zone = teachingZone(level);
    let size = 0;
    for (let l = zone.min; l <= zone.max; l += 1) size += byLevel[l] ?? 0;
    const exhaustion = {};
    for (const goal of DAILY_WORD_GOALS) {
      exhaustion[goal] = {
        days_all_new: Math.floor(size / goal),
        days_reserved_new: Math.floor(size / newWordAllowance(goal)),
      };
    }
    zones[level] = { zone: `${zone.min}-${zone.max}`, words: size, exhaustion };
  }
  const thinnest = Object.entries(zones).sort(([, a], [, b]) => a.words - b.words)[0];

  const inventory = {
    _comment:
      'GENERATED by scripts/content-inventory.mjs from the sources named in its header. Regenerate with `npm run content:inventory`; `--check` fails when this file is stale. Every current content figure in the report is read from here.',
    generated_from: 'scripts/content-inventory.mjs',
    taught_entries: words.length,
    distinct_headwords: builtHeadwords.size,
    distinct_senses: senses.size,
    homographs_taught_twice: words.length - builtHeadwords.size,
    editorial_rows: sourceRows.length,
    editorial_rows_cut: sourceCut.length,
    retired_tombstones: tombstones,
    target: 10000,
    distance_to_target: 10000 - words.length,
    by_part_of_speech: byPos,
    by_level: byLevel,
    by_category: byCategory,
    by_frequency_band: byBand,
    by_usefulness: byUsefulness,
    words_at_28_to_30: (byLevel[28] ?? 0) + (byLevel[29] ?? 0) + (byLevel[30] ?? 0),
    locales: {
      count: Object.keys(locales).length,
      complete: completeLocales,
      partial: Object.keys(locales).length - completeLocales,
      per_locale: locales,
    },
    korean_examples: words.filter((w) => w.example).length,
    example_translations_per_locale: Object.keys(locales).length - 1,
    more_about_it: notesEn,
    pronunciation_notes: pronunciationNotes,
    pronunciation_notes_shown_on_card: pronunciationCards,
    audio: {
      distinct_files: distinctFiles.size,
      manifest_entries: audio.entries.length,
      voice_slots: audio.entries.length * 2,
      headwords_with_both_voices: headwordAudio,
      examples_with_both_voices: exampleAudio,
      curated_gap_fills_with_both_voices: curatedWithAudio,
      curated_gap_fills: curatedInBank.length,
      missing: missingAudio,
      curated_missing: curatedMissingAudio,
    },
    level_test: {
      items: bank.items.length,
      by_kind: ltByKind,
      by_level: ltByLevel,
      distinct_words: ltWords.size,
      distinct_taught_words: ltTaughtWords,
      distinct_dictionary_words: ltDictionaryWords,
      reach_non_english: (() => {
        const others = Object.entries(ltManifest.reach).filter(([l]) => l !== 'en');
        const v = new Set(others.map(([, e]) => e.items));
        return v.size === 1 ? [...v][0] : null;
      })(),
    },
    gap_fills: {
      total: Object.keys(cloze).length,
      generated: Object.values(cloze).filter((g) => !g.curated).length,
      curated: curatedInBank.length,
      curated_source_items: curatedSource.length,
      levels_1_to_5: gapLevels1to5,
      by_level: gapByLevel,
    },
    relations: {
      words_with_relations: relationWords,
      synonym_pairs: relations.counts.synonym_pairs,
      antonym_pairs: relations.counts.antonym_pairs,
    },
    safety: {
      policy_version: safety.policyVersion,
      fields_scanned: safety.totals?.fields ?? null,
      items_scanned: safety.totals?.items ?? null,
      findings: safety.findings?.length ?? 0,
      findings_by_category: safety.findingsByCategory ?? {},
    },
    duplicates: {
      spacing_variants: spacingVariants,
      shared_english_glosses: sharedGlosses.length,
      shared_english_gloss_examples: sharedGlosses.slice(0, 20),
      shared_examples: sharedExamples,
    },
    zones: {
      goals: [...DAILY_WORD_GOALS],
      per_level: zones,
      thinnest: { level: Number(thinnest[0]), ...thinnest[1] },
    },
    problems,
  };
  return inventory;
}

function countByItems(items, fn) {
  const out = {};
  for (const item of items) {
    const key = fn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const check = process.argv.includes('--check');
  const inventory = computeInventory();
  const text = JSON.stringify(inventory, null, 1) + '\n';
  if (inventory.problems.length) {
    for (const p of inventory.problems) console.log(`  ! ${p}`);
  }
  if (check) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (current !== text) {
      console.log('docs/content-inventory.json is stale — run npm run content:inventory');
      process.exit(1);
    }
    if (inventory.problems.length) process.exit(1);
    console.log(`content inventory up to date — ${inventory.taught_entries.toLocaleString('en-US')} taught entries`);
    process.exit(0);
  }
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}`);
  console.log(`  ${inventory.taught_entries.toLocaleString('en-US')} taught entries, ${inventory.distance_to_target.toLocaleString('en-US')} short of ${inventory.target.toLocaleString('en-US')}`);
  console.log(`  ${inventory.locales.complete} of ${inventory.locales.count} locales complete`);
  console.log(`  audio: ${inventory.audio.headwords_with_both_voices} headwords, ${inventory.audio.examples_with_both_voices} examples, ${inventory.audio.curated_gap_fills_with_both_voices}/${inventory.audio.curated_gap_fills} curated gap-fills`);
  console.log(`  level test: ${inventory.level_test.items} items over ${inventory.level_test.distinct_words} words`);
  console.log(`  thinnest zone: level ${inventory.zones.thinnest.level} (${inventory.zones.thinnest.zone}, ${inventory.zones.thinnest.words} words)`);
  if (inventory.problems.length) process.exit(1);
}
