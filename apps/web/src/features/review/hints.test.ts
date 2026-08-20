import { describe, expect, it } from 'vitest';

import { ALL_CHARACTERS } from '../../data/characters';
import { VOCABULARY } from '../../data/vocabulary';
import { AVAILABLE_LOCALES, RESOURCES } from '../../i18n/resources';
import type { ExerciseMode } from '../../domain/review';
import { characterHints, revealsAnswer, wordHints, type HintStep } from './hints';

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
const SAMPLE = VOCABULARY.filter((_, index) => index % 37 === 0);

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
      for (const word of SAMPLE) {
        const meaning = meaningIn(locale, word.id);
        if (!meaning) continue;
        for (const mode of WORD_MODES) {
          // The meaning is passed exactly as `wordExercise` passes it, so the
          // hint's own guard against a category that collides with the answer
          // is under test rather than bypassed.
          for (const step of wordHints(word, mode, label, meaning)) {
            if (step.strength === 'answer') continue;
            const text = render(locale, step);
            // The answer, whichever direction the question runs.
            const answers = mode === 'read' || mode === 'listenMeaning' ? [meaning] : [word.word];
            for (const answer of answers) {
              if (reveals(text, answer) || normalise(text) === normalise(answer)) {
                offenders.push(`${locale} ${word.word} ${mode} ${step.strength}: “${text}”`);
              }
            }
          }
        }
      }
      expect(offenders).toEqual([]);
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
    const label = (key: string) => key;
    for (const word of SAMPLE.slice(0, 40)) {
      for (const mode of WORD_MODES) {
        const rungs = wordHints(word, mode, label).map((step) => order[step.strength]);
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
        const [first] = wordHints(word, mode, label);
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

  it('ends in a reveal wherever it offers anything at all', () => {
    const label = (key: string) => key;
    for (const word of SAMPLE.slice(0, 60)) {
      for (const mode of WORD_MODES) {
        const rungs = wordHints(word, mode, label);
        if (rungs.length === 0) continue;
        expect(rungs[rungs.length - 1]!.strength, `${word.word} ${mode}`).toBe('answer');
      }
    }
  });
});
