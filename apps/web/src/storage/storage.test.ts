/**
 * Guards on the one thing that cannot be recovered.
 *
 * A learner's history exists in exactly one place. A migration that drops it or
 * a corrupt row that takes the whole map down with it are indistinguishable,
 * from the customer's side, from the app deleting what they paid for. These
 * tests are the cheapest insurance available against that.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { MemoryDriver } from './driver';
import {
  ActivityRepository,
  LearningRepository,
  ProgressRepository,
  SettingsRepository,
  clearEverything,
  normaliseProgress,
} from './repositories';
import {
  META_KEY,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  blankProgress,
  defaultSettings,
  progressKey,
  runMigrations,
  type SchemaMeta,
  type StoredSettings,
} from './schema';

const NOW = new Date('2026-03-01T09:00:00.000Z');

function makeContext(driver: MemoryDriver, blob: string | null) {
  let legacy = blob;
  return {
    driver,
    readLegacyBlob: () => legacy,
    clearLegacyBlob: () => {
      legacy = null;
    },
    now: () => NOW,
    peekLegacy: () => legacy,
  };
}

describe('migrations', () => {
  let driver: MemoryDriver;

  beforeEach(() => {
    driver = new MemoryDriver();
  });

  it('records the schema version on a fresh install', async () => {
    const applied = await runMigrations(makeContext(driver, null));
    // Every migration runs on an empty install, in order, and each is a no-op
    // with nothing to convert.
    expect(applied).toEqual([3, 4, 5, 6]);
    const meta = await driver.get<SchemaMeta>('meta', META_KEY);
    expect(meta?.schema_version).toBe(SCHEMA_VERSION);
    expect(meta?.install_id).toBeTruthy();
  });

  it('imports a v2 localStorage profile into the stores', async () => {
    // The exact shape the pre-IndexedDB build wrote.
    const blob = JSON.stringify({
      schema_version: 2,
      learner_id: 'guest-abc',
      is_guest: true,
      preferences: {
        selected_font_id: 'nanum-myeongjo',
        practice_mode: 'write',
        daily_target: 10,
        show_grid: false,
        show_center_crosshair: true,
        locale: 'ja',
      },
      progress: {
        'character:ㄱ': {
          item_key: 'ㄱ',
          kind: 'character',
          attempts: 4,
          passes: 3,
          fails: 1,
          learned: true,
          needs_review: false,
          last_score: 0.94,
          last_attempted_at: '2026-02-20T10:00:00.000Z',
        },
        'word:word-mul': {
          item_key: 'word-mul',
          kind: 'word',
          attempts: 1,
          passes: 0,
          fails: 1,
          learned: false,
          needs_review: true,
          last_score: 0.4,
          last_attempted_at: '2026-02-21T10:00:00.000Z',
        },
      },
      sessions: [{ id: 'session-1', kind: 'letters' }],
      active_days: ['2026-02-20', '2026-02-21'],
    });

    const context = makeContext(driver, blob);
    await runMigrations(context);

    const settings = await new SettingsRepository(driver).load();
    expect(settings.selected_font_id).toBe('nanum-myeongjo');
    // v2's "write" mode meant a blank writing box, which the product no longer
    // has. The v5 migration lands that learner on the focused style — a lighter
    // guide, not no guide — rather than on a setting that cannot be honoured.
    expect(settings.practice_style).toBe('focused');
    expect(settings.daily_target).toBe(10);
    expect(settings.show_grid).toBe(false);
    expect(settings.locale).toBe('ja');
    expect(settings.active_days).toEqual(['2026-02-20', '2026-02-21']);
    // A preference that did not exist in v2 arrives at its default rather than
    // as undefined.
    expect(settings.voice).toBe('female');
    expect(settings.autoplay_audio).toBe(true);

    const { rows } = await new ProgressRepository(driver).loadAll();
    const consonant = rows[progressKey('character', 'ㄱ')]!;
    expect(consonant.attempts).toBe(4);
    expect(consonant.passes).toBe(3);
    // v2 knew the learner had passed it but not how, and had no notion of
    // having heard it. Promoting to `practised` credits the writing they did and
    // stops short of inventing the rest.
    expect(consonant.stage).toBe('practised');
    expect(consonant.learned).toBe(false);
    expect(consonant.practice_passes).toBe(3);
    // And they are not asked to re-watch a demonstration for a letter they had
    // already written before the demonstration existed.
    expect(consonant.demo_seen).toBe(true);

    const word = rows[progressKey('word', 'word-mul')]!;
    expect(word.stage).toBe('introduced');
    expect(word.needs_review).toBe(true);
    expect(word.review_due_at).toBe(NOW.toISOString());

    const sessions = await new LearningRepository(driver).loadAll();
    expect(sessions).toHaveLength(1);

    // The blob is only dropped once the import has been read back.
    expect(context.peekLegacy()).toBeNull();
  });

  it('keeps the legacy blob when the import could not be confirmed', async () => {
    const blob = JSON.stringify({ schema_version: 2, progress: {} });
    // A driver that accepts writes and returns nothing — Safari private mode.
    const amnesiac = new MemoryDriver();
    amnesiac.get = async () => undefined;
    const context = makeContext(amnesiac, blob);
    await runMigrations(context);
    expect(context.peekLegacy()).not.toBeNull();
  });

  it('discards an unreadable blob rather than failing to launch', async () => {
    const context = makeContext(driver, '{ this is not json');
    await expect(runMigrations(context)).resolves.toBeDefined();
    expect(context.peekLegacy()).toBeNull();
  });

  it('does not re-run a migration that has already been applied', async () => {
    await runMigrations(makeContext(driver, null));
    const applied = await runMigrations(makeContext(driver, 'ignored'));
    expect(applied).toEqual([]);
  });

  it('preserves the install date across launches', async () => {
    await runMigrations(makeContext(driver, null));
    const first = await driver.get<SchemaMeta>('meta', META_KEY);
    const later = { ...makeContext(driver, null), now: () => new Date('2026-06-01T00:00:00.000Z') };
    await runMigrations(later);
    const second = await driver.get<SchemaMeta>('meta', META_KEY);
    expect(second?.installed_at).toBe(first?.installed_at);
    expect(second?.install_id).toBe(first?.install_id);
    expect(second?.last_opened_at).not.toBe(first?.last_opened_at);
  });
});

describe('the activity back-fill', () => {
  let driver: MemoryDriver;

  beforeEach(() => {
    driver = new MemoryDriver();
  });

  it('builds a history from progress a learner already had', async () => {
    // The alternative was starting everyone's Activity screen at the update,
    // so a learner three months in would be told they had studied for one day.
    await driver.put('progress', progressKey('character', 'ㄱ'), {
      ...blankProgress('character', 'ㄱ', '2026-02-01T10:00:00.000Z'),
      attempts: 6,
      passes: 4,
      stage: 'learned',
      last_attempted_at: '2026-02-20T10:00:00.000Z',
      learned_at: '2026-02-21T11:00:00.000Z',
    } satisfies ItemProgress);
    await driver.put('progress', progressKey('word', 'word-mul'), {
      ...blankProgress('word', 'word-mul', '2026-02-01T10:00:00.000Z'),
      attempts: 2,
      passes: 2,
      stage: 'learned',
      last_attempted_at: '2026-02-21T09:00:00.000Z',
      learned_at: '2026-02-21T09:30:00.000Z',
    } satisfies ItemProgress);

    await runMigrations(makeContext(driver, null));

    const days = await new ActivityRepository(driver).loadAll();
    expect(Object.keys(days).sort()).toEqual(['2026-02-20', '2026-02-21']);
    expect(days['2026-02-20']!.attempts).toBe(6);
    expect(days['2026-02-20']!.passes).toBe(4);
    expect(days['2026-02-21']!.characters_learned).toBe(1);
    expect(days['2026-02-21']!.words_learned).toBe(1);
    // Nothing before v4 recorded when a lesson ended, and inventing a
    // plausible number would put a figure on screen that never happened.
    expect(days['2026-02-20']!.active_ms).toBe(0);
  });

  it('recovers days from sessions where no item was finished', async () => {
    await driver.put('sessions', 'session-1', {
      id: 'session-1',
      kind: 'letters',
      lesson_id: 'lesson-vowels-core',
      started_at: '2026-02-18T08:00:00.000Z',
      completed_at: null,
      target_count: 6,
      passed_count: 0,
      attempt_count: 11,
    });

    await runMigrations(makeContext(driver, null));

    const days = await new ActivityRepository(driver).loadAll();
    expect(days['2026-02-18']!.attempts).toBe(11);
  });

  it('leaves an empty install with no invented history', async () => {
    await runMigrations(makeContext(driver, null));
    expect(await new ActivityRepository(driver).loadAll()).toEqual({});
  });

  it('does not run twice over a profile that already has roll-ups', async () => {
    await driver.put('progress', progressKey('character', 'ㄴ'), {
      ...blankProgress('character', 'ㄴ', '2026-02-01T10:00:00.000Z'),
      attempts: 3,
      passes: 3,
      last_attempted_at: '2026-02-20T10:00:00.000Z',
    } satisfies ItemProgress);

    await runMigrations(makeContext(driver, null));
    await runMigrations(makeContext(driver, null));

    const days = await new ActivityRepository(driver).loadAll();
    expect(days['2026-02-20']!.attempts).toBe(3);
  });

  it('keeps every progress row it read', async () => {
    // A migration that adds a store must not touch the one thing that cannot
    // be recovered.
    const row = blankProgress('character', 'ㅁ', '2026-02-01T10:00:00.000Z');
    await driver.put('progress', progressKey('character', 'ㅁ'), row);
    await runMigrations(makeContext(driver, null));
    const { rows } = await new ProgressRepository(driver).loadAll();
    expect(rows[progressKey('character', 'ㅁ')]).toMatchObject({ item_key: 'ㅁ' });
  });
});

describe('progress repository', () => {
  it('drops an unreadable row without losing the rest', async () => {
    const driver = new MemoryDriver();
    const good = blankProgress('character', 'ㄴ', NOW.toISOString());
    await driver.put('progress', progressKey('character', 'ㄴ'), good);
    await driver.put('progress', 'corrupt', { kind: 'character' });
    await driver.put('progress', 'garbage', 'not an object');

    const { rows, dropped } = await new ProgressRepository(driver).loadAll();
    expect(Object.keys(rows)).toEqual([progressKey('character', 'ㄴ')]);
    expect(dropped).toBe(2);
  });

  it('repairs a row that is missing its counters', () => {
    const repaired = normaliseProgress({ item_key: 'ㅁ', kind: 'character', stage: 'practised' });
    expect(repaired).not.toBeNull();
    expect(repaired!.attempts).toBe(0);
    expect(repaired!.trace_passes).toBe(0);
    expect(repaired!.stage).toBe('practised');
  });

  it('translates a pre-v5 stage rather than resetting the row', () => {
    // The rescue path runs on anything read out of the store, including during
    // the v5 migration itself. A row still spelled `written` has to survive it:
    // treating an old spelling as corruption would silently delete progress.
    const rescued = normaliseProgress({
      item_key: 'ㅂ',
      kind: 'character',
      stage: 'written',
      write_passes: 4,
    });
    expect(rescued!.stage).toBe('practised');
    expect(rescued!.practice_passes).toBe(4);
  });

  it('rejects a row with no key at all', () => {
    expect(normaliseProgress({ kind: 'word' })).toBeNull();
    expect(normaliseProgress(null)).toBeNull();
  });

  it('keeps `learned` in step with the stage', () => {
    const stale = normaliseProgress({
      item_key: 'ㅂ',
      kind: 'character',
      stage: 'traced',
      // A row written by a buggy release that set the mirror without the stage.
      learned: true,
    });
    expect(stale!.learned).toBe(false);
  });
});

describe('settings repository', () => {
  it('fills in a preference added after the profile was written', async () => {
    const driver = new MemoryDriver();
    await driver.put('settings', SETTINGS_KEY, { daily_target: 3 } as unknown as StoredSettings);
    const settings = await new SettingsRepository(driver).load();
    expect(settings.daily_target).toBe(3);
    expect(settings.voice).toBe('female');
    expect(settings.active_days).toEqual([]);
  });

  it('mirrors the locale and voice for the next launch’s first paint', async () => {
    const driver = new MemoryDriver();
    await new SettingsRepository(driver).patch({ locale: 'ko', voice: 'male' });
    expect(SettingsRepository.readMirror()).toEqual({ locale: 'ko', voice: 'male' });
  });
});

describe('reset', () => {
  it('clears the learner’s data and leaves the schema record', async () => {
    const driver = new MemoryDriver();
    await runMigrations(makeContext(driver, null));
    await new ProgressRepository(driver).put(blankProgress('character', 'ㅇ', NOW.toISOString()));
    await clearEverything(driver);

    expect((await new ProgressRepository(driver).loadAll()).rows).toEqual({});
    expect(await new SettingsRepository(driver).load()).toEqual(defaultSettings());
    // The install is still the same install; only what the learner did is gone.
    expect(await driver.get<SchemaMeta>('meta', META_KEY)).toBeDefined();
  });
});
