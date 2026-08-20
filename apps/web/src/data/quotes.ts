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
export type QuoteAttribution = "original" | "published" | "ours";

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
export const QUOTE_LOCALES = [
  "en",
  "ko",
  "ja",
  "zh-CN",
  "es",
  "fr",
  "de",
  "pt-BR",
  "vi",
  "th",
  "ar",
  "bn",
  "cs",
  "el",
  "fil",
  "hi",
  "hu",
  "id",
  "it",
  "kk",
  "ky",
  "mn",
  "nl",
  "pl",
  "ro",
  "ru",
  "sv",
  "ta",
  "te",
  "tr",
  "uk",
  "uz",
] as const;

/** Descriptors that are phrases rather than names, written out per language. */
const PROVERB = {
  korean: {
    en: "Korean proverb",
    ko: "한국 속담",
    ja: "韓国のことわざ",
    "zh-CN": "韩国谚语",
    es: "Proverbio coreano",
    fr: "Proverbe coréen",
    de: "Koreanisches Sprichwort",
    "pt-BR": "Provérbio coreano",
    vi: "Tục ngữ Hàn Quốc",
    th: "สุภาษิตเกาหลี",
    ar: "مثل كوري",
    bn: "কোরীয় প্রবাদ",
    cs: "Korejské přísloví",
    el: "Κορεατική παροιμία",
    fil: "Salawikaing Koreano",
    hi: "कोरियाई कहावत",
    hu: "Koreai közmondás",
    id: "Peribahasa Korea",
    it: "Proverbio coreano",
    kk: "Корей мақалы",
    ky: "Корей макалы",
    mn: "Солонгос зүйр үг",
    nl: "Koreaans spreekwoord",
    pl: "Przysłowie koreańskie",
    ro: "Proverb coreean",
    ru: "Корейская пословица",
    sv: "Koreanskt ordspråk",
    ta: "கொரியப் பழமொழி",
    te: "కొరియా సామెత",
    tr: "Kore atasözü",
    uk: "Корейське прислів’я",
    uz: "Koreys maqoli",
  },
  japanese: {
    en: "Japanese proverb",
    ko: "일본 속담",
    ja: "日本のことわざ",
    "zh-CN": "日本谚语",
    es: "Proverbio japonés",
    fr: "Proverbe japonais",
    de: "Japanisches Sprichwort",
    "pt-BR": "Provérbio japonês",
    vi: "Tục ngữ Nhật Bản",
    th: "สุภาษิตญี่ปุ่น",
    ar: "مثل ياباني",
    bn: "জাপানি প্রবাদ",
    cs: "Japonské přísloví",
    el: "Ιαπωνική παροιμία",
    fil: "Salawikaing Hapon",
    hi: "जापानी कहावत",
    hu: "Japán közmondás",
    id: "Peribahasa Jepang",
    it: "Proverbio giapponese",
    kk: "Жапон мақалы",
    ky: "Жапон макалы",
    mn: "Япон зүйр үг",
    nl: "Japans spreekwoord",
    pl: "Przysłowie japońskie",
    ro: "Proverb japonez",
    ru: "Японская пословица",
    sv: "Japanskt ordspråk",
    ta: "ஜப்பானியப் பழமொழி",
    te: "జపాన్ సామెత",
    tr: "Japon atasözü",
    uk: "Японське прислів’я",
    uz: "Yapon maqoli",
  },
  latin: {
    en: "Latin proverb",
    ko: "라틴 속담",
    ja: "ラテン語のことわざ",
    "zh-CN": "拉丁谚语",
    es: "Proverbio latino",
    fr: "Proverbe latin",
    de: "Lateinisches Sprichwort",
    "pt-BR": "Provérbio latino",
    vi: "Ngạn ngữ La-tinh",
    th: "สุภาษิตละติน",
    ar: "مثل لاتيني",
    bn: "ল্যাটিন প্রবাদ",
    cs: "Latinské přísloví",
    el: "Λατινική παροιμία",
    fil: "Salawikaing Latin",
    hi: "लातीनी कहावत",
    hu: "Latin közmondás",
    id: "Peribahasa Latin",
    it: "Proverbio latino",
    kk: "Латын мақалы",
    ky: "Латын макалы",
    mn: "Латин зүйр үг",
    nl: "Latijns spreekwoord",
    pl: "Przysłowie łacińskie",
    ro: "Proverb latin",
    ru: "Латинская пословица",
    sv: "Latinskt ordspråk",
    ta: "இலத்தீன் பழமொழி",
    te: "లాటిన్ సామెత",
    tr: "Latin atasözü",
    uk: "Латинське прислів’я",
    uz: "Lotin maqoli",
  },
} as const;

/**
 * A name with no conventional local form outside CJK and Korean.
 *
 * Vietnamese and Thai take the Latin form for the same reason the Romance
 * languages do: this file's rule is that a name is written in the conventional
 * local form *where the language has one*, and is otherwise left alone. Modern
 * Vietnamese and Thai writing both print Western names in Latin script, and
 * inventing a Thai spelling of "Publilius Syrus" here would be a
 * machine-transliteration presented as an attribution — the exact thing this
 * helper exists to avoid. Where a genuine local form does exist it is passed as
 * an override, the same as `Lao-Tse` is for Spanish.
 */
function western(
  latin: string,
  ko: string,
  ja: string,
  zh: string,
  overrides: Partial<Record<string, string>> = {},
): Record<string, string> {
  const roman = Object.fromEntries(
    LATIN_SCRIPT_LOCALES.map((code) => [code, latin]),
  );
  return {
    ...roman,
    ko,
    ja,
    "zh-CN": zh,
    ...overrides,
  };
}

/**
 * Interface languages written in the Latin alphabet, which take the Latin form
 * of a Western name unchanged.
 *
 * Filipino, Indonesian, Vietnamese and the European languages all print
 * "Wittgenstein" as "Wittgenstein". The languages *not* here — Arabic, Greek,
 * the Cyrillic four, the four Indic scripts, Thai — either have a conventional
 * local spelling, which is passed as an override, or take the Latin form as a
 * deliberate choice recorded in the same place. Nothing is transliterated by
 * rule: a machine-transliterated name is a misattribution with extra steps.
 *
 * Thai is in this list rather than in an override because modern Thai writing
 * prints Western names in Latin script; the same is true of Vietnamese.
 */
const LATIN_SCRIPT_LOCALES = [
  "en",
  "es",
  "fr",
  "de",
  "pt-BR",
  "vi",
  "th",
  "cs",
  "fil",
  "hu",
  "id",
  "it",
  "nl",
  "pl",
  "ro",
  "sv",
  "tr",
  "uz",
] as const;

export const LEARNING_QUOTES: LearningQuote[] = [
  {
    id: "laozi-journey",
    originalLanguage: "zh",
    originalText: "千里之行，始於足下",
    source: "Tao Te Ching, chapter 64 (c. 4th century BC)",
    published: ["en", "zh-CN"],
    translations: {
      en: "A journey of a thousand miles begins with a single step.",
      ko: "천 리 길도 발밑에서 시작된다.",
      ja: "千里の道も一歩から。",
      "zh-CN": "千里之行，始于足下。",
      es: "Un viaje de mil leguas comienza con un solo paso.",
      fr: "Un voyage de mille lieues commence par un seul pas.",
      de: "Eine Reise von tausend Meilen beginnt mit einem einzigen Schritt.",
      "pt-BR": "Uma jornada de mil léguas começa com um único passo.",
      vi: "Hành trình ngàn dặm bắt đầu từ một bước chân.",
      th: "การเดินทางพันลี้เริ่มต้นที่ก้าวแรก",
      ar: "رحلة الألف ميل تبدأ بخطوة واحدة.",
      bn: "হাজার মাইলের যাত্রা শুরু হয় একটিমাত্র পদক্ষেপে।",
      cs: "Cesta dlouhá tisíc mil začíná jediným krokem.",
      el: "Το ταξίδι των χιλίων μιλίων αρχίζει με ένα μόνο βήμα.",
      fil: "Ang paglalakbay na sanlibong milya ay nagsisimula sa isang hakbang.",
      hi: "हज़ार मील का सफ़र एक ही क़दम से शुरू होता है।",
      hu: "Az ezermérföldes út is egyetlen lépéssel kezdődik.",
      id: "Perjalanan seribu mil dimulai dengan satu langkah.",
      it: "Un viaggio di mille miglia comincia con un solo passo.",
      kk: "Мың шақырымдық жол бір қадамнан басталады.",
      ky: "Миң чакырымдык жол бир кадамдан башталат.",
      mn: "Мянган бээрийн зам ганц алхмаас эхэлдэг.",
      nl: "Een reis van duizend mijl begint met één stap.",
      pl: "Podróż tysiąca mil zaczyna się od jednego kroku.",
      ro: "O călătorie de o mie de mile începe cu un singur pas.",
      ru: "Путь в тысячу ли начинается с одного шага.",
      sv: "En resa på tusen mil börjar med ett enda steg.",
      ta: "ஆயிரம் மைல் பயணம் ஒரே ஓர் அடியில் தொடங்குகிறது.",
      te: "వేయి మైళ్ల ప్రయాణం ఒక్క అడుగుతోనే మొదలవుతుంది.",
      tr: "Bin millik yolculuk tek bir adımla başlar.",
      uk: "Подорож у тисячу лі починається з одного кроку.",
      uz: "Ming chaqirimlik yo‘l bitta qadamdan boshlanadi.",
    },
    author: western("Laozi", "노자", "老子", "老子", {
      es: "Lao-Tse",
      "pt-BR": "Lao-Tsé",
      ar: "لاو تسي",
      bn: "লাওৎসে",
      el: "Λάο Τσε",
      hi: "लाओत्सू",
      kk: "Лао-цзы",
      ky: "Лао-цзы",
      mn: "Лао Зи",
      ru: "Лао-цзы",
      ta: "லாவோ ட்சு",
      te: "లావోత్సు",
      uk: "Лао-цзи",
    }),
  },
  {
    id: "plato-beginning",
    originalLanguage: "grc",
    originalText: "ἀρχὴ γὰρ παντὸς ἔργου μέγιστον",
    source: "Republic, Book II, 377a (c. 375 BC)",
    published: ["en"],
    translations: {
      en: "The beginning is the most important part of the work.",
      ko: "어떤 일이든 시작이 가장 중요하다.",
      ja: "どんな仕事でも、始まりがいちばん大切だ。",
      "zh-CN": "任何事情，开头最重要。",
      es: "El principio es la parte más importante de la obra.",
      fr: "Le commencement est la partie la plus importante du travail.",
      de: "Der Anfang ist der wichtigste Teil der Arbeit.",
      "pt-BR": "O começo é a parte mais importante do trabalho.",
      vi: "Khởi đầu là phần quan trọng nhất của mọi việc.",
      th: "การเริ่มต้นคือส่วนที่สำคัญที่สุดของงาน",
      ar: "البداية هي أهم ما في العمل.",
      bn: "কাজের সবচেয়ে গুরুত্বপূর্ণ অংশ হলো তার শুরু।",
      cs: "Začátek je nejdůležitější částí díla.",
      el: "Η αρχή είναι το σημαντικότερο μέρος κάθε έργου.",
      fil: "Ang simula ang pinakamahalagang bahagi ng gawain.",
      hi: "किसी भी काम का सबसे ज़रूरी हिस्सा उसकी शुरुआत है।",
      hu: "A kezdet a munka legfontosabb része.",
      id: "Permulaan adalah bagian terpenting dari sebuah pekerjaan.",
      it: "L’inizio è la parte più importante dell’opera.",
      kk: "Кез келген істің ең маңыздысы — бастамасы.",
      ky: "Ар бир иштин эң маанилүүсү — башталышы.",
      mn: "Аливаа ажлын хамгийн чухал хэсэг нь эхлэл юм.",
      nl: "Het begin is het belangrijkste deel van het werk.",
      pl: "Początek jest najważniejszą częścią dzieła.",
      ro: "Începutul este partea cea mai importantă a lucrării.",
      ru: "Начало — важнейшая часть всякого дела.",
      sv: "Början är den viktigaste delen av arbetet.",
      ta: "எந்த வேலையிலும் தொடக்கமே மிக முக்கியமான பகுதி.",
      te: "ఏ పనికైనా మొదలు పెట్టడమే అత్యంత ముఖ్యమైన భాగం.",
      tr: "Her işin en önemli parçası başlangıcıdır.",
      uk: "Початок — найважливіша частина будь-якої справи.",
      uz: "Har qanday ishning eng muhimi — boshlanishi.",
    },
    author: western("Plato", "플라톤", "プラトン", "柏拉图", {
      ar: "أفلاطون",
      bn: "প্লেটো",
      el: "Πλάτων",
      hi: "प्लेटो",
      kk: "Платон",
      ky: "Платон",
      mn: "Платон",
      ru: "Платон",
      ta: "பிளேட்டோ",
      te: "ప్లేటో",
      uk: "Платон",
      es: "Platón",
      fr: "Platon",
      de: "Platon",
      "pt-BR": "Platão",
    }),
  },
  {
    id: "syrus-practice",
    originalLanguage: "la",
    originalText: "Usus est optimus magister",
    source: "Publilius Syrus, Sententiae (1st century BC)",
    published: ["en"],
    translations: {
      en: "Practice is the best of all instructors.",
      ko: "연습이 가장 좋은 스승이다.",
      ja: "練習こそ最良の師である。",
      "zh-CN": "练习是最好的老师。",
      es: "La práctica es el mejor de los maestros.",
      fr: "La pratique est le meilleur des maîtres.",
      de: "Übung ist der beste Lehrmeister.",
      "pt-BR": "A prática é o melhor dos mestres.",
      vi: "Luyện tập là người thầy giỏi nhất.",
      th: "การฝึกฝนคือครูที่ดีที่สุด",
      ar: "الممارسة خير المعلّمين.",
      bn: "অভ্যাসই সব শিক্ষকের সেরা।",
      cs: "Cvik je nejlepší ze všech učitelů.",
      el: "Η εξάσκηση είναι ο καλύτερος από όλους τους δασκάλους.",
      fil: "Ang pagsasanay ang pinakamahusay sa lahat ng guro.",
      hi: "अभ्यास सब गुरुओं में सबसे बड़ा गुरु है।",
      hu: "A gyakorlás a legjobb tanítómester.",
      id: "Latihan adalah guru yang terbaik.",
      it: "La pratica è il migliore di tutti i maestri.",
      kk: "Жаттығу — ұстаздың ең жақсысы.",
      ky: "Машыгуу — бардык устаттардын эң жакшысы.",
      mn: "Дадлага бол багш нарын дундаас хамгийн шилдэг нь.",
      nl: "Oefening is de beste van alle leermeesters.",
      pl: "Ćwiczenie jest najlepszym z nauczycieli.",
      ro: "Exercițiul este cel mai bun dintre toți dascălii.",
      ru: "Упражнение — лучший из учителей.",
      sv: "Övning är den bästa av alla lärare.",
      ta: "பயிற்சியே ஆசிரியர்கள் அனைவரிலும் சிறந்தது.",
      te: "సాధనే గురువులందరిలో అత్యుత్తమమైనది.",
      tr: "Alıştırma, öğretmenlerin en iyisidir.",
      uk: "Вправляння — найкращий з учителів.",
      uz: "Mashq — ustozlarning eng yaxshisi.",
    },
    author: western(
      "Publilius Syrus",
      "푸블릴리우스 시루스",
      "プブリリウス・シルス",
      "普布利利乌斯·西鲁斯",
      {
        es: "Publilio Siro",
        "pt-BR": "Publílio Siro",
        ar: "بوبليليوس سيروس",
        bn: "পুবলিলিউস সিরাস",
        el: "Πούβλιος Σύρος",
        hi: "पुब्लिलियस सायरस",
        kk: "Публилий Сир",
        ky: "Публилий Сир",
        mn: "Публилиус Сирус",
        ru: "Публилий Сир",
        ta: "புப்லிலியஸ் சைரஸ்",
        te: "పబ్లిలియస్ సైరస్",
        uk: "Публілій Сір",
      },
    ),
  },
  {
    id: "japanese-seven-eight",
    originalLanguage: "ja",
    originalText: "七転び八起き",
    source: "Japanese proverb, recorded from the Edo period",
    published: ["ja"],
    translations: {
      en: "Fall seven times, stand up eight.",
      ko: "일곱 번 넘어지면 여덟 번 일어난다.",
      ja: "七転び八起き。",
      "zh-CN": "跌倒七次，站起八次。",
      es: "Cae siete veces, levántate ocho.",
      fr: "Tombe sept fois, relève-toi huit.",
      de: "Siebenmal fallen, achtmal aufstehen.",
      "pt-BR": "Caia sete vezes, levante-se oito.",
      vi: "Ngã bảy lần, đứng dậy tám lần.",
      th: "ล้มเจ็ดครั้ง ลุกขึ้นแปดครั้ง",
      ar: "اسقط سبعًا وانهض ثمانيًا.",
      bn: "সাতবার পড়ো, আটবার উঠে দাঁড়াও।",
      cs: "Sedmkrát padni, osmkrát vstaň.",
      el: "Πέσε εφτά φορές, σήκω οχτώ.",
      fil: "Matumba nang pito, bumangon nang walo.",
      hi: "सात बार गिरो, आठवीं बार उठो।",
      hu: "Ess el hétszer, kelj föl nyolcszor.",
      id: "Jatuh tujuh kali, bangkit delapan kali.",
      it: "Cadi sette volte, rialzati otto.",
      kk: "Жеті рет құла, сегіз рет тұр.",
      ky: "Жети жолу жыгыл, сегиз жолу тур.",
      mn: "Долоо унаад найм бос.",
      nl: "Val zeven keer, sta acht keer op.",
      pl: "Upadnij siedem razy, wstań osiem.",
      ro: "Cazi de șapte ori, ridică-te de opt.",
      ru: "Упади семь раз, поднимись восемь.",
      sv: "Fall sju gånger, res dig åtta.",
      ta: "ஏழு முறை விழு, எட்டு முறை எழு.",
      te: "ఏడుసార్లు పడు, ఎనిమిదిసార్లు లే.",
      tr: "Yedi kez düş, sekiz kez kalk.",
      uk: "Упади сім разів, підведися вісім.",
      uz: "Yetti marta yiqil, sakkiz marta tur.",
    },
    author: PROVERB.japanese,
  },
  {
    id: "korean-dust-mountain",
    originalLanguage: "ko",
    originalText: "티끌 모아 태산",
    source: "Korean proverb",
    published: ["ko"],
    translations: {
      en: "Specks of dust gather to make a mountain.",
      ko: "티끌 모아 태산.",
      ja: "ちりも積もれば山となる。",
      "zh-CN": "积尘成山。",
      es: "Granos de polvo juntos hacen una montaña.",
      fr: "Des grains de poussière rassemblés font une montagne.",
      de: "Staubkörner sammeln sich zu einem Berg.",
      "pt-BR": "Grãos de poeira juntos formam uma montanha.",
      vi: "Từng hạt bụi góp lại cũng thành núi.",
      th: "ฝุ่นทีละเม็ดรวมกันเป็นภูเขาได้",
      ar: "ذرّات الغبار تجتمع فتصير جبلًا.",
      bn: "ধুলোর কণা জমেই পাহাড় হয়।",
      cs: "Zrnka prachu se nasypou a je z nich hora.",
      el: "Οι κόκκοι της σκόνης μαζεύονται και γίνονται βουνό.",
      fil: "Ang mga alikabok, kapag natipon, ay nagiging bundok.",
      hi: "धूल के कण जुड़ते-जुड़ते पहाड़ बन जाते हैं।",
      hu: "A porszemekből is hegy lesz, ha összegyűlnek.",
      id: "Butir-butir debu berkumpul menjadi gunung.",
      it: "I granelli di polvere, messi insieme, fanno una montagna.",
      kk: "Шаң түйірлері жиналып тау болады.",
      ky: "Чаң бүртүкчөлөрү чогулуп тоо болот.",
      mn: "Тоосны ширхгүүд хуримтлагдаж уул болдог.",
      nl: "Stofjes bij elkaar maken een berg.",
      pl: "Z drobin kurzu zbiera się góra.",
      ro: "Firele de praf adunate fac un munte.",
      ru: "Пылинка к пылинке — вырастет гора.",
      sv: "Dammkorn samlas och blir ett berg.",
      ta: "தூசித் துகள்கள் சேர்ந்து மலையாகும்.",
      te: "ధూళి రేణువులు కూడితే కొండ అవుతుంది.",
      tr: "Toz zerreleri birikir, dağ olur.",
      uk: "Порошинка до порошинки — і виросте гора.",
      uz: "Chang zarralari yig‘ilib tog‘ bo‘ladi.",
    },
    author: PROVERB.korean,
  },
  {
    id: "latin-repetition",
    originalLanguage: "la",
    originalText: "Repetitio est mater studiorum",
    source: "Latin proverb, medieval",
    published: ["en"],
    translations: {
      en: "Repetition is the mother of learning.",
      ko: "반복은 배움의 어머니다.",
      ja: "反復は学びの母である。",
      "zh-CN": "重复是学习之母。",
      es: "La repetición es la madre del aprendizaje.",
      fr: "La répétition est la mère de l’apprentissage.",
      de: "Wiederholung ist die Mutter des Lernens.",
      "pt-BR": "A repetição é a mãe do aprendizado.",
      vi: "Lặp lại là mẹ của sự học.",
      th: "การทำซ้ำคือแม่ของการเรียนรู้",
      ar: "التكرار أمّ التعلّم.",
      bn: "পুনরাবৃত্তিই শেখার জননী।",
      cs: "Opakování je matka moudrosti.",
      el: "Η επανάληψη είναι η μητέρα της μάθησης.",
      fil: "Ang pag-uulit ang ina ng pagkatuto.",
      hi: "दोहराना सीखने की जननी है।",
      hu: "Ismétlés a tudás anyja.",
      id: "Pengulangan adalah ibu dari segala pembelajaran.",
      it: "La ripetizione è la madre dell’apprendimento.",
      kk: "Қайталау — оқудың анасы.",
      ky: "Кайталоо — билимдин энеси.",
      mn: "Давталт бол сурахуйн эх.",
      nl: "Herhaling is de moeder van het leren.",
      pl: "Powtarzanie jest matką nauki.",
      ro: "Repetiția este mama învățăturii.",
      ru: "Повторение — мать учения.",
      sv: "Repetition är all inlärnings moder.",
      ta: "மீண்டும் மீண்டும் செய்வதே கற்றலின் தாய்.",
      te: "పునరావృత్తే నేర్చుకోవడానికి తల్లి.",
      tr: "Tekrar, öğrenmenin anasıdır.",
      uk: "Повторення — мати навчання.",
      uz: "Takrorlash — bilimning onasi.",
    },
    author: PROVERB.latin,
  },
  {
    id: "wittgenstein-limits",
    originalLanguage: "de",
    originalText:
      "Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.",
    source: "Tractatus Logico-Philosophicus 5.6 (1922)",
    published: ["en", "de"],
    translations: {
      en: "The limits of my language mean the limits of my world.",
      ko: "내 언어의 한계가 내 세계의 한계다.",
      ja: "私の言語の限界が、私の世界の限界を意味する。",
      "zh-CN": "我的语言的界限，就是我的世界的界限。",
      es: "Los límites de mi lenguaje son los límites de mi mundo.",
      fr: "Les limites de mon langage signifient les limites de mon monde.",
      de: "Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.",
      "pt-BR": "Os limites da minha linguagem são os limites do meu mundo.",
      vi: "Giới hạn của ngôn ngữ tôi là giới hạn của thế giới tôi.",
      th: "ขอบเขตของภาษาของฉันคือขอบเขตของโลกของฉัน",
      ar: "حدود لغتي هي حدود عالمي.",
      bn: "আমার ভাষার সীমাই আমার জগতের সীমা।",
      cs: "Hranice mého jazyka jsou hranicemi mého světa.",
      el: "Τα όρια της γλώσσας μου είναι τα όρια του κόσμου μου.",
      fil: "Ang hangganan ng aking wika ang hangganan ng aking mundo.",
      hi: "मेरी भाषा की सीमाएँ ही मेरी दुनिया की सीमाएँ हैं।",
      hu: "Nyelvem határai világom határai.",
      id: "Batas bahasaku adalah batas duniaku.",
      it: "I limiti del mio linguaggio sono i limiti del mio mondo.",
      kk: "Тілімнің шегі — дүниемнің шегі.",
      ky: "Тилимдин чеги — дүйнөмдүн чеги.",
      mn: "Хэлний минь хязгаар бол ертөнцийн минь хязгаар.",
      nl: "De grenzen van mijn taal zijn de grenzen van mijn wereld.",
      pl: "Granice mego języka są granicami mego świata.",
      ro: "Limitele limbii mele sunt limitele lumii mele.",
      ru: "Границы моего языка суть границы моего мира.",
      sv: "Mitt språks gränser är min världs gränser.",
      ta: "என் மொழியின் எல்லைகளே என் உலகின் எல்லைகள்.",
      te: "నా భాష హద్దులే నా ప్రపంచపు హద్దులు.",
      tr: "Dilimin sınırları dünyamın sınırlarıdır.",
      uk: "Межі моєї мови — межі мого світу.",
      uz: "Tilimning chegarasi — dunyomning chegarasi.",
    },
    author: western(
      "Ludwig Wittgenstein",
      "루트비히 비트겐슈타인",
      "ルートヴィヒ・ヴィトゲンシュタイン",
      "路德维希·维特根斯坦",
      {
        ar: "لودفيغ فتغنشتاين",
        bn: "লুডভিগ ভিটগেনস্টাইন",
        el: "Λούντβιχ Βίτγκενσταϊν",
        hi: "लुडविग विट्गेन्स्टाइन",
        kk: "Людвиг Витгенштейн",
        ky: "Людвиг Витгенштейн",
        mn: "Людвиг Витгенштейн",
        ru: "Людвиг Витгенштейн",
        ta: "லுட்விக் விட்கென்ஸ்டைன்",
        te: "లుడ్విగ్ విట్‌గెన్‌స్టీన్",
        uk: "Людвіг Вітґенштайн",
      },
    ),
  },
  {
    id: "adams-ardour",
    originalLanguage: "en",
    originalText:
      "Learning is not attained by chance; it must be sought for with ardour and attended to with diligence.",
    source: "Abigail Adams, letter to John Quincy Adams, 8 May 1780",
    published: ["en"],
    translations: {
      en: "Learning is not attained by chance; it must be sought for with ardour and attended to with diligence.",
      ko: "배움은 우연히 얻어지지 않는다. 열의로 구하고 부지런히 돌보아야 한다.",
      ja: "学びは偶然には得られない。熱意をもって求め、勤勉に育てねばならない。",
      "zh-CN": "学问不是偶然得来的，必须热切地追求，勤勉地守护。",
      es: "El saber no se alcanza por azar; hay que buscarlo con ardor y cuidarlo con diligencia.",
      fr: "Le savoir ne s’obtient pas par hasard ; il faut le chercher avec ardeur et l’entretenir avec diligence.",
      de: "Wissen erlangt man nicht durch Zufall; man muss es mit Eifer suchen und mit Fleiß pflegen.",
      "pt-BR":
        "O saber não se alcança por acaso; é preciso buscá-lo com ardor e cuidá-lo com diligência.",
      vi: "Học vấn không đến một cách tình cờ; phải tìm nó bằng nhiệt huyết và giữ nó bằng sự chuyên cần.",
      th: "ความรู้ไม่ได้มาโดยบังเอิญ ต้องแสวงหาด้วยใจที่ร้อนแรงและดูแลด้วยความเพียร",
      ar: "العلم لا يُنال بالمصادفة؛ يُطلب بشغف ويُرعى بمثابرة.",
      bn: "শেখা কখনও কাকতালীয়ভাবে আসে না; একে আগ্রহ দিয়ে খুঁজতে হয় আর অধ্যবসায় দিয়ে আগলে রাখতে হয়।",
      cs: "Učenost se nezískává náhodou; je třeba ji hledat se zápalem a pěstovat s pílí.",
      el: "Η μάθηση δεν έρχεται τυχαία· πρέπει να την αναζητάς με πάθος και να τη φροντίζεις με επιμέλεια.",
      fil: "Hindi natatamo ang karunungan sa pagkakataon; dapat itong hanapin nang may pananabik at alagaan nang may sipag.",
      hi: "विद्या संयोग से नहीं मिलती; उसे लगन से खोजना और परिश्रम से सँभालना पड़ता है।",
      hu: "A tudás nem a véletlen műve; hévvel kell keresni és szorgalommal ápolni.",
      id: "Ilmu tidak datang secara kebetulan; ia harus dicari dengan gairah dan dirawat dengan tekun.",
      it: "Il sapere non si ottiene per caso; va cercato con ardore e coltivato con diligenza.",
      kk: "Білім кездейсоқ келмейді; оны құлшыныспен іздеп, ыждаһатпен баптау керек.",
      ky: "Билим кокусунан келбейт; аны кызыгуу менен издеп, тырышчаактык менен багуу керек.",
      mn: "Мэдлэг санамсаргүй ирдэггүй; түүнийг тэмүүлэлтэйгээр эрж, хичээнгүйлэн арчлах ёстой.",
      nl: "Kennis krijg je niet bij toeval; je moet haar met vuur zoeken en met vlijt onderhouden.",
      pl: "Wiedzy nie zdobywa się przypadkiem; trzeba jej szukać z zapałem i pielęgnować ją pilnie.",
      ro: "Învățătura nu se dobândește din întâmplare; trebuie căutată cu ardoare și îngrijită cu sârguință.",
      ru: "Учение не даётся случайно; его надо искать с жаром и беречь с прилежанием.",
      sv: "Lärdom nås inte av en slump; den måste sökas med iver och vårdas med flit.",
      ta: "கல்வி தற்செயலாகக் கிடைப்பதில்லை; ஆர்வத்தோடு தேடி, விடாமுயற்சியோடு காக்க வேண்டும்.",
      te: "విద్య యాదృచ్ఛికంగా రాదు; దానిని ఆసక్తితో వెతికి, పట్టుదలతో కాపాడుకోవాలి.",
      tr: "Bilgi rastlantıyla elde edilmez; hevesle aranmalı, özenle beslenmelidir.",
      uk: "Учення не дається випадково; його треба шукати з запалом і плекати з ретельністю.",
      uz: "Bilim tasodifan kelmaydi; uni ishtiyoq bilan izlab, tirishqoqlik bilan asrash kerak.",
    },
    author: western(
      "Abigail Adams",
      "애비게일 애덤스",
      "アビゲイル・アダムズ",
      "阿比盖尔·亚当斯",
      {
        ar: "أبيغيل آدامز",
        bn: "অ্যাবিগেইল অ্যাডামস",
        el: "Αμπιγκέιλ Άνταμς",
        hi: "ऐबिगेल ऐडम्स",
        kk: "Эбигейл Адамс",
        ky: "Эбигейл Адамс",
        mn: "Абигайл Адамс",
        ru: "Эбигейл Адамс",
        ta: "அபிகெயில் ஆடம்ஸ்",
        te: "అబిగేల్ ఆడమ్స్",
        uk: "Ебіґейл Адамс",
      },
    ),
  },
  {
    id: "leonardo-desire",
    originalLanguage: "it",
    originalText:
      "Lo studio senza desiderio guasta la memoria, e non ritiene cosa ch’ella pigli.",
    source: "The Notebooks of Leonardo da Vinci (c. 1500)",
    published: ["en"],
    translations: {
      en: "Study without desire spoils the memory, and it retains nothing that it takes in.",
      ko: "바라는 마음 없는 공부는 기억을 망치고, 받아들인 것을 하나도 붙잡지 못한다.",
      ja: "望みのない学びは記憶を損ない、取り入れたものを何ひとつとどめない。",
      "zh-CN": "没有渴望的学习会损害记忆，学到的东西一样也留不住。",
      es: "El estudio sin deseo estropea la memoria y no retiene nada de lo que recibe.",
      fr: "L’étude sans désir gâte la mémoire et ne retient rien de ce qu’elle reçoit.",
      de: "Lernen ohne Verlangen verdirbt das Gedächtnis und behält nichts von dem, was es aufnimmt.",
      "pt-BR":
        "O estudo sem desejo estraga a memória e não retém nada do que recebe.",
      vi: "Học mà không ham thích thì làm hỏng trí nhớ, và chẳng giữ lại được gì.",
      th: "การเรียนโดยปราศจากความอยากรู้ทำลายความจำ และไม่เหลืออะไรไว้เลย",
      ar: "الدرس بلا رغبة يُفسد الذاكرة، فلا تحفظ شيئًا مما تتلقّاه.",
      bn: "ইচ্ছে ছাড়া পড়াশোনা স্মৃতিকে নষ্ট করে, আর যা নেয় তার কিছুই ধরে রাখে না।",
      cs: "Studium bez touhy kazí paměť a ta si pak neudrží nic z toho, co přijme.",
      el: "Η μελέτη χωρίς επιθυμία χαλάει τη μνήμη, κι εκείνη δεν κρατά τίποτε απ’ όσα δέχεται.",
      fil: "Ang pag-aaral na walang pagnanais ay sumisira sa alaala, at wala itong naiimbak sa natatanggap.",
      hi: "बिना चाह के पढ़ाई याददाश्त को बिगाड़ देती है, और वह जो लेती है उसमें से कुछ भी नहीं रखती।",
      hu: "A vágy nélküli tanulás megrontja az emlékezetet, s az semmit sem őriz meg abból, amit befogad.",
      id: "Belajar tanpa hasrat merusak ingatan, dan ingatan itu tak menyimpan apa pun yang diterimanya.",
      it: "Lo studio senza desiderio guasta la memoria, ed essa non ritiene nulla di quanto riceve.",
      kk: "Ықылассыз оқу жадты бүлдіреді, ол қабылдағанының ешқайсысын сақтамайды.",
      ky: "Каалоосуз окуу эсти бузат, ал кабыл алганынын эч бирин сактабайт.",
      mn: "Хүсэлгүй суралцах нь ойг мохоож, хүлээн авсныхаа юуг ч үлдээдэггүй.",
      nl: "Studeren zonder verlangen bederft het geheugen, en dat houdt niets vast van wat het opneemt.",
      pl: "Nauka bez pragnienia psuje pamięć, a ta nie zatrzymuje nic z tego, co przyjmuje.",
      ro: "Studiul fără dorință strică memoria, iar ea nu păstrează nimic din ce primește.",
      ru: "Учение без желания портит память, и она не удерживает ничего из принятого.",
      sv: "Studier utan lust fördärvar minnet, och det behåller ingenting av det som tas emot.",
      ta: "விருப்பமின்றிக் கற்பது நினைவாற்றலைக் கெடுக்கும்; அது பெற்றதில் எதையும் தக்கவைக்காது.",
      te: "ఆసక్తి లేని చదువు జ్ఞాపకశక్తిని చెడగొడుతుంది; అది తీసుకున్నదేదీ నిలుపుకోదు.",
      tr: "İstek duymadan çalışmak belleği bozar; bellek de aldığı hiçbir şeyi tutmaz.",
      uk: "Навчання без бажання псує пам’ять, і вона не втримує нічого з прийнятого.",
      uz: "Istaksiz o‘qish xotirani buzadi va u qabul qilganining hech birini saqlamaydi.",
    },
    author: western(
      "Leonardo da Vinci",
      "레오나르도 다빈치",
      "レオナルド・ダ・ヴィンチ",
      "列奥纳多·达·芬奇",
      {
        fr: "Léonard de Vinci",
        ar: "ليوناردو دا فينشي",
        bn: "লিওনার্দো দা ভিঞ্চি",
        el: "Λεονάρντο ντα Βίντσι",
        hi: "लियोनार्दो दा विंची",
        kk: "Леонардо да Винчи",
        ky: "Леонардо да Винчи",
        mn: "Леонардо да Винчи",
        ru: "Леонардо да Винчи",
        ta: "லியனார்டோ டா வின்சி",
        te: "లియొనార్డో డా విన్సీ",
        uk: "Леонардо да Вінчі",
      },
    ),
  },
  {
    id: "korean-start-half",
    originalLanguage: "ko",
    originalText: "시작이 반이다",
    source: "Korean proverb",
    published: ["ko"],
    translations: {
      en: "Starting is half of it.",
      ko: "시작이 반이다.",
      ja: "始めれば半分終わったも同じ。",
      "zh-CN": "开始就是成功了一半。",
      es: "Empezar es la mitad del camino.",
      fr: "Commencer, c’est déjà la moitié.",
      de: "Anfangen ist schon die Hälfte.",
      "pt-BR": "Começar já é metade.",
      vi: "Bắt đầu được là đã xong một nửa.",
      th: "เริ่มได้ก็เท่ากับสำเร็จไปครึ่งหนึ่งแล้ว",
      ar: "البداية نصف العمل.",
      bn: "শুরু করাই অর্ধেক কাজ।",
      cs: "Začátek je půl práce.",
      el: "Η αρχή είναι το μισό του έργου.",
      fil: "Ang pagsisimula ay kalahati na ng gawain.",
      hi: "शुरुआत कर देना आधा काम हो जाना है।",
      hu: "Aki elkezdte, már félig kész.",
      id: "Memulai berarti separuh selesai.",
      it: "Cominciare è già metà dell’opera.",
      kk: "Бастау — істің жартысы.",
      ky: "Баштоо — иштин жарымы.",
      mn: "Эхлэл нь ажлын хагас.",
      nl: "Beginnen is het halve werk.",
      pl: "Początek to połowa dzieła.",
      ro: "Începutul e jumătate din treabă.",
      ru: "Начать — половина дела.",
      sv: "Att börja är halva jobbet.",
      ta: "தொடங்கிவிட்டால் பாதி முடிந்தது.",
      te: "మొదలుపెట్టడమే సగం పని.",
      tr: "Başlamak, işin yarısıdır.",
      uk: "Почати — це вже половина справи.",
      uz: "Boshlash — ishning yarmi.",
    },
    author: PROVERB.korean,
  },
  {
    id: "korean-thousand-li",
    originalLanguage: "ko",
    originalText: "천 리 길도 한 걸음부터",
    source: "Korean proverb",
    published: ["ko"],
    translations: {
      en: "Even a thousand-li road begins with one step.",
      ko: "천 리 길도 한 걸음부터.",
      ja: "千里の道も一歩から始まる。",
      "zh-CN": "千里之路也从一步开始。",
      es: "Incluso un camino de mil li empieza con un paso.",
      fr: "Même une route de mille li commence par un pas.",
      de: "Auch ein Weg von tausend Li beginnt mit einem Schritt.",
      "pt-BR": "Até um caminho de mil li começa com um passo.",
      vi: "Con đường ngàn dặm cũng bắt đầu từ một bước chân.",
      th: "ถนนยาวพันลี้ก็เริ่มจากก้าวเดียว",
      ar: "حتى طريق الألف لي يبدأ بخطوة واحدة.",
      bn: "হাজার লি-র পথও এক পা দিয়েই শুরু।",
      cs: "I cesta dlouhá tisíc li začíná jedním krokem.",
      el: "Ακόμη κι ο δρόμος των χιλίων λι αρχίζει μ’ ένα βήμα.",
      fil: "Maging ang daang sanlibong li ay nagsisimula sa isang hakbang.",
      hi: "हज़ार ली का रास्ता भी एक क़दम से ही शुरू होता है।",
      hu: "Az ezer li hosszú út is egy lépéssel kezdődik.",
      id: "Bahkan jalan seribu li pun dimulai dengan satu langkah.",
      it: "Anche la strada di mille li comincia con un passo.",
      kk: "Мың ли жол да бір қадамнан басталады.",
      ky: "Миң ли жол да бир кадамдан башталат.",
      mn: "Мянган ли газрын зам ч нэг алхмаас эхэлдэг.",
      nl: "Ook een weg van duizend li begint met één stap.",
      pl: "Nawet droga tysiąca li zaczyna się od jednego kroku.",
      ro: "Chiar și drumul de o mie de li începe cu un pas.",
      ru: "Даже дорога в тысячу ли начинается с одного шага.",
      sv: "Även en väg på tusen li börjar med ett steg.",
      ta: "ஆயிரம் லீ தூரப் பாதையும் ஓர் அடியிலேயே தொடங்கும்.",
      te: "వేయి లీల దారి కూడా ఒక్క అడుగుతోనే మొదలవుతుంది.",
      tr: "Bin li’lik yol bile tek bir adımla başlar.",
      uk: "Навіть дорога в тисячу лі починається з одного кроку.",
      uz: "Ming lilik yo‘l ham bitta qadamdan boshlanadi.",
    },
    author: PROVERB.korean,
  },
  {
    id: "joyce-portals",
    originalLanguage: "en",
    originalText: "His errors are volitional and are the portals of discovery.",
    source: "James Joyce, Ulysses (1922)",
    published: ["en"],
    translations: {
      en: "His errors are volitional and are the portals of discovery.",
      ko: "그의 실수는 스스로 택한 것이며, 발견으로 들어가는 문이다.",
      ja: "彼の過ちは自ら選んだものであり、発見への入口である。",
      "zh-CN": "他的错误出于自愿，是通往发现的门。",
      es: "Sus errores son voluntarios y son los portales del descubrimiento.",
      fr: "Ses erreurs sont volontaires et sont les portes de la découverte.",
      de: "Seine Fehler sind gewollt und sind die Tore der Entdeckung.",
      "pt-BR": "Seus erros são voluntários e são os portais da descoberta.",
      vi: "Những sai lầm của ông là do ông chọn, và chúng là cánh cửa dẫn tới khám phá.",
      th: "ความผิดพลาดของเขาเกิดจากเจตนา และมันคือประตูสู่การค้นพบ",
      ar: "أخطاؤه إرادية، وهي أبواب الاكتشاف.",
      bn: "তার ভুলগুলো ইচ্ছাকৃত, আর সেগুলোই আবিষ্কারের দরজা।",
      cs: "Jeho omyly jsou úmyslné a jsou branami objevu.",
      el: "Τα λάθη του είναι εκούσια και είναι οι πύλες της ανακάλυψης.",
      fil: "Kusa niyang mga pagkakamali, at ang mga iyon ang pintuan ng pagtuklas.",
      hi: "उसकी ग़लतियाँ जानबूझकर हैं, और वही खोज के द्वार हैं।",
      hu: "Tévedései szándékosak, és ezek a felfedezés kapui.",
      id: "Kekeliruannya disengaja, dan itulah gerbang penemuan.",
      it: "I suoi errori sono voluti e sono le porte della scoperta.",
      kk: "Оның қателері әдейі, әрі олар — ашылудың қақпасы.",
      ky: "Анын каталары атайын, алар — ачылыштын дарбазасы.",
      mn: "Түүний алдаанууд санаатай бөгөөд нээлтийн үүд юм.",
      nl: "Zijn fouten zijn gewild en zijn de poorten van de ontdekking.",
      pl: "Jego błędy są zamierzone i są wrotami odkrycia.",
      ro: "Greșelile lui sunt voite și sunt porțile descoperirii.",
      ru: "Его ошибки намеренны, и они — врата открытия.",
      sv: "Hans misstag är avsiktliga och är upptäckternas portar.",
      ta: "அவனுடைய தவறுகள் வேண்டுமென்றே செய்யப்பட்டவை; அவையே கண்டுபிடிப்பின் வாயில்கள்.",
      te: "అతని పొరపాట్లు ఉద్దేశపూర్వకమైనవి; అవే ఆవిష్కరణకు ద్వారాలు.",
      tr: "Yanılgıları bilerektir ve keşfin kapılarıdır.",
      uk: "Його помилки навмисні, і вони — брама відкриття.",
      uz: "Uning xatolari ataylab; ular kashfiyot darvozasidir.",
    },
    author: western(
      "James Joyce",
      "제임스 조이스",
      "ジェイムズ・ジョイス",
      "詹姆斯·乔伊斯",
      {
        ar: "جيمس جويس",
        bn: "জেমস জয়েস",
        el: "Τζέιμς Τζόις",
        hi: "जेम्स जॉयस",
        kk: "Джеймс Джойс",
        ky: "Джеймс Джойс",
        mn: "Жеймс Жойс",
        ru: "Джеймс Джойс",
        ta: "ஜேம்ஸ் ஜாய்ஸ்",
        te: "జేమ్స్ జాయ్స్",
        uk: "Джеймс Джойс",
      },
    ),
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
export function renderQuote(
  quote: LearningQuote,
  locale: string,
): RenderedQuote {
  const text = quote.translations[locale];
  if (!text) throw new Error(`quote ${quote.id} has no ${locale} translation`);

  const attribution: QuoteAttribution =
    locale === quote.originalLanguage ||
    baseOf(locale) === quote.originalLanguage
      ? "original"
      : quote.published?.includes(locale)
        ? "published"
        : "ours";

  return {
    text,
    author: quote.author[locale] ?? quote.author.en!,
    attribution,
    original:
      attribution === "original"
        ? null
        : { text: quote.originalText, lang: quote.originalLanguage },
  };
}

function baseOf(locale: string): string {
  return locale.split("-")[0]!;
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

export const QUOTE_HISTORY_KEY = "hangyul_ganada:quote-history";

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
  const quote =
    pool[Math.min(pool.length - 1, Math.floor(random * pool.length))]!;
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
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
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
