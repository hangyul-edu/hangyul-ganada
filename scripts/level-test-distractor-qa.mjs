#!/usr/bin/env node
/**
 * Are the *wrong* answers worth reading?
 *
 *   npm run leveltest:distractors
 *   npm run leveltest:distractors -- --check   fail the build on any finding
 *
 * ## Why this exists beside `leveltest:ambiguity`
 *
 * Every gate this repository had over the question bank asked one question in
 * different words: **is there a second right answer?** Twenty-seven structural
 * rules, nine photographed regressions, eight frame fixtures. They were right
 * to ask it and they got the bank to a place where they pass.
 *
 * Nothing asked the other half. A four-option question fails in two directions
 * and only one of them had a gate:
 *
 * | | |
 * | --- | --- |
 * | a distractor that is *also* right | the item has two answers — covered |
 * | a distractor that is *obviously* wrong | the item has no wrong answers worth reading — not covered |
 *
 * A reader photographed the second one:
 *
 * ```
 * 창문으로 아침 ____이 들어와요.
 * 목적 · 비빔밥 · 빛 · 환경
 * ```
 *
 * A purpose, a bibimbap and an environment do not come in through a window. A
 * learner who has never met 빛 answers it correctly by elimination, and a
 * learner who knows 빛 learns nothing from being right. Every gate was green,
 * and every gate was right to be: the item has exactly one defensible answer.
 *
 * It was not a bad draw. The builder's rule said a distractor may not come from
 * the answer's own subject area — written to stop the *first* failure — and the
 * further apart two words are, the more certainly they satisfy it. **All 625
 * contextual items in that bank had every distractor from a different category
 * than the answer.** The rule was selecting for absurdity, at scale.
 *
 * ## What this checks
 *
 * Read off the shipped bank, not off the builder's intention:
 *
 * | | |
 * | --- | --- |
 * | `implausibleDistractor` | a noun option from outside the answer's subject area |
 * | `bareModifier` | the blank modifies the noun behind it — `____ 가방을 샀어요` |
 * | `openTimeSlot` | a time noun in a 에 slot — every time is right |
 * | `openDestination` | a place in a 에 slot under 가다 — every place is right |
 * | `openExistential` | a subject slot under 있다/생기다/나오다 — everything is right |
 * | `openGeneralObject` | a general verb whose only argument is the blank |
 * | `reviewedOut` | an item a person read and refused |
 * | `duplicateOption` | two options that normalise to one string |
 *
 * ## Negative fixtures
 *
 * `content/vocabulary/context-negative-fixtures.json` holds eight items that
 * shipped or nearly shipped. Each is run through the same checks and **must**
 * produce its named finding; a fixture that passes fails this gate, because a
 * rule that cannot fail is not a rule. The corrected forms are run too and must
 * come back clean.
 *
 * ## What it cannot check
 *
 * Whether a plausible distractor is *also* a right answer. Nothing here reads
 * Korean. `leveltest:ambiguity` covers the classes a program can see and the
 * residue is a person's judgement, recorded in
 * the `ctx: 0` / `ctxWhy` pair in `content/vocabulary/entries/*.jsonl` — 54
 * items read and refused at the time of writing. See
 * `docs/CONTENT_QUALITY_STANDARD.md`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const read = (...parts) => JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));

const manifest = read('apps', 'web', 'public', 'level-test', 'manifest.json');
const bank = read('apps', 'web', 'public', 'level-test', manifest.bank);
const cloze = read('apps', 'web', 'src', 'data', 'generated', 'cloze.json').words;
const anchors = read('content-cache', 'level-test-anchors.json').anchors;
/*
 * The words a person read and refused as gap-fills.
 *
 * Read off the *shipped corpus*, not off an editorial file: `ctx: 0` in the
 * entry sets `noContext` on the word, which is the one flag the builder
 * consults. An earlier draft of this gate kept a second list in
 * `content/vocabulary/context-blocklist.json` and it was the same fault this
 * repository keeps finding — two records of one decision, free to disagree.
 * The reason lives beside the flag, in the entry's `ctxWhy`.
 */
const refused = new Set(
  read('apps', 'web', 'src', 'data', 'generated', 'vocabulary.json')
    .words.filter((word) => word.noContext)
    .map((word) => word.id),
);
const fixtures = read('content', 'vocabulary', 'context-negative-fixtures.json');

const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));

/** Verbs of going, of existing and of doing-anything. Kept in step with the builder by the fixtures. */
const DESTINATION = new Set(['가다', '오다', '다니다', '들어가다', '들어오다', '나가다', '나오다']);
const EXISTENTIAL = new Set(['있다', '없다', '많다', '적다', '생기다', '나오다', '나다', '보이다', '들리다']);
const GENERAL = new Set([
  '하다', '되다', '있다', '없다', '보다', '주다', '받다', '사다', '팔다', '가지다',
  '만들다', '열다', '닫다', '좋아하다', '싫어하다', '쓰다', '내다', '두다', '넣다', '알다',
]);

/**
 * The lemma of the sentence's final predicate.
 *
 * `leveltest:ambiguity` and the builder both call
 * `@hangyul-ganada/korean-morphology`. This deliberately does not: a gate that
 * reuses the code under test agrees with it by construction, and the point of
 * reading the artefact back is to disagree when it should.
 *
 * So the reduction is a table, and it only has to cover the twenty-odd verbs
 * the frame rules below actually name. A surface it does not know reduces to
 * nothing and the frame rules simply do not fire — which is the safe direction:
 * this gate reports what it is sure of. The fixtures prove each listed verb is
 * reached from the surface the bank uses.
 */
const SURFACES = new Map();
for (const [lemma, forms] of Object.entries({
  가다: ['가요', '가', '갔어요', '가서', '갑니다'],
  오다: ['와요', '와', '왔어요', '와서', '옵니다'],
  다니다: ['다녀요', '다녔어요'],
  들어가다: ['들어가요', '들어갔어요'],
  들어오다: ['들어와요', '들어왔어요'],
  나가다: ['나가요', '나갔어요'],
  나오다: ['나와요', '나왔어요'],
  있다: ['있어요', '있었어요', '있습니다'],
  없다: ['없어요', '없었어요'],
  많다: ['많아요', '많았어요'],
  적다: ['적어요'],
  생기다: ['생겨요', '생겼어요'],
  나다: ['나요', '났어요'],
  보이다: ['보여요', '보였어요'],
  들리다: ['들려요', '들렸어요'],
  하다: ['해요', '했어요'],
  되다: ['돼요', '됐어요'],
  보다: ['봐요', '봤어요', '봐'],
  주다: ['줘요', '줬어요'],
  받다: ['받아요', '받았어요'],
  사다: ['사요', '샀어요'],
  팔다: ['팔아요', '팔았어요'],
  가지다: ['가져요', '가졌어요'],
  만들다: ['만들어요', '만들었어요'],
  열다: ['열어요', '열었어요'],
  닫다: ['닫아요', '닫았어요'],
  좋아하다: ['좋아해요', '좋아했어요'],
  싫어하다: ['싫어해요', '싫어했어요'],
  쓰다: ['써요', '썼어요'],
  내다: ['내요', '냈어요'],
  두다: ['둬요', '두었어요', '뒀어요'],
  넣다: ['넣어요', '넣었어요'],
  알다: ['알아요', '알았어요'],
})) {
  for (const form of forms) SURFACES.set(form, lemma);
}

function predicateOf(sentence) {
  const eojeol = String(sentence).replace(/[.?!…]+$/u, '').trim().split(/\s+/).filter(Boolean);
  const last = eojeol[eojeol.length - 1] ?? '';
  // `____을 열어 봤어요` — 봤어요 is the auxiliary and 열어 carries the meaning.
  if (/^(봤어요|봐요|주세요|드세요|두세요|버렸어요|봤어)$/.test(last) && eojeol.length > 1) {
    const meaning = eojeol[eojeol.length - 2];
    return SURFACES.get(meaning) ?? null;
  }
  return SURFACES.get(last) ?? null;
}

const normalise = (text) => String(text).normalize('NFC').replace(/[\s\p{P}]/gu, '').toLowerCase();

const findings = [];
function check(item, { source }) {
  const out = [];
  const anchorId = String(item.answerId ?? item.id ?? '').replace(/:context$/, '');
  const anchor = byId.get(anchorId);
  const prompt = String(item.prompt ?? '');
  const at = prompt.indexOf('____');
  const after = at < 0 ? '' : prompt.slice(at + 4);
  const options = item.options ?? [];
  const isNoun = anchor ? anchor.pos === 'noun' : item.pos === 'noun';

  // `ctx: 0` refuses the *card* sentence as a gap-fill. A curated item is a
  // sentence written for the question, read on its own terms.
  if (refused.has(anchorId) && !item.curated) out.push(['reviewedOut', `${anchorId} carries ctx: 0 — read and refused`]);

  const seen = new Map();
  for (const option of options) {
    const key = normalise(option);
    if (!key) out.push(['duplicateOption', 'an empty option']);
    if (seen.has(key)) out.push(['duplicateOption', `${seen.get(key)} and ${option} normalise to one option`]);
    seen.set(key, option);
  }

  if (isNoun) {
    if (/^\s+[가-힣]/.test(after)) out.push(['bareModifier', `the blank modifies "${after.trim().split(/\s+/)[0]}"`]);
    if (anchor?.category === 'time-numbers' && /^에(\s|$)/.test(after)) {
      out.push(['openTimeSlot', 'a time noun in a 에 slot']);
    }
    const verb = predicateOf(prompt);
    // A surface the table does not know: report nothing rather than guess.
    if (verb && DESTINATION.has(verb) && /^에(\s|$)/.test(after)) out.push(['openDestination', `every place fits ${verb}`]);
    if (verb && EXISTENTIAL.has(verb) && /^(이|가|은|는)(\s|$)/.test(after)) {
      out.push(['openExistential', `every noun fits ${verb}`]);
    }
    if (verb && GENERAL.has(verb) && /^(을|를)(\s|$)/.test(after)) {
      /*
       * Only 을/를/에/에서 count as the *other* argument.
       *
       * 으로 and 로 were in this list and 새로 — an adverb — matched it as
       * 새 + 로, so `____을 새로 샀어요` reported an argument it does not have
       * and the rule did not fire. 서로, 따로 and 함부로 have the same shape.
       */
      const args = [...prompt.matchAll(/([가-힣]{1,6})(을|를|에서|에)(\s|$)/g)].map((m) => m[1]);
      if (args.length === 0) out.push(['openGeneralObject', `${verb} takes any object and nothing else is said`]);
    }
    // The plausibility rule, which is the reason this file exists.
    const family = new Set([anchor?.category, ...(anchor?.category_tags ?? [])].filter(Boolean));
    if (family.size > 0) {
      for (const id of item.distractorIds ?? []) {
        const other = byId.get(id);
        if (!other) continue;
        const theirs = [other.category, ...(other.category_tags ?? [])].filter(Boolean);
        if (!theirs.some((tag) => family.has(tag))) {
          out.push([
            'implausibleDistractor',
            `${other.word} (${other.category}) against ${anchor.word} (${anchor.category})`,
          ]);
        }
      }
    }
  }

  for (const [kind, detail] of out) findings.push({ source, kind, detail, prompt, answer: item.answer });
  return out;
}

const contextual = bank.items.filter((item) => item.kind === 'context');
for (const item of contextual) check({ ...item, answerId: item.id.replace(/:context$/, '') }, { source: 'bank' });
for (const [id, entry] of Object.entries(cloze)) {
  check(
    {
      answerId: id,
      prompt: `${entry.before}____${entry.after}`,
      answer: entry.target,
      options: entry.options.map((option) => option.surface),
      distractorIds: entry.options.map((option) => option.id).filter((optionId) => optionId !== id),
      form: entry.form,
      curated: entry.curated === true,
    },
    { source: 'cloze' },
  );
}

/* The fixtures, which must fail. */
const fixtureFailures = [];
for (const fixture of fixtures.fixtures) {
  const before = findings.length;
  const kinds = check(fixture.item, { source: `fixture ${fixture.id}` }).map(([kind]) => kind);
  findings.length = before; // a fixture finding is expected, so it is not a finding
  if (!kinds.includes(fixture.expect)) {
    fixtureFailures.push(
      `${fixture.id} expected ${fixture.expect} and got ${kinds.length ? kinds.join(', ') : 'nothing'}`,
    );
  }
}
for (const fixed of fixtures.fixed) {
  if (!fixed.item) continue;
  const before = findings.length;
  const kinds = check(fixed.item, { source: `fixture ${fixed.id}` }).map(([kind]) => kind);
  findings.length = before;
  if (kinds.length > 0) fixtureFailures.push(`${fixed.id} should pass and reported ${kinds.join(', ')}`);
}

const byKind = new Map();
for (const finding of findings) byKind.set(finding.kind, [...(byKind.get(finding.kind) ?? []), finding]);

console.log(`Distractor quality — ${contextual.length} contextual items, ${Object.keys(cloze).length} gap-fills`);
console.log(`  negative fixtures ${fixtures.fixtures.length}, corrected forms ${fixtures.fixed.filter((f) => f.item).length}`);
if (byKind.size === 0) {
  console.log('\n  no findings');
} else {
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${kind} — ${list.length}`);
    for (const finding of list.slice(0, 8)) {
      console.log(`    ${finding.prompt}  ▶${finding.answer}   ${finding.detail}`);
    }
    if (list.length > 8) console.log(`    … and ${list.length - 8} more`);
  }
}
if (fixtureFailures.length > 0) {
  console.log('\n  negative fixtures that did not fail:');
  for (const line of fixtureFailures) console.log(`    ${line}`);
}

if (CHECK && (findings.length > 0 || fixtureFailures.length > 0)) {
  console.error(`\n${findings.length} finding(s), ${fixtureFailures.length} fixture failure(s)`);
  process.exit(1);
}
