import type { NumberItem, NumberLesson, NumbersExerciseKind } from '@hangyul-ganada/shared-types';

import { NUMBER_ITEMS, getNumberItem, numberLessonItems } from '../../data/numbers';

/**
 * Numbers exercises: built from the lesson, with distractors that mean something.
 *
 * ## What was wrong before
 *
 * The first implementation asked one question shape — Korean shown, meaning
 * chosen — with the three other items of the lesson as distractors, and placed
 * the answer at `(k·7 + i·3) mod 4`. For a ten-item lesson that put the right
 * answer at **index 1 on every question**; for a seven-item lesson it cycled
 * `0, 3, 2, 1, 0, 3, 2`. A learner tapping the same slot scored 100%, and the
 * distractors tested nothing, because "what does 마리 count?" with the options
 * *people / things / animals / bottles* is answerable by elimination.
 *
 * ## Distractors come from misconception classes
 *
 * Each exercise names the mistake it is testing for and draws its wrong
 * options from that mistake:
 *
 * | class | example | why a learner makes it |
 * | --- | --- | --- |
 * | `system_swap` | 이 for 둘 | the two systems name the same value |
 * | `plain_form` | 둘 개 for 두 개 | the counting form is a different word |
 * | `adjacent` | 여섯 for 일곱 | neighbouring values are learned as a list |
 * | `sound_alike` | 사 for 삼 | one segment apart |
 * | `irregular_month` | 육월 for 유월 | the rule predicts the wrong word |
 * | `wrong_counter` | 명 for 마리 | the wrong classifier for the thing |
 * | `spacing` | 한개 for 한 개 | a counter written glued on |
 *
 * A distractor must render to a *different string* from the answer and from
 * every other option; an exercise that cannot find enough is dropped rather
 * than padded with something unrelated, and `numbers:qa` reports how many were
 * dropped so a thin lesson cannot silently become a two-option quiz.
 *
 * ## The shuffle is seeded, and the seed includes the attempt
 *
 * `shuffle(options, seed)` is a Fisher–Yates over a hash of
 * `(lesson, exercise, attempt)`. Same lesson, same attempt → same order, so
 * leaving and coming back does not move the answer under a finger. Different
 * attempt → different order, so a retake is not a memory test of positions.
 * The answer's position is never a function of the question's index alone.
 */

export type MisconceptionClass =
  | 'system_swap'
  | 'plain_form'
  | 'adjacent'
  | 'sound_alike'
  | 'irregular_month'
  | 'wrong_counter'
  | 'spacing'
  | 'wrong_system_context';

export interface ExerciseOption {
  /** What the button shows. Korean, digits, or a meaning key. */
  text: string;
  /** Set when `text` is a key into the `numbers` namespace rather than Korean. */
  isKey?: boolean;
  /** Set when `text` is a numeral to format with `Intl`. */
  value?: number;
  /** The misconception this option embodies, if it is a distractor. */
  misconception?: MisconceptionClass;
}

export interface NumbersExercise {
  id: string;
  kind: NumbersExerciseKind;
  /** The item this exercise is about, for evidence. */
  item_id: string;
  /** The prompt. For `listen_choose` it is the clip id; otherwise text or a key. */
  prompt: { text?: string; key?: string; value?: number; audio?: string; sentence?: string };
  options: ExerciseOption[];
  answer: number;
  /** Why the right answer is right, and why the tempting one is not. A key. */
  rationale: string;
  /** For `order_parts`: the parts, in the order they must be tapped. */
  parts?: string[];
}

// --- hashing and shuffling -------------------------------------------------

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(list: readonly T[], seed: string): T[] {
  const out = [...list];
  let state = hash(seed) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    // xorshift32
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// --- misconception sources -------------------------------------------------

const numerals = (system: 'sino' | 'native') =>
  NUMBER_ITEMS.filter((i) => i.role === 'numeral' && i.system === system && i.value !== null);

/** The other system's word for the same value, where both exist. */
function systemSwap(item: NumberItem): NumberItem | undefined {
  if (item.value === null || item.system === null) return undefined;
  const other = item.system === 'sino' ? 'native' : 'sino';
  return numerals(other).find((i) => i.value === item.value);
}

/** Neighbouring values in the same system. */
function adjacent(item: NumberItem): NumberItem[] {
  if (item.value === null || item.system === null) return [];
  return numerals(item.system)
    .filter((i) => i.id !== item.id && Math.abs((i.value ?? 0) - item.value!) <= 2)
    .sort((a, b) => Math.abs((a.value ?? 0) - item.value!) - Math.abs((b.value ?? 0) - item.value!));
}

/** The plain numeral a counting form replaces, and vice versa. */
const FORM_TO_PLAIN: Record<string, string> = { 한: '하나', 두: '둘', 세: '셋', 네: '넷', 스무: '스물' };
const PLAIN_TO_FORM: Record<string, string> = Object.fromEntries(
  Object.entries(FORM_TO_PLAIN).map(([f, p]) => [p, f]),
);

const IRREGULAR_MONTH: Record<string, string> = { 유월: '육월', 시월: '십월' };

/** Sound-alike pairs a beginner actually confuses. */
const SOUND_ALIKE: Record<string, string[]> = {
  삼: ['사'], 사: ['삼'], 이: ['일'], 일: ['이'], 육: ['칠'], 칠: ['육'],
  셋: ['넷'], 넷: ['셋'], 여섯: ['여덟'], 여덟: ['여섯'],
};

const uniqueByText = (opts: ExerciseOption[]): ExerciseOption[] => {
  const seen = new Set<string>();
  return opts.filter((o) => {
    const k = o.isKey ? `k:${o.text}` : o.value !== undefined ? `v:${o.value}` : `t:${o.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** Fills up to `want` options, answer first, from the given distractor pools in order. */
function build(
  answer: ExerciseOption,
  pools: Array<ExerciseOption[]>,
  want = 4,
): ExerciseOption[] | null {
  let options = uniqueByText([answer]);
  for (const pool of pools) {
    for (const opt of pool) {
      if (options.length >= want) break;
      options = uniqueByText([...options, opt]);
    }
  }
  return options.length >= Math.min(want, 3) ? options : null;
}

// --- exercise builders -----------------------------------------------------

type Ctx = { lesson: NumberLesson; siblings: NumberItem[]; attempt: number; phase: string };

const koreanOf = (item: NumberItem): ExerciseOption => ({ text: item.korean });
const meaningOf = (item: NumberItem): ExerciseOption =>
  item.gloss ? { text: item.gloss, isKey: true } : { text: String(item.value), value: item.value ?? undefined };

function siblingsDistinct(item: NumberItem, siblings: NumberItem[], by: (i: NumberItem) => ExerciseOption, cls: MisconceptionClass): ExerciseOption[] {
  return siblings
    .filter((s) => s.id !== item.id)
    .map((s) => ({ ...by(s), misconception: cls }))
    .filter((o) => (o.isKey ? o.text !== (item.gloss ?? '') : o.value !== undefined ? o.value !== item.value : o.text !== item.korean));
}

/**
 * The line under the feedback, chosen from what is actually known about the
 * item rather than from the kind of question.
 *
 * The previous rule attached one sentence per exercise kind, and every listen
 * question in the course therefore ended with *listen to the whole word;
 * neighbouring numbers are what people confuse most often*. It explained
 * nothing about the answer, and its second clause was a claim about learners
 * that this repository has no evidence for. A learner who has just heard 만 and
 * picked 억 needs one fact — 만 is 10,000 — and that fact is in the item.
 *
 * So: the value if the item has one, then its example, and only then the
 * teaching line for the kind. Every rationale here is rendered with the item's
 * own `korean`, `value` and `example` available for interpolation, so a locale
 * writes the sentence its language wants rather than receiving a translated
 * English one.
 */
function itemRationale(item: NumberItem, fallback: string): string {
  if (item.value !== null) return 'rationale.value';
  if (item.example) return 'rationale.example';
  return fallback;
}

/** Which set the item belongs to, as the sentence a learner can act on. */
function systemRationale(item: NumberItem): string {
  return item.system === 'native' ? 'rationale.nativeSystem' : 'rationale.sinoSystem';
}

/** Korean shown → meaning chosen. Distractors: the lesson's own siblings (same role), then system swap. */
function readChoose(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  const options = build(meaningOf(item), [
    siblingsDistinct(item, ctx.siblings.filter((s) => s.role === item.role), meaningOf, 'wrong_counter'),
    siblingsDistinct(item, ctx.siblings, meaningOf, 'wrong_counter'),
  ]);
  if (!options) return null;
  return finish('read_choose', item, ctx, { text: item.korean, audio: item.audio.word }, options, itemRationale(item, systemRationale(item)));
}

/** Clip played → Korean chosen. Distractors: sound-alikes, adjacent, system swap. */
function listenChoose(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  const sound = (SOUND_ALIKE[item.korean] ?? []).map((t) => ({ text: t, misconception: 'sound_alike' as const }));
  const adj = adjacent(item).map((i) => ({ ...koreanOf(i), misconception: 'adjacent' as const }));
  const swap = systemSwap(item);
  const options = build(koreanOf(item), [
    sound, adj,
    swap ? [{ ...koreanOf(swap), misconception: 'system_swap' }] : [],
    siblingsDistinct(item, ctx.siblings, koreanOf, 'wrong_counter'),
  ]);
  if (!options) return null;
  return finish('listen_choose', item, ctx, { audio: item.audio.word }, options, itemRationale(item, systemRationale(item)));
}

/** Numeral shown → Korean chosen, in the *lesson's* system. Distractor 1 is always the other system. */
function digitsToKorean(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  if (item.value === null || item.role !== 'numeral' && item.role !== 'phrase') return null;
  const swap = systemSwap(item);
  const options = build(koreanOf(item), [
    swap ? [{ ...koreanOf(swap), misconception: 'system_swap' }] : [],
    adjacent(item).map((i) => ({ ...koreanOf(i), misconception: 'adjacent' as const })),
    (SOUND_ALIKE[item.korean] ?? []).map((t) => ({ text: t, misconception: 'sound_alike' as const })),
    siblingsDistinct(item, ctx.siblings, koreanOf, 'wrong_counter'),
  ]);
  if (!options) return null;
  return finish('digits_to_korean', item, ctx, { value: item.value, key: `prompt.digitsToKorean.${item.system ?? 'both'}` }, options, item.system === 'native' ? 'rationale.nativeSystem' : 'rationale.sinoSystem');
}

/** Korean shown → numeral chosen. Distractors: adjacent values, sound-alike values. */
function koreanToDigits(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  if (item.value === null) return null;
  const valueOpt = (v: number, cls: MisconceptionClass): ExerciseOption => ({ text: String(v), value: v, misconception: cls });
  const near: number[] = [];
  const v = item.value;
  if (v >= 100) near.push(v * 10, v / 10, v + (v >= 10000 ? 10000 : 100));
  else near.push(v + 1, v - 1, v + 10, v * 10);
  const soundVals = (SOUND_ALIKE[item.korean] ?? [])
    .map((t) => NUMBER_ITEMS.find((i) => i.korean === t && i.value !== null)?.value)
    .filter((x): x is number => typeof x === 'number');
  const options = build({ text: String(v), value: v }, [
    soundVals.map((x) => valueOpt(x, 'sound_alike')),
    near.filter((x) => x > 0 && Number.isInteger(x) && x !== v).map((x) => valueOpt(x, 'adjacent')),
    ctx.siblings.filter((s) => s.value !== null && s.value !== v).map((s) => valueOpt(s.value!, 'adjacent')),
  ]);
  if (!options) return null;
  return finish('korean_to_digits', item, ctx, { text: item.korean, audio: item.audio.word }, options, 'rationale.koreanToDigits');
}

/** Context phrase → which system does it use? Two options, both meaningful. */
function chooseSystem(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  if (item.system === null) return null;
  const options: ExerciseOption[] = [
    { text: 'system.native', isKey: true, ...(item.system !== 'native' ? { misconception: 'wrong_system_context' as const } : {}) },
    { text: 'system.sino', isKey: true, ...(item.system !== 'sino' ? { misconception: 'wrong_system_context' as const } : {}) },
  ];
  const answerIndex = item.system === 'native' ? 0 : 1;
  const ordered = [options[answerIndex]!, options[1 - answerIndex]!];
  return finish('choose_system', item, ctx, { text: item.korean, key: item.gloss ?? undefined, audio: item.audio.word }, ordered, item.system === 'native' ? 'rationale.nativeSystem' : 'rationale.sinoSystem');
}

/** A counter with a number: pick the form that goes in front of it. */
function counterForm(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  // Works from a counting form (한/두/세/네/스무) or from a counter's example.
  let form: string | undefined;
  let counter: string | undefined;
  if (item.role === 'form' && item.example) {
    [form, counter] = item.example.split(' ');
  } else if (item.role === 'counter' && item.example && item.counter_system === 'native') {
    const words = item.example.split(' ');
    const idx = words.findIndex((w) => FORM_TO_PLAIN[w]);
    if (idx >= 0) { form = words[idx]; counter = words.slice(idx + 1).join(' '); }
  }
  if (!form || !counter) return null;
  const plain = FORM_TO_PLAIN[form];
  const value = NUMBER_ITEMS.find((i) => i.korean === form && i.role === 'form')?.value ?? null;
  const sino = value !== null ? numerals('sino').find((i) => i.value === value) : undefined;
  const glued = `${form}${counter}`;
  const options = build({ text: `${form} ${counter}` }, [
    plain ? [{ text: `${plain} ${counter}`, misconception: 'plain_form' }] : [],
    sino ? [{ text: `${sino.korean} ${counter}`, misconception: 'system_swap' }] : [],
    [{ text: glued, misconception: 'spacing' }],
  ]);
  if (!options) return null;
  return finish('counter_form', item, ctx, { key: 'prompt.counterForm', value: value ?? undefined, text: counter }, options, 'rationale.countingForm');
}

/** Which of these is NOT Korean? The wrong forms are the answer's distractors made explicit. */
function spotMistake(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  const wrong: ExerciseOption[] = [];
  if (IRREGULAR_MONTH[item.korean]) wrong.push({ text: IRREGULAR_MONTH[item.korean]!, misconception: 'irregular_month' });
  if (item.role === 'form' && item.example) {
    const [form, counter] = item.example.split(' ');
    if (form && counter && FORM_TO_PLAIN[form]) wrong.push({ text: `${FORM_TO_PLAIN[form]} ${counter}`, misconception: 'plain_form' });
  }
  if (item.example && item.example.includes('(✗)')) {
    const bad = item.example.split('·')[1]?.replace(/\(✗\)/, '').trim();
    if (bad) wrong.push({ text: bad, misconception: item.korean.includes(' ') && bad.replace(/\s/g, '') === item.korean.replace(/\s/g, '') ? 'spacing' : 'plain_form' });
  }
  if (wrong.length === 0) return null;
  // The *answer* here is the wrong form; the correct forms are the other options.
  const right = [{ text: item.example?.split('·')[0]?.replace(/\(✓\)/, '').trim() || item.korean }];
  const fill = ctx.siblings.filter((s) => s.id !== item.id).map((s) => ({ text: s.example?.split('·')[0]?.replace(/\(✓\)/, '').trim() || s.korean }));
  const options = build(wrong[0]!, [right, fill]);
  if (!options) return null;
  return finish('spot_mistake', item, ctx, { key: 'prompt.spotMistake' }, options, `rationale.${wrong[0]!.misconception}`);
}

/** A sentence with the target blanked; the options are the lesson's items. */
function fillSentence(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  if (!item.example || item.example.includes('(')) return null;
  const target = item.korean;
  if (!item.example.includes(target)) return null;
  const sentence = item.example.replace(target, '____');
  const swap = systemSwap(item);
  const options = build(koreanOf(item), [
    swap ? [{ ...koreanOf(swap), misconception: 'system_swap' }] : [],
    PLAIN_TO_FORM[target] ? [{ text: PLAIN_TO_FORM[target]!, misconception: 'plain_form' }] : [],
    siblingsDistinct(item, ctx.siblings, koreanOf, 'wrong_counter'),
  ]);
  if (!options) return null;
  return finish('fill_sentence', item, ctx, { sentence, audio: item.audio.example ?? undefined }, options, item.role === 'counter' ? 'rationale.counter' : 'rationale.fill');
}

/** Tap the parts of a compound numeral in order: 삼십오 → 삼 · 십 · 오. */
function orderParts(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  if (item.value === null || item.role !== 'numeral' || item.korean.length < 3) return null;
  const parts = decompose(item.korean, item.system);
  if (!parts || parts.length < 2) return null;
  const shuffled = shuffle(parts, `${ctx.lesson.id}:${item.id}:order:${ctx.attempt}`);
  if (shuffled.join('') === parts.join('')) shuffled.reverse();
  return {
    id: `${ctx.lesson.id}:${item.id}:order_parts:${ctx.attempt}`,
    kind: 'order_parts',
    item_id: item.id,
    prompt: { value: item.value, key: 'prompt.orderParts' },
    options: shuffled.map((text) => ({ text })),
    answer: -1,
    parts,
    rationale: item.system === 'native' ? 'rationale.nativeBuild' : 'rationale.sinoBuild',
  };
}

/** Splits a compound numeral into its spoken parts. */
function decompose(korean: string, system: NumberItem['system']): string[] | null {
  const units = system === 'native' ? ['열', '스물', '서른', '마흔', '쉰'] : ['십', '백', '천', '만'];
  const ones = system === 'native' ? ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'] : ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const parts: string[] = [];
  let rest = korean;
  while (rest.length > 0) {
    const tok = [...units, ...ones].sort((a, b) => b.length - a.length).find((t) => rest.startsWith(t));
    if (!tok) return null;
    parts.push(tok);
    rest = rest.slice(tok.length);
  }
  return parts;
}

function finish(
  kind: NumbersExerciseKind,
  item: NumberItem,
  ctx: Ctx,
  prompt: NumbersExercise['prompt'],
  ordered: ExerciseOption[],
  rationale: string,
): NumbersExercise {
  const seed = `${ctx.lesson.id}:${item.id}:${kind}:${ctx.phase}:${ctx.attempt}`;
  const options = shuffle(ordered, seed);
  return {
    id: seed,
    kind,
    item_id: item.id,
    prompt,
    options,
    answer: options.findIndex((o) => o === ordered[0]),
    rationale,
  };
}

const BUILDERS: Record<NumbersExerciseKind, (item: NumberItem, ctx: Ctx) => NumbersExercise | null> = {
  read_choose: readChoose,
  listen_choose: listenChoose,
  digits_to_korean: digitsToKorean,
  korean_to_digits: koreanToDigits,
  choose_system: chooseSystem,
  counter_form: counterForm,
  spot_mistake: spotMistake,
  fill_sentence: fillSentence,
  order_parts: orderParts,
};

/**
 * Guided practice: every item, through at least two different exercise kinds
 * where the item supports them, in a seeded interleaved order.
 */
export function practiceExercises(lesson: NumberLesson, attempt: number): NumbersExercise[] {
  return generate(lesson, attempt, 'practice', 2);
}

/**
 * The mastery check: `lesson.mastery_count` questions covering every item at
 * least once, kinds rotated so no two consecutive questions share one.
 */
export function masteryExercises(lesson: NumberLesson, attempt: number): NumbersExercise[] {
  const all = generate(lesson, attempt, 'mastery', 3);
  const items = numberLessonItems(lesson);
  const chosen: NumbersExercise[] = [];
  const used = new Set<string>();
  // one per item first
  for (const item of items) {
    const ex = all.find((e) => e.item_id === item.id && !used.has(e.id));
    if (ex) { chosen.push(ex); used.add(ex.id); }
  }
  for (const ex of all) {
    if (chosen.length >= lesson.mastery_count) break;
    if (!used.has(ex.id)) { chosen.push(ex); used.add(ex.id); }
  }
  return shuffle(chosen, `${lesson.id}:mastery:${attempt}`);
}

function generate(lesson: NumberLesson, attempt: number, phase: string, perItem: number): NumbersExercise[] {
  const siblings = numberLessonItems(lesson);
  const out: NumbersExercise[] = [];
  for (const item of siblings) {
    let made = 0;
    const kinds = shuffle(lesson.exercise_kinds, `${lesson.id}:${item.id}:kinds:${attempt}`);
    for (const kind of kinds) {
      if (made >= perItem) break;
      const ex = BUILDERS[kind](item, { lesson, siblings, attempt, phase });
      if (ex) { out.push(ex); made += 1; }
    }
  }
  // Interleave so the same item is not asked twice in a row.
  return shuffle(out, `${lesson.id}:${phase}:${attempt}`);
}

/**
 * How many exercises a lesson can actually build, and how many items got fewer
 * than two kinds. `numbers:qa` reads this.
 */
export function exerciseCoverage(lesson: NumberLesson): { exercises: number; thinItems: string[]; kinds: Set<NumbersExerciseKind> } {
  const items = numberLessonItems(lesson);
  const kinds = new Set<NumbersExerciseKind>();
  const thin: string[] = [];
  let total = 0;
  for (const item of items) {
    let n = 0;
    for (const kind of lesson.exercise_kinds) {
      const ex = BUILDERS[kind](item, { lesson, siblings: items, attempt: 0, phase: 'practice' });
      if (ex) { n += 1; kinds.add(kind); }
    }
    total += n;
    if (n < 2) thin.push(item.id);
  }
  return { exercises: total, thinItems: thin, kinds };
}

export { getNumberItem };
