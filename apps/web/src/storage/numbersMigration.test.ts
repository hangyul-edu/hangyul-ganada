import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemProgress, NumbersLessonProgress } from '@hangyul-ganada/shared-types';

import { NUMBER_LESSONS, getNumberLesson } from '../data/numbers';
import { applyNumbersEvent, blankLessonProgress, isComplete } from '../domain/numbersProgress';
import { MemoryDriver } from './driver';
import { NumbersRepository, ProgressRepository } from './repositories';
import { META_KEY, SCHEMA_VERSION, blankProgress, progressKey, runMigrations, type SchemaMeta } from './schema';

/**
 * Migration 13 — Numbers leaves the letter stores.
 *
 * ## What shipped, and what did not
 *
 * The committed release artefacts are v1.0.0 (`86d0babd`) and contain no
 * Numbers feature at all. The contaminated rows this migration removes —
 * `progress`/`memory`/`mistakes` rows under `number:number:num-*` and
 * `kind: 'number'` — were written only by uncommitted development builds. So
 * the migration is a *namespace cleanup* and not a data conversion: there is
 * nothing to convert, and inventing evidence for the new record from an item
 * flag that was written on the way in would recreate the defect.
 *
 * Every removed row is snapshotted into `meta` first, so nothing is destroyed.
 *
 * ## Web and native
 *
 * Both platforms persist through the same IndexedDB driver (the Capacitor
 * WebView is a browser); the fixtures below run against the in-memory driver
 * that implements the same interface, which is the layer the migration sees.
 */

const NOW = new Date('2026-09-02T09:00:00.000Z');

function ctx(driver: MemoryDriver) {
  return { driver, readLegacyBlob: () => null, clearLegacyBlob: () => {}, now: () => NOW };
}

async function atVersion(driver: MemoryDriver, version: number) {
  await driver.put<SchemaMeta>('meta', META_KEY, {
    schema_version: version,
    installed_at: NOW.toISOString(),
    last_opened_at: NOW.toISOString(),
    install_id: 'fixture',
  });
}

const letterRow = (): ItemProgress => ({
  ...blankProgress('character', 'ㄱ', NOW.toISOString()),
  stage: 'learned',
});
const wordRow = (): ItemProgress => ({
  ...blankProgress('word', '사과', NOW.toISOString()),
  stage: 'learned',
});

/** What the first (unshipped) Numbers build wrote: double-prefixed and mis-kinded. */
async function contaminate(driver: MemoryDriver) {
  const base = blankProgress('character', 'number:num-sino-1', NOW.toISOString());
  await driver.put('progress', 'number:number:num-sino-1', { ...base, kind: 'number', item_key: 'number:num-sino-1', stage: 'learned' });
  await driver.put('progress', 'character:number:num-sino-2', { ...base, item_key: 'number:num-sino-2', stage: 'learned' });
  await driver.put('memory', 'number:number:num-sino-1', { kind: 'number', item_key: 'number:num-sino-1', skills: {} });
  await driver.put('mistakes', 'number:num-sino-1', { id: 'number:num-sino-1', kind: 'number', item_key: 'num-sino-1', count: 2 });
}

describe('migration 13 · Numbers namespace cleanup', () => {
  let driver: MemoryDriver;
  beforeEach(() => {
    driver = new MemoryDriver();
  });

  it('F1 · fresh install: applies cleanly, writes no snapshot, leaves the numbers store empty', async () => {
    const applied = await runMigrations(ctx(driver));
    expect(applied).toContain(13);
    expect(await driver.get('meta', 'numbers_v13_snapshot')).toBeUndefined();
    expect(await driver.getAll('numbers')).toEqual([]);
    expect((await driver.get<SchemaMeta>('meta', META_KEY))?.schema_version).toBe(SCHEMA_VERSION);
  });

  it('F2 · letter-only profile: every letter and word row survives byte for byte', async () => {
    await atVersion(driver, 12);
    await driver.put('progress', progressKey('character', 'ㄱ'), letterRow());
    await driver.put('progress', progressKey('word', '사과'), wordRow());
    await runMigrations(ctx(driver));
    expect(await driver.get('progress', progressKey('character', 'ㄱ'))).toEqual(letterRow());
    expect(await driver.get('progress', progressKey('word', '사과'))).toEqual(wordRow());
    expect(await driver.get('meta', 'numbers_v13_snapshot')).toBeUndefined();
  });

  it('F3 · contaminated profile: Numbers rows are snapshotted and removed, letters untouched', async () => {
    await atVersion(driver, 12);
    await driver.put('progress', progressKey('character', 'ㄱ'), letterRow());
    await contaminate(driver);
    await runMigrations(ctx(driver));

    const snapshot = await driver.get<{ removed: number; stores: Record<string, number> }>('meta', 'numbers_v13_snapshot');
    expect(snapshot?.removed).toBe(4);
    expect(snapshot?.stores).toEqual({ progress: 2, memory: 1, mistakes: 1 });

    const progress = await driver.getAll<ItemProgress>('progress');
    expect(progress).toEqual([letterRow()]);
    expect(await driver.getAll('memory')).toEqual([]);
    expect(await driver.getAll('mistakes')).toEqual([]);

    // and the repository sees a clean letter table
    const repo = new ProgressRepository(driver);
    const loaded = await repo.loadAll();
    expect(Object.keys(loaded.rows)).toEqual([progressKey('character', 'ㄱ')]);
  });

  it('F4 · idempotent: running the migration twice changes nothing more', async () => {
    await atVersion(driver, 12);
    await contaminate(driver);
    await runMigrations(ctx(driver));
    const after1 = { progress: await driver.getAll('progress'), meta: await driver.get('meta', 'numbers_v13_snapshot') };
    const applied = await runMigrations(ctx(driver));
    expect(applied).toEqual([]);
    expect(await driver.getAll('progress')).toEqual(after1.progress);
    expect(await driver.get('meta', 'numbers_v13_snapshot')).toEqual(after1.meta);
  });

  it('F5 · the old flags do not become new completions', async () => {
    await atVersion(driver, 12);
    await contaminate(driver);
    await runMigrations(ctx(driver));
    const repo = new NumbersRepository(driver);
    const { rows } = await repo.loadAll(getNumberLesson, NOW);
    expect(rows).toEqual({});
  });
});

describe('Numbers records on read', () => {
  let driver: MemoryDriver;
  let repo: NumbersRepository;
  const sino = getNumberLesson('num-lesson-sino-basics')!;
  beforeEach(() => {
    driver = new MemoryDriver();
    repo = new NumbersRepository(driver);
  });

  it('F6 · a partial record is kept as it is', async () => {
    const record = applyNumbersEvent(blankLessonProgress(sino.id, NOW), sino, { type: 'explanation_viewed', step: sino.explanation[0]!.text }, NOW);
    await repo.put(record);
    const { rows, dropped, downgraded } = await repo.loadAll(getNumberLesson, NOW);
    expect(rows[sino.id]).toEqual(record);
    expect(dropped).toBe(0);
    expect(downgraded).toBe(0);
  });

  it('F7 · a corrupted completion flag is downgraded and counted', async () => {
    await driver.put('numbers', `lesson:${sino.id}`, { ...blankLessonProgress(sino.id, NOW), completed_at: NOW.toISOString() });
    const { rows, downgraded } = await repo.loadAll(getNumberLesson, NOW);
    expect(downgraded).toBe(1);
    expect(rows[sino.id]!.completed_at).toBeNull();
    expect(isComplete(rows[sino.id]!, sino)).toBe(false);
  });

  it('F8 · a record for a lesson the curriculum no longer has is dropped', async () => {
    await driver.put('numbers', 'lesson:num-lesson-retired', { ...blankLessonProgress('num-lesson-retired', NOW) });
    const { rows, dropped } = await repo.loadAll(getNumberLesson, NOW);
    expect(dropped).toBe(1);
    expect(rows).toEqual({});
  });

  it('F9 · evidence naming items no longer in the lesson is dropped, the rest kept', async () => {
    const record: NumbersLessonProgress = {
      ...blankLessonProgress(sino.id, NOW),
      explanation_steps_viewed: [sino.explanation[0]!.text, 'lesson.retired.step9'],
      examples_viewed: ['num-sino-1', 'num-retired-item'],
      items: { 'num-sino-1': { correct: 1, incorrect: 0, mastered_at: null }, 'num-retired': { correct: 5, incorrect: 0, mastered_at: NOW.toISOString() } },
    };
    await driver.put('numbers', `lesson:${sino.id}`, record);
    const { rows } = await repo.loadAll(getNumberLesson, NOW);
    expect(rows[sino.id]!.explanation_steps_viewed).toEqual([sino.explanation[0]!.text]);
    expect(rows[sino.id]!.examples_viewed).toEqual(['num-sino-1']);
    expect(Object.keys(rows[sino.id]!.items)).toEqual(['num-sino-1']);
  });

  it('F10 · malformed rows (wrong types, negative counts) are repaired or rejected, never thrown on', async () => {
    await driver.put('numbers', 'lesson:garbage', 'not an object');
    await driver.put('numbers', `lesson:${sino.id}`, {
      lesson_id: sino.id,
      attempts: { total: -3, correct: 'many' },
      mastery: { correct: 99, total: 8 },
      items: null,
      explanation_steps_viewed: 'all',
    });
    const { rows, dropped } = await repo.loadAll(getNumberLesson, NOW);
    expect(dropped).toBe(1);
    const row = rows[sino.id]!;
    expect(row.attempts).toEqual({ total: 0, correct: 0, incorrect: 0 });
    expect(row.mastery).toEqual({ taken_at: NOW.toISOString(), correct: 8, total: 8, passed: true });
    expect(row.explanation_steps_viewed).toEqual([]);
    expect(row.completed_at).toBeNull();
  });

  it('F11 · records for every lesson survive a round trip unchanged', async () => {
    for (const lesson of NUMBER_LESSONS) await repo.put(blankLessonProgress(lesson.id, NOW));
    const { rows } = await repo.loadAll(getNumberLesson, NOW);
    expect(Object.keys(rows).sort()).toEqual(NUMBER_LESSONS.map((l) => l.id).sort());
  });

  it('F12 · clearing Numbers leaves letters and words alone', async () => {
    await driver.put('progress', progressKey('character', 'ㄱ'), letterRow());
    await repo.put(blankLessonProgress(sino.id, NOW));
    await repo.clear();
    expect(await driver.getAll('numbers')).toEqual([]);
    expect(await driver.get('progress', progressKey('character', 'ㄱ'))).toEqual(letterRow());
  });
});
