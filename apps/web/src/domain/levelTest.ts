/**
 * The Hangyul Vocabulary Level test: choosing what to ask, and reading the answer.
 *
 * ## What a level is
 *
 * A position on a cumulative vocabulary ladder — level 5 is roughly the first
 * 735 words of Korean by frequency, level 15 the first 3,490, level 30 beyond
 * 10,635. The bands widen as they climb. `build_level_test.py` assigns every
 * item its level from the word's frequency rank in Korean; this file never sees
 * a word, only a difficulty.
 *
 * It is **not** TOPIK, it is not CEFR, and it is not a claim that the learner
 * knows exactly 3,490 words. It is a position on this ladder with a confidence
 * band, and the result screen says so.
 *
 * ## Why adaptive
 *
 * A fixed list long enough to place someone at level 2 and someone at level 28
 * is a list that wastes almost all of its questions on almost everyone: the
 * beginner spends twenty items failing and the advanced reader spends twenty
 * items answering things they knew at a glance. Choosing each question from the
 * current estimate spends every item where it discriminates, which is what
 * makes 18–36 items enough for a ±3 answer in three to six minutes.
 *
 * ## The model
 *
 * A two-parameter logistic with a guessing floor — the standard shape for
 * four-option multiple choice:
 *
 *     P(correct | θ, b) = c + (1 − c)·σ(θ − b)
 *
 * θ is the learner's ability and b the item's difficulty, both in logits; c is
 * ¼, because someone who knows nothing still gets a quarter of four-option
 * questions right and a model that ignores that reads guessing as knowledge.
 *
 * The estimate is **expected a posteriori** over a grid rather than maximum
 * likelihood. MLE is undefined until the learner has got at least one item right
 * and one wrong — which is most of the first few questions — and runs off to
 * infinity on a perfect run. A grid posterior always has a mean and always has a
 * standard deviation, which is also where the stopping rule and the confidence
 * band come from.
 */

/** The scale. Levels are 1–30 inclusive. */
export const LEVELS = 30;

/**
 * Logits per level.
 *
 * The thirty levels span about 8.7 logits at this setting, which puts the
 * easiest and hardest items far enough apart that the model can tell a level-2
 * learner from a level-4 one, and close enough that no single item is
 * effectively unanswerable or free.
 */
const LOGITS_PER_LEVEL = 0.3;

/** Chance of a correct answer from someone who does not know the word. */
const GUESS = 1 / 4;

/**
 * Thirty questions. Not "18 to 36", and the difference is the product.
 *
 * The test used to stop as soon as the estimate was sure enough, which is what
 * an adaptive test is for and is why the intro screen had to say *18 to 36
 * questions, 3 to 6 minutes*. Four numbers, none of which a learner can plan
 * around. Somebody deciding whether to start a test wants to know what they are
 * agreeing to, and "somewhere between three and six minutes" is not an answer.
 *
 * So the count is fixed and the *difficulty* adapts, which is where the
 * adaptation was always doing the work: the early-stopping rule saved four
 * questions on average and cost the learner the ability to know when it would
 * end. Measured against the same simulation, a fixed thirty is at least as
 * accurate as the old variable run — see `scripts/level-test-qa.mjs`.
 */
export const ITEM_COUNT = 30;

/**
 * How the thirty are made up.
 *
 * Twelve in a sentence, nine each way round on the word itself. The contextual
 * items are the ones that measure whether somebody can *use* a word rather than
 * recognise it, and they are the most expensive to build well — there are 390
 * of them in the bank against 1,800 of each of the others — so twelve is what
 * the bank can support at every level without repeating itself.
 *
 * A sitting that cannot find a contextual item at the level it wants asks
 * another kind rather than asking nothing: see `planKinds`.
 */
/** The three shapes a question comes in. */
export type ItemKind = 'meaning' | 'produce' | 'context';

export const COMPOSITION: Record<ItemKind, number> = { context: 12, meaning: 9, produce: 9 };

/**
 * Eight minutes for the whole sitting, and no per-question clock.
 *
 * A per-question timer measures reading speed and turns a vocabulary test into
 * a reflex test, which is a different thing and a worse one. One clock over the
 * whole sitting is sixteen seconds a question, which is generous for a
 * four-option question and firm enough that nobody looks anything up.
 *
 * When it runs out the sitting is *scored*, not thrown away: what has been
 * answered is evidence, and the rest is read as "I don't know", which is what
 * running out of time on a question means. See `LevelTestPage`.
 */
export const TIME_LIMIT_MS = 8 * 60 * 1000;

/** Where the grid starts and stops, and how finely it is cut. */
const GRID_MIN = 0.5;
const GRID_MAX = 30.5;
const GRID_STEP = 0.1;

/**
 * The prior, in levels.
 *
 * Centred on the scale and deliberately weak. A Bayesian estimate is pulled
 * toward its prior, so wherever the prior sits is where the ends of the scale
 * get squeezed toward — and this was centred at 9 on a scale that runs to 30.
 * Simulated, that showed up as a systematic direction rather than as noise:
 * learners at levels 1–5 were placed **+0.78 levels too high** and learners at
 * 26–30 **1.39 levels too low**, with level 30 coming out at 28 every single
 * time. A test that cannot report its own top level is a test with a ceiling,
 * which is exactly what §34 asks about.
 *
 * 15 is the middle of 1–30 and carries no opinion about who is taking the test.
 * The width went from 8 to 20 for the same reason: at 8, the prior was still
 * strong enough at the ends to bend them inward, and this product has no
 * business having a strong opinion about a learner it has not yet asked
 * anything. A *flat* prior was tried and behaves worse on short runs, where it
 * lets one lucky guess carry the estimate a long way — so the prior stays, and
 * stops leaning.
 *
 * `LOGITS_PER_LEVEL` was swept alongside these and deliberately left alone.
 * Raising it improves every number in the simulation, and it does so
 * circularly: the simulated learner answers with the same curve the estimator
 * assumes, so a sharper curve makes both the learner more predictable and the
 * estimator more confident. That is not evidence about the test. The prior's
 * centre is different — it does not appear in the simulated learner at all —
 * so moving it is a real finding and moving the discrimination would be a
 * flattering one.
 */
const PRIOR_MEAN = 15;
const PRIOR_SD = 20;

export type Response = 'correct' | 'wrong' | 'unknown';

export interface AskedItem {
  /** The item's level, 1–30. */
  level: number;
  response: Response;
}

export interface Estimate {
  /** Posterior mean, on the level scale. */
  level: number;
  /** Posterior standard deviation, in levels. */
  se: number;
  /** The reported level: the mean, rounded and clamped to the scale. */
  reported: number;
  /** A 95% interval, clamped to the scale. */
  low: number;
  high: number;
}

const grid: number[] = [];
for (let level = GRID_MIN; level <= GRID_MAX + 1e-9; level += GRID_STEP) {
  grid.push(Number(level.toFixed(2)));
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** Chance of a correct answer, given ability and item level. */
function pCorrect(abilityLevel: number, itemLevel: number): number {
  return GUESS + (1 - GUESS) * logistic((abilityLevel - itemLevel) * LOGITS_PER_LEVEL);
}

/**
 * The likelihood of one response at one ability.
 *
 * *I don't know* is not the same evidence as a wrong answer, and treating it as
 * one throws away the most honest thing a learner does in an assessment. A wrong
 * answer might be a guess that missed; a declared blank cannot be. So it is
 * scored against the model with the guessing floor removed — the learner has
 * told us they were not in the quarter who would have got it by luck — which
 * makes it slightly stronger evidence of not knowing than a wrong guess is.
 */
function likelihood(abilityLevel: number, item: AskedItem): number {
  const known = logistic((abilityLevel - item.level) * LOGITS_PER_LEVEL);
  if (item.response === 'correct') return GUESS + (1 - GUESS) * known;
  if (item.response === 'unknown') return 1 - known;
  return 1 - (GUESS + (1 - GUESS) * known);
}

/** The posterior over the grid, given everything asked so far. */
function posterior(asked: readonly AskedItem[]): number[] {
  const weights = grid.map((level) => {
    const z = (level - PRIOR_MEAN) / PRIOR_SD;
    let density = Math.exp(-0.5 * z * z);
    for (const item of asked) density *= likelihood(level, item);
    return density;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  return total > 0 ? weights.map((w) => w / total) : weights.map(() => 1 / grid.length);
}

/** Where the learner is, and how sure we are. */
export function estimate(asked: readonly AskedItem[]): Estimate {
  const weights = posterior(asked);
  const mean = grid.reduce((sum, level, i) => sum + level * weights[i]!, 0);
  const variance = grid.reduce((sum, level, i) => sum + (level - mean) ** 2 * weights[i]!, 0);
  const se = Math.sqrt(variance);
  const clamp = (value: number) => Math.min(LEVELS, Math.max(1, value));
  return {
    level: mean,
    se,
    reported: Math.round(clamp(mean)),
    low: Math.round(clamp(mean - 1.96 * se)),
    high: Math.round(clamp(mean + 1.96 * se)),
  };
}

/**
 * How much an item at this level would tell us about a learner at this ability.
 *
 * Fisher information for the model above. It peaks a little *above* the
 * learner's ability rather than exactly at it, which is the guessing floor's
 * doing: an item a learner is likely to get right by luck says less than one
 * they are not.
 */
export function information(abilityLevel: number, itemLevel: number): number {
  const p = pCorrect(abilityLevel, itemLevel);
  const q = 1 - p;
  if (p <= GUESS + 1e-9 || q <= 1e-9) return 0;
  const numerator = (p - GUESS) ** 2;
  return (LOGITS_PER_LEVEL ** 2 * numerator * q) / (p * (1 - GUESS) ** 2);
}

/** The level to ask next, given where the learner seems to be. */
export function nextLevel(asked: readonly AskedItem[], available: readonly number[]): number | null {
  if (available.length === 0) return null;
  const where = asked.length === 0 ? PRIOR_MEAN : estimate(asked).level;
  let best = available[0]!;
  let bestInformation = -1;
  for (const level of available) {
    const value = information(where, level);
    if (value > bestInformation) {
      bestInformation = value;
      best = level;
    }
  }
  return best;
}

/** Whether the sitting is over. Thirty questions, or the clock. */
export function shouldStop(asked: readonly AskedItem[]): boolean {
  return asked.length >= ITEM_COUNT;
}

/**
 * Which kind of question each of the thirty is, in order.
 *
 * Interleaved rather than blocked, so a sitting does not feel like three
 * separate tests bolted together, and deterministic, so two learners at the
 * same level meet the same *shape* of test even though the words differ.
 *
 * The order starts with a `meaning` item on purpose: it is the gentlest of the
 * three, and the first question of an assessment sets what somebody expects
 * from the rest of it.
 */
export function planKinds(): ItemKind[] {
  const remaining: Record<ItemKind, number> = { ...COMPOSITION };
  const out: ItemKind[] = [];
  const cycle = ['meaning', 'context', 'produce', 'context', 'meaning', 'produce'] as const;
  for (let i = 0; out.length < ITEM_COUNT; i += 1) {
    const kind = cycle[i % cycle.length]!;
    if (remaining[kind] > 0) {
      remaining[kind] -= 1;
      out.push(kind);
      continue;
    }
    // That kind is used up; take whatever is left, in a fixed order.
    const fallback = (['context', 'meaning', 'produce'] as const).find((k) => remaining[k] > 0);
    if (!fallback) break;
    remaining[fallback] -= 1;
    out.push(fallback);
  }
  return out;
}

/**
 * The cumulative vocabulary size each level stands for.
 *
 * Shown on the result as *about this many words*, never as a count of what the
 * learner knows: it is the size of the frequency band the estimate sits in.
 */
export const CUMULATIVE_WORDS = [
  147, 294, 441, 588, 735, 955, 1175, 1395, 1615, 1835, 2166, 2497, 2828, 3159, 3490, 3930,
  4370, 4810, 5250, 5690, 6163, 6636, 7109, 7582, 8055, 8571, 9087, 9603, 10119, 10635,
] as const;
