import type {
  ExplainStep,
  NumberItem,
  NumberLesson,
  NumberModule,
  NumbersExerciseKind,
} from '@hangyul-ganada/shared-types';

export type { ExplainStep, NumberItem, NumberLesson, NumberModule, NumbersExerciseKind };

/**
 * Korean numbers, as the thing that actually defeats beginners.
 *
 * ## Why this is a curriculum and not a reference table
 *
 * Every phrasebook prints two columns — 하나 둘 셋 beside 일 이 삼 — and stops.
 * The two columns are the easy part. What a learner cannot do after reading
 * them is order two coffees, say how old they are, read a price, or understand
 * a time, because none of those is answered by knowing both lists. They are
 * answered by knowing **which list, with which counter, in which shape**, and
 * that is a rule with exceptions rather than a table to memorise.
 *
 * ## Six modules, eighteen lessons, in the order the decisions arrive
 *
 * ```
 *  1  두 가지 수      the two systems: Sino, native, the two zeroes, which one when
 *  2  십 너머        past ten in both systems, and the five forms that change shape
 *  3  세는 말        counters: people and things, everyday counters, age
 *  4  시간과 날짜     hours, minutes, dates, the two irregular months, weekdays
 *  5  돈과 번호      prices, identifiers read digit by digit, 만 · 억 · 조
 *  6  복습          the five mistakes everyone makes, as a capstone
 * ```
 *
 * The first version of this file had twelve units of mostly one lesson each.
 * That was a table of contents, not a course: a unit is a *goal* a learner
 * reaches, and a goal with one lesson in it is a lesson with a heading. These
 * six each end somewhere a learner can feel — "I can count what I see", "I can
 * read a price".
 *
 * ## Every lesson has the same shape
 *
 * An objective the learner can read before starting; explanation steps, viewed
 * one at a time and each recorded; the items with their examples and audio;
 * guided practice drawn from at least two exercise families; a mastery check;
 * and a summary. Completion is decided by `domain/numbersProgress.ts` from the
 * evidence those steps leave, never by reaching the last screen.
 *
 * ## Readings are written down where they are not the spelling
 *
 * 십육 is said 심뉵, June is 유월 and not 육월, and 여덟 is said 여덜. Korean
 * number pronunciation is where sound change is most visible to a beginner,
 * and a curriculum that prints only the spelling teaches them to say it wrong.
 * Where `reading` is non-null it is what the audio says.
 *
 * ## Spacing: a counted quantity is spaced, an ordinal is not
 *
 * 한글 맞춤법 §43 spaces a unit noun from its numeral — 한 개, 세 명, 스무 살,
 * 삼십 분 — and its 다만 clause attaches the same noun when the number is an
 * *order* rather than a count. A date is an order. So:
 *
 * ```
 *  quantity   한 개 · 세 명 · 두 잔 · 스무 살 · 세 시 · 삼십 분 · 오천 원
 *  order      삼월 일일 · 유월 육일 · 시월 십일 · 십오일 · 이천이십육년
 * ```
 *
 * This file shipped *삼월 일 일*, *유월 육 일*, *시월 십 일* and *십오 일*. All
 * four are the 원칙 form and none of them is written by anybody: *일 일* in
 * particular reads as two ones rather than as the first of the month, which is
 * the opposite of what the lesson teaching that 일 is both is trying to show.
 * The counted forms are left spaced, because the course teaches that spacing as
 * a rule — 한 개, never 한개 — and `numbers:qa` enforces both halves so the two
 * cannot drift into each other.
 */

/** Stable ASCII clip ids from codepoints — the rule `characters.ts` and `vocabulary.ts` use. */
function audioId(prefix: string, text: string): string {
  return `${prefix}_${[...text].map((c) => c.codePointAt(0)!.toString(16)).join('')}`;
}

/**
 * The spoken form of an example: the right half of a right/wrong pair, or the
 * example itself. The clip id derives from *this*, so the id, the manifest text
 * and the recording agree — `audio:pronunciation:check` requires it.
 */
function spokenText(example: string): string {
  if (!example.includes('(✗)')) return example;
  return example.split('·')[0]!.replace(/\(✓\)/, '').trim();
}

type Extra = {
  reading?: string;
  example?: string;
  example_gloss?: string;
  counter_system?: 'sino' | 'native';
  /**
   * What the gloss is. Omitted means `meaning`; `explanation` marks the glosses
   * that are whole statements about a rule rather than what a word means.
   * See `NumberItem.gloss_kind` — this is what stops the pitfalls lesson asking
   * *what does this mean?* over four sentences of grammar.
   */
  gloss_kind?: NumberItem['gloss_kind'];
  /** Items whose glosses name the same thing. See `NumberItem.gloss_group`. */
  gloss_group?: string;
  /** Items interchangeable in one sentence slot. See `NumberItem.slot_group`. */
  slot_group?: string;
  /**
   * What the example demonstrates. Omitted means `example` — an ordinary use.
   * `pronunciation` where the card exists because of how the words *sound*,
   * `writing` where it exists because of how they are *written*.
   */
  example_kind?: NumberItem['example_kind'];
  /**
   * A key into the `numbers` namespace: one sentence worth reading after the
   * answer. Most items have none — see `note` on `NumberItem`.
   */
  note?: string;
};

const n = (
  id: string,
  korean: string,
  romanization: string,
  value: number | null,
  system: NumberItem['system'],
  role: NumberItem['role'],
  gloss: string | null,
  extra: Extra = {},
): NumberItem => ({
  id,
  korean,
  reading: extra.reading ?? null,
  romanization,
  value,
  system,
  role,
  ...(extra.counter_system ? { counter_system: extra.counter_system } : {}),
  gloss,
  gloss_kind: extra.gloss_kind ?? 'meaning',
  ...(extra.gloss_group ? { gloss_group: extra.gloss_group } : {}),
  ...(extra.slot_group ? { slot_group: extra.slot_group } : {}),
  example: extra.example ?? null,
  example_kind: extra.example ? (extra.example_kind ?? 'example') : undefined,
  example_gloss: extra.example_gloss ?? null,
  note: extra.note ?? null,
  audio: {
    // Single words share the vocabulary corpus's clips where the word is in it;
    // phrases and examples get their own. Same id rule, so a recording is made
    // once per distinct utterance. See `scripts/export-speech-plan.mjs`.
    word: audioId(korean.includes(' ') || korean.length > 4 ? 'ex' : 'word', korean),
    example: extra.example ? audioId('ex', spokenText(extra.example)) : null,
  },
});

// --- Module 1 · the two systems ---------------------------------------------

const SINO_1_10: NumberItem[] = [
  n('num-sino-1', '일', 'il', 1, 'sino', 'numeral', null),
  n('num-sino-2', '이', 'i', 2, 'sino', 'numeral', null),
  n('num-sino-3', '삼', 'sam', 3, 'sino', 'numeral', null),
  n('num-sino-4', '사', 'sa', 4, 'sino', 'numeral', null),
  n('num-sino-5', '오', 'o', 5, 'sino', 'numeral', null),
  n('num-sino-6', '육', 'yuk', 6, 'sino', 'numeral', null),
  n('num-sino-7', '칠', 'chil', 7, 'sino', 'numeral', null),
  n('num-sino-8', '팔', 'pal', 8, 'sino', 'numeral', null),
  n('num-sino-9', '구', 'gu', 9, 'sino', 'numeral', null),
  n('num-sino-10', '십', 'sip', 10, 'sino', 'numeral', null),
];

const NATIVE_1_10: NumberItem[] = [
  n('num-nat-1', '하나', 'hana', 1, 'native', 'numeral', null),
  n('num-nat-2', '둘', 'dul', 2, 'native', 'numeral', null),
  n('num-nat-3', '셋', 'set', 3, 'native', 'numeral', null),
  n('num-nat-4', '넷', 'net', 4, 'native', 'numeral', null),
  n('num-nat-5', '다섯', 'daseot', 5, 'native', 'numeral', null),
  n('num-nat-6', '여섯', 'yeoseot', 6, 'native', 'numeral', null),
  n('num-nat-7', '일곱', 'ilgop', 7, 'native', 'numeral', null),
  n('num-nat-8', '여덟', 'yeodeol', 8, 'native', 'numeral', null, { reading: '여덜' }),
  n('num-nat-9', '아홉', 'ahop', 9, 'native', 'numeral', null),
  n('num-nat-10', '열', 'yeol', 10, 'native', 'numeral', null),
];

const ZERO: NumberItem[] = [
  n('num-zero-yeong', '영', 'yeong', 0, 'sino', 'numeral', 'gloss.zeroMath', {
    slot_group: 'zero-score',
    example: '영하 삼 도',
    example_gloss: 'example.zeroMath',
  }),
  n('num-zero-gong', '공', 'gong', 0, 'sino', 'numeral', 'gloss.zeroDigit', {
    note: 'note.phoneZero',
    example: '공일공',
    example_gloss: 'example.zeroDigit',
  }),
  n('num-zero-below', '영하', 'yeongha', null, 'sino', 'phrase', 'gloss.belowZero', {
    example: '영하 오 도',
    example_gloss: 'example.belowZeroFive',
  }),
  n('num-zero-point', '영 점', 'yeong jeom', null, 'sino', 'phrase', 'gloss.zeroScore', {
    slot_group: 'zero-score',
    example: '영 점을 받았어요.',
    example_gloss: 'example.zeroScore',
  }),
];

/**
 * The rule lesson has phrases rather than numerals: a context, and which
 * system it takes. These are what `choose_system` asks about.
 */
const CHOOSING: NumberItem[] = [
  n('num-ch-people', '세 명', 'se myeong', null, 'native', 'phrase', 'gloss.ctxPeople', {
    example_gloss: 'example.ctxPeople',
  }),
  n('num-ch-money', '오천 원', 'ocheon won', null, 'sino', 'phrase', 'gloss.ctxMoney', {
    example_gloss: 'example.ctxMoney',
  }),
  n('num-ch-hour', '두 시', 'du si', null, 'native', 'phrase', 'gloss.ctxHour', {
    example_gloss: 'example.ctxHour',
  }),
  n('num-ch-minute', '삼십 분', 'samsip bun', null, 'sino', 'phrase', 'gloss.ctxMinute', {
    example_gloss: 'example.ctxMinute',
  }),
  n('num-ch-age', '스무 살', 'seumu sal', null, 'native', 'phrase', 'gloss.ctxAge', {
    example_gloss: 'example.ctxAge',
  }),
  n('num-ch-date', '삼월 일일', 'samwol iril', null, 'sino', 'phrase', 'gloss.ctxDate', {
    example_gloss: 'example.ctxDate',
  }),
];

// --- Module 2 · past ten ----------------------------------------------------

const SINO_BUILD: NumberItem[] = [
  n('num-sino-11', '십일', 'sibil', 11, 'sino', 'numeral', null),
  n('num-sino-16', '십육', 'simnyuk', 16, 'sino', 'numeral', null, { reading: '심뉵' }),
  n('num-sino-20', '이십', 'isip', 20, 'sino', 'numeral', null),
  n('num-sino-35', '삼십오', 'samsibo', 35, 'sino', 'numeral', null),
  n('num-sino-100', '백', 'baek', 100, 'sino', 'numeral', null),
  n('num-sino-1000', '천', 'cheon', 1000, 'sino', 'numeral', null),
];

const NATIVE_BUILD: NumberItem[] = [
  n('num-nat-11', '열하나', 'yeolhana', 11, 'native', 'numeral', null),
  n('num-nat-16', '열여섯', 'yeollyeoseot', 16, 'native', 'numeral', null, { reading: '열려섣' }),
  n('num-nat-20', '스물', 'seumul', 20, 'native', 'numeral', null),
  n('num-nat-30', '서른', 'seoreun', 30, 'native', 'numeral', null),
  n('num-nat-40', '마흔', 'maheun', 40, 'native', 'numeral', null),
  n('num-nat-50', '쉰', 'swin', 50, 'native', 'numeral', null),
];

/**
 * The five native numbers that change shape before a counter.
 *
 * The single most common beginner mistake in Korean numbers, and not a
 * pronunciation slip: 둘 사람 is not accented, it is ungrammatical. The counting
 * form is a different word and only appears in front of a counter, so it is
 * taught with one attached.
 */
const COUNTING_FORMS: NumberItem[] = [
  n('num-form-1', '한', 'han', 1, 'native', 'form', 'gloss.formOne', { example: '한 명' }),
  n('num-form-2', '두', 'du', 2, 'native', 'form', 'gloss.formTwo', {
    example: '두 개', note: 'note.countingForm',
  }),
  n('num-form-3', '세', 'se', 3, 'native', 'form', 'gloss.formThree', { example: '세 시' }),
  n('num-form-4', '네', 'ne', 4, 'native', 'form', 'gloss.formFour', { example: '네 잔' }),
  n('num-form-20', '스무', 'seumu', 20, 'native', 'form', 'gloss.formTwenty', { example: '스무 살' }),
];

// --- Module 3 · counting things ---------------------------------------------

const COUNTERS_CORE: NumberItem[] = [
  /*
   * 명 and 사람 count the same thing and their glosses say so. Grouped, so a
   * meaning question about one never offers the other — see `gloss_group`.
   */
  n('num-c-myeong', '명', 'myeong', null, null, 'counter', 'gloss.counterPeople', {
    gloss_group: 'people',
    example: '세 명', counter_system: 'native',
  }),
  n('num-c-gae', '개', 'gae', null, null, 'counter', 'gloss.counterThings', {
    example: '두 개', counter_system: 'native',
  }),
  n('num-c-mari', '마리', 'mari', null, null, 'counter', 'gloss.counterAnimals', {
    example: '고양이 두 마리', counter_system: 'native',
  }),
  n('num-c-saram', '사람', 'saram', null, null, 'counter', 'gloss.counterPeoplePlain', {
    gloss_group: 'people',
    example: '네 사람', counter_system: 'native',
  }),
];

const COUNTERS_EVERYDAY: NumberItem[] = [
  n('num-c-byeong', '병', 'byeong', null, null, 'counter', 'gloss.counterBottles', {
    slot_group: 'vessel',
    example: '맥주 한 병', counter_system: 'native',
  }),
  n('num-c-jan', '잔', 'jan', null, null, 'counter', 'gloss.counterCups', {
    slot_group: 'vessel',
    example: '커피 두 잔', counter_system: 'native',
  }),
  n('num-c-jang', '장', 'jang', null, null, 'counter', 'gloss.counterFlat', {
    slot_group: 'sheet-or-volume',
    example: '표 네 장', counter_system: 'native',
  }),
  n('num-c-gwon', '권', 'gwon', null, null, 'counter', 'gloss.counterBooks', {
    slot_group: 'sheet-or-volume',
    example: '책 세 권', counter_system: 'native',
  }),
];

const AGE: NumberItem[] = [
  n('num-age-sal', '살', 'sal', null, null, 'counter', 'gloss.counterAge', {
    example: '스무 살', counter_system: 'native',
  }),
  n('num-age-se', '세', 'se', null, null, 'counter', 'gloss.counterAgeFormal', {
    example: '이십 세', counter_system: 'sino',
  }),
  n('num-age-q', '몇 살이에요?', 'myeot sarieyo', null, null, 'phrase', 'gloss.howOld', {
    example: '스물다섯 살이에요.',
    example_gloss: 'example.twentyFive',
  }),
  n('num-age-honorific', '연세', 'yeonse', null, null, 'phrase', 'gloss.ageHonorific', {
    example: '연세가 어떻게 되세요?',
    example_gloss: 'example.ageHonorific',
  }),
];

// --- Module 4 · time and dates ----------------------------------------------

const HOURS: NumberItem[] = [
  n('num-t-si', '시', 'si', null, null, 'counter', 'gloss.counterHour', {
    example: '두 시', counter_system: 'native',
  }),
  n('num-t-ban', '반', 'ban', null, null, 'phrase', 'gloss.half', {
    example: '두 시 반',
    example_gloss: 'example.halfPastTwo',
  }),
  n('num-t-what', '몇 시예요?', 'myeot siyeyo', null, null, 'phrase', 'gloss.whatTime', {
    example: '세 시예요.',
    example_gloss: 'example.threeOclock',
  }),
  n('num-t-yeol', '열 시', 'yeol si', null, 'native', 'phrase', 'gloss.tenOclock'),
];

const MINUTES: NumberItem[] = [
  n('num-t-bun', '분', 'bun', null, null, 'counter', 'gloss.counterMinute', {
    example: '삼십 분', counter_system: 'sino',
  }),
  n('num-t-cho', '초', 'cho', null, null, 'counter', 'gloss.counterSecond', {
    example: '십 초', counter_system: 'sino',
  }),
  n('num-t-mixed', '세 시 삼십 분', 'se si samsip bun', null, null, 'phrase', 'gloss.mixedTime', {
    note: 'note.clockTime',
    example: '세 시 삼십 분이에요.',
    example_gloss: 'example.halfPastThree',
  }),
  n('num-t-quarter', '두 시 십오 분', 'du si sibo bun', null, null, 'phrase', 'gloss.quarterPast', {
    example_gloss: 'example.quarterPastTwo',
  }),
];

const DATES: NumberItem[] = [
  n('num-d-nyeon', '년', 'nyeon', null, null, 'counter', 'gloss.counterYear', {
    example: '이천이십육년', counter_system: 'sino',
  }),
  n('num-d-wol', '월', 'wol', null, null, 'counter', 'gloss.counterMonth', {
    example: '삼월', counter_system: 'sino',
  }),
  n('num-d-il', '일', 'il', null, null, 'counter', 'gloss.counterDay', {
    example: '십오일', counter_system: 'sino',
  }),
  /*
   * The two months that are not what the rule predicts.
   *
   * June is 유월 and October is 시월 — 육월 and 십월 are simply not Korean. It
   * is the one irregularity in the whole date system and a learner who is not
   * told it will say 육월 confidently for years.
   */
  n('num-d-june', '유월', 'yuwol', 6, 'sino', 'phrase', 'gloss.june', {
    example: '유월 육일',
    example_kind: 'pronunciation',
    example_gloss: 'example.juneSixth',
  }),
  n('num-d-october', '시월', 'siwol', 10, 'sino', 'phrase', 'gloss.october', {
    example: '시월 십일',
    example_kind: 'pronunciation',
    example_gloss: 'example.octoberTenth',
  }),
];

const WEEKDAYS: NumberItem[] = [
  n('num-w-q', '무슨 요일이에요?', 'museun yoirieyo', null, null, 'phrase', 'gloss.whatDay', {
    example: '월요일이에요.',
    example_gloss: 'example.monday',
  }),
  n('num-w-mon', '월요일', 'woryoil', null, null, 'phrase', 'gloss.monday', {
    slot_group: 'when',
  }),
  n('num-w-fri', '금요일', 'geumyoil', null, null, 'phrase', 'gloss.friday', {
    slot_group: 'when',
  }),
  n('num-w-weekend', '주말', 'jumal', null, null, 'phrase', 'gloss.weekend', {
    slot_group: 'when',
    example: '주말에 만나요.',
    example_gloss: 'example.weekend',
  }),
];

// --- Module 5 · money and identifiers ---------------------------------------

const MONEY: NumberItem[] = [
  n('num-m-won', '원', 'won', null, null, 'counter', 'gloss.counterWon', {
    note: 'note.price',
    example: '천 원', counter_system: 'sino',
  }),
  n('num-m-5000', '오천 원', 'ocheon won', 5000, 'sino', 'phrase', null),
  n('num-m-10000', '만 원', 'man won', 10000, 'sino', 'phrase', null),
  n('num-m-35000', '삼만 오천 원', 'samman ocheon won', 35000, 'sino', 'phrase', null),
  n('num-m-howmuch', '얼마예요?', 'eolmayeyo', null, null, 'phrase', 'gloss.howMuch', {
    example: '만 오천 원이에요.',
    example_gloss: 'example.fifteenThousand',
  }),
];

const DIGITS: NumberItem[] = [
  n('num-p-phone', '공일공', 'gong-il-gong', null, 'sino', 'phrase', 'gloss.phonePrefix', {
    /*
     * A pronunciation card, not a spelling one.
     *
     * 오륙칠팔 is four separate digits — 오 · 육 · 칠 · 팔 — said as one run,
     * and what a learner has to hear is that 육 becomes 륙 after 오. Headed
     * *이렇게 써요* it read as an instruction to write the four digits glued
     * together, which is not what a phone number looks like written down.
     */
    example: '공일공에 일이삼사에 오륙칠팔',
    example_kind: 'pronunciation',
    example_gloss: 'example.phoneNumber',
  }),
  n('num-p-e', '에', 'e', null, null, 'phrase', 'gloss.phoneDash'),
  n('num-p-floor', '층', 'cheung', null, null, 'counter', 'gloss.counterFloor', {
    example: '삼 층', counter_system: 'sino',
  }),
  n('num-p-ho', '호', 'ho', null, null, 'counter', 'gloss.counterRoom', {
    example: '오공이 호', counter_system: 'sino',
    example_gloss: 'example.room502',
  }),
  n('num-p-beon', '번', 'beon', null, null, 'counter', 'gloss.counterNumber', {
    example: '이백육 번', counter_system: 'sino',
    example_gloss: 'example.bus206',
  }),
];

/**
 * Large numbers, taught on the prices a learner actually reads.
 *
 * ## Two items were removed here, and one of them was a bug
 *
 * `만 단위` was an item. It is not a word a learner says — it is the *name of
 * a concept*, and making it an item put it in the option list beside 만, 억 and
 * 조, where it produced the question a screenshot caught: *what did you hear?*
 * with 조 · 억 · 만 단위 · 만 to choose from. 만 and 만 단위 are not two
 * answers; one is the word and the other is a label for the thing the word is
 * an example of, and no listener can pick between them because nothing was
 * ever said that distinguishes them. The four-digit grouping is still taught —
 * it is in the lesson's explanation, on 15,000원 and 123,450,000 — but it is
 * explanation, not something to be heard and identified.
 *
 * `조` was removed for the ordinary reason: a beginner who can read a price,
 * a phone number and a clock has no use for a trillion, and the course is
 * ordered by what arrives first in a learner's life. 억 stays because Korean
 * house prices and salaries are quoted in it, which is the everyday use case
 * the rule asks for.
 *
 * Both survivors are anchored on money rather than on a bare power of ten:
 * 만 is *만 원*, the note in a wallet, not 10⁴.
 */
const LARGE: NumberItem[] = [
  n('num-l-man', '만', 'man', 10000, 'sino', 'numeral', 'gloss.tenThousand', {
    note: 'note.tenThousandWon',
    example: '만 원',
    example_gloss: 'example.tenThousandWon',
  }),
  n('num-l-eok', '억', 'eok', 100000000, 'sino', 'numeral', 'gloss.hundredMillion', {
    example: '삼억 원',
    example_gloss: 'example.threeHundredMillionWon',
  }),
  n('num-l-percent', '퍼센트', 'peosenteu', null, null, 'counter', 'gloss.percent', {
    example: '오십 퍼센트', counter_system: 'sino',
  }),
  n('num-l-point', '점', 'jeom', null, null, 'phrase', 'gloss.decimalPoint', {
    example: '삼 점 오',
    example_gloss: 'example.threePointFive',
  }),
];

// --- Module 6 · the mistakes ------------------------------------------------

/*
 * Every gloss in this lesson is a *rule*, not a meaning, and that is declared.
 *
 * `gloss.pitfallSpacing` is *세는 말은 띄어 써요*. Asked under the meaning
 * instruction — 이건 무슨 뜻일까요? — over 한 개, it is not a question anybody
 * can answer: 한 개 does not *mean* "counting words are spaced". `gloss_kind:
 * 'explanation'` is what routes this lesson to *다음 중 올바른 설명을
 * 고르세요.* instead, and `numbers:qa` fails a lesson that mixes the two kinds
 * into one option list.
 */
const PITFALLS: NumberItem[] = [
  n('num-x-dulsal', '두 살', 'du sal', null, 'native', 'phrase', 'gloss.pitfallCountingForm', {
    gloss_kind: 'explanation',
    example: '두 살 (✓)  ·  둘 살 (✗)',
    example_kind: 'writing',
    example_gloss: 'example.pitfallCountingForm',
  }),
  n('num-x-simnyuk', '십육', 'simnyuk', 16, 'sino', 'phrase', 'gloss.pitfallSimnyuk', {
    gloss_kind: 'explanation',
    note: 'note.simnyuk',
    reading: '심뉵',
    /*
     * No `example_gloss`. It said *글자는 십육, 소리는 심뉵* — the gloss above
     * it, word for word, on the same card. One of the two had to go and the
     * gloss is the one the explanation questions draw their options from.
     */
    example: '십육 (심뉵)',
    example_kind: 'pronunciation',
  }),
  n('num-x-june', '유월', 'yuwol', 6, 'sino', 'phrase', 'gloss.pitfallJune', {
    gloss_kind: 'explanation',
    note: 'note.irregularMonths',
    example: '유월 (✓)  ·  육월 (✗)',
    example_kind: 'pronunciation',
    example_gloss: 'example.pitfallJune',
  }),
  n('num-x-hourmin', '세 시 삼십 분', 'se si samsip bun', null, null, 'phrase', 'gloss.pitfallHourMinute', {
    gloss_kind: 'explanation',
    example: '세 시 삼십 분 (✓)  ·  삼 시 서른 분 (✗)',
    example_kind: 'writing',
    example_gloss: 'example.pitfallHourMinute',
  }),
  n('num-x-spacing', '한 개', 'han gae', null, 'native', 'phrase', 'gloss.pitfallSpacing', {
    gloss_kind: 'explanation',
    example: '한 개 (✓)  ·  한개 (✗)',
    example_kind: 'writing',
    example_gloss: 'example.pitfallSpacing',
  }),
];

/** Every taught item, in curriculum order. */
export const NUMBER_ITEMS: NumberItem[] = [
  ...SINO_1_10, ...NATIVE_1_10, ...ZERO, ...CHOOSING,
  ...SINO_BUILD, ...NATIVE_BUILD, ...COUNTING_FORMS,
  ...COUNTERS_CORE, ...COUNTERS_EVERYDAY, ...AGE,
  ...HOURS, ...MINUTES, ...DATES, ...WEEKDAYS,
  ...MONEY, ...DIGITS, ...LARGE,
  ...PITFALLS,
];

const ids = (items: NumberItem[]) => items.map((item) => item.id);

type Spec = Omit<NumberLesson, 'sequence' | 'unit'> & { unit?: never };

/**
 * Which explanation steps draw a broken-down number, and which numbers.
 *
 * Keyed `<lesson key>.step<n>`. Only the steps whose subject *is* the structure
 * of a number are here: how 11, 20 and 35 are built, and how 열하나 is. A step
 * about when to use a system has nothing to draw, and a diagram invented for it
 * would be decoration. See `ExplainStep` for what this replaced.
 */
const SHOW: Record<string, string[]> = {
  'sinoBuild.step1': ['num-sino-11', 'num-sino-20', 'num-sino-35'],
  'nativeBuild.step1': ['num-nat-11'],
};

const L = (
  id: string,
  module: string,
  system: NumberLesson['system'],
  items: NumberItem[],
  prerequisites: string[],
  key: string,
  steps: number,
  exercise_kinds: NumbersExerciseKind[],
  mastery_count = 8,
): Spec => ({
  id,
  module,
  system,
  item_ids: ids(items),
  prerequisites,
  title: `lesson.${key}.title`,
  objective: `lesson.${key}.objective`,
  explanation: Array.from({ length: steps }, (_, i) => {
    const text = `lesson.${key}.step${i + 1}`;
    const show = SHOW[`${key}.step${i + 1}`];
    return show ? { text, show } : { text };
  }),
  exercise_kinds,
  mastery_count,
});

/**
 * The capstone: eight phrases from across the course, each a context that
 * decides a system. Items are *shared* with the lessons that taught them — a
 * lesson owns evidence about its items, not the items themselves.
 */
const MIXED: NumberItem[] = [
  'num-ch-people', 'num-ch-money', 'num-ch-hour', 'num-ch-minute',
  'num-ch-age', 'num-ch-date', 'num-sino-16', 'num-nat-16',
].map((id) => NUMBER_ITEMS.find((i) => i.id === id)!);

const SPECS: Spec[] = [
  // 1 · the two systems
  L('num-lesson-sino-basics', 'mod-systems', 'sino', SINO_1_10, [], 'sinoBasics', 3,
    ['listen_choose', 'read_choose', 'digits_to_korean', 'korean_to_digits'], 8),
  L('num-lesson-native-basics', 'mod-systems', 'native', NATIVE_1_10, ['num-lesson-sino-basics'], 'nativeBasics', 3,
    ['listen_choose', 'read_choose', 'digits_to_korean', 'korean_to_digits'], 8),
  L('num-lesson-zero', 'mod-systems', 'sino', ZERO, ['num-lesson-sino-basics'], 'zero', 2,
    ['read_choose', 'fill_sentence', 'listen_choose'], 4),
  L('num-lesson-choosing', 'mod-systems', 'both', CHOOSING, ['num-lesson-native-basics', 'num-lesson-zero'], 'choosing', 3,
    ['choose_system', 'read_choose', 'listen_choose'], 6),
  // 2 · past ten
  L('num-lesson-sino-build', 'mod-past-ten', 'sino', SINO_BUILD, ['num-lesson-choosing'], 'sinoBuild', 3,
    ['digits_to_korean', 'korean_to_digits', 'order_parts', 'listen_choose'], 6),
  L('num-lesson-native-build', 'mod-past-ten', 'native', NATIVE_BUILD, ['num-lesson-choosing'], 'nativeBuild', 3,
    ['digits_to_korean', 'korean_to_digits', 'order_parts', 'listen_choose'], 6),
  L('num-lesson-forms', 'mod-past-ten', 'native', COUNTING_FORMS, ['num-lesson-native-build'], 'forms', 3,
    ['counter_form', 'spot_mistake', 'read_choose', 'listen_choose'], 6),
  // 3 · counting things
  L('num-lesson-counters', 'mod-counting', 'native', COUNTERS_CORE, ['num-lesson-forms'], 'counters', 3,
    ['read_choose', 'fill_sentence', 'counter_form', 'listen_choose'], 6),
  L('num-lesson-counters-everyday', 'mod-counting', 'native', COUNTERS_EVERYDAY, ['num-lesson-counters'], 'countersEveryday', 2,
    ['read_choose', 'fill_sentence', 'counter_form', 'listen_choose'], 6),
  L('num-lesson-age', 'mod-counting', 'both', AGE, ['num-lesson-counters'], 'age', 3,
    ['read_choose', 'choose_system', 'fill_sentence', 'listen_choose'], 6),
  // 4 · time and dates
  L('num-lesson-hours', 'mod-time', 'native', HOURS, ['num-lesson-forms'], 'hours', 3,
    ['read_choose', 'fill_sentence', 'choose_system', 'listen_choose'], 6),
  L('num-lesson-minutes', 'mod-time', 'both', MINUTES, ['num-lesson-hours', 'num-lesson-sino-build'], 'minutes', 3,
    ['read_choose', 'spot_mistake', 'fill_sentence', 'listen_choose'], 6),
  L('num-lesson-dates', 'mod-time', 'sino', DATES, ['num-lesson-sino-build'], 'dates', 3,
    ['read_choose', 'spot_mistake', 'fill_sentence', 'listen_choose'], 6),
  L('num-lesson-weekdays', 'mod-time', 'both', WEEKDAYS, ['num-lesson-dates'], 'weekdays', 2,
    ['read_choose', 'listen_choose', 'fill_sentence'], 4),
  // 5 · money and identifiers
  L('num-lesson-money', 'mod-money', 'sino', MONEY, ['num-lesson-sino-build'], 'money', 3,
    ['korean_to_digits', 'digits_to_korean', 'read_choose', 'listen_choose'], 6),
  L('num-lesson-digits', 'mod-money', 'sino', DIGITS, ['num-lesson-zero', 'num-lesson-sino-build'], 'digits', 3,
    ['read_choose', 'fill_sentence', 'listen_choose', 'korean_to_digits'], 6),
  L('num-lesson-large', 'mod-money', 'sino', LARGE, ['num-lesson-money'], 'large', 3,
    ['korean_to_digits', 'digits_to_korean', 'read_choose', 'listen_choose'], 4),
  // 6 · the mistakes
  L('num-lesson-pitfalls', 'mod-review', 'both', PITFALLS,
    ['num-lesson-minutes', 'num-lesson-dates', 'num-lesson-counters-everyday'], 'pitfalls', 2,
    ['spot_mistake', 'read_choose', 'counter_form', 'listen_choose'], 6),
  L('num-lesson-mixed', 'mod-review', 'both', MIXED, ['num-lesson-pitfalls'], 'mixed', 2,
    ['choose_system', 'read_choose', 'listen_choose', 'fill_sentence'], 8),
];

export const NUMBER_MODULES: NumberModule[] = [
  { id: 'mod-systems', index: 1, title: 'module.systems.title', goal: 'module.systems.goal', lesson_ids: [] },
  { id: 'mod-past-ten', index: 2, title: 'module.pastTen.title', goal: 'module.pastTen.goal', lesson_ids: [] },
  { id: 'mod-counting', index: 3, title: 'module.counting.title', goal: 'module.counting.goal', lesson_ids: [] },
  { id: 'mod-time', index: 4, title: 'module.time.title', goal: 'module.time.goal', lesson_ids: [] },
  { id: 'mod-money', index: 5, title: 'module.money.title', goal: 'module.money.goal', lesson_ids: [] },
  { id: 'mod-review', index: 6, title: 'module.review.title', goal: 'module.review.goal', lesson_ids: [] },
];

const moduleIndex = new Map(NUMBER_MODULES.map((m) => [m.id, m.index]));

export const NUMBER_LESSONS: NumberLesson[] = SPECS.map((spec, index) => {
  const lesson: NumberLesson = { ...spec, unit: moduleIndex.get(spec.module)!, sequence: index + 1 };
  return lesson;
});

for (const m of NUMBER_MODULES) {
  m.lesson_ids = NUMBER_LESSONS.filter((l) => l.module === m.id).map((l) => l.id);
}

const BY_ID = new Map(NUMBER_ITEMS.map((item) => [item.id, item]));
const LESSON_BY_ID = new Map(NUMBER_LESSONS.map((l) => [l.id, l]));

export function getNumberItem(id: string): NumberItem | undefined {
  return BY_ID.get(id);
}

export function getNumberLesson(id: string): NumberLesson | undefined {
  return LESSON_BY_ID.get(id);
}

export function getNumberModule(id: string): NumberModule | undefined {
  return NUMBER_MODULES.find((m) => m.id === id);
}

export function numberLessonItems(lesson: NumberLesson): NumberItem[] {
  return lesson.item_ids.map((id) => BY_ID.get(id)).filter((i): i is NumberItem => i !== undefined);
}

/** Module indexes, derived, so a lesson cannot belong to a module that does not exist. */
export const NUMBER_UNITS: number[] = NUMBER_MODULES.map((m) => m.index);

/**
 * The memory-store key for a number item, for the review scheduler.
 *
 * `kind: 'number'` and the bare item id. The first implementation passed
 * `number:<id>` as the item key and the store prefixed it again, so rows landed
 * under `number:number:<id>` and nothing that read them back ever found them.
 * The item key is the id and nothing else.
 */
export function numberItemKey(id: string): string {
  return id;
}

/**
 * What the example clip says.
 *
 * An example that shows a right and a wrong form side by side — `두 살 (✓)  ·
 * 둘 살 (✗)` — is recorded as the right form only: the app never voices the
 * mistake. Every reader of `audio.example` (the exporter, the gate, the page's
 * speaker label) goes through this so they cannot disagree about the text.
 */
export function spokenExample(item: NumberItem): string | null {
  return item.example ? spokenText(item.example) : null;
}
