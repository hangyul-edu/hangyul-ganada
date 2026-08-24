import type {
  SourceMetadata,
  VocabularyCategory,
  VocabularyLesson,
  VocabularyWord,
} from '@hangyul-ganada/shared-types';

import { corpusReady, corpusTotal, onCorpus, type CorpusRow, type CorpusTables } from './corpus';
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
 * ## How it gets here
 *
 * It is **fetched**, not imported. `scripts/content/split_corpus.py` cuts the
 * generated file into bands under `public/corpus/`, and `data/corpus.ts`
 * fetches them: the first band before the app renders, the rest in the
 * background afterwards. This module subscribes to that and keeps a live
 * picture of whatever has arrived.
 *
 * What that means for a reader of this file: **every export below is live.**
 * `VOCABULARY` is one array that grows; the maps and the lesson list are
 * rebuilt in place as bands land. Nothing rebinds, so a consumer that imported
 * `VOCABULARY` once sees the corpus fill in without doing anything — and a
 * consumer that renders from it should subscribe with `useCorpus()` so it
 * re-renders when that happens.
 *
 * The one number that is *not* derived from what has arrived is the total:
 * `corpusTotal()` reads the manifest, so "12 of 2,581" is right from the first
 * frame rather than climbing as the download proceeds.
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
  romanization: string;
  part_of_speech: VocabularyWord['part_of_speech'];
  example: string;
  /** `[band index into tables.frequency_bands, rank, rate]`. */
  f: [number, number | null, number | null];
  difficulty_score: number;
  difficulty_level: number;
  /** The 1–30 Vocabulary Level. See `scripts/content/level.py`. */
  level: number;
  /** The four components behind it, for QA. Never rendered. */
  lv: [number, number, number, number];
  /** Index into `tables.difficulty_reasons`. */
  r: number;
  usefulness: number;
  /** Index into `tables.categories` — the one category a learner browses it under. */
  c: number;
  /** Indices into `tables.categories` for the other categories it touches. */
  ct: number[];
  letters_ready_after: number;
  /**
   * The letters this word needs, as a bitmask over `tables.letter_order`.
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

/**
 * The shared tables, filled when the corpus core lands.
 *
 * Mutated in place rather than reassigned, for the same reason `VOCABULARY` is:
 * `CONTENT_SOURCES` and friends are exported references, and a screen holding
 * one must see it fill rather than keep pointing at an empty array.
 */
let letterOrder: string[] = [];
let difficultyReasons: string[] = [];
let fieldSets: string[][] = [];

/** The datasets behind the curriculum, for the Content sources screen. */
export const CONTENT_SOURCES: ContentSourceRecord[] = [];

/** How many words a study set holds. Zero until the corpus core arrives. */
export function wordsPerLesson(): number {
  return wordsPerLessonValue;
}
let wordsPerLessonValue = 0;

/**
 * The generator that produced this dataset.
 *
 * Recorded so a word's numbers can be traced to the code that computed them —
 * a level assigned by v1 is not comparable to one assigned by a later model,
 * and pretending otherwise is how a "level 3" quietly changes meaning between
 * releases.
 */
export const VOCABULARY_PROVENANCE: { generator: string; readonly isOfficial: false } = {
  generator: '',
  /**
   * False, and deliberately so: nothing in this dataset is an official grading
   * of any kind. The UI copy that says so lives in the translation bundles;
   * this is the machine-readable half that cannot be lost in translation.
   */
  isOfficial: false,
};

/** How many difficulty levels this dataset was binned into. */
export function difficultyLevels(): number {
  return difficultyLevelCount;
}
let difficultyLevelCount = 0;

/** The frequency bands the generator can emit, most to least common. */
export const FREQUENCY_BANDS: string[] = [];

/**
 * The sound-change patterns a word can be tagged with.
 *
 * Closed, and exported so the tests can assert that every one of them has copy
 * in every language — a pattern that reaches a learner without an explanation
 * is a panel that says a word is pronounced differently and does not say why.
 */
export const SOUND_PATTERNS: string[] = [];

/**
 * The patterns a *word card* may show a pronunciation note for.
 *
 * A subset of `SOUND_PATTERNS`, and the difference is liaison. It is real, it
 * is the first thing a Korean teacher explains, and it applies to so many words
 * that a note for it would put a panel on hundreds of cards — at which point
 * the panel stops meaning "look at this one". So it is taught once, on the
 * sound-change lesson, which shows every pattern.
 *
 * Decided in `scripts/content/pronunciation.py` and published in the tables, so
 * the judgement is written down in one place rather than twice.
 */
export const NOTED_SOUND_PATTERNS: string[] = [];

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
    const source = CONTENT_SOURCES[sourceIndex]!;
    const template = source.reference_template;
    const reference = template
      ? template
          .replace('{word}', encodeURIComponent(row.word))
          .replace('{frequency_rank}', String(row.f[1] ?? ''))
      : null;
    return {
      fields: fieldSets[fieldsIndex] ?? [],
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
  letterOrder.forEach((letter, index) => {
    // `2 ** index` rather than `1 << index`: the alphabet is 40 letters and
    // JavaScript's bitwise operators truncate to 32 bits, which would silently
    // drop every letter from ㅚ onwards.
    if (Math.floor(mask / 2 ** index) % 2 === 1) out.push(letter);
  });
  return out;
}

/**
 * Every word that has arrived, **in the order a learner should meet them**.
 *
 * The order is not an accident of the file and it is not sorted here. The
 * generator cuts the bands on exactly the blend `difficulty_score` encodes —
 * corpus frequency, editorial usefulness, concreteness, how early the spelling
 * is reachable — so band 1 is the first words a beginner needs, band 2 the next
 * ones, and appending a band keeps the whole array sorted. See
 * `vocabularyByPriority`, and `split_corpus.py` for the cut.
 *
 * That property is what makes a partly-loaded corpus coherent rather than
 * merely incomplete: it is always a *prefix* of the curriculum, never a random
 * subset of it, and every list built from it — a category, a lesson, the daily
 * plan — grows at the end instead of being reshuffled.
 */
export const VOCABULARY: VocabularyWord[] = [];

const BY_ID = new Map<string, VocabularyWord>();
const BY_HEADWORD = new Map<string, VocabularyWord>();

export function getWord(id: string): VocabularyWord | undefined {
  return BY_ID.get(id);
}

/**
 * The taught card for a Korean spelling, if the app teaches one.
 *
 * Used to keep the two corpora from showing the same word twice: a dictionary
 * link for a word that turns out to be on the syllabus redirects to the card
 * that has the recording and the hand-written meaning. Headwords are unique in
 * the corpus — `senseId` exists precisely so that one spelling means one taught
 * sense — so this map has no collisions to resolve.
 */
export function findWordByHeadword(headword: string): VocabularyWord | undefined {
  return BY_HEADWORD.get(headword);
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
 * There is no sort here any more, at any size. The order is the order the
 * bands arrive in, decided once by the generator, so a launch costs nothing
 * and a corpus ten times this one costs nothing. The daily session takes a
 * prefix — `buildDailyPlan` stops as soon as it has enough — which is also why
 * a session works perfectly on band 1 alone.
 */
export function vocabularyByPriority(): readonly VocabularyWord[] {
  return VOCABULARY;
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
export const VOCABULARY_CATEGORIES: VocabularyCategory[] = [];

export const CATEGORY_IDS: string[] = [];

/** Words filed under a category, kept in priority order as bands arrive. */
const BY_CATEGORY = new Map<string, VocabularyWord[]>();

/**
 * The words in a category, most useful first.
 *
 * "First" means "the one a beginner is most likely to want and most likely to
 * manage", not "the one that sorts first in Korean" — it is the priority order
 * of `VOCABULARY`, narrowed. Animals opens on 개, 새, 고양이.
 */
export function wordsByCategory(category: string): VocabularyWord[] {
  return [...(BY_CATEGORY.get(category) ?? [])];
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
 *
 * ## Why a lesson does not change when a band arrives
 *
 * A set is a chunk of a category in priority order, and a band only ever
 * *appends* to a category (see `VOCABULARY`). So `vocab-food-1` holds the same
 * five words whether one band has arrived or all of them, and the list grows a
 * set at a time at the end. If bands were cut on anything other than the
 * ordering the sets use, this would not be true and a learner's half-finished
 * set could quietly become a different five words.
 */
export const VOCABULARY_LESSONS: VocabularyLesson[] = [];

const LESSONS_BY_CATEGORY = new Map<string, VocabularyLesson[]>();

export function lessonsInCategory(category: string): VocabularyLesson[] {
  return LESSONS_BY_CATEGORY.get(category) ?? [];
}

/** Which study set a word is in. Every word is in exactly one. */
const LESSON_BY_WORD = new Map<string, string>();

export function lessonForWord(wordId: string): string | undefined {
  return LESSON_BY_WORD.get(wordId);
}

const LESSON_BY_ID = new Map<string, VocabularyLesson>();

export function getVocabularyLesson(id: string): VocabularyLesson | undefined {
  return LESSON_BY_ID.get(id);
}

export function getLessonWords(lesson: VocabularyLesson): VocabularyWord[] {
  return lesson.word_ids.map((id) => BY_ID.get(id)).filter((w): w is VocabularyWord => !!w);
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
 * ## What it searches
 *
 * What has arrived. This is one of the two places a partly-loaded corpus is
 * visible to a learner — a word in band 4 cannot be found before band 4 lands —
 * so `WordsPage` says the corpus is still arriving rather than reporting "no
 * results" for a word the product certainly teaches. `corpusReady()` is how it
 * knows.
 *
 * `meaningOf` is passed in rather than read here. The per-locale copy packs are
 * loaded by `wordCopy`, and this module is also imported by
 * `scripts/export-curriculum.mjs` running in plain Node. Taking the resolver as
 * an argument keeps the data layer buildable outside the bundler, and makes the
 * ranking testable without a locale.
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
    else if (word.romanization.toLowerCase().includes(needle)) rank = 3;
    else continue;
    scored.push({ word, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.word.difficulty_score - b.word.difficulty_score);

  return scored.slice(0, limit).map(({ word }) => ({
    word,
    lessonId: LESSON_BY_WORD.get(word.id) ?? VOCABULARY_LESSONS[0]!.id,
  }));
}

/** Every jamo any word in the curriculum needs. Used by the data tests. */
export const REQUIRED_JAMO: string[] = [];

/**
 * Every headword in the curriculum, loaded or not.
 *
 * Re-exported from `corpus` so that a screen showing "x of y words" does not
 * have to know that the corpus arrives in pieces — and so that the denominator
 * is never `VOCABULARY.length`, which would be a number that climbs while the
 * learner watches.
 */
export { corpusTotal, corpusReady };

// --- Filling it in -------------------------------------------------------------

function installTables(tables: CorpusTables): void {
  letterOrder = tables.letter_order;
  difficultyReasons = tables.difficulty_reasons;
  fieldSets = tables.field_sets;
  wordsPerLessonValue = tables.words_per_lesson;
  difficultyLevelCount = tables.levels;
  VOCABULARY_PROVENANCE.generator = tables.generator;
  CONTENT_SOURCES.push(...(tables.sources as unknown as ContentSourceRecord[]));
  FREQUENCY_BANDS.push(...tables.frequency_bands);
  SOUND_PATTERNS.push(...tables.sound_patterns);
  NOTED_SOUND_PATTERNS.push(...(tables.noted_patterns ?? tables.sound_patterns));
  CATEGORY_IDS.push(...tables.categories);
  for (const [index, id] of tables.categories.entries()) {
    BY_CATEGORY.set(id, []);
    VOCABULARY_CATEGORIES.push({ id, order: index + 1, word_count: 0, required_jamo: [] });
  }
}

function toWord(row: GeneratedWord): VocabularyWord {
  return {
    id: row.id,
    word: row.word,
    romanization: row.romanization,
    part_of_speech: row.part_of_speech,
    example: row.example,
    frequency: {
      observed: row.f[1] !== null,
      band: FREQUENCY_BANDS[row.f[0]]!,
      rank: row.f[1],
      rate: row.f[2],
    } as VocabularyWord['frequency'],
    level: row.level,
    difficulty_level: row.difficulty_level as VocabularyWord['difficulty_level'],
    difficulty_score: row.difficulty_score,
    difficulty_reason: difficultyReasons[row.r]!,
    usefulness: row.usefulness,
    category: CATEGORY_IDS[row.c]!,
    category_tags: row.ct.map((index) => CATEGORY_IDS[index]!),
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
}

const jamoSeen = new Set<string>();

/**
 * Folds one band into every derived structure.
 *
 * Appends rather than rebuilds, which is what the priority-ordered cut buys:
 * no list is re-sorted, no lesson is renumbered, and nothing a learner is
 * looking at moves under them. The only work proportional to the band is the
 * band itself.
 */
function installBand(band: { words: CorpusRow[] }): void {
  const category = new Map<string, VocabularyWord[]>();

  for (const raw of band.words) {
    const word = toWord(raw as unknown as GeneratedWord);
    VOCABULARY.push(word);
    BY_ID.set(word.id, word);
    BY_HEADWORD.set(word.word, word);
    for (const jamo of word.required_jamo) jamoSeen.add(jamo);

    const list = BY_CATEGORY.get(word.category);
    if (list) list.push(word);
    const fresh = category.get(word.category);
    if (fresh) fresh.push(word);
    else category.set(word.category, [word]);
  }

  REQUIRED_JAMO.length = 0;
  REQUIRED_JAMO.push(...[...jamoSeen].sort());

  for (const entry of VOCABULARY_CATEGORIES) {
    const words = BY_CATEGORY.get(entry.id) ?? [];
    entry.word_count = words.length;
    entry.required_jamo = [...new Set(words.flatMap((w) => w.required_jamo))];
  }

  // New sets, appended. A category whose last set was short is completed first,
  // so a learner never ends up with two half-full sets in a row.
  for (const [id, words] of BY_CATEGORY) {
    if (!category.has(id)) continue;
    const categoryIndex = CATEGORY_IDS.indexOf(id);
    const sets = LESSONS_BY_CATEGORY.get(id) ?? [];
    LESSONS_BY_CATEGORY.set(id, sets);

    for (let i = 0; i < words.length; i += wordsPerLessonValue) {
      const slice = words.slice(i, i + wordsPerLessonValue);
      const setIndex = i / wordsPerLessonValue + 1;
      const lesson: VocabularyLesson = {
        id: `vocab-${id}-${setIndex}`,
        category: id,
        set_index: setIndex,
        subtitle: slice.map((w) => w.word).join(' · '),
        word_ids: slice.map((w) => w.id),
        sequence: categoryIndex * 1000 + setIndex,
      };
      const existing = sets[setIndex - 1];
      if (existing) {
        // Only the last set of a category can grow, and only by being filled up.
        if (existing.word_ids.length === lesson.word_ids.length) continue;
        Object.assign(existing, lesson);
      } else {
        sets.push(lesson);
        VOCABULARY_LESSONS.push(lesson);
        LESSON_BY_ID.set(lesson.id, lesson);
      }
      for (const wordId of lesson.word_ids) LESSON_BY_WORD.set(wordId, lesson.id);
    }
  }

  VOCABULARY_LESSONS.sort((a, b) => a.sequence - b.sequence);
}

onCorpus({ tables: installTables, band: installBand });
