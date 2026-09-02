import type { ItemProgress } from '@hangyul-ganada/shared-types';

import { memoryKey } from '../domain/memory';
import { isNative, hasPlugin } from '../native/platform';
import { NativeSqliteDriver } from '../native/store';
import { STORE_NAMES, type PersistenceDriver, type StoreName } from './driver';
import { IndexedDbDriver, openDriver as openWebDriver } from './indexedDbDriver';
import { META_KEY, SETTINGS_KEY, progressKey } from './schema';

/**
 * Chooses where this run of the app keeps the learner's practice.
 *
 * The order is not a preference list, it is a durability list:
 *
 * 1. **SQLite**, on Android and iOS. A file in the app's own container, which
 *    survives an app update and a reboot, is carried to a new phone by the
 *    platform's backup, and is not touched by "Clear cache".
 * 2. **IndexedDB**, in a browser. The best a browser offers.
 * 3. **Memory**, when a private window or an enterprise policy refuses
 *    storage. The lesson still works end to end; it simply will not survive a
 *    reload, and Settings says so rather than letting a learner believe three
 *    weeks of practice is safe when it is not.
 *
 * Nothing above this function knows which one it got, except through
 * `driver.name` and `driver.durable`.
 */
export async function openDriver(): Promise<PersistenceDriver> {
  if (isNative && hasPlugin('HangyulStore')) {
    try {
      const sqlite = await NativeSqliteDriver.open();
      await adoptWebViewData(sqlite);
      return sqlite;
    } catch {
      // A device that cannot open its own database is a real possibility —
      // storage full, a corrupted file — and the answer is a working app on
      // the next best engine, not a launch failure the learner cannot act on.
    }
  }
  return openWebDriver();
}

/**
 * Moves any practice left in the WebView's IndexedDB into SQLite, once.
 *
 * This is insurance rather than a live migration path: version 1.0.0 is the
 * first native release, so on a normal install there is nothing to find. It
 * runs anyway because the failure it prevents — a learner updating the app and
 * finding an empty streak — is the one failure a product with no cloud copy
 * cannot recover from, and because the check costs one empty read.
 *
 * It only ever runs into an *empty* SQLite store, so it can never overwrite
 * newer native data with a stale WebView copy.
 */
async function adoptWebViewData(sqlite: PersistenceDriver): Promise<void> {
  if (!IndexedDbDriver.available()) return;

  let webview: IndexedDbDriver;
  try {
    webview = await IndexedDbDriver.open();
  } catch {
    return;
  }

  try {
    await copyInto(sqlite, webview);
  } finally {
    webview.close();
  }
}

/**
 * Copies every store from `source` into `target`, but only if `target` is
 * empty.
 *
 * Separated from the driver plumbing above so it can be tested against two
 * `MemoryDriver`s: the interesting part is the key derivation, and it fails
 * silently when it is wrong — the rows arrive, keyed by something nothing
 * reads, and the app looks like it lost the data it just successfully copied.
 *
 * Returns the number of rows copied, which is zero on every ordinary launch.
 */
export async function copyInto(
  target: PersistenceDriver,
  source: PersistenceDriver,
): Promise<number> {
  // Guarding on the target being empty is what makes this safe to run on every
  // launch: it can never overwrite newer native data with a stale WebView copy.
  if ((await target.getAll('meta')).length > 0) return 0;
  if ((await source.getAll('meta')).length === 0) return 0;

  let copied = 0;
  for (const store of STORE_NAMES) {
    const rows = await source.getAll<Record<string, unknown>>(store);
    if (rows.length === 0) continue;
    await target.putMany(
      store,
      rows.map((row) => [keyOf(store, row), row] as const),
    );
    copied += rows.length;
  }
  return copied;
}

/**
 * The key a row is stored under, per store.
 *
 * IndexedDB keeps keys outside the values, so copying rows between engines
 * means naming them again — and naming them *the same way*. Every branch here
 * calls the same constant or function the repository that wrote the row calls,
 * rather than spelling the format out a second time: a copy that arrived keyed
 * by something nothing reads would look exactly like a successful migration.
 */
function keyOf(store: StoreName, row: Record<string, unknown>): string {
  switch (store) {
    case 'meta':
      return META_KEY;
    case 'settings':
      return SETTINGS_KEY;
    case 'activity':
      return String(row.date);
    case 'progress':
      return progressKey(row.kind as ItemProgress['kind'], String(row.item_key));
    case 'memory':
      return memoryKey(row.kind as ItemProgress['kind'], String(row.item_key));
    case 'mistakes':
      return String(row.id);
    case 'numbers':
      return `lesson:${String(row.lesson_id)}`;
    case 'sessions':
    case 'attempts':
      return String(row.id);
  }
}
