/**
 * Whether `-아/어 주세요` is a thing anybody says about this verb.
 *
 * ## The defect this exists to stop
 *
 * The request row was *generated* for every verb the card showed, and
 * generating it is the mistake. `-아/어 주세요` means "do X, for me" — it needs
 * an action a person can choose to perform as a favour. Korean has a great many
 * verbs that describe something happening rather than somebody doing it, and
 * for every one of those the generated form is either not Korean or is Korean
 * nobody would ever want to say:
 *
 * ```
 *   죽이다   → 죽여 주세요        please kill
 *   사망하다  → 사망해 주세요       please die
 *   숨지다   → 숨져 주세요        please die
 *   꺼지다   → 꺼져 주세요        the polite form of a vulgar dismissal
 *   벌거벗다  → 벌거벗어 주세요      please get naked
 *   임신하다  → 임신해 주세요       please get pregnant
 *   괴롭히다  → 괴롭혀 주세요       please bully me
 *   굶주리다  → 굶주려 주세요       please starve
 *   실종되다  → 실종돼 주세요       please go missing
 *   취소되다  → 취소돼 주세요       not Korean at all
 * ```
 *
 * All of those were on word cards. None of them was caught by a check, because
 * every one is *morphologically* impeccable — the conjugator did its job and
 * the job was the wrong one.
 *
 * ## The rule
 *
 * `-아/어 주세요` is licensed by the verb, not by its shape, so this is mostly a
 * list. Two things keep the list honest rather than endless:
 *
 * 1. **Whole derivational families are denied by structure**, because the
 *    failure in them is systematic: a 되다 compound, a passive in -이/-히/-리,
 *    a spontaneous -지다 or -나다. Each has an allow-list for the members that
 *    really are agentive — 만지다 and 던지다 end in 지다 and are ordinary
 *    transitive verbs, 보이다 is also the causative *to show*.
 * 2. **Everything else is licensed unless it is on `NOT_A_FAVOUR`**, which was
 *    built by reading the request form of all 1,055 taught verbs.
 *
 * That second point is the residual risk and it is worth naming: a verb added
 * to the corpus tomorrow is licensed by default, and if it is a verb of harm or
 * of spontaneous change its card will show a bad request. `npm run
 * conjugation:qa` prints every licensed request form for exactly this reason —
 * the list is meant to be re-read when the corpus grows, and §64 of the
 * expansion checklist says so.
 *
 * Where a form is denied, nothing is shown. A missing row teaches nothing; a
 * wrong row teaches a mistake with the authority of a table.
 */

/** 지다 verbs that are ordinary transitives rather than spontaneous changes. */
const AGENTIVE_JIDA = new Set([
  '만지다', '가지다', '던지다', '책임지다', '따지다', '건지다', '뒤지다',
  '짊어지다', '헤어지다', '빠지다', '흩어지다',
  // 다져 주세요 is core cooking Korean and 매만져 주세요 is what a stylist is
  // asked; both were being denied by the family rule.
  '다지다', '매만지다',
]);

/** 나다 verbs somebody can decide to do. */
const AGENTIVE_NADA = new Set([
  '일어나다', '만나다', '떠나다', '깨어나다', '물러나다', '나타나다', '달아나다',
]);

/**
 * -이/-히/-리 verbs that are causatives or plain transitives, not passives.
 *
 * The suffix is the same in both directions, which is why this cannot be done
 * by shape: 보이다 is *to be visible* and also *to show*, and 보여 주세요 is one
 * of the most useful sentences a beginner learns.
 */
const AGENTIVE_SUFFIXED = new Set([
  '보이다', '녹이다', '줄이다', '먹이다', '붙이다', '높이다', '기울이다', '숙이다',
  '들이다', '벌이다', '덧붙이다', '움직이다', '달이다', '속삭이다',
  '입히다', '밝히다', '익히다', '굽히다',
  '버리다', '그리다', '기다리다', '드리다', '달리다', '내리다', '알리다', '올리다',
  '두드리다', '빌리다', '차리다', '데리다', '굴리다', '돌리다', '날리다', '꾸리다',
  '건드리다', '말리다', '뿌리다', '흘리다', '오리다', '다리다', '떠올리다', '가리다',
  '기리다', '놀리다', '늘리다', '벌리다', '터뜨리다', '우리다', '엎드리다', '누리다',
  '노리다', '되돌리다', '웅크리다', '다스리다', '기르다',
  // 헤아려 주세요 — please consider my feelings — is ordinary appeal Korean.
  '헤아리다',
]);

/**
 * Verbs where asking somebody to do it is not a favour.
 *
 * Read off the request form of every taught verb. Four kinds:
 * something that happens rather than being done (썩다, 발생하다); a state
 * rather than an act (늙다, 존재하다); harm, to the listener or by them
 * (죽이다, 협박하다, 배신하다); and the handful whose request form lands
 * somewhere no learning product should go (벌거벗다, 임신하다, 키스하다).
 */
const NOT_A_FAVOUR = new Set([
  // dying, harm, and being harmed
  '죽다', '죽이다', '사망하다', '숨지다', '다치다', '해치다', '괴롭히다', '빼앗다',
  '훔치다', '배신하다', '모욕하다', '협박하다', '위협하다', '비난하다', '비웃다',
  '파괴하다', '복수하다', '미워하다', '욕하다', '방해하다', '해고하다', '체포하다',
  '벌주다', '잡아먹다', '내쫓다', '몰아내다', '굶다', '굶주리다', '병들다', '앓다',
  '속이다', '속다', '당하다',
  // things that happen to you, not things you do
  '늙다', '낡다', '썩다', '얼다', '굳다', '마르다', '젖다', '식다', '익다', '녹다',
  '삭다', '잠들다', '넘치다', '생기다', '발생하다', '존재하다', '폭발하다', '증가하다',
  '상하다', '망하다', '실패하다', '기절하다', '토하다', '당황하다', '실망하다',
  '후회하다', '긴장하다', '놀라다', '겁먹다', '모자라다', '헤매다', '속하다',
  '해당하다', '위치하다', '잘못하다', '실수하다', '오해하다', '질투하다', '슬퍼하다',
  '무리하다', '낭비하다', '망치다', '저지르다', '어기다', '잃다', '은퇴하다',
  '이혼하다', '취하다',
  // states that a wrong part of speech used to make requestable
  '잘생기다', '어리다',
  // nowhere a foundation course should go
  '벌거벗다', '임신하다', '키스하다', '흥분하다',
]);

/** Honorific stems where the -어 주세요 layer is doubled or grotesque. */
const HONORIFIC_WITHOUT_REQUEST = new Set([
  // 주시다 is 주다 already: 주셔 주세요 says "please give" twice.
  '주시',
  // 돌아가시다 is to pass away. 잡수시다 and 자시다 simply are not said this way.
  '돌아가시', '잡수시', '자시', '있으시',
  // 주무세요 is the request; 주무셔 주세요 doubles the deference into nonsense.
  '주무시',
]);

/**
 * Verbs whose taught sense is not something a person chooses to do.
 *
 * The sense-aware half of this module, and the reason it exists is 맞다. The
 * card teaches *to be right* — 그 답이 맞아요 — and the table under it read
 * 맞으세요 as "Please do" and 맞아 주세요 as "Please do (for me)", which for
 * that sense is not Korean anybody says (and for the homograph it is an
 * invitation to be hit). A form can be morphologically impeccable and still be
 * the wrong thing to teach.
 *
 * Everything here denies both the -(으)세요 row and the -아/어 주세요 row.
 * Compiled by reading the command and request forms of all 1,458 taught
 * predicates, one at a time, against their taught sense (the corpus teaches
 * one sense per card, so a lemma-level entry here is sense-level in practice).
 * Five kinds:
 *
 * - things that happen rather than being done: 끓다, 흐르다, 돋다, 가라앉다
 * - states and capacities: 비다, 닮다, 뜻하다, 위치하다-style predicates
 * - psychological states nobody performs on request: 원하다, 확신하다, 반하다
 * - senses that are non-volitional even where a homograph is not: 맞다 (to be
 *   right), 차다 (to be full), 이르다 (to be early), 다하다 (to run out)
 * - fixed negative-pattern verbs whose positive command teaches a phrase
 *   backwards: 상관하다, 간섭하다, 마다하다 (~하지 마세요 is the Korean)
 */
const NOT_VOLITIONAL = new Set([
  '맞다', '피다', '모르다', '않다', '못하다', '원하다', '감사하다', '나다',
  '바라다', '자라다', '바뀌다', '줄다', '닿다', '싫어하다', '끓다', '위하다',
  '흐르다', '비다', '차다', '삐다', '짖다', '닮다', '들키다', '불타다',
  '변하다', '이러다', '어쩌다', '잠자다', '화내다', '손대다', '실례하다',
  '잠기다', '누다', '놓치다', '비치다', '튀다', '절다', '졸다', '목격하다',
  '떠다니다', '띄다', '가하다', '통하다', '들려오다', '까먹다', '다하다',
  '데다', '트다', '개다', '만족하다', '겪다', '마주치다', '쪼다', '존경하다',
  '뵈다', '깨닫다', '늘다', '떠오르다', '기다', '새다', '닥치다', '작동하다',
  '상징하다', '의미하다', '반하다', '가시다', '변화하다', '덮치다', '뜻하다',
  '부풀다', '이르다', '타오르다', '오래가다', '얼어붙다', '줄어들다',
  '바래다', '달하다', '골다', '성장하다', '비하다', '겁내다', '떠돌다',
  '끼치다', '가라앉다', '옮다', '풍기다', '돋다', '내키다', '휘다',
  '깜빡하다', '빗나가다', '잘나가다', '일치하다', '감돌다', '잦아들다',
  '기울다', '스미다', '못살다', '치닫다', '앞두다', '떠맡다', '우기다',
  '나대다', '설치다', '까불다', '짓밟다', '지배하다', '통치하다', '복종하다',
  '강요하다', '부추기다', '가로채다', '갉아먹다', '흠잡다', '다그치다',
  '확신하다', '고대하다', '염려하다', '선호하다', '갈망하다', '의존하다',
  '마다하다', '상관하다', '관련하다', '되뇌다', '조르다', '숙다', '뒹굴다',
  '휩쓸다', '받들다', '부리다', '부인하다', '부정하다', '소유하다',
  '물려받다', '빗대다', '재촉하다', '간섭하다', '짐작하다', '무릅쓰다',
  '반항하다', '감내하다', '장담하다', '감당하다', '몰아넣다', '채다',
  '바치다', '겨누다', '박차다', '빼먹다', '아우르다', '돌이키다', '뒤틀다',
  '헤집다', '낳다',
]);

/**
 * Verbs whose -(으)세요 command is ordinary Korean while -아/어 주세요 is not.
 *
 * 좋은 꿈 꾸세요 and 바람 쐬세요 are what people say; 꿈 꿔 주세요 and 쐐
 * 주세요 are not requests anybody makes. The command row stays, the favour
 * row goes.
 */
const IMPERATIVE_WITHOUT_REQUEST = new Set([
  '꾸다', '고생하다', '쐬다', '의심하다', '주장하다', '도달하다', '얻다', '드리다',
]);

/**
 * The one verb met so far whose favour form is natural while the bare command
 * is not: 좋아해 주세요 is an ordinary appeal, 좋아하세요 as an instruction is
 * not something a table should teach.
 */
const REQUEST_WITHOUT_IMPERATIVE = new Set(['좋아하다']);

/**
 * The volitional core both display rows share.
 *
 * A predicate passes when its taught sense names an action a person can choose
 * to perform. Everything a command and a favour have in common is here; the
 * two public gates below add what is specific to each ending.
 */
function isVolitionalAction(lemma: string, stem: string): boolean {
  if (NOT_A_FAVOUR.has(lemma)) return false;
  if (NOT_VOLITIONAL.has(lemma)) return false;
  if (AGENTIVE_JIDA.has(lemma) || AGENTIVE_NADA.has(lemma) || AGENTIVE_SUFFIXED.has(lemma)) {
    return true;
  }
  // 되다 on its own is 친구가 돼 주세요. Every compound of it is inchoative.
  if (lemma.endsWith('되다') && lemma !== '되다') return false;
  if (lemma.endsWith('지다') && lemma !== '지다') return false;
  if (lemma.endsWith('나다') && lemma !== '나다') return false;
  // A passive or causative in -이/-히/-리 that is not on the allow-list above.
  // Two syllables of stem or more, so 이다 and 히다 themselves are untouched.
  if (stem.length >= 2 && /[이히리]$/.test(stem)) return false;
  return true;
}

/**
 * Does this verb license the `-(으)세요` command row?
 *
 * The row is labelled as a command or suggestion in every language, so it may
 * only appear where telling somebody to do the thing is Korean anybody says.
 * Before this gate it appeared for every verb: 죽으세요, 죽이세요, 다치세요,
 * 틀리세요 and 꺼지세요 were all on cards under a label meaning "Please do".
 */
export function licensesImperative(lemma: string, stem: string): boolean {
  if (REQUEST_WITHOUT_IMPERATIVE.has(lemma)) return false;
  // 돌아가시다 is to pass away; its command is not a thing to print. The other
  // honorific stems keep theirs — 계세요 and 주무세요 are the canonical polite
  // commands of their verbs.
  if (stem === '돌아가시') return false;
  if (IMPERATIVE_WITHOUT_REQUEST.has(lemma)) return true;
  return isVolitionalAction(lemma, stem);
}

/**
 * Does this verb license `-아/어 주세요`?
 *
 * `stem` is the dictionary form minus 다, so the honorific check can be made
 * without re-deriving it.
 */
export function licensesRequest(lemma: string, stem: string): boolean {
  if (HONORIFIC_WITHOUT_REQUEST.has(stem)) return false;
  if (IMPERATIVE_WITHOUT_REQUEST.has(lemma)) return false;
  // A verb already ending in 주다 folds the favour into itself: 도와주세요 is
  // the request, and 도와줘 주세요 says "for me" twice. The 주세요 the learner
  // needs is the command row, which these verbs keep.
  if (lemma.endsWith('주다')) return false;
  if (REQUEST_WITHOUT_IMPERATIVE.has(lemma)) return true;
  return isVolitionalAction(lemma, stem);
}
