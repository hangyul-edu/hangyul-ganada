import { describe, expect, it } from 'vitest';

import { NUMBER_ITEMS, NUMBER_LESSONS, getNumberItem } from '../../data/numbers';
import { numberParts, splitNumeral } from './parts';

/**
 * The segmenter behind the visual breakdown.
 *
 * What is being pinned is mostly what it *refuses* to do. A generator that
 * turned 16 into 십육 and drew it as 십 + 육 would be teaching a spelling
 * against a sound the learner is about to be told is 심뉵; one that turned
 * 10,000 into 일만 would be teaching a word Korean does not use. This reads the
 * authored Korean instead, so it can only ever return pieces that were already
 * in the word — and returns nothing at all when it is not sure.
 */
describe('splitting a numeral', () => {
  it('splits a sino number into its places, in reading order', () => {
    expect(splitNumeral('삼십오')).toEqual([
      { korean: '삼', place: 'ones' },
      { korean: '십', place: 'ten' },
      { korean: '오', place: 'ones' },
    ]);
  });

  it('splits eleven and twenty the way they are said', () => {
    expect(splitNumeral('십일')?.map((p) => p.korean)).toEqual(['십', '일']);
    expect(splitNumeral('이십')?.map((p) => p.korean)).toEqual(['이', '십']);
  });

  it('keeps a native tens word whole', () => {
    // 스물 is not two-ten in Korean, and splitting it would teach a false rule.
    expect(splitNumeral('스물')).toEqual([{ korean: '스물', place: 'tens' }]);
    expect(splitNumeral('서른')).toEqual([{ korean: '서른', place: 'tens' }]);
  });

  it('takes the longest atom first, so 하나 is never 하 + 나', () => {
    expect(splitNumeral('열하나')?.map((p) => p.korean)).toEqual(['열', '하나']);
    expect(splitNumeral('여덟')?.map((p) => p.korean)).toEqual(['여덟']);
  });

  it('returns nothing for anything it cannot account for', () => {
    expect(splitNumeral('개')).toBeNull();
    expect(splitNumeral('두 시')).toBeNull();
    expect(splitNumeral('')).toBeNull();
  });
});

describe('what earns a breakdown', () => {
  it('draws nothing for a number with one part', () => {
    // 오 is 5. A diagram of one chip pointing at itself is the visual form of
    // the tautology the Numbers feedback was cleared of.
    expect(numberParts(getNumberItem('num-sino-5')!)).toBeNull();
  });

  it('draws nothing where the sound differs from the spelling', () => {
    // 십육 is said 심뉵. Chips reading 십 + 육 would hide the whole lesson.
    const sixteen = getNumberItem('num-sino-16')!;
    expect(sixteen.reading).not.toBe(sixteen.korean);
    expect(numberParts(sixteen)).toBeNull();
  });

  it('draws nothing for a counter or a phrase', () => {
    for (const item of NUMBER_ITEMS) {
      if (item.role === 'numeral') continue;
      expect(numberParts(item), item.korean).toBeNull();
    }
  });

  it('never invents a piece that was not in the word', () => {
    for (const item of NUMBER_ITEMS) {
      const parts = numberParts(item);
      if (!parts) continue;
      expect(parts.map((part) => part.korean).join(''), item.korean).toBe(item.korean);
    }
  });

  it('has a breakdown for every number a lesson asks it to draw', () => {
    /*
      The lessons name the items they want drawn. A named item that cannot be
      split renders nothing, which would leave the step as the bare sentence it
      was — silently, and looking exactly like a working screen.
    */
    // Read from the lessons themselves, so a new `show` is covered on the day
    // it is added rather than the day somebody remembers this file.
    const asked = NUMBER_LESSONS.flatMap((lesson) =>
      lesson.explanation.flatMap((step) => step.show ?? []),
    );
    expect(asked.length).toBeGreaterThan(0);
    for (const id of asked) {
      const item = getNumberItem(id);
      expect(item, `${id} is named by a lesson`).toBeTruthy();
      expect(numberParts(item!), `${id} draws nothing`).toBeTruthy();
    }
  });
});
