/**
 * Can this build read what every previous build wrote, and does it keep all of it?
 *
 * ## Why this exists next to `storage.test.ts`
 *
 * The tests there are per-migration: each one writes the rows its migration
 * cares about and asserts that migration's effect. That is the right shape for
 * proving a migration *works* and the wrong shape for the question a paid,
 * offline, account-less app has to answer before every release — **can a
 * customer who bought version 1.0.0 install this one without losing anything?**
 *
 * That question is about the whole ladder rather than about any rung. A
 * migration can be individually correct and still lose a row because the one
 * before it left the profile in a shape it did not expect, and no per-migration
 * test can see that: each starts from a hand-made row at its own version.
 *
 * So this builds a **complete, realistic learner** at every schema version the
 * repository still supports, walks each of them all the way to the current one,
 * and then reads back every category of thing a learner would notice missing.
 * The fixture is the same learner each time, written in the shape of the version
 * it is planted at, so a row that disappears between two versions disappears
 * from a comparison rather than from nobody's notice.
 *
 * ## What is asserted
 *
 * §9 of the brief, in full, plus the three properties that make a migration safe
 * to ship rather than merely correct once:
 *
 * * running it twice changes nothing the second time;
 * * an interrupted run resumes and reaches the same place;
 * * nothing a learner did is silently reinterpreted — no completion count
 *   falls, no mastery is undone, no saved word vanishes, no review item is
 *   duplicated, and no stored id is disconnected from the progress it names.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { memoryKey, type ItemMemory } from '../domain/memory';
import { STORE_NAMES, type MemoryDriver as MemoryDriverType } from './driver';
import { MemoryDriver } from './driver';
import { SettingsRepository } from './repositories';
import {
  META_KEY,
  MIGRATIONS,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  blankProgress,
  progressKey,
  runMigrations,
  type SchemaMeta,
  type StoredSettings,
} from './schema';

const NOW = new Date('2026-09-08T09:00:00.000Z');

/**
 * The oldest version that can still be planted as *stores* rather than as a blob.
 *
 * Versions 1 and 2 were a single `localStorage` blob and are covered by their
 * own test in `storage.test.ts`, which is the only place the blob shape exists.
 * Everything from 3 on is IndexedDB stores, which is what this walks.
 */
const OLDEST_STORE_VERSION = 3;

const VERSIONS = Array.from(
  { length: SCHEMA_VERSION - OLDEST_STORE_VERSION + 1 },
  (_, i) => OLDEST_STORE_VERSION + i,
);

/**
 * Everything in every store, as one comparable object.
 *
 * The driver has no such method and should not grow one for a test: what a
 * migration must not change is the *contents*, and reading them through the
 * public `entries` is a stronger check than a dump the driver defines for
 * itself.
 */
async function snapshot(driver: MemoryDriverType): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const store of STORE_NAMES) {
    out[store] = Object.fromEntries(await driver.entries(store));
  }
  /*
    Deep-copied before the clock is stripped. `entries` hands back the rows the
    driver is holding, so editing one here would edit the store — and the test
    would then be comparing a profile it had itself changed.
  */
  const copy = JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
  // `last_opened_at` moves on every launch by design; nothing else may.
  const meta = (copy.meta as Record<string, Record<string, unknown>>)?.[META_KEY];
  if (meta) delete meta.last_opened_at;
  return copy;
}

function context(driver: MemoryDriver) {
  return {
    driver,
    readLegacyBlob: () => null,
    clearLegacyBlob: () => {},
    now: () => NOW,
  };
}

/**
 * One learner, with something in every store, written as version `from` left it.
 *
 * Deliberately a *used* profile rather than a minimal one: three letters at
 * different stages, two words with review memory, a streak, a notebook, a
 * day's activity, saved words, a level-test result and a daily plan half done.
 * A migration that drops a category tends to drop all of it, so the fixture has
 * to contain every category or the loss has nowhere to show.
 */
async function plant(driver: MemoryDriver, from: number) {
  const stamp = '2026-09-01T08:00:00.000Z';

  const letters: Array<[string, Partial<ItemProgress>]> = [
    ['character:ㄱ', { stage: 'learned', attempts: 9, passes: 7, fails: 2, heard: true, trace_passes: 3, practice_passes: 2, recognition_passes: 4 }],
    ['character:ㄴ', { stage: 'practised', attempts: 5, passes: 4, fails: 1, heard: true, trace_passes: 2, practice_passes: 1 }],
    ['character:ㄷ', { stage: 'introduced', attempts: 1, passes: 0, fails: 1 }],
  ];
  for (const [key, row] of letters) {
    const itemKey = key.slice('character:'.length);
    await driver.put('progress', progressKey('character', itemKey), {
      ...blankProgress('character', itemKey, stamp),
      ...row,
      // `learned` and the stage are kept in step by the repository; both are
      // written here because a v3 profile carried both.
      learned: row.stage === 'learned',
      last_seen_at: stamp,
    });
  }
  const words: Array<[string, Partial<ItemProgress>]> = [
    ['word_sagwa', { stage: 'learned', attempts: 6, passes: 6, fails: 0, heard: true, recognition_passes: 3, learned: true }],
    ['word_hakgyo', { stage: 'practised', attempts: 4, passes: 3, fails: 1, heard: true }],
  ];
  for (const [itemKey, row] of words) {
    await driver.put('progress', progressKey('word', itemKey), {
      ...blankProgress('word', itemKey, stamp),
      ...row,
      last_seen_at: stamp,
    });
  }

  await driver.put('sessions', 'session-1', {
    id: 'session-1',
    kind: 'lesson',
    lesson_id: 'consonants-1',
    started_at: stamp,
    completed_at: stamp,
    target_count: 5,
    passed_count: 5,
    attempt_count: 7,
  });
  await driver.put('attempts', 'attempt-1', {
    id: 'attempt-1',
    item_key: 'ㄱ',
    kind: 'character',
    at: stamp,
    passed: true,
    skill: 'visual_recognition',
  });

  if (from >= 4) {
    await driver.put('activity', '2026-09-01', {
      date: '2026-09-01',
      items_completed: 4,
      study_seconds: 640,
      sessions: 1,
    });
  }
  if (from >= 6) {
    const memory: ItemMemory = {
      item_key: 'ㄱ',
      kind: 'character',
      algorithm_version: 1,
      skills: {
        visual_recognition: {
          skill: 'visual_recognition',
          stability_days: 6.5,
          difficulty: 0.31,
          last_reviewed_at: stamp,
          next_review_at: '2026-09-09T08:00:00.000Z',
          streak: 3,
          lapses: 1,
          recent_score: 1,
          last_response_ms: 1840,
          hints: 0,
        },
      },
      confusions: { 'ㅋ': 2 },
      rescued_at: null,
    };
    await driver.put('memory', memoryKey('character', 'ㄱ'), memory);
  }
  if (from >= 8) {
    await driver.put('mistakes', 'character:ㄷ', {
      id: 'character:ㄷ',
      item_key: 'ㄷ',
      kind: 'character',
      at: stamp,
      chosen: 'ㄸ',
      expected: 'ㄷ',
    });
  }

  /*
    The settings row, written with exactly the fields that version had. A field
    a version did not have must be absent rather than null, because "absent" is
    what a real profile of that age looks like and is the input the migrations
    were written against.
  */
  const settings: Record<string, unknown> = {
    selected_font_id: 'pretendard',
    appearance: 'dark',
    daily_target: 10,
    show_grid: true,
    show_center_crosshair: false,
    voice: 'male',
    sound_free: false,
    autoplay_audio: true,
    locale: 'ko',
    active_days: ['2026-08-30', '2026-08-31', '2026-09-01'],
  };
  if (from >= 5) settings.appearance = 'dark';
  if (from >= 6) settings.saved_items = ['word:word_sagwa', 'word:word_hakgyo'];
  if (from >= 7) settings.daily_word_goal = 10;
  if (from >= 7) {
    settings.daily_plan = {
      date: '2026-09-01',
      goal: 10,
      level: 6,
      words: [
        { wordId: 'word_sagwa', source: 'new', steps: ['meaning'] },
        { wordId: 'word_hakgyo', source: 'review', steps: ['meaning'] },
      ],
      completed: ['word_sagwa'],
    };
  }
  if (from >= 10) {
    settings.level_test = {
      level: 6,
      low: 4,
      high: 9,
      items: 30,
      takenAt: '2026-08-31T10:00:00.000Z',
      recentItems: ['word_sagwa:meaning'],
    };
  }
  if (from >= 11) settings.content_seed = 'seed-fixture';
  if (from >= 12) settings.placement_skipped_at = null;
  if (from >= 14) settings.level_test_sitting = null;
  if (from >= 9) delete settings.practice_style;
  else settings.practice_style = 'full';

  await driver.put('settings', SETTINGS_KEY, settings);
  await driver.put<SchemaMeta>('meta', META_KEY, {
    schema_version: from,
    installed_at: '2026-01-01T00:00:00.000Z',
    last_opened_at: stamp,
    install_id: `install-${from}`,
  });
}

/** Everything a learner would notice missing, read back through the app's own reader. */
async function readBack(driver: MemoryDriver) {
  const settings = await new SettingsRepository(driver).load();
  const progress = await driver.getAll<ItemProgress>('progress');
  const learnedLetters = progress
    .filter((row) => row.kind === 'character' && row.stage === 'learned')
    .map((row) => row.item_key)
    .sort();
  const masteredWords = progress
    .filter((row) => row.kind === 'word' && row.stage === 'learned')
    .map((row) => row.item_key)
    .sort();
  return {
    settings,
    learnedLetters,
    masteredWords,
    progressRows: progress.length,
    attemptsTotal: progress.reduce((sum, row) => sum + (row.attempts ?? 0), 0),
    passesTotal: progress.reduce((sum, row) => sum + (row.passes ?? 0), 0),
    sessions: (await driver.getAll('sessions')).length,
    attempts: (await driver.getAll('attempts')).length,
    activity: await driver.getAll<{ date: string; items_completed: number; study_seconds: number }>(
      'activity',
    ),
    memory: await driver.getAll<ItemMemory>('memory'),
    mistakes: await driver.getAll<{ id: string }>('mistakes'),
  };
}

describe.each(VERSIONS)('a learner stored at schema version %i', (from) => {
  let driver: MemoryDriver;

  beforeEach(async () => {
    driver = new MemoryDriver();
    await plant(driver, from);
  });

  it('is brought all the way to the current version', async () => {
    const applied = await runMigrations(context(driver));
    expect(applied).toEqual(
      MIGRATIONS.map((migration) => migration.to)
        .filter((to) => to > from)
        .sort((a, b) => a - b),
    );
    const meta = await driver.get<SchemaMeta>('meta', META_KEY);
    expect(meta?.schema_version).toBe(SCHEMA_VERSION);
    // The install is the same install: its identity and its birthday survive.
    expect(meta?.install_id).toBe(`install-${from}`);
    expect(meta?.installed_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps every learning record the learner would notice', async () => {
    await runMigrations(context(driver));
    const after = await readBack(driver);

    // Learned letters and mastered words — the two things the product is for.
    expect(after.learnedLetters).toContain('ㄱ');
    expect(after.masteredWords).toContain('word_sagwa');
    // Nothing is un-learned, and no progress row disappears.
    expect(after.progressRows).toBe(5);
    // Completed lessons and the attempt history behind them.
    expect(after.sessions).toBe(1);
    expect(after.attempts).toBe(1);

    // Settings: theme, language, voice, goals, and the writing-guide choices.
    expect(after.settings.appearance).toBe('dark');
    expect(after.settings.locale).toBe('ko');
    expect(after.settings.voice).toBe('male');
    expect(after.settings.daily_target).toBe(10);
    expect(after.settings.show_center_crosshair).toBe(false);

    // The streak, which is derived from these days and is destroyed by losing one.
    expect(after.settings.active_days).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);

    if (from >= 4) {
      // Learning time and the daily completed count.
      expect(after.activity).toHaveLength(1);
      expect(after.activity[0]?.study_seconds).toBe(640);
      expect(after.activity[0]?.items_completed).toBe(4);
    }
    if (from >= 6) {
      // The review queue: due dates, strengths and confusion pairs.
      expect(after.memory).toHaveLength(1);
      expect(after.memory[0]?.skills.visual_recognition?.next_review_at).toBe(
        '2026-09-09T08:00:00.000Z',
      );
      expect(after.memory[0]?.skills.visual_recognition?.stability_days).toBeCloseTo(6.5, 5);
      expect(after.memory[0]?.skills.visual_recognition?.lapses).toBe(1);
      expect(after.memory[0]?.confusions['ㅋ']).toBe(2);
      // Saved vocabulary.
      expect(after.settings.saved_items).toEqual(['word:word_sagwa', 'word:word_hakgyo']);
    }
    if (from >= 7) {
      expect(after.settings.daily_word_goal).toBe(10);
      // A half-finished day is still half finished — the credited word stays credited.
      expect(after.settings.daily_plan?.completed).toEqual(['word_sagwa']);
      expect(after.settings.daily_plan?.words).toHaveLength(2);
    }
    if (from >= 8) {
      expect(after.mistakes).toHaveLength(1);
    }
    if (from >= 10) {
      // The level, and the history of how it was measured.
      expect(after.settings.level_test?.level).toBe(6);
      expect(after.settings.level_test?.takenAt).toBe('2026-08-31T10:00:00.000Z');
      expect(after.settings.level_test?.items).toBe(30);
    }
    if (from >= 11) {
      // The learner's own word order, which decides what they are taught next.
      expect(after.settings.content_seed).toBe('seed-fixture');
    }
  });

  it('gains the fields this version added, rather than undefined', async () => {
    await runMigrations(context(driver));
    const stored = await driver.get<Record<string, unknown>>('settings', SETTINGS_KEY);
    // v14: a sitting in progress. A learner upgrading has none, and "none" has
    // to be `null` rather than absent — see the migration's own note.
    expect(stored).toHaveProperty('level_test_sitting');
    expect(stored?.level_test_sitting).toBeNull();
    // v9 removed one, and it has to be gone rather than ignored.
    expect(stored).not.toHaveProperty('practice_style');
  });

  it('is unchanged by running the migrations a second time', async () => {
    await runMigrations(context(driver));
    const once = await snapshot(driver);

    const applied = await runMigrations(context(driver));
    expect(applied).toEqual([]);
    expect(await snapshot(driver)).toEqual(once);
  });

  it('reaches the same place when an interrupted run is retried', async () => {
    /*
      Interruption is the realistic failure, not corruption: the app is killed
      part-way through a launch. `runMigrations` writes the version record last,
      so a run that dies before that leaves the profile claiming its old version
      and the next launch repeats the work. This asserts that repeating it is
      safe — which is the same property as idempotence, tested from the other
      side, because the migrations that ran before the interruption run again.
    */
    const interrupted = new MemoryDriver();
    await plant(interrupted, from);
    for (const migration of MIGRATIONS.slice().sort((a, b) => a.to - b.to)) {
      if (migration.to <= from) continue;
      await migration.run(context(interrupted));
      // …and here the app is killed, before the meta row is written.
      break;
    }
    const stillClaims = await interrupted.get<SchemaMeta>('meta', META_KEY);
    expect(stillClaims?.schema_version).toBe(from);

    await runMigrations(context(interrupted));

    const clean = new MemoryDriver();
    await plant(clean, from);
    await runMigrations(context(clean));

    /*
      One field is random by design and must be compared as "present" rather
      than as a value: `content_seed` is the learner's own shuffle of the
      corpus, generated at v11 so that two people at the same level are not
      taught the same ten words on the same day. Two independent installs are
      *supposed* to differ there — and the interrupted profile has to have one,
      because a learner with no seed gets the corpus order.
    */
    const seedOf = async (driver: MemoryDriver) =>
      (await driver.get<StoredSettings>('settings', SETTINGS_KEY))?.content_seed;
    if (from < 11) {
      expect(await seedOf(interrupted)).toBeTruthy();
      expect(await seedOf(clean)).toBeTruthy();
    } else {
      // Planted with a seed, so the resumed run must not have replaced it.
      expect(await seedOf(interrupted)).toBe('seed-fixture');
    }

    const blindSeed = (dump: Record<string, unknown>) => {
      const settings = (dump.settings as Record<string, Record<string, unknown>>)?.[SETTINGS_KEY];
      if (settings) settings.content_seed = '<random>';
      return dump;
    };
    expect(blindSeed(await snapshot(interrupted))).toEqual(blindSeed(await snapshot(clean)));
  });

  it('does not invent completion, and does not lose any', async () => {
    const before = await readBack(driver);
    await runMigrations(context(driver));
    const after = await readBack(driver);

    // No counter may fall, and none may rise: a migration is not a lesson.
    expect(after.attemptsTotal).toBe(before.attemptsTotal);
    expect(after.passesTotal).toBe(before.passesTotal);
    expect(after.learnedLetters.length).toBeGreaterThanOrEqual(before.learnedLetters.length);
    expect(after.masteredWords.length).toBeGreaterThanOrEqual(before.masteredWords.length);
    // No duplicated review item.
    const keys = after.memory.map((row) => memoryKey(row.kind, row.item_key));
    expect(new Set(keys).size).toBe(keys.length);
    // No content id changed under the progress it names.
    expect(after.learnedLetters).toEqual(before.learnedLetters);
  });
});

describe('the ladder as a whole', () => {
  it('has a migration for every version between the oldest and the current', () => {
    /*
      A gap here is a profile that can never be upgraded: `runMigrations` skips
      anything at or below the stored version, so a missing rung is silently
      treated as already applied.
    */
    const produced = MIGRATIONS.map((migration) => migration.to).sort((a, b) => a - b);
    expect(produced).toEqual(VERSIONS);
    expect(produced[produced.length - 1]).toBe(SCHEMA_VERSION);
    expect(new Set(produced).size).toBe(produced.length);
  });

  it('describes what each one does', () => {
    for (const migration of MIGRATIONS) {
      expect(migration.describe.length).toBeGreaterThan(10);
    }
  });
});
