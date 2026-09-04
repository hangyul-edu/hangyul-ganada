# Content sources and licences

**Hangyul ganada** · version 1.0.3

Everything in this app was either written for it or comes from a source named
below. This page exists because some of those licences require attribution, and
because a learner being asked to trust the Korean in a paid app is entitled to
see where it came from.

## The learning content

| Source | Licence | What it provides |
| --- | --- | --- |
| English Wiktionary | CC BY-SA 4.0 | Part of speech and topic categories |
| OpenSubtitles 2018 Korean frequency list (hermitdave/FrequencyWords) | MIT (list) / CC BY-SA (underlying OPUS corpus) | Corpus token frequency, used to rank how often a word occurs |
| Microsoft Azure Neural TTS (ko-KR-SunHiNeural, ko-KR-InJoonNeural) | Microsoft Azure Cognitive Services terms | Pre-generated Korean pronunciation audio, female and male |
| Hangyul ganada | Proprietary | Teaching order, difficulty rating, romanisation, pronunciation notes, syllable and letter analysis, and every meaning, example sentence and translation in the app |

The full method — how the corpus was assembled, how 2,581 words came
to ship out of the candidates reviewed, and why 328 were removed with a written
reason each — is in `content/vocabulary/METHODOLOGY.md` in the source
repository.

### Where the meanings, sentences and translations came from

They were written for this app. The English meanings are not dictionary glosses:
a gloss is written for someone who already knows the word and wants its senses
listed, and every one that read like one was rewritten before it could ship —
`scripts/content/gloss.py` refuses to build a word whose English meaning is still
a dictionary entry.

The example sentences are written for beginners and every one of them passes an
automated teaching-quality gate before it ships. The sense must be the sense
being taught, the target word must actually appear, the supporting vocabulary
must be common Korean, and no sentence may be a template dropped over hundreds of
words. See `scripts/content/examples_qa.py`.

## Typefaces

The practice typefaces are used under the licences below. No font is bundled
that was found on a computer or downloaded from a site that does not state its
licence, and every one's glyph coverage is verified on each build
(`npm run fonts:audit:strict`).

* **OFL 1.1**

Families: 

## Audio

The 5,275 recorded utterances — every letter, syllable, word and example
sentence, in two Korean voices — are synthesised speech, generated ahead of time
and packaged with the app. They are not recordings of a person.

## Illustrations

There are none. Vocabulary imagery was removed from the product: a picture gives
a word's meaning away before any Korean has been read, which makes the word feel
learned without any reading having happened. The only artwork in the app is its
own brand mark and mascot.

## What is not listed here

Sources whose licence asks for nothing. That is a deliberate line rather than an
omission: this is a legal notice, and padding a legal notice with entries that do
not belong in it is how people stop reading legal notices. Every word in the app
still carries its full source record in the build, and the coverage gate refuses
to ship a word without one.

## Not an official grading

The teaching order, the difficulty ratings and the categories are this product's
own. None of them is a TOPIK grade, a dictionary level, or an assessment
recognised by any examining body, and nothing in the app implies otherwise.
