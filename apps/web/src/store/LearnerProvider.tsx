import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ActivityEvent,
  ItemProgress,
  LearnerPreferences,
  LearningSession,
  ProgressSummary,
  SessionKind,
} from '@hangyul-ganada/shared-types';

import { ALL_LETTERS, ALL_CHARACTERS } from '../data/characters';
import { VOCABULARY, usesKnownLetters } from '../data/vocabulary';
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
  streakDays,
} from '../domain/progress';
import { applyReview, memoryKey, type ItemMemory } from '../domain/memory';
import { summarise, todaysPractice } from '../domain/review';
import { nextLesson, lessonProgress } from '../domain/progress';
import { recordActivity, recordStudyTime as recordStudyTime_ } from '../domain/activity';
import { MemoryDriver, type PersistenceDriver } from '../storage/driver';
import { openDriver } from '../storage/open';
import {
  ActivityRepository,
  AttemptRepository,
  LearningRepository,
  MemoryRepository,
  ProgressRepository,
  SettingsRepository,
  clearEverything,
  type AttemptRecord,
} from '../storage/repositories';
import {
  SCHEMA_VERSION,
  clearLegacyBlobFromLocalStorage,
  defaultSettings,
  progressKey,
  randomId,
  readLegacyBlobFromLocalStorage,
  runMigrations,
} from '../storage/schema';
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
 * Letters and syllables have a stroke-order demonstration to watch; words do
 * not, because a word is written out of letters whose stroke order was
 * demonstrated when those letters were taught. Keeping the decision here means
 * every event that can complete an item asks the same question and gets the
 * same answer.
 */
function rulesFor(kind: ItemProgress['kind'], recognitionRequired: boolean) {
  const isCharacter = kind === 'character';
  return {
    recognitionRequired,
    demoRequired: isCharacter,
    bothWritingRungs: isCharacter,
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

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const driver = injected ?? (await openDriver());
      if (cancelled) return;
      driverRef.current = driver;
      settingsRepo.current = new SettingsRepository(driver);
      progressRepo.current = new ProgressRepository(driver);
      sessionRepo.current = new LearningRepository(driver);
      activityRepo.current = new ActivityRepository(driver);
      memoryRepo.current = new MemoryRepository(driver);
      attemptRepo.current = new AttemptRepository(driver);

      await runMigrations({
        driver,
        readLegacyBlob: readLegacyBlobFromLocalStorage,
        clearLegacyBlob: clearLegacyBlobFromLocalStorage,
        now: () => new Date(),
      });

      const [settings, progress, sessions, activity, memory, attempts] = await Promise.all([
        settingsRepo.current.load(),
        progressRepo.current.loadAll(),
        sessionRepo.current.loadAll(),
        activityRepo.current.loadAll(),
        memoryRepo.current.loadAll(),
        attemptRepo.current.loadAll(),
      ]);
      if (cancelled) return;

      setState({
        settings,
        progress: progress.rows,
        sessions,
        activity,
        memory,
        attempts,
        schema_version: SCHEMA_VERSION,
        storage: { engine: driver.name, durable: driver.durable },
        recovered: progress.dropped,
      });
      setReady(true);
      void sessionRepo.current.prune();
      void activityRepo.current.prune();
      void attemptRepo.current.prune();
    }

    void hydrate().catch(() => {
      // Nothing above may leave the learner staring at a spinner. A failed
      // hydration means a fresh in-memory profile and a working lesson.
      if (!cancelled) setReady(true);
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
      // Collected inside the updater — which React may run more than once —
      // and acted on after it, so a completion is never recorded twice.
      const justCompleted: Array<ItemProgress['kind']> = [];
      setState((prev) => {
        const key = progressKey(kind, itemKey);
        const next = transform(prev.progress[key]);
        if (next === prev.progress[key]) return prev;
        persistProgress(next);

        // Reaching `learned` is a day's *outcome* and is recorded as one; the
        // streak itself is kept by `trackActivity`, which counts showing up.
        if (next.stage === 'learned' && prev.progress[key]?.stage !== 'learned') {
          justCompleted.push(kind);
        }
        return { ...prev, progress: { ...prev.progress, [key]: next } };
      });
      for (const completedKind of justCompleted) {
        trackActivity({ type: 'completed', kind: completedKind });
      }
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

      setState((prev) => {
        const next: ItemMemory = applyReview(
          prev.memory[key],
          input.kind,
          input.item_key,
          {
            skill: input.skill,
            passed: input.passed,
            score: input.score,
            hintUsed: input.hint_used,
            responseMs: input.response_ms,
            confusedWith: input.confused_with,
            recovery: input.recovery,
          },
          now,
        );
        void memoryRepo.current?.put(next);
        return {
          ...prev,
          memory: { ...prev.memory, [key]: next },
          attempts: [...prev.attempts, record].slice(-AttemptRepository.MAX_ATTEMPTS),
        };
      });
    },
    [trackActivity],
  );

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

  /*
   * Recomputed when the profile changes rather than on a timer.
   *
   * Both of these read the clock, so they are strictly speaking stale between
   * renders — by seconds, against schedules measured in days. Re-running them
   * every second to keep a figure that changes once a day exact would cost a
   * pass over the whole profile sixty times a minute for nothing anyone could
   * see.
   */
  const reviewSummary = useMemo(
    () => summarise(state.progress, state.memory, savedSet, new Date()),
    [state.progress, state.memory, savedSet],
  );

  const practice = useMemo(() => {
    const lesson = nextLesson(state.progress);
    const done = lessonProgress(state.progress, lesson);
    return todaysPractice(state.progress, state.memory, done.total - done.done, new Date());
  }, [state.progress, state.memory]);

  const summary = useMemo<ProgressSummary>(() => {
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
      words_total: VOCABULARY.length,
      words_available: readable.length,
      review_items: reviewSummary.total,
      review_due: reviewSummary.dueToday,
      total_attempts: rows.reduce((n, row) => n + row.attempts, 0),
      total_passes: rows.reduce((n, row) => n + row.passes, 0),
      sessions_completed: state.sessions.filter((s) => s.completed_at).length,
      today_completed: learnedToday(state.progress, now),
      daily_target: state.settings.daily_target,
      streak_days: streakDays(state.settings.active_days, now),
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
      reviewSummary,
      practice,
      progressFor,
      reset,
    }),
    [
      state,
      ready,
      summary,
      knownLetters,
      setPreferences,
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
      reviewSummary,
      practice,
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
    schema_version: SCHEMA_VERSION,
    storage: { engine: engine.name, durable: engine.durable },
    recovered: 0,
  };
}
