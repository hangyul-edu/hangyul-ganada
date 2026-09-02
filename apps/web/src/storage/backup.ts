/**
 * Taking your learning with you.
 *
 * Hangyul ganada has no account and no server. That is the product — nobody
 * has to hand over an email address to learn ㄱ — but it has a cost the
 * learner pays and never agreed to: a new phone, a reinstall, a browser that
 * clears site data, and three months of practice is gone with no support desk
 * to appeal to. Everywhere else, "your progress is in the cloud" is the
 * unspoken answer to that. Here the answer has to be a file.
 *
 * So: one JSON file, written to wherever the learner keeps files, restored on
 * any install of the app. No network, no upload, no third party — the same
 * promise the Privacy screen makes about everything else.
 *
 * ## What is in it
 *
 * Every store except `meta`, verbatim. Not a curated summary of *words learned*
 * and *day streak*: the value of a backup is that the restored app is the same
 * app, with the same review schedule, the same wrong-answer notebook and the
 * same Numbers course, not a plausible reconstruction. `meta` is excluded
 * because it describes the install rather than the learner — see the schema
 * note below, which is the one place a backup is more than a copy.
 *
 * ## Restoring an older backup
 *
 * A backup carries the `schema_version` its rows were written under, and a file
 * from an install two versions behind holds rows in the old shape. Nothing here
 * migrates them. Instead the restore writes the rows, stamps `meta` with the
 * *backup's* schema version, and calls `runMigrations` — so a restored old
 * backup is upgraded by the same migrations, in the same order, that upgrade a
 * real old install on this device. A second migration path that only ever runs
 * on restores would be a second migration path to keep correct, and the one
 * that runs on every launch is the one that is actually exercised.
 *
 * Row *contents* are not validated here either, and that is deliberate. Every
 * hydration read already repairs what it reads — progress rows that no longer
 * normalise are dropped and counted into `recovered`, Numbers completions are
 * re-derived from their evidence — so a restore that wrote rows past those
 * paths would be trusting a file more than the app trusts its own database.
 * What this module validates is the envelope: is this a backup, is it from a
 * version this app can read, and does it contain anything at all.
 */

import { PRODUCT } from '../config/product';
import { STORE_NAMES, type PersistenceDriver, type StoreName } from './driver';
import {
  META_KEY,
  SCHEMA_VERSION,
  randomId,
  runMigrations,
  type SchemaMeta,
} from './schema';

/** Identifies the file as ours. A learner picking a file gets told, not guessed at. */
export const BACKUP_FORMAT = 'hangyul-ganada/learning-backup';

/**
 * The envelope's own version, separate from `schema_version`.
 *
 * `schema_version` says what shape the rows are in; this says what shape the
 * file around them is. They move for different reasons: adding a store changes
 * the rows, moving to a compressed container would change the file.
 */
export const BACKUP_FORMAT_VERSION = 1;

/** The stores a backup carries: everything a learner produced. */
export type BackedUpStore = Exclude<StoreName, 'meta'>;

export interface LearningBackup {
  format: typeof BACKUP_FORMAT;
  format_version: number;
  /** The schema the rows were written under. Drives the migration on restore. */
  schema_version: number;
  /** The app version that wrote it, for support messages. Never enforced. */
  app_version: string;
  exported_at: string;
  /**
   * Which install this came from — device-local, anonymous, and already in
   * `SchemaMeta` for exactly this purpose. It tells a learner holding two files
   * which phone each came from; nothing reads it back on restore.
   */
  install_id: string | null;
  stores: Partial<Record<BackedUpStore, Array<readonly [string, unknown]>>>;
}

/** Why a file could not be restored, as a code the UI has copy for. */
export type BackupProblem =
  | 'not_json'
  | 'not_a_backup'
  | 'from_a_newer_app'
  | 'empty';

export type BackupRead =
  | { readonly ok: true; readonly backup: LearningBackup; readonly rows: number }
  | { readonly ok: false; readonly problem: BackupProblem };

export interface RestoreOutcome {
  /** Rows written, per store. */
  readonly restored: Partial<Record<BackedUpStore, number>>;
  /** Rows in the file that were not a `[key, value]` pair and were left out. */
  readonly skipped: number;
  /** Schema versions the migrations brought the restored rows up through. */
  readonly migrated: number[];
}

const BACKED_UP: BackedUpStore[] = STORE_NAMES.filter(
  (store): store is BackedUpStore => store !== 'meta',
);

/** Reads every store out of the driver, in one envelope. */
export async function exportBackup(
  driver: PersistenceDriver,
  now: () => Date = () => new Date(),
): Promise<LearningBackup> {
  const meta = await driver.get<SchemaMeta>('meta', META_KEY);
  const stores: Partial<Record<BackedUpStore, Array<readonly [string, unknown]>>> = {};
  for (const store of BACKED_UP) {
    stores[store] = await driver.entries<unknown>(store);
  }
  return {
    format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    schema_version: meta?.schema_version ?? SCHEMA_VERSION,
    app_version: PRODUCT.version,
    exported_at: now().toISOString(),
    install_id: meta?.install_id ?? null,
    stores,
  };
}

/** `hangyul-ganada-learning-2026-09-03.json` — sorts, and says what it is. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `hangyul-ganada-learning-${day}.json`;
}

function isPair(value: unknown): value is readonly [string, unknown] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';
}

/**
 * Validates a file's envelope without touching the database.
 *
 * Separate from the restore so the UI can tell a learner what is wrong with the
 * file they picked *before* anything is cleared — the alternative is wiping a
 * learner's progress and then discovering the replacement is unreadable.
 */
export function readBackup(text: string): BackupRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, problem: 'not_json' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, problem: 'not_a_backup' };
  }
  const file = parsed as Record<string, unknown>;
  if (file.format !== BACKUP_FORMAT) return { ok: false, problem: 'not_a_backup' };

  const formatVersion = file.format_version;
  const schemaVersion = file.schema_version;
  if (typeof formatVersion !== 'number' || !Number.isFinite(formatVersion)) {
    return { ok: false, problem: 'not_a_backup' };
  }
  if (typeof schemaVersion !== 'number' || !Number.isFinite(schemaVersion) || schemaVersion < 1) {
    return { ok: false, problem: 'not_a_backup' };
  }
  /*
   * A file from a later version of the app is refused rather than partially
   * read. Its rows may be in a shape this build's migrations do not know how to
   * reach, and there is no migration backwards — restoring what happens to
   * parse would leave a learner with a database this build cannot repair.
   */
  if (formatVersion > BACKUP_FORMAT_VERSION || schemaVersion > SCHEMA_VERSION) {
    return { ok: false, problem: 'from_a_newer_app' };
  }
  if (typeof file.stores !== 'object' || file.stores === null || Array.isArray(file.stores)) {
    return { ok: false, problem: 'not_a_backup' };
  }

  const source = file.stores as Record<string, unknown>;
  const stores: Partial<Record<BackedUpStore, Array<readonly [string, unknown]>>> = {};
  let rows = 0;
  for (const store of BACKED_UP) {
    const value = source[store];
    if (!Array.isArray(value)) continue;
    const pairs = value.filter(isPair);
    stores[store] = pairs;
    rows += pairs.length;
  }
  if (rows === 0) return { ok: false, problem: 'empty' };

  return {
    ok: true,
    rows,
    backup: {
      format: BACKUP_FORMAT,
      format_version: formatVersion,
      schema_version: schemaVersion,
      app_version: typeof file.app_version === 'string' ? file.app_version : 'unknown',
      exported_at: typeof file.exported_at === 'string' ? file.exported_at : '',
      install_id: typeof file.install_id === 'string' ? file.install_id : null,
      stores,
    },
  };
}

/**
 * Replaces everything on this device with the backup's contents.
 *
 * Replaces, not merges. Two installs that both hold a review schedule for ㄱ
 * have no defensible way to be combined — the memory rows carry stability and a
 * due date, and picking one, or averaging them, invents a review history that
 * never happened. A restore is *this file is now my learning*, and the UI says
 * so before calling this.
 */
export async function restoreBackup(
  driver: PersistenceDriver,
  backup: LearningBackup,
  now: () => Date = () => new Date(),
): Promise<RestoreOutcome> {
  const restored: Partial<Record<BackedUpStore, number>> = {};
  let skipped = 0;

  for (const store of BACKED_UP) {
    await driver.clearStore(store);
    const rows = backup.stores[store] ?? [];
    let written = 0;
    for (const row of rows) {
      if (!isPair(row)) {
        skipped += 1;
        continue;
      }
      await driver.put(store, row[0], row[1]);
      written += 1;
    }
    restored[store] = written;
  }

  /*
   * Stamp the backup's schema version, keeping this install's own identity, and
   * let the ordinary migrations carry the rows the rest of the way. `installed_at`
   * and `install_id` describe the device, not the learning, so they stay: a
   * restored backup does not make this phone a different phone.
   */
  const meta = await driver.get<SchemaMeta>('meta', META_KEY);
  const stamp = now().toISOString();
  await driver.put<SchemaMeta>('meta', META_KEY, {
    schema_version: backup.schema_version,
    installed_at: meta?.installed_at ?? stamp,
    last_opened_at: stamp,
    install_id: meta?.install_id ?? randomId(),
  });

  const migrated = await runMigrations({
    driver,
    /*
     * Not the legacy blob. If this device has a pre-IndexedDB profile in
     * localStorage and the backup predates v3, the v3 migration would read that
     * blob over the rows just restored — merging a stranger's install into the
     * file the learner chose. The backup is the authority here.
     */
    readLegacyBlob: () => null,
    clearLegacyBlob: () => {},
    now,
  });

  return { restored, skipped, migrated };
}
