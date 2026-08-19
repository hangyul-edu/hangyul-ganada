import type {
  DailyActivity,
  ItemProgress,
  LearnerPreferences,
} from '@hangyul-ganada/shared-types';

import { DEFAULT_FONT_ID } from '../data/fonts';
import { type ItemMemory, memoryKey, migrateMemory } from '../domain/memory';
import type { PersistenceDriver } from './driver';

/**
 * The persisted data schema, and how to move a learner between versions of it.
 *
 * There is no account and no server, so a learner's history exists in exactly
 * one place: their device. Every future release therefore has to be able to
 * read what every past release wrote. That is not a nice-to-have — shipping an
 * update that silently resets progress is, for a paid app with no cloud copy,
 * indistinguishable from deleting the customer's purchase.
 *
 * ## Version history
 *
 * | Version | Shape |
 * | --- | --- |
 * | 1 | localStorage blob, no `preferences.locale` |
 * | 2 | localStorage blob with `preferences.locale` |
 * | 3 | IndexedDB stores; mastery stages; voice preference |
 * | 4 | `activity` store — one roll-up row per day the app was used |
 * | 5 | guided-only practice: `practised` stage, `practice_passes`, `demo_seen`, appearance |
 * | 6 | `memory` store — per-item, per-skill adaptive review state; saved words |
 *
 * Versions 1 and 2 are read from `localStorage` and imported once. Nothing is
 * deleted from `localStorage` until the imported copy has been written and read
 * back, so an interrupted migration is retried rather than losing the original.
 *
 * Version 4 adds a store and back-fills it from what is already there. It
 * deletes nothing: a learner who updates mid-curriculum keeps every progress
 * row they had, and the new screen has a history to show on the day it ships
 * rather than starting from an empty chart.
 */

export const SCHEMA_VERSION = 6;

/** Keys the pre-IndexedDB builds wrote to. Read once, on first launch. */
export const LEGACY_BLOB_KEYS = ['hangyul_ganada:learner', 'hangyul-start:learner'] as const;

/** Where the imported blob is parked until the import is confirmed complete. */
const LEGACY_IMPORTED_FLAG = 'hangyul_ganada:legacy-imported';

export const META_KEY = 'schema';

export interface SchemaMeta {
  schema_version: number;
  /** Set on first write; identifies this install in an exported backup. */
  installed_at: string;
  last_opened_at: string;
  /**
   * Anonymous, device-local, and never sent anywhere. It exists so an exported
   * backup can say which device it came from, not to identify a person: there
   * is no account for it to be an account of.
   */
  install_id: string;
}

export interface StoredSettings extends LearnerPreferences {
  /** ISO dates the learner completed at least one item. Drives the streak. */
  active_days: string[];
  /**
   * Words the learner bookmarked, as `word:<id>`.
   *
   * On the settings row rather than in a store of its own: it is a short list
   * of ids that the whole app reads and one screen writes, it has to survive an
   * export and an import, and giving thirty strings their own object store
   * would be a table with one column.
   */
  saved_items: string[];
}

export const SETTINGS_KEY = 'preferences';

export const DEFAULT_DAILY_TARGET = 5;

export function defaultSettings(): StoredSettings {
  return {
    selected_font_id: DEFAULT_FONT_ID,
    practice_style: 'guided',
    appearance: 'system',
    daily_target: DEFAULT_DAILY_TARGET,
    show_grid: true,
    show_center_crosshair: true,
    voice: 'female',
    // Legacy, unread: see `StoredSettings` in @hangyul-ganada/shared-types.
    autoplay_audio: true,
    // Not 'en': null means "never chose", which is what lets the precedence
    // chain tell a deliberate choice of English from no choice at all.
    locale: null,
    active_days: [],
    saved_items: [],
  };
}

/** A progress row as it exists before any lesson has touched it. */
export function blankProgress(
  kind: ItemProgress['kind'],
  itemKey: string,
  now: string,
): ItemProgress {
  return {
    item_key: itemKey,
    kind,
    stage: 'unseen',
    attempts: 0,
    passes: 0,
    fails: 0,
    trace_passes: 0,
    practice_passes: 0,
    recognition_passes: 0,
    heard: false,
    demo_seen: false,
    learned: false,
    needs_review: false,
    last_score: null,
    first_seen_at: now,
    last_attempted_at: null,
    learned_at: null,
    review_due_at: null,
  };
}

export function progressKey(kind: ItemProgress['kind'], itemKey: string): string {
  return `${kind}:${itemKey}`;
}

// --- Migrations -------------------------------------------------------------

export interface MigrationContext {
  driver: PersistenceDriver;
  /** Injected so the migration is testable without a browser. */
  readLegacyBlob: () => string | null;
  clearLegacyBlob: () => void;
  now: () => Date;
}

export interface Migration {
  /** The version this migration produces. */
  to: number;
  describe: string;
  run: (ctx: MigrationContext) => Promise<void>;
}

/**
 * v1/v2 → v3.
 *
 * The old builds kept one JSON blob in `localStorage`. This lifts it into the
 * IndexedDB stores and fills in the fields v3 added.
 *
 * Old rows recorded only `learned`, with no notion of *how* the item was
 * passed. They are promoted to `written` rather than `learned`: the learner
 * demonstrably wrote the character, but v3's `learned` also requires having
 * heard it, and claiming they had would be inventing history. One unguided
 * pass moves them the rest of the way, which is a fair price for a feature
 * that did not exist when they practised.
 */
const migrateLegacyBlobToStores: Migration = {
  to: 3,
  describe: 'Import the localStorage learner blob into IndexedDB and add mastery stages',
  async run({ driver, readLegacyBlob, clearLegacyBlob, now }) {
    const raw = readLegacyBlob();
    if (!raw) return;

    let parsed: LegacyBlob;
    try {
      parsed = JSON.parse(raw) as LegacyBlob;
    } catch {
      // Unreadable. Dropping it is right — but only after we know it is not
      // merely a shape we have not met, which a parse failure settles.
      clearLegacyBlob();
      return;
    }

    const stamp = now().toISOString();
    const settings = defaultSettings();
    const legacyPreferences = parsed.preferences ?? {};
    Object.assign(settings, stripUnknown(legacyPreferences, settings));
    // `practice_mode` was renamed and its meaning narrowed in v5. It is
    // translated here rather than left to that migration because this is the
    // last moment the legacy blob exists: `stripUnknown` would drop a key the
    // current defaults do not have, and the blob is cleared straight after.
    if ((legacyPreferences as { practice_mode?: string }).practice_mode === 'write') {
      settings.practice_style = 'focused';
    }
    settings.active_days = Array.isArray(parsed.active_days) ? parsed.active_days : [];
    settings.saved_items = [];
    await driver.put('settings', SETTINGS_KEY, settings);

    const progressEntries: Array<readonly [string, ItemProgress]> = [];
    for (const [key, value] of Object.entries(parsed.progress ?? {})) {
      if (!value || typeof value !== 'object') continue;
      const kind: ItemProgress['kind'] = value.kind === 'word' ? 'word' : 'character';
      const itemKey = value.item_key ?? key.split(':').slice(1).join(':');
      if (!itemKey) continue;
      const passes = numberOr(value.passes, 0);
      const row: ItemProgress = {
        ...blankProgress(kind, itemKey, value.last_attempted_at ?? stamp),
        attempts: numberOr(value.attempts, 0),
        passes,
        fails: numberOr(value.fails, 0),
        // The old model did not distinguish one kind of pass from another; a
        // learner's history is credited to the harder rung, since a guided pass
        // was never recorded separately to be credited to. Written in the
        // current field names because the v5 migration would only rename them a
        // moment later, and a migration chain that writes a shape purely to
        // rewrite it is a shape nobody can test.
        practice_passes: passes,
        stage: value.learned ? 'practised' : passes > 0 ? 'traced' : 'introduced',
        learned: false,
        needs_review: Boolean(value.needs_review),
        last_score: value.last_score ?? null,
        last_attempted_at: value.last_attempted_at ?? null,
        review_due_at: value.needs_review ? stamp : null,
      };
      progressEntries.push([progressKey(kind, itemKey), row]);
    }
    await driver.putMany('progress', progressEntries);

    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
    await driver.putMany(
      'sessions',
      sessions
        .filter((s): s is LegacySession => Boolean(s?.id))
        .map((s) => [s.id, s] as const),
    );

    // Read one row back before dropping the original. If IndexedDB silently
    // failed — a real thing in Safari private mode — the blob is still there
    // for the next launch to try again.
    const check = await driver.get<StoredSettings>('settings', SETTINGS_KEY);
    if (check) clearLegacyBlob();
  },
};

/**
 * v3 → v4.
 *
 * Creates the daily activity roll-ups from the history that already exists.
 * Two sources, neither complete, and the result is labelled as what it is:
 *
 * * **Progress rows** carry `learned_at` and `last_attempted_at` — one date
 *   each. So a learner who practised ㄱ for a week appears to have practised it
 *   on one day, the last one.
 * * **Sessions** carry `started_at` and an attempt count, which recovers the
 *   days practice happened even where no item was finished.
 *
 * What cannot be recovered is study *time*: nothing before v4 recorded when a
 * lesson ended, and inventing a plausible number would put a figure on the
 * screen that never happened. Back-filled days therefore report zero minutes
 * and real attempt counts, and the screen says so rather than showing a chart
 * that dips to nothing on the day of the update for no reason the learner did.
 *
 * The alternative — starting everyone's history at the update — was worse: a
 * learner three months in would open their new Activity screen and be told
 * they had studied for one day.
 */
const backfillDailyActivity: Migration = {
  to: 4,
  describe: 'Create daily activity roll-ups from existing progress and sessions',
  async run({ driver }) {
    const days = new Map<string, DailyActivity>();

    const touch = (iso: string | null | undefined): DailyActivity | null => {
      if (!iso) return null;
      const time = Date.parse(iso);
      if (!Number.isFinite(time)) return null;
      const date = localDateKey(new Date(time));
      let row = days.get(date);
      if (!row) {
        row = {
          date,
          first_at: iso,
          last_at: iso,
          active_ms: 0,
          attempts: 0,
          passes: 0,
          characters_learned: 0,
          words_learned: 0,
          reviews: 0,
          items: {},
        };
        days.set(date, row);
      }
      if (iso < row.first_at) row.first_at = iso;
      if (iso > row.last_at) row.last_at = iso;
      return row;
    };

    for (const row of await driver.getAll<ItemProgress>('progress')) {
      if (!row || typeof row.item_key !== 'string') continue;
      const practised = touch(row.last_attempted_at);
      if (practised) {
        // The counters are what the row itself recorded; attributing all of
        // them to the last day practised is wrong about *when* and right about
        // *how much*, which is the better half to keep.
        practised.attempts += numberOr(row.attempts, 0);
        practised.passes += numberOr(row.passes, 0);
        const key = `${row.kind === 'word' ? 'word' : 'character'}:${row.item_key}`;
        if (Object.keys(practised.items).length < 200) {
          practised.items[key] = (practised.items[key] ?? 0) + numberOr(row.attempts, 0);
        }
      }
      const learned = touch(row.learned_at);
      if (learned) {
        if (row.kind === 'word') learned.words_learned += 1;
        else learned.characters_learned += 1;
      }
    }

    for (const session of await driver.getAll<LegacySessionRow>('sessions')) {
      if (!session?.started_at) continue;
      const row = touch(session.started_at);
      // Only where no progress row already accounted for the day, so a day
      // reconstructed from both sources is not counted twice.
      if (row && row.attempts === 0) row.attempts += numberOr(session.attempt_count, 0);
    }

    if (days.size === 0) return;
    await driver.putMany(
      'activity',
      [...days.values()].map((row) => [row.date, row] as const),
    );
  },
};

/**
 * v4 → v5. Guided-only practice.
 *
 * The product no longer asks anyone to write a character on an empty box, so
 * three things had to move, and all three move *sideways*:
 *
 * ```
 * stage 'written'   →  stage 'practised'    same rung, honest name
 * write_passes      →  practice_passes      same count, honest name
 * (nothing)         →  demo_seen            back-filled, never demanded
 * ```
 *
 * The renames are not downgrades: a learner who wrote a letter unguided under
 * the old model has done strictly more than the new second rung asks for, so
 * their count carries across whole and their stage carries across whole.
 *
 * `demo_seen` is the one genuinely new requirement, and back-filling it is the
 * only defensible choice. A learner returning to forty letters they had already
 * finished must not find them un-finished because a stroke-order animation was
 * added after they learned them. So every row that has practised at all is
 * credited with having seen the demonstration; only letters they had not yet
 * started will actually be asked.
 *
 * Nothing is deleted. The old fields are left on the row — a value nobody reads
 * costs a few bytes, and removing it would make a rollback to v4 lose data.
 */
const guidedOnlyPractice: Migration = {
  to: 5,
  describe: 'Rename the memory-writing rung to guided practice and back-fill demo_seen',
  async run({ driver }) {
    const rows = await driver.getAll<LegacyProgressRow>('progress');
    const updated: Array<readonly [string, ItemProgress]> = [];

    for (const row of rows) {
      if (!row || typeof row.item_key !== 'string') continue;
      const kind: ItemProgress['kind'] = row.kind === 'word' ? 'word' : 'character';
      const practice_passes = numberOr(row.practice_passes, numberOr(row.write_passes, 0));
      const stage = row.stage === 'written' ? 'practised' : (row.stage ?? 'unseen');
      const touched = practice_passes > 0 || numberOr(row.trace_passes, 0) > 0;

      const next = {
        ...(row as unknown as ItemProgress),
        kind,
        stage: stage as ItemProgress['stage'],
        practice_passes,
        // Anyone who has already written this character has watched it be
        // written, as far as this product is concerned. Written as an `||`
        // rather than a `??` on purpose: rows come out of `blankProgress` with
        // `demo_seen: false`, and `false ?? x` is `false`, which would have left
        // every migrated learner re-watching letters they had already finished.
        demo_seen: row.demo_seen === true || touched || stage === 'learned',
      } satisfies ItemProgress;

      updated.push([progressKey(kind, row.item_key), next] as const);
    }

    if (updated.length) await driver.putMany('progress', updated);

    // The practice-mode setting had a value that meant "no guide at all".
    // Everyone lands on the guided style; `focused` is offered in Settings and
    // is a choice, not an inheritance from a mode that no longer exists.
    const settings = await driver.get<Partial<StoredSettings> & { practice_mode?: string }>(
      'settings',
      SETTINGS_KEY,
    );
    if (settings) {
      const { practice_mode, ...rest } = settings;
      await driver.put('settings', SETTINGS_KEY, {
        ...defaultSettings(),
        ...rest,
        // Only translated when the old key is actually present. A profile that
        // came through the v3 import has already had this settled and must not
        // be reset by a key that is simply absent.
        practice_style: practice_mode
          ? practice_mode === 'write'
            ? 'focused'
            : 'guided'
          : (rest.practice_style ?? 'guided'),
      });
    }
  },
};


/**
 * v5 → v6. The adaptive review model.
 *
 * The fixed-interval scheduler kept one `review_due_at` per item on the
 * progress row. The adaptive one keeps a memory row per item with a separate
 * state per skill, and this is what carries a learner across.
 *
 * Three rules, and all three are about not lying:
 *
 * 1. **Nothing is deleted.** `review_due_at`, `fails` and the pass counts stay
 *    on the progress row untouched. A build rolled back to v5 finds everything
 *    it wrote still there, and mastery — which is a different fact from memory,
 *    see `domain/memory.ts` — is not touched at all.
 * 2. **The old schedule is carried, not reset.** A learner three weeks into a
 *    twenty-one-day interval keeps their twenty-one days. Starting everyone at
 *    one day would greet every existing customer with their entire vocabulary
 *    due at once, on the day they installed an update they did not ask for.
 * 3. **Nothing is invented.** History is credited only to the skill it was
 *    actually evidence of. Every review the old app could run was a writing
 *    exercise, so writing inherits the schedule; listening and reading are
 *    left empty, and the scheduler treats *empty* as the strongest possible
 *    reason to ask — which is correct, because it has never seen the learner
 *    do it.
 *
 * See `migrateMemory` for the derivation.
 */
const adaptiveReviewMemory: Migration = {
  to: 6,
  describe: 'Derive per-skill memory state from the fixed-interval schedule',
  async run({ driver, now }) {
    const at = now();
    const rows = await driver.getAll<ItemProgress>('progress');
    const memories: Array<readonly [string, ItemMemory]> = [];
    for (const row of rows) {
      const normalised = normaliseForMigration(row);
      if (!normalised) continue;
      const memory = migrateMemory(normalised, at);
      if (memory) memories.push([memoryKey(memory.kind, memory.item_key), memory] as const);
    }
    if (memories.length) await driver.putMany('memory', memories);

    const settings = await driver.get<Partial<StoredSettings>>('settings', SETTINGS_KEY);
    if (settings && !Array.isArray(settings.saved_items)) {
      await driver.put('settings', SETTINGS_KEY, { ...defaultSettings(), ...settings, saved_items: [] });
    }
  },
};

/**
 * Enough of a progress row for `migrateMemory` to read.
 *
 * A migration runs over whatever is in the store, including rows written by a
 * build that predates half these fields, so the counters are defaulted here
 * rather than trusted. A row with no key is not a record of anything.
 */
function normaliseForMigration(candidate: unknown): ItemProgress | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Partial<ItemProgress>;
  if (typeof row.item_key !== 'string' || !row.item_key) return null;
  const kind: ItemProgress['kind'] = row.kind === 'word' ? 'word' : 'character';
  return {
    ...blankProgress(kind, row.item_key, row.first_seen_at ?? new Date().toISOString()),
    ...row,
    kind,
    item_key: row.item_key,
    trace_passes: numberOr(row.trace_passes, 0),
    practice_passes: numberOr(row.practice_passes, 0),
    recognition_passes: numberOr(row.recognition_passes, 0),
    fails: numberOr(row.fails, 0),
  };
}

/** A progress row as some earlier version of the app wrote it. */
interface LegacyProgressRow {
  item_key?: string;
  kind?: string;
  stage?: string;
  trace_passes?: number;
  write_passes?: number;
  practice_passes?: number;
  demo_seen?: boolean;
}

export const MIGRATIONS: Migration[] = [
  migrateLegacyBlobToStores,
  backfillDailyActivity,
  guidedOnlyPractice,
  adaptiveReviewMemory,
];

/** Local calendar day. Duplicated from `domain/progress` to keep storage leaf-level. */
function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface LegacySessionRow {
  started_at?: string;
  attempt_count?: number;
}

/**
 * Brings a driver's contents up to `SCHEMA_VERSION`.
 *
 * Returns the versions actually applied, which the caller logs and the tests
 * assert on — a migration that silently does nothing is the failure mode this
 * whole module exists to prevent.
 */
export async function runMigrations(ctx: MigrationContext): Promise<number[]> {
  const meta = await ctx.driver.get<SchemaMeta>('meta', META_KEY);
  const from = meta?.schema_version ?? 0;

  const applied: number[] = [];
  for (const migration of MIGRATIONS.slice().sort((a, b) => a.to - b.to)) {
    if (migration.to <= from) continue;
    await migration.run(ctx);
    applied.push(migration.to);
  }

  const stamp = ctx.now().toISOString();
  await ctx.driver.put<SchemaMeta>('meta', META_KEY, {
    schema_version: SCHEMA_VERSION,
    installed_at: meta?.installed_at ?? stamp,
    last_opened_at: stamp,
    install_id: meta?.install_id ?? randomId(),
  });
  return applied;
}

/** Reads the pre-IndexedDB blob, newest key first. */
export function readLegacyBlobFromLocalStorage(): string | null {
  try {
    if (window.localStorage.getItem(LEGACY_IMPORTED_FLAG)) return null;
    for (const key of LEGACY_BLOB_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (raw) return raw;
    }
  } catch {
    /* private mode; nothing to import */
  }
  return null;
}

export function clearLegacyBlobFromLocalStorage(): void {
  try {
    for (const key of LEGACY_BLOB_KEYS) window.localStorage.removeItem(key);
    window.localStorage.setItem(LEGACY_IMPORTED_FLAG, '1');
  } catch {
    /* private mode; nothing to clear */
  }
}

export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 12);
}

// --- Legacy shapes ----------------------------------------------------------

interface LegacyProgressRow {
  item_key?: string;
  kind?: string;
  attempts?: number;
  passes?: number;
  fails?: number;
  learned?: boolean;
  needs_review?: boolean;
  last_score?: number | null;
  last_attempted_at?: string | null;
}

interface LegacySession {
  id: string;
  [key: string]: unknown;
}

interface LegacyBlob {
  preferences?: Record<string, unknown>;
  progress?: Record<string, LegacyProgressRow>;
  sessions?: LegacySession[];
  active_days?: string[];
  schema_version?: number;
}

/**
 * Copies only keys the current shape declares, and only when the type matches.
 *
 * A stored preference whose type changed between releases would otherwise flow
 * straight into the app — `daily_target: "5"` renders, then breaks arithmetic
 * three screens later.
 */
function stripUnknown<T extends object>(
  incoming: Record<string, unknown>,
  shape: T,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(shape) as Array<[string, unknown]>) {
    if (!(key in incoming)) continue;
    const value = incoming[key];
    if (value === null && fallback === null) out[key] = value;
    else if (fallback === null || typeof value === typeof fallback) out[key] = value;
  }
  return out as Partial<T>;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
