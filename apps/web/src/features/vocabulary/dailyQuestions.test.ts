/**
 * What a sitting contains when the learner's language cannot supply a meaning.
 *
 * Twenty-two of the thirty-two interface languages have word meanings for a
 * hundred of the 2,916 taught words, and `strictMeaning` refuses — correctly —
 * to put one English choice beside three Hindi ones. So for the other 2,816
 * words `meaning`, `produce` and `match` cannot be built at all in those
 * languages, and the sitting rests entirely on the gap-fill.
 *
 * Which is exactly what broke. Gap-fills are now validated at build time and
 * only 536 words have one, so a level-1 Hindi session came out as ten
 * introduction cards and nothing else: the closing card read *0 शब्द सीखा*,
 * zero words learned, and it was telling the truth.
 *
 * `build` — assemble the word from its own syllables — needs no translation and
 * no example sentence, so it is the question those learners can always be
 * asked. These hold both halves of the rule: the fallback happens when it is
 * needed, and it never displaces a question the planned step could have built.
 */
import { describe, expect, it } from 'vitest';

import { VOCABULARY } from '../../data/vocabulary';
import { buildDailyQuestions } from './dailyQuestions';
import type { ScheduledStep } from '../../domain/vocabularyDay';

/** A word of two to four syllables, which is what `build` needs. */
const buildable = VOCABULARY.find((word) => word.word.length >= 2 && word.word.length <= 4)!;

const step = (wordId: string, mode: ScheduledStep['step']): ScheduledStep => ({
  wordId,
  step: mode,
  completesWord: true,
  source: 'new',
  completes: [wordId],
});

/** The learner's language has this word. */
const known = () => ({ value: 'the meaning', locale: 'hi' });
/** The learner's language has nothing for it — 2,816 of 2,916 in Hindi. */
const unknown = () => ({ value: '', locale: 'hi' });

describe('a sitting in a language with no word pack', () => {
  it('asks about the word rather than saying nothing', () => {
    const questions = buildDailyQuestions([step(buildable.id, 'meaning')], unknown);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.step).toBe('build');
    expect(questions[0]!.exercise?.mode).toBe('build');
    // And the word is still credited, so the day's counter is not short.
    expect(questions[0]!.completes).toEqual([buildable.id]);
  });

  it('still asks a gap-fill when the corpus has a validated one', () => {
    // A `context` question carries no meanings, so it survives the missing pack
    // — the fallback must not take it over.
    const withCloze = VOCABULARY.map((word) => step(word.id, 'context'));
    const questions = buildDailyQuestions(withCloze, unknown);
    const context = questions.filter((question) => question.step === 'context');
    expect(context.length).toBeGreaterThan(100);
  });

  it('leaves a language that does have the meaning alone', () => {
    const questions = buildDailyQuestions([step(buildable.id, 'meaning')], known);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.step).toBe('meaning');
  });

  it('says nothing about a word it cannot ask any question about', () => {
    // One syllable: too short to assemble, and no meaning to choose between.
    const single = VOCABULARY.find((word) => word.word.length === 1);
    if (!single) return;
    expect(buildDailyQuestions([step(single.id, 'meaning')], unknown)).toHaveLength(0);
  });

  it('does not turn an introduction into a question', () => {
    const questions = buildDailyQuestions([step(buildable.id, 'intro')], unknown);
    expect(questions).toHaveLength(1);
    expect(questions[0]!.step).toBe('intro');
    expect(questions[0]!.exercise).toBeNull();
  });
});
