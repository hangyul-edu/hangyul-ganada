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

/* ------------------------------------------------------------------------- *
 * Frames that constrain nothing
 *
 * The three judgements above are about a *word* that must not be offered. The
 * three below are about a *sentence* that must not be asked, and they were
 * added after a reader photographed `일곱 시에 ____.` — keyed 일어나요, offered
 * 연습해요 beside it, and 일곱 시에 연습해요 is as ordinary as 일곱 시에
 * 일어나요. Nothing in that sentence is about getting up.
 *
 * The builder already refused a sentence with no particle in it at all
 * (`천천히 ____ 주세요`). What it could not see is that a particle is not the
 * same thing as a constraint: `시에` satisfied the argument-particle test while
 * saying only *when*, and a time says nothing about which predicate belongs in
 * the blank. So did `수업 시간에`, `아침에 일찍`, `발표 전에` and `다음 달에` —
 * five items in the shipped bank, all of the same shape, none of them
 * answerable by reading them.
 * ------------------------------------------------------------------------- */

/**
 * Nouns that name a time whatever stands in front of them.
 *
 * A closed list, deliberately. The alternative — treating every noun before 에
 * as possibly temporal — throws away good items: `이 일에 익숙해요` and `그
 * 계획에 반대해요` carry a 에 that the *verb selects*, and those sentences
 * constrain their blank exactly as well as an object would.
 */
const ALWAYS_TEMPORAL = new Set([
  '아침', '저녁', '점심', '밤', '낮', '새벽', '오전', '오후', '오늘', '내일', '어제', '모레',
  '요즘', '최근', '올해', '작년', '내년', '봄', '여름', '가을', '겨울', '주말', '평일',
  '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일', '방학', '휴가',
  '때', '전', '후', '동안', '시간', '시절', '어젯밤', '지난주', '명절', '하루', '이틀',
  '사흘', '한때', '평소', '저번', '지난번', '그날',
]);

/**
 * Nouns that name a time only when something counts them.
 *
 * 시 is an hour after 일곱 and a poem after 이. The counter has to be a native
 * numeral, a digit, or one of the demonstratives that count — and **not** a
 * bare Sino-Korean digit, because 이 is both "two" and "this", and reading it
 * as the numeral turned `이 일에 익숙해요` into a sentence about a date.
 */
const COUNTED_TEMPORAL = new Set(['시', '분', '초', '일', '월', '년', '주', '달', '번', '개월', '학기']);
const COUNTER = /^(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|스물|서른|마흔|쉰|몇|여러|이번|저번|지난|다음|첫|매|올)$|^[0-9]+$/;

/** Adverbs that modify a predicate without selecting one. */
const FREE_ADVERBS = new Set([
  '매일', '매주', '매년', '매달', '자주', '가끔', '항상', '늘', '보통', '대개', '다시', '또',
  '먼저', '일찍', '늦게', '벌써', '이미', '지금', '이제', '곧', '방금', '아까', '나중에',
  '오랫동안', '잠깐', '잠시', '한참', '바로', '아직', '이따가', '종일', '빨리', '천천히',
  '조금', '많이', '잘', '열심히', '혼자', '함께', '같이', '정말', '아주', '매우', '너무',
  '꼭', '특히', '다', '모두', '계속', '매번', '주로', '때때로', '새로', '직접',
]);

/** A clause ending — real content, because a clause selects what follows it. */
const CLAUSE_ENDING = /(면|서|고|며|니까|는데|다가|려고|자마자|든지|거나|아도|어도|지만|므로)$/;

const stripParticle = (eojeol) => eojeol.replace(/(에서|에|부터|까지|마다|은|는|도)$/, '');

/**
 * A sentence whose blank takes a **predicate** and whose remaining words say
 * only *when*.
 *
 * `일곱 시에 ____.` is the case this was written for. Every predicate a learner
 * knows fits it, so the item has as many answers as it has options.
 *
 * Only the predicate slot. A time is a perfectly good constraint on a *noun*
 * blank — `____에 한국에 갔어요` wants 작년 and rules out 소금 — so this asks
 * nothing about noun items and reports false on them by construction of the
 * caller, which passes only inflecting blanks.
 */
export function isUnconstrainedPredicateFrame(sentence) {
  if (!sentence.includes('____')) return false;
  const eojeols = sentence
    .replace(/[.?!]+$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const rest = eojeols.filter((eojeol) => !eojeol.includes('____'));
  if (rest.length === 0) return true;

  const temporal = new Set();
  for (let at = 0; at < rest.length; at += 1) {
    const bare = stripParticle(rest[at]);
    const counted = COUNTED_TEMPORAL.has(bare) && at > 0 && COUNTER.test(rest[at - 1]);
    if (!ALWAYS_TEMPORAL.has(bare) && !counted) continue;
    temporal.add(at);
    /*
      The word in front of a time noun is part of the time phrase: 수업 시간에,
      발표 전에, 다음 달에. Absorbed only when it is a bare noun — a clause
      ending in front of a time is content, and `밥을 먹고 나서` must not be
      swallowed by 나서.
    */
    if (at > 0 && !temporal.has(at - 1) && /^[가-힣]+$/.test(rest[at - 1]) && !CLAUSE_ENDING.test(rest[at - 1])) {
      temporal.add(at - 1);
    }
  }

  for (let at = 0; at < rest.length; at += 1) {
    if (temporal.has(at)) continue;
    const eojeol = rest[at];
    if (FREE_ADVERBS.has(eojeol)) continue;
    if (/^(저는|제가|나는|내가|우리는|우리가)$/.test(eojeol)) continue;
    return false;
  }
  return true;
}

/**
 * A sentence whose blank is the **subject** of an ordinary transitive action.
 *
 * `____이 문을 열었어요.` shipped keyed 은행, with 학생 and 형 among its four
 * options, and a student opening a door and an older brother opening a door are
 * both ordinary Korean. Three of the four options were correct.
 *
 * The class guard in the builder could not see it, because it compares each
 * distractor against the *answer's* class and 은행 is not a person. This reads
 * the frame instead: an action with an object accepts any human agent, whatever
 * the keyed answer happens to be. It is the `isConsumptionObjectFrame` rule one
 * argument along, and for the same reason.
 */
export function isAgentSubjectFrame(sentence) {
  if (!sentence.startsWith('____')) return false;
  const after = sentence.slice(4);
  if (!/^(이|가|은|는)/.test(after)) return false;
  return /[가-힣]{1,8}(을|를)\s/.test(after);
}

/**
 * A frame whose predicate rules out no noun at all.
 *
 * `____이 마음에 들어요.` — a road, a present, a bus stop: a learner can like
 * any of them, and the sentence offers nothing else to read. A demonstrative in
 * front of the blank does not change that: `이 ____이 마음에 들어요` shipped
 * keyed 작품 with 부인 among its options, and liking this lady is a sentence
 * too. So the patterns allow one determiner and rule the frame out anyway. The same shape as
 * the `____가 있어요` regression already pinned in the ambiguity gate, and this
 * is where that family is written down rather than listed one prompt at a time.
 */
const OPEN_EVALUATIVE = [
  /^(이|그|저|제|우리)?\s*_{4}(이|가|은|는)\s*마음에\s*(들어요|들었어요|들어|드세요)[.?!]?$/,
  /^(이|그|저|제|우리)?\s*_{4}(이|가|은|는)\s*(있어요|없어요|이에요|예요|좋아요|필요해요)[.?!]?$/,
];
export function isOpenEvaluativeFrame(sentence) {
  return OPEN_EVALUATIVE.some((pattern) => pattern.test(sentence.trim()));
}

/** The words `noun-classes.json` files as people. */
export function personNouns(nounClasses = {}) {
  return new Set(
    Object.entries(nounClasses)
      .filter(([, classes]) => Array.isArray(classes) && classes.includes('person'))
      .map(([word]) => word),
  );
}
