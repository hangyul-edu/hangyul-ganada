import type { VocabularyWord } from '@hangyul-ganada/shared-types';

import generated from './generated/relations.json';
import { getWord, type ContentSourceRecord } from './vocabulary';

/**
 * Synonyms and antonyms, and nothing that merely resembles one.
 *
 * ## What this replaced, and why
 *
 * The Word Detail screen used to carry a section headed *비슷한 낱말* — "words
 * like this" — filled by taking the four words nearest this one in the same
 * category. Under 고기 that produced 사과, 음식, 먹다, 우유: four words from the
 * food shelf, none of them a synonym of *meat*, presented under a heading that
 * claims they are. A learner cannot tell a computed neighbour from a dictionary
 * fact, so every entry on the screen inherited the credibility of the worst one.
 *
 * A category is not a relation. Neither is a frequency band, an embedding
 * distance, or turning up in the same example sentence. So none of them is here.
 * What is here is what a dictionary states, typed as the relation it is:
 *
 * - **synonym** — 유의어
 * - **antonym** — 반의어
 *
 * and nothing else. Not hypernyms, not compounds, not "related vocabulary" —
 * those are real lexical categories and collapsing them into one customer-facing
 * list is exactly how the old section went wrong.
 *
 * ## Where the data comes from
 *
 * `scripts/content/build_relations.py`, from the Korean Wiktionary's own
 * `유의어`/`반의어` metadata, scoped to the part of speech and the primary sense
 * this app teaches, and kept only when both headwords state the relation. See
 * that file for the rule in full. Nothing is hand-written and nothing is
 * inferred.
 *
 * ## Most words have none, and that is the shipped answer
 *
 * 242 of 2,581 words carry a relation. The other 2,339 show no synonym section
 * and no antonym section at all — not an empty one, not a substitute list of
 * neighbours. A page with less on it is the correct page when the alternative is
 * a page with a false claim on it.
 */

interface GeneratedRelations {
  source: ContentSourceRecord;
  entries: Record<string, { synonyms: string[]; antonyms: string[] }>;
}

const file = generated as unknown as GeneratedRelations;
const ENTRIES = file.entries;

/**
 * The dictionary behind these relations, for the Legal screen.
 *
 * Kept here rather than in the corpus's own source list because it is a source
 * for *this file* and nothing else — no gloss, example or pronunciation in the
 * app came from it. Its licence is share-alike, so the credit is an obligation
 * rather than a courtesy.
 */
export const RELATION_SOURCE = file.source;

export interface WordRelations {
  /** 유의어. Empty means *the dictionary states none*, so nothing is shown. */
  synonyms: VocabularyWord[];
  /** 반의어. Same rule. */
  antonyms: VocabularyWord[];
}

const NONE: WordRelations = { synonyms: [], antonyms: [] };

/**
 * The relations to show under a word, already resolved to shipping entries.
 *
 * Resolved rather than returned as ids because every relation on the screen is
 * a link to another Word Detail page, and a link to a word that is not in this
 * build is a dead end. A target that does not resolve is dropped here, which
 * makes "shown" and "openable" the same set by construction.
 */
export function relationsOf(wordId: string): WordRelations {
  const entry = ENTRIES[wordId];
  if (!entry) return NONE;
  const resolve = (ids: string[]) =>
    ids.map(getWord).filter((word): word is VocabularyWord => word !== undefined);
  return {
    synonyms: resolve(entry.synonyms),
    antonyms: resolve(entry.antonyms),
  };
}

/** Every word id with at least one relation. For QA and tests. */
export function wordsWithRelations(): string[] {
  return Object.keys(ENTRIES);
}
