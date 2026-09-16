#!/usr/bin/env node
/**
 * Every learner-reachable question and teaching surface, written down once.
 *
 *   npx tsx scripts/exercise-inventory.mts           write docs/exercise-inventory.json
 *   npx tsx scripts/exercise-inventory.mts --check   fail if the file is stale or a check fails
 *
 * ## Why a second inventory
 *
 * `content-inventory.json` counts the corpus; `question-ledger.json` lists the
 * three banks that exist as files. Neither can say, for one shipped question,
 * what its prompt is, which unit it belongs to, what its wrong answers are,
 * what hint and feedback it carries, and what evidence says it is sound. This
 * file is that row, for every family:
 *
 * - letter recognition (`read`), letter listening (`listen`, with its
 *   sound-free variant), look-alike discrimination (`distinguish`), letter
 *   writing (`write`) — one row per character × mode, with the **whole
 *   distractor pool** rather than one seed's draw, because the draw is a
 *   seeded shuffle of that pool and the pool is what a learner can meet;
 * - word reading (`read`), production (`produce`), gap-fill (`context`) and
 *   syllable building (`build`) — one row per taught word × mode. The three
 *   distractors of `read`/`produce` do not depend on the seed (only their
 *   order does), so one row is the question; `build` records the tray;
 * - matching — the pairs a day's grid can hold are any words of one level
 *   band, so the row is the band and the check is over every pair in it;
 * - the Vocabulary Level Test bank (`meaning`, `produce`, `context`);
 * - the Numbers course (practice and mastery, one attempt);
 * - the curriculum itself: every letter, syllable, lesson and unit, and where
 *   each Korean term and sound rule is first introduced, practised, reviewed
 *   and assessed (the progression map).
 *
 * ## What is validated, and what is only recorded
 *
 * Per row, in every one of the 32 locales where the row has locale text:
 * the answer is among the options exactly once; no two options read alike
 * after NFC + case + punctuation folding; every option is in one language;
 * the prompt does not contain its answer; the audio the row plays exists in
 * the manifest; every visible string passes the child-safe policy; and — for
 * meaning questions — no distractor's gloss shares its head word with the
 * answer's gloss or is contained in it (a heuristic; every hit is listed for
 * a reader and counted as HUMAN REVIEW REQUIRED until resolved).
 *
 * Whether Korean is *right* is not something this script decides. The
 * Korean-side reading of 2026-09-16 is recorded on the rows it covered as
 * `MODEL-REVIEWED`; native-speaker review of any locale remains
 * `HUMAN REVIEW REQUIRED` and is said so on every row.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpusForNode } from './lib/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const OUT = join(ROOT, 'docs', 'exercise-inventory.json');
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

await loadCorpusForNode();

const { VOCABULARY, getWord } = await import('../apps/web/src/data/vocabulary.ts');
const { ALL_CHARACTERS, ALL_LETTERS, LETTER_LESSONS, CURRICULUM_UNITS, getLessonCharacters } = await import(
  '../apps/web/src/data/characters.ts'
);
const { buildExercise } = await import('../apps/web/src/features/review/exercises.ts');
const { recognitionOptions, soundsTheSame } = await import('../apps/web/src/features/learning/lookAlikes.ts');
const { readingOptions } = await import('../apps/web/src/features/learning/wordOptions.ts');
const { clozeFor } = await import('../apps/web/src/data/cloze.ts');
const { NUMBER_LESSONS } = await import('../apps/web/src/data/numbers.ts');
const { practiceExercises, masteryExercises } = await import('../apps/web/src/features/numbers/exercises.ts');
const { evaluateSurface, verdictOf } = await import('../packages/content-safety/src/index.ts');

// --- locale packs -------------------------------------------------------------

const packFiles = readdirSync(join(ROOT, 'apps/web/src/data/generated')).filter((name) =>
  /^vocabulary\.[\w-]+\.json$/.test(name),
);
const built = read('apps/web/src/data/generated/vocabulary.json');
const builtWords: Array<{ id: string; word: string; senseId?: string }> = built.words;
const positionOf = new Map(builtWords.map((word, index) => [word.id, index]));
const LOCALES = packFiles
  .map((name) => name.slice('vocabulary.'.length, -'.json'.length))
  .sort();
const packs = new Map<string, Array<[string, string | null, string | null]>>();
for (const locale of LOCALES) packs.set(locale, read(`apps/web/src/data/generated/vocabulary.${locale}.json`).words);
const meaningIn = (locale: string) => (word: { id: string }) => {
  const row = packs.get(locale)![positionOf.get(word.id)!];
  return { value: row?.[0] ?? '', locale, example: row?.[1] ?? '' };
};

const manifest = read('apps/web/public/audio/manifest.json');
const AUDIO_IDS = new Set<string>();
for (const entry of manifest.entries ?? []) {
  for (const key of ['id', 'ids']) {
    const value = entry[key];
    if (typeof value === 'string') AUDIO_IDS.add(value);
    if (Array.isArray(value)) for (const id of value) AUDIO_IDS.add(id);
  }
}

const learningEn = read('apps/web/src/locales/en/learning.json');
const learningKo = read('apps/web/src/locales/ko/learning.json');
const commonEn = read('apps/web/src/locales/en/common.json');
const copyAt = (bundle: Record<string, unknown>, key: string): string => {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
  return typeof value === 'string' ? value : '';
};

// --- normalisation -------------------------------------------------------------

const normalise = (text: string) =>
  String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

const STOP = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'one', 'something', 'someone', 'somebody',
  'and', 'or', 'be', 'is', 'as', 'by', 'up', 'out', 'into', 'that', 'this', 'its', 'it', 'from', 'said',
  'word', 'when', 'after', 'before', 'very', 'not', 'un', 'une', 'le', 'la', 'les', 'de', 'des', 'du',
  'el', 'los', 'las', 'der', 'die', 'das', 'ein', 'eine', 'o', 'os', 'um', 'uma', 'il', 'lo', 'gli',
  'i', 'een', 'het', 'en', 'et', 'y', 'e', 'u', 'w', 'na', 'ki', 'ang', 'ng', 'mga', 'sa', 'nang',
]);
const contentTokens = (gloss: string): string[] => {
  const first = gloss.toLowerCase().split(/[,;(—–]/)[0]!;
  return first
    .split(/[^\p{L}\p{M}']+/u)
    .map((token) => token.replace(/^'|'$/g, ''))
    .filter((token) => token.length > 0 && !STOP.has(token));
};
const stem = (token: string) => {
  for (const suffix of ['ness', 'ing', 'ed', 'es', 's', 'ly']) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) return token.slice(0, -suffix.length);
  }
  return token;
};
/** Two glosses a reader might take as one answer: same head word, or one inside the other. */
function glossesOverlap(a: string, b: string): boolean {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = contentTokens(a).map(stem);
  const tb = contentTokens(b).map(stem);
  if (ta.length > 0 && tb.length > 0) {
    if (ta[0] === tb[0]) return true;
    const sa = new Set(ta);
    const sb = new Set(tb);
    if ([...sa].every((t) => sb.has(t)) || [...sb].every((t) => sa.has(t))) return true;
  }
  // Scripts without spaces: containment of one whole gloss in the other.
  if (ta.length <= 1 && tb.length <= 1 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

// --- rows -------------------------------------------------------------------

type Status = 'AUTOMATED CHECKED' | 'MODEL-REVIEWED' | 'HUMAN REVIEW REQUIRED' | 'REJECTED';

interface Row {
  id: string;
  source: string;
  family: string;
  unit: string | null;
  lesson: string | null;
  target: string;
  phenomenon: string;
  prompt: string;
  answer: string;
  accepted: string[];
  distractors: string[];
  hint: string[];
  explanation: string;
  feedback: Record<string, string>;
  example: string | null;
  transcript: string | null;
  pos: string | null;
  sense: string | null;
  level: number | null;
  locales: string;
  origin: 'generated' | 'curated';
  evidence: string[];
  status: Status[];
  findings: string[];
}

const rows: Row[] = [];
const findings: string[] = [];
const humanReview: string[] = [];
let checks = 0;

const FEEDBACK = {
  correct: copyAt(commonEn, 'verdict.correct'),
  incorrect: copyAt(learningEn, 'review.markWrong'),
  retry: copyAt(learningEn, 'recognition.tryAgain'),
  hint: copyAt(learningEn, 'review.showHint'),
  reveal: copyAt(learningEn, 'review.revealedHeadline'),
};

function checkOptions(row: Row, options: Array<{ id: string; text: string; locale?: string }>, answerId: string, prompt: string) {
  checks += 1;
  const answer = options.filter((option) => option.id === answerId);
  if (answer.length !== 1) {
    row.findings.push(`answer ${answerId} appears ${answer.length} times among the options`);
  }
  const seen = new Map<string, string>();
  for (const option of options) {
    if (option.text.trim() === '') row.findings.push(`option ${option.id} is blank`);
    const key = normalise(option.text);
    if (key && seen.has(key)) row.findings.push(`options read alike: "${seen.get(key)}" / "${option.text}"`);
    seen.set(key, option.text);
  }
  const locales = new Set(options.map((option) => option.locale).filter(Boolean));
  if (locales.size > 1) row.findings.push(`options in ${[...locales].join(', ')} at once`);
  const answerText = normalise(answer[0]?.text ?? '');
  if (prompt && answerText.length > 1 && normalise(prompt).includes(answerText)) {
    row.findings.push('the prompt contains the answer');
  }
}

/**
 * The same evaluator, roles and facts the content gates use (`scripts/
 * content-safety-qa.mjs`): a gloss is read as a gloss and a sentence as a
 * sentence, with the headword as context, so 도끼로 쪼개다 under 패다 is the
 * definition it is and not a stray weapon.
 */
function checkSafety(row: Row, texts: Array<[string, string, 'gloss' | 'sentence' | 'note']>, headword?: string) {
  for (const [lang, text, role] of texts) {
    if (!text) continue;
    checks += 1;
    const facts = headword ? { headword } : {};
    const result = evaluateSurface({ text, lang, role, field: role }, facts);
    if (verdictOf(result, facts) !== 'ok') row.findings.push(`child-safe policy refuses "${text}" (${lang}, ${role})`);
  }
}

function checkAudio(row: Row, ids: Array<string | undefined>) {
  for (const id of ids) {
    if (!id) continue;
    checks += 1;
    if (!AUDIO_IDS.has(id)) row.findings.push(`no recording for ${id}`);
  }
}

const lessonOf = new Map<string, { lesson: string; unit: string }>();
for (const lesson of LETTER_LESSONS) {
  for (const character of getLessonCharacters(lesson)) {
    if (!lessonOf.has(character.character)) lessonOf.set(character.character, { lesson: lesson.id, unit: `unit-${lesson.unit}` });
  }
}

// --- letters --------------------------------------------------------------------

const CHARACTER_MODES = ['read', 'listen', 'distinguish', 'write'] as const;
const candidate = (kind: 'word' | 'character', itemKey: string, mode: string, partner: string | null = null) =>
  ({ kind, itemKey, mode, skill: 'meaning_recognition', priority: 0, recall: 0, partner, intervene: false, need: 'due' }) as never;

for (const character of ALL_CHARACTERS) {
  const where = lessonOf.get(character.character) ?? { lesson: null, unit: null };
  const isLetter = character.letter_name !== null;
  for (const mode of CHARACTER_MODES) {
    const row: Row = {
      id: `character:${character.character}:${mode}`,
      source: 'apps/web/src/data/characters.ts + features/review/exercises.ts',
      family: `letter-${mode}`,
      unit: where.unit,
      lesson: where.lesson,
      target: character.character,
      phenomenon:
        mode === 'read'
          ? 'letter → sound (romanisation)'
          : mode === 'listen'
            ? 'sound → letter'
            : mode === 'distinguish'
              ? 'look-alike pair by sound'
              : 'stroke order and shape',
      prompt: mode === 'read' ? copyAt(learningEn, 'review.prompt.readLetter') : mode === 'listen' ? copyAt(learningEn, 'review.prompt.listenLetter') : mode === 'distinguish' ? copyAt(learningEn, 'review.prompt.distinguish') : copyAt(learningEn, 'review.prompt.writeLetter'),
      answer: mode === 'read' ? character.romanization : character.character,
      accepted: [],
      distractors: [],
      hint: [],
      explanation: character.translations.en?.pronunciation_hint ?? '',
      feedback: FEEDBACK,
      example: character.sound_example,
      transcript: isLetter ? `${character.letter_name} / ${character.sound_example}` : character.character,
      pos: null,
      sense: null,
      level: null,
      locales: 'prompt copy in 32 locales; the Korean and the romanisation are the same everywhere',
      origin: 'curated',
      evidence: ['answerability:check', 'strokes:qa:check', 'glyph:structure:check', 'audio:qa'],
      status: ['AUTOMATED CHECKED', 'MODEL-REVIEWED', 'HUMAN REVIEW REQUIRED'],
      findings: [],
    };
    if (mode === 'distinguish') {
      // Every look-alike partner the app can pair this letter with.
      const pool = recognitionOptions(character.character, 0, 99).filter(
        (glyph) => glyph !== character.character && !soundsTheSame(character.character, glyph),
      );
      if (pool.length === 0) continue;
      row.distractors = pool;
      for (const partner of pool) {
        const exercise = buildExercise(candidate('character', character.character, 'distinguish', partner), () => ({ value: '', locale: 'en' }), 0);
        if (!exercise?.options) {
          row.findings.push(`no distinguish question could be built against ${partner}`);
          continue;
        }
        checkOptions(row, exercise.options.map((o) => ({ id: o.id, text: o.korean ?? o.label ?? '' })), exercise.answerId!, '');
        checkAudio(row, [exercise.audioId]);
        row.hint = exercise.hints.map((h) => h.key);
      }
    } else if (mode === 'write') {
      row.accepted = ['a stroke set the evaluator scores ≥ the pass threshold; see docs/HANDWRITING_EVALUATION.md'];
      row.evidence.push('handwriting:robustness');
      checkAudio(row, [character.audio.sound]);
    } else {
      const askedBySound = mode === 'listen';
      const pool = recognitionOptions(character.character, 0, 99, askedBySound).filter((glyph) => glyph !== character.character);
      row.distractors = pool;
      const exercise = buildExercise(candidate('character', character.character, mode), () => ({ value: '', locale: 'en' }), 0);
      if (!exercise?.options) {
        if (pool.length >= 3) row.findings.push('a pool exists but no question was built');
        else row.evidence.push('not asked: fewer than three plausible distractors');
        rows.push(row);
        continue;
      }
      row.hint = exercise.hints.map((h) => h.key);
      // Validate every draw the seeded shuffle can make, not one of them: the
      // pool for ㅢ holds ㅣ and 이 (both "i"), and only the builder's label
      // filter keeps them apart. Four hundred seeds cover the pool orderings
      // many times over for every character.
      for (let seed = 0; seed < 400; seed += 1) {
        const draw = seed === 0 ? exercise : buildExercise(candidate('character', character.character, mode), () => ({ value: '', locale: 'en' }), seed);
        if (!draw?.options) continue;
        checkOptions(row, draw.options.map((o) => ({ id: o.id, text: o.label ?? o.korean ?? '' })), draw.answerId!, '');
      }
      checkAudio(row, [exercise.audioId]);
      if (exercise.soundFree) row.accepted.push(`sound-free variant: ${exercise.soundFree.promptKey}`);
    }
    checkSafety(row, [['en', row.explanation, 'note'], ['ko', character.translations.ko?.pronunciation_hint ?? '', 'note']]);
    rows.push(row);
  }
}

// --- words ----------------------------------------------------------------------

const WORD_MODES = ['read', 'produce', 'context', 'build'] as const;
const glossOverlapHits: Array<{ locale: string; word: string; answer: string; distractor: string; distractorWord: string }> = [];

for (const word of VOCABULARY) {
  for (const mode of WORD_MODES) {
    const en = meaningIn('en');
    const exerciseEn = buildExercise(candidate('word', word.id, mode), en, 1);
    const row: Row = {
      id: `word:${word.id}:${mode}`,
      source: mode === 'context' ? 'apps/web/src/data/generated/cloze.json (scripts/content/build_level_test.mjs)' : 'features/review/exercises.ts over data/generated/vocabulary.json',
      family: `word-${mode}`,
      unit: `vocabulary-level-${word.level}`,
      lesson: `today's-vocabulary/review level ${word.level}`,
      target: word.word,
      phenomenon:
        mode === 'read'
          ? 'Korean → meaning'
          : mode === 'produce'
            ? 'meaning → Korean'
            : mode === 'context'
              ? `gap-fill, ${clozeFor(word.id)?.form ?? 'no form'}`
              : 'syllable assembly',
      prompt: exerciseEn ? (exerciseEn.sentence ? `${exerciseEn.sentence.before}____${exerciseEn.sentence.after}` : exerciseEn.meaning ?? exerciseEn.korean ?? '') : '',
      answer: mode === 'read' ? en(word).value : mode === 'context' ? (clozeFor(word.id)?.target ?? '') : word.word,
      accepted: [],
      distractors: [],
      hint: exerciseEn ? exerciseEn.hints.map((h) => h.key) : [],
      explanation: packs.get('en')![positionOf.get(word.id)!]?.[2] ?? '',
      feedback: FEEDBACK,
      example: word.example,
      transcript: `${word.word} / ${word.example}`,
      pos: word.part_of_speech,
      sense: builtWords[positionOf.get(word.id)!]?.senseId ?? null,
      level: word.level,
      locales: '32',
      origin: mode === 'context' && clozeFor(word.id)?.curated ? 'curated' : 'generated',
      evidence: ['answerability:check', 'vocabulary:sense:qa:check', 'translation:semantics:check', 'content:safety:check', 'audio:qa'],
      status: ['AUTOMATED CHECKED', 'MODEL-REVIEWED', 'HUMAN REVIEW REQUIRED'],
      findings: [],
    };
    if (mode === 'context') row.evidence.push('leveltest:ambiguity:check', 'leveltest:distractors:check', 'questions:ledger:check');
    if (!exerciseEn) {
      row.evidence.push(`not asked in this mode${mode === 'context' ? ' (no gap-fill for this word)' : ''}`);
      rows.push(row);
      continue;
    }
    checkAudio(row, [exerciseEn.audioId, exerciseEn.sentence?.audioId]);
    if (mode === 'build') {
      row.distractors = (exerciseEn.tiles ?? []).map((t) => t.syllable).filter((s) => !word.syllables.includes(s));
      row.accepted = [word.word];
    }
    if (mode === 'context') {
      row.distractors = exerciseEn.options!.filter((o) => o.id !== word.id).map((o) => o.korean!);
      checkOptions(row, exerciseEn.options!.map((o) => ({ id: o.id, text: o.korean ?? '' })), exerciseEn.answerId!, row.prompt);
      checkSafety(row, [['ko', row.prompt.replace('____', row.answer), 'sentence']], word.word);
    }
    if (mode === 'read' || mode === 'produce') {
      const chosen = readingOptions(word, 1, (other) => en(other).value).filter((o) => o.id !== word.id);
      row.distractors = chosen.map((o) => o.word);
    }
    // Every locale: the same question as the app builds it.
    for (const locale of LOCALES) {
      const meaningOf = meaningIn(locale);
      const exercise = buildExercise(candidate('word', word.id, mode), meaningOf, 1);
      if (!exercise?.options && mode !== 'build') continue;
      if (exercise?.options) {
        checkOptions(
          row,
          exercise.options.map((o) => ({ id: o.id, text: o.label ?? o.korean ?? '', locale: o.labelLocale })),
          exercise.answerId!,
          exercise.meaning ?? '',
        );
      }
      if (mode === 'read' || mode === 'produce') {
        const mine = meaningOf(word).value;
        for (const option of exercise?.options ?? []) {
          if (option.id === word.id) continue;
          const other = getWord(option.id);
          if (!other) continue;
          const theirs = meaningOf(other).value;
          if (glossesOverlap(mine, theirs)) {
            checks += 1;
            glossOverlapHits.push({ locale, word: word.word, answer: mine, distractor: theirs, distractorWord: other.word });
            row.findings.push(`${locale}: "${mine}" and "${theirs}" (${other.word}) may read as one meaning — HUMAN REVIEW REQUIRED`);
          }
        }
      }
      if (locale === 'en' || locale === 'ko') {
        checkSafety(row, [[locale, meaningOf(word).value, 'gloss'], [locale, meaningOf(word).example, 'sentence']], word.word);
      }
    }
    rows.push(row);
  }
}

// --- matching: every pair a day's grid can hold ----------------------------------

const byLevel = new Map<number, typeof VOCABULARY>();
for (const word of VOCABULARY) {
  if (!byLevel.has(word.level)) byLevel.set(word.level, []);
  byLevel.get(word.level)!.push(word);
}
const matchCollisions: Array<{ locale: string; level: number; a: string; b: string; gloss: string }> = [];
for (const [level, words] of [...byLevel].sort((a, b) => a[0] - b[0])) {
  const row: Row = {
    id: `match:level-${level}`,
    source: 'features/vocabulary/dailyQuestions.ts over the day\'s plan (domain/vocabularyDay.ts)',
    family: 'word-match',
    unit: `vocabulary-level-${level}`,
    lesson: `today's-vocabulary level ${level}`,
    target: `${words.length} words`,
    phenomenon: 'Korean ↔ meaning, several pairs at once',
    prompt: copyAt(learningEn, 'review.prompt.match'),
    answer: 'each Korean word paired with its own meaning',
    accepted: [],
    distractors: ['the other words of the same grid'],
    hint: [],
    explanation: '',
    feedback: { ...FEEDBACK, partial: copyAt(learningEn, 'review.matchRight') },
    example: null,
    transcript: null,
    pos: null,
    sense: null,
    level,
    locales: '32',
    origin: 'generated',
    evidence: ['dailyvocab:qa:check', 'every pair of same-level words compared per locale; shared glosses are deduplicated by buildDailyQuestions at runtime'],
    status: ['AUTOMATED CHECKED', 'HUMAN REVIEW REQUIRED'],
    findings: [],
  };
  for (const locale of LOCALES) {
    const meaningOf = meaningIn(locale);
    const glosses = words.map((w) => ({ word: w.word, key: normalise(meaningOf(w).value), raw: meaningOf(w).value }));
    const seen = new Map<string, string>();
    for (const g of glosses) {
      checks += 1;
      if (!g.key) continue;
      if (seen.has(g.key)) {
        // A fact about the pack, resolved at runtime: `buildDailyQuestions`
        // drops the later of two members whose meanings fold alike, so the
        // grid never shows the pair. Counted, not failed.
        matchCollisions.push({ locale, level, a: seen.get(g.key)!, b: g.word, gloss: g.raw });
      } else seen.set(g.key, g.word);
    }
  }
  rows.push(row);
}

// --- the Vocabulary Level Test bank --------------------------------------------

const manifestLt = read('apps/web/public/level-test/manifest.json');
const bank = read(`apps/web/public/level-test/${manifestLt.bank}`);
const wordByKorean = new Map(VOCABULARY.map((w) => [w.word, w]));
/** The Level Test's own meaning tables: taught words *and* dictionary distractors, per locale. */
const ltMeanings = new Map<string, Record<string, string>>();
for (const [locale, file] of Object.entries(manifestLt.meanings as Record<string, string>)) {
  ltMeanings.set(locale, read(`apps/web/public/level-test/${file}`).meanings);
}
const ltMeaning = (locale: string, id: string): string => ltMeanings.get(locale)?.[id] ?? '';
const koreanOfId = (id: string): string => getWord(id)?.word ?? id.replace(/^dict_/, '');
for (const item of bank.items) {
  const answerId = item.answerId ?? item.promptId ?? (item.lemma ? wordByKorean.get(item.lemma)?.id : undefined);
  const word = answerId ? getWord(answerId) : undefined;
  const row: Row = {
    id: `leveltest:${item.id}`,
    source: `apps/web/public/level-test/${manifestLt.bank}`,
    family: `leveltest-${item.kind}`,
    unit: `vocabulary-level-${item.level}`,
    lesson: 'Vocabulary Level Test',
    target: word?.word ?? item.lemma ?? item.prompt ?? '',
    phenomenon: item.kind === 'meaning' ? 'Korean → meaning' : item.kind === 'produce' ? 'meaning → Korean' : `gap-fill, ${item.form ?? ''}`,
    prompt: item.prompt ?? '',
    answer: item.answer ?? (word ? meaningIn('en')(word).value : ''),
    accepted: [],
    distractors: item.kind === 'meaning' ? item.optionIds.filter((id: string) => id !== answerId).map(koreanOfId) : (item.options ?? []).filter((o: string) => o !== item.answer),
    hint: [],
    explanation: '',
    feedback: FEEDBACK,
    example: word?.example ?? null,
    transcript: null,
    pos: word?.part_of_speech ?? item.form ?? null,
    sense: item.senseId ?? (word ? builtWords[positionOf.get(word.id)!]?.senseId ?? null : null),
    level: item.level,
    locales: item.kind === 'meaning' ? '32 (glosses)' : 'Korean only',
    origin: item.curated ? 'curated' : 'generated',
    evidence: ['leveltest:qa:check', 'leveltest:bank:check', 'leveltest:ambiguity:check', 'leveltest:distractors:check', 'leveltest:locale:check', 'questions:ledger:check'],
    status: ['AUTOMATED CHECKED', 'MODEL-REVIEWED', 'HUMAN REVIEW REQUIRED'],
    findings: [],
  };
  if (item.kind === 'meaning') {
    row.answer = ltMeaning('en', answerId);
    for (const locale of [...ltMeanings.keys()].sort()) {
      const options = item.optionIds.map((id: string) => ({ id, text: ltMeaning(locale, id), locale }));
      // An item with an option the locale has no meaning for is not asked in
      // that locale (`resolveItem` in data/levelTest.ts drops it), so there is
      // nothing on a screen to check. Recorded on the row, not failed.
      if (options.some((o) => !o.text)) {
        row.accepted.push(`not asked in ${locale}`);
        continue;
      }
      checkOptions(row, options, answerId, '');
      const mine = ltMeaning(locale, answerId);
      for (const id of item.optionIds) {
        if (id === answerId) continue;
        const theirs = ltMeaning(locale, id);
        if (glossesOverlap(mine, theirs)) {
          glossOverlapHits.push({ locale, word: row.target, answer: mine, distractor: theirs, distractorWord: koreanOfId(id) });
          row.findings.push(`${locale}: "${mine}" and "${theirs}" (${koreanOfId(id)}) may read as one meaning — HUMAN REVIEW REQUIRED`);
        }
      }
    }
  } else {
    checkOptions(row, item.options.map((o: string) => ({ id: o, text: o })), item.answer, item.kind === 'context' ? item.prompt : '');
    if (item.kind === 'context') checkSafety(row, [['ko', item.prompt.replace('____', item.answer), 'sentence']], item.lemma);
  }
  rows.push(row);
}

// --- Numbers ---------------------------------------------------------------------

const numbersEn = read('apps/web/src/locales/en/numbers.json');
const renderKey = (key: string) => copyAt(numbersEn, key) || key;
for (const lesson of NUMBER_LESSONS) {
  for (const [phase, list] of [['practice', practiceExercises(lesson, 0)], ['mastery', masteryExercises(lesson, 0)]] as const) {
    for (const exercise of list) {
      const options = (exercise.options ?? []).map((o: { text?: string; value?: unknown; isKey?: boolean }, position: number) => ({
        id: String(position),
        text: o.isKey ? renderKey(String(o.text)) : String(o.text ?? o.value ?? ''),
      }));
      const row: Row = {
        id: `numbers:${lesson.id}:${phase}:${exercise.item_id}:${exercise.kind}`,
        source: 'apps/web/src/data/numbers.ts + features/numbers/exercises.ts',
        family: `numbers-${exercise.kind}`,
        unit: 'numbers',
        lesson: lesson.id,
        target: String(exercise.item_id),
        phenomenon: String(exercise.question_type ?? exercise.kind),
        prompt: exercise.prompt_key ? renderKey(exercise.prompt_key) : String(exercise.type ?? exercise.kind),
        answer: exercise.kind === 'order_parts' ? (exercise.parts ?? []).join(' ') : (options[exercise.answer]?.text ?? ''),
        accepted: [],
        distractors: exercise.kind === 'order_parts' ? [] : options.filter((_, i) => i !== exercise.answer).map((o) => o.text),
        hint: [],
        explanation: '',
        feedback: FEEDBACK,
        example: null,
        transcript: null,
        pos: null,
        sense: null,
        level: null,
        locales: '32 (prompt and key-rendered options)',
        origin: 'generated',
        evidence: ['numbers:qa:check', 'numbers:domain:check', 'numbers:ledger:check', 'numbers:copy:check', 'answerability:check'],
        status: ['AUTOMATED CHECKED', 'MODEL-REVIEWED', 'HUMAN REVIEW REQUIRED'],
        findings: [],
      };
      if (exercise.kind !== 'order_parts' && options.length > 0) checkOptions(row, options, String(exercise.answer), '');
      rows.push(row);
    }
  }
}

// --- the progression map: where each term and rule first appears -----------------

const TERMS = ['자모', '자음', '모음', '글자', '음절', '음절 블록', '초성', '중성', '종성', '받침', '겹받침', '쌍자음', '이중 모음', '된소리', '거센소리', '연음', '비음화', '유음화', '구개음화', 'ㄴ 첨가'];
const koBundles: Record<string, unknown> = {};
for (const name of ['learning', 'letters', 'vocabulary', 'numbers', 'common', 'levelTest', 'settings', 'home']) {
  const path = join(ROOT, 'apps/web/src/locales/ko', `${name}.json`);
  if (existsSync(path)) koBundles[name] = JSON.parse(readFileSync(path, 'utf8'));
}
const flatten = (node: unknown, prefix: string, out: Array<[string, string]>) => {
  if (typeof node === 'string') out.push([prefix, node]);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
};
const koStrings: Array<[string, string]> = [];
for (const [name, bundle] of Object.entries(koBundles)) flatten(bundle, name, koStrings);
const characterKo = ALL_CHARACTERS.map((c) => [`characters.${c.character}`, `${c.translations.ko?.pronunciation_hint ?? ''} ${c.translations.ko?.mnemonic ?? ''}`] as [string, string]);
const progression: Record<string, { introduced: string[]; practised: string[]; assessed: string[] }> = {};
for (const term of TERMS) {
  const hits = [...koStrings, ...characterKo].filter(([, text]) => text.includes(term)).map(([key]) => key);
  progression[term] = {
    introduced: hits.filter((k) => /intro|units|letters|characters|sounds|steps/.test(k)).slice(0, 12),
    practised: hits.filter((k) => /recognition|practice|review|session/.test(k)).slice(0, 12),
    assessed: hits.filter((k) => /levelTest|numbers/.test(k)).slice(0, 12),
  };
}
const soundRules = {
  tensing: { introduced: 'learning:sounds (소리가 만날 때), reached after every letter lesson', practised: 'word cards with a pronunciation note (WordIntro, WordDetailPage)', assessed: 'not assessed as a rule; the Level Test asks meanings and gap-fills' },
  aspiration: { introduced: 'learning:sounds', practised: 'word cards', assessed: 'not assessed' },
  nasal: { introduced: 'learning:sounds', practised: 'word cards', assessed: 'not assessed' },
  lateral: { introduced: 'learning:sounds', practised: 'word cards', assessed: 'not assessed' },
  palatal: { introduced: 'learning:sounds', practised: 'word cards', assessed: 'not assessed' },
  insertion: { introduced: 'learning:sounds', practised: 'word cards', assessed: 'not assessed' },
  liaison: { introduced: 'learning:sounds', practised: 'not noted on cards by design (pronunciation.py NOTEWORTHY)', assessed: 'not assessed' },
  'final-consonant neutralisation': { introduced: 'lesson-final-sounds (옷, 꽃, 밥, 국)', practised: 'letter recognition and writing of the unit-11 syllables', assessed: 'letter review' },
};

// --- totals and output -------------------------------------------------------------

const count = <T,>(list: T[], key: (item: T) => string) => {
  const out: Record<string, number> = {};
  for (const item of list) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort());
};
for (const row of rows) {
  for (const f of new Set(row.findings)) (f.includes('HUMAN REVIEW REQUIRED') ? humanReview : findings).push(`${row.id}: ${f}`);
}
const collisionPairs = [...new Set(matchCollisions.map((c) => `${c.locale}|${c.a}|${c.b}|${c.gloss}`))].sort();
const overlapPairs = [...new Set(glossOverlapHits.map((h) => `${h.locale}|${h.word}|${h.distractorWord}|${h.answer}|${h.distractor}`))].sort();
/** One row per question, compact: the strings a reader needs, the checks as codes, findings as a count. */
const families: Record<string, { source: string; evidence: string[]; status: Status[] }> = {};
for (const row of rows) {
  const entry = (families[row.family] ??= { source: row.source, evidence: [], status: row.status });
  for (const e of row.evidence) if (!entry.evidence.includes(e)) entry.evidence.push(e);
}
const compact = rows.map((row) => ({
  id: row.id,
  fam: row.family,
  unit: row.unit,
  lesson: row.lesson,
  target: row.target,
  phen: row.phenomenon,
  prompt: row.prompt,
  answer: row.answer,
  accepted: row.accepted,
  distractors: row.distractors,
  hint: row.hint,
  expl: row.explanation,
  example: row.example,
  transcript: row.transcript,
  pos: row.pos,
  sense: row.sense,
  level: row.level,
  locales: row.locales,
  origin: row.origin,
  findings: new Set(row.findings).size,
  review: [...new Set(row.findings)].filter((f) => f.includes('HUMAN REVIEW')).length,
}));

const totals = {
  rows: rows.length,
  by_family: count(rows, (r) => r.family),
  by_unit: count(rows, (r) => r.unit ?? 'none'),
  by_level: count(rows.filter((r) => r.level !== null), (r) => String(r.level)),
  locales: LOCALES.length,
  answers_validated: rows.filter((r) => r.answer).length,
  distractors_validated: rows.reduce((n, r) => n + r.distractors.length, 0),
  checks_run: checks,
  automated_findings: findings.length,
  human_review_flags: humanReview.length,
  gloss_overlap_hits_by_locale: count(glossOverlapHits, (h) => h.locale),
  match_collisions_by_locale: count(matchCollisions, (c) => c.locale),
};

const payload = {
  _comment: 'GENERATED by scripts/exercise-inventory.mts. Every learner-reachable question, one row each; see the script header for what each column holds and what was and was not validated.',
  generated_from: 'scripts/exercise-inventory.mts',
  columns: 'id, fam (exercise family — its source file, checks and status labels are in `families`), unit, lesson, target (letter or word), phen (target phenomenon), prompt, answer, accepted (alternatives), distractors, hint (copy keys), expl (explanation), example, transcript (audio), pos, sense, level, locales, origin (generated/curated), findings (count), review (human-review flags)',
  families,
  status_labels: {
    'AUTOMATED CHECKED': 'the checks named in `evidence` ran over this row in every locale it has text for',
    'MODEL-REVIEWED': 'the Korean side (prompt, answer, distractors, example, note) was read by the model on 2026-09-16; not a native-speaker review',
    'HUMAN REVIEW REQUIRED': 'no locale, Korean included, has been reviewed by a qualified native speaker',
  },
  totals,
  progression: { terms: progression, sound_rules: soundRules },
  feedback_states: FEEDBACK,
  findings,
  human_review_summary: {
    note: 'Heuristic hits: two glosses in one question that share a head word or contain each other. Each is listed once per locale and pair; the per-locale counts are in totals. Resolved hits are the ones the runtime never shows together (see dailyQuestions match dedupe, readingOptions sameMeaning, collideInAnyLocale).',
    gloss_overlap_pairs: overlapPairs.length,
    match_collision_pairs: collisionPairs.length,
  },
  match_collisions: collisionPairs,
  gloss_overlaps: overlapPairs,
  rows: compact,
};
const json = `${JSON.stringify(payload, null, 1)}\n`;
const digest = createHash('sha256').update(json).digest('hex').slice(0, 12);

console.log('\nExercise inventory');
console.log(`  ${rows.length.toLocaleString('en')} rows, ${checks.toLocaleString('en')} checks, ${LOCALES.length} locales`);
for (const [family, n] of Object.entries(totals.by_family)) console.log(`  ${String(n).padStart(6)}  ${family}`);
console.log(`  ${findings.length} automated finding(s), ${humanReview.length} human-review flag(s)`);
for (const f of findings.slice(0, 40)) console.log(`    ${f}`);
if (findings.length > 40) console.log(`    … and ${findings.length - 40} more`);

if (CHECK) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  const stale = current !== json;
  if (stale) console.log(`\n  docs/exercise-inventory.json is stale (${digest}); run without --check to rewrite it`);
  if (findings.length > 0 || stale) process.exit(1);
} else {
  writeFileSync(OUT, json);
  console.log(`\n  written to docs/exercise-inventory.json (${(json.length / 1024 / 1024).toFixed(1)} MiB, ${digest})`);
}
