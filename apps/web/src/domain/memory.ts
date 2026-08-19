import type { ItemProgress } from '@hangyul-ganada/shared-types';

/**
 * How well the learner remembers each thing they have learned.
 *
 * ## Why this replaced a ladder of fixed intervals
 *
 * The previous scheduler asked one question — *is this item due?* — and
 * answered it from a table: one day, three days, a week, three weeks. It is the
 * scheduler most apps ship and it has two defects that matter for this product.
 *
 * **It treats an item as one thing.** A learner can read 사과 instantly, fail to
 * recognise it when they hear it, and be unable to write 과 at all. A single
 * due-date cannot represent that, so it schedules the whole item on the
 * strength of whichever skill happened to be tested last — and then tests
 * whichever skill the review screen happens to offer, which was always writing.
 * The weakness never gets found and never gets fixed.
 *
 * **It does not know how likely forgetting is.** Three weeks is three weeks
 * whether the item was nailed or scraped through, and whether the learner has
 * lost it four times before or never.
 *
 * So this module answers a different question: *which skill for which item is
 * weakest, how likely is the learner to have forgotten it, and what practice
 * would strengthen it most?* Everything about scheduling lives here — nothing
 * in the UI computes an interval — so the model can be recalibrated in one
 * place and the tests in `memory.test.ts` are testing the real thing.
 *
 * ## What a learner sees of this
 *
 * Nothing. Not one number in this file reaches the screen. The Review screen
 * says "Needs practice — 12 items"; it does not say "stability 4.7". A learner
 * cannot act on a stability figure, and showing it would invite them to
 * optimise the number instead of learning Korean.
 */

// --- Skills -------------------------------------------------------------------

/**
 * The separate things that can be remembered about one item.
 *
 * Deliberately few, and every one of them is something the app can actually
 * *test*. A skill with no exercise behind it would be a field that only ever
 * held its initial value while looking like evidence.
 */
/**
 * What can be remembered about a word.
 *
 * **`guided_writing` is deliberately not here**, and its absence is a product
 * rule rather than an oversight. Vocabulary in this app is never handwritten:
 * not in a lesson, not in review, not in saved words, not in the daily session.
 * A learner meets a word, hears it, chooses its meaning, and later recognises
 * it — and every one of those is a thing the app can test in a couple of taps
 * while they are lying down.
 *
 * Writing 엄 and then 마 is not how anybody learns what 엄마 means. It is the
 * letter curriculum's exercise, applied to a word, and it cost the learner
 * thirty seconds of finger-drawing per word to measure something the letter
 * lessons had already measured. Removing the skill here removes it everywhere,
 * because the scheduler can only ask about skills that exist.
 */
export const WORD_SKILLS = [
  /** Korean shown, meaning chosen. */
  'meaning_recognition',
  /** The written form read aloud in the head — Korean shown, said correctly. */
  'reading_recognition',
  /** Audio played, word chosen. */
  'listening_recognition',
  /** The word met inside its example sentence. */
  'sentence_comprehension',
] as const;

export const CHARACTER_SKILLS = [
  /** Sound played, letter chosen. */
  'sound_recognition',
  /** Letter shown, sound chosen. */
  'visual_recognition',
  'guided_writing',
  /** Told apart from the letter it is actually confused with. */
  'lookalike_discrimination',
] as const;

export type Skill = (typeof WORD_SKILLS)[number] | (typeof CHARACTER_SKILLS)[number];

export function skillsFor(kind: ItemProgress['kind']): readonly Skill[] {
  return kind === 'word' ? WORD_SKILLS : CHARACTER_SKILLS;
}

// --- The model ----------------------------------------------------------------

/**
 * Bumped whenever the maths below changes.
 *
 * Stored on every memory row. A stability written by version 1 does not mean
 * the same thing as one written by version 2, and silently reinterpreting old
 * numbers under new rules is how a learner's schedule quietly becomes wrong
 * with nothing to point at. See `migrateMemory`.
 */
export const REVIEW_ALGORITHM_VERSION = 1;

/**
 * The recall probability a review is scheduled at.
 *
 * Below this the item is worth asking again; above it, asking is spending the
 * learner's time on something they know. 0.88 is a deliberate compromise:
 * higher means more reviews and fewer forgotten items, lower means the reverse,
 * and this product is used in five-minute sittings by people who will simply
 * stop if it feels like a chore.
 *
 * One constant, read everywhere, so it can be recalibrated without a schema
 * change — `stability_days` is defined *in terms of* it, so changing it
 * rescales every interval consistently rather than making stored values wrong.
 */
export const TARGET_RECALL = 0.88;

/**
 * Predicted probability the learner still has this, right now.
 *
 * The standard exponential forgetting curve, parameterised so that
 * `stability_days` is *the number of days until recall falls to*
 * `TARGET_RECALL`. That parameterisation is the reason this file has almost no
 * arithmetic in it: the next review date is `last_reviewed_at + stability_days`
 * and nothing has to be solved for.
 *
 * ```
 * recall(t) = TARGET_RECALL ^ (t / stability)
 * recall(0) = 1        recall(stability) = TARGET_RECALL
 * ```
 */
export function recallProbability(elapsedDays: number, stabilityDays: number): number {
  if (stabilityDays <= 0) return 0;
  if (elapsedDays <= 0) return 1;
  return Math.exp((Math.log(TARGET_RECALL) * elapsedDays) / stabilityDays);
}

export interface SkillMemory {
  skill: Skill;
  /** Days from the last review until recall is predicted to reach TARGET_RECALL. */
  stability_days: number;
  /** 0 (easy for this learner) to 1 (they keep losing it). Grows with lapses. */
  difficulty: number;
  last_reviewed_at: string;
  next_review_at: string;
  /** Consecutive successes. Resets to zero on a failure. */
  streak: number;
  /** How many times this has been forgotten after being learned. */
  lapses: number;
  /** The evaluator score, or 1/0 for a multiple-choice answer. */
  recent_score: number | null;
  last_response_ms: number | null;
  /** How often the learner asked for help. Not a failure; see `applyReview`. */
  hints: number;
}

/** Every skill for one item, plus what the whole item has been confused with. */
export interface ItemMemory {
  item_key: string;
  kind: ItemProgress['kind'];
  algorithm_version: number;
  skills: Partial<Record<Skill, SkillMemory>>;
  /**
   * What this item was mistaken *for*, and how often.
   *
   * Per item rather than global, because confusion is personal: everyone is
   * told ㅐ and ㅔ look alike, and the learner in front of us may be perfectly
   * fine with those and lose ㅓ against ㅗ every time. See `confusionPartner`.
   */
  confusions: Record<string, number>;
  /** Set once an item has been through the leech intervention. */
  rescued_at: string | null;
}

export type MemoryMap = Record<string, ItemMemory>;

export function memoryKey(kind: ItemProgress['kind'], itemKey: string): string {
  return `${kind}:${itemKey}`;
}

// --- Initial state ------------------------------------------------------------

/**
 * Stability given to a skill the first time it is demonstrated.
 *
 * Conservative on purpose, and the three cases are genuinely different events:
 * getting it right straight away is evidence, getting it right after two tries
 * is weaker evidence, and getting it right with the answer half-shown is
 * weaker still. Starting everything at the same place would throw that away on
 * the one occasion it is cheapest to collect.
 */
export const INITIAL_STABILITY = {
  /** First try, no hint, and quick with it. */
  clean: 1.5,
  /** First try. */
  normal: 1.0,
  /** After a retry, or with a hint. */
  assisted: 0.5,
} as const;

/** Nothing is ever scheduled closer than this. A review inside the hour is a re-ask. */
const MIN_STABILITY_DAYS = 0.5;

/** Nor further out than this. Beyond a year the model is extrapolating. */
const MAX_STABILITY_DAYS = 365;

export function blankMemory(kind: ItemProgress['kind'], itemKey: string): ItemMemory {
  return {
    item_key: itemKey,
    kind,
    algorithm_version: REVIEW_ALGORITHM_VERSION,
    skills: {},
    confusions: {},
    rescued_at: null,
  };
}

// --- Applying a review --------------------------------------------------------

/** What one exercise produced. Everything the scheduler is allowed to know. */
export interface ReviewOutcome {
  skill: Skill;
  passed: boolean;
  /**
   * 0..1. The evaluator's score for writing; 1 or 0 for a choice.
   *
   * A bare pass and a confident one are different events, and the difference is
   * the only thing that separates "keep asking this" from "leave them alone".
   */
  score: number;
  /** True when the learner asked for the answer to be shown or replayed. */
  hintUsed?: boolean;
  /** Milliseconds from the exercise appearing to the answer. */
  responseMs?: number;
  /** For a wrong multiple-choice answer, what they picked instead. */
  confusedWith?: string;
  /** True when the learner had already failed this item earlier in the sitting. */
  recovery?: boolean;
}

/**
 * How much a success multiplies stability by.
 *
 * The shape, and why each term is there:
 *
 * * **A clean success is worth about twice a struggling one.** That is the
 *   whole point of grading a pass rather than counting it.
 * * **An overdue success is worth more.** If they still had it after twice as
 *   long as predicted, the prediction was too short and the model should say so
 *   — this is the term that lets intervals grow faster than the base rate for a
 *   learner who is doing well.
 * * **A difficult item grows more slowly.** An item lost four times is not
 *   suddenly a three-week item because it was answered right once.
 * * **A hint caps the gain.** See `applyReview`.
 */
function successMultiplier(
  memory: SkillMemory,
  outcome: ReviewOutcome,
  elapsedDays: number,
): number {
  // 1.0 when answered exactly on schedule, up to 1.3 when long overdue. Capped
  // because "they still knew it after four months" is mostly evidence that they
  // met the word somewhere else, not that the interval should quadruple.
  const overdue = Math.min(1.3, 1 + Math.max(0, elapsedDays / memory.stability_days - 1) * 0.3);

  // The score band. 0.9 is the writing pass mark, so a bare pass sits at the
  // bottom of this range and a perfect trace at the top.
  const confidence = clamp(0.55 + outcome.score * 0.5, 0.55, 1.05);

  const base = outcome.hintUsed
    ? 1.25 // helped: 1.15–1.35 across the score range
    : outcome.recovery
      ? 1.45 // got there after failing it earlier this sitting
      : 2.2; // clean

  const timing = timingFactor(outcome, memory);
  const resistance = 1 - memory.difficulty * 0.35;
  const gain = clamp(base * confidence * overdue * timing * resistance, 1.05, 3.0);

  /*
   * How much of the scheduled interval had actually elapsed.
   *
   * This is the correction the simulation forced, and it is the one that makes
   * the difference between a model and a number that goes up. Answering
   * something correctly five minutes after the last time you answered it
   * demonstrates nothing about your memory of it — the answer is still in your
   * head from a moment ago — and without this term the app happily multiplied
   * stability by two for it, twice a session, until every interval hit the
   * one-year ceiling and nothing was ever asked again at the right time.
   *
   * So the gain is scaled by maturity: none at all for a review taken
   * immediately, full for one taken when it was due. A learner who chooses to
   * drill something is not punished — the interval simply does not grow on
   * evidence that was not collected.
   */
  const maturity = clamp(elapsedDays / memory.stability_days, 0, 1);
  return 1 + (gain - 1) * maturity;
}

/**
 * How much response time is allowed to move the schedule.
 *
 * Very little, and deliberately.
 *
 * Slow is not the same as weak. A learner using a screen reader is slow. A
 * learner drawing 를 with a fingertip on a bus is slow. A learner who stopped to
 * think — which is the thing we want them to do — is slow. Treating any of
 * those as a partial failure would make the app worse for exactly the people it
 * should be most careful with.
 *
 * So this is a ±8% nudge, it only applies when a per-skill expectation exists,
 * and writing is never compared against multiple choice: drawing a syllable
 * takes ten seconds when it goes perfectly.
 */
function timingFactor(outcome: ReviewOutcome, memory: SkillMemory): number {
  const expected = EXPECTED_RESPONSE_MS[memory.skill];
  if (!outcome.responseMs || !expected) return 1;
  if (outcome.responseMs < expected * 0.5) return 1.08;
  if (outcome.responseMs > expected * 3) return 0.92;
  return 1;
}

/**
 * Roughly how long each skill takes when it is going well, in milliseconds.
 *
 * Per skill, because the tasks are not comparable: choosing one of four
 * meanings is a two-second act of recognition and writing 과 over a guide is a
 * ten-second act of drawing. One shared threshold would report every writing
 * exercise as hesitant.
 */
const EXPECTED_RESPONSE_MS: Partial<Record<Skill, number>> = {
  meaning_recognition: 4_000,
  reading_recognition: 5_000,
  listening_recognition: 5_000,
  sentence_comprehension: 8_000,
  sound_recognition: 4_000,
  visual_recognition: 4_000,
  lookalike_discrimination: 5_000,
  // `guided_writing` is deliberately absent. There is no honest expectation for
  // how long a stroke takes, and the evaluator score already grades the result.
};

/**
 * How much a failure cuts stability.
 *
 * Never to zero, and never below the floor: an item the learner has written
 * correctly nine times and missed once has not become an item they have never
 * seen, and treating it as one is how a scheduler manufactures a backlog.
 *
 * The first lapse and the fifth are different events. A first lapse is
 * ordinary forgetting; a fifth means the item is not being learned by
 * repetition and something else has to change — which is what
 * `needsIntervention` picks up.
 */
function failureMultiplier(memory: SkillMemory, outcome: ReviewOutcome): number {
  // 0.55 for a first slip down to 0.35 once it has been lost repeatedly.
  const bySeverity = 0.55 - Math.min(0.2, memory.lapses * 0.05);
  // A near miss on a written stroke is not the same as a blank canvas.
  const byScore = outcome.score >= 0.7 ? 1.15 : 1;
  return clamp(bySeverity * byScore, 0.3, 0.6);
}

/**
 * Folds one exercise into the memory of one item.
 *
 * Pure, and takes `now`, so a three-week schedule is tested in a millisecond
 * rather than observed over three weeks.
 */
export function applyReview(
  previous: ItemMemory | undefined,
  kind: ItemProgress['kind'],
  itemKey: string,
  outcome: ReviewOutcome,
  now: Date,
): ItemMemory {
  const stamp = now.toISOString();
  const item = previous ?? blankMemory(kind, itemKey);
  const existing = item.skills[outcome.skill];

  let next: SkillMemory;
  if (!existing) {
    // First time this skill has been demonstrated.
    const start = !outcome.passed
      ? INITIAL_STABILITY.assisted
      : outcome.hintUsed || outcome.recovery
        ? INITIAL_STABILITY.assisted
        : outcome.score >= 0.95
          ? INITIAL_STABILITY.clean
          : INITIAL_STABILITY.normal;
    next = {
      skill: outcome.skill,
      stability_days: start,
      difficulty: outcome.passed ? 0.3 : 0.5,
      last_reviewed_at: stamp,
      next_review_at: stamp,
      streak: outcome.passed ? 1 : 0,
      lapses: outcome.passed ? 0 : 1,
      recent_score: outcome.score,
      last_response_ms: outcome.responseMs ?? null,
      hints: outcome.hintUsed ? 1 : 0,
    };
  } else {
    const elapsedDays = daysBetween(existing.last_reviewed_at, now);
    const multiplier = outcome.passed
      ? successMultiplier(existing, outcome, elapsedDays)
      : failureMultiplier(existing, outcome);

    next = {
      ...existing,
      stability_days: clamp(
        existing.stability_days * multiplier,
        MIN_STABILITY_DAYS,
        MAX_STABILITY_DAYS,
      ),
      // Difficulty is a slow-moving property of the item *for this learner*: it
      // rises when they lose it and falls when they get it right, and it never
      // reaches either end, so an item can always recover and never becomes
      // free.
      difficulty: clamp(
        existing.difficulty + (outcome.passed ? -0.05 : 0.12),
        0.05,
        0.95,
      ),
      last_reviewed_at: stamp,
      streak: outcome.passed ? existing.streak + 1 : 0,
      lapses: existing.lapses + (outcome.passed ? 0 : 1),
      recent_score: outcome.score,
      last_response_ms: outcome.responseMs ?? existing.last_response_ms,
      hints: existing.hints + (outcome.hintUsed ? 1 : 0),
    };
  }

  next.next_review_at = addDays(now, next.stability_days);

  const confusions = { ...item.confusions };
  if (!outcome.passed && outcome.confusedWith) {
    confusions[outcome.confusedWith] = (confusions[outcome.confusedWith] ?? 0) + 1;
  }

  return {
    ...item,
    algorithm_version: REVIEW_ALGORITHM_VERSION,
    skills: { ...item.skills, [outcome.skill]: next },
    confusions,
  };
}

// --- Reading the model --------------------------------------------------------

/** Predicted recall for one skill, now. 0 when it has never been demonstrated. */
export function skillRecall(memory: SkillMemory | undefined, now: Date): number {
  if (!memory) return 0;
  return recallProbability(daysBetween(memory.last_reviewed_at, now), memory.stability_days);
}

/**
 * The skill most worth practising for this item, and how weak it is.
 *
 * A skill that has never been demonstrated counts as the weakest of all — that
 * is the whole reason the model is per skill. A learner who has written 사과
 * four times and never once heard it is not 80% done with 사과; they have not
 * started the part they are worst at.
 */
export function weakestSkill(
  memory: ItemMemory | undefined,
  kind: ItemProgress['kind'],
  now: Date,
): { skill: Skill; recall: number } {
  let worst: { skill: Skill; recall: number } | null = null;
  for (const skill of skillsFor(kind)) {
    const recall = skillRecall(memory?.skills[skill], now);
    if (!worst || recall < worst.recall) worst = { skill, recall };
  }
  return worst ?? { skill: skillsFor(kind)[0]!, recall: 0 };
}

/** The item this one is actually mistaken for, if a pattern has formed. */
export function confusionPartner(memory: ItemMemory | undefined): string | null {
  if (!memory) return null;
  let best: [string, number] | null = null;
  for (const [other, count] of Object.entries(memory.confusions)) {
    if (count >= CONFUSION_THRESHOLD && (!best || count > best[1])) best = [other, count];
  }
  return best?.[0] ?? null;
}

/**
 * How many times one wrong answer has to be chosen before it is a pattern.
 *
 * Two, not one. Everybody mis-taps once, and building a personalised
 * discrimination drill out of a single fat-finger would waste the learner's
 * time on a distinction they do not actually have trouble with.
 */
export const CONFUSION_THRESHOLD = 2;

/**
 * Whether repetition has stopped working on this item.
 *
 * The signal is lapses *concentrated in one skill*, not lapses overall: an item
 * that has been lost four times across four different skills is an item being
 * learned normally, and one that has been lost four times at listening is one
 * the learner cannot hear.
 *
 * When this fires, the answer is not another repetition. See
 * `review.ts` — the session switches teaching strategy instead.
 */
export const LEECH_LAPSES = 4;

export function needsIntervention(memory: ItemMemory | undefined): Skill | null {
  if (!memory) return null;
  for (const skill of Object.values(memory.skills)) {
    if (skill && skill.lapses >= LEECH_LAPSES && skill.difficulty > 0.6) return skill.skill;
  }
  return null;
}

// --- Migration ----------------------------------------------------------------

/**
 * Builds a memory row from what the fixed-interval scheduler recorded.
 *
 * The old model stored `review_due_at`, `fails`, `passes` and `last_score` on
 * the progress row — one due date for the whole item, and no notion of which
 * skill anything applied to. Two things follow, and both are honest rather than
 * convenient:
 *
 * * **The history goes to the skill it was actually evidence of.** Every review
 *   the old app could run was a writing exercise, so `guided_writing` inherits
 *   the schedule and the failure count. Nothing is invented for the skills that
 *   were never tested; they are simply absent, which is exactly what "we have
 *   never seen you do this" should look like, and the scheduler will offer them
 *   first.
 *
 *   For a **word** that means inheriting nothing at all. Words have no writing
 *   skill any more — see `WORD_SKILLS` — so the one thing this migration could
 *   have carried across is the one thing that is no longer asked. Writing the
 *   row anyway would leave a schedule nothing reads, and moving it onto
 *   `meaning_recognition` instead would be claiming the learner had
 *   demonstrated a meaning when what they actually did was draw a syllable.
 * * **Stability is derived from the due date the learner already had**, not
 *   from a fresh start. Someone three weeks into a twenty-one-day interval
 *   keeps their twenty-one days. Resetting everyone to one day on update would
 *   hand every existing learner a backlog of their entire vocabulary, which is
 *   the single most effective way to make someone delete an app.
 *
 * No past performance is fabricated: there are no invented review events, and a
 * row with no schedule at all produces no memory.
 */
export function migrateMemory(row: ItemProgress, now: Date): ItemMemory | null {
  const passes = row.trace_passes + row.practice_passes;
  if (!row.review_due_at && passes === 0) return null;

  const memory = blankMemory(row.kind, row.item_key);
  const last = row.last_attempted_at ?? row.learned_at ?? now.toISOString();

  // The interval the old ladder had reached, recovered from the two dates it
  // stored. Where they are unusable, the conservative default is one day.
  const scheduled = row.review_due_at ? daysBetween(last, new Date(row.review_due_at)) : 0;
  const stability = clamp(
    scheduled > 0 ? scheduled : Math.min(7, 1 + passes),
    MIN_STABILITY_DAYS,
    MAX_STABILITY_DAYS,
  );

  // Characters only. See the note above on what a word inherits from a writing
  // history, and why the answer is nothing — the recognition history below is a
  // different fact and is carried for both kinds.
  if (row.kind === 'character') {
    memory.skills.guided_writing = {
      skill: 'guided_writing',
      stability_days: stability,
      // From the failure history that was actually recorded. A learner who never
      // missed this starts easy; one who missed it four times does not.
      difficulty: clamp(0.2 + row.fails * 0.12, 0.05, 0.95),
      last_reviewed_at: last,
      next_review_at: row.review_due_at ?? addDays(new Date(last), stability),
      streak: row.needs_review ? 0 : Math.min(passes, 5),
      lapses: row.fails,
      recent_score: row.last_score,
      last_response_ms: null,
      hints: 0,
    };
  }

  // A word that was read correctly in a lesson demonstrated exactly one thing,
  // and the old model did record it: `recognition_passes`.
  if (row.recognition_passes > 0) {
    const skill: Skill = row.kind === 'word' ? 'reading_recognition' : 'visual_recognition';
    memory.skills[skill] = {
      skill,
      stability_days: clamp(1 + row.recognition_passes, MIN_STABILITY_DAYS, MAX_STABILITY_DAYS),
      difficulty: 0.3,
      last_reviewed_at: last,
      next_review_at: addDays(new Date(last), 1 + row.recognition_passes),
      streak: row.recognition_passes,
      lapses: 0,
      recent_score: null,
      last_response_ms: null,
      hints: 0,
    };
  }

  return memory;
}

// --- Small shared helpers -----------------------------------------------------

export function daysBetween(from: string | Date, to: Date): number {
  const start = typeof from === 'string' ? Date.parse(from) : from.getTime();
  if (!Number.isFinite(start)) return 0;
  return (to.getTime() - start) / 86_400_000;
}

function addDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
