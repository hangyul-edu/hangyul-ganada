#!/usr/bin/env node
/**
 * Lists everything the app can pronounce, for the audio build to generate.
 *
 *   npm run audio:plan
 *
 * The curriculum is authored in TypeScript and the audio pipeline is Python, so
 * one of them has to tell the other what to say. This is that seam, and it runs
 * in the direction that keeps the curriculum the source of truth: a letter
 * added to `characters.ts` appears in the next plan without anyone editing a
 * Python list.
 *
 * Each entry carries the exact text to speak and the id the app will look it up
 * by. Ids are ASCII and derived from codepoints — Korean in a filename survives
 * a POSIX filesystem and then breaks on a zip round-trip or an Android asset
 * packer, and the symptom is audio that is randomly missing for some words.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadCorpusForNode } from './lib/corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT_DIR = join(root, 'content-cache');
const OUT = join(OUT_DIR, 'speech-plan.json');

// The corpus is fetched, not imported. See `scripts/lib/corpus.mjs`.
await loadCorpusForNode();

const [{ ALL_CHARACTERS }, vocabulary, numbers] = await Promise.all([
  import(join(root, 'apps/web/src/data/characters.ts')),
  import(join(root, 'apps/web/src/data/vocabulary.ts')),
  import(join(root, 'apps/web/src/data/numbers.ts')),
]);

/** id → { text, kind }. A Map because two letters legitimately share a clip. */
const plan = new Map();

function add(id, text, kind) {
  if (!id || !text) return;
  const existing = plan.get(id);
  if (existing && existing.text !== text) {
    throw new Error(`speech id ${id} used for both "${existing.text}" and "${text}"`);
  }
  plan.set(id, { id, text, kind });
}

for (const character of ALL_CHARACTERS) {
  // ㄱ is *named* 기역 and *sounds* like the g in 가. Two clips, because a
  // learner sounding out a syllable needs the second one and reading the bare
  // codepoint aloud gives them the first.
  if (character.audio.name && character.letter_name) {
    add(character.audio.name, character.letter_name, 'letter_name');
  }
  if (character.audio.sound && character.sound_example) {
    add(
      character.audio.sound,
      character.sound_example,
      character.group === 'syllable' || character.group === 'final_consonant'
        ? 'syllable'
        : 'letter_sound',
    );
  }
}

/*
 * The voice-picker sample.
 *
 * Settings compares the two voices on the same words, so the clip has to exist
 * independently of whether 안녕하세요 happens to be in the vocabulary this
 * build produced. One fixed id, generated like everything else.
 */
add('sample_greeting', '안녕하세요', 'sentence');

for (const word of vocabulary.VOCABULARY) {
  if (word.audio?.word) add(word.audio.word, word.word, 'word');
  if (word.audio?.example && word.example) add(word.audio.example, word.example, 'sentence');
}

/*
 * The Numbers curriculum: every item's Korean, and every worked example.
 *
 * Ids follow the same codepoint rule as words and sentences, so 일 as a Sino
 * numeral and 일 as a vocabulary entry are one recording, and a phrase such as
 * 두 시 반 gets a clip of its own. A number lesson promises audio for what it
 * shows; a speaker button with no clip behind it is a promise the app breaks
 * silently, and `numbers:qa` fails on any item whose id is absent from the
 * manifest.
 */
for (const item of numbers.NUMBER_ITEMS) {
  // The spelling, not `reading`: the TTS engine applies 심뉵 and 여덜 itself, and
  // 여덟 the numeral shares its clip with 여덟 the vocabulary word.
  add(item.audio.word, item.korean, item.korean.includes(' ') ? 'sentence' : 'word');
  if (item.example && item.audio.example) {
    // Examples that show a right and a wrong form side by side are read as the
    // right form only: the app never voices the mistake.
    add(item.audio.example, numbers.spokenExample(item), 'sentence');
  }
}

const entries = [...plan.values()].sort((a, b) => a.id.localeCompare(b.id));

const counts = entries.reduce((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ entries }, null, 1)}\n`);
console.log(`wrote ${OUT}: ${entries.length} clips ×2 voices`);
console.log(
  Object.entries(counts)
    .map(([kind, n]) => `  ${kind}: ${n}`)
    .join('\n'),
);
