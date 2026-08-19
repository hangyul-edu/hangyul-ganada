import { ALL_CHARACTERS } from '../../data/characters';

/**
 * Which characters are worth confusing a learner with.
 *
 * The recognition step is only a test if the wrong answers are plausible.
 * Offering ㅏ against ㅁ, ㅋ and 각 proves nothing — the shapes share nothing,
 * and a learner picks the right one without having learned anything. Offering
 * ㅏ against ㅑ, ㅓ and ㅕ tests the exact distinction that beginners actually
 * get wrong, which is the number and direction of the short strokes.
 *
 * The groups below are the real confusion sets in Hangul: mirror pairs, letters
 * that differ by one stroke, and letters that differ only by being doubled.
 */
const CONFUSION_GROUPS: string[][] = [
  // Direction of the branch, and how many of them.
  ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ'],
  ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ'],
  ['ㅡ', 'ㅣ', 'ㅢ'],
  ['ㅐ', 'ㅔ', 'ㅒ', 'ㅖ'],
  ['ㅘ', 'ㅝ', 'ㅙ', 'ㅞ'],
  ['ㅚ', 'ㅟ', 'ㅢ'],
  // One stroke apart.
  ['ㄱ', 'ㅋ', 'ㄲ'],
  ['ㄴ', 'ㄷ', 'ㅌ', 'ㄸ'],
  ['ㅁ', 'ㅂ', 'ㅍ', 'ㅃ'],
  ['ㅅ', 'ㅈ', 'ㅊ', 'ㅆ', 'ㅉ'],
  ['ㅇ', 'ㅎ'],
  ['ㄹ', 'ㄷ', 'ㅌ'],
];

/**
 * Letters that sound the same, and therefore cannot be told apart by ear.
 *
 * Standard Korean merged these vowels a generation ago. 애 and 에 are one sound
 * for practically every speaker under sixty; 얘 and 예 are another; 외, 왜 and
 * 웨 are a third. They are still three different *letters*, spelled
 * differently, and telling them apart on the page is a real skill the app
 * teaches.
 *
 * What it must not do is play one of them and ask which it was. That question
 * has no answer — the learner is being asked to hear a distinction that does
 * not exist in the language, and the honest outcome is a coin toss recorded as
 * a listening failure. Measuring the shipped clips agrees with the phonology:
 * 애/에 and 외/왜/웨 come out closer to each other than two renderings of the
 * *same* word by the same voice.
 *
 * So these are excluded as wrong answers whenever the prompt is a sound, and
 * kept whenever the prompt is a shape. See `recognitionOptions`.
 */
const HOMOPHONES: string[][] = [
  ['ㅐ', 'ㅔ'],
  ['ㅒ', 'ㅖ'],
  ['ㅚ', 'ㅙ', 'ㅞ'],
];

const SOUNDALIKES_BY_CHARACTER = new Map<string, Set<string>>();
for (const group of HOMOPHONES) {
  for (const character of group) {
    SOUNDALIKES_BY_CHARACTER.set(
      character,
      new Set(group.filter((other) => other !== character)),
    );
  }
}

/** Whether these two letters are the same sound with different spellings. */
export function soundsTheSame(a: string, b: string): boolean {
  return SOUNDALIKES_BY_CHARACTER.get(a)?.has(b) ?? false;
}

const GROUPS_BY_CHARACTER = new Map<string, Set<string>>();
for (const group of CONFUSION_GROUPS) {
  for (const character of group) {
    const set = GROUPS_BY_CHARACTER.get(character) ?? new Set<string>();
    for (const other of group) if (other !== character) set.add(other);
    GROUPS_BY_CHARACTER.set(character, set);
  }
}

const SYLLABLES = ALL_CHARACTERS.filter((c) => [...c.character].length === 1 && c.components.length > 0);

/**
 * Distractors for a syllable block.
 *
 * A block is confused with blocks built from *its own parts* — 가 against 거,
 * 고 and 나 — because that is the mistake: reading the right consonant with the
 * wrong vowel, or the reverse. Blocks that share nothing are not distractors,
 * they are filler.
 */
function syllableDistractors(character: string, components: string[]): string[] {
  return SYLLABLES.filter((candidate) => {
    if (candidate.character === character) return false;
    const shared = candidate.components.filter((part) => components.includes(part)).length;
    return shared >= 1 && candidate.components.length === components.length;
  }).map((candidate) => candidate.character);
}

/**
 * Builds the answer set for a recognition question.
 *
 * Deterministic given `seed`, so a learner who fails and retries sees the same
 * question rather than a new one — retrying is meant to be a second attempt at
 * the same distinction, not a reroll until the dice are kind.
 */
export function recognitionOptions(
  character: string,
  seed: number,
  count = 4,
  /**
   * True when the learner is being asked from a *sound* rather than a shape.
   *
   * Drops the wrong answers that sound like the right one — see `HOMOPHONES`.
   * Only against the answer: two distractors that rhyme with each other are
   * both still wrong, and the question still has exactly one right answer.
   */
  askedBySound = false,
): string[] {
  const meta = ALL_CHARACTERS.find((c) => c.character === character);
  const pool = [
    ...(GROUPS_BY_CHARACTER.get(character) ?? []),
    ...(meta && meta.components.length > 0
      ? syllableDistractors(character, meta.components)
      : []),
  ];

  const unique = [...new Set(pool)].filter(
    (c) => c !== character && !(askedBySound && soundsTheSame(character, c)),
  );
  // A stable shuffle: no clock, no Math.random, so the same question renders
  // the same way on a re-render and in a test.
  const shuffled = unique
    .map((value, index) => ({ value, key: hash(`${value}:${seed}:${index}`) }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.value);

  const distractors = shuffled.slice(0, Math.max(0, count - 1));
  const options = [character, ...distractors];
  return options
    .map((value, index) => ({ value, key: hash(`${value}:${seed}:pos:${index}`) }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.value);
}

/** True when there are enough plausible wrong answers to ask the question. */
export function canRecognise(character: string, askedBySound = false): boolean {
  return recognitionOptions(character, 0, 4, askedBySound).length >= 3;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
