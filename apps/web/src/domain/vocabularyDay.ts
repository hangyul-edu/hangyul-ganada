import type { ItemProgress, VocabularyWord } from '@hangyul-ganada/shared-types';

import type { MemoryMap } from './memory';
import { memoryKey, skillRecall } from './memory';
import { dateKey } from './progress';

/**
 * Today's vocabulary, as a small number the learner agreed to.
 *
 * ## What this replaces
 *
 * A screen listing 2,504 words in seventeen categories, each category a stack
 * of numbered sets, each set six words to be written syllable by syllable with
 * a finger. Everything about that was work before learning: choose a category,
 * choose a set, then draw 엄 and 마 to find out that 엄마 means mother.
 *
 * The corpus did not shrink — it is about to get four times bigger — it stopped
 * being the interface. What the learner sees is:
 *
 * ```
 * Today            3 / 10
 * [ Continue ]
 * ```
 *
 * and behind it a plan that decides which ten, in what order, asked how.
 * Categories and search still exist, one tap away, for somebody who came to
 * find a word. They are not the way in.
 *
 * ## What "one item" means, and why it has to be defined here
 *
 * The goal counts **words meaningfully completed**, never questions answered.
 * A word is completed for the day when the learner has done every step the plan
 * scheduled for it — typically met it, then chosen its meaning, then recognised
 * it again later — and that is *one*, not three.
 *
 * The alternative is what makes goal counters dishonest. Counting questions
 * means a goal of ten is reached by tapping ten buttons, which can be three
 * words; it means the number moves at a rate the learner cannot predict; and it
 * means the app is measuring its own UI rather than their learning. Ten words
 * has to mean ten words.
 *
 * ## The plan is written down, so leaving is safe
 *
 * `DailyPlan` is persisted. A learner who does four of ten and closes the app
 * comes back to *four of ten* and the same six words, not to a fresh ten. That
 * is the difference between a goal and a treadmill: a target you can walk away
 * from and return to is a target; one that regenerates while you are gone is
 * just a number that never goes down.
 *
 * A finished plan is not regenerated the same day either. The completion state
 * is the end of the day's vocabulary, and the offer after it is a small optional
 * top-up rather than another ten.
 */

// --- The plan -----------------------------------------------------------------

/** How a word came to be in today's plan. Drives nothing the learner sees. */
export type WordSource =
  /** Never met. The new material this session teaches. */
  | 'new'
  /** Met before and due — the memory is fading. */
  | 'review'
  /** Known well enough to be asked the harder questions. */
  | 'familiar'
  /** Met before and going badly. Recently failed or persistently weak. */
  | 'weak';

export interface PlannedWord {
  wordId: string;
  source: WordSource;
  /** The steps this word owes today, in order. See `stepsFor`. */
  steps: WordStep[];
}

/**
 * The ways a word is practised. No handwriting, and there never will be.
 *
 * Each is a couple of taps and tests something the others do not:
 *
 * | Step | What is on screen | What it proves |
 * | --- | --- | --- |
 * | `intro` | the word, its meaning, its sound, its sentence | nothing — this is the teaching |
 * | `meaning` | the Korean, four meanings | they can read it |
 * | `listen` | a clip, four words | they can hear it |
 * | `listenMeaning` | a clip, four meanings | the sound means something to them |
 * | `produce` | a meaning, four Korean words | they can find it from the idea |
 * | `context` | its sentence with a gap | they know which word the sentence wants |
 *
 * A `usage` step — four sentences, one of which uses the word naturally — was
 * built and then removed: see the note in `domain/review.ts` for the two ways
 * a generated one turns out to have either two right answers or a giveaway.
 */
export type WordStep = 'intro' | 'meaning' | 'listen' | 'listenMeaning' | 'produce' | 'context';

export interface DailyPlan {
  /** The local calendar day this plan is for. */
  date: string;
  /** The goal in force when it was built. A mid-day change does not rewrite it. */
  goal: number;
  words: PlannedWord[];
  /** Word ids finished today, in the order they were finished. */
  completed: string[];
}

/** The daily goals the learner may choose between. Small, and all finishable. */
export const DAILY_WORD_GOALS = [5, 10, 15, 20] as const;

/**
 * How many of a session's slots are *reserved* for new words.
 *
 * A reservation, not a ceiling, and the difference is the whole of it.
 *
 * As a ceiling it says "at most half of today may be new", which sounds like
 * balance and behaves like a bug: a learner on their first day has no review
 * material at all, so half the session has nothing to fill it and a goal of ten
 * produces a plan of five. The learner set a target of ten and the app quietly
 * gave them five.
 *
 * As a reservation it says "half of today is held for new words, and the other
 * half goes to consolidation *if there is any*". A returning learner with a
 * fortnight of backlog still meets something new — the backlog is not the
 * lesson — and a first-day learner gets a full session. See `buildDailyPlan`,
 * where the same shape of rule governs `MAX_NEW_PER_SESSION` in
 * `domain/review.ts` for exactly the same reason.
 */
export function newWordAllowance(goal: number): number {
  return Math.max(1, Math.min(Math.ceil(goal / 2), 8));
}

/** Recall below which a met word is treated as weak rather than merely due. */
const WEAK_RECALL = 0.5;

/** Recall below which a met word is worth revisiting at all. */
const DUE_RECALL = 0.9;

// --- Choosing the words -------------------------------------------------------

export interface DayRequest {
  progress: Record<string, ItemProgress>;
  memory: MemoryMap;
  /** The corpus, already ordered by usefulness. See `pickWords`. */
  corpus: readonly VocabularyWord[];
  goal: number;
  now: Date;
}

/**
 * Builds the day's plan.
 *
 * The mix is *weak first, then due, then new*, and the order matters more than
 * the ratio: something the learner is losing is worth more than something they
 * have never seen, and both are worth more than the next word in the list. What
 * is capped is only the new material, because that is the one pool that never
 * runs out and would otherwise crowd out everything else.
 *
 * Words are taken from `corpus` in the order it arrives, which is the order the
 * content pipeline computed — frequency, learner usefulness, concreteness. A
 * beginner's first ten words are the ten a beginner most needs, and no part of
 * that ordering is exposed to them as a level or a difficulty number.
 */
export function buildDailyPlan(request: DayRequest): DailyPlan {
  const { progress, memory, corpus, goal, now } = request;

  const weak: PlannedWord[] = [];
  const due: PlannedWord[] = [];
  const fresh: PlannedWord[] = [];

  /*
   * One pass over the corpus, stopping as soon as no pool can still grow.
   *
   * This is what keeps a session's cost independent of the corpus size: at ten
   * thousand words the scan reads the first few hundred and stops, because the
   * corpus arrives in priority order and a session needs at most `goal` of
   * each kind. It is not a scan of ten thousand rows per session.
   */
  for (const word of corpus) {
    if (weak.length >= goal && due.length >= goal && fresh.length >= goal) break;

    const row = progress[`word:${word.id}`];
    const met = row !== undefined && row.stage !== 'unseen';

    if (!met) {
      if (fresh.length < goal) {
        fresh.push({ wordId: word.id, source: 'new', steps: stepsFor('new') });
      }
      // Keep scanning: a later word may be a review, and reviews outrank new.
      continue;
    }

    const recall = weakestRecall(memory, word.id, now);
    if (recall < WEAK_RECALL) {
      if (weak.length < goal) {
        weak.push({ wordId: word.id, source: 'weak', steps: stepsFor('weak') });
      }
    } else if (recall < DUE_RECALL) {
      /*
       * Due, and asked at the difficulty it has earned.
       *
       * A word the learner has answered right several times running gets the
       * harder directions — produce it from its meaning, hear it and say what
       * it means, pick the sentence that uses it properly. Asking "what does
       * 엄마 mean" of somebody who has known it for a fortnight is the app
       * spending their time to confirm something it already knows.
       */
      if (due.length < goal) {
        const source: WordSource = isFamiliar(memory, word.id) ? 'familiar' : 'review';
        due.push({ wordId: word.id, source, steps: stepsFor(source) });
      }
    }
  }

  // New material gets reserved slots rather than leftover ones, and either pool
  // falls back to the other when it is empty — so a learner with nothing to
  // review still gets a full session, and one with nothing new left does too.
  const reserved = Math.min(newWordAllowance(goal), fresh.length);
  const consolidation = [...weak, ...due].slice(0, Math.max(0, goal - reserved));
  const words = [...consolidation, ...fresh.slice(0, goal - consolidation.length)];

  return { date: dateKey(now), goal, words, completed: [] };
}

/** Answers in a row, across every skill, before the harder questions start. */
const FAMILIAR_STREAK = 3;

/**
 * Whether this word has earned the harder questions.
 *
 * Measured on the *weakest* skill's streak, not the best one: a word that can
 * be read fluently and has never been heard is not familiar, it is half-known,
 * and giving it a usage question would be testing the half that is missing by
 * way of the half that is not.
 */
function isFamiliar(memory: MemoryMap, wordId: string): boolean {
  const item = memory[memoryKey('word', wordId)];
  const states = Object.values(item?.skills ?? {}).filter((state) => state !== undefined);
  if (states.length < 2) return false;
  return Math.min(...states.map((state) => state!.streak)) >= FAMILIAR_STREAK;
}

/**
 * The weakest thing the learner remembers about this word, 0..1.
 *
 * The weakest rather than the average, because a word that can be read and
 * cannot be heard is a word with a hole in it, and averaging hides the hole
 * behind the part that is fine.
 */
function weakestRecall(memory: MemoryMap, wordId: string, now: Date): number {
  const item = memory[memoryKey('word', wordId)];
  if (!item) return 0;
  const states = Object.values(item.skills).filter((state) => state !== undefined);
  if (states.length === 0) return 0;
  return Math.min(...states.map((state) => skillRecall(state, now)));
}

/**
 * What a word owes today, by how well it is known.
 *
 * **Recognition before recall**, and difficulty follows familiarity — §16 and
 * §34. A word met sixty seconds ago is introduced and then asked the easy way:
 * the Korean is on the screen and the learner picks what it means. It is not
 * asked to be produced from its meaning until it has been met properly, and it
 * is not asked which sentence uses it naturally until it is known. Asking for
 * production first does not test recall — it tests whether the learner happened
 * to memorise something they saw once, and it teaches them that the app asks
 * unfair questions.
 *
 * ```
 * new       intro → meaning                  met it, then the easiest check there is
 * review    meaning → listen                 two angles on something known
 * familiar  produce → listenMeaning → context  the harder directions, once it is solid
 * weak      listen → meaning → context       the failing skill first, then rebuilt
 * ```
 *
 * `familiar` is what stops the sessions of a learner three weeks in from being
 * the same two questions about words they have known for a fortnight: by then,
 * "what does it mean" has stopped being a question, and producing the word from
 * its meaning, hearing it cold, and meeting it in a sentence have not.
 *
 * The rotation is inside the *word*, not across the session — a word carries
 * its own steps — so a sitting is varied because the words in it are at
 * different stages, which is a truer kind of variety than shuffling question
 * types over a uniform pile.
 */
export function stepsFor(source: WordSource): WordStep[] {
  switch (source) {
    case 'new':
      return ['intro', 'meaning'];
    case 'review':
      return ['meaning', 'listen'];
    case 'familiar':
      return ['produce', 'listenMeaning', 'context'];
    case 'weak':
      return ['listen', 'meaning', 'context'];
  }
}

// --- Turning the plan into a sitting ------------------------------------------

export interface ScheduledStep {
  wordId: string;
  step: WordStep;
  /** True when this is the last step this word owes. Completing it counts. */
  completesWord: boolean;
}

/**
 * Minimum questions between two appearances of the same word.
 *
 * The rule that stops a session feeling like a drill. Three questions about
 * 엄마 in a row measures whether the learner can remember the last screen; the
 * same three spread across the session measure whether they have learned the
 * word, which is the thing being asked. Two other words in between is enough
 * for the answer to have to be recalled rather than merely still visible.
 */
export const MIN_WORD_GAP = 2;

/**
 * The plan, flattened into the order the questions are asked.
 *
 * Interleaved rather than word-by-word. Each word's steps stay in their own
 * order — a word is always introduced before it is questioned — but the words
 * are woven together, so the learner meets 엄마, then does something else, then
 * comes back to it. That gap is not decoration: it is the only difference
 * between testing memory and testing the previous screen.
 *
 * Deterministic, so a learner who leaves and returns finds the same session in
 * the same order rather than a reshuffle that makes their progress unreadable.
 */
export function scheduleSteps(plan: DailyPlan): ScheduledStep[] {
  const done = new Set(plan.completed);
  const queues = plan.words
    .filter((word) => !done.has(word.wordId))
    .map((word) => ({ wordId: word.wordId, remaining: [...word.steps] }));

  const out: ScheduledStep[] = [];
  const recent: string[] = [];

  while (queues.some((queue) => queue.remaining.length > 0)) {
    // The first word that has something left and has not been asked about in
    // the last `MIN_WORD_GAP` questions.
    let picked = queues.find(
      (queue) => queue.remaining.length > 0 && !recent.slice(-MIN_WORD_GAP).includes(queue.wordId),
    );
    // Near the end of a session there may be nothing else left to interleave
    // with. Spacing is a preference; finishing the plan is the contract.
    picked ??= queues.find((queue) => queue.remaining.length > 0);
    if (!picked) break;

    const step = picked.remaining.shift()!;
    out.push({
      wordId: picked.wordId,
      step,
      completesWord: picked.remaining.length === 0,
    });
    recent.push(picked.wordId);
  }

  return out;
}

// --- Where the learner is in it -----------------------------------------------

export interface DayProgress {
  /** Words finished today. The numerator the learner reads. */
  done: number;
  /** The goal. The denominator. */
  total: number;
  ratio: number;
  complete: boolean;
  /** How many questions are left. Not shown as a goal; used for "about a minute". */
  stepsLeft: number;
}

export function dayProgress(plan: DailyPlan): DayProgress {
  const done = plan.completed.length;
  const total = Math.max(plan.goal, plan.words.length);
  return {
    done,
    total,
    ratio: total === 0 ? 1 : Math.min(1, done / total),
    // A plan can be shorter than the goal — a learner three days in may not
    // have `goal` words' worth of anything yet. Finishing what there is
    // finishes the day; being told "4 / 10" forever because the corpus ran out
    // would be the app blaming them for its own supply.
    complete: plan.words.length > 0 && done >= plan.words.length,
    stepsLeft: scheduleSteps(plan).length,
  };
}

/**
 * Records that a word's last step was answered.
 *
 * Idempotent, because the screen can re-render and a learner can go back: a
 * word counts once towards today whatever happens to the component that
 * reported it.
 */
export function completeWord(plan: DailyPlan, wordId: string): DailyPlan {
  if (plan.completed.includes(wordId)) return plan;
  if (!plan.words.some((word) => word.wordId === wordId)) return plan;
  return { ...plan, completed: [...plan.completed, wordId] };
}

/**
 * Whether a stored plan is the one for right now.
 *
 * A plan is for a day. It survives the app being closed, being backgrounded for
 * an hour, and the learner changing their goal — a goal change takes effect
 * tomorrow rather than rewriting a session in progress, because a plan that
 * changes length underneath somebody is worse than one that starts fresh in the
 * morning.
 */
export function planIsCurrent(plan: DailyPlan | null, now: Date): plan is DailyPlan {
  return plan !== null && plan.date === dateKey(now);
}
