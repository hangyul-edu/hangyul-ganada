/**
 * Whether the learner's Vocabulary Level was measured or assumed.
 *
 * Three states, because two would lose the distinction that matters. The app
 * teaches from Level 1 whether somebody skipped the test or sat it and scored
 * 1 — the *words* are the same — but what the app may do next is not. It may
 * offer the test to somebody who has never been asked; it may not keep
 * offering it to somebody who has already declined; and offering it to somebody
 * who has taken it would be asking them to prove something they proved.
 *
 * Stored as two fields rather than one enum: `level_test` holds what was
 * measured and `placement_skipped_at` holds what was decided. See
 * `storage/schema.ts` for why those are not the same fact.
 */
export type PlacementStatus =
  /** Never asked. The only state that justifies interrupting a learner. */
  | 'untested'
  /** Asked, and chose to start at Level 1. Do not ask again. */
  | 'skipped'
  /** Sat the test. The level is a measurement. */
  | 'assessed';
