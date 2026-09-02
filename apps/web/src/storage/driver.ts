/**
 * The persistence seam.
 *
 * Everything the learner produces goes through this interface, and nothing
 * above it knows whether the bytes end up in IndexedDB, in SQLite on a phone,
 * or in a Map during a test. That is the whole point: Hangyul ganada has no
 * account and no server, so the storage engine is the only thing standing
 * between a learner and losing three weeks of practice, and it has to be
 * swappable per platform without the learning flow noticing.
 *
 * Stores are keyed collections, not tables — the smallest surface that
 * IndexedDB, SQLite and a plain object can all implement honestly.
 */

/** Every collection the app persists. Adding one is a structure change. */
export const STORE_NAMES = [
  'meta',
  'settings',
  'progress',
  'sessions',
  /**
   * One row per review exercise, bounded and pruned.
   *
   * Separate from `progress` because it answers a different question and has a
   * different lifetime: progress is *where is this learner with ㄱ*, an attempt
   * is *what happened at 14:03 on Tuesday*. The adaptive scheduler needs the
   * second to produce weekly insights and confusion pairs; nothing else does,
   * and it is the one store that is allowed to forget its oldest rows.
   */
  'attempts',
  /** Daily learning roll-ups. See `DailyActivity` in shared-types. */
  'activity',
  /** Per-item, per-skill memory state. See `domain/memory.ts`. */
  'memory',
  /**
   * The wrong-answer notebook. One row per item ever missed.
   *
   * A store of its own rather than a field on the memory row, because the two
   * answer different questions and have different lifetimes: memory is *how
   * well is this held right now*, a mistake is *this went wrong, and here is
   * what was picked instead*. See `domain/mistakes.ts`.
   */
  'mistakes',
  /**
   * Numbers lesson progress, one record per lesson. See
   * `NumbersLessonProgress` in shared-types and `domain/numbersProgress.ts`.
   *
   * Its own store, and not rows in `progress`, because the first
   * implementation put Numbers items in `progress` and three things followed:
   * the rows hydrated as `character` rows (every normaliser coerced an unknown
   * kind to `character`), their completions were counted as words learned, and
   * a lesson was called complete when ten `learned` flags happened to line up.
   * A separate store cannot be mistaken for a letter by anything that reads
   * letters.
   */
  'numbers',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export interface PersistenceDriver {
  /** Identifies the engine in diagnostics, e.g. "indexeddb" or "memory". */
  readonly name: string;
  /**
   * False when writes are not actually durable — private-mode browsers that
   * throw on IndexedDB fall back to memory, and Settings says so rather than
   * letting a learner believe their progress is safe.
   */
  readonly durable: boolean;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /**
   * Every row of a store, with its key.
   *
   * `getAll` is what the app reads with, because every row carries the fields
   * it is keyed by and nothing in the learning flow needs the key itself. A
   * *backup* does: it has to be able to put each row back where it came from,
   * and deriving the key from the value would be a second copy of every key
   * rule in the product — free to disagree with the first one the day either
   * changes. See `storage/backup.ts`.
   */
  entries<T>(store: StoreName): Promise<Array<readonly [string, T]>>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  putMany<T>(store: StoreName, entries: Array<readonly [string, T]>): Promise<void>;
  remove(store: StoreName, key: string): Promise<void>;
  clearStore(store: StoreName): Promise<void>;
  clearAll(): Promise<void>;
  /** Releases handles. Only meaningful for engines that hold a connection. */
  close(): void;
}

/**
 * In-memory fallback.
 *
 * Used by unit tests, by server-side rendering, and — importantly — by a real
 * learner in a browser that refuses IndexedDB. In that last case the session
 * still works end to end; it simply will not survive a reload, which the
 * Settings screen states plainly instead of pretending otherwise.
 */
export class MemoryDriver implements PersistenceDriver {
  readonly name = 'memory';
  readonly durable = false;
  private readonly stores = new Map<StoreName, Map<string, unknown>>();

  private bucket(store: StoreName): Map<string, unknown> {
    let bucket = this.stores.get(store);
    if (!bucket) {
      bucket = new Map();
      this.stores.set(store, bucket);
    }
    return bucket;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return structuredCopy(this.bucket(store).get(key)) as T | undefined;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this.bucket(store).values()].map((v) => structuredCopy(v) as T);
  }

  async entries<T>(store: StoreName): Promise<Array<readonly [string, T]>> {
    return [...this.bucket(store).entries()].map(
      ([key, value]) => [key, structuredCopy(value) as T] as const,
    );
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    this.bucket(store).set(key, structuredCopy(value));
  }

  async putMany<T>(store: StoreName, entries: Array<readonly [string, T]>): Promise<void> {
    for (const [key, value] of entries) this.bucket(store).set(key, structuredCopy(value));
  }

  async remove(store: StoreName, key: string): Promise<void> {
    this.bucket(store).delete(key);
  }

  async clearStore(store: StoreName): Promise<void> {
    this.bucket(store).clear();
  }

  async clearAll(): Promise<void> {
    this.stores.clear();
  }

  close(): void {
    /* nothing held */
  }
}

/**
 * Values are copied in and out so a caller mutating an object it read cannot
 * silently corrupt the store — which is exactly what IndexedDB does, and a
 * fallback that behaved differently would hide bugs until production.
 */
function structuredCopy<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
