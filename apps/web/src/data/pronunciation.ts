import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { FINAL_JAMO, INITIAL_JAMO, MEDIAL_JAMO, isSyllable } from './jamo';

/**
 * How a Korean word is actually said, in IPA.
 *
 * ## Why not just transliterate the spelling
 *
 * Because the spelling is not what anybody says. 학교 is written with a plain
 * ㄱ and pronounced with a tense one; 좋다 is written with ㅎ+ㄷ and pronounced
 * 조타; 음악 is written as two blocks and pronounced as [ɯ.mak] with the ㅁ
 * moved across. A learner who sounds out the letters gets it wrong, and a
 * notation that shows them the letters again has told them nothing they could
 * not already see.
 *
 * §5 asks for notation that reflects the real pronunciation including the
 * standard sound changes. That means three things happen before any symbol is
 * chosen:
 *
 * 1. **Tensing and aspiration** come from the content pipeline, which already
 *    computes a `spoken` form for the five hundred words where the two differ
 *    (학교 → 학꾜, 좋다 → 조타) and records *which* rule applied. That work is
 *    reviewed, so it is used rather than repeated here.
 * 2. **Resyllabification** is applied here: a final consonant before a syllable
 *    beginning ㅇ moves into that syllable's onset, because ㅇ is silent there
 *    and the consonant is genuinely said at the start of the next syllable.
 * 3. **Allophony** is applied here: the same letter is a different sound
 *    depending on where it sits, and this is where a mechanical mapping goes
 *    most obviously wrong. ㄱ is [k] at the start of a word and [ɡ] between
 *    vowels; ㄹ is a flap at the start of a syllable and a lateral at the end;
 *    ㅅ is [ɕ] before /i/ and [s] elsewhere; every stop in final position is
 *    unreleased. The assimilations between syllables — 학년 [haŋ.njʌn], 신라
 *    [ɕil.la], 종로 [tɕoŋ.no] — are applied here too; see `assimilate`.
 *
 * ## What is not claimed
 *
 * This is a *broad* transcription of the standard Seoul register, which is what
 * a beginner's dictionary entry should carry. It does not mark pitch, length,
 * or the finer allophones, and it does not attempt the irregular verbs whose
 * pronunciation depends on grammar rather than on spelling — the pipeline's
 * `spoken` field is where those are handled, one reviewed word at a time.
 */

// --- The sound inventory ------------------------------------------------------

/**
 * Onsets, in their word-initial form.
 *
 * The plain stops are voiceless here and voiced between voiced sounds; see
 * `VOICED`. ㅇ carries no sound at all in an onset — it is the letter Korean
 * uses to write a syllable that begins with its vowel.
 */
const ONSET: Record<string, string> = {
  ㄱ: 'k',
  ㄲ: 'k͈',
  ㄴ: 'n',
  ㄷ: 't',
  ㄸ: 't͈',
  ㄹ: 'ɾ',
  ㅁ: 'm',
  ㅂ: 'p',
  ㅃ: 'p͈',
  ㅅ: 's',
  ㅆ: 's͈',
  ㅇ: '',
  ㅈ: 'tɕ',
  ㅉ: 'tɕ͈',
  ㅊ: 'tɕʰ',
  ㅋ: 'kʰ',
  ㅌ: 'tʰ',
  ㅍ: 'pʰ',
  ㅎ: 'h',
};

/** The lenis stops, voiced when they sit between voiced sounds. */
const VOICED: Record<string, string> = { k: 'ɡ', t: 'd', p: 'b', tɕ: 'dʑ' };

const VOWEL: Record<string, string> = {
  ㅏ: 'a',
  ㅐ: 'ɛ',
  ㅑ: 'ja',
  ㅒ: 'jɛ',
  ㅓ: 'ʌ',
  ㅔ: 'e',
  ㅕ: 'jʌ',
  ㅖ: 'je',
  ㅗ: 'o',
  ㅘ: 'wa',
  ㅙ: 'wɛ',
  ㅚ: 'we',
  ㅛ: 'jo',
  ㅜ: 'u',
  ㅝ: 'wʌ',
  ㅞ: 'we',
  ㅟ: 'wi',
  ㅠ: 'ju',
  ㅡ: 'ɯ',
  ㅢ: 'ɰi',
  ㅣ: 'i',
};

/**
 * Codas, after neutralisation.
 *
 * Korean allows seven sounds at the end of a syllable, and every letter that
 * can be written there collapses onto one of them: ㅋ and ㄲ are both [k̚], ㅅ
 * ㅆ ㅈ ㅊ ㅌ ㅎ are all [t̚], ㅍ is [p̚]. The stops are unreleased, which is the
 * single most audible thing about a Korean final consonant and the thing an
 * English speaker most reliably gets wrong.
 */
const CODA: Record<string, string> = {
  '': '',
  ' ': '',
  ㄱ: 'k̚',
  ㄲ: 'k̚',
  ㄳ: 'k̚',
  ㄴ: 'n',
  ㄵ: 'n',
  ㄶ: 'n',
  ㄷ: 't̚',
  ㄹ: 'l',
  ㄺ: 'k̚',
  ㄻ: 'm',
  ㄼ: 'l',
  ㄽ: 'l',
  ㄾ: 'l',
  ㄿ: 'p̚',
  ㅀ: 'l',
  ㅁ: 'm',
  ㅂ: 'p̚',
  ㅄ: 'p̚',
  ㅅ: 't̚',
  ㅆ: 't̚',
  ㅇ: 'ŋ',
  ㅈ: 't̚',
  ㅊ: 't̚',
  ㅋ: 'k̚',
  ㅌ: 't̚',
  ㅍ: 'p̚',
  ㅎ: 't̚',
};

/**
 * The consonant a coda contributes when it moves into the next onset.
 *
 * Not the same table as `CODA`: neutralisation only happens to a consonant that
 * stays at the end of a syllable. 옷 alone ends [ot̚], but 옷을 is [o.sɯl] — the
 * ㅅ is a full [s] again once it has somewhere to go. A cluster splits, keeping
 * its first half behind: 읽어 is [il.ɡʌ].
 */
const MOVED: Record<string, [keeps: string, moves: string]> = {
  ㄱ: ['', 'ㄱ'],
  ㄲ: ['', 'ㄲ'],
  ㄳ: ['ㄱ', 'ㅅ'],
  ㄴ: ['', 'ㄴ'],
  ㄵ: ['ㄴ', 'ㅈ'],
  ㄶ: ['ㄴ', 'ㅎ'],
  ㄷ: ['', 'ㄷ'],
  ㄹ: ['', 'ㄹ'],
  ㄺ: ['ㄹ', 'ㄱ'],
  ㄻ: ['ㄹ', 'ㅁ'],
  ㄼ: ['ㄹ', 'ㅂ'],
  ㄽ: ['ㄹ', 'ㅅ'],
  ㄾ: ['ㄹ', 'ㅌ'],
  ㄿ: ['ㄹ', 'ㅍ'],
  ㅀ: ['ㄹ', 'ㅎ'],
  ㅁ: ['', 'ㅁ'],
  ㅂ: ['', 'ㅂ'],
  ㅄ: ['ㅂ', 'ㅅ'],
  ㅅ: ['', 'ㅅ'],
  ㅆ: ['', 'ㅆ'],
  ㅈ: ['', 'ㅈ'],
  ㅊ: ['', 'ㅊ'],
  ㅋ: ['', 'ㅋ'],
  ㅌ: ['', 'ㅌ'],
  ㅍ: ['', 'ㅍ'],
};

interface Block {
  onset: string;
  vowel: string;
  coda: string;
}

/**
 * What a coda becomes when the next syllable starts with a nasal.
 *
 * Every stop turns into the nasal made in the same place: 학년 is said
 * [haŋ.njʌn], not [hak̚.njʌn], and 십만 is [ɕim.man]. This is the assimilation a
 * learner meets first and the one that makes them think they misheard.
 */
const NASALISED: Record<string, string> = {
  ㄱ: 'ㅇ',
  ㄲ: 'ㅇ',
  ㅋ: 'ㅇ',
  ㄳ: 'ㅇ',
  ㄺ: 'ㅇ',
  ㄷ: 'ㄴ',
  ㅅ: 'ㄴ',
  ㅆ: 'ㄴ',
  ㅈ: 'ㄴ',
  ㅊ: 'ㄴ',
  ㅌ: 'ㄴ',
  ㅎ: 'ㄴ',
  ㅂ: 'ㅁ',
  ㅍ: 'ㅁ',
  ㄼ: 'ㅁ',
  ㄿ: 'ㅁ',
  ㅄ: 'ㅁ',
};

/**
 * The assimilations between one syllable and the next.
 *
 * Applied after resyllabification, because a consonant that has moved into the
 * next onset is no longer a coda and has nothing to assimilate with. Ordered:
 * lateralisation before nasalisation, because ㄴ+ㄹ is a lateral pair and would
 * otherwise be caught by the ㄹ→ㄴ rule and come out backwards.
 *
 * These are the standard prescriptive rules, and they are deterministic, which
 * is why they can live in code at all — everything that depends on grammar or
 * on the individual word is the content pipeline's `spoken` field instead.
 */
function assimilate(blocks: Block[]): void {
  for (let i = 0; i < blocks.length - 1; i += 1) {
    const here = blocks[i]!;
    const next = blocks[i + 1]!;
    if (!here.coda) continue;

    // ㄴ + ㄹ and ㄹ + ㄴ both become a long lateral: 신라 [ɕil.la].
    if (here.coda === 'ㄴ' && next.onset === 'ㄹ') {
      here.coda = 'ㄹ';
      continue;
    }
    if (here.coda === 'ㄹ' && next.onset === 'ㄴ') {
      next.onset = 'ㄹ';
      continue;
    }

    // ㅁ or ㅇ before ㄹ turns the ㄹ into ㄴ: 종로 [tɕoŋ.no].
    if ((here.coda === 'ㅁ' || here.coda === 'ㅇ') && next.onset === 'ㄹ') {
      next.onset = 'ㄴ';
      continue;
    }

    // A stop before a nasal becomes the nasal of its own place: 학년 [haŋ.njʌn].
    if (next.onset === 'ㄴ' || next.onset === 'ㅁ') {
      const nasal = NASALISED[here.coda];
      if (nasal) here.coda = nasal;
    }
  }
}

/** Splits a syllable into its three letters. Non-syllables return null. */
function decompose(syllable: string): Block | null {
  if (!isSyllable(syllable)) return null;
  const code = syllable.codePointAt(0)! - 0xac00;
  return {
    onset: INITIAL_JAMO[Math.floor(code / 588)]!,
    vowel: MEDIAL_JAMO[Math.floor((code % 588) / 28)]!,
    coda: FINAL_JAMO[code % 28]!.trim(),
  };
}

/**
 * The IPA for a Korean string.
 *
 * Syllable boundaries are marked with `.`, which is what a dictionary does and
 * what makes the resyllabification legible: seeing 음악 as [ɯ.mak] rather than
 * [ɯmak] is most of the lesson.
 *
 * In order, because the order matters: resyllabify, assimilate, then choose
 * symbols. A consonant that has moved into the next onset is not a coda and
 * must not assimilate as one, and voicing depends on what the coda *ended up*
 * being rather than on what was written.
 */
export function toIpa(korean: string): string {
  const blocks: Block[] = [];
  for (const character of korean) {
    const block = decompose(character);
    // Anything that is not a Hangul syllable — a space, a full stop — ends the
    // word as far as the transcription is concerned rather than being guessed at.
    if (block) blocks.push(block);
  }
  if (blocks.length === 0) return '';

  // Resyllabification, before anything is turned into a symbol: a coda before a
  // silent ㅇ belongs to the next syllable's onset.
  for (let i = 0; i < blocks.length - 1; i += 1) {
    const here = blocks[i]!;
    const next = blocks[i + 1]!;
    if (!here.coda || next.onset !== 'ㅇ') continue;
    const split = MOVED[here.coda];
    if (!split) continue;
    const [keeps, moves] = split;
    here.coda = keeps;
    next.onset = moves;
  }

  assimilate(blocks);

  const out: string[] = [];
  blocks.forEach((block, index) => {
    let onset = ONSET[block.onset] ?? '';

    /*
     * A lenis stop between two voiced sounds is voiced.
     *
     * "Between voiced sounds" means: not at the start of the word, and the
     * syllable before it ended in a vowel or in one of the sonorant codas. It
     * is why 부부 is [pu.bu] rather than [pu.pu] — the same letter, twice,
     * pronounced two ways, which is the single most useful thing this notation
     * can show a beginner.
     */
    if (index > 0 && VOICED[onset]) {
      const previous = blocks[index - 1]!;
      const voicedBefore = previous.coda === '' || 'nmŋl'.includes(CODA[previous.coda] ?? '');
      if (voicedBefore) onset = VOICED[onset]!;
    }

    /*
     * A doubled ㄹ is a long lateral, not a flap.
     *
     * ㄹ is a flap between vowels — 사람 [sa.ɾam] — and a lateral when it lands
     * against another one, which is what lateralisation has just produced.
     * Without this, 신라 comes out [ɕil.ɾa]: the assimilation has happened and
     * the symbol has not followed it, which reads as a typo to anyone who can
     * read IPA and teaches the wrong sound to anyone who cannot.
     */
    if (onset === 'ɾ' && index > 0 && CODA[blocks[index - 1]!.coda] === 'l') onset = 'l';

    // ㅅ and ㅆ are palatal before /i/ and before a glide.
    const vowel = VOWEL[block.vowel] ?? '';
    if ((onset === 's' || onset === 's͈') && (vowel.startsWith('i') || vowel.startsWith('j'))) {
      onset = onset === 's' ? 'ɕ' : 'ɕ͈';
    }

    out.push(`${onset}${vowel}${CODA[block.coda] ?? ''}`);
  });

  return out.join('.');
}

/**
 * The pronunciation to show for a word.
 *
 * Transcribed from the **spoken** form where the content pipeline recorded one,
 * because that is the form with the reviewed sound changes already in it. 학교
 * is stored with a spoken form of 학꾜 and therefore transcribes as [hak̚.k͈jo],
 * which is what a Korean speaker says; transcribing the spelling would give
 * [hak̚.kjo], which is what a learner says before they know better.
 */
export function pronunciationOf(word: Pick<VocabularyWord, 'word' | 'spoken'>): string {
  return `[${toIpa(word.spoken ?? word.word)}]`;
}
