import type { LevelTestItem } from '../domain/levelTestTypes';

/**
 * The assessment bank, fetched when somebody starts the test and not before.
 *
 * A hundred-odd kilobytes gzipped of questions that most learners never open. It sits in
 * `public/` for the same reason the dictionary does: an import would go through
 * Vite's `manualChunks` catch-all onto the critical path, so every learner would
 * download the level test in order to see the home screen.
 *
 * Content-hashed, like the dictionary, so the offline worker can cache it
 * permanently and a rebuilt bank gets a new name rather than a stale hit.
 */
interface Manifest {
  levels: number;
  options: number;
  items: number;
  bank: string;
  perLevel: Record<string, number>;
}

export interface LevelTestBank {
  levels: number;
  items: LevelTestItem[];
  /** Items indexed by level, which is how the engine asks for them. */
  byLevel: Map<number, LevelTestItem[]>;
  /**
   * And by level *and kind*, which is how a sitting asks for them.
   *
   * A sitting is twelve contextual questions, nine each way on the word. The
   * engine chooses the level and the plan chooses the kind, so the lookup has
   * to answer both at once — and has to be able to say "nothing", because the
   * contextual bank thins out at the top of the scale and level 27 has one.
   */
  byLevelKind: Map<string, LevelTestItem[]>;
}

/** The key `byLevelKind` is indexed on. */
export function levelKind(level: number, kind: LevelTestItem['kind']): string {
  return `${level}:${kind}`;
}

function base(): string {
  const url = import.meta.env?.BASE_URL ?? '/';
  return `${url}level-test/`;
}

let bankPromise: Promise<LevelTestBank> | null = null;

/** One fetch per session, on the first sitting. A failure is not cached. */
export function loadLevelTestBank(): Promise<LevelTestBank> {
  bankPromise ??= (async () => {
    const manifest = (await (await fetch(`${base()}manifest.json`)).json()) as Manifest;
    const response = await fetch(`${base()}${manifest.bank}`);
    if (!response.ok) throw new Error(`level test: ${manifest.bank} — ${response.status}`);
    const raw = (await response.json()) as { items: LevelTestItem[] };
    const byLevel = new Map<number, LevelTestItem[]>();
    const byLevelKind = new Map<string, LevelTestItem[]>();
    for (const item of raw.items) {
      const list = byLevel.get(item.level);
      if (list) list.push(item);
      else byLevel.set(item.level, [item]);
      const key = levelKind(item.level, item.kind);
      const kindList = byLevelKind.get(key);
      if (kindList) kindList.push(item);
      else byLevelKind.set(key, [item]);
    }
    return { levels: manifest.levels, items: raw.items, byLevel, byLevelKind };
  })().catch((error: unknown) => {
    bankPromise = null;
    throw error;
  });
  return bankPromise;
}

/** Test seam. */
export function resetLevelTestBank(): void {
  bankPromise = null;
}
