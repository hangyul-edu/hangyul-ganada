import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ActivityEvent,
  ItemProgress,
  LearnerPreferences,
  LearningSession,
  ProgressSummary,
  SessionKind,
} from '@hangyul-ganada/shared-types';

import { ALL_LETTERS, ALL_CHARACTERS } from '../data/characters';
import { loadCorpusCore, loadCorpusRest } from '../data/corpus';
import { useCorpusMemo } from '../data/useCorpus';
import {
  VOCABULARY,
  corpusReady,
  corpusTotal,
  findWordByHeadword,
  getWord,
  usesKnownLetters,
} from '../data/vocabulary';
import {
  applyAttempt,
  applyDemoSeen,
  applyHeard,
  applyIntroduced,
  applyRecognition,
} from '../domain/mastery';
import {
  dateKey,
  knownLetters as computeKnownLetters,
  learnedToday,
} from '../domain/progress';
import { applyReview, memoryKey, type ItemMemory } from '../domain/memory';
import type { PlacementStatus } from '../domain/placement';
import { levelFromProgress, recentlyIntroduced, teachingLevel } from '../domain/vocabularyLevel';
import { applyAnswer, listMistakes } from '../domain/mistakes';
import { resolvePlan, type PracticePlan } from '../domain/plan';
import { summarise, todaysPractice, type ExerciseMode } from '../domain/review';
import { canAsk } from '../features/review/exercises';
import { canPractise } from '../features/vocabulary/dailyQuestions';
import { strictMeaning } from '../data/wordCopy';
import { LocaleContext } from '../i18n/LocaleContext';
import {
  emptyPlan,
  buildDailyPlan,
  extendDay,
  completeWord,
  dayProgress,
  planIsCurrent,
  rebuildPlanForLevel,
  type DailyPlan,
} from '../domain/vocabularyDay';
import { vocabularyByPriority } from '../data/vocabulary';
import { nextLesson, lessonProgress } from '../domain/progress';
import { learningStreak, recordActivity, recordStudyTime as recordStudyTime_ } from '../domain/activity';
import { MemoryDriver, type PersistenceDriver } from '../storage/driver';
import { openDriver } from '../storage/open';
import {
  ActivityRepository,
  AttemptRepository,
  LearningRepository,
  MemoryRepository,
  MistakeRepository,
  ProgressRepository,
  SettingsRepository,
  clearEverything,
  type AttemptRecord,
} from '../storage/repositories';
import {
  SCHEMA_VERSION,
  clearLegacyBlobFromLocalStorage,
  defaultSettings,
  newContentSeed,
  progressKey,
  randomId,
  readLegacyBlobFromLocalStorage,
  runMigrations,
} from '../storage/schema';
import { checkPersistence } from '../storage/capability';
import type { LevelTestResult } from '../domain/levelTestTypes';
import { LearnerContext, type LearnerContextValue } from './LearnerContext';
import type { LearnerState, RecordAttemptInput, RecordReviewInput } from './types';

/**
 * The learner's state, and the only thing that writes it.
 *
 * Reads happen once, on launch. Writes are made to memory immediately and
 * persisted in the background — a learner who has just written a character
 * correctly should see the progress bar move on the same frame, not after a
 * round trip to IndexedDB. If the write fails, the session continues; the
 * Settings screen is where a non-durable store gets confessed to, not a toast
 * in the middle of a lesson.
 */

/**
 * The mastery rules for one kind of item.
 *
 * The two kinds are learned by different means and so they finish by different
 * means. A letter is a shape to form: it has a stroke-order demonstration to
 * watch and it is not finished until it has been written. A word is a meaning
 * to acquire: there is no demonstration of it, and **it is never written at
 * all** — vocabulary in this product is seen, heard, chosen and recognised.
 *
 * Keeping the decision here means every event that can complete an item asks
 * the same question and gets the same answer.
 */
function rulesFor(kind: ItemProgress['kind'], recognitionRequired: boolean) {
  const isCharacter = kind === 'character';
  return {
    recognitionRequired,
    demoRequired: isCharacter,
    writingRequired: isCharacter,
  };
}

export function LearnerProvider({
  children,
  driver: injected,
}: {
  children: ReactNode;
  /** Injected by tests. Production opens IndexedDB, or memory if it cannot. */
  driver?: PersistenceDriver;
}) {
  const [state, setState] = useState<LearnerState>(() => initialState(injected));
  const [ready, setReady] = useState(false);
  const driverRef = useRef<PersistenceDriver | null>(injected ?? null);
  const progressRepo = useRef<ProgressRepository | null>(null);
  const settingsRepo = useRef<SettingsRepository | null>(null);
  const sessionRepo = useRef<LearningRepository | null>(null);
  const activityRepo = useRef<ActivityRepository | null>(null);
  const memoryRepo = useRef<MemoryRepository | null>(null);
  const attemptRepo = useRef<AttemptRepository | null>(null);
  const mistakeRepo = useRef<MistakeRepository | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      /*
       * The corpus, before anything else the learner can see.
       *
       * `ready` is what takes the launch screen down, so awaiting the core here
       * is what keeps a first frame of "0 words" from existing at all. It is
       * the shared tables and the first 600 words — 45 kB gzipped, a fixed cost
       * whatever the corpus grows to — and it runs *concurrently* with opening
       * IndexedDB rather than before it, because neither needs the other.
       *
       * A failure is not fatal here: the catch below already puts the learner
       * in front of a working app rather than a spinner, and this is one more
       * thing that can fail on a first launch with no connection.
       */
      const core = loadCorpusCore();
      const driver = injected ?? (await openDriver());
      await core;
      if (cancelled) return;
      driverRef.current = driver;
      settingsRepo.current = new SettingsRepository(driver);
      progressRepo.current = new ProgressRepository(driver);
      sessionRepo.current = new LearningRepository(driver);
      activityRepo.current = new ActivityRepository(driver);
      memoryRepo.current = new MemoryRepository(driver);
      attemptRepo.current = new AttemptRepository(driver);
      mistakeRepo.current = new MistakeRepository(driver);

      await runMigrations({
        driver,
        readLegacyBlob: readLegacyBlobFromLocalStorage,
        clearLegacyBlob: clearLegacyBlobFromLocalStorage,
        now: () => new Date(),
      });

      /*
       * Does this browser actually keep what is written to it?
       *
       * Asked here, once, with a real write/read/erase round trip rather than
       * inferred from which driver was opened — see `storage/capability.ts`.
       * It runs alongside the loads because it is a fourth trip to the same
       * store and there is no reason for the learner to wait for it in series.
       */
      const [durable, settings, progress, sessions, activity, memory, attempts, mistakes] =
        await Promise.all([
          checkPersistence(driver),
          settingsRepo.current.load(),
          progressRepo.current.loadAll(),
          sessionRepo.current.loadAll(),
          activityRepo.current.loadAll(),
          memoryRepo.current.loadAll(),
          attemptRepo.current.loadAll(),
          mistakeRepo.current.loadAll(),
        ]);
      if (cancelled) return;

      /*
       * A learner with no seed gets one before anything reads it.
       *
       * The migration covers everybody who had a stored profile; this covers
       * the first launch, where there was nothing to migrate. Done before
       * `setState` rather than after, because a plan built with an empty seed
       * would be stored, and the learner would keep the un-shuffled order for
       * the rest of the day.
       */
      const seeded = settings.content_seed
        ? settings
        : { ...settings, content_seed: newContentSeed() };
      if (seeded !== settings) void settingsRepo.current.save(seeded);

      setState({
        settings: seeded,
        progress: progress.rows,
        sessions,
        activity,
        memory,
        attempts,
        mistakes,
        schema_version: SCHEMA_VERSION,
        storage: { engine: driver.name, durable, checked: true },
        recovered: progress.dropped,
      });
      setReady(true);
      /*
       * The rest of the corpus, once the learner is looking at something.
       *
       * Not awaited, and deliberately after `setReady`: the app is usable on
       * band 1, and the remaining bands are wanted for browsing and search
       * rather than for the next thing anybody taps. `corpusReady()` is how the
       * two screens that need all of it know it has not all arrived yet.
       */
      void loadCorpusRest().catch(() => {
        // Offline mid-download. The bands already in memory stay; the next
        // launch picks up the rest, and the service worker has whatever
        // arrived.
      });
      void sessionRepo.current.prune();
      void activityRepo.current.prune();
      void attemptRepo.current.prune();
      void mistakeRepo.current.prune();
    }

    void hydrate().catch(() => {
      // Nothing above may leave the learner staring at a spinner. A failed
      // hydration means a fresh in-memory profile and a working lesson.
      //
      // What it does *not* mean is that this browser cannot save anything.
      // Hydration reads eight collections, runs the schema migrations and
      // parses every stored row; one unreadable record, or a migration that
      // throws, lands here — and this used to answer that by declaring the
      // learner's storage broken, which put a red warning about losing their
      // progress under a browser whose IndexedDB was in perfect health. That is
      // precisely the guess the whole capability path exists to avoid.
      //
      // So the storage question goes to the only thing entitled to answer it:
      // another write/read/erase round trip against the driver, if one was
      // opened at all. If there is no driver, nothing is known and the screen
      // stays silent — the warning is for a proven failure, never for an
      // unanswered question.
      if (cancelled) return;
      setReady(true);
      const driver = driverRef.current;
      if (!driver) return;
      void checkPersistence(driver).then((durable) => {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          storage: { engine: driver.name, durable, checked: true },
        }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [injected]);

  // --- Writes ---------------------------------------------------------------

  const persistProgress = useCallback((row: ItemProgress) => {
    void progressRepo.current?.put(row);
  }, []);

  /**
   * Folds one event into today's roll-up.
   *
   * Separate from `updateProgress` because the two answer different questions
   * and have different lifetimes: progress is "where is this learner with ㄱ",
   * activity is "what happened on the 14th". A screen asking one must not have
   * to load the other.
   */
  /**
   * Measured foreground study time, in milliseconds.
   *
   * Called by `useStudyClock` every fifteen seconds and whenever the app is
   * hidden. Kept separate from `trackActivity` because it is a different kind
   * of fact — how long, rather than what happened — and because folding it into
   * an event would mean inventing an event for "the learner was here".
   */
  const recordStudyTime = useCallback((ms: number) => {
    const now = new Date();
    setState((prev) => {
      const activity = recordStudyTime_(prev.activity, { at: now.toISOString(), ms }, now);
      if (activity === prev.activity) return prev;
      const row = activity[dateKey(now)];
      if (row) void activityRepo.current?.put(row);
      return { ...prev, activity };
    });
  }, []);

  const trackActivity = useCallback((event: ActivityEvent) => {
    const now = new Date();
    const date = dateKey(now);
    setState((prev) => {
      const next = recordActivity(prev.activity[date], event, now);
      void activityRepo.current?.put(next);

      // Practising counts as showing up.
      //
      // The streak used to move only when an item reached `learned`, which
      // meant a learner who spent twenty minutes failing a hard character had,
      // as far as the app was concerned, not studied that day. That is the
      // opposite of what a streak is for: it measures the habit, not the
      // outcome, and the daily goal is already the place where finishing
      // things is counted.
      const activeDays = prev.settings.active_days.includes(date)
        ? prev.settings.active_days
        : [...prev.settings.active_days, date];
      if (activeDays !== prev.settings.active_days) {
        const settings = { ...prev.settings, active_days: activeDays };
        void settingsRepo.current?.save(settings);
        return { ...prev, activity: { ...prev.activity, [date]: next }, settings };
      }
      return { ...prev, activity: { ...prev.activity, [date]: next } };
    });
  }, []);

  const updateProgress = useCallback(
    (
      kind: ItemProgress['kind'],
      itemKey: string,
      transform: (previous: ItemProgress | undefined) => ItemProgress,
    ) => {
      /*
       * Noted inside the updater and acted on after it, by **assignment**.
       *
       * React may run an updater more than once for one call — StrictMode does
       * it on every render in development, and the concurrent renderer is
       * entitled to. Each run gets the same `prev`, so anything derived is the
       * same; anything *accumulated* is not. This used to `push` onto an array
       * declared out here, which meant one finished letter appended two
       * completions and the day's tally on the Activity screen counted it
       * twice, while `state.progress` — the same event, the canonical copy —
       * counted it once. Two screens, one truth, two answers.
       *
       * A single assignment is idempotent under any number of runs, and one
       * call to `updateProgress` concerns exactly one item, so one slot is all
       * this ever needed.
       */
      let justCompleted: ItemProgress['kind'] | null = null;
      setState((prev) => {
        const key = progressKey(kind, itemKey);
        const next = transform(prev.progress[key]);
        if (next === prev.progress[key]) return prev;
        persistProgress(next);

        // Reaching `learned` is a day's *outcome* and is recorded as one; the
        // streak itself is kept by `trackActivity`, which counts showing up.
        justCompleted =
          next.stage === 'learned' && prev.progress[key]?.stage !== 'learned' ? kind : null;
        return { ...prev, progress: { ...prev.progress, [key]: next } };
      });
      if (justCompleted) trackActivity({ type: 'completed', kind: justCompleted });
    },
    [persistProgress, trackActivity],
  );

  const setPreferences = useCallback((patch: Partial<LearnerPreferences>) => {
    setState((prev) => {
      const settings = { ...prev.settings, ...patch };
      void settingsRepo.current?.save(settings);
      return { ...prev, settings };
    });
  }, []);

  /**
   * Stores a level-test result, and nothing else.
   *
   * One field on the settings row. No progress row, no memory, no session, no
   * active day — a level is what the learner asked to be told, not evidence
   * about what they have studied, and the scheduler must never see it.
   *
   * `recentItems` is capped so a learner who retakes the test regularly does
   * not accumulate an unbounded list on their device; the cap is generous
   * enough that two consecutive sittings never repeat a question.
   */
  const saveLevelTestResult = useCallback((result: LevelTestResult) => {
    setState((prev) => {
      const settings = {
        ...prev.settings,
        level_test: { ...result, recentItems: result.recentItems.slice(0, 120) },
      };
      void settingsRepo.current?.save(settings);
      return { ...prev, settings };
    });
  }, []);

  /**
   * The learner chose to start at Level 1 rather than sit the test.
   *
   * Recorded so the offer is made once. A prompt that reappears every time
   * somebody opens today's words is not a recommendation, it is a toll — and
   * the learner already answered it. §17.
   */
  const skipPlacement = useCallback(() => {
    setState((prev) => {
      if (prev.settings.placement_skipped_at) return prev;
      const settings = { ...prev.settings, placement_skipped_at: new Date().toISOString() };
      void settingsRepo.current?.save(settings);
      return { ...prev, settings };
    });
  }, []);

  const startSession = useCallback(
    (kind: SessionKind, lessonId: string | null, targetCount: number) => {
      const session: LearningSession = {
        id: `session-${randomId()}`,
        kind,
        lesson_id: lessonId,
        started_at: new Date().toISOString(),
        completed_at: null,
        target_count: targetCount,
        passed_count: 0,
        attempt_count: 0,
      };
      void sessionRepo.current?.put(session);
      setState((prev) => ({ ...prev, sessions: [...prev.sessions, session] }));
      return session.id;
    },
    [],
  );

  const completeSession = useCallback((sessionId: string) => {
    setState((prev) => {
      const sessions = prev.sessions.map((s) =>
        s.id === sessionId && !s.completed_at
          ? { ...s, completed_at: new Date().toISOString() }
          : s,
      );
      const changed = sessions.find((s) => s.id === sessionId);
      if (changed) void sessionRepo.current?.put(changed);
      return { ...prev, sessions };
    });
  }, []);

  const recordAttempt = useCallback(
    (input: RecordAttemptInput) => {
      const now = new Date();
      trackActivity({
        type: 'attempt',
        itemKey: progressKey(input.kind, input.item_key),
        kind: input.kind,
        passed: input.result.passed,
        review: input.review ?? false,
      });
      updateProgress(input.kind, input.item_key, (previous) =>
        applyAttempt(
          previous,
          {
            kind: input.kind,
            itemKey: input.item_key,
            outcome: {
              passed: input.result.passed,
              score: input.result.score,
              mode: input.mode,
            },
            rules: rulesFor(input.kind, input.recognition_required ?? false),
          },
          now,
        ),
      );

      if (!input.session_id) return;
      setState((prev) => {
        const sessions = prev.sessions.map((s) =>
          s.id === input.session_id
            ? {
                ...s,
                attempt_count: s.attempt_count + 1,
                // Distinct items passed, not attempts: retrying the same
                // character must not inflate the session counter.
                passed_count:
                  input.result.passed &&
                  prev.progress[progressKey(input.kind, input.item_key)]?.passes === undefined
                    ? s.passed_count + 1
                    : s.passed_count,
              }
            : s,
        );
        const changed = sessions.find((s) => s.id === input.session_id);
        if (changed) void sessionRepo.current?.put(changed);
        return { ...prev, sessions };
      });
    },
    [updateProgress, trackActivity],
  );

  const recordHeard = useCallback(
    (kind: ItemProgress['kind'], itemKey: string, recognitionRequired = false) => {
      const now = new Date();
      updateProgress(kind, itemKey, (previous) =>
        applyHeard(previous, { kind, itemKey, rules: rulesFor(kind, recognitionRequired) }, now),
      );
    },
    [updateProgress],
  );

  const recordDemoSeen = useCallback(
    (kind: ItemProgress['kind'], itemKey: string, recognitionRequired = false) => {
      const now = new Date();
      updateProgress(kind, itemKey, (previous) =>
        applyDemoSeen(previous, { kind, itemKey, rules: rulesFor(kind, recognitionRequired) }, now),
      );
    },
    [updateProgress],
  );

  const recordIntroduced = useCallback(
    (kind: ItemProgress['kind'], itemKey: string) => {
      const now = new Date();
      updateProgress(kind, itemKey, (previous) =>
        applyIntroduced(previous, { kind, itemKey }, now),
      );
    },
    [updateProgress],
  );

  const recordRecognition = useCallback(
    (kind: ItemProgress['kind'], itemKey: string, correct: boolean) => {
      const now = new Date();
      updateProgress(kind, itemKey, (previous) =>
        applyRecognition(
          previous,
          { kind, itemKey, correct, rules: rulesFor(kind, true) },
          now,
        ),
      );
    },
    [updateProgress],
  );

  /**
   * Folds one review exercise into the learner's memory of an item.
   *
   * Two writes, to two rows, and the separation is load-bearing. The memory row
   * moves; the *progress* row — which is what says the letter was learned —
   * is only touched to record that a review happened at all. A learner who
   * fails a review of ㄱ has a weaker memory of ㄱ and has still learned ㄱ.
   */
  const recordReview = useCallback(
    (input: RecordReviewInput) => {
      const now = new Date();
      const key = memoryKey(input.kind, input.item_key);

      const record: AttemptRecord = {
        id: `attempt-${randomId()}`,
        item_key: key,
        skill: input.skill,
        mode: input.mode,
        at: now.toISOString(),
        passed: input.passed,
        score: input.score,
        hint_used: input.hint_used ?? false,
        hint_level: input.hint_level ?? (input.hint_used ? 1 : 0),
        response_ms: input.response_ms ?? null,
        ...(input.confused_with ? { confused_with: input.confused_with } : {}),
        ...(input.session_id ? { session_id: input.session_id } : {}),
      };
      void attemptRepo.current?.put(record);

      trackActivity({
        type: 'attempt',
        itemKey: key,
        kind: input.kind,
        passed: input.passed,
        review: true,
      });

      /*
       * The notebook is written here, beside the memory row, and not by the
       * screens.
       *
       * §35: the learner should not have to save a mistake for it to be
       * recorded. Every exercise in the app reports through `recordReview`, so
       * this is the one place that sees every answer — a screen-by-screen
       * implementation would collect mistakes from whichever screens
       * remembered to, which is how a notebook ends up quietly missing the
       * listening questions.
       */
      setState((prev) => {
        const next: ItemMemory = applyReview(
          prev.memory[key],
          input.kind,
          input.item_key,
          {
            skill: input.skill,
            passed: input.passed,
            score: input.score,
            hintLevel: input.hint_level ?? (input.hint_used ? 1 : 0),
            responseMs: input.response_ms,
            confusedWith: input.confused_with,
            recovery: input.recovery,
          },
          now,
        );
        void memoryRepo.current?.put(next);

        const mistake = applyAnswer(
          prev.mistakes[key],
          {
            kind: input.kind,
            itemKey: input.item_key,
            skill: input.skill,
            mode: input.mode,
            passed: input.passed,
            ...(input.confused_with ? { chose: input.confused_with } : {}),
            answer: input.item_key,
          },
          now,
        );
        const mistakes = mistake ? { ...prev.mistakes, [key]: mistake } : prev.mistakes;
        if (mistake) void mistakeRepo.current?.put(mistake);

        return {
          ...prev,
          memory: { ...prev.memory, [key]: next },
          mistakes,
          attempts: [...prev.attempts, record].slice(-AttemptRepository.MAX_ATTEMPTS),
        };
      });
    },
    [trackActivity],
  );

  /**
   * The key a saved item is stored under.
   *
   * `word:<id>` for a word the app teaches, and `dict:<headword>` for one it
   * only knows how to look up. Two prefixes rather than one, because the two
   * are different objects: a taught word has a card, a recording and a
   * scheduled place in the curriculum, and a dictionary headword has none of
   * those and must never be handed to the scheduler as though it did.
   *
   * A dictionary word that *is* also taught is saved under its taught id, so
   * saving 사과 from the dictionary and from its card is one bookmark and not
   * two — see `savedKeyForHeadword`.
   */
  const toggleSaved = useCallback((kind: ItemProgress['kind'], itemKey: string) => {
    const key = memoryKey(kind, itemKey);
    setState((prev) => {
      const saved = prev.settings.saved_items.includes(key)
        ? prev.settings.saved_items.filter((entry) => entry !== key)
        : [...prev.settings.saved_items, key];
      const settings = { ...prev.settings, saved_items: saved };
      void settingsRepo.current?.save(settings);
      return { ...prev, settings };
    });
  }, []);

  const progressFor = useCallback(
    (kind: ItemProgress['kind'], itemKey: string) => state.progress[progressKey(kind, itemKey)],
    [state.progress],
  );

  const reset = useCallback(async () => {
    const driver = driverRef.current;
    if (driver) await clearEverything(driver);
    setState((prev) => ({
      settings: defaultSettings(),
      progress: {},
      sessions: [],
      activity: {},
      memory: {},
      attempts: [],
      mistakes: {},
      schema_version: SCHEMA_VERSION,
      storage: prev.storage,
      recovered: 0,
    }));
  }, []);

  // --- Derived --------------------------------------------------------------

  const knownLetters = useMemo(() => computeKnownLetters(state.progress), [state.progress]);

  const savedSet = useMemo(() => new Set(state.settings.saved_items), [state.settings.saved_items]);
  const isSaved = useCallback(
    (kind: ItemProgress['kind'], itemKey: string) => savedSet.has(memoryKey(kind, itemKey)),
    [savedSet],
  );

  /**
   * Save or unsave a dictionary headword.
   *
   * Resolves to the taught card first, so one word is one bookmark however the
   * learner reached it. Only a headword the curriculum does not teach gets a
   * `dict:` key of its own.
   */
  const toggleSavedHeadword = useCallback((headword: string) => {
    const taught = findWordByHeadword(headword);
    const key = taught ? memoryKey('word', taught.id) : `dict:${headword}`;
    setState((prev) => {
      const saved = prev.settings.saved_items.includes(key)
        ? prev.settings.saved_items.filter((entry) => entry !== key)
        : [...prev.settings.saved_items, key];
      const settings = { ...prev.settings, saved_items: saved };
      void settingsRepo.current?.save(settings);
      return { ...prev, settings };
    });
  }, []);

  const isSavedHeadword = useCallback(
    (headword: string) => {
      const taught = findWordByHeadword(headword);
      return savedSet.has(taught ? memoryKey('word', taught.id) : `dict:${headword}`);
    },
    [savedSet],
  );

  /*
   * Recomputed when the profile changes rather than on a timer.
   *
   * Both of these read the clock, so they are strictly speaking stale between
   * renders — by seconds, against schedules measured in days. Re-running them
   * every second to keep a figure that changes once a day exact would cost a
   * pass over the whole profile sixty times a minute for nothing anyone could
   * see.
   */
  /*
   * Every count on Review and Home is filtered through `canAsk`.
   *
   * Without it these numbers describe the scheduler's opinion, and the session
   * describes what can actually be rendered. Those were two different numbers,
   * and the gap between them is how "8 questions" opened an empty screen.
   */
  const reviewSummary = useMemo(
    () => summarise(state.progress, state.memory, savedSet, new Date(), canAsk),
    [state.progress, state.memory, savedSet],
  );

  const practice = useMemo(() => {
    // No lesson left means the alphabet is finished, and the number of letters
    // outstanding in it is zero rather than "all of the last chapter". Before
    // `nextLesson` could say *finished* it returned the final lesson, which is
    // complete, so this happened to come out right — by accident, and only
    // because a completed lesson has nothing left in it.
    const lesson = nextLesson(state.progress);
    const remaining = lesson
      ? (() => {
          const done = lessonProgress(state.progress, lesson);
          return done.total - done.done;
        })()
      : 0;
    return todaysPractice(state.progress, state.memory, remaining, new Date(), canAsk);
  }, [state.progress, state.memory]);

  /**
   * Resolves a review plan.
   *
   * Not memoised on the options, because the options are supplied per call and
   * a screen asks for at most a handful. What *is* stable is the result: the
   * same profile and the same request produce the same plan, which is what lets
   * the Review screen show one and the session run it.
   */
  /**
   * Items with an unresolved mistake against them.
   *
   * Handed to the scheduler as a *signal*, not as a session: §42's rule for
   * saved words applies here too, and more strongly. A mistake raises an item's
   * priority; it does not entitle it to be asked every time until the learner
   * gets bored of seeing it.
   */
  const unresolved = useMemo(
    () => new Set(listMistakes(state.mistakes).map((mistake) => mistake.id)),
    [state.mistakes],
  );

  const practicePlan = useCallback(
    (
      options: {
        mode?: ExerciseMode;
        savedOnly?: boolean;
        mistakesOnly?: boolean;
        /** How many questions to ask. Omitted means the usual session length. */
        size?: number;
      } = {},
    ): PracticePlan =>
      resolvePlan({
        progress: state.progress,
        memory: state.memory,
        saved: savedSet,
        mistakes: unresolved,
        now: new Date(),
        soundFree: state.settings.sound_free,
        ...options,
      }),
    [state.progress, state.memory, savedSet, unresolved, state.settings.sound_free],
  );

  const mistakes = useMemo(() => listMistakes(state.mistakes), [state.mistakes]);

  const clearMistake = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.mistakes[id]) return prev;
      const next = { ...prev.mistakes };
      delete next[id];
      void mistakeRepo.current?.remove(id);
      return { ...prev, mistakes: next };
    });
  }, []);

  /**
   * Today's vocabulary plan.
   *
   * Built on the first read of a new day and then left alone. The build is
   * inside a `useMemo` and the *persistence* is in an effect below, because
   * writing to storage during a render is how a plan ends up saved twice under
   * React's strict mode — and a plan saved twice is a plan whose completed list
   * can be clobbered.
   *
   * ## Nothing is built before the store has been read
   *
   * `ready` is the whole of the fix for the bug this screen was reported with:
   * ten words studied, and the counter back at **0 / 10** the next time the app
   * opened.
   *
   * The state this hook sees on the very first render is the *placeholder* —
   * default settings, no plan, no progress — because hydration is asynchronous
   * and has not finished. Without the guard, that placeholder produced a brand
   * new empty plan, the effect below wrote it to storage, and the write raced
   * the read that was still in flight. When it won, the plan the learner had
   * spent ten minutes filling in was overwritten by an empty one before they
   * had touched anything. It never reproduced in a quick click-through, because
   * whether it happened at all depended on which of two promises settled first.
   *
   * So until the store has answered, this hook holds whatever it already has
   * and writes nothing.
   */
  /**
   * The level the day's words are chosen around.
   *
   * The test result if there is one, or what they have outgrown, whichever is
   * higher — never lower than the measurement, because an empty installation is
   * not evidence that somebody has forgotten Korean (§15).
   *
   * For a learner who has never been tested and never studied that is level 1,
   * so the app behaves exactly as it did before the test existed until they ask
   * it not to. §16: never make somebody sit a test before they can learn.
   *
   * The number on the home screen is *not* this; it is the measured level, and
   * it moves only when the test is taken again. See `levelFromProgress` for why
   * the two are different questions.
   */
  /** What the test said, or level 1 for somebody who has not sat it. Shown. */
  const vocabularyLevel = useCorpusMemo<number>(() => {
    const measured = state.settings.level_test?.level;
    if (measured) return measured;
    return levelFromProgress(
      vocabularyByPriority(),
      (id: string) => state.progress[`word:${id}`]?.stage === 'learned',
    );
  }, [state.settings.level_test, state.progress]);

  /** What the day is built from. Never shown. See `LearnerContext`. */
  const planningLevel = useCorpusMemo<number>(() => {
    const measured = state.settings.level_test?.level ?? null;
    const outgrown = levelFromProgress(
      vocabularyByPriority(),
      (id: string) => state.progress[`word:${id}`]?.stage === 'learned',
    );
    return teachingLevel(measured, outgrown);
  }, [state.settings.level_test, state.progress]);

  /**
   * Whether the daily session could ask this word anything in the learner's
   * language. Threaded into the plan builder so a met word with no askable
   * question in a partial locale is not scheduled — scheduled anyway it stays
   * owed with nothing to answer, and the day sticks one short forever. See
   * `DayRequest.canPractise`.
   */
  // Read leniently rather than through `useLocale`, because store tests mount
  // this provider without a LocaleProvider. English is the right default there:
  // it is a complete locale, where every word is practisable and the filter is
  // a no-op — exactly the behaviour those tests pin.
  const locale = useContext(LocaleContext)?.locale ?? 'en';
  const canPractiseWord = useCallback(
    (wordId: string) => {
      const word = getWord(wordId);
      if (!word) return false;
      return canPractise(word, (w) => ({ value: strictMeaning(w, locale) ?? '', locale }));
    },
    [locale],
  );

  /**
   * Whether the level being used was measured, defaulted, or never asked about.
   *
   * Three states and not two, because "Level 1" means something different in
   * each of them: a learner who sat the test and came out at 1 has been
   * measured, one who declined has a sensible default, and one who has not been
   * asked is the only one worth interrupting. §16.
   */
  const placementStatus: PlacementStatus = state.settings.level_test
    ? 'assessed'
    : state.settings.placement_skipped_at
      ? 'skipped'
      : 'untested';

  const vocabularyDay = useCorpusMemo<DailyPlan>(() => {
    const now = new Date();
    const stored = state.settings.daily_plan;
    /*
      Today's plan, if it is still today's plan *for this learner*.

      The level is part of that and the goal is not. A goal is a preference the
      learner can change back, so changing it under a *started* day takes
      effect tomorrow rather than resizing a session in progress — and, just as
      important, rather than rebuilding it and wiping the words already earned,
      which is what the old goal check here did. An untouched plan is rebuilt
      for the new goal, because nobody is disturbed by replacing a plan they
      have not begun.

      A level is a measurement, and it takes effect immediately: a learner who
      opens the app, gets a plan at the default level and then sits the
      Vocabulary Level Test has not changed their mind about anything — the app
      has found something out about them, and a plan built before it knew is a
      plan for somebody else. Measured at 30 and taught 남자 is what that looked
      like. `planIsCurrent` refuses the mismatched plan; what happens next
      depends on whether the day was started — see below.
    */
    const goalChangedBeforeStart =
      stored !== null &&
      stored.completed.length === 0 &&
      stored.goal !== state.settings.daily_word_goal;
    if (planIsCurrent(stored, now, planningLevel) && !goalChangedBeforeStart) {
      return stored;
    }
    // Before the store has answered, an empty plan for the goal the learner
    // has — so the card reads `0 / 10` for the moment it takes rather than
    // flashing `0 / 0` and then jumping.
    if (!ready) return stored ?? emptyPlan(state.settings.daily_word_goal);
    const request = {
      progress: state.progress,
      memory: state.memory,
      corpus: vocabularyByPriority(),
      goal: state.settings.daily_word_goal,
      soundFree: state.settings.sound_free,
      now,
      level: planningLevel,
      seed: state.settings.content_seed,
      dayIndex: state.settings.active_days.length,
      recentlyIntroduced: recentlyIntroduced(state.progress, now),
      canPractise: canPractiseWord,
    };
    /*
      A same-day plan built for another level, with work already in it, is
      *corrected* rather than replaced: the mastered words and their credit
      stand, the unresolved consolidation stands, and only the unresolved
      ordinary new-study targets — the level-dependent part — are regenerated
      for the level the learner has just been measured at. 3/10 at Level 1
      becomes 3/10 with seven Level-30 words, never 0/10 and never seven more
      beginner words. See `rebuildPlanForLevel`.
    */
    if (
      stored !== null &&
      planIsCurrent(stored, now) &&
      !goalChangedBeforeStart &&
      stored.completed.length > 0
    ) {
      const rebuilt = rebuildPlanForLevel(stored, request);
      // The new level's words may live in a corpus band that has not arrived
      // yet. A rebuild that came up short while the corpus is still loading
      // waits — the stored plan stands for the moment it takes — rather than
      // persisting a short day.
      if (rebuilt.words.length < stored.words.length && !corpusReady()) return stored;
      return rebuilt;
    }
    // A stored plan from an earlier day, an untouched plan whose goal or level
    // changed, or no plan at all: built fresh. See `planIsCurrent`.
    const built = buildDailyPlan(request);
    /*
     * A short plan means one of two things, and only one of them is worth
     * waiting for.
     *
     * The corpus arrives in priority bands, so what is in memory is always a
     * *prefix* of the curriculum — the first 600 words after the core has
     * landed, all of it a moment later. A learner who has met fewer than that
     * gets exactly the right plan from band 1, which is every learner for their
     * first several months.
     *
     * Past it, the plan comes up short: not because the learner has finished
     * the corpus but because the rest of it is still arriving. And a plan is
     * built once and then **stored for the day**, so a short one is not a late
     * plan, it is a short day. So a plan that is short *and* incomplete waits;
     * a plan that is short because the learner really has run out does not.
     */
    if (built.words.length < state.settings.daily_word_goal && !corpusReady()) {
      return stored ?? emptyPlan(state.settings.daily_word_goal);
    }
    return built;
  }, [
    ready,
    planningLevel,
    state.settings.content_seed,
    state.settings.active_days.length,
    state.settings.daily_plan,
    state.settings.daily_word_goal,
    state.settings.sound_free,
    state.progress,
    state.memory,
  ]);

  useEffect(() => {
    if (!ready) return;
    /*
     * `emptyPlan` has no date, and that is what makes it a placeholder rather
     * than a plan. Writing one to storage is how "the corpus has not finished
     * arriving" would turn into "today is over" — persisted, and read back on
     * the next launch as the day's real answer.
     */
    if (!vocabularyDay.date) return;
    if (state.settings.daily_plan === vocabularyDay) return;
    setState((prev) => {
      if (prev.settings.daily_plan === vocabularyDay) return prev;
      /*
       * A credit is never clobbered by a derivation that predates it.
       *
       * `vocabularyDay` was derived from the plan as it stood at render time.
       * `completeDailyWord` writes straight to the stored plan, so a correct
       * answer credited between that render and this write would be silently
       * erased by persisting the older derivation over it — the "correct
       * answer that did not count" class, arriving through a plan rebuild
       * rather than through an exercise. If the stored plan has a completion
       * this derivation has not seen, this write stands down; the next render
       * re-derives from the newer plan and persists that instead.
       */
      const current = prev.settings.daily_plan;
      if (
        current &&
        current.date === vocabularyDay.date &&
        current.completed.some((id) => !vocabularyDay.completed.includes(id))
      ) {
        return prev;
      }
      const settings = { ...prev.settings, daily_plan: vocabularyDay };
      void settingsRepo.current?.save(settings);
      return { ...prev, settings };
    });
  }, [ready, vocabularyDay, state.settings.daily_plan]);

  const vocabularyProgressToday = useMemo(() => dayProgress(vocabularyDay), [vocabularyDay]);

  const completeDailyWord = useCallback((wordId: string) => {
    setState((prev) => {
      const plan = prev.settings.daily_plan;
      if (!plan) return prev;
      const next = completeWord(plan, wordId);
      if (next === plan) return prev;
      const settings = { ...prev.settings, daily_plan: next };
      void settingsRepo.current?.save(settings);
      return { ...prev, settings };
    });
  }, []);

  /**
   * A second helping, for a learner who finished and wants more.
   *
   * Deliberately the *only* way to get past the day's goal, and deliberately
   * something they have to ask for. The completion screen offers it once and
   * does not push: a goal that is immediately replaced by another goal is not a
   * goal, and the point of this number is to make starting easy rather than to
   * keep somebody going until they stop.
   *
   * It *adds* to the day. It used to rebuild it, which meant tapping the offer
   * emptied `completed` and answered "you have done ten of ten, would you like
   * more?" with **0 / 10** — the ten words charged back to the learner for
   * having asked. The goal does not move either: extra study is extra, so
   * twelve of a goal of ten reads twelve of ten, not twelve of fifteen.
   */
  const extendVocabularyDay = useCallback((extra: number) => {
    const now = new Date();
    setState((prev) => {
      const plan = prev.settings.daily_plan;
      if (!plan) return prev;
      const next = extendDay(plan, extra, {
        progress: prev.progress,
        memory: prev.memory,
        corpus: vocabularyByPriority(),
        goal: prev.settings.daily_word_goal,
        soundFree: prev.settings.sound_free,
        now,
        /*
          The learner's level, threaded exactly as the day's own build threads
          it. Without these four fields the extension fell back to the corpus
          prefix — the un-personalised path — so a learner at Level 30 who
          finished ten advanced words and asked for five more was handed the
          easiest unmet words in the product. Extra study is chosen the same
          way the day's words were: at the level the learner is at *now*,
          which after a mid-day retake is the retaken level.
        */
        level: planningLevel,
        seed: prev.settings.content_seed,
        dayIndex: prev.settings.active_days.length,
        recentlyIntroduced: recentlyIntroduced(prev.progress, now),
        canPractise: canPractiseWord,
      });
      if (next === plan) return prev;
      const settings = { ...prev.settings, daily_plan: next };
      void settingsRepo.current?.save(settings);
      return { ...prev, settings };
    });
  }, [canPractiseWord, planningLevel]);

  // Counts words, so it is rebuilt when a band of the corpus arrives.
  const summary = useCorpusMemo<ProgressSummary>(() => {
    const rows = Object.values(state.progress);
    const learned = rows.filter((row) => row.stage === 'learned');
    const letterSet = new Set(ALL_LETTERS.map((c) => c.character));
    // Words the learner's letters already cover. A suggestion figure — every
    // word is accessible whatever this says.
    const readable = VOCABULARY.filter((w) => usesKnownLetters(w, knownLetters));
    const now = new Date();

    return {
      characters_learned: learned.filter((row) => row.kind === 'character').length,
      characters_total: ALL_CHARACTERS.length,
      letters_learned: learned.filter((row) => row.kind === 'character' && letterSet.has(row.item_key))
        .length,
      letters_total: ALL_LETTERS.length,
      words_learned: learned.filter((row) => row.kind === 'word').length,
      words_total: corpusTotal(),
      words_available: readable.length,
      review_items: reviewSummary.total,
      review_due: reviewSummary.dueToday,
      total_attempts: rows.reduce((n, row) => n + row.attempts, 0),
      total_passes: rows.reduce((n, row) => n + row.passes, 0),
      sessions_completed: state.sessions.filter((s) => s.completed_at).length,
      today_completed: learnedToday(state.progress, now),
      daily_target: state.settings.daily_target,
      // One streak truth for every screen: `learningStreak` unions the
      // activity map (study time) with `active_days` (practice events), so
      // Home and the Activity screen can never disagree about the current run.
      streak_days: learningStreak(state.activity, state.settings.active_days, now).current,
      selected_font_id: state.settings.selected_font_id,
    };
  }, [state, knownLetters, reviewSummary]);

  const value = useMemo<LearnerContextValue>(
    () => ({
      state,
      ready,
      summary,
      knownLetters,
      setPreferences,
      saveLevelTestResult,
      placementStatus,
      skipPlacement,
      vocabularyLevel,
      teachingLevel: planningLevel,
      startSession,
      completeSession,
      recordStudyTime,
      recordAttempt,
      recordHeard,
      recordDemoSeen,
      recordIntroduced,
      recordRecognition,
      recordReview,
      toggleSaved,
      isSaved,
      toggleSavedHeadword,
      isSavedHeadword,
      reviewSummary,
      practice,
      practicePlan,
      mistakes,
      clearMistake,
      vocabularyDay,
      vocabularyProgressToday,
      completeDailyWord,
      extendVocabularyDay,
      progressFor,
      reset,
    }),
    [
      state,
      ready,
      summary,
      knownLetters,
      setPreferences,
      saveLevelTestResult,
      placementStatus,
      skipPlacement,
      vocabularyLevel,
      planningLevel,
      startSession,
      completeSession,
      recordStudyTime,
      recordAttempt,
      recordHeard,
      recordDemoSeen,
      recordIntroduced,
      recordRecognition,
      recordReview,
      toggleSaved,
      isSaved,
      toggleSavedHeadword,
      isSavedHeadword,
      reviewSummary,
      practice,
      practicePlan,
      mistakes,
      clearMistake,
      vocabularyDay,
      vocabularyProgressToday,
      completeDailyWord,
      extendVocabularyDay,
      progressFor,
      reset,
    ],
  );

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

function initialState(driver?: PersistenceDriver): LearnerState {
  const engine = driver ?? new MemoryDriver();
  return {
    settings: defaultSettings(),
    progress: {},
    sessions: [],
    activity: {},
    memory: {},
    attempts: [],
    mistakes: {},
    schema_version: SCHEMA_VERSION,
    /*
     * `checked: false` — nothing is known yet, and in particular the `false`
     * beside it is not evidence. Before `hydrate` runs, `engine` here is the
     * in-memory placeholder even on an install whose IndexedDB is perfectly
     * healthy; a screen that warned on this would warn on every launch.
     */
    storage: { engine: engine.name, durable: engine.durable, checked: false },
    recovered: 0,
  };
}
