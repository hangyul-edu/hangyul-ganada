/**
 * The runtime delivery gate, against the artefact that shipped.
 *
 * Written 11 September 2026, the day `dict_섹스하다` was found in the Level Test
 * bank as a level-12 question and as a distractor in two more. The four rows
 * below are those items, copied from `bank-8b0e5dba.json` as it was shipped
 * at versionCode 23. They are the regression: an app that has this bank on
 * disk — a native install, an offline cache — must refuse them at load,
 * whatever the file says.
 */
import { describe, expect, it } from 'vitest';

import permanentIds from '../../../../content/vocabulary/word-ids.json';
import { VOCABULARY } from '../data/vocabulary';
import { guardLevelTestItems, isRetiredWordId, repairPlanForRetiredWords, retiredWordIds } from './contentSafety';
import { sittingIsServable } from './levelTest';
import type { LevelTestItem } from './levelTestTypes';
import type { DailyPlan } from './vocabularyDay';

/** The shipped rows, verbatim. */
const SHIPPED_UNSAFE: LevelTestItem[] = [
  { id: 'word_igida:meaning', kind: 'meaning', level: 10, prompt: '이기다', answerId: 'word_igida', optionIds: ['dict_섹스하다', 'word_chodaehada', 'word_igida', 'word_mothada'] },
  { id: 'word_doragada:produce', kind: 'produce', level: 10, promptId: 'word_doragada', answer: '돌아가다', options: ['노력하다', '돌아가다', '삶다', '섹스하다'] },
  { id: 'dict_섹스하다:meaning', kind: 'meaning', level: 12, prompt: '섹스하다', answerId: 'dict_섹스하다', optionIds: ['dict_섹스하다', 'word_himnaeda', 'word_maeda', 'word_matchuda'] },
  { id: 'dict_섹스하다:produce', kind: 'produce', level: 12, promptId: 'dict_섹스하다', answer: '섹스하다', options: ['내리다', '섹스하다', '열리다', '즐기다'] },
];

const SAFE: LevelTestItem[] = [
  { id: 'word_gada:meaning', kind: 'meaning', level: 1, prompt: '가다', answerId: 'word_gada', optionIds: ['word_gada', 'word_oda', 'word_meokda', 'word_boda'] },
  { id: 'word_gada:produce', kind: 'produce', level: 1, promptId: 'word_gada', answer: '가다', options: ['가다', '오다', '먹다', '보다'] },
  // 죽다 is a named daily-life card: the flower in the pot died. It stays askable.
  { id: 'word_jukda:context', kind: 'context', level: 7, prompt: '물을 안 줘서 화분의 꽃이 ____.', answer: '죽었어요', options: ['죽었어요', '피었어요', '자랐어요', '열렸어요'], lemma: '죽다', distractorIds: ['word_pida', 'word_jarada', 'word_yeollida'] },
];

const MEANINGS = new Map<string, string>([
  ['dict_섹스하다', 'to have sex'],
  ['word_chodaehada', 'to invite'],
  ['word_igida', 'to win'],
  ['word_mothada', 'to be unable to'],
  ['word_doragada', 'to go back'],
  ['word_himnaeda', 'to cheer up'],
  ['word_maeda', 'to tie'],
  ['word_matchuda', 'to match'],
  ['word_gada', 'to go'],
  ['word_oda', 'to come'],
  ['word_meokda', 'to eat'],
  ['word_boda', 'to see'],
]);

describe('the shipped bank, through the runtime gate', () => {
  it('refuses every item that carried 섹스하다, as a question or as a distractor', async () => {
    const { items, refused } = await guardLevelTestItems([...SHIPPED_UNSAFE, ...SAFE], MEANINGS, 'en');
    expect(refused.sort()).toEqual(SHIPPED_UNSAFE.map((item) => item.id).sort());
    expect(items.map((item) => item.id)).toEqual(SAFE.map((item) => item.id));
  });

  it('refuses them in Korean too, where the meaning file cannot help', async () => {
    const { refused } = await guardLevelTestItems(SHIPPED_UNSAFE, new Map(), 'ko');
    expect(refused).toHaveLength(SHIPPED_UNSAFE.length);
  });

  it('reads a Korean meaning that carries the word even when the ids do not', async () => {
    const item: LevelTestItem = { id: 'word_igida:meaning', kind: 'meaning', level: 10, prompt: '이기다', answerId: 'word_igida', optionIds: ['word_a', 'word_b', 'word_igida', 'word_c'] };
    const meanings = new Map([['word_a', '섹스를 하다'], ['word_b', '초대하다'], ['word_igida', '경기에서 상대를 누르다'], ['word_c', '하지 못하다']]);
    const { refused } = await guardLevelTestItems([item], meanings, 'ko');
    expect(refused).toEqual(['word_igida:meaning']);
  });

  it('refuses them in a language the runtime policy does not carry, from the Korean alone', async () => {
    // The 이기다 item shows the word only as a meaning, in whatever language the
    // learner reads; a dictionary anchor names its headword in its id, and the
    // id is what the gate reads, so a Thai learner is protected by the Korean.
    const { refused } = await guardLevelTestItems(SHIPPED_UNSAFE, new Map(), 'th');
    expect(refused.sort()).toEqual(SHIPPED_UNSAFE.map((item) => item.id).sort());
  });

  it('keeps a named daily-life card askable', async () => {
    const { items } = await guardLevelTestItems(SAFE, MEANINGS, 'en');
    expect(items.map((item) => item.id)).toContain('word_jukda:context');
  });

  it('does not resume a sitting that had shown a refused item', async () => {
    const { items } = await guardLevelTestItems([...SHIPPED_UNSAFE, ...SAFE], MEANINGS, 'en');
    const byId = new Map(items.map((item) => [item.id, item]));
    const legacySitting = ['word_gada:meaning', 'dict_섹스하다:meaning', 'word_gada:produce'];
    expect(sittingIsServable(legacySitting, byId)).toBe(false);
    expect(sittingIsServable(['word_gada:meaning', 'word_gada:produce'], byId)).toBe(true);
  });
});

describe('retired words and a learner who already has them', () => {
  const retired = retiredWordIds();
  const ledger = new Set(Object.values(permanentIds as Record<string, string>));

  it('retires at least the words the audit named, each with a permanent id', () => {
    expect(retired.length).toBeGreaterThan(0);
    for (const id of retired) expect(ledger.has(id), id).toBe(true);
  });

  it('ships none of them', () => {
    const shipped = new Set(VOCABULARY.map((word) => word.id));
    expect(retired.filter((id) => shipped.has(id))).toEqual([]);
  });

  it('drops an unresolved retired word from today and keeps the day already earned', () => {
    const [retiredId] = retired;
    const plan: DailyPlan = {
      date: '2026-09-11',
      goal: 10,
      level: 18,
      words: [
        { wordId: 'word_gada', source: 'new', steps: ['intro', 'match'] },
        { wordId: retiredId!, source: 'new', steps: ['intro', 'match'] },
        { wordId: 'word_oda', source: 'new', steps: ['intro'] },
      ],
      completed: ['word_gada'],
    };
    const repaired = repairPlanForRetiredWords(plan);
    expect(repaired.words.map((word) => word.wordId)).toEqual(['word_gada', 'word_oda']);
    expect(repaired.completed).toEqual(['word_gada']);
    expect(repaired.goal).toBe(10);
  });

  it('keeps a retired word that was completed today, so the count does not go backwards', () => {
    const [retiredId] = retired;
    const plan: DailyPlan = {
      date: '2026-09-11',
      goal: 5,
      words: [{ wordId: retiredId!, source: 'new', steps: [] }],
      completed: [retiredId!],
    };
    expect(repairPlanForRetiredWords(plan)).toBe(plan);
  });

  it('is idempotent and returns the same object when there is nothing to do', () => {
    const [retiredId] = retired;
    const plan: DailyPlan = {
      date: '2026-09-11',
      goal: 5,
      words: [{ wordId: retiredId!, source: 'new', steps: ['intro'] }, { wordId: 'word_gada', source: 'new', steps: ['intro'] }],
      completed: [],
    };
    const once = repairPlanForRetiredWords(plan);
    const twice = repairPlanForRetiredWords(once);
    expect(twice).toBe(once);
    expect(isRetiredWordId(retiredId!)).toBe(true);
    expect(isRetiredWordId('word_gada')).toBe(false);
  });
});
