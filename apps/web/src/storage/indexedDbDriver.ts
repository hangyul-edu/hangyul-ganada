import { MemoryDriver, STORE_NAMES, type PersistenceDriver, type StoreName } from './driver';

/**
 * IndexedDB persistence for the web build.
 *
 * IndexedDB rather than `localStorage` because learning history is structured
 * and unbounded: one row per character, per word, per session and per attempt.
 * `localStorage` is a synchronous 5 MB string bucket — writing the learner's
 * entire history on every stroke blocks the main thread mid-drawing, and the
 * quota is reachable by a learner who practises for a year. Small preferences
 * still use `localStorage`, where its synchronous read is a feature: the locale
 * and the voice have to be known before the first paint.
 */

export const DB_NAME = 'hangyul-ganada';

/**
 * The IndexedDB *structure* version. Bumped only when object stores change,
 * which is not the same thing as the data schema version — that lives in the
 * `meta` store and is migrated by `runMigrations`, because a change to the
 * shape of a progress record should not require an `onupgradeneeded` dance.
 */
/*
 * 2 adds the `memory` store — the per-item, per-skill state the adaptive
 * scheduler keeps. A structure bump rather than a data migration because an
 * object store that does not exist cannot be written to at all; the *contents*
 * of the new store are filled in by schema migration 6, which is a separate
 * concern and runs afterwards.
 */
export const DB_STRUCTURE_VERSION = 2;

export class IndexedDbDriver implements PersistenceDriver {
  readonly name = 'indexeddb';
  readonly durable = true;
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  /**
   * False only after `close()`.
   *
   * The connection is also dropped by `onversionchange`, which is not the same
   * thing and must not be treated as one — see `connection()`.
   */
  private open = true;

  private constructor(db: IDBDatabase, dbName: string) {
    this.db = db;
    this.dbName = dbName;
    this.watch(db);
  }

  /**
   * Lets go of the connection when another tab needs to upgrade the database.
   *
   * Holding on wedges the other tab, so letting go is not optional. What *was*
   * a bug is what happened next: the field was nulled and every later call
   * threw, silently — every write in this app is fire-and-forget, so a learner
   * went on practising into a driver that had stopped accepting anything, and
   * the Settings screen either said nothing (the probe had already passed) or
   * warned about a browser whose storage was in perfect health (the probe ran
   * afterwards). Both are wrong. The connection is reopened on the next call
   * instead.
   */
  private watch(db: IDBDatabase): void {
    db.onversionchange = () => {
      db.close();
      if (this.db === db) this.db = null;
    };
  }

  /** The live connection, reopened if a version change took the last one. */
  private async connection(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    // `close()` is deliberate and terminal: a caller that has released the
    // driver must not get a fresh connection out of it by accident.
    if (!this.open) throw new Error('IndexedDbDriver used after close()');
    const db = await openConnection(this.dbName);
    this.watch(db);
    this.db = db;
    return db;
  }

  static available(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  static async open(dbName = DB_NAME): Promise<IndexedDbDriver> {
    return new IndexedDbDriver(await openConnection(dbName), dbName);
  }

  private async tx(store: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.connection();
    return db.transaction(store, mode).objectStore(store);
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return request<T | undefined>((await this.tx(store, 'readonly')).get(key));
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return request<T[]>((await this.tx(store, 'readonly')).getAll());
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    await request((await this.tx(store, 'readwrite')).put(value, key));
  }

  async putMany<T>(store: StoreName, entries: Array<readonly [string, T]>): Promise<void> {
    if (entries.length === 0) return;
    const db = await this.connection();
    const transaction = db.transaction(store, 'readwrite');
    const objectStore = transaction.objectStore(store);
    for (const [key, value] of entries) objectStore.put(value, key);
    // One transaction for the whole batch: partial writes are how a progress
    // record and the session that produced it end up disagreeing.
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('putMany failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('putMany aborted'));
    });
  }

  async remove(store: StoreName, key: string): Promise<void> {
    await request((await this.tx(store, 'readwrite')).delete(key));
  }

  async clearStore(store: StoreName): Promise<void> {
    await request((await this.tx(store, 'readwrite')).clear());
  }

  async clearAll(): Promise<void> {
    for (const store of STORE_NAMES) await this.clearStore(store);
  }

  close(): void {
    this.open = false;
    this.db?.close();
    this.db = null;
  }
}

/**
 * One `indexedDB.open`, as a promise.
 *
 * `blocked` is deliberately not an error. It means another tab is holding the
 * database at an older structure version and this request is *waiting* — the
 * browser fires `success` by itself as soon as that tab lets go. Rejecting on
 * it dropped the app onto the memory fallback, which is one of the ways a
 * learner in a perfectly healthy Chrome was told their progress was not being
 * saved. The wait is bounded so a tab that never lets go cannot leave the app
 * on a spinner; falling back to memory after that is the honest answer.
 */
const BLOCKED_TIMEOUT_MS = 4_000;

function openConnection(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName, DB_STRUCTURE_VERSION);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (finish: () => void) => {
      if (timer !== undefined) clearTimeout(timer);
      finish();
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORE_NAMES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    request.onsuccess = () => settle(() => resolve(request.result));
    request.onerror = () =>
      settle(() => reject(request.error ?? new Error('indexedDB.open failed')));
    request.onblocked = () => {
      timer = setTimeout(
        () => reject(new Error('indexedDB.open blocked by another tab')),
        BLOCKED_TIMEOUT_MS,
      );
    };
  });
}

/**
 * Opens the best driver this platform can offer.
 *
 * A learner in a private window, or behind an enterprise policy that blocks
 * storage, gets a working app backed by memory rather than a blank screen. The
 * caller can tell the difference from `driver.durable` and say so in Settings.
 *
 * ## Why it tries twice
 *
 * Landing on the memory fallback is not a neutral event: it is what makes
 * Settings tell a learner their practice is not being kept, and it lasts for
 * the rest of that page's life. A single rejected `open` is not enough evidence
 * for that. Chrome rejects it transiently while a previous connection to the
 * same database is still closing — a reload, a back navigation, a second tab —
 * and the app would then warn about a browser that works perfectly and would
 * have worked on the very next attempt. Two attempts, and only then memory.
 */
export async function openDriver(dbName = DB_NAME): Promise<PersistenceDriver> {
  if (!IndexedDbDriver.available()) return new MemoryDriver();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await IndexedDbDriver.open(dbName);
    } catch {
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return new MemoryDriver();
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}
