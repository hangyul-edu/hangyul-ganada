import { describe, expect, it } from 'vitest';

import { usableExamples } from './exampleQuality';

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
