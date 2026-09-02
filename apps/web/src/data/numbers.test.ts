import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  NUMBER_ITEMS,
  NUMBER_LESSONS,
  NUMBER_MODULES,
  getNumberItem,
  getNumberLesson,
  numberItemKey,
  numberLessonItems,
  spokenExample,
} from './numbers';
import { exampleMeaning, formatValue, numberMeaning } from '../features/numbers/meaning';

/**
 * The Numbers curriculum, as data.
 *
 * `scripts/numbers-qa.mjs` is the gate that reads the thirty-two translation
 * bundles; this is the part that can run without them — the shape of the data,
 * the lesson graph, the audio contract and the meaning resolution.
 */
describe('the Numbers curriculum', () => {
  it('has six modules, each with at least two lessons, in index order', () => {
    expect(NUMBER_MODULES.length).toBe(6);
    NUMBER_MODULES.forEach((m, i) => {
      expect(m.index).toBe(i + 1);
      expect(m.lesson_ids.length, `${m.id} has ${m.lesson_ids.length} lesson(s)`).toBeGreaterThanOrEqual(2);
      for (const id of m.lesson_ids) expect(getNumberLesson(id)?.module).toBe(m.id);
    });
    expect(NUMBER_LESSONS.length).toBeGreaterThanOrEqual(18);
  });

  it('namespaces every id so it can never collide with a letter or a word', () => {
    for (const item of NUMBER_ITEMS) expect(item.id).toMatch(/^num-[a-z0-9-]+$/);
    for (const lesson of NUMBER_LESSONS) expect(lesson.id).toMatch(/^num-lesson-[a-z0-9-]+$/);
    for (const m of NUMBER_MODULES) expect(m.id).toMatch(/^mod-[a-z-]+$/);
    expect(new Set(NUMBER_ITEMS.map((i) => i.id)).size).toBe(NUMBER_ITEMS.length);
    expect(new Set(NUMBER_LESSONS.map((l) => l.id)).size).toBe(NUMBER_LESSONS.length);
    // The item key is the id, unprefixed: the store adds the kind exactly once.
    expect(numberItemKey('num-sino-1')).toBe('num-sino-1');
  });

  it('orders prerequisites before the lessons that need them', () => {
    const position = new Map(NUMBER_LESSONS.map((l, i) => [l.id, i]));
    for (const lesson of NUMBER_LESSONS) {
      for (const pre of lesson.prerequisites) {
        expect(position.has(pre), `${lesson.id} requires unknown ${pre}`).toBe(true);
        expect(position.get(pre)!, `${lesson.id} requires later ${pre}`).toBeLessThan(position.get(lesson.id)!);
      }
    }
    expect(NUMBER_LESSONS.filter((l) => l.prerequisites.length === 0).map((l) => l.id)).toEqual([
      'num-lesson-sino-basics',
    ]);
  });

  it('gives every lesson an objective, explanation steps, items, and at least two exercise kinds', () => {
    for (const lesson of NUMBER_LESSONS) {
      expect(lesson.objective).toMatch(/^lesson\.\w+\.objective$/);
      expect(lesson.explanation.length).toBeGreaterThanOrEqual(2);
      expect(numberLessonItems(lesson).length).toBe(lesson.item_ids.length);
      expect(lesson.item_ids.length).toBeGreaterThanOrEqual(4);
      expect(new Set(lesson.exercise_kinds).size).toBeGreaterThanOrEqual(2);
      expect(lesson.mastery_count).toBeGreaterThanOrEqual(4);
    }
  });

  it('gives every item a way to state its meaning', () => {
    for (const item of NUMBER_ITEMS) {
      expect(item.gloss !== null || item.value !== null, `${item.id} has neither a gloss nor a value`).toBe(true);
    }
  });

  it('has a recorded clip for every word and every example', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '../../public/audio/manifest.json'), 'utf8'),
    ) as { entries: Array<{ id: string; text: string }> };
    const byId = new Map(manifest.entries.map((e) => [e.id, e.text]));
    for (const item of NUMBER_ITEMS) {
      expect(byId.get(item.audio.word), `${item.id} word clip ${item.audio.word}`).toBe(item.korean);
      if (item.example) {
        // A right/wrong pair is recorded as the right form only.
        expect(byId.get(item.audio.example!), `${item.id} example clip`).toBe(spokenExample(item));
      } else {
        expect(item.audio.example).toBeNull();
      }
    }
  });

  it('writes the counting form before every native counter in its examples', () => {
    // 한 개, never 하나 개. The pitfalls lesson's deliberate wrong halves are
    // marked (✗) and are the only allowed occurrence.
    const plain = /(하나|둘|셋|넷|스물) (개|명|마리|살|시|잔|병|권|장|대|번|그루|송이|시간|사람|분)/;
    for (const item of NUMBER_ITEMS) {
      const text = (item.example ?? '').split('·').filter((half) => !half.includes('✗')).join('·');
      expect(plain.test(text), `${item.id}: "${item.example}"`).toBe(false);
    }
  });

  it('records a reading wherever the spelling is not what is said', () => {
    expect(getNumberItem('num-sino-16')?.reading).toBe('심뉵');
    expect(getNumberItem('num-nat-8')?.reading).toBe('여덜');
    for (const item of NUMBER_ITEMS) {
      if (item.reading) expect(item.reading).not.toBe(item.korean);
    }
  });

  it('resolves a bare numeral through Intl rather than a translation', () => {
    const ten = getNumberItem('num-sino-10')!;
    expect(ten.gloss).toBeNull();
    const t = (key: string) => `MISSING:${key}`;
    expect(numberMeaning(ten, 'en', t)).toBe('10');
    expect(numberMeaning(ten, 'de', t)).toBe('10');
    expect(numberMeaning(ten, 'ar', t)).toBe(formatValue(10, 'ar'));
    expect(formatValue(10000, 'en')).toBe('10,000');
    expect(formatValue(10000, 'de')).toBe('10.000');
  });

  it('resolves a glossed item and its example through the translator', () => {
    const t = (key: string) => `T(${key})`;
    const zero = getNumberItem('num-zero-yeong')!;
    expect(numberMeaning(zero, 'en', t)).toBe('T(numbers:gloss.zeroMath)');
    expect(exampleMeaning(zero, t)).toBe('T(numbers:example.zeroMath)');
    expect(exampleMeaning(getNumberItem('num-sino-1')!, t)).toBeNull();
  });
});
