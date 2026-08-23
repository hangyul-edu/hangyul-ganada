/**
 * The two judgements the Level Test's distractor rules rest on.
 *
 * They live here because two programs need them and must not disagree:
 * `scripts/content/build_level_test.mjs` uses them to decide what to make, and
 * `scripts/level-test-ambiguity-qa.mjs` uses them to decide what shipped. A
 * word list copied into both files drifts the first time one is edited, and the
 * gate would then pass a bank the builder would no longer produce.
 */

/**
 * Verbs that fit almost any argument, and so may never be a distractor.
 *
 * The builder's other guards are evidence: a distractor is rejected because its
 * own example acts on the same noun, or because the dictionary records it as a
 * synonym. No evidence separates a general verb from an ordinary transitive one
 * — generality is a fact about the language, not about the pack — so this is
 * the judgement, written down.
 *
 * Each of these shipped as a second correct answer before the list existed:
 * 연필을 사고 있어요, 두 줄을 생각했어요, 동생을 학교에 보내요, 저를 친구로
 * 불러요. They remain perfectly good *answers*; a sentence built around 사다
 * constrains 사다. It is only in the other three slots that nothing rules
 * them out.
 */
export const GENERAL_VERBS = new Set([
  '하다', '되다', '주다', '받다', '사다', '팔다', '보다', '듣다', '쓰다', '읽다',
  '알다', '모르다', '찾다', '만들다', '보내다', '부르다', '가지다', '들다', '내다',
  '생각하다', '좋아하다', '싫어하다', '원하다', '바라다', '기억하다', '잊다',
  '말하다', '얘기하다', '이야기하다', '시작하다', '끝내다', '준비하다', '기다리다',
]);

/** 축구 → 축구하다. Whether a noun names an activity you can simply *do*. */
export function isActivityNoun(word, lemmas) {
  return lemmas.has(`${word}하다`);
}

/**
 * A sentence whose blank is the object of 하다.
 *
 * 친구와 ____를 해요 took 축구 and offered 낚시 beside it, and fishing with a
 * friend is as good an answer as football.
 */
export function isHadaFrame(sentence) {
  return /(^|\s)(해요|했어요|하세요|합니다|하고|해|할까요)([.?!]|\s|$)/.test(sentence);
}
