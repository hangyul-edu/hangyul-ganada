import { describe, expect, it } from 'vitest';

import { analyse } from './analyse';

/**
 * The words a learner types into a dictionary.
 *
 * Every case here is a form a beginner meets in their first months and cannot
 * look up without this: 먹었어요 is in no dictionary, and telling somebody
 * "nothing matches" because they typed the word the way Korean actually writes
 * it is the search failing at the one thing it is for.
 */
const KNOWN = new Set([
  '먹다', '걷다', '걸다', '듣다', '들다', '모르다', '쓰다', '부르다', '하다', '살다',
  '짓다', '낫다', '돕다', '춥다', '좋다', '그렇다', '읽다', '가다', '보다', '마시다',
  '공부하다', '만들다', '있다', '예쁘다',
]);
const isHeadword = (lemma: string) => KNOWN.has(lemma);

/** `surface → the dictionary forms it may be`, in no particular order. */
const CASES: Array<[string, string[]]> = [
  ['먹었어요', ['먹다']],
  ['먹어요', ['먹다']],
  ['먹을 거예요', ['먹다']],
  ['먹습니다', ['먹다']],
  ['먹으세요', ['먹다']],
  // Two real verbs, one spelling. Both are offered; the learner chooses.
  ['걸어요', ['걷다', '걸다']],
  ['들었어요', ['듣다', '들다']],
  ['몰랐어요', ['모르다']],
  ['몰라요', ['모르다']],
  ['썼어요', ['쓰다']],
  ['써요', ['쓰다']],
  ['불러요', ['부르다']],
  ['불렀어요', ['부르다']],
  ['했어요', ['하다']],
  ['해요', ['하다']],
  ['공부했어요', ['공부하다']],
  ['살아요', ['살다']],
  ['삽니다', ['살다']],
  ['지었어요', ['짓다']],
  ['나아요', ['낫다']],
  ['도와요', ['돕다']],
  ['추워요', ['춥다']],
  ['좋았어요', ['좋다']],
  ['그래요', ['그렇다']],
  ['읽었어요', ['읽다']],
  ['갔어요', ['가다']],
  ['봐요', ['보다']],
  ['마셨어요', ['마시다']],
  ['만들었어요', ['만들다']],
  ['예뻐요', ['예쁘다']],
];

describe('looking up an inflected form', () => {
  for (const [surface, expected] of CASES) {
    it(`${surface} → ${expected.join(' / ')}`, () => {
      const found = analyse(surface, isHeadword).map((a) => a.lemma);
      expect([...found].sort()).toEqual([...expected].sort());
    });
  }
});

describe('what it refuses', () => {
  it('says nothing about a word that is already a dictionary form', () => {
    // 먹다 is not an inflection of anything, and offering "먹다 → 먹다" would be
    // a search result that tells the reader nothing.
    expect(analyse('먹다', isHeadword)).toEqual([]);
  });

  it('says nothing about a string that is not a word', () => {
    expect(analyse('먹었어욬', isHeadword)).toEqual([]);
    expect(analyse('abc', isHeadword)).toEqual([]);
    expect(analyse('가', isHeadword)).toEqual([]);
  });

  it('only offers dictionary forms the dictionary actually has', () => {
    // 걸어요 round-trips from 걷다 and 걸다. A dictionary with only one of them
    // must offer only that one, rather than a headword it cannot open.
    const onlyWalk = (lemma: string) => lemma === '걷다';
    expect(analyse('걸어요', onlyWalk).map((a) => a.lemma)).toEqual(['걷다']);
  });

  it('reports which form it was, not only which word', () => {
    const [past] = analyse('먹었어요', isHeadword);
    expect(past?.form).toBe('pastPolite');
    const [future] = analyse('먹을 거예요', isHeadword);
    expect(future?.form).toBe('futurePolite');
  });
});
