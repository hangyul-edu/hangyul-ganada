import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from '../../data/characters';
import { VOCABULARY } from '../../data/vocabulary';
import { AVAILABLE_LOCALES, RESOURCES } from '../../i18n/resources';
import type { ExerciseMode } from '../../domain/review';
import {
  GAP,
  characterHints,
  exampleWithGap,
  revealsAnswer,
  usableHints,
  wordHints,
  type HintStep,
} from './hints';

/**
 * The hint must not be the answer.
 *
 * ## Why this is a test and not a review note
 *
 * It was a review note. The rule "a hint helps you reason toward the answer"
 * was written down, agreed with, and then six questions shipped with
 * `hint: copy.value` — the meaning — on screens whose four options were
 * meanings. Nothing caught it, because nothing was looking: the field held a
 * string, the string rendered, every test passed.
 *
 * So the property is checked the only way it can be checked, which is by
 * rendering the hint the learner would actually read, in the language they
 * would actually read it in, and looking for the answer inside it.
 *
 * ## Ten languages, not one
 *
 * A hint that is safe in English can give the answer away in Korean. The
 * category label for a food word is "Food & Drink" in English and "음식" in
 * Korean, and a Korean learner being asked what 음식 means would be handed
 * their answer by a hint naming the category. That class of collision only
 * exists in some locales, so every locale is checked.
 */

/** The corpus is thousands of words; this is a spread across all of it. */
/*
 * Every seventh word, not every thirty-seventh.
 *
 * The looser sample let a real reveal sit unnoticed until the corpus was
 * re-ordered for an unrelated reason and 아예 happened to land on a sampled
 * index: the Korean template read 첫 글자는 ‘아’예요, and with punctuation
 * stripped that spells the answer. The template was the defect, but a sample
 * that only finds a template defect when a particular word falls into it is a
 * sample that reports luck. Every seventh word runs the whole file in about
 * four seconds, which is the budget this check is worth.
 */
const SAMPLE = VOCABULARY.filter((_, index) => index % 7 === 0);

const WORD_MODES: ExerciseMode[] = ['read', 'produce', 'listen', 'listenMeaning', 'context'];
const CHARACTER_MODES: ExerciseMode[] = ['read', 'listen', 'distinguish', 'write'];

type Bundle = Record<string, unknown>;

/**
 * The per-locale meaning packs, whole.
 *
 * `VocabularyWord.translations` is deliberately not shipped — eight languages
 * of glosses is most of a megabyte and a learner reads one — so the meanings
 * live in files aligned index-for-index with the corpus. The app loads one; the
 * test loads all of them, because "safe in English" is not the property being
 * checked.
 */
type CopyRow = [meaning: string, exampleTranslation: string | null, definition: string | null];

const packs = new Map<string, CopyRow[]>();
for (const [path, pack] of Object.entries(
  import.meta.glob<{ locale: string; words: CopyRow[] }>('../../data/generated/vocabulary.*.json', {
    eager: true,
    import: 'default',
  }),
)) {
  const code = /vocabulary\.(.+)\.json$/.exec(path)?.[1];
  if (code) packs.set(code, pack.words);
}

const ROW_OF = new Map(VOCABULARY.map((word, index) => [word.id, index]));

function meaningIn(locale: string, wordId: string): string | null {
  const row = packs.get(locale)?.[ROW_OF.get(wordId) ?? -1];
  return row?.[0] ?? null;
}

function bundleOf(locale: string, namespace: 'learning' | 'vocabulary'): Bundle {
  return (RESOURCES[locale]?.[namespace] ?? {}) as Bundle;
}

function at(bundle: Bundle, path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<unknown>((node, part) => (node as Bundle | undefined)?.[part], bundle);
  return typeof value === 'string' ? value : undefined;
}

/** The component's `t`, near enough: look up, then fill in `{{holes}}`. */
function render(locale: string, step: HintStep, values: Record<string, string> = {}): string {
  const template = at(bundleOf(locale, 'learning'), step.key);
  expect(template, `${locale} is missing learning:${step.key}`).toBeTruthy();
  return Object.entries({ ...step.values, ...values }).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(value),
    template!,
  );
}

/** Resolves `namespace:path`, the way the component's `t` would. */
function labelFor(locale: string) {
  return (key: string) => {
    const [namespace, path] = key.split(':');
    const value = at(bundleOf(locale, namespace === 'vocabulary' ? 'vocabulary' : 'learning'), path!);
    expect(value, `${locale} is missing ${key}`).toBeTruthy();
    return value!;
  };
}

/**
 * Casefolded and stripped of anything that is not a letter or a digit.
 *
 * So that "apple." and "Apple" and "an apple" all contain the same needle, and
 * a hint cannot pass by adding a full stop to the answer.
 */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/*
 * The matcher is `revealsAnswer` from the module under test, deliberately.
 *
 * A second copy here would be a second opinion about what counts as giving the
 * answer away, and `wordHints` now uses the same function to censor its own
 * category hint. If the two drifted, this file would be certifying a rule the
 * product does not follow — which is the failure mode that let the original bug
 * ship with a full test suite passing.
 */
const reveals = revealsAnswer;

describe('a hint is not the answer', () => {
  for (const locale of AVAILABLE_LOCALES) {
    const label = labelFor(locale);

    it(`never hands over a word's meaning in ${locale}`, () => {
      const offenders: string[] = [];
      let dropped = 0;
      let stranded = 0;
      for (const word of SAMPLE) {
        const meaning = meaningIn(locale, word.id);
        if (!meaning) continue;
        for (const mode of WORD_MODES) {
          // The answer, whichever direction the question runs.
          const answer = mode === 'read' || mode === 'listenMeaning' ? meaning : word.word;
          // The meaning is passed exactly as `wordExercise` passes it, so the
          // hint's own guard against a category that collides with the answer
          // is under test rather than bypassed.
          const authored = wordHints(word, mode);
          /*
           * Filtered with the component's own renderer, because that is what
           * the learner gets.
           *
           * `ChoiceExercise` and `BuildExercise` both put the ladder through
           * `usableHints` before showing a rung, so auditing the unfiltered
           * list would be auditing a string nothing displays — and auditing
           * only the filtered one would prove the filter runs rather than that
           * the ladder is safe. Both numbers are therefore kept: `offenders`
           * has to be empty, and `stranded` counts the questions the filter
           * emptied down to the bare reveal, which is a hint ladder in name
           * only.
           */
          const shown = usableHints(authored, (step) => render(locale, step), answer);
          dropped += authored.length - shown.length;
          if (authored.length > 1 && shown.every((step) => step.strength === 'answer')) {
            stranded += 1;
          }
          for (const step of shown) {
            if (step.strength === 'answer') continue;
            const text = render(locale, step);
            if (reveals(text, answer) || normalise(text) === normalise(answer)) {
              offenders.push(`${locale} ${word.word} ${mode} ${step.strength}: “${text}”`);
            }
          }
        }
      }
      expect(offenders).toEqual([]);
      /*
       * The filter is a safety net, not the design.
       *
       * If it were doing heavy lifting, the hints would be badly written and
       * this test would be certifying the net instead. Today it removes two
       * rungs in de, es and pt-BR and none anywhere else, out of 1,845
       * questions per language, and strands nothing. The bounds are loose
       * enough that a new gloss colliding with a lead-in is not a failure and
       * tight enough that a template colliding across the corpus is.
       */
      expect(dropped, `${locale} rungs dropped`).toBeLessThan(20);
      expect(stranded, `${locale} questions left with only a reveal`).toBeLessThan(5);
    });

    it(`never hands over a letter's sound in ${locale}`, () => {
      const offenders: string[] = [];
      for (const character of ALL_CHARACTERS) {
        for (const mode of CHARACTER_MODES) {
          for (const step of characterHints(character, mode, label)) {
            if (step.strength === 'answer') continue;
            const text = render(locale, step);
            /*
             * The answer depends on the direction, and `write` is the exception
             * that proves the rule: there the answer is a shape drawn on a
             * canvas, so naming the sound is help rather than a giveaway. It is
             * the one question where the old hint was doing its job.
             */
            if (mode === 'write') continue;
            const answer = mode === 'read' ? character.romanization : character.character;
            if (reveals(text, answer) || normalise(text) === normalise(answer)) {
              offenders.push(`${locale} ${character.character} ${mode}: “${text}”`);
            }
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe('the ladder', () => {
  it('gets stronger, never weaker', () => {
    const order = { light: 0, strong: 1, answer: 2 };
    for (const word of SAMPLE.slice(0, 40)) {
      for (const mode of WORD_MODES) {
        const rungs = wordHints(word, mode).map((step) => order[step.strength]);
        expect(
          rungs.every((rung, index) => index === 0 || rung > rungs[index - 1]!),
          `${word.word} ${mode}: ${rungs.join(',')}`,
        ).toBe(true);
      }
    }
  });

  it('offers a first rung that is never the reveal', () => {
    const label = (key: string) => key;
    for (const word of SAMPLE.slice(0, 60)) {
      for (const mode of WORD_MODES) {
        const [first] = wordHints(word, mode);
        if (!first) continue;
        expect(first.strength, `${word.word} ${mode}`).toBe('light');
      }
    }
    for (const character of ALL_CHARACTERS) {
      for (const mode of CHARACTER_MODES) {
        const [first] = characterHints(character, mode, label);
        if (!first) continue;
        expect(first.strength, `${character.character} ${mode}`).toBe('light');
      }
    }
  });

  it('is exactly two rungs on a word question: a sentence, then the answer', () => {
    /*
     * The flow the product promises, asserted as a shape rather than as a
     * screenshot: press once and read the word in a sentence, press again and
     * be told. There is no third press, which is what removed the *힌트 더
     * 보기* stage, and there is no rung that classifies the answer, which is
     * what removed *"사람과 가족에 나오는 명사예요"*.
     *
     * `write` and `distinguish` are not word questions — a word is never
     * handwritten and never a minimal pair — and offer no ladder at all.
     */
    for (const word of SAMPLE.slice(0, 120)) {
      for (const mode of WORD_MODES) {
        const rungs = wordHints(word, mode);
        if (rungs.length === 0) continue;
        expect(rungs.length, `${word.word} ${mode}`).toBeLessThanOrEqual(2);
        expect(rungs[rungs.length - 1]!.strength, `${word.word} ${mode}`).toBe('answer');
        for (const rung of rungs) {
          expect(
            rung.key,
            `${word.word} ${mode} still classifies the answer`,
          ).not.toMatch(/hint\.kind/);
        }
      }
    }
  });

  it('takes the word out of the sentence wherever the word is the answer', () => {
    /*
     * The half of the rule that a length check cannot see.
     *
     * On `read` the answer is the meaning and the Korean sentence is safe
     * whole. On `produce`, `build`, `context` and `listen` the answer *is* the
     * Korean word, and showing its own example sentence would hand it over —
     * so the sentence arrives with a gap in it. Asserted over the sample rather
     * than on one word, because the gapping is a search and the corpus is full
     * of irregular verbs it has to find.
     */
    const answersInKorean = ['produce', 'build', 'context', 'listen'] as const;
    for (const word of SAMPLE.slice(0, 200)) {
      for (const mode of answersInKorean) {
        const [first] = wordHints(word, mode);
        if (!first || first.key !== 'review.hint.inSentence') continue;
        const sentence = first.values!.sentence!;
        expect(sentence, `${word.word} ${mode}`).toContain(GAP);
        expect(revealsAnswer(sentence, word.word), `${word.word} ${mode}`).toBe(false);
      }
    }
  });

  it('finds the word in nearly every example it is given', () => {
    /*
     * The gapping is what makes the first rung possible on four of the six
     * modes, so its reach is a product property rather than an implementation
     * detail: where it fails, the learner's only hint is the answer.
     *
     * It succeeds on all but a handful of the corpus. The ones it does not are
     * bound morphemes — 월 appears as 삼월, 마저 as 동생마저 — which do not begin
     * an eojeol and which the rule is right to leave alone. The floor is here
     * so that a change which quietly breaks the search fails loudly instead of
     * silently shortening every ladder in the product.
     */
    const withExamples = SAMPLE.filter((word) => word.example);
    const gapped = withExamples.filter((word) =>
      exampleWithGap(word.example!, word.word, word.surface_form),
    );
    expect(gapped.length / withExamples.length).toBeGreaterThan(0.99);
  });

  it('ends in a reveal wherever it offers anything at all', () => {
    for (const word of SAMPLE.slice(0, 60)) {
      for (const mode of WORD_MODES) {
        const rungs = wordHints(word, mode);
        if (rungs.length === 0) continue;
        expect(rungs[rungs.length - 1]!.strength, `${word.word} ${mode}`).toBe('answer');
      }
    }
  });
});

/*
 * Hand-written cases, and the reason they have to be hand-written.
 *
 * The suite above asks `revealsAnswer` whether the hints `revealsAnswer` let
 * through reveal the answer. That is a tautology, and it certified a leak for
 * as long as the leak existed: the function dropped Unicode combining marks,
 * so a Bengali vowel sign vanished from the needle but only from the *edges*
 * of each token — টাকা became টক on one side and টাক on the other, and the two
 * never met. 돈's category hint reads "টাকা ও কেনাকাটা-এর কিছু" and the answer
 * is টাকা. In English the identical hint was caught. Every abugida among the
 * 32 was affected: Bengali, Devanagari, Telugu, Tamil.
 *
 * These assert the answer directly, so the implementation cannot be its own
 * witness.
 */
describe('revealsAnswer reads the scripts it is given', () => {
  it.each([
    ['bn', '— এটি একটি বিশেষ্য — টাকা ও কেনাকাটা-এর কিছু।', 'টাকা'],
    ['hi', 'यह एक संज्ञा है — पैसा और खरीदारी से जुड़ी कोई चीज़।', 'पैसा'],
    ['te', 'ఇది ఒక నామవాచకం — డబ్బు, కొనుగోళ్లుకి సంబంధించినది.', 'డబ్బు'],
    ['ta', 'இது ஒரு பெயர்ச்சொல் — பணம் மற்றும் ஷாப்பிங் தொடர்பானது.', 'பணம்'],
    ['en', 'It is a noun — something to do with money and shopping.', 'money'],
    ['de', 'Es ist ein Verb — etwas mit Geld und Einkaufen.', 'kaufen'],
  ])('catches the answer inside a %s hint', (_locale, text, answer) => {
    expect(revealsAnswer(text, answer)).toBe(true);
  });

  it.each([
    // হয় "is" and হ্যাঁ "yes" differ only in their marks, so a mark-blind
    // matcher calls them the same word and censors a hint that was fine.
    ['bn', 'এভাবে ব্যবহার হয়: 네, 맞아요.', 'হ্যাঁ'],
    ['en', 'It is a noun — something to do with the body.', 'money'],
    ['hi', 'यह एक क्रिया है — रोज़मर्रा की कोई चीज़।', 'पैसा'],
  ])('does not censor an unrelated %s word', (_locale, text, answer) => {
    expect(revealsAnswer(text, answer)).toBe(false);
  });

  it('is unaffected by NFC or NFD composition', () => {
    const composed = 'পণ্য';
    expect(revealsAnswer(`কিছু ${composed} আছে`, composed.normalize('NFD'))).toBe(true);
  });
});
