/**
 * The count on the screen is the session behind the button.
 *
 * This is the regression test for the defect that made a resolved plan
 * necessary: Review said *8 questions*, Start opened a page reading "not
 * found", and both numbers were honest computations of different things. Every
 * assertion below is a way for those two to come apart again.
 *
 * The corpus is the real one, not a fixture, because the failure was caused by
 * data — a word with no example sentence, a letter with too few plausible wrong
 * answers — and a fixture would have had neither.
 */
import { describe, expect, it } from 'vitest';
import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { VOCABULARY } from '../data/vocabulary';
import { ALL_CHARACTERS } from '../data/characters';
import { buildExercise, canAsk } from '../features/review/exercises';
import { applyReview, type MemoryMap } from './memory';
import { modeAvailability, resolvePlan, type PlanRequest } from './plan';
import { summarise } from './review';
import { blankProgress } from '../storage/schema';

const NOW = new Date('2026-05-04T09:00:00.000Z');

const meaningOf = (word: (typeof VOCABULARY)[number]) => ({
  value: word.translations?.en?.meaning ?? word.word,
  locale: 'en',
});

/** A profile in which everything named has been met and is therefore reviewable. */
function profile(...items: Array<[ItemProgress['kind'], string]>): Record<string, ItemProgress> {
  const rows: Record<string, ItemProgress> = {};
  for (const [kind, key] of items) {
    rows[`${kind}:${key}`] = {
      ...blankProgress(kind, key, NOW.toISOString()),
      stage: 'learned',
      attempts: 3,
      passes: 3,
    };
  }
  return rows;
}

function request(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    progress: {},
    memory: {},
    saved: new Set(),
    now: NOW,
    ...overrides,
  };
}

/** Every character the curriculum teaches, and a broad slice of the corpus. */
const EVERYTHING = profile(
  ...ALL_CHARACTERS.map((c) => ['character', c.character] as [ItemProgress['kind'], string]),
  ...VOCABULARY.slice(0, 300).map(
    (w) => ['word', w.id] as [ItemProgress['kind'], string],
  ),
);

describe('a resolved practice plan', () => {
  it('counts exactly what it contains', () => {
    const plan = resolvePlan(request({ progress: EVERYTHING }));
    expect(plan.count).toBe(plan.items.length);
    expect(plan.count).toBeGreaterThan(0);
  });

  it('contains only questions that can actually be built', () => {
    // The defect, stated directly. Every item in a plan must survive the
    // question generator — otherwise the session drops it, the count is a lie,
    // and if the *first* one drops the whole session renders as not-found.
    for (const scope of [{}, { mode: 'read' as const }, { mode: 'listen' as const }, { mode: 'write' as const }]) {
      const plan = resolvePlan(request({ progress: EVERYTHING, ...scope }));
      for (const item of plan.items) {
        expect(canAsk(item), `${item.kind} ${item.itemKey} ${item.mode}`).toBe(true);
        expect(
          buildExercise(item, meaningOf, 1),
          `${item.kind} ${item.itemKey} ${item.mode} produced no question`,
        ).not.toBeNull();
      }
    }
  });

  it('is stable: the same request twice is the same plan', () => {
    // What lets a screen show a plan and a session run it without either having
    // to trust the other.
    const a = resolvePlan(request({ progress: EVERYTHING }));
    const b = resolvePlan(request({ progress: EVERYTHING }));
    expect(b.id).toBe(a.id);
    expect(b.items.map((i) => `${i.itemKey}:${i.skill}`)).toEqual(
      a.items.map((i) => `${i.itemKey}:${i.skill}`),
    );
  });

  it('never puts a word in a writing plan', () => {
    // §7 and §46: writing review is Hangul formation only. The scheduler cannot
    // reach it — a word has no writing skill — and this is the assertion that
    // says so from the outside.
    const plan = resolvePlan(request({ progress: EVERYTHING, mode: 'write' }));
    for (const item of plan.items) {
      expect(item.kind, `${item.itemKey} was offered as a word to write`).toBe('character');
    }
  });

  it('never puts a word-writing exercise anywhere at all', () => {
    const plan = resolvePlan(request({ progress: EVERYTHING }));
    for (const item of plan.items) {
      expect(item.mode === 'write' && item.kind === 'word').toBe(false);
    }
  });

  it('reports an empty plan rather than an empty session', () => {
    // The empty states are distinguished, because the learner can act on the
    // difference: come back later, choose another mode, go and save something.
    const fresh = resolvePlan(request());
    expect(fresh.count).toBe(0);
    expect(fresh.emptyReason).toBe('nothing-due');

    const nothingSaved = resolvePlan(request({ progress: EVERYTHING, savedOnly: true }));
    expect(nothingSaved.count).toBe(0);
    expect(nothingSaved.emptyReason).toBe('none-saved');
  });

  it('honours a saved-words scope', () => {
    const saved = new Set([`word:${VOCABULARY[0]!.id}`]);
    const plan = resolvePlan(request({ progress: EVERYTHING, saved, savedOnly: true }));
    expect(plan.count).toBeGreaterThan(0);
    for (const item of plan.items) {
      expect(`${item.kind}:${item.itemKey}`).toBe(`word:${VOCABULARY[0]!.id}`);
    }
  });

  it('keeps a single-mode plan to that mode', () => {
    for (const mode of ['read', 'listen', 'write'] as const) {
      const plan = resolvePlan(request({ progress: EVERYTHING, mode }));
      for (const item of plan.items) expect(item.mode).toBe(mode);
      if (plan.count > 0) expect(plan.modes).toEqual([mode]);
    }
  });

  it('tells the screen which modes lead somewhere before it draws the buttons', () => {
    const counts = modeAvailability(request({ progress: EVERYTHING }), ['read', 'listen', 'write']);
    for (const [mode, count] of Object.entries(counts)) {
      const plan = resolvePlan(request({ progress: EVERYTHING, mode: mode as 'read' }));
      // The number beside the button and the session it opens.
      expect(count).toBe(plan.count);
    }
  });

  it('does not offer a first-launch learner anything to review', () => {
    // Review keeps what was taught. A learner who has met nothing has nothing
    // to keep, and a Start button here would open on nothing.
    expect(resolvePlan(request()).count).toBe(0);
  });

  it('does not count an item that was only ever displayed', () => {
    const seen = profile();
    seen['character:ㄱ'] = {
      ...blankProgress('character', 'ㄱ', NOW.toISOString()),
      stage: 'introduced',
      attempts: 0,
    };
    expect(resolvePlan(request({ progress: seen })).count).toBe(0);
  });

  it('does not review something just because it was learned', () => {
    /*
     * §21, which is the rule this whole gate exists for.
     *
     * A learner who has answered five hundred words correctly and recently has
     * nothing to review. The old scheduler offered every skill of every item
     * ever met, so the Review screen's figure grew with the catalogue and could
     * never be finished — a to-do list that lengthens every time you do
     * something.
     */
    const learned = profile(
      ...VOCABULARY.slice(0, 60).map((w) => ['word', w.id] as [ItemProgress['kind'], string]),
    );
    const holding: MemoryMap = {};
    for (const word of VOCABULARY.slice(0, 60)) {
      // Answered right, an hour ago, and holding.
      holding[`word:${word.id}`] = applyReview(
        undefined,
        'word',
        word.id,
        { skill: 'meaning_recognition', passed: true, score: 1 },
        new Date(NOW.getTime() - 3_600_000),
      );
    }

    const summary = summarise(learned, holding, new Set(), NOW, canAsk);
    expect(summary.needsPractice + summary.dueToday, 'nothing is fading yet').toBe(0);

    // …and the same skill, three weeks later, is worth asking about again.
    const later = new Date(NOW.getTime() + 21 * 86_400_000);
    expect(summarise(learned, holding, new Set(), later, canAsk).total).toBeGreaterThan(0);
  });

  it('puts a recent mistake ahead of a merely fading memory', () => {
    // §23 and §25. What the learner just got wrong outranks what is quietly
    // sliding, because it is the thing they were surprised by.
    const items = profile(['word', VOCABULARY[0]!.id], ['word', VOCABULARY[1]!.id]);
    const fading: MemoryMap = {};
    for (const word of VOCABULARY.slice(0, 2)) {
      fading[`word:${word.id}`] = applyReview(
        undefined,
        'word',
        word.id,
        { skill: 'meaning_recognition', passed: true, score: 1 },
        new Date(NOW.getTime() - 20 * 86_400_000),
      );
    }

    const plan = resolvePlan(
      request({
        progress: items,
        memory: fading,
        mistakes: new Set([`word:${VOCABULARY[1]!.id}`]),
      }),
    );
    expect(plan.items[0]!.itemKey).toBe(VOCABULARY[1]!.id);
    expect(plan.items[0]!.need).toBe('wrong');
  });

  it('keeps a session short however much is due', () => {
    // §26. A learner returning after a fortnight has ninety things due, and a
    // screen offering ninety is a screen they close. What is left over is still
    // there tomorrow, and more urgent then.
    const many = profile(
      ...VOCABULARY.slice(0, 200).map((w) => ['word', w.id] as [ItemProgress['kind'], string]),
    );
    const stale: MemoryMap = {};
    for (const word of VOCABULARY.slice(0, 200)) {
      stale[`word:${word.id}`] = applyReview(
        undefined,
        'word',
        word.id,
        { skill: 'meaning_recognition', passed: true, score: 1 },
        new Date(NOW.getTime() - 60 * 86_400_000),
      );
    }
    const plan = resolvePlan(request({ progress: many, memory: stale }));
    expect(plan.count).toBeLessThanOrEqual(10);
    expect(plan.count).toBeGreaterThan(0);
  });

  it('varies the question types rather than asking the same one eight times', () => {
    // §27. Eight multiple-choice meaning questions in a row is a form, not a
    // lesson.
    const plan = resolvePlan(request({ progress: EVERYTHING }));
    expect(plan.modes.length).toBeGreaterThan(1);
  });

  it('does not ask about the same item twice in a row', () => {
    // §28. Spacing is what makes a second attempt a retrieval rather than a
    // recollection of the previous screen.
    const plan = resolvePlan(request({ progress: EVERYTHING }));
    for (let i = 1; i < plan.items.length; i += 1) {
      expect(plan.items[i]!.itemKey).not.toBe(plan.items[i - 1]!.itemKey);
    }
  });

  it('names where it came from', () => {
    // §33. The same eight questions mean different things depending on why they
    // were chosen, and the screen that started them says so.
    expect(resolvePlan(request({ progress: EVERYTHING })).source).toBe('review');
    expect(resolvePlan(request({ progress: EVERYTHING, mode: 'read' })).source).toBe('mode');
    const saved = new Set([`word:${VOCABULARY[0]!.id}`]);
    expect(resolvePlan(request({ progress: EVERYTHING, saved, savedOnly: true })).source).toBe(
      'saved',
    );
    expect(
      resolvePlan(request({ progress: EVERYTHING, mistakes: saved, mistakesOnly: true })).source,
    ).toBe('mistakes');
  });

  it('builds a mistakes-only session from the notebook', () => {
    // §40. A short session drawn from what actually went wrong — and drawn from
    // the *item*, so it can be asked a different way than it was missed.
    const mistakes = new Set([`word:${VOCABULARY[0]!.id}`, `word:${VOCABULARY[1]!.id}`]);
    const plan = resolvePlan(request({ progress: EVERYTHING, mistakes, mistakesOnly: true }));
    expect(plan.count).toBeGreaterThan(0);
    for (const item of plan.items) expect(mistakes.has(`${item.kind}:${item.itemKey}`)).toBe(true);
  });

  it('says so when the notebook is empty rather than opening an empty session', () => {
    const plan = resolvePlan(request({ progress: EVERYTHING, mistakesOnly: true }));
    expect(plan.count).toBe(0);
    expect(plan.emptyReason).toBe('no-mistakes');
  });

  it('respects the requested size', () => {
    const plan = resolvePlan(request({ progress: EVERYTHING, size: 4 }));
    expect(plan.count).toBeLessThanOrEqual(4);
  });
});

/**
 * No word is ever asked by ear, on any path into a session.
 *
 * The rule is §36 and it is already true structurally — `WORD_SKILLS` has no
 * listening skill, `listening_recognition` sits in `DEPRECATED_SKILLS` so
 * `skillsFor('word')` cannot return it, and `wordExercise` has no `listen` or
 * `listenMeaning` arm to fall into. Three separate things have to stay true,
 * none of them is local to the other two, and a scheduler is exactly the kind
 * of code where a skill list grows back.
 *
 * So this asserts the *outcome* rather than any one of the three: whatever a
 * learner's profile looks like and whichever screen resolved the plan, no item
 * in it is a word that has to be heard. `resolvePlan` is the single door — the
 * Review screen's Start, its three manual modes, saved-word practice and the
 * mistakes notebook all come through it — which is why the lock belongs here
 * and not on any one caller.
 *
 * The listening question that survives is the letter one, and it is meant to.
 * `sound_recognition` belongs to the Hangul curriculum: a clip and four letters
 * is how you find out whether somebody can hear the difference between ㅐ and
 * ㅔ, and there is no way to ask that on paper. Vocabulary is what stopped
 * being tested by ear, and the audio itself never went anywhere — every word
 * still plays in Word Detail, in its introduction and beside its example
 * sentence. See `WORD_SKILLS` in `domain/memory.ts`.
 */
describe('vocabulary is never tested by ear', () => {
  const HEARD = ['listen', 'listenMeaning'] as const;

  /** Every shape of request a screen in the product can make. */
  const SCOPES: Array<[string, Partial<PlanRequest>]> = [
    ['review', {}],
    ['mode: read', { mode: 'read' }],
    ['mode: listen', { mode: 'listen' }],
    ['mode: write', { mode: 'write' }],
    ['saved words', { savedOnly: true }],
    ['mistakes notebook', { mistakesOnly: true }],
    ['sound-free', { soundFree: true }],
  ];

  const keys = new Set(VOCABULARY.slice(0, 300).map((w) => `word:${w.id}`));

  for (const [name, scope] of SCOPES) {
    it(`resolves no listening word from ${name}`, () => {
      const plan = resolvePlan(
        request({ progress: EVERYTHING, saved: keys, mistakes: keys, ...scope }),
      );
      for (const item of plan.items) {
        if (item.kind !== 'word') continue;
        expect(HEARD, `${item.itemKey} was scheduled as ${item.mode}`).not.toContain(item.mode);
        expect(item.skill, `${item.itemKey}`).not.toBe('listening_recognition');
      }
    });
  }

  it('offers a listening plan made only of letters', () => {
    // The Listening button on the Review screen still leads somewhere — it is
    // the Hangul drill — and what it leads to contains no vocabulary at all.
    const plan = resolvePlan(request({ progress: EVERYTHING, mode: 'listen' }));
    expect(plan.count).toBeGreaterThan(0);
    for (const item of plan.items) expect(item.kind).toBe('character');
  });

  it('refuses to build one even when handed the candidate directly', () => {
    // The belt to the scheduler's braces. Nothing in the app constructs a
    // candidate by hand, but a future caller that did would get no question
    // rather than a word with its spelling hidden behind a play button.
    for (const word of VOCABULARY.slice(0, 40)) {
      for (const mode of HEARD) {
        const exercise = buildExercise(
          {
            kind: 'word',
            itemKey: word.id,
            skill: 'meaning_recognition',
            mode,
            priority: 1,
            recall: 0.5,
            partner: null,
            intervene: false,
            need: 'due',
          },
          meaningOf,
          1,
        );
        expect(exercise, `${word.id} ${mode}`).toBeNull();
      }
    }
  });
});
