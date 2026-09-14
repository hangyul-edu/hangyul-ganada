#!/usr/bin/env node
/**
 * Measures what the content costs to deliver, and what it would cost at the
 * 10,000-word target, so the number is read from files and not guessed.
 *
 *   npm run content:scalability          write docs/content-scalability.json
 *   npm run content:scalability:check    fail when the file is stale or a
 *                                        first-render figure breaks its line
 *
 * The web app fetches `public/corpus/` in bands: the shared tables and band 1
 * (words plus the learner's own language) before the first screen renders,
 * the remaining bands in the background. So the number that matters for a
 * learner's first screen is *tables + band-1 words + one band-1 locale file*,
 * gzipped — not the size of the corpus. Everything else here is per-band or
 * per-locale so that growth can be read off directly.
 *
 * The projection to 10,000 words is linear in words for the corpus and the
 * audio, which is what the generators produce (one row per word, four clips
 * per word); it is *not* a promise about the first-render figure, which is
 * pinned by the band-1 size the generator chooses and does not grow with the
 * corpus at all.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CHECK = process.argv.includes('--check');
const PUB = join(root, 'apps/web/public');
const OUT = join(root, 'docs/content-scalability.json');
const TARGET = 10000;
/** The line the first screen must stay under, gzipped; the app's overall first-load budget is 460 kB. */
const FIRST_RENDER_LINE_KB = 120;

const gz = (path) => gzipSync(readFileSync(path)).length;
const raw = (path) => statSync(path).size;
const kb = (n) => Math.round(n / 1024 * 10) / 10;

const corpusDir = join(PUB, 'corpus');
const manifest = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8'));
const headwords = manifest.headwords;
const tables = join(corpusDir, manifest.tables);
const bands = manifest.bands.map((b) => {
  const wordsPath = join(corpusDir, b.words);
  const locales = Object.fromEntries(Object.entries(b.locales).map(([loc, f]) => {
    const p = join(corpusDir, f);
    return [loc, { raw: raw(p), gzip: gz(p) }];
  }));
  const localeGz = Object.values(locales).map((x) => x.gzip);
  return {
    band: b.band, words: b.count,
    words_file: { raw: raw(wordsPath), gzip: gz(wordsPath) },
    locale_files: locales,
    locale_gzip_min: Math.min(...localeGz), locale_gzip_max: Math.max(...localeGz),
    locale_gzip_mean: Math.round(localeGz.reduce((a, c) => a + c, 0) / localeGz.length),
  };
});
const tablesSize = { raw: raw(tables), gzip: gz(tables) };
const band1 = bands[0];
const firstRender = {
  tables_gzip: tablesSize.gzip,
  band1_words_gzip: band1.words_file.gzip,
  band1_locale_gzip_max: band1.locale_gzip_max,
  total_gzip_worst_locale: tablesSize.gzip + band1.words_file.gzip + band1.locale_gzip_max,
  line_kb: FIRST_RENDER_LINE_KB,
};
firstRender.within_line = firstRender.total_gzip_worst_locale <= FIRST_RENDER_LINE_KB * 1024;

const allWordsGz = bands.reduce((a, b) => a + b.words_file.gzip, 0);
const allLocalesGz = bands.reduce((a, b) => a + Object.values(b.locale_files).reduce((x, y) => x + y.gzip, 0), 0);
const perWord = { words_gzip: allWordsGz / headwords, all_locales_gzip: allLocalesGz / headwords, one_locale_gzip: allLocalesGz / headwords / Object.keys(band1.locale_files).length };

function dirBytes(dir) {
  let total = 0, files = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name); const s = statSync(p);
    if (s.isDirectory()) { const r = dirBytes(p); total += r.total; files += r.files; } else { total += s.size; files += 1; }
  }
  return { total, files };
}
const audio = dirBytes(join(PUB, 'audio'));
const audioManifest = JSON.parse(readFileSync(join(PUB, 'audio/manifest.json'), 'utf8'));
const levelTest = dirBytes(join(PUB, 'level-test'));
const dictionary = existsSync(join(PUB, 'dictionary')) ? dirBytes(join(PUB, 'dictionary')) : { total: 0, files: 0 };
const ltManifest = JSON.parse(readFileSync(join(PUB, 'level-test/manifest.json'), 'utf8'));
const bankFile = join(PUB, 'level-test', ltManifest.bank ?? readdirSync(join(PUB, 'level-test')).find((f) => f.startsWith('bank-')));
const bank = { raw: raw(bankFile), gzip: gz(bankFile) };

const factor = TARGET / headwords;
const projection = {
  target_words: TARGET, factor: +factor.toFixed(3),
  corpus_words_gzip: Math.round(allWordsGz * factor),
  corpus_one_locale_gzip: Math.round(allLocalesGz / Object.keys(band1.locale_files).length * factor),
  corpus_all_locales_gzip: Math.round(allLocalesGz * factor),
  audio_bytes: Math.round(audio.total * factor),
  audio_files: Math.round(audio.files * factor),
  level_test_bank_gzip: Math.round(bank.gzip * factor),
  first_render_gzip: firstRender.total_gzip_worst_locale,
  note: 'Linear in words for the corpus, audio and bank. The first-render figure is band 1 and does not grow with the corpus; it grows only if the generator enlarges band 1.',
};

const result = {
  _comment: 'GENERATED by scripts/content-scalability.mjs from apps/web/public. Bytes are gzip -6 of the file as served; "kb" fields are kB (1024).',
  generated_from: 'scripts/content-scalability.mjs',
  headwords,
  tables: tablesSize,
  bands,
  first_render: firstRender,
  totals: {
    corpus_files: readdirSync(corpusDir).length,
    corpus_words_gzip: allWordsGz,
    corpus_all_locales_gzip: allLocalesGz,
    per_word: { words_gzip: +perWord.words_gzip.toFixed(1), one_locale_gzip: +perWord.one_locale_gzip.toFixed(1), all_locales_gzip: +perWord.all_locales_gzip.toFixed(1) },
    audio: { bytes: audio.total, files: audio.files, manifest_entries: audioManifest.entries.length, bytes_per_word: Math.round(audio.total / headwords) },
    level_test: { bytes: levelTest.total, files: levelTest.files, bank_raw: bank.raw, bank_gzip: bank.gzip },
    dictionary: { bytes: dictionary.total, files: dictionary.files },
  },
  projection_to_target: projection,
  kb: {
    first_render_worst_locale: kb(firstRender.total_gzip_worst_locale),
    corpus_words: kb(allWordsGz), corpus_all_locales: kb(allLocalesGz),
    audio_mb: Math.round(audio.total / 1024 / 1024 * 10) / 10,
    projected_audio_mb: Math.round(projection.audio_bytes / 1024 / 1024 * 10) / 10,
    projected_corpus_all_locales: kb(projection.corpus_all_locales_gzip),
  },
};

const text = JSON.stringify(result, null, 1) + '\n';
if (CHECK) {
  const problems = [];
  if (!firstRender.within_line) problems.push(`first render ${kb(firstRender.total_gzip_worst_locale)} kB gzip exceeds the ${FIRST_RENDER_LINE_KB} kB line`);
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== text) problems.push(`${OUT} is stale — run npm run content:scalability`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`scalability current: ${headwords} words, first render ${kb(firstRender.total_gzip_worst_locale)} kB gzip (line ${FIRST_RENDER_LINE_KB} kB)`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${headwords} words; first render ${kb(firstRender.total_gzip_worst_locale)} kB gzip; corpus all locales ${kb(allLocalesGz)} kB; audio ${result.kb.audio_mb} MB; at ${TARGET}: corpus ${result.kb.projected_corpus_all_locales} kB, audio ${result.kb.projected_audio_mb} MB`);
  if (!firstRender.within_line) process.exit(1);
}
