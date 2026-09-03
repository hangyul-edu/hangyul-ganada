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
  /**
   * The stroke's exact geometry, when it is not simply the polyline above.
   *
   * `points` is a *sample* of the stroke: enough of it to measure a length, place
   * a numbered marker, and compare against what a learner drew. That is all any
   * of those jobs need, and for a stroke made of straight lines it is also the
   * whole truth.
   *
   * It is not the whole truth for a curve. ㅇ sampled as a polyline is a
   * 48-sided polygon, and a 48-sided polygon drawn at the size a lesson shows it
   * is a visible polygon — which is exactly what a learner reported seeing. So a
   * curved stroke also carries the curve itself, as cubic segments, and the
   * renderer draws *this* when it is present.
   *
   * Both live in the same normalised box and are transformed by the same
   * per-axis scale and offset in `compose.ts`, which maps a cubic exactly. A
   * circle fitted into a slot is therefore a true ellipse, not a squashed
   * polygon.
   */
  curve?: CurveSegment[];
  /**
   * What happens at each end of the stroke.
   *
   * `free` is an end the pen lifts from in open paper — it gets a terminal.
   * `join` is an end that lands on another stroke's centreline, where a terminal
   * would be swallowed by that stroke's own ink and must not extend past it.
   *
   * This is the difference between ㅅ's two strokes meeting cleanly and ㅅ's
   * first stroke growing a spur into the second one's territory. Defaults to
   * `free` at both ends.
   */
  ends?: { start?: StrokeEnd; end?: StrokeEnd };
}

/** How a stroke terminates at one of its ends. See `StrokeStep.ends`. */
export type StrokeEnd = 'free' | 'join';

/**
 * One cubic segment of a stroke's exact geometry, in the same 0..1 box as
 * `StrokeStep.points`. `c1`/`c2` are the control points; the segment starts at
 * the previous segment's `to`, or at `points[0]` for the first.
 */
export interface CurveSegment {
  c1: { x: number; y: number };
  c2: { x: number; y: number };
  to: { x: number; y: number };
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

/**
 * One thing the Numbers curriculum teaches: a numeral, a counter, or a phrase.
 *
 * ## Why the Korean is data and the meaning is a key
 *
 * `korean` and `reading` are the subject being taught. They are identical in
 * every interface language, exactly as a letter's `character` is, and putting
 * them in translation bundles would be thirty-two copies of the same Korean
 * waiting to disagree.
 *
 * `gloss` is a *key* into the `numbers` namespace rather than a string, because
 * what a counter means — "people", "flat things", "years old" — is the part a
 * learner needs in their own language, and it is the part that must never fall
 * back to English inside an otherwise translated question. A key that is
 * missing fails `i18n:check`; an English string sitting in a Thai bundle does
 * not.
 */
/**
 * Numbers progress — the derived status a lesson can be in.
 *
 * `available` is unlocked and never opened; `not_started` is opened and
 * nothing done; the rest follow from the evidence in `NumbersLessonProgress`.
 * Only `completed`, `mastered` and `review_due` may be drawn as finished.
 */
/**
 * What a Numbers lesson is, for the learner reading the list.
 *
 * There is no `locked`. There used to be, and it was wrong for this subject:
 * the course teaches how to say numbers, and a learner who wants to know how to
 * say their own age should be able to go and find out. The old rule made
 * *hours* depend on *counting forms*, on the reasoning that 두 시 is
 * unexplainable without them — which is a good reason to put counting forms
 * first and a bad reason to bar the door. The order is still there, as a
 * recommendation and a Continue button; it is no longer a gate.
 *
 * `available` and `not_started` are kept apart from `in_progress` deliberately.
 * Unlocking a lesson must never be mistaken for having done any of it — see
 * `domain/numbersProgress`, where completion is derived from evidence and from
 * nothing else.
 */
export type NumbersLessonStatus =
  | 'available'
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'mastered'
  | 'review_due';

/** The events a Numbers lesson records. Distinct from progress: an event is a fact, a status is derived. */
export type NumbersEvent =
  | { type: 'lesson_opened' }
  | { type: 'explanation_viewed'; step: string }
  | { type: 'example_viewed'; item_id: string }
  | {
      type: 'exercise_attempted';
      exercise_id: string;
      item_id: string;
      correct: boolean;
      phase: 'practice' | 'mastery';
    }
  | { type: 'practice_completed' }
  | { type: 'mastery_completed'; correct: number; total: number }
  | { type: 'review_completed'; item_id: string; correct: boolean };

export interface NumbersItemEvidence {
  correct: number;
  incorrect: number;
  /** First correct answer in a mastery check. Required for lesson completion. */
  mastered_at: string | null;
}

/**
 * The stored evidence for one Numbers lesson. Lives in its own store
 * (`numbers`), keyed `lesson:<lesson_id>`, never in the letter/word progress
 * table. `completed_at` is derived from the rest by `domain/numbersProgress.ts`
 * and is cleared on read when the evidence does not support it.
 */
export interface NumbersLessonProgress {
  schema: 1;
  lesson_id: string;
  opened_at: string | null;
  started_at: string | null;
  explanation_steps_viewed: string[];
  examples_viewed: string[];
  practice_completed_at: string | null;
  mastery: { taken_at: string; correct: number; total: number; passed: boolean } | null;
  mastery_attempts: number;
  /** When the lesson was last reviewed after completion; drives `review_due`. */
  reviewed_at: string | null;
  items: Record<string, NumbersItemEvidence>;
  attempts: { total: number; correct: number; incorrect: number };
  completed_at: string | null;
  updated_at: string;
}

export interface NumberItem {
  id: string;
  /** The Korean, as it is written. */
  korean: string;
  /** How it is said, where that differs from the spelling — 십육 → 심뉵. */
  reading: string | null;
  /** Revised Romanization, a transliteration rather than a translation. */
  romanization: string;
  /** The arabic value, where the item has one. Counters and phrases have none. */
  value: number | null;
  /** Which numeral system this belongs to, where that is a fact about it. */
  system: 'sino' | 'native' | null;
  /**
   * What kind of thing it is. Drives which exercises can be built from it and
   * which misconception classes its distractors come from.
   */
  role: 'numeral' | 'counter' | 'phrase' | 'form';
  /** For a counter: the numeral system it takes. */
  counter_system?: 'sino' | 'native';
  /** Key into the `numbers` namespace, or null where `value` says it all. */
  gloss: string | null;
  /** A worked example, Korean. Null where the item is its own example. */
  example: string | null;
  /** Key into the `numbers` namespace for what the example means. */
  example_gloss: string | null;
  /** The clip id for `korean`, and for `example` where there is one. */
  audio: { word: string; example: string | null };
  /**
   * One authored sentence worth reading *after* the answer, or null.
   *
   * The feedback line used to be generated: take the item, attach a particle,
   * add a fixed ending. For 사 that produced *사는 4예요* under a question whose
   * whole content was that 사 is 4 — a sentence telling a learner what they
   * had just been told by the option they tapped and the verdict above it.
   *
   * So a note is written by hand or it does not exist. Most items do not have
   * one, and that is the point: 일 is 1, and there is nothing else to say.
   * 만 has one, because *10,000원은 만 원이라고 읽어요* is a fact about money a
   * learner cannot deduce from the number; so do the two irregular months, the
   * counting forms, 십육, and the zero that is read 공 in a phone number.
   *
   * A key into the `numbers` namespace, so every language writes its own rather
   * than receiving a translated English one.
   */
  note?: string | null;
}

/** The exercise families the Numbers engine can build. */
export type NumbersExerciseKind =
  | 'listen_choose'
  | 'read_choose'
  | 'choose_system'
  | 'digits_to_korean'
  | 'korean_to_digits'
  | 'counter_form'
  | 'spot_mistake'
  | 'fill_sentence'
  | 'order_parts';

export interface NumberLesson {
  id: string;
  /** The module this lesson belongs to; `unit` is kept as its index. */
  module: string;
  unit: number;
  sequence: number;
  system: 'sino' | 'native' | 'both';
  item_ids: string[];
  /** Lessons whose completion this one assumes. Ids, never positions. */
  prerequisites: string[];
  /** Keys into the `numbers` namespace. */
  title: string;
  objective: string;
  /** Explanation steps, in order. Each is viewed separately and recorded. */
  explanation: string[];
  /** The exercise families guided practice and the mastery check draw from. */
  exercise_kinds: NumbersExerciseKind[];
  /** How many mastery questions to ask. */
  mastery_count: number;
}

export interface NumberModule {
  id: string;
  index: number;
  title: string;
  goal: string;
  lesson_ids: string[];
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
  /**
   * Official Revised Romanisation — 국어의 로마자 표기법, the learner-facing
   * reading aid.
   *
   * Derived from the word's **standard pronunciation** rather than from its
   * letters, which is what the standard prescribes: 좋다 is *jota*, 국민 is
   * *gungmin*, 나뭇잎 is *namunnip*. Sound-change tensing is deliberately not
   * written — 학교 is *hakgyo* — because §3-1 of the standard says not to.
   *
   * This replaced an IPA transcription that the app derived at runtime and
   * printed as `[tɕa.ɾi]` under every headword. IPA is a linguist's notation:
   * it is precise, and a complete beginner cannot read it, so the one line on
   * the card whose job was to help them say the word was helping nobody. The
   * recording teaches the sound; this teaches the *reading*.
   *
   * Plain Roman letters, no brackets, no IPA symbols. `vocabulary:qa` fails the
   * build on any of the three.
   */
  romanization: string;
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
  /**
   * The Vocabulary Level, 1–30. The scale the placement test reports on and
   * the daily plan selects by.
   *
   * A different question from `difficulty_level`, and the two are deliberately
   * separate. `difficulty_level` is one of eight tiers used to *describe* a
   * word on its card. `level` is an absolute property used to *choose* it: it
   * comes from a fixed ladder of score thresholds, so it does not move when
   * another word is added, and it is the same number the Level Test means when
   * it says 18. See `scripts/content/level.py`.
   */
  level: number;
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
  /**
   * The family to set *reading* text in, when it differs from the mask's.
   *
   * One face needs the distinction. Gaegu draws small letters inside its em —
   * measured over fifteen syllables, its ink band is 0.712 of the em where the
   * other five sit at 0.848–0.919 — so a learner who picks 손글씨체 reads the
   * whole app about a fifth smaller than a learner who picks anything else.
   * `scripts/face-size-qa.mjs` renders that comparison rather than arguing it
   * from metrics, which is what §51 asked for.
   *
   * The fix cannot be applied to `font_family`, because that string also
   * builds the mask the handwriting evaluator grades against, and Gaegu's
   * reference glyph is already at the end of its rope: `glyph_scale` lifted it
   * from 0.78 to 1.00 and the sweep in `data/fonts.ts` shows false rejection
   * tripling at 1.04. Enlarging the graded face again would fail honest
   * attempts, which §51 forbids.
   *
   * So reading and grading part company here. Absent means they are the same
   * string, which is true of every face but one.
   */
  text_family?: string;
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
  /**
   * Probe em for the traced glyph, as a fraction of the writing box.
   *
   * Absent on five of the six faces, which share `DEFAULT_GLYPH_SCALE`. It
   * exists because the fit's magnification cap is a *ratio*, so a face that
   * draws its letters small inside the em is held below the target size no
   * matter how much room the box has — and one face does exactly that. Raising
   * its probe raises only the glyphs the cap was holding down; the ones that
   * already reach the target still reach it and no further.
   */
  glyph_scale?: number;
  /**
   * The style's name and what practising in it teaches, per locale.
   *
   * `name` is a translation of `name_en`, not of `name`: the Korean style
   * name is a proper noun and stays as it is. What is translated is the
   * plain-language label beside it — "Handwriting", "Rounded" — which was
   * the last block of English left on a fully translated screen.
   */
  translations: LocalizedMap<{ name: string; description: string }>;
}

// --- Learning sessions and attempts -----------------------------------------

/**
 * Which guide was on the paper when an attempt was graded.
 *
 * **Historical.** The running app writes `trace` and nothing else: there is one
 * guide now, one writing step, and no setting that changes either. `practice`
 * is the fainter model that a second writing step, and later a preference,
 * used to select; both are gone. See `features/writing/guide.ts`.
 *
 * The value is kept on the type because rows written by earlier builds carry it
 * and the Activity screen reads them. Nothing in the product branches on it.
 */
export type PracticeMode = 'trace' | 'practice';

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
  reason: 'empty' | 'outside' | 'incomplete' | 'mixed' | 'scribble' | null;
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

/**
 * What a progress row is about. Shared by `ItemProgress` and the activity log.
 *
 * `number` joined `character` and `word` with the Numbers curriculum. It is a
 * third kind rather than a flavour of `word` because the three are scheduled,
 * counted and reviewed differently: the alphabet goal counts `character` rows
 * and only those, Today's Vocabulary counts `word` rows and only those, and a
 * number — 스물, 세 시, 만 원 — is neither a letter to write nor an entry in
 * the vocabulary corpus. Folding numbers into `word` would have put them in the
 * daily vocabulary plan, where `getWord()` cannot resolve them.
 */
export type ItemKind = 'character' | 'word' | 'number';

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
  /**
   * Numbers lessons whose derived status first reached `completed` today.
   *
   * Its own counter, because the first implementation had none and its
   * completions fell through `recordActivity`'s `else` branch into
   * `words_learned` — a Numbers lesson was being counted as a vocabulary word.
   * Optional so a day written before the field existed still reads.
   */
  numbers_lessons_completed?: number;
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
  /** Light, dark, or whatever the device is doing. */
  appearance: Appearance;
  daily_target: number;
  /**
   * How many vocabulary items to finish today. The one number the learner sets
   * that decides the length of a session.
   *
   * Counted in *words meaningfully completed*, never in questions answered or
   * buttons pressed — one word may be met, then heard, then recalled, and that
   * is one. See `domain/vocabularyDay.ts`.
   */
  daily_word_goal: number;
  /** Guides drawn inside the writing box. */
  show_grid: boolean;
  show_center_crosshair: boolean;
  /** Which bundled Korean voice pronounces letters, syllables and words. */
  voice: VoiceGender;
  /**
   * Practise without questions that can only be answered by hearing.
   *
   * Off by default, because listening is half of learning a language and a
   * product that quietly drops it would be teaching less while looking the
   * same.
   *
   * On, it stops the scheduler offering the four questions whose *prompt* is a
   * sound and whose answer cannot be reached any other way — "which word did
   * you hear", "what does this mean" over a clip, "which letter is this", and
   * the two-letter discrimination drill. Those are not hard for a deaf or
   * hard-of-hearing learner, they are impossible, and a hint that eventually
   * shows the answer is a way of finishing the question rather than of
   * answering it.
   *
   * Everything else stays: reading, meaning, production, gap-fill, handwriting.
   * Audio itself is *not* switched off — the speaker is still on every card for
   * anyone who wants it, and a learner with partial hearing loses nothing by
   * turning this on. What changes is only what the learner is *required* to do
   * to make progress.
   */
  sound_free: boolean;
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
