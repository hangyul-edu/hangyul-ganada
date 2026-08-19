/**
 * The quotations shown at the foot of the home screen.
 *
 * ## Why these twelve
 *
 * The bottom of Home used to state a fact about the product — how many words
 * were available. True, and the learner had already read it. The space is
 * better spent on the one thing a beginner most needs at the moment they open
 * a learning app and are not yet sure they will keep going.
 *
 * ## Attribution, and what is not here
 *
 * Every line below is either from a **documented primary source** or is a
 * **proverb with no individual author to get wrong**. Nothing is a modern
 * aphorism with a famous name bolted on, which is what most "language learning
 * quotes" lists are made of. Specifically excluded, all of them widely
 * circulated and none of them traceable to the person they are credited to:
 *
 * * "To have another language is to possess a second soul" — Charlemagne
 * * "It does not matter how slowly you go as long as you do not stop" — Confucius
 * * "Anyone who has never made a mistake has never tried anything new" — Einstein
 * * "The expert in anything was once a beginner" — Helen Hayes
 *
 * A learner is being asked to trust this app's Korean. Quoting something it
 * cannot stand behind, on the same screen, would be a strange place to start.
 *
 * ## Every quotation is translated, and says who translated it
 *
 * This screen used to show English to everybody, on the argument that
 * translating a sourced quotation means shipping an unsourced paraphrase and
 * attributing it to Plato. The argument was half right and the conclusion was
 * wrong: a Spanish learner reading English at the bottom of a Spanish app is
 * being told, quietly, that the product was built for somebody else.
 *
 * So each quotation carries a translation in all eight interface languages and
 * an `attribution` field saying what those translations *are*:
 *
 * | `attribution` | Meaning |
 * | --- | --- |
 * | `original` | the words the author wrote, in the language they wrote them in |
 * | `published` | a published translation, named in `source` |
 * | `ours` | translated for this app from the original |
 *
 * `ours` is the honest label for most rows, and it is not a licence to
 * paraphrase: each one renders the original's sense in the target language and
 * nothing more. What is never done is inventing a *quotation* — the source is
 * recorded for every line and the original text is carried beside it, so any
 * claim here can be checked against the text it came from.
 *
 * ## Copyright
 *
 * Everything quoted is public domain (pre-1929 publication or older) or is a
 * proverb.
 */

/** How a rendered line relates to what the author actually wrote. */
export type QuoteAttribution = 'original' | 'published' | 'ours';

export interface LearningQuote {
  id: string;
  /** The language the author wrote in, as a BCP-47 tag. */
  originalLanguage: string;
  /** What they wrote, in that language. */
  originalText: string;
  /** The quotation in each interface language. Never partial. */
  translations: Record<string, string>;
  /** Where it is written down, so the attribution is auditable. */
  source: string;
  /**
   * Which locales carry a *published* translation rather than one made here.
   *
   * English is published for every row — it is the translation the source is
   * conventionally quoted from — and the others are ours unless listed. See
   * the table above.
   */
  published?: string[];
  /**
   * The author, per interface language.
   *
   * Two different things live here and both need translating. A **descriptor**
   * ("Korean proverb") is a phrase and reads as foreign if left in English. A
   * **name** is a name: it is written in the conventional local form where the
   * language has one — Platón, プラトン, 柏拉图 — and left alone where it does
   * not. Nothing is transliterated on the fly, because a machine-transliterated
   * name is a misattribution with extra steps.
   */
  author: Record<string, string>;
}

/** The interface languages every quotation must carry. */
export const QUOTE_LOCALES = ['en', 'ko', 'ja', 'zh-CN', 'es', 'fr', 'de', 'pt-BR'] as const;

/** Descriptors that are phrases rather than names, written out per language. */
const PROVERB = {
  korean: {
    en: 'Korean proverb',
    ko: '한국 속담',
    ja: '韓国のことわざ',
    'zh-CN': '韩国谚语',
    es: 'Proverbio coreano',
    fr: 'Proverbe coréen',
    de: 'Koreanisches Sprichwort',
    'pt-BR': 'Provérbio coreano',
  },
  japanese: {
    en: 'Japanese proverb',
    ko: '일본 속담',
    ja: '日本のことわざ',
    'zh-CN': '日本谚语',
    es: 'Proverbio japonés',
    fr: 'Proverbe japonais',
    de: 'Japanisches Sprichwort',
    'pt-BR': 'Provérbio japonês',
  },
  latin: {
    en: 'Latin proverb',
    ko: '라틴 속담',
    ja: 'ラテン語のことわざ',
    'zh-CN': '拉丁谚语',
    es: 'Proverbio latino',
    fr: 'Proverbe latin',
    de: 'Lateinisches Sprichwort',
    'pt-BR': 'Provérbio latino',
  },
} as const;

/** A name with no conventional local form outside CJK and Korean. */
function western(
  latin: string,
  ko: string,
  ja: string,
  zh: string,
  overrides: Partial<Record<string, string>> = {},
): Record<string, string> {
  return {
    en: latin,
    es: latin,
    fr: latin,
    de: latin,
    'pt-BR': latin,
    ko,
    ja,
    'zh-CN': zh,
    ...overrides,
  };
}

export const LEARNING_QUOTES: LearningQuote[] = [
  {
    id: 'laozi-journey',
    originalLanguage: 'zh',
    originalText: '千里之行，始於足下',
    source: 'Tao Te Ching, chapter 64 (c. 4th century BC)',
    published: ['en', 'zh-CN'],
    translations: {
      en: 'A journey of a thousand miles begins with a single step.',
      ko: '천 리 길도 발밑에서 시작된다.',
      ja: '千里の道も一歩から。',
      'zh-CN': '千里之行，始于足下。',
      es: 'Un viaje de mil leguas comienza con un solo paso.',
      fr: 'Un voyage de mille lieues commence par un seul pas.',
      de: 'Eine Reise von tausend Meilen beginnt mit einem einzigen Schritt.',
      'pt-BR': 'Uma jornada de mil léguas começa com um único passo.',
    },
    author: western('Laozi', '노자', '老子', '老子', { es: 'Lao-Tse', 'pt-BR': 'Lao-Tsé' }),
  },
  {
    id: 'plato-beginning',
    originalLanguage: 'grc',
    originalText: 'ἀρχὴ γὰρ παντὸς ἔργου μέγιστον',
    source: 'Republic, Book II, 377a (c. 375 BC)',
    published: ['en'],
    translations: {
      en: 'The beginning is the most important part of the work.',
      ko: '어떤 일이든 시작이 가장 중요하다.',
      ja: 'どんな仕事でも、始まりがいちばん大切だ。',
      'zh-CN': '任何事情，开头最重要。',
      es: 'El principio es la parte más importante de la obra.',
      fr: 'Le commencement est la partie la plus importante du travail.',
      de: 'Der Anfang ist der wichtigste Teil der Arbeit.',
      'pt-BR': 'O começo é a parte mais importante do trabalho.',
    },
    author: western('Plato', '플라톤', 'プラトン', '柏拉图', {
      es: 'Platón',
      fr: 'Platon',
      de: 'Platon',
      'pt-BR': 'Platão',
    }),
  },
  {
    id: 'syrus-practice',
    originalLanguage: 'la',
    originalText: 'Usus est optimus magister',
    source: 'Publilius Syrus, Sententiae (1st century BC)',
    published: ['en'],
    translations: {
      en: 'Practice is the best of all instructors.',
      ko: '연습이 가장 좋은 스승이다.',
      ja: '練習こそ最良の師である。',
      'zh-CN': '练习是最好的老师。',
      es: 'La práctica es el mejor de los maestros.',
      fr: 'La pratique est le meilleur des maîtres.',
      de: 'Übung ist der beste Lehrmeister.',
      'pt-BR': 'A prática é o melhor dos mestres.',
    },
    author: western(
      'Publilius Syrus',
      '푸블릴리우스 시루스',
      'プブリリウス・シルス',
      '普布利利乌斯·西鲁斯',
      { es: 'Publilio Siro', 'pt-BR': 'Publílio Siro' },
    ),
  },
  {
    id: 'japanese-seven-eight',
    originalLanguage: 'ja',
    originalText: '七転び八起き',
    source: 'Japanese proverb, recorded from the Edo period',
    published: ['ja'],
    translations: {
      en: 'Fall seven times, stand up eight.',
      ko: '일곱 번 넘어지면 여덟 번 일어난다.',
      ja: '七転び八起き。',
      'zh-CN': '跌倒七次，站起八次。',
      es: 'Cae siete veces, levántate ocho.',
      fr: 'Tombe sept fois, relève-toi huit.',
      de: 'Siebenmal fallen, achtmal aufstehen.',
      'pt-BR': 'Caia sete vezes, levante-se oito.',
    },
    author: PROVERB.japanese,
  },
  {
    id: 'korean-dust-mountain',
    originalLanguage: 'ko',
    originalText: '티끌 모아 태산',
    source: 'Korean proverb',
    published: ['ko'],
    translations: {
      en: 'Specks of dust gather to make a mountain.',
      ko: '티끌 모아 태산.',
      ja: 'ちりも積もれば山となる。',
      'zh-CN': '积尘成山。',
      es: 'Granos de polvo juntos hacen una montaña.',
      fr: 'Des grains de poussière rassemblés font une montagne.',
      de: 'Staubkörner sammeln sich zu einem Berg.',
      'pt-BR': 'Grãos de poeira juntos formam uma montanha.',
    },
    author: PROVERB.korean,
  },
  {
    id: 'latin-repetition',
    originalLanguage: 'la',
    originalText: 'Repetitio est mater studiorum',
    source: 'Latin proverb, medieval',
    published: ['en'],
    translations: {
      en: 'Repetition is the mother of learning.',
      ko: '반복은 배움의 어머니다.',
      ja: '反復は学びの母である。',
      'zh-CN': '重复是学习之母。',
      es: 'La repetición es la madre del aprendizaje.',
      fr: 'La répétition est la mère de l’apprentissage.',
      de: 'Wiederholung ist die Mutter des Lernens.',
      'pt-BR': 'A repetição é a mãe do aprendizado.',
    },
    author: PROVERB.latin,
  },
  {
    id: 'wittgenstein-limits',
    originalLanguage: 'de',
    originalText: 'Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.',
    source: 'Tractatus Logico-Philosophicus 5.6 (1922)',
    published: ['en', 'de'],
    translations: {
      en: 'The limits of my language mean the limits of my world.',
      ko: '내 언어의 한계가 내 세계의 한계다.',
      ja: '私の言語の限界が、私の世界の限界を意味する。',
      'zh-CN': '我的语言的界限，就是我的世界的界限。',
      es: 'Los límites de mi lenguaje son los límites de mi mundo.',
      fr: 'Les limites de mon langage signifient les limites de mon monde.',
      de: 'Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.',
      'pt-BR': 'Os limites da minha linguagem são os limites do meu mundo.',
    },
    author: western(
      'Ludwig Wittgenstein',
      '루트비히 비트겐슈타인',
      'ルートヴィヒ・ヴィトゲンシュタイン',
      '路德维希·维特根斯坦',
    ),
  },
  {
    id: 'adams-ardour',
    originalLanguage: 'en',
    originalText:
      'Learning is not attained by chance; it must be sought for with ardour and attended to with diligence.',
    source: 'Abigail Adams, letter to John Quincy Adams, 8 May 1780',
    published: ['en'],
    translations: {
      en: 'Learning is not attained by chance; it must be sought for with ardour and attended to with diligence.',
      ko: '배움은 우연히 얻어지지 않는다. 열의로 구하고 부지런히 돌보아야 한다.',
      ja: '学びは偶然には得られない。熱意をもって求め、勤勉に育てねばならない。',
      'zh-CN': '学问不是偶然得来的，必须热切地追求，勤勉地守护。',
      es: 'El saber no se alcanza por azar; hay que buscarlo con ardor y cuidarlo con diligencia.',
      fr: 'Le savoir ne s’obtient pas par hasard ; il faut le chercher avec ardeur et l’entretenir avec diligence.',
      de: 'Wissen erlangt man nicht durch Zufall; man muss es mit Eifer suchen und mit Fleiß pflegen.',
      'pt-BR': 'O saber não se alcança por acaso; é preciso buscá-lo com ardor e cuidá-lo com diligência.',
    },
    author: western('Abigail Adams', '애비게일 애덤스', 'アビゲイル・アダムズ', '阿比盖尔·亚当斯'),
  },
  {
    id: 'leonardo-desire',
    originalLanguage: 'it',
    originalText:
      'Lo studio senza desiderio guasta la memoria, e non ritiene cosa ch’ella pigli.',
    source: 'The Notebooks of Leonardo da Vinci (c. 1500)',
    published: ['en'],
    translations: {
      en: 'Study without desire spoils the memory, and it retains nothing that it takes in.',
      ko: '바라는 마음 없는 공부는 기억을 망치고, 받아들인 것을 하나도 붙잡지 못한다.',
      ja: '望みのない学びは記憶を損ない、取り入れたものを何ひとつとどめない。',
      'zh-CN': '没有渴望的学习会损害记忆，学到的东西一样也留不住。',
      es: 'El estudio sin deseo estropea la memoria y no retiene nada de lo que recibe.',
      fr: 'L’étude sans désir gâte la mémoire et ne retient rien de ce qu’elle reçoit.',
      de: 'Lernen ohne Verlangen verdirbt das Gedächtnis und behält nichts von dem, was es aufnimmt.',
      'pt-BR': 'O estudo sem desejo estraga a memória e não retém nada do que recebe.',
    },
    author: western(
      'Leonardo da Vinci',
      '레오나르도 다빈치',
      'レオナルド・ダ・ヴィンチ',
      '列奥纳多·达·芬奇',
      { fr: 'Léonard de Vinci' },
    ),
  },
  {
    id: 'korean-start-half',
    originalLanguage: 'ko',
    originalText: '시작이 반이다',
    source: 'Korean proverb',
    published: ['ko'],
    translations: {
      en: 'Starting is half of it.',
      ko: '시작이 반이다.',
      ja: '始めれば半分終わったも同じ。',
      'zh-CN': '开始就是成功了一半。',
      es: 'Empezar es la mitad del camino.',
      fr: 'Commencer, c’est déjà la moitié.',
      de: 'Anfangen ist schon die Hälfte.',
      'pt-BR': 'Começar já é metade.',
    },
    author: PROVERB.korean,
  },
  {
    id: 'korean-thousand-li',
    originalLanguage: 'ko',
    originalText: '천 리 길도 한 걸음부터',
    source: 'Korean proverb',
    published: ['ko'],
    translations: {
      en: 'Even a thousand-li road begins with one step.',
      ko: '천 리 길도 한 걸음부터.',
      ja: '千里の道も一歩から始まる。',
      'zh-CN': '千里之路也从一步开始。',
      es: 'Incluso un camino de mil li empieza con un paso.',
      fr: 'Même une route de mille li commence par un pas.',
      de: 'Auch ein Weg von tausend Li beginnt mit einem Schritt.',
      'pt-BR': 'Até um caminho de mil li começa com um passo.',
    },
    author: PROVERB.korean,
  },
  {
    id: 'joyce-portals',
    originalLanguage: 'en',
    originalText: 'His errors are volitional and are the portals of discovery.',
    source: 'James Joyce, Ulysses (1922)',
    published: ['en'],
    translations: {
      en: 'His errors are volitional and are the portals of discovery.',
      ko: '그의 실수는 스스로 택한 것이며, 발견으로 들어가는 문이다.',
      ja: '彼の過ちは自ら選んだものであり、発見への入口である。',
      'zh-CN': '他的错误出于自愿，是通往发现的门。',
      es: 'Sus errores son voluntarios y son los portales del descubrimiento.',
      fr: 'Ses erreurs sont volontaires et sont les portes de la découverte.',
      de: 'Seine Fehler sind gewollt und sind die Tore der Entdeckung.',
      'pt-BR': 'Seus erros são voluntários e são os portais da descoberta.',
    },
    author: western('James Joyce', '제임스 조이스', 'ジェイムズ・ジョイス', '詹姆斯·乔伊斯'),
  },
];

// --- Reading one ---------------------------------------------------------------

export interface RenderedQuote {
  text: string;
  author: string;
  /** How this line relates to what the author wrote. */
  attribution: QuoteAttribution;
  /**
   * The original, when it is worth showing beside the translation.
   *
   * Null when the learner's language *is* the original language — printing the
   * same sentence twice is not a design, it is a bug with a stylesheet.
   */
  original: { text: string; lang: string } | null;
}

/**
 * One quotation, in the learner's language.
 *
 * Never falls back to English: every row carries every locale, and
 * `quotes.test.ts` is what keeps that true. A missing translation would throw
 * here rather than quietly showing English, because a silent fallback is how a
 * locale ships 90% translated and nobody notices.
 */
export function renderQuote(quote: LearningQuote, locale: string): RenderedQuote {
  const text = quote.translations[locale];
  if (!text) throw new Error(`quote ${quote.id} has no ${locale} translation`);

  const attribution: QuoteAttribution =
    locale === quote.originalLanguage || baseOf(locale) === quote.originalLanguage
      ? 'original'
      : quote.published?.includes(locale)
        ? 'published'
        : 'ours';

  return {
    text,
    author: quote.author[locale] ?? quote.author.en!,
    attribution,
    original:
      attribution === 'original'
        ? null
        : { text: quote.originalText, lang: quote.originalLanguage },
  };
}

function baseOf(locale: string): string {
  return locale.split('-')[0]!;
}

// --- Rotation ----------------------------------------------------------------

/**
 * How many recently-shown quotes to remember.
 *
 * One short of the set, so the rotation walks the whole list before anything
 * repeats — a shuffled bag rather than a die. Picking at random each launch
 * would show the same line twice in a row about one time in ten, which is
 * exactly often enough for a learner to notice and conclude there is only one.
 */
const MEMORY = LEARNING_QUOTES.length - 1;

export const QUOTE_HISTORY_KEY = 'hangyul_ganada:quote-history';

/**
 * The next quote, given the ones already seen.
 *
 * Pure and total: the caller supplies the history and the randomness, so the
 * behaviour is testable and the module never reads a clock, a store or
 * `Math.random` on its own. Returns the chosen quote and the history to save.
 */
export function nextQuote(
  history: readonly string[],
  random: number = Math.random(),
): { quote: LearningQuote; history: string[] } {
  const recent = history.slice(-MEMORY);
  const fresh = LEARNING_QUOTES.filter((q) => !recent.includes(q.id));
  // `fresh` is never empty: `recent` holds at most one fewer id than the set.
  const pool = fresh.length > 0 ? fresh : LEARNING_QUOTES;
  const quote = pool[Math.min(pool.length - 1, Math.floor(random * pool.length))]!;
  return { quote, history: [...recent, quote.id].slice(-MEMORY) };
}

/**
 * Reads the rotation history from local storage.
 *
 * `localStorage` rather than the IndexedDB profile, deliberately: which quote
 * you last saw is not learning history, it must be readable synchronously on
 * the first render so the line does not appear a frame late, and losing it
 * costs nothing but one possible repeat.
 */
export function readQuoteHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(QUOTE_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeQuoteHistory(history: readonly string[]): void {
  try {
    window.localStorage.setItem(QUOTE_HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* private mode: the rotation degrades to random, which is still fine */
  }
}

/**
 * The quotation for this run of the app.
 *
 * Chosen once and memoised at module scope rather than in component state, so
 * it survives navigating away from Home and back: a line that changed every
 * time the learner tapped the Home tab would read as a slot machine rather than
 * as something the app meant to say to them today. It resets when the app does,
 * which is the cadence a learner actually experiences.
 */
let sessionQuote: LearningQuote | null = null;

export function quoteForThisSession(): LearningQuote {
  if (sessionQuote) return sessionQuote;
  const { quote, history } = nextQuote(readQuoteHistory());
  writeQuoteHistory(history);
  sessionQuote = quote;
  return quote;
}

/** Test seam: forgets this run's choice so the next call picks again. */
export function resetSessionQuote(): void {
  sessionQuote = null;
}
