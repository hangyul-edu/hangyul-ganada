import { registerPlugin } from '@capacitor/core';

import type { PersistenceDriver, StoreName } from '../storage/driver';

/**
 * The native side of the persistence seam.
 *
 * `HangyulStore` is this project's own Capacitor plugin — `HangyulStorePlugin`
 * in `apps/mobile/android/.../HangyulStorePlugin.java` and the Swift file of the
 * same name. It is a thin, deliberately boring wrapper over the SQLite that
 * both platforms already ship, and it exists because a learner with no account
 * and no server has exactly one copy of their practice. Inside a WebView,
 * IndexedDB is storage the app does not own: it is what "Clear cache" reaches
 * first on Android and what WebKit's eviction policy applies to on iOS. The
 * database this talks to lives in the app's own container, survives an update,
 * and is included in the platform backup.
 */

export interface HangyulStorePlugin {
  open(): Promise<{ path: string; bytes: number }>;
  get(options: { store: string; key: string }): Promise<{ value?: string }>;
  getAll(options: { store: string }): Promise<{ values: string[] }>;
  put(options: { store: string; key: string; value: string }): Promise<void>;
  putMany(options: {
    store: string;
    entries: Array<{ key: string; value: string }>;
  }): Promise<void>;
  remove(options: { store: string; key: string }): Promise<void>;
  clearStore(options: { store: string }): Promise<void>;
  clearAll(): Promise<void>;
}

const HangyulStore = registerPlugin<HangyulStorePlugin>('HangyulStore');

/**
 * A `PersistenceDriver` backed by the platform's SQLite.
 *
 * Values cross the bridge as JSON text rather than as structured objects. That
 * is not laziness: Capacitor's bridge re-encodes numbers, drops `undefined` and
 * turns `Date` into something else, and a driver that quietly reshaped values
 * on one platform would turn every storage bug into a platform bug. `JSON`
 * round-trips identically everywhere, and it is what the IndexedDB driver's
 * structured copy effectively does anyway.
 */
export class NativeSqliteDriver implements PersistenceDriver {
  readonly name = 'sqlite';
  readonly durable = true;

  /** Where the file is, once opened. Shown on the Privacy & Data screen. */
  private location: { path: string; bytes: number } | null = null;

  /**
   * The plugin is a constructor parameter rather than a module-level import so
   * that a test can drive this class against an in-memory fake. Without that
   * the only way to exercise the JSON boundary — which is where a bug would
   * actually be — is on a device.
   */
  private constructor(private readonly plugin: HangyulStorePlugin) {}

  static async open(plugin: HangyulStorePlugin = HangyulStore): Promise<NativeSqliteDriver> {
    const driver = new NativeSqliteDriver(plugin);
    driver.location = await plugin.open();
    return driver;
  }

  /** The database's path and size, for the screen that tells a learner where
   *  their practice is kept. Null until `open()` has resolved. */
  get file(): { path: string; bytes: number } | null {
    return this.location;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const { value } = await this.plugin.get({ store, key });
    return value === undefined ? undefined : (JSON.parse(value) as T);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const { values } = await this.plugin.getAll({ store });
    return values.map((value) => JSON.parse(value) as T);
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    await this.plugin.put({ store, key, value: JSON.stringify(value) });
  }

  async putMany<T>(store: StoreName, entries: Array<readonly [string, T]>): Promise<void> {
    if (entries.length === 0) return;
    await this.plugin.putMany({
      store,
      entries: entries.map(([key, value]) => ({ key, value: JSON.stringify(value) })),
    });
  }

  async remove(store: StoreName, key: string): Promise<void> {
    await this.plugin.remove({ store, key });
  }

  async clearStore(store: StoreName): Promise<void> {
    await this.plugin.clearStore({ store });
  }

  async clearAll(): Promise<void> {
    await this.plugin.clearAll();
  }

  close(): void {
    // The native side owns the handle and closes it with the Activity or the
    // plugin instance. Closing it from here would break the next write from a
    // component that outlived whatever called this.
  }
}
