"""The editorial layer over the imported dictionary.

A frequency list and a dictionary between them can tell you what Korean
*contains*. Neither can tell you what to teach a beginner on their fourth day,
and following either one blindly produces a curriculum that opens with 그,
것 and 수 — all genuinely among the most frequent words in the language, and all
useless as a first handwriting lesson.

So this file is where a human decides. Everything in it is Hangyul ganada's own
judgement and is attributed to us, never to a source. Nothing here invents a
fact about Korean; it only decides what to show, when, and in what order.
"""

from __future__ import annotations

#: Words that must be in the curriculum whatever the corpus says, with the
#: teaching band they belong to.
#:
#: A subtitle corpus under-counts exactly the words a beginner needs first —
#: numbers, colours, days, family terms and food are said on screen far less
#: often than 그 and 좀. Ranking on frequency alone would drop them, so they are
#: pinned. The `boost` is added to the usefulness score, 0–1.
CORE_WORDS: dict[str, float] = {
    # People
    "사람": 0.35, "친구": 0.35, "가족": 0.35, "어머니": 0.3, "아버지": 0.3,
    "엄마": 0.3, "아빠": 0.3, "형": 0.2, "누나": 0.2, "언니": 0.2, "오빠": 0.2,
    "동생": 0.25, "아이": 0.25, "남자": 0.3, "여자": 0.3, "선생님": 0.3,
    "학생": 0.3, "이름": 0.35, "나이": 0.25,
    # Food and drink
    "물": 0.4, "밥": 0.4, "빵": 0.3, "고기": 0.3, "김치": 0.3, "우유": 0.3,
    "커피": 0.3, "차": 0.25, "사과": 0.35, "과일": 0.25, "채소": 0.2,
    "라면": 0.25, "국": 0.2, "달걀": 0.2, "설탕": 0.15, "소금": 0.15,
    "음식": 0.3, "식당": 0.25, "물고기": 0.15,
    # Home and objects
    "집": 0.4, "방": 0.3, "문": 0.3, "창문": 0.2, "책": 0.35, "책상": 0.25,
    "의자": 0.3, "가방": 0.3, "옷": 0.3, "신발": 0.25, "모자": 0.25,
    "시계": 0.25, "전화": 0.25, "컴퓨터": 0.2, "우산": 0.2, "지갑": 0.2,
    "연필": 0.2, "종이": 0.2, "거울": 0.15, "침대": 0.2,
    # Places and movement
    "학교": 0.35, "회사": 0.25, "병원": 0.25, "가게": 0.2, "시장": 0.2,
    "공원": 0.25, "역": 0.2, "길": 0.25, "나라": 0.25, "한국": 0.35,
    "서울": 0.2, "도시": 0.2, "산": 0.25, "바다": 0.3, "하늘": 0.25,
    # Animals and nature
    "개": 0.3, "고양이": 0.35, "새": 0.25, "나무": 0.3, "꽃": 0.3, "물고기": 0.2,
    "비": 0.3, "눈": 0.3, "바람": 0.25, "해": 0.2, "달": 0.25, "별": 0.25,
    # Time
    "오늘": 0.4, "내일": 0.35, "어제": 0.35, "아침": 0.3, "점심": 0.25,
    "저녁": 0.3, "밤": 0.3, "낮": 0.2, "시간": 0.35, "요일": 0.2, "주말": 0.25,
    "지금": 0.35, "년": 0.2, "달": 0.2, "날": 0.25,
    # Numbers
    "하나": 0.35, "둘": 0.3, "셋": 0.3, "넷": 0.25, "다섯": 0.25, "여섯": 0.2,
    "일곱": 0.2, "여덟": 0.2, "아홉": 0.2, "열": 0.2, "백": 0.15, "천": 0.15,
    # Colours
    "색": 0.2, "빨강": 0.2, "파랑": 0.2, "노랑": 0.2, "검정": 0.2, "하양": 0.2,
    # Verbs a beginner uses on day one
    "가다": 0.4, "오다": 0.4, "먹다": 0.4, "마시다": 0.35, "보다": 0.4,
    "듣다": 0.35, "말하다": 0.35, "읽다": 0.35, "쓰다": 0.35, "하다": 0.4,
    "자다": 0.35, "일어나다": 0.25, "앉다": 0.25, "서다": 0.25, "웃다": 0.25,
    "울다": 0.25, "사다": 0.3, "팔다": 0.25, "주다": 0.3, "받다": 0.3,
    "배우다": 0.3, "가르치다": 0.25, "만나다": 0.3, "살다": 0.3, "일하다": 0.3,
    "좋아하다": 0.35, "싫어하다": 0.25, "알다": 0.3, "모르다": 0.3,
    "있다": 0.3, "없다": 0.3, "되다": 0.25, "놀다": 0.25, "기다리다": 0.25,
    "열다": 0.25, "닫다": 0.25, "찾다": 0.25, "타다": 0.25, "걷다": 0.25,
    "뛰다": 0.2, "씻다": 0.2, "입다": 0.25, "벗다": 0.2,
    # Adjectives
    "좋다": 0.4, "나쁘다": 0.3, "크다": 0.35, "작다": 0.35, "많다": 0.3,
    "적다": 0.25, "높다": 0.25, "낮다": 0.25, "길다": 0.25, "짧다": 0.25,
    "덥다": 0.3, "춥다": 0.3, "뜨겁다": 0.25, "차갑다": 0.25, "맛있다": 0.35,
    "예쁘다": 0.3, "귀엽다": 0.25, "재미있다": 0.3, "어렵다": 0.3, "쉽다": 0.3,
    "빠르다": 0.25, "느리다": 0.25, "바쁘다": 0.25, "아프다": 0.3,
    "새롭다": 0.2, "같다": 0.25, "다르다": 0.25,
    # Function words a beginner really does need
    "나": 0.35, "저": 0.3, "너": 0.3, "우리": 0.3, "여기": 0.3, "거기": 0.28,
    "저기": 0.28, "네": 0.35, "아니요": 0.35, "안녕": 0.3, "감사": 0.3,
    "무엇": 0.3, "누구": 0.3, "어디": 0.3, "언제": 0.3, "왜": 0.3, "어떻게": 0.28,
    "정말": 0.25, "아주": 0.25, "조금": 0.25, "많이": 0.25, "다시": 0.25,
    "같이": 0.25, "먼저": 0.2, "천천히": 0.2,
}

#: Never taught, whatever a corpus or dictionary says.
#:
#: Three groups: words a beginner handwriting app has no business teaching,
#: tokens that are grammar rather than vocabulary, and strings the corpus counts
#: as words that are really fragments of longer ones.
BLOCKED_WORDS: set[str] = {
    # Grammatical fragments that a token-frequency list treats as words.
    "것", "수", "거", "게", "걸", "군", "든", "래", "려", "면", "서", "야",
    "요", "죠", "지", "진", "쪽", "채", "체", "터", "텐", "듯", "적", "께",
    "든지", "만큼", "대로", "때문", "동안", "위해", "통해", "대해", "위한",
    "그거", "이거", "저거", "뭔가", "그게", "이게", "저게", "누군가",
    "건", "던", "든가", "든데", "는데", "니까", "라고", "라는", "라도",
    # Interjections and fillers that are noise on a writing card.
    "아", "어", "오", "우", "음", "흠", "헐", "와", "야호", "에이", "글쎄",
    "그래", "그럼", "그냥", "아마", "어휴", "아이고", "어머", "저기요",
    # Body/medical and adult vocabulary out of scope for a beginner app.
    "죽음", "시체", "총", "칼", "피", "죽이다", "때리다", "싸우다", "죽다",
    "미치다", "술", "담배", "마약", "감옥", "경찰서", "전쟁", "폭탄",
    # Rare words that happen to be spelled like a very common inflected form.
    #
    # The corpus counts 누가 because it is "who" plus a subject marker; the
    # dictionary has it because nougat exists. Both are correct and the
    # combination would teach a beginner that 누가 means a chewy sweet. Found by
    # reading the built list, which is the only way these surface.
    "누가", "가도", "개가", "미리", "마다", "그리", "이나", "저나", "우나",
    "가서", "나서", "너머", "더러", "라도", "며느", "보다가", "이라", "지나",
    "고도", "다가", "자니", "하니", "기나", "부터가", "니나", "대다", "되다가",
    # Speech-style and imperative headwords: real dictionary entries, but they
    # are grammar being described rather than words to write on a card.
    "해라", "하라", "해요", "하오", "하게", "하십시오", "합쇼", "이다", "아니다",
    "드릴", "이리", "그리", "고로", "이래", "저래", "그래", "이만", "그만",
    "하지", "보고", "가지고", "죽지", "해서", "거야", "애가", "하기", "애비",
    "가지", "여보", "며칠", "와우", "아가", "직접", "대체", "당시", "하나둘",
    "이사", "신경", "본디", "무려", "저마다", "하도", "차차", "부디",
}

#: Gloss text that means the entry is not a word to teach.
#:
#: Wiktionary uses these forms for cross-references, name entries and character
#: readings. All are legitimate dictionary content and none of them is a
#: vocabulary item.
BLOCKED_GLOSS_PATTERNS = (
    "alternative form", "alternative spelling", "synonym of", "abbreviation of",
    "romanization of", "sino-korean reading", "hanja form", "hanja reading",
    "a surname", "surname", "given name", "used to ", "used in ", "used as ",
    "particle", "suffix", "prefix", "infix", "counter for", "honorific",
    "the name of", "obsolete form", "archaic form", "misspelling",
    "chinese character", "korean reading", "eumhun", "short for",
    # Inflected forms. A corpus is full of them and a dictionary lists them;
    # neither is a word to put on a handwriting card, because the learner would
    # be memorising a conjugation as if it were vocabulary.
    "form of", "inflected", "conjugation", "declension", "contraction of",
    "past tense", "present tense", "imperative", "plural of", "nonce",
    "see ", "compare ", "only used in", "only in", "typo",
)

#: Where the imported gloss reads badly on a beginner's card and we replace it.
#:
#: Every entry here is a *presentation* choice — a shorter or plainer way to say
#: what the source already says — never a different meaning. The source
#: attribution stays on the word, and `meaning_edited` marks the substitution so
#: the provenance sheet can show both.
GLOSS_OVERRIDES: dict[str, str] = {
    "물": "water",
    "밥": "cooked rice; a meal",
    "집": "house, home",
    "차": "car; tea",
    "눈": "eye; snow",
    "배": "stomach; boat; pear",
    "말": "words, speech; horse",
    "다리": "leg; bridge",
    "사과": "apple; an apology",
    "나": "I, me (casual)",
    "저": "I, me (polite)",
    "너": "you (casual)",
    "우리": "we, us; our",
    "네": "yes",
    "아니요": "no",
    "안녕": "hi; bye (casual)",
    "감사": "thanks, gratitude",
    "하다": "to do",
    "있다": "to be, to exist; to have",
    "없다": "to not exist; to not have",
    "되다": "to become; to work out",
    "가다": "to go",
    "오다": "to come",
    "보다": "to see, to watch",
    "먹다": "to eat",
    "마시다": "to drink",
    "자다": "to sleep",
    "쓰다": "to write; to use",
    "읽다": "to read",
    "듣다": "to listen, to hear",
    "말하다": "to speak, to say",
    "좋다": "to be good, to be nice",
    "크다": "to be big",
    "작다": "to be small",
    "많다": "to be many, to be a lot",
    "맛있다": "to be delicious",
    "예쁘다": "to be pretty",
    "재미있다": "to be fun, to be interesting",
    "아프다": "to hurt, to be sick",
    "무엇": "what",
    "누구": "who",
    "어디": "where",
    "언제": "when",
    "왜": "why",
    "어떻게": "how",
    "한국": "Korea",
    "한국어": "the Korean language",
    "한글": "Hangul, the Korean alphabet",
    "하나": "one",
    "둘": "two",
    "셋": "three",
    "넷": "four",
    "다섯": "five",
    "여섯": "six",
    "일곱": "seven",
    "여덟": "eight",
    "아홉": "nine",
    "열": "ten",
    "다시": "again",
    "정말": "really, truly",
    "길": "road, street, way",
    "우리": "we, us; our",
    "지금": "now",
    "날": "day",
    "해": "sun; year",
    "달": "moon; month",
    "별": "star",
    "산": "mountain",
    "바다": "sea, ocean",
    "하늘": "sky",
    "이제": "now, from now on",
    "조금": "a little, a bit",
    "많이": "a lot, much",
    "아주": "very",
    "여기": "here",
    "거기": "there",
    "저기": "over there",
    "언제": "when",
    "얼마": "how much",
    "머리": "head; hair",
    "눈": "eye; snow",
    "귀": "ear",
    "입": "mouth",
    "손": "hand",
    "발": "foot",
    "개": "dog",
    "새": "bird",
    "꽃": "flower",
    "나무": "tree; wood",
    "옷": "clothes",
    "밤": "night; chestnut",
    "낮": "daytime",
    "년": "year",
    "월": "month",
    "일": "day; work",
    "주": "week",
    "천": "one thousand",
    "백": "one hundred",
    "자주": "often, frequently",
    "그녀": "she, her",
    "수도": "capital city; running water",
    "전기": "electricity",
    "신부": "bride; a priest",
    "얼굴": "face",
    "소리": "sound; a voice",
    "생각": "thought, idea",
    "마음": "mind, heart",
    "기분": "mood, feeling",
    "이야기": "story, talk",
    "처음": "the first time, the beginning",
    "이번": "this time",
    "오전": "morning, a.m.",
    "오후": "afternoon, p.m.",
    "하루": "one day",
    "이틀": "two days",
    "매일": "every day",
    "매주": "every week",
    "일주일": "one week",
    "나머지": "the rest, the remainder",
    "아래": "below, under",
    "위": "above, top; stomach",
    "안": "inside",
    "밖": "outside",
    "앞": "front",
    "뒤": "back, behind",
    "옆": "beside, next to",
    "사이": "between; a gap",
    "인간": "a human being",
    "부부": "a married couple",
    "모두": "all, everyone",
    "거의": "almost, nearly",
}

#: Words to teach as one entry even though the dictionary files two homographs.
#:
#: 사과 is both the fruit and an apology; 눈 is both an eye and snow. A beginner
#: writes one word either way, and splitting the card into two teaches them that
#: Korean has two 사과s, which it does not — it has one spelling with two
#: histories, and that is a footnote, not a lesson.
MERGE_HOMOGRAPHS = True

#: Part-of-speech weighting for beginner usefulness, 0 = ideal first lesson.
#:
#: A concrete noun can be taught with a picture and checked in one glance. A
#: determiner cannot be drawn, cannot be checked, and means nothing outside a
#: sentence — it is a fine word and a poor handwriting card.
POS_USEFULNESS_PENALTY = {
    "noun": 0.0,
    "numeral": 0.05,
    "verb": 0.08,
    "adjective": 0.1,
    "interjection": 0.1,
    "pronoun": 0.12,
    "adverb": 0.2,
    "determiner": 0.45,
    "particle": 0.9,
}

#: Wiktionary topic categories whose members are concrete enough to illustrate.
#:
#: Used to decide *whether to look for a picture*, not which picture — the match
#: itself is made against the English gloss in `build_images.py`.
CONCRETE_CATEGORIES = {
    "Animals", "Birds", "Cats", "Dogs", "Fish", "Insects", "Mammals",
    "Foods", "Fruits", "Vegetables", "Beverages", "Drinks", "Cooking",
    "Body parts", "Anatomy", "Clothing", "Furniture", "Tools", "Vehicles",
    "Buildings", "Rooms", "Plants", "Trees", "Flowers", "Weather", "Nature",
    "Landforms", "Celestial bodies", "Colors", "Family", "Kinship",
    "Household", "Kitchenware", "Musical instruments", "Sports", "Toys",
    "Automobiles", "Chairs", "Schools", "Water", "Time", "Days of the week",
    "Months", "Numbers", "Occupations", "Fabrics", "Metals", "Money",
}

#: Plain-Korean definitions for the core vocabulary.
#:
#: The dictionary source is Korean→English, so a Korean-reading learner would
#: otherwise see an English gloss on every card. These are written here rather
#: than translated from the English, because a Korean definition of a Korean
#: word is not a translation — 물 is "마시는 맑은 액체", not "water" rendered into
#: Korean. Words outside this list fall back to English, which is reported by
#: `npm run i18n:report` rather than hidden.
KO_GLOSSES: dict[str, str] = {
    # People
    "사람": "생각하고 말하는 존재", "친구": "가깝게 지내는 사이", "가족": "함께 사는 식구",
    "어머니": "나를 낳아 주신 여자", "아버지": "나를 낳아 주신 남자",
    "엄마": "어머니를 정답게 부르는 말", "아빠": "아버지를 정답게 부르는 말",
    "형": "남자가 손위 남자를 부르는 말", "누나": "남자가 손위 여자를 부르는 말",
    "언니": "여자가 손위 여자를 부르는 말", "오빠": "여자가 손위 남자를 부르는 말",
    "동생": "나보다 나이가 적은 형제", "아이": "나이가 어린 사람",
    "남자": "남성인 사람", "여자": "여성인 사람",
    "선생님": "가르치는 사람", "학생": "배우는 사람", "의사": "병을 고치는 사람",
    "이름": "사람이나 사물을 부르는 말", "나이": "살아온 햇수",
    "아들": "남자인 자식", "딸": "여자인 자식", "아기": "갓난아이",
    "할머니": "아버지나 어머니의 어머니", "할아버지": "아버지나 어머니의 아버지",
    "부부": "결혼한 남녀", "인간": "사람",
    # Food and drink
    "물": "마시는 맑은 액체", "밥": "지은 쌀, 또는 끼니", "빵": "밀가루로 구운 음식",
    "고기": "먹을 수 있는 짐승이나 물고기의 살", "김치": "배추 등을 절여 담근 반찬",
    "우유": "소에서 나는 흰 음료", "커피": "원두로 내린 음료", "차": "잎을 우려 마시는 음료",
    "사과": "사과나무의 열매", "과일": "나무에서 나는 먹는 열매", "채소": "밭에서 기르는 먹는 풀",
    "라면": "국물에 끓여 먹는 국수", "국": "건더기를 넣고 끓인 물기 많은 음식",
    "음식": "사람이 먹는 것", "식당": "음식을 파는 곳",
    "소금": "짠맛을 내는 흰 알갱이", "설탕": "단맛을 내는 흰 가루",
    # Home and objects
    "집": "사람이 사는 건물", "방": "집 안의 한 칸", "문": "드나드는 곳",
    "창문": "빛과 바람이 드나드는 벽의 구멍", "책": "글을 묶어 놓은 것",
    "책상": "앉아서 쓰거나 읽는 상", "의자": "앉는 가구", "가방": "물건을 넣어 드는 것",
    "옷": "몸에 입는 것", "신발": "발에 신는 것", "모자": "머리에 쓰는 것",
    "시계": "시간을 알려 주는 물건", "전화": "멀리 있는 사람과 말하는 기계",
    "컴퓨터": "계산하고 정보를 다루는 기계", "우산": "비를 막는 물건",
    "지갑": "돈을 넣는 작은 물건", "연필": "글씨를 쓰는 도구", "종이": "글을 쓰는 얇은 것",
    "거울": "모습을 비추어 보는 물건", "침대": "누워 자는 가구", "돈": "물건을 사는 데 쓰는 것",
    # Places
    "학교": "배우러 다니는 곳", "회사": "일하러 다니는 곳", "병원": "아플 때 가는 곳",
    "가게": "물건을 파는 작은 곳", "시장": "물건을 사고파는 곳", "공원": "쉬고 노는 넓은 곳",
    "역": "기차나 지하철을 타는 곳", "길": "사람이 다니는 곳",
    "나라": "국가", "한국": "우리나라", "도시": "사람이 많이 모여 사는 곳",
    "산": "높이 솟은 땅", "바다": "넓고 짠 물", "하늘": "머리 위의 넓은 공간",
    "사무실": "사무를 보는 방", "호수": "땅에 고인 넓은 물",
    # Animals and nature
    "개": "집에서 기르는 짐승", "고양이": "집에서 기르는 작은 짐승", "새": "날개로 나는 짐승",
    "나무": "줄기가 굵고 오래 사는 식물", "꽃": "식물이 피우는 아름다운 부분",
    "물고기": "물에서 사는 동물", "비": "하늘에서 내리는 물",
    "눈": "보는 기관, 또는 하늘에서 내리는 눈", "바람": "움직이는 공기",
    "해": "낮에 하늘에서 빛나는 것", "달": "밤에 하늘에서 빛나는 것", "별": "밤하늘에 반짝이는 것",
    # Time
    "오늘": "지금 지나가고 있는 날", "내일": "오늘의 다음 날", "어제": "오늘의 바로 앞날",
    "아침": "해가 뜨는 때", "점심": "한낮, 또는 그때 먹는 밥", "저녁": "해가 지는 때",
    "밤": "해가 진 뒤의 어두운 때", "낮": "해가 떠 있는 때",
    "시간": "흐르는 때, 또는 한 시간", "주말": "토요일과 일요일", "지금": "말하고 있는 바로 이때",
    "하루": "스물네 시간", "매일": "날마다", "일주일": "이레 동안",
    # Numbers
    "하나": "수 1", "둘": "수 2", "셋": "수 3", "넷": "수 4", "다섯": "수 5",
    "여섯": "수 6", "일곱": "수 7", "여덟": "수 8", "아홉": "수 9", "열": "수 10",
    "백": "수 100", "천": "수 1000",
    # Verbs
    "가다": "어떤 곳으로 옮겨 가다", "오다": "이쪽으로 움직여 다다르다",
    "먹다": "음식을 입에 넣어 삼키다", "마시다": "물이나 음료를 목으로 넘기다",
    "보다": "눈으로 대상을 알아보다", "듣다": "귀로 소리를 알아차리다",
    "말하다": "생각을 소리로 나타내다", "읽다": "글을 보고 뜻을 알다",
    "쓰다": "글자를 적다", "하다": "어떤 일을 행하다", "자다": "잠을 이루다",
    "앉다": "엉덩이를 대고 몸을 내려놓다", "서다": "발로 몸을 곧게 버티다",
    "웃다": "기뻐서 소리를 내거나 얼굴을 펴다", "울다": "슬퍼서 눈물을 흘리다",
    "사다": "돈을 주고 물건을 얻다", "팔다": "물건을 주고 돈을 받다",
    "주다": "가진 것을 남에게 옮기다", "받다": "남이 주는 것을 가지다",
    "배우다": "새로운 것을 익히다", "가르치다": "알도록 이끌다",
    "만나다": "서로 마주 대하다", "살다": "목숨을 이어 가다", "일하다": "일을 하다",
    "좋아하다": "마음에 들어 하다", "알다": "무엇인지 깨닫다", "모르다": "알지 못하다",
    "있다": "어떤 곳에 자리하다", "없다": "있지 아니하다", "되다": "다른 것으로 바뀌다",
    "놀다": "즐겁게 시간을 보내다", "기다리다": "올 때까지 시간을 보내다",
    "열다": "닫힌 것을 트다", "닫다": "열린 것을 막다", "찾다": "보이지 않는 것을 알아내다",
    "타다": "탈것에 몸을 싣다", "걷다": "발로 옮겨 나아가다", "입다": "옷을 몸에 걸치다",
    # Adjectives
    "좋다": "마음에 들거나 훌륭하다", "나쁘다": "좋지 아니하다",
    "크다": "부피나 크기가 보통을 넘다", "작다": "크기가 보통에 미치지 못하다",
    "많다": "수나 양이 넉넉하다", "적다": "수나 양이 모자라다",
    "높다": "아래에서 위까지 길다", "낮다": "높이가 작다",
    "길다": "끝과 끝 사이가 멀다", "짧다": "끝과 끝 사이가 가깝다",
    "덥다": "기온이 높아 몸이 뜨겁다", "춥다": "기온이 낮아 몸이 차다",
    "맛있다": "맛이 좋다", "예쁘다": "보기에 아름답다", "귀엽다": "사랑스럽다",
    "재미있다": "즐겁고 흥미롭다", "어렵다": "하기가 힘들다", "쉽다": "하기가 어렵지 않다",
    "빠르다": "움직임이 날래다", "느리다": "움직임이 더디다", "바쁘다": "할 일이 많다",
    "아프다": "몸이나 마음이 괴롭다", "같다": "서로 다르지 않다", "다르다": "서로 같지 않다",
    # Function words
    "나": "말하는 사람 자신 (반말)", "저": "말하는 사람 자신 (높임말)",
    "너": "듣는 사람을 가리키는 말 (반말)", "우리": "말하는 사람과 그 무리",
    "여기": "말하는 사람에게 가까운 곳", "거기": "듣는 사람에게 가까운 곳",
    "저기": "둘 다에게서 먼 곳", "네": "긍정의 대답", "아니요": "부정의 대답",
    "안녕": "반말로 하는 인사", "감사": "고마움을 나타내는 말",
    "무엇": "모르는 것을 가리키는 말", "누구": "모르는 사람을 가리키는 말",
    "어디": "모르는 곳을 가리키는 말", "언제": "모르는 때를 가리키는 말",
    "왜": "까닭을 묻는 말", "어떻게": "방법을 묻는 말",
    "정말": "거짓이 아니게", "아주": "보통보다 훨씬", "조금": "많지 않게",
    "많이": "수나 양이 넉넉하게", "다시": "한 번 더", "같이": "함께",
    "먼저": "남보다 앞서", "천천히": "서두르지 않고",
}


#: Words whose picture is chosen by hand, by emoji.
#:
#: Either the automatic match found nothing (the OpenMoji name differs from the
#: dictionary's wording) or it found something misleading. These are the words
#: worth the minute it takes to check one.
MANUAL_IMAGES: dict[str, str] = {
    "물": "💧", "밥": "🍚", "집": "🏠", "책": "📕", "의자": "🪑", "가방": "🎒",
    "사과": "🍎", "우유": "🥛", "커피": "☕", "빵": "🍞", "고기": "🍖",
    "김치": "🥬", "라면": "🍜", "달걀": "🥚", "과일": "🍇", "채소": "🥕",
    "음식": "🍽", "식당": "🍴", "물고기": "🐟", "개": "🐕", "고양이": "🐈",
    "새": "🐦", "나무": "🌳", "꽃": "🌸", "비": "🌧", "눈": "👁", "바람": "🌬",
    "해": "☀", "달": "🌙", "별": "⭐", "산": "⛰", "바다": "🌊", "하늘": "🌤",
    "학교": "🏫", "병원": "🏥", "회사": "🏢", "공원": "🏞", "가게": "🏪",
    "시장": "🏬", "길": "🛣", "역": "🚉", "문": "🚪", "창문": "🪟",
    "시계": "🕰", "전화": "📞", "컴퓨터": "💻", "우산": "☂", "지갑": "👛",
    "연필": "✏", "종이": "📄", "거울": "🪞", "침대": "🛏", "옷": "👕",
    "신발": "👟", "모자": "🧢", "방": "🛋", "책상": "🪑", "머리": "🧑",
    "손": "✋", "발": "🦶", "귀": "👂", "입": "👄", "코": "👃",
    "자동차": "🚗", "버스": "🚌", "기차": "🚆", "비행기": "✈", "자전거": "🚲",
    "배": "🚢", "돈": "💰", "선물": "🎁", "음악": "🎵", "사진": "📷",
    "편지": "✉", "열쇠": "🔑", "안경": "👓", "시간": "⏰", "달력": "📅",
    "아침": "🌅", "저녁": "🌆", "밤": "🌃", "가족": "👨‍👩‍👧", "친구": "👫",
    "아이": "🧒", "남자": "👨", "여자": "👩", "어머니": "👩", "아버지": "👨",
    "선생님": "🧑‍🏫", "학생": "🧑‍🎓", "의사": "🧑‍⚕", "경찰": "👮",
    "운동": "🏃", "축구": "⚽", "야구": "⚾", "노래": "🎤", "영화": "🎬",
    "전기": "⚡", "불": "🔥", "얼음": "🧊", "소금": "🧂", "설탕": "🍬",
    # People and body
    "사람": "🧍", "엄마": "👩", "아빠": "👨", "아들": "👦", "딸": "👧",
    "아기": "👶", "할머니": "👵", "할아버지": "👴", "형": "👦", "누나": "👧",
    "언니": "👧", "오빠": "👦", "동생": "🧒", "부부": "💑", "얼굴": "😐",
    "가슴": "🫀", "심장": "🫀", "무릎": "🦵", "피부": "🖐", "이": "🦷",
    "목": "🧣", "어깨": "💪", "배": None, "몸": "🧍",
    # Clothes and things
    "바지": "👖", "셔츠": "👕", "치마": "👗", "양말": "🧦", "장갑": "🧤",
    "인형": "🧸", "장난감": "🧸", "공": "⚽", "가위": "✂", "칫솔": "🪥",
    "비누": "🧼", "수건": "🧻", "냄비": "🍲", "접시": "🍽", "컵": "🥤",
    "숟가락": "🥄", "젓가락": "🥢", "포크": "🍴", "칼": None, "병": "🍾",
    # Places and travel
    "호수": "🏞", "강": "🏞", "섬": "🏝", "숲": "🌲", "밭": "🌾",
    "사무실": "🏢", "고등학교": "🏫", "대학교": "🎓", "교회": "⛪",
    "도서관": "📚", "은행": "🏦", "우체국": "📮", "공항": "🛫", "호텔": "🏨",
    "트럭": "🚚", "택시": "🚕", "지하철": "🚇", "오토바이": "🏍",
    # Food
    "스튜": "🍲", "국수": "🍜", "치킨": "🍗", "피자": "🍕", "케이크": "🍰",
    "아이스크림": "🍦", "초콜릿": "🍫", "주스": "🧃", "감자": "🥔",
    "당근": "🥕", "양파": "🧅", "토마토": "🍅", "바나나": "🍌", "포도": "🍇",
    "딸기": "🍓", "수박": "🍉", "복숭아": "🍑", "오렌지": "🍊", "쌀": "🌾",
    # Animals
    "말": None, "소": "🐄", "돼지": "🐖", "닭": "🐔", "토끼": "🐇",
    "곰": "🐻", "호랑이": "🐅", "사자": "🦁", "코끼리": "🐘", "원숭이": "🐒",
    "쥐": "🐁", "뱀": "🐍", "거북": "🐢", "벌레": "🐛", "나비": "🦋",
    "벌": "🐝", "개미": "🐜", "오리": "🦆",
    # Nature and weather
    "구름": "☁", "번개": "⚡", "무지개": "🌈", "잎": "🍃", "풀": "🌿",
    "돌": "🪨", "모래": "🏖", "흙": "🟫",
    # Study and objects
    "공책": "📓", "지도": "🗺", "신문": "📰", "잡지": "📖", "카메라": "📷",
    "텔레비전": "📺", "라디오": "📻", "냉장고": "🧊", "의약품": "💊",
    "약": "💊", "돈": "💵", "카드": "💳", "표": "🎫", "선물": "🎁",
}
#: `None` marks a word that was considered and deliberately left without a
#: picture — usually a homograph where any single image teaches the wrong sense.
MANUAL_IMAGES = {k: v for k, v in MANUAL_IMAGES.items() if v is not None}

#: Words that must never get a picture, whatever matches.
#:
#: Abstract nouns whose near-match would mislead, and homographs where any
#: single image teaches the wrong sense: 말 is both "speech" and "horse", and a
#: horse on the card teaches the wrong one.
IMAGE_BLOCKLIST = {"말", "차", "배", "눈", "다리", "일", "주", "년", "정", "수", "장", "점"}
