/**
 * The evaluator the app ships.
 *
 * Built from `policy/runtime-policy.json` — the full policy minus the
 * thirty-one languages whose strings are validated at publication and never
 * generated on the device. Everything Korean and romanised is here in full,
 * with the same context rules and allow lists, so a legacy sitting, a cached day, a
 * fetched bank or a distractor chosen in the browser is judged by the same
 * rules the release scanner applied — see `docs/CHILD_SAFE_CONTENT_POLICY.md`.
 */
import runtimePolicy from '../policy/runtime-policy.json';
import { createEvaluator, type Evaluator } from './evaluate';
import type { Policy } from './policy';

let instance: Evaluator | null = null;

/** The runtime evaluator, compiled on first use. */
export function runtimeEvaluator(): Evaluator {
  if (!instance) instance = createEvaluator(runtimePolicy as unknown as Policy);
  return instance;
}

export const RUNTIME_POLICY_VERSION: string = (runtimePolicy as { version: string }).version;
