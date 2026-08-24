import { describe, expect, it } from 'vitest';

import { compatiblePartOfSpeech, usableExamples } from './exampleQuality';

/**
 * Which upstream sentences are fit for a learner's card.
 *
 * Every case here is a sentence that actually shipped, or one that would have.
 * The module is a veto: it starts from real dictionary citations and removes the
 * ones a beginner should not be shown, so the tests are written as "this one
 * went, and here is why".
 */

const ex = (korean: string, translation?: string) => ({ korean, translation });
const opts = (taughtGloss: string, skip: string | null = null) => ({ taughtGloss, skip, limit: 2 });

describe('extra examples on a taught card', () => {
  it('keeps a plain sentence that matches the taught sense', () => {
    const kept = usableExamples([ex('나는 내 방을 깨끗이 치웠다.', 'I cleaned my room.')], opts('room'));
    expect(kept).toHaveLength(1);
    expect(kept[0]!.korean).toBe('나는 내 방을 깨끗이 치웠다.');
  });

  it('drops an example of a different sense', () => {
    /*
     * The one that made this module necessary. Wiktionary files 술을 먹다 under
     * 먹다, correctly — Korean uses it for drinking — but the card says "to eat",
     * and a learner reading "to drink wine" beneath it learns that the card
     * cannot be trusted.
     */
    const kept = usableExamples([ex('술을 먹다.', 'to drink wine')], opts('to eat'));
    expect(kept).toHaveLength(0);
  });

  it('matches across a plural or a participle', () => {
    // The veto must not fire on "women" under "woman" or "going" under "to go";
    // a crude stem is enough, and being generous is the safe direction here.
    expect(usableExamples([ex('여자 세 명이 왔다 갔다.', 'Three women came and went.')], opts('woman'))).toHaveLength(1);
    expect(usableExamples([ex('학교에 가요.', 'I am going to school.')], opts('to go'))).toHaveLength(1);
  });

  it('drops wikitext that survived the parse', () => {
    for (const bad of ['^서울에 가요.', '새들-이 노래한다.', '내가 되는 거겠--어?']) {
      expect(usableExamples([ex(bad, 'a translation')], opts('a translation')), bad).toHaveLength(0);
    }
  });

  it('drops a fragment that is not a sentence', () => {
    // A legitimate dictionary citation, and not an example of usage a learner
    // can read: no verb, no end.
    expect(usableExamples([ex('여자친구', 'girlfriend')], opts('woman'))).toHaveLength(0);
    expect(usableExamples([ex('밥값도 못 하는 놈', 'worthless person')], opts('to do'))).toHaveLength(0);
  });

  it('drops a translation that explains instead of translating', () => {
    const kept = usableExamples(
      [ex('해가 서쪽에서 뜨다.', '(saying) The Sun rises from the west; i.e. something impossible.')],
      opts('the Sun'),
    );
    expect(kept).toHaveLength(0);
  });

  it('drops a sentence too long to read on a phone', () => {
    const long = '신체 기능 유지와 건강을 위해 수면 전 적당량의 물을 마시는 게 좋아.';
    expect(usableExamples([ex(long, 'It is good to drink water before sleep.')], opts('water'))).toHaveLength(0);
  });

  it('never repeats the example already on the card', () => {
    const own = '발이 시려요.';
    expect(usableExamples([ex(own, 'My feet are cold.')], opts('a foot, feet', own))).toHaveLength(0);
  });

  it('needs a translation, because an untranslated line teaches nothing', () => {
    expect(usableExamples([ex('물을 마셔요.')], opts('water'))).toHaveLength(0);
  });

  it('shows at most the limit, and no duplicates', () => {
    const many = [
      ex('오늘 뭐 했어요?', 'What did you do today?'),
      ex('오늘 날씨가 좋아요.', 'The weather is good today.'),
      ex('오늘 뭐 했어요?', 'What did you do today?'),
      ex('오늘은 쉬어요.', 'I rest today.'),
    ];
    const kept = usableExamples(many, opts('today'));
    expect(kept).toHaveLength(2);
    expect(new Set(kept.map((k) => k.korean)).size).toBe(2);
  });
});

/**
 * 거의, and the shape of the defect rather than the sentence.
 *
 * The card teaches the adverb — 거의 다 왔어요 — and Wiktionary also files a rare
 * *nominal* 거의 under the same gloss, "almost", whose citations decline it:
 * 손님은 거의가 오셨습니다, 남은 시간의 거의를. The gloss matched, so those were
 * shown under an adverb card and taught a learner that 거의 takes 가 and 를.
 *
 * The sentences themselves are not the bug and are not banned: on the
 * dictionary page they sit under "noun · used exclusively with the particles
 * -가 and -를" and illustrate exactly what that label says. What is fixed is the
 * matching, so the test is written against the matching.
 */
describe('a sense may only illustrate the grammar the card teaches', () => {
  it('refuses a nominal sense under a word taught as an adverb', () => {
    expect(compatiblePartOfSpeech('noun', 'adverb')).toBe(false);
    expect(compatiblePartOfSpeech('proper noun', 'verb')).toBe(false);
    expect(compatiblePartOfSpeech('numeral', 'adjective')).toBe(false);
  });

  it('allows the adverb sense of a word taught as a noun', () => {
    // 오늘 and 지금 are taught as nouns and used adverbially every day;
    // 오늘 뭐 했어요? is the ordinary sentence and must survive.
    expect(compatiblePartOfSpeech('adverb', 'noun')).toBe(true);
    expect(compatiblePartOfSpeech('pronoun', 'noun')).toBe(true);
  });

  it('says nothing when either side has no part of speech', () => {
    expect(compatiblePartOfSpeech(undefined, 'adverb')).toBe(true);
    expect(compatiblePartOfSpeech('noun', undefined)).toBe(true);
  });

  it('drops a citation glossed with an English infinitive', () => {
    const kept = usableExamples(
      [ex('우편을 외국으로 보내다.', 'To send mail to a foreign country.')],
      opts('to send'),
    );
    expect(kept).toHaveLength(0);
  });

  it('keeps a real sentence whose translation merely mentions "to"', () => {
    const kept = usableExamples(
      [ex('학교에 가고 싶어요.', 'I want to go to school.')],
      opts('to go'),
    );
    expect(kept).toHaveLength(1);
  });
});
