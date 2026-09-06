import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NUMBER_ITEMS, NUMBER_LESSONS } from '../../data/numbers';
import { MEANING_PROMPT_KEY, masteryExercises, practiceExercises } from './exercises';

/**
 * What a Numbers question asks, and what it prints above the options.
 *
 * ## The defect these are here for
 *
 * A screenshot of the counting-form lesson: four buttons reading 세 시 · 두 개 ·
 * 한 명 · 셋 시, under the heading **어느 쪽이 맞을까요?** — *which one is
 * right?* Three of those four are right. The answer the grader wanted was 셋 시,
 * the one that is **wrong**, because the exercise was built by `spot_mistake`
 * and `spot_mistake` asks a learner to find the mistake. The heading came from
 * the exercise *kind*, and the kind is a fact about how the options were
 * assembled rather than about what the learner is being asked to do.
 *
 * A second screenshot, from the review lesson: 한 개, under **이건 무슨
 * 뜻일까요?** — *what does this mean?* — with four whole sentences of grammar to
 * choose between (*세는 말은 띄어 써요*, *6월은 유월, 육월은 없어요*, …). 한 개
 * does not mean any of them. That question is *which of these statements is
 * true*, and it was wearing the meaning question's instruction because both are
 * built by `read_choose`.
 *
 * So the question type is data — `NumbersExercise.question_type`, resolved once
 * where the exercise is built, from `NumberItem.gloss_kind` where the content
 * decides it — and the page switches on nothing else. These tests hold that
 * shut from both ends: the type each builder produces, and the instruction each
 * type resolves to in every one of the thirty-two bundles.
 */

const LOCALES = join(__dirname, '../../locales');
const bundle = (locale: string) =>
  JSON.parse(readFileSync(join(LOCALES, locale, 'numbers.json'), 'utf8')) as Record<string, unknown>;
const at = (obj: unknown, dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], obj);

const localeNames = readdirSync(LOCALES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const everyExercise = NUMBER_LESSONS.flatMap((lesson) =>
  [0, 1, 2].flatMap((attempt) => [
    ...practiceExercises(lesson, attempt),
    ...masteryExercises(lesson, attempt),
  ]),
);

/** The one prompt key each question type is allowed to print. */
const PROMPT_KEY = {
  findIncorrectExpression: 'prompt.findIncorrectExpression',
  chooseCorrectExplanation: 'prompt.chooseCorrectExplanation',
  listenAndChoose: 'prompt.listenAndChoose',
  // Five, one per domain a meaning question can be asked about — see
  // `MEANING_PROMPT_KEY`. The definition case is the table's representative.
  chooseMeaning: 'prompt.meaning.definition',
  chooseSystem: 'prompt.chooseSystem',
  sayTheNumber: 'prompt.digitsToKorean.sino',
  writeTheDigits: 'prompt.koreanToDigits',
  chooseCounterForm: 'prompt.counterForm',
  fillTheBlank: 'prompt.fill',
  orderTheParts: 'prompt.orderParts',
} as const;

describe('Numbers question types', () => {
  it('asks a spot-the-mistake question as findIncorrectExpression', () => {
    const spotters = everyExercise.filter((e) => e.kind === 'spot_mistake');
    expect(spotters.length).toBeGreaterThan(0);
    for (const exercise of spotters) {
      expect(exercise.question_type, exercise.id).toBe('findIncorrectExpression');
    }
    // And nothing else produces it: the instruction *find the wrong one* may
    // only appear over a question whose answer is the wrong one.
    for (const exercise of everyExercise) {
      if (exercise.question_type === 'findIncorrectExpression') {
        expect(exercise.kind, exercise.id).toBe('spot_mistake');
      }
    }
  });

  it('prints 다음 중 틀린 표현을 고르세요 over an incorrect-expression question', () => {
    expect(at(bundle('ko'), PROMPT_KEY.findIncorrectExpression)).toBe('다음 중 틀린 표현을 고르세요.');
  });

  it('asks an explanation-gloss question as chooseCorrectExplanation', () => {
    const explanations = NUMBER_ITEMS.filter((i) => i.gloss_kind === 'explanation');
    expect(explanations.length).toBeGreaterThan(0);
    for (const exercise of everyExercise) {
      if (exercise.kind !== 'read_choose') continue;
      const item = NUMBER_ITEMS.find((i) => i.id === exercise.item_id)!;
      expect(exercise.question_type, `${exercise.id} (${item.korean})`).toBe(
        item.gloss_kind === 'explanation' ? 'chooseCorrectExplanation' : 'chooseMeaning',
      );
    }
  });

  it('prints 다음 중 올바른 설명을 고르세요 over an explanation question', () => {
    expect(at(bundle('ko'), PROMPT_KEY.chooseCorrectExplanation)).toBe('다음 중 올바른 설명을 고르세요.');
  });

  it('keeps the meaning and listening instructions on their own questions', () => {
    /*
     * *무슨 뜻일까요?* is retired. It was the instruction over four prices and
     * over four clock times as well as over four definitions, and in two of
     * those three it told the learner the question was about something it was
     * not. Each domain names what it is asking for.
     */
    expect(at(bundle('ko'), 'prompt.meaning.definition')).toBe('이 말은 무엇을 나타낼까요?');
    expect(at(bundle('ko'), 'prompt.meaning.moneyAmount')).toBe('얼마를 뜻할까요?');
    expect(at(bundle('ko'), 'prompt.meaning.clockTime')).toBe('몇 시일까요?');
    expect(at(bundle('ko'), 'prompt.chooseMeaning')).toBeUndefined();
    expect(at(bundle('ko'), PROMPT_KEY.listenAndChoose)).toBe('무엇이라고 들렸나요?');
    for (const exercise of everyExercise) {
      if (exercise.question_type !== 'chooseMeaning') continue;
      // The instruction is chosen by the answer's domain, and every domain a
      // meaning question is built for has one.
      expect(MEANING_PROMPT_KEY[exercise.schema.answerDomain], exercise.id).toBeTruthy();
    }
    for (const exercise of everyExercise) {
      if (exercise.kind === 'listen_choose') expect(exercise.question_type).toBe('listenAndChoose');
      if (exercise.question_type === 'chooseMeaning') {
        const item = NUMBER_ITEMS.find((i) => i.id === exercise.item_id)!;
        expect(item.gloss_kind ?? 'meaning', item.korean).toBe('meaning');
      }
    }
  });

  it('shows the contrast pair, not the bare word, on an explanation question', () => {
    /*
     * 한 개 on its own is explained by two of the five rules at once — the
     * counting form *and* the space — so the question has two answers. `한 개
     * (✓) · 한개 (✗)` is explained by exactly one of them.
     */
    const asked = everyExercise.filter((e) => e.question_type === 'chooseCorrectExplanation');
    expect(asked.length).toBeGreaterThan(0);
    for (const exercise of asked) {
      const item = NUMBER_ITEMS.find((i) => i.id === exercise.item_id)!;
      if (item.example) expect(exercise.prompt.text, item.korean).toBe(item.example);
    }
  });

  it('gives every question type exactly one instruction, in all 32 languages', () => {
    expect(localeNames.length).toBe(32);
    for (const locale of localeNames) {
      const pack = bundle(locale);
      for (const key of [...Object.values(PROMPT_KEY), ...Object.values(MEANING_PROMPT_KEY)]) {
        const value = at(pack, key);
        expect(typeof value, `${locale} ${key}`).toBe('string');
        expect(String(value).trim(), `${locale} ${key}`).not.toBe('');
      }
      // The keys that were chosen by exercise kind, and the one that asked the
      // opposite question, are gone rather than merely unused.
      for (const dead of ['prompt.spotMistake', 'prompt.read', 'prompt.listen', 'prompt.chooseMeaning']) {
        expect(at(pack, dead), `${locale} ${dead}`).toBeUndefined();
      }
    }
  });

  it('gives every built question a declared instruction', () => {
    const seen = new Set(everyExercise.map((e) => e.question_type));
    for (const type of seen) expect(Object.keys(PROMPT_KEY), type).toContain(type);
    expect(seen.size).toBeGreaterThanOrEqual(9);
  });
});

describe('Numbers example headings', () => {
  /**
   * *이렇게 써요* means both *this is how you write it* and *this is how you use
   * it*, and it sat over every example in the course. On 유월 육일 a learner
   * takes the first reading, and the card is there to teach the second — that
   * June is *said* 유월 and never 육월. So the heading is chosen from the item's
   * declared `example_kind`.
   */
  it('heads a sound-change example with 이렇게 발음해요', () => {
    for (const id of ['num-d-june', 'num-d-october', 'num-p-phone', 'num-x-simnyuk', 'num-x-june']) {
      const item = NUMBER_ITEMS.find((i) => i.id === id)!;
      expect(item.example_kind, id).toBe('pronunciation');
    }
    expect(at(bundle('ko'), 'exampleLabel.pronunciation')).toBe('이렇게 발음해요');
  });

  it('keeps 이렇게 써요 for the examples that really are about spelling', () => {
    expect(at(bundle('ko'), 'exampleLabel.writing')).toBe('이렇게 써요');
    const writing = NUMBER_ITEMS.filter((i) => i.example_kind === 'writing');
    expect(writing.length).toBeGreaterThan(0);
    // A spelling card shows a written contrast; otherwise it is a use example.
    for (const item of writing) expect(item.example, item.id).toContain('✗');
  });

  it('declares a heading for every example, in all 32 languages', () => {
    for (const item of NUMBER_ITEMS) {
      if (item.example) expect(['writing', 'pronunciation', 'example'], item.id).toContain(item.example_kind);
      else expect(item.example_kind, item.id).toBeUndefined();
    }
    for (const locale of localeNames) {
      for (const kind of ['writing', 'pronunciation', 'example']) {
        expect(typeof at(bundle(locale), `exampleLabel.${kind}`), `${locale} ${kind}`).toBe('string');
      }
    }
  });
});

describe('Korean number spacing', () => {
  /**
   * A counted quantity is spaced and an ordinal is closed. The course shipped
   * *삼월 일 일*, *유월 육 일*, *시월 십 일* and *십오 일*; the first reads as
   * two ones on the screen of the lesson that exists to explain that 일 is both.
   */
  const BANNED = ['삼월 일 일', '삼월 이 일', '유월 육 일', '시월 십 일', '십오 일', '이천이십육 년'];

  it('writes an ordinal date closed everywhere it appears', () => {
    /*
     * The half marked (✗) is the course naming the mistake, not making it.
     * 삼월 일 일 appears once, beside 삼월 일일 (✓), because that contrast is
     * how the closed-date rule is taught; `spokenText` cuts the same half, so
     * no recording ever says it.
     */
    const written = (example: string) =>
      example.includes('(✗)') ? example.split('·')[0]!.replace(/\(✓\)/, '').trim() : example;
    const strings = [
      ...NUMBER_ITEMS.flatMap((i) => [i.korean, written(i.example ?? '')]),
      ...localeNames.flatMap((locale) => [JSON.stringify(bundle(locale))]),
    ];
    for (const text of strings) {
      for (const banned of BANNED) expect(text, banned).not.toContain(banned);
    }
  });

  it('has the corrected forms in the curriculum and in the audio manifest', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '../../../public/audio/manifest.json'), 'utf8'),
    ) as { entries: { id: string; text: string }[] };
    for (const form of ['삼월 일일', '유월 육일', '시월 십일']) {
      expect(
        NUMBER_ITEMS.some((i) => i.korean === form || i.example?.includes(form)),
        `no item writes ${form}`,
      ).toBe(true);
      expect(manifest.entries.some((e) => e.text.includes(form)), `no clip says ${form}`).toBe(true);
    }
    // And the clips that said the old sentences are gone, so a cached id cannot
    // keep playing 삼월 일 일 after the text was corrected.
    for (const stale of BANNED) {
      expect(manifest.entries.some((e) => e.text === stale), stale).toBe(false);
    }
  });

  it('keeps a counted quantity spaced', () => {
    for (const item of NUMBER_ITEMS) {
      const spoken = item.example?.split('·')[0] ?? item.korean;
      expect(spoken, item.id).not.toMatch(/(한|두|세|네|스무)(개|명|마리|살|잔|병|권|장)/);
    }
  });
});

/**
 * The ordinals, from both ends: what the data says and what a bundle prints.
 *
 * The rule a beginner needs is short and the ways of getting it wrong are
 * specific — 한 번째 reaches for the counting form, 일 번째 and 이 번째 for the
 * Sino-Korean set, 첫번째 loses the space §43 requires and 첫 째 gains one the
 * suffix does not take. Each is written into the course *once*, as the marked
 * half of a contrast, and nowhere else; these hold both halves of that.
 */
describe('the ordinal lesson', () => {
  const ORDINALS = NUMBER_LESSONS.find((l) => l.id === 'num-lesson-ordinals')!;
  const items = ORDINALS.item_ids.map((id) => NUMBER_ITEMS.find((i) => i.id === id)!);
  /** Anchored left, so 스물한 번째 does not read as 한 번째. */
  const wrongForms = ['한 번째', '일 번째', '이 번째', '삼 번째', '첫번째', '두번째', '세번째', '첫 째', '둘 째', '셋 째'];
  const contains = (text: string, form: string) => new RegExp(`(^|[^가-힣])${form}`, 'u').test(text);

  it('teaches both families and keeps them in separate answer domains', () => {
    const positions = items.filter((i) => i.domain === 'ordinalPosition').map((i) => i.korean);
    const ranks = items.filter((i) => i.domain === 'ordinalRank').map((i) => i.korean);
    expect(positions).toEqual(['첫 번째', '두 번째', '세 번째', '네 번째']);
    expect(ranks).toEqual(['첫째', '둘째', '셋째', '넷째', '다섯째']);
    // 첫 번째 and 첫째 are the same position and not the same expression, so
    // they are grouped as well as separated: neither may be the other's
    // distractor under any instruction.
    for (const [a, b] of [['첫 번째', '첫째'], ['두 번째', '둘째'], ['세 번째', '셋째'], ['네 번째', '넷째']]) {
      const left = items.find((i) => i.korean === a)!;
      const right = items.find((i) => i.korean === b)!;
      expect(left.gloss_group, `${a} is not grouped`).toBeTruthy();
      expect(left.gloss_group).toBe(right.gloss_group);
      expect(left.domain).not.toBe(right.domain);
    }
  });

  it('is not a cardinal question in disguise', () => {
    // No `value`, so `digits_to_korean` and `korean_to_digits` cannot build:
    // 첫 번째 is *first*, not 1, and a numeral over these options would be
    // asking a different question with the ordinal lesson's buttons.
    for (const item of items.filter((i) => i.domain !== 'definition')) {
      expect(item.value, `${item.id} carries a value`).toBeNull();
      expect(item.system, `${item.id} does not say which set it takes`).toBe('native');
    }
    for (const exercise of everyExercise.filter((e) => e.item_id.startsWith('num-o-'))) {
      expect(exercise.kind, exercise.id).not.toBe('digits_to_korean');
      expect(exercise.kind, exercise.id).not.toBe('korean_to_digits');
    }
  });

  it('shows each wrong form exactly once, against the form it is wrong for', () => {
    const pairs = items
      .filter((i) => i.example?.includes('(✗)'))
      .map((i) => [i.korean, i.example!.split('·')[1]!.replace(/\(✗\)/, '').trim()]);
    expect(pairs).toEqual([
      ['첫 번째', '한 번째'],
      ['두 번째', '이 번째'],
      ['세 번째', '세번째'],
      ['네 번째', '넷 번째'],
    ]);
  });

  it('never accepts a wrong ordinal as the answer, and never voices one', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '../../../public/audio/manifest.json'), 'utf8'),
    ) as { entries: { id: string; text: string }[] };
    for (const entry of manifest.entries) {
      for (const form of wrongForms) expect(contains(entry.text, form), `${entry.id} says ${form}`).toBe(false);
    }
    for (const exercise of everyExercise) {
      const answer = exercise.options[exercise.answer];
      if (!answer || answer.isKey || answer.value !== undefined) continue;
      if (exercise.question_type === 'findIncorrectExpression') continue;
      for (const form of wrongForms) {
        expect(contains(answer.text, form), `${exercise.id} accepts ${answer.text}`).toBe(false);
      }
    }
  });

  it('asks a learner to find each of the four mistakes, and names which mistake it is', () => {
    const found = new Map<string, string | undefined>();
    for (const exercise of everyExercise.filter((e) => e.question_type === 'findIncorrectExpression')) {
      if (!exercise.item_id.startsWith('num-o-')) continue;
      const answer = exercise.options[exercise.answer]!;
      found.set(answer.text, answer.misconception);
    }
    expect([...found.entries()].sort()).toEqual([
      ['넷 번째', 'plain_form'],
      ['세번째', 'spacing'],
      ['이 번째', 'system_swap'],
      ['한 번째', 'ordinal_form'],
    ]);
  });

  it('offers 이 번째 as a distractor before 번째, and calls it a swap of sets', () => {
    const forms = everyExercise.filter((e) => e.question_type === 'chooseCounterForm' && e.item_id === 'num-o-beonjjae');
    expect(forms.length).toBeGreaterThan(0);
    for (const exercise of forms) {
      const texts = exercise.options.map((o) => o.text).sort();
      expect(texts).toEqual(['두 번째', '두번째', '둘 번째', '이 번째'].sort());
      expect(exercise.options[exercise.answer]!.text).toBe('두 번째');
      expect(exercise.options.find((o) => o.text === '이 번째')!.misconception).toBe('system_swap');
    }
  });

  it('carries both new meaning instructions in all thirty-two bundles, and neither is the English', () => {
    expect(MEANING_PROMPT_KEY.ordinalPosition).toBe('prompt.meaning.ordinalPosition');
    expect(MEANING_PROMPT_KEY.ordinalRank).toBe('prompt.meaning.ordinalRank');
    const english = bundle('en');
    for (const locale of localeNames) {
      const pack = bundle(locale);
      for (const key of ['prompt.meaning.ordinalPosition', 'prompt.meaning.ordinalRank']) {
        const value = at(pack, key);
        expect(typeof value, `[${locale}] ${key}`).toBe('string');
        expect(String(value).trim(), `[${locale}] ${key}`).not.toBe('');
        if (locale !== 'en') expect(value, `[${locale}] ${key} is the English`).not.toBe(at(english, key));
      }
      // …and the two are not the same sentence in this language, which is how
      // Vietnamese first wrote them: *thứ mấy* is both a weekday and a position.
      expect(at(pack, 'prompt.meaning.ordinalPosition'), locale).not.toBe(at(pack, 'prompt.meaning.ordinalRank'));
      expect(at(pack, 'prompt.meaning.ordinalPosition'), locale).not.toBe(at(pack, 'prompt.meaning.weekday'));
    }
  });

  it('names a wrong form in a bundle only where it is teaching that it is wrong', () => {
    const licensed = new Set([
      'lesson.ordinals.step2',
      'example.ordinal1', 'example.ordinal2', 'example.ordinal3', 'example.ordinal4',
    ]);
    const flatten = (node: unknown, prefix = ''): [string, string][] =>
      typeof node === 'object' && node !== null
        ? Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => flatten(v, `${prefix}${k}.`))
        : [[prefix.slice(0, -1), String(node)]];
    for (const locale of localeNames) {
      for (const [key, value] of flatten(bundle(locale))) {
        for (const form of wrongForms) {
          if (!contains(value, form)) continue;
          expect(licensed.has(key), `[${locale}] ${key} writes ${form} as if it were Korean`).toBe(true);
        }
      }
    }
  });
});
