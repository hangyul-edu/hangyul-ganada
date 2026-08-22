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

/** Fewest items before the test may stop, and the most it may ever ask. */
export const MIN_ITEMS = 18;
export const MAX_ITEMS = 36;

/**
 * How sure the estimate must be before stopping early, in levels.
 *
 * 1.6 levels of posterior standard deviation puts a 95% interval at about ±3.1,
 * which is the precision the result is reported to. Swept against the
 * simulation, because the number that matters is how long a sitting becomes:
 *
 * ```
 *   target SE   median items   MAE    within ±3
 *      1.2          36         1.21     96.9%
 *      1.5          36         1.23     97.0%
 *      1.6          32         1.27     97.1%
 *      1.8          26         1.43     94.8%
 * ```
 *
 * Below 1.6 the rule never fires and every sitting runs to the 36-item cap —
 * paying four more questions for a hundredth of a level. Above it accuracy
 * starts to go. 1.6 is where the curve turns.
 */
const TARGET_SE_LEVELS = 1.6;

/** Where the grid starts and stops, and how finely it is cut. */
const GRID_MIN = 0.5;
const GRID_MAX = 30.5;
const GRID_STEP = 0.1;

/**
 * The prior, in levels.
 *
 * Centred low and wide: this is a product for people starting Korean, so before
 * any evidence the best guess is "nearer the bottom than the top" — but eight
 * levels of standard deviation is weak enough that four or five answers move it
 * wherever the answers say. A flat prior was tried and behaves worse on short
 * runs, where it lets one lucky guess carry the estimate a long way.
 */
const PRIOR_MEAN = 9;
const PRIOR_SD = 8;

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

/** Whether the test has learned enough, or asked enough. */
export function shouldStop(asked: readonly AskedItem[]): boolean {
  if (asked.length >= MAX_ITEMS) return true;
  if (asked.length < MIN_ITEMS) return false;
  return estimate(asked).se <= TARGET_SE_LEVELS;
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
