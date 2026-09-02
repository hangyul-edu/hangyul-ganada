import { describe, expect, it } from 'vitest';

import { PRODUCT } from '../config/product';
import { MemoryDriver } from './driver';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  backupFilename,
  exportBackup,
  readBackup,
  restoreBackup,
} from './backup';
import { META_KEY, SCHEMA_VERSION, type SchemaMeta } from './schema';

/** A driver holding one row in every store a learner fills. */
async function aLearner(schemaVersion = SCHEMA_VERSION): Promise<MemoryDriver> {
  const driver = new MemoryDriver();
  await driver.put<SchemaMeta>('meta', META_KEY, {
    schema_version: schemaVersion,
    installed_at: '2026-06-01T09:00:00.000Z',
    last_opened_at: '2026-09-03T09:00:00.000Z',
    install_id: 'install-the-old-phone',
  });
  await driver.put('settings', 'preferences', { locale: 'fr', saved_items: ['word:word_eomma'] });
  await driver.put('progress', 'character:ㄱ', { kind: 'character', item_key: 'ㄱ', learned: true });
  await driver.put('sessions', 's1', { id: 's1', started_at: '2026-09-01T09:00:00.000Z' });
  await driver.put('attempts', 'a1', { id: 'a1', correct: false });
  await driver.put('activity', '2026-09-01', { day: '2026-09-01', minutes: 12 });
  await driver.put('memory', 'word:word_eomma:meaning_recognition', { stability: 3.2, due: '2026-09-05' });
  await driver.put('mistakes', 'word:word_eomma', { item_key: 'word_eomma', picked: '아빠' });
  await driver.put('numbers', 'lesson:num-lesson-sino-basics', { lesson_id: 'num-lesson-sino-basics', completed: true });
  return driver;
}

/** Every store's rows, as the comparable thing a round trip has to preserve. */
async function contents(driver: MemoryDriver) {
  const stores = ['settings', 'progress', 'sessions', 'attempts', 'activity', 'memory', 'mistakes', 'numbers'] as const;
  const out: Record<string, unknown> = {};
  for (const store of stores) out[store] = await driver.entries(store);
  return out;
}

describe('exporting a backup', () => {
  it('carries every store the learner filled, and the schema they were written under', async () => {
    const driver = await aLearner();

    const backup = await exportBackup(driver, () => new Date('2026-09-03T10:00:00.000Z'));

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.format_version).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.schema_version).toBe(SCHEMA_VERSION);
    expect(backup.app_version).toBe(PRODUCT.version);
    expect(backup.exported_at).toBe('2026-09-03T10:00:00.000Z');
    expect(backup.install_id).toBe('install-the-old-phone');
    expect(Object.keys(backup.stores).sort()).toEqual(
      ['activity', 'attempts', 'memory', 'mistakes', 'numbers', 'progress', 'sessions', 'settings'],
    );
    expect(backup.stores.memory).toEqual([
      ['word:word_eomma:meaning_recognition', { stability: 3.2, due: '2026-09-05' }],
    ]);
  });

  it('leaves `meta` out: it describes the install, not the learning', async () => {
    const backup = await exportBackup(await aLearner());

    expect(backup.stores).not.toHaveProperty('meta');
  });

  it('names the file by the day it was written, so two of them sort', () => {
    expect(backupFilename(new Date(2026, 8, 3))).toBe('hangyul-ganada-learning-2026-09-03.json');
  });
});

describe('a round trip through a real file', () => {
  it('puts the same learning on a second device, byte for byte', async () => {
    const old = await aLearner();
    const file = JSON.stringify(await exportBackup(old), null, 2);

    const read = readBackup(file);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.rows).toBe(8);

    const fresh = new MemoryDriver();
    const outcome = await restoreBackup(fresh, read.backup, () => new Date('2026-09-03T11:00:00.000Z'));

    expect(outcome.skipped).toBe(0);
    expect(await contents(fresh)).toEqual(await contents(old));
  });

  it('replaces what was on the device rather than merging into it', async () => {
    /*
     * Two installs that both hold a review schedule for the same word cannot be
     * combined without inventing a review history — so the restore is a
     * replacement, and a row that only the target device had is gone afterwards.
     */
    const backup = await exportBackup(await aLearner());
    const device = new MemoryDriver();
    await device.put('progress', 'character:ㄴ', { kind: 'character', item_key: 'ㄴ' });
    await device.put('memory', 'word:word_appa:meaning_recognition', { stability: 9 });

    await restoreBackup(device, backup);

    expect(await device.get('progress', 'character:ㄴ')).toBeUndefined();
    expect(await device.get('memory', 'word:word_appa:meaning_recognition')).toBeUndefined();
    expect(await device.get('progress', 'character:ㄱ')).toEqual({
      kind: 'character',
      item_key: 'ㄱ',
      learned: true,
    });
  });

  it('keeps the device its own: the install id is this phone’s, not the file’s', async () => {
    const backup = await exportBackup(await aLearner());
    const device = new MemoryDriver();
    await device.put<SchemaMeta>('meta', META_KEY, {
      schema_version: SCHEMA_VERSION,
      installed_at: '2026-08-20T09:00:00.000Z',
      last_opened_at: '2026-08-20T09:00:00.000Z',
      install_id: 'install-the-new-phone',
    });

    await restoreBackup(device, backup);

    const meta = await device.get<SchemaMeta>('meta', META_KEY);
    expect(meta?.install_id).toBe('install-the-new-phone');
    expect(meta?.installed_at).toBe('2026-08-20T09:00:00.000Z');
  });
});

describe('an older backup', () => {
  it('is carried up by the ordinary migrations, not by a second path', async () => {
    const old = await aLearner(12);
    const backup = await exportBackup(old);
    expect(backup.schema_version).toBe(12);

    const fresh = new MemoryDriver();
    const outcome = await restoreBackup(fresh, backup);

    expect(outcome.migrated).toEqual([13]);
    const meta = await fresh.get<SchemaMeta>('meta', META_KEY);
    expect(meta?.schema_version).toBe(SCHEMA_VERSION);
  });
});

describe('a file that is not a backup', () => {
  it.each([
    ['something that is not JSON at all', 'not a backup, just words', 'not_json'],
    ['a JSON array', '[1, 2, 3]', 'not_a_backup'],
    ['JSON from another app', JSON.stringify({ format: 'someone-else/export', stores: {} }), 'not_a_backup'],
    ['a backup with no schema version', JSON.stringify({ format: BACKUP_FORMAT, format_version: 1, stores: {} }), 'not_a_backup'],
  ])('refuses %s', (_name, text, problem) => {
    const read = readBackup(text);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problem).toBe(problem);
  });

  it('refuses a file from a newer app rather than reading half of it', () => {
    /*
     * There is no migration backwards. A file whose rows are in a shape this
     * build's migrations cannot reach would leave a database this build cannot
     * repair, so it is refused whole — with copy that tells the learner to
     * update rather than that their file is broken.
     */
    const fromTheFuture = JSON.stringify({
      format: BACKUP_FORMAT,
      format_version: BACKUP_FORMAT_VERSION,
      schema_version: SCHEMA_VERSION + 1,
      stores: { progress: [['character:ㄱ', {}]] },
    });

    const read = readBackup(fromTheFuture);
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problem).toBe('from_a_newer_app');
  });

  it('refuses a newer envelope even when the rows look familiar', () => {
    const read = readBackup(JSON.stringify({
      format: BACKUP_FORMAT,
      format_version: BACKUP_FORMAT_VERSION + 1,
      schema_version: SCHEMA_VERSION,
      stores: { progress: [['character:ㄱ', {}]] },
    }));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problem).toBe('from_a_newer_app');
  });

  it('refuses an empty one, rather than clearing the device for nothing', async () => {
    const read = readBackup(JSON.stringify(await exportBackup(new MemoryDriver())));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.problem).toBe('empty');
  });
});

describe('a backup with damaged rows', () => {
  it('keeps the rows that are pairs and reports the ones that are not', async () => {
    const damaged = JSON.stringify({
      format: BACKUP_FORMAT,
      format_version: BACKUP_FORMAT_VERSION,
      schema_version: SCHEMA_VERSION,
      stores: {
        progress: [
          ['character:ㄱ', { kind: 'character', item_key: 'ㄱ' }],
          ['character:ㄴ'],
          [42, { kind: 'character' }],
          'a bare string',
        ],
        // A store this build does not know is ignored rather than fatal.
        constellations: [['orion', {}]],
      },
    });

    const read = readBackup(damaged);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.rows).toBe(1);

    const driver = new MemoryDriver();
    const outcome = await restoreBackup(driver, read.backup);

    expect(outcome.restored.progress).toBe(1);
    expect(await driver.getAll('progress')).toHaveLength(1);
  });
});
