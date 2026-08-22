import type { ItemProgress, VocabularyWord } from '@hangyul-ganada/shared-types';

import type { MemoryMap } from './memory';
import { memoryKey, skillRecall } from './memory';
import { dateKey } from './progress';
import { pickNewWords } from './vocabularyLevel';

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
 * The ways a word is practised. No handwriting, and no listening questions.
 *
 * Each is a couple of taps and tests something the others do not:
 *
 * | Step | What is on screen | What it proves |
 * | --- | --- | --- |
 * | `intro` | the word, its meaning, its sound, its sentence | nothing — this is the teaching |
 * | `meaning` | the Korean, four meanings | they can read it |
 * | `produce` | a meaning, four Korean words | they can find it from the idea |
 * | `build` | its own syllables, shuffled | they can spell it from the idea |
 * | `context` | its sentence with a gap | they know which word the sentence wants |
 *
 * A `usage` step — four sentences, one of which uses the word naturally — was
 * built and then removed: see the note in `domain/review.ts` for the two ways
 * a generated one turns out to have either two right answers or a giveaway.
 *
 * `listen` (a clip, four words) and `listenMeaning` (a clip, four meanings)
 * were here and are gone. Not hidden and not disabled — there is no step to
 * schedule, so no route into a vocabulary session can produce one. The sound
 * itself is untouched: `intro` still plays the word, Word Detail still plays
 * it, the example sentence still plays. What has gone is the *question* whose
 * entire prompt was a recording, which is a different thing from the audio that
 * supports every other question on this list.
 */
export type WordStep =
  | 'intro'
  | 'meaning'
  | 'produce'
  | 'context'
  /** Assembled from its own syllables. Familiar words only — see `stepsFor`. */
  | 'build'
  /**
   * Four words and four meanings, paired.
   *
   * The one step that is not about a single word, and the reason
   * `ScheduledStep` grew a `group`. See `MATCH_SIZE` and `scheduleSteps`.
   */
  | 'match';

export interface DailyPlan {
  /** The local calendar day this plan is for. */
  date: string;
  /** The goal in force when it was built. A mid-day change does not rewrite it. */
  goal: number;
  words: PlannedWord[];
  /** Word ids finished today, in the order they were finished. */
  completed: string[];
}

/**
 * A plan with nothing in it, for the moment before the store has answered.
 *
 * `date: ''` matches no calendar day, so `planIsCurrent` rejects it and it can
 * never be mistaken for today's real plan or written to storage as one.
 */
export function emptyPlan(goal: number): DailyPlan {
  return { date: '', goal, words: [], completed: [] };
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
  /** The learner practises without questions that must be heard. §36. */
  soundFree?: boolean;
  progress: Record<string, ItemProgress>;
  memory: MemoryMap;
  /** The corpus, already ordered by usefulness. See `pickWords`. */
  corpus: readonly VocabularyWord[];
  goal: number;
  now: Date;
  /**
   * The learner's Vocabulary Level, and who they are.
   *
   * Supplied together or not at all. With them, new words are chosen around
   * the level and shuffled by the learner's own seed; without them the plan
   * falls back to the corpus prefix, which is what every learner used to get
   * and is still right for somebody the app knows nothing about.
   */
  level?: number;
  seed?: string;
  /** How many days this learner has studied. Rotates the choice. */
  dayIndex?: number;
  /** Word ids introduced in the last fortnight. Not offered as new again. */
  recentlyIntroduced?: ReadonlySet<string>;
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
  const { progress, memory, corpus, goal, now, soundFree = false } = request;

  const weak: PlannedWord[] = [];
  const due: PlannedWord[] = [];
  const fresh: PlannedWord[] = [];
  const personalised = request.level !== undefined && request.seed !== undefined;

  /*
   * One pass over the corpus, stopping as soon as no pool can still grow.
   *
   * This is what keeps a session's cost independent of the corpus size: at ten
   * thousand words the scan reads the first few hundred and stops, because the
   * corpus arrives in priority order and a session needs at most `goal` of
   * each kind. It is not a scan of ten thousand rows per session.
   */
  for (const word of corpus) {
    if (weak.length >= goal && due.length >= goal && (personalised || fresh.length >= goal)) break;

    const row = progress[`word:${word.id}`];
    const met = row !== undefined && row.stage !== 'unseen';

    if (!met) {
      // Collected below, out of the whole corpus rather than its prefix, so
      // that the learner's level can choose them. See `pickNewWords`.
      if (personalised) continue;
      if (fresh.length < goal) {
        fresh.push({
          wordId: word.id,
          source: 'new',
          steps: stepsFor('new', fresh.length, soundFree),
        });
      }
      // Keep scanning: a later word may be a review, and reviews outrank new.
      continue;
    }

    const recall = weakestRecall(memory, word.id, now);
    if (recall < WEAK_RECALL) {
      if (weak.length < goal) {
        weak.push({ wordId: word.id, source: 'weak', steps: stepsFor('weak', 0, soundFree) });
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
        due.push({ wordId: word.id, source, steps: stepsFor(source, due.length, soundFree) });
      }
    }
  }

  /*
   * The new words, chosen around the learner's level.
   *
   * Asked for *after* the review pools are known, so the number requested is
   * the number of slots actually left — a learner with eight words to revise
   * gets two new ones rather than ten picked and eight thrown away.
   */
  if (personalised) {
    const reservedSlots = newWordAllowance(goal);
    const consolidationCount = Math.min(weak.length + due.length, Math.max(0, goal - reservedSlots));
    const wantNew = goal - consolidationCount;
    const met = new Set(
      Object.values(progress)
        .filter((row) => row.kind === 'word' && row.stage !== 'unseen')
        .map((row) => row.item_key),
    );
    const recent = request.recentlyIntroduced ?? new Set<string>();
    const picked = pickNewWords({
      corpus,
      level: request.level!,
      seed: request.seed!,
      dayIndex: request.dayIndex ?? 0,
      count: wantNew,
      isMet: (id) => met.has(id),
      isRecent: (id) => recent.has(id),
    });
    for (const word of picked) {
      fresh.push({ wordId: word.id, source: 'new', steps: stepsFor('new', fresh.length, soundFree) });
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
 * new       intro → meaning | context        met it, then the easiest check there is
 * review    meaning → produce | context      two angles on something known
 * familiar  produce | build → context        the harder directions, once it is solid
 * weak      meaning → context → produce      the easiest way back in, then rebuilt
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
 *
 * ## Except on the first day, when every word is new
 *
 * That argument holds for a learner three weeks in and fails completely for one
 * on day one, which is the session that decides whether there is a week two. A
 * beginner's plan is ten new words, every word owed `intro → meaning`, so their
 * entire first experience of the vocabulary half of the product is *meet a
 * word, pick its meaning*, ten times, in one layout. Watching it back is
 * unmistakable: it reads as one screen shown twenty times.
 *
 * So a new word's check rotates by its position in the plan. Both are
 * recognition rather than production — a word met thirty seconds ago should not
 * be asked to be produced, for the reason two paragraphs up — but they are two
 * different skills in two different layouts, and the sitting stops being a
 * single screen repeated. The rotation is by index and therefore deterministic:
 * the same plan builds the same session every time it is scheduled, which is
 * what lets a learner leave and come back to it.
 *
 * It was four before the listening questions were removed, and this is the one
 * place the removal genuinely costs something: a first sitting of ten new words
 * now alternates two layouts rather than four. It is not made back up by
 * promoting `produce` into the rotation, which would be asking a learner to
 * recall a word they met thirty seconds ago — a harder session is not a more
 * varied one. The variety a beginner actually gets comes back within days, as
 * words start arriving at `review` and `familiar` with their own steps.
 *
 * ## Three, not two
 *
 * It was two — `meaning` and `context` — after the two listening checks were
 * removed, and two shapes over ten words is twenty screens of the same two
 * things on the day a learner is deciding whether this app is worth their time.
 * `match` is the third, and it is a genuinely different question rather than a
 * fourth arrangement of four options: four words and four meanings at once,
 * where every pair made narrows the rest.
 *
 * Rotating rather than adding. A new word still owes exactly two steps — its
 * introduction and one check — so a ten-word sitting is the same length it was.
 * What changes is that roughly a third of the words now owe a `match`, which is
 * enough to make one grid, and the grid replaces four separate questions rather
 * than joining them.
 */
const NEW_WORD_CHECKS: WordStep[] = ['meaning', 'context', 'match'];

/**
 * `soundFree` is accepted and no longer changes anything here. §36.
 *
 * The parameter used to filter out `listen` and `listenMeaning` for a learner
 * who cannot hear the clip. There are no such steps any more — every step a
 * word can owe is read rather than heard — so a sound-free plan and an ordinary
 * one are now the same plan, which is the strongest form the setting could
 * take: the questions it existed to remove do not exist.
 *
 * It stays in the signature because `domain/plan.ts` and `LearnerProvider` both
 * thread it through for the *letter* side, where `sound_recognition` and
 * `distinguish` are still genuinely heard-only, and because a stored
 * `sound_free: true` must keep meaning what it meant.
 */
export function stepsFor(source: WordSource, index = 0, _soundFree = false): WordStep[] {
  const steps = ((): WordStep[] => {
    switch (source) {
      case 'new':
        return ['intro', NEW_WORD_CHECKS[index % NEW_WORD_CHECKS.length]!];
      case 'review':
        /*
         * Two angles, and which second angle rotates.
         *
         * This was `meaning → listen`. With the clip gone it would have been a
         * single question — read the Korean, pick the meaning — for every
         * fading word in the sitting, which is exactly the "one screen shown
         * twenty times" the new-word rotation exists to avoid. So the pair is
         * kept and the second half alternates between the two directions a
         * known word can be asked from: produce it from its meaning, or find
         * it in its own sentence.
         */
        return ['meaning', index % 2 === 0 ? 'produce' : 'context'];
      case 'familiar':
        /*
         * The one place a word is assembled rather than chosen.
         *
         * `build` is production and belongs where `produce` already is — after
         * the word is known — but it is harder than `produce`, so it replaces
         * it rather than joining it: a familiar word gets one production
         * question, and which one it gets alternates. That keeps a session the
         * same length while making every other familiar word feel different,
         * and it keeps the harder question from being the *only* production a
         * learner ever meets.
         *
         * A word that cannot be built — one syllable, or five — falls back to
         * `produce` in `buildDailyQuestions`, which drops any step it cannot
         * turn into a question and recounts what completes the word.
         */
        return [index % 2 === 0 ? 'produce' : 'build', 'context'];
      case 'weak':
        /*
         * A word that is going badly, rebuilt from the easiest end.
         *
         * This was `listen → meaning → context` — the failing skill first, on
         * the assumption that the failing skill was often the listening one.
         * With that skill gone the order is simply easiest to hardest: read it,
         * meet it in its sentence, then produce it. Still three steps, because
         * a weak word is the one worth spending the sitting on.
         */
        return ['meaning', 'context', 'produce'];
    }
  })();
  return steps;
}

// --- Turning the plan into a sitting ------------------------------------------

export interface ScheduledStep {
  wordId: string;
  step: WordStep;
  /** True when this is the last step this word owes. Completing it counts. */
  completesWord: boolean;
  /**
   * Every word in this question, for a step that asks about more than one.
   *
   * Only `match` has it, and for `match` it is the four words in the grid —
   * `wordId` first, so a caller that only knows about single-word steps still
   * reads the right word out of it. Everything else leaves it undefined.
   */
  group?: string[];
  /**
   * Every word this step finishes, `wordId` included where it does.
   *
   * The accounting that makes a group step safe. A `match` grid can be the last
   * thing three of its four words owe and the second-to-last thing the fourth
   * owes, and the day's counter, the mastery ladder and the activity row all
   * have to move by exactly three. Single-word steps set it to `[wordId]` or
   * leave it empty, so one code path credits both kinds and nothing is counted
   * twice. See `advance` in `WordSessionPage`.
   */
  completes: string[];
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
 * Words in one matching grid.
 *
 * Four pairs is the largest grid that fits a phone without scrolling and the
 * smallest that is not simply two questions side by side. Three is allowed at
 * the end of a session — see `scheduleSteps` — because a grid of three is still
 * a matching exercise, and two is a single question with extra steps.
 */
export const MATCH_SIZE = 4;

/** Below this, the leftover `match` steps are dropped rather than shown. */
export const MIN_MATCH_SIZE = 3;

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
  /*
   * Words whose turn has come round to a `match`, waiting for a grid.
   *
   * A matching grid is the one question that needs several words at once, and
   * the words cannot be chosen when the plan is built — a grid has to be made
   * of words the learner has already met *in this sitting*, or it is four
   * strangers and a guess. So a word reaching its `match` step steps aside into
   * this queue, the interleave carries on without it, and the grid is emitted
   * the moment a fourth word joins. That places it naturally: after four words
   * have been introduced and questioned, which is where it belongs.
   */
  const waiting: Array<{ wordId: string; last: boolean }> = [];

  const flush = (minimum: number) => {
    while (waiting.length >= minimum) {
      const grid = waiting.splice(0, Math.min(MATCH_SIZE, waiting.length));
      out.push({
        wordId: grid[0]!.wordId,
        step: 'match',
        completesWord: grid[0]!.last,
        group: grid.map((entry) => entry.wordId),
        completes: grid.filter((entry) => entry.last).map((entry) => entry.wordId),
      });
      grid.forEach((entry) => recent.push(entry.wordId));
    }
  };

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
    const last = picked.remaining.length === 0;

    if (step === 'match') {
      waiting.push({ wordId: picked.wordId, last });
      flush(MATCH_SIZE);
      continue;
    }

    out.push({
      wordId: picked.wordId,
      step,
      completesWord: last,
      completes: last ? [picked.wordId] : [],
    });
    recent.push(picked.wordId);
  }

  /*
   * Whatever is still waiting when the plan runs out.
   *
   * Three is a grid; fewer is not, and the words are simply released — their
   * `match` was an extra angle on a word they have already answered about, so
   * dropping it costs the session nothing and shows nobody a two-item matching
   * puzzle. A released word that owed nothing else still has to be *completed*,
   * or the day's counter would sit one short of a session the learner finished.
   */
  flush(MIN_MATCH_SIZE);
  for (const entry of waiting) {
    if (!entry.last) continue;
    // `findLast` needs a newer lib target than this package builds against.
    let owner: ScheduledStep | undefined;
    for (const scheduled of out) if (scheduled.wordId === entry.wordId) owner = scheduled;
    if (owner) {
      owner.completesWord = true;
      owner.completes = [...owner.completes, entry.wordId];
    }
  }

  return out;
}

// --- Where the learner is in it -----------------------------------------------

export interface DayProgress {
  /** Words finished today. The numerator the learner reads. */
  done: number;
  /** The goal. The denominator, whatever the plan has grown to. */
  total: number;
  /** `done / total`, capped at 1. What a progress bar is given. */
  ratio: number;
  /** `done / total` as a whole percentage, **not** capped. 12 of 10 is 120. */
  percent: number;
  complete: boolean;
  /** How many questions are left. Not shown as a goal; used for "about a minute". */
  stepsLeft: number;
}

export function dayProgress(plan: DailyPlan): DayProgress {
  const done = plan.completed.length;
  /*
   * The denominator is the goal, and only the goal.
   *
   * It used to be `max(goal, words.length)`, which was right while a plan could
   * only ever be the goal or shorter, and became wrong the moment a learner
   * could ask for more words. Growing the denominator with the plan means
   * finishing ten and adding five reads as *10 / 15* — the learner is further
   * from their target for having done extra work, and the day they completed
   * un-completes itself. The number the learner agreed to does not move.
   */
  const total = plan.goal;
  return {
    done,
    total,
    ratio: total === 0 ? 1 : Math.min(1, done / total),
    // Uncapped, so twelve of ten reads 120%. The *bar* uses `ratio` and stops
    // at full, because a bar that overflows its track is a rendering bug rather
    // than an achievement.
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
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
/**
 * Adds a few more words to today, without disturbing what is already on it.
 *
 * The second helping, for a learner who finished and wants more. It used to be
 * done by calling `buildDailyPlan` again, which is how a learner who tapped
 * *더 학습하기* after finishing ten words was shown **0 / 10**: a fresh plan has
 * an empty `completed`, so the day they had just finished was thrown away and
 * charged to them again.
 *
 * So this *extends*. `completed` is untouched, `goal` is untouched — the extra
 * study is extra, not a new target, and the fraction goes on counting against
 * the number the learner actually chose. Words already on the plan are skipped
 * rather than duplicated, and the ones added are chosen the same way the day's
 * own words were.
 */
export function extendDay(plan: DailyPlan, extra: number, request: DayRequest): DailyPlan {
  if (extra <= 0) return plan;
  const already = new Set(plan.words.map((word) => word.wordId));
  // Ask for enough that the ones already on the plan can be skipped and there
  // are still `extra` left. A plan is at most a few dozen words.
  const candidates = buildDailyPlan({
    ...request,
    goal: plan.words.length + extra,
  }).words.filter((word) => !already.has(word.wordId));
  const added = candidates.slice(0, extra);
  if (added.length === 0) return plan;
  return { ...plan, words: [...plan.words, ...added] };
}

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
