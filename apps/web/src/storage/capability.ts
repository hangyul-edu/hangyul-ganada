import { type PersistenceDriver } from './driver';

/**
 * Whether this installation can actually keep what the learner does.
 *
 * ## Why this is a probe and not a guess
 *
 * The Settings screen carries one warning — *this browser will not remember
 * what you learn* — and it used to be decided by which driver had been opened.
 * That was wrong in both directions. It said nothing when IndexedDB opened and
 * then refused every write, which is what a browser configured to clear site
 * data on close, or one out of quota, actually does. And it said the alarming
 * thing to a learner in a perfectly ordinary window, because the first render
 * of the screen happens before the driver has been opened at all and the
 * pre-hydration placeholder is an in-memory store.
 *
 * The only question worth asking is the one this function asks: **write
 * something, read it back, take it away again, and see whether that worked.**
 * There is deliberately no private-mode detection here and there must never be
 * one — every technique for it is a browser-version-specific side channel that
 * modern browsers work to defeat, and a learner in a private window whose
 * storage genuinely works does not need to be told that it does not.
 *
 * ## Why the driver's own claim still counts
 *
 * `driver.durable` is not a guess about the environment; it is a statement
 * about the medium. `MemoryDriver` is a `Map` — it will pass a write/read/erase
 * round trip perfectly and still lose everything on reload, so the round trip
 * alone cannot be the whole answer. The two are combined: the driver says
 * whether the medium survives a reload, and the probe says whether it is
 * currently accepting writes. Both have to be true.
 */

/**
 * The probe's key in the `meta` store.
 *
 * `meta` rather than a store of its own: adding an object store is an
 * IndexedDB structure version bump, and this needs no storage of its own — it
 * needs to find out whether storage works. The row is removed again in every
 * path, including the failing ones.
 */
export const PROBE_KEY = 'capability-probe';

/**
 * Writes one row, reads it back, and removes it.
 *
 * Returns false rather than throwing on any failure, because every caller wants
 * the same thing from a failure — show the warning, carry on with the lesson —
 * and a rejected promise here must never be able to take the app down with it.
 *
 * The value written is compared on the way out. A driver that silently accepts
 * a write and returns nothing is as broken as one that throws, and it is the
 * more common shape of the failure: quota-exceeded errors are sometimes
 * swallowed by the very layer that should raise them.
 */
export async function probePersistence(driver: PersistenceDriver): Promise<boolean> {
  const token = `probe-${String(Date.now())}`;
  try {
    await driver.put('meta', PROBE_KEY, { token });
    const read = await driver.get<{ token?: string }>('meta', PROBE_KEY);
    return read?.token === token;
  } catch {
    return false;
  } finally {
    // Never leave the row behind. `copyInto` decides whether a native store is
    // empty by counting `meta` rows, and a stray probe row would look to it
    // like an install that already has data.
    try {
      await driver.remove('meta', PROBE_KEY);
    } catch {
      /* Nothing to do: the probe has already failed, and this is cleanup. */
    }
  }
}

/**
 * The answer the Settings screen shows.
 *
 * `durable` is the medium's claim and the probe is this moment's evidence; a
 * warning is only correct when the two together say the learner's practice is
 * not being kept.
 */
export async function checkPersistence(driver: PersistenceDriver): Promise<boolean> {
  if (!driver.durable) return false;
  return probePersistence(driver);
}

/**
 * Asks the browser to keep this site's data, once the learner has something to lose.
 *
 * ## Why not at startup
 *
 * `navigator.storage.persist()` is a permission request. On Firefox it puts a
 * prompt in front of the learner; on Chromium it is granted or refused silently
 * on the strength of how engaged the site looks. Both go badly on a first
 * paint: a prompt before anyone has learned anything is a prompt about nothing,
 * and Chromium's heuristics have the least to go on at exactly that moment.
 *
 * Asked instead after a first finished lesson, which is the first time there is
 * an answer to "why does this site want that" — and the moment a person is most
 * likely to say yes, because they have just invested in the thing being kept.
 *
 * ## Failure is not a state the learner hears about
 *
 * A refusal changes nothing. Storage without the persistent flag is still
 * storage; it is merely evictable under disk pressure, which for a few hundred
 * kilobytes on a device the learner uses daily is close to theoretical. So this
 * returns a boolean for the record and never surfaces anything. The only
 * warning this app shows about storage is the one that follows a real, measured
 * write-then-read failure — see `probePersistence` above, and §49.
 *
 * Asked once. `persisted()` is checked first so a returning learner who already
 * granted it is not asked again, and the caller remembers that it tried.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    // A browser that throws here is a browser that was never going to grant it.
    return false;
  }
}
