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
 * And a smaller one upward, because the two directions are not symmetrical.
 *
 * Going down after a miss is the test agreeing with the learner, and it should
 * happen at the speed of the evidence. Going up is the test *disagreeing* with
 * where it just put them, on the strength of one answer that may have been a
 * guess — the four-option floor means one correct answer in four carries no
 * information at all — and doing that three levels at a time is what "it got
 * hard very fast after I got one right" describes.
 *
 * Capping the climb at two while leaving the descent at three is what moved the
 * share of questions asked above the running estimate under its ceiling: 23.7%
 * before either change, 18.4% with both. It is also what makes the walk of a
 * learner who gets everything right read as a walk — 2, 4, 6, 8, 10, 12 rather
 * than 2, 4, 6, 9, 12, 15 — which is the complaint this pass was given: that
 * one correct answer made the test noticeably harder.
 */
export const MAX_STEP_UP = 2;

/**
 * Consecutive correct answers that earn the wider step back.
 *
 * Capping the climb at two is right for *one* answer, which may have been a
 * guess, and wrong as a permanent ceiling: a learner who answers twenty
 * questions correctly has given the sitting all the evidence there is, and with
 * a hard cap of two they finished at 29 rather than 30 because the walk ran out
 * of questions before it ran out of scale.
 *
 * So the wide step is not removed, it is *earned*. **Eight** consecutive correct
 * answers, and one wrong answer or one *I don't know* takes it away again
 * immediately — which is the asymmetry the whole rule is about.
 *
 * Eight rather than three, and the difference matters enough to say why. Three
 * is reachable by luck: a four-option question is guessed correctly a quarter of
 * the time, so three in a row happens to a learner who knows none of them about
 * once in sixty-four sittings, and the reward for it is the *widest* move the
 * test can make. Eight is once in sixty-five thousand. The cost is confined to
 * the one learner it was added for — somebody answering everything correctly
 * still reaches level 30 inside thirty questions, because the climb only needs
 * the wide step at the very top of the scale — and `levelTest.test.ts` asserts
 * both ends: that eight correct answers unlock it and that seven do not.
 *
 * This paragraph said "three" for two cycles while the constant said eight. The
 * code was right and the prose was stale, which is worse than either being
 * wrong on its own: `levelTest.test.ts` now reads the constant rather than a
 * literal, so a change to one cannot leave the other behind, and it asserts the boundary in both directions.
 */
export const SUSTAINED_CORRECT = 8;

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
 * One adaptive question in every `EASY_EVERY` is asked below the estimate.
 *
 * The sitting was measured before this existed: over 157,799 adaptive questions
 * across 200 sittings at each of the 30 levels, **23.7%** were above the running
 * estimate and only 32.3% below it. A test that asks a learner something harder
 * than its own guess about them nearly a quarter of the time is a test that
 * feels hard, and that is what it was reported as.
 *
 * The information function does not care: an item at the estimate is the most
 * informative one, so an unconstrained selector sits there and drifts upward
 * whenever the bracket's midpoint is above the mean. Nothing was wrong with the
 * estimator; what was missing was a floor under the *experience*.
 *
 * One in five, dropped by one, is the measured choice rather than a guess. A
 * bigger drop is not a better one: one in three at two levels down pushed the
 * below-estimate share to 48%, pulled the at-estimate share under its band, and
 * cost accuracy, because a question two levels below the estimate carries
 * little information about it. One in five at a single level down puts all
 * three shares inside their bands — 40.1% below, 41.4% at, 18.4% above — and
 * leaves the sitting placing 90.0% of simulated learners within ±3 levels.
 *
 * So a fixed cadence, not a random one — a resumed sitting has to ask the same
 * questions in the same order, which is the same reason the confirmation nudge
 * below is a cycle rather than a coin. The dropped question is still scored,
 * still informative, and still counts: it is an ordinary item that the learner
 * has a good chance of answering, which is what a confirmation question is.
 */
export const EASY_EVERY = 5;
/** How far below the estimate those questions are drawn. */
export const EASY_DROP = 1;

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
 * Chance that somebody who knows a word declines it anyway.
 *
 * ## The half of the model that was missing
 *
 * The previous pass added `SLIP` so that a *wrong* answer no longer proved the
 * learner did not know the word — they might have mis-tapped. It left the other
 * branch absolute: `P(unknown) = 1 − known`, which says that a learner who knows
 * a word **never** presses *I don't know*.
 *
 * That is false about people and it was catastrophic in one specific case. Six
 * declines on level-1 and level-2 words, from a learner who then answered
 * twenty-three consecutive questions correctly at levels 28 to 30, produced a
 * reported level of **2**. The model was not confused; it was following its own
 * assumption to the only conclusion available. At θ=30 a decline on a level-1
 * word had probability 0.0002, so six of them cost 10²³ — a hole no amount of
 * later evidence could climb out of. It preferred the theory that a level-2
 * learner guessed right twenty-three times in a row.
 *
 * Real learners decline words they know: they misread the item, second-guess a
 * meaning they half-remember, or hit the wrong control on a phone in the first
 * seconds of an unfamiliar screen. Without a term for that, the first two
 * minutes of a sitting can bound the result for good.
 *
 * ## Why 0.03 and not `SLIP`
 *
 * Declining a word you know is rarer than fat-fingering one, and the gap has to
 * be real: at `DECLINE` = `SLIP` the two responses become equally strong
 * evidence at the top of the ability range, which is the degeneracy the slip
 * term was added to remove. 0.03 keeps *I don't know* strictly the stronger
 * signal of non-mastery at every ability, and still leaves an early blank
 * recoverable. `scripts/level-test-qa.mjs` sweeps it.
 */
const DECLINE = 0.03;

/**
 * Chance that a learner who does *not* know a word declines it.
 *
 * 0.375, and the number is forced rather than chosen. A learner who does not
 * know the word either guesses or declines, and the guessing branch is pinned by
 * the format: four options, so a quarter of guesses land. That leaves 0.75 to
 * split between wrong and declined, and the product offers *I don't know* at the
 * same weight as an answer, so it splits evenly.
 *
 * Getting this wrong is not cosmetic. A first attempt made the decline rate 0.5
 * *of the not-known mass*, which quietly dropped the chance of a lucky correct
 * answer from 0.25 to 0.125 — and a model that thinks correct answers are twice
 * as hard to fake reads them as twice the evidence. Every simulated learner
 * between levels 9 and 18 was placed **2.2 levels too high**. The guessing floor
 * has to stay where the format puts it.
 */
const UNSURE_DECLINES = 0.375;

/**
 * The likelihood of one response at one ability.
 *
 * A proper conditional distribution over the three responses: a learner who
 * knows the word answers it, slips, or declines; one who does not know it
 * declines or guesses. The three branches sum to one at every ability, which
 * matters — an improper set makes the relative weight of *wrong* against
 * *unknown* drift with ability for no reason anybody chose.
 */
function likelihood(abilityLevel: number, item: AskedItem): number {
  const known = logistic((abilityLevel - item.level) * LOGITS_PER_LEVEL);
  const unsure = 1 - known;
  if (item.response === 'correct') return known * (1 - SLIP - DECLINE) + unsure * GUESS;
  if (item.response === 'unknown') return known * DECLINE + unsure * UNSURE_DECLINES;
  return known * SLIP + unsure * (1 - GUESS - UNSURE_DECLINES);
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

/** Which phase of the sitting the next question belongs to. */
export type Phase = 'warmup' | 'adaptive' | 'confirm';

/**
 * How narrow the bracket must be before the sitting stops searching.
 *
 * Two levels. Confirmation is for testing the number that will be reported, and
 * a bracket wider than that is not yet a number — it is a region. Swept against
 * the simulated learner: 3 gives 90.5% of sittings within ±3 levels and 2 gives
 * 90.7%, for two tenths of a question. Requiring 22 items instead of 20 buys
 * another half a point and was not taken — the floor only binds on learners the
 * sitting has already finished with, so those two questions are spent on
 * somebody who has nothing left to tell us. The
 * shipped build entered confirmation at a fixed question index instead, which
 * meant a learner still climbing at question sixteen was cut off mid-climb and
 * scored where the walk happened to be: a true level-30 learner who opened with
 * six blanks reported **2**, having been switched back to a posterior that the
 * remaining questions were then chosen to confirm.
 */
export const CONFIRM_WIDTH = 2;

/** Whether the sitting has found the region the learner is in. */
export function converged(asked: readonly AskedItem[]): boolean {
  const bounds = bracket(asked);
  return bounds.bracketed && bounds.upperBound - bounds.lowerBound <= CONFIRM_WIDTH;
}

export function phaseOf(asked: readonly AskedItem[]): Phase {
  const index = asked.length;
  if (index < WARMUP_ITEMS && !asked.some((item) => item.response !== 'correct')) return 'warmup';
  if (index >= CONFIRM_FROM && converged(asked)) return 'confirm';
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

/**
 * Where the learner's level plausibly sits, from the answers so far.
 *
 * ## Why the posterior alone could not choose the next question
 *
 * The estimator is the right thing to *score* with and the wrong thing to
 * *steer* with, and the previous pass found that out the expensive way. Bounding
 * the step at three levels fixed a test that swung six levels between questions,
 * and it rate-limited the walk to however fast the posterior mean moves — which,
 * under a deliberately weak prior, is slowly. Measured on the shipped build:
 *
 * | true level | first six answered *I don't know* | reported |
 * | --- | --- | --- |
 * | 20 | yes | **7** |
 * | 25 | yes | **7** |
 * | 30 | yes | **7** |
 *
 * With no early misses the same walk reported 20, 25 and 29 exactly. So nothing
 * was wrong with the scoring and nothing was wrong with the bank: a learner who
 * was nervous, or who simply did not know the three warm-up words, could not
 * climb back within thirty questions. That is a worse defect than the one the
 * previous pass fixed, because it under-places the strongest learners by up to
 * twenty-three levels and looks like a plausible result on the way out.
 *
 * ## The bracket
 *
 * Two numbers, both derived from the response history rather than stored:
 *
 * * `lowerBound` — the highest level the learner has answered correctly at.
 * * `upperBound` — the lowest level they have missed or declined.
 *
 * Selection targets the middle of that bracket, so the *internal* target moves
 * as fast as the evidence does. The presented difficulty is still bounded by
 * `MAX_STEP`, so what the learner sees is still a walk. Those are two different
 * questions and separating them is the whole fix.
 *
 * ## Contradictions reopen the other side
 *
 * A learner is not a monotone function. Answering correctly *above* the upper
 * bound means the evidence that set it has been contradicted, so the bound is
 * reopened rather than nudged — and symmetrically at the bottom. Without that,
 * six early blanks pin `upperBound` at 1 and no amount of later success can lift
 * it: the recovery case above is exactly a learner trapped under a bound that
 * their own answers had already disproved.
 *
 * Reopening cannot let one lucky guess decide anything, because the bracket
 * never scores. It chooses what to ask; `estimate` decides what it meant, with
 * the guessing floor and the slip term intact.
 */
export interface Bracket {
  /** Highest level answered correctly, or 1 when there is none yet. */
  lowerBound: number;
  /** Lowest level missed or declined, or `LEVELS` when there is none yet. */
  upperBound: number;
  /** The posterior mean, rounded — what the sitting would report right now. */
  currentEstimate: number;
  /** True once both ends have been pinned by real evidence. */
  bracketed: boolean;
}

/**
 * How much contradicting evidence reopens a bound.
 *
 * Two answers, consecutively. One is not enough and the arithmetic says why: a
 * four-option question is answered correctly by luck a quarter of the time, so
 * a single correct answer above the upper bound is a coin the learner had a 25%
 * chance of flipping. Reopening on it biased every simulated learner upward by
 * about two levels, because the walk kept being sent above them by guesses and
 * the posterior followed.
 *
 * Two in a row is 6%, and the run resets on any miss. That is also the concrete
 * form of the rule that no single answer may decide anything: one answer cannot
 * move a bound outward, and bounds are the only thing that steers.
 */
const CONTRADICTIONS_TO_REOPEN = 2;

export function bracket(asked: readonly AskedItem[]): Bracket {
  let lower = 0;
  let upper = LEVELS + 1;
  let above = 0;
  let below = 0;
  for (const item of asked) {
    if (item.response === 'correct') {
      below = 0;
      if (item.level >= upper) {
        above += 1;
        if (above >= CONTRADICTIONS_TO_REOPEN) {
          upper = LEVELS + 1;
          above = 0;
        }
      } else {
        above = 0;
      }
      lower = Math.max(lower, Math.min(item.level, upper - 1));
    } else {
      above = 0;
      if (item.level <= lower) {
        below += 1;
        if (below >= CONTRADICTIONS_TO_REOPEN) {
          lower = 0;
          below = 0;
        }
      } else {
        below = 0;
      }
      upper = Math.min(upper, Math.max(item.level, lower + 1));
    }
  }
  const settled = estimate(asked);
  const lowerBound = Math.max(1, Math.min(lower, LEVELS));
  const upperBound = Math.min(LEVELS, Math.max(upper, 1));
  /*
    An end is closed by evidence *or* by the scale.

    A learner who declines everything down to level 1 has produced no correct
    answer, so `lower` never moves — and yet the interval is closed, because
    there is nothing below level 1 to search. The same holds at the ceiling for a
    learner who answers everything correctly at level 30. Requiring evidence on
    both sides left exactly those two learners — the ones the sitting can be
    most certain about — running to the full thirty questions.
  */
  return {
    lowerBound,
    upperBound,
    currentEstimate: settled.reported,
    bracketed: (lower > 0 || upperBound <= 1) && (upper <= LEVELS || lowerBound >= LEVELS),
  };
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
  const phase = phaseOf(asked);

  /*
    The ladder is an offer, not a schedule.

    It climbs 2, 4, 6 for a learner who is getting them right, and it stops the
    moment one is missed — because a learner who has just said *I don't know*
    to a level-2 word must not be shown level 4 next. The shipped build did
    exactly that: the first three questions were fixed, so the gentlest opening
    in the product was also the one place a struggling learner could not escape.
  */
  if (phase === 'warmup') {
    const ladder = warmupLadder(options.previousLevel ?? null);
    return snap(ladder[index] ?? ladder[ladder.length - 1]!, available);
  }

  const where = estimate(asked).level;
  const last = asked[asked.length - 1]!.level;
  const low = last - MAX_STEP;
  /*
    The climb is capped at `MAX_STEP_UP` until the learner has earned
    `SUSTAINED_CORRECT` in a row. The streak is trailing, so one miss removes it.
  */
  let streak = 0;
  for (let at = asked.length - 1; at >= 0 && asked[at]!.response === 'correct'; at -= 1) streak += 1;
  const high = last + (streak >= SUSTAINED_CORRECT ? MAX_STEP : MAX_STEP_UP);

  /*
    The target is the middle of the bracket, not the posterior mean.

    See `Bracket` for why. The short version: the mean is what the sitting
    *concludes*, and it moves at the speed of accumulated evidence; the bracket
    is what the sitting still needs to find out, and it moves at the speed of
    the last answer. Steering by the second and scoring by the first is what
    lets a learner who opens badly climb twenty levels inside a sitting while
    never seeing a jump of more than three.
  */
  /*
    Search, then refine.

    While the bracket is wide the sitting does not yet know where the learner is,
    and the fastest way to find out is to halve the interval — so the target is
    its midpoint. Once the bracket has closed to `CONFIRM_WIDTH` the question
    changes from *where are they* to *exactly where in here*, and the posterior
    mean is the better target for that: it is where an item carries the most
    information about the number that will be reported.

    Using the midpoint for both cost 0.3 levels of mean absolute error, because
    a bracket that has already found the region keeps asking its middle rather
    than the estimate inside it.
  */
  const bounds = bracket(asked);
  let wanted = converged(asked) ? where : (bounds.lowerBound + bounds.upperBound) / 2;

  /*
    One adaptive question in every `EASY_EVERY` is drawn below the estimate —
    the cadence is one in five, and this comment said "every third" while the
    constant said five.

    Counted from the end of the warm-up so that the cadence is a property of the
    adaptive phase rather than of the sitting, and applied before the step bound
    below, so an easy question is still within `MAX_STEP` of the last one and
    the walk stays readable.
  */
  const adaptiveIndex = index - WARMUP_ITEMS;
  if (adaptiveIndex >= 0 && adaptiveIndex % EASY_EVERY === EASY_EVERY - 1) {
    wanted = clamp(wanted - EASY_DROP);
  }

  /*
    In confirmation the target is the estimate itself, nudged a level either
    side on a fixed cycle. The nudge is what stops the last four questions being
    four copies of the same item level, and it is fixed rather than random so
    that a resumed sitting asks the same things in the same order.

    Confirmation deliberately returns to the posterior: by then the bracket has
    done its job of finding the region, and what the last questions are for is
    testing the number that will actually be reported.
  */
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
  /*
    Ranked by distance to the target rather than by information about the
    posterior. Fisher information peaks near the *mean*, which is the thing the
    bracket exists to stop steering by; ranking by information would put the
    mean back in charge through the side door. Information still decides the
    scoring model and still explains why an item near the learner's level is
    worth asking — it is simply no longer the thing that picks the level.
  */
  const score = (level: number) => -Math.abs(level - wanted);

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
  /*
    Both, not either. The posterior can be confident about a learner the walk
    has not finished finding — that is exactly what happened to the level-30
    learner who opened with six blanks — so the bracket has to have closed too.
  */
  return converged(asked) && estimate(asked).se <= STOP_SE;
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
