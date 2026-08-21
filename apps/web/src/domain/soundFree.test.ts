import { describe, expect, it } from 'vitest';

import { ALL_LETTERS } from '../data/characters';
import { VOCABULARY } from '../data/vocabulary';
import { buildDailyPlan, stepsFor } from './vocabularyDay';
import { buildSession, needsHearing, type ExerciseMode } from './review';
import type { MemoryMap } from './memory';
import type { ItemProgress } from '@hangyul-ganada/shared-types';

/**
 * Practising without the questions that can only be answered by hearing them.
 *
 * §36 of the brief asks that a deaf or hard-of-hearing learner not be *unable
 * to complete learning*. The interesting half of that requirement is the second
 * one: it is not enough that the audio-only questions disappear, because a
 * learner whose session disappears with them has been accommodated into having
 * nothing to do. So both halves are checked here — the heard-only questions are
 * gone, and there is still a session.
 *
 * The reveal rung of the hint ladder is deliberately *not* the answer to this.
 * Pressing *hint* until a question gives its answer up is a way of getting past
 * a screen, and a product that offers that as its accessibility story is
 * offering a way to finish rather than a way to learn.
 */

const HEARD_ONLY: ExerciseMode[] = ['listen', 'listenMeaning', 'distinguish'];

function learned(kind: ItemProgress['kind'], keys: string[]): Record<string, ItemProgress> {
  const out: Record<string, ItemProgress> = {};
  for (const key of keys) {
    out[`${kind}:${key}`] = {
      item_key: key,
      kind,
      stage: 'learned',
      attempts: 6,
      passes: 5,
      fails: 1,
      trace_passes: 0,
      practice_passes: 0,
      demo_seen: true,
      recognition_passes: 2,
      heard: true,
      learned: true,
      needs_review: true,
      last_score: 1,
      first_seen_at: '2026-01-01T00:00:00.000Z',
      last_attempted_at: '2026-01-01T00:00:00.000Z',
      learned_at: '2026-01-01T00:00:00.000Z',
      review_due_at: '2026-01-02T00:00:00.000Z',
    };
  }
  return out;
}

describe('sound-free practice', () => {
  it('names exactly the questions whose prompt is a sound', () => {
    for (const mode of HEARD_ONLY) expect(needsHearing(mode), mode).toBe(true);
    // The rest play audio as support and show the question on screen.
    for (const mode of ['read', 'produce', 'context', 'write'] as ExerciseMode[]) {
      expect(needsHearing(mode), mode).toBe(false);
    }
  });

  /*
   * Letters, not words, and that is the point of the change this test was
   * rewritten for.
   *
   * Vocabulary has no heard-only question left to leave out — `WORD_SKILLS` no
   * longer contains `listening_recognition`, so a word session is sound-free
   * whether or not anybody asked for it. What the setting still governs is the
   * letter side: `sound_recognition` is a clip and four letters and
   * `distinguish` is a clip and two, and both are genuinely unanswerable
   * without the sound. Running this on words would now pass its second
   * assertion trivially and fail its premise, which is exactly the shape of
   * test that stops measuring anything without saying so.
   */
  it('leaves heard-only questions out of a review session', () => {
    const progress = learned(
      'character',
      ALL_LETTERS.slice(0, 20).map((letter) => letter.id),
    );
    const memory: MemoryMap = {};
    const now = new Date('2026-02-01T09:00:00.000Z');

    const ordinary = buildSession(progress, memory, now, { size: 20 });
    const quiet = buildSession(progress, memory, now, { size: 20, soundFree: true });

    // The premise: an ordinary session does contain them, so the second
    // assertion is measuring something.
    expect(ordinary.some((candidate) => needsHearing(candidate.mode))).toBe(true);
    expect(quiet.some((candidate) => needsHearing(candidate.mode))).toBe(false);
  });

  /*
   * The other half of the same fact, from the vocabulary side: a word session
   * is now sound-free without the setting, on every route into it.
   */
  it('never offers a word question that has to be heard', () => {
    const progress = learned('word', VOCABULARY.slice(0, 30).map((word) => word.id));
    const now = new Date('2026-02-01T09:00:00.000Z');
    const session = buildSession(progress, {}, now, { size: 20 });
    expect(session.length).toBeGreaterThan(4);
    expect(session.some((candidate) => needsHearing(candidate.mode))).toBe(false);
  });

  it('still produces a session worth doing', () => {
    const progress = learned('word', VOCABULARY.slice(0, 30).map((word) => word.id));
    const quiet = buildSession(progress, {}, new Date('2026-02-01T09:00:00.000Z'), {
      size: 20,
      soundFree: true,
    });
    /*
     * The failure this guards is quieter than an empty list: a session made
     * entirely of one question type is technically non-empty and is a drill.
     */
    expect(quiet.length).toBeGreaterThan(4);
    expect(new Set(quiet.map((candidate) => candidate.mode)).size).toBeGreaterThan(1);
  });

  it('takes the heard-only steps out of every kind of daily word', () => {
    for (const source of ['new', 'review', 'familiar', 'weak'] as const) {
      for (let index = 0; index < 4; index += 1) {
        // Asked with the setting *off*, because there is nothing left for it to
        // turn off: a word owes read steps whatever the learner prefers.
        const steps = stepsFor(source, index, false);
        expect(steps, `${source} ${index}`).not.toContain('listen');
        expect(steps, `${source} ${index}`).not.toContain('listenMeaning');
        // Never emptied. `intro` alone would be a word met and never checked.
        expect(steps.length, `${source} ${index}`).toBeGreaterThan(0);
        if (source === 'new') expect(steps).toContain('intro');
      }
    }
  });

  it('keeps the new-word rotation varied without the heard ones', () => {
    const shapes = new Set([0, 1, 2, 3].map((index) => stepsFor('new', index).join('+')));
    /*
     * The rotation is down to two checks now that the heard ones have gone, so
     * a beginner alternates between them rather than getting the same question
     * ten times — which is the defect §16 was about, and the one thing the
     * removal must not reintroduce.
     */
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('builds a full daily plan with sound off', () => {
    const plan = buildDailyPlan({
      progress: {},
      memory: {},
      corpus: VOCABULARY,
      goal: 10,
      soundFree: true,
      now: new Date('2026-02-01T09:00:00.000Z'),
    });
    expect(plan.words.length).toBe(10);
    for (const word of plan.words) {
      expect(word.steps).not.toContain('listen');
      expect(word.steps).not.toContain('listenMeaning');
      expect(word.steps.length).toBeGreaterThan(1);
    }
  });
});
