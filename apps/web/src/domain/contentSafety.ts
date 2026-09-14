/**
 * The runtime delivery gate.
 *
 * Everything a learner is shown was validated when it was built — the pack,
 * the dictionary, the bank, the gap-fills — by the one child-safe content
 * policy in `packages/content-safety`. This module is the last of the gates
 * the policy names, and it exists for the content that validation cannot
 * reach: what is already on a learner's device.
 *
 * Three things live there. A **stored daily plan** may name a word the
 * curriculum has since retired. A **resumable Level Test sitting** may name
 * items a rebuilt bank no longer has — and did: `dict_섹스하다:meaning` was a
 * level-12 question until 11 September 2026. And a **fetched or shipped bank**
 * is an artefact, and an artefact built before a policy change is exactly the
 * thing a policy change cannot see. So plans are repaired, sittings are
 * checked against the bank actually loaded, and every bank item is read
 * through the runtime evaluator before the engine may ask it.
 *
 * ## What is preserved
 *
 * Nothing earned is removed. A retired word keeps its progress row, its memory
 * row, its mistakes and its place in `saved_items`; the tombstone in
 * `content/vocabulary/retired-words.json` is what makes those rows
 * explainable rather than orphaned (the app carries only the ids — see below). The plan repair drops only *unresolved*
 * planned words, so a day already finished stays finished, and it is
 * idempotent: repairing a repaired plan returns it unchanged. A stored sitting
 * needs no repair of its own: `sittingIsServable` already refuses to resume a
 * sitting whose items the loaded bank does not have, and the loaded bank is
 * the guarded one.
 */
import retiredIds from '@hangyul-ganada/content-safety/retired-ids';

import { getWord } from '../data/vocabulary';
import type { LevelTestItem } from './levelTestTypes';
import type { DailyPlan } from './vocabularyDay';

/*
 * The ids only. The ledger in `content/vocabulary/retired-words.json` carries
 * the word, the reason and the sentence that was retired; the app must not
 * bundle any of that, because it would ship the retired sentences back. The
 * ids file is generated from the ledger by `npm run policy:runtime`.
 */
const RETIRED: ReadonlySet<string> = new Set((retiredIds as { ids: string[] }).ids);

/** The policy version the tombstones were written under. */
export const RETIRED_POLICY_VERSION: string = (retiredIds as { policyVersion: string }).policyVersion;

/** Whether a taught-word id has been retired under the content policy. */
export function isRetiredWordId(id: string): boolean {
  return RETIRED.has(id);
}

/** Every retired id, for tests and the artefact scan. */
export function retiredWordIds(): string[] {
  return [...RETIRED];
}

/**
 * Today's plan without the retired words it has not yet taught.
 *
 * A word already completed today is kept — it was earned, and the day's
 * count must not go backwards because the curriculum changed underneath it.
 * A word still owed is dropped, because the app can no longer show it and a
 * plan that waits for it would be a day that cannot be finished. The goal is
 * untouched: the denominator is the number the learner agreed to.
 *
 * Returns the same object when nothing changes, so a caller can compare by
 * identity and avoid a pointless write.
 */
export function repairPlanForRetiredWords(plan: DailyPlan): DailyPlan {
  const completed = new Set(plan.completed);
  const kept = plan.words.filter((word) => !isRetiredWordId(word.wordId) || completed.has(word.wordId));
  if (kept.length === plan.words.length) return plan;
  return { ...plan, words: kept };
}

/**
 * The bank items the runtime evaluator will let the engine ask.
 *
 * Reads the Korean prompt, answer and options, the headword of every
 * dictionary anchor an option or prompt names, and the resolved meanings in
 * the interface language — through the evaluator for that language, which is
 * the base runtime policy plus the English lists (a Latin term hidden in a
 * Korean field is read against them, as the release scanner does) plus the
 * language's own lists. Until v1.0.5 only Korean meanings were re-read here
 * and the English lists were not on the device; both limits are closed, and
 * `runtime.test.ts` holds every fixture in every language to the full
 * policy's verdict through this evaluator.
 *
 * Loaded lazily: the evaluator, its policy and the two language supplements
 * are chunks of their own, and the Level Test is the only screen that needs
 * them at fetch time.
 */
export async function guardLevelTestItems(
  items: LevelTestItem[],
  meanings: ReadonlyMap<string, string>,
  locale: string,
): Promise<{ items: LevelTestItem[]; refused: string[] }> {
  const { runtimeEvaluatorFor } = await import('@hangyul-ganada/content-safety/runtime');
  const evaluator = await runtimeEvaluatorFor(locale);
  /*
    The word an anchor id names, for the allow lists.

    A dictionary anchor carries its headword in the id. A taught word is
    looked up in the corpus, which arrives in bands; a word whose band has
    not landed is judged without its name, which can only refuse more (a
    death-vocabulary card the policy names would be skipped for that sitting),
    never less.
  */
  const wordOf = (id: string) => (id.startsWith('dict_') ? id.slice(5) : getWord(id)?.word);
  const refused: string[] = [];
  const kept = items.filter((item) => {
    const own = { random: true, headword: item.lemma ?? wordOf(item.id.split(':')[0] ?? '') };
    if (item.prompt && evaluator.isBlocked(item.prompt, 'ko', item.kind === 'meaning' ? 'headword' : 'sentence', own)) {
      refused.push(item.id);
      return false;
    }
    if (item.answer && evaluator.isBlocked(item.answer, 'ko', 'option', own)) {
      refused.push(item.id);
      return false;
    }
    for (const option of item.options ?? []) {
      // An option is judged as its own word, or as any lemma the item was
      // built from — the same rule the builder's publication gate applies.
      const lemmas = [option, item.lemma, ...(item.distractorIds ?? []).map(wordOf)].filter(
        (value): value is string => Boolean(value),
      );
      const passes = lemmas.some((headword) => !evaluator.isBlocked(option, 'ko', 'option', { random: true, headword }));
      if (!passes) {
        refused.push(item.id);
        return false;
      }
    }
    const ids = [...(item.optionIds ?? []), ...(item.promptId ? [item.promptId] : [])];
    for (const id of ids) {
      // A dictionary anchor names its headword in the id, so it is judged in
      // every language, whatever the meaning file says — that is how the
      // 이기다 question that offered "to have sex" is refused for a Thai
      // learner who would only ever see the Thai meanings.
      const headword = wordOf(id);
      if (id.startsWith('dict_') && headword && evaluator.isBlocked(headword, 'ko', 'option', { random: true, headword })) {
        refused.push(item.id);
        return false;
      }
      const text = meanings.get(id);
      if (text && evaluator.isBlocked(text, locale, 'option', { random: true, headword })) {
        refused.push(item.id);
        return false;
      }
    }
    return true;
  });
  return { items: kept, refused };
}
