/**
 * The pronunciation notation, against words whose pronunciation is not in doubt.
 *
 * §5 asks for notation that shows what is *said*, not a symbol-for-letter
 * rewrite of what is written — so every case here is one where the two differ.
 * A transcription that agreed with the spelling everywhere would pass a test
 * suite full of 사람 and teach nothing.
 */
import { describe, expect, it } from 'vitest';

import { VOCABULARY } from '../../apps/web/src/data/vocabulary';
import { pronunciationOf, toIpa } from './ipa';

describe('what the letters say on their own', () => {
  it('transcribes a plain word', () => {
    expect(toIpa('사람')).toBe('sa.ɾam');
    expect(toIpa('서울')).toBe('sʌ.ul');
  });

  it('marks a final stop as unreleased', () => {
    // The single most audible thing about a Korean final consonant, and the
    // thing an English speaker most reliably gets wrong.
    expect(toIpa('밥')).toBe('pap̚');
    expect(toIpa('옷')).toBe('ot̚');
    expect(toIpa('꽃')).toBe('k͈ot̚');
  });

  it('neutralises every letter that can end a syllable onto seven sounds', () => {
    // ㅅ ㅆ ㅈ ㅊ ㅌ ㅎ all end as [t̚]; ㅋ ㄲ as [k̚]; ㅍ as [p̚].
    expect(toIpa('옷')).toBe(toIpa('옫'));
    expect(toIpa('낯')).toBe(toIpa('낟'));
  });
});

describe('the same letter, different sounds', () => {
  it('voices a lenis stop between voiced sounds', () => {
    // 부부 is the case worth putting in a dictionary: one letter, twice, said
    // two ways.
    expect(toIpa('부부')).toBe('pu.bu');
    expect(toIpa('한국')).toBe('han.ɡuk̚');
  });

  it('does not voice one at the start of a word', () => {
    expect(toIpa('바다').startsWith('p')).toBe(true);
    expect(toIpa('고기').startsWith('k')).toBe(true);
  });

  it('palatalises ㅅ before /i/ and a glide', () => {
    expect(toIpa('시간').startsWith('ɕ')).toBe(true);
    expect(toIpa('사람').startsWith('s')).toBe(true);
  });

  it('flaps ㄹ between vowels and laterals it at the end', () => {
    expect(toIpa('사람')).toContain('ɾ');
    expect(toIpa('물')).toBe('mul');
  });
});

describe('the sound changes between syllables', () => {
  it('moves a final consonant into a following empty onset', () => {
    // 음악 is two blocks and three sounds in the middle: the ㅁ is genuinely
    // said at the start of the second syllable.
    expect(toIpa('음악')).toBe('ɯ.mak̚');
  });

  it('keeps a moved consonant un-neutralised', () => {
    // 옷 alone ends [t̚]; the same ㅅ before a vowel is a full [s] again.
    expect(toIpa('옷')).toBe('ot̚');
    expect(toIpa('오시')).toContain('ɕ');
  });

  it('nasalises a stop before a nasal', () => {
    expect(toIpa('학년')).toBe('haŋ.njʌn');
    expect(toIpa('국물')).toBe('kuŋ.mul');
    expect(toIpa('앞머리')).toBe('am.mʌ.ɾi');
  });

  it('lateralises ㄴ against ㄹ, in both orders', () => {
    expect(toIpa('신라')).toBe('ɕil.la');
    expect(toIpa('설날')).toBe('sʌl.lal');
  });

  it('turns ㄹ into ㄴ after ㅇ or ㅁ', () => {
    expect(toIpa('종로')).toBe('tɕoŋ.no');
  });
});

describe('the reviewed spoken form wins', () => {
  it('transcribes tensing and aspiration from the content pipeline', () => {
    /*
     * The pipeline computes and reviews a spoken form for the words where the
     * two diverge, and records which rule applied. Those are used rather than
     * re-derived: tensing depends on morphology this module has no access to,
     * and guessing at it would be inventing a pronunciation.
     */
    const tensed = VOCABULARY.find((word) => word.word === '학교');
    expect(tensed?.spoken).toBe('학꾜');
    expect(pronunciationOf(tensed!)).toBe('[hak̚.k͈jo]');

    const aspirated = VOCABULARY.find((word) => word.word === '좋다');
    expect(aspirated?.spoken).toBe('조타');
    expect(pronunciationOf(aspirated!)).toBe('[tɕo.tʰa]');
  });

  it('falls back to the spelling when there is no separate spoken form', () => {
    const plain = VOCABULARY.find((word) => word.word === '사람');
    expect(plain?.spoken).toBeFalsy();
    expect(pronunciationOf(plain!)).toBe('[sa.ɾam]');
  });
});

describe('every shipping word gets a transcription', () => {
  it('produces one for the whole corpus, with no empty or broken output', () => {
    // A notation that silently produces nothing for some words is worse than no
    // notation: the entry looks broken and there is no way to tell which words
    // it happened to.
    const bad = VOCABULARY.filter((word) => {
      const ipa = pronunciationOf(word);
      return !ipa.startsWith('[') || !ipa.endsWith(']') || ipa.length < 3 || ipa.includes('undefined');
    });
    expect(bad.map((word) => word.word)).toEqual([]);
  });

  it('never emits a Hangul character', () => {
    // The failure mode of a partial mapping: an unmapped letter passed through
    // and rendered as itself, which reads as a rendering bug.
    for (const word of VOCABULARY) {
      expect(pronunciationOf(word), word.word).not.toMatch(/[가-힣ㄱ-ㅎㅏ-ㅣ]/);
    }
  });
});
