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

/**
 * A blank that is the **object of a verb of consuming**.
 *
 * 밥을 먹고 ____을 드세요 shipped with 물 and 약 among its four options, and
 * both are ordinary Korean: you drink water after a meal and you take medicine
 * after a meal. It was the level-test question a reader photographed, and it is
 * the same shape as `isHadaFrame` one verb along — 하다 accepts anything you can
 * *do*, and 먹다/마시다/들다 accept anything you can *ingest*. A sentence built
 * around one of them constrains the verb, not the object, so nothing in the
 * sentence rules the other consumables out.
 *
 * Deliberately narrow. It requires the blank to carry the object particle, so
 * the comitative frame — ____와 점심을 먹어요, which wants a person — is not
 * caught by it; that one is already handled by the person class, and treating
 * it as a consumption slot rejected 소고기 against 동료 for no reason.
 */
export function isConsumptionObjectFrame(sentence) {
  const at = sentence.indexOf('____');
  if (at < 0) return false;
  const after = sentence.slice(at + 4);
  if (!after.startsWith('을') && !after.startsWith('를')) return false;
  return /(먹|드시|드세|마시|마셔|잡수)/.test(after);
}

/**
 * Every word that can be the object of one of those verbs.
 *
 * The browse category carries most of it — `food` is the shelf a learner looks
 * on for 물, 밥, 커피 and 술 — and the category is exactly what it misses:
 * categories are topical, so 약 is filed under body-health with 의사 and 배,
 * and no rule comparing categories can see that 물 and 약 compete. Reading the
 * corpus for ingestible glosses outside `food` returns four words and only two
 * of them are swallowed: 의학 is the discipline and 담배 is smoked.
 *
 * Passed in rather than read here so the builder and the gate derive it from
 * one function over their own copies of the data — see this file's header.
 */
export function consumableWords(anchors, nounClasses = {}) {
  const words = new Set();
  for (const anchor of anchors) {
    if (anchor.pos !== 'noun') continue;
    const tags = anchor.category_tags ?? [];
    if (anchor.category === 'food' || tags.includes('food')) words.add(anchor.word);
  }
  for (const [word, classes] of Object.entries(nounClasses)) {
    if (Array.isArray(classes) && classes.includes('consumable')) words.add(word);
  }
  return words;
}
