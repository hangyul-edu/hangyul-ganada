import { describe, expect, it } from 'vitest';

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

  it('leaves heard-only questions out of a review session', () => {
    const progress = learned('word', VOCABULARY.slice(0, 30).map((word) => word.id));
    const memory: MemoryMap = {};
    const now = new Date('2026-02-01T09:00:00.000Z');

    const ordinary = buildSession(progress, memory, now, { size: 20 });
    const quiet = buildSession(progress, memory, now, { size: 20, soundFree: true });

    // The premise: an ordinary session does contain them, so the second
    // assertion is measuring something.
    expect(ordinary.some((candidate) => needsHearing(candidate.mode))).toBe(true);
    expect(quiet.some((candidate) => needsHearing(candidate.mode))).toBe(false);
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
        const steps = stepsFor(source, index, true);
        expect(steps, `${source} ${index}`).not.toContain('listen');
        expect(steps, `${source} ${index}`).not.toContain('listenMeaning');
        // Never emptied. `intro` alone would be a word met and never checked.
        expect(steps.length, `${source} ${index}`).toBeGreaterThan(0);
        if (source === 'new') expect(steps).toContain('intro');
      }
    }
  });

  it('keeps the new-word rotation varied without the heard ones', () => {
    const shapes = new Set([0, 1, 2, 3].map((index) => stepsFor('new', index, true).join('+')));
    /*
     * Two of the four checks in the rotation are heard-only, so a sound-free
     * learner alternates between the other two rather than getting the same
     * question ten times — which is the defect §16 was about, and it would be a
     * poor trade to reintroduce it for the learners this setting is for.
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
