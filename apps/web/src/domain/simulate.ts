import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { blankProgress } from '../storage/schema';
import {
  CHARACTER_SKILLS,
  WORD_SKILLS,
  applyReview,
  memoryKey,
  type MemoryMap,
  type Skill,
} from './memory';
import { recallProbability } from './memory';
import { reviewIntervalDays } from './mastery';
import { buildSession, SESSION_SIZE, type ExerciseMode } from './review';

/**
 * A synthetic learner, and two schedulers to run them past.
 *
 * ## Why simulate at all
 *
 * A scheduling change cannot be validated by using the app. The claim being
 * made is about what happens over weeks — *this learner will be asked ㅓ before
 * they forget it, and will not be asked 물 four times in a fortnight* — and
 * the only honest ways to check it are to wait six weeks or to model it. So
 * this models it, and `review.test.ts` asserts on the result.
 *
 * ## What the model is, and what it is not
 *
 * The learner has a hidden true memory per item and per skill that the
 * scheduler cannot see: a stability that grows when they are asked and get it
 * right, decays with time, and differs by skill because a learner really is
 * better at reading than at listening. Whether they answer correctly is drawn
 * from their true recall probability.
 *
 * It is **not** a claim about real learners. Nobody's memory is an exponential,
 * the parameters are chosen rather than fitted, and no human took part. What a
 * simulation can establish is a *relative* fact — that under one stated model
 * of forgetting, this scheduler produces fewer forgetting events and fewer
 * wasted questions than the fixed-interval one it replaces — and that is the
 * only claim made from it. See `docs/report.md`.
 */

const DAY = 86_400_000;

/**
 * The learner's hidden memory is parameterised the same way the scheduler's is.
 *
 * `stability` is the number of days until recall falls to `TARGET_RECALL`, in
 * both. That is not a coincidence to be tidied away: if the truth used an
 * e-folding time and the scheduler used a time-to-0.88, the two would differ by
 * a factor of eight and the benchmark would be measuring a unit mismatch rather
 * than a scheduling difference. What the simulation tests is whether the
 * scheduler *estimates* the hidden stability well from the answers it sees —
 * which requires both to mean the same thing by the word.
 */
const START_STABILITY = 1;

export interface LearnerProfile {
  name: string;
  /** How well this learner does at each skill, 0..1. Lower is worse. */
  aptitude: Partial<Record<Skill, number>>;
  /** Overall memory strength multiplier. */
  retention: number;
  /** Days the learner skips entirely, as a set of day indices. */
  away?: (day: number) => boolean;
  /** Pairs this learner genuinely mixes up, as `a` chosen when asked for `b`. */
  confuses?: Record<string, string>;
}

interface TrueMemory {
  stability: number;
  lastSeen: number;
  seen: boolean;
}

/** A deterministic generator. No `Math.random`: a flaky benchmark is not one. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export interface SimulationResult {
  scheduler: string;
  profile: string;
  /** Exercises asked in total. */
  asked: number;
  /**
   * Askings that came too late — the skill had been exercised before, and by
   * the time it came round again the learner's true recall was under
   * `FORGOTTEN`.
   *
   * Counted only for skills the scheduler had *already* exercised, and that
   * restriction is the whole honesty of the measure. Counting every asking
   * where recall was low would reward a scheduler for never asking: the fixed
   * one only ever tests writing, so it would score zero lateness by leaving
   * four skills per item permanently untouched. This measures being late,
   * which is a scheduling failure, and `retained` measures the coverage
   * failure separately.
   */
  forgotten: number;
  /** Askings that were too late, as a share of the repeat askings that could be. */
  lateRate: number;
  /**
   * Items asked when the learner certainly still had them — true recall over
   * `WASTED`. Lower is better: the scheduler spent a question on nothing.
   */
  wasted: number;
  /** Exercises answered correctly. */
  correct: number;
  /** The most times any one item was asked in a single sitting. */
  worstRepetition: number;
  /** How many distinct skills were ever exercised. */
  skillsExercised: number;
  /**
   * Share of exercises spent on the skills this learner is actually bad at.
   *
   * Compared against `uniformShare` rather than against a fixed number: what is
   * being claimed is that the scheduler *notices*, and the only way to say so
   * is that the weak skills got more than their share of a blind rotation.
   */
  weakSkillShare: number;
  /** What that share would be if exercises were spread evenly over all skills. */
  uniformShare: number;
  /** Mean days between two askings of the same item and skill, first third. */
  earlyGap: number;
  /** And the last third. Growing intervals means this is larger. */
  lateGap: number;
  /** Items the learner had lost four or more times by the end. */
  chronic: number;
  /**
   * Mean true recall across **every** item and skill on the final day.
   *
   * The outcome measure, and the one a learner would recognise: how much of
   * what they were taught do they still have. It is the number a scheduler
   * cannot improve by asking fewer questions, because the skills it declines
   * to exercise still count.
   */
  retained: number;
  /** And for guided writing alone — the one skill both schedulers exercise. */
  retainedWriting: number;
  /**
   * The same recall, summed rather than averaged.
   *
   * The comparison that is actually like for like. A mean rewards a scheduler
   * for *narrowing*: the fixed one exercises writing and nothing else, so four
   * skills in five decay untouched and its mean is dragged down by things it
   * chose not to teach — while its *per-covered-slot* mean looks excellent for
   * the same reason. The sum asks the question a learner would: after sixty
   * days of the same daily budget, how much of what I was taught do I still
   * have, in total.
   */
  retainedTotal: number;
  /** Item-and-skill pairs the scheduler ever exercised at all. */
  covered: number;
  /** Mean recall over just those. High for a scheduler that covers little. */
  retainedCovered: number;
  /**
   * The mean interval the scheduler had arrived at by the end, in days.
   *
   * The direct statement of "intervals grow steadily": a learner who is always
   * right should end up on long intervals and one who keeps failing should not.
   */
  meanInterval: number;
}

/** True recall below which the learner has, for the purposes of the count, forgotten. */
export const FORGOTTEN = 0.5;

/** And above which asking was not worth the question. */
export const WASTED = 0.97;

export interface SimulationOptions {
  days: number;
  items: Array<{ kind: ItemProgress['kind']; key: string }>;
  profile: LearnerProfile;
  seed?: number;
  sessionSize?: number;
}

/** The hidden state, shared by both schedulers so the comparison is fair. */
function makeLearner(options: SimulationOptions) {
  const truth = new Map<string, TrueMemory>();
  const random = rng(options.seed ?? 7);

  const key = (item: string, skill: Skill) => `${item}/${skill}`;

  return {
    random,
    /** Whether the learner answers correctly, and how strongly. */
    answer(item: string, skill: Skill, day: number): { passed: boolean; recall: number } {
      const recall = this.recallOf(item, skill, day);
      const aptitude = options.profile.aptitude[skill] ?? 1;
      const passed = random() < recall * aptitude;
      return { passed, recall };
    },
    /** Folds the exposure into the hidden memory. */
    study(item: string, skill: Skill, day: number, passed: boolean): void {
      const id = key(item, skill);
      const state = truth.get(id) ?? { stability: START_STABILITY, lastSeen: day, seen: false };
      const aptitude = options.profile.aptitude[skill] ?? 1;
      /*
       * A weak skill grows more slowly. It does not shrink.
       *
       * The first version multiplied the growth by aptitude, which for a
       * 0.35 aptitude gave 1.9 × 0.35 = 0.67 — practising the thing you are
       * bad at made your memory of it *worse*, forever. That is not a model of
       * a learner, it is a model of a curse, and it made the benchmark punish
       * the adaptive scheduler for correctly spending time on weaknesses.
       */
      const growth = 1 + (1.9 * options.profile.retention - 1) * aptitude;
      truth.set(id, {
        stability: passed
          ? state.stability * Math.max(1.05, growth)
          : Math.max(0.4, state.stability * 0.5),
        lastSeen: day,
        seen: true,
      });
    },
    recallOf(item: string, skill: Skill, day: number): number {
      const state = truth.get(key(item, skill));
      // Every item in the simulation has been through a lesson — that is what
      // `stage: 'learned'` means — so an unpractised skill is not unknown, it
      // is a day-old memory nobody has tested.
      const stability = state?.stability ?? START_STABILITY;
      const since = day - (state?.lastSeen ?? 0);
      return recallProbability(since, stability);
    },
  };
}

/**
 * The scheduler this cycle replaced, reimplemented exactly.
 *
 * One due date per *item*, from the 1/3/7/21 ladder in `mastery.ts`, and every
 * review is a writing exercise — which is what the app could actually offer.
 * Reimplemented here rather than kept alive in the product so the comparison is
 * against the real thing and the product carries no dead scheduler.
 */
function fixedIntervalSession(
  progress: Record<string, ItemProgress>,
  due: Map<string, { at: number; streak: number; fails: number }>,
  day: number,
  size: number,
): Array<{ kind: ItemProgress['kind']; itemKey: string; skill: Skill; mode: ExerciseMode }> {
  const ready = Object.values(progress)
    .map((row) => ({ row, state: due.get(memoryKey(row.kind, row.item_key)) }))
    .filter((entry) => entry.state && entry.state.at <= day)
    .sort((a, b) => a.state!.at - b.state!.at || b.state!.fails - a.state!.fails)
    .slice(0, size);
  return ready.map(({ row }) => ({
    kind: row.kind,
    itemKey: row.item_key,
    skill: 'guided_writing' as Skill,
    mode: 'write' as ExerciseMode,
  }));
}

export function simulate(options: SimulationOptions): {
  adaptive: SimulationResult;
  fixed: SimulationResult;
} {
  return {
    adaptive: run(options, 'adaptive'),
    fixed: run(options, 'fixed 1/3/7/21'),
  };
}

function run(options: SimulationOptions, scheduler: string): SimulationResult {
  const learner = makeLearner(options);
  const size = options.sessionSize ?? SESSION_SIZE;
  const now = (day: number) => new Date(Date.UTC(2026, 0, 1) + day * DAY);

  /*
   * Items enter the curriculum as the learner reaches them, not all on day one.
   *
   * With every item learned on day zero, a skill first tested on day forty-five
   * is a forty-five-day-old memory and is certain to fail — so the scheduler
   * that covers more skills is charged with a failure that is really an artefact
   * of the setup. A learner meets ㄱ in week one and 학교 in week four, and both
   * schedulers see the same staggered arrival.
   */
  const introducedOn = new Map<string, number>();
  options.items.forEach((item, index) => {
    introducedOn.set(
      memoryKey(item.kind, item.key),
      Math.floor((index * options.days) / (options.items.length * 2)),
    );
  });

  const progress: Record<string, ItemProgress> = {};
  const addItem = (item: (typeof options.items)[number]) => {
    const row = blankProgress(item.kind, item.key, now(0).toISOString());
    progress[memoryKey(item.kind, item.key)] = { ...row, stage: 'learned', learned: true };
  };

  let memory: MemoryMap = {};
  const due = new Map<string, { at: number; streak: number; fails: number }>();
  for (const item of options.items) due.set(memoryKey(item.kind, item.key), { at: 0, streak: 0, fails: 0 });

  const result: SimulationResult = {
    scheduler,
    profile: options.profile.name,
    asked: 0,
    forgotten: 0,
    wasted: 0,
    correct: 0,
    worstRepetition: 0,
    skillsExercised: 0,
    weakSkillShare: 0,
    uniformShare: 0,
    lateRate: 0,
    earlyGap: 0,
    lateGap: 0,
    chronic: 0,
    retained: 0,
    retainedWriting: 0,
    retainedTotal: 0,
    covered: 0,
    retainedCovered: 0,
    meanInterval: 0,
  };
  const skillsSeen = new Set<Skill>();
  const perSkill = new Map<Skill, number>();
  const lastAsked = new Map<string, number>();
  const gaps: Array<{ day: number; gap: number }> = [];
  let repeats = 0;

  // Every skill the learner is measurably worse at, not only the worst one: a
  // profile that is bad at listening is bad at it for both characters and
  // words, and those are two different skill names.
  const weak = new Set(
    Object.entries(options.profile.aptitude)
      .filter(([, value]) => (value ?? 1) < 1)
      .map(([name]) => name as Skill),
  );

  for (let day = 0; day < options.days; day += 1) {
    for (const item of options.items) {
      const id = memoryKey(item.kind, item.key);
      if (!progress[id] && (introducedOn.get(id) ?? 0) <= day) {
        addItem(item);
        // Learning it in a lesson *is* an exposure: the learner heard it, wrote
        // it and read it. Both schedulers inherit the same starting memory.
        for (const skill of item.kind === 'word' ? WORD_SKILLS : CHARACTER_SKILLS) {
          learner.study(item.key, skill, day, true);
        }
      }
    }
    if (options.profile.away?.(day)) continue;

    const queue =
      scheduler === 'adaptive'
        ? buildSession(progress, memory, now(day), { size })
        : fixedIntervalSession(progress, due, day, size);

    const seenToday = new Map<string, number>();
    for (const candidate of queue) {
      const id = memoryKey(candidate.kind, candidate.itemKey);
      seenToday.set(id, (seenToday.get(id) ?? 0) + 1);
      skillsSeen.add(candidate.skill);
      perSkill.set(candidate.skill, (perSkill.get(candidate.skill) ?? 0) + 1);

      const gapKey = `${id}/${candidate.skill}`;
      const previous = lastAsked.get(gapKey);
      if (previous !== undefined) gaps.push({ day, gap: day - previous });
      lastAsked.set(gapKey, day);

      const before = learner.recallOf(candidate.itemKey, candidate.skill, day);
      const { passed } = learner.answer(candidate.itemKey, candidate.skill, day);
      learner.study(candidate.itemKey, candidate.skill, day, passed);

      result.asked += 1;
      if (passed) result.correct += 1;
      if (previous !== undefined) {
        repeats += 1;
        if (before < FORGOTTEN) result.forgotten += 1;
      }
      if (before > WASTED) result.wasted += 1;

      if (scheduler === 'adaptive') {
        memory = {
          ...memory,
          [id]: applyReview(
            memory[id],
            candidate.kind,
            candidate.itemKey,
            {
              skill: candidate.skill,
              passed,
              score: passed ? 1 : 0,
              ...(options.profile.confuses?.[candidate.itemKey] && !passed
                ? { confusedWith: options.profile.confuses[candidate.itemKey]! }
                : {}),
            },
            now(day),
          ),
        };
      } else {
        const state = due.get(id)!;
        const streak = passed ? state.streak + 1 : 0;
        const fails = state.fails + (passed ? 0 : 1);
        due.set(id, {
          at: day + (passed ? reviewIntervalDays(streak, { score: 1, fails }) : 1),
          streak,
          fails,
        });
      }
    }
    result.worstRepetition = Math.max(result.worstRepetition, ...seenToday.values(), 0);
  }

  result.skillsExercised = skillsSeen.size;
  const weakAsked = [...weak].reduce((total, skill) => total + (perSkill.get(skill) ?? 0), 0);
  result.weakSkillShare = result.asked > 0 ? weakAsked / result.asked : 0;
  // The share a blind rotation would give those skills: how many of the
  // available item-and-skill slots they account for.
  const slots = options.items.reduce(
    (total, item) => total + (item.kind === 'word' ? 5 : 4),
    0,
  );
  const weakSlots = options.items.reduce(
    (total, item) =>
      total +
      (item.kind === 'word'
        ? WORD_SKILLS.filter((skill) => weak.has(skill)).length
        : CHARACTER_SKILLS.filter((skill) => weak.has(skill)).length),
    0,
  );
  result.uniformShare = slots > 0 ? weakSlots / slots : 0;

  result.lateRate = repeats > 0 ? result.forgotten / repeats : 0;

  // What the learner actually still has, on the last day, across every skill.
  const finals: number[] = [];
  const writing: number[] = [];
  const coveredRecall: number[] = [];
  for (const item of options.items) {
    const skills = item.kind === 'word' ? WORD_SKILLS : CHARACTER_SKILLS;
    for (const skill of skills) {
      const recall = learner.recallOf(item.key, skill, options.days);
      finals.push(recall);
      if (skill === 'guided_writing') writing.push(recall);
      if (lastAsked.has(`${memoryKey(item.kind, item.key)}/${skill}`)) coveredRecall.push(recall);
    }
  }
  const average = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  result.retained = average(finals);
  result.retainedWriting = average(writing);
  result.retainedTotal = finals.reduce((a, b) => a + b, 0);
  result.covered = coveredRecall.length;
  result.retainedCovered = average(coveredRecall);

  const third = options.days / 3;
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  result.earlyGap = mean(gaps.filter((g) => g.day < third).map((g) => g.gap));
  result.lateGap = mean(gaps.filter((g) => g.day >= options.days - third).map((g) => g.gap));
  if (scheduler === 'adaptive') {
    const intervals = Object.values(memory).flatMap((item) =>
      Object.values(item.skills).map((skill) => skill!.stability_days),
    );
    result.meanInterval = intervals.length
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0;
  } else {
    const intervals = [...due.values()].map((state) =>
      reviewIntervalDays(state.streak, { score: 1, fails: state.fails }),
    );
    result.meanInterval = intervals.length
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0;
  }

  result.chronic =
    scheduler === 'adaptive'
      ? Object.values(memory).filter((item) =>
          Object.values(item.skills).some((skill) => (skill?.lapses ?? 0) >= 4),
        ).length
      : [...due.values()].filter((state) => state.fails >= 4).length;

  return result;
}

/** The seven learner profiles the brief names, as a table. */
export const PROFILES: LearnerProfile[] = [
  { name: 'always correct', aptitude: {}, retention: 1.3 },
  { name: 'repeatedly fails', aptitude: {}, retention: 0.55 },
  {
    name: 'reads well, listens badly',
    aptitude: { listening_recognition: 0.35, sound_recognition: 0.35, reading_recognition: 1 },
    retention: 1,
  },
  {
    name: 'writes badly, recognises well',
    aptitude: { guided_writing: 0.35, meaning_recognition: 1, visual_recognition: 1 },
    retention: 1,
  },
  {
    name: 'confuses ㅓ and ㅗ',
    aptitude: { visual_recognition: 0.5 },
    retention: 1,
    confuses: { 'ㅓ': 'ㅗ', 'ㅗ': 'ㅓ' },
  },
  { name: 'stops for 30 days', aptitude: {}, retention: 1, away: (day) => day >= 10 && day < 40 },
  { name: 'brand new', aptitude: {}, retention: 1 },
];
