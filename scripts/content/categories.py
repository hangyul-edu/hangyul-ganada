"""The vocabulary taxonomy, and how every word gets into exactly one of it.

## Why categories replaced levels

The product used to sort its vocabulary into Level 1 through Level 8. The
numbers were real — they came out of a measured difficulty model — and they were
still the wrong thing to show a learner. "Level 5" answers a question nobody
asked ("how hard is this word, relative to 2,503 others?") and fails to answer
the one everybody asks ("where are the animal words?"). It also invites a
question the product cannot answer honestly: level 5 *of what*, graded by whom.

So the levels went back inside. They still order the corpus, still drive
recommendations, still decide which words are comfortable given the letters a
learner knows. What a learner sees is what a learner can act on: Animals, Food &
Drink, People & Family.

## What makes a good category here

Three constraints, in tension:

* **Intuitive.** A learner looking for 고양이 should guess "Animals" first time.
* **Balanced.** A category of eleven words is a rounding error and one of six
  hundred is a scroll. The audit below reports the spread and the build refuses
  a corpus with an unassigned word.
* **Decidable.** 먹다 is arguably Food and arguably Actions. Guessing per word
  gives a taxonomy where similar words land in unrelated places, so the rules
  are written down and applied to everything: a *verb about eating* is Food &
  Drink, because a learner browsing Food expects to find how to say "eat".

Every word also carries `tags` — the other categories it plausibly belongs to —
so search and recommendations can use the overlap without the browsing structure
becoming ambiguous.

## How a word is classified

In order, first match wins:

```
1. an explicit decision in OVERRIDES        the audit's output, made permanent
2. a meaning-text rule                      "to eat", "rice", "hungry" → food
3. a Wiktionary topic category we map       "Family members" → people
4. the part of speech                       verb → actions, adjective → describing
```

The meaning rules outrank the Wiktionary topics, and it took a bug to learn
why: Wiktionary files 병원 under "Buildings", which is true and useless — a
learner looking for "hospital" is thinking about being ill, not about masonry.
The topics are broad labels written for a dictionary; the rules were written
for this corpus. So the rules go first and the topics fill in behind them.

Rule 4 is a floor, not a guess: a verb with no thematic signal really is a
general action, and an adjective with none really is a description. What it is
*not* allowed to be is an "Other" bucket, which is why there isn't one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# --- The taxonomy ------------------------------------------------------------


@dataclass(frozen=True)
class Category:
    id: str
    #: Where it sits in the picker. Roughly "what a beginner wants first".
    order: int


CATEGORIES: tuple[Category, ...] = (
    Category("essentials", 1),
    Category("people", 2),
    Category("food", 3),
    Category("animals-nature", 4),
    Category("home", 5),
    Category("body-health", 6),
    Category("places-travel", 7),
    Category("time-numbers", 8),
    Category("school-work", 9),
    Category("money-shopping", 10),
    Category("communication", 11),
    Category("feelings", 12),
    Category("thinking", 13),
    Category("movement", 14),
    Category("actions", 15),
    Category("describing", 16),
    #: Manner, degree, and the words that join one clause to the next.
    #:
    #: Split out of `describing` after an audit of this cycle. That category had
    #: grown to 381 words — four times the median and the largest by a wide
    #: margin — and reading it showed the problem was not size but *kind*: it
    #: held 예쁘다 and 크다, which describe a thing, alongside 그러나, 어쨌든,
    #: 만약 and 오히려, which describe nothing at all. A learner looking for
    #: "however" would never guess a category called Describing Things, and a
    #: learner browsing Describing Things does not want a conjunction.
    #:
    #: Split because the semantics justify it, not to even out the counts. The
    #: money category has 42 words and stays as it is: it is small and it is
    #: exactly what its name says.
    Category("how-when", 17),
    Category("society", 18),
)

CATEGORY_IDS = tuple(c.id for c in CATEGORIES)

# --- Wiktionary topic categories --------------------------------------------

#: Wiktionary's own topic labels, where they map cleanly onto ours.
#:
#: Only about a sixth of the corpus carries one, and some are far too fine to be
#: a category of their own ("Swimming", "Telephony"), so they are folded in
#: here. A label we have not mapped is ignored rather than guessed at.
WIKTIONARY_TOPICS: dict[str, str] = {
    # people
    "People": "people", "Family": "people", "Family members": "people",
    "Male people": "people", "Female people": "people", "Children": "people",
    "Parents": "people", "Occupations": "people", "Age": "people",
    "Nationalities": "people", "Ethnicity": "people", "Kinship": "people",
    "Male family members": "people", "Female family members": "people",
    "Friendship": "people", "Love": "feelings", "Marriage": "people",
    # body & health
    "Anatomy": "body-health", "Body": "body-health", "Body parts": "body-health",
    "Medicine": "body-health", "Health": "body-health", "Diseases": "body-health",
    "Bodily fluids": "body-health", "Hair": "body-health", "Death": "body-health",
    "Pregnancy": "body-health", "Sleep": "body-health", "Disability": "body-health",
    "Senses": "body-health", "Pain": "body-health", "Organs": "body-health",
    # food
    "Foods": "food", "Food": "food", "Meals": "food", "Drinks": "food",
    "Fruits": "food", "Vegetables": "food", "Cooking": "food", "Taste": "food",
    "Alcoholic beverages": "food", "Beverages": "food", "Grains": "food",
    "Seafood": "food", "Meats": "food", "Spices": "food", "Desserts": "food",
    # animals & nature
    "Animals": "animals-nature", "Birds": "animals-nature", "Fish": "animals-nature",
    "Insects": "animals-nature", "Dogs": "animals-nature", "Cats": "animals-nature",
    "Mammals": "animals-nature", "Plants": "animals-nature", "Trees": "animals-nature",
    "Flowers": "animals-nature", "Nature": "animals-nature", "Weather": "animals-nature",
    "Atmospheric phenomena": "animals-nature", "Landforms": "animals-nature",
    "Ocean": "animals-nature", "Water": "animals-nature", "Sky": "animals-nature",
    "Seasons": "animals-nature", "Geography": "animals-nature",
    "Mythological creatures": "society", "Astronomy": "animals-nature",
    "Fruit": "food",
    # home
    "Furniture": "home", "Buildings": "home", "Rooms": "home",
    "Clothing": "home", "Tools": "home", "Containers": "home",
    "Housing": "home", "Kitchen": "home", "Textiles": "home",
    "Materials": "home", "Cleaning": "home",
    # places & travel
    "Transport": "places-travel", "Vehicles": "places-travel",
    "Roads": "places-travel", "Travel": "places-travel", "Places": "places-travel",
    "Directions": "places-travel", "Cities": "places-travel",
    "Countries": "places-travel", "Aviation": "places-travel",
    "Rail transportation": "places-travel", "Nautical": "places-travel",
    # time & numbers
    "Time": "time-numbers", "Day": "time-numbers", "Night": "time-numbers",
    "Past": "time-numbers", "Present": "time-numbers", "Future": "time-numbers",
    "Calendar": "time-numbers", "Months": "time-numbers",
    "Days of the week": "time-numbers", "One": "time-numbers",
    "Two": "time-numbers", "Three": "time-numbers", "Four": "time-numbers",
    "Five": "time-numbers", "Six": "time-numbers", "Seven": "time-numbers",
    "Eight": "time-numbers", "Nine": "time-numbers", "Ten": "time-numbers",
    "Numbers": "time-numbers", "Units of measure": "time-numbers",
    # school & work
    "Education": "school-work", "Schools": "school-work", "Sciences": "school-work",
    "Physics": "school-work", "Mathematics": "school-work", "Chemistry": "school-work",
    "Biology": "school-work", "Business": "school-work", "Work": "school-work",
    "Agriculture": "school-work", "Engineering": "school-work",
    # money & shopping
    "Currencies": "money-shopping", "Money": "money-shopping",
    "Trade": "money-shopping", "Retail": "money-shopping",
    # communication & media
    "Languages": "communication", "Books": "communication", "Art": "communication",
    "Music": "communication", "Photography": "communication", "Film": "communication",
    "Telephony": "communication", "Internet": "communication",
    "Computing": "communication", "Media": "communication", "Sound": "communication",
    "Writing": "communication", "Journalism": "communication",
    "Broadcasting": "communication", "Literature": "communication",
    "Theater": "communication", "Grammar": "communication",
    # feelings
    "Emotions": "feelings", "Laughter": "feelings", "Personality": "feelings",
    "Fear": "feelings", "Happiness": "feelings", "Sadness": "feelings",
    # thinking
    "Thinking": "thinking", "Mind": "thinking", "Memory": "thinking",
    "Knowledge": "thinking",
    # society & culture
    "Law": "society", "Government": "society", "Politics": "society",
    "Military": "society", "Religion": "society", "Sports": "society",
    "Swimming": "society", "Crime": "society", "Society": "society",
    "Culture": "society", "History": "society", "Holidays": "society",
    "Games": "society", "Ball games": "society", "Martial arts": "society",
    "Violence": "society", "Weapons": "society", "Christianity": "society",
    "Buddhism": "society", "Mythology": "society",
    # describing
    "Size": "describing", "Colors": "describing", "Shapes": "describing",
    "Temperature": "describing",
}

# --- Meaning rules -----------------------------------------------------------

#: Ordered rules over the English meaning. First match wins.
#:
#: Ordered rather than scored, because a scored classifier over 2,504 short
#: glosses is a machine that is confidently wrong in ways nobody can see. An
#: ordered list can be read, argued with, and corrected — which is what the
#: audit in `report_categories.py` is for.
#:
#: The order encodes the decidability rule from the module docstring: a *verb
#: about eating* is filed under Food, not Actions, so `food` is tried long
#: before the generic buckets at the bottom.
MEANING_RULES: tuple[tuple[str, str], ...] = (
    # -- Manner and degree ---------------------------------------------------
    #
    # Ahead of the describing rules, because "quickly" matches both and the
    # adverb reading is the right one: 빨리 is how something is done, and a
    # learner browsing Describing Things is looking for words to describe a
    # noun. Anchored at the start of the gloss so "a quick decision" is still a
    # description.
    ("how-when", r"^(quickly|slowly|quietly|loudly|carefully|suddenly|gradually|"
                 r"straight away|right away|at once|hugely|greatly|mainly|mostly|"
                 r"especially|specially|anew|freshly|straight ahead|"
                 r"straight, properly|in exactly the same way|full, brimming)\b"),

    # -- Colour, position and season ----------------------------------------
    #
    # Added by this cycle's audit. Every one of these was falling through to a
    # part-of-speech fallback and landing in Describing Things, which is where
    # 녹색, 위, 옆 and 봄 are least likely to be looked for.
    ("describing", r"^(a colour|colour|color|red\b|blue\b|green\b|yellow|black\b|"
                   r"white\b|brown\b|pink\b|purple|orange \(colour\)|grey|gray)\b"),
    ("essentials", r"^the (outside|top|side|bottom|front|back|middle|opposite)\b"),
    ("time-numbers", r"^(spring|summer|autumn|fall \(season\)|winter|"
                     r"the daytime|the small hours|a week|a month|a year of age|a time)\b"),
    ("places-travel", r"^(korea|seoul|the underground|a museum|the ground)\b"),
    ("school-work", r"^(handwriting|a blackboard|a dictionary|homework|a notebook|"
                    r"a classroom|a pencil)\b"),
    # -- Essentials: greetings, courtesy, pointing, asking -------------------
    ("essentials", r"\b(hello|goodbye|hi\b|bye\b|thank|thanks|sorry|excuse me|please|"
                   r"welcome|yes\b|no\b|okay|all right|of course|really\?|"
                   r"greeting|farewell|congratulat)"),
    ("essentials", r"^(i|me|you|he|she|it|we|they|this|that|these|those|who|what|"
                   r"where|when|why|how|which|someone|something|anyone|anything|"
                   r"everyone|everything|nobody|nothing|oneself|each other)\b"),
    ("essentials", r"\b(pronoun|this one|that one|over there|here\b|there\b)"),
    # -- People & family (before body, so "baby" is a person not an organ) ---
    ("people", r"\b(father|dad\b|papa|mother|mum\b|mom\b|mummy|parent|"
               r"son\b|daughter|child|children|kid\b|baby|infant|"
               r"brother|sister|sibling|grandfather|grandmother|grandparent|"
               r"uncle|aunt|cousin|nephew|niece|relative|"
               r"husband|wife|spouse|couple|marry|marriage|wedding \(as a couple\)|"
               r"family|household \(as people\)|"
               r"man\b|men\b|woman|women|boy|girl|adult|elder|senior \(person\)|"
               r"person|people|friend|neighbou?r|guest|host\b|stranger|"
               r"name\b|surname|nickname|"
               r"myself|yourself|himself|herself|themselves|"
               r"lover|girlfriend|boyfriend|acquaintance|companion|partner)"),
    # -- Body & health -------------------------------------------------------
    ("body-health", r"\b(head|face|eye|ear|nose|mouth|tooth|teeth|tongue|lip|neck|"
                    r"shoulder|arm|elbow|hand|finger|nail|chest|breast|back\b|waist|"
                    r"belly|stomach|leg|knee|foot|feet|toe|skin|bone|blood|heart|lung|"
                    r"liver|kidney|brain|muscle|nerve|hair\b|beard|throat|spine|organ)\b"),
    ("body-health", r"\b(ill|sick|illness|disease|fever|cough|cold \(illness\)|pain|hurt|"
                    r"ache|wound|injur|surgery|surgical|operate|medicine|medical|"
                    r"drug|pill|hospital|clinic|doctor|nurse|patient|treatment|treat|"
                    r"cure|heal|health|breathe|breath|pulse|pregnan|birth|die\b|death|"
                    r"dead|alive|life\b|live\b|sleep|wake|tired|rest\b|bathe|wash|"
                    r"shower|brush one|toilet|urine|sweat|tear|dizzy|swell|itch|"
                    r"bandage|vaccin|infect|virus|blind|deaf|disabled|psychiat|"
                    r"paediatric|pediatric|dental|dentist|"
                    r"recover|get better|burned|scald|burn oneself|"
                    r"snore|yawn|sneeze|tremble|shiver|faint|"
                    r"relieve oneself|toilet|hungry \(body\)|"
                    r"smell \(to sense\)|taste \(to sense\)|touch \(to sense\)|"
                    r"stretch \(the body\)|exercise \(the body\)|diet|"
                    r"scratch \(an itch\)|bruise|scar|swollen|"
                    r"lie down|get up|wake up|fall asleep)"),
    # -- Food & drink --------------------------------------------------------
    ("food", r"\b(eat|drink|food|meal|breakfast|lunch|dinner|supper|snack|cook|"
             r"bake|boil|fry|steam|grill|roast|recipe|kitchen|restaurant|cafe|"
             r"café|menu|dish\b|rice|bread|noodle|soup|stew|meat|beef|pork|chicken|"
             r"fish\b|egg|milk|cheese|butter|sugar|salt|pepper|spice|sauce|oil\b|"
             r"vegetable|fruit|apple|pear|grape|melon|peach|banana|orange\b|"
             r"strawberr|tomato|potato|onion|garlic|carrot|cabbage|radish|bean|"
             r"tea\b|coffee|water\b|juice|beer|wine|alcohol|liquor|soju|taste|"
             r"tasty|delicious|sweet|sour|bitter|salty|spicy|hungry|thirst|full "
             r"\(after eating\)|chew|swallow|bite|sip|pour|serve \(food\)|"
             r"candy|cake|cookie|chocolate|ice cream|porridge|kimchi|seasoning|"
             r"appetite|dessert|flour|grain|nut\b|seaweed|shrimp|crab|"
             r"peel|shell \(to remove\)|simmer|decoct|stir|mix \(food\)|"
             r"knead|slice|chop \(food\)|season \(to flavour\)|ripe|rotten|"
             r"feed\b|swallow|starve|nutrition|calorie|vitamin)"),
    # -- Animals & nature ----------------------------------------------------
    ("animals-nature", r"\b(animal|dog|puppy|cat|kitten|cow|pig|horse|sheep|goat|"
                       r"rabbit|mouse|rat\b|tiger|lion|bear\b|deer|monkey|elephant|"
                       r"snake|frog|turtle|bird|chicken\b|duck|goose|sparrow|eagle|"
                       r"insect|bug\b|bee\b|butterfly|ant\b|spider|mosquito|fly \(insect\)|"
                       r"whale|dolphin|shark|worm|dragon|beast|pet\b|tail|wing|feather|"
                       r"paw|horn\b|fur\b|nest|herd|livestock|breed)"),
    ("animals-nature", r"\b(tree|flower|plant|grass|leaf|leaves|root|branch|seed|"
                       r"forest|wood\b|bamboo|pine\b|petal|bloom|blossom|sprout|"
                       r"mountain|hill|valley|river|stream|lake|sea\b|ocean|beach|"
                       r"island|field\b|desert|cave|rock\b|stone|sand|soil|earth\b|"
                       r"sky|cloud|rain|snow|wind|storm|thunder|lightning|fog|"
                       r"weather|sun\b|moon|star|sunlight|sunshine|shade|"
                       r"season|spring \(season\)|summer|autumn|fall \(season\)|winter|"
                       r"nature|environment|air\b|fire\b|flame|smoke|ice\b|frost|dew)"),
    # -- Home & daily life ---------------------------------------------------
    ("home", r"\b(house|home\b|room|kitchen|bathroom|bedroom|living room|door|window|"
             r"wall|floor|ceiling|roof|stair|yard|garden|gate|fence|"
             r"furniture|bed\b|chair|table|desk|sofa|shelf|drawer|closet|wardrobe|"
             r"mirror|lamp|light bulb|curtain|carpet|cushion|pillow|blanket|"
             r"cup\b|glass \(vessel\)|bowl|plate|spoon|chopstick|fork\b|knife|pot\b|pan\b|"
             r"kettle|bottle|box\b|bag\b|basket|bucket|broom|towel|soap|"
             r"clothes|clothing|shirt|trousers|pants|skirt|dress|coat|jacket|"
             r"sock|shoe|hat\b|cap\b|glove|scarf|belt|button|pocket|sleeve|"
             r"wear\b|put on|take off|dress \(oneself\)|laundry|iron \(clothes\)|"
             r"clean|tidy|sweep|wipe|dust\b|rubbish|trash|garbage|key\b|lock\b|"
             r"umbrella|clock|watch \(timepiece\)|ring \(jewellery\)|jewel|"
             r"refrigerator|fridge|washing machine|air conditioner|fan \(device\)|"
             r"paper|doll|toy|glasses|spectacles|card\b|gift|present \(a gift\)|"
             r"thing|object|stuff|tool|machine|device|material|cloth\b|thread|"
             r"needle|string|rope|wire|nail \(metal\)|hammer|scissors|brush|"
             r"comb|razor|candle|match \(for fire\)|battery|switch|button \(to press\)|"
             r"toothbrush|toothpaste|shampoo|tissue|napkin|tray|jar|lid\b|"
             r"handle|corner \(of a room\)|shelf|hanger|hook\b|"
             r"pocket|purse|handbag|backpack|suitcase|"
             r"apartment|flat \(home\)|address \(of a home\)|neighbour's house|"
             r"sew|mend|patch|knit|weave|decorate|"
             r"tidy up|put away|arrange \(objects\)|store \(to keep\)|"
             r"repair|fix \(an object\)|install|assemble|"
             r"hang \(on a wall\)|fold \(cloth\))"),
    # -- Places & travel -----------------------------------------------------
    ("places-travel", r"\b(place|city|town|village|country|nation|street|road|path|"
                      r"bridge|park\b|square \(place\)|corner|building|tower|"
                      r"station|airport|port\b|harbour|harbor|bus stop|"
                      r"hotel|motel|inn\b|hostel|apartment|"
                      r"car\b|bus\b|train|subway|taxi|bicycle|bike|motorcycle|"
                      r"ship\b|boat|plane|airplane|aircraft|vehicle|"
                      r"travel|trip\b|journey|tour|visit|abroad|foreign|"
                      r"ticket|luggage|baggage|passport|map\b|"
                      r"north|south|east\b|west\b|left \(direction\)|right \(direction\)|"
                      r"direction|address|neighbourhood|neighborhood|region|area\b|"
                      r"drive \(a vehicle\)|ride\b|board \(a vehicle\)|get off|"
                      r"arrive|depart|leave for|go out|come back|return|"
                      r"sightsee|look around|wander|stroll|hike|camp\b|"
                      r"cross \(a street\)|traffic|parking|park \(a car\)|"
                      r"guide \(a visitor\)|tourist|scenery|view \(a scene\)|"
                      r"countryside|downtown|border|abroad)"),
    # -- Time & numbers ------------------------------------------------------
    ("time-numbers", r"\b(time|hour|minute|second \(time\)|moment|day|week|month|year|"
                     r"today|tomorrow|yesterday|morning|noon|afternoon|evening|night|"
                     r"dawn|dusk|midnight|weekend|holiday|date \(calendar\)|calendar|"
                     r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
                     r"january|february|march|april|may\b|june|july|august|september|"
                     r"october|november|december|"
                     r"age\b|birthday|century|era\b|period|season \(of a year\)|"
                     r"early|late|soon|now\b|then\b|always|never|often|sometimes|"
                     r"already|yet\b|still\b|again|before|after|during|until|since|"
                     r"one\b|two\b|three|four|five|six|seven|eight|nine|ten\b|"
                     r"hundred|thousand|million|number|count|amount|quantity|"
                     r"half|double|first|second\b|third|last\b|next\b|previous|"
                     r"many|much|few|little \(amount\)|several|all\b|every|each\b|"
                     r"more\b|less\b|most\b|least|enough|plenty|total|per cent|percent)"),
    # -- School & work -------------------------------------------------------
    ("school-work", r"\b(school|university|college|classroom|class\b|lesson|study|"
                    r"learn|teach|student|pupil|teacher|professor|principal|"
                    r"homework|exam|test\b|grade|degree|diploma|graduate|"
                    r"library|textbook|notebook|pencil|pen\b|eraser|ruler|"
                    r"science|scientist|mathematic|physics|chemistry|biology|history\b|"
                    r"research|experiment|theory|"
                    r"work|job\b|career|office|company|factory|employee|employer|"
                    r"boss|colleague|staff|manager|meeting|project|task\b|duty|"
                    r"salary|wage|hire|employ|resign|retire|labour|labor|"
                    r"farmer|farm\b|engineer|lawyer|reporter|journalist|"
                    r"soldier|police|driver|cook \(person\)|waiter|clerk|"
                    r"skill|ability|training|practice \(a skill\)|profession)"),
    # -- Money & shopping ----------------------------------------------------
    ("money-shopping", r"\b(money|cash|coin|bill \(money\)|price|cost|expensive|cheap|"
                       r"pay|payment|buy|sell|purchase|shop|store\b|market|mall|"
                       r"customer|seller|receipt|change \(money\)|discount|sale\b|"
                       r"bank\b|account|card \(payment\)|credit|debt|loan|save \(money\)|"
                       r"rich|poor|wealth|budget|tax|fee\b|rent\b|order \(goods\)|"
                       r"deliver|package|refund|exchange \(goods\)|wallet|earn)"),
    # -- Communication & media ----------------------------------------------
    ("communication", r"\b(say|speak|talk|tell|ask|answer|reply|call \(on the phone\)|"
                      r"phone|telephone|message|letter \(post\)|mail|email|"
                      r"word\b|sentence|language|korean\b|english\b|translat|"
                      r"write|read\b|book\b|newspaper|magazine|news\b|story|novel|"
                      r"poem|article|report|announce|explain|describe|introduce|"
                      r"discuss|conversation|chat|argue|shout|whisper|"
                      r"listen|hear|sound|voice|noise|music|song|sing|instrument|"
                      r"picture|photo|photograph|draw \(a picture\)|paint|film|movie|"
                      r"television|radio|computer|internet|website|screen|"
                      r"programme|program|file \(computer\)|data|"
                      r"promise|invite|thank \(someone\)|advice|advise|inform|"
                      r"express|mean \(signify\)|signal|sign\b|letter \(alphabet\)|"
                      r"converse|joke|tease|quarrel|argue|scold|praise|"
                      r"record \(in writing\)|indicate|represent|mention|state\b|"
                      r"claim|insist|complain|apologise|apologize|greet|"
                      r"warn|remind|suggest|propose|recommend|request|beg\b|"
                      r"lie \(to deceive\)|deceive|confess|reveal \(information\)|"
                      r"publish|print|broadcast|record \(audio\)|"
                      r"nod|wave \(a hand\)|point at|gesture)"),
    # -- Feelings & personality ---------------------------------------------
    ("feelings", r"\b(feel|feeling|emotion|mood|happy|glad|joy|delight|pleasure|"
                 r"sad|sorrow|grief|cry\b|weep|tear \(from crying\)|"
                 r"angry|anger|rage|annoy|upset|hate|dislike|"
                 r"afraid|fear|scare|frighten|worry|anxious|nervous|"
                 r"surprise|shock|astonish|"
                 r"love|like \(be fond of\)|fond|miss \(someone\)|lonely|"
                 r"proud|shame|embarrass|guilt|regret|"
                 r"calm|relax|comfort|satisfied|disappoint|bored|"
                 r"kind\b|gentle|polite|rude|honest|brave|shy|patient|"
                 r"friendly|cheerful|serious|generous|selfish|lazy|diligent|"
                 r"laugh|smile|grin|character \(personality\)|temper|"
                 r"grateful|thankful|flustered|agonise|agonize|"
                 r"jealous|envy|pity|sympath|excite|thrill|eager|reluctant|"
                 r"content \(satisfied\)|uneasy|restless|frustrat|irritat|"
                 r"despair|hopeless|delighted|amused|touched \(emotionally\)|"
                 r"sulk|resent|grudge|longing|yearn|homesick|"
                 r"cheer up|encourage|console|comfort \(someone\)|"
                 r"mood\b|spirits|sentiment|passion|desire|"
                 r"cruel|cold-hearted|warm-hearted|stubborn|timid|bold|"
                 r"modest|arrogant|humble|sincere|cunning|foolish|wise\b|clever)"),
    # -- Thinking & learning -------------------------------------------------
    ("thinking", r"\b(think|thought|idea|mind\b|know|understand|realise|realize|"
                 r"remember|memory|forget|imagine|guess|suppose|believe|doubt|"
                 r"decide|decision|choose|choice|plan|intend|consider|judge|"
                 r"reason|opinion|attention|concentrate|notice|recognise|recognize|"
                 r"wonder|solve|problem|question \(a matter\)|answer \(a solution\)|"
                 r"conscious|aware|dream|wish|hope|expect|prepare|"
                 r"look forward|reflect|ponder|contemplate|assume|conclude|"
                 r"compare|analyse|analyze|examine|study \(to consider\)|"
                 r"admit|deny|agree|disagree|accept|refuse|reject|"
                 r"intention|purpose|aim\b|goal|meaning|sense\b|"
                 r"careful|carefully|mistake|error|forget)"),
    # -- Society & culture ---------------------------------------------------
    ("society", r"\b(law|legal|court|judge \(in court\)|trial|crime|criminal|steal|"
                r"thief|prison|jail|arrest|police \(force\)|investigate|"
                r"government|president|minister|politic|election|vote|party \(political\)|"
                r"nation \(as a state\)|citizen|public|society|social|community|"
                r"war|army|military|soldier \(in an army\)|weapon|gun\b|battle|fight|peace|"
                r"religion|god\b|church|temple|pray|buddhis|christian|spirit|soul|"
                r"ghost|devil|demon|angel|heaven|hell|"
                r"sport|game|match \(a game\)|team|player|win\b|lose\b|score|race \(contest\)|"
                r"exercise|football|soccer|baseball|basketball|swim|run \(a race\)|"
                r"culture|tradition|custom|festival|ceremony|wedding|funeral|"
                r"art \(as a field\)|museum|theatre|theater|stage|actor|audience|"
                r"rule\b|order \(social\)|freedom|right \(entitlement\)|responsib|"
                r"play \(to have fun\)|hang out|leisure|hobby|club \(group\)|"
                r"compete|competition|contest|champion|prize|medal|"
                r"celebrate|commemorate|anniversary|"
                r"organisation|organization|group \(of people\)|member|leader|"
                r"protest|strike \(labour\)|equality|justice|corrupt)"),
    # -- Describing (adjective-ish meanings that survive to here) ------------
    ("describing", r"\b(big|large|small|tiny|huge|long\b|short|tall|high|low\b|"
                   r"wide|narrow|thick|thin|deep|shallow|heavy|light \(in weight\)|"
                   r"fast|quick|slow|strong|weak|hard\b|soft|smooth|rough|"
                   r"new\b|old\b|young|fresh|clean \(adjective\)|dirty|"
                   r"hot\b|warm|cool\b|cold\b|dry|wet|"
                   r"bright|dark|colour|color|red\b|blue|green|yellow|black|white|"
                   r"beautiful|pretty|ugly|nice|good|bad|"
                   r"same|different|similar|opposite|special|ordinary|common|rare|"
                   r"easy|difficult|simple|complicated|important|useful|"
                   r"true|false|correct|wrong|right \(correct\)|possible|impossible|"
                   r"empty|full|open \(adjective\)|closed|round|square|straight|"
                   r"quiet|loud|shape|size\b|colour\b|kind \(a type\)|type\b|sort\b)"),
    # -- Movement & direction ------------------------------------------------
    #
    # Its own category rather than a corner of Actions. Korean has a large,
    # regular family of motion verbs — 가다/오다 and everything built on them —
    # and they are far easier to learn as a set than scattered through six
    # hundred general verbs. 들어가다, 들어오다, 나가다 and 나오다 only make sense
    # beside each other.
    ("movement", r"\b(to go|to come|go in|come in|go out|come out|go up|come up|"
                 r"go down|come down|go over|go past|go back|come back|"
                 r"walk|run\b|jump|climb|crawl|fall\b|fly\b|float|drift|"
                 r"enter|exit|leave|depart|arrive|approach|retreat|"
                 r"move|advance|follow|chase|flee|escape|"
                 r"rise\b|sink|turn \(to face\)|step\b|pass by|cross\b|"
                 r"carry|bring|take along|send|deliver \(to a place\)|"
                 r"push|pull|drag|lift|lower|"
                 r"stand\b|sit\b|kneel|lie down|get up|"
                 r"forward|backward|upward|downward|toward)"),
    # -- Actions -------------------------------------------------------------
    ("actions", r"\b(hold|catch|throw|put\b|take\b|"
                r"drop|turn|open\b|close\b|cut\b|break|fix|build|make|"
                r"give|receive|pass|meet|stop|start|begin|finish|"
                r"look|see|watch|show|hide|find|search|lose \(an object\)|"
                r"touch|hit|kick|hug|use\b|"
                r"help|wait|try|do\b|change|repeat|continue)"),
)

#: Every rule is compiled with a *no word character follows* lookahead.
#:
#: This is the fix for a whole family of miscategorisations, and it is worth
#: being explicit about the shape of it. The rules are alternations written
#: `\b(head|face|…|pain|hurt|…)` — a word boundary in front and **nothing
#: behind**, so every alternative was also a prefix rule. `pain` matched
#: *painter*, and 화가 — a painter — was filed under Body & Health. So was
#: 그리다, *to draw, to paint*. `sand` matched *sandwich*, `wind` matched
#: *window*, `star` matched *a start*, `birth` matched *a birthday*, `doll`
#: matched *dollar*, `wall` matched *wallet*, `pill` matched *a pillow*, `war`
#: matched *a warehouse*, `exam` matched *an example*, `pass` matched *a
#: password*. 292 words in the shipped corpus took their category from a match
#: that landed inside a longer word.
#:
#: It is not a cosmetic fault. The category is what the browse screen files a
#: word under, so a learner opening Body & Health met *a painter*, *a birthday*
#: and *a pillow*; and it is what the Level Test's builder uses to keep a
#: distractor away from the answer's own subject area, so a wrong category is a
#: wrong distractor.
_TRAILING_BOUNDARY = r"(?!\w)"

#: English inflection and derivation, so a strict boundary does not cost the
#: matches it should keep.
#:
#: With the lookahead above, `shoe` no longer matches *shoes* and `inform` no
#: longer matches *information* — 196 words lost a correct category the moment
#: the accidental ones were closed. The answer is not to loosen the boundary
#: again but to *give the matcher the lemma*: every alphabetic token in the
#: gloss is reduced by the suffix table below and the reductions are appended to
#: the text the rules search. `shoes` contributes `shoe`; `information`
#: contributes `inform`; `laughter` contributes `laugh`.
#:
#: A reduction that is not a real word costs nothing — it simply matches no
#: rule. What it must not do is *invent* a match, which is why every suffix here
#: removes a genuine English ending and why the minimum stem is three letters:
#: `painter` reduces to `paint` and not to `pain`, so the word that started this
#: goes to Communication with *to draw, to paint* rather than to Body & Health.
_DOUBLED = re.compile(r"^(.{2,}?)([bcdfglmnprstz])\2(ing|ed)$")
_SUFFIXES: tuple[tuple[str, str], ...] = (
    # inflection
    ("ies", "y"), ("ied", "y"), ("ying", "ie"), ("es", ""), ("s", ""),
    ("ing", ""), ("ing", "e"), ("ed", ""), ("ed", "e"),
    ("ers", ""), ("er", ""), ("er", "e"), ("est", ""), ("ly", ""), ("n", ""),
    # derivation — the nominalisers, which is where the losses were
    ("ation", ""), ("ation", "ate"), ("ition", "ite"), ("ction", "ct"),
    ("ssion", "ss"), ("sion", "de"), ("sion", "se"), ("tion", "te"),
    ("ment", ""), ("ness", ""), ("ity", ""), ("ity", "e"),
    ("ance", ""), ("ence", ""), ("ance", "e"), ("ence", "e"),
    ("ure", ""), ("ure", "e"), ("y", ""), ("y", "e"),
    ("able", ""), ("able", "e"), ("ible", ""), ("ful", ""),
    ("ledge", "w"), ("al", ""), ("ous", ""), ("ive", ""),
)


#: Suffixes whose stem must be four letters rather than three.
#:
#: `-y` and `-ly` are the two that manufacture a word out of an unrelated one:
#: *many* -> man, *busy* -> bus, *early* -> ear, *city* -> cit. Each of those
#: was a live miscategorisation on the first run of this change — 많다 to
#: People, 바쁘다 to Places & Travel, 일찍 to Body & Health — so the stem they
#: produce has to be long enough to be a reduction rather than a coincidence.
_LONG_STEM = frozenset({"y", "ly"})


def _lemmas(token: str) -> set[str]:
    """Every plausible stem of one English token."""
    out: set[str] = set()
    doubled = _DOUBLED.match(token)
    if doubled:
        out.add(doubled.group(1) + doubled.group(2))
    for suffix, replacement in _SUFFIXES:
        floor = 4 if suffix in _LONG_STEM else 3
        if token.endswith(suffix) and len(token) - len(suffix) >= floor:
            out.add(token[: len(token) - len(suffix)] + replacement)
    return {stem for stem in out if len(stem) >= 3 and stem != token}


_WORDS = re.compile(r"[A-Za-z]+")


def expand(meaning: str) -> str:
    """The gloss, with the lemma of every token appended for the rules to see.

    Appended rather than substituted, because the gloss's own wording carries
    matches the lemma would lose: rules that name a parenthesised sense, such as
    "(a gift)" or "full (after eating)", are matched against the literal text.

    `-ter` is deliberately not a suffix here. It would give *laughter* -> laugh,
    which is wanted, and *painter* -> pain, which is the miscategorisation this
    whole change exists to remove. 웃음 is placed by an override instead.
    """
    extra: set[str] = set()
    for token in _WORDS.findall(meaning.lower()):
        extra |= _lemmas(token)
    if not extra:
        return meaning
    return f"{meaning} \u241f {' '.join(sorted(extra))}"


_COMPILED = tuple(
    (cid, re.compile(pattern + _TRAILING_BOUNDARY, re.I)) for cid, pattern in MEANING_RULES
)

#: The floor. A word with no thematic signal is what its part of speech says.
BY_PART_OF_SPEECH: dict[str, str] = {
    "verb": "actions",
    "adjective": "describing",
    # An adverb with no thematic signal is a manner or degree word — quickly,
    # rather, in any case. It describes *how*, not *what*, which is a different
    # thing to browse for.
    "adverb": "how-when",
    # A noun with no signal is a thing in the world. `home` is the category for
    # everyday objects, and it is a far better guess than `describing`, which a
    # learner looking for 이불 would never open.
    "noun": "home",
    "pronoun": "essentials",
    "determiner": "essentials",
    "numeral": "time-numbers",
    "interjection": "essentials",
}

#: Decisions made by reading the classifier's output, word by word.
#:
#: Populated by the audit and kept here rather than in the rules because a rule
#: written to catch one word catches thirty others by accident. An entry here
#: means: a person looked at this word and this is where it goes.
OVERRIDES: dict[str, str] = {
    # --- Nouns the meaning rules could not place -------------------------------
    # Read one at a time against the gloss. Grouped by where they landed.
    # essentials: the words a beginner needs to hold a sentence together
    "모두": "essentials", "전체": "essentials", "부분": "essentials",
    "일부": "essentials", "기본": "essentials", "보통": "essentials",
    "원래": "essentials", "경우": "essentials", "사실": "essentials",
    "실제": "essentials", "사실상": "essentials", "일반": "essentials",
    "그중": "essentials", "완전": "essentials", "공동": "essentials",
    # people
    "어른": "people", "숙녀": "people", "개인": "people", "주인": "people",
    "바보": "people", "천재": "people", "탐정": "people", "형사": "people",
    "선수": "people", "감독": "people", "장군": "people", "영웅": "people",
    "강도": "people", "선배": "people", "쌍둥이": "people", "인턴": "people",
    "범인": "people", "용의자": "people", "피해자": "people", "이혼": "people",
    "관계": "people", "신세": "people",
    # body & health
    "주사": "body-health", "한숨": "body-health", "비명": "body-health",
    "기저귀": "body-health", "생애": "body-health", "생존": "body-health",
    "응급": "body-health", "신장": "body-health", "정신적": "body-health",
    # food
    "위스키": "food", "샴페인": "food", "크림": "food",
    # animals & nature
    "늑대": "animals-nature", "산소": "animals-nature", "우주": "animals-nature",
    "적도": "animals-nature", "그림자": "animals-nature", "어둠": "animals-nature",
    "세상": "animals-nature", "세계": "animals-nature", "방사선": "animals-nature",
    "위성": "animals-nature", "구멍": "animals-nature", "낚시": "animals-nature",
    "연료": "animals-nature", "강철": "animals-nature",
    # home & everyday things
    "가면": "home", "유리": "home", "반지": "home", "테이프": "home",
    "바퀴": "home", "장비": "home", "조명": "home", "전원": "home",
    "엔진": "home", "충전": "home", "예비": "home",
    # places & travel
    "근처": "places-travel", "인도": "places-travel", "저리": "places-travel",
    "바깥": "places-travel", "내부": "places-travel", "외부": "places-travel",
    "주변": "places-travel", "지하": "places-travel", "차고": "places-travel",
    "로비": "places-travel", "술집": "places-travel", "슈퍼": "places-travel",
    "오른쪽": "places-travel", "왼쪽": "places-travel", "양쪽": "places-travel",
    "비행": "places-travel", "위치": "places-travel", "복도": "places-travel",
    "가운데": "places-travel", "중앙": "places-travel", "중간": "places-travel",
    "건너": "places-travel", "도착": "places-travel", "착륙": "places-travel",
    "탈출": "places-travel", "장벽": "places-travel", "헬기": "places-travel",
    "로켓": "places-travel", "드론": "places-travel", "국제": "places-travel",
    "사이": "places-travel", "아래": "places-travel", "접근": "places-travel",
    "도망": "places-travel", "추적": "places-travel",
    # time & numbers
    "계속": "time-numbers", "아까": "time-numbers", "한참": "time-numbers",
    "추가": "time-numbers", "임시": "time-numbers", "최소": "time-numbers",
    "최대": "time-numbers", "대형": "time-numbers", "일과": "time-numbers",
    "연쇄": "time-numbers", "진행": "time-numbers", "발생": "time-numbers",
    # school & work
    "준비": "school-work", "유지": "school-work", "제작": "school-work",
    "처리": "school-work", "본부": "school-work", "유전자": "school-work",
    "전자": "school-work", "업무": "school-work", "담당": "school-work",
    "관리": "school-work", "연습": "school-work", "자격": "school-work",
    "성적": "school-work", "인터뷰": "school-work", "분석": "school-work",
    "공식": "school-work", "시스템": "school-work", "가동": "school-work",
    "자동": "school-work", "실패": "school-work", "성공": "school-work",
    "효과": "school-work", "결과": "school-work", "완료": "school-work",
    # money & shopping
    "무료": "money-shopping", "보험": "money-shopping", "부동산": "money-shopping",
    "경비": "money-shopping", "사업": "money-shopping", "주문": "money-shopping",
    "서비스": "money-shopping", "가치": "money-shopping",
    # communication & media
    "편지": "communication", "연락": "communication", "설명": "communication",
    "소문": "communication", "광고": "communication", "자막": "communication",
    "드라마": "communication", "통신": "communication", "사인": "communication",
    "접속": "communication", "코드": "communication", "비디오": "communication",
    "마이크": "communication", "공연": "communication", "피아노": "communication",
    "기타": "communication", "밴드": "communication", "앨범": "communication",
    "포스터": "communication", "페이지": "communication", "파일": "communication",
    "영상": "communication", "녹음": "communication", "연설": "communication",
    "상담": "communication", "질문": "communication", "호출": "communication",
    "초대": "communication", "안부": "communication", "잔소리": "communication",
    "거짓말": "communication", "참고": "communication", "차트": "communication",
    "연결": "communication", "그룹": "communication", "클럽": "communication",
    # feelings
    "긴장": "feelings", "스트레스": "feelings", "조심": "feelings",
    "애도": "feelings", "인기": "feelings", "염려": "feelings",
    "공포": "feelings", "재미": "feelings", "복수": "feelings",
    # thinking & learning
    "관심": "thinking", "상상": "thinking", "확인": "thinking",
    "시도": "thinking", "노력": "thinking", "해결": "thinking",
    "발견": "thinking", "방법": "thinking", "증거": "thinking",
    "무지": "thinking", "집중": "thinking", "가능성": "thinking",
    "진실": "thinking", "인정": "thinking", "존재": "thinking",
    "필요": "thinking", "기회": "thinking", "관련": "thinking",
    "상관": "thinking", "쓸모": "thinking", "재수": "thinking",
    # society & culture
    "살인": "society", "명령": "society", "비밀": "society", "스파이": "society",
    "보안": "society", "안전": "society", "위험": "society", "공격": "society",
    "사냥": "society", "용서": "society", "허락": "society", "금지": "society",
    "작전": "society", "파티": "society", "골프": "society", "스키": "society",
    "요가": "society", "장난": "society", "데이트": "society", "키스": "society",
    "마법": "society", "괴물": "society", "로봇": "society", "외계인": "society",
    "요괴": "society", "승리": "society", "지지": "society", "지원": "society",
    "통제": "society", "경보": "society", "제거": "society", "방해": "society",
    "피해": "society", "폭발": "society", "총알": "society", "발사": "society",
    "사격": "society", "기밀": "society", "허가": "society", "승인": "society",
    "기지": "society", "비상": "society", "무단": "society", "포기": "society",
    "기록": "society", "행동": "society", "구조": "society", "특별": "society",
    # describing
    "녹색": "describing", "갈색": "describing", "핑크": "describing",
    "길이": "describing", "깊이": "describing", "높이": "describing",
    "속도": "describing", "가짜": "describing", "최고": "describing",
    "모습": "describing", "정상": "describing", "반대": "describing",
    "나선": "describing", "냄새": "describing", "혼자": "describing",
    "조금": "describing", "골치": "describing",
    "양반": "society", "수정": "school-work", "운전": "movement",
    "상황": "essentials", "사건": "society", "전문": "school-work",
    "대박": "feelings", "감기": "body-health", "보호": "society",
    "수고": "school-work", "긴급": "time-numbers", "현장": "places-travel",
    # --- Verbs the meaning rules could not place -------------------------------
    # feelings: verbs about how something feels rather than what is done
    "좋아하다": "feelings", "싫어하다": "feelings", "즐기다": "feelings",
    "슬퍼하다": "feelings", "아끼다": "feelings", "괴롭히다": "feelings",
    "용서하다": "feelings", "존경하다": "feelings", "존중하다": "feelings",
    "시달리다": "feelings", "염려하다": "feelings", "자랑하다": "feelings",
    "원하다": "feelings", "홀리다": "feelings", "사로잡다": "feelings",
    "친하다": "feelings", "근사하다": "feelings", "멋있다": "feelings",
    "화려하다": "feelings", "비웃다": "feelings", "모욕하다": "feelings",
    "위하다": "feelings", "베풀다": "feelings", "받들다": "feelings",
    "섬기다": "feelings", "봉사하다": "feelings",
    # thinking & learning
    "확인하다": "thinking", "발견하다": "thinking", "알아내다": "thinking",
    "증명하다": "thinking", "오해하다": "thinking", "확신하다": "thinking",
    "신뢰하다": "thinking", "의심되다": "thinking", "선호하다": "thinking",
    "추구하다": "thinking", "망설이다": "thinking", "헷갈리다": "thinking",
    "참조하다": "thinking", "의미하다": "thinking", "뜻하다": "thinking",
    "상징하다": "thinking", "익히다": "thinking", "찾아내다": "thinking",
    "구하다": "thinking", "찾다": "thinking", "주의하다": "thinking",
    "관찰하다": "thinking", "주시하다": "thinking", "엿보다": "thinking",
    "바라보다": "thinking", "명확하다": "thinking", "해당하다": "thinking",
    "속하다": "thinking", "관련하다": "thinking", "적응하다": "thinking",
    # communication
    "부르다": "communication", "연락하다": "communication", "응답하다": "communication",
    "명령하다": "communication", "설득하다": "communication", "비난하다": "communication",
    "맹세하다": "communication", "침묵하다": "communication", "흉내내다": "communication",
    "엿듣다": "communication", "떠들다": "communication", "장담하다": "communication",
    "실례하다": "communication", "기록하다": "communication", "작성하다": "communication",
    "털어놓다": "communication", "전하다": "communication", "지어내다": "communication",
    "흠잡다": "communication", "척하다": "communication", "암호": "communication",
    "지도하다": "communication",
    # body & health
    "태어나다": "body-health", "숨지다": "body-health", "사망하다": "body-health",
    "토하다": "body-health", "삐다": "body-health", "졸다": "body-health",
    "취하다": "body-health", "쓰리다": "body-health", "부러지다": "body-health",
    "물리다": "body-health", "벌거벗다": "body-health", "생존하다": "body-health",
    "살아남다": "body-health", "쓰러지다": "body-health", "웅크리다": "body-health",
    "숙다": "body-health",
    # people
    "결혼하다": "people", "이혼하다": "people", "헤어지다": "people",
    "함께하다": "people", "짝짓다": "people", "물려받다": "people",
    "배신하다": "people", "화해하다": "people", "손잡다": "people",
    "키스하다": "people", "의지하다": "people", "의존하다": "people",
    # animals & nature
    "짖다": "animals-nature", "얼다": "animals-nature", "얼어붙다": "animals-nature",
    "흐르다": "animals-nature", "불다": "animals-nature", "썩다": "animals-nature",
    "자라다": "animals-nature", "타오르다": "animals-nature", "삭다": "animals-nature",
    "쬐다": "animals-nature", "빛나다": "animals-nature", "반짝이다": "animals-nature",
    "스미다": "animals-nature", "새다": "animals-nature", "퍼지다": "animals-nature",
    "흩어지다": "animals-nature", "고이다": "animals-nature", "캐다": "animals-nature",
    "파다": "animals-nature", "쪼다": "animals-nature", "갉아먹다": "animals-nature",
    "기르다": "animals-nature", "거두다": "animals-nature",
    # food
    "우리다": "food", "절다": "food", "푸다": "food", "뱉다": "food",
    "섞다": "food", "바르다": "food",
    # home
    "다리다": "home", "치우다": "home", "접다": "home", "채우다": "home",
    "씌우다": "home", "꾸리다": "home", "매달다": "home", "붙이다": "home",
    "묶다": "home", "새기다": "home", "오리다": "home", "잘라내다": "home",
    # movement & direction
    "운전하다": "movement", "몰다": "movement", "출발하다": "movement",
    "도달하다": "movement", "굴러가다": "movement", "흘러가다": "movement",
    "뒹굴다": "movement", "뛰어들다": "movement", "뛰어넘다": "movement",
    "앞장서다": "movement", "넘어서다": "movement", "머무르다": "movement",
    "위치하다": "movement", "부딪다": "movement", "부딪치다": "movement",
    "마주치다": "movement", "끼어들다": "movement", "몰아내다": "movement",
    "내쫓다": "movement", "이끌다": "movement", "매달리다": "movement",
    "멀어지다": "movement", "멀다": "movement",
    # school & work
    "연습하다": "school-work", "개발하다": "school-work", "도전하다": "school-work",
    "성공하다": "school-work", "실패하다": "school-work", "담당하다": "school-work",
    "처리하다": "school-work", "유지하다": "school-work", "진행하다": "school-work",
    "활동하다": "school-work", "협력하다": "school-work", "제공하다": "school-work",
    "공급하다": "school-work", "수집하다": "school-work", "조종하다": "school-work",
    "소유하다": "school-work", "갖추다": "school-work", "마무리": "school-work",
    "노력하다": "school-work", "극복하다": "school-work", "감당하다": "school-work",
    "성장하다": "school-work", "증가하다": "school-work",
    # money & shopping
    "주문하다": "money-shopping", "거래하다": "money-shopping",
    "팔리다": "money-shopping", "교환하다": "money-shopping",
    "빌리다": "money-shopping", "낭비하다": "money-shopping",
    "유리하다": "money-shopping", "차지하다": "money-shopping",
    # society & culture
    "추다": "society", "춤추다": "society", "공격하다": "society",
    "방어하다": "society", "항복하다": "society", "위협하다": "society",
    "사냥하다": "society", "복수하다": "society", "석방하다": "society",
    "파괴하다": "society", "폭발하다": "society", "참여하다": "society",
    "참가하다": "society", "참석하다": "society", "응원하다": "society",
    "반대하다": "society", "찬성하다": "society", "복종하다": "society",
    "저지르다": "society", "빼앗다": "society", "해치다": "society",
    "방해하다": "society", "간섭하다": "society", "강요하다": "society",
    "금지하다": "society", "허락하다": "society", "허용하다": "society",
    "감시하다": "society", "감시": "society", "수색": "society",
    "추적하다": "society", "차단하다": "society", "압박하다": "society",
    "통과하다": "society", "통과": "society", "중지하다": "society",
    "중지": "society", "정지": "society", "잡아먹다": "society",
    "가두다": "society", "갇히다": "society", "잡히다": "society",
    "붙잡다": "society", "인정하다": "society", "행동하다": "society",
    "잘나가다": "society", "까불다": "society", "나대다": "society",
    "무시하다": "society", "보호하다": "society", "지키다": "society",
    "지원하다": "society", "지지하다": "society", "대기": "society",
    "대기하다": "society",
    # --- 2026-09-10 audit: every category read end to end, word by word -------
    #
    # The classifier's boundary fix (see `_TRAILING_BOUNDARY`) closed the
    # accidental prefix matches; this closes what reading the eighteen finished
    # lists found behind them. Two shapes dominate.
    #
    # **The gloss carries a word the rule wanted, about something else.** 고향
    # is *one's hometown* and `home` put it in Places; 원 is *the won* and
    # `one` put it in Time & Numbers; 금 is *gold* and so did `gold`... no —
    # `금` came through `time-numbers` on a stray, and a learner looking for
    # money does not open Time & Numbers. Each of these is one word, so each is
    # decided here rather than by widening a rule that would take thirty others
    # with it.
    #
    # **The floor is not neutral.** A noun with no thematic signal lands in
    # `home`, which is right for 이불 and wrong for 개념, 맥락, 전제 and the
    # other hundred-odd abstract nouns the corpus has grown. Browsing Home &
    # Daily Life for *a premise* is the same fault as browsing Body & Health
    # for *a painter*, and the fix is the same: name the drawer by hand.
    # essentials — the sentence-holding words, and the fixed expressions
    "등": "body-health", "키": "body-health", "매출": "money-shopping",
    "진척": "school-work", "걸어가다": "movement", "뛰어가다": "movement",
    "데려오다": "movement", "재미없다": "describing", "소용없다": "describing",
    "환영하다": "communication", "반기다": "feelings", "도리": "society",
    "금상첨화": "describing", "출신": "people", "부인": "people",
    # people — the month name and the applause that were filed as persons
    "월": "time-numbers", "박수": "society", "직접": "how-when",
    "억압": "society", "복지": "society", "인공": "describing",
    "정서": "feelings", "동원하다": "society", "의지하다": "feelings",
    # food — verbs and adjectives the food rule caught by a single word
    "신청하다": "communication", "가하다": "actions", "쏟아지다": "movement",
    "베다": "actions", "상냥하다": "feelings", "낚다": "animals-nature",
    "진하다": "describing", "잔": "home", "바르다": "actions",
    "조각": "describing", "고소하다": "food", "달콤하다": "food",
    # animals & nature — the celebrity star, the engine, and the adverbs
    "스타": "people", "고장": "actions", "고장나다": "actions",
    "구멍": "home", "운동장": "society", "강철": "home",
    "견디다": "feelings", "쏘다": "actions", "거두다": "actions",
    "도대체": "how-when", "퍼지다": "movement", "본질": "thinking",
    "방사선": "school-work", "악착같다": "describing", "갈래": "describing",
    "워낙": "how-when", "노련하다": "describing", "미행하다": "actions",
    "발휘하다": "actions", "고약하다": "describing", "몰아넣다": "movement",
    "감내하다": "feelings", "갉아먹다": "actions", "감돌다": "describing",
    "흩어지다": "movement", "스미다": "movement", "샌드위치": "food",
    # home — the abstract nouns that landed on the object floor
    "기적": "society", "만약": "how-when", "춤": "society",
    "끝": "time-numbers", "제목": "communication", "우주선": "places-travel",
    "실험실": "school-work", "자료": "school-work", "대신": "how-when",
    "재능": "people", "제안": "communication", "법정": "society",
    "보기": "school-work", "확률": "thinking", "약국": "places-travel",
    "극장": "society", "상대": "people", "일기": "communication",
    "기능": "describing", "직업": "school-work", "경험": "thinking",
    "왕자": "people", "빛": "animals-nature", "왕": "people",
    "왕비": "people", "행복": "feelings", "소개": "communication",
    "흔적": "thinking", "내용": "communication", "지식": "thinking",
    "신사": "people", "시설": "places-travel", "증상": "body-health",
    "최악": "describing", "원인": "thinking", "비밀번호": "communication",
    "검사": "school-work", "방식": "thinking", "책임": "society",
    "주제": "communication", "조건": "thinking", "영향": "thinking",
    "최근": "time-numbers", "과정": "thinking", "오해": "communication",
    "모임": "society", "대개": "how-when", "수준": "describing",
    "중심": "essentials", "활동": "society", "행성": "animals-nature",
    "성격": "people", "차도": "places-travel", "체력": "body-health",
    "차이": "describing", "전문가": "school-work", "응급실": "body-health",
    "여지": "thinking", "운명": "society", "한동안": "time-numbers",
    "저리다": "body-health", "독감": "body-health", "역할": "society",
    "다소": "how-when", "번역": "communication", "한계": "describing",
    "다행": "feelings", "규모": "describing", "본래": "how-when",
    "기준": "thinking", "체온": "body-health", "양심": "feelings",
    "이대로": "essentials", "관점": "thinking", "대응": "actions",
    "편견": "thinking", "문의": "communication", "눈치": "thinking",
    "단절": "society", "요원": "people", "설상가상": "describing",
    "이례적": "describing", "필연적": "describing", "요소": "describing",
    "낙관적": "describing", "가시다": "actions", "사례": "thinking",
    "싸구려": "money-shopping", "개념": "thinking", "착오": "thinking",
    "추세": "thinking", "신념": "thinking", "자질": "people",
    "유출": "society", "취지": "thinking", "기질": "people",
    "폐지": "society", "타협": "society", "성과": "school-work",
    "요인": "thinking", "하필": "how-when", "모순": "thinking",
    "대안": "thinking", "측면": "thinking", "파장": "society",
    "첨부": "communication", "유입": "movement", "촉구": "communication",
    "정신과": "body-health", "쇠퇴": "society", "갈등": "society",
    "경향": "thinking", "침해": "society", "전제": "thinking",
    "별개": "thinking", "예비": "describing", "명분": "thinking",
    "견제": "society", "번영": "society", "결핍": "describing",
    "역량": "people", "발급": "society", "통찰": "thinking",
    "맥락": "thinking", "이념": "society", "성향": "people",
    "완화": "describing", "애지중지": "feelings", "새옹지마": "society",
    "결자해지": "society", "다재다능": "people", "고군분투": "society",
    "일사천리": "describing", "대기만성": "society", "주객전도": "thinking",
    "솔선수범": "society", "임기응변": "thinking", "횡설수설": "communication",
    "야무지다": "describing", "여유롭다": "describing", "청결하다": "describing",
    "돈독하다": "describing", "잘나다": "describing", "산뜻하다": "describing",
    "유능하다": "describing", "무난하다": "describing",
    # body & health — the sweater, the washing machine and the abstract verbs
    "없다": "essentials", "착하다": "feelings", "스웨터": "home",
    "세탁기": "home", "벌다": "money-shopping", "생활": "society",
    "나머지": "essentials", "갚다": "money-shopping", "사장": "school-work",
    "밀리다": "actions", "작동": "school-work", "작동하다": "school-work",
    "돌려주다": "actions", "시절": "time-numbers", "빨다": "home",
    "향하다": "movement", "늘다": "describing", "취급하다": "actions",
    "되찾다": "actions", "내주다": "actions", "건네다": "actions",
    "실컷": "how-when", "각오": "thinking", "반려": "society",
    "유보하다": "thinking", "철회": "society", "안목": "thinking",
    "반발": "society", "늦추다": "time-numbers", "정립하다": "thinking",
    "법적": "society", "제출하다": "school-work", "정신적": "thinking",
    "학수고대": "feelings", "되돌리다": "actions", "물러나다": "movement",
    "터놓다": "communication", "저버리다": "society", "자제하다": "feelings",
    "화룡점정": "describing", "살신성인": "society", "짊어지다": "actions",
    "냉철하다": "describing", "치닫다": "movement", "돌이키다": "thinking",
    "냉정하다": "describing", "앞세우다": "actions", "잦아들다": "describing",
    "물리치다": "actions", "맞서다": "society", "마주하다": "movement",
    "일찍": "how-when", "군대": "society", "짜증나다": "feelings",
    "이르다": "time-numbers", "살아가다": "society", "초기": "time-numbers",
    # places & travel — the inner self and the conclusion
    "내면": "thinking", "도출하다": "thinking", "대통령": "society",
    "훈련": "school-work", "부서": "school-work", "정신없다": "describing",
    "자수성가": "society", "동분서주": "how-when", "고정되다": "describing",
    "매만지다": "actions", "국제": "society", "국가": "society",
    # time & numbers — everything the words "one", "time" and "count" caught
    "고향": "places-travel", "금": "money-shopping", "원": "money-shopping",
    "최선": "thinking", "실력": "school-work", "고민": "thinking",
    "상사": "school-work", "원칙": "thinking", "첫사랑": "feelings",
    "사명": "society", "포부": "thinking", "여건": "thinking",
    "격차": "society", "여파": "society", "많다": "describing",
    "정도": "describing", "계산": "time-numbers", "충분하다": "describing",
    "지내다": "society", "돌보다": "people", "보살피다": "people",
    "묵다": "places-travel", "임시": "describing", "추가": "describing",
    "야근": "school-work", "연봉": "money-shopping", "당하다": "society",
    "결심하다": "thinking", "쫓아오다": "movement", "마음대로": "how-when",
    "절충": "thinking", "금시초문": "communication", "진행": "actions",
    "아예": "how-when", "마음껏": "how-when", "닥치다": "time-numbers",
    "발생": "actions", "쫓아가다": "movement", "굳이": "how-when",
    "들이다": "actions", "주력하다": "actions", "짐작하다": "thinking",
    "긴급": "describing", "누적되다": "time-numbers", "번복하다": "thinking",
    "창업": "school-work", "온갖": "describing", "인접하다": "places-travel",
    "관리하다": "school-work", "웬만하다": "describing", "뜻대로": "how-when",
    "심화되다": "describing", "대형": "describing", "연쇄": "describing",
    "일관되다": "describing", "역부족": "describing", "깜빡하다": "thinking",
    "고작": "how-when", "선입견": "thinking", "앞두다": "time-numbers",
    "유일하다": "describing", "다다익선": "describing", "벅차다": "describing",
    "과유불급": "describing", "시기상조": "time-numbers", "우유부단": "people",
    "모조리": "how-when", "비일비재": "describing", "호시탐탐": "how-when",
    "자업자득": "society", "일석이조": "describing", "타산지석": "thinking",
    "십중팔구": "describing", "일거양득": "describing", "적반하장": "society",
    "토로하다": "communication", "억지로": "how-when", "반신반의": "thinking",
    "미숙하다": "describing", "일취월장": "describing", "동병상련": "feelings",
    "작심삼일": "describing", "지긋하다": "describing", "빈번하다": "describing",
    "대동소이": "describing", "샅샅이": "how-when", "손꼽히다": "describing",
    "치우치다": "thinking", "각양각색": "describing", "그나마": "how-when",
    "어긋나다": "thinking", "되새기다": "thinking", "일찌감치": "how-when",
    # school & work
    "흥분하다": "feelings", "더하다": "time-numbers", "안되다": "describing",
    "반응": "actions", "고급": "describing", "수고": "school-work",
    "유유상종": "society", "청출어람": "school-work", "박학다식": "thinking",
    # money & shopping
    "이야기": "communication", "진지하다": "describing", "자초지종": "communication",
    "주목하다": "thinking", "보관하다": "actions", "저장하다": "actions",
    "고려하다": "thinking", "차지하다": "actions", "유리하다": "describing",
    "열악하다": "describing", "가치": "thinking",
    # communication
    "미국": "places-travel", "좀": "how-when", "상태": "describing",
    "마련하다": "actions", "시끄럽다": "describing", "무사하다": "describing",
    "실태": "thinking", "파악하다": "thinking", "완곡하다": "describing",
    "사기": "society", "근거": "thinking", "가리다": "actions",
    "장기": "society", "척하다": "actions", "어부지리": "society",
    "유창하다": "describing", "그룹": "society", "클럽": "society",
    "표정": "body-health", "화가": "people", "작가": "people",
    "촬영": "communication",
    # feelings
    "가지": "describing", "종류": "describing", "그런": "essentials",
    "계시다": "essentials", "열심히": "how-when", "조심": "thinking",
    "큰일": "essentials", "아끼다": "actions", "듬뿍": "how-when",
    "복수": "society", "봉사하다": "society", "섬기다": "society",
    "기꺼이": "how-when", "흔쾌히": "how-when", "부드럽다": "describing",
    "곱다": "describing", "순하다": "describing", "똑똑하다": "describing",
    "영리하다": "describing", "현명하다": "describing", "어리석다": "describing",
    "근사하다": "describing", "화려하다": "describing", "시리다": "body-health",
    "완화하다": "actions", "감행하다": "actions", "아득하다": "describing",
    "체감하다": "feelings", "설치다": "describing",
    # thinking
    "재수": "society", "역시": "how-when", "특수": "describing",
    "상관": "thinking", "일부러": "how-when", "대충": "how-when",
    "왠지": "how-when", "함부로": "how-when", "하긴": "how-when",
    "여론": "society", "통보": "communication", "비치다": "animals-nature",
    "고찰": "thinking", "저조하다": "describing", "하염없이": "how-when",
    "심사숙고": "thinking", "유비무환": "thinking",
    # movement
    "파리": "animals-nature", "운전": "places-travel", "출구": "places-travel",
    "절차": "thinking", "모범": "society", "미리": "how-when",
    "거꾸로": "how-when", "침체": "society", "제시": "communication",
    "실행": "actions", "원활하다": "describing", "망하다": "society",
    "반하다": "feelings", "상하다": "food", "운영하다": "school-work",
    "고진감래": "society", "성사되다": "actions", "무산되다": "actions",
    # actions — the nouns of action stay; the adjectives and idioms move
    "못": "how-when", "덩치": "describing", "기반": "thinking",
    "자산": "money-shopping", "소용": "describing", "의욕": "feelings",
    "욕하다": "communication", "처참하다": "describing", "조급하다": "describing",
    "각별하다": "describing", "숨막히다": "describing", "촘촘하다": "describing",
    "우여곡절": "society", "속수무책": "describing", "선견지명": "thinking",
    "막상막하": "describing", "전화위복": "society", "환골탈태": "describing",
    "자포자기": "feelings", "조삼모사": "thinking", "통치하다": "society",
    "반항하다": "society", "겨루다": "society", "일치하다": "thinking",
    "입증하다": "thinking", "자극하다": "feelings", "책임지다": "society",
    "합치다": "actions", "커지다": "describing", "높아지다": "describing",
    "세지다": "describing", "매다": "actions", "갈다": "actions",
    "알아듣다": "communication", "쳐다보다": "thinking", "눈치채다": "thinking",
    "들리다": "communication", "잡다": "actions", "시작": "time-numbers",
    "개시": "time-numbers", "시동": "places-travel", "축하하다": "essentials",
    # describing — the nouns that are not descriptions
    "잔돈": "money-shopping", "정상": "places-travel", "반대": "thinking",
    "발췌": "communication", "확대": "describing", "축소": "describing",
    "도입": "society", "관행": "society", "나선": "describing",
    "골치": "feelings", "청천벽력": "feelings", "해소하다": "actions",
    "압축하다": "actions", "재편하다": "actions", "우회하다": "movement",
    "공헌하다": "society", "갈망하다": "feelings", "가늠하다": "thinking",
    "바로잡다": "actions", "돌아서다": "movement", "벌리다": "actions",
    "뒤틀다": "actions", "말리다": "actions", "비우다": "actions",
    "식다": "describing", "마르다": "describing", "젖다": "describing",
    "돌다": "movement", "빚다": "actions", "둘러보다": "thinking",
    "빗나가다": "movement", "무리하다": "describing", "모호하다": "describing",
    "비겁하다": "describing", "팔방미인": "people", "남자답다": "describing",
    "공교롭다": "describing", "한심하다": "describing", "단순히": "how-when",
    "어쩌면": "how-when", "간단히": "how-when", "달리": "how-when",
    "흔히": "how-when", "대략": "how-when", "얼추": "how-when",
    "활짝": "how-when", "좀처럼": "how-when", "낮추다": "actions",
    "상당히": "how-when", "부쩍": "how-when", "편히": "how-when",
    "편안히": "how-when", "깨끗이": "how-when", "골고루": "how-when",
    "앞서": "how-when",
}


def classify(
    word: str,
    part_of_speech: str,
    meaning: str,
    topics: list[str] | None = None,
) -> tuple[str, list[str]]:
    """The category this word belongs in, and the others it also touches.

    ## Two kinds of evidence, and only one of them knows which sense is taught

    The **gloss** is the sense this card teaches — that is what `senseId` means —
    so a category matched against it is a category of the taught sense.

    A Wiktionary **topic** is attached to a *page*, and a page describes every
    sense the word has. 김치's page carries `Photography`, because 김치 is what
    Koreans say instead of "cheese" for a photograph, and the mapping sends
    Photography to *communication*. The card teaches the food. Nothing on the
    record says which sense the topic belongs to, so there is no filter to
    apply: the information simply is not there.

    So the two are not pooled. A topic may name the category of a word the gloss
    could not classify at all — better than falling back to its part of speech —
    but **a topic never adds a second category on top of a gloss match**. That
    is where the wrong ones were getting in, and a secondary category feeds
    search and recommendations, so a wrong one sends a learner somewhere the
    word does not belong.

    Wrong metadata is worse than missing metadata, and this prefers missing.
    """
    searchable = expand(meaning)
    from_gloss: list[str] = []
    for cid, pattern in _COMPILED:
        if pattern.search(searchable) and cid not in from_gloss:
            from_gloss.append(cid)

    from_topic: list[str] = []
    for topic in topics or []:
        mapped = WIKTIONARY_TOPICS.get(topic)
        if mapped and mapped not in from_topic:
            from_topic.append(mapped)

    if word in OVERRIDES:
        primary = OVERRIDES[word]
    elif from_gloss:
        primary = from_gloss[0]
    elif from_topic:
        primary = from_topic[0]
    else:
        primary = BY_PART_OF_SPEECH.get(part_of_speech, "describing")

    # Only the taught sense's own evidence may add a category beyond the primary.
    return primary, [t for t in from_gloss if t != primary]
