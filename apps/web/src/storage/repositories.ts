import type {
  DailyActivity,
  ItemProgress,
  LearnerPreferences,
  LearningSession,
} from '@hangyul-ganada/shared-types';

import {
  REVIEW_ALGORITHM_VERSION,
  type ItemMemory,
  type MemoryMap,
  type Skill,
  memoryKey,
} from '../domain/memory';
import { isRecovered, type Mistake, type MistakeMap } from '../domain/mistakes';
import type { PersistenceDriver, StoreName } from './driver';
import {
  META_KEY,
  SETTINGS_KEY,
  blankProgress,
  defaultSettings,
  progressKey,
  type SchemaMeta,
  type StoredSettings,
} from './schema';

/**
 * The repositories the application talks to.
 *
 * Split by concern rather than exposed as one blob store, because the concerns
 * genuinely differ: settings are a handful of scalars read before first paint,
 * progress is a large keyed set written on every attempt, sessions are an
 * append-mostly log. A component asking for the learner's voice should not have
 * to load six months of attempt history to get it.
 *
 * None of them know what engine is underneath.
 */

// --- Settings ---------------------------------------------------------------

/**
 * Preferences, plus the small mirror that makes first paint correct.
 *
 * IndexedDB is asynchronous, and the interface language and text direction have
 * to be known *before* React renders anything — otherwise a learner who reads
 * right to left gets a frame of left-to-right English on every launch. Those two values are
 * therefore mirrored into `localStorage`, which is the one thing it is good at:
 * a synchronous read of a tiny scalar. IndexedDB remains the source of truth;
 * the mirror is a cache that is rewritten on every save.
 */
/** Whether a stored vocabulary plan is one this build knows how to run. */
function isReadablePlan(plan: unknown): plan is StoredSettings['daily_plan'] {
  if (plan === null || plan === undefined) return false;
  const row = plan as Partial<NonNullable<StoredSettings['daily_plan']>>;
  return (
    typeof row.date === 'string' &&
    typeof row.goal === 'number' &&
    Array.isArray(row.words) &&
    Array.isArray(row.completed) &&
    row.words.every(
      (word) =>
        typeof word?.wordId === 'string' &&
        Array.isArray(word.steps) &&
        word.steps.every((step) => typeof step === 'string'),
    )
  );
}

export class SettingsRepository {
  static readonly MIRROR_KEY = 'hangyul_ganada:prefs';

  constructor(private readonly driver: PersistenceDriver) {}

  async load(): Promise<StoredSettings> {
    const stored = await this.driver.get<StoredSettings>('settings', SETTINGS_KEY);
    const base = defaultSettings();
    if (!stored) return base;
    return {
      ...base,
      ...stored,
      // Merge rather than replace, so a preference added in a later release
      // gets its default instead of becoming undefined for existing learners.
      active_days: Array.isArray(stored.active_days) ? stored.active_days : [],
      // A plan written by a build with different steps is not readable by this
      // one, and a half-understood plan would produce a session that skips
      // questions. `planIsCurrent` throws it away tomorrow anyway; this throws
      // away anything that is not the shape we expect, today.
      daily_plan: isReadablePlan(stored.daily_plan) ? stored.daily_plan : null,
    };
  }

  async save(settings: StoredSettings): Promise<void> {
    await this.driver.put('settings', SETTINGS_KEY, settings);
    writeMirror({ locale: settings.locale, voice: settings.voice });
  }

  async patch(patch: Partial<LearnerPreferences>): Promise<StoredSettings> {
    const current = await this.load();
    const next = { ...current, ...patch };
    await this.save(next);
    return next;
  }

  /** Synchronous, and deliberately so. Returns nulls before the first save. */
  static readMirror(): { locale: string | null; voice: string | null } {
    try {
      const raw = window.localStorage.getItem(SettingsRepository.MIRROR_KEY);
      if (!raw) return { locale: null, voice: null };
      const parsed = JSON.parse(raw) as { locale?: string | null; voice?: string | null };
      return { locale: parsed.locale ?? null, voice: parsed.voice ?? null };
    } catch {
      return { locale: null, voice: null };
    }
  }
}

function writeMirror(value: { locale: string | null; voice: string }): void {
  try {
    window.localStorage.setItem(SettingsRepository.MIRROR_KEY, JSON.stringify(value));
  } catch {
    /* private mode; the async read still works, first paint is just slower */
  }
}

// --- Progress ---------------------------------------------------------------

/** Per-item mastery. The largest collection, and the one worth protecting. */
export class ProgressRepository {
  constructor(private readonly driver: PersistenceDriver) {}

  /**
   * Every row, keyed as `kind:item_key`.
   *
   * Rows that fail validation are dropped rather than allowed to poison the
   * map. A single corrupt record — a truncated write, a browser killed
   * mid-transaction — must cost the learner that one character, not the whole
   * history, and certainly not a crash on launch.
   */
  async loadAll(): Promise<{ rows: Record<string, ItemProgress>; dropped: number }> {
    const all = await this.driver.getAll<unknown>('progress');
    const rows: Record<string, ItemProgress> = {};
    let dropped = 0;
    for (const candidate of all) {
      const row = normaliseProgress(candidate);
      if (!row) {
        dropped += 1;
        continue;
      }
      rows[progressKey(row.kind, row.item_key)] = row;
    }
    return { rows, dropped };
  }

  async put(row: ItemProgress): Promise<void> {
    await this.driver.put('progress', progressKey(row.kind, row.item_key), row);
  }

  async putMany(rows: ItemProgress[]): Promise<void> {
    await this.driver.putMany(
      'progress',
      rows.map((row) => [progressKey(row.kind, row.item_key), row] as const),
    );
  }

  async clear(): Promise<void> {
    await this.driver.clearStore('progress');
  }
}

/**
 * Repairs what can be repaired, rejects what cannot.
 *
 * A record missing its counters is still useful — the learner met this
 * character — so the counters are defaulted. A record with no key is not a
 * record of anything, so it goes.
 */
export function normaliseProgress(candidate: unknown): ItemProgress | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Partial<ItemProgress>;
  if (typeof row.item_key !== 'string' || row.item_key.length === 0) return null;
  const kind: ItemProgress['kind'] = row.kind === 'word' ? 'word' : 'character';
  const base = blankProgress(kind, row.item_key, row.first_seen_at ?? new Date().toISOString());
  return {
    ...base,
    ...row,
    item_key: row.item_key,
    kind,
    stage: normaliseStage(row.stage, base.stage),
    attempts: finite(row.attempts, base.attempts),
    passes: finite(row.passes, base.passes),
    fails: finite(row.fails, base.fails),
    trace_passes: finite(row.trace_passes, base.trace_passes),
    // `write_passes` is what builds up to v4 called this count. A row can
    // reach here before the v5 migration has run — a corrupt-row rescue path
    // reads whatever is in the store — so both spellings are accepted and the
    // newer one wins.
    practice_passes: finite(
      row.practice_passes,
      finite((row as { write_passes?: unknown }).write_passes, base.practice_passes),
    ),
    recognition_passes: finite(row.recognition_passes, base.recognition_passes),
    demo_seen: typeof row.demo_seen === 'boolean' ? row.demo_seen : base.demo_seen,
    learned: row.stage === 'learned',
  };
}

const STAGES = new Set(['unseen', 'introduced', 'traced', 'practised', 'learned']);

/**
 * A stage as this build spells it.
 *
 * `written` is what builds up to v4 called the rung now named `practised`. This
 * rescue path can see a row before the v5 migration has rewritten it — it is
 * called on anything read out of the store, including during the migration
 * itself — so the old spelling is translated rather than treated as corrupt and
 * reset to `unseen`, which would silently delete a learner's progress.
 */
function normaliseStage(value: unknown, fallback: ItemProgress['stage']): ItemProgress['stage'] {
  if (value === 'written') return 'practised';
  return typeof value === 'string' && STAGES.has(value)
    ? (value as ItemProgress['stage'])
    : fallback;
}
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

// --- Sessions ---------------------------------------------------------------

/**
 * Practice sessions.
 *
 * Capped, because this is a log and a device is not a data warehouse. The cap
 * is high enough that the statistics screen never notices and low enough that a
 * three-year learner's database stays in single-digit megabytes.
 */
export class LearningRepository {
  static readonly MAX_SESSIONS = 500;

  constructor(private readonly driver: PersistenceDriver) {}

  async loadAll(): Promise<LearningSession[]> {
    const rows = await this.driver.getAll<LearningSession>('sessions');
    return rows
      .filter((s) => s && typeof s.id === 'string')
      .sort((a, b) => a.started_at.localeCompare(b.started_at));
  }

  async put(session: LearningSession): Promise<void> {
    await this.driver.put('sessions', session.id, session);
  }

  /** Drops the oldest rows past the cap. Returns how many were removed. */
  async prune(): Promise<number> {
    const all = await this.loadAll();
    const excess = all.length - LearningRepository.MAX_SESSIONS;
    if (excess <= 0) return 0;
    for (const session of all.slice(0, excess)) {
      await this.driver.remove('sessions', session.id);
    }
    return excess;
  }

  async clear(): Promise<void> {
    await this.driver.clearStore('sessions');
  }
}

// --- Activity ---------------------------------------------------------------

/**
 * Daily learning roll-ups.
 *
 * Capped like the session log, and for the same reason — this is a device, not
 * a data warehouse — but the cap is generous because a row is one day. Five
 * years of daily practice is under two thousand rows of a few hundred bytes,
 * and pruning older days than that costs the learner nothing they can see.
 */
export class ActivityRepository {
  static readonly MAX_DAYS = 1_825;

  constructor(private readonly driver: PersistenceDriver) {}

  async loadAll(): Promise<Record<string, DailyActivity>> {
    const rows = await this.driver.getAll<unknown>('activity');
    const out: Record<string, DailyActivity> = {};
    for (const candidate of rows) {
      const row = normaliseActivity(candidate);
      if (row) out[row.date] = row;
    }
    return out;
  }

  async put(row: DailyActivity): Promise<void> {
    await this.driver.put('activity', row.date, row);
  }

  /** Drops the oldest days past the cap. Returns how many were removed. */
  async prune(): Promise<number> {
    const dates = Object.keys(await this.loadAll()).sort();
    const excess = dates.length - ActivityRepository.MAX_DAYS;
    if (excess <= 0) return 0;
    for (const date of dates.slice(0, excess)) await this.driver.remove('activity', date);
    return excess;
  }

  async clear(): Promise<void> {
    await this.driver.clearStore('activity');
  }
}

/**
 * Repairs what can be repaired, rejects what cannot.
 *
 * Same contract as `normaliseProgress`: a day missing a counter is still a day
 * the learner practised, so counters default; a row with no date is not a
 * record of anything, so it goes.
 */
export function normaliseActivity(candidate: unknown): DailyActivity | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Partial<DailyActivity>;
  if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
  const stamp = `${row.date}T00:00:00.000Z`;
  return {
    date: row.date,
    first_at: typeof row.first_at === 'string' ? row.first_at : stamp,
    last_at: typeof row.last_at === 'string' ? row.last_at : stamp,
    active_ms: finite(row.active_ms, 0),
    attempts: finite(row.attempts, 0),
    passes: finite(row.passes, 0),
    characters_learned: finite(row.characters_learned, 0),
    words_learned: finite(row.words_learned, 0),
    reviews: finite(row.reviews, 0),
    items:
      row.items && typeof row.items === 'object'
        ? Object.fromEntries(
            Object.entries(row.items).filter(
              (entry): entry is [string, number] => typeof entry[1] === 'number',
            ),
          )
        : {},
  };
}

// --- Memory -----------------------------------------------------------------

/**
 * Per-item, per-skill memory state for the adaptive scheduler.
 *
 * Kept apart from `progress` on purpose, and the separation is the point of
 * section 55 of the brief: *mastery* is "I finished learning ㄱ" and *memory* is
 * "how well do I remember it today". A failed review must never turn a learned
 * letter back into an unseen one, and the cheapest way to guarantee that is for
 * the two facts to live in two rows that no single write touches at once.
 */
export class MemoryRepository {
  constructor(private readonly driver: PersistenceDriver) {}

  async loadAll(): Promise<MemoryMap> {
    const rows = await this.driver.getAll<unknown>('memory');
    const out: MemoryMap = {};
    for (const candidate of rows) {
      const row = normaliseMemory(candidate);
      if (row) out[memoryKey(row.kind, row.item_key)] = row;
    }
    return out;
  }

  async put(row: ItemMemory): Promise<void> {
    await this.driver.put('memory', memoryKey(row.kind, row.item_key), row);
  }

  async clear(): Promise<void> {
    await this.driver.clearStore('memory');
  }
}

/** Repairs what can be repaired, rejects what cannot. */
export function normaliseMemory(candidate: unknown): ItemMemory | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Partial<ItemMemory>;
  if (typeof row.item_key !== 'string' || !row.item_key) return null;
  const kind: ItemMemory['kind'] = row.kind === 'word' ? 'word' : 'character';
  return {
    item_key: row.item_key,
    kind,
    algorithm_version: finite(row.algorithm_version, REVIEW_ALGORITHM_VERSION),
    skills: row.skills && typeof row.skills === 'object' ? row.skills : {},
    confusions:
      row.confusions && typeof row.confusions === 'object'
        ? Object.fromEntries(
            Object.entries(row.confusions).filter(
              (entry): entry is [string, number] => typeof entry[1] === 'number',
            ),
          )
        : {},
    rescued_at: typeof row.rescued_at === 'string' ? row.rescued_at : null,
  };
}

// --- Mistakes ---------------------------------------------------------------

export class MistakeRepository {
  /**
   * How many mistakes are kept.
   *
   * One row per *item*, not per wrong answer, so this is a bound on how many
   * distinct things a learner has ever got wrong — which for a curriculum of
   * seventy characters and ten thousand words is generously above anything real.
   * It exists so a corrupted or hostile import cannot grow the store without
   * limit, not because a learner will reach it.
   *
   * When it is reached, the *recovered* rows go first: a mistake that has been
   * answered right twice has done its job, and the ones still going wrong are
   * the ones worth keeping.
   */
  static readonly MAX_MISTAKES = 5_000;

  constructor(private readonly driver: PersistenceDriver) {}

  async loadAll(): Promise<MistakeMap> {
    const rows = await this.driver.getAll<unknown>('mistakes');
    const out: MistakeMap = {};
    for (const candidate of rows) {
      const row = normaliseMistake(candidate);
      if (row) out[row.id] = row;
    }
    return out;
  }

  async put(row: Mistake): Promise<void> {
    await this.driver.put('mistakes', row.id, row);
  }

  async remove(id: string): Promise<void> {
    await this.driver.remove('mistakes', id);
  }

  async prune(): Promise<void> {
    const all = (await this.driver.getAll<unknown>('mistakes'))
      .map(normaliseMistake)
      .filter((row): row is Mistake => row !== null);
    const excess = all.length - MistakeRepository.MAX_MISTAKES;
    if (excess <= 0) return;

    // Recovered first, oldest first within that — see `MAX_MISTAKES`.
    const ordered = [...all].sort((a, b) => {
      const recovered = Number(isRecovered(a)) - Number(isRecovered(b));
      if (recovered !== 0) return -recovered;
      return a.lastAt.localeCompare(b.lastAt);
    });
    for (const row of ordered.slice(0, excess)) await this.driver.remove('mistakes', row.id);
  }

  async clear(): Promise<void> {
    await this.driver.clearStore('mistakes');
  }
}

/** Repairs what can be repaired, rejects what cannot. */
export function normaliseMistake(candidate: unknown): Mistake | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const row = candidate as Partial<Mistake>;
  if (typeof row.itemKey !== 'string' || !row.itemKey) return null;
  if (typeof row.answer !== 'string' || !row.answer) return null;
  const kind: Mistake['kind'] = row.kind === 'word' ? 'word' : 'character';
  const at = typeof row.lastAt === 'string' ? row.lastAt : new Date(0).toISOString();
  return {
    id: typeof row.id === 'string' && row.id ? row.id : `${kind}:${row.itemKey}`,
    kind,
    itemKey: row.itemKey,
    mode: (row.mode ?? 'read') as Mistake['mode'],
    skill: (row.skill ?? 'meaning_recognition') as Mistake['skill'],
    chose: typeof row.chose === 'string' ? row.chose : null,
    answer: row.answer,
    firstAt: typeof row.firstAt === 'string' ? row.firstAt : at,
    lastAt: at,
    wrongCount: Math.max(1, finite(row.wrongCount, 1)),
    correctSince: Math.max(0, finite(row.correctSince, 0)),
  };
}

// --- Attempts ---------------------------------------------------------------

/**
 * One row per review exercise, bounded.
 *
 * The store was declared four schema versions ago and never written to, which
 * is worse than not having it: a reader of the code would reasonably assume the
 * app had an attempt history. It has one now, and it is the evidence behind the
 * weekly insights and the confusion pairs.
 *
 * **What is deliberately not stored**: the stroke path, the rendered canvas,
 * the reference glyph. A learner practising twice a day for a year produces
 * seven hundred sessions; at a few hundred bytes each that is a rounding error,
 * and at a few hundred kilobytes each it is a device filling up because an app
 * kept every drawing anyone ever made.
 */
export class AttemptRepository {
  /**
   * How many detailed rows are kept.
   *
   * Two thousand is several months of daily practice, which is far more than
   * any insight looks at — the weekly summary reads seven days. The cap exists
   * so the store is bounded, not because older rows are uninteresting: the
   * counters that outlive them live on the memory row, which is never pruned.
   */
  static readonly MAX_ATTEMPTS = 2_000;

  constructor(private readonly driver: PersistenceDriver) {}

  async loadAll(): Promise<AttemptRecord[]> {
    const rows = await this.driver.getAll<AttemptRecord>('attempts');
    return rows
      .filter((row) => row && typeof row.id === 'string' && typeof row.at === 'string')
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  async put(row: AttemptRecord): Promise<void> {
    await this.driver.put('attempts', row.id, row);
  }

  /** Drops the oldest rows past the cap. Returns how many were removed. */
  async prune(): Promise<number> {
    const all = await this.loadAll();
    const excess = all.length - AttemptRepository.MAX_ATTEMPTS;
    if (excess <= 0) return 0;
    for (const row of all.slice(0, excess)) await this.driver.remove('attempts', row.id);
    return excess;
  }

  async clear(): Promise<void> {
    await this.driver.clearStore('attempts');
  }
}

/**
 * What one review exercise produced.
 *
 * Compact by design — every field is here because the scheduler or an insight
 * reads it, and nothing is here "in case it is useful later".
 */
export interface AttemptRecord {
  id: string;
  /** `kind:item_key`. */
  item_key: string;
  skill: Skill;
  mode: string;
  at: string;
  passed: boolean;
  score: number;
  hint_used: boolean;
  response_ms: number | null;
  /** What was chosen instead, for a wrong multiple-choice answer. */
  confused_with?: string;
  session_id?: string;
}

// --- Meta -------------------------------------------------------------------

export class MetaRepository {
  constructor(private readonly driver: PersistenceDriver) {}

  read(): Promise<SchemaMeta | undefined> {
    return this.driver.get<SchemaMeta>('meta', META_KEY);
  }
}

/** Wipes every store. Behind a confirmation in Settings, and nowhere else. */
export async function clearEverything(driver: PersistenceDriver): Promise<void> {
  const stores: StoreName[] = [
    'settings',
    'progress',
    'sessions',
    'attempts',
    'activity',
    'memory',
  ];
  for (const store of stores) await driver.clearStore(store);
}
