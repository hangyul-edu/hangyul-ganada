/** One question in the Vocabulary Level Test bank. */
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
  prompt: string;
  answer: string;
  options: string[];
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
