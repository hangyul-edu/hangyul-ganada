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

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  static available(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  static open(dbName = DB_NAME): Promise<IndexedDbDriver> {
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(dbName, DB_STRUCTURE_VERSION);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORE_NAMES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading the database would otherwise leave this
        // connection wedged and every later write hanging.
        db.onversionchange = () => db.close();
        resolve(new IndexedDbDriver(db));
      };
      request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
      request.onblocked = () => reject(new Error('indexedDB.open blocked by another tab'));
    });
  }

  private tx(store: StoreName, mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('IndexedDbDriver used after close()');
    return this.db.transaction(store, mode).objectStore(store);
  }

  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return request<T | undefined>(this.tx(store, 'readonly').get(key));
  }

  getAll<T>(store: StoreName): Promise<T[]> {
    return request<T[]>(this.tx(store, 'readonly').getAll());
  }

  put<T>(store: StoreName, key: string, value: T): Promise<void> {
    return request(this.tx(store, 'readwrite').put(value, key)).then(() => undefined);
  }

  putMany<T>(store: StoreName, entries: Array<readonly [string, T]>): Promise<void> {
    if (entries.length === 0) return Promise.resolve();
    if (!this.db) return Promise.reject(new Error('IndexedDbDriver used after close()'));
    const transaction = this.db.transaction(store, 'readwrite');
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

  remove(store: StoreName, key: string): Promise<void> {
    return request(this.tx(store, 'readwrite').delete(key)).then(() => undefined);
  }

  clearStore(store: StoreName): Promise<void> {
    return request(this.tx(store, 'readwrite').clear()).then(() => undefined);
  }

  async clearAll(): Promise<void> {
    for (const store of STORE_NAMES) await this.clearStore(store);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

/**
 * Opens the best driver this platform can offer.
 *
 * A learner in a private window, or behind an enterprise policy that blocks
 * storage, gets a working app backed by memory rather than a blank screen. The
 * caller can tell the difference from `driver.durable` and say so in Settings.
 */
export async function openDriver(dbName = DB_NAME): Promise<PersistenceDriver> {
  if (!IndexedDbDriver.available()) return new MemoryDriver();
  try {
    return await IndexedDbDriver.open(dbName);
  } catch {
    return new MemoryDriver();
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}
