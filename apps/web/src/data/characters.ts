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
      en: t('like ya in "yard"', 'ㅏ with a second branch. The four y-vowels are each written this way.'),
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
      en: t('ㅈ with a puff of air', 'ㅈ with one more stroke. Compare the two sounds: ㅊ is said with more breath.'),
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
      en: t('ㄱ, tight and sharp', 'Two ㄱ. Say it with the throat tight.'),
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
      en: t('like wa in "wander"', 'ㅗ + ㅏ written together. Compare it with ㅗ on its own.'),
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
      en: { title: "The six basic vowels" },
      ko: { title: "기본 모음 여섯 개" },
      ja: { title: "基本の母音 六つ" },
      'zh-CN': { title: "六个基本元音" },
      es: { title: "Las seis vocales básicas" },
      fr: { title: "Les six voyelles de base" },
      de: { title: "Die sechs Grundvokale" },
      'pt-BR': { title: "As seis vogais básicas" },
      vi: { title: "Sáu nguyên âm cơ bản" },
      th: { title: "สระพื้นฐานหกตัว" },
      ar: { title: "حروف العلة الستة الأساسية" },
      bn: { title: "ছয়টি মৌলিক স্বরবর্ণ" },
      cs: { title: "Šest základních samohlásek" },
      el: { title: "Τα έξι βασικά φωνήεντα" },
      fil: { title: "Ang anim na pangunahing patinig" },
      hi: { title: "छह मूल स्वर" },
      hu: { title: "A hat alapmagánhangzó" },
      id: { title: "Enam vokal dasar" },
      it: { title: "Le sei vocali di base" },
      kk: { title: "Алты негізгі дауысты" },
      ky: { title: "Алты негизги үндүү" },
      mn: { title: "Үндсэн зургаан эгшиг" },
      nl: { title: "De zes basisklinkers" },
      pl: { title: "Sześć podstawowych samogłosek" },
      ro: { title: "Cele șase vocale de bază" },
      ru: { title: "Шесть основных гласных" },
      sv: { title: "De sex grundvokalerna" },
      ta: { title: "அடிப்படை உயிரெழுத்து ஆறு" },
      te: { title: "ఆరు ప్రాథమిక అచ్చులు" },
      tr: { title: "Altı temel ünlü" },
      uk: { title: "Шість основних голосних" },
      uz: { title: "Oltita asosiy unli" },
    },
  },
  {
    id: 'lesson-consonants-first', unit: 2, group: 'basic_consonant', items: FIRST_CONSONANTS,
    titles: {
      en: { title: "The first five consonants" },
      ko: { title: "기본 자음 다섯 개" },
      ja: { title: "基本の子音 五つ" },
      'zh-CN': { title: "最初的五个辅音" },
      es: { title: "Las cinco primeras consonantes" },
      fr: { title: "Les cinq premières consonnes" },
      de: { title: "Die ersten fünf Konsonanten" },
      'pt-BR': { title: "As cinco primeiras consoantes" },
      vi: { title: "Năm phụ âm đầu tiên" },
      th: { title: "พยัญชนะห้าตัวแรก" },
      ar: { title: "أول خمسة حروف ساكنة" },
      bn: { title: "প্রথম পাঁচটি ব্যঞ্জনবর্ণ" },
      cs: { title: "Prvních pět souhlásek" },
      el: { title: "Τα πρώτα πέντε σύμφωνα" },
      fil: { title: "Ang unang limang katinig" },
      hi: { title: "पहले पाँच व्यंजन" },
      hu: { title: "Az első öt mássalhangzó" },
      id: { title: "Lima konsonan pertama" },
      it: { title: "Le prime cinque consonanti" },
      kk: { title: "Алғашқы бес дауыссыз" },
      ky: { title: "Биринчи беш үнсүз" },
      mn: { title: "Эхний таван гийгүүлэгч" },
      nl: { title: "De eerste vijf medeklinkers" },
      pl: { title: "Pierwsze pięć spółgłosek" },
      ro: { title: "Primele cinci consoane" },
      ru: { title: "Первые пять согласных" },
      sv: { title: "De första fem konsonanterna" },
      ta: { title: "முதல் ஐந்து மெய்யெழுத்து" },
      te: { title: "మొదటి ఐదు హల్లులు" },
      tr: { title: "İlk beş ünsüz" },
      uk: { title: "Перші п'ять приголосних" },
      uz: { title: "Dastlabki beshta undosh" },
    },
  },
  {
    id: 'lesson-syllables-ca', unit: 3, group: 'syllable', items: SYLLABLES_CV_VERTICAL,
    prerequisites: ['ㅏ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'],
    titles: {
      en: { title: "Putting a consonant and a vowel together" },
      ko: { title: "자음과 모음 합치기" },
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
      en: { title: "Where the vowel goes" },
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
      ja: { title: "子音をあと五つ" },
      'zh-CN': { title: "再学五个辅音" },
      es: { title: "Cinco consonantes más" },
      fr: { title: "Cinq consonnes de plus" },
      de: { title: "Fünf weitere Konsonanten" },
      'pt-BR': { title: "Mais cinco consoantes" },
      vi: { title: "Thêm năm phụ âm nữa" },
      th: { title: "พยัญชนะอีกห้าตัว" },
      ar: { title: "خمسة حروف ساكنة أخرى" },
      bn: { title: "আরও পাঁচটি ব্যঞ্জনবর্ণ" },
      cs: { title: "Dalších pět souhlásek" },
      el: { title: "Άλλα πέντε σύμφωνα" },
      fil: { title: "Limang katinig pa" },
      hi: { title: "पाँच और व्यंजन" },
      hu: { title: "Még öt mássalhangzó" },
      id: { title: "Lima konsonan lagi" },
      it: { title: "Altre cinque consonanti" },
      kk: { title: "Тағы бес дауыссыз" },
      ky: { title: "Дагы беш үнсүз" },
      mn: { title: "Дахин таван гийгүүлэгч" },
      nl: { title: "Nog vijf medeklinkers" },
      pl: { title: "Jeszcze pięć spółgłosek" },
      ro: { title: "Încă cinci consoane" },
      ru: { title: "Ещё пять согласных" },
      sv: { title: "Fem konsonanter till" },
      ta: { title: "மேலும் ஐந்து மெய்யெழுத்து" },
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
      en: { title: "Reading blocks with the new consonants" },
      ko: { title: "새 자음으로 글자 읽기" },
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
      en: { title: "The ㅇ that makes no sound" },
      ko: { title: "소리 없는 ㅇ" },
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
      en: { title: "The vowels ㅑ ㅕ ㅛ ㅠ" },
      ko: { title: "ㅑ ㅕ ㅛ ㅠ 배우기" },
      ja: { title: "ㅑ ㅕ ㅛ ㅠ を学ぶ" },
      'zh-CN': { title: "学 ㅑ ㅕ ㅛ ㅠ" },
      es: { title: "Las vocales ㅑ ㅕ ㅛ ㅠ" },
      fr: { title: "Les voyelles ㅑ ㅕ ㅛ ㅠ" },
      de: { title: "Die Vokale ㅑ ㅕ ㅛ ㅠ" },
      'pt-BR': { title: "As vogais ㅑ ㅕ ㅛ ㅠ" },
      vi: { title: "Học ㅑ ㅕ ㅛ ㅠ" },
      th: { title: "เรียนสระ ㅑ ㅕ ㅛ ㅠ" },
      ar: { title: "حروف العلة ㅑ ㅕ ㅛ ㅠ" },
      bn: { title: "ㅑ ㅕ ㅛ ㅠ শেখা" },
      cs: { title: "Samohlásky ㅑ ㅕ ㅛ ㅠ" },
      el: { title: "Τα φωνήεντα ㅑ ㅕ ㅛ ㅠ" },
      fil: { title: "Ang mga patinig ㅑ ㅕ ㅛ ㅠ" },
      hi: { title: "ㅑ ㅕ ㅛ ㅠ सीखना" },
      hu: { title: "A ㅑ ㅕ ㅛ ㅠ magánhangzók" },
      id: { title: "Vokal ㅑ ㅕ ㅛ ㅠ" },
      it: { title: "Le vocali ㅑ ㅕ ㅛ ㅠ" },
      kk: { title: "ㅑ ㅕ ㅛ ㅠ дауыстылары" },
      ky: { title: "ㅑ ㅕ ㅛ ㅠ үндүүлөрү" },
      mn: { title: "ㅑ ㅕ ㅛ ㅠ эгшгүүд" },
      nl: { title: "De klinkers ㅑ ㅕ ㅛ ㅠ" },
      pl: { title: "Samogłoski ㅑ ㅕ ㅛ ㅠ" },
      ro: { title: "Vocalele ㅑ ㅕ ㅛ ㅠ" },
      ru: { title: "Гласные ㅑ ㅕ ㅛ ㅠ" },
      sv: { title: "Vokalerna ㅑ ㅕ ㅛ ㅠ" },
      ta: { title: "ㅑ ㅕ ㅛ ㅠ கற்றல்" },
      te: { title: "ㅑ ㅕ ㅛ ㅠ నేర్చుకోవడం" },
      tr: { title: "ㅑ ㅕ ㅛ ㅠ ünlüleri" },
      uk: { title: "Голосні ㅑ ㅕ ㅛ ㅠ" },
      uz: { title: "ㅑ ㅕ ㅛ ㅠ unlilari" },
    },
  },
  {
    id: 'lesson-consonants-aspirated', unit: 7, group: 'basic_consonant', items: ASPIRATED_CONSONANTS,
    prerequisites: ['ㄱ', 'ㄷ', 'ㅂ', 'ㅈ'],
    titles: {
      en: { title: "The aspirated consonants ㅊ ㅋ ㅌ ㅍ" },
      ko: { title: "거센소리 ㅊ ㅋ ㅌ ㅍ" },
      ja: { title: "激音 ㅊ ㅋ ㅌ ㅍ" },
      'zh-CN': { title: "送气音 ㅊ ㅋ ㅌ ㅍ" },
      es: { title: "Las consonantes aspiradas ㅊ ㅋ ㅌ ㅍ" },
      fr: { title: "Les consonnes aspirées ㅊ ㅋ ㅌ ㅍ" },
      de: { title: "Die behauchten Konsonanten ㅊ ㅋ ㅌ ㅍ" },
      'pt-BR': { title: "As consoantes aspiradas ㅊ ㅋ ㅌ ㅍ" },
      vi: { title: "Phụ âm bật hơi ㅊ ㅋ ㅌ ㅍ" },
      th: { title: "พยัญชนะพ่นลม ㅊ ㅋ ㅌ ㅍ" },
      ar: { title: "الحروف المهموسة ㅊ ㅋ ㅌ ㅍ" },
      bn: { title: "মহাপ্রাণ ㅊ ㅋ ㅌ ㅍ" },
      cs: { title: "Aspirované souhlásky ㅊ ㅋ ㅌ ㅍ" },
      el: { title: "Τα δασέα σύμφωνα ㅊ ㅋ ㅌ ㅍ" },
      fil: { title: "Ang mga katinig na ㅊ ㅋ ㅌ ㅍ" },
      hi: { title: "महाप्राण ㅊ ㅋ ㅌ ㅍ" },
      hu: { title: "A hehezetes ㅊ ㅋ ㅌ ㅍ" },
      id: { title: "Konsonan beraspirasi ㅊ ㅋ ㅌ ㅍ" },
      it: { title: "Le consonanti aspirate ㅊ ㅋ ㅌ ㅍ" },
      kk: { title: "Ұмтылмалы ㅊ ㅋ ㅌ ㅍ" },
      ky: { title: "Дем чыгаруучу ㅊ ㅋ ㅌ ㅍ" },
      mn: { title: "Хүчтэй амьсгалт ㅊ ㅋ ㅌ ㅍ" },
      nl: { title: "De geaspireerde ㅊ ㅋ ㅌ ㅍ" },
      pl: { title: "Spółgłoski przydechowe ㅊ ㅋ ㅌ ㅍ" },
      ro: { title: "Consoanele aspirate ㅊ ㅋ ㅌ ㅍ" },
      ru: { title: "Придыхательные ㅊ ㅋ ㅌ ㅍ" },
      sv: { title: "De aspirerade ㅊ ㅋ ㅌ ㅍ" },
      ta: { title: "வலிந்த ஒலி ㅊ ㅋ ㅌ ㅍ" },
      te: { title: "మహాప్రాణాలు ㅊ ㅋ ㅌ ㅍ" },
      tr: { title: "Soluklu ünsüzler ㅊ ㅋ ㅌ ㅍ" },
      uk: { title: "Придихові ㅊ ㅋ ㅌ ㅍ" },
      uz: { title: "Nafasli undoshlar ㅊ ㅋ ㅌ ㅍ" },
    },
  },
  {
    id: 'lesson-vowels-e', unit: 8, group: 'compound_vowel', items: E_VOWELS,
    prerequisites: ['ㅏ', 'ㅓ', 'ㅑ', 'ㅕ', 'ㅣ'],
    titles: {
      en: { title: "The vowels ㅐ ㅔ ㅒ ㅖ" },
      ko: { title: "ㅐ ㅔ ㅒ ㅖ 배우기" },
      ja: { title: "ㅐ ㅔ ㅒ ㅖ を学ぶ" },
      'zh-CN': { title: "学 ㅐ ㅔ ㅒ ㅖ" },
      es: { title: "Las vocales ㅐ ㅔ ㅒ ㅖ" },
      fr: { title: "Les voyelles ㅐ ㅔ ㅒ ㅖ" },
      de: { title: "Die Vokale ㅐ ㅔ ㅒ ㅖ" },
      'pt-BR': { title: "As vogais ㅐ ㅔ ㅒ ㅖ" },
      vi: { title: "Học ㅐ ㅔ ㅒ ㅖ" },
      th: { title: "เรียนสระ ㅐ ㅔ ㅒ ㅖ" },
      ar: { title: "حروف العلة ㅐ ㅔ ㅒ ㅖ" },
      bn: { title: "ㅐ ㅔ ㅒ ㅖ শেখা" },
      cs: { title: "Samohlásky ㅐ ㅔ ㅒ ㅖ" },
      el: { title: "Τα φωνήεντα ㅐ ㅔ ㅒ ㅖ" },
      fil: { title: "Ang mga patinig ㅐ ㅔ ㅒ ㅖ" },
      hi: { title: "ㅐ ㅔ ㅒ ㅖ सीखना" },
      hu: { title: "A ㅐ ㅔ ㅒ ㅖ magánhangzók" },
      id: { title: "Vokal ㅐ ㅔ ㅒ ㅖ" },
      it: { title: "Le vocali ㅐ ㅔ ㅒ ㅖ" },
      kk: { title: "ㅐ ㅔ ㅒ ㅖ дауыстылары" },
      ky: { title: "ㅐ ㅔ ㅒ ㅖ үндүүлөрү" },
      mn: { title: "ㅐ ㅔ ㅒ ㅖ эгшгүүд" },
      nl: { title: "De klinkers ㅐ ㅔ ㅒ ㅖ" },
      pl: { title: "Samogłoski ㅐ ㅔ ㅒ ㅖ" },
      ro: { title: "Vocalele ㅐ ㅔ ㅒ ㅖ" },
      ru: { title: "Гласные ㅐ ㅔ ㅒ ㅖ" },
      sv: { title: "Vokalerna ㅐ ㅔ ㅒ ㅖ" },
      ta: { title: "ㅐ ㅔ ㅒ ㅖ கற்றல்" },
      te: { title: "ㅐ ㅔ ㅒ ㅖ నేర్చుకోవడం" },
      tr: { title: "ㅐ ㅔ ㅒ ㅖ ünlüleri" },
      uk: { title: "Голосні ㅐ ㅔ ㅒ ㅖ" },
      uz: { title: "ㅐ ㅔ ㅒ ㅖ unlilari" },
    },
  },
  {
    id: 'lesson-consonants-tense', unit: 9, group: 'double_consonant', items: TENSE_CONSONANTS,
    prerequisites: ['ㄱ', 'ㄷ', 'ㅂ', 'ㅅ', 'ㅈ'],
    titles: {
      en: { title: "The tense consonants ㄲ ㄸ ㅃ ㅆ ㅉ" },
      ko: { title: "된소리 ㄲ ㄸ ㅃ ㅆ ㅉ" },
      ja: { title: "濃音 ㄲ ㄸ ㅃ ㅆ ㅉ" },
      'zh-CN': { title: "紧音 ㄲ ㄸ ㅃ ㅆ ㅉ" },
      es: { title: "Las consonantes tensas ㄲ ㄸ ㅃ ㅆ ㅉ" },
      fr: { title: "Les consonnes tendues ㄲ ㄸ ㅃ ㅆ ㅉ" },
      de: { title: "Die gespannten Konsonanten ㄲ ㄸ ㅃ ㅆ ㅉ" },
      'pt-BR': { title: "As consoantes tensas ㄲ ㄸ ㅃ ㅆ ㅉ" },
      vi: { title: "Phụ âm căng ㄲ ㄸ ㅃ ㅆ ㅉ" },
      th: { title: "พยัญชนะเสียงกัก ㄲ ㄸ ㅃ ㅆ ㅉ" },
      ar: { title: "الحروف المشددة ㄲ ㄸ ㅃ ㅆ ㅉ" },
      bn: { title: "দ্বিত্ব ㄲ ㄸ ㅃ ㅆ ㅉ" },
      cs: { title: "Napjaté souhlásky ㄲ ㄸ ㅃ ㅆ ㅉ" },
      el: { title: "Τα έντονα σύμφωνα ㄲ ㄸ ㅃ ㅆ ㅉ" },
      fil: { title: "Ang mga katinig na ㄲ ㄸ ㅃ ㅆ ㅉ" },
      hi: { title: "कठोर ㄲ ㄸ ㅃ ㅆ ㅉ" },
      hu: { title: "A feszes ㄲ ㄸ ㅃ ㅆ ㅉ" },
      id: { title: "Konsonan tegang ㄲ ㄸ ㅃ ㅆ ㅉ" },
      it: { title: "Le consonanti tese ㄲ ㄸ ㅃ ㅆ ㅉ" },
      kk: { title: "Қатаң ㄲ ㄸ ㅃ ㅆ ㅉ" },
      ky: { title: "Катуу ㄲ ㄸ ㅃ ㅆ ㅉ" },
      mn: { title: "Чанга ㄲ ㄸ ㅃ ㅆ ㅉ" },
      nl: { title: "De gespannen ㄲ ㄸ ㅃ ㅆ ㅉ" },
      pl: { title: "Spółgłoski napięte ㄲ ㄸ ㅃ ㅆ ㅉ" },
      ro: { title: "Consoanele tensionate ㄲ ㄸ ㅃ ㅆ ㅉ" },
      ru: { title: "Напряжённые ㄲ ㄸ ㅃ ㅆ ㅉ" },
      sv: { title: "De spända ㄲ ㄸ ㅃ ㅆ ㅉ" },
      ta: { title: "இறுக்க ஒலி ㄲ ㄸ ㅃ ㅆ ㅉ" },
      te: { title: "ద్విత్వాలు ㄲ ㄸ ㅃ ㅆ ㅉ" },
      tr: { title: "Gergin ünsüzler ㄲ ㄸ ㅃ ㅆ ㅉ" },
      uk: { title: "Напружені ㄲ ㄸ ㅃ ㅆ ㅉ" },
      uz: { title: "Zich undoshlar ㄲ ㄸ ㅃ ㅆ ㅉ" },
    },
  },
  {
    id: 'lesson-vowels-w', unit: 10, group: 'compound_vowel', items: W_VOWELS,
    prerequisites: ['ㅗ', 'ㅜ', 'ㅏ', 'ㅓ', 'ㅐ', 'ㅔ', 'ㅡ', 'ㅣ'],
    titles: {
      en: { title: "The combined vowels" },
      ko: { title: "복합 모음 배우기" },
      ja: { title: "合成母音を学ぶ" },
      'zh-CN': { title: "学复合元音" },
      es: { title: "Las vocales combinadas" },
      fr: { title: "Les voyelles composées" },
      de: { title: "Die zusammengesetzten Vokale" },
      'pt-BR': { title: "As vogais compostas" },
      vi: { title: "Học nguyên âm ghép" },
      th: { title: "เรียนสระประสม" },
      ar: { title: "حروف العلة المركّبة" },
      bn: { title: "যুক্ত স্বরবর্ণ" },
      cs: { title: "Složené samohlásky" },
      el: { title: "Τα σύνθετα φωνήεντα" },
      fil: { title: "Ang mga pinagsamang patinig" },
      hi: { title: "संयुक्त स्वर" },
      hu: { title: "Az összetett magánhangzók" },
      id: { title: "Vokal gabungan" },
      it: { title: "Le vocali composte" },
      kk: { title: "Құрама дауыстылар" },
      ky: { title: "Кошмо үндүүлөр" },
      mn: { title: "Нийлмэл эгшгүүд" },
      nl: { title: "De samengestelde klinkers" },
      pl: { title: "Samogłoski złożone" },
      ro: { title: "Vocalele compuse" },
      ru: { title: "Составные гласные" },
      sv: { title: "De sammansatta vokalerna" },
      ta: { title: "கூட்டு உயிரெழுத்து" },
      te: { title: "సంయుక్త అచ్చులు" },
      tr: { title: "Bileşik ünlüler" },
      uk: { title: "Складені голосні" },
      uz: { title: "Qo'shma unlilar" },
    },
  },
  {
    id: 'lesson-final-basic', unit: 11, group: 'final_consonant', items: SYLLABLES_FINAL_BASIC,
    prerequisites: ['ㄴ', 'ㄹ', 'ㅁ', 'ㅇ', 'ㅏ'],
    titles: {
      en: { title: "Final consonants: 받침" },
      ko: { title: "받침 배우기" },
      ja: { title: "パッチムを学ぶ" },
      'zh-CN': { title: "学收音（받침）" },
      es: { title: "La consonante final: 받침" },
      fr: { title: "La consonne finale : 받침" },
      de: { title: "Der Schlusskonsonant: 받침" },
      'pt-BR': { title: "A consoante final: 받침" },
      vi: { title: "Học phụ âm cuối (받침)" },
      th: { title: "เรียนตัวสะกด (받침)" },
      ar: { title: "الحرف الساكن الأخير: 받침" },
      bn: { title: "অন্ত্য ব্যঞ্জন: 받침" },
      cs: { title: "Koncová souhláska: 받침" },
      el: { title: "Το τελικό σύμφωνο: 받침" },
      fil: { title: "Ang pangwakas na katinig: 받침" },
      hi: { title: "अंत्य व्यंजन: 받침" },
      hu: { title: "A záró mássalhangzó: 받침" },
      id: { title: "Konsonan akhir: 받침" },
      it: { title: "La consonante finale: 받침" },
      kk: { title: "Соңғы дауыссыз: 받침" },
      ky: { title: "Акыркы үнсүз: 받침" },
      mn: { title: "Эцсийн гийгүүлэгч: 받침" },
      nl: { title: "De slotmedeklinker: 받침" },
      pl: { title: "Spółgłoska końcowa: 받침" },
      ro: { title: "Consoana finală: 받침" },
      ru: { title: "Конечная согласная: 받침" },
      sv: { title: "Slutkonsonanten: 받침" },
      ta: { title: "இறுதி மெய்: 받침" },
      te: { title: "అంత్య హల్లు: 받침" },
      tr: { title: "Son ünsüz: 받침" },
      uk: { title: "Кінцева приголосна: 받침" },
      uz: { title: "Oxirgi undosh: 받침" },
    },
  },
  {
    id: 'lesson-final-sounds', unit: 11, group: 'final_consonant', items: SYLLABLES_FINAL_SOUNDS,
    prerequisites: ['ㅂ', 'ㅅ', 'ㄱ', 'ㅊ', 'ㅎ', 'ㄲ'],
    titles: {
      en: { title: "Only seven final sounds" },
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
      en: { title: "Reading Korean words" },
      ko: { title: "한글 단어 읽기" },
      ja: { title: "ハングルの単語を読む" },
      'zh-CN': { title: "读韩语单词" },
      es: { title: "Leer palabras coreanas" },
      fr: { title: "Lire des mots coréens" },
      de: { title: "Koreanische Wörter lesen" },
      'pt-BR': { title: "Ler palavras coreanas" },
      vi: { title: "Đọc từ tiếng Hàn" },
      th: { title: "อ่านคำภาษาเกาหลี" },
      ar: { title: "قراءة كلمات كورية" },
      bn: { title: "কোরীয় শব্দ পড়া" },
      cs: { title: "Čtení korejských slov" },
      el: { title: "Διαβάζοντας κορεατικές λέξεις" },
      fil: { title: "Pagbasa ng salitang Koreano" },
      hi: { title: "कोरियाई शब्द पढ़ना" },
      hu: { title: "Koreai szavak olvasása" },
      id: { title: "Membaca kata Korea" },
      it: { title: "Leggere parole coreane" },
      kk: { title: "Корей сөздерін оқу" },
      ky: { title: "Корей сөздөрүн окуу" },
      mn: { title: "Солонгос үг унших" },
      nl: { title: "Koreaanse woorden lezen" },
      pl: { title: "Czytanie koreańskich słów" },
      ro: { title: "Citirea cuvintelor coreene" },
      ru: { title: "Читаем корейские слова" },
      sv: { title: "Läsa koreanska ord" },
      ta: { title: "கொரிய சொற்களைப் படித்தல்" },
      te: { title: "కొరియన్ పదాలు చదవడం" },
      tr: { title: "Korece kelimeler okumak" },
      uk: { title: "Читаємо корейські слова" },
      uz: { title: "Koreys so'zlarini o'qish" },
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
