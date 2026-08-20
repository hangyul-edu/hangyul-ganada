import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { canAsk } from '../features/review/exercises';
import type { MemoryMap } from './memory';
import {
  SESSION_SIZE,
  buildSession,
  candidates,
  type ExerciseMode,
  type ReviewCandidate,
} from './review';

/**
 * One resolved practice plan, and the only thing any screen may count.
 *
 * ## The bug this module is
 *
 * Review said *8 questions*. Start opened an empty page.
 *
 * Both numbers were computed honestly and they were computed from different
 * things. The screen counted **candidates** — every item-and-skill the
 * scheduler considered worth asking. The session called `buildSession`, which
 * applies interleaving constraints the count knew nothing about, and then fed
 * each survivor to `buildExercise`, which returns `null` for anything it cannot
 * turn into a question: a word with no example sentence, a letter with fewer
 * than three plausible wrong answers, a confusion pair that sounds identical.
 * Every one of those dropped silently, and if the first one dropped, the
 * session screen rendered *Not found*.
 *
 * There is no threshold to tune here and no count to correct. The fix is that
 * there stops being two numbers:
 *
 * ```
 *                    resolvePlan()
 *                          │
 *              ┌───────────┴───────────┐
 *              ▼                       ▼
 *        Review screen           Review session
 *        shows plan.count        runs plan.items
 * ```
 *
 * A plan is *resolved*: every item in it has already been proved to produce a
 * question. `count` is `items.length` by construction rather than by agreement,
 * so the two cannot drift — and the session takes the plan it was handed rather
 * than building its own, so they cannot even be computed twice.
 *
 * ## Availability is decided once, before Start
 *
 * The screen knows before it draws the button whether there is anything to do,
 * and why not when there is not. `emptyReason` is that answer, and it is the
 * difference between a disabled button with a sentence under it and a button
 * that navigates into a dead end.
 */
/**
 * Where a plan came from, and therefore what it is for.
 *
 * §33 asks the resolved plan to carry this, and it earns its place: the same
 * eight questions mean different things depending on why they were chosen, and
 * the screen that started them says so. It is also what stops the three
 * entry points quietly becoming one — a saved-words session that silently
 * included due review would be a broken promise, not a helpful extra.
 */
export type PlanSource =
  /** The scheduler's own choice: what is fading, weak or recently missed. */
  | 'review'
  /** Only words the learner bookmarked. Their list, on request. */
  | 'saved'
  /** Only items with an unresolved mistake against them. */
  | 'mistakes'
  /** One exercise type, chosen by the learner on the Review screen. */
  | 'mode';

export interface PracticePlan {
  /**
   * What this plan is of. Not a random id: two resolutions of the same request
   * against the same profile produce the same plan, and this is what says so.
   */
  id: string;
  /** The questions, in the order they will be asked. Each one is answerable. */
  items: ReviewCandidate[];
  /** `items.length`. Present so a screen never has to recount. */
  count: number;
  /** The exercise types this plan actually contains. */
  modes: ExerciseMode[];
  /** Why these items. See `PlanSource`. */
  source: PlanSource;
  /** Why the plan is empty. `null` whenever `count > 0`. */
  emptyReason: EmptyReason | null;
}

/**
 * Why there is nothing to practise — a distinction the learner can act on.
 *
 * "Nothing due" is good news and means come back later. "This mode has nothing"
 * means pick another mode, and is the one that used to navigate into a blank
 * screen. "Nothing saved" means go and save something.
 */
export type EmptyReason = 'nothing-due' | 'mode-empty' | 'none-saved' | 'no-mistakes';

export interface PlanRequest {
  progress: Record<string, ItemProgress>;
  memory: MemoryMap;
  /** Memory keys of the learner's saved words. */
  saved: ReadonlySet<string>;
  now: Date;
  /** Restrict to one exercise type — the manual modes on the Review screen. */
  mode?: ExerciseMode;
  /** Restrict to saved words. */
  savedOnly?: boolean;
  /**
   * Items with an unresolved mistake, as a priority signal.
   *
   * Always passed, whatever the plan is for: a wrong answer raises an item's
   * urgency everywhere. `mistakesOnly` is the separate question of whether the
   * plan should contain *nothing else*.
   */
  mistakes?: ReadonlySet<string>;
  /** Restrict to items with an unresolved mistake. The notebook's own session. */
  mistakesOnly?: boolean;
  /** The learner practises without questions that must be heard. §36. */
  soundFree?: boolean;
  size?: number;
}

/**
 * Resolves a request into the plan that will actually be run.
 *
 * Pure. Given the same profile, the same request and the same day it returns
 * the same plan, which is what lets a screen show a plan and a session receive
 * it without either having to trust the other.
 *
 * The answerability filter is applied to the *candidate pool*, before the
 * session is built, rather than to the finished session. Filtering afterwards
 * would leave the interleaving rules — no item twice within three, no more than
 * two of a kind in a row — having spent their slots on candidates that were
 * then thrown away, and a plan of five where eight were available.
 */
export function resolvePlan(request: PlanRequest): PracticePlan {
  const {
    progress,
    memory,
    saved,
    now,
    mode,
    savedOnly,
    mistakes,
    mistakesOnly,
    size = SESSION_SIZE,
  } = request;

  /*
   * An empty restriction is still a restriction.
   *
   * `mistakesOnly` with no notebook must produce *nothing*, not everything.
   * Falling back to `undefined` here — which is what "no filter" means to
   * `buildSession` — turned "review my mistakes" on a clean record into a full
   * eight-question general review, which is the same class of bug as a Start
   * button that opens the wrong session.
   */
  const only = mistakesOnly
    ? (mistakes ?? new Set<string>())
    : savedOnly
      ? saved
      : undefined;
  const source: PlanSource = mistakesOnly
    ? 'mistakes'
    : savedOnly
      ? 'saved'
      : mode
        ? 'mode'
        : 'review';

  const options = {
    ...(mode ? { mode } : {}),
    ...(only ? { only } : {}),
    ...(mistakes ? { mistakes } : {}),
    ...(request.soundFree ? { soundFree: true } : {}),
    /*
     * Consolidation is allowed *into a session* and never *into a count*.
     *
     * §21 says do not review five hundred words because five hundred were
     * learned, and §23 says recently learned material worth consolidating is a
     * legitimate thing to review. Both are right, and they are about different
     * numbers.
     *
     * What made "500 to review" wrong was that it was a *headline*: a figure
     * that grew every time the learner learned something and could never be
     * finished. That number is `summarise`, and it counts memory need only.
     * This is a *session* — at most eight questions, of which the interleaving
     * rules already let no more than two break new ground — so including a
     * skill that has never been tested costs the learner nothing and is how
     * "I can read it" becomes "I know it".
     *
     * Items whose memory is settled are excluded either way, in `candidates`.
     */
    size,
    askable: canAsk,
  };

  const items = buildSession(progress, memory, now, options);
  const id = planId(request, items);

  if (items.length > 0) {
    return {
      id,
      items,
      count: items.length,
      modes: [...new Set(items.map((item) => item.mode))],
      source,
      emptyReason: null,
    };
  }

  return { id, items, count: 0, modes: [], source, emptyReason: whyEmpty(request) };
}

/**
 * Which of the three empty states this is.
 *
 * Asked only when the plan came back empty, and answered by widening the
 * request one restriction at a time — so "listening has nothing today" is
 * distinguished from "nothing has anything today" by checking whether dropping
 * the mode finds work.
 */
function whyEmpty(request: PlanRequest): EmptyReason {
  const { progress, memory, saved, now, mode, savedOnly, mistakes, mistakesOnly } = request;
  if (mistakesOnly) return 'no-mistakes';
  if (savedOnly && saved.size === 0) return 'none-saved';

  if (mode || savedOnly) {
    const anything = candidates(progress, memory, now, {
      ...(mistakes ? { mistakes } : {}),
    }).some(canAsk);
    if (anything) return savedOnly ? 'none-saved' : 'mode-empty';
  }
  return 'nothing-due';
}

/**
 * A stable name for a plan.
 *
 * Composed of what was asked for and what came back, so that a screen handing a
 * plan to a session can assert it is running the plan it was shown rather than
 * one that was rebuilt underneath it. Not a hash of the profile: the point is
 * to catch a *different plan*, and two plans with the same request and the same
 * items are the same plan whatever the profile did in between.
 */
function planId(request: PlanRequest, items: ReviewCandidate[]): string {
  const scope = `${request.mode ?? 'auto'}:${
    request.mistakesOnly ? 'mistakes' : request.savedOnly ? 'saved' : 'all'
  }`;
  const body = items.map((item) => `${item.kind}/${item.itemKey}/${item.skill}`).join(',');
  return `${scope}|${items.length}|${body}`;
}

/**
 * Which of the manual modes have anything behind them today.
 *
 * The Review screen asks this so it can offer three buttons that all work,
 * rather than three buttons of which one leads nowhere. Resolving three plans
 * to draw three buttons is a pass over the profile per mode; at the size of a
 * learner's profile that is microseconds, and the alternative is the bug.
 */
export function modeAvailability(
  request: Omit<PlanRequest, 'mode'>,
  modes: readonly ExerciseMode[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mode of modes) out[mode] = resolvePlan({ ...request, mode }).count;
  return out;
}
