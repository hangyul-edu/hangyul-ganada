/**
 * The Hangyul ganada domain, shared by the web app and mirrored by the API's
 * Pydantic schemas. Field names are snake_case where they cross the wire,
 * matching the API exactly, so there is no translation layer to drift.
 */

// --- Localization -----------------------------------------------------------

/**
 * A BCP-47 language tag, e.g. "en", "ko", "pt-BR".
 *
 * Deliberately not a union of the languages we happen to ship. The domain
 * accepts any valid tag; which ones have content is a data question, answered
 * by what is actually in the map.
 */
export type LocaleCode = string;

/**
 * Explanatory content in every locale it has been written for.
 *
 * `en` is required because English is the source language and the end of every
 * fallback chain — a record that cannot be read in English cannot be read at
 * all. Every other locale is optional, so adding Japanese means adding a `ja`
 * key to the data, never changing a type, a component or a query.
 *
 * Korean *target* content (the character, the word, the example sentence) is
 * never in here. It is the subject being taught, not text about it.
 */
export type LocalizedMap<T> = { en: T } & Partial<Record<LocaleCode, T>>;

// --- Pronunciation ----------------------------------------------------------

/**
 * Which of the two bundled Korean voices to play.
 *
 * Two, not a list: a learner choosing a pronunciation voice is choosing whose
 * mouth to imitate, and offering fifteen would be a worse product than offering
 * a clear female and a clear male reading of the same curriculum.
 */
export type VoiceGender = 'female' | 'male';

/**
 * What is being said, not just which file to fetch.
 *
 * Korean letters make this distinction load-bearing. ㄱ has a *name* (기역) and
 * a *sound* (a soft g), and they are different utterances: reading the bare
 * codepoint through a speech engine says the name, which is not what a learner
 * needs when sounding out 가. Every clip therefore declares its kind, and the
 * lesson asks for the one it means.
 */
export type PronunciationKind =
  /** The letter's Korean name, e.g. 기역 for ㄱ, 아 for ㅏ. */
  | 'letter_name'
  /** The letter's sound in a syllable, taught as the ㅏ-row syllable, e.g. 가. */
  | 'letter_sound'
  /** A whole syllable block, e.g. 가. */
  | 'syllable'
  /** A vocabulary word, e.g. 사과. */
  | 'word'
  /** A full example sentence. */
  | 'sentence';

/** One generated audio file. Paths are app-relative; nothing is hotlinked. */
export interface AudioAsset {
  /** Path under the app's public root, e.g. "audio/word/female/word_sagwa.mp3". */
  src: string;
  /** Milliseconds, measured from the encoded file rather than estimated. */
  duration_ms: number;
  bytes: number;
}

/**
 * A single pronounceable item, in both voices.
 *
 * `id` is a stable slug — never the Korean text, and never a filename derived
 * from it. Korean in a path survives a POSIX filesystem and then breaks on a
 * zip round-trip, a CDN that normalises Unicode, or an Android asset packer,
 * and the failure looks like "audio randomly missing for some words".
 */
export interface PronunciationEntry {
  id: string;
  /** Exactly the text that was spoken. QA compares this against the request. */
  text: string;
  kind: PronunciationKind;
  female: AudioAsset | null;
  male: AudioAsset | null;
}

/** The generated audio index, shipped with the app and loaded once. */
export interface PronunciationManifest {
  /** Bumped when the audio set is regenerated; used for cache busting. */
  version: string;
  generated_at: string;
  /** Which engine and which named voices produced these files. */
  provider: {
    id: string;
    female_voice: string;
    male_voice: string;
    format: string;
    notes: string;
  };
  entries: PronunciationEntry[];
}

// --- Curriculum: letters ----------------------------------------------------

/**
 * Hangul letter groups, in teaching order. Beginners learn the basic vowels
 * first because every syllable needs one and their shapes are the simplest.
 *
 * `final_consonant` is not a new set of letters — 받침 is a *position*, and the
 * letters in it have already been taught. It is its own group because reading a
 * letter at the bottom of a block is a genuinely separate skill from reading it
 * at the front, and because that is where a beginner's reading usually breaks.
 */
export type LetterGroup =
  | 'basic_vowel'
  | 'basic_consonant'
  | 'compound_vowel'
  | 'double_consonant'
  | 'syllable'
  | 'final_consonant';

/** What a letter sounds like and how to remember its shape, in one language. */
export interface CharacterTranslation {
  /** How the letter sounds, described in the reader's own language. */
  pronunciation_hint: string;
  /** A short memory hook shown before the first attempt. */
  mnemonic: string | null;
}

/**
 * One pen-down..pen-up movement of the *reference* way to write a character.
 *
 * The same shape as a learner's `Stroke` minus the pen width, and in the same
 * normalised 0..1 box, so the two can be compared directly rather than through
 * a conversion nobody would remember to keep correct.
 */
export interface StrokeStep {
  /** Ordered points, 0..1, top-left origin. Straight between consecutive pairs. */
  points: Array<{ x: number; y: number }>;
}

export interface HangulCharacter {
  id: string;
  /** The character itself, e.g. "ㄱ" or "가". Target content — never translated. */
  character: string;
  group: LetterGroup;
  /**
   * Revised Romanisation, e.g. "g/k". A transliteration of the Korean rather
   * than a translation of it, so it is the same in every UI language.
   */
  romanization: string;
  /** Ordering within the group. */
  sequence: number;
  /** Number of pen strokes. Always equal to `strokes.length`. */
  stroke_count: number;
  /**
   * How the character is written, stroke by stroke, in the standard order.
   *
   * Teaching material and nothing else: the app animates it, numbers it, and
   * tells a learner what they did differently. It never decides a pass.
   */
  strokes: StrokeStep[];
  /** For syllables: the jamo it decomposes into. Empty for single letters. */
  components: string[];
  /**
   * The letter's Korean name, e.g. 기역 for ㄱ. Null for syllable blocks, which
   * are read rather than named.
   */
  letter_name: string | null;
  /**
   * A syllable that demonstrates the letter's *sound* rather than its name —
   * 가 for ㄱ, 아 for ㅏ. This is what the "sound" speaker button plays.
   */
  sound_example: string | null;
  /** Pronunciation ids into the manifest. Absent means no clip was generated. */
  audio: {
    name?: string;
    sound?: string;
  };
  /** The explanatory text around the character, per locale. */
  translations: LocalizedMap<CharacterTranslation>;
}

export interface LetterLessonTranslation {
  title: string;
}

export interface LetterLesson {
  id: string;
  /**
   * The letters this lesson covers, e.g. "ㅏ ㅑ ㅓ ㅕ ㅗ". Target content, so it
   * reads identically in every language.
   */
  subtitle: string;
  group: LetterGroup;
  character_ids: string[];
  sequence: number;
  /** Which unit of the curriculum this lesson belongs to. */
  unit: number;
  /**
   * Letters the lesson assumes. A lesson is only offered once every one of
   * these has been introduced — which is the rule that stops a beginner being
   * asked to write 각 before they have met ㄱ.
   */
  prerequisites: string[];
  translations: LocalizedMap<LetterLessonTranslation>;
}

/**
 * A stage of the Hangul curriculum: a handful of lessons that belong together
 * and end somewhere worth arriving at.
 *
 * Units exist because "lesson 11 of 24" tells a learner nothing, while
 * "Unit 3 — your first syllables" tells them what they are about to be able to
 * do. Titles and blurbs are UI copy and live in `learning.json` under
 * `units.<id>.*`; only the structure is here.
 */
export interface CurriculumUnit {
  id: string;
  index: number;
  /** The letters or syllables this unit shows on its card. Target content. */
  preview: string;
  lesson_ids: string[];
  /**
   * A short explainer shown before the unit's first lesson — what Hangul is,
   * why syllables stack into blocks, what a 받침 does. Null when the unit needs
   * no framing.
   */
  has_intro: boolean;
  /**
   * The worked example the explainer draws, e.g. `ㄱ + ㅏ = 가`.
   *
   * Target content, so it lives here rather than in a translation bundle: it is
   * the Korean being taught and reads identically in every interface language.
   * Null when the unit has no explainer.
   */
  intro_diagram: string | null;
}

// --- Curriculum: vocabulary -------------------------------------------------

export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'numeral'
  | 'particle'
  | 'interjection'
  | 'determiner';

/**
 * Hangyul ganada's own learner difficulty, 1–8. **Not** a TOPIK level and not an
 * official dictionary grade — see `DifficultyExplanation.method` and
 * `docs/VOCABULARY_DATA.md`.
 *
 * Eight rather than the ten the first implementation used, and it is now the
 * *only* level a word has. The previous schema also carried a
 * `curriculum_level` derived from which letters a word contained, which meant
 * 맛있다 — a first-week word — was filed at level 10 because ㅆ is taught late.
 * Letter readiness is now `letters_ready_after`, and it is a note on the card
 * rather than a level.
 */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * How often the corpora actually saw a word.
 *
 * `observed: false` is a real state and is recorded rather than smoothed into
 * a mid-range default: a word the corpus never saw has no rank and no rate,
 * and saying so is the difference between evidence and a plausible number.
 */
export interface WordFrequency {
  observed: boolean;
  /** One of the bands declared by the generator, e.g. "common", "unobserved". */
  band: string;
  /** Rank among observed words in this dataset, 1 = most frequent. */
  rank: number | null;
  /** Occurrences per million tokens, averaged across the corpora. */
  rate: number | null;
}

/**
 * A word's meaning in one language.
 *
 * Modelled as its own record rather than as a `meaning` column so that adding
 * Japanese is adding a row, not altering a schema. `definition` and
 * `cultural_note` are optional because a good short gloss is often all a
 * beginner needs, and an empty string would be worse than an absent field.
 */
export interface VocabularyTranslation {
  /** The short gloss shown beside the word, e.g. "apple". */
  meaning: string;
  /** A fuller explanation, when the gloss alone would mislead. */
  definition?: string | null;
  /** The example sentence, rendered in this language. */
  example_translation?: string | null;
  /** Usage or cultural context a learner would otherwise miss. */
  cultural_note?: string | null;
}

/**
 * Where one field of a record came from.
 *
 * Kept per field rather than per record because a single word legitimately
 * mixes sources: its frequency rank from a corpus, its gloss from a dictionary,
 * its picture from an icon set, and its curriculum level from us. Collapsing
 * that into one `source` string is how a product ends up claiming a dictionary
 * supplied a number the dictionary never published.
 */
export interface SourceMetadata {
  /** Which fields on this record the entry accounts for, e.g. ["meaning"]. */
  fields: string[];
  /** Stable id of the dataset, e.g. "wiktionary-kaikki". */
  source_id: string;
  /** Human-readable name, shown in the provenance sheet. */
  source_name: string;
  /** SPDX id or licence name, e.g. "CC BY-SA 4.0". */
  license: string;
  license_url: string | null;
  /** Where in the source this came from — a URL, a headword, a rank. */
  reference: string | null;
  /**
   * True when the value is Hangyul ganada's own calculation rather than
   * something a source published. Nothing computed here is ever attributed to
   * an outside dataset.
   */
  derived: boolean;
}

export interface VocabularyWord {
  id: string;
  /** The Korean word. Target content — never translated. */
  word: string;
  /** Revised Romanisation of the spoken form. */
  pronunciation: string;
  part_of_speech: PartOfSpeech;
  /** The Korean example sentence. Target content. */
  example: string | null;
  /**
   * Meanings and example translations, per locale.
   *
   * Optional because the two consumers hold it differently. The API serves the
   * whole map — it answers for every language at once and has no download to
   * pay for. The web and native app does not: eight languages of glosses is
   * 696 KB, a learner reads one of them, so the app loads its own locale's copy
   * from a separate file and resolves through `useWordCopy` instead. Reading
   * this field in app code would silently work in tests and be `undefined` in
   * the product, so app code must not read it.
   */
  translations?: LocalizedMap<VocabularyTranslation>;
  /** What the corpora saw. **A statistic, not a level.** */
  frequency: WordFrequency;
  /** Hangyul ganada's own lexical-difficulty rating, 1–8. Not a TOPIK grade. */
  difficulty_level: DifficultyLevel;
  /** 0–1 raw score behind `difficulty_level`. Decides order within a level. */
  difficulty_score: number;
  /**
   * Which feature made this word harder than an average word in the set — one
   * of the generator's `difficulty_reasons`. The UI turns it into a sentence.
   */
  difficulty_reason: string;
  /** 1 (a beginner needs it in week one) to 5 (advanced). Editorial. */
  usefulness: number;
  /**
   * The one category a learner browses this word under.
   *
   * The browsing structure, and the reason the vocabulary is no longer sorted
   * into numbered levels: "Animals" is a place a learner can decide to go, and
   * "Level 5" is not. Exactly one, always — a word in two places is a word a
   * learner finds twice and finishes neither.
   */
  category: string;
  /**
   * The other categories this word plausibly belongs to.
   *
   * Used by search and recommendations, never by the browsing structure. 먹다 is
   * filed under Food & Drink and also tagged Actions, so a learner searching for
   * verbs finds it without Food & Drink and Actions both claiming to own it.
   */
  category_tags: string[];
  /** The syllables the learner writes, e.g. ["사", "과"]. */
  syllables: string[];
  /**
   * Every distinct jamo in the word, in the order the alphabet curriculum
   * introduces them.
   */
  required_jamo: string[];
  /**
   * How far through the letter curriculum a learner must be before every
   * letter in this word has been introduced.
   *
   * **This does not gate anything.** Every word is open from first launch; the
   * app uses this only to say "this word uses 2 letters you haven't met yet".
   */
  letters_ready_after: number;
  /**
   * How the word is actually said, when that differs from how it is written.
   *
   * Null for most words. Korean spelling writes the pieces a word is made of
   * and leaves the reader to apply the changes that happen where they meet, so
   * 학교 is written with ㄱ and said with ㄲ — and a beginner reading it aloud
   * as *hak-gyo* is doing exactly what they were taught. `sound_pattern` names
   * which change it is, from a closed list, so the app can explain the pattern
   * rather than the instance. See `scripts/content/pronunciation.py`.
   */
  spoken: string | null;
  sound_pattern: string | null;
  /**
   * The form the example sentence writes this word in, when it inflects.
   *
   * 먹다's sentence says 먹어요. Verbs and adjectives only: a noun's "different
   * form" is just a particle, and flagging that would put a note on every card.
   */
  surface_form: string | null;
  /** Pronunciation ids into the manifest. */
  audio: {
    word?: string;
    example?: string;
  };
  sources: SourceMetadata[];
}

export interface VocabularyLesson {
  id: string;
  /** Which category this set belongs to. */
  category: string;
  /** Position within its category, 1-based. */
  set_index: number;
  /** The Korean words in the set, e.g. "물 · 밥 · 집". Target content. */
  subtitle: string;
  word_ids: string[];
  sequence: number;
}

/**
 * A vocabulary category, as the Words screen shows it.
 *
 * The name is UI copy and lives in the translation bundles under
 * `vocabulary.categories.<id>`; this record is the structure. Levels used to be
 * here and are not any more — see `scripts/content/categories.py` for why a
 * number was the wrong thing to show a learner.
 */
export interface VocabularyCategory {
  id: string;
  /** Position in the picker. Roughly "what a beginner wants first". */
  order: number;
  word_count: number;
  /**
   * The letters the words in this category between them need.
   *
   * Advisory only. It is what the Words screen uses to say which letters in a
   * category a learner has not met yet; nothing anywhere refuses access on it.
   */
  required_jamo: string[];
}

// --- Typefaces --------------------------------------------------------------

/**
 * The Korean writing styles a learner would actually name.
 *
 * These are style families, not font vendors: 명조체 is a category a Korean
 * reader recognises on sight, and the picker is built out of them so a learner
 * chooses "the shapes I see in books" rather than a typeface they have never
 * heard of. `traditional` is the brush-written lineage 궁서체 belongs to.
 */
export type TypefaceCategory = 'sans' | 'serif' | 'traditional' | 'handwriting' | 'rounded';

/**
 * Grading parameters a typeface may override.
 *
 * Structural rather than imported from the handwriting package, so the domain
 * types stay free of it; the evaluator merges these over its own defaults. Only
 * the two knobs a *typeface* has any business moving are here — how much
 * geometric slack a stroke gets, and where the pass bar sits — because those
 * are the two that decorative glyph detail actually affects.
 */
export interface TypefaceEvaluationProfile {
  /**
   * Free-slack radius around the reference glyph, as a fraction of the writing
   * box. A heavier or more decorated face needs more of it: the learner writes
   * one line down the middle of a stroke the face draws three times as thick.
   */
  glyph_tolerance_ratio?: number;
  /** Combined-mismatch pass bar for this face. */
  max_mismatch_ratio?: number;
}

export interface PracticeFont {
  id: string;
  /**
   * The Korean name of the *style*, e.g. 명조체 — what the picker shows in
   * Korean. A proper noun: shown as-is rather than translated.
   */
  name: string;
  /**
   * The English label for that style, e.g. "Myeongjo". Plain enough for a
   * learner who has never met Korean typography terminology.
   */
  name_en: string;
  /** The typeface's own name, e.g. "Nanum Myeongjo". Shown with the licence. */
  family_name: string;
  /** CSS font-family stack. Drives both the on-screen glyph and the mask. */
  font_family: string;
  category: TypefaceCategory;
  weight: number;
  license: string;
  /**
   * The licence's common abbreviation, e.g. "OFL 1.1".
   *
   * Carried rather than derived: the picker has room for a short label beside
   * the family name and none for "SIL Open Font License 1.1", and shortening a
   * licence name with string surgery in a component is how a licence ends up
   * misquoted. The full name stays in `license`, which is what the audit and
   * the Sources screen read.
   */
  license_short: string;
  license_url: string | null;
  /** Foundry or designer, and the package the files come from. */
  source: string;
  /** Where the files are published, for the licence audit. */
  source_url: string | null;
  /**
   * Whether the font files ship inside the app.
   *
   * Always true today, and the field exists so it stays a decision rather than
   * an assumption: a face that could only be linked from a CDN would break the
   * offline promise, and one that may not legally be redistributed must never
   * be bundled at all.
   */
  bundled: boolean;
  /** Grading slack for this face. Absent means the evaluator's defaults. */
  evaluation?: TypefaceEvaluationProfile;
  /** Short note on what practising in this face teaches, per locale. */
  translations: LocalizedMap<{ description: string }>;
}

// --- Learning sessions and attempts -----------------------------------------

/**
 * Which guide was on the paper when an attempt was graded.
 *
 * Both values mean the character was visible — `practice` is the lighter guide,
 * not the absence of one. The distinction is still worth recording because
 * writing over a plain shape and writing over a faint one are different acts,
 * and mastery asks for one of each.
 *
 * The old third meaning of this field — an unguided attempt on a blank box —
 * has been removed from the product. Rows written by earlier builds are
 * migrated in `storage/schema.ts`; nothing in the running app can produce one.
 */
export type PracticeMode = 'trace' | 'practice';

/**
 * How much scaffolding a learner wants, as a setting.
 *
 * Never a difficulty switch. `focused` skips the full-guide tracing step for
 * someone who finds it slow and goes straight to the lighter guide — which is
 * still a guide. No setting in the product can produce an empty writing box.
 */
export type PracticeStyle = 'guided' | 'focused';

/**
 * Which appearance the learner asked for.
 *
 * `system` is the default and is not the same as either of the others: it means
 * "whatever the phone is doing", and it keeps following the phone when that
 * changes. Choosing Light explicitly has to survive sunset.
 */
export type Appearance = 'system' | 'light' | 'dark';
export type SessionKind = 'letters' | 'vocabulary' | 'review';

export interface AttemptScore {
  passed: boolean;
  score: number;
  mismatch_ratio: number;
  outside_stroke_ratio: number;
  missing_coverage_ratio: number;
  reason: 'empty' | 'outside' | 'incomplete' | 'mixed' | null;
}

export interface CharacterAttempt extends AttemptScore {
  id: string;
  session_id: string;
  /** The character that was being practised. */
  character: string;
  /** Set when the attempt was one syllable of a vocabulary word. */
  word_id: string | null;
  font_id: string;
  mode: PracticeMode;
  /** Which evaluator produced this, e.g. "geometry-v1". Kept for re-scoring. */
  evaluator_id: string;
  created_at: string;
}

export interface LearningSession {
  id: string;
  kind: SessionKind;
  lesson_id: string | null;
  started_at: string;
  completed_at: string | null;
  /** Items the learner set out to complete. */
  target_count: number;
  /** Items passed so far. */
  passed_count: number;
  attempt_count: number;
}

// --- Learning activity ------------------------------------------------------

/** What a progress row is about. Shared by `ItemProgress` and the activity log. */
export type ItemKind = 'character' | 'word';

/**
 * What a learner did, in one local calendar day.
 *
 * ## Why a daily roll-up and not an event log
 *
 * The Activity screen needs to answer questions about *time*: how consistent
 * has this learner been, what did they do on the 14th, is this week better than
 * last. `ItemProgress` cannot answer any of them — it knows a character was
 * learned but keeps only the latest timestamp, so a year of practice collapses
 * into one date per item.
 *
 * The obvious fix is an append-only event log, and it is the wrong one for a
 * device-local store with no server to offload to: a learner practising twenty
 * minutes a day writes tens of thousands of rows a year, and every analytics
 * read has to scan all of them. Every question the screen asks is a *daily*
 * question, so the day is the row. One record per day the app was used, bounded
 * and pre-aggregated, and a decade of daily practice is under four thousand
 * rows.
 *
 * What that trades away is honest to state: the order of events within a day,
 * and any question narrower than a day. Neither is asked, and if one ever is,
 * this shape is a summary that a finer log could be rebuilt beside rather than
 * inside.
 */
export interface DailyActivity {
  /** Local calendar day, `YYYY-MM-DD`. Also the storage key. */
  date: string;
  /** ISO timestamps of the first and last recorded events that day. */
  first_at: string;
  last_at: string;
  /**
   * Time actually spent practising, in milliseconds.
   *
   * Summed from the gaps between consecutive events, with each gap capped —
   * see `IDLE_GAP_MS` in `domain/activity.ts`. A learner who leaves the app open
   * over lunch has not studied for three hours, and a figure that says they
   * have is worse than no figure.
   */
  active_ms: number;
  /** Writing attempts checked, and how many passed. */
  attempts: number;
  passes: number;
  /** Items that reached `learned` on this day. */
  characters_learned: number;
  words_learned: number;
  /** Attempts made inside a review session. */
  reviews: number;
  /**
   * Attempts per item key, for "most practised" — capped at
   * `MAX_ITEMS_PER_DAY` so one very long day cannot grow without bound.
   */
  items: Record<string, number>;
}

/** What kind of thing happened, for `recordActivity`. */
export type ActivityEvent =
  | { type: 'attempt'; itemKey: string; kind: ItemKind; passed: boolean; review: boolean }
  | { type: 'completed'; kind: ItemKind };

// --- Progress ---------------------------------------------------------------

/**
 * How far a learner has got with one item.
 *
 * Opening a screen is not learning, so `introduced` is where an item starts and
 * not where it ends. The stages ratchet forward in this order and never go
 * backwards — a letter you once wrote correctly is a letter you once wrote
 * correctly, even on a day you get it wrong. Getting it wrong sets
 * `needs_review` instead, which is a *current* state rather than a demotion.
 */
export type MasteryStage = 'unseen' | 'introduced' | 'traced' | 'practised' | 'learned';

export const MASTERY_ORDER: readonly MasteryStage[] = [
  'unseen',
  'introduced',
  'traced',
  'practised',
  'learned',
] as const;

/** Per-item mastery. One row per character or word the learner has met. */
export interface ItemProgress {
  /** Character, or word id for vocabulary. */
  item_key: string;
  kind: ItemKind;
  stage: MasteryStage;
  attempts: number;
  passes: number;
  fails: number;
  /** Passes made over the full guide. */
  trace_passes: number;
  /** Passes made over the lighter guide — the second, harder rung. */
  practice_passes: number;
  /** True once the learner has watched the character being written. */
  demo_seen: boolean;
  /** Times the item was picked correctly out of a set of look-alikes. */
  recognition_passes: number;
  /** True once the learner has played the pronunciation at least once. */
  heard: boolean;
  /** Convenience mirror of `stage === 'learned'`. Kept for progress maths. */
  learned: boolean;
  needs_review: boolean;
  last_score: number | null;
  first_seen_at: string | null;
  last_attempted_at: string | null;
  learned_at: string | null;
  /** When this item should resurface in Review. Null when it is not due. */
  review_due_at: string | null;
}

export interface ProgressSummary {
  /** Distinct letters and syllables that reached `learned`. */
  characters_learned: number;
  characters_total: number;
  /** Letters only — the figure the curriculum bar reports. */
  letters_learned: number;
  letters_total: number;
  words_learned: number;
  words_total: number;
  /**
   * Words made only of letters the learner has already met.
   *
   * A recommendation figure. Every word in the curriculum is accessible from
   * the first launch, so this is never a permission — it is how much of the
   * vocabulary is comfortable right now.
   */
  words_available: number;
  review_items: number;
  review_due: number;
  total_attempts: number;
  total_passes: number;
  sessions_completed: number;
  /** Items that reached `learned` today, against the learner's daily target. */
  today_completed: number;
  daily_target: number;
  /** Consecutive days ending today (or yesterday) with at least one item learned. */
  streak_days: number;
  selected_font_id: string;
}

// --- Learner preferences ----------------------------------------------------

export interface LearnerPreferences {
  selected_font_id: string;
  /** How much scaffolding to offer. Never removes the guide entirely. */
  practice_style: PracticeStyle;
  /** Light, dark, or whatever the device is doing. */
  appearance: Appearance;
  daily_target: number;
  /** Guides drawn inside the writing box. */
  show_grid: boolean;
  show_center_crosshair: boolean;
  /** Which bundled Korean voice pronounces letters, syllables and words. */
  voice: VoiceGender;
  /**
   * Legacy. Retained so no stored profile has to be migrated; read by nothing.
   *
   * It used to switch off the clip that plays when a new item appears. The
   * setting had one outcome nobody wanted: a learner who had turned it off — on
   * a bus, months earlier — arrived at "which letter makes this sound?" in
   * silence, with the question undelivered and no indication that a button was
   * the prompt. Audio on the screens that depend on it is now unconditional,
   * and the replay button is how a learner asks to hear it again.
   *
   * The field is still written with its old default so that a downgrade to an
   * older build finds the value it expects. See `audio/useEntryAudio.ts`.
   */
  autoplay_audio: boolean;
  /**
   * The learner's chosen interface language, as a BCP-47 tag.
   *
   * `null` means "never chosen", which is not the same as "English": it is what
   * lets the app tell a deliberate choice of English from having no preference
   * at all, and it is the first rule in the locale precedence chain.
   */
  locale: LocaleCode | null;
}

// --- API envelopes ----------------------------------------------------------

export interface AppConfig {
  product_name: string;
  api_version: string;
  /** Mirrors MAX_MISMATCH_RATIO so the client never hard-codes the rule. */
  max_mismatch_ratio: number;
  /** The source language and the end of every fallback chain. */
  default_locale: LocaleCode;
  /** Locales the API has content for. Advisory: any valid tag is accepted. */
  available_locales: LocaleCode[];
}

export interface CreateSessionRequest {
  kind: SessionKind;
  lesson_id?: string | null;
  target_count: number;
}

export interface RecordAttemptRequest {
  session_id: string;
  character: string;
  word_id?: string | null;
  font_id: string;
  mode: PracticeMode;
  evaluator_id: string;
  passed: boolean;
  score: number;
  mismatch_ratio: number;
  outside_stroke_ratio: number;
  missing_coverage_ratio: number;
  reason: AttemptScore['reason'];
}

export interface ApiError {
  detail: string;
  code?: string;
}
