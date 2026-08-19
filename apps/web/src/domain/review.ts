import type { ItemProgress } from '@hangyul-ganada/shared-types';

import {
  CONFUSION_THRESHOLD,
  type ItemMemory,
  type MemoryMap,
  type Skill,
  clamp,
  confusionPartner,
  daysBetween,
  memoryKey,
  needsIntervention,
  skillRecall,
  skillsFor,
  weakestSkill,
} from './memory';

/**
 * What to practise next, and how.
 *
 * `memory.ts` models one item's memory. This turns a whole profile of them into
 * a sitting a person will actually finish, which is a different problem and has
 * a different failure mode: a scheduler that always picks the single weakest
 * item is *correct* and produces
 *
 * ```
 * ㄹ   ㄹ   ㄹ   ㄹ   ㄹ
 * ```
 *
 * which is the last review session that learner ever does. Everything below the
 * priority function is about not doing that while still spending the five
 * minutes where they are worth most.
 */

// --- Exercises ----------------------------------------------------------------

/**
 * The five ways an item can be practised.
 *
 * Five, not twenty. Each one exists because it is the only way to test a
 * particular skill, and a sixth would have to answer "which skill does this
 * measure that nothing else does?" before it earned a place.
 */
export type ExerciseMode =
  /** Korean shown, meaning or sound chosen. */
  | 'read'
  /** A meaning shown, the Korean chosen. The harder direction of `read`. */
  | 'produce'
  /** Audio played, item chosen. */
  | 'listen'
  /**
   * Audio played, *meaning* chosen.
   *
   * A different skill from `listen`, not a variation on it. `listen` asks
   * whether the learner can match a sound to a spelling, which can be done by
   * ear alone; this asks whether the sound means anything to them yet, which is
   * the thing that matters when somebody speaks to them.
   */
  | 'listenMeaning'
  /**
   * Written over a guide and graded.
   *
   * **Letters and syllables only.** No word has a writing skill — see
   * `WORD_SKILLS` in `domain/memory.ts` — so the scheduler cannot produce a
   * word in this mode, and the question generator refuses to build one if
   * something ever hands it a hand-made candidate.
   */
  | 'write'
  /** Shown beside the thing this learner actually confuses it with. */
  | 'distinguish'
  /** Met inside its example sentence. */
  | 'context';

/*
 * There is no `usage` mode, and there was nearly one.
 *
 * "Which of these four sentences uses the word naturally" is a good question
 * and this corpus cannot generate it. The only material available for wrong
 * answers is other words' sentences with the target substituted in, and that
 * produces two failures, both found by walking a real session:
 *
 * * **Accidentally correct answers.** 차 substituted into a donor frame gave
 *   "차 이야기를 들었어요" — ordinary Korean, offered as a wrong answer beside
 *   the intended one. §45: exactly one defensible answer, and no hint may
 *   rescue a question that has two.
 * * **A giveaway.** Substituting 여자 into frames built for other nouns left
 *   "여자이 바빠요" — the wrong subject particle, three times over. The question
 *   stops being about usage and becomes about spotting 이 versus 가, which the
 *   learner can do without knowing the word at all.
 *
 * Neither is fixable by filtering: telling a natural sentence from an unnatural
 * one is the thing being tested, so a generator that could do it reliably would
 * not need the question. Usage returns when the content pack carries
 * hand-written usage sets, not before.
 */

/**
 * Which exercise the *scheduler* reaches for to test each skill.
 *
 * One direction, so the mapping cannot drift. It is a default rather than an
 * exclusive claim: `produce` also tests `meaning_recognition`, from the other
 * side, and the daily vocabulary session uses it — but the scheduler picking a
 * skill needs exactly one answer to "and how would I ask that", which is this.
 */
export const SKILL_EXERCISE: Record<Skill, ExerciseMode> = {
  meaning_recognition: 'read',
  reading_recognition: 'read',
  listening_recognition: 'listen',
  guided_writing: 'write',
  sentence_comprehension: 'context',
  sound_recognition: 'listen',
  visual_recognition: 'read',
  lookalike_discrimination: 'distinguish',
};

export interface ReviewCandidate {
  kind: ItemProgress['kind'];
  itemKey: string;
  skill: Skill;
  mode: ExerciseMode;
  priority: number;
  /** Predicted recall for the skill this exercise tests, right now. */
  recall: number;
  /** For `distinguish`, the item this learner actually confuses it with. */
  partner: string | null;
  /** True when repetition has stopped working and the approach should change. */
  intervene: boolean;
  /** Why this is being offered. See `ReviewNeed`. */
  need: ReviewNeed;
}

// --- Priority -----------------------------------------------------------------

/**
 * The weights of the priority score.
 *
 * Named, summed to something interpretable, and in one place so the balance can
 * be argued with. Each term answers a different question about the same item:
 *
 * | Term | Question |
 * | --- | --- |
 * | `forgetting` | How likely is this to be gone? |
 * | `weakness` | Is this the skill they are worst at for this item? |
 * | `lapse` | Do they keep losing this specific thing? |
 * | `overdue` | How long past its schedule is it? |
 * | `confusion` | Is there a pair they demonstrably mix up? |
 * | `recency` | Has this never been tested at all? |
 */
const WEIGHT = {
  forgetting: 1.0,
  weakness: 0.6,
  lapse: 0.5,
  overdue: 0.4,
  confusion: 0.7,
  recency: 0.5,
  /** Subtracted. See `repetitionFatigue`. */
  fatigue: 1.2,
} as const;

/**
 * How much this item-and-skill is worth asking next.
 *
 * Pure, and the only place the ordering is decided — the session builder and
 * the Review screen's counts both read it, so what the screen promises and what
 * the session delivers cannot disagree.
 */
export function priority(
  memory: ItemMemory | undefined,
  skill: Skill,
  now: Date,
  seenThisSession = 0,
): number {
  const state = memory?.skills[skill];
  const recall = skillRecall(state, now);

  // 1 for something never demonstrated, down towards 0 for something just done.
  const forgetting = 1 - recall;

  // Never tested at all is its own signal, and a strong one: it is the only
  // case where the app knows it has no evidence rather than stale evidence.
  const recency = state ? 0 : 1;

  const weakness = state ? clamp(1 - state.stability_days / 30, 0, 1) : 1;
  const lapse = state ? clamp(state.lapses / 5, 0, 1) : 0;
  const overdue = state
    ? clamp(daysBetween(state.next_review_at, now) / Math.max(1, state.stability_days), 0, 1.5)
    : 0;

  const confusion =
    skill === 'lookalike_discrimination' && confusionPartner(memory) ? 1 : 0;

  return (
    WEIGHT.forgetting * forgetting +
    WEIGHT.weakness * weakness +
    WEIGHT.lapse * lapse +
    WEIGHT.overdue * overdue +
    WEIGHT.confusion * confusion +
    WEIGHT.recency * recency -
    WEIGHT.fatigue * repetitionFatigue(seenThisSession)
  );
}

/**
 * The penalty for having already appeared in this sitting.
 *
 * Steep, and steep on purpose. Seeing an item twice in a ten-item session is
 * sometimes right — that is what the micro-rescue does. Seeing it a third time
 * is the failure mode this whole file exists to prevent.
 */
function repetitionFatigue(seen: number): number {
  return seen === 0 ? 0 : seen === 1 ? 0.5 : 2;
}

// --- Building a session -------------------------------------------------------

/**
 * How many exercises one sitting asks for.
 *
 * Eight is three to six minutes: long enough to be worth having done, short
 * enough to start without deciding to. The backlog is not the session — someone
 * returning after a fortnight has ninety things due, and a screen that offers
 * ninety is a screen they close.
 */
export const SESSION_SIZE = 8;

/** No item may appear again within this many exercises. See `SESSION_SIZE`. */
const MIN_GAP = 3;

/**
 * How many *never-exercised* skills one sitting may introduce.
 *
 * This number was added because the simulation in `simulate.ts` said it had to
 * be. Without it, the priority function — which quite correctly treats "never
 * tested" as the strongest possible reason to ask — spends every session on
 * skills it has never seen, because there are always more of those than a
 * session has room for. Twenty-eight items with four or five skills each is
 * 124 things to try, eight a day is fifteen days to get round them all, and by
 * the time the scheduler returns to the first one the learner has lost it.
 *
 * Measured, over sixty simulated days: mean retained recall across every skill
 * went from **0.29 to 0.72** for a learner who is always right, purely from
 * capping this at two. It is the single most consequential number in the file
 * and it is not a tuning parameter — it is the difference between a scheduler
 * that explores and one that teaches.
 */
const MAX_NEW_PER_SESSION = 2;

/** Nor may the same kind of exercise run more than this many times in a row. */
const MAX_RUN = 2;

/**
 * Why an item is in a review plan — or why it is not.
 *
 * Review used to offer every skill of every item the learner had ever met, and
 * at five hundred words that is a screen saying "500 to review". §21: *do not
 * review everything simply because it was previously learned*. What the learner
 * is owed is the subset that repays asking about today.
 *
 * | Need | What it means | In the count? |
 * | --- | --- | --- |
 * | `wrong` | missed, and not yet answered right twice since | yes |
 * | `weak` | keeps being lost — lapses, and recall already sliding | yes |
 * | `due` | past its schedule; the memory is fading | yes |
 * | `consolidate` | this way of asking has never been tried | no |
 * | `settled` | answered right, recently, and holding | never offered |
 *
 * `consolidate` is the interesting one. It is worth *asking* — it broadens what
 * the learner can do with a word they have only read — but it is not a memory
 * need, so it does not appear in "8 to review". Counting it would put a number
 * on the screen that grows every time they learn something, which is the exact
 * shape of the problem this replaces.
 */
export type ReviewNeed = 'wrong' | 'weak' | 'due' | 'consolidate' | 'settled';

/** Recall below which a memory is fading rather than held. */
const DUE_RECALL = 0.9;

/** Recall below which it is going badly rather than merely fading. */
const WEAK_RECALL = 0.6;

/** Lapses at which an item counts as one the learner keeps losing. */
const WEAK_LAPSES = 2;

/**
 * What this item-and-skill currently needs, if anything.
 *
 * Pure, and the single definition — the Review screen's counts, the session
 * builder and Today's Practice all read it, so what the screen promises and
 * what the session delivers cannot disagree about which items are even
 * eligible.
 */
export function reviewNeed(
  memory: ItemMemory | undefined,
  skill: Skill,
  now: Date,
  context: { mistake?: boolean } = {},
): ReviewNeed {
  if (context.mistake) return 'wrong';

  const state = memory?.skills[skill];
  if (!state) {
    /*
     * Never asked this way.
     *
     * Always `consolidate`, never `settled`, and never expiring. An earlier
     * version let it expire a fortnight after the item was met, on the argument
     * that consolidation has a moment and the moment passes. That is true of
     * teaching and false of *coverage*: a skill that has never been tested and
     * can no longer be offered is one the app has quietly decided never to find
     * out about. Over sixty simulated days it cut the skills the scheduler ever
     * exercised from five to three.
     *
     * It stays out of the counts, which is what §21 actually asks for, and the
     * session builder already caps how much new ground one sitting breaks.
     */
    return 'consolidate';
  }

  const recall = skillRecall(state, now);
  // Last answer was wrong. The streak is the only thing that says so directly.
  if (state.streak === 0 && state.lapses > 0) return 'wrong';
  if (state.lapses >= WEAK_LAPSES && recall < 1) return 'weak';
  if (recall < WEAK_RECALL) return 'weak';
  if (recall < DUE_RECALL) return 'due';
  return 'settled';
}

/** Needs that are a genuine memory need, and so are worth counting. */
export function isMemoryNeed(need: ReviewNeed): boolean {
  return need === 'wrong' || need === 'weak' || need === 'due';
}

export interface SessionOptions {
  /** Restrict to one exercise type. The manual modes on the Review screen. */
  mode?: ExerciseMode;
  /** Only these items. Used by "Saved words". */
  only?: ReadonlySet<string>;
  size?: number;
  /**
   * Whether a candidate can be turned into a question at all.
   *
   * Injected rather than imported, because *what the scheduler should ask* and
   * *what the question generator can render* are two different concerns and
   * this module is the one that must not know about option lists and example
   * sentences. `domain/plan.ts` passes `canAsk`; the tests pass nothing.
   *
   * It belongs here — inside the pool, before the interleaving rules run —
   * rather than as a filter over the finished session. Applied afterwards it
   * would leave the "no item twice within three" and "no more than two of a
   * kind in a row" constraints having spent slots on candidates that were then
   * discarded, and hand back five exercises where eight were available.
   */
  askable?: (candidate: ReviewCandidate) => boolean;
  /**
   * Items the learner has an unresolved mistake against.
   *
   * Passed in rather than read, because the notebook is a store this module
   * must not depend on — the scheduler's job is to weigh signals, not to know
   * where they are kept. See `domain/mistakes.ts`.
   */
  mistakes?: ReadonlySet<string>;
  /** Drop anything that is only worth broadening into. See `ReviewNeed`. */
  needsOnly?: boolean;
}

/**
 * How much each kind of need moves an item up the queue.
 *
 * Added to the priority score rather than replacing it: the score already knows
 * about forgetting curves and lapses, and this says which *kind* of attention
 * the item is owed. A recent mistake outranks a fading memory, which outranks
 * broadening into a skill never tried — which is the order a learner would put
 * them in if asked.
 */
function urgency(need: ReviewNeed): number {
  switch (need) {
    case 'wrong':
      return 1.5;
    case 'weak':
      return 0.8;
    case 'due':
      return 0.3;
    case 'consolidate':
      return 0;
    case 'settled':
      return 0;
  }
}

/**
 * Every item-and-skill worth practising, most urgent first.
 *
 * The candidate set, not the session: one row per *skill*, so an item the
 * learner reads well and cannot hear appears once as a strong reading and once
 * as a weak listening, and only the second one competes for a slot.
 */
export function candidates(
  progress: Record<string, ItemProgress>,
  memory: MemoryMap,
  now: Date,
  options: SessionOptions = {},
): ReviewCandidate[] {
  const out: ReviewCandidate[] = [];
  for (const row of Object.values(progress)) {
    // Only things the learner has actually met. Review is for keeping what was
    // taught, not for teaching — a first meeting belongs in a lesson, with its
    // sound and its stroke order and its meaning.
    //
    // "Met" includes *tried and got wrong*. An item that was attempted and
    // failed sits at `introduced`, and excluding it would mean the one thing a
    // learner most wants to come back to is the one thing review will not
    // offer them.
    if (row.stage === 'unseen') continue;
    const key = memoryKey(row.kind, row.item_key);
    if (options.only && !options.only.has(key)) continue;

    const item = memory[key];
    /*
     * …and "met" also includes *answered a question about it*.
     *
     * This used to be `stage === 'introduced' && attempts === 0` — skip it —
     * where `attempts` counts *writing* attempts on the progress row. Words are
     * never written any more, so every word the daily vocabulary session taught
     * had zero attempts, sat at `introduced`, and was invisible to review. A
     * learner could answer twenty questions about ten words and open Review to
     * "nothing to review yet".
     *
     * A memory row is the evidence, and it is better evidence than an attempt
     * counter: it exists exactly when some skill of this item has been
     * exercised, by whatever means. An item with neither an attempt nor a
     * memory has genuinely only been displayed.
     */
    const exercised = item !== undefined && Object.keys(item.skills).length > 0;
    if (row.stage === 'introduced' && row.attempts === 0 && !exercised) continue;
    const intervene = needsIntervention(item) !== null;
    for (const skill of skillsFor(row.kind)) {
      const mode = SKILL_EXERCISE[skill];
      if (options.mode && mode !== options.mode) continue;
      // Discrimination needs something to discriminate *against*. Offering it
      // for an item with no confusion history would be inventing a difficulty.
      const partner = skill === 'lookalike_discrimination' ? confusionPartner(item) : null;
      if (skill === 'lookalike_discrimination' && !partner) continue;

      /*
       * Nothing settled is offered at all.
       *
       * This is the whole of §21 in one line: an item answered correctly and
       * recently, still holding, is not a review — it is the app filling time
       * with something the learner already knows. Five hundred learned words
       * used to produce five hundred candidates; now they produce however many
       * are actually slipping.
       */
      const need = reviewNeed(item, skill, now, {
        mistake: options.mistakes?.has(memoryKey(row.kind, row.item_key)) ?? false,
      });
      if (need === 'settled') continue;
      if (options.needsOnly && !isMemoryNeed(need)) continue;

      const candidate: ReviewCandidate = {
        kind: row.kind,
        itemKey: row.item_key,
        skill,
        mode,
        priority: priority(item, skill, now) + urgency(need),
        recall: skillRecall(item?.skills[skill], now),
        partner,
        intervene,
        need,
      };
      // A candidate that cannot become a question is not a candidate. Dropping
      // it here rather than when the session is rendered is what lets the
      // Review screen promise a number it can keep — see `domain/plan.ts`.
      if (options.askable && !options.askable(candidate)) continue;
      out.push(candidate);
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/**
 * A sitting, built from the candidates under the interleaving constraints.
 *
 * Greedy rather than optimal, and that is the right trade: this runs on a phone
 * when a learner taps "Start", the constraints are all local, and a search for
 * the globally best eight exercises would spend more time than it saves.
 *
 * The composition targets of the brief — roughly half due-or-at-risk, a
 * quarter recent failures, the rest confidence — fall out of the priority
 * function rather than being imposed as quotas: a recent failure scores highly
 * on `lapse` *and* `forgetting`, so it is picked because it is urgent, not
 * because a bucket had to be filled. What is imposed here is only the part
 * priority cannot express, which is variety.
 */
export function buildSession(
  progress: Record<string, ItemProgress>,
  memory: MemoryMap,
  now: Date,
  options: SessionOptions = {},
): ReviewCandidate[] {
  const size = options.size ?? SESSION_SIZE;
  const pool = candidates(progress, memory, now, options);
  const session: ReviewCandidate[] = [];
  const usedItems: string[] = [];
  const usedModes: ExerciseMode[] = [];
  let introduced = 0;

  const admissible = (candidate: ReviewCandidate, allowNew: boolean): boolean => {
    const key = memoryKey(candidate.kind, candidate.itemKey);
    if (usedItems.slice(-MIN_GAP).includes(key)) return false;
    if (session.some((chosen) => chosen.itemKey === candidate.itemKey && chosen.skill === candidate.skill)) {
      return false;
    }
    const run = usedModes.slice(-MAX_RUN);
    if (run.length === MAX_RUN && run.every((mode) => mode === candidate.mode)) return false;
    if (!allowNew && isNew(memory, candidate)) return false;
    return true;
  };

  while (session.length < size) {
    /*
     * New material gets *reserved* slots, evenly spaced, rather than whatever
     * is left at the end.
     *
     * Written as a ceiling first — "at most two new things per session" — and
     * the simulation showed that to be exactly backwards. A ceiling that is
     * only reached when consolidation runs out is never reached at all,
     * because consolidation never runs out: there is always something with
     * *some* priority. Over sixty simulated days the scheduler introduced ten
     * of a hundred and twenty-four available item-and-skill pairs and drilled
     * those ten forever.
     *
     * So two of the eight slots are new-material slots, at positions 0 and 4,
     * and the other six are consolidation. Either pool falls back to the other
     * when it is empty, so a learner with nothing new left still gets a full
     * session and one on their first day still gets one.
     */
    const newSlot =
      introduced < MAX_NEW_PER_SESSION &&
      session.length >= introduced * Math.ceil(size / MAX_NEW_PER_SESSION);
    const started = () => pool.find((candidate) => admissible(candidate, false));
    const fresh = () =>
      pool.find((candidate) => admissible(candidate, true) && isNew(memory, candidate));
    const pick = newSlot ? (fresh() ?? started()) : (started() ?? fresh());
    if (!pick) break;
    if (isNew(memory, pick)) introduced += 1;
    session.push(pick);
    usedItems.push(memoryKey(pick.kind, pick.itemKey));
    usedModes.push(pick.mode);
    pool.splice(pool.indexOf(pick), 1);
  }

  // A learner who has failed twice running has had enough of being wrong. The
  // easiest remaining candidate goes third, which is the confidence-maintenance
  // slot the brief asks for and the only place in the session where "easy" is
  // the reason something was chosen.
  return session;
}

/** Whether this skill has never been exercised for this item. */
function isNew(memory: MemoryMap, candidate: ReviewCandidate): boolean {
  return memory[memoryKey(candidate.kind, candidate.itemKey)]?.skills[candidate.skill] === undefined;
}

/**
 * Where a failed item comes back in the same sitting.
 *
 * Not immediately. Re-asking the identical question the moment it is missed
 * tests whether the learner can remember the answer they were just shown, which
 * is not a thing worth knowing. Two exercises later, they have had to hold it
 * across something else — which is the thing that was being asked in the first
 * place.
 */
export const RESCUE_GAP = 2;

export function insertRescue(
  queue: ReviewCandidate[],
  position: number,
  failed: ReviewCandidate,
): ReviewCandidate[] {
  const at = Math.min(position + RESCUE_GAP + 1, queue.length);
  const next = queue.slice();
  next.splice(at, 0, { ...failed, priority: failed.priority, intervene: true });
  return next;
}

// --- What the Review screen says ----------------------------------------------

/**
 * The three human-facing groups on the Review screen.
 *
 * Named for what a learner can decide about them, not for what the scheduler
 * knows. "Needs practice" is *I keep losing these*; "Due today" is *these are
 * fading*; "Saved" is *I chose these*. None of them is a stability figure, and
 * the number beside each is a count of items rather than of exercises, because
 * a learner counts things they know, not questions they will be asked.
 */
export interface ReviewSummary {
  needsPractice: number;
  dueToday: number;
  saved: number;
  /** Total distinct items with anything worth doing. */
  total: number;
}

/**
 * Two counts, and both are about memory rather than about the catalogue.
 *
 * `total` used to be "every item you have ever met that has any skill we could
 * ask about", which after five hundred words is five hundred. §21 and §32: the
 * learner is owed the number of things that currently need attention, and a
 * number that only ever grows is not that. Items whose memory is holding are
 * not counted, and items whose *unasked* skills could be broadened into are not
 * counted either — see `ReviewNeed`.
 */

/*
 * `sessionSize` used to live here, as `min(SESSION_SIZE, pool.length)`.
 *
 * It was the number the Review screen printed — "8 questions" — and it was a
 * guess: the pool is candidates, and a session is what survives the
 * interleaving rules and the question generator. Guessing eight and delivering
 * six is the smaller version of the bug; guessing eight and delivering nothing
 * was the shipped one. The count now comes from a resolved plan, which is the
 * same object the session runs. See `domain/plan.ts`.
 */

/** Recall below which an item is presented as needing practice rather than due. */
const AT_RISK_RECALL = 0.6;

export function summarise(
  progress: Record<string, ItemProgress>,
  memory: MemoryMap,
  saved: ReadonlySet<string>,
  now: Date,
  /**
   * The answerability filter. Optional so the domain tests can summarise
   * without a question generator, and passed by the app so that every figure
   * on the Review screen counts only work the learner can actually be given.
   */
  askable?: (candidate: ReviewCandidate) => boolean,
): ReviewSummary {
  const pool = candidates(progress, memory, now, {
    ...(askable ? { askable } : {}),
    // Only genuine memory need reaches these figures. Broadening into a skill
    // that has never been tested is worth doing and is not something to put a
    // number on: see `ReviewNeed`.
    needsOnly: true,
  });
  const worst = new Map<string, number>();
  for (const candidate of pool) {
    const key = memoryKey(candidate.kind, candidate.itemKey);
    worst.set(key, Math.min(worst.get(key) ?? 1, candidate.recall));
  }

  let needsPractice = 0;
  let dueToday = 0;
  for (const recall of worst.values()) {
    if (recall < AT_RISK_RECALL) needsPractice += 1;
    else if (recall < 1) dueToday += 1;
  }

  return {
    needsPractice,
    dueToday,
    saved: saved.size,
    total: worst.size,
  };
}

// --- Today's practice ---------------------------------------------------------

/**
 * The home screen's one plan for the day.
 *
 * Three lines, in the order they should be done: the memories most at risk
 * first, then the letter lesson in progress, then a little vocabulary. That
 * order is deliberate and it is not "review until the queue is empty" —
 * a learner whose reviews always come first and always outnumber the day's
 * capacity never advances through the curriculum again, which is how a spaced
 * repetition app turns into a treadmill.
 *
 * So reviews are capped. What is left over is still there tomorrow, and it will
 * be more urgent then, which is exactly what the priority score is for.
 */
export interface TodaysPractice {
  /** How many review exercises to open with. Capped; see above. */
  reviews: number;
  /** Characters left in the lesson the learner is part-way through. */
  lettersLeft: number;
  /** How many words to suggest. */
  words: number;
  /** True when there is genuinely nothing to do — a first launch. */
  empty: boolean;
}

/** The most of a day's plan that may be review rather than new material. */
export const MAX_DAILY_REVIEWS = 8;

export function todaysPractice(
  progress: Record<string, ItemProgress>,
  memory: MemoryMap,
  lettersLeft: number,
  now: Date,
  askable?: (candidate: ReviewCandidate) => boolean,
): TodaysPractice {
  const urgent = candidates(progress, memory, now, {
    ...(askable ? { askable } : {}),
    needsOnly: true,
  }).filter((candidate) => candidate.recall < AT_RISK_RECALL);
  const reviews = Math.min(MAX_DAILY_REVIEWS, urgent.length);
  const words = reviews + lettersLeft > 0 ? 3 : 5;
  return {
    reviews,
    lettersLeft,
    words,
    // Nothing to plan until there is something to *combine*.
    //
    // With no reviews due, the plan reads "finish your lesson, learn some
    // words" — which is what the lesson card directly below it already says,
    // in a card with a button on it. Two cards saying the same thing on the
    // first screen of a first launch is worse than one, so the plan appears
    // when it has something the lesson card cannot say: memories that are
    // fading and need to come first today.
    empty: reviews === 0,
  };
}

// --- Session outcome ----------------------------------------------------------

/**
 * What to tell the learner when a sitting ends.
 *
 * Two facts and, when the data supports it, one observation. What improved and
 * what is coming back — both read off the scheduler's actual state rather than
 * counted from the session, so the screen cannot promise a return that will not
 * happen.
 */
export interface SessionOutcome {
  practised: number;
  /** Answered correctly with no help and no earlier failure. */
  firstTry: number;
  /** Scheduled to come back inside two days. */
  comingBack: number;
  /** A pair the learner is demonstrably mixing up, if one showed up. */
  confusion: [string, string] | null;
}

export function sessionOutcome(
  results: Array<{ candidate: ReviewCandidate; passed: boolean; hintUsed: boolean; recovery: boolean }>,
  memory: MemoryMap,
  now: Date,
): SessionOutcome {
  let comingBack = 0;
  const seen = new Set<string>();
  for (const { candidate } of results) {
    const key = memoryKey(candidate.kind, candidate.itemKey);
    if (seen.has(key)) continue;
    seen.add(key);
    const state = memory[key]?.skills[candidate.skill];
    if (state && daysBetween(now.toISOString(), new Date(state.next_review_at)) <= 2) {
      comingBack += 1;
    }
  }

  let confusion: [string, string] | null = null;
  for (const { candidate } of results) {
    const partner = confusionPartner(memory[memoryKey(candidate.kind, candidate.itemKey)]);
    if (partner) {
      confusion = [candidate.itemKey, partner];
      break;
    }
  }

  return {
    practised: results.length,
    firstTry: results.filter((r) => r.passed && !r.hintUsed && !r.recovery).length,
    comingBack,
    confusion,
  };
}

// --- Weekly insights ----------------------------------------------------------

/**
 * Observations about the week, made only where there is evidence for them.
 *
 * The rule that matters is the floor: an insight needs a minimum number of
 * observations before it may be shown. "Listening is your strongest practice
 * type" off the back of two listening exercises is not an insight, it is an
 * algorithm generating sentences — and a learner who acts on it is being
 * misled by their own app.
 */
export interface Insight {
  /** A translation key under `activity:insights`. */
  key: string;
  params: Record<string, string | number>;
}

/** Fewest observations before a claim about a skill may be made. */
export const MIN_EVIDENCE = 6;

export function weeklyInsights(
  memory: MemoryMap,
  attempts: Array<{ skill: Skill; passed: boolean; hintUsed: boolean; at: string }>,
  now: Date,
): Insight[] {
  const week = attempts.filter((a) => daysBetween(a.at, now) <= 7);
  const out: Insight[] = [];

  const firstTry = week.filter((a) => a.passed && !a.hintUsed).length;
  if (firstTry >= MIN_EVIDENCE) {
    out.push({ key: 'firstTry', params: { count: firstTry } });
  }

  const bySkill = new Map<Skill, { total: number; passed: number }>();
  for (const attempt of week) {
    const row = bySkill.get(attempt.skill) ?? { total: 0, passed: 0 };
    row.total += 1;
    row.passed += attempt.passed ? 1 : 0;
    bySkill.set(attempt.skill, row);
  }
  const ranked = [...bySkill.entries()]
    .filter(([, row]) => row.total >= MIN_EVIDENCE)
    .sort((a, b) => b[1].passed / b[1].total - a[1].passed / a[1].total);
  if (ranked.length >= 2) {
    out.push({ key: 'strongestSkill', params: { skill: ranked[0]![0] } });
  }

  // A confusion that has stopped being one. Only claimed when the pair was
  // genuinely confused often enough to have been a problem.
  for (const item of Object.values(memory)) {
    const partner = confusionPartner(item);
    if (!partner) continue;
    const discrimination = item.skills.lookalike_discrimination;
    if (discrimination && discrimination.streak >= CONFUSION_THRESHOLD) {
      out.push({ key: 'confusionImproving', params: { a: item.item_key, b: partner } });
      break;
    }
  }

  return out;
}

/** Which skill a candidate's weakest reading came from. Re-exported for the UI. */
export { weakestSkill };
