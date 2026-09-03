import { describe, expect, it } from 'vitest';

import { HOME, ROUTES, drawsBackControl, resolveBack, ruleFor } from './routePolicy';

/**
 * The back policy, route by route.
 *
 * The resolver is pure, so every route can be walked in every history and guard
 * state without a renderer — which is the point of having split the decision
 * out of `SystemBack`. What the component does with the answer is covered in
 * `SystemBack.test.tsx`; what a learner sees is covered by the end-to-end
 * `back-policy` spec. This file is the exhaustive one.
 */

const deep = { hasInAppHistory: false };
const walked = { hasInAppHistory: true };

/** One concrete pathname for every rule, so the table is exercised, not read. */
const SAMPLES: Record<string, string> = {
  '/': '/',
  '/letters': '/letters',
  '/letters/numbers': '/letters/numbers',
  '/letters/sounds': '/letters/sounds',
  '/letters/numbers/:lessonId': '/letters/numbers/num-lesson-sino-basics',
  '/letters/:lessonId': '/letters/lesson-vowels-core',
  '/words': '/words',
  '/words/today': '/words/today',
  '/words/category/:category': '/words/category/home',
  '/words/word/:wordId': '/words/word/word_eomma',
  '/words/dictionary/:headword': '/words/dictionary/%EC%97%84%EB%A7%88',
  '/words/saved': '/words/saved',
  '/review': '/review',
  '/review/mistakes': '/review/mistakes',
  '/review/session': '/review/session',
  '/me': '/me',
  '/me/activity': '/me/activity',
  '/me/level-test': '/me/level-test',
  '/me/language': '/me/language',
  '/me/privacy': '/me/privacy',
  '/me/legal': '/me/legal',
  '/dev/stroke-gallery': '/dev/stroke-gallery',
  '*': '/no-such-screen',
};

describe('the route inventory', () => {
  it('has a sample for every rule, so nothing in the table goes untested', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(ROUTES.map((r) => r.path).sort());
  });

  it('names exactly one Home and four other tab roots', () => {
    expect(ROUTES.filter((r) => r.kind === 'home').map((r) => r.path)).toEqual(['/']);
    expect(ROUTES.filter((r) => r.kind === 'tabRoot').map((r) => r.path)).toEqual([
      '/letters',
      '/words',
      '/review',
      '/me',
    ]);
  });

  it('gives everything but Home a parent to fall back to', () => {
    for (const rule of ROUTES) {
      if (rule.kind === 'home') expect(rule.parent).toBeUndefined();
      else expect(rule.parent, rule.path).toBeTruthy();
    }
  });

  it('resolves the specific patterns before the ones that would swallow them', () => {
    // `/letters/:lessonId` would match both of these if it were tried first.
    expect(ruleFor('/letters/numbers').path).toBe('/letters/numbers');
    expect(ruleFor('/letters/sounds').path).toBe('/letters/sounds');
    expect(ruleFor('/letters/numbers/num-lesson-zero').path).toBe('/letters/numbers/:lessonId');
    expect(ruleFor('/letters/lesson-vowels-core').path).toBe('/letters/:lessonId');
  });

  it('sends an unknown path to the catch-all rather than guessing', () => {
    expect(ruleFor('/nope/nope').path).toBe('*');
    expect(resolveBack('/nope/nope', deep)).toEqual({ action: 'replace', to: HOME });
  });
});

describe('the back control', () => {
  it('is drawn on every route except Home', () => {
    for (const [path, sample] of Object.entries(SAMPLES)) {
      expect(drawsBackControl(sample), path).toBe(path !== '/');
    }
  });
});

describe('back from Home', () => {
  it('offers to leave, whatever the learner walked through first', () => {
    expect(resolveBack('/', deep)).toEqual({ action: 'exit' });
    expect(resolveBack('/', walked)).toEqual({ action: 'exit' });
  });

  it('offers to leave even mid-guard, because Home owns no work', () => {
    expect(resolveBack('/', { hasInAppHistory: true, dirty: true })).toEqual({ action: 'exit' });
  });
});

describe('back from a bottom-tab root', () => {
  /*
   * The regression this pins: Words → Letters → Review used to walk back
   * through the chain one tab at a time. Every non-Home tab goes Home, in one
   * press, from any history state.
   */
  it.each(['/letters', '/words', '/review', '/me'])('%s goes straight Home, replacing', (tab) => {
    expect(resolveBack(tab, deep)).toEqual({ action: 'replace', to: HOME });
    expect(resolveBack(tab, walked)).toEqual({ action: 'replace', to: HOME });
  });
});

describe('back from a nested screen', () => {
  const nested = ROUTES.filter((r) => r.kind === 'nested');

  it('returns to the screen the learner came from when there is one', () => {
    for (const rule of nested) {
      expect(resolveBack(SAMPLES[rule.path]!, walked), rule.path).toEqual({ action: 'pop' });
    }
  });

  it('uses the declared parent for a deep link, where there is no history', () => {
    for (const rule of nested) {
      expect(resolveBack(SAMPLES[rule.path]!, deep), rule.path).toEqual({
        action: 'replace',
        to: rule.parent,
      });
    }
  });

  it('never asks a reference screen to confirm, even if a guard is left set', () => {
    for (const rule of nested) {
      const outcome = resolveBack(SAMPLES[rule.path]!, { hasInAppHistory: true, dirty: true });
      expect(outcome.action, rule.path).not.toBe('confirmLeave');
    }
  });
});

describe('back from a sitting', () => {
  const sessions = ROUTES.filter((r) => r.kind === 'session');

  it('returns to the context that owns it, not to whatever is behind', () => {
    for (const rule of sessions) {
      expect(resolveBack(SAMPLES[rule.path]!, walked), rule.path).toEqual({
        action: 'replace',
        to: rule.parent,
      });
    }
  });

  it("keeps Today's Vocabulary in the Words context even when opened from Home", () => {
    // Reachable from Home as well as from Words; popping would drop a learner
    // who started on Home back onto Home, mid-plan.
    expect(resolveBack('/words/today', walked)).toEqual({ action: 'replace', to: '/words' });
    expect(resolveBack('/words/today', deep)).toEqual({ action: 'replace', to: '/words' });
  });

  it('asks first when the screen says it has work in it', () => {
    expect(resolveBack('/me/level-test', { hasInAppHistory: true, dirty: true })).toEqual({
      action: 'confirmLeave',
      then: { action: 'replace', to: '/me' },
    });
  });

  it('does not ask when the screen says there is nothing to lose', () => {
    expect(resolveBack('/me/level-test', { hasInAppHistory: true, dirty: false })).toEqual({
      action: 'replace',
      to: '/me',
    });
  });
});

describe('the walk a learner actually takes', () => {
  it('never ping-pongs: no route resolves to a push', () => {
    for (const sample of Object.values(SAMPLES)) {
      for (const state of [deep, walked, { hasInAppHistory: true, dirty: true }]) {
        const outcome = resolveBack(sample, state);
        const final = outcome.action === 'confirmLeave' ? outcome.then : outcome;
        expect(['exit', 'pop', 'replace'], sample).toContain(final.action);
      }
    }
  });

  /*
   * Three, because the Numbers course is genuinely three deep: a lesson returns
   * to the lesson list, the list to Letters, Letters to Home. Every one of
   * those is a screen the learner recognises, which is the property being
   * pinned — Back always terminates at Home, and never in more presses than
   * there are meaningful screens above it.
   */
  it('reaches Home from every screen in at most three presses without history', () => {
    for (const sample of Object.values(SAMPLES)) {
      let at = sample;
      let presses = 0;
      while (at !== HOME && presses < 5) {
        const outcome = resolveBack(at, deep);
        const final = outcome.action === 'confirmLeave' ? outcome.then : outcome;
        if (final.action !== 'replace') break;
        at = final.to;
        presses += 1;
      }
      expect(at, sample).toBe(HOME);
      expect(presses, sample).toBeLessThanOrEqual(3);
    }
  });
});
