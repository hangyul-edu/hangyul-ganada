import type {
  NumberItem,
  NumberLesson,
  NumbersExerciseKind,
  NumbersQuestionType,
} from '@hangyul-ganada/shared-types';

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

/**
 * The named ways a distractor can be wrong.
 *
 * A class is not shown to a learner — an answer result draws the verdict and
 * the two marked options and no prose at all. It is here so that a distractor
 * is a *genuine misconception* rather than filler, and so the gates can say
 * which one: `numbers:qa` reads it, `leveltest:ambiguity` reads its equivalent,
 * and `exercises.test.ts` refuses a class that is not on this list.
 *
 * The list is exported as a value as well as a type, because a runtime check
 * over a type is not possible and a second hand-written copy of it is how the
 * `wrong_system_context` class came to be attached to options for four passes
 * without existing anywhere else.
 */
export const MISCONCEPTION_CLASSES = [
  'system_swap',
  'plain_form',
  'adjacent',
  'sound_alike',
  'irregular_month',
  'wrong_counter',
  'spacing',
] as const;

export type MisconceptionClass = (typeof MISCONCEPTION_CLASSES)[number];

/**
 * The heading each question type resolves, as `NumberSessionPage`'s switch
 * resolves it.
 *
 * The defect this exists for: `spot_mistake` was headed *어느 쪽이 맞을까요?* —
 * *which one is right?* — over an option list whose answer is the one that is
 * **wrong**. A learner who read the instruction and obeyed it was marked
 * incorrect, in all thirty-two languages. The heading came from the exercise
 * *kind*, which is a fact about how the options were assembled; the kind and
 * the question are not the same thing.
 *
 * Exported so the gates read the table rather than each keeping a copy of it.
 * Three of them did, and one of the three resolved `prompt.key` — which only
 * selects a heading on `sayTheNumber` — and reported a `chooseSystem`
 * question's *gloss* as its instruction.
 *
 * `sayTheNumber` is the one type with three headings; `prompt.key` on the
 * exercise picks between them, and the entry here is the fallback.
 */
export const PROMPT_KEY_FOR_TYPE: Record<NumbersQuestionType, string> = {
  listenAndChoose: 'prompt.listenAndChoose',
  chooseMeaning: 'prompt.chooseMeaning',
  chooseCorrectExplanation: 'prompt.chooseCorrectExplanation',
  chooseSystem: 'prompt.chooseSystem',
  sayTheNumber: 'prompt.digitsToKorean.both',
  writeTheDigits: 'prompt.koreanToDigits',
  chooseCounterForm: 'prompt.counterForm',
  findIncorrectExpression: 'prompt.findIncorrectExpression',
  fillTheBlank: 'prompt.fill',
  orderTheParts: 'prompt.orderParts',
};

export interface ExerciseOption {
  /** What the button shows. Korean, digits, or a meaning key. */
  text: string;
  /**
   * The curriculum item this option was made from, where there is one.
   *
   * Carried rather than looked up by text, because two items can share a
   * string: 오천 원 is both the money lesson's price and the *which system?*
   * lesson's context phrase, and 세 시 삼십 분 is both a clock time and a
   * pitfall — so `NUMBER_ITEMS.find(i => i.korean === text)` answers with
   * whichever comes first in the file. Absent on the options that are not
   * items: a sound-alike, a glued form, a misspelt month.
   */
  itemId?: string;
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
  /**
   * What the question asks, which is what the instruction above it says.
   *
   * Resolved here, once, from the builder and from the item's declared
   * `gloss_kind` — never re-derived in the UI from the option strings. See
   * `NumbersQuestionType` for what went wrong when the instruction was chosen
   * from `kind` alone.
   */
  question_type: NumbersQuestionType;
  /** The item this exercise is about, for evidence. */
  item_id: string;
  /** The prompt. For `listen_choose` it is the clip id; otherwise text or a key. */
  prompt: { text?: string; key?: string; value?: number; audio?: string; sentence?: string };
  options: ExerciseOption[];
  answer: number;
  /*
   * There is no `feedback` field, and its absence is the design.
   *
   * An answer result showed a verdict and, under it, a sentence — the item's
   * authored note, the lesson's teaching line, or a line written for the
   * misconception the tapped distractor carried. Four passes were spent making
   * those sentences say something: the generated *사는 4예요* was removed, then
   * the restatement of the correct answer, then the counting-word line under
   * questions about numerals, then `rationale.adjacent`. Each pass removed the
   * worst of them and left the rest.
   *
   * The result state now shows the verdict and nothing else. What the learner
   * needs after answering is on the screen already and is not prose: the option
   * they tapped is marked, the right one is marked, and both marks carry their
   * own screen-reader text. The teaching belongs to the explanation steps,
   * which are read before the exercise and are recorded as evidence.
   *
   * `copy:generated` is the gate that keeps it that way. It builds every
   * exercise the engine can build and fails if one carries a result body at
   * all, in any of the thirty-two languages.
   */
  /** For `order_parts`: the parts, in the order they must be tapped. */
  parts?: string[];
  /**
   * The same question, asked without the recording.
   *
   * Present only on `listen_choose`, whose entire prompt is a clip — the prompt
   * carries an audio id and deliberately no text, because printing the word
   * would print the answer. A learner who cannot use the clip has nothing to
   * answer with.
   *
   * The letter side solved this first and the note in `features/review/
   * exercises.ts` is the argument: a *setting* is remembered, and the cost of a
   * remembered setting is that nobody who has not already found it can turn it
   * on. So this is per question — a small **Can't use audio?** under the prompt
   * that swaps the clip for an equivalent visual one. Same item, same options,
   * same answer, same scoring: the learner is not skipping the question, they
   * are being asked it another way, so there is nothing to penalise.
   *
   * It is the *second* accommodation and not the only one. `RunOptions.soundFree`
   * builds a whole run without heard-only questions, for a learner whose profile
   * says so or a build with no audio in it; this is for the learner who meets
   * one anyway.
   *
   * Absent where no honest substitution exists, and the button is then not
   * offered. See `soundFreeFor`.
   */
  soundFree?: NumbersSoundFreeVariant;
}

/**
 * A patch applied over a listening question when the learner asks for it.
 *
 * A patch rather than a second exercise, for the reason `SoundFreeVariant` gives
 * on the letter side: the item, the options, the answer and the scoring are all
 * the same question, and two objects would be two things to keep in step.
 */
export interface NumbersSoundFreeVariant {
  /** The instruction, in place of *what did you hear?* */
  promptKey: string;
  /** Shown instead of the clip: a numeral, formatted by `Intl`. */
  value?: number;
  /** Shown instead of the clip: a gloss key in the `numbers` namespace. */
  glossKey?: string;
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

/**
 * How a run may be built.
 *
 * ## `soundFree`, and why the Numbers course needed it
 *
 * A `listen_choose` question's entire stimulus is a clip: the prompt carries an
 * audio id and no text, because showing the word is showing the answer. That is
 * the right design for a listening question and the wrong thing to be unable to
 * skip, and **every one of the nineteen lessons lists `listen_choose`** — so a
 * learner who cannot hear met one in every mastery check, and a mastery check
 * is what completes a lesson. There was no route through the Numbers course for
 * them at all.
 *
 * `settings.sound_free` already existed and was already honoured by the review
 * scheduler (§36, `domain/review.ts`); this course simply never asked. It asks
 * now, and it also asks the player: a build with no audio in it, or a manifest
 * that failed to load, is the same situation arriving from the other direction.
 *
 * Dropping the kind is enough — it is not a degraded course. Every lesson still
 * covers every item through at least one other kind, and `numbers:qa` §11
 * measures that rather than assuming it.
 */
export interface RunOptions {
  /** Build without questions whose only stimulus is a sound. */
  soundFree?: boolean;
}

/** The kinds a run may draw on, given how it is being built. */
function kindsFor(lesson: NumberLesson, options: RunOptions | undefined): NumbersExerciseKind[] {
  if (!options?.soundFree) return [...lesson.exercise_kinds];
  return lesson.exercise_kinds.filter((kind) => kind !== 'listen_choose');
}

const koreanOf = (item: NumberItem): ExerciseOption => ({ text: item.korean, itemId: item.id });
const meaningOf = (item: NumberItem): ExerciseOption =>
  item.gloss
    ? { text: item.gloss, isKey: true, itemId: item.id }
    : { text: String(item.value), value: item.value ?? undefined, itemId: item.id };

/**
 * A sibling of the same item, as a distractor.
 *
 * The class is decided by what the *item* is, not by which list the sibling
 * came out of. Labelling every sibling `wrong_counter` gave a question about
 * the numeral 사 the result body *each counting word has its own things — 명 for
 * people, 마리 for animals* , which is true, unrelated, and exactly the generic
 * reuse this pass is removing. A numeral's sibling carries no class at all, so
 * the exercise's own line answers instead.
 */
function siblingsDistinct(item: NumberItem, siblings: NumberItem[], by: (i: NumberItem) => ExerciseOption, cls: MisconceptionClass): ExerciseOption[] {
  const applies = cls !== 'wrong_counter' || item.role === 'counter';
  return siblings
    .filter((s) => s.id !== item.id)
    // A sibling whose gloss names the same thing is not a wrong answer. See
    // `NumberItem.gloss_group`: 명 and 사람 both gloss as 사람.
    .filter((s) => !(item.gloss_group && s.gloss_group === item.gloss_group))
    .map((s) => ({ ...by(s), ...(applies ? { misconception: cls } : {}) }))
    .filter((o) => (o.isKey ? o.text !== (item.gloss ?? '') : o.value !== undefined ? o.value !== item.value : o.text !== item.korean));
}

/**
 * Which instruction a gloss question needs, read off the content model.
 *
 * A `read_choose` over 마리 · 명 · 개 · 사람 is asking what a word means. A
 * `read_choose` over *세는 말은 띄어 써요* and three other rules is asking which
 * statement is true, and the meaning instruction over it is unanswerable — 한 개
 * does not *mean* that counting words are spaced.
 *
 * The answer's own `gloss_kind` decides, not the distractors': the distractors
 * are the lesson's siblings and `numbers:qa` fails a lesson whose items disagree
 * about their kind, so within one option list the two are never mixed.
 */
function glossQuestion(item: NumberItem): NumbersQuestionType {
  return item.gloss_kind === 'explanation' ? 'chooseCorrectExplanation' : 'chooseMeaning';
}

/** Korean shown → meaning chosen. Distractors: the lesson's own siblings (same role), then system swap. */
function readChoose(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  /*
   * One option per `gloss_group`, distractors included.
   *
   * Excluding a sibling that names what the *answer* names is what makes the
   * question answerable at all. Excluding the second of two siblings that name
   * each other is a smaller thing and still worth doing: 개 offered against 명,
   * 마리 **and** 사람 is a four-button question with three real choices, and the
   * learner who notices that 사람 and 사람 - 일상적인 말 are the same answer has
   * been handed the elimination this file's distractor design exists to remove.
   */
  const byGroup = new Set<string>();
  if (item.gloss_group) byGroup.add(item.gloss_group);
  const pool = [
    ...siblingsDistinct(item, ctx.siblings.filter((s) => s.role === item.role), meaningOf, 'wrong_counter'),
    ...siblingsDistinct(item, ctx.siblings, meaningOf, 'wrong_counter'),
  ].filter((option) => {
    const group = NUMBER_ITEMS.find((i) => i.gloss === option.text)?.gloss_group;
    if (!group) return true;
    if (byGroup.has(group)) return false;
    byGroup.add(group);
    return true;
  });
  const options = build(meaningOf(item), [pool]);
  if (!options) return null;
  /*
   * The answer may not be the only option of its shape.
   *
   * `meaningOf` returns a numeral for an item with a value and no gloss and a
   * key for one with a gloss, so an option list can end up mixing the two.
   * Where exactly one option is of a kind, that option is identifiable without
   * reading it: the mixed lesson asked *what does 열여섯 mean?* over **16**,
   * *three people*, *five thousand won* and *two o'clock*, and the money lesson
   * asked what 원 means over *won*, **5,000**, **10,000** and **35,000**. Both
   * are answerable by shape, and a learner who answers by shape has not been
   * asked anything.
   *
   * The question is dropped rather than patched, because the alternative is a
   * distractor invented to balance the shapes. Every item this drops is still
   * asked about by another exercise kind in the same lesson — `numbers:qa`
   * fails a lesson that loses its only question about an item.
   */
  const numeric = options.filter((option) => option.value !== undefined).length;
  if (numeric === 1 || numeric === options.length - 1) {
    const answerIsNumeric = options[0]!.value !== undefined;
    if ((numeric === 1) === answerIsNumeric) return null;
  }
  const question = glossQuestion(item);
  /*
   * An explanation question is shown the *pair*, not the bare word.
   *
   * Over 한 개 alone, two of the pitfalls lesson's five rules are true at once
   * — the counting form is used **and** the counting word is spaced — so two
   * options are defensible and the question has no answer. Over `한 개 (✓) ·
   * 한개 (✗)` exactly one rule explains the difference between the two halves,
   * and the other four are plainly about something else. The stimulus is what
   * makes the question well-posed, so it changes with the question type rather
   * than with the item.
   */
  const shown = question === 'chooseCorrectExplanation' ? (item.example ?? item.korean) : item.korean;
  return finish('read_choose', question, item, ctx, { text: shown, audio: item.audio.word }, options);
}

/**
 * The same listening question, with something to look at instead of the clip.
 *
 * Two substitutions, and which one applies is decided by what actually
 * identifies the item among *these* options.
 *
 * **A numeral gets its digits and its set.** Not the digits alone: the
 * distractors for a numeral include `system_swap` — 하나 offered against 일 —
 * and both of those *are* 1, so "which of these is 1?" has two answers. The
 * instruction that already exists for this is `prompt.digitsToKorean.<system>`
 * — *say this number with 일, 이, 삼* — which names the set as well as the
 * value, and is exactly the question `digits_to_korean` asks with exactly these
 * options. Nothing is given away: the options are Korean words and the mapping
 * from a numeral to one of them is the skill being tested.
 *
 * Naming the set is still not always enough. 시월 is 10 in the sino set and so
 * is 십; 만 원 is 10,000 and so is 만. Where the option list holds both, this
 * falls through.
 *
 * **Anything else gets its gloss.** 마리 is *animals* and no other option in
 * its list is, because `siblingsDistinct` already drops a sibling that names
 * what the answer names (`gloss_group`) — the same guarantee `chooseMeaning`
 * relies on, read from the other end.
 *
 * Null where neither identifies exactly one of *these* options, and the button
 * is then not offered rather than a worse question being invented.
 */
function soundFreeFor(
  item: NumberItem,
  options: ExerciseOption[],
  answer: ExerciseOption,
): NumbersSoundFreeVariant | undefined {
  /*
   * Both substitutions are *checked against these options*, not assumed.
   *
   * The first version of this reasoned from the item alone and was wrong twice
   * over, which is what the gate caught. 시월 is 10 in the sino set and so is
   * 십, and they can be offered together — so naming the set is not enough on
   * its own. 만 원 and 만 are both 10,000. And two different items can share a
   * string, so "which option is this item" has to be answered by the id the
   * option was built with rather than by matching text.
   */
  const identifies = (fits: ExerciseOption[]) => fits.length === 1 && fits[0] === answer;

  if (item.value !== null && item.system !== null) {
    const sameNumber = options.filter((option) => {
      const source = option.itemId ? getNumberItem(option.itemId) : undefined;
      return source?.value === item.value && source?.system === item.system;
    });
    if (identifies(sameNumber)) {
      return { promptKey: `prompt.digitsToKorean.${item.system}`, value: item.value };
    }
  }

  if (item.gloss) {
    const sameGloss = options.filter((option) => {
      const source = option.itemId ? getNumberItem(option.itemId) : undefined;
      return source?.gloss === item.gloss;
    });
    if (identifies(sameGloss)) {
      return { promptKey: 'prompt.chooseByMeaning', glossKey: item.gloss };
    }
  }

  return undefined;
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
  const exercise = finish('listen_choose', 'listenAndChoose', item, ctx, { audio: item.audio.word }, options);
  const variant = soundFreeFor(item, exercise.options, exercise.options[exercise.answer]!);
  return variant ? { ...exercise, soundFree: variant } : exercise;
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
  return finish('digits_to_korean', 'sayTheNumber', item, ctx, { value: item.value, key: `prompt.digitsToKorean.${item.system ?? 'both'}` }, options);
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
  return finish('korean_to_digits', 'writeTheDigits', item, ctx, { text: item.korean, audio: item.audio.word }, options);
}

/** Context phrase → which system does it use? Two options, both meaningful. */
function chooseSystem(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  if (item.system === null) return null;
  const options: ExerciseOption[] = [
    /*
     * No misconception class on these two.
     *
     * `wrong_system_context` was declared, attached here, and never given a
     * sentence in any of the thirty-two bundles — so a learner who picked the
     * wrong set was shown the key `rationale.wrong_system_context`, which is
     * what i18next returns when it cannot find one. `copy:generated` found it
     * on its first run, 1,024 times.
     *
     * There is no line to attach now: an answer result shows the verdict and
     * the two marked options, which is what tells a learner they chose 고유어식
     * where the phrase takes 한자어식.
     */
    { text: 'system.native', isKey: true },
    { text: 'system.sino', isKey: true },
  ];
  const answerIndex = item.system === 'native' ? 0 : 1;
  const ordered = [options[answerIndex]!, options[1 - answerIndex]!];
  return finish('choose_system', 'chooseSystem', item, ctx, { text: item.korean, key: item.gloss ?? undefined, audio: item.audio.word }, ordered);
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
  return finish('counter_form', 'chooseCounterForm', item, ctx, { value: value ?? undefined, text: counter }, options);
}

/**
 * The correct half of an item's example, as an option a learner can weigh.
 *
 * `십육 (심뉵)` is an example with its reading in brackets, and it was landing
 * in a right/wrong list beside 두 살 and 유월 as `십육 (심뉵)` — an annotation
 * among expressions, which tells a learner that this is the option somebody
 * forgot to tidy rather than one of the four to choose between. The bracket is
 * the card's business, not the question's.
 */
function correctSide(item: NumberItem): string {
  const half = item.example?.split('·')[0]?.replace(/\(✓\)/, '') ?? '';
  const plain = half.replace(/\s*\([^)]*\)/g, '').trim();
  return plain || item.korean;
}

/**
 * *다음 중 틀린 표현을 고르세요* — the answer is the option that is **not**
 * Korean, and the instruction now says so.
 *
 * This builder always did that; what it was headed with was *어느 쪽이
 * 맞을까요?* — which one is right? — so the instruction asked for the opposite
 * of what the grader accepted. A learner reading it and picking 세 시 over 셋
 * 시 was marked wrong for answering the question printed above the options.
 * The heading is chosen from `question_type` now, and this builder is the only
 * source of `findIncorrectExpression`.
 */
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
  const right = [{ text: correctSide(item) }];
  const fill = ctx.siblings.filter((s) => s.id !== item.id).map((s) => ({ text: correctSide(s) }));
  const options = build(wrong[0]!, [right, fill]);
  if (!options) return null;
  return finish('spot_mistake', 'findIncorrectExpression', item, ctx, {}, options);
}

/**
 * Every syllable this course uses as a number or a unit.
 *
 * Built from the curriculum rather than typed out, so a numeral added to
 * `NUMBER_ITEMS` is a numeral here too and cannot be mistaken for the context
 * word that makes a blank answerable.
 */
const NUMBER_SYLLABLES = new Set(
  NUMBER_ITEMS.filter((i) => i.role === 'numeral' || i.role === 'form')
    .flatMap((i) => [...i.korean]),
);
const UNIT_WORDS = new Set(NUMBER_ITEMS.filter((i) => i.role === 'counter').map((i) => i.korean));

/**
 * Particles and copula endings, which attach to whatever fills the blank and
 * therefore say nothing about what belongs there.
 *
 * A short, explicit list rather than a morphological analyser: this is the
 * closed set that actually appears in this course's twenty-six examples, and a
 * new one arriving is a gate failure rather than a silent pass — an example
 * whose only remaining word is an ending simply stops building a fill question.
 *
 * `도` is on the list although in this course it is always the temperature
 * unit rather than the particle, and that is the conservative reading on
 * purpose: it makes `____ 오 도` build no question, and `____ 오 도` has two
 * answers — 영하 오 도 is five below, and 영 점 오 도 is half a degree above.
 */
const GRAMMATICAL = new Set(['이에요', '예요', '에', '을', '를', '이', '가', '은', '는', '의', '도', '와', '과']);

/**
 * Does the blanked sentence say what belongs in the hole?
 *
 * ## The questions this removed
 *
 * `fill_sentence` blanked the target out of *any* example, and the lesson's own
 * siblings were the distractors — which is to say, the distractors were exactly
 * the set of words that also fit. The results were not hard questions, they
 * were questions with several right answers:
 *
 * ```
 *  두 ____        개 · 명 · 마리 · 사람   all four are Korean
 *  세 ____        개 · 사람 · 명 · 마리   all four
 *  삼십 ____      분 · 초                삼십 분 and 삼십 초 both exist
 *  삼____         월 · 년 · 일           삼월, 삼년, 삼일 all exist
 *  삼 ____        층 · 호                삼 층 and 삼 호 both exist
 * ```
 *
 * A blank after a bare numeral is not a question. What makes one answerable is
 * a word in the sentence that is *not* part of the number phrase — 고양이 두
 * ____ has one answer because a cat is counted 마리 and by nothing else; 책 세
 * ____ and 맥주 한 ____ and 연세가 어떻게 되세요? the same. So the rule is the
 * one a teacher would state: the sentence has to name what is being counted, or
 * be a sentence rather than a phrase.
 *
 * Where two words still fit that anchor — 맥주 한 병 beside 맥주 한 잔 — the
 * pair is declared in `slot_group` and they are kept out of each other's option
 * lists.
 */
function hasContextAnchor(blanked: string): boolean {
  return blanked
    .replace('____', ' ')
    .split(/[\s.,?!·()]+/)
    .filter(Boolean)
    .some(
      (run) =>
        !GRAMMATICAL.has(run) &&
        !UNIT_WORDS.has(run) &&
        ![...run].every((ch) => NUMBER_SYLLABLES.has(ch)),
    );
}

/** A sentence with the target blanked; the options are the lesson's items. */
function fillSentence(item: NumberItem, ctx: Ctx): NumbersExercise | null {
  if (!item.example || item.example.includes('(')) return null;
  const target = item.korean;
  if (!item.example.includes(target)) return null;
  const sentence = item.example.replace(target, '____');
  if (!hasContextAnchor(sentence)) return null;
  const swap = systemSwap(item);
  const options = build(koreanOf(item), [
    swap ? [{ ...koreanOf(swap), misconception: 'system_swap' }] : [],
    PLAIN_TO_FORM[target] ? [{ text: PLAIN_TO_FORM[target]!, misconception: 'plain_form' }] : [],
    // A sibling that fits the same slot is not a distractor — see `slot_group`.
    siblingsDistinct(
      item,
      ctx.siblings.filter((s) => !(item.slot_group && s.slot_group === item.slot_group)),
      koreanOf,
      'wrong_counter',
    ),
  ]);
  if (!options) return null;
  return finish('fill_sentence', 'fillTheBlank', item, ctx, { sentence, audio: item.audio.example ?? undefined }, options);
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
    question_type: 'orderTheParts',
    item_id: item.id,
    prompt: { value: item.value, key: 'prompt.orderParts' },
    options: shuffled.map((text) => ({ text })),
    answer: -1,
    parts,
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
  questionType: NumbersQuestionType,
  item: NumberItem,
  ctx: Ctx,
  prompt: NumbersExercise['prompt'],
  ordered: ExerciseOption[],
): NumbersExercise {
  const seed = `${ctx.lesson.id}:${item.id}:${kind}:${ctx.phase}:${ctx.attempt}`;
  const options = shuffle(ordered, seed);
  return {
    id: seed,
    kind,
    question_type: questionType,
    item_id: item.id,
    prompt,
    options,
    answer: options.findIndex((o) => o === ordered[0]),
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
export function practiceExercises(
  lesson: NumberLesson,
  attempt: number,
  options?: RunOptions,
): NumbersExercise[] {
  return generate(lesson, attempt, 'practice', 2, options);
}

/**
 * The mastery check: `lesson.mastery_count` questions covering every item at
 * least once, kinds rotated so no two consecutive questions share one.
 */
export function masteryExercises(
  lesson: NumberLesson,
  attempt: number,
  options?: RunOptions,
): NumbersExercise[] {
  const all = generate(lesson, attempt, 'mastery', 3, options);
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
  return spreadAnswers(shuffle(chosen, `${lesson.id}:mastery:${attempt}`), `${lesson.id}:columns:${attempt}`);
}

/**
 * The answer walks the columns across a mastery check.
 *
 * Each question's options are shuffled on their own seed, which makes the
 * position of any one answer unpredictable and says nothing about the *set*.
 * The zero lesson drew four four-option questions whose seeds independently put
 * the answer at index 2 — a 1-in-64 coincidence, and a learner who tapped the
 * third button four times passed the check without reading a word. Independence
 * is the property that allows that, not a bug in the shuffle.
 *
 * So the last step of building a check assigns the columns rather than hoping
 * for them: a hashed permutation of `0..3`, walked in order, and each question's
 * options **rotated** — not re-shuffled — until its answer lands on the column
 * it was given. Rotating keeps the distractor order the per-question seed chose,
 * so leaving the check and coming back still finds the options where they were,
 * and the starting permutation changes with the lesson and the attempt so a
 * retake is not the same walk.
 */
function spreadAnswers(list: NumbersExercise[], seed: string): NumbersExercise[] {
  const columns = shuffle([0, 1, 2, 3], seed);
  let step = 0;
  return list.map((exercise) => {
    if (exercise.kind === 'order_parts' || exercise.options.length < 2) return exercise;
    const want = columns[step++ % columns.length]! % exercise.options.length;
    const by = (exercise.answer - want + exercise.options.length) % exercise.options.length;
    if (by === 0) return exercise;
    const options = [...exercise.options.slice(by), ...exercise.options.slice(0, by)];
    return { ...exercise, options, answer: want };
  });
}

function generate(
  lesson: NumberLesson,
  attempt: number,
  phase: string,
  perItem: number,
  options?: RunOptions,
): NumbersExercise[] {
  const siblings = numberLessonItems(lesson);
  const available = kindsFor(lesson, options);
  const out: NumbersExercise[] = [];
  for (const item of siblings) {
    let made = 0;
    const kinds = shuffle(available, `${lesson.id}:${item.id}:kinds:${attempt}`);
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
export function exerciseCoverage(
  lesson: NumberLesson,
  options?: RunOptions,
): { exercises: number; thinItems: string[]; kinds: Set<NumbersExerciseKind> } {
  const items = numberLessonItems(lesson);
  const kinds = new Set<NumbersExerciseKind>();
  const thin: string[] = [];
  let total = 0;
  for (const item of items) {
    let n = 0;
    for (const kind of kindsFor(lesson, options)) {
      const ex = BUILDERS[kind](item, { lesson, siblings: items, attempt: 0, phase: 'practice' });
      if (ex) { n += 1; kinds.add(kind); }
    }
    total += n;
    if (n < 2) thin.push(item.id);
  }
  return { exercises: total, thinItems: thin, kinds };
}

export { getNumberItem };
