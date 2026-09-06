# Vocabulary data, difficulty and provenance

## What ships today

**3,393 words**, every one of them reviewed by hand, with per-field provenance
on every row, and a meaning and an example translation in **all thirty-two**
interface languages — 108,576 hand-written rows.

### …and where it is going

The product target is **10,000+ useful headwords**, and the gap is content
production rather than engineering. What is built and enforced now is everything
around that number:

* `npm run vocabulary:qa` states the target, checks every invariant the learning
  system needs — unique canonical headwords, a priority score, a category, a
  part of speech, an example, a gloss and an example translation in all eight
  languages — and reports the shortfall. `npm run vocabulary:qa -- --target`
  makes the count binding, and is what a release runs.
* The corpus is its own bundle chunk, and `check-bundle-budget.mjs` projects its
  gzipped cost forward to 10,000 headwords. At today's 72 bytes a word that
  forecast is **700 kB, or 318% of its budget**, printed on every build.
* That forecast becomes a *failing* build the moment the corpus passes 4,000
  headwords while still being loaded before the home screen paints — which is
  the commit where the current architecture becomes the wrong one, and the
  commit where somebody can still do something about it. The remedies are named
  in `CORPUS_TARGET_BUDGET`; none of them is a bigger number.

The learner-facing side is already built for the target size: the vocabulary
screen shows a daily goal rather than a catalogue (§22), a session reads a
prefix of the priority order rather than scanning the corpus, and no screen
renders more than 120 entries.

| Field | Where it comes from | Licence |
| --- | --- | --- |
| part of speech, topic categories | English Wiktionary | CC BY-SA 4.0 |
| synonyms (유의어) and antonyms (반의어) | Korean Wiktionary | CC BY-SA 4.0 |
| corpus frequency band, rank and rate | two OpenSubtitles Korean corpora (`hermitdave/FrequencyWords`) | MIT (list) / CC BY-SA (corpus) |
| meanings in eight languages, example sentence, its seven translations | Hangyul ganada editorial pack | ours |
| meanings and example translations for Vietnamese and Thai, 500 words each | written by hand, `content/vocabulary/copy/` | ours |
| pronunciation, spoken form, sound-change pattern, surface form, syllables, required letters, difficulty, category, readiness | Hangyul ganada | ours |

Every word carries a `sources` array naming which of those supplied which field,
and Hangyul ganada's own entries are marked `derived: true`. Nothing computed
here is attributed to an outside dataset, and nothing an outside dataset
published is presented as ours.

The subset those licences actually require to be displayed is shown in the app
under **My Learning → Legal & Licences**. A source whose licence asks for
nothing is not listed there — that is the difference between a legal notice and
a colophon.

### Share-alike

Wiktionary is CC BY-SA 4.0. That licence permits commercial redistribution and
requires attribution and the same licence on derived data. So:

* the attribution string is rendered in the app, not buried in a README;
* `apps/web/src/data/generated/vocabulary.json` and
  `apps/web/src/data/generated/relations.json` — the derived datasets — are
  offered under CC BY-SA 4.0;
* the application code and the audio are not derived from it and are not covered
  by it.

## The pack is the gate

The dataset used to be a Wiktionary import with filters over it. It is now a
**reviewed corpus**: `content/vocabulary/entries/*.jsonl` holds one hand-written
record per word, and a word that has not been reviewed does not ship. A word
that was reviewed and cut does not ship either, and carries the reason it was
cut in the same file — 328 of them.

```json
{"w": "가다", "k": 1, "u": 1, "sem": "act:walk|road",
 "m": {"ko": "…", "ja": "…", "zh": "…", "es": "…", "fr": "…", "de": "…", "pt": "…"},
 "ex": "학교에 가요.",
 "t": {"en": "…", "ja": "…", "zh": "…", "es": "…", "fr": "…", "de": "…", "pt": "…"}}
```

| Key | Meaning |
| --- | --- |
| `w` | the Korean word — the join key |
| `k` | keep: 1 ships, 0 is removed and needs `r` |
| `r` | why it was removed, when `k` is 0 |
| `u` | learner usefulness, 1 (needed in week one) to 5 (advanced) |
| `sem` | concreteness tag: what kind of thing the word names |
| `en` | the English meaning, where the dictionary's gloss was not good enough |
| `pos` | a correction to the dictionary's part of speech |
| `ex` | the Korean example sentence |
| `t` | that sentence in every other shipping locale |

`sem` was called `v` until this cycle, when it stopped being an illustration
spec and became what it had always really been: an editor's answer to "is this a
thing you could point at?", which is the concreteness feature of the difficulty
model. The field was renamed rather than left named after a feature that no
longer exists.

## Three numbers that are not the same number

This is the distinction the whole schema exists to protect.

| Field | Question it answers | Source |
| --- | --- | --- |
| `frequency` | How often does Korean actually say this? | two OpenSubtitles corpora, measured |
| `difficulty_level` | How hard is this word to *learn*? | `scripts/content/difficulty.py` |
| `letters_ready_after` | Can I write it with the letters I know? | `scripts/content/readiness.py` |

They disagree constantly — 맛있다 is an easy, useful word spelled with a late
letter — and collapsing any two of them is the mistake this schema exists to
avoid.

**None of them is a TOPIK grade.** TOPIK is not represented in this product.

### Frequency is measured, never defaulted

Two corpora (OpenSubtitles 2018: 688,129 tokens; 2016: 299,195) are read in full
and matched against each word's conjugated surface forms. **100% of the shipping
corpus has corpus evidence**; a word neither corpus saw would be recorded as
`observed: false` with no rank and no rate rather than given a plausible
midpoint, and the one word that turned out to be genuinely unobservable (갉다,
which modern Korean only writes inside 갉아먹다) was cut rather than shipped with
an invented number.

The known limit of the measurement — the corpora are not lemmatised — is written
down in `scripts/content/frequency.py` rather than smoothed away.

### Difficulty is one model, in one language

Nine declared features with declared weights, in Python, binned into eight levels
of roughly equal size. There used to be a second classifier in TypeScript that
drew the badge, the two could disagree, and that is how 맛있다 — a first-week
word — ended up at level 10. The TypeScript classifier is gone.

**The levels are never shown to a learner.** They order the words inside each
category and nothing else. As of this cycle the app also no longer *explains* a
word's placement: the line that read "Placed here mainly by the letters it is
spelled with" was the ranking engine talking about itself, and it and its eight
translations were removed.

## Categories are what a learner browses

Eighteen of them, every word in exactly one, no "Other":

```
essentials  people  food  animals-nature  home  body-health  places-travel
time-numbers  school-work  money-shopping  communication  feelings  thinking
movement  actions  describing  how-when  society
```

`how-when` is new this cycle and is a split rather than an addition.
*Describing Things* had grown to 381 words, and the problem was kind rather than
size: it held 예쁘다 and 크다, which describe a thing, next to 그러나, 어쨌든 and
만약, which describe nothing at all. Nothing was split to even out the numbers —
*Money & Shopping* has 42 words and stays as it is.

Classification is by rule, in order, first match wins: an explicit override, a
meaning-text rule, a mapped Wiktionary topic, then the part of speech as a floor.
The rules outrank the topics, and it took a bug to learn why: Wiktionary files
병원 under "Buildings", which is true and useless to somebody looking for
"hospital".

## Every sentence passes a quality gate

`npm run examples:qa` is a release blocker and is described in full in §22 of
`report.md`. In outline: the sense taught must be the sense demonstrated, the
target must genuinely appear, the supporting vocabulary must be common Korean,
the register must be the one the product teaches, and no sentence shape may be
shared by more than 1% of the corpus.

**3,221 / 3,221 PASS.**

## Pronunciation

`scripts/content/pronunciation.py` computes how each word is actually said and,
where that differs from how it is written, which of five patterns caused it —
tensing, aspiration, nasalisation, lateralisation, palatalisation. 503 words
carry a note; the rest carry none, which is what makes the ones that do worth
reading. Liaison is not a note of its own: it applies to most multi-syllable
words with a final consonant, and flagging it individually would put a panel on
half the vocabulary. It is taught once, in the sound-change lesson.

### What the notes said before this cycle, and why it was wrong

The transcription applied the boundary rules and stopped there, so 121 of the
notes showed a spelling nobody says:

| Word | Was | Is | Why |
| --- | --- | --- | --- |
| 있다 | 있따 | 읻따 | a 받침 has one of seven sounds, and ㅆ is not one of them |
| 늦다 | 늦따 | 늗따 | the same, with ㅈ |
| 맛있다 | 맛있따 | 마싣따 | the ㅅ moves onto the next syllable before anything else happens |
| 갉아먹다 | 갉아먹따 | 갈가먹따 | the same, from a two-letter 받침 |
| 갇히다 | 가티다 | 가치다 | ㄷ + 히 aspirates *and then* palatalises — two rules, and only one was run |

Each of those was on a word card, under a heading that says "this is how it
sounds", asking a beginner to make a sound Korean does not have — on the screen
immediately after the one that taught them 받침 has seven sounds.

Three rules now finish the transcription, in the order Korean applies them:
tensing (which reads the 받침 as written, because that is what conditions it),
then liaison, then neutralisation of whatever is still sitting in a 받침.

Two rules need to know where the *morphemes* divide, which a string of syllables
does not record. A 받침 neutralises before a following word but not before an
ending — 맛없다 is [마덥따] where 맛있다 is [마싣따] — and a compound inserts an ㄴ
before 이/야/여/요/유: 나뭇잎 is [나문닙], 큰일 is [큰닐], 별일 is [별릴]. Deriving
those needs a morpheme dictionary for a five-word problem, so the five are named
in `_IRREGULAR` and `npm run audio:pronunciation` walks every word that could
possibly need to join them.

## No handwriting, either

Vocabulary is never handwritten anywhere in this product — see
`docs/ARCHITECTURE.md`. It is worth stating in the *data* document as well
because the rule has a data consequence: nothing in the pack, and nothing in the
built dataset, exists to support a writing exercise. A word's syllables are still
derived, because the search and the option generators use them; nothing grades
them.

## No illustrations

There were 2,504, drawn in a house style by a compositor in this repository.
They were removed this cycle, along with the drawing library, the build step, the
component, the manifest and the coverage row.

A picture gives a word's meaning away before any Korean has been read, which
makes the word feel learned without any reading having happened. What replaced it
is the sentence.

## Rebuilding

```bash
npm run content:fetch        # downloads the corpus and the dictionary pages
npm run content:vocabulary   # builds the dataset from the pack
npm run content:qa           # translation and pack quality
npm run examples:qa          # example-sentence teaching quality
npm run content:corpus       # splits the pack into the bands the app fetches
npm run audio:plan           # lists everything that needs saying — reads the *bands*, so it must run after content:corpus
npm run audio:build          # generates it, both voices
npm run audio:qa             # checks what came back
npm run content:coverage     # the completeness matrix

npm run vocabulary:relations:fetch   # dictionary pages for the relation set
npm run vocabulary:relations         # builds the synonym/antonym set
npm run vocabulary:relations:qa      # gates every relation the app can show
```

The fetch is separate from the build on purpose: fetching hits somebody else's
servers and takes minutes, while the build is a pure function over what was
fetched. That split is what lets the curriculum be re-tuned twenty times without
re-fetching anything.

## Synonyms and antonyms

Word Detail carries two relation sections, 유의어 and 반의어, and it carries them
only where a dictionary states the relation for the sense this app teaches. 242
of 3,221 words have one. The other 2,969 show no relation section at all.

That is a replacement rather than a refinement. The screen used to end with a
section headed *비슷한 낱말* — "words like this" — whose contents were computed:
the four words nearest this one in the same category, ordered by difficulty. It
was not a dictionary claim and it did not read as one. Under 고기 it printed
사과, 음식, 먹다 and 우유 — four words off the food shelf, under a heading saying
they were alike. Nothing in the build could fail on it, because there was
nothing to fail: the data was internally consistent and untrue.

The rules the replacement runs under, all enforced by
`npm run vocabulary:relations:qa`:

* the relation is **stated by the dictionary**, as that relation — never derived
  from a category, a frequency band, an embedding, a shared example sentence, or
  co-occurrence;
* it is **typed** as a synonym or an antonym; there is no third, vaguer kind.
  Compounds, derived forms, broader and narrower terms are all real lexical
  relations and none of them is shown, because collapsing them into one list is
  how the old section went wrong;
* it is scoped to the **part of speech and the primary sense** this app teaches,
  so a synonym of 밤-the-chestnut cannot appear under 밤-the-night;
* it is **stated from both ends** — 남자 lists 여자 and 여자 lists 남자. A
  one-sided entry usually means the relation belongs to a sense the target does
  not share, and the target's own page is the cheapest way to find that out;
* both words **ship in this corpus**, so every relation on the screen opens;
* an empty relation set renders **no section**, never an empty one and never a
  substitute list of neighbours.

### Why not NAVER

The product brief names the NAVER Korean dictionary, and on the merits it is the
right reference — it is the dictionary a Korean learner is told to use. It is not
one this pipeline can read. `ko.dict.naver.com` answers every request from the
build environment with its own service-unavailable page, there is no published
relation API, and its terms do not grant redistribution of extracted relation
metadata. A source a build step cannot reach is not a source.

The Korean Wiktionary publishes the same two relations as explicit typed
metadata — `*유의어:` and `*반의어:` lines under the Korean section — under
CC BY-SA 4.0, the licence this project already carries for part-of-speech data.
Only the relation type and the target headword are taken. No definitions are
copied.

## What is not here

The National Institute of Korean Language's 한국어기초사전 is the better *learner*
dictionary — CC-licensed, with graded vocabulary lists — and it remains the
source to move to. Its bulk data needs an issued API key, which this environment
does not have. It would be a build-time import, not a runtime call: nothing in
this product reaches a network while a learner is using it.
