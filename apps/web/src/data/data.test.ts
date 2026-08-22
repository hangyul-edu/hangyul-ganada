/**
 * Guards on the curriculum content itself.
 *
 * These are cheap and they catch the kind of mistake that is invisible in
 * review: a duplicated id, a syllable built from a letter that has not been
 * taught yet, a level with no words in it, a number attributed to a source that
 * never published it.
 *
 * The most important one is `never asks for a letter it has not taught`. A
 * beginner curriculum that quietly requires ㅎ in lesson two is not a
 * curriculum, and the failure is silent — the learner just cannot do it and
 * assumes the fault is theirs.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ALL_CHARACTERS,
  ALL_LETTERS,
  CURRICULUM_UNITS,
  LETTER_LESSONS,
  LETTER_ORDER,
  getLessonCharacters,
} from './characters';
import FIXTURES from '../../../../packages/handwriting-core/src/__tests__/glyph-fixtures.json';
import { DEFAULT_FONT_ID, PRACTICE_FONTS, getFont } from './fonts';
import { LEARNING_QUOTES, QUOTE_LOCALES, nextQuote, renderQuote } from './quotes';
import { AVAILABLE_LOCALES } from '../i18n/resources';
import { hasFinalConsonant, toJamo, toSyllables } from './jamo';
import { romanizeSyllable } from './romanize';
import { blockLetterForms } from './compose';
import { WORD_COPY_LOCALES, loadWordCopy, wordCopy } from './wordCopy';
import {
  CATEGORY_IDS,
  CONTENT_SOURCES,
  VOCABULARY_CATEGORIES,
  wordsByCategory,
  searchWords,
  getVocabularyLesson,
  VOCABULARY,
  VOCABULARY_LESSONS,
  VOCABULARY_PROVENANCE,
  getLessonWords,
  newLetters,
  usesKnownLetters,
} from './vocabulary';

describe('characters', () => {
  // Meanings live in per-locale files that are fetched, not bundled. Anything
  // asserting on them has to load English first — the end of every chain.
  beforeAll(async () => {
    await loadWordCopy('en');
  });

  it('has no duplicate ids or glyphs', () => {
    expect(new Set(ALL_CHARACTERS.map((c) => c.id)).size).toBe(ALL_CHARACTERS.length);
    expect(new Set(ALL_CHARACTERS.map((c) => c.character)).size).toBe(ALL_CHARACTERS.length);
  });

  it('teaches the vowels every syllable needs before anything else', () => {
    expect(LETTER_LESSONS[0]!.group).toBe('basic_vowel');
    expect(LETTER_LESSONS[0]!.character_ids.length).toBeGreaterThanOrEqual(5);
  });

  it('covers all forty letters of Hangul', () => {
    // Nineteen consonants and twenty-one vowels. A curriculum that quietly
    // drops ㅒ is a curriculum a learner will meet ㅒ outside of.
    expect(ALL_LETTERS.length).toBe(40);
  });

  it('never asks for a letter it has not taught', () => {
    const taught = new Set<string>();
    for (const lesson of LETTER_LESSONS) {
      for (const prerequisite of lesson.prerequisites) {
        expect(taught.has(prerequisite), `${lesson.id} needs untaught ${prerequisite}`).toBe(true);
      }
      for (const character of getLessonCharacters(lesson)) {
        for (const part of character.components) {
          // A syllable's parts, and a derived letter's base, must both already
          // be on the board.
          expect(
            taught.has(part) || ALL_LETTERS.some((l) => l.character === part),
            `${lesson.id} builds ${character.character} from untaught ${part}`,
          ).toBe(true);
        }
        taught.add(character.character);
        for (const part of character.components) taught.add(part);
      }
    }
  });

  it('builds every syllable from letters, in the order they are taught', () => {
    const position = new Map(LETTER_ORDER.map((letter, index) => [letter, index]));
    const introducedAt = new Map<string, number>();
    let lessonIndex = 0;
    for (const lesson of LETTER_LESSONS) {
      for (const character of getLessonCharacters(lesson)) {
        if (!introducedAt.has(character.character)) {
          introducedAt.set(character.character, lessonIndex);
        }
      }
      lessonIndex += 1;
    }

    for (const syllable of ALL_CHARACTERS.filter((c) => c.components.length > 0 && c.letter_name === null)) {
      const at = introducedAt.get(syllable.character)!;
      for (const part of syllable.components) {
        expect(position.has(part), `${syllable.character} uses unknown jamo ${part}`).toBe(true);
        const partAt = introducedAt.get(part);
        expect(partAt, `${part} is never introduced before ${syllable.character}`).toBeDefined();
        expect(partAt! <= at, `${syllable.character} comes before its part ${part}`).toBe(true);
      }
    }
  });

  it('gives every letter a name and a sound example that differ where they should', () => {
    for (const letter of ALL_LETTERS) {
      expect(letter.letter_name, `${letter.character} has no name`).toBeTruthy();
      expect(letter.sound_example, `${letter.character} has no sound example`).toBeTruthy();
      expect(letter.audio.name).toBeTruthy();
      expect(letter.audio.sound).toBeTruthy();
    }
    // A consonant's name and its sound are different utterances; a vowel's are
    // the same. Both facts have to survive into the data, because the lesson
    // shows one button or two depending on it.
    expect(ALL_LETTERS.find((l) => l.character === 'ㄱ')!.letter_name).toBe('기역');
    expect(ALL_LETTERS.find((l) => l.character === 'ㄱ')!.sound_example).toBe('가');
    expect(ALL_LETTERS.find((l) => l.character === 'ㅏ')!.letter_name).toBe('아');
    expect(ALL_LETTERS.find((l) => l.character === 'ㅏ')!.sound_example).toBe('아');
  });

  it('romanises every syllable the way the content pipeline does', () => {
    // Cross-checked against `scripts/content/hangul.py`, which is the source of
    // truth for word romanisation. A block has no internal sound changes, so
    // the two must agree exactly.
    const expected: Record<string, string> = {
      가: 'ga', 고: 'go', 나: 'na', 밥: 'bap', 옷: 'ot', 꽃: 'kkot',
      한: 'han', 글: 'geul', 강: 'gang', 국: 'guk', 안: 'an', 말: 'mal',
    };
    for (const [syllable, roman] of Object.entries(expected)) {
      expect(romanizeSyllable(syllable), syllable).toBe(roman);
    }
  });

  it('gives every lesson its characters', () => {
    for (const lesson of LETTER_LESSONS) {
      const chars = getLessonCharacters(lesson);
      expect(chars.length, `${lesson.id} resolved fewer characters than it lists`).toBe(
        lesson.character_ids.length,
      );
    }
  });

  it('puts every lesson in exactly one unit', () => {
    const covered = CURRICULUM_UNITS.flatMap((u) => u.lesson_ids);
    expect(new Set(covered).size).toBe(covered.length);
    expect(new Set(covered)).toEqual(new Set(LETTER_LESSONS.map((l) => l.id)));
  });
});

describe('fonts', () => {
  it('declares a licence and source for every face', () => {
    for (const font of PRACTICE_FONTS) {
      expect(font.license, `${font.id} has no licence`).toBeTruthy();
      expect(font.source, `${font.id} has no source`).toBeTruthy();
    }
  });

  it('resolves the default font', () => {
    expect(getFont(DEFAULT_FONT_ID).id).toBe(DEFAULT_FONT_ID);
  });

  it('falls back rather than throwing on an unknown id', () => {
    expect(getFont('not-a-font').id).toBe(DEFAULT_FONT_ID);
  });
});

describe('hangul helpers', () => {
  it('decomposes a syllable into its jamo', () => {
    expect(toJamo('한')).toEqual(['ㅎ', 'ㅏ', 'ㄴ']);
    expect(toJamo('가')).toEqual(['ㄱ', 'ㅏ']);
  });

  it('detects a final consonant', () => {
    expect(hasFinalConsonant('한')).toBe(true);
    expect(hasFinalConsonant('하')).toBe(false);
  });

  it('splits a word into writing boxes', () => {
    expect(toSyllables('사과')).toEqual(['사', '과']);
  });
});

describe('difficulty model', () => {
  // The model itself lives in `scripts/content/difficulty.py` and is tested
  // there against a benchmark set. What this suite guards is the property the
  // app depends on: that the number in the dataset orders words the way a
  // learner would expect, and that nothing here recomputes it.
  it('rates the words a beginner meets first as the easiest', () => {
    const beginner = ['물', '집', '사람', '학교', '먹다', '좋다'];
    for (const word of beginner) {
      const record = VOCABULARY.find((w) => w.word === word);
      if (!record) continue;
      expect(record.difficulty_level, `${word} should not be advanced`).toBeLessThanOrEqual(4);
    }
  });

  it('orders words within a category by their score', () => {
    // The levels are not shown any more, but they still do the work: the score
    // behind them is what puts 개 and 새 at the top of Animals instead of
    // whichever animal happens to sort first in Korean.
    for (const category of CATEGORY_IDS) {
      const words = wordsByCategory(category);
      for (let i = 1; i < words.length; i += 1) {
        expect(words[i]!.difficulty_score).toBeGreaterThanOrEqual(words[i - 1]!.difficulty_score);
      }
    }
  });

  it('gives every word a reason that is not always the same one', () => {
    const reasons = new Set(VOCABULARY.map((w) => w.difficulty_reason));
    expect(reasons.size).toBeGreaterThan(2);
  });
});

describe('vocabulary', () => {
  it('is a real curriculum rather than a demo', () => {
    // The number is not the point; having enough of it that a learner cannot
    // exhaust the product in an evening is.
    expect(VOCABULARY.length).toBeGreaterThan(1000);
    expect(VOCABULARY_CATEGORIES.length).toBeGreaterThanOrEqual(10);
  });

  it('files every word in exactly one category', () => {
    // The release blocker behind the browsing structure. A word with no
    // category cannot be found by anyone who does not already know it exists.
    const known = new Set(CATEGORY_IDS);
    for (const word of VOCABULARY) {
      expect(known.has(word.category), `${word.word} has category "${word.category}"`).toBe(true);
      // A word in two places is a word a learner finds twice and finishes
      // neither, so the tags must never include the primary.
      expect(word.category_tags).not.toContain(word.category);
    }
    const counted = VOCABULARY_CATEGORIES.reduce((sum, c) => sum + c.word_count, 0);
    expect(counted).toBe(VOCABULARY.length);
  });

  it('has no category small enough to be a rounding error or large enough to be a scroll', () => {
    for (const entry of VOCABULARY_CATEGORIES) {
      expect(entry.word_count, `${entry.id} is tiny`).toBeGreaterThan(20);
      expect(entry.word_count / VOCABULARY.length, `${entry.id} is huge`).toBeLessThan(0.25);
    }
  });

  it('finds a word by its Korean and by what it means', () => {
    const meaningOf = (word: (typeof VOCABULARY)[number]) => wordCopy(word, 'en').value.meaning;
    const byKorean = searchWords('사과', meaningOf, 10);
    expect(byKorean[0]?.word.word).toBe('사과');
    const byMeaning = searchWords('apple', meaningOf, 10);
    expect(byMeaning.map((r) => r.word.word)).toContain('사과');
    // Every result names a set the learner can actually open.
    for (const result of byMeaning) {
      expect(getVocabularyLesson(result.lessonId)).toBeTruthy();
    }
  });

  it('has no duplicate ids or words', () => {
    expect(new Set(VOCABULARY.map((w) => w.id)).size).toBe(VOCABULARY.length);
    expect(new Set(VOCABULARY.map((w) => w.word)).size).toBe(VOCABULARY.length);
  });

  it('gives every word an English meaning', () => {
    for (const word of VOCABULARY) {
      expect(wordCopy(word, 'en').value.meaning, `${word.word} has no English meaning`).toBeTruthy();
    }
  });

  it('splits every word into the syllables the learner will write', () => {
    for (const word of VOCABULARY) {
      expect(word.syllables.join('')).toBe(word.word);
      expect(word.syllables.length).toBeGreaterThan(0);
    }
  });

  it('only needs letters the curriculum teaches', () => {
    const taught = new Set(LETTER_ORDER);
    for (const word of VOCABULARY) {
      for (const jamo of word.required_jamo) {
        expect(taught.has(jamo), `${word.word} needs untaught ${jamo}`).toBe(true);
      }
    }
  });

  it('reports which letters of a word the learner has yet to meet', () => {
    // A recommendation signal, not a gate — the word is accessible either way.
    // See `usesKnownLetters` in data/vocabulary.ts.
    const word = VOCABULARY.find((w) => w.word === '나무');
    expect(word, '나무 should be in the curriculum').toBeDefined();
    const partial = new Set(['ㄴ', 'ㅏ']);
    expect(usesKnownLetters(word!, partial)).toBe(false);
    expect(newLetters(word!, partial)).toContain('ㅁ');
    const full = new Set(word!.required_jamo);
    expect(usesKnownLetters(word!, full)).toBe(true);
    expect(newLetters(word!, full)).toEqual([]);
  });

  it('keeps difficulty and letter readiness apart', () => {
    // The bug this replaces: the old schema derived a word's level from which
    // letters it contained, so 맛있다 — a first-week word spelled with ㅆ —
    // was filed at the top level. Difficulty is now a property of the word and
    // readiness is a property of the learner, and neither may stand in for the
    // other. A word that needs a late letter must still be allowed to be easy.
    const lateLetterEasyWords = VOCABULARY.filter(
      (w) => w.letters_ready_after > 30 && w.difficulty_level <= 3,
    );
    expect(lateLetterEasyWords.length).toBeGreaterThan(0);
  });

  it('still rises in difficulty from one level to the next', () => {
    // The levels left the interface and stayed in the data, so this still has
    // to hold: they are what orders a category, and an ordering that does not
    // rise is not an ordering.
    const byLevel = new Map<number, number[]>();
    for (const word of VOCABULARY) {
      const scores = byLevel.get(word.difficulty_level) ?? [];
      scores.push(word.difficulty_score);
      byLevel.set(word.difficulty_level, scores);
    }
    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    expect(levels.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < levels.length; i += 1) {
      const previous = byLevel.get(levels[i - 1]!)!;
      const current = byLevel.get(levels[i]!)!;
      expect(Math.min(...current)).toBeGreaterThanOrEqual(Math.min(...previous));
      expect(Math.max(...current)).toBeGreaterThan(Math.min(...previous));
    }
  });

  it('never tells a learner why a word is where it is', () => {
    // The placement explanation was removed from the product this cycle. It
    // read "Placed here mainly by the letters it is spelled with", which is the
    // ranking engine talking about itself and invites the one question the app
    // cannot answer: placed there by whom?
    //
    // The *data* stays — the level still orders each category — so what has to
    // be asserted is that nothing carries a learner-facing sentence about it.
    for (const word of VOCABULARY.slice(0, 200)) {
      expect(word).not.toHaveProperty('difficulty_explanation');
      for (const source of word.sources) {
        expect(source.fields).not.toContain('difficulty_reason');
      }
    }
  });

  it('never claims its ordering or its levels are official', () => {
    // The one claim this product must not make by accident.
    expect(VOCABULARY_PROVENANCE.isOfficial).toBe(false);
    expect(VOCABULARY_PROVENANCE.generator).toBeTruthy();
  });

  it('attributes every field to a source, and marks what it derived itself', () => {
    for (const word of VOCABULARY.slice(0, 200)) {
      expect(word.sources.length, `${word.word} has no provenance`).toBeGreaterThan(0);
      const derived = word.sources.filter((s) => s.derived);
      expect(derived.length, `${word.word} claims nothing of its own`).toBeGreaterThan(0);
      for (const source of word.sources) {
        expect(source.fields.length, `${word.word} has an empty provenance entry`).toBeGreaterThan(0);
        expect(source.source_id).toBeTruthy();
        expect(source.license).toBeTruthy();
      }
      // A frequency rank must come with the corpus that produced it. A number
      // with no source is the thing this whole schema exists to prevent.
      if (word.frequency.observed) {
        const attributed = word.sources.some(
          (s) => !s.derived && s.fields.includes('frequency_rank'),
        );
        expect(attributed, `${word.word} has a rank with no corpus behind it`).toBe(true);
      } else {
        // An unobserved word must say so rather than carry a made-up rank.
        expect(word.frequency.rank).toBeNull();
        expect(word.frequency.rate).toBeNull();
      }
    }
  });

  it('names a licence for every content source', () => {
    expect(CONTENT_SOURCES.length).toBeGreaterThan(0);
    for (const source of CONTENT_SOURCES) {
      expect(source.name).toBeTruthy();
      expect(source.license).toBeTruthy();
      expect(source.provides).toBeTruthy();
    }
  });

  it('carries no vocabulary imagery at all', () => {
    // Word pictures were removed from the product. This is not a style
    // preference being enforced: a leftover `image` field would put an <img>
    // back on the word screen the moment anyone rendered the record
    // generically, and a leftover `illustration` provenance row would credit a
    // source the app no longer ships. Both have to be absent from the *data*,
    // not merely unused by the component.
    for (const word of VOCABULARY) {
      expect(word, `${word.word} still carries an image field`).not.toHaveProperty('image');
      for (const source of word.sources) {
        expect(source.fields, `${word.word} still credits an illustration`).not.toContain(
          'illustration',
        );
      }
    }
  });

  it('gives every word a pronunciation clip id', () => {
    for (const word of VOCABULARY) {
      expect(word.audio.word, `${word.word} has no audio id`).toBeTruthy();
      // ASCII only: Korean in a filename survives POSIX and then breaks on a
      // zip round-trip or an Android asset packer.
      expect(word.audio.word!).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('puts every word in exactly one lesson', () => {
    const covered = VOCABULARY_LESSONS.flatMap((l) => l.word_ids);
    expect(new Set(covered).size).toBe(covered.length);
    expect(new Set(covered)).toEqual(new Set(VOCABULARY.map((w) => w.id)));
  });

  it('keeps lessons short enough to finish in one sitting', () => {
    for (const lesson of VOCABULARY_LESSONS) {
      const words = getLessonWords(lesson);
      expect(words.length).toBeGreaterThan(0);
      expect(words.length).toBeLessThanOrEqual(5);
      // Every word in a set shares its category, so the heading it sits under
      // is honest.
      expect(new Set(words.map((w) => w.category))).toEqual(new Set([lesson.category]));
    }
  });
});

describe('learning quotes', () => {
  it('carries every interface language, with no English fallback anywhere', () => {
    // The rule this whole redesign exists for. A missing translation used to
    // mean an English line under a Spanish interface; now it means a thrown
    // error, and this is what stops one ever being written.
    for (const quote of LEARNING_QUOTES) {
      for (const locale of QUOTE_LOCALES) {
        const rendered = renderQuote(quote, locale);
        expect(rendered.text.trim(), `${quote.id} has no ${locale} text`).toBeTruthy();
        /*
         * A quote either names somebody in every language or names nobody at
         * all. What is forbidden is naming them in some languages and not
         * others — which is what a fallback to the English name looks like from
         * inside, and what this checks is not happening.
         */
        if (quote.author) {
          expect(rendered.author?.trim(), `${quote.id} has no ${locale} author`).toBeTruthy();
          expect(quote.author[locale], `${quote.id} falls back to English for ${locale}`)
            .toBeTruthy();
        } else {
          expect(rendered.author, `${quote.id} invented an author`).toBeNull();
        }
      }
    }
  });

  it('names every language whose word meanings actually ship', () => {
    /*
     * `WORD_COPY_LOCALES` is what the language picker uses to tell a learner,
     * before they choose, whether word meanings will be in their language or in
     * English. It comes from the `locales` field of the generated pack, which
     * for two builds listed only the eight languages the corpus entries carry —
     * so the picker said Vietnamese and Thai had no meanings while shipping
     * 2,581 of each. A false warning is worse than no warning.
     */
    const shipped = Object.keys(
      import.meta.glob('./generated/vocabulary.*.json', { eager: false }),
    )
      .map((path) => /vocabulary\.(.+)\.json$/.exec(path)?.[1])
      .filter((code): code is string => Boolean(code));
    expect(shipped.length).toBeGreaterThan(1);
    expect([...WORD_COPY_LOCALES].sort()).toEqual(shipped.sort());
  });

  it('carries a quotation in every language the product ships', () => {
    // Adding an interface language without adding its quotations is the exact
    // shape of the bug that took the Arabic home screen to a blank page: the
    // quote renderer throws, and it is mounted inside Home.
    expect([...QUOTE_LOCALES].sort()).toEqual([...AVAILABLE_LOCALES].sort());
  });

  it('does not print the same sentence twice when the learner reads the original', () => {
    const wittgenstein = LEARNING_QUOTES.find((q) => q.id === 'wittgenstein-limits')!;
    expect(renderQuote(wittgenstein, 'de').original).toBeNull();
    expect(renderQuote(wittgenstein, 'de').attribution).toBe('original');
    // And a Korean proverb read in Korean, likewise.
    const korean = LEARNING_QUOTES.find((q) => q.originalLanguage === 'ko')!;
    expect(renderQuote(korean, 'ko').original).toBeNull();
  });

  it('shows the original beside a translation, labelled with its language', () => {
    const laozi = LEARNING_QUOTES.find((q) => q.id === 'laozi-journey')!;
    const rendered = renderQuote(laozi, 'fr');
    expect(rendered.original).toEqual({ text: laozi.originalText, lang: 'zh' });
    expect(rendered.text).not.toBe(laozi.originalText);
  });

  it('says whether a line is the original, a published translation, or ours', () => {
    // The honesty requirement. A translation made for this app must not be
    // presented as though the author wrote it.
    const syrus = LEARNING_QUOTES.find((q) => q.id === 'syrus-practice')!;
    expect(renderQuote(syrus, 'en').attribution).toBe('published');
    expect(renderQuote(syrus, 'ja').attribution).toBe('ours');
    for (const quote of LEARNING_QUOTES) {
      for (const locale of QUOTE_LOCALES) {
        expect(['original', 'published', 'ours']).toContain(
          renderQuote(quote, locale).attribution,
        );
      }
    }
  });

  it('localises the descriptor as well as the name', () => {
    const proverb = LEARNING_QUOTES.find((q) => q.id === 'korean-dust-mountain')!;
    expect(proverb.author?.en).toBe('Korean proverb');
    expect(proverb.author?.ko).toBe('한국 속담');
    expect(proverb.author?.ja).toBe('韓国のことわざ');
    // A name, not a phrase: written in the conventional local form where there
    // is one and left alone where there is not. Never transliterated on the fly.
    const plato = LEARNING_QUOTES.find((q) => q.id === 'plato-beginning')!;
    expect(plato.author?.es).toBe('Platón');
    expect(plato.author?.['zh-CN']).toBe('柏拉图');
    expect(plato.author?.de).toBe('Platon');
  });

  it('carries Korean, since this is a Korean app', () => {
    const korean = LEARNING_QUOTES.filter((q) => q.originalLanguage === 'ko');
    expect(korean.length).toBeGreaterThanOrEqual(3);
    for (const quote of korean) {
      expect(quote.originalText, quote.id).toMatch(/[가-힣]/);
      /*
       * Either a proverb, which has no author to get wrong, or nobody at all.
       * What a Korean line here may never carry is a *name*, because the
       * Korean quotations in circulation are exactly the ones whose
       * attributions are invented — see §35 and `korean-big-dream`.
       */
      if (quote.author) {
        expect(quote.author.en!.toLowerCase(), quote.id).toContain('proverb');
      }
    }
  });

  it('attributes every quotation to a named source', () => {
    // The whole reason this list is curated by hand: an app asking a learner to
    // trust its Korean should not, on the same screen, put words in Confucius's
    // mouth. A quote with no source is exactly the kind that gets invented.
    for (const quote of LEARNING_QUOTES) {
      expect(quote.source.trim(), `${quote.id} has no source`).toBeTruthy();
      /*
       * A quotation has to carry the words it is quoting. A line written for
       * this app has nothing to quote — its source says so — and demanding an
       * "original" for it would mean inventing one.
       */
      if (!quote.source.startsWith('Written for Hangyul')) {
        expect(quote.originalText.trim(), quote.id).toBeTruthy();
      }
    }
  });

  it('carries none of the famous misattributions', () => {
    const text = LEARNING_QUOTES.flatMap((q) => Object.values(q.translations))
      .join(' | ')
      .toLowerCase();
    for (const fake of [
      'second soul',
      'as long as you do not stop',
      'never made a mistake',
      'was once a beginner',
    ]) {
      expect(text, `misattributed quote reintroduced: ${fake}`).not.toContain(fake);
    }
  });

  it('keeps every line short enough for a phone, in every language', () => {
    for (const quote of LEARNING_QUOTES) {
      for (const [locale, text] of Object.entries(quote.translations)) {
        expect(text.length, `${quote.id} is too long in ${locale}`).toBeLessThan(130);
      }
    }
  });

  it('has unique ids', () => {
    const ids = LEARNING_QUOTES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('walks the whole set before repeating anything', () => {
    // A naive random pick shows the same line twice in a row about one time in
    // ten — often enough for a learner to conclude there is only one quote.
    let history: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < LEARNING_QUOTES.length; i += 1) {
      // Always take the first of the remaining pool, which is the worst case
      // for a shuffled bag: if it repeats here it repeats anywhere.
      const next = nextQuote(history, 0);
      seen.push(next.quote.id);
      history = next.history;
    }
    expect(new Set(seen).size).toBe(LEARNING_QUOTES.length);
  });

  it('never returns the quote just shown', () => {
    for (const quote of LEARNING_QUOTES) {
      for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
        expect(nextQuote([quote.id], random).quote.id).not.toBe(quote.id);
      }
    }
  });

  it('survives a corrupt or oversized history', () => {
    expect(nextQuote(LEARNING_QUOTES.map((q) => q.id), 0.5).quote).toBeTruthy();
    expect(nextQuote(['not-a-real-id'], 0.5).quote).toBeTruthy();
  });
});

/**
 * Stroke order.
 *
 * The data is a claim about how Korean is written, and most of that claim can
 * only be checked by someone who reads Korean — which is why it was authored
 * against the standard rules and rendered for review rather than generated.
 * What a test *can* hold is everything mechanical about it, and each of these
 * has a failure mode that would otherwise reach a learner silently.
 */
describe('stroke order', () => {
  it('covers every letter the curriculum teaches', () => {
    for (const character of ALL_CHARACTERS) {
      expect(character.strokes.length, `${character.character} has no strokes`).toBeGreaterThan(0);
    }
  });

  it('agrees with the stroke count shown on the card', () => {
    for (const character of ALL_CHARACTERS) {
      // The number under the diagram and the number of strokes in it are two
      // renderings of one fact, and a learner comparing them would be right to
      // trust neither if they disagreed.
      expect(character.strokes.length, character.character).toBe(character.stroke_count);
    }
  });

  it('keeps every stroke inside the writing box', () => {
    for (const character of ALL_CHARACTERS) {
      for (const [index, stroke] of character.strokes.entries()) {
        for (const point of stroke.points) {
          expect(point.x, `${character.character} stroke ${index + 1}`).toBeGreaterThanOrEqual(0);
          expect(point.x, `${character.character} stroke ${index + 1}`).toBeLessThanOrEqual(1);
          expect(point.y, `${character.character} stroke ${index + 1}`).toBeGreaterThanOrEqual(0);
          expect(point.y, `${character.character} stroke ${index + 1}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('gives every stroke a length to animate', () => {
    for (const character of ALL_CHARACTERS) {
      for (const [index, stroke] of character.strokes.entries()) {
        expect(stroke.points.length, `${character.character} stroke ${index + 1}`).toBeGreaterThan(
          1,
        );
        const travelled = stroke.points.slice(1).reduce((total, point, i) => {
          const previous = stroke.points[i]!;
          return total + Math.hypot(point.x - previous.x, point.y - previous.y);
        }, 0);
        // A zero-length stroke would render as a dot and animate as nothing.
        // A block's strokes are its letters' at about half size and smaller
        // again for the margin round the block, so the floor is proportional —
        // what is being guarded against is a stroke with nothing to draw, not a
        // short one. See `BLOCK_SCALE` in `data/compose.ts`.
        const floor = character.group === 'syllable' ? 0.02 : 0.05;
        expect(travelled, `${character.character} stroke ${index + 1}`).toBeGreaterThan(floor);
      }
    }
  });

  it('writes left before right, and top before bottom within a column', () => {
    // The two rules, in the order they actually apply. Left-to-right wins when
    // two strokes are side by side — which is why ㄸ's second ㄷ starts back at
    // the top of the box — and top-to-bottom decides the rest. Strokes that
    // share space on both axes are exempt: for ㅁ's frame or ㅇ's circle the
    // order is about which part of a shape comes first, not about position.
    const centre = (points: Array<{ x: number; y: number }>, axis: 'x' | 'y') =>
      points.reduce((sum, p) => sum + p[axis], 0) / points.length;
    const spread = (points: Array<{ x: number; y: number }>, axis: 'x' | 'y') => {
      const values = points.map((p) => p[axis]);
      return [Math.min(...values), Math.max(...values)] as const;
    };
    // A real gap, not a shared edge: ㅂ's waist ends exactly on its right
    // upright, and treating that as "entirely to the left of" would ask the
    // waist to be drawn further right than the upright it joins.
    const separated = (a: readonly [number, number], b: readonly [number, number]) =>
      a[1] + 0.05 <= b[0];

    for (const character of ALL_CHARACTERS) {
      if (character.group === 'syllable') continue;
      for (let i = 1; i < character.strokes.length; i += 1) {
        const previous = character.strokes[i - 1]!.points;
        const current = character.strokes[i]!.points;

        // Side by side: the later stroke must be the right-hand one.
        if (
          separated(spread(previous, 'x'), spread(current, 'x')) ||
          separated(spread(current, 'x'), spread(previous, 'x'))
        ) {
          expect(
            centre(current, 'x'),
            `${character.character}: stroke ${i + 1} sits left of stroke ${i}`,
          ).toBeGreaterThan(centre(previous, 'x'));
          continue;
        }

        // Stacked: the later stroke must be the lower one.
        if (
          separated(spread(previous, 'y'), spread(current, 'y')) ||
          separated(spread(current, 'y'), spread(previous, 'y'))
        ) {
          expect(
            centre(current, 'y'),
            `${character.character}: stroke ${i + 1} sits above stroke ${i}`,
          ).toBeGreaterThan(centre(previous, 'y'));
        }
      }
    }
  });

  it('builds a syllable out of its letters, in order', () => {
    // The block's strokes are its letters' strokes, in writing order, *placed
    // into the block* — see `data/compose.ts`. It used to be the letters'
    // stroke data concatenated verbatim, which drew every one of them full size
    // in the same square; `compose.test.ts` owns the geometry now, and what is
    // still true here is that a block is its letters and nothing else.
    //
    // "Its letters" is asked of `blockLetterForms` rather than of
    // `STROKE_ORDER` directly, because ㄱ, ㅋ and ㄲ have two forms and which
    // one a block writes depends on where in the block the letter sits: 가's ㄱ
    // has a leaning leg and 고's comes straight down, as the face draws them.
    // Reading the isolated form here would be a second copy of that rule, and
    // the copy would be wrong.
    const syllables = ALL_CHARACTERS.filter((c) => c.group === 'syllable');
    expect(syllables.length).toBeGreaterThan(0);
    for (const block of syllables) {
      const letters = blockLetterForms(block.character);
      expect(
        letters.map((letter) => letter.jamo),
        block.character,
      ).toEqual(block.components);
      const expected = letters.flatMap((letter) => letter.strokes);
      expect(block.strokes.length, block.character).toBe(expected.length);
      expect(block.stroke_count, block.character).toBe(expected.length);
      for (const [i, stroke] of block.strokes.entries()) {
        // Same shape of stroke — the same number of points, turning the same
        // way — so the order and the direction of every stroke survived.
        expect(stroke.points.length, `${block.character} stroke ${i + 1}`).toBe(
          expected[i]!.points.length,
        );
      }
    }
  });
});

/**
 * The one per-face grading override, and the copy of it the corpus grades with.
 *
 * `packages/handwriting-core` cannot import the app — it is the library the app
 * is built on — so the robustness corpus keeps its own copy of which faces need
 * their own tolerance. Two copies of a calibration number is exactly the kind
 * of thing that drifts silently and turns a measurement into a claim, so this
 * asserts they still agree.
 */
describe('typeface grading', () => {
  it('gives only Gaegu its own tolerance, at the measured value', () => {
    const overridden = PRACTICE_FONTS.filter((font) => font.evaluation);
    expect(overridden.map((f) => f.id)).toEqual(['gaegu']);
    expect(overridden[0]!.evaluation!.glyph_tolerance_ratio).toBe(0.036);
  });

  it('gives only Gaegu its own probe scale, at the swept value', () => {
    /*
      Two copies of a calibration number, for the same reason as the tolerance
      above: `render-fixtures.py` cannot import the app, so it keeps its own
      `FACE_SCALE`. If these drift, the fixtures measure a glyph geometry the
      product does not draw — which is precisely the failure that let an
      earlier fit change be invisible to the whole corpus.
    */
    const scaled = PRACTICE_FONTS.filter((font) => font.glyph_scale !== undefined);
    expect(scaled.map((f) => f.id)).toEqual(['gaegu']);
    expect(scaled[0]!.glyph_scale).toBe(1.0);
    expect(FIXTURES.faceScale).toEqual({ gaegu: 1.0 });
  });

  it('offers between six and eight faces, each with a licence that permits shipping', () => {
    expect(PRACTICE_FONTS.length).toBeGreaterThanOrEqual(6);
    expect(PRACTICE_FONTS.length).toBeLessThanOrEqual(8);
    for (const font of PRACTICE_FONTS) {
      expect(font.license, font.id).toBe('SIL Open Font License 1.1');
      expect(font.bundled, font.id).toBe(true);
    }
  });

  it('does not claim any face is 궁서체', () => {
    // Genuine 궁서체 is proprietary and is not in this product. The 바탕 face
    // that stands in its place is labelled 바탕체, and this is the guard that
    // it stays labelled honestly.
    for (const font of PRACTICE_FONTS) {
      expect(font.name, font.id).not.toContain('궁서');
      expect(font.family_name.toLowerCase(), font.id).not.toContain('gungsuh');
    }
  });
});
