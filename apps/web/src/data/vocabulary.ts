import type {
  SourceMetadata,
  VocabularyCategory,
  VocabularyLesson,
  VocabularyWord,
} from '@hangyul-ganada/shared-types';

import generated from './generated/vocabulary.json';
import { toSyllables } from './jamo';

/**
 * The vocabulary curriculum.
 *
 * ## Where this comes from
 *
 * `generated/vocabulary.json` is built by `scripts/content/build_vocabulary.py`
 * from three sources, and every field on every word carries the one it came
 * from:
 *
 * | Field | Source |
 * | --- | --- |
 * | part of speech | English Wiktionary (CC BY-SA 4.0) |
 * | frequency band, rank and rate | two OpenSubtitles Korean corpora, measured |
 * | meanings, example, translations, pronunciation notes | Hangyul ganada editorial pack |
 * | pronunciation, syllables, difficulty, readiness | Hangyul ganada |
 *
 * Nothing here is hand-edited. Editing the data means editing the editorial
 * pack in `content/vocabulary/entries/` and rebuilding, so the reason for
 * every choice stays written down next to the choice.
 *
 * ## Three different numbers, kept apart
 *
 * `frequency` is how often the corpora saw the word. `difficulty_level` is how
 * hard the word is to *learn*. `letters_ready_after` is whether the alphabet
 * curriculum has introduced every letter in it yet. They disagree constantly —
 * 맛있다 is an easy word spelled with a late letter — and collapsing any two of
 * them is the mistake this schema exists to avoid.
 *
 * **None of them is a TOPIK level.** TOPIK grades are not represented in this
 * product at all.
 */

interface GeneratedWord {
  id: string;
  word: string;
  pronunciation: string;
  part_of_speech: VocabularyWord['part_of_speech'];
  example: string;
  /** `[band index into file.frequency_bands, rank, rate]`. */
  f: [number, number | null, number | null];
  difficulty_score: number;
  difficulty_level: number;
  /** Index into `file.difficulty_reasons`. */
  r: number;
  usefulness: number;
  /** Index into `file.categories` — the one category a learner browses it under. */
  c: number;
  /** Indices into `file.categories` for the other categories it touches. */
  ct: number[];
  letters_ready_after: number;
  /**
   * The letters this word needs, as a bitmask over `file.letter_order`.
   *
   * A number rather than an array of jamo, because expanding ㅘ into ㅗ + ㅏ
   * needs a compound table and there must be exactly one of those. It lives in
   * `scripts/content/hangul.py`; this is its output, not a second copy of it.
   */
  j: number;
  /** `[source index, field-set index]` per contributing source. */
  prov: Array<[number, number]>;
  /** How it is said, where that differs from how it is written. */
  say?: string;
  /** Which sound-change pattern makes it differ. Index into `sound_patterns`. */
  sayWhy?: string;
  /** The form the example writes it in. Verbs and adjectives only. */
  as?: string;
}

export interface ContentSourceRecord {
  id: string;
  name: string;
  license: string;
  license_url: string | null;
  homepage: string;
  provides: string;
  attribution: string | null;
  /** Rebuilds the per-word reference. See `expandProvenance`. */
  reference_template: string | null;
  derived: boolean;
}

interface GeneratedFile {
  generator: string;
  letter_order: string[];
  /** Locale ids, in the order the columnar `m` and `t` arrays use. */
  locales: string[];
  levels: number;
  categories: string[];
  difficulty_reasons: string[];
  frequency_bands: string[];
  words_per_lesson: number;
  sound_patterns: string[];
  sources: ContentSourceRecord[];
  field_sets: string[][];
  words: GeneratedWord[];
}

const file = generated as unknown as GeneratedFile;

/** The datasets behind the curriculum, for the Content sources screen. */
export const CONTENT_SOURCES = file.sources;

export const WORDS_PER_LESSON = file.words_per_lesson;

/**
 * The generator that produced this dataset.
 *
 * Recorded so a word's numbers can be traced to the code that computed them —
 * a level assigned by v1 is not comparable to one assigned by a later model,
 * and pretending otherwise is how a "level 3" quietly changes meaning between
 * releases.
 */
export const VOCABULARY_PROVENANCE = {
  generator: file.generator,
  /**
   * False, and deliberately so: nothing in this dataset is an official grading
   * of any kind. The UI copy that says so lives in the translation bundles;
   * this is the machine-readable half that cannot be lost in translation.
   */
  isOfficial: false,
} as const;

/** How many difficulty levels this dataset was binned into. */
export const DIFFICULTY_LEVELS = file.levels;

/** The frequency bands the generator can emit, most to least common. */
export const FREQUENCY_BANDS = file.frequency_bands;

/**
 * The sound-change patterns a word can be tagged with.
 *
 * Closed, and exported so the tests can assert that every one of them has copy
 * in every language — a pattern that reaches a learner without an explanation
 * is a panel that says a word is pronounced differently and does not say why.
 */
export const SOUND_PATTERNS = file.sound_patterns;

/**
 * Rebuilds a word's full provenance from the interned form.
 *
 * The generated file stores `[source, field-set]` pairs and a reference
 * *template* per source, because every Wiktionary reference is the same URL
 * with the word substituted in and every frequency reference is the same
 * sentence with the rank substituted in. Storing 2,832 expanded copies was 77%
 * of the dataset and 2.8 MB of the JavaScript bundle, for strings a one-line
 * substitution regenerates exactly.
 */
function expandProvenance(row: GeneratedWord): SourceMetadata[] {
  return row.prov.map(([sourceIndex, fieldsIndex]) => {
    const source = file.sources[sourceIndex]!;
    const template = source.reference_template;
    const reference = template
      ? template
          .replace('{word}', encodeURIComponent(row.word))
          .replace('{frequency_rank}', String(row.f[1] ?? ''))
      : null;
    return {
      fields: file.field_sets[fieldsIndex] ?? [],
      source_id: source.id,
      source_name: source.name,
      license: source.license,
      license_url: source.license_url,
      reference,
      derived: source.derived,
    };
  });
}

/**
 * The pronunciation clip id for a piece of Korean.
 *
 * Derived rather than stored, and identical to the rule in `characters.ts` and
 * `scripts/export-speech-plan.mjs` — hex codepoints, so the id is ASCII and
 * survives a zip round-trip and an Android asset packer.
 */
function audioId(prefix: string, text: string): string {
  return `${prefix}_${[...text].map((ch) => ch.codePointAt(0)!.toString(16)).join('')}`;
}

/** The letters a bitmask names, in curriculum order. See `GeneratedWord.j`. */
function expandJamo(mask: number): string[] {
  const out: string[] = [];
  file.letter_order.forEach((letter, index) => {
    // `2 ** index` rather than `1 << index`: the alphabet is 40 letters and
    // JavaScript's bitwise operators truncate to 32 bits, which would silently
    // drop every letter from ㅚ onwards.
    if (Math.floor(mask / 2 ** index) % 2 === 1) out.push(letter);
  });
  return out;
}

export const VOCABULARY: VocabularyWord[] = file.words.map((row) => {
  return {
    id: row.id,
    word: row.word,
    pronunciation: row.pronunciation,
    part_of_speech: row.part_of_speech,
    example: row.example,
    frequency: {
      observed: row.f[1] !== null,
      band: file.frequency_bands[row.f[0]]!,
      rank: row.f[1],
      rate: row.f[2],
    } as VocabularyWord['frequency'],
    difficulty_level: row.difficulty_level as VocabularyWord['difficulty_level'],
    difficulty_score: row.difficulty_score,
    difficulty_reason: file.difficulty_reasons[row.r]!,
    usefulness: row.usefulness,
    category: file.categories[row.c]!,
    category_tags: row.ct.map((index) => file.categories[index]!),
    letters_ready_after: row.letters_ready_after,
    spoken: row.say ?? null,
    sound_pattern: row.sayWhy ?? null,
    surface_form: row.as ?? null,
    syllables: toSyllables(row.word),
    required_jamo: expandJamo(row.j),
    audio: {
      word: audioId('word', row.word),
      example: audioId('ex', row.example),
    },
    sources: expandProvenance(row),
  };
});

const BY_ID = new Map(VOCABULARY.map((w) => [w.id, w]));

export function getWord(id: string): VocabularyWord | undefined {
  return BY_ID.get(id);
}

// --- Priority ------------------------------------------------------------------

/**
 * The corpus in the order a beginner should meet it.
 *
 * ## Why this exists and the categories do not answer it
 *
 * Browsing is organised by *meaning* — where are the food words — because that
 * is the question a person browsing has. Learning is organised by *usefulness*,
 * because the question the daily session has is "what are the next ten words
 * this learner most needs", and the answer does not care which category they
 * are in.
 *
 * The ordering is the blend the content pipeline already computed: corpus
 * frequency, editorial learner-usefulness, concreteness, and how early the
 * spelling is reachable. Ties break on the headword so the order is total and
 * a session built twice is the same session.
 *
 * ## What the learner is told about it
 *
 * Nothing. There is no level, no band, no difficulty number anywhere in the
 * interface. A learner cannot act on "this is a tier-2 word" and showing it
 * invites the one question the product cannot answer — tier 2 by whose measure?
 * The ordering decides what they are offered; it is never a label on it.
 *
 * ## Scale
 *
 * Sorted once, at module load, and handed out as a frozen array. The daily
 * session takes a prefix of it — `buildDailyPlan` stops as soon as it has
 * enough — so the cost of a session does not grow with the corpus. At ten
 * thousand words this is one sort of ten thousand short records at startup and
 * nothing per session.
 */
const BY_PRIORITY: readonly VocabularyWord[] = Object.freeze(
  [...VOCABULARY].sort(
    (a, b) => a.difficulty_score - b.difficulty_score || a.word.localeCompare(b.word),
  ),
);

export function vocabularyByPriority(): readonly VocabularyWord[] {
  return BY_PRIORITY;
}

// --- Categories ---------------------------------------------------------------

/**
 * What a learner browses by.
 *
 * The vocabulary used to be presented as Level 1 through Level 8. The numbers
 * were measured and they were still the wrong thing to put in front of someone:
 * a level answers "how hard is this, compared with 2,503 words you have not
 * met?", and the question a learner actually has is "where are the food words?".
 *
 * The levels did not go away — `difficulty_score` still decides the order
 * *within* a category, so the first Animals words are 개 and 새 rather than
 * whichever animal happens to sort first. They simply stopped being the
 * structure. See `scripts/content/categories.py` for the taxonomy and how every
 * word was placed in it.
 */
export const VOCABULARY_CATEGORIES: VocabularyCategory[] = file.categories.map((id, index) => {
  const words = VOCABULARY.filter((w) => w.category === id);
  return {
    id,
    order: index + 1,
    word_count: words.length,
    required_jamo: [...new Set(words.flatMap((w) => w.required_jamo))],
  };
});

export const CATEGORY_IDS = file.categories;

/**
 * The words in a category, most useful first.
 *
 * Sorted by the difficulty score, which is the blend of frequency, usefulness,
 * concreteness and spelling the content pipeline computes — so "first" means
 * "the one a beginner is most likely to want and most likely to manage", not
 * "the one that sorts first in Korean". Animals opens on 개, 새, 고양이.
 */
export function wordsByCategory(category: string): VocabularyWord[] {
  return VOCABULARY.filter((w) => w.category === category).sort(
    (a, b) => a.difficulty_score - b.difficulty_score || a.word.localeCompare(b.word),
  );
}

/**
 * Every word that touches a category, including the ones filed elsewhere.
 *
 * 먹다 lives in Food & Drink and is tagged Actions. Browsing Actions does not
 * show it — one word, one place — but searching does, which is the difference
 * between a structure and an index.
 */
export function wordsTagged(category: string): VocabularyWord[] {
  return VOCABULARY.filter((w) => w.category === category || w.category_tags.includes(category));
}

// --- Recommendations, not permissions ----------------------------------------

/**
 * Whether every letter this word needs is one the learner has already met.
 *
 * **This does not control access.** Every word in the curriculum is open from
 * the first launch: the app was bought outright, and making a customer finish
 * lesson four to look at a word in lesson five is a mechanic borrowed from
 * free-to-play games that had something to sell them. A learner who wants to
 * write 학교 today writes 학교 today.
 *
 * What it is for is *ordering*. It answers "is this one comfortable for you
 * right now", which is what the Words screen sorts and labels by and what the
 * home screen's suggestion is chosen with. The rule is per-word and
 * per-letter, not per-level: someone who knows the vowels and ㄱㄴㄷㄹㅁ can
 * write 나무 whatever band it was filed in.
 */
export function usesKnownLetters(word: VocabularyWord, knownLetters: ReadonlySet<string>): boolean {
  return word.required_jamo.every((jamo) => knownLetters.has(jamo));
}

/** The words the learner's letters already cover. A shortlist, not an allowlist. */
export function readableWords(knownLetters: ReadonlySet<string>): VocabularyWord[] {
  return VOCABULARY.filter((w) => usesKnownLetters(w, knownLetters));
}

/**
 * Letters in this word the learner has not met yet.
 *
 * Shown as a heads-up next to a word that is ahead of where they are — "ㅂ and
 * ㅍ are new here" is information, and it is the opposite of a padlock: it
 * tells them what they are taking on and then lets them take it on.
 */
export function newLetters(word: VocabularyWord, knownLetters: ReadonlySet<string>): string[] {
  return word.required_jamo.filter((jamo) => !knownLetters.has(jamo));
}

// --- Lessons -----------------------------------------------------------------

/**
 * Lessons group words into sessions short enough to finish in one sitting.
 *
 * A lesson has no stored title: "Set 3" is assembled by the UI from
 * `set_index`, so a new interface language gets correctly worded lesson names
 * without anyone re-exporting the curriculum.
 */
export const VOCABULARY_LESSONS: VocabularyLesson[] = CATEGORY_IDS.flatMap(
  (category, categoryIndex) => {
    const words = wordsByCategory(category);
    const chunks: VocabularyLesson[] = [];
    for (let i = 0; i < words.length; i += WORDS_PER_LESSON) {
      const slice = words.slice(i, i + WORDS_PER_LESSON);
      if (slice.length === 0) continue;
      const setIndex = i / WORDS_PER_LESSON + 1;
      chunks.push({
        id: `vocab-${category}-${setIndex}`,
        category,
        set_index: setIndex,
        subtitle: slice.map((w) => w.word).join(' · '),
        word_ids: slice.map((w) => w.id),
        sequence: categoryIndex * 1000 + setIndex,
      });
    }
    return chunks;
  },
);

const LESSONS_BY_CATEGORY = new Map<string, VocabularyLesson[]>();
for (const lesson of VOCABULARY_LESSONS) {
  const list = LESSONS_BY_CATEGORY.get(lesson.category);
  if (list) list.push(lesson);
  else LESSONS_BY_CATEGORY.set(lesson.category, [lesson]);
}

export function lessonsInCategory(category: string): VocabularyLesson[] {
  return LESSONS_BY_CATEGORY.get(category) ?? [];
}

/** Which study set a word is in. Every word is in exactly one. */
const LESSON_BY_WORD = new Map<string, string>();
for (const lesson of VOCABULARY_LESSONS) {
  for (const id of lesson.word_ids) LESSON_BY_WORD.set(id, lesson.id);
}

export function lessonForWord(wordId: string): string | undefined {
  return LESSON_BY_WORD.get(wordId);
}

/**
 * Finds words by their Korean or by what they mean.
 *
 * Both halves matter and the second one more: a beginner who cannot yet read
 * Hangul types "apple", not 사과, and a search that only matched the Korean
 * would be a search only for people who did not need it.
 *
 * Ranking is by where the match falls and then by the same score that orders a
 * category, so searching "eat" puts 먹다 above 잡아먹다.
 *
 * ## Why it is still a linear scan at ten thousand words
 *
 * Because the measurement says so. A scan is one pass over the corpus doing two
 * `String.includes` per row; at ten thousand rows that is well inside a frame
 * on a mid-range phone, and it is run against a *deferred* query so it never
 * blocks typing (see `WordsPage`). An inverted index would cost a second copy
 * of every headword and gloss in the bundle — hundreds of kilobytes a learner
 * downloads to speed up a screen that is already fast, and that most of them
 * will never open, because search is a secondary tool here and not the way in.
 *
 * The two things that *do* scale are already done: results are capped before
 * they reach the DOM, and nothing renders the corpus as a list.
 *
 * `meaningOf` is passed in rather than read here. The per-locale copy packs are
 * loaded through `import.meta.glob`, which exists only under Vite — and this
 * module is also imported by `scripts/export-curriculum.mjs` running in plain
 * Node. Taking the resolver as an argument keeps the data layer buildable
 * outside the bundler, and makes the ranking testable without a locale.
 */
export function searchWords(
  query: string,
  meaningOf: (word: VocabularyWord) => string,
  limit: number,
): Array<{ word: VocabularyWord; lessonId: string }> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const scored: Array<{ word: VocabularyWord; rank: number }> = [];
  for (const word of VOCABULARY) {
    const meaning = meaningOf(word).toLowerCase();
    let rank: number;
    if (word.word === needle || meaning === needle) rank = 0;
    else if (word.word.startsWith(needle) || meaning.startsWith(needle)) rank = 1;
    else if (word.word.includes(needle) || meaning.includes(needle)) rank = 2;
    else if (word.pronunciation.toLowerCase().includes(needle)) rank = 3;
    else continue;
    scored.push({ word, rank });
  }

  scored.sort(
    (a, b) => a.rank - b.rank || a.word.difficulty_score - b.word.difficulty_score,
  );

  return scored.slice(0, limit).map(({ word }) => ({
    word,
    lessonId: LESSON_BY_WORD.get(word.id) ?? VOCABULARY_LESSONS[0]!.id,
  }));
}

const LESSON_BY_ID = new Map(VOCABULARY_LESSONS.map((l) => [l.id, l]));

export function getVocabularyLesson(id: string): VocabularyLesson | undefined {
  return LESSON_BY_ID.get(id);
}

export function getLessonWords(lesson: VocabularyLesson): VocabularyWord[] {
  return lesson.word_ids.map((id) => BY_ID.get(id)).filter((w): w is VocabularyWord => !!w);
}

/** Every jamo any word in the curriculum needs. Used by the data tests. */
export const REQUIRED_JAMO: string[] = [
  ...new Set(VOCABULARY.flatMap((w) => w.required_jamo)),
].sort();
