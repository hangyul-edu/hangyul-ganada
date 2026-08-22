/**
 * The quotations shown at the foot of the home screen.
 *
 * ## Twenty, and why it used to be a hundred
 *
 * The library held a hundred lines. Twelve were quotations; the other
 * eighty-eight were encouragement written for this app — "Two words a day is
 * seven hundred a year", "Progress is quiet" — and they sat in a slot that
 * looks, to anybody reading it, exactly like a quotation. They were labelled
 * honestly in the data and not on the screen, which is where it counts. A
 * learner cannot tell the difference between a sentence Seneca wrote and a
 * sentence a product manager wrote, and being unable to tell is the problem.
 *
 * So the count went down and the standard went up. Every line here is:
 *
 * 1. by a **named person** — no proverbs, because a proverb has no author to
 *    verify, and no "Anonymous", which is a word that makes a missing fact look
 *    like a present one;
 * 2. from a **citable source** — a work and a place in it, so the claim can be
 *    checked rather than trusted;
 * 3. about learning, practice, persistence, language or knowledge;
 * 4. short enough to sit at the foot of a phone screen.
 *
 * One line was removed *because* of rule 1. "꿈을 크게 가져라. 깨져도 그 조각이
 * 크다" circulates across the Korean internet under three different names and
 * appears in none of their writing; it used to ship deliberately unattributed,
 * and under the current policy a quotation nobody can be credited with is not a
 * quotation. Also excluded, all widely circulated and none traceable:
 *
 * * "To have another language is to possess a second soul" — Charlemagne
 * * "It does not matter how slowly you go as long as you do not stop" — Confucius
 * * "Anyone who has never made a mistake has never tried anything new" — Einstein
 * * "An investment in knowledge pays the best interest" — Franklin
 *
 * A learner is being asked to trust this app's Korean. Putting words in
 * Confucius's mouth on the same screen would be a strange place to start — so
 * the two Confucius lines that *are* here are cited to chapter and verse of the
 * Analects.
 *
 * ## A different line each time the app opens
 *
 * It used to be pinned to the calendar day and stored, on the argument that a
 * quotation is something the app says to you *today* rather than a slot machine.
 * That held for a hundred lines of self-authored encouragement, where a second
 * line was more of the same. Twenty attributed quotations are a different
 * object: there is no reason a learner who comes back at lunchtime should be
 * refused a different one, and pinning it made decoration into stored state.
 *
 * `quoteOnOpen` picks at random per mount and keeps a short in-memory history
 * so the same line never appears twice running. Nothing is written to disk.
 *
 * ## Every quotation is translated, and says what the translation is
 *
 * All 32 interface languages, and `renderQuote` throws rather than falling back
 * to English — a silent fallback is how a locale ships 90% translated and
 * nobody notices. `attribution` records what the reader is looking at:
 *
 * | `attribution` | Meaning |
 * | --- | --- |
 * | `original` | the words the author wrote, in the language they wrote them in |
 * | `published` | a published translation, named in `source` |
 * | `ours` | translated for this app from the original |
 *
 * `ours` is the honest label for most rows and it is not a licence to
 * paraphrase: each renders the original's sense and nothing more. The original
 * text is carried beside every translation, so any claim here can be checked
 * against the words it came from.
 *
 * ## Copyright
 *
 * Everything quoted is public domain — pre-1929 publication or very much older.
 *
 * `scripts/quotes-qa.mjs` is the gate.
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
  author: Record<string, string> | null;
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

/*
 * The proverb descriptors are gone.
 *
 * They existed so a line whose author is "a Korean proverb" could still name
 * something in the reader's language. Every quotation now names a **person**,
 * which is the whole of the new attribution policy: a proverb has no author to
 * verify, and "Korean proverb" in the byline slot is a category where a name
 * should be.
 */

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
    id: "goethe-languages",
    originalLanguage: "de",
    originalText: "Wer fremde Sprachen nicht kennt, weiß nichts von seiner eigenen.",
    source: "Goethe, Maximen und Reflexionen, no. 91 (published 1833)",
    published: ["en", "de"],
    translations: {
      en: "Those who know no foreign language know nothing of their own.",
      ko: "외국어를 모르는 사람은 자기 말도 알지 못한다.",
      ja: "外国語を知らない者は、自分の言葉も知らない。",
      "zh-CN": "不懂外语的人，对自己的语言也一无所知。",
      es: "Quien no conoce lenguas extranjeras no sabe nada de la suya.",
      fr: "Qui ne connaît pas de langues étrangères ne sait rien de la sienne.",
      de: "Wer fremde Sprachen nicht kennt, weiß nichts von seiner eigenen.",
      "pt-BR": "Quem não conhece línguas estrangeiras nada sabe da sua própria.",
      vi: "Ai không biết ngoại ngữ thì cũng chẳng hiểu gì tiếng mẹ đẻ.",
      th: "ผู้ที่ไม่รู้ภาษาต่างประเทศ ย่อมไม่รู้จักภาษาของตนเอง",
      ar: "من لا يعرف لغة أجنبية لا يعرف شيئًا عن لغته.",
      bn: "যে বিদেশি ভাষা জানে না, সে নিজের ভাষাও জানে না।",
      cs: "Kdo nezná cizí jazyky, neví nic o svém vlastním.",
      el: "Όποιος δεν ξέρει ξένες γλώσσες, δεν ξέρει τίποτα για τη δική του.",
      fil: "Ang hindi marunong ng banyagang wika ay walang alam sa sarili niyang wika.",
      hi: "जो विदेशी भाषा नहीं जानता, वह अपनी भाषा के बारे में भी कुछ नहीं जानता।",
      hu: "Aki nem ismer idegen nyelvet, semmit sem tud a sajátjáról.",
      id: "Siapa yang tidak tahu bahasa asing, tidak tahu apa-apa tentang bahasanya sendiri.",
      it: "Chi non conosce lingue straniere non sa nulla della propria.",
      kk: "Шет тілін білмеген адам өз тілін де білмейді.",
      ky: "Чет тилди билбеген адам өз тилин да билбейт.",
      mn: "Гадаад хэл мэдэхгүй хүн эх хэлээ ч мэдэхгүй.",
      nl: "Wie geen vreemde talen kent, weet niets van zijn eigen taal.",
      pl: "Kto nie zna języków obcych, nic nie wie o własnym.",
      ro: "Cine nu cunoaște limbi străine nu știe nimic despre a sa.",
      ru: "Кто не знает чужих языков, тот ничего не знает о своём.",
      sv: "Den som inte kan främmande språk vet ingenting om sitt eget.",
      ta: "அயல்மொழி அறியாதவர் தம் மொழியையும் அறியார்.",
      te: "విదేశీ భాషలు తెలియనివారికి తమ భాష గురించీ ఏమీ తెలియదు.",
      tr: "Yabancı dil bilmeyen, kendi dilini de bilmez.",
      uk: "Хто не знає чужих мов, той нічого не знає про свою.",
      uz: "Chet tilni bilmagan odam o‘z tilini ham bilmaydi.",
    },
    author: western("Goethe", "괴테", "ゲーテ", "歌德", {
      ar: "غوته",
      bn: "গোয়েটে",
      el: "Γκαίτε",
      hi: "गोएथे",
      kk: "Гёте",
      ky: "Гёте",
      mn: "Гёте",
      ru: "Гёте",
      ta: "கதே",
      te: "గోఏతే",
      uk: "Гете",
      th: "เกอเธ่",
    }),
  },
  {
    id: "bacon-reading",
    originalLanguage: "en",
    originalText: "Reading maketh a full man; conference a ready man; and writing an exact man.",
    source: "Francis Bacon, “Of Studies”, Essays (1625)",
    published: ["en"],
    translations: {
      en: "Reading makes a full man; conversation a ready man; and writing an exact man.",
      ko: "읽기는 사람을 채우고, 대화는 사람을 민첩하게 하며, 쓰기는 사람을 정확하게 한다.",
      ja: "読書は人を豊かにし、会話は人を機敏にし、書くことは人を正確にする。",
      "zh-CN": "阅读使人充实，交谈使人敏捷，写作使人精确。",
      es: "La lectura hace al hombre completo; la conversación, ágil; y la escritura, exacto.",
      fr: "La lecture rend l’homme complet ; la conversation, prompt ; et l’écriture, exact.",
      de: "Lesen macht einen vollkommenen Menschen, Gespräch einen gewandten, Schreiben einen genauen.",
      "pt-BR": "A leitura faz o homem completo; a conversa, ágil; e a escrita, exato.",
      vi: "Đọc khiến con người đầy đặn, trò chuyện khiến nhanh nhạy, viết khiến chính xác.",
      th: "การอ่านทำให้คนสมบูรณ์ การสนทนาทำให้คนคล่องแคล่ว การเขียนทำให้คนแม่นยำ",
      ar: "القراءة تجعل المرء ممتلئًا، والحوار يجعله حاضر البديهة، والكتابة تجعله دقيقًا.",
      bn: "পড়া মানুষকে পূর্ণ করে, আলোচনা তৎপর করে, আর লেখা নিখুঁত করে।",
      cs: "Četba činí člověka úplným, rozhovor pohotovým a psaní přesným.",
      el: "Το διάβασμα κάνει τον άνθρωπο πλήρη, η συζήτηση ετοιμόλογο και η γραφή ακριβή.",
      fil: "Ang pagbabasa ay bumubuo sa tao, ang usapan ay nagpapabilis, at ang pagsulat ay nagpapatumpak.",
      hi: "पढ़ना मनुष्य को पूर्ण बनाता है, बातचीत तत्पर, और लेखन सटीक।",
      hu: "Az olvasás teljessé, a beszélgetés készségessé, az írás pontossá teszi az embert.",
      id: "Membaca membuat orang utuh, berbincang membuatnya sigap, dan menulis membuatnya cermat.",
      it: "La lettura rende l’uomo completo, la conversazione pronto e la scrittura preciso.",
      kk: "Оқу адамды толықтырады, әңгіме — ұтқыр, жазу — дәл етеді.",
      ky: "Окуу адамды толуктайт, маек — шамдагай, жазуу — так кылат.",
      mn: "Унших нь хүнийг бүрэн, ярилцах нь шуурхай, бичих нь нарийн болгодог.",
      nl: "Lezen maakt een mens volledig, gesprek gevat en schrijven nauwkeurig.",
      pl: "Czytanie czyni człowieka pełnym, rozmowa — bystrym, a pisanie — dokładnym.",
      ro: "Cititul îl face pe om deplin, conversația prompt, iar scrisul exact.",
      ru: "Чтение делает человека полным, беседа — находчивым, письмо — точным.",
      sv: "Läsning gör människan fullödig, samtal snabbtänkt och skrivande exakt.",
      ta: "வாசிப்பு மனிதனை நிறைவாக்கும், உரையாடல் விரைவாக்கும், எழுத்து துல்லியமாக்கும்.",
      te: "చదవడం మనిషిని పరిపూర్ణుడిని చేస్తుంది, సంభాషణ చురుకైనవాడిని, రాయడం కచ్చితమైనవాడిని.",
      tr: "Okumak insanı tam, konuşmak hazırcevap, yazmak ise kesin kılar.",
      uk: "Читання робить людину повною, бесіда — кмітливою, письмо — точною.",
      uz: "O‘qish odamni to‘kis, suhbat topqir, yozish esa aniq qiladi.",
    },
    author: western("Francis Bacon", "프랜시스 베이컨", "フランシス・ベーコン", "弗朗西斯·培根", {
      ar: "فرانسيس بيكون",
      bn: "ফ্রান্সিস বেকন",
      el: "Φράνσις Μπέικον",
      hi: "फ़्रांसिस बेकन",
      kk: "Фрэнсис Бэкон",
      ky: "Фрэнсис Бэкон",
      mn: "Фрэнсис Бэкон",
      ru: "Фрэнсис Бэкон",
      ta: "பிரான்சிஸ் பேக்கன்",
      te: "ఫ్రాన్సిస్ బేకన్",
      uk: "Френсіс Бекон",
      th: "ฟรานซิส เบคอน",
    }),
  },
  {
    id: "horace-half-begun",
    originalLanguage: "la",
    originalText: "Dimidium facti, qui coepit, habet.",
    source: "Horace, Epistles I.2.40 (c. 20 BC)",
    published: ["en"],
    translations: {
      en: "Whoever has begun is half done.",
      ko: "시작한 사람은 이미 절반을 마친 것이다.",
      ja: "始めた者は、すでに半分を終えている。",
      "zh-CN": "开始了的人，已经完成了一半。",
      es: "Quien ha empezado ya lleva la mitad hecha.",
      fr: "Qui a commencé a déjà fait la moitié.",
      de: "Wer angefangen hat, hat schon die Hälfte getan.",
      "pt-BR": "Quem começou já fez metade.",
      vi: "Ai đã bắt đầu là đã xong một nửa.",
      th: "ผู้ที่เริ่มแล้ว เท่ากับทำไปได้ครึ่งหนึ่ง",
      ar: "من بدأ فقد أنجز نصف العمل.",
      bn: "যে শুরু করেছে, তার অর্ধেক কাজ হয়ে গেছে।",
      cs: "Kdo začal, má polovinu hotovou.",
      el: "Όποιος ξεκίνησε, έχει κάνει ήδη τα μισά.",
      fil: "Ang nagsimula na ay tapos na ang kalahati.",
      hi: "जिसने शुरू कर दिया, उसका आधा काम हो गया।",
      hu: "Aki elkezdte, már félig kész van.",
      id: "Siapa yang telah memulai, setengahnya sudah selesai.",
      it: "Chi ha cominciato è già a metà dell’opera.",
      kk: "Бастаған адам жарты жұмысты бітірген.",
      ky: "Баштаган адам жарым ишти бүтүргөн.",
      mn: "Эхэлсэн хүн хагасыг нь дуусгасан.",
      nl: "Wie begonnen is, is al halverwege.",
      pl: "Kto zaczął, ma już połowę za sobą.",
      ro: "Cine a început a făcut deja jumătate.",
      ru: "Кто начал, тот наполовину сделал.",
      sv: "Den som har börjat är redan halvvägs.",
      ta: "தொடங்கியவர் பாதி முடித்துவிட்டார்.",
      te: "మొదలుపెట్టినవాడు సగం పూర్తి చేసినట్టే.",
      tr: "Başlayan, işin yarısını bitirmiştir.",
      uk: "Хто почав, той половину зробив.",
      uz: "Boshlagan odam ishning yarmini bajargan.",
    },
    author: western("Horace", "호라티우스", "ホラティウス", "贺拉斯", {
      es: "Horacio",
      fr: "Horace",
      de: "Horaz",
      "pt-BR": "Horácio",
      it: "Orazio",
      pl: "Horacy",
      ro: "Horațiu",
      cs: "Horatius",
      hu: "Horatius",
      nl: "Horatius",
      sv: "Horatius",
      tr: "Horatius",
      vi: "Horatius",
      id: "Horatius",
      fil: "Horace",
      ar: "هوراس",
      bn: "হোরেস",
      el: "Οράτιος",
      hi: "होरेस",
      kk: "Гораций",
      ky: "Гораций",
      mn: "Гораци",
      ru: "Гораций",
      ta: "ஹோரேஸ்",
      te: "హొరేస్",
      uk: "Горацій",
      th: "ฮอเรซ",
    }),
  },
  {
    id: "hanyu-diligence",
    originalLanguage: "zh",
    originalText: "業精於勤，荒於嬉",
    source: "Han Yu, “Explaining Progress in Learning” (c. 802)",
    published: ["en", "zh-CN"],
    translations: {
      en: "Mastery comes from diligence and is lost in idleness.",
      ko: "학업은 부지런함에서 깊어지고 노는 데서 허물어진다.",
      ja: "学業は勤勉によって深まり、遊びによって荒れる。",
      "zh-CN": "业精于勤，荒于嬉。",
      es: "El dominio nace de la constancia y se pierde en la ociosidad.",
      fr: "La maîtrise vient de l’assiduité et se perd dans l’oisiveté.",
      de: "Können entsteht durch Fleiß und vergeht durch Müßiggang.",
      "pt-BR": "O domínio nasce da diligência e perde-se na ociosidade.",
      vi: "Tinh thông đến từ chuyên cần và mất đi vì lười nhác.",
      th: "ความชำนาญเกิดจากความขยัน และเสื่อมไปด้วยความเกียจคร้าน",
      ar: "الإتقان يأتي بالاجتهاد ويضيع بالكسل.",
      bn: "দক্ষতা আসে অধ্যবসায়ে, নষ্ট হয় আলস্যে।",
      cs: "Mistrovství vzniká pílí a zaniká zahálkou.",
      el: "Η δεξιοτεχνία γεννιέται από την επιμέλεια και χάνεται στην οκνηρία.",
      fil: "Ang husay ay nagmumula sa sipag at nawawala sa katamaran.",
      hi: "निपुणता परिश्रम से आती है और आलस्य में खो जाती है।",
      hu: "A mesterség szorgalomból születik és tétlenségben vész el.",
      id: "Kemahiran lahir dari ketekunan dan hilang dalam kemalasan.",
      it: "La maestria nasce dalla diligenza e si perde nell’ozio.",
      kk: "Шеберлік еңбекқорлықтан туады, жалқаулықтан жоғалады.",
      ky: "Чеберчилик эмгекчилдиктен туулуп, жалкоолуктан жоголот.",
      mn: "Ур чадвар хичээнгүй байдлаас төрж, залхуурлаас алдагддаг.",
      nl: "Meesterschap ontstaat door vlijt en gaat verloren door ledigheid.",
      pl: "Mistrzostwo rodzi się z pilności i ginie w próżniactwie.",
      ro: "Măiestria se naște din sârguință și se pierde în trândăvie.",
      ru: "Мастерство рождается прилежанием и теряется в праздности.",
      sv: "Skicklighet föds ur flit och går förlorad i lättja.",
      ta: "தேர்ச்சி முயற்சியால் வளர்ந்து, சோம்பலால் அழியும்.",
      te: "నైపుణ్యం శ్రద్ధతో పెరుగుతుంది, సోమరితనంతో నశిస్తుంది.",
      tr: "Ustalık gayretle gelir, tembellikte yiter.",
      uk: "Майстерність народжується працею і гине в неробстві.",
      uz: "Mahorat mehnatdan tug‘iladi, dangasalikdan yo‘qoladi.",
    },
    author: western("Han Yu", "한유", "韓愈", "韩愈", {
      ar: "هان يو",
      bn: "হান ইউ",
      el: "Χαν Γιου",
      hi: "हान यू",
      kk: "Хань Юй",
      ky: "Хань Юй",
      mn: "Хань Юй",
      ru: "Хань Юй",
      ta: "ஹான் யூ",
      te: "హాన్ యూ",
      uk: "Хань Юй",
      th: "หานยฺหวี้",
      vi: "Hàn Dũ",
    }),
  },
  {
    id: "sejong-easy-daily",
    originalLanguage: "ko",
    originalText: "사람마다 쉬이 익혀 날로 씀에 편안케 하고자 할 따름이니라",
    source: "King Sejong, preface to the Hunminjeongeum (1446)",
    published: ["en", "ko"],
    translations: {
      en: "My wish is only that everyone learn them easily and use them with ease every day.",
      ko: "사람마다 쉬이 익혀 날로 씀에 편안케 하고자 할 따름이니라.",
      ja: "誰もが容易に習い、日々の使用に便利であるようにと願うばかりである。",
      "zh-CN": "只愿人人易学，日常使用便利罢了。",
      es: "Solo deseo que todos las aprendan con facilidad y las usen cómodamente cada día.",
      fr: "Je souhaite seulement que chacun les apprenne aisément et s’en serve commodément chaque jour.",
      de: "Ich wünsche nur, dass jeder sie leicht erlernt und täglich bequem gebraucht.",
      "pt-BR": "Desejo apenas que todos as aprendam com facilidade e as usem com conforto todos os dias.",
      vi: "Ta chỉ mong ai cũng học được dễ dàng và dùng thuận tiện mỗi ngày.",
      th: "ข้าพเจ้าปรารถนาเพียงให้ทุกคนเรียนได้ง่ายและใช้ได้สะดวกทุกวัน",
      ar: "كل ما أرجوه أن يتعلّمها كل امرئ بيسر ويستعملها مرتاحًا كل يوم.",
      bn: "আমার একমাত্র ইচ্ছা, সকলে যেন সহজে শিখে প্রতিদিন স্বচ্ছন্দে ব্যবহার করতে পারে।",
      cs: "Přeji si jen, aby se je každý snadno naučil a denně je pohodlně užíval.",
      el: "Εύχομαι μόνο να τα μάθουν όλοι εύκολα και να τα χρησιμοποιούν άνετα κάθε μέρα.",
      fil: "Nais ko lamang na madaling matutunan ito ng lahat at gamitin nang maginhawa araw-araw.",
      hi: "मेरी बस यही इच्छा है कि हर कोई इन्हें आसानी से सीखे और रोज़ सहजता से इस्तेमाल करे।",
      hu: "Csak azt kívánom, hogy mindenki könnyen megtanulja, és naponta kényelmesen használja.",
      id: "Aku hanya ingin agar setiap orang mudah mempelajarinya dan nyaman memakainya setiap hari.",
      it: "Desidero solo che ognuno le impari facilmente e le usi comodamente ogni giorno.",
      kk: "Менің тілегім — әркім оларды оңай үйреніп, күн сайын жеңіл қолдансын.",
      ky: "Каалоом — ар ким аларды оңой үйрөнүп, күн сайын жеңил колдонсун.",
      mn: "Хүн бүр амархан сурч, өдөр бүр хялбар хэрэглээсэй гэж хүсэх төдий.",
      nl: "Ik wens slechts dat iedereen ze gemakkelijk leert en dagelijks met gemak gebruikt.",
      pl: "Pragnę jedynie, by każdy nauczył się ich łatwo i wygodnie używał co dzień.",
      ro: "Doresc doar ca fiecare să le învețe ușor și să le folosească comod în fiecare zi.",
      ru: "Я желаю лишь, чтобы каждый легко их выучил и удобно пользовался ими каждый день.",
      sv: "Jag önskar bara att alla lär sig dem lätt och använder dem bekvämt varje dag.",
      ta: "எல்லாரும் இவற்றை எளிதில் கற்று, நாள்தோறும் வசதியாகப் பயன்படுத்த வேண்டும் என்பதே என் விருப்பம்.",
      te: "అందరూ వీటిని సులభంగా నేర్చుకుని, రోజూ సౌకర్యంగా వాడాలన్నదే నా కోరిక.",
      tr: "Tek dileğim, herkesin bunları kolayca öğrenip her gün rahatça kullanmasıdır.",
      uk: "Я лише бажаю, щоб кожен легко їх вивчив і зручно вживав щодня.",
      uz: "Yagona tilagim — har kim ularni oson o‘rganib, kundalik hayotda qulay ishlatsin.",
    },
    author: western("King Sejong", "세종대왕", "世宗大王", "世宗大王", {
      es: "El rey Sejong",
      fr: "Le roi Sejong",
      de: "König Sejong",
      "pt-BR": "O rei Sejong",
      it: "Re Sejong",
      nl: "Koning Sejong",
      pl: "Król Sejong",
      ro: "Regele Sejong",
      cs: "Král Sedžong",
      hu: "Szedzsong király",
      sv: "Kung Sejong",
      tr: "Kral Sejong",
      vi: "Vua Sejong",
      id: "Raja Sejong",
      fil: "Haring Sejong",
      ar: "الملك سيجونغ",
      bn: "রাজা সেজং",
      el: "Ο βασιλιάς Σετζόνγκ",
      hi: "राजा सेजोंग",
      kk: "Сежон патша",
      ky: "Сежон падыша",
      mn: "Сежун ван",
      ru: "Король Сечжон",
      ta: "மன்னர் சேஜோங்",
      te: "రాజు సెజోంగ్",
      uk: "Король Седжон",
      th: "พระเจ้าเซจง",
    }),
  },
  {
    id: "xunzi-small-steps",
    originalLanguage: "zh",
    originalText: "不積跬步，無以至千里",
    source: "Xunzi, “Encouraging Learning” (c. 3rd century BC)",
    published: ["en", "zh-CN"],
    translations: {
      en: "Without piling up small steps, you cannot travel a thousand miles.",
      ko: "반걸음을 쌓지 않으면 천 리에 이를 수 없다.",
      ja: "小さな一歩を積まなければ、千里には至らない。",
      "zh-CN": "不积跬步，无以至千里。",
      es: "Sin acumular pasos cortos, no se llega a mil leguas.",
      fr: "Sans accumuler de petits pas, on n’atteint pas mille lieues.",
      de: "Ohne kleine Schritte zu häufen, erreicht man keine tausend Meilen.",
      "pt-BR": "Sem acumular pequenos passos, não se chega a mil léguas.",
      vi: "Không tích những bước ngắn thì không đi nổi ngàn dặm.",
      th: "หากไม่สะสมก้าวสั้น ๆ ก็ไปไม่ถึงพันลี้",
      ar: "من لم يراكم الخطوات الصغيرة لم يبلغ ألف ميل.",
      bn: "ছোট ছোট পদক্ষেপ না জমালে হাজার মাইল পাড়ি দেওয়া যায় না।",
      cs: "Bez hromadění malých kroků nedojdeš tisíc mil.",
      el: "Χωρίς να συσσωρεύσεις μικρά βήματα, δεν φτάνεις χίλια μίλια.",
      fil: "Kung hindi ka mag-iipon ng maliliit na hakbang, hindi ka makakarating nang sanlibong milya.",
      hi: "छोटे-छोटे क़दम जोड़े बिना हज़ार मील तय नहीं होते।",
      hu: "Apró lépések nélkül nem teszel meg ezer mérföldet.",
      id: "Tanpa mengumpulkan langkah-langkah kecil, kamu tak akan menempuh seribu mil.",
      it: "Senza accumulare piccoli passi, non si percorrono mille miglia.",
      kk: "Кішкене қадамдарды жинамай, мың шақырымға жете алмайсың.",
      ky: "Кичине кадамдарды топтобой, миң чакырымга жете албайсың.",
      mn: "Жижиг алхмуудыг хураахгүйгээр мянган бээр туулж чадахгүй.",
      nl: "Zonder kleine stappen op te tellen, leg je geen duizend mijl af.",
      pl: "Bez gromadzenia małych kroków nie przejdziesz tysiąca mil.",
      ro: "Fără a aduna pași mărunți, nu parcurgi o mie de mile.",
      ru: "Не накопив малых шагов, не пройдёшь и тысячи ли.",
      sv: "Utan att lägga små steg på hög färdas du inte tusen mil.",
      ta: "சிறு அடிகளைச் சேர்க்காமல் ஆயிரம் மைல் கடக்க முடியாது.",
      te: "చిన్న అడుగులు పోగుచేయకుండా వెయ్యి మైళ్లు చేరలేరు.",
      tr: "Küçük adımları biriktirmeden bin mil yol alınmaz.",
      uk: "Не назбиравши малих кроків, не подолаєш тисячі лі.",
      uz: "Kichik qadamlarni to‘plamasdan ming chaqirim yo‘l bosib bo‘lmaydi.",
    },
    author: western("Xunzi", "순자", "荀子", "荀子", {
      ar: "شيونزي",
      bn: "শুনজি",
      el: "Ξουνζί",
      hi: "शुनज़ी",
      kk: "Сюнь-цзы",
      ky: "Сюнь-цзы",
      mn: "Сюнзи",
      ru: "Сюнь-цзы",
      ta: "சுன்சி",
      te: "షున్‌జి",
      uk: "Сюнь-цзи",
      th: "ซุนจื่อ",
      vi: "Tuân Tử",
    }),
  },
  {
    id: "cicero-studies",
    originalLanguage: "la",
    originalText: "Haec studia adulescentiam alunt, senectutem oblectant.",
    source: "Cicero, Pro Archia Poeta 16 (62 BC)",
    published: ["en"],
    translations: {
      en: "These studies nourish the young and delight the old.",
      ko: "이 배움은 젊은이를 기르고 노인을 즐겁게 한다.",
      ja: "この学びは若者を育て、老人を楽しませる。",
      "zh-CN": "这些学问滋养青年，愉悦老人。",
      es: "Estos estudios alimentan la juventud y deleitan la vejez.",
      fr: "Ces études nourrissent la jeunesse et charment la vieillesse.",
      de: "Diese Studien nähren die Jugend und erfreuen das Alter.",
      "pt-BR": "Estes estudos alimentam a juventude e deleitam a velhice.",
      vi: "Việc học này nuôi dưỡng tuổi trẻ và làm vui tuổi già.",
      th: "การเรียนรู้นี้หล่อเลี้ยงวัยหนุ่มสาวและให้ความรื่นรมย์แก่วัยชรา",
      ar: "هذه الدراسات تغذّي الشباب وتؤنس الشيخوخة.",
      bn: "এই চর্চা তারুণ্যকে পুষ্ট করে, বার্ধক্যকে আনন্দ দেয়।",
      cs: "Toto studium živí mládí a těší stáří.",
      el: "Αυτές οι σπουδές τρέφουν τη νιότη και τέρπουν τα γηρατειά.",
      fil: "Ang pag-aaral na ito ay nagpapalusog sa kabataan at nagpapasaya sa katandaan.",
      hi: "यह अध्ययन युवावस्था को पोषित करता है और वृद्धावस्था को आनंद देता है।",
      hu: "E tanulmányok táplálják az ifjúságot és gyönyörködtetik az öregkort.",
      id: "Pelajaran ini memberi makan masa muda dan menyenangkan masa tua.",
      it: "Questi studi nutrono la giovinezza e allietano la vecchiaia.",
      kk: "Бұл ілім жастықты нәрлендіріп, қарттықты қуантады.",
      ky: "Бул илим жаштыкты азыктандырып, картайганда кубантат.",
      mn: "Энэ эрдэм залуу насыг тэжээж, өтлөх насыг баясгадаг.",
      nl: "Deze studie voedt de jeugd en verblijdt de ouderdom.",
      pl: "Te studia żywią młodość i cieszą starość.",
      ro: "Aceste studii hrănesc tinerețea și încântă bătrânețea.",
      ru: "Эти занятия питают юность и радуют старость.",
      sv: "Dessa studier närer ungdomen och gläder ålderdomen.",
      ta: "இக்கல்வி இளமையை வளர்க்கிறது, முதுமையை மகிழ்விக்கிறது.",
      te: "ఈ విద్య యౌవనాన్ని పోషిస్తుంది, వృద్ధాప్యాన్ని ఆనందపరుస్తుంది.",
      tr: "Bu çalışmalar gençliği besler, yaşlılığı hoş eder.",
      uk: "Ці студії живлять юність і тішать старість.",
      uz: "Bu ilm yoshlikni oziqlantiradi, qarilikni quvontiradi.",
    },
    author: western("Cicero", "키케로", "キケロ", "西塞罗", {
      es: "Cicerón",
      fr: "Cicéron",
      "pt-BR": "Cícero",
      it: "Cicerone",
      pl: "Cyceron",
      ro: "Cicero",
      cs: "Cicero",
      hu: "Cicero",
      tr: "Çiçero",
      ar: "شيشرون",
      bn: "সিসেরো",
      el: "Κικέρων",
      hi: "सिसरो",
      kk: "Цицерон",
      ky: "Цицерон",
      mn: "Цицерон",
      ru: "Цицерон",
      ta: "சிசரோ",
      te: "సిసెరో",
      uk: "Цицерон",
      th: "ซิเซโร",
    }),
  },
  {
    id: "ovid-water-stone",
    originalLanguage: "la",
    originalText: "Gutta cavat lapidem.",
    source: "Ovid, Epistulae ex Ponto IV.10.5 (c. AD 13)",
    published: ["en"],
    translations: {
      en: "A drop hollows out the stone.",
      ko: "물방울이 돌을 뚫는다.",
      ja: "しずくが石を穿つ。",
      "zh-CN": "水滴石穿。",
      es: "La gota horada la piedra.",
      fr: "La goutte creuse la pierre.",
      de: "Der Tropfen höhlt den Stein.",
      "pt-BR": "A gota fura a pedra.",
      vi: "Giọt nước làm mòn đá.",
      th: "หยดน้ำเจาะหินได้",
      ar: "القطرة تنقر الحجر.",
      bn: "জলের ফোঁটা পাথর ক্ষয় করে।",
      cs: "Kapka vyhloubí kámen.",
      el: "Η σταγόνα τρυπάει την πέτρα.",
      fil: "Ang patak ay bumubutas ng bato.",
      hi: "बूँद पत्थर में छेद कर देती है।",
      hu: "A csepp kivájja a követ.",
      id: "Tetesan air melubangi batu.",
      it: "La goccia scava la pietra.",
      kk: "Тамшы тасты теседі.",
      ky: "Тамчы ташты тешет.",
      mn: "Дусал чулууг цоолдог.",
      nl: "De druppel holt de steen uit.",
      pl: "Kropla drąży kamień.",
      ro: "Picătura găurește piatra.",
      ru: "Капля камень точит.",
      sv: "Droppen urholkar stenen.",
      ta: "நீர்த்துளி கல்லைத் துளைக்கும்.",
      te: "నీటి బొట్టు రాయిని తొలుస్తుంది.",
      tr: "Damla taşı deler.",
      uk: "Крапля камінь точить.",
      uz: "Tomchi toshni teshadi.",
    },
    author: western("Ovid", "오비디우스", "オウィディウス", "奥维德", {
      es: "Ovidio",
      fr: "Ovide",
      de: "Ovid",
      "pt-BR": "Ovídio",
      it: "Ovidio",
      pl: "Owidiusz",
      ro: "Ovidiu",
      cs: "Ovidius",
      hu: "Ovidius",
      nl: "Ovidius",
      sv: "Ovidius",
      tr: "Ovidius",
      vi: "Ovidius",
      id: "Ovidius",
      fil: "Ovid",
      ar: "أوفيد",
      bn: "ওভিদ",
      el: "Οβίδιος",
      hi: "ओविद",
      kk: "Овидий",
      ky: "Овидий",
      mn: "Овид",
      ru: "Овидий",
      ta: "ஓவிட்",
      te: "ఓవిడ్",
      uk: "Овідій",
      th: "โอวิด",
    }),
  },
  {
    id: "confucius-learning-thought",
    originalLanguage: "zh",
    originalText: "學而不思則罔，思而不學則殆",
    source: "Confucius, Analects II.15 (compiled c. 5th–3rd century BC)",
    published: ["en", "zh-CN"],
    translations: {
      en: "Learning without thinking is wasted; thinking without learning is dangerous.",
      ko: "배우기만 하고 생각하지 않으면 얻는 것이 없고, 생각만 하고 배우지 않으면 위태롭다.",
      ja: "学びて思わざれば則ち罔し、思いて学ばざれば則ち殆し。",
      "zh-CN": "学而不思则罔，思而不学则殆。",
      es: "Aprender sin pensar es tiempo perdido; pensar sin aprender es peligroso.",
      fr: "Apprendre sans réfléchir est vain ; réfléchir sans apprendre est dangereux.",
      de: "Lernen ohne Nachdenken ist vergeblich; Nachdenken ohne Lernen ist gefährlich.",
      "pt-BR": "Aprender sem pensar é perda de tempo; pensar sem aprender é perigoso.",
      vi: "Học mà không suy nghĩ thì uổng công; suy nghĩ mà không học thì nguy hiểm.",
      th: "เรียนโดยไม่คิดก็สูญเปล่า คิดโดยไม่เรียนก็เป็นอันตราย",
      ar: "التعلّم بلا تفكير ضياع، والتفكير بلا تعلّم خطر.",
      bn: "চিন্তা না করে শেখা বৃথা; শেখা ছাড়া চিন্তা বিপজ্জনক।",
      cs: "Učení bez přemýšlení je marné; přemýšlení bez učení je nebezpečné.",
      el: "Η μάθηση χωρίς σκέψη είναι μάταιη· η σκέψη χωρίς μάθηση είναι επικίνδυνη.",
      fil: "Ang pag-aaral nang walang pag-iisip ay sayang; ang pag-iisip nang walang pag-aaral ay mapanganib.",
      hi: "बिना सोचे सीखना व्यर्थ है; बिना सीखे सोचना ख़तरनाक है।",
      hu: "Gondolkodás nélkül tanulni hiábavaló; tanulás nélkül gondolkodni veszélyes.",
      id: "Belajar tanpa berpikir itu sia-sia; berpikir tanpa belajar itu berbahaya.",
      it: "Imparare senza pensare è vano; pensare senza imparare è pericoloso.",
      kk: "Ойланбай оқу — бос әурешілік, оқымай ойлану — қауіпті.",
      ky: "Ойлонбой окуу — куру бекер, окубай ойлонуу — коркунучтуу.",
      mn: "Бодохгүй сурах нь дэмий, сурахгүй бодох нь аюултай.",
      nl: "Leren zonder denken is verspild; denken zonder leren is gevaarlijk.",
      pl: "Nauka bez myślenia jest daremna; myślenie bez nauki jest niebezpieczne.",
      ro: "A învăța fără a gândi e în zadar; a gândi fără a învăța e periculos.",
      ru: "Учиться, не размышляя, — впустую; размышлять, не учась, — опасно.",
      sv: "Att lära utan att tänka är förgäves; att tänka utan att lära är farligt.",
      ta: "சிந்திக்காமல் கற்பது வீண்; கற்காமல் சிந்திப்பது ஆபத்து.",
      te: "ఆలోచించకుండా నేర్చుకోవడం వృథా; నేర్చుకోకుండా ఆలోచించడం ప్రమాదకరం.",
      tr: "Düşünmeden öğrenmek boşunadır; öğrenmeden düşünmek tehlikelidir.",
      uk: "Вчитися, не думаючи, — марно; думати, не вчившись, — небезпечно.",
      uz: "O‘ylamasdan o‘rganish behuda, o‘rganmasdan o‘ylash xavfli.",
    },
    author: western("Confucius", "공자", "孔子", "孔子", {
      es: "Confucio",
      fr: "Confucius",
      "pt-BR": "Confúcio",
      it: "Confucio",
      ar: "كونفوشيوس",
      bn: "কনফুসিয়াস",
      el: "Κομφούκιος",
      hi: "कन्फ़्यूशियस",
      kk: "Конфуций",
      ky: "Конфуций",
      mn: "Күнз",
      ru: "Конфуций",
      ta: "கன்பூசியஸ்",
      te: "కన్‌ఫ్యూషియస్",
      uk: "Конфуцій",
      th: "ขงจื๊อ",
      vi: "Khổng Tử",
    }),
  },
  {
    id: "confucius-mistake",
    originalLanguage: "zh",
    originalText: "過而不改，是謂過矣",
    source: "Confucius, Analects XV.30 (compiled c. 5th–3rd century BC)",
    published: ["en", "zh-CN"],
    translations: {
      en: "To make a mistake and not correct it — that is the mistake.",
      ko: "잘못하고도 고치지 않는 것, 그것이 바로 잘못이다.",
      ja: "過ちて改めざる、これを過ちという。",
      "zh-CN": "过而不改，是谓过矣。",
      es: "Cometer un error y no corregirlo: ese es el error.",
      fr: "Commettre une faute et ne pas la corriger, voilà la faute.",
      de: "Einen Fehler zu machen und ihn nicht zu berichtigen — das ist der Fehler.",
      "pt-BR": "Cometer um erro e não o corrigir: esse é o erro.",
      vi: "Mắc lỗi mà không sửa — đó mới là lỗi.",
      th: "ทำผิดแล้วไม่แก้ นั่นแหละคือความผิด",
      ar: "أن تخطئ ولا تصحّح خطأك، ذلك هو الخطأ.",
      bn: "ভুল করে তা না শোধরানো—সেটাই আসল ভুল।",
      cs: "Udělat chybu a neopravit ji — to je ta chyba.",
      el: "Το να κάνεις λάθος και να μην το διορθώνεις — αυτό είναι το λάθος.",
      fil: "Ang magkamali at hindi ito itama — iyon ang tunay na pagkakamali.",
      hi: "ग़लती करके उसे न सुधारना—यही असली ग़लती है।",
      hu: "Hibázni és nem javítani ki — ez a hiba.",
      id: "Membuat kesalahan dan tidak memperbaikinya — itulah kesalahannya.",
      it: "Sbagliare e non correggersi: questo è l’errore.",
      kk: "Қате жіберіп, оны түземеу — нағыз қателік сол.",
      ky: "Ката кетирип, аны оңдобоо — чыныгы ката ошол.",
      mn: "Алдаа гаргаад залруулахгүй байх нь — жинхэнэ алдаа.",
      nl: "Een fout maken en die niet verbeteren — dát is de fout.",
      pl: "Popełnić błąd i go nie naprawić — to dopiero błąd.",
      ro: "A greși și a nu îndrepta greșeala — aceasta e greșeala.",
      ru: "Ошибиться и не исправить ошибку — вот это и есть ошибка.",
      sv: "Att göra ett misstag och inte rätta till det — det är misstaget.",
      ta: "தவறு செய்து அதைத் திருத்தாமல் விடுவதே உண்மையான தவறு.",
      te: "తప్పు చేసి దాన్ని సరిదిద్దకపోవడమే నిజమైన తప్పు.",
      tr: "Hata yapıp onu düzeltmemek — asıl hata budur.",
      uk: "Помилитися і не виправити помилку — ось це й є помилка.",
      uz: "Xato qilib, uni tuzatmaslik — asl xato shu.",
    },
    author: western("Confucius", "공자", "孔子", "孔子", {
      es: "Confucio",
      "pt-BR": "Confúcio",
      it: "Confucio",
      ar: "كونفوشيوس",
      bn: "কনফুসিয়াস",
      el: "Κομφούκιος",
      hi: "कन्फ़्यूशियस",
      kk: "Конфуций",
      ky: "Конфуций",
      mn: "Күнз",
      ru: "Конфуций",
      ta: "கன்பூசியஸ்",
      te: "కన్‌ఫ్యూషియస్",
      uk: "Конфуцій",
      th: "ขงจื๊อ",
      vi: "Khổng Tử",
    }),
  },
  {
    id: "seneca-live-learn",
    originalLanguage: "la",
    originalText: "Tamdiu discendum est, quamdiu vivas.",
    source: "Seneca, Moral Letters to Lucilius, 76.3 (c. AD 65)",
    published: ["en"],
    translations: {
      en: "As long as you live, keep learning how to live.",
      ko: "살아 있는 동안은 사는 법을 계속 배워야 한다.",
      ja: "生きているかぎり、生き方を学びつづけなさい。",
      "zh-CN": "只要还活着，就要不断学习如何生活。",
      es: "Mientras vivas, sigue aprendiendo a vivir.",
      fr: "Tant que tu vis, continue d’apprendre à vivre.",
      de: "Solange du lebst, lerne weiter zu leben.",
      "pt-BR": "Enquanto viver, continue aprendendo a viver.",
      vi: "Còn sống ngày nào, hãy còn học cách sống ngày ấy.",
      th: "ตราบที่ยังมีชีวิต จงเรียนรู้ที่จะใช้ชีวิตต่อไป",
      ar: "ما دمت حيًّا، فتعلَّم كيف تعيش.",
      bn: "যতদিন বেঁচে আছেন, বাঁচতে শেখা চালিয়ে যান।",
      cs: "Dokud žiješ, uč se žít.",
      el: "Όσο ζεις, να μαθαίνεις πώς να ζεις.",
      fil: "Habang ikaw ay nabubuhay, patuloy na matuto kung paano mabuhay.",
      hi: "जब तक जीवित हैं, जीना सीखते रहिए।",
      hu: "Amíg élsz, tanulj élni.",
      id: "Selama kamu hidup, teruslah belajar cara hidup.",
      it: "Finché vivi, continua a imparare a vivere.",
      kk: "Тірі болғаныңша өмір сүруді үйрене бер.",
      ky: "Тирүү болгонуңча жашоону үйрөнө бер.",
      mn: "Амьд байх хугацаандаа хэрхэн амьдрахаа сурсаар бай.",
      nl: "Zolang je leeft, blijf je leren leven.",
      pl: "Póki żyjesz, ucz się żyć.",
      ro: "Cât timp trăiești, învață să trăiești.",
      ru: "Пока живёшь, учись жить.",
      sv: "Så länge du lever, fortsätt lära dig att leva.",
      ta: "வாழும் வரை வாழக் கற்றுக்கொண்டே இருங்கள்.",
      te: "బతికినంత కాలం బతకడం నేర్చుకుంటూ ఉండండి.",
      tr: "Yaşadığın sürece yaşamayı öğrenmeye devam et.",
      uk: "Поки живеш, учись жити.",
      uz: "Tirik ekansiz, yashashni o‘rganishda davom eting.",
    },
    author: western("Seneca", "세네카", "セネカ", "塞内卡", {
      ar: "سينيكا",
      bn: "সেনেকা",
      el: "Σενέκας",
      hi: "सेनेका",
      kk: "Сенека",
      ky: "Сенека",
      mn: "Сенека",
      ru: "Сенека",
      ta: "செனிகா",
      te: "సెనెకా",
      uk: "Сенека",
      th: "เซเนกา",
    }),
  },
  {
    id: "seneca-teach-learn",
    originalLanguage: "la",
    originalText: "Homines dum docent discunt.",
    source: "Seneca, Moral Letters to Lucilius, 7.8 (c. AD 64)",
    published: ["en"],
    translations: {
      en: "While they teach, people learn.",
      ko: "가르치는 동안 사람은 배운다.",
      ja: "人は教えながら学ぶ。",
      "zh-CN": "人在教的时候也在学。",
      es: "Los hombres aprenden mientras enseñan.",
      fr: "Les hommes apprennent en enseignant.",
      de: "Menschen lernen, während sie lehren.",
      "pt-BR": "As pessoas aprendem enquanto ensinam.",
      vi: "Người ta học được trong khi dạy.",
      th: "คนเราเรียนรู้ในขณะที่สอน",
      ar: "يتعلّم الناس وهم يعلّمون.",
      bn: "শেখাতে গিয়েই মানুষ শেখে।",
      cs: "Lidé se učí, když učí druhé.",
      el: "Οι άνθρωποι μαθαίνουν καθώς διδάσκουν.",
      fil: "Natututo ang tao habang siya ay nagtuturo.",
      hi: "सिखाते हुए ही लोग सीखते हैं।",
      hu: "Az emberek tanítás közben tanulnak.",
      id: "Orang belajar sambil mengajar.",
      it: "Gli uomini imparano mentre insegnano.",
      kk: "Адамдар үйрете жүріп үйренеді.",
      ky: "Адамдар үйрөтө жүрүп үйрөнөт.",
      mn: "Хүн заах явцдаа суралцдаг.",
      nl: "Mensen leren terwijl ze onderwijzen.",
      pl: "Ludzie uczą się, ucząc innych.",
      ro: "Oamenii învață în timp ce îi învață pe alții.",
      ru: "Обучая, люди учатся сами.",
      sv: "Människor lär sig medan de undervisar.",
      ta: "கற்பிக்கும்போதே மனிதர் கற்கிறார்.",
      te: "బోధిస్తూనే మనుషులు నేర్చుకుంటారు.",
      tr: "İnsanlar öğretirken öğrenir.",
      uk: "Навчаючи, люди вчаться самі.",
      uz: "Odamlar o‘rgatar ekan, o‘zlari ham o‘rganadi.",
    },
    author: western("Seneca", "세네카", "セネカ", "塞内卡", {
      ar: "سينيكا",
      bn: "সেনেকা",
      el: "Σενέκας",
      hi: "सेनेका",
      kk: "Сенека",
      ky: "Сенека",
      mn: "Сенека",
      ru: "Сенека",
      ta: "செனிகா",
      te: "సెనెకా",
      uk: "Сенека",
      th: "เซเนกา",
    }),
  },
  {
    id: "aristotle-learn-by-doing",
    originalLanguage: "el",
    originalText: "ἃ γὰρ δεῖ μαθόντας ποιεῖν, ταῦτα ποιοῦντες μανθάνομεν",
    source: "Aristotle, Nicomachean Ethics II.1, 1103a (c. 340 BC)",
    published: ["en", "el"],
    translations: {
      en: "What we must learn to do, we learn by doing.",
      ko: "배워야 할 수 있는 일은 해 보면서 배운다.",
      ja: "学んでからでなければできないことは、実際にやって学ぶ。",
      "zh-CN": "必须先学会才能做的事，正是在做中学会的。",
      es: "Lo que hay que aprender a hacer, se aprende haciéndolo.",
      fr: "Ce qu’il faut apprendre à faire, on l’apprend en le faisant.",
      de: "Was wir erst lernen müssen, lernen wir, indem wir es tun.",
      "pt-BR": "O que precisamos aprender a fazer, aprendemos fazendo.",
      vi: "Điều phải học mới làm được thì ta học bằng cách làm.",
      th: "สิ่งที่ต้องเรียนก่อนจึงจะทำได้ เราเรียนรู้จากการลงมือทำ",
      ar: "ما يجب أن نتعلّمه لنفعله، نتعلّمه بالفعل نفسه.",
      bn: "যা শিখে করতে হয়, তা করতে করতেই শেখা হয়।",
      cs: "Čemu se musíme naučit, tomu se učíme tím, že to děláme.",
      el: "Αυτά που πρέπει να μάθουμε για να τα κάνουμε, τα μαθαίνουμε κάνοντάς τα.",
      fil: "Ang dapat munang matutunan bago gawin ay natututunan sa paggawa.",
      hi: "जो करना सीखना पड़ता है, वह करते-करते ही सीखा जाता है।",
      hu: "Amit meg kell tanulnunk megcsinálni, azt csinálva tanuljuk meg.",
      id: "Apa yang harus dipelajari untuk bisa dilakukan, kita pelajari dengan melakukannya.",
      it: "Ciò che dobbiamo imparare a fare, lo impariamo facendolo.",
      kk: "Үйреніп барып істейтін нәрсені істей жүріп үйренеміз.",
      ky: "Үйрөнүп туруп жасай турган нерсени жасай жүрүп үйрөнөбүз.",
      mn: "Сурч байж хийдэг зүйлээ хийж байж сурдаг.",
      nl: "Wat we moeten leren doen, leren we door het te doen.",
      pl: "Tego, czego musimy się nauczyć, uczymy się, robiąc to.",
      ro: "Ceea ce trebuie să învățăm să facem, învățăm făcând.",
      ru: "Тому, что нужно уметь делать, мы учимся, делая это.",
      sv: "Det vi måste lära oss att göra, lär vi oss genom att göra det.",
      ta: "செய்யக் கற்க வேண்டியதைச் செய்துகொண்டே கற்கிறோம்.",
      te: "చేయడం నేర్చుకోవాల్సిన వాటిని చేస్తూనే నేర్చుకుంటాం.",
      tr: "Yapmayı öğrenmemiz gereken şeyleri yaparak öğreniriz.",
      uk: "Те, чого треба навчитися, ми опановуємо, роблячи це.",
      uz: "Qilishni o‘rganishimiz kerak bo‘lgan narsani qila turib o‘rganamiz.",
    },
    author: western("Aristotle", "아리스토텔레스", "アリストテレス", "亚里士多德", {
      es: "Aristóteles",
      fr: "Aristote",
      de: "Aristoteles",
      "pt-BR": "Aristóteles",
      it: "Aristotele",
      nl: "Aristoteles",
      pl: "Arystoteles",
      ro: "Aristotel",
      cs: "Aristotelés",
      hu: "Arisztotelész",
      sv: "Aristoteles",
      tr: "Aristoteles",
      vi: "Aristoteles",
      id: "Aristoteles",
      fil: "Aristoteles",
      ar: "أرسطو",
      bn: "অ্যারিস্টটল",
      el: "Ἀριστοτέλης",
      hi: "अरस्तू",
      kk: "Аристотель",
      ky: "Аристотель",
      mn: "Аристотель",
      ru: "Аристотель",
      ta: "அரிஸ்டாட்டில்",
      te: "అరిస్టాటిల్",
      uk: "Аристотель",
      th: "อริสโตเติล",
    }),
  },
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
  /** Null where authorship is uncertain. Rendered as nothing. See §35. */
  author: string | null;
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
    /*
     * Null when nobody can be named, and null is *shown as nothing*.
     *
     * "꿈을 크게 가져라, 깨져도 그 조각이 크다" is on every Korean quotation site
     * under three different names and is in none of their works. So it is here
     * without one, and the line under it is absent rather than reading
     * "Anonymous" or 작자 미상 — which are words that make a missing fact look
     * like a present one. See §35.
     */
    author: quote.author ? (quote.author[locale] ?? quote.author.en!) : null,
    attribution,
    /*
     * The original line, when there is one worth showing.
     *
     * Absent for the lines written for this app: there is no revered source
     * text to put underneath, and printing the English original under every
     * translation would tell a Spanish learner the same thing this screen was
     * changed to stop telling them. `originalText` is empty for those.
     */
    original:
      attribution === "original" || !quote.originalText
        ? null
        : { text: quote.originalText, lang: quote.originalLanguage },
  };
}

function baseOf(locale: string): string {
  return locale.split("-")[0]!;
}

// --- Which one to show ---------------------------------------------------------

/**
 * A quotation, chosen fresh each time the app is opened.
 *
 * ## Why this is not fixed to the day any more
 *
 * It was, and the reasoning was that a quotation is something the app says to
 * somebody *today* rather than a slot machine pulled on every refresh. That
 * held while the library was a hundred lines of encouragement the app had
 * written itself, where a second line was more of the same.
 *
 * Twenty attributed quotations are a different object. Each one is a sentence
 * by a named person from a documented source, and there is no reason a learner
 * who comes back at lunchtime should be denied a different one. Pinning it to
 * the calendar also made the line *state* — something stored, migrated and
 * reasoned about — for what is decoration at the foot of a screen.
 *
 * So: random on load, and nothing is persisted. The only memory kept is the
 * short in-session history that stops the same line appearing twice in a row,
 * which is the one repetition a learner actually notices.
 */

/**
 * The last few shown, in memory only.
 *
 * Not `localStorage`: a quotation is not learning history, and writing to disk
 * for it was the part that made this feel like state. A reload starts the
 * history empty, which at worst repeats one line across a reload — invisible,
 * where the same line twice in one session is not.
 */
let recent: string[] = [];

/** How many to remember. Enough to avoid a near-repeat, short enough to stay random. */
const AVOID_LAST = Math.min(5, Math.max(1, LEARNING_QUOTES.length - 1));

export function quoteOnOpen(random: number = Math.random()): LearningQuote {
  const fresh = LEARNING_QUOTES.filter((quote) => !recent.includes(quote.id));
  const pool = fresh.length > 0 ? fresh : LEARNING_QUOTES;
  const quote = pool[Math.min(pool.length - 1, Math.floor(random * pool.length))]!;
  recent = [...recent, quote.id].slice(-AVOID_LAST);
  return quote;
}

/** Test seam: forgets what has been shown, so a spec can start from nothing. */
export function resetSessionQuote(): void {
  recent = [];
}
