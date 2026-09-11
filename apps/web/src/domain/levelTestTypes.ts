/**
 * One question in the Vocabulary Level Test bank, as it is stored.
 *
 * ## Why a meaning is an id and a Korean word is not
 *
 * The Korean word is the same fact in every language — it is what the question
 * is *about*. A meaning is a different fact in each of thirty-two, and the bank
 * used to bake one of them in: `answer: "to divide, to share"`, rendered
 * verbatim under a Korean interface asking 이 단어는 무슨 뜻일까요?. English had
 * become the canonical object, so no amount of interface translation could
 * reach it.
 *
 * So anything that is a *meaning* is an anchor id here, and
 * `meanings-<locale>.json` holds the strings. `resolveItem` puts the two
 * together and reports which language each string actually came from.
 */
export interface LevelTestItem {
  id: string;
  /**
   * `meaning` shows Korean and asks for the meaning, `produce` the reverse, and
   * `context` blanks the word out of a sentence. No listening item and no
   * writing item: this measures vocabulary, and a learner who cannot hear or
   * cannot write should get the same number as one who can.
   */
  kind: 'meaning' | 'produce' | 'context';
  level: number;
  /** Korean, on `meaning` and `context`. Absent on `produce`, which asks a meaning. */
  prompt?: string;
  /** The anchor whose meaning is the prompt. `produce` only. */
  promptId?: string;
  /** Korean, on `produce` and `context`. Absent on `meaning`. */
  answer?: string;
  /** Korean, on `produce` and `context`. Absent on `meaning`. */
  options?: string[];
  /** The anchor whose meaning is the right answer. `meaning` only. */
  answerId?: string;
  /** The anchors whose meanings are the four choices. `meaning` only. */
  optionIds?: string[];
  /**
   * The dictionary form the answer was conjugated from. `context` only.
   *
   * Carried by the builder for its ambiguity gate, and read by the runtime
   * content-safety gate: a conjugated option is judged as the word it came
   * from, not as the string on the button — see `guardLevelTestItems`.
   */
  lemma?: string;
  /** The anchors the three wrong options were conjugated from. `context` only. */
  distractorIds?: string[];
}

/** One option, and the language its text is actually in. */
export interface RenderedOption {
  text: string;
  /**
   * The language this string came from — `ko` for a Korean word, the learner's
   * locale for a meaning.
   *
   * Carried so a test can assert it rather than guess from the script: §6 is
   * explicit that Latin-character detection cannot work when half the supported
   * languages are written in Latin. An option that came from the wrong pack is
   * a defect whatever it looks like.
   */
  resolvedLocale: string;
  correct: boolean;
}

/** A question with every string resolved into one language. */
export interface RenderedItem {
  id: string;
  kind: LevelTestItem['kind'];
  level: number;
  prompt: string;
  promptLocale: string;
  options: RenderedOption[];
}

/** A finished sitting, kept so the learner can see it again. */
export interface LevelTestResult {
  /** The reported level, 1–30. */
  level: number;
  /** The 95% interval, as reported. */
  low: number;
  high: number;
  /** How many questions it took. */
  items: number;
  /** ISO date, so the result can say when it was taken. */
  takenAt: string;
  /**
   * Items asked, most recent sitting first, so a retake can avoid them.
   *
   * Capped, because this is stored on the device and a learner who retakes
   * monthly for a year should not accumulate an unbounded list.
   */
  recentItems: string[];
}

/**
 * A sitting in progress, written to the device after every answer.
 *
 * ## Why this is stored at all
 *
 * A sitting used to live entirely in component state. Closing the app eleven
 * questions in threw away eleven questions, and the screen had a leave-guard
 * whose whole job was to warn the learner about that. On a phone the leave is
 * often not a decision — a call arrives, the OS reclaims the tab — and an
 * assessment that cannot survive a phone call is one a learner will not risk
 * starting twice.
 *
 * ## What makes the resume honest
 *
 * Two rules, and the shape below exists to enforce them.
 *
 * **The questions already presented do not change.** `presented` holds the item
 * id of every question in the order it was shown, so a resumed sitting replays
 * them rather than re-choosing them. Anything still unanswered is re-shown as
 * itself.
 *
 * **The scoring does not change.** `responses` is parallel to `presented`, and a
 * resumed sitting rebuilds the posterior from it before choosing anything new.
 * There is no second scoring path.
 *
 * Everything a future question depends on is either in this row or is a pure
 * function of it: `seed` fixes which item is drawn from a level's pool, so the
 * next question after a resume is the same one it would have been.
 */
export interface LevelTestSitting {
  /**
   * Fixes item choice within a level, so the sitting is reproducible.
   *
   * Made once when the sitting starts. See `pickIndex` in `domain/levelTest.ts`
   * for why a seed rather than a stored list of future questions: a list would
   * be a second source of truth about a sitting that is still adapting.
   */
  seed: string;
  /** ISO, so an abandoned sitting can be aged out rather than resumed forever. */
  startedAt: string;
  /** Epoch ms. The one clock over the whole sitting, kept across a restart. */
  deadline: number;
  /**
   * The interface language the sitting is being taken in.
   *
   * A sitting is not resumed into a different language. The bank resolves its
   * meanings per locale, so the questions already presented might not exist in
   * the new one — and a learner who switched language mid-assessment has asked
   * for a different test. Discarding is safe: an unfinished sitting has never
   * written a level.
   */
  locale: string;
  /**
   * The level a previous sitting reported, frozen when this one started.
   *
   * Frozen rather than read live so that the warm-up ladder of a resumed
   * sitting is the ladder it actually used, even if something else has since
   * written a new result.
   */
  seededFrom: number | null;
  /** Item ids, in the order they were shown. */
  presented: string[];
  /**
   * What the learner said, parallel to `presented`.
   *
   * `null` at the tail means "shown, not yet answered" — the state a sitting is
   * in at the moment the app is closed.
   */
  responses: (Response | null)[];
}

/** The three things a learner can say about a question. */
export type Response = 'correct' | 'wrong' | 'unknown';
