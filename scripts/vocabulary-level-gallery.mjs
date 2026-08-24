#!/usr/bin/env node
/**
 * Every level, written out for a person to read.
 *
 *   npm run vocabulary:level:gallery
 *
 * ## Why a file rather than a chart
 *
 * The level model can be validated two ways and only one of them is worth
 * anything. A chart of median difficulty per level rises smoothly whatever the
 * words are; reading level 30 and finding 엄마 in it takes four seconds. §23 of
 * the brief asks for at least fifty words read per level, which is 1,500
 * judgements, and the only way to make that possible is to put them somewhere
 * a person can actually read them.
 *
 * `docs/level-galleries/` gets one Markdown file per level. Each carries the
 * whole level when it is short and a representative sample when it is not: the
 * easiest ten, the median ten, the hardest ten and twenty spread evenly through
 * the rest — the four views that between them catch a mis-levelled word,
 * because a mistake is nearly always at an edge or in the tail.
 *
 * Each row shows the four components behind the score, so a word that looks
 * wrong can be traced to the term that put it there without opening a debugger.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'level-galleries');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const built = read('apps/web/src/data/generated/vocabulary.json');
const english = read('apps/web/src/data/generated/vocabulary.en.json').words;
const overrides = read('content/vocabulary/level-overrides.json').words ?? {};

const WEIGHTS = { frequency: 0.34, utility: 0.26, linguistic: 0.22, semantic: 0.18 };
const scoreOf = (w) =>
  WEIGHTS.frequency * w.lv[0] + WEIGHTS.utility * w.lv[1] +
  WEIGHTS.linguistic * w.lv[2] + WEIGHTS.semantic * w.lv[3];

const rows = built.words.map((w, i) => ({
  word: w.word,
  level: w.level,
  pos: w.part_of_speech,
  rank: w.f?.[1] ?? null,
  score: scoreOf(w),
  lv: w.lv,
  example: w.example,
  gloss: english[i]?.[0] ?? '',
  override: overrides[w.word]?.why ?? null,
}));

const byLevel = new Map();
for (const row of rows) {
  if (!byLevel.has(row.level)) byLevel.set(row.level, []);
  byLevel.get(row.level).push(row);
}

/** Easiest ten, median ten, hardest ten, then twenty spread through the rest. */
function sample(list) {
  const sorted = [...list].sort((a, b) => a.score - b.score);
  if (sorted.length <= 50) return sorted.map((row) => ({ ...row, band: 'all' }));
  const mid = Math.floor(sorted.length / 2);
  const picked = new Map();
  const take = (items, band) => {
    for (const item of items) if (!picked.has(item.word)) picked.set(item.word, { ...item, band });
  };
  take(sorted.slice(0, 10), 'easiest');
  take(sorted.slice(mid - 5, mid + 5), 'median');
  take(sorted.slice(-10), 'hardest');
  const step = Math.max(1, Math.floor(sorted.length / 20));
  take(sorted.filter((_, i) => i % step === 0).slice(0, 20), 'spread');
  return [...picked.values()].sort((a, b) => a.score - b.score);
}

mkdirSync(OUT, { recursive: true });
const summary = [];
for (let level = 1; level <= 30; level += 1) {
  const all = byLevel.get(level) ?? [];
  const shown = sample(all);
  const pos = {};
  for (const row of all) pos[row.pos] = (pos[row.pos] ?? 0) + 1;
  const ranks = all.map((r) => r.rank).filter((r) => r !== null).sort((a, b) => a - b);
  const median = ranks.length ? ranks[Math.floor(ranks.length / 2)] : null;

  const lines = [
    `# Vocabulary level ${level}`,
    '',
    `${all.length} words. ${shown.length} shown: the easiest ten, the middle ten, the`,
    'hardest ten, and twenty spread evenly through the rest.',
    '',
    `Parts of speech: ${Object.entries(pos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}.`,
    `Median frequency rank: ${median ?? 'unobserved'}.`,
    '',
    'The four columns after the score are the components it is made of —',
    'frequency, learner utility, linguistic complexity, semantic complexity.',
    'A word that looks wrong here can be traced to whichever of them is large.',
    '',
    '| | word | pos | gloss | rank | score | freq | util | ling | sem | example |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...shown.map(
      (r) =>
        `| ${r.band} | **${r.word}**${r.override ? ' ¹' : ''} | ${r.pos} | ${r.gloss} | ` +
        `${r.rank ?? '—'} | ${r.score.toFixed(3)} | ${r.lv[0].toFixed(2)} | ${r.lv[1].toFixed(2)} | ` +
        `${r.lv[2].toFixed(2)} | ${r.lv[3].toFixed(2)} | ${r.example} |`,
    ),
  ];
  const moved = shown.filter((r) => r.override);
  if (moved.length) {
    lines.push('', '¹ moved by hand:', '');
    for (const row of moved) lines.push(`* **${row.word}** — ${row.override}`);
  }
  writeFileSync(join(OUT, `level-${String(level).padStart(2, '0')}.md`), `${lines.join('\n')}\n`);
  summary.push({ level, count: all.length, median, shown: shown.length });
}

writeFileSync(
  join(OUT, 'README.md'),
  [
    '# Level galleries',
    '',
    'One file per level, written by `npm run vocabulary:level:gallery`. They exist',
    'to be read: a statistic says the median difficulty rises, and only reading the',
    'words says whether level 30 is advanced Korean or a shelf of things nobody',
    'has clicked yet.',
    '',
    '| level | words | shown | median rank |',
    '| ---: | ---: | ---: | ---: |',
    ...summary.map((s) => `| ${s.level} | ${s.count} | ${s.shown} | ${s.median ?? '—'} |`),
    '',
  ].join('\n') + '\n',
);
console.log(`wrote ${summary.length} galleries to docs/level-galleries`);
console.log(`  ${summary.reduce((n, s) => n + s.shown, 0)} words written out for review`);
