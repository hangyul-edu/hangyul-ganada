import { describe, expect, it } from 'vitest';

import { classify, stemOf } from './classes';
import { conjugate, conjugationTable, type Form } from './conjugate';

/**
 * The conjugation table, written from the grammar rather than from the code.
 *
 * Every row here was written by reading the rule, not by running the function
 * and pasting what came out — which is the only way a table like this is worth
 * anything. Where a form is genuinely two acceptable spellings the more common
 * one is pinned and the other is noted.
 */
const V = 'verb' as const;
const A = 'adjective' as const;

type Row = [string, typeof V | typeof A, Partial<Record<Form, string>>];

const TABLE: Row[] = [
  // --- 하다, and the several hundred compounds that follow it ----------------
  ['하다', V, { presentPolite: '해요', pastPolite: '했어요', futurePolite: '할 거예요', formalPolite: '합니다', connective: '하고', honorific: '하세요', request: '해 주세요', adnominal: '하는' }],
  ['공부하다', V, { presentPolite: '공부해요', pastPolite: '공부했어요', futurePolite: '공부할 거예요', formalPolite: '공부합니다' }],
  ['말씀하다', V, { infinitive: '말씀해', request: '말씀해 주세요' }],
  ['조용하다', A, { presentPolite: '조용해요', adnominal: '조용한', request: undefined, honorific: undefined }],

  // --- plain consonant stems ------------------------------------------------
  ['먹다', V, { presentPolite: '먹어요', pastPolite: '먹었어요', futurePolite: '먹을 거예요', formalPolite: '먹습니다', connective: '먹고', honorific: '먹으세요', request: '먹어 주세요', adnominal: '먹는' }],
  ['읽다', V, { presentPolite: '읽어요', pastPolite: '읽었어요', futurePolite: '읽을 거예요', formalPolite: '읽습니다', request: '읽어 주세요' }],
  ['좋다', A, { presentPolite: '좋아요', pastPolite: '좋았어요', futurePolite: '좋을 거예요', formalPolite: '좋습니다', adnominal: '좋은' }],
  ['받다', V, { presentPolite: '받아요', pastPolite: '받았어요' }],
  ['웃다', V, { presentPolite: '웃어요', pastPolite: '웃었어요' }],
  ['잡다', V, { presentPolite: '잡아요', pastPolite: '잡았어요' }],
  ['좁다', A, { presentPolite: '좁아요', adnominal: '좁은' }],
  ['놓다', V, { presentPolite: '놓아요', pastPolite: '놓았어요' }],

  // --- vowel stems, with and without contraction -----------------------------
  ['가다', V, { presentPolite: '가요', pastPolite: '갔어요', futurePolite: '갈 거예요', formalPolite: '갑니다', adnominal: '가는' }],
  ['보다', V, { presentPolite: '봐요', pastPolite: '봤어요', futurePolite: '볼 거예요' }],
  ['주다', V, { presentPolite: '줘요', pastPolite: '줬어요' }],
  ['마시다', V, { presentPolite: '마셔요', pastPolite: '마셨어요' }],
  ['되다', V, { presentPolite: '돼요', pastPolite: '됐어요' }],
  ['보내다', V, { presentPolite: '보내요', pastPolite: '보냈어요' }],
  ['쉬다', V, { presentPolite: '쉬어요', pastPolite: '쉬었어요' }],

  // --- ㅡ drops --------------------------------------------------------------
  ['쓰다', V, { presentPolite: '써요', pastPolite: '썼어요', futurePolite: '쓸 거예요' }],
  ['바쁘다', A, { presentPolite: '바빠요', pastPolite: '바빴어요', adnominal: '바쁜' }],
  ['예쁘다', A, { presentPolite: '예뻐요', pastPolite: '예뻤어요' }],
  ['크다', A, { presentPolite: '커요', pastPolite: '컸어요', adnominal: '큰' }],

  // --- 르 doubles ------------------------------------------------------------
  ['모르다', V, { presentPolite: '몰라요', pastPolite: '몰랐어요', futurePolite: '모를 거예요' }],
  ['부르다', V, { presentPolite: '불러요', pastPolite: '불렀어요' }],
  ['빠르다', A, { presentPolite: '빨라요', pastPolite: '빨랐어요', adnominal: '빠른' }],
  ['다르다', A, { presentPolite: '달라요', adnominal: '다른' }],
  ['따르다', V, { presentPolite: '따라요', pastPolite: '따랐어요' }],
  ['치르다', V, { presentPolite: '치러요', pastPolite: '치렀어요' }],

  // --- ㄷ becomes ㄹ ----------------------------------------------------------
  ['걷다', V, { presentPolite: '걸어요', pastPolite: '걸었어요', futurePolite: '걸을 거예요', formalPolite: '걷습니다', honorific: '걸으세요', adnominal: '걷는' }],
  ['듣다', V, { presentPolite: '들어요', pastPolite: '들었어요', futurePolite: '들을 거예요', honorific: '들으세요' }],
  ['깨닫다', V, { presentPolite: '깨달아요', pastPolite: '깨달았어요' }],
  ['닫다', V, { presentPolite: '닫아요', pastPolite: '닫았어요' }],
  ['믿다', V, { presentPolite: '믿어요', honorific: '믿으세요' }],

  // --- ㅂ becomes 우 or 오 -----------------------------------------------------
  ['돕다', V, { presentPolite: '도와요', pastPolite: '도왔어요', futurePolite: '도울 거예요', honorific: '도우세요' }],
  ['춥다', A, { presentPolite: '추워요', pastPolite: '추웠어요', adnominal: '추운' }],
  ['덥다', A, { presentPolite: '더워요', pastPolite: '더웠어요', adnominal: '더운' }],
  ['무겁다', A, { presentPolite: '무거워요', adnominal: '무거운' }],
  ['아름답다', A, { presentPolite: '아름다워요', adnominal: '아름다운' }],
  ['줍다', V, { presentPolite: '주워요', pastPolite: '주웠어요' }],
  ['눕다', V, { presentPolite: '누워요', honorific: '누우세요' }],
  ['입다', V, { presentPolite: '입어요', pastPolite: '입었어요' }],

  // --- ㅅ drops ---------------------------------------------------------------
  ['짓다', V, { presentPolite: '지어요', pastPolite: '지었어요', futurePolite: '지을 거예요', honorific: '지으세요' }],
  ['낫다', A, { presentPolite: '나아요', pastPolite: '나았어요', adnominal: '나은' }],
  ['붓다', V, { presentPolite: '부어요', pastPolite: '부었어요' }],
  ['씻다', V, { presentPolite: '씻어요', pastPolite: '씻었어요', honorific: '씻으세요' }],

  // --- ㅎ drops and the vowel fronts -------------------------------------------
  ['그렇다', A, { presentPolite: '그래요', pastPolite: '그랬어요', adnominal: '그런' }],
  ['하얗다', A, { presentPolite: '하얘요', adnominal: '하얀' }],
  ['빨갛다', A, { presentPolite: '빨개요', adnominal: '빨간' }],
  ['커다랗다', A, { presentPolite: '커다래요', adnominal: '커다란' }],
  ['낳다', V, { presentPolite: '낳아요', pastPolite: '낳았어요' }],
  ['넣다', V, { presentPolite: '넣어요', adnominal: '넣는' }],

  // --- ㄹ drops before ㄴ, ㅂ, ㅅ ------------------------------------------------
  ['살다', V, { presentPolite: '살아요', pastPolite: '살았어요', futurePolite: '살 거예요', formalPolite: '삽니다', honorific: '사세요', adnominal: '사는' }],
  ['알다', V, { presentPolite: '알아요', formalPolite: '압니다', honorific: '아세요', adnominal: '아는' }],
  ['만들다', V, { presentPolite: '만들어요', formalPolite: '만듭니다', honorific: '만드세요', adnominal: '만드는' }],
  ['길다', A, { presentPolite: '길어요', formalPolite: '깁니다', adnominal: '긴' }],
  ['멀다', A, { presentPolite: '멀어요', adnominal: '먼' }],

  // --- the stems that are their own class ---------------------------------------
  ['있다', V, { presentPolite: '있어요', pastPolite: '있었어요', formalPolite: '있습니다' }],
  ['없다', A, { presentPolite: '없어요', pastPolite: '없었어요', adnominal: '없는' }],

  /*
   * --- the honorific suffix -시- -------------------------------------------
   *
   * Irregular in exactly two forms. The polite present fuses to 세요 (계세요,
   * not the 계셔요 the ㅣ-stem rule gives) and an already-honorific stem does
   * not take -시- twice (계세요, not 계시세요). Everywhere else 시 + 어 → 셔
   * like any other ㅣ-stem, which is what makes the past 계셨어요.
   *
   * Pinning the whole word to 계세 instead — which is what the code used to do
   * — produced 계셌어요 and 계세 주세요, and two of them reached the level test.
   */
  ['계시다', V, { presentPolite: '계세요', pastPolite: '계셨어요', honorific: '계세요', request: '계셔 주세요', infinitive: '계셔', connective: '계시고', formalPolite: '계십니다', futurePolite: '계실 거예요', adnominal: '계시는' }],
  ['드시다', V, { presentPolite: '드세요', pastPolite: '드셨어요', honorific: '드세요', request: '드셔 주세요' }],
  ['주무시다', V, { presentPolite: '주무세요', pastPolite: '주무셨어요', formalPolite: '주무십니다' }],
  ['잡수시다', V, { presentPolite: '잡수세요', pastPolite: '잡수셨어요' }],
  ['돌아가시다', V, { presentPolite: '돌아가세요', pastPolite: '돌아가셨어요' }],
  ['있으시다', V, { presentPolite: '있으세요', pastPolite: '있으셨어요' }],
  // 마시다 ends in the same syllable and is not honorific: 마세요 is 말다.
  ['마시다', V, { presentPolite: '마셔요', honorific: '마시세요' }],
  // Nor is 가시다 in the sense the curriculum teaches — 맛이 가시다, to fade.
  ['가시다', V, { presentPolite: '가셔요', pastPolite: '가셨어요' }],
];

describe('the conjugation table', () => {
  for (const [lemma, partOfSpeech, expected] of TABLE) {
    it(`${lemma} conjugates as it is written in the grammar`, () => {
      for (const [form, value] of Object.entries(expected)) {
        expect(conjugate(lemma, form as Form, { partOfSpeech }), `${lemma} → ${form}`).toBe(
          value ?? null,
        );
      }
    });
  }
});

describe('what it refuses to do', () => {
  it('gives an adjective no imperative', () => {
    // "Please be cold" is not a sentence. A word card that printed one would be
    // teaching a mistake, so the form is absent rather than wrong.
    expect(conjugate('춥다', 'request', { partOfSpeech: 'adjective' })).toBeNull();
    expect(conjugate('춥다', 'honorific', { partOfSpeech: 'adjective' })).toBeNull();
    const forms = conjugationTable('춥다', { partOfSpeech: 'adjective' }).map((row) => row.form);
    expect(forms).not.toContain('request');
    expect(forms).not.toContain('honorific');
  });

  it('leaves a noun alone', () => {
    expect(stemOf('사과')).toBeNull();
    expect(conjugate('사과', 'presentPolite', { partOfSpeech: 'noun' })).toBeNull();
  });

  it('does not invent a form for a non-Korean string', () => {
    expect(conjugate('abc다', 'presentPolite')).toBeNull();
  });
});

describe('the classes', () => {
  it('separates the homographs by list, not by spelling', () => {
    // The four pairs that make this a curated list rather than a rule.
    expect(classify('걷다')).toBe('d');
    expect(classify('닫다')).toBe('regular');
    expect(classify('낫다')).toBe('s');
    expect(classify('웃다')).toBe('regular');
    expect(classify('돕다', { partOfSpeech: 'verb' })).toBe('b');
    expect(classify('잡다', { partOfSpeech: 'verb' })).toBe('regular');
    expect(classify('그렇다', { partOfSpeech: 'adjective' })).toBe('h');
    expect(classify('좋다', { partOfSpeech: 'adjective' })).toBe('regular');
  });

  it('takes a caller-supplied override for a sense it cannot see', () => {
    // 걷다 is two verbs. The corpus teaches "walk"; a dictionary showing "roll
    // up" can say so.
    expect(conjugate('걷다', 'presentPolite', { partOfSpeech: 'verb' })).toBe('걸어요');
    expect(
      conjugate('걷다', 'presentPolite', { partOfSpeech: 'verb', override: 'regular' }),
    ).toBe('걷어요');
  });

  it('treats -답다, -롭다 and -스럽다 as productive', () => {
    // Not enumerated, because they are suffixes and the list would be endless.
    expect(conjugate('사랑스럽다', 'presentPolite', { partOfSpeech: 'adjective' })).toBe('사랑스러워요');
    expect(conjugate('자유롭다', 'presentPolite', { partOfSpeech: 'adjective' })).toBe('자유로워요');
    expect(conjugate('정답다', 'presentPolite', { partOfSpeech: 'adjective' })).toBe('정다워요');
  });
});
