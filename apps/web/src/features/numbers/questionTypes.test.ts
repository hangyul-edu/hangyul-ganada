import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NUMBER_ITEMS, NUMBER_LESSONS } from '../../data/numbers';
import { masteryExercises, practiceExercises } from './exercises';

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
  chooseMeaning: 'prompt.chooseMeaning',
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
    expect(at(bundle('ko'), PROMPT_KEY.chooseMeaning)).toBe('무슨 뜻일까요?');
    expect(at(bundle('ko'), PROMPT_KEY.listenAndChoose)).toBe('무엇이라고 들렸나요?');
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
      for (const key of Object.values(PROMPT_KEY)) {
        const value = at(pack, key);
        expect(typeof value, `${locale} ${key}`).toBe('string');
        expect(String(value).trim(), `${locale} ${key}`).not.toBe('');
      }
      // The keys that were chosen by exercise kind, and the one that asked the
      // opposite question, are gone rather than merely unused.
      for (const dead of ['prompt.spotMistake', 'prompt.read', 'prompt.listen']) {
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
    const strings = [
      ...NUMBER_ITEMS.flatMap((i) => [i.korean, i.example ?? '']),
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
