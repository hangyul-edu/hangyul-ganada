/**
 * The wrong-answer notebook, and the three things it must not become.
 *
 * Not a log — one row per item, not one per wrong answer. Not a punishment —
 * a mistake that has been fixed stops taking up the screen. And not a second
 * copy of the review scheduler — it records what *happened*, and the scheduler
 * decides what to do about it.
 */
import { describe, expect, it } from 'vitest';

import {
  RECOVERY_STREAK,
  applyAnswer,
  isRecovered,
  listMistakes,
  mistakeUrgency,
  unresolvedCount,
  type Mistake,
  type MistakeMap,
} from './mistakes';

const T0 = new Date('2026-07-01T09:00:00.000Z');
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

const wrong = (itemKey: string, chose = 'other') => ({
  kind: 'word' as const,
  itemKey,
  skill: 'meaning_recognition' as const,
  mode: 'read' as const,
  passed: false,
  chose,
  answer: itemKey,
});

const right = (itemKey: string) => ({ ...wrong(itemKey), passed: true, chose: undefined });

describe('recording an answer', () => {
  it('creates a row from a wrong answer, with what was picked and what was right', () => {
    const mistake = applyAnswer(undefined, wrong('word_eomma', 'word_appa'), T0)!;
    expect(mistake).toMatchObject({
      id: 'word:word_eomma',
      itemKey: 'word_eomma',
      chose: 'word_appa',
      answer: 'word_eomma',
      wrongCount: 1,
      correctSince: 0,
    });
    expect(mistake.firstAt).toBe(T0.toISOString());
  });

  it('records nothing at all for a correct answer to something never missed', () => {
    // §58. Getting things right is the normal case, and a notebook of normal
    // cases is a notebook nobody opens.
    expect(applyAnswer(undefined, right('word_eomma'), T0)).toBeNull();
  });

  it('keeps one row per item however many times it is missed', () => {
    // Missing 엄마 three times is one thing to fix, not three things to read.
    let mistake = applyAnswer(undefined, wrong('word_eomma'), T0)!;
    mistake = applyAnswer(mistake, wrong('word_eomma'), later(10))!;
    mistake = applyAnswer(mistake, wrong('word_eomma'), later(20))!;
    expect(mistake.wrongCount).toBe(3);
    expect(mistake.firstAt).toBe(T0.toISOString());
    expect(mistake.lastAt).toBe(later(20).toISOString());
  });

  it('remembers the most recent way it went wrong', () => {
    // The question the learner has just been surprised by is the one worth
    // showing them, not the one from a fortnight ago.
    let mistake = applyAnswer(undefined, wrong('word_eomma', 'word_appa'), T0)!;
    mistake = applyAnswer(
      mistake,
      { ...wrong('word_eomma', 'word_saram'), mode: 'listen', skill: 'listening_recognition' },
      later(10),
    )!;
    expect(mistake.mode).toBe('listen');
    expect(mistake.chose).toBe('word_saram');
  });

  it('counts corrects towards recovery without erasing the history', () => {
    let mistake = applyAnswer(undefined, wrong('word_eomma'), T0)!;
    mistake = applyAnswer(mistake, right('word_eomma'), later(10))!;
    expect(mistake.correctSince).toBe(1);
    expect(mistake.wrongCount, 'the history is kept').toBe(1);
  });

  it('resets recovery when the item goes wrong again', () => {
    let mistake = applyAnswer(undefined, wrong('word_eomma'), T0)!;
    mistake = applyAnswer(mistake, right('word_eomma'), later(10))!;
    mistake = applyAnswer(mistake, wrong('word_eomma'), later(20))!;
    expect(mistake.correctSince).toBe(0);
    expect(isRecovered(mistake)).toBe(false);
  });
});

describe('recovering', () => {
  it('needs more than one correct answer', () => {
    // One right answer straight after being shown the right one is a memory of
    // the last ten seconds. The second comes after something else has been in
    // the learner's head.
    expect(RECOVERY_STREAK).toBeGreaterThan(1);
    let mistake = applyAnswer(undefined, wrong('word_eomma'), T0)!;
    mistake = applyAnswer(mistake, right('word_eomma'), later(10))!;
    expect(isRecovered(mistake)).toBe(false);
    mistake = applyAnswer(mistake, right('word_eomma'), later(60))!;
    expect(isRecovered(mistake)).toBe(true);
  });

  it('drops a recovered item out of the active notebook but keeps the record', () => {
    // §39: a mistake is not a permanent mark. The row survives — it is what
    // makes the scheduler treat the item as genuinely difficult — and it stops
    // occupying a screen that exists for things still going wrong.
    let mistake = applyAnswer(undefined, wrong('word_eomma'), T0)!;
    for (let i = 0; i < RECOVERY_STREAK; i += 1) {
      mistake = applyAnswer(mistake, right('word_eomma'), later(10 * (i + 1)))!;
    }
    const map: MistakeMap = { [mistake.id]: mistake };
    expect(listMistakes(map)).toEqual([]);
    expect(unresolvedCount(map)).toBe(0);
    expect(listMistakes(map, { includeRecovered: true })).toHaveLength(1);
  });
});

describe('the notebook', () => {
  const map: MistakeMap = {};
  const add = (mistake: Mistake) => {
    map[mistake.id] = mistake;
  };
  add(applyAnswer(undefined, wrong('word_a'), T0)!);
  add(applyAnswer(undefined, { ...wrong('word_b'), kind: 'word' }, later(30))!);
  add(
    applyAnswer(
      undefined,
      { ...wrong('ㄱ'), kind: 'character', skill: 'visual_recognition' },
      later(60),
    )!,
  );

  it('lists the most recently missed first', () => {
    // The learner is looking for what just went wrong. How often it happens is
    // on the row, for the ones that keep happening.
    expect(listMistakes(map).map((m) => m.itemKey)).toEqual(['ㄱ', 'word_b', 'word_a']);
  });

  it('filters letters from words', () => {
    expect(listMistakes(map, { kind: 'character' }).map((m) => m.itemKey)).toEqual(['ㄱ']);
    expect(listMistakes(map, { kind: 'word' }).map((m) => m.itemKey)).toEqual([
      'word_b',
      'word_a',
    ]);
  });
});

describe('what a mistake is worth to the scheduler', () => {
  it('raises priority, and stops raising it', () => {
    // §29: a wrong answer should bring an item back, and should not sentence
    // the learner to being asked it forever.
    let mistake = applyAnswer(undefined, wrong('word_eomma'), T0)!;
    const once = mistakeUrgency(mistake);
    expect(once).toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) {
      mistake = applyAnswer(mistake, wrong('word_eomma'), later(10 * i))!;
    }
    expect(mistakeUrgency(mistake)).toBeLessThanOrEqual(1);
    expect(mistakeUrgency(mistake)).toBeGreaterThanOrEqual(once);
  });

  it('is worth nothing once the item is recovered', () => {
    let mistake = applyAnswer(undefined, wrong('word_eomma'), T0)!;
    for (let i = 0; i < RECOVERY_STREAK; i += 1) {
      mistake = applyAnswer(mistake, right('word_eomma'), later(10 * (i + 1)))!;
    }
    expect(mistakeUrgency(mistake)).toBe(0);
  });

  it('is worth nothing for an item that has never been missed', () => {
    expect(mistakeUrgency(undefined)).toBe(0);
  });
});
