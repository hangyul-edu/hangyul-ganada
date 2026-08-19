#!/usr/bin/env node
/**
 * Exports the curriculum from the web app's TypeScript source into JSON the API
 * serves.
 *
 *   node scripts/export-curriculum.mjs           write the JSON
 *   node scripts/export-curriculum.mjs --check   fail if the JSON is stale
 *
 * The curriculum is authored once, in `apps/web/src/data`, because that is
 * where it is edited and reviewed. Hand-maintaining a second Python copy would
 * guarantee the two drift, and a learner would eventually be graded against a
 * character the API had never heard of. `--check` runs in `npm run verify`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(root, 'content', 'curriculum.json');

const [{ ALL_CHARACTERS, LETTER_LESSONS, CURRICULUM_UNITS }, { PRACTICE_FONTS }, vocabulary] =
  await Promise.all([
    import(join(root, 'apps/web/src/data/characters.ts')),
    import(join(root, 'apps/web/src/data/fonts.ts')),
    import(join(root, 'apps/web/src/data/vocabulary.ts')),
  ]);

/**
 * Puts the per-locale word copy back onto each word.
 *
 * The app deliberately does not carry it — a learner reads one language and
 * should not download eight (see `apps/web/src/data/wordCopy.ts`). The API has
 * the opposite job: one request may be answered in any language, and it is a
 * server with no download budget. So the split that is right for the client is
 * undone here, from the same generated files the client loads.
 */
function withTranslations(words) {
  const generatedDir = join(root, 'apps/web/src/data/generated');
  const locales = JSON.parse(readFileSync(join(generatedDir, 'vocabulary.json'), 'utf8')).locales;
  const packs = locales.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(generatedDir, `vocabulary.${locale}.json`), 'utf8')).words,
  ]);
  return words.map((word, index) => {
    const translations = {};
    for (const [locale, rows] of packs) {
      const row = rows[index];
      if (!row) continue;
      translations[locale] = {
        meaning: row[0],
        definition: row[2],
        example_translation: row[1],
      };
    }
    return { ...word, translations };
  });
}

const payload = {
  _comment:
    'GENERATED from apps/web/src/data by scripts/export-curriculum.mjs. Do not edit; run `npm run curriculum:build`.',
  characters: ALL_CHARACTERS,
  letter_lessons: LETTER_LESSONS,
  curriculum_units: CURRICULUM_UNITS,
  fonts: PRACTICE_FONTS,
  words: withTranslations(vocabulary.VOCABULARY),
  vocabulary_lessons: vocabulary.VOCABULARY_LESSONS,
  vocabulary_levels: vocabulary.CURRICULUM_LEVELS,
  vocabulary_provenance: {
    ...vocabulary.VOCABULARY_PROVENANCE,
    sources: vocabulary.CONTENT_SOURCES,
  },
};

// Minified on purpose. It is a generated artefact nobody reads by hand, and at
// nearly three thousand words with per-field provenance the pretty-printed
// version is several megabytes of whitespace in every diff.
const json = `${JSON.stringify(payload)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  if (current !== json) {
    console.error('curriculum.json is out of date — run `npm run curriculum:build`');
    process.exit(1);
  }
  console.log('curriculum.json is up to date');
} else {
  writeFileSync(OUT, json);
  console.log(
    `wrote ${OUT} (${payload.characters.length} characters, ${payload.words.length} words)`,
  );
}
