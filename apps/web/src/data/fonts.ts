import type { PracticeFont } from '@hangyul-ganada/shared-types';

/**
 * The practice typefaces.
 *
 * ## What this list is for
 *
 * A learner picks a face to *practise in*, so the set is built out of the
 * writing styles a Korean reader would name — 기본체, 고딕체, 명조체, 궁서·바탕체,
 * 손글씨체, 둥근체 — and each slot is filled by the face most people would
 * actually recognise as that style. Six of them, not twenty: an obscure
 * decorative face is not a learning tool, and a picker nobody can choose from
 * is worse than a short one.
 *
 * ## Licensing
 *
 * This app is sold on the App Store and Google Play, so every file here has to
 * be legal to *redistribute inside a binary*, which is a stricter test than
 * "free to use". Every face below is SIL Open Font License 1.1, which permits
 * bundling and commercial distribution provided the font is not sold on its
 * own and the licence travels with it. Licence, source and package are carried
 * as data rather than in a comment, because the picker shows them and the
 * audit reads them.
 *
 * Nothing is fetched at runtime: all files are self-hosted through an npm
 * package and served from the app's own origin, so the practice screen works
 * on a plane and no third party learns which characters a learner is studying.
 *
 * ### 궁서체, and why this is Gowun Batang
 *
 * Genuine 궁서체 — the palace script that ships as Gungsuh/Gungsuhche on
 * Windows and in Hancom Office — is proprietary. It may not be extracted from
 * an operating system and packaged into a product, whatever a search result
 * says, so it is not here.
 *
 * Gowun Batang is in its place, and is not a serif renamed to look the part:
 * it is a Korean 바탕 face drawn in the brush-written tradition 궁서체 belongs
 * to, with the tapered entries, thin horizontals and vertical stress that make
 * that lineage recognisable. It is labelled for what it is — 바탕체 /
 * "Traditional" — rather than as 궁서체, because claiming otherwise would be a
 * small lie told to a learner who came here to learn what Korean looks like.
 *
 * ## The selected face really is the lesson
 *
 * `font_family` drives the reference glyph on screen *and* the mask the
 * evaluator grades against, through one shared code path. Changing the face
 * changes what "correct" means, which is the whole point of practising in more
 * than one — and it is why every face here had to be measured against the
 * evaluator before it could be offered.
 *
 * ### Two faces were rejected on those measurements
 *
 * **Jua** (배달의민족 주아체) is the rounded face most Koreans would name, and it
 * is not here. Its strokes are about twice the width of the learner's pen, so
 * an honest attempt cannot cover the reference ink: at every tolerance setting
 * tried, a correctly written character scored *worse* than a wrong one. No pass
 * mark separates those two, and a picker option that fails people for writing
 * correctly is not an option.
 *
 * **Nanum Pen Script** is the better-known handwriting face and is not here for
 * a related reason: its fast, loose forms leave 사 and 가 barely a percentage
 * point apart, so the margin between "honest attempt" and "wrong character" was
 * about 0.014 — inside the noise of real handwriting. Gaegu is a slightly less
 * famous hand that measures at 0.10, and correct grading is the point of the
 * feature.
 *
 * Both measurements live in `packages/handwriting-core/src/__tests__/
 * font-tolerance.test.ts`, which runs on every build against the same faces.
 *
 * ### And no face needs its own grading
 *
 * `evaluation` exists for a face that does — the mechanism is real and
 * `gradingFor()` in `features/writing/useEvaluator.ts` applies it — but none of
 * the six sets it. What the measurements actually showed was that the *default*
 * tolerance was slightly too tight once the difference between a font's stroke
 * weight and a pen's is accounted for; that was fixed once, globally, in
 * `handwriting-core/src/config.ts`, which is the better place for a finding
 * that applies to every face.
 */
export const PRACTICE_FONTS: PracticeFont[] = [
  {
    id: 'pretendard',
    name: '기본체',
    name_en: 'Standard',
    family_name: 'Pretendard',
    // The app's own interface face. Practising in it means the character in
    // the writing box and the character in the sentence above it are the same
    // shape, which is the least confusing place for a beginner to start.
    font_family: "'Pretendard Variable', Pretendard, sans-serif",
    category: 'sans',
    weight: 500,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Kil Hyung-jin (pretendard on npm)',
    source_url: 'https://github.com/orioncactus/pretendard',
    bundled: true,
    translations: {
      en: {
        name: 'Standard',
        description: 'Clean, even letterforms, used across modern Korean apps. Start here.',
      },
      ko: { name: '기본체', description: '요즘 앱과 웹에서 가장 많이 보는 반듯한 글자. 처음에는 이걸로 시작하세요.' },
      ja: { name: '標準', description: '今のアプリやウェブでいちばん見かける、整った字形。まずはこれで。' },
      'zh-CN': { name: '标准体', description: '当今韩国应用里最常见的端正字形。先从它开始。' },
      es: { name: 'Estándar', description: 'Letras limpias y parejas, las de las apps coreanas de hoy. Empieza por aquí.' },
      fr: { name: 'Standard', description: 'Des lettres nettes et régulières, celles des applis coréennes d\'aujourd\'hui. Commencez par là.' },
      de: { name: 'Standard', description: 'Klare, gleichmäßige Formen, wie in heutigen koreanischen Apps. Fang hiermit an.' },
      'pt-BR': { name: 'Padrão', description: 'Letras limpas e regulares, as dos aplicativos coreanos de hoje. Comece por aqui.' },
      vi: { name: 'Chuẩn', description: 'Nét chữ sạch và đều, kiểu chữ của các ứng dụng Hàn Quốc ngày nay. Hãy bắt đầu từ đây.' },
      th: { name: 'มาตรฐาน', description: 'รูปตัวอักษรเรียบและสม่ำเสมอ แบบที่ใช้ในแอปเกาหลีสมัยนี้ เริ่มจากแบบนี้ก่อน' },
      ar: { name: 'الأساسي', description: 'حروف نظيفة متساوية، كالتي في التطبيقات الكورية اليوم. ابدأ بهذا.' },
      bn: { name: 'আদর্শ', description: 'পরিষ্কার, সমান গড়নের অক্ষর, আজকের কোরীয় অ্যাপে যেমন থাকে। এখান থেকেই শুরু করুন।' },
      cs: { name: 'Základní', description: 'Čisté, pravidelné tvary, jaké mají dnešní korejské aplikace. Začni tímhle.' },
      el: { name: 'Βασική', description: 'Καθαρά, ομοιόμορφα γράμματα, όπως στις σημερινές κορεατικές εφαρμογές. Ξεκίνα από εδώ.' },
      fil: { name: 'Karaniwan', description: 'Malinis at pantay na hugis ng letra, gaya sa mga app na Koreano ngayon. Dito magsimula.' },
      hi: { name: 'मानक', description: 'साफ़, एक-सी बनावट वाले अक्षर, जैसे आज के कोरियाई ऐप्स में। शुरुआत यहीं से करें।' },
      hu: { name: 'Alap', description: 'Tiszta, egyenletes betűformák, amilyeneket a mai koreai appok használnak. Ezzel kezdd.' },
      id: { name: 'Standar', description: 'Bentuk huruf bersih dan rata, seperti di aplikasi Korea masa kini. Mulailah dari sini.' },
      it: { name: 'Standard', description: 'Lettere pulite e regolari, quelle delle app coreane di oggi. Comincia da qui.' },
      kk: { name: 'Негізгі', description: 'Таза әрі біркелкі әріп пішіні — бүгінгі корей қосымшаларындағыдай. Осыдан бастаңыз.' },
      ky: { name: 'Негизги', description: 'Таза жана бир өңчөй тамга формасы — бүгүнкү корей колдонмолорундагыдай. Ушундан баштаңыз.' },
      mn: { name: 'Үндсэн', description: 'Цэвэр, жигд үсгийн хэлбэр — өнөөгийн солонгос аппуудынх шиг. Үүнээс эхэл.' },
      nl: { name: 'Standaard', description: 'Schone, gelijkmatige letters, zoals in hedendaagse Koreaanse apps. Begin hiermee.' },
      pl: { name: 'Podstawowy', description: 'Czyste, równe kształty liter, jak w dzisiejszych koreańskich aplikacjach. Zacznij od tego.' },
      ro: { name: 'Standard', description: 'Forme de literă curate și uniforme, ca în aplicațiile coreene de azi. Începe cu asta.' },
      ru: { name: 'Основной', description: 'Чистые, ровные буквы — такие в сегодняшних корейских приложениях. С них и начните.' },
      sv: { name: 'Standard', description: 'Rena, jämna bokstavsformer, de som används i dagens koreanska appar. Börja här.' },
      ta: { name: 'நியமம்', description: 'சுத்தமான, சீரான எழுத்து வடிவங்கள் — இன்றைய கொரிய செயலிகளில் உள்ளது போல். இதிலிருந்தே தொடங்குங்கள்.' },
      te: { name: 'ప్రామాణికం', description: 'శుభ్రమైన, సమానమైన అక్షర రూపాలు — ఈనాటి కొరియా యాప్‌లలో ఉన్నట్టు. దీంతోనే మొదలుపెట్టండి.' },
      tr: { name: 'Standart', description: 'Temiz, düzenli harf biçimleri; bugünkü Kore uygulamalarının yazısı. Buradan başla.' },
      uk: { name: 'Основний', description: 'Чисті, рівні літери — такі в сьогоднішніх корейських застосунках. З них і почніть.' },
      uz: { name: 'Standart', description: 'Toza va bir tekis harf shakllari — bugungi koreys ilovalaridagidek. Shundan boshlang.' },
    },
  },
  {
    id: 'nanum-gothic',
    name: '고딕체',
    name_en: 'Sans Serif',
    family_name: 'Nanum Gothic',
    font_family: "'Nanum Gothic', sans-serif",
    category: 'sans',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Naver (@fontsource/nanum-gothic)',
    source_url: 'https://hangeul.naver.com/font',
    bundled: true,
    translations: {
      en: {
        name: 'Sans Serif',
        description: 'The gothic on most Korean websites. Wider and softer, with no stroke decoration.',
      },
      ko: { name: '고딕체', description: '한국 웹사이트에서 가장 흔한 고딕체. 획 장식이 전혀 없어 구조가 잘 보여요.' },
      ja: { name: 'ゴシック体', description: '韓国のサイトで最も多い書体。太めで柔らかく、飾りがありません。' },
      'zh-CN': { name: '黑体', description: '韩国网站上最常见的黑体。更宽更柔，笔画没有任何装饰。' },
      es: { name: 'Palo seco', description: 'La gótica de casi toda la web coreana. Más ancha y suave, sin adornos en el trazo.' },
      fr: { name: 'Sans empattement', description: 'La gothique de presque tous les sites coréens. Plus large et plus douce, sans ornement de trait.' },
      de: { name: 'Grotesk', description: 'Die Gothic der meisten koreanischen Websites. Breiter und weicher, ganz ohne Strichschmuck.' },
      'pt-BR': { name: 'Sem serifa', description: 'A gótica da maioria dos sites coreanos. Mais larga e macia, sem enfeite no traço.' },
      vi: { name: 'Không chân', description: 'Kiểu gothic của hầu hết trang web Hàn Quốc. Rộng và mềm hơn, nét không có phần trang trí.' },
      th: { name: 'โกธิก', description: 'โกธิกที่พบมากที่สุดบนเว็บไซต์เกาหลี กว้างและนุ่มกว่า ไม่มีลวดลายที่เส้น' },
      ar: { name: 'القوطي', description: 'القوطي الذي تستعمله معظم المواقع الكورية. أعرض وألين، ولا زخرفة في الخط.' },
      bn: { name: 'স্যান্স সেরিফ', description: 'বেশির ভাগ কোরীয় ওয়েবসাইটের গথিক। চওড়া ও নরম, টানে কোনও অলংকরণ নেই।' },
      cs: { name: 'Bezpatkové', description: 'Gotické písmo většiny korejských webů. Širší a měkčí, bez ozdob na tazích.' },
      el: { name: 'Χωρίς πατούρες', description: 'Η γοτθική των περισσότερων κορεατικών ιστότοπων. Πιο πλατιά και απαλή, χωρίς στολίδια στη γραμμή.' },
      fil: { name: 'Walang Serif', description: 'Ang gothic sa halos lahat ng website na Koreano. Mas malapad at malambot, walang palamuti sa guhit.' },
      hi: { name: 'सैन्स सेरिफ़', description: 'अधिकतर कोरियाई वेबसाइटों का गॉथिक। चौड़ा और नरम, स्ट्रोक पर कोई सजावट नहीं।' },
      hu: { name: 'Talpatlan', description: 'A koreai weboldalak többségének gótikája. Szélesebb és lágyabb, a vonások dísztelenek.' },
      id: { name: 'Tanpa Kait', description: 'Gotik yang dipakai hampir semua situs Korea. Lebih lebar dan lembut, tanpa hiasan pada goresan.' },
      it: { name: 'Bastoni', description: 'Il gotico di quasi tutti i siti coreani. Più largo e morbido, senza decorazioni nel tratto.' },
      kk: { name: 'Гротеск', description: 'Корей сайттарының көбіндегі гротеск. Кеңірек әрі жұмсақ, сызықта еш әшекей жоқ.' },
      ky: { name: 'Гротеск', description: 'Корей сайттарынын көбүндөгү гротеск. Кеңирээк жана жумшак, сызыкта эч кооздук жок.' },
      mn: { name: 'Гротеск', description: 'Солонгос сайтуудын ихэнхэд байдаг гротеск. Илүү өргөн, зөөлөн, зурлагад ямар ч чимэг байхгүй.' },
      nl: { name: 'Schreefloos', description: 'De gothic van de meeste Koreaanse websites. Breder en zachter, zonder streekversiering.' },
      pl: { name: 'Bezszeryfowy', description: 'Gotyk z większości koreańskich stron. Szerszy i miększy, bez ozdób na kreskach.' },
      ro: { name: 'Fără serife', description: 'Gotica de pe majoritatea site-urilor coreene. Mai lată și mai blândă, fără ornamente pe trasee.' },
      ru: { name: 'Гротеск', description: 'Гротеск с большинства корейских сайтов. Шире и мягче, без всяких украшений в штрихе.' },
      sv: { name: 'Sanserif', description: 'Den gotiska stilen på de flesta koreanska webbplatser. Bredare och mjukare, utan dekor i draget.' },
      ta: { name: 'சான்ஸ் செரிஃப்', description: 'பெரும்பாலான கொரிய இணையதளங்களின் கோதிக். அகலமாகவும் மென்மையாகவும், கீற்றில் அலங்காரம் இல்லாமல்.' },
      te: { name: 'సాన్స్ సెరిఫ్', description: 'చాలా కొరియా వెబ్‌సైట్లలోని గోతిక్. వెడల్పుగా, మృదువుగా, గీతపై ఎలాంటి అలంకరణ లేకుండా.' },
      tr: { name: 'Serifsiz', description: 'Kore sitelerinin çoğundaki gotik. Daha geniş ve yumuşak, çizgide hiç süs yok.' },
      uk: { name: 'Гротеск', description: 'Гротеск із більшості корейських сайтів. Ширший і м’якший, без жодних прикрас у штриху.' },
      uz: { name: 'Serifsiz', description: 'Koreys saytlarining ko‘pchiligidagi gotik. Kengroq va yumshoqroq, chiziqda bezak yo‘q.' },
    },
  },
  {
    id: 'nanum-myeongjo',
    name: '명조체',
    name_en: 'Myeongjo',
    family_name: 'Nanum Myeongjo',
    font_family: "'Nanum Myeongjo', serif",
    category: 'serif',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Naver (@fontsource/nanum-myeongjo)',
    source_url: 'https://hangeul.naver.com/font',
    bundled: true,
    translations: {
      en: {
        name: 'Myeongjo',
        description: 'Korean serif — the shapes in books and newspapers. Strokes start thick, finish thin.',
      },
      ko: { name: '명조체', description: '책과 신문에서 보는 명조체. 획의 시작은 굵고 끝은 가늘어요.' },
      ja: { name: '明朝体', description: '本や新聞の字。線の入りは太く、終わりは細くなります。' },
      'zh-CN': { name: '明朝体', description: '书籍和报纸里的字。起笔粗，收笔细。' },
      es: { name: 'Myeongjo', description: 'La serif coreana: la de los libros y los periódicos. El trazo empieza grueso y acaba fino.' },
      fr: { name: 'Myeongjo', description: 'La serif coréenne, celle des livres et des journaux. Le trait commence épais et finit fin.' },
      de: { name: 'Myeongjo', description: 'Die koreanische Serifenschrift aus Büchern und Zeitungen. Striche beginnen dick und enden dünn.' },
      'pt-BR': { name: 'Myeongjo', description: 'A serifada coreana: a dos livros e jornais. O traço começa grosso e termina fino.' },
      vi: { name: 'Myeongjo', description: 'Chữ có chân của Hàn Quốc — kiểu chữ trong sách báo. Nét mở đầu dày, kết thúc mảnh.' },
      th: { name: 'มยองโจ', description: 'อักษรมีเชิงของเกาหลี — แบบที่เห็นในหนังสือและหนังสือพิมพ์ เส้นเริ่มหนาแล้วจบบาง' },
      ar: { name: 'ميونغجو', description: 'الخط الكوري ذي الذيول، خط الكتب والصحف. تبدأ الضربة سميكة وتنتهي رفيعة.' },
      bn: { name: 'ম্যংজো', description: 'কোরীয় সেরিফ — বই আর খবরের কাগজের গড়ন। টান মোটা হয়ে শুরু, সরু হয়ে শেষ।' },
      cs: { name: 'Myeongjo', description: 'Korejská patková — písmo knih a novin. Tah začíná silně a končí tence.' },
      el: { name: 'Μιεόντζο', description: 'Η κορεατική με πατούρες — τα σχήματα των βιβλίων και των εφημερίδων. Η γραμμή αρχίζει παχιά και τελειώνει λεπτή.' },
      fil: { name: 'Myeongjo', description: 'Ang serif na Koreano — ang hugis sa mga aklat at pahayagan. Makapal ang simula ng guhit, manipis ang dulo.' },
      hi: { name: 'म्योंगजो', description: 'कोरियाई सेरिफ़ — किताबों और अख़बारों की बनावट। स्ट्रोक मोटा शुरू होकर पतला ख़त्म होता है।' },
      hu: { name: 'Mjongdzso', description: 'A koreai talpas betű — a könyvek és újságok formái. A vonás vastagon indul és vékonyan végződik.' },
      id: { name: 'Myeongjo', description: 'Serif Korea — bentuk yang ada di buku dan koran. Goresan mulai tebal, berakhir tipis.' },
      it: { name: 'Myeongjo', description: 'Il graziato coreano: quello dei libri e dei giornali. Il tratto comincia spesso e finisce sottile.' },
      kk: { name: 'Мёнджо', description: 'Корей антиквасы — кітап пен газеттегі пішін. Сызық жуан басталып, жіңішке бітеді.' },
      ky: { name: 'Мёнджо', description: 'Корей антиквасы — китеп менен гезиттеги форма. Сызык жоон башталып, ичке бүтөт.' },
      mn: { name: 'Мёнжо', description: 'Солонгос антиква — ном, сонины хэлбэр. Зурлага бүдүүнээр эхэлж, нарийнаар төгсдөг.' },
      nl: { name: 'Myeongjo', description: 'De Koreaanse schreefletter uit boeken en kranten. Streken beginnen dik en eindigen dun.' },
      pl: { name: 'Myeongjo', description: 'Koreańska szeryfowa — pismo książek i gazet. Kreska zaczyna się grubo, kończy cienko.' },
      ro: { name: 'Myeongjo', description: 'Serifa coreeană — formele din cărți și ziare. Trasarea începe gros și se termină subțire.' },
      ru: { name: 'Мёнджо', description: 'Корейская антиква — буквы книг и газет. Штрих начинается толстым и кончается тонким.' },
      sv: { name: 'Myeongjo', description: 'Den koreanska antikvan — formerna i böcker och tidningar. Dragen börjar tjockt och slutar tunt.' },
      ta: { name: 'மியொங்ஜோ', description: 'கொரிய செரிஃப் — புத்தகங்களிலும் செய்தித்தாள்களிலும் காணும் வடிவம். கீற்று தடிமனாகத் தொடங்கி மெல்லியதாக முடியும்.' },
      te: { name: 'మ్యాంగ్‌జో', description: 'కొరియా సెరిఫ్ — పుస్తకాల్లో, వార్తాపత్రికల్లో కనిపించే రూపం. గీత మందంగా మొదలై సన్నగా ముగుస్తుంది.' },
      tr: { name: 'Myeongjo', description: 'Korece tırnaklı yazı — kitapların ve gazetelerin biçimi. Çizgi kalın başlar, ince biter.' },
      uk: { name: 'Мьонджо', description: 'Корейська антиква — літери книжок і газет. Штрих починається товстим і закінчується тонким.' },
      uz: { name: 'Myongjo', description: 'Koreys serifli yozuvi — kitob va gazetalardagi shakl. Chiziq qalin boshlanib, ingichka tugaydi.' },
    },
  },
  {
    id: 'gowun-batang',
    name: '바탕체',
    name_en: 'Traditional',
    family_name: 'Gowun Batang',
    font_family: "'Gowun Batang', serif",
    category: 'traditional',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Yanghee Ryu (@fontsource/gowun-batang)',
    source_url: 'https://github.com/yangheeryu/Gowun-Batang',
    bundled: true,
    translations: {
      en: {
        name: 'Traditional',
        description:
          'The brush-written tradition 궁서체 belongs to. Elegant, and the hardest to trace.',
      },
      ko: { name: '바탕체', description: '붓으로 쓰던 전통 서체 계열(궁서체 계통). 우아하지만 따라 쓰기는 가장 어려워요.' },
      ja: { name: '伝統書体', description: '筆で書く伝統(宮書体の系統)。優雅ですが、なぞるのは最も難しい書体です。' },
      'zh-CN': { name: '传统体', description: '毛笔书写的传统（宫书体一脉）。优雅，但也是最难描摹的。' },
      es: { name: 'Tradicional', description: 'La tradición del pincel, la del 궁서체. Elegante, y la más difícil de calcar.' },
      fr: { name: 'Traditionnelle', description: 'La tradition du pinceau, celle du 궁서체. Élégante, et la plus difficile à retracer.' },
      de: { name: 'Traditionell', description: 'Die Pinseltradition, zu der 궁서체 gehört. Elegant — und am schwersten nachzuziehen.' },
      'pt-BR': { name: 'Tradicional', description: 'A tradição do pincel, a do 궁서체. Elegante — e a mais difícil de traçar.' },
      vi: { name: 'Truyền thống', description: 'Truyền thống viết bút lông mà 궁서체 thuộc về. Thanh nhã, và khó tô lại nhất.' },
      th: { name: 'ดั้งเดิม', description: 'สายพู่กันแบบดั้งเดิมที่ 궁서체 อยู่ในนั้น สง่างาม และลากตามยากที่สุด' },
      ar: { name: 'التقليدي', description: 'تقليد الفرشاة الذي ينتمي إليه 궁서체. أنيق، وأصعب الخطوط في التتبّع.' },
      bn: { name: 'ঐতিহ্যবাহী', description: 'তুলির যে ঐতিহ্যে 궁서체 পড়ে। মার্জিত, আর নকল করা সবচেয়ে কঠিন।' },
      cs: { name: 'Tradiční', description: 'Štětcová tradice, ke které patří 궁서체. Elegantní a nejtěžší na obtahování.' },
      el: { name: 'Παραδοσιακή', description: 'Η παράδοση του πινέλου στην οποία ανήκει το 궁서체. Κομψή, και η δυσκολότερη στην αντιγραφή.' },
      fil: { name: 'Tradisyonal', description: 'Ang tradisyon ng brotsa na kinabibilangan ng 궁서체. Elegante, at pinakamahirap tapyasan.' },
      hi: { name: 'पारंपरिक', description: 'ब्रश की वह परंपरा जिससे 궁서체 आता है। सुंदर, और नक़ल करने में सबसे कठिन।' },
      hu: { name: 'Hagyományos', description: 'Az ecsetes hagyomány, amelyhez a 궁서체 tartozik. Elegáns, és a legnehezebb átrajzolni.' },
      id: { name: 'Tradisional', description: 'Tradisi kuas tempat 궁서체 berasal. Anggun, dan paling sulit ditiru.' },
      it: { name: 'Tradizionale', description: 'La tradizione del pennello, quella del 궁서체. Elegante, e la più difficile da ricalcare.' },
      kk: { name: 'Дәстүрлі', description: '궁서체 жататын қылқалам дәстүрі. Әсем, әрі сызып шығуға ең қиыны.' },
      ky: { name: 'Салттуу', description: '궁서체 таандык калем сапы салты. Кооз, жана сызып чыгууга эң кыйыны.' },
      mn: { name: 'Уламжлалт', description: '궁서체 хамаарах бийрийн уламжлал. Гоёмсог бөгөөд давхарлан зурахад хамгийн хэцүү.' },
      nl: { name: 'Traditioneel', description: 'De penseeltraditie waartoe 궁서체 hoort. Elegant, en het moeilijkst om over te trekken.' },
      pl: { name: 'Tradycyjny', description: 'Tradycja pędzla, do której należy 궁서체. Elegancka i najtrudniejsza do obrysowania.' },
      ro: { name: 'Tradițional', description: 'Tradiția penelului din care face parte 궁서체. Elegantă, și cea mai greu de trasat.' },
      ru: { name: 'Традиционный', description: 'Кистевая традиция, к которой относится 궁서체. Изящно и труднее всего для обводки.' },
      sv: { name: 'Traditionell', description: 'Penseltraditionen som 궁서체 hör till. Elegant, och svårast att spåra.' },
      ta: { name: 'மரபு', description: '궁서체 சேர்ந்த தூரிகை மரபு. நேர்த்தியானது, ஆனால் வரைந்து பின்பற்ற மிகக் கடினமானது.' },
      te: { name: 'సంప్రదాయం', description: '궁서체 చెందిన కుంచె సంప్రదాయం. సొగసైనది, గీసి అనుసరించడానికి అన్నిటికంటే కష్టమైనది.' },
      tr: { name: 'Geleneksel', description: '궁서체\'nin ait olduğu fırça geleneği. Zarif ve üzerinden geçmesi en zor olanı.' },
      uk: { name: 'Традиційний', description: 'Пензлева традиція, до якої належить 궁서체. Витончено — і найважче для обведення.' },
      uz: { name: 'An’anaviy', description: '궁서체 mansub bo‘lgan mo‘yqalam an’anasi. Nafis, va nusxa olish eng qiyini.' },
    },
  },
  {
    id: 'gaegu',
    name: '손글씨체',
    name_en: 'Handwriting',
    family_name: 'Gaegu',
    font_family: "'Gaegu', cursive",
    category: 'handwriting',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Yoon Design (@fontsource/gaegu)',
    source_url: 'https://fonts.google.com/specimen/Gaegu',
    bundled: true,
    /**
     * The one face that needs its own tolerance, and it was measured rather
     * than guessed.
     *
     * Gaegu's strokes are the thinnest of the six — about 300 ink pixels where
     * Pretendard has 900 — and the default tolerance band is a fraction of the
     * *box*, not of the stroke. On a thin face the band therefore swallows the
     * difference between a letter and the same letter with a stroke added: the
     * adversarial corpus caught it accepting ㅋ for ㄱ, ㅂ for ㅁ, ㅌ for ㄷ and
     * ㅎ for ㅇ, at a false-acceptance rate of 4.96% against 0.83% on the
     * baseline face.
     *
     * At 0.036 the same corpus reports 1.65%, with false rejection unchanged at
     * 0.21% — the band is still wider than any honest wobble it measured, and
     * no longer wide enough to hide a stroke. The number sits in the middle of
     * a flat region (0.034 to 0.038 all measure identically), so it is not
     * balanced on the edge of one.
     */
    evaluation: { glyph_tolerance_ratio: 0.036 },
    translations: {
      en: {
        name: 'Handwriting',
        description: 'A pencil hand — upright and unhurried, close to how you will write it yourself.',
      },
      ko: { name: '손글씨체', description: '연필로 또박또박 쓴 손글씨. 실제로 연습할 때 나오는 글씨와 가장 비슷해요.' },
      ja: { name: '手書き体', description: '鉛筆で書いたような字。まっすぐで気取らず、自分の手に近い形です。' },
      'zh-CN': { name: '手写体', description: '像铅笔写的字。端正、不急不缓，最接近你自己的手写。' },
      es: { name: 'Manuscrita', description: 'Una letra a lápiz, recta y sin prisa, parecida a la que harás tú.' },
      fr: { name: 'Manuscrite', description: 'Une écriture au crayon, droite et sans hâte, proche de celle que vous ferez vous-même.' },
      de: { name: 'Handschrift', description: 'Eine Bleistiftschrift: aufrecht, ohne Eile, nah an dem, was du selbst schreiben wirst.' },
      'pt-BR': { name: 'Manuscrita', description: 'Uma letra a lápis, reta e sem pressa, parecida com a que você vai fazer.' },
      vi: { name: 'Chữ viết tay', description: 'Nét bút chì — thẳng và thong thả, gần với chữ bạn sẽ tự viết.' },
      th: { name: 'ลายมือ', description: 'ลายมือดินสอ ตั้งตรงและไม่รีบร้อน ใกล้เคียงกับที่คุณจะเขียนเอง' },
      ar: { name: 'خط اليد', description: 'خط قلم رصاص — منتصب غير متعجّل، أقرب ما يكون إلى ما ستكتبه بيدك.' },
      bn: { name: 'হাতের লেখা', description: 'পেনসিলের হাত — সোজা আর তাড়াহুড়োহীন, আপনি নিজে যেমন লিখবেন তার কাছাকাছি।' },
      cs: { name: 'Rukopisné', description: 'Tužková ruka — vzpřímená a beze spěchu, blízká tomu, co napíšeš sám.' },
      el: { name: 'Χειρόγραφη', description: 'Γραφή με μολύβι — όρθια και αβίαστη, κοντά σε αυτή που θα κάνεις κι εσύ.' },
      fil: { name: 'Sulat-kamay', description: 'Kamay na lapis — tuwid at hindi nagmamadali, malapit sa isusulat mo mismo.' },
      hi: { name: 'हस्तलेख', description: 'पेंसिल की लिखावट — सीधी और इत्मीनान भरी, आपकी अपनी लिखावट के क़रीब।' },
      hu: { name: 'Kézírás', description: 'Ceruzás kézírás — egyenes és sietség nélküli, közel ahhoz, amit magad fogsz írni.' },
      id: { name: 'Tulisan Tangan', description: 'Tulisan pensil — tegak dan tanpa terburu-buru, mirip tulisan tangan Anda sendiri.' },
      it: { name: 'Corsivo a mano', description: 'Una scrittura a matita, dritta e senza fretta, vicina a quella che farai tu.' },
      kk: { name: 'Қолжазба', description: 'Қарындаш қолтаңбасы — тік әрі асықпайтын, өзіңіз жазатынға ұқсас.' },
      ky: { name: 'Кол жазмасы', description: 'Карандаш колтамгасы — түз жана шашпаган, өзүңүз жазганга жакын.' },
      mn: { name: 'Гар бичмэл', description: 'Харандааны бичиг — босоо, яаралгүй, чиний өөрийн бичихтэй ойрхон.' },
      nl: { name: 'Handschrift', description: 'Een potloodhand: rechtop en op zijn gemak, dicht bij wat je zelf zult schrijven.' },
      pl: { name: 'Odręczny', description: 'Ołówkowa ręka — prosta i bez pośpiechu, bliska temu, co napiszesz sam.' },
      ro: { name: 'De mână', description: 'O mână de creion — dreaptă și fără grabă, aproape de ce vei scrie tu.' },
      ru: { name: 'Рукописный', description: 'Карандашный почерк — прямой и неторопливый, близкий к тому, что напишете вы сами.' },
      sv: { name: 'Handstil', description: 'En blyertshand — upprätt och obrådskande, nära det du själv kommer att skriva.' },
      ta: { name: 'கையெழுத்து', description: 'பென்சில் கை — நிமிர்ந்ததும் அவசரமற்றதும், நீங்களே எழுதப்போவதற்கு நெருக்கமானது.' },
      te: { name: 'చేతిరాత', description: 'పెన్సిల్ చేతిరాత — నిటారుగా, తొందర లేకుండా, మీరే రాయబోయే దానికి దగ్గరగా.' },
      tr: { name: 'El yazısı', description: 'Kurşun kalem eli — dik ve acelesiz, kendi yazacağına en yakın olanı.' },
      uk: { name: 'Рукописний', description: 'Олівцевий почерк — прямий і неквапливий, близький до того, що напишете ви самі.' },
      uz: { name: 'Qo‘lyozma', description: 'Qalam yozuvi — tik va shoshmasdan, o‘zingiz yozadiganingizga yaqin.' },
    },
  },
  {
    id: 'gowun-dodum',
    name: '둥근체',
    name_en: 'Rounded',
    family_name: 'Gowun Dodum',
    font_family: "'Gowun Dodum', sans-serif",
    category: 'rounded',
    weight: 400,
    license: 'SIL Open Font License 1.1',
    license_short: 'OFL 1.1',
    license_url: 'https://openfontlicense.org',
    source: 'Yanghee Ryu (@fontsource/gowun-dodum)',
    source_url: 'https://github.com/yangheeryu/Gowun-Dodum',
    bundled: true,
    translations: {
      en: {
        name: 'Rounded',
        description: 'Soft, rounded strokes with no sharp corners. The gentlest of the six to trace.',
      },
      ko: { name: '둥근체', description: '모서리가 둥글고 획이 부드러운 글씨. 여섯 가지 중 따라 쓰기가 가장 편해요.' },
      ja: { name: '丸ゴシック', description: '角のない、やわらかい丸い線。六つのなかで最もなぞりやすい書体です。' },
      'zh-CN': { name: '圆体', description: '柔和的圆笔画，没有尖角。六种里最好描摹的一种。' },
      es: { name: 'Redondeada', description: 'Trazos suaves y redondos, sin esquinas. La más fácil de calcar de las seis.' },
      fr: { name: 'Arrondie', description: 'Des traits doux et ronds, sans angle vif. La plus facile à retracer des six.' },
      de: { name: 'Rund', description: 'Weiche, runde Striche ohne scharfe Ecken. Von den sechsen die sanfteste zum Nachziehen.' },
      'pt-BR': { name: 'Arredondada', description: 'Traços macios e redondos, sem cantos. A mais fácil de traçar das seis.' },
      vi: { name: 'Bo tròn', description: 'Nét mềm, bo tròn, không có góc nhọn. Dễ tô lại nhất trong sáu kiểu.' },
      th: { name: 'มนกลม', description: 'เส้นนุ่มมนกลม ไม่มีมุมแหลม ลากตามง่ายที่สุดในหกแบบ' },
      ar: { name: 'المدوَّر', description: 'ضربات لينة مدوَّرة بلا زوايا حادّة. أسهل الستة في التتبّع.' },
      bn: { name: 'গোলাকার', description: 'নরম, গোল টান, কোনও ধারালো কোণ নেই। ছয়টির মধ্যে নকল করা সবচেয়ে সহজ।' },
      cs: { name: 'Kulaté', description: 'Měkké, kulaté tahy bez ostrých rohů. Ze šesti nejsnadnější na obtahování.' },
      el: { name: 'Στρογγυλεμένη', description: 'Απαλές, στρογγυλεμένες γραμμές χωρίς αιχμηρές γωνίες. Η πιο εύκολη από τις έξι.' },
      fil: { name: 'Bilugan', description: 'Malambot at bilugang mga guhit, walang matulis na sulok. Pinakamadaling tapyasan sa anim.' },
      hi: { name: 'गोलाकार', description: 'नरम, गोल स्ट्रोक, कोई नुकीला कोना नहीं। छहों में नक़ल करने में सबसे आसान।' },
      hu: { name: 'Kerekített', description: 'Lágy, kerek vonások, éles sarkok nélkül. A hatból ezt a legkönnyebb átrajzolni.' },
      id: { name: 'Membulat', description: 'Goresan lembut dan membulat, tanpa sudut tajam. Paling mudah ditiru dari keenamnya.' },
      it: { name: 'Arrotondato', description: 'Tratti morbidi e tondi, senza spigoli. Il più facile da ricalcare dei sei.' },
      kk: { name: 'Дөңгелек', description: 'Өткір бұрышы жоқ, жұмсақ дөңгелек сызықтар. Алтауының ішіндегі ең жеңілі.' },
      ky: { name: 'Тегерек', description: 'Курч бурчу жок, жумшак тегерек сызыктар. Алтоонун ичинен эң жеңили.' },
      mn: { name: 'Дугуй', description: 'Хурц булангүй, зөөлөн дугуй зурлагууд. Зургаагийн хамгийн амархан нь.' },
      nl: { name: 'Rond', description: 'Zachte, ronde streken zonder scherpe hoeken. Van de zes het makkelijkst om over te trekken.' },
      pl: { name: 'Zaokrąglony', description: 'Miękkie, zaokrąglone kreski bez ostrych rogów. Z szóstki najłatwiejszy do obrysowania.' },
      ro: { name: 'Rotunjit', description: 'Trasee moi, rotunjite, fără colțuri ascuțite. Cel mai blând de trasat dintre cele șase.' },
      ru: { name: 'Округлый', description: 'Мягкие округлые штрихи без острых углов. Самый лёгкий для обводки из шести.' },
      sv: { name: 'Rundad', description: 'Mjuka, rundade drag utan skarpa hörn. Den mildaste av de sex att spåra.' },
      ta: { name: 'வட்டமானது', description: 'கூர்மையான மூலைகளற்ற, மென்மையான வட்டக் கீற்றுகள். ஆறிலும் பின்பற்ற எளிதானது.' },
      te: { name: 'గుండ్రం', description: 'పదునైన మూలలు లేని మృదువైన గుండ్రటి గీతలు. ఆరింటిలో అనుసరించడానికి అత్యంత సులభమైనది.' },
      tr: { name: 'Yuvarlak', description: 'Keskin köşesiz, yumuşak ve yuvarlak çizgiler. Altısı içinde en kolay geçileni.' },
      uk: { name: 'Округлий', description: 'М’які округлі штрихи без гострих кутів. Найлегший для обведення з шести.' },
      uz: { name: 'Yumaloq', description: 'Yumshoq, yumaloq chiziqlar, o‘tkir burchaksiz. Oltitasi ichida eng osoni.' },
    },
  },
];

export const DEFAULT_FONT_ID = 'pretendard';

const BY_ID = new Map(PRACTICE_FONTS.map((f) => [f.id, f]));

/**
 * The face for an id, falling back to the default.
 *
 * The fallback is load-bearing rather than defensive: a learner who chose a
 * face that a later release retired still has its id in local storage, and the
 * right answer is the standard face, not a crash on the settings screen.
 */
export function getFont(id: string): PracticeFont {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_FONT_ID)!;
}

/**
 * Preview strings shown on each option in the picker.
 *
 * Korean, in every UI language: the point of the preview is to show what the
 * learner will be tracing, and that is Hangul whatever language the interface
 * speaks. 가나다 is also the product's own name.
 */
export const FONT_PREVIEW_PRIMARY = '가나다';
export const FONT_PREVIEW_SECONDARY = '한글';
