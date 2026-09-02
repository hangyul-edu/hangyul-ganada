#!/usr/bin/env node
/**
 * Every question the app can put in front of a learner has exactly one
 * defensible answer — in all 32 languages.
 *
 *   npm run answerability            build every question and report
 *   npm run answerability -- --check the same; exit non-zero on a finding
 *
 * ## Why this exists beside `leveltest:ambiguity`
 *
 * That gate reads the Level Test's **finished bank** — a file on disk, built
 * once, 4,194 items — and it is thorough about it. It cannot see the other
 * banks, because they do not exist as files: the vocabulary, review, character
 * and Numbers questions are *generated at runtime* from the corpus, per learner
 * and per attempt. A distractor picked for 사과 on a Turkish learner's third
 * attempt has never been written down anywhere.
 *
 * So this generates them, calling the same functions the app calls — the
 * scheduler's candidate shape, `buildExercise`, `practiceExercises`,
 * `masteryExercises` — and asks of each finished question the one thing that
 * makes it a question:
 *
 * ```
 * exactly one of the options on the screen is right.
 * ```
 *
 * ## The eight ways that fails, and why each is checked separately
 *
 * | | |
 * | --- | --- |
 * | **No answer** | `answerId` names no option, or the exercise has options and no answer |
 * | **Two answers** | the answer's text appears twice — the same gloss under two ids |
 * | **Normalised collision** | two options differ only in case, punctuation, spacing or Unicode form. "to be sad" / "to be sad." is one option wearing two labels |
 * | **Answer among distractors** | the correct Korean or gloss repeated as a wrong choice |
 * | **Empty option** | a blank label is unanswerable and looks like a rendering bug |
 * | **Mixed language** | one option in the learner's language and three in another, which makes the question answerable without knowing Korean |
 * | **Two valid arrangements** | a tile set that spells a second real word — the tray has more than one right answer |
 * | **Self-answering prompt** | the answer visible in the prompt or the sentence around the gap |
 *
 * The normalisation is deliberately *aggressive* — case, Unicode NFC, every
 * punctuation mark, every space — because the failure it is looking for is two
 * options a learner reads as the same thing, and a learner does not read
 * punctuation.
 *
 * ## What it cannot look for
 *
 * Whether two different glosses mean the same thing in some language. "to
 * begin" and "to start" normalise differently and are the same answer, and no
 * string comparison finds that. `translation:semantics` reads for it with a
 * synonym table, `vocabulary:sense:qa` pins one taught sense per word, and past
 * those it is a person's judgement — which is what `I-17`, the native review,
 * is open for. This gate is the deterministic half and says so.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const { VOCABULARY } = await import('../apps/web/src/data/vocabulary.ts');
const { loadCorpusCore, loadCorpusRest } = await import('../apps/web/src/data/corpus.ts');
const { ALL_CHARACTERS } = await import('../apps/web/src/data/characters.ts');
const { buildExercise } = await import('../apps/web/src/features/review/exercises.ts');
const { NUMBER_LESSONS } = await import('../apps/web/src/data/numbers.ts');
const { practiceExercises, masteryExercises } = await import('../apps/web/src/features/numbers/exercises.ts');

/*
 * The corpus arrives over the network in the app and off the disk here.
 *
 * `data/vocabulary` exports live, growing values — the bands are fetched — so a
 * script that reads `VOCABULARY` without loading first gets an empty array and
 * reports a clean bill of health for nothing at all.
 */
const PUBLIC = join(ROOT, 'apps/web/public');
const network = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url ?? String(input);
  if (/^\/(corpus|level-test|dictionary)\//.test(url)) {
    try {
      return new Response(readFileSync(join(PUBLIC, url)), { status: 200 });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }
  return network(input, init);
};
await loadCorpusCore();
await loadCorpusRest();

// --- the meaning packs, per locale ---------------------------------------------

const packFiles = readdirSync(join(ROOT, 'apps/web/src/data/generated'))
  .filter((name) => /^vocabulary\.[\w-]+\.json$/.test(name));
const built = read('apps/web/src/data/generated/vocabulary.json');
const builtWords = Array.isArray(built) ? built : built.words;
const positionOf = new Map(builtWords.map((word, index) => [word.id, index]));
const LOCALES = packFiles.map((name) => {
  const locale = name.slice('vocabulary.'.length, -'.json'.length);
  return { locale, rows: read(`apps/web/src/data/generated/${name}`).words ?? {} };
});

/** The `meaningOf` the app passes into `buildExercise`, for one locale. */
const meaningIn = (rows, locale) => (word) => {
  const row = rows[String(positionOf.get(word.id))];
  return { value: row?.[0] ?? '', locale, example: row?.[1] ?? '' };
};

// --- what "the same option" means ----------------------------------------------

/**
 * Two labels a learner would read as the same answer.
 *
 * Case, Unicode form and punctuation go, because a learner choosing between
 * "to be sad" and "To be sad." is choosing between one answer and itself.
 *
 * **Spaces stay.** The first version stripped them and reported 33 findings in
 * the Numbers course — "한개" against "한 개", "스무살" against "스무 살" —
 * every one of which is a question whose *entire subject* is that a counting
 * word takes a space. Flattening them would have been the gate committing the
 * fault it exists to catch: a normalisation that turns two different answers
 * into one. Runs of whitespace collapse and the ends are trimmed, which is as
 * far as it can go without deleting the distinction.
 *
 * Combining marks stay too: a Bengali vowel sign is part of the word, and
 * dropping it merged unrelated options in an earlier version of the hint guard.
 */
const normalise = (text) =>
  String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

const findings = [];
const fail = (what) => findings.push(what);
let asked = 0;

/** Checks one finished set of options against the single-answer contract. */
function checkOptions(where, options, answerId, prompt = '') {
  if (!options || options.length === 0) return;
  asked += 1;

  const answer = options.find((option) => option.id === answerId);
  if (!answer) {
    fail(`${where}: answerId ${JSON.stringify(answerId)} names none of the ${options.length} options`);
    return;
  }

  const labelOf = (option) => option.label ?? option.korean ?? '';
  const seen = new Map();
  for (const option of options) {
    const text = labelOf(option);
    if (String(text).trim() === '') {
      fail(`${where}: option ${option.id} has no text`);
      continue;
    }
    const key = normalise(text);
    if (key === '') continue;
    if (seen.has(key)) {
      const other = seen.get(key);
      const same = labelOf(other) === text ? 'the same text' : `"${labelOf(other)}" and "${text}"`;
      fail(`${where}: two options a learner reads as one — ${same}`);
    } else {
      seen.set(key, option);
    }
  }

  // One language on the screen. A single option in the learner's own tongue
  // beside three in another is answerable without knowing any Korean.
  const locales = new Set(options.map((option) => option.labelLocale).filter(Boolean));
  if (locales.size > 1) {
    fail(`${where}: options are written in ${[...locales].join(', ')} at once`);
  }

  // The prompt must not contain its own answer.
  const answerKey = normalise(labelOf(answer));
  if (prompt && answerKey.length > 1 && normalise(prompt).includes(answerKey)) {
    fail(`${where}: the prompt contains the answer`);
  }
}

// --- the vocabulary, review and character banks, per locale ---------------------

const WORD_MODES = ['read', 'produce', 'context', 'listen', 'listenMeaning', 'build'];
const CHARACTER_MODES = ['read', 'listen', 'distinguish'];

const candidate = (kind, itemKey, mode) => ({
  kind, itemKey, mode, skill: 'meaning_recognition', priority: 0,
  recall: 0, partner: null, intervene: false, need: 'due',
});

/**
 * Every taught word, in every mode, at three attempts, in every language.
 *
 * Three attempts rather than one because the option set is seeded by the
 * attempt: a distractor that collides with the answer may only be picked on the
 * learner's second try, and the first version of this script asked once and saw
 * none of them.
 */
/**
 * A tile set that spells a second word *with the same meaning*.
 *
 * The first version of this flagged any tray whose tiles could spell another
 * taught word, and reported 622,190 findings — every one of them wrong. The
 * prompt on this exercise is the **meaning**: the learner is shown "night" and
 * asked to build the word for it. That 밤's tray can also spell 유리 is not a
 * second answer, because 유리 does not mean night; it is what a tray with
 * decoys in it looks like, and a tray without decoys would be a reading test.
 *
 * The question only has two answers if the other spellable word means the same
 * thing to *this* learner — a synonym in their language, which is a fact about
 * their pack and not about the tiles. So the arrangements are found once per
 * word and attempt, and the meanings are compared per locale.
 *
 * Checked against the taught corpus rather than a dictionary: a learner can
 * only be expected to produce a word the product taught them.
 */
const TAUGHT = new Set(VOCABULARY.map((word) => word.word));
const alternatives = new Map();

function spellableFrom(tiles, answer) {
  const key = `${answer}|${tiles.map((tile) => tile.syllable).join('')}`;
  const cached = alternatives.get(key);
  if (cached) return cached;
  const syllables = tiles.map((tile) => tile.syllable);
  const found = new Set();
  const walk = (prefix, left) => {
    if (prefix.length >= 2 && prefix !== answer && TAUGHT.has(prefix)) found.add(prefix);
    if (prefix.length >= 4) return;
    for (let index = 0; index < left.length; index += 1) {
      walk(prefix + left[index], [...left.slice(0, index), ...left.slice(index + 1)]);
    }
  };
  walk('', syllables);
  alternatives.set(key, found);
  return found;
}

const wordByKorean = new Map(VOCABULARY.map((word) => [word.word, word]));

function checkTiles(where, tiles, answer, meaningOf) {
  asked += 1;
  const mine = normalise(meaningOf(wordByKorean.get(answer)).value);
  if (mine === '') return;
  for (const other of spellableFrom(tiles, answer)) {
    const entry = wordByKorean.get(other);
    if (!entry) continue;
    if (normalise(meaningOf(entry).value) === mine) {
      fail(`${where}: the tiles also spell ${other}, which means the same thing — two valid answers`);
    }
  }
}

const SEEDS = [0, 1, 2];
for (const { locale, rows } of LOCALES) {
  const meaningOf = meaningIn(rows, locale);
  for (const word of VOCABULARY) {
    for (const mode of WORD_MODES) {
      for (const seed of SEEDS) {
        const exercise = buildExercise(candidate('word', word.id, mode), meaningOf, seed);
        if (!exercise) continue;
        const where = `${locale} word ${word.word} ${mode}#${seed}`;
        checkOptions(where, exercise.options, exercise.answerId, exercise.meaning ?? '');
        if (exercise.tiles) checkTiles(where, exercise.tiles, word.word, meaningOf);
      }
    }
  }
}

for (const character of ALL_CHARACTERS) {
  for (const mode of CHARACTER_MODES) {
    for (const seed of SEEDS) {
      const exercise = buildExercise(candidate('character', character.character, mode), () => ({ value: '', locale: 'en' }), seed);
      if (!exercise) continue;
      checkOptions(`character ${character.character} ${mode}#${seed}`, exercise.options, exercise.answerId);
    }
  }
}

// --- the Numbers bank -----------------------------------------------------------

/*
 * Numbers options carry a translation *key* rather than a finished string when
 * `isKey` is set, so the same key twice is the same option twice however it
 * renders. Checked as the key, and then again as the rendered English, because
 * two different keys can carry the same sentence.
 */
const numbersEn = read('apps/web/src/locales/en/numbers.json');
const renderKey = (key) => key.split('.').reduce((node, part) => node?.[part], numbersEn) ?? key;
for (const lesson of NUMBER_LESSONS) {
  for (const attempt of SEEDS) {
    for (const [phase, list] of [['practice', practiceExercises(lesson, attempt)], ['mastery', masteryExercises(lesson, attempt)]]) {
      for (const [index, exercise] of list.entries()) {
        if (!exercise.options?.length) continue;
        const where = `numbers ${lesson.id} ${phase}#${attempt}[${index}]`;
        /*
         * `order_parts` is not a multiple choice and its `answer` is −1 on
         * purpose: the learner drags 삼, 십 and 오 into order and the answer is
         * the *arrangement*, which no option index can name. The first version
         * of this gate read the sentinel as a broken question and reported two.
         *
         * What it has instead is the arrangement rule. Korean numerals are
         * strictly positional — 삼십오 is 3×10 + 5 and 오십삼 is a different
         * number, not another way of saying the same one — so the parts in the
         * given order are the only reading of the value, and the check is that
         * the options are exactly those parts with nothing repeated and nothing
         * added.
         */
        if (exercise.kind === 'order_parts') {
          const parts = exercise.parts ?? [];
          const shown = exercise.options.map((option) => option.text);
          if (parts.length === 0) {
            fail(`${where}: an ordering question with no parts to order`);
          } else if ([...parts].sort().join('|') !== [...shown].sort().join('|')) {
            fail(`${where}: the tiles ${shown.join(' ')} are not the parts ${parts.join(' ')}`);
          } else if (new Set(parts).size !== parts.length) {
            fail(`${where}: ${parts.join(' ')} repeats a part, so two arrangements read alike`);
          }
          asked += 1;
          continue;
        }
        if (typeof exercise.answer !== 'number' || !exercise.options[exercise.answer]) {
          fail(`${where}: answer index ${exercise.answer} is not one of the ${exercise.options.length} options`);
          continue;
        }
        checkOptions(
          where,
          exercise.options.map((option, position) => ({
            id: String(position),
            label: option.isKey ? renderKey(option.text) : (option.text ?? String(option.value ?? '')),
          })),
          String(exercise.answer),
        );
      }
    }
  }
}

// --- report ---------------------------------------------------------------------

console.log(`Answerability — ${asked.toLocaleString('en')} generated questions`);
console.log(`  ${LOCALES.length} languages × ${VOCABULARY.length.toLocaleString('en')} words × ${WORD_MODES.length} modes × ${SEEDS.length} attempts`);
console.log(`  plus ${ALL_CHARACTERS.length} characters and ${NUMBER_LESSONS.length} Numbers lessons\n`);
const byKind = new Map();
for (const finding of findings) {
  const kind = /two valid answers$/.test(finding)
    ? 'tiles spell a synonym'
    : /reads as one/.test(finding)
      ? 'two options read as one'
      : /names none of/.test(finding)
        ? 'answer names no option'
        : /written in .* at once/.test(finding)
          ? 'mixed language'
          : /has no text/.test(finding)
            ? 'blank option'
            : /prompt contains the answer/.test(finding)
              ? 'prompt answers itself'
              : 'other';
  byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
}
if (byKind.size > 0) {
  console.log('  findings by kind:');
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(7)}  ${kind}`);
  }
  console.log('');
}
if (findings.length === 0) {
  console.log('  every question has exactly one option that answers it.');
  console.log('\n  Deterministic only. Two glosses that mean the same thing in some language are');
  console.log('  a judgement — see translation:semantics, vocabulary:sense:qa, and I-17.');
} else {
  // Least common kind first, so the rare and usually worse findings are the
  // ones a reader sees rather than the ones that happen to sort early.
  const rank = new Map([...byKind].sort((a, b) => a[1] - b[1]).map(([kind], index) => [kind, index]));
  const kindOf = (finding) => (/two valid answers$/.test(finding) ? 'tiles spell a synonym' : /reads as one/.test(finding) ? 'two options read as one' : /prompt contains the answer/.test(finding) ? 'prompt answers itself' : 'other');
  const ordered = [...findings].sort((a, b) => (rank.get(kindOf(a)) ?? 9) - (rank.get(kindOf(b)) ?? 9));
  const shown = ordered.slice(0, 40);
  console.log(`  ${findings.length} problem(s):`);
  for (const finding of shown) console.log(`    ${finding}`);
  if (findings.length > shown.length) console.log(`    … and ${findings.length - shown.length} more`);
}
if (CHECK && findings.length > 0) process.exit(1);
