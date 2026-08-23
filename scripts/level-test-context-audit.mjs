#!/usr/bin/env node
/**
 * Every contextual Level Test item, with all four options put into the blank.
 *
 *   node scripts/level-test-context-audit.mjs            human-readable
 *   node scripts/level-test-context-audit.mjs --json     the audit ledger
 *
 * ## Why this exists
 *
 * `leveltest:ambiguity` checks twelve structural rules and passes. It passed
 * while the bank contained ____ 목소리로 말했어요 keyed 힘찬 and offering 공손한
 * and 수줍은 — three sentences a Korean speaker would accept. A rule can say
 * "these two words are not recorded as synonyms"; it cannot say "both of these
 * sentences are things people say".
 *
 * So this does not judge. It *composes*: it writes out the sentence each of the
 * four options actually produces, so the judging can be done by reading rather
 * than by imagining. That is the whole difference between the audit that missed
 * these items and the one that found them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const LT = join(ROOT, 'apps', 'web', 'public', 'level-test');
const manifest = JSON.parse(readFileSync(join(LT, 'manifest.json'), 'utf8'));
const bank = JSON.parse(readFileSync(join(LT, manifest.bank), 'utf8'));
const items = bank.items ?? bank;

const anchors = JSON.parse(
  readFileSync(join(ROOT, 'content-cache', 'level-test-anchors.json'), 'utf8'),
).anchors;
const byWord = new Map(anchors.map((a) => [a.word, a]));

/** The word an option was conjugated from, where the bank recorded it. */
function lemmaOf(item, surface) {
  if (surface === item.answer) return item.lemma;
  return null;
}

const rows = items
  .filter((item) => item.kind === 'context')
  .map((item) => {
    const options = item.options ?? [];
    const anchor = byWord.get(item.lemma);
    return {
      id: item.id,
      level: item.level,
      lemma: item.lemma,
      senseId: item.senseId,
      pos: anchor?.pos ?? null,
      gloss: anchor?.gloss ?? null,
      form: item.form,
      prompt: item.prompt,
      answer: item.answer,
      distractors: options.filter((o) => o !== item.answer),
      sentences: options.map((option) => ({
        option,
        keyed: option === item.answer,
        lemma: lemmaOf(item, option),
        sentence: item.prompt.replace('____', option),
      })),
    };
  })
  .sort((a, b) => a.level - b.level || a.lemma.localeCompare(b.lemma));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ generated_from: manifest.bank, items: rows }, null, 2));
} else {
  for (const row of rows) {
    console.log(`\n[L${String(row.level).padStart(2)}] ${row.id}  ${row.lemma} (${row.pos ?? '?'}) — ${row.gloss ?? ''}`);
    console.log(`  frame: ${row.prompt}`);
    for (const s of row.sentences) {
      console.log(`   ${s.keyed ? '*' : ' '} ${s.sentence}`);
    }
  }
  console.log(`\n${rows.length} contextual item(s).`);
}
