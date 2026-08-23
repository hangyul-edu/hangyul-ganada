/**
 * One dictionary form in, one correct surface form out.
 *
 * ## Why this is a generator and not the recogniser the content pipeline has
 *
 * `scripts/content/conjugate.py` answers "could this sentence contain this
 * word", and for that it is right to be generous: 걷다 is two verbs with
 * different classes, so the recogniser offers 걸어 *and* 걷어 and accepts
 * either. A generator cannot do that. Showing a learner both spellings of the
 * past tense is worse than showing neither, and putting two plausible answers
 * into a placement test makes the test wrong.
 *
 * So this one commits. `classes.ts` decides the class from a curated list, and
 * every function here returns exactly one string.
 *
 * ## The forms, and why these
 *
 * These are what a learner meets in the first year and what the product itself
 * needs: the 활용 panel on a word card, the surface form a context question
 * puts in its blank, and the endings the example sentences are written in.
 * Nothing here is a complete paradigm — Korean has hundreds of endings and a
 * word card that listed them would be a grammar reference, which this is not.
 */

import {
  compose,
  decompose,
  FINALS,
  hasFinal,
  INITIALS,
  isBright,
  VOWELS,
  vowelOf,
} from './hangul';
import {
  classify,
  HONORIFIC_SUFFIXED,
  stemOf,
  type ClassifyOptions,
  type ConjugationClass,
} from './classes';

export type Form =
  /** 먹다 */
  | 'dictionary'
  /** 먹어 — the 아/어 stem, which is what 주세요 and 서 attach to. */
  | 'infinitive'
  /** 먹어요 */
  | 'presentPolite'
  /** 먹었어요 */
  | 'pastPolite'
  /** 먹을 거예요 */
  | 'futurePolite'
  /** 먹습니다 */
  | 'formalPolite'
  /** 먹고 */
  | 'connective'
  /** 먹으세요 */
  | 'honorific'
  /** 먹어 주세요 */
  | 'request'
  /** 먹는 / 좋은 — how it appears in front of a noun. */
  | 'adnominal';

export const FORMS: readonly Form[] = [
  'dictionary',
  'presentPolite',
  'pastPolite',
  'futurePolite',
  'formalPolite',
  'connective',
  'honorific',
  'request',
  'infinitive',
  'adnominal',
];

/** Everything the caller may know about a word, and nothing it may not. */
export interface WordShape extends ClassifyOptions {
  partOfSpeech?: 'verb' | 'adjective' | string;
}

/** Whether an ending that asks someone to do something makes sense at all. */
export function takesImperative(shape: WordShape): boolean {
  // §28: no imperatives for adjectives or stative predicates. "Please be tall"
  // is not a sentence, and a word card that prints one is teaching a mistake.
  return shape.partOfSpeech === 'verb';
}

/**
 * The 아/어 stem — the single hardest piece, and everything else is built on it.
 *
 * Every class differs here and nowhere else: once 먹 has become 먹어 and 듣 has
 * become 들어, the past tense is the same operation on both.
 */
function infinitiveStem(stem: string, cls: ConjugationClass): string {
  const head = stem.slice(0, -1);
  const last = stem[stem.length - 1]!;
  const parts = decompose(last);
  if (!parts) return stem;
  const { initial, medial, final } = parts;
  const vowel = VOWELS[medial]!;

  switch (cls) {
    case 'hada':
      // 하 + 아 → 해. Irregular, and it applies to every X하다 compound, which
      // is several hundred words — most of the verbs in the language.
      return `${head}해`;

    case 'eu': {
      // ㅡ drops, and the vowel that replaces it harmonises with the syllable
      // *before* it: 바쁘 → 바빠 (ㅏ before), 예쁘 → 예뻐 (ㅖ before), 쓰 → 써
      // (nothing before, so 어).
      const previous = head ? decompose(head[head.length - 1]!) : null;
      const bright = previous ? isBright(VOWELS[previous.medial]!) : false;
      return head + compose(initial, VOWELS.indexOf(bright ? 'ㅏ' : 'ㅓ'), 0);
    }

    case 'reu': {
      // 모르 + 아 → 몰라. The ㄹ doubles: one onto the previous syllable as a
      // final, one as the initial of the new one.
      const before = head[head.length - 1]!;
      const beforeParts = decompose(before)!;
      const doubled = compose(beforeParts.initial, beforeParts.medial, FINALS.indexOf('ㄹ'));
      const bright = isBright(VOWELS[beforeParts.medial]!);
      return (
        head.slice(0, -1) +
        doubled +
        compose(INITIALS.indexOf('ㄹ'), VOWELS.indexOf(bright ? 'ㅏ' : 'ㅓ'), 0)
      );
    }

    case 'reo':
      // 푸르 + 어 → 푸르러. The stem is unchanged and the ending gains a ㄹ.
      return `${stem}러`;

    case 'd':
      // ㄷ → ㄹ, then the regular vowel ending: 듣 → 들 → 들어.
      return (
        head +
        compose(initial, medial, FINALS.indexOf('ㄹ')) +
        (isBright(vowel) ? '아' : '어')
      );

    case 'b': {
      // ㅂ drops and becomes 우, which then contracts with 어 into 워: 춥 → 추워.
      // 돕 and 곱 are the two stems that take 오 instead, giving 와.
      const dropped = compose(initial, medial, 0);
      const wa = stem === '돕' || stem === '곱';
      return head + dropped + compose(INITIALS.indexOf('ㅇ'), VOWELS.indexOf(wa ? 'ㅘ' : 'ㅝ'), 0);
    }

    case 's':
      // ㅅ drops and nothing contracts, which is the whole of the class:
      // 낫 + 아 → 나아, not 나. 짓 + 어 → 지어, not 져.
      return head + compose(initial, medial, 0) + (isBright(vowel) ? '아' : '어');

    case 'h': {
      /*
       * ㅎ drops and the vowel fronts, following vowel harmony: 까맣 → 까매,
       * 꺼멓 → 꺼메, 파랗 → 파래, 퍼렇 → 퍼레, 하얗 → 하얘, 허옇 → 허예.
       *
       * The five demonstratives are the exception and they all front to ㅐ
       * whatever their own vowel: 그렇 → 그래, not 그레. They come from 그러하다
       * rather than from a colour, which is why they do not harmonise, and
       * they are the ㅎ-irregular stems a learner actually meets — so getting
       * them from a rule that produces 그레요 would be worse than having no
       * rule at all.
       */
      const DEMONSTRATIVE: Record<string, string> = {
        그렇: '그래',
        이렇: '이래',
        저렇: '저래',
        어떻: '어때',
        아무렇: '아무래',
      };
      const irregular = DEMONSTRATIVE[stem];
      if (irregular) return irregular;
      const fronted: Record<string, string> = { ㅏ: 'ㅐ', ㅓ: 'ㅔ', ㅑ: 'ㅒ', ㅕ: 'ㅖ', ㅗ: 'ㅐ' };
      const next = fronted[vowel];
      return head + compose(initial, VOWELS.indexOf(next ?? vowel), 0);
    }

    case 'irregularStem': {
      const table: Record<string, string> = {
        있: '있어',
        없: '없어',
        이: '이어',
        아니: '아니야',
        드리: '드려',
        // The only ㅜ-irregular verb in the language: 푸 + 어 → 퍼, not 풔.
        푸: '퍼',
      };
      return table[stem] ?? stem;
    }

    case 'l':
    case 'regular':
    default:
      break;
  }

  if (final !== 0) {
    // A stem that ends in a consonant simply takes 아 or 어 as a new syllable.
    // ㄹ-stems are here too: ㄹ only drops before ㄴ/ㅂ/ㅅ, never before a vowel,
    // so 살 + 아 → 살아 and not 사아.
    return stem + (isBright(vowel) ? '아' : '어');
  }

  // A stem that ends in a vowel merges with it, where the two can merge.
  const CONTRACTIONS: Record<string, string> = {
    'ㅏ+ㅏ': 'ㅏ', // 가 + 아 → 가
    'ㅓ+ㅓ': 'ㅓ', // 서 + 어 → 서
    'ㅕ+ㅓ': 'ㅕ', // 켜 + 어 → 켜
    'ㅐ+ㅓ': 'ㅐ', // 보내 + 어 → 보내
    'ㅔ+ㅓ': 'ㅔ', // 세 + 어 → 세
    'ㅗ+ㅏ': 'ㅘ', // 보 + 아 → 봐
    'ㅜ+ㅓ': 'ㅝ', // 주 + 어 → 줘
    'ㅣ+ㅓ': 'ㅕ', // 마시 + 어 → 마셔
    'ㅚ+ㅓ': 'ㅙ', // 되 + 어 → 돼
    'ㅟ+ㅓ': 'ㅟ', // 쉬 + 어 → 쉬어, written uncontracted; see below
  };
  const ending = isBright(vowel) ? 'ㅏ' : 'ㅓ';
  const merged = CONTRACTIONS[`${vowel}+${ending}`];
  // ㅟ is in the table so the rule is visible, but Korean does not write the
  // contraction: 쉬어요, not 쉐요. Falling through gives the right answer.
  if (merged && vowel !== 'ㅟ') return head + compose(initial, VOWELS.indexOf(merged), 0);
  return stem + (ending === 'ㅏ' ? '아' : '어');
}

/** The stem an ending beginning with a consonant attaches to. */
function consonantStem(stem: string, cls: ConjugationClass, dropsL: boolean): string {
  if (cls === 'l' && dropsL) {
    // ㄹ drops before ㄴ, ㅂ and ㅅ: 살 + ㅂ니다 → 삽니다, 살 + 세요 → 사세요.
    const last = stem[stem.length - 1]!;
    const parts = decompose(last)!;
    return stem.slice(0, -1) + compose(parts.initial, parts.medial, 0);
  }
  return stem;
}

/** Whether an ending that starts with 으 needs its 으. */
function needsEu(stem: string, cls: ConjugationClass): boolean {
  const last = stem[stem.length - 1]!;
  if (!hasFinal(last)) return false;
  // ㄹ-stems drop the ㄹ instead of inserting 으: 살 + (으)세요 → 사세요.
  if (cls === 'l') return false;
  // The irregular classes lose their final before a vowel, and 으 is a vowel:
  // 듣 + (으)면 → 들으면, 낫 + (으)면 → 나으면, 춥 + (으)면 → 추우면.
  return true;
}

/**
 * The stem that an 으-initial ending attaches to, with the ending's 으 folded
 * in — because for three classes the consonant that 으 follows disappears.
 */
function euStem(stem: string, cls: ConjugationClass): string {
  const head = stem.slice(0, -1);
  const last = stem[stem.length - 1]!;
  const parts = decompose(last);
  if (!parts) return stem;
  switch (cls) {
    case 'd':
      return head + compose(parts.initial, parts.medial, FINALS.indexOf('ㄹ')) + '으';
    case 's':
      return head + compose(parts.initial, parts.medial, 0) + '으';
    case 'b':
      // ㅂ + 으 → 우: 춥 + (으)면 → 추우면, 돕 + (으)면 → 도우면.
      return head + compose(parts.initial, parts.medial, 0) + '우';
    case 'h':
      // The ㅎ drops and the 으 goes with it: 그렇 + (으)면 → 그러면.
      return head + compose(parts.initial, parts.medial, 0);
    default:
      return needsEu(stem, cls) ? `${stem}으` : consonantStem(stem, cls, true);
  }
}

/** The (으)ㄹ that the future and the prospective adnominal are built on. */
function prospective(stem: string, cls: ConjugationClass): string {
  const withEu = euStem(stem, cls);
  if (withEu.endsWith('으') || withEu.endsWith('우')) {
    const last = withEu[withEu.length - 1]!;
    const parts = decompose(last)!;
    return withEu.slice(0, -1) + compose(parts.initial, parts.medial, FINALS.indexOf('ㄹ'));
  }
  const last = withEu[withEu.length - 1]!;
  if (hasFinal(last)) {
    // A ㄹ-stem already has its ㄹ: 살 → 살 거예요, not 살을 거예요.
    return withEu;
  }
  const parts = decompose(last)!;
  return withEu.slice(0, -1) + compose(parts.initial, parts.medial, FINALS.indexOf('ㄹ'));
}

/** 계시 → 계세요. The honorific suffix drops its 시 before the fused 세요. */
function honorificPolite(stem: string): string {
  return `${stem.slice(0, -1)}세요`;
}

/** 먹었 / 했 / 갔 — the past stem, one operation on the 아/어 form. */
function pastStem(infinitive: string): string {
  const last = infinitive[infinitive.length - 1]!;
  const parts = decompose(last);
  if (!parts) return infinitive;
  return infinitive.slice(0, -1) + compose(parts.initial, parts.medial, FINALS.indexOf('ㅆ'));
}

/**
 * One form of one word.
 *
 * Returns null where the form does not apply — an imperative of an adjective,
 * or a form of something that is not a `-다` word at all — rather than a wrong
 * string. A caller that renders null renders nothing, which is correct.
 */
export function conjugate(lemma: string, form: Form, shape: WordShape = {}): string | null {
  const stem = stemOf(lemma);
  if (!stem) return null;
  const cls = classify(lemma, shape);
  const infinitive = infinitiveStem(stem, cls);

  switch (form) {
    case 'dictionary':
      return lemma;
    case 'infinitive':
      return infinitive;
    case 'presentPolite':
      // 계세요, 드세요, 주무세요 — the fused form, not the 계셔요 the vowel
      // rule gives. Only this form and `honorific` are irregular; the past and
      // the 아/어 connective are built on the regular 계셔 like any ㅣ-stem.
      return HONORIFIC_SUFFIXED.has(stem) ? `${honorificPolite(stem)}` : `${infinitive}요`;
    case 'pastPolite':
      return `${pastStem(infinitive)}어요`;
    case 'futurePolite':
      return `${prospective(stem, cls)} 거예요`;
    case 'formalPolite': {
      // ㅂ니다 after a vowel, 습니다 after a consonant — and after a vowel the
      // ㅂ is not a syllable of its own, it becomes the final of the one before
      // it: 가 + ㅂ니다 → 갑니다, not 가ㅂ니다. A ㄹ-stem drops its ㄹ first and
      // then counts as vowel-final: 살 → 사 → 삽니다.
      const base = consonantStem(stem, cls, true);
      const last = base[base.length - 1]!;
      if (hasFinal(last)) return `${base}습니다`;
      const parts = decompose(last)!;
      return base.slice(0, -1) + compose(parts.initial, parts.medial, FINALS.indexOf('ㅂ')) + '니다';
    }
    case 'connective':
      return `${stem}고`;
    case 'honorific':
      // -(으)세요. `euStem` has already turned 듣 into 들으 and 살 into 사, so
      // the ending is the same three characters in every class. A stem that
      // already carries -시- does not take a second one: 계세요, not 계시세요.
      if (!takesImperative(shape)) return null;
      return HONORIFIC_SUFFIXED.has(stem) ? honorificPolite(stem) : `${euStem(stem, cls)}세요`;
    case 'request':
      return takesImperative(shape) ? `${infinitive} 주세요` : null;
    case 'adnominal': {
      /*
       * 있다 and 없다 are adjectives that take the *verb* adnominal: 있는 사람,
       * 없는 사람 — never 있은 or 없은. They are the two words in the language
       * where the part of speech gives the wrong answer, and every compound of
       * them (재미있다, 맛없다) inherits it.
       */
      if (cls === 'irregularStem' && (stem.endsWith('있') || stem.endsWith('없'))) {
        return `${stem}는`;
      }
      if (shape.partOfSpeech === 'adjective') {
        const base = euStem(stem, cls);
        if (base.endsWith('으') || base.endsWith('우')) {
          const last = base[base.length - 1]!;
          const parts = decompose(last)!;
          return base.slice(0, -1) + compose(parts.initial, parts.medial, FINALS.indexOf('ㄴ'));
        }
        const last = base[base.length - 1]!;
        if (hasFinal(last)) return base;
        const parts = decompose(last)!;
        return base.slice(0, -1) + compose(parts.initial, parts.medial, FINALS.indexOf('ㄴ'));
      }
      // A verb's present adnominal is always 는, whatever the stem ends in —
      // except that a ㄹ-stem drops its ㄹ first: 살 + 는 → 사는.
      return `${consonantStem(stem, cls, true)}는`;
    }
    default:
      return null;
  }
}

/** Every form of a word, for the 활용 panel. Missing forms are omitted. */
export function conjugationTable(
  lemma: string,
  shape: WordShape = {},
): Array<{ form: Form; value: string }> {
  const out: Array<{ form: Form; value: string }> = [];
  for (const form of FORMS) {
    const value = conjugate(lemma, form, shape);
    if (value) out.push({ form, value });
  }
  return out;
}

export { vowelOf };
