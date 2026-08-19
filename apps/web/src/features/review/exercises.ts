import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { ALL_CHARACTERS, getCharacterByGlyph } from '../../data/characters';
import { VOCABULARY, getWord } from '../../data/vocabulary';
import type { ExerciseMode } from '../../domain/review';
import type { ReviewCandidate } from '../../domain/review';
import { recognitionOptions, soundsTheSame } from '../learning/lookAlikes';
import { readingOptions } from '../learning/wordOptions';

/**
 * Turning a scheduler decision into a question on a screen.
 *
 * `domain/review.ts` decides *what* to practise and *which skill* to test.
 * This decides what that looks like: which prompt, which four options, which
 * one is right. Kept out of the component because it is the part with rules in
 * it — a distractor set that gives the answer away is a bug you cannot see by
 * looking at the screen, and it is testable here and not there.
 *
 * Everything is derived from the item and a seed. No clock, no `Math.random`:
 * a learner who answers wrong and comes back to the same item later in the
 * sitting gets the same question, because a reshuffle would make it impossible
 * to tell learning from a luckier guess.
 */

export interface ExerciseOption {
  id: string;
  /** Korean, where the option *is* Korean. */
  korean?: string;
  /** What to read, where the option is a meaning or a sound. */
  label?: string;
  /** The locale `label` is written in, for `lang` and font selection. */
  labelLocale?: string;
}

export interface Exercise {
  candidate: ReviewCandidate;
  mode: ExerciseMode;
  /** Translation key for the instruction above the prompt. */
  promptKey: string;
  /** The Korean being asked about, where it is shown. */
  korean?: string;
  /** A clip to play. Present for `listen`, optional elsewhere. */
  audioId?: string;
  /** The example sentence, split around the target. Only for `context`. */
  sentence?: { before: string; target: string; after: string; audioId?: string };
  /** What the learner picks between. Absent for `write`. */
  options?: ExerciseOption[];
  answerId?: string;
  /** The syllable to draw. Only for `write`. */
  writeTarget?: string;
  /** Shown when the learner asks for help, instead of failing them. */
  hint?: string;
  hintLocale?: string;
}

/** Resolves the copy for one word in the learner's language. */
export type MeaningOf = (word: VocabularyWord) => { value: string; locale: string };

/**
 * Builds the question for one scheduled candidate.
 *
 * Returns `null` when the item cannot be asked this way — a word with no
 * example sentence cannot be asked in context, a character with no confusable
 * neighbour cannot be told apart from one. The caller drops it and moves on
 * rather than showing a broken exercise; the scheduler has already ordered more
 * candidates than a session needs.
 */
export function buildExercise(
  candidate: ReviewCandidate,
  meaningOf: MeaningOf,
  seed: number,
): Exercise | null {
  return candidate.kind === 'word'
    ? wordExercise(candidate, meaningOf, seed)
    : characterExercise(candidate, seed);
}

// --- Words --------------------------------------------------------------------

function wordExercise(
  candidate: ReviewCandidate,
  meaningOf: MeaningOf,
  seed: number,
): Exercise | null {
  const word = getWord(candidate.itemKey);
  if (!word) return null;
  const copy = meaningOf(word);

  switch (candidate.mode) {
    case 'read': {
      // Korean on the card, meanings in the options. The other way round —
      // meaning shown, Korean chosen — is a different skill and is what
      // `listen` and `write` already cover between them.
      const options = readingOptions(word, seed).map((option) => ({
        id: option.id,
        label: meaningOf(option).value,
        labelLocale: meaningOf(option).locale,
      }));
      return {
        candidate,
        mode: 'read',
        promptKey: 'review.prompt.read',
        korean: word.word,
        audioId: word.audio.word,
        options,
        answerId: word.id,
        hint: copy.value,
        hintLocale: copy.locale,
      };
    }

    case 'listen': {
      if (!word.audio.word) return null;
      // The Korean is *not* shown: that is the whole exercise. A learner who
      // can see 사과 while it is spoken is matching a shape to a sound they
      // have already been told the answer to.
      const options = readingOptions(word, seed + 7).map((option) => ({
        id: option.id,
        korean: option.word,
      }));
      return {
        candidate,
        mode: 'listen',
        promptKey: 'review.prompt.listen',
        audioId: word.audio.word,
        options,
        answerId: word.id,
        hint: copy.value,
        hintLocale: copy.locale,
      };
    }

    case 'context': {
      if (!word.example) return null;
      const split = splitSentence(word.example, word.word);
      if (!split) return null;
      const options = readingOptions(word, seed + 13).map((option) => ({
        id: option.id,
        korean: option.word,
      }));
      return {
        candidate,
        mode: 'context',
        promptKey: 'review.prompt.context',
        sentence: { ...split, audioId: word.audio.example },
        options,
        answerId: word.id,
        hint: copy.value,
        hintLocale: copy.locale,
      };
    }

    case 'write':
      return {
        candidate,
        mode: 'write',
        promptKey: 'review.prompt.write',
        korean: word.word,
        audioId: word.audio.word,
        // The first syllable, not the whole word. A word in one box is a
        // different task from the one it was learned with, where each block
        // got its own square and its own grade.
        writeTarget: word.syllables[0] ?? word.word,
        hint: copy.value,
        hintLocale: copy.locale,
      };

    case 'distinguish':
      return null; // Words are told apart by meaning, which `read` already does.
  }
}

/**
 * The example sentence, split around the word it demonstrates.
 *
 * Matches the longest surface form present, so 먹어요 highlights 먹어요 rather
 * than nothing: the dictionary form 먹다 never appears in a Korean sentence.
 * The forms come from the word's own syllables and stem rather than from a
 * conjugator — the build already checked the sentence contains the word, so all
 * this has to do is find where.
 */
export function splitSentence(
  sentence: string,
  word: string,
): { before: string; target: string; after: string } | null {
  for (const form of surfaceCandidates(word)) {
    const at = sentence.indexOf(form);
    if (at >= 0) {
      return {
        before: sentence.slice(0, at),
        target: form,
        after: sentence.slice(at + form.length),
      };
    }
  }
  return null;
}

/**
 * Spellings of a headword that a sentence might contain, longest first.
 *
 * A recogniser, not a conjugator. A verb's dictionary 다 is dropped and what is
 * left is matched as a prefix of whatever the sentence actually wrote — 먹다
 * gives 먹, which finds 먹어요 by scanning forward over the syllables that
 * follow. That is enough to highlight the right span and does not need a copy
 * of the conjugation rules in the browser.
 */
function surfaceCandidates(word: string): string[] {
  const forms = [word];
  if (word.endsWith('다') && word.length > 1) forms.push(word.slice(0, -1));
  return forms.sort((a, b) => b.length - a.length);
}

// --- Characters ---------------------------------------------------------------

function characterExercise(candidate: ReviewCandidate, seed: number): Exercise | null {
  const meta = getCharacterByGlyph(candidate.itemKey);
  if (!meta) return null;

  switch (candidate.mode) {
    case 'listen': {
      // The existing recognition question: hear it, pick the letter. The
      // distractors are the letters actually confusable with this one.
      // Asked from the clip alone, so soundalikes are excluded: see
      // `lookAlikes.ts`. Fewer than three plausible wrong answers and the
      // question is dropped rather than padded with filler.
      const options = recognitionOptions(candidate.itemKey, seed, 4, true);
      if (options.length < 3) return null;
      return {
        candidate,
        mode: 'listen',
        promptKey: 'review.prompt.listenLetter',
        audioId: meta.audio.sound,
        options: options.map((glyph) => ({ id: glyph, korean: glyph })),
        answerId: candidate.itemKey,
        hint: meta.romanization,
      };
    }

    case 'read': {
      // The reverse: the letter is shown and the *sound* is chosen. This is the
      // direction that catches a learner who can pick ㅏ out of a line-up by
      // shape and still cannot say it.
      const others = recognitionOptions(candidate.itemKey, seed + 3).filter(
        (glyph) => glyph !== candidate.itemKey,
      );
      const options = [candidate.itemKey, ...others.slice(0, 3)]
        .map((glyph) => ALL_CHARACTERS.find((c) => c.character === glyph))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({ id: c.character, label: c.romanization }));
      if (options.length < 3) return null;
      return {
        candidate,
        mode: 'read',
        promptKey: 'review.prompt.readLetter',
        korean: candidate.itemKey,
        audioId: meta.audio.sound,
        options: stableOrder(options, seed),
        answerId: candidate.itemKey,
        hint: meta.romanization,
      };
    }

    case 'distinguish': {
      // Two options, not four, and the second one is the letter *this learner*
      // has actually been picking instead. A generic "which of these four" is
      // a recognition question; this is the specific distinction they lose.
      const partner = candidate.partner;
      if (!partner) return null;
      // …unless the two are the same sound in different clothes. A learner who
      // mixes up 애 and 에 is not making a listening mistake, and playing one of
      // them and asking which is unanswerable. Their confusion is real and it
      // is a *spelling* confusion; the reading and writing modes are where it
      // gets practised.
      if (soundsTheSame(candidate.itemKey, partner)) return null;
      const other = getCharacterByGlyph(partner);
      if (!other) return null;
      return {
        candidate,
        mode: 'distinguish',
        promptKey: 'review.prompt.distinguish',
        audioId: meta.audio.sound,
        options: stableOrder(
          [
            { id: meta.character, korean: meta.character, label: meta.romanization },
            { id: other.character, korean: other.character, label: other.romanization },
          ],
          seed,
        ),
        answerId: candidate.itemKey,
        hint: meta.romanization,
      };
    }

    case 'write':
      return {
        candidate,
        mode: 'write',
        promptKey: 'review.prompt.writeLetter',
        korean: candidate.itemKey,
        audioId: meta.audio.sound,
        writeTarget: candidate.itemKey,
        hint: meta.romanization,
      };

    case 'context':
      return null; // A letter has no sentence of its own; its words do.
  }
}

/** A deterministic order. Same seed, same positions, every render. */
function stableOrder<T extends { id: string }>(options: T[], seed: number): T[] {
  return options
    .map((option, index) => ({ option, key: hash(`${option.id}:${seed}:${index}`) }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.option);
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Every word, for the saved-words screen. Re-exported so pages import one module. */
export { VOCABULARY };
