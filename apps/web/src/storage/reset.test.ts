import { describe, expect, it } from 'vitest';

import { MemoryDriver } from './driver';
import { clearEverything } from './repositories';

/**
 * "Clear everything you have learned" clears everything.
 *
 * The Privacy screen says *You can clear everything you have learned at the
 * bottom of My Learning*, and Settings offers exactly that. `clearEverything`
 * listed six of the eight stores: the wrong-answer notebook and the Numbers
 * course were left on disk. `reset()` emptied them in memory, so the screen
 * went blank and looked right — and the next launch hydrated both back from
 * storage, because that is where hydration reads them from.
 *
 * A learner who clears their data and sees it return has been told something
 * untrue by the one screen in the app whose subject is what happens to their
 * data. The stores are enumerated from `STORE_NAMES` now, minus `meta`, so a
 * store added tomorrow is cleared tomorrow rather than being the ninth one
 * somebody forgets.
 */
describe('clearing everything', () => {
  it('empties every store a learner fills, including the two that were missed', async () => {
    const driver = new MemoryDriver();
    await driver.put('settings', 'preferences', { saved_items: ['word:word_eomma'] });
    await driver.put('progress', 'character:ㄱ', { kind: 'character', item_key: 'ㄱ' });
    await driver.put('sessions', 's1', { id: 's1' });
    await driver.put('attempts', 'a1', { id: 'a1' });
    await driver.put('activity', '2026-09-03', { day: '2026-09-03' });
    await driver.put('memory', 'word:word_eomma:meaning_recognition', { stability: 3 });
    await driver.put('mistakes', 'word:word_eomma', { item_key: 'word_eomma' });
    await driver.put('numbers', 'lesson:num-lesson-sino-basics', { lesson_id: 'num-lesson-sino-basics' });

    await clearEverything(driver);

    for (const store of ['settings', 'progress', 'sessions', 'attempts', 'activity', 'memory', 'mistakes', 'numbers'] as const) {
      expect(await driver.getAll(store), `${store} still holds rows`).toEqual([]);
    }
  });

  it('leaves `meta` alone, because it is not the learner’s', async () => {
    /*
     * `meta` holds the schema version and the migration snapshots. Clearing it
     * would make the next launch believe it is a fresh install of an old
     * version and run every migration again over an empty database — which is
     * harmless exactly once and is not what the button says it does.
     */
    const driver = new MemoryDriver();
    await driver.put('meta', 'schema_version', 13);
    await driver.put('progress', 'character:ㄱ', { kind: 'character', item_key: 'ㄱ' });

    await clearEverything(driver);

    expect(await driver.get('meta', 'schema_version')).toBe(13);
  });
});
