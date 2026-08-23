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
