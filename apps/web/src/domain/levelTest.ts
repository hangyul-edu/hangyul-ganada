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
 * makes twenty to thirty items enough for a ±3 answer.
 *
 * ## Adaptive is not the same as abrupt
 *
 * Being adaptive is necessary and it is not sufficient, and this file used to
 * prove it. The estimator was sound; the *selector* asked whatever item carried
 * the most information about the current posterior, from anywhere on the scale,
 * from the first question onward. With nothing asked yet the posterior is the
 * prior and the prior sits at the middle of the scale, so **the first question
 * every learner ever saw was at level 14** — and the second could be at level 8.
 *
 * That is a defensible estimator and an indefensible assessment. What a learner
 * meets is a sequence, and a sequence that opens above their head and then swings
 * six levels reads as a test that is not listening. So the selector now has three
 * rules on top of the information criterion — a warm-up, a bounded step, and a
 * limit on repeating a level — and a confirmation phase at the end. Each is
 * documented at its constant with the behaviour it replaced, and each is
 * asserted in `levelTest.test.ts` and simulated in `scripts/level-test-qa.mjs`.
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
 * How long a sitting is: at least twenty questions, never more than thirty.
 *
 * The count used to be a flat thirty, and before that it stopped as soon as the
 * estimate was sure enough — "18 to 36 questions, 3 to 6 minutes", four numbers
 * a learner cannot plan around. Both were answers to the same question and both
 * were wrong at one end.
 *
 * A flat thirty is predictable and, for the two learners at the ends of the
 * scale, unkind: somebody who has said *I don't know* twenty times running has
 * told us everything they are going to, and asking ten more is not measurement,
 * it is attrition. So the floor is what the intro promises and the ceiling is
 * what it caps: **20 to 30 questions**. The estimate has to be settled — see
 * `STOP_SE` — before the floor releases, so a sitting only ends early when
 * ending early costs nothing.
 */
export const MIN_ITEM_COUNT = 20;
export const MAX_ITEM_COUNT = 30;

/**
 * The ceiling, under the name the rest of the app has always used for it.
 *
 * The progress counter, the clock budget and `planKinds` are all about the
 * longest a sitting can be, so they keep reading this.
 */
export const ITEM_COUNT = MAX_ITEM_COUNT;

/**
 * Posterior standard deviation at or below which the estimate is settled.
 *
 * Chosen from the simulation rather than from taste, and deliberately strict.
 *
 * Stopping early is not free: measured over 6,000 simulated sittings, the mean
 * absolute error after twenty questions is **1.66 levels** and after thirty it
 * is **1.31**. Ten more questions buy a third of a level, so a threshold loose
 * enough to end most sittings at the floor would be selling accuracy for time.
 *
 * At 1.5 it ends only the sittings that have genuinely finished — about one in
 * twelve at the floor, and the degenerate runs (everything right, everything
 * wrong, everything *I don't know*) always, because those posteriors stop moving
 * long before the ceiling. Overall accuracy is 1.31 either way, to two decimal
 * places: the sittings it ends are the ones the remaining questions would not
 * have changed. That is the whole case for the rule, and it is why the mean
 * sitting is still 28.7 questions rather than 20.
 *
 * `scripts/level-test-qa.mjs` prints the sweep this was read off.
 */
export const STOP_SE = 1.5;

/**
 * The opening questions, which are chosen rather than computed.
 *
 * This is the fix for the thing learners actually reported. The estimator's
 * prior sits at the middle of the scale, so with nothing asked yet the
 * most-informative item is at **level 14** — and that was the first question
 * every learner saw, including somebody who had just finished the alphabet.
 * Measured over two hundred simulated sittings, 42.8% of the first five
 * questions put to a true level-2 learner were above level 8: words they had no
 * way to know, in the part of the test that decides whether they keep going.
 *
 * An assessment is allowed to spend a few items being gentle. Three warm-up
 * questions on a rising ladder cost about a tenth of the sitting and buy the
 * learner a start they can answer. `warmupLadder` says where the ladder sits.
 */
export const WARMUP_ITEMS = 3;

/**
 * The most the difficulty may move between two consecutive questions.
 *
 * Unbounded selection is what made the test feel arbitrary: the second question
 * of a sitting jumped from level 14 to level 8, and a learner reading six
 * levels of swing between two questions is being told the test has no idea who
 * they are. It is also, from the estimator's point of view, unnecessary — the
 * information function is flat enough near its peak that a three-level step
 * loses very little per item and converges within the length of the sitting.
 *
 * Three, not one: a bound of one cannot cross the scale inside thirty questions
 * — a returning learner measured at 20 who is really at 3 would run out of
 * questions before reaching their level — and a bound of five is not a bound a
 * learner can feel. `levelTest.test.ts` asserts both ends of that.
 */
export const MAX_STEP = 3;

/**
 * The last questions before the earliest possible stop, spent near the answer.
 *
 * An adaptive test that walks toward an estimate and then stops has never
 * actually asked the question it is about to answer. These four are asked at
 * the estimate and a level either side of it, so the reported level rests on
 * items chosen for it rather than on extrapolation from the walk.
 *
 * Everything after the floor is confirmation too, by construction: once the
 * sitting is long enough to end, the estimate is where the walk has arrived and
 * every further item sits on it.
 */
export const CONFIRM_ITEMS = 4;

/** The first item index that belongs to the confirmation phase. */
export const CONFIRM_FROM = MIN_ITEM_COUNT - CONFIRM_ITEMS;

/**
 * How many questions in a row may share a level.
 *
 * The old selector had no such rule and it showed at both ends of the scale: a
 * learner who got everything right was asked level 29 twelve times running, and
 * one who got everything wrong was asked **level 1 twenty-five times running**.
 * Neither is measurement — the posterior stops moving — and the second is a
 * beginner being shown the same difficulty for five sixths of their sitting.
 */
export const REPEAT_LIMIT = 2;

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

/*
  One definition of a response, in the file that also defines the stored sitting
  it is written into. Two would drift, and the drift would be silent: a stored
  `'skipped'` that the estimator does not know about scores as nothing.
*/
export type { Response } from './levelTestTypes';
import type { Response } from './levelTestTypes';

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
 * Chance that somebody who knows a word still answers it wrongly.
 *
 * ## Why this parameter had to exist
 *
 * The file used to claim, and the screen used to repeat, that *I don't know* was
 * "slightly stronger evidence of not knowing than a wrong guess is". It was not.
 * Under a three-parameter model with no slip the two are **identical** evidence,
 * and not approximately — exactly:
 *
 *     P(wrong)   = (1 − c)·(1 − known)
 *     P(unknown) =           1 − known
 *
 * They differ by the constant factor (1 − c), and a constant factor cancels when
 * the posterior is normalised. Ten declared blanks and ten wrong answers at the
 * same level produced the same estimate to twelve decimal places, and a sitting
 * answered entirely *I don't know* asked exactly the same thirty questions as
 * one answered entirely wrongly. The button was real, the honesty it asked for
 * was real, and the model threw it away.
 *
 * That is structural rather than a coding error, and it stays true of any model
 * in which both responses can only happen when the learner does not know. The
 * two separate only if **knowing can also produce a wrong answer**:
 *
 *     P(correct) = known·(1 − s) + (1 − known)·c
 *     P(wrong)   = known·s       + (1 − known)·(1 − c)
 *     P(unknown) =                 1 − known
 *
 * A wrong answer is now compatible with knowing the word and mis-tapping; a
 * declared blank is not. So the blank is strictly the stronger evidence, which
 * is what the product had been saying all along.
 *
 * ## Why 0.05
 *
 * An A/B against this engine and the shipped bank, 6,000 sittings a cell. Two
 * simulated populations: one that never mis-taps, and one that answers 5% of the
 * words it knows wrongly. Only `SLIP` changes between rows.
 *
 * | slip | MAE, learner never mis-taps | MAE, learner mis-taps 5% |
 * | --- | --- | --- |
 * | 0.00 | 1.314 | 1.747 |
 * | 0.05 | 1.331 | **1.501** |
 *
 * **+0.017 levels against a population that does not exist, −0.246 against the
 * one that does.** Nobody answers a four-option question on a phone for eight
 * minutes without ever hitting the wrong row.
 *
 * The separation the parameter was added for is the other half: at 0.00 it is
 * not merely small, it is **zero to twelve decimal places**, because it is
 * algebraically zero. Setting `SLIP` to zero recovers the previous model
 * exactly, which is how the table above was produced and how a regression in it
 * is caught — `levelTest.test.ts` fails the separation case at zero.
 *
 * These are differences between two runs of the same harness, not the headline
 * accuracy figure: `scripts/level-test-qa.mjs` models the kind plan and pool
 * exhaustion that this A/B does not, and reports a slightly higher absolute
 * error for both. What transfers is the *difference*, which is what the
 * parameter is chosen on.
 */
const SLIP = 0.05;

/**
 * The likelihood of one response at one ability.
 *
 * See `SLIP` for why there are three branches rather than two and a negation.
 */
function likelihood(abilityLevel: number, item: AskedItem): number {
  const known = logistic((abilityLevel - item.level) * LOGITS_PER_LEVEL);
  if (item.response === 'correct') return known * (1 - SLIP) + (1 - known) * GUESS;
  if (item.response === 'unknown') return 1 - known;
  return known * SLIP + (1 - known) * (1 - GUESS);
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

/**
 * The opening ladder: three questions the learner has a fair chance at.
 *
 * A first-time learner starts at level 2 and climbs by two. A returning one
 * starts four levels below the result they already have and climbs by two to
 * meet it — so somebody previously measured at 20 opens on 14, 16, 18 rather
 * than on 14, which is where the prior alone would have put every learner in
 * the product.
 *
 * ## Why the previous result moves the ladder and not the posterior
 *
 * A stored level is evidence about a person on the day it was taken and it is
 * the only thing we have about who is sitting down now, so it is worth using —
 * but a retake exists precisely because the old number may be wrong. Folding it
 * into the prior would drag every retake back toward the old answer, and the
 * learner would have to out-argue their own history to move.
 *
 * So it steers **where we look first** and nothing else. The posterior is built
 * from this sitting's answers alone, against the same uninformative prior every
 * learner gets. A returning learner who has forgotten everything walks down; one
 * who has doubled their vocabulary walks up; neither is held anywhere.
 */
export function warmupLadder(previousLevel: number | null): number[] {
  const clamp = (level: number) => Math.min(LEVELS, Math.max(1, level));
  const base = previousLevel === null ? 4 : Math.max(1, Math.round(previousLevel) - 4);
  const start = Math.max(1, base - 2);
  return [start, start + 2, start + 4].map(clamp);
}

/** Which phase of the sitting item number `index` belongs to. */
export type Phase = 'warmup' | 'adaptive' | 'confirm';

export function phaseOf(index: number): Phase {
  if (index < WARMUP_ITEMS) return 'warmup';
  if (index >= CONFIRM_FROM) return 'confirm';
  return 'adaptive';
}

/** The nearest level in `available` to `wanted`, preferring the lower on a tie. */
function snap(wanted: number, available: readonly number[]): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const level of available) {
    const distance = Math.abs(level - wanted);
    if (distance < bestDistance || (distance === bestDistance && best !== null && level < best)) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

/** The levels asked in the last `REPEAT_LIMIT` questions. */
function recentLevels(asked: readonly AskedItem[]): number[] {
  return asked.slice(-REPEAT_LIMIT).map((item) => item.level);
}

/** Whether asking `level` now would make it `REPEAT_LIMIT + 1` in a row. */
function wouldRepeat(level: number, asked: readonly AskedItem[]): boolean {
  const recent = recentLevels(asked);
  return recent.length >= REPEAT_LIMIT && recent.every((seen) => seen === level);
}

export interface NextLevelOptions {
  /**
   * The level a previous sitting reported, if there is one.
   *
   * Read only by the warm-up. See `warmupLadder` for why it never reaches the
   * posterior.
   */
  previousLevel?: number | null;
}

/**
 * The level to ask next.
 *
 * Three rules run in order, and each of them exists because a learner met the
 * behaviour it prevents:
 *
 * 1. **Warm-up.** The first `WARMUP_ITEMS` come off `warmupLadder`, not off the
 *    estimator, so nobody opens an assessment on a word from the middle of the
 *    scale.
 * 2. **A bounded step.** Whatever the estimator wants, the next level is within
 *    `MAX_STEP` of the last one. The walk is therefore always readable as a walk.
 * 3. **No level three times running.** The information function is flat at the
 *    ends of the scale, so an unbounded argmax parks there; `REPEAT_LIMIT` moves
 *    it off and keeps the sitting varied without moving it far.
 *
 * Within those, the choice is still the most informative item available — the
 * adaptive part is intact, it is only prevented from being abrupt.
 */
export function nextLevel(
  asked: readonly AskedItem[],
  available: readonly number[],
  options: NextLevelOptions = {},
): number | null {
  if (available.length === 0) return null;
  const clamp = (level: number) => Math.min(LEVELS, Math.max(1, level));
  const index = asked.length;
  const phase = phaseOf(index);

  if (phase === 'warmup') {
    const ladder = warmupLadder(options.previousLevel ?? null);
    return snap(ladder[index] ?? ladder[ladder.length - 1]!, available);
  }

  const where = estimate(asked).level;
  const last = asked[asked.length - 1]!.level;
  const low = last - MAX_STEP;
  const high = last + MAX_STEP;

  /*
    In confirmation the target is the estimate itself, nudged a level either
    side on a fixed cycle. The nudge is what stops the last four questions being
    four copies of the same item level, and it is fixed rather than random so
    that a resumed sitting asks the same things in the same order.
  */
  let wanted = where;
  if (phase === 'confirm') {
    const offsets = [0, 1, -1, 0];
    wanted = clamp(Math.round(where) + offsets[(index - CONFIRM_FROM) % offsets.length]!);
  }

  const inStep = available.filter((level) => level >= low && level <= high);
  const candidates = inStep.length > 0 ? inStep : available;

  /*
    Rank by information about the *current* estimate, not about the nudged
    target: the nudge says where to look, the information says which of the
    levels we may look at is worth the question. In the adaptive phase the two
    agree; in confirmation the nudge deliberately spends a little information to
    buy a spread of evidence around the answer.
  */
  const score = (level: number) =>
    phase === 'confirm' ? -Math.abs(level - wanted) : information(where, level);

  const ordered = [...candidates].sort((a, b) => {
    const difference = score(b) - score(a);
    if (Math.abs(difference) > 1e-12) return difference;
    // Deterministic tie-break, so two sittings with the same answers agree.
    return Math.abs(a - wanted) - Math.abs(b - wanted) || a - b;
  });

  const fresh = ordered.find((level) => !wouldRepeat(level, asked));
  return fresh ?? ordered[0] ?? null;
}

/**
 * Whether the sitting is over.
 *
 * The ceiling always ends it. Between the floor and the ceiling it ends when the
 * posterior has stopped moving — `STOP_SE` — which is the only thing left the
 * remaining questions could change. Below the floor nothing ends it, so a lucky
 * opening run cannot cut an assessment short.
 */
export function shouldStop(asked: readonly AskedItem[]): boolean {
  if (asked.length >= MAX_ITEM_COUNT) return true;
  if (asked.length < MIN_ITEM_COUNT) return false;
  return estimate(asked).se <= STOP_SE;
}

/**
 * Which item to take from a pool, without a random number generator.
 *
 * A sitting has to be reproducible: it is written to the device after every
 * answer so that closing the app does not throw it away, and a resumed sitting
 * that re-rolled its choices would show the learner different questions than the
 * ones it had already scored them on. So the choice is a pure function of the
 * sitting's seed and the question's index — `Math.random()` cannot be resumed,
 * and a stored list of every future question would be a second source of truth.
 *
 * FNV-1a, which is not a cryptographic hash and does not need to be. What it
 * needs is to be the same on every device and in the test suite, and to spread a
 * short seed over a pool of a few dozen.
 */
export function pickIndex(seed: string, index: number, size: number): number {
  if (size <= 0) return 0;
  let hash = 0x811c9dc5;
  const material = `${seed}#${index}`;
  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % size;
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
