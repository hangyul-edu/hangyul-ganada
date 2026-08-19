/**
 * The storage warning, decided by evidence rather than by suspicion.
 *
 * The Settings screen carries one line — *your progress is not being saved* —
 * and it was shown to learners whose storage was perfectly healthy. These cover
 * the rule that replaced the guess: a real write, read back and erased, on the
 * driver the app is actually using.
 */
import { describe, expect, it, vi } from 'vitest';

import { MemoryDriver, type PersistenceDriver } from './driver';
import { IndexedDbDriver } from './indexedDbDriver';
import { PROBE_KEY, checkPersistence, probePersistence } from './capability';

/** A driver that claims durability, so the probe is the only thing deciding. */
function claimsDurable(driver: PersistenceDriver): PersistenceDriver {
  return new Proxy(driver, {
    get: (target, key) =>
      key === 'durable' ? true : Reflect.get(target, key, target),
  });
}

describe('the probe', () => {
  it('passes on a store that accepts a write and gives it back', async () => {
    await expect(probePersistence(new MemoryDriver())).resolves.toBe(true);
  });

  it('leaves nothing behind', async () => {
    const driver = new MemoryDriver();
    await probePersistence(driver);
    // `copyInto` decides whether a native store is empty by counting `meta`
    // rows. A probe row left there would read to it as an install with data.
    await expect(driver.get('meta', PROBE_KEY)).resolves.toBeUndefined();
    await expect(driver.getAll('meta')).resolves.toEqual([]);
  });

  it('fails when the write throws — a browser out of quota, or refusing', async () => {
    const driver = new MemoryDriver();
    vi.spyOn(driver, 'put').mockRejectedValue(new DOMException('QuotaExceededError'));
    await expect(probePersistence(driver)).resolves.toBe(false);
  });

  it('fails when the write is swallowed and nothing comes back', async () => {
    // The quieter failure, and the more common one: the call resolves, the row
    // is not there. A driver-identity check cannot see this at all.
    const driver = new MemoryDriver();
    vi.spyOn(driver, 'put').mockResolvedValue(undefined);
    await expect(probePersistence(driver)).resolves.toBe(false);
  });

  it('cleans up even when the probe failed', async () => {
    const driver = new MemoryDriver();
    const get = vi.spyOn(driver, 'get').mockRejectedValue(new Error('read failed'));
    await expect(probePersistence(driver)).resolves.toBe(false);
    get.mockRestore();
    await expect(driver.get('meta', PROBE_KEY)).resolves.toBeUndefined();
  });
});

describe('what the learner is told', () => {
  it('says nothing when the store both survives a reload and works', async () => {
    await expect(checkPersistence(claimsDurable(new MemoryDriver()))).resolves.toBe(true);
  });

  it('warns about a store that cannot survive a reload, however well it writes', async () => {
    // MemoryDriver passes a write/read/erase round trip perfectly and still
    // loses everything on reload. The round trip alone is not the whole answer.
    await expect(checkPersistence(new MemoryDriver())).resolves.toBe(false);
  });

  it('warns about a durable engine that has stopped accepting writes', async () => {
    const driver = claimsDurable(new MemoryDriver());
    vi.spyOn(driver, 'put').mockRejectedValue(new DOMException('QuotaExceededError'));
    await expect(checkPersistence(driver)).resolves.toBe(false);
  });

  it('never asks whether the window is private', async () => {
    /*
     * The rule this replaced. Every private-mode detection technique is a
     * browser-version-specific side channel that browsers actively work to
     * defeat, and a learner in a private window whose storage genuinely works
     * does not need to be told that it does not. Asserted on the source so it
     * cannot creep back in through a helper.
     */
    const source = [
      probePersistence.toString(),
      checkPersistence.toString(),
      IndexedDbDriver.available.toString(),
    ].join('\n');
    expect(source).not.toMatch(/incognito|private|estimate|quota|webkitTemporaryStorage/i);
  });
});
