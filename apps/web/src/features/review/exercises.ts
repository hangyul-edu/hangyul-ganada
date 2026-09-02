import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import { ALL_CHARACTERS, getCharacterByGlyph } from '../../data/characters';
import { toSyllables } from '../../data/jamo';
import { clozeFor } from '../../data/cloze';
import { VOCABULARY, getWord } from '../../data/vocabulary';
import type { ExerciseMode } from '../../domain/review';
import type { ReviewCandidate } from '../../domain/review';
import { recognitionOptions, soundsTheSame } from '../learning/lookAlikes';
import { MIN_OPTIONS, readingOptions } from '../learning/wordOptions';
import { type HintStep, type Label, characterHints, wordHints } from './hints';

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
  /**
   * The syllables to assemble the word from, shuffled. Only for `build`.
   *
   * The word's own syllables plus a few that belong to other words, so the
   * learner is choosing rather than reading the answer off the tray. Every tile
   * carries an id because a word can repeat a syllable — 사사 would otherwise
   * be two tiles the interface could not tell apart.
   */
  tiles?: Array<{ id: string; syllable: string }>;
  /**
   * The letter's sound, shown beside the prompt on `write`.
   *
   * A field of its own rather than something read back out of the hints. It is
   * part of the question there — "write the letter that sounds like *g*" —
   * and reaching into the hint ladder for it would mean the prompt silently
   * changed whenever the ladder did.
   */
  romanization?: string;
  /**
   * The help ladder, weakest first. See `hints.ts`.
   *
   * Empty where a question has no honest help to give. It is never a single
   * string any more: the field it replaced held the word's meaning on a
   * question whose options *were* meanings.
   */
  hints: HintStep[];
  /** The prompt itself, where the prompt is a meaning rather than Korean. */
  meaning?: string;
  meaningLocale?: string;
  /**
   * The same question, asked without the recording.
   *
   * Present only on the two **letter** exercises whose entire prompt is a clip:
   * `listen` — hear it, pick the letter — and `distinguish` — hear it, pick
   * which of two look-alikes it was. A learner who cannot use audio meets those
   * two and has nothing to answer with, and the global setting that used to
   * skip them was removed along with the vocabulary listening questions it
   * mostly existed for.
   *
   * This is the replacement, and it is per question rather than a setting: a
   * small *Can't use audio?* under the prompt, which swaps the clip for an
   * equivalent visual question and nothing else. Same item, same skill, same
   * answer, same scoring — the learner is not skipping the question, they are
   * being asked it another way, so there is nothing to penalise and no progress
   * to lose. See `ChoiceExercise`.
   *
   * Absent where no honest substitution exists, and the button is then not
   * offered. Vocabulary never has one, because vocabulary has no audio-only
   * question left to accommodate.
   */
  soundFree?: SoundFreeVariant;
}

/**
 * A patch applied over an `Exercise` when the learner asks for it.
 *
 * Deliberately a *patch* rather than a second exercise: the candidate, the
 * mode, the skill being exercised, the hints and the answer are all the same
 * question, and building two objects would be two things to keep in step.
 */
export interface SoundFreeVariant {
  promptKey: string;
  /** Shown in place of the clip, where the substitute prompt is the letter. */
  korean?: string;
  /** Shown in place of the clip, where the substitute prompt is the sound. */
  romanization?: string;
  options: ExerciseOption[];
  answerId: string;
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
  label: Label = (key) => key,
): Exercise | null {
  return candidate.kind === 'word'
    ? wordExercise(candidate, meaningOf, seed)
    : characterExercise(candidate, seed, label);
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
  const hints = wordHints(word, candidate.mode);

  /**
   * Every meaning in this question, in one language, or no question.
   *
   * §6 and §7. A learner reading Tamil was shown a Tamil prompt over four
   * English answers, because each meaning resolved its own fallback and three
   * of them happened to land somewhere else than the fourth. Nothing was
   * individually wrong and the question was unanswerable by the person it was
   * built for.
   *
   * The rule is not "must be the interface language" — that would delete
   * vocabulary practice outright in the twenty-two languages the corpus has no
   * meanings for. It is **must be one language**: the app decides which, once,
   * in `i18n/contentLocale.ts`, tells the learner when it is not theirs, and
   * lets them change it. A question that cannot be built that way is not built.
   */
  const oneLanguage = (options: readonly VocabularyWord[]): boolean =>
    options.every((option) => {
      const other = meaningOf(option);
      // Present, and in the same language as the answer. The emptiness check is
      // the one that matters now that meanings are resolved strictly: a locale
      // with no pack returns nothing for every word, so the question is not
      // built at all rather than built out of blanks.
      return other.value.trim().length > 0 && other.locale === copy.locale;
    });

  switch (candidate.mode) {
    case 'read': {
      // Korean on the card, meanings in the options. The other way round —
      // meaning shown, Korean chosen — is a different skill and is what
      // `listen` and `write` already cover between them.
      const chosen = readingOptions(word, seed, (other) => meaningOf(other).value);
      if (!oneLanguage(chosen)) return null;
      const options = chosen.map((option) => ({
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
        hints,
      };
    }

    case 'produce': {
      /*
       * The other direction: the meaning is the prompt, the Korean is chosen.
       *
       * Harder than `read`, and it comes later for that reason — recognising
       * 엄마 as "mother" is a smaller step than being given "mother" and
       * finding 엄마 among four words that all look like Korean. The daily
       * session schedules it only for words already met; see `stepsFor`.
       */
      /*
        The prompt *is* the meaning here, so a missing one is not a thin
        question — it is a blank one. The options are Korean and always fine;
        what has to exist is the thing being asked about.
      */
      if (!copy.value.trim()) return null;
      const options = readingOptions(word, seed + 21, (other) => meaningOf(other).value).map(
        (option) => ({ id: option.id, korean: option.word }),
      );
      return {
        candidate,
        mode: 'produce',
        promptKey: 'review.prompt.produce',
        options,
        answerId: word.id,
        // The prompt is the meaning, so the meaning is not also help. What is:
        // the word used in a sentence, with the word itself taken out of it.
        // See `wordHints`.
        hints,
        meaning: copy.value,
        meaningLocale: copy.locale,
        audioId: word.audio.word,
      };
    }

    /*
     * `listen` and `listenMeaning` were here, and a word can no longer produce
     * either of them.
     *
     * Deleted rather than guarded, for the same reason `write` has never had a
     * branch in this switch: a mode a word cannot be *built* into is a mode no
     * route can reach. A stale stored candidate naming `listen` — one written
     * before this change and read back from a device — falls through to the
     * `default` below and returns `null`, and the scheduler drops any candidate
     * it cannot turn into a question. There is no path from any screen, any
     * plan, any saved word or any wrong-answer retry to a vocabulary question
     * whose prompt is a recording.
     *
     * The word's audio itself is untouched — `read`, `produce` and `context`
     * all still carry `audioId` and still play the clip beside the question.
     * What has gone is the question *made of* the clip.
     */
    case 'listen':
    case 'listenMeaning':
      return null;

    case 'context': {
      /*
       * Read, not built. See `data/cloze.ts` for what this used to do and why
       * it stopped: the blank was the stem and the options were dictionary
       * forms, so 빵을 ___어요 was asked with 만들다 among the answers.
       *
       * A word with no entry has no gap-fill, and that is the right answer for
       * a sentence that cannot have one. The step planner asks something else.
       */
      const gap = clozeFor(word.id);
      if (!gap) return null;
      const options = gap.options.map((option) => ({
        id: option.id,
        korean: option.surface,
      }));
      if (options.length < MIN_OPTIONS) return null;
      return {
        candidate,
        mode: 'context',
        promptKey: 'review.prompt.context',
        sentence: {
          before: gap.before,
          target: gap.target,
          after: gap.after,
          audioId: word.audio.example,
        },
        options,
        answerId: word.id,
        hints,
      };
    }

    case 'build': {
      /*
       * Put the word together from its own syllables.
       *
       * Two syllables minimum: a one-syllable word is a single tile beside
       * three decoys, which is `produce` with a worse interface. Four maximum,
       * because assembling 어린이집 out of eight tiles is a puzzle about
       * patience rather than a question about Korean.
       */
      const syllables = toSyllables(word.word);
      if (syllables.length < 2 || syllables.length > 4) return null;

      /*
       * Decoys from other words' syllables, never invented.
       *
       * A made-up syllable is one a learner can eliminate without knowing the
       * word — it looks wrong, so the question becomes "which of these is real
       * Korean". Taken from the corpus, every tile is a syllable that genuinely
       * occurs, and the only way through is to know how this word is spelled.
       */
      const decoys = decoySyllables(word, syllables, seed + 41);
      if (decoys.length < 2) return null;

      const tiles = stableOrder(
        [...syllables, ...decoys].map((syllable, index) => ({
          id: `${index}:${syllable}`,
          syllable,
        })),
        seed + 5,
      );

      /*
       * A tray that spells a second word meaning the same thing is a question
       * with two right answers, and the grader marks one of them wrong.
       *
       * The prompt here is the meaning, so most alternative spellings are
       * harmless: 밤's tray can also spell 유리 and 유리 does not mean night.
       * What is not harmless is a *synonym*, and it is usually not the decoys
       * that supply it — 깨물다's own three syllables spell 물다, 떨리다's spell
       * 떨다, 쫓아내다's spell 내쫓다. Re-picking decoys cannot fix a word whose
       * own syllables are the problem, so the question is refused and the
       * scheduler asks something else about this word. Measured over the whole
       * corpus in 32 languages that is 0.64% of build questions and 249 words,
       * none of them in more than a handful of languages.
       *
       * Whether two glosses mean the same thing is a fact about the learner's
       * pack, so this is checked per language rather than once: 깨물다 and 물다
       * are distinct in English and identical in nine other packs.
       */
      if (spellsASynonym(tiles, word, copy.value, meaningOf)) return null;

      return {
        candidate,
        mode: 'build',
        promptKey: 'review.prompt.build',
        options: undefined,
        answerId: word.id,
        meaning: copy.value,
        meaningLocale: copy.locale,
        audioId: word.audio.word,
        tiles,
        korean: word.word,
        hints,
      };
    }

    case 'write':
      /*
       * Never. Vocabulary is not handwritten anywhere in this product.
       *
       * This used to hand the learner a canvas and the word's first syllable —
       * so reviewing 학교 meant drawing 학, which is a letter exercise wearing a
       * word's name, and which the letter curriculum had already asked for
       * twice. The scheduler cannot reach here any more either, because
       * `guided_writing` is no longer one of a word's skills (`domain/memory.ts`).
       * The arm stays as the belt to that braces: if some future caller
       * hand-builds a write candidate for a word, it produces no question
       * rather than a canvas.
       */
      return null;

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

function characterExercise(
  candidate: ReviewCandidate,
  seed: number,
  label: Label,
): Exercise | null {
  const meta = getCharacterByGlyph(candidate.itemKey);
  if (!meta) return null;
  const hints = characterHints(meta, candidate.mode, label);

  switch (candidate.mode) {
    case 'listen': {
      // The existing recognition question: hear it, pick the letter. The
      // distractors are the letters actually confusable with this one.
      // Asked from the clip alone, so soundalikes are excluded: see
      // `lookAlikes.ts`. Fewer than three plausible wrong answers and the
      // question is dropped rather than padded with filler.
      const options = recognitionOptions(candidate.itemKey, seed, 4, true);
      if (options.length < 3) return null;
      const shown = options.map((glyph) => ({ id: glyph, korean: glyph }));
      return {
        candidate,
        mode: 'listen',
        promptKey: 'review.prompt.listenLetter',
        audioId: meta.audio.sound,
        options: shown,
        answerId: candidate.itemKey,
        hints,
        /*
         * Without the clip: the sound written down, and the same four letters.
         *
         * The recording and the romanisation carry the same information — this
         * letter's sound — so substituting one for the other asks the identical
         * question, which is what makes this an accommodation rather than an
         * easier version. It gives nothing away: the options are shapes, and
         * knowing that the sound is *a* is exactly the mapping being tested.
         *
         * Safe here specifically because `recognitionOptions(…, true)` excludes
         * soundalikes for this mode — no two options share a romanisation, so
         * the written sound cannot match more than one of them.
         */
        soundFree: {
          promptKey: 'review.prompt.listenLetterSoundFree',
          romanization: meta.romanization,
          options: shown,
          answerId: candidate.itemKey,
        },
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
        hints,
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
        hints,
        /*
         * Without the clip: the question turned round.
         *
         * The romanisation trick that works for `listen` would hand this one
         * over — the options here already carry their romanisations as labels,
         * so printing the target's sound above them is printing the answer. So
         * the substitute asks the same distinction from the other end: here is
         * the letter, which of these two sounds does it make. The options are
         * the two sounds and the prompt is the shape, which is the same pair
         * being told apart with the modality swapped rather than a different
         * exercise.
         */
        soundFree: {
          promptKey: 'review.prompt.distinguishSoundFree',
          korean: meta.character,
          options: stableOrder(
            [
              { id: meta.character, label: meta.romanization },
              { id: other.character, label: other.romanization },
            ],
            seed,
          ),
          answerId: candidate.itemKey,
        },
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
        romanization: meta.romanization,
        hints,
      };

    case 'produce':
      // A letter's "meaning" is its sound, and choosing a letter from its sound
      // is exactly the `listen` question. There is no second direction here.
      return null;

    case 'build':
      // A letter has no syllables to assemble; it *is* one.
      return null;

    case 'listenMeaning':
      // Same reason: a letter's meaning is its sound.
      return null;

    case 'context':
      return null; // A letter has no sentence of its own; its words do.
  }
}

/**
 * Syllables from other words, to sit beside this word's own.
 *
 * Drawn from a deterministic slice of the corpus rather than at random, and
 * filtered so a decoy is never a syllable the answer already contains — a tray
 * with two 사 tiles where the word needs one is a question about counting.
 */
function decoySyllables(
  word: VocabularyWord,
  own: readonly string[],
  seed: number,
): string[] {
  const taken = new Set(own);
  const out: string[] = [];
  const start = hash(`${word.id}:${seed}`) % VOCABULARY.length;
  for (let step = 0; step < VOCABULARY.length && out.length < 3; step += 1) {
    const other = VOCABULARY[(start + step * 7) % VOCABULARY.length]!;
    if (other.id === word.id) continue;
    for (const syllable of toSyllables(other.word)) {
      if (taken.has(syllable)) continue;
      taken.add(syllable);
      out.push(syllable);
      break;
    }
  }
  return out;
}


/**
 * Whether the tray can spell a *different* taught word that means the same
 * thing to this learner.
 *
 * Exhaustive over arrangements of two to four tiles, which is at most 840
 * strings from a seven-tile tray and a map lookup each — built once per
 * question, so the cost is invisible beside the render that follows it.
 *
 * `meaningOf` rather than the English: whether two glosses say the same thing
 * is a fact about the learner's pack, and 깨물다 and 물다 are distinct in
 * English and identical in nine other languages. Two glosses that mean the same
 * thing while reading differently — "to begin" against "to start" — are not
 * caught here and are not catchable by string comparison; see
 * `translation:semantics` and `I-17`.
 */
function spellsASynonym(
  tiles: ReadonlyArray<{ syllable: string }>,
  word: VocabularyWord,
  meaning: string,
  meaningOf: MeaningOf,
): boolean {
  const mine = flattenMeaning(meaning);
  if (mine === '') return false;

  const taught = taughtBySpelling();
  const seen = new Set<string>();

  const walk = (prefix: string, left: readonly string[]): boolean => {
    if (prefix.length >= 2 && prefix !== word.word && !seen.has(prefix)) {
      seen.add(prefix);
      const other = taught.get(prefix);
      if (other && flattenMeaning(meaningOf(other).value) === mine) return true;
    }
    if (prefix.length >= 4) return false;
    for (let index = 0; index < left.length; index += 1) {
      const rest = [...left.slice(0, index), ...left.slice(index + 1)];
      if (walk(prefix + left[index], rest)) return true;
    }
    return false;
  };

  return walk('', tiles.map((tile) => tile.syllable));
}

/**
 * Taught words by their spelling, rebuilt when the corpus grows.
 *
 * `VOCABULARY` is a live, growing array — the bands arrive over the network —
 * so a map built once at module load holds band one and nothing else. Keyed on
 * the length, which is the only thing that changes about it: the corpus is
 * appended to and never edited in place.
 */
let spellingIndex: { size: number; map: Map<string, VocabularyWord> } | null = null;
function taughtBySpelling(): Map<string, VocabularyWord> {
  if (spellingIndex && spellingIndex.size === VOCABULARY.length) return spellingIndex.map;
  const map = new Map<string, VocabularyWord>();
  for (const word of VOCABULARY) map.set(word.word, word);
  spellingIndex = { size: VOCABULARY.length, map };
  return map;
}

/** Case, Unicode form and punctuation out; spaces and combining marks in. */
function flattenMeaning(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
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

/**
 * Whether this candidate can actually become a question.
 *
 * The predicate the plan is resolved with, and the reason `Review` can promise
 * a number. It is `buildExercise` itself rather than a second copy of its rules,
 * because a second copy would drift — and the day it drifted, the screen would
 * again say "8 questions" and open a session with six.
 *
 * ## Why a stub meaning is sound here
 *
 * Every `null` return in this module is about *structure*: a word with no
 * example cannot be asked in context, a letter with fewer than three plausible
 * wrong answers cannot be a multiple-choice question, a word is never written.
 * None of them consults what the meaning says, only the item. So answerability
 * does not depend on the interface language — which matters, because otherwise
 * switching language mid-session could empty a plan that had already been
 * promised. `answerable.test.ts` holds that property.
 */
export function canAsk(candidate: ReviewCandidate): boolean {
  return buildExercise(candidate, STRUCTURAL_MEANING, 1) !== null;
}

/** A meaning resolver that returns the word itself. See `canAsk`. */
const STRUCTURAL_MEANING: MeaningOf = (word) => ({ value: word.word, locale: 'ko' });

/** Every word, for the saved-words screen. Re-exported so pages import one module. */
export { VOCABULARY };
