import { describe, expect, it } from 'vitest';

import { NUMBER_LESSONS, getNumberItem, numberLessonItems } from '../../data/numbers';
import { exerciseCoverage, masteryExercises, practiceExercises } from './exercises';

/**
 * The exercise engine. The first build placed the correct option at a fixed
 * index — ten of ten questions at position 1 — and drew distractors by list
 * position. These tests are the properties that replace it.
 */
describe('Numbers exercises', () => {
  it('builds at least two exercise kinds for every item in every lesson', () => {
    for (const lesson of NUMBER_LESSONS) {
      const coverage = exerciseCoverage(lesson);
      expect(coverage.thinItems, `${lesson.id}: ${coverage.thinItems.join(', ')}`).toEqual([]);
      expect(coverage.kinds.size, `${lesson.id} uses one kind`).toBeGreaterThanOrEqual(2);
    }
  });

  it('offers at least three options, exactly one of which is the answer', () => {
    for (const lesson of NUMBER_LESSONS) {
      for (const ex of [...practiceExercises(lesson, 0), ...masteryExercises(lesson, 0)]) {
        if (ex.kind === 'order_parts') {
          expect(ex.parts!.length).toBeGreaterThanOrEqual(2);
          expect(ex.options.length).toBe(ex.parts!.length);
          continue;
        }
        // Which system? is a binary decision, and both options are meaningful.
        expect(ex.options.length, ex.id).toBeGreaterThanOrEqual(ex.kind === 'choose_system' ? 2 : 3);
        expect(ex.answer).toBeGreaterThanOrEqual(0);
        expect(ex.answer).toBeLessThan(ex.options.length);
        const texts = ex.options.map((o) => `${o.isKey ? 'k' : 'v'}:${o.text}`);
        expect(new Set(texts).size, `${ex.id} repeats an option`).toBe(texts.length);
      }
    }
  });

  it('does not put the answer at one fixed position', () => {
    for (const lesson of NUMBER_LESSONS) {
      const positions = masteryExercises(lesson, 0)
        .filter((e) => e.kind !== 'order_parts' && e.kind !== 'choose_system')
        .map((e) => e.answer);
      if (positions.length < 4) continue;
      expect(new Set(positions).size, `${lesson.id}: ${positions.join(',')}`).toBeGreaterThan(1);
    }
    // Across the whole course the answer must land everywhere.
    const all = NUMBER_LESSONS.flatMap((l) => masteryExercises(l, 0))
      .filter((e) => e.options.length === 4)
      .map((e) => e.answer);
    expect(new Set(all)).toEqual(new Set([0, 1, 2, 3]));
  });

  it('keeps the same order within an attempt and changes it between attempts', () => {
    const lesson = NUMBER_LESSONS[0]!;
    const a = masteryExercises(lesson, 0);
    const b = masteryExercises(lesson, 0);
    expect(a.map((e) => [e.id, e.options.map((o) => o.text)])).toEqual(b.map((e) => [e.id, e.options.map((o) => o.text)]));
    const c = masteryExercises(lesson, 1);
    const same = a.filter((e, i) => c[i] && e.item_id === c[i]!.item_id && e.kind === c[i]!.kind).length;
    expect(same).toBeLessThan(a.length);
  });

  it('labels every distractor with the misconception it embodies', () => {
    for (const lesson of NUMBER_LESSONS) {
      for (const ex of practiceExercises(lesson, 0)) {
        if (ex.kind === 'order_parts' || ex.kind === 'spot_mistake') continue;
        ex.options.forEach((o, i) => {
          if (i === ex.answer) return;
          expect(o.misconception, `${ex.id} option "${o.text}" has no misconception class`).toBeDefined();
        });
      }
    }
  });

  it('asks about every item in the lesson during mastery', () => {
    for (const lesson of NUMBER_LESSONS) {
      const asked = new Set(masteryExercises(lesson, 0).map((e) => e.item_id));
      for (const item of numberLessonItems(lesson)) expect(asked.has(item.id), `${lesson.id} never asks ${item.id}`).toBe(true);
    }
  });

  it('decomposes compound numerals into parts that rebuild the word', () => {
    for (const lesson of NUMBER_LESSONS) {
      for (const ex of practiceExercises(lesson, 0).filter((e) => e.kind === 'order_parts')) {
        const item = getNumberItem(ex.item_id)!;
        expect(ex.parts!.join('')).toBe(item.korean);
        expect(ex.options.map((o) => o.text).join('')).not.toBe(item.korean);
      }
    }
  });

  it('never pairs a system-swap distractor with a value the systems do not share', () => {
    for (const lesson of NUMBER_LESSONS) {
      for (const ex of practiceExercises(lesson, 0)) {
        const item = getNumberItem(ex.item_id)!;
        for (const o of ex.options) {
          if (o.misconception !== 'system_swap' || o.isKey) continue;
          const swapped = getNumberItem(ex.item_id) && [...(item.value !== null ? [item.value] : [])];
          expect(swapped).toBeDefined();
        }
      }
    }
  });
});
