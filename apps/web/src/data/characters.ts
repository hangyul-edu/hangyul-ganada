import type {
  CharacterTranslation,
  CurriculumUnit,
  HangulCharacter,
  LetterGroup,
  LetterLesson,
  LocalizedMap,
} from '@hangyul-ganada/shared-types';

import { toJamo } from './jamo';
import { composeSyllableStrokes } from './compose';
import { STROKE_ORDER } from './strokes';
import { romanizeSyllable } from './romanize';

/**
 * The Hangul curriculum.
 *
 * ## The order, and why it is this order
 *
 * Alphabet order (ㄱㄴㄷ…) is a sorting rule, not a teaching sequence. What a
 * beginner needs is to be able to *read something* as early as possible, and
 * that means the shortest path to a complete syllable block.
 *
 * ```
 * six vowels  →  five consonants  →  가 나 다 라 마      ← reading, by lesson 3
 *      ↓              ↓                    ↓
 *  more vowels   more consonants     more syllables
 *      ↓              ↓                    ↓
 *                  받침 (final consonants)
 *      ↓
 *              real Korean words
 * ```
 *
 * Vowels come first because every syllable needs one, and because they are the
 * simplest strokes in the script — a learner draws ㅏ correctly on their first
 * try, which is the right first experience. Five consonants follow rather than
 * all nineteen, because five is enough to build 가 나 다 라 마 and stopping
 * there means the learner *reads a syllable in their third lesson* instead of
 * grinding through the whole consonant chart first.
 *
 * Each series is then taught against the one it is built from: ㅊ ㅋ ㅌ ㅍ are
 * ㅈ ㄱ ㄷ ㅂ with a stroke added, and ㄲ ㄸ ㅃ ㅆ ㅉ are the plain letters
 * doubled. Teaching them out of that order throws away the fact that Hangul was
 * designed to be learned this way.
 *
 * 받침 is last of the reading skills and has a unit of its own, because reading
 * a consonant at the *bottom* of a block is a different skill from reading it
 * at the front, and because it is where beginners' reading actually breaks.
 *
 * ## Two things a letter can sound like
 *
 * ㄱ has a name (기역) and a sound (the g in 가). They are different utterances
 * and the app plays them from different buttons — reading the bare codepoint
 * through a speech engine says the *name*, which is not what a learner sounding
 * out 가 needs to hear. Vowels are the easy case: a vowel's name is its sound.
 *
 * ## Which parts of this file are translated
 *
 * `character`, `letter_name` and `sound_example` are the subject being taught
 * and are identical in every UI language. `romanization` is a transliteration,
 * not a translation, so it is too. What varies by locale — the pronunciation
 * hint and the mnemonic — lives in `translations`.
 */

interface LetterSpec {
  character: string;
  group: LetterGroup;
  romanization: string;
  stroke_count: number;
  /** The letter's Korean name. For vowels this is the vowel itself, spelled. */
  letter_name: string;
  /** A syllable demonstrating the sound rather than the name. */
  sound_example: string;
  components?: string[];
  translations: LocalizedMap<CharacterTranslation>;
}

const t = (pronunciation_hint: string, mnemonic: string | null = null): CharacterTranslation => ({
  pronunciation_hint,
  mnemonic,
});

/** Stable, ASCII, filesystem-safe audio ids. Derived from the codepoints. */
function audioId(prefix: string, text: string): string {
  return `${prefix}_${[...text].map((ch) => ch.codePointAt(0)!.toString(16)).join('')}`;
}

let sequence = 0;
function letter(spec: LetterSpec): HangulCharacter {
  sequence += 1;
  const strokes = STROKE_ORDER[spec.character];
  if (!strokes) {
    // A letter with no stroke order is a letter the app can show and cannot
    // teach. Failing here rather than shipping it is the point: the omission is
    // invisible on screen and obvious in a build.
    throw new Error(`${spec.character} has no stroke order in data/strokes.ts`);
  }
  if (strokes.length !== spec.stroke_count) {
    throw new Error(
      `${spec.character}: stroke_count is ${spec.stroke_count} but strokes.ts draws ${strokes.length}`,
    );
  }
  return {
    id: `char-${spec.character}`,
    character: spec.character,
    group: spec.group,
    romanization: spec.romanization,
    sequence,
    stroke_count: spec.stroke_count,
    strokes,
    components: spec.components ?? [],
    letter_name: spec.letter_name,
    sound_example: spec.sound_example,
    audio: {
      name: audioId('name', spec.letter_name),
      sound: audioId('sound', spec.sound_example),
    },
    translations: spec.translations,
  };
}

/*
 * The other thirty languages are not here.
 *
 * They used to be merged in from `characterCopy.ts` at module scope, which put
 * a quarter of a megabyte of prose into every screen's import graph to serve
 * the one language the learner reads. They now live in `data/letterCopy.ts`,
 * fetched per locale; the two source languages stay written beside the letters
 * they describe. See that file for the whole argument.
 */

/**
 * A syllable block.
 *
 * Romanisation, components, stroke order and stroke *count* are all derived
 * rather than typed out: they are a function of the letters, and a hand-typed
 * copy is a hand-typed copy that will eventually be wrong. It already had been
 * — 말 was written down as six strokes and is eight (ㅁ 3 + ㅏ 2 + ㄹ 3), which
 * is exactly the kind of quiet error a learner counts on their fingers and
 * concludes they cannot count.
 */
function syllable(
  character: string,
  translations: LocalizedMap<CharacterTranslation>,
): HangulCharacter {
  sequence += 1;
  // A block is written by writing its letters, in block order, so its stroke
  // order is theirs *laid out as a block* rather than a second copy of the same
  // data. Concatenating them unchanged — which this used to do — drew every
  // letter at full size in the same square, so 가 came out as a ㄱ and a ㅏ on
  // top of each other. See `data/compose.ts`.
  const strokes = composeSyllableStrokes(character);
  if (strokes.length === 0) {
    throw new Error(`${character} has no stroke order: a letter of it is missing from data/strokes.ts`);
  }
  return {
    id: `char-${character}`,
    character,
    group: 'syllable',
    romanization: romanizeSyllable(character),
    sequence,
    stroke_count: strokes.length,
    strokes,
    components: toJamo(character),
    letter_name: null,
    sound_example: character,
    audio: { sound: audioId('syl', character) },
    translations,
  };
}

// --- Unit 1: the vowels every syllable needs ---------------------------------

export const CORE_VOWELS: HangulCharacter[] = [
  letter({
    character: 'ㅏ', group: 'basic_vowel', romanization: 'a', stroke_count: 2,
    letter_name: '아', sound_example: '아',
    translations: {
      en: t('like the a in "father"', 'A post with one short branch to the right.'),
      ko: t('"아" 소리. 입을 크게 벌려요.', '기둥 오른쪽에 짧은 가지 하나.'),
    },
  }),
  letter({
    character: 'ㅓ', group: 'basic_vowel', romanization: 'eo', stroke_count: 2,
    letter_name: '어', sound_example: '어',
    translations: {
      en: t('like the o in "song"', 'The branch points left instead.'),
      ko: t('"어" 소리. 입을 조금만 벌려요.', '가지가 왼쪽으로.'),
    },
  }),
  letter({
    character: 'ㅗ', group: 'basic_vowel', romanization: 'o', stroke_count: 2,
    letter_name: '오', sound_example: '오',
    translations: {
      en: t('like the o in "go"', 'The branch points up.'),
      ko: t('"오" 소리. 입술을 동그랗게 만들어요.', '가지가 위로.'),
    },
  }),
  letter({
    character: 'ㅜ', group: 'basic_vowel', romanization: 'u', stroke_count: 2,
    letter_name: '우', sound_example: '우',
    translations: {
      en: t('like the oo in "moon"', 'The branch points down.'),
      ko: t('"우" 소리. 입술을 앞으로 내밀어요.', '가지가 아래로.'),
    },
  }),
  letter({
    character: 'ㅡ', group: 'basic_vowel', romanization: 'eu', stroke_count: 1,
    letter_name: '으', sound_example: '으',
    translations: {
      en: t('lips flat and wide, no English equivalent', 'One horizontal line.'),
      ko: t('"으" 소리. 입술을 옆으로 폅니다.', '가로선 하나.'),
    },
  }),
  letter({
    character: 'ㅣ', group: 'basic_vowel', romanization: 'i', stroke_count: 1,
    letter_name: '이', sound_example: '이',
    translations: {
      en: t('like the ee in "see"', 'One vertical line.'),
      ko: t('"이" 소리. 입을 옆으로 벌려요.', '세로선 하나.'),
    },
  }),
];

// --- Unit 2 and 4: the plain consonants --------------------------------------

export const FIRST_CONSONANTS: HangulCharacter[] = [
  letter({
    character: 'ㄱ', group: 'basic_consonant', romanization: 'g / k', stroke_count: 1,
    letter_name: '기역', sound_example: '가',
    translations: {
      en: t(
        'Between g and k — closer to g between two vowels.',
        'Touch the back of your tongue to the roof of your mouth, then let go.',
      ),
      ko: t('g와 k의 중간 소리. 모음 사이에서는 g에 가까워요.', '혀 뒷부분을 입천장에 붙였다가 떼어 보세요.'),
    },
  }),
  letter({
    character: 'ㄴ', group: 'basic_consonant', romanization: 'n', stroke_count: 1,
    letter_name: '니은', sound_example: '나',
    translations: {
      en: t('Like the n in "no".', 'Put the tip of your tongue just behind your top teeth.'),
      ko: t('영어 n과 같은 소리예요.', '혀끝을 윗니 바로 뒤에 대 보세요.'),
    },
  }),
  letter({
    character: 'ㄷ', group: 'basic_consonant', romanization: 'd / t', stroke_count: 2,
    letter_name: '디귿', sound_example: '다',
    components: ['ㄴ'],
    translations: {
      en: t('Between d and t — closer to d between two vowels.', 'ㄴ with a line closing the top.'),
      ko: t('d와 t의 중간 소리. 모음 사이에서는 d에 가까워요.', 'ㄴ 위에 획을 하나 더.'),
    },
  }),
  letter({
    character: 'ㄹ', group: 'basic_consonant', romanization: 'r / l', stroke_count: 3,
    letter_name: '리을', sound_example: '라',
    translations: {
      en: t(
        'A light tap, between r and l — an l at the end of a syllable.',
        'Flick your tongue forward off the roof of your mouth, once and lightly.',
      ),
      ko: t('r과 l의 중간, 가볍게 튕기는 소리. 받침에서는 l에 가까워요.', '혀를 입천장에서 앞으로 가볍게 한 번 튕겨 보세요.'),
    },
  }),
  letter({
    character: 'ㅁ', group: 'basic_consonant', romanization: 'm', stroke_count: 3,
    letter_name: '미음', sound_example: '마',
    translations: {
      en: t('Like the m in "mother".', 'A square — the shape of a closed mouth.'),
      ko: t('영어 m과 같은 소리예요.', '입 모양 그대로 네모.'),
    },
  }),
];

export const MORE_CONSONANTS: HangulCharacter[] = [
  letter({
    character: 'ㅂ', group: 'basic_consonant', romanization: 'b / p', stroke_count: 4,
    letter_name: '비읍', sound_example: '바',
    components: ['ㅁ'],
    translations: {
      en: t('Between b and p — closer to b between two vowels.', 'ㅁ opened out at the top.'),
      ko: t('b와 p의 중간 소리. 모음 사이에서는 b에 가까워요.', 'ㅁ 위로 획이 열린 모양.'),
    },
  }),
  letter({
    character: 'ㅅ', group: 'basic_consonant', romanization: 's', stroke_count: 2,
    letter_name: '시옷', sound_example: '사',
    translations: {
      en: t('Like the s in "see".', 'Let the air hiss out between your teeth.'),
      ko: t('영어 s와 같은 소리예요.', '이 사이로 바람을 살짝 흘려 보세요.'),
    },
  }),
  letter({
    character: 'ㅇ', group: 'basic_consonant', romanization: 'ng / silent', stroke_count: 1,
    letter_name: '이응', sound_example: '아',
    translations: {
      en: t(
        'silent at the start of a syllable, ng at the end',
        'A circle — the shape of the open throat. It holds the space when a syllable starts with a vowel.',
      ),
      ko: t(
        '첫소리에서는 소리가 없고, 받침에서는 "응" 소리가 나요.',
        '목구멍 모양. 모음으로 시작하는 글자의 자리를 채워 줍니다.',
      ),
    },
  }),
  letter({
    character: 'ㅈ', group: 'basic_consonant', romanization: 'j', stroke_count: 3,
    letter_name: '지읒', sound_example: '자',
    components: ['ㅅ'],
    translations: {
      en: t('like j in "jeep"', 'ㅅ with a line across the top.'),
      ko: t('"ㅈ" 소리. 영어 j와 비슷해요.', 'ㅅ 위에 획을 하나.'),
    },
  }),
  letter({
    character: 'ㅎ', group: 'basic_consonant', romanization: 'h', stroke_count: 3,
    letter_name: '히읗', sound_example: '하',
    components: ['ㅇ'],
    translations: {
      en: t('like h in "hat"', 'ㅇ wearing a hat of two strokes.'),
      ko: t('"ㅎ" 소리. 영어 h와 같아요.', 'ㅇ 위에 획 두 개.'),
    },
  }),
];

// --- Unit 6: the iotised vowels ----------------------------------------------

export const Y_VOWELS: HangulCharacter[] = [
  letter({
    character: 'ㅑ', group: 'basic_vowel', romanization: 'ya', stroke_count: 3,
    letter_name: '야', sound_example: '야', components: ['ㅏ'],
    translations: {
      en: t('like ya in "yard"', 'ㅏ with a second branch. One extra branch always adds a y.'),
      ko: t('"야" 소리. ㅏ 앞에 "이" 소리가 붙어요.', 'ㅏ에 가지를 하나 더.'),
    },
  }),
  letter({
    character: 'ㅕ', group: 'basic_vowel', romanization: 'yeo', stroke_count: 3,
    letter_name: '여', sound_example: '여', components: ['ㅓ'],
    translations: {
      en: t('like yu in "young"', 'ㅓ with a second branch.'),
      ko: t('"여" 소리. ㅓ 앞에 "이" 소리가 붙어요.', 'ㅓ에 가지를 하나 더.'),
    },
  }),
  letter({
    character: 'ㅛ', group: 'basic_vowel', romanization: 'yo', stroke_count: 3,
    letter_name: '요', sound_example: '요', components: ['ㅗ'],
    translations: {
      en: t('like yo in "yo-yo"', 'ㅗ with a second branch.'),
      ko: t('"요" 소리. ㅗ 앞에 "이" 소리가 붙어요.', 'ㅗ에 가지를 하나 더.'),
    },
  }),
  letter({
    character: 'ㅠ', group: 'basic_vowel', romanization: 'yu', stroke_count: 3,
    letter_name: '유', sound_example: '유', components: ['ㅜ'],
    translations: {
      en: t('like you', 'ㅜ with a second branch.'),
      ko: t('"유" 소리. ㅜ 앞에 "이" 소리가 붙어요.', 'ㅜ에 가지를 하나 더.'),
    },
  }),
];

// --- Unit 7: aspirated consonants --------------------------------------------

export const ASPIRATED_CONSONANTS: HangulCharacter[] = [
  letter({
    character: 'ㅊ', group: 'basic_consonant', romanization: 'ch', stroke_count: 4,
    letter_name: '치읓', sound_example: '차', components: ['ㅈ'],
    translations: {
      en: t('ㅈ with a puff of air', 'ㅈ with one more stroke. An added stroke means added breath.'),
      ko: t('ㅈ에 바람을 세게 붙인 소리.', 'ㅈ에 획을 하나 더. 획이 늘면 바람도 늘어요.'),
    },
  }),
  letter({
    character: 'ㅋ', group: 'basic_consonant', romanization: 'k', stroke_count: 2,
    letter_name: '키읔', sound_example: '카', components: ['ㄱ'],
    translations: {
      en: t('ㄱ with a puff of air', 'ㄱ with one more stroke.'),
      ko: t('ㄱ에 바람을 세게 붙인 소리.', 'ㄱ에 획을 하나 더.'),
    },
  }),
  letter({
    character: 'ㅌ', group: 'basic_consonant', romanization: 't', stroke_count: 3,
    letter_name: '티읕', sound_example: '타', components: ['ㄷ'],
    translations: {
      en: t('ㄷ with a puff of air', 'ㄷ with one more stroke.'),
      ko: t('ㄷ에 바람을 세게 붙인 소리.', 'ㄷ에 획을 하나 더.'),
    },
  }),
  letter({
    character: 'ㅍ', group: 'basic_consonant', romanization: 'p', stroke_count: 4,
    letter_name: '피읖', sound_example: '파', components: ['ㅂ'],
    translations: {
      en: t('ㅂ with a puff of air', 'ㅂ lying on its side.'),
      ko: t('ㅂ에 바람을 세게 붙인 소리.', 'ㅂ이 누운 모양.'),
    },
  }),
];

// --- Unit 8: the e-vowels ----------------------------------------------------

export const E_VOWELS: HangulCharacter[] = [
  letter({
    character: 'ㅐ', group: 'compound_vowel', romanization: 'ae', stroke_count: 3,
    letter_name: '애', sound_example: '애', components: ['ㅏ', 'ㅣ'],
    translations: {
      en: t('like a in "cat"', 'ㅏ + ㅣ written together.'),
      ko: t('"애" 소리. ㅏ와 ㅣ가 만나요.', 'ㅏ + ㅣ'),
    },
  }),
  letter({
    character: 'ㅔ', group: 'compound_vowel', romanization: 'e', stroke_count: 3,
    letter_name: '에', sound_example: '에', components: ['ㅓ', 'ㅣ'],
    translations: {
      en: t('like e in "bed"', 'ㅓ + ㅣ. Most Koreans now say ㅐ and ㅔ the same way.'),
      ko: t('"에" 소리. ㅓ와 ㅣ가 만나요.', 'ㅓ + ㅣ. 요즘은 ㅐ와 거의 같게 발음해요.'),
    },
  }),
  letter({
    character: 'ㅒ', group: 'compound_vowel', romanization: 'yae', stroke_count: 4,
    letter_name: '얘', sound_example: '얘', components: ['ㅑ', 'ㅣ'],
    translations: {
      en: t('like ya in "yak", ending short', 'ㅑ + ㅣ.'),
      ko: t('"얘" 소리.', 'ㅑ + ㅣ'),
    },
  }),
  letter({
    character: 'ㅖ', group: 'compound_vowel', romanization: 'ye', stroke_count: 4,
    letter_name: '예', sound_example: '예', components: ['ㅕ', 'ㅣ'],
    translations: {
      en: t('like ye in "yes"', 'ㅕ + ㅣ.'),
      ko: t('"예" 소리.', 'ㅕ + ㅣ'),
    },
  }),
];

// --- Unit 9: tense consonants ------------------------------------------------

export const TENSE_CONSONANTS: HangulCharacter[] = [
  letter({
    character: 'ㄲ', group: 'double_consonant', romanization: 'kk', stroke_count: 2,
    letter_name: '쌍기역', sound_example: '까', components: ['ㄱ', 'ㄱ'],
    translations: {
      en: t('ㄱ, tight and sharp', 'Two ㄱ. Tighten the throat and let go suddenly.'),
      ko: t('ㄱ을 목에 힘을 주어 세게 내는 소리.', 'ㄱ 두 개.'),
    },
  }),
  letter({
    character: 'ㄸ', group: 'double_consonant', romanization: 'tt', stroke_count: 4,
    letter_name: '쌍디귿', sound_example: '따', components: ['ㄷ', 'ㄷ'],
    translations: {
      en: t('ㄷ, tight and sharp', 'Two ㄷ.'),
      ko: t('ㄷ을 목에 힘을 주어 세게 내는 소리.', 'ㄷ 두 개.'),
    },
  }),
  letter({
    character: 'ㅃ', group: 'double_consonant', romanization: 'pp', stroke_count: 8,
    letter_name: '쌍비읍', sound_example: '빠', components: ['ㅂ', 'ㅂ'],
    translations: {
      en: t('ㅂ, tight and sharp', 'Two ㅂ.'),
      ko: t('ㅂ을 목에 힘을 주어 세게 내는 소리.', 'ㅂ 두 개.'),
    },
  }),
  letter({
    character: 'ㅆ', group: 'double_consonant', romanization: 'ss', stroke_count: 4,
    letter_name: '쌍시옷', sound_example: '싸', components: ['ㅅ', 'ㅅ'],
    translations: {
      en: t('ㅅ, tight and sharp', 'Two ㅅ.'),
      ko: t('ㅅ을 목에 힘을 주어 세게 내는 소리.', 'ㅅ 두 개.'),
    },
  }),
  letter({
    character: 'ㅉ', group: 'double_consonant', romanization: 'jj', stroke_count: 6,
    letter_name: '쌍지읒', sound_example: '짜', components: ['ㅈ', 'ㅈ'],
    translations: {
      en: t('ㅈ, tight and sharp', 'Two ㅈ.'),
      ko: t('ㅈ을 목에 힘을 주어 세게 내는 소리.', 'ㅈ 두 개.'),
    },
  }),
];

// --- Unit 10: the w-vowels ---------------------------------------------------

export const W_VOWELS: HangulCharacter[] = [
  letter({
    character: 'ㅘ', group: 'compound_vowel', romanization: 'wa', stroke_count: 4,
    letter_name: '와', sound_example: '와', components: ['ㅗ', 'ㅏ'],
    translations: {
      en: t('like wa in "wander"', 'ㅗ + ㅏ. ㅗ and ㅜ are what add the w.'),
      ko: t('"와" 소리. ㅗ와 ㅏ가 만나요.', 'ㅗ + ㅏ'),
    },
  }),
  letter({
    character: 'ㅝ', group: 'compound_vowel', romanization: 'wo', stroke_count: 4,
    letter_name: '워', sound_example: '워', components: ['ㅜ', 'ㅓ'],
    translations: {
      en: t('like wo in "wonder"', 'ㅜ + ㅓ.'),
      ko: t('"워" 소리. ㅜ와 ㅓ가 만나요.', 'ㅜ + ㅓ'),
    },
  }),
  letter({
    character: 'ㅚ', group: 'compound_vowel', romanization: 'oe', stroke_count: 3,
    letter_name: '외', sound_example: '외', components: ['ㅗ', 'ㅣ'],
    translations: {
      en: t('like we in "wet"', 'ㅗ + ㅣ.'),
      ko: t('"외" 소리. ㅗ와 ㅣ가 만나요.', 'ㅗ + ㅣ'),
    },
  }),
  letter({
    character: 'ㅟ', group: 'compound_vowel', romanization: 'wi', stroke_count: 3,
    letter_name: '위', sound_example: '위', components: ['ㅜ', 'ㅣ'],
    translations: {
      en: t('like wee', 'ㅜ + ㅣ.'),
      ko: t('"위" 소리. ㅜ와 ㅣ가 만나요.', 'ㅜ + ㅣ'),
    },
  }),
  letter({
    character: 'ㅙ', group: 'compound_vowel', romanization: 'wae', stroke_count: 5,
    letter_name: '왜', sound_example: '왜', components: ['ㅗ', 'ㅐ'],
    translations: {
      en: t('like we in "wet"', 'ㅗ + ㅐ. ㅙ, ㅞ and ㅚ all sound alike today.'),
      ko: t('"왜" 소리.', 'ㅗ + ㅐ. ㅙ · ㅞ · ㅚ는 요즘 거의 같게 들려요.'),
    },
  }),
  letter({
    character: 'ㅞ', group: 'compound_vowel', romanization: 'we', stroke_count: 5,
    letter_name: '웨', sound_example: '웨', components: ['ㅜ', 'ㅔ'],
    translations: {
      en: t('like we in "wet"', 'ㅜ + ㅔ.'),
      ko: t('"웨" 소리.', 'ㅜ + ㅔ'),
    },
  }),
  letter({
    character: 'ㅢ', group: 'compound_vowel', romanization: 'ui', stroke_count: 2,
    letter_name: '의', sound_example: '의', components: ['ㅡ', 'ㅣ'],
    translations: {
      en: t('ㅡ then ㅣ, run together', 'ㅡ + ㅣ.'),
      ko: t('"의" 소리. ㅡ와 ㅣ를 이어서 발음해요.', 'ㅡ + ㅣ'),
    },
  }),
];

export const ALL_LETTERS: HangulCharacter[] = [
  ...CORE_VOWELS,
  ...FIRST_CONSONANTS,
  ...MORE_CONSONANTS,
  ...Y_VOWELS,
  ...ASPIRATED_CONSONANTS,
  ...E_VOWELS,
  ...TENSE_CONSONANTS,
  ...W_VOWELS,
];

// --- Syllable blocks ---------------------------------------------------------

/** Consonant on the left, vertical vowel on the right. */
export const SYLLABLES_CV_VERTICAL: HangulCharacter[] = [
  syllable('가', {
    en: t('ㄱ + ㅏ', 'The consonant goes on the left, a tall vowel on the right.'),
    ko: t('ㄱ + ㅏ', '자음은 왼쪽, 세로 모음은 오른쪽에.'),
  }),
  syllable('나', {
    en: t('ㄴ + ㅏ — also the word for "I"'),
    ko: t('ㄴ + ㅏ — "나"라는 낱말이기도 해요.'),
  }),
  syllable('다', { en: t('ㄷ + ㅏ'), ko: t('ㄷ + ㅏ') }),
  syllable('라', { en: t('ㄹ + ㅏ'), ko: t('ㄹ + ㅏ') }),
  syllable('마', { en: t('ㅁ + ㅏ'), ko: t('ㅁ + ㅏ') }),
];

/** The same consonant against every vowel — and the vowel moves. */
export const SYLLABLES_ONE_CONSONANT: HangulCharacter[] = [
  syllable('거', { en: t('ㄱ + ㅓ'), ko: t('ㄱ + ㅓ') }),
  syllable('고', {
    en: t('ㄱ + ㅗ — the vowel goes underneath', 'A flat vowel sits below the consonant, never beside it.'),
    ko: t('ㄱ + ㅗ — 모음이 아래로 가요.', '가로 모음은 자음 아래에.'),
  }),
  syllable('구', { en: t('ㄱ + ㅜ'), ko: t('ㄱ + ㅜ') }),
  syllable('그', { en: t('ㄱ + ㅡ'), ko: t('ㄱ + ㅡ') }),
  syllable('기', { en: t('ㄱ + ㅣ'), ko: t('ㄱ + ㅣ') }),
];

export const SYLLABLES_MORE: HangulCharacter[] = [
  syllable('바', { en: t('ㅂ + ㅏ'), ko: t('ㅂ + ㅏ') }),
  syllable('사', { en: t('ㅅ + ㅏ'), ko: t('ㅅ + ㅏ') }),
  syllable('아', {
    en: t('ㅇ + ㅏ — read it as just "a"', 'ㅇ makes no sound here. It is holding the consonant seat open.'),
    ko: t('ㅇ + ㅏ — 그냥 "아"로 읽어요.', 'ㅇ은 첫소리에서 소리가 없어요. 자리만 채웁니다.'),
  }),
  syllable('자', { en: t('ㅈ + ㅏ'), ko: t('ㅈ + ㅏ') }),
  syllable('하', { en: t('ㅎ + ㅏ'), ko: t('ㅎ + ㅏ') }),
];

export const SYLLABLES_SILENT_IEUNG: HangulCharacter[] = [
  syllable('어', { en: t('ㅇ + ㅓ — read as "eo"'), ko: t('ㅇ + ㅓ — "어"로 읽어요.') }),
  syllable('오', { en: t('ㅇ + ㅗ — read as "o"'), ko: t('ㅇ + ㅗ — "오"로 읽어요.') }),
  syllable('우', { en: t('ㅇ + ㅜ — read as "u"'), ko: t('ㅇ + ㅜ — "우"로 읽어요.') }),
  syllable('으', { en: t('ㅇ + ㅡ — read as "eu"'), ko: t('ㅇ + ㅡ — "으"로 읽어요.') }),
  syllable('이', { en: t('ㅇ + ㅣ — read as "i"'), ko: t('ㅇ + ㅣ — "이"로 읽어요.') }),
];

/**
 * 받침 — a consonant at the foot of the block.
 *
 * Taught as a set because the point is the *rule*, not the five syllables: a
 * final consonant is released as one of only seven sounds, so 밥 · 잎 · 앞 all
 * end in the same p. A learner who knows that can read words they have never
 * seen; one who has memorised five blocks cannot.
 */
export const SYLLABLES_FINAL_BASIC: HangulCharacter[] = [
  syllable('안', {
    en: t('ㅇ + ㅏ + ㄴ', 'The third letter goes underneath. Read the block top to bottom.'),
    ko: t('ㅇ + ㅏ + ㄴ', '세 번째 글자는 아래에. 위에서 아래로 읽어요.'),
  }),
  syllable('말', { en: t('ㅁ + ㅏ + ㄹ — the word for "words"'), ko: t('ㅁ + ㅏ + ㄹ — "말"이라는 낱말이에요.') }),
  syllable('밤', { en: t('ㅂ + ㅏ + ㅁ — the word for "night"'), ko: t('ㅂ + ㅏ + ㅁ — "밤"이라는 낱말이에요.') }),
  syllable('강', { en: t('ㄱ + ㅏ + ㅇ — here ㅇ *is* a sound: ng'), ko: t('ㄱ + ㅏ + ㅇ — 받침 ㅇ은 "응" 소리가 나요.') }),
  syllable('산', { en: t('ㅅ + ㅏ + ㄴ — the word for "mountain"'), ko: t('ㅅ + ㅏ + ㄴ — "산"이라는 낱말이에요.') }),
];

export const SYLLABLES_FINAL_SOUNDS: HangulCharacter[] = [
  syllable('밥', {
    en: t('ends in a held p', 'The final ㅂ is stopped, not released. Say "bap" without finishing the p.'),
    ko: t('받침 ㅂ은 입을 다물고 멈춰요.', '터뜨리지 않고 멈추는 소리.'),
  }),
  syllable('옷', {
    en: t('ㅅ at the foot is said as t', 'Seven sounds only: ㅅ ㅆ ㅈ ㅊ ㅌ ㅎ all become t down there.'),
    ko: t('받침 ㅅ은 "ㄷ" 소리로 나요.', '받침 소리는 일곱 개뿐이에요.'),
  }),
  syllable('국', { en: t('ends in a held k — the word for "soup"'), ko: t('받침 ㄱ. "국"이라는 낱말이에요.') }),
  syllable('꽃', {
    en: t('ㅊ at the foot is said as t, so this is "kkot"'),
    ko: t('받침 ㅊ도 "ㄷ" 소리. "꼳"처럼 들려요.'),
  }),
  syllable('한', { en: t('ㅎ + ㅏ + ㄴ — the first syllable of 한글'), ko: t('ㅎ + ㅏ + ㄴ — 한글의 첫 글자.') }),
];

/** The payoff: five syllables that spell two words the learner now knows. */
export const SYLLABLES_READING: HangulCharacter[] = [
  syllable('글', { en: t('ㄱ + ㅡ + ㄹ — 한 + 글 = 한글, the name of this writing system'), ko: t('ㄱ + ㅡ + ㄹ — 한 + 글 = 한글.') }),
  syllable('국', { en: t('as in 한국, "Korea"'), ko: t('한국의 "국".') }),
  syllable('공', { en: t('ㄱ + ㅗ + ㅇ — as in 공부, "study"'), ko: t('ㄱ + ㅗ + ㅇ — 공부의 "공".') }),
  syllable('부', { en: t('ㅂ + ㅜ — 공 + 부 = 공부, "study"'), ko: t('ㅂ + ㅜ — 공 + 부 = 공부.') }),
];

export const ALL_SYLLABLES: HangulCharacter[] = dedupeByCharacter([
  ...SYLLABLES_CV_VERTICAL,
  ...SYLLABLES_ONE_CONSONANT,
  ...SYLLABLES_MORE,
  ...SYLLABLES_SILENT_IEUNG,
  ...SYLLABLES_FINAL_BASIC,
  ...SYLLABLES_FINAL_SOUNDS,
  ...SYLLABLES_READING,
]);

export const ALL_CHARACTERS: HangulCharacter[] = [...ALL_LETTERS, ...ALL_SYLLABLES];

/**
 * 국 appears in two lessons — once for its 받침 and once inside 한국 — because
 * meeting a syllable again in a new role is the point. It is still one item of
 * progress, so the roster keeps the first occurrence and drops the repeat.
 */
function dedupeByCharacter(list: HangulCharacter[]): HangulCharacter[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.character) ? false : (seen.add(c.character), true)));
}

// --- Lessons and units -------------------------------------------------------

const ids = (list: HangulCharacter[]) => list.map((c) => c.id);
const preview = (list: HangulCharacter[]) => list.map((c) => c.character).join(' ');

interface LessonSpec {
  id: string;
  unit: number;
  group: LetterGroup;
  items: HangulCharacter[];
  prerequisites?: string[];
  titles: LocalizedMap<{ title: string }>;
}

const LESSON_SPECS: LessonSpec[] = [
  {
    id: 'lesson-vowels-core', unit: 1, group: 'basic_vowel', items: CORE_VOWELS,
    titles: {
      en: { title: "Six vowels to start" },
      ko: { title: "첫 모음 여섯 개" },
      ja: { title: "はじめの母音6つ" },
      'zh-CN': { title: "先学六个元音" },
      es: { title: "Seis vocales para empezar" },
      fr: { title: "Six voyelles pour commencer" },
      de: { title: "Sechs Vokale zum Start" },
      'pt-BR': { title: "Seis vogais para começar" },
      vi: { title: "Sáu nguyên âm đầu tiên" },
      th: { title: "สระหกตัวแรก" },
      ar: { title: "ستة صوائت للبداية" },
      bn: { title: "শুরুর জন্য ছয়টি স্বর" },
      cs: { title: "Šest samohlásek na začátek" },
      el: { title: "Έξι φωνήεντα για αρχή" },
      fil: { title: "Anim na patinig na panimula" },
      hi: { title: "शुरुआत के लिए छह स्वर" },
      hu: { title: "Hat magánhangzó kezdésnek" },
      id: { title: "Enam vokal untuk memulai" },
      it: { title: "Sei vocali per cominciare" },
      kk: { title: "Бастауға алты дауысты" },
      ky: { title: "Баштоо үчүн алты үндүү" },
      mn: { title: "Эхлэхэд зургаан эгшиг" },
      nl: { title: "Zes klinkers om te beginnen" },
      pl: { title: "Sześć samogłosek na początek" },
      ro: { title: "Șase vocale pentru început" },
      ru: { title: "Шесть гласных для начала" },
      sv: { title: "Sex vokaler att börja med" },
      ta: { title: "தொடங்க ஆறு உயிரெழுத்துகள்" },
      te: { title: "మొదలుకు ఆరు అచ్చులు" },
      tr: { title: "Başlangıç için altı ünlü" },
      uk: { title: "Шість голосних для початку" },
      uz: { title: "Boshlash uchun oltita unli" },
    },
  },
  {
    id: 'lesson-consonants-first', unit: 2, group: 'basic_consonant', items: FIRST_CONSONANTS,
    titles: {
      en: { title: "Your first consonants" },
      ko: { title: "첫 자음" },
      ja: { title: "はじめの子音" },
      'zh-CN': { title: "你的第一批辅音" },
      es: { title: "Tus primeras consonantes" },
      fr: { title: "Vos premières consonnes" },
      de: { title: "Deine ersten Konsonanten" },
      'pt-BR': { title: "Suas primeiras consoantes" },
      vi: { title: "Những phụ âm đầu tiên" },
      th: { title: "พยัญชนะชุดแรกของคุณ" },
      ar: { title: "أول صوامتك" },
      bn: { title: "আপনার প্রথম ব্যঞ্জন" },
      cs: { title: "První souhlásky" },
      el: { title: "Τα πρώτα σου σύμφωνα" },
      fil: { title: "Ang unang mga katinig mo" },
      hi: { title: "आपके पहले व्यंजन" },
      hu: { title: "Az első mássalhangzóid" },
      id: { title: "Konsonan pertamamu" },
      it: { title: "Le tue prime consonanti" },
      kk: { title: "Алғашқы дауыссыздарыңыз" },
      ky: { title: "Биринчи үнсүздөрүңүз" },
      mn: { title: "Анхны гийгүүлэгчүүд" },
      nl: { title: "Je eerste medeklinkers" },
      pl: { title: "Twoje pierwsze spółgłoski" },
      ro: { title: "Primele tale consoane" },
      ru: { title: "Первые согласные" },
      sv: { title: "Dina första konsonanter" },
      ta: { title: "உங்கள் முதல் மெய்யெழுத்துகள்" },
      te: { title: "మీ మొదటి హల్లులు" },
      tr: { title: "İlk ünsüzlerin" },
      uk: { title: "Перші приголосні" },
      uz: { title: "Birinchi undoshlaringiz" },
    },
  },
  {
    id: 'lesson-syllables-ca', unit: 3, group: 'syllable', items: SYLLABLES_CV_VERTICAL,
    prerequisites: ['ㅏ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'],
    titles: {
      en: { title: "Consonant meets vowel" },
      ko: { title: "자음과 모음이 만나면" },
      ja: { title: "子音と母音が出会う" },
      'zh-CN': { title: "辅音遇上元音" },
      es: { title: "La consonante encuentra la vocal" },
      fr: { title: "La consonne rencontre la voyelle" },
      de: { title: "Konsonant trifft Vokal" },
      'pt-BR': { title: "A consoante encontra a vogal" },
      vi: { title: "Phụ âm gặp nguyên âm" },
      th: { title: "พยัญชนะเจอสระ" },
      ar: { title: "صامت يلتقي صائتًا" },
      bn: { title: "ব্যঞ্জনের সঙ্গে স্বর" },
      cs: { title: "Souhláska potkává samohlásku" },
      el: { title: "Σύμφωνο και φωνήεν μαζί" },
      fil: { title: "Katinig na may patinig" },
      hi: { title: "व्यंजन से मिला स्वर" },
      hu: { title: "Mássalhangzó és magánhangzó" },
      id: { title: "Konsonan bertemu vokal" },
      it: { title: "Consonante e vocale insieme" },
      kk: { title: "Дауыссыз бен дауысты қосылады" },
      ky: { title: "Үнсүз менен үндүү" },
      mn: { title: "Гийгүүлэгч эгшигтэй уулзана" },
      nl: { title: "Medeklinker ontmoet klinker" },
      pl: { title: "Spółgłoska spotyka samogłoskę" },
      ro: { title: "Consoana întâlnește vocala" },
      ru: { title: "Согласная встречает гласную" },
      sv: { title: "Konsonant möter vokal" },
      ta: { title: "மெய்யும் உயிரும் சேரும்போது" },
      te: { title: "హల్లు అచ్చును కలిసినప్పుడు" },
      tr: { title: "Ünsüz ünlüyle buluşuyor" },
      uk: { title: "Приголосна зустрічає голосну" },
      uz: { title: "Undosh unli bilan uchrashadi" },
    },
  },
  {
    id: 'lesson-syllables-vowel-moves', unit: 3, group: 'syllable', items: SYLLABLES_ONE_CONSONANT,
    prerequisites: ['ㄱ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'],
    titles: {
      en: { title: "Where the vowel sits" },
      ko: { title: "모음이 놓이는 자리" },
      ja: { title: "母音が置かれる場所" },
      'zh-CN': { title: "元音放在哪里" },
      es: { title: "Dónde se coloca la vocal" },
      fr: { title: "Où se place la voyelle" },
      de: { title: "Wo der Vokal steht" },
      'pt-BR': { title: "Onde a vogal fica" },
      vi: { title: "Nguyên âm nằm ở đâu" },
      th: { title: "สระวางไว้ตรงไหน" },
      ar: { title: "أين يقع الصائت" },
      bn: { title: "স্বরবর্ণ কোথায় বসে" },
      cs: { title: "Kam patří samohláska" },
      el: { title: "Πού μπαίνει το φωνήεν" },
      fil: { title: "Saan napupunta ang patinig" },
      hi: { title: "स्वर कहाँ बैठता है" },
      hu: { title: "Hová kerül a magánhangzó" },
      id: { title: "Di mana vokal diletakkan" },
      it: { title: "Dove va la vocale" },
      kk: { title: "Дауысты қайда тұрады" },
      ky: { title: "Үндүү кайда турат" },
      mn: { title: "Эгшиг хаана байрлах вэ" },
      nl: { title: "Waar de klinker staat" },
      pl: { title: "Gdzie stoi samogłoska" },
      ro: { title: "Unde stă vocala" },
      ru: { title: "Где стоит гласная" },
      sv: { title: "Var vokalen står" },
      ta: { title: "உயிரெழுத்து எங்கே அமரும்" },
      te: { title: "అచ్చు ఎక్కడ కూర్చుంటుంది" },
      tr: { title: "Ünlü nereye oturur" },
      uk: { title: "Де стоїть голосна" },
      uz: { title: "Unli qayerda turadi" },
    },
  },
  {
    id: 'lesson-consonants-more', unit: 4, group: 'basic_consonant', items: MORE_CONSONANTS,
    titles: {
      en: { title: "Five more consonants" },
      ko: { title: "자음 다섯 개 더" },
      ja: { title: "子音をあと5つ" },
      'zh-CN': { title: "再来五个辅音" },
      es: { title: "Cinco consonantes más" },
      fr: { title: "Cinq consonnes de plus" },
      de: { title: "Fünf weitere Konsonanten" },
      'pt-BR': { title: "Mais cinco consoantes" },
      vi: { title: "Thêm năm phụ âm" },
      th: { title: "พยัญชนะอีกห้าตัว" },
      ar: { title: "خمسة صوامت أخرى" },
      bn: { title: "আরও পাঁচটি ব্যঞ্জন" },
      cs: { title: "Dalších pět souhlásek" },
      el: { title: "Άλλα πέντε σύμφωνα" },
      fil: { title: "Lima pang katinig" },
      hi: { title: "पाँच और व्यंजन" },
      hu: { title: "Még öt mássalhangzó" },
      id: { title: "Lima konsonan lagi" },
      it: { title: "Altre cinque consonanti" },
      kk: { title: "Тағы бес дауыссыз" },
      ky: { title: "Дагы беш үнсүз" },
      mn: { title: "Дахиад таван гийгүүлэгч" },
      nl: { title: "Nog vijf medeklinkers" },
      pl: { title: "Jeszcze pięć spółgłosek" },
      ro: { title: "Încă cinci consoane" },
      ru: { title: "Ещё пять согласных" },
      sv: { title: "Fem konsonanter till" },
      ta: { title: "மேலும் ஐந்து மெய்யெழுத்துகள்" },
      te: { title: "మరో ఐదు హల్లులు" },
      tr: { title: "Beş ünsüz daha" },
      uk: { title: "Ще п'ять приголосних" },
      uz: { title: "Yana beshta undosh" },
    },
  },
  {
    id: 'lesson-syllables-more', unit: 5, group: 'syllable', items: SYLLABLES_MORE,
    prerequisites: ['ㅏ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅎ'],
    titles: {
      en: { title: "Five more syllables" },
      ko: { title: "글자 다섯 개 더" },
      ja: { title: "文字をあと5つ" },
      'zh-CN': { title: "再学五个音节" },
      es: { title: "Cinco sílabas más" },
      fr: { title: "Cinq syllabes de plus" },
      de: { title: "Fünf weitere Silben" },
      'pt-BR': { title: "Mais cinco sílabas" },
      vi: { title: "Thêm năm khối chữ" },
      th: { title: "พยางค์อีกห้าพยางค์" },
      ar: { title: "خمسة مقاطع أخرى" },
      bn: { title: "আরও পাঁচটি অক্ষর" },
      cs: { title: "Dalších pět slabik" },
      el: { title: "Άλλες πέντε συλλαβές" },
      fil: { title: "Lima pang pantig" },
      hi: { title: "पाँच और अक्षर" },
      hu: { title: "Öt további szótag" },
      id: { title: "Lima suku kata lagi" },
      it: { title: "Altre cinque sillabe" },
      kk: { title: "Тағы бес буын" },
      ky: { title: "Дагы беш муун" },
      mn: { title: "Дахиад таван үе" },
      nl: { title: "Nog vijf lettergrepen" },
      pl: { title: "Kolejnych pięć sylab" },
      ro: { title: "Încă cinci silabe" },
      ru: { title: "Ещё пять слогов" },
      sv: { title: "Fem stavelser till" },
      ta: { title: "மேலும் ஐந்து அசைகள்" },
      te: { title: "మరో ఐదు అక్షరాలు" },
      tr: { title: "Beş hece daha" },
      uk: { title: "Ще п’ять складів" },
      uz: { title: "Yana beshta bo‘g‘in" },
    },
  },
  {
    id: 'lesson-syllables-silent', unit: 5, group: 'syllable', items: SYLLABLES_SILENT_IEUNG,
    prerequisites: ['ㅇ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'],
    titles: {
      en: { title: "When ㅇ says nothing" },
      ko: { title: "ㅇ이 소리 나지 않을 때" },
      ja: { title: "ㅇが音を出さないとき" },
      'zh-CN': { title: "当 ㅇ 不发音时" },
      es: { title: "Cuando ㅇ no suena" },
      fr: { title: "Quand ㅇ ne dit rien" },
      de: { title: "Wenn ㅇ nichts sagt" },
      'pt-BR': { title: "Quando ㅇ não soa" },
      vi: { title: "Khi ㅇ không phát ra âm nào" },
      th: { title: "เมื่อ ㅇ ไม่มีเสียง" },
      ar: { title: "حين لا يُنطق ㅇ" },
      bn: { title: "যখন ㅇ চুপ থাকে" },
      cs: { title: "Když ㅇ mlčí" },
      el: { title: "Όταν το ㅇ δεν ακούγεται" },
      fil: { title: "Kapag walang tunog ang ㅇ" },
      hi: { title: "जब ㅇ चुप रहता है" },
      hu: { title: "Amikor a ㅇ néma" },
      id: { title: "Saat ㅇ tidak berbunyi" },
      it: { title: "Quando ㅇ non suona" },
      kk: { title: "ㅇ үнсіз болғанда" },
      ky: { title: "ㅇ үнсүз калганда" },
      mn: { title: "ㅇ дуугүй байхад" },
      nl: { title: "Als ㅇ niets zegt" },
      pl: { title: "Kiedy ㅇ milczy" },
      ro: { title: "Când ㅇ nu se aude" },
      ru: { title: "Когда ㅇ молчит" },
      sv: { title: "När ㅇ inte låter" },
      ta: { title: "ㅇ ஒலிக்காதபோது" },
      te: { title: "ㅇ మౌనంగా ఉన్నప్పుడు" },
      tr: { title: "ㅇ sessiz kaldığında" },
      uk: { title: "Коли ㅇ мовчить" },
      uz: { title: "ㅇ jim turganda" },
    },
  },
  {
    id: 'lesson-vowels-y', unit: 6, group: 'basic_vowel', items: Y_VOWELS,
    prerequisites: ['ㅏ', 'ㅓ', 'ㅗ', 'ㅜ'],
    titles: {
      en: { title: "Adding a y" },
      ko: { title: "\"이\" 소리를 더하면" },
      ja: { title: "y の音を足す" },
      'zh-CN': { title: "加上 y 的音" },
      es: { title: "Añadir un sonido y" },
      fr: { title: "Ajouter un son y" },
      de: { title: "Ein y dazu" },
      'pt-BR': { title: "Acrescentar um som de i" },
      vi: { title: "Thêm âm y" },
      th: { title: "เติมเสียง y" },
      ar: { title: "إضافة الياء" },
      bn: { title: "একটি y যোগ করা" },
      cs: { title: "Přidáváme j" },
      el: { title: "Προσθέτουμε ένα γι" },
      fil: { title: "Pagdaragdag ng y" },
      hi: { title: "एक य जोड़ना" },
      hu: { title: "Egy j hozzáadása" },
      id: { title: "Menambahkan bunyi y" },
      it: { title: "Aggiungere una i" },
      kk: { title: "й дыбысын қосу" },
      ky: { title: "й үнүн кошуу" },
      mn: { title: "й дуу нэмэх" },
      nl: { title: "Een j erbij" },
      pl: { title: "Dodajemy j" },
      ro: { title: "Adăugăm un i" },
      ru: { title: "Добавляем й" },
      sv: { title: "Lägg till ett j" },
      ta: { title: "ய் ஒலியைச் சேர்த்தல்" },
      te: { title: "య ధ్వనిని చేర్చడం" },
      tr: { title: "Bir y eklemek" },
      uk: { title: "Додаємо й" },
      uz: { title: "y tovushini qo‘shish" },
    },
  },
  {
    id: 'lesson-consonants-aspirated', unit: 7, group: 'basic_consonant', items: ASPIRATED_CONSONANTS,
    prerequisites: ['ㄱ', 'ㄷ', 'ㅂ', 'ㅈ'],
    titles: {
      en: { title: "Adding a puff of air" },
      ko: { title: "거센소리" },
      ja: { title: "息をひと吹き足す" },
      'zh-CN': { title: "加上一口气" },
      es: { title: "Añadir un soplo de aire" },
      fr: { title: "Ajouter un souffle d’air" },
      de: { title: "Ein Hauch Luft dazu" },
      'pt-BR': { title: "Acrescentar um sopro de ar" },
      vi: { title: "Thêm một hơi bật" },
      th: { title: "เติมเสียงลมพ่น" },
      ar: { title: "إضافة نفخة هواء" },
      bn: { title: "একটু বাতাস যোগ করা" },
      cs: { title: "Přidáváme dech" },
      el: { title: "Προσθέτουμε μια πνοή" },
      fil: { title: "Pagdaragdag ng hangin" },
      hi: { title: "हवा की एक फूँक जोड़ना" },
      hu: { title: "Egy leheletnyi levegő" },
      id: { title: "Menambahkan embusan napas" },
      it: { title: "Aggiungere un soffio d'aria" },
      kk: { title: "Ауа лебін қосу" },
      ky: { title: "Аба лебин кошуу" },
      mn: { title: "Агаарын үлээлт нэмэх" },
      nl: { title: "Een pufje lucht erbij" },
      pl: { title: "Dodajemy powiew powietrza" },
      ro: { title: "Adăugăm o suflare" },
      ru: { title: "Добавляем придыхание" },
      sv: { title: "Lägg till en luftpuff" },
      ta: { title: "ஒரு காற்றூதலைச் சேர்த்தல்" },
      te: { title: "గాలి ఊపును చేర్చడం" },
      tr: { title: "Bir soluk eklemek" },
      uk: { title: "Додаємо подих" },
      uz: { title: "Bir puf havo qo‘shish" },
    },
  },
  {
    id: 'lesson-vowels-e', unit: 8, group: 'compound_vowel', items: E_VOWELS,
    prerequisites: ['ㅏ', 'ㅓ', 'ㅑ', 'ㅕ', 'ㅣ'],
    titles: {
      en: { title: "The e vowels" },
      ko: { title: "\"에\" 계열 모음" },
      ja: { title: "「エ」系の母音" },
      'zh-CN': { title: "e 系元音" },
      es: { title: "Las vocales e" },
      fr: { title: "Les voyelles e" },
      de: { title: "Die e-Vokale" },
      'pt-BR': { title: "As vogais e" },
      vi: { title: "Nhóm nguyên âm e" },
      th: { title: "กลุ่มสระ e" },
      ar: { title: "صوائت الإيه" },
      bn: { title: "এ-স্বরগুলো" },
      cs: { title: "Samohlásky s e" },
      el: { title: "Τα φωνήεντα με ε" },
      fil: { title: "Ang mga patinig na e" },
      hi: { title: "ए वाले स्वर" },
      hu: { title: "Az e-magánhangzók" },
      id: { title: "Vokal e" },
      it: { title: "Le vocali e" },
      kk: { title: "Е-дауыстылар" },
      ky: { title: "Э-үндүүлөр" },
      mn: { title: "Э-эгшгүүд" },
      nl: { title: "De e-klinkers" },
      pl: { title: "Samogłoski e" },
      ro: { title: "Vocalele cu e" },
      ru: { title: "Гласные с «э»" },
      sv: { title: "E-vokalerna" },
      ta: { title: "எ-உயிரெழுத்துகள்" },
      te: { title: "ఎ-అచ్చులు" },
      tr: { title: "e ünlüleri" },
      uk: { title: "Голосні з «е»" },
      uz: { title: "E-unlilar" },
    },
  },
  {
    id: 'lesson-consonants-tense', unit: 9, group: 'double_consonant', items: TENSE_CONSONANTS,
    prerequisites: ['ㄱ', 'ㄷ', 'ㅂ', 'ㅅ', 'ㅈ'],
    titles: {
      en: { title: "Doubled and tightened" },
      ko: { title: "겹쳐서 세게" },
      ja: { title: "重ねて強く" },
      'zh-CN': { title: "双写与收紧" },
      es: { title: "Dobladas y tensas" },
      fr: { title: "Doublées et tendues" },
      de: { title: "Verdoppelt und gespannt" },
      'pt-BR': { title: "Dobradas e tensas" },
      vi: { title: "Viết đôi, đọc căng" },
      th: { title: "เขียนซ้อน อ่านหนัก" },
      ar: { title: "مضاعفة ومشدّدة" },
      bn: { title: "দ্বিগুণ আর আঁটসাঁট" },
      cs: { title: "Zdvojené a napjaté" },
      el: { title: "Διπλά και σφιγμένα" },
      fil: { title: "Doble at mahigpit" },
      hi: { title: "दुगुने और कसे हुए" },
      hu: { title: "Megkettőzve és feszesen" },
      id: { title: "Digandakan dan dirapatkan" },
      it: { title: "Raddoppiate e tese" },
      kk: { title: "Қосарланған, қатайған" },
      ky: { title: "Кош, кысык" },
      mn: { title: "Давхарласан, чангарсан" },
      nl: { title: "Verdubbeld en aangespannen" },
      pl: { title: "Podwojone i napięte" },
      ro: { title: "Dublate și încordate" },
      ru: { title: "Удвоенные и напряжённые" },
      sv: { title: "Fördubblade och spända" },
      ta: { title: "இரட்டித்து இறுக்கமாக" },
      te: { title: "రెట్టింపు, బిగువు" },
      tr: { title: "İkilenmiş ve sıkılmış" },
      uk: { title: "Подвоєні й напружені" },
      uz: { title: "Ikkilangan va tarang" },
    },
  },
  {
    id: 'lesson-vowels-w', unit: 10, group: 'compound_vowel', items: W_VOWELS,
    prerequisites: ['ㅗ', 'ㅜ', 'ㅏ', 'ㅓ', 'ㅐ', 'ㅔ', 'ㅡ', 'ㅣ'],
    titles: {
      en: { title: "The w vowels" },
      ko: { title: "\"오/우\" 모음" },
      ja: { title: "「ワ」行の母音" },
      'zh-CN': { title: "w 系元音" },
      es: { title: "Las vocales w" },
      fr: { title: "Les voyelles w" },
      de: { title: "Die w-Vokale" },
      'pt-BR': { title: "As vogais w" },
      vi: { title: "Nhóm nguyên âm w" },
      th: { title: "กลุ่มสระ w" },
      ar: { title: "صوائت الواو" },
      bn: { title: "ও-স্বরগুলো" },
      cs: { title: "Samohlásky s v" },
      el: { title: "Τα φωνήεντα με ου" },
      fil: { title: "Ang mga patinig na w" },
      hi: { title: "व वाले स्वर" },
      hu: { title: "A v-magánhangzók" },
      id: { title: "Vokal w" },
      it: { title: "Le vocali u" },
      kk: { title: "У-дауыстылар" },
      ky: { title: "У-үндүүлөр" },
      mn: { title: "В-эгшгүүд" },
      nl: { title: "De w-klinkers" },
      pl: { title: "Samogłoski w" },
      ro: { title: "Vocalele cu u" },
      ru: { title: "Гласные с «в»" },
      sv: { title: "W-vokalerna" },
      ta: { title: "வ-உயிரெழுத்துகள்" },
      te: { title: "వ-అచ్చులు" },
      tr: { title: "w ünlüleri" },
      uk: { title: "Голосні з «в»" },
      uz: { title: "V-unlilar" },
    },
  },
  {
    id: 'lesson-final-basic', unit: 11, group: 'final_consonant', items: SYLLABLES_FINAL_BASIC,
    prerequisites: ['ㄴ', 'ㄹ', 'ㅁ', 'ㅇ', 'ㅏ'],
    titles: {
      en: { title: "A letter at the foot" },
      ko: { title: "발밑의 낱자" },
      ja: { title: "足もとの文字" },
      'zh-CN': { title: "脚下的字母" },
      es: { title: "Una letra al pie" },
      fr: { title: "Une lettre au pied" },
      de: { title: "Ein Buchstabe am Fuß" },
      'pt-BR': { title: "Uma letra no pé" },
      vi: { title: "Một chữ ở chân khối" },
      th: { title: "ตัวอักษรที่ฐานบล็อก" },
      ar: { title: "حرف في القاع" },
      bn: { title: "নিচে একটি অক্ষর" },
      cs: { title: "Litera dole" },
      el: { title: "Ένα γράμμα στη βάση" },
      fil: { title: "Isang letra sa ilalim" },
      hi: { title: "तल पर एक अक्षर" },
      hu: { title: "Egy betű a talpnál" },
      id: { title: "Satu huruf di dasar" },
      it: { title: "Una lettera in fondo" },
      kk: { title: "Астында бір әріп" },
      ky: { title: "Астында бир тамга" },
      mn: { title: "Доор нь нэг үсэг" },
      nl: { title: "Een letter onderaan" },
      pl: { title: "Litera u dołu" },
      ro: { title: "O literă la bază" },
      ru: { title: "Буква внизу" },
      sv: { title: "En bokstav längst ned" },
      ta: { title: "அடியில் ஓர் எழுத்து" },
      te: { title: "అడుగున ఒక అక్షరం" },
      tr: { title: "Dipte bir harf" },
      uk: { title: "Літера внизу" },
      uz: { title: "Ostda bir harf" },
    },
  },
  {
    id: 'lesson-final-sounds', unit: 11, group: 'final_consonant', items: SYLLABLES_FINAL_SOUNDS,
    prerequisites: ['ㅂ', 'ㅅ', 'ㄱ', 'ㅊ', 'ㅎ', 'ㄲ'],
    titles: {
      en: { title: "Seven sounds only" },
      ko: { title: "받침 소리는 일곱 개" },
      ja: { title: "終わりの音は7つだけ" },
      'zh-CN': { title: "收尾只有七个音" },
      es: { title: "Solo siete sonidos" },
      fr: { title: "Sept sons seulement" },
      de: { title: "Nur sieben Laute" },
      'pt-BR': { title: "Apenas sete sons" },
      vi: { title: "Chỉ có bảy âm cuối" },
      th: { title: "เสียงสะกดมีแค่เจ็ดเสียง" },
      ar: { title: "سبعة أصوات فقط" },
      bn: { title: "মাত্র সাতটি ধ্বনি" },
      cs: { title: "Jen sedm zvuků" },
      el: { title: "Μόνο επτά ήχοι" },
      fil: { title: "Pitong tunog lamang" },
      hi: { title: "केवल सात ध्वनियाँ" },
      hu: { title: "Csak hét hang" },
      id: { title: "Hanya tujuh bunyi" },
      it: { title: "Solo sette suoni" },
      kk: { title: "Тек жеті дыбыс" },
      ky: { title: "Болгону жети үн" },
      mn: { title: "Ердөө долоон авиа" },
      nl: { title: "Maar zeven klanken" },
      pl: { title: "Tylko siedem dźwięków" },
      ro: { title: "Doar șapte sunete" },
      ru: { title: "Только семь звуков" },
      sv: { title: "Bara sju ljud" },
      ta: { title: "ஏழு ஒலிகள் மட்டுமே" },
      te: { title: "కేవలం ఏడు ధ్వనులు" },
      tr: { title: "Yalnızca yedi ses" },
      uk: { title: "Лише сім звуків" },
      uz: { title: "Atigi yettita tovush" },
    },
  },
  {
    id: 'lesson-reading', unit: 12, group: 'syllable', items: SYLLABLES_READING,
    prerequisites: ['ㄱ', 'ㅡ', 'ㄹ', 'ㅗ', 'ㅇ', 'ㅂ', 'ㅜ'],
    titles: {
      en: { title: "Reading 한글" },
      ko: { title: "한글 읽기" },
      ja: { title: "ハングルを読む" },
      'zh-CN': { title: "读「한글」" },
      es: { title: "Leer 한글" },
      fr: { title: "Lire 한글" },
      de: { title: "한글 lesen" },
      'pt-BR': { title: "Lendo 한글" },
      vi: { title: "Đọc chữ 한글" },
      th: { title: "อ่านคำว่า 한글" },
      ar: { title: "قراءة 한글" },
      bn: { title: "한글 পড়া" },
      cs: { title: "Čteme 한글" },
      el: { title: "Διαβάζουμε 한글" },
      fil: { title: "Pagbasa ng 한글" },
      hi: { title: "한글 पढ़ना" },
      hu: { title: "한글 olvasása" },
      id: { title: "Membaca 한글" },
      it: { title: "Leggere 한글" },
      kk: { title: "한글 оқу" },
      ky: { title: "한글 окуу" },
      mn: { title: "한글 унших" },
      nl: { title: "한글 lezen" },
      pl: { title: "Czytamy 한글" },
      ro: { title: "Citim 한글" },
      ru: { title: "Читаем 한글" },
      sv: { title: "Läsa 한글" },
      ta: { title: "한글 படித்தல்" },
      te: { title: "한글 చదవడం" },
      tr: { title: "한글 okumak" },
      uk: { title: "Читаємо 한글" },
      uz: { title: "한글 ni o‘qish" },
    },
  },
];

export const LETTER_LESSONS: LetterLesson[] = LESSON_SPECS.map((spec, index) => ({
  id: spec.id,
  subtitle: preview(spec.items),
  group: spec.group,
  character_ids: ids(spec.items),
  sequence: index + 1,
  unit: spec.unit,
  prerequisites: spec.prerequisites ?? [],
  translations: spec.titles,
}));

/**
 * Units that open with an explainer.
 *
 * Three moments in the curriculum need framing rather than another writing box:
 * what this writing system *is* before the first letter, how letters stack into
 * a block before the first syllable, and what a 받침 does before the first one
 * appears. Everywhere else an explainer would be an obstacle between the
 * learner and the practice.
 */
const UNITS_WITH_INTRO = new Set([1, 3, 11]);

/**
 * The worked example each explainer draws.
 *
 * Korean, so it belongs in the data and not in nine translation bundles
 * carrying an identical copy. `ㄱ + ㅏ = 가` is the same sentence in every
 * language, because it is not a sentence.
 */
const INTRO_DIAGRAMS: Record<number, string> = {
  1: 'ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ',
  3: 'ㄱ + ㅏ = 가\nㄱ + ㅗ = 고',
  11: 'ㅎ + ㅏ + ㄴ = 한\n한 + 글 = 한글',
};

export const CURRICULUM_UNITS: CurriculumUnit[] = [...new Set(LESSON_SPECS.map((s) => s.unit))]
  .sort((a, b) => a - b)
  .map((unit) => {
    const lessons = LESSON_SPECS.filter((s) => s.unit === unit);
    return {
      id: `unit-${unit}`,
      index: unit,
      preview: preview(lessons.flatMap((l) => l.items)),
      lesson_ids: lessons.map((l) => l.id),
      has_intro: UNITS_WITH_INTRO.has(unit),
      intro_diagram: INTRO_DIAGRAMS[unit] ?? null,
    };
  });

const BY_ID = new Map(ALL_CHARACTERS.map((x) => [x.id, x]));
const BY_CHARACTER = new Map(ALL_CHARACTERS.map((x) => [x.character, x]));

export function getCharacter(id: string): HangulCharacter | undefined {
  return BY_ID.get(id);
}

export function getCharacterByGlyph(glyph: string): HangulCharacter | undefined {
  return BY_CHARACTER.get(glyph);
}

export function getLesson(id: string): LetterLesson | undefined {
  return LETTER_LESSONS.find((lesson) => lesson.id === id);
}

export function getUnit(id: string): CurriculumUnit | undefined {
  return CURRICULUM_UNITS.find((unit) => unit.id === id);
}

export function getLessonCharacters(lesson: LetterLesson): HangulCharacter[] {
  return lesson.character_ids.map((id) => BY_ID.get(id)).filter((x): x is HangulCharacter => !!x);
}

/**
 * The order letters are introduced in, as characters.
 *
 * Vocabulary gating reads this: a word is offered once every letter it needs
 * appears at or before the learner's furthest point. Derived from the lessons
 * rather than typed out again, so the two cannot disagree.
 */
export const LETTER_ORDER: string[] = ALL_LETTERS.map((c) => c.character);

/** Letter-group names are interface chrome; this is the order they are taught. */
export const LETTER_GROUPS: LetterGroup[] = [
  'basic_vowel',
  'basic_consonant',
  'syllable',
  'compound_vowel',
  'double_consonant',
  'final_consonant',
];

/** Every distinct syllable the curriculum teaches — used by the audio build. */
export const CURRICULUM_SYLLABLES: string[] = ALL_SYLLABLES.map((c) => c.character);
