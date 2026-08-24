#!/usr/bin/env node
/**
 * Reads the finished bank and tries to break its questions.
 *
 *   node scripts/level-test-ambiguity-qa.mjs           print the findings
 *   node scripts/level-test-ambiguity-qa.mjs --check   fail the build on any
 *
 * ## Why this exists separately from the builder
 *
 * The builder decides what to make; this decides what shipped. They are the
 * same rules read from opposite ends, and that is the point — a builder can
 * satisfy every rule it applies and still emit an item nobody wants, because
 * the rule it needed was the one nobody wrote. Reading the bank back means the
 * check is against the artefact rather than against the intention.
 *
 * ## What it looks for
 *
 * The brief's list (§9), in the order a reader of a bad question notices them:
 *
 * | | |
 * | --- | --- |
 * | a dictionary form in a slot that needs a conjugated one | 말씀하다 before 주세요 |
 * | options that do not all share an ending | the grammar gives the answer away |
 * | options of different parts of speech | a noun among three verbs is answerable without Korean |
 * | a distractor that means the same thing | two right answers |
 * | a distractor from the same semantic category | usually two right answers |
 * | a sentence with nothing to constrain the blank | 천천히 ____ 주세요 |
 * | a distractor that is a verb fitting any object | 연필을 사고 있어요 |
 * | another thing you can simply do, where the verb is 하다 | 친구와 낚시를 해요 |
 * | a distractor the dictionary calls a synonym or an antonym | 불을 켜 / 꺼 |
 * | the same sentence built for two different words | 둘에 셋을 더해요 / 곱해요 |
 * | an answer that appears elsewhere in its own sentence | the sentence answers itself |
 * | a duplicated option | three choices wearing four labels |
 *
 * ## What it cannot look for
 *
 * Whether a Korean speaker would call the sentence natural. Nothing here reads
 * Korean; it reads structure, and every rule above is a *proxy* for a
 * judgement. The judgement is a person's, and §9 asks for a rendered sample to
 * be read after this passes — which is why the last thing this prints is a
 * sample rather than a verdict.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conjugate, decompose, FINALS, finalOf, hasFinal, stemOf } from '../packages/korean-morphology/src/index.ts';
import { GENERAL_VERBS, isActivityNoun, isHadaFrame } from './lib/level-test-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANK_DIR = join(ROOT, 'apps', 'web', 'public', 'level-test');
const ANCHORS = join(ROOT, 'content-cache', 'level-test-anchors.json');
const CHECK = process.argv.includes('--check');

const manifest = JSON.parse(readFileSync(join(BANK_DIR, 'manifest.json'), 'utf8'));
const bank = JSON.parse(readFileSync(join(BANK_DIR, manifest.bank), 'utf8'));
const anchorList = JSON.parse(readFileSync(ANCHORS, 'utf8')).anchors;
const anchors = new Map(anchorList.map((anchor) => [anchor.id, anchor]));
const lemmas = new Set(anchorList.map((anchor) => anchor.word));
const related = new Map(
  Object.entries(
    JSON.parse(
      readFileSync(join(ROOT, 'apps', 'web', 'src', 'data', 'generated', 'relations.json'), 'utf8'),
    ).entries,
  ).map(([id, entry]) => [id, new Set([...(entry.synonyms ?? []), ...(entry.antonyms ?? [])])]),
);
const isRelated = (a, b) => Boolean(related.get(a)?.has(b) || related.get(b)?.has(a));

const findings = [];
function fail(item, rule, detail) {
  findings.push({
    id: item.id,
    level: item.level,
    rule,
    detail,
    prompt: item.prompt ?? item.promptId,
    options: item.options ?? item.optionIds ?? [],
  });
}

const ARGUMENT_PARTICLE = /[가-힣]{1,6}(을|를|에서|에|으로|로|와|과|랑)(\s|$)/;

/**
 * The ending every option must wear, given the form the blank needs.
 *
 * A first version of this compared the options' literal common suffix, and it
 * was wrong about thirty-six perfectly good items: 갈려, 낮춰, 살펴 and 틀어 are
 * all the 아/어 form, and they share no trailing character because Korean
 * contracts the ending *into* the last syllable. What matters is not that the
 * strings look alike but that they are all the same grammatical form, which is
 * what this table says out loud.
 */
const ENDING = {
  presentPolite: (form) => form.endsWith('요'),
  /*
   * The past is 어요 after a syllable carrying ㅆ, and the ㅆ is *inside* that
   * syllable rather than beside it: 찾아냈어요, 깼어요, 했어요. Written as a
   * regular expression over characters this was `[았었였]어요`, which is three
   * of the syllables it can be and misses 냈, 깼, 왔, 줬 and the rest — so it
   * reported thirty perfectly ordinary past tenses as the wrong form. The
   * decomposition knows; the spelling does not.
   */
  pastPolite: (form) => {
    if (!form.endsWith('어요')) return false;
    const marker = form[form.length - 3];
    return marker !== undefined && (decompose(marker)?.final ?? 0) === FINALS.indexOf('ㅆ');
  },
  futurePolite: (form) => form.endsWith(' 거예요'),
  formalPolite: (form) => form.endsWith('니다'),
  connective: (form) => form.endsWith('고'),
  honorific: (form) => form.endsWith('세요'),
  request: (form) => form.endsWith(' 주세요'),
  infinitive: (form) => !form.endsWith('요') && !form.endsWith('다'),
};

const seen = new Set();

for (const item of bank.items) {
  if (seen.has(item.id)) fail(item, 'duplicate-id', 'two items share an id');
  seen.add(item.id);

  /*
   * A meaning item carries ids rather than strings — its four options are four
   * meanings, and which language they are written in is the renderer's
   * business (§4). The three checks below are about the *shape* of a question,
   * so they apply either way; they just have to read the right field.
   *
   * Reading only `options` is how this file spent a build crashing on the
   * first meaning item instead of checking 3,960 of them.
   */
  const options = item.options ?? item.optionIds;
  const answer = item.answer ?? item.answerId;
  if (!options || !answer) {
    fail(item, 'shapeless', 'the item has neither options nor optionIds');
    continue;
  }
  if (options.length !== bank.options) {
    fail(item, 'option-count', `${options.length} options`);
  }
  if (new Set(options).size !== options.length) {
    fail(item, 'duplicate-option', 'the same option appears twice');
  }
  if (!options.includes(answer)) {
    fail(item, 'answer-missing', 'the answer is not among the options');
  }

  if (item.kind !== 'context') continue;

  // --- the sentence ----------------------------------------------------------
  if (!item.prompt.includes('____')) {
    fail(item, 'no-blank', 'a context item with nothing blanked');
    continue;
  }
  if (item.prompt.split('____').length !== 2) {
    fail(item, 'two-blanks', 'more than one blank');
  }
  const rest = item.prompt.replace('____', ' ');
  if (!ARGUMENT_PARTICLE.test(rest)) {
    fail(item, 'weak-context', 'nothing in the sentence constrains the blank');
  }
  if (item.prompt.trim().split(/\s+/).filter(Boolean).length < 3) {
    fail(item, 'short-context', 'fewer than three eojeol');
  }
  if (rest.includes(item.answer)) {
    fail(item, 'self-answering', 'the answer appears elsewhere in its own sentence');
  }

  // --- the options -----------------------------------------------------------
  const anchor = anchors.get(item.id.replace(/:context$/, ''));
  const inflects = item.form && item.form !== 'noun';

  if (inflects) {
    for (const option of item.options) {
      if (stemOf(option)) {
        fail(item, 'dictionary-form', `${option} is a dictionary form in a slot needing ${item.form}`);
      }
    }
    // Every option in the same form, so the grammar cannot give it away.
    const ending = ENDING[item.form];
    if (ending) {
      const wrong = item.options.filter((option) => !ending(option));
      if (wrong.length > 0) {
        fail(item, 'mixed-endings', `${wrong.join(', ')} are not in the ${item.form} form`);
      }
    }
  }

  if (!anchor) continue;
  for (const id of item.distractorIds ?? []) {
    const other = anchors.get(id);
    if (!other) continue;
    if (other.pos !== anchor.pos) {
      fail(item, 'mixed-parts-of-speech', `${other.word} is a ${other.pos}, the answer is a ${anchor.pos}`);
    }
    if (anchor.category && other.category === anchor.category) {
      fail(item, 'same-category', `${other.word} is also ${anchor.category}`);
    }
    if (other.senseId === anchor.senseId) {
      fail(item, 'same-sense', `${other.word} teaches the same sense`);
    }
    if (isRelated(anchor.id, other.id)) {
      fail(item, 'related-option', `${other.word} is a recorded synonym or antonym of ${anchor.word}`);
    }
    if (inflects && GENERAL_VERBS.has(other.word)) {
      fail(item, 'general-verb', `${other.word} fits any object, so the sentence cannot rule it out`);
    }
    if (!inflects && isHadaFrame(item.prompt) && isActivityNoun(other.word, lemmas)) {
      fail(item, 'activity-noun', `${other.word}하다 is a thing you can do, and the verb here is 하다`);
    }
    if (inflects) {
      const expected = conjugate(other.word, item.form, { partOfSpeech: other.pos });
      if (expected && !item.options.includes(expected)) {
        fail(item, 'wrong-conjugation', `${other.word} should appear as ${expected}`);
      }
    }
  }
}

const contexts = bank.items.filter((item) => item.kind === 'context');

/*
 * The particle the sentence already carries has to fit all four options.
 *
 * A contextual sentence is authored with its particle attached — ____는 회사에
 * 가요 — and the options are bare words dropped into the gap. A distractor
 * ending in a consonant therefore landed in front of 는 and produced 거짓말는,
 * and 197 composed sentences across 113 of 475 items read like that.
 *
 * None was ever the keyed answer, which is the part that matters: a quarter of
 * the contextual bank could be answered by picking the option whose particle
 * agreed, without reading the sentence or knowing one word of Korean. A gate
 * that reads only the keyed sentence cannot see this, which is why this one
 * composes all four.
 */
const PARTICLE_PAIRS = [
  ['은', '는'], ['이', '가'], ['을', '를'], ['과', '와'], ['으로', '로'],
  ['이나', '나'], ['이랑', '랑'], ['아', '야'], ['이에요', '예요'],
];
for (const item of contexts) {
  const at = item.prompt.indexOf('____');
  if (at < 0) continue;
  const after = item.prompt.slice(at + 4);
  for (const [consonantForm, vowelForm] of PARTICLE_PAIRS) {
    const takesC = after.startsWith(consonantForm);
    const takesV = after.startsWith(vowelForm);
    if (!takesC && !takesV) continue;
    const attached =
      takesC && (!takesV || consonantForm.length >= vowelForm.length) ? consonantForm : vowelForm;
    for (const option of item.options ?? []) {
      const last = option[option.length - 1];
      if (!last || !/[가-힣]/.test(last)) continue;
      const wants =
        consonantForm === '으로' && finalOf(last) === 'ㄹ'
          ? vowelForm
          : hasFinal(last)
            ? consonantForm
            : vowelForm;
      if (wants !== attached) {
        fail(
          item,
          'particle-mismatch',
          `${option}${attached} — ${option} takes ${wants}, so this option is ` +
            'ungrammatical and the answer can be found without reading the sentence',
        );
      }
    }
    break;
  }
}

/*
 * Two words with the same sentence. Each item is answerable alone — the other
 * word is not among its four options — but the bank is its own proof that the
 * sentence does not pin the meaning down, which is the whole requirement.
 */
const byPrompt = new Map();
for (const item of contexts) {
  if (!byPrompt.has(item.prompt)) byPrompt.set(item.prompt, []);
  byPrompt.get(item.prompt).push(item);
}
for (const [, group] of byPrompt) {
  if (group.length < 2) continue;
  for (const item of group) {
    fail(item, 'shared-prompt', `the same sentence also asks for ${group
      .filter((other) => other !== item)
      .map((other) => other.answer)
      .join(', ')}`);
  }
}

/*
 * The six item states that were photographed, kept as fixtures.
 *
 * Each was reported from a screenshot of the running product, and each is a
 * class rather than an instance — the bank is regenerated with a different
 * distractor draw every build, so pinning the exact four options would pin
 * nothing. What is pinned is the frame: a sentence that cannot have one answer,
 * or an option that must never be offered at all.
 */
/**
 * Person nouns, from the file the builder classifies by.
 *
 * Read rather than listed, so that adding 남자 or 아이 to the classes cannot
 * reopen the hole that closing 여자 shut. See `content/vocabulary/noun-classes.json`.
 */
const PERSON_NOUNS = new Set(
  Object.entries(JSON.parse(readFileSync(join(ROOT, 'content/vocabulary/noun-classes.json'), 'utf8')).classes)
    .filter(([, classes]) => classes.includes('person'))
    .map(([word]) => word),
);

const REGRESSIONS = [
  {
    name: '힘찬 / 활기찬',
    why: '두 형용사 모두 목소리를 자연스럽게 꾸민다 — the frame chooses neither',
    hit: (item) => item.prompt?.includes('목소리로 말했어요') && item.kind === 'context',
  },
  {
    name: '제 이름을 ____?',
    why: 'an honorific -세요 with a question mark: request or question, unclear',
    hit: (item) => item.prompt === '제 이름을 ____?',
  },
  {
    name: '____는 회사에 가요',
    why: 'every person noun in the language fits, and the particle is fixed',
    hit: (item) => item.prompt === '____는 회사에 가요.',
  },
  {
    name: '저를 친구로 ____',
    why: 'no subject and no context — grammatical, and not a sentence anybody says',
    hit: (item) => item.prompt === '저를 친구로 ____.',
  },
  {
    name: '보지 as an option',
    why: 'read as a crude anatomical term whatever the dictionary filed it under',
    hit: (item) => (item.options ?? []).includes('보지'),
  },
  {
    name: '여자를 타요',
    why: 'innocent words, and a sentence this product may never compose',
    hit: (item) =>
      item.kind === 'context' &&
      (item.options ?? []).some((o) => item.prompt.replace('____', o).includes('여자를 타')),
  },
  {
    name: '____을 안 마셔요 with 여자',
    why: 'a person in the object slot of 마시다 — the same defect as 여자를 타요, on the daily screen',
    hit: (item) =>
      item.kind === 'context' &&
      /안 마셔요|마시지 않아요/.test(item.prompt) &&
      (item.options ?? []).some((o) => PERSON_NOUNS.has(o)),
  },
  {
    name: '____가 있어요',
    why: 'a frame with nothing in it but a particle: every noun in the language is an answer',
    hit: (item) =>
      item.kind === 'context' && /^_{4}(이|가|은|는|을|를)\s*(있어요|없어요|이에요|예요)[.?!]?$/.test(item.prompt),
  },
  {
    name: '끝없다 beside 끝없다',
    why: 'the answer is printed in the prompt it answers, so reading the sentence gives it away',
    hit: (item) =>
      item.kind === 'context' &&
      (item.options ?? []).some((o) => {
        const stem = o.endsWith('다') && o.length > 1 ? o.slice(0, -1) : o;
        return stem.length >= 2 && item.prompt.replace('____', '').includes(stem);
      }),
  },
];
for (const regression of REGRESSIONS) {
  for (const item of bank.items) {
    if (regression.hit(item)) {
      fail(item, 'photographed-regression', `${regression.name} — ${regression.why}`);
    }
  }
}

console.log(
  `Level test items — ${bank.items.length.toLocaleString('en')} in the bank, ` +
    `${contexts.length.toLocaleString('en')} of them contextual\n`,
);

const byRule = new Map();
for (const finding of findings) byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
if (byRule.size === 0) {
  console.log('  no item breaks any of the thirteen rules.');
} else {
  for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${rule}`);
  }
  console.log('');
  for (const finding of findings.slice(0, 20)) {
    console.log(`  ${finding.rule} — ${finding.id} (level ${finding.level})`);
    console.log(`     ${finding.prompt}`);
    console.log(`     ${finding.options.join(' · ')}`);
    console.log(`     ${finding.detail}`);
  }
}

/*
 * The sample, printed because the check cannot conclude without it.
 *
 * Ten items, evenly spread through the levels rather than random, so that
 * running this twice shows the same ten and a person reading them is reading a
 * stable sample rather than a new lottery.
 */
console.log('\n  a spread of what shipped, for a person to read:\n');
const step = Math.max(1, Math.floor(contexts.length / 10));
for (let i = 0; i < contexts.length && i / step < 10; i += step) {
  const item = contexts[i];
  console.log(`    L${String(item.level).padStart(2)}  ${item.prompt}`);
  console.log(`         ${item.options.join(' · ')}   → ${item.answer}`);
}

if (findings.length > 0) {
  console.error(`\n${findings.length} finding(s).`);
  process.exit(CHECK ? 1 : 0);
}
console.log('\nevery contextual item has one conjugated answer and three that are not it.');
