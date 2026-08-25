#!/usr/bin/env node
/**
 * Every verb and adjective in the curriculum, conjugated and checked.
 *
 *   node scripts/conjugation-qa.mjs           print the table
 *   node scripts/conjugation-qa.mjs --check   fail the build on a disagreement
 *
 * ## Why a sweep and not only a unit test
 *
 * `packages/korean-morphology` has a hand-written regression table of sixty
 * words, and a table is only as good as the person who wrote it. This checks
 * the other 1,246 — against data nobody wrote for this purpose.
 *
 * The editorial pack records, for every verb and adjective, **the surface form
 * its own example sentence uses**: 먹다's example says 먹어요 and the entry says
 * `as: "먹어요"`. That field was hand-authored years before this module existed,
 * for a different reason, by somebody reading the sentence. So it is an
 * independent answer to the same question, on 1,306 words, and a generator that
 * disagrees with it is wrong until proven otherwise.
 *
 * ## What a disagreement means, and the one kind that is allowed
 *
 * Most sentences are written in 해요체, so `as` is usually the present polite
 * and the comparison is exact. Some are not: an example may use the past, the
 * adnominal, a connective or an ending this module does not generate. So the
 * check is *containment* — the recorded form has to be one of the forms this
 * module produces, or be built from the 아/어 stem it produces — rather than
 * equality with any single one.
 *
 * A word whose recorded form cannot be reached from the generated stem at all
 * is a failure, and it means one of two things: the class list is wrong, or the
 * sentence is. Both are worth stopping for.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conjugate, classify, stemOf } from '../packages/korean-morphology/src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const corpus = JSON.parse(
  readFileSync(join(ROOT, 'apps/web/src/data/generated/vocabulary.json'), 'utf8'),
);

const PREDICATES = new Set(['verb', 'adjective']);
const words = corpus.words.filter((word) => PREDICATES.has(word.part_of_speech));

/**
 * The forms a recorded surface form could legitimately be.
 *
 * Includes the bare 아/어 stem and the past stem, because an example sentence
 * may continue past them — 먹어서, 먹었는데 — and the point of the check is
 * whether the *stem* is right, which is where every irregular class lives.
 */
function reachable(lemma, shape) {
  const forms = new Set();
  for (const form of [
    'dictionary',
    'infinitive',
    'presentPolite',
    'pastPolite',
    'futurePolite',
    'formalPolite',
    'connective',
    'honorific',
    'request',
    'adnominal',
  ]) {
    const value = conjugate(lemma, form, shape);
    if (value) forms.add(value);
  }
  const stem = stemOf(lemma);
  if (stem) forms.add(stem);
  /*
   * The two stems longer endings are built on, which this module does not
   * generate endings for but does generate the stems of.
   *
   * `-(으)ㄹ게요` and `-(으)ㄹ까요` are built on the prospective — 연락할게요 is
   * 연락할 plus 게요, and 연락할 is exactly the stem `futurePolite` puts in
   * front of 거예요. `-(으)ㄴ` is the other adnominal, the one a verb takes for
   * a completed action: 오래된 사진, 거래한 가게.
   *
   * Adding them here rather than to the module is deliberate. The module's job
   * is the forms a *word card* shows, and a card listing eight endings is a
   * grammar reference. The check's job is whether the stem is right, and for
   * that these two belong.
   */
  const future = conjugate(lemma, 'futurePolite', shape);
  if (future) forms.add(future.replace(/ 거예요$/, ''));
  const adjectival = conjugate(lemma, 'adnominal', { ...shape, partOfSpeech: 'adjective' });
  if (adjectival) forms.add(adjectival);
  return forms;
}

const failures = [];
const byClass = new Map();
let checked = 0;

for (const word of words) {
  const shape = { partOfSpeech: word.part_of_speech };
  const cls = classify(word.word, shape);
  byClass.set(cls, (byClass.get(cls) ?? 0) + 1);

  const present = conjugate(word.word, 'presentPolite', shape);
  if (!present) {
    failures.push({ word: word.word, why: 'no present polite form could be generated' });
    continue;
  }

  const recorded = word.as;
  if (!recorded) continue;
  checked += 1;

  const forms = reachable(word.word, shape);
  if (forms.has(recorded)) continue;

  const infinitive = conjugate(word.word, 'infinitive', shape) ?? '';

  /*
   * A form wearing the honorific is held to the honorific, not to the stem.
   *
   * Every escape below this accepts a recorded form that merely *starts* with
   * the stem, because an example may continue past any ending this module
   * generates — 먹어서, 먹었는데. That is right for endings and wrong for the
   * honorific, whose whole difficulty lives in the joint between the stem and
   * the ending: 있다 takes 계세요, a consonant stem takes 으세요, an ㄹ stem
   * drops the ㄹ, and a stem already carrying -시- takes no second one. 있세요
   * and 만들세요 both start with their stem and neither is a form anybody says,
   * so a stem-prefix escape passes them and this gate was blind to the whole
   * class until a negative test said so.
   *
   * What survives is the compound rule: 부시다's sentence writes 눈부셔요, and
   * the headword's own conjugation is still inside it. The bare stem is
   * excluded from that list on purpose — it is what the escape below already
   * covers, and letting it back in here would restore the blindness.
   */
  if (/(?:세요|셔요|십니다|시어요|십시오)$/u.test(recorded)) {
    /*
     * Asked of the verb form on purpose. `conjugate` refuses an honorific on an
     * adjective because it refuses an *imperative* on one, and -(으)세요 on an
     * adjective is not an imperative: 건강하세요 wishes somebody health and
     * 편찮으세요 asks where it hurts. The joint being checked — 하 + 세요, 편찮
     * + 으세요 — is the same one either way, so the check asks for it directly.
     */
    const honorific = conjugate(word.word, 'honorific', { ...shape, partOfSpeech: 'verb' });
    const stemOnly = stemOf(word.word);
    const compounds = [...forms].filter((form) => form.length > 1 && form !== stemOnly);
    if (honorific && (recorded === honorific || recorded.endsWith(honorific))) continue;
    if (compounds.some((form) => recorded.endsWith(form))) continue;
    /*
     * 따라오세요 is 따르다 followed by 오다, and the 세요 belongs to 오다. The
     * infinitive prefix is what says so — 따라 is 따르다's — and it is a safe
     * thing to accept here where the bare stem is not: 있세요 does not start
     * with 있어, 만들세요 does not start with 만들어, and 먹시어요 does not
     * start with 먹어. A malformed joint never survives its own infinitive.
     */
    if (infinitive && recorded.startsWith(infinitive)) continue;
    failures.push({
      word: word.word,
      pos: word.part_of_speech,
      cls,
      recorded,
      generated: honorific ?? present,
      example: word.example,
      why: 'honorific',
    });
    continue;
  }

  // Not an exact form, so: does it *start* with one of the two stems every
  // longer ending is built on? 먹어서 starts with 먹어; 먹었는데 with 먹었.
  const past = infinitive ? `${infinitive.slice(0, -1)}${nextWithSsang(infinitive)}` : '';
  if (infinitive && recorded.startsWith(infinitive)) continue;
  if (past && recorded.startsWith(past)) continue;
  const stem = stemOf(word.word);
  if (stem && recorded.startsWith(stem)) continue;
  /*
   * And a recorded form that *ends* with a generated one, because a few
   * examples write a compound of the headword: 부시다's sentence says 눈부셔요.
   * The headword's own conjugation is still what is being checked — 부셔요 is
   * inside 눈부셔요 — and the compound is the editorial pack's business.
   */
  /*
   * A one-syllable stem counts here and nowhere else.
   *
   * 내다's prospective is 낼, and its sentence says 낼게요. Requiring two
   * syllables — which the compound rule below does need, or 부시다 would match
   * every word containing 부 — left the one word in the corpus whose whole
   * stem is a single syllable reported as a failure.
   */
  const prospectiveStem = (conjugate(word.word, 'futurePolite', shape) ?? '').replace(/ 거예요$/, '');
  if (prospectiveStem && recorded.startsWith(prospectiveStem)) continue;
  if (
    [...forms].some(
      (form) => form.length > 1 && (recorded.startsWith(form) || recorded.endsWith(form)),
    )
  ) {
    continue;
  }

  failures.push({
    word: word.word,
    pos: word.part_of_speech,
    cls,
    recorded,
    generated: present,
    example: word.example,
  });
}

/** 먹어 → 먹었: the last syllable gains ㅆ. */
function nextWithSsang(infinitive) {
  const BASE = 0xac00;
  const last = infinitive.codePointAt(infinitive.length - 1) - BASE;
  if (last < 0) return infinitive.slice(-1);
  const initial = Math.floor(last / (21 * 28));
  const medial = Math.floor(last / 28) % 21;
  return String.fromCodePoint(BASE + (initial * 21 + medial) * 28 + 20);
}

console.log(
  `Conjugation — ${words.length.toLocaleString('en')} verbs and adjectives in the curriculum\n`,
);
for (const [cls, count] of [...byClass].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cls.padEnd(16)} ${String(count).padStart(5)}`);
}
console.log(`\n  checked against the editorial pack's own surface form: ${checked.toLocaleString('en')}`);

if (failures.length > 0) {
  console.log(`\n  ${failures.length} disagreement(s):`);
  for (const failure of failures.slice(0, 40)) {
    if (failure.why) {
      console.log(`    ${failure.word} — ${failure.why}`);
      continue;
    }
    console.log(
      `    ${failure.word} (${failure.pos}, ${failure.cls}) — the pack says ${failure.recorded}, ` +
        `this module says ${failure.generated}`,
    );
    console.log(`      ${failure.example}`);
  }
  console.error(`\n${failures.length} disagreement(s).`);
  process.exit(CHECK ? 1 : 0);
}

console.log('\nevery recorded surface form is reachable from the generated stem.');
