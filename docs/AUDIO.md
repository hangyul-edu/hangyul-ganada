# Pronunciation audio

## Why it is generated at build time

Hangyul ganada is bought once. A runtime text-to-speech call is a cost that
recurs every time any learner taps any speaker button, forever, against revenue
that was collected once — and it makes the core of the product fail when the
network does.

The curriculum is finite, so the audio is finite. **3,382 utterances × 2 voices
= 10,550 files, 53.0 MB**, generated ahead of time, loudness-normalised, and
shipped with the app. Nothing is synthesised at runtime and no request leaves
the device to make a sound.

## What is spoken, and why it is not just the codepoint

| Kind | Count | What it is |
| --- | --- | --- |
| `letter_name` | 40 | The letter's Korean name — 기역 for ㄱ |
| `letter_sound` | 39 | The letter's *sound*, as a syllable — 가 for ㄱ |
| `syllable` | 33 | The blocks the curriculum teaches |
| `word` | 2,581 | Every vocabulary entry |
| `sentence` | 438 | Example sentences, plus the voice-picker sample |

The first two rows are the reason this is not a one-line script. **ㄱ has a name
and a sound, and they are different utterances.** Reading the bare codepoint
ㄱ through a speech engine says 기역, which is not what a learner sounding out
가 needs to hear — a learner told only the name will read 가 as "giyeok-a".

So every letter carries `letter_name` and `sound_example` in the curriculum
data, the lesson shows two labelled speaker buttons, and each plays what its
label says. Vowels are the easy case: a vowel's name *is* its sound, so the
intro shows one row rather than the same word twice under two headings.

## Ids are ASCII, and derived

A clip's id is `sound_` / `syl_` / `word_` / `ex_` plus the hex codepoints of
the text. Never the Korean itself: Korean in a path survives a POSIX filesystem
and then breaks on a zip round-trip, a CDN that normalises Unicode, or an
Android asset packer — and the failure looks like "audio randomly missing for
some words".

The ids are computed, not stored, by the same rule in three places
(`characters.ts`, `vocabulary.ts`, `export-speech-plan.mjs`). One recording is
made per distinct utterance and shared by every id that says it, which is how
45 clips that would otherwise be byte-identical duplicates do not exist.

## Providers

`scripts/content/tts.py` is an interface with three implementations, chosen by
`HANGYUL_TTS_PROVIDER`:

| Value | Voices | Credential |
| --- | --- | --- |
| `edge` (default) | `ko-KR-SunHiNeural`, `ko-KR-InJoonNeural` | none |
| `azure` | the same two voices | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| `google` | `ko-KR-Neural2-A`, `ko-KR-Neural2-C` | `GOOGLE_TTS_API_KEY` |

The committed assets were generated with `edge` — Microsoft's neural ko-KR
voices through the `edge-tts` client, which needs no credential.

**For a commercial release, regenerate with `HANGYUL_TTS_PROVIDER=azure`.** Same
voices, same output, but a paid Azure Speech subscription is the licence that
covers redistributing synthesised audio inside a product. That is a
one-command, one-credential step and it is the single external dependency this
pipeline has:

```bash
AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=… npm run audio:build -- --force
npm run audio:qa
```

No secret is read from the repository and no key is written to the manifest. The
manifest records *which voice* spoke, which QA needs and a customer may
reasonably be told.

## Speaking rate

Every clip is spoken at **0.82× a native pace** — `SPEECH_RATE` in
`scripts/content/tts.py`, one number that every provider derives its own
parameter from, so the two voices can never drift apart.

The slowdown is asked of the *speech engine*, not applied to the waveform
afterwards. `rate="-18%"` for edge-tts, `<prosody rate="-18%">` for Azure,
`speakingRate: 0.82` for Google: a neural voice given that re-times the
utterance the way a person speaking carefully does — longer vowels, longer gaps
between syllables, pitch and formants untouched. An `atempo` filter over the
finished audio would stretch everything uniformly and sound like a slowed tape,
which is the difference between "clear" and "wrong".

Why 0.82 and not 0.85: the target band is 0.80–0.85 for a beginner, and the
complaint the setting answers was that the clips were too fast, so the middle of
the band is the safer side to land on. The measured result also runs a shade
quicker than the number asks for, because silence is trimmed off both ends after
synthesis and that trimmed padding never scaled — 0.85 measures out at about
0.86×, just outside the band, where 0.82 measures at 0.83×. Verified by
comparing every clip's duration against the previous full-speed build: median
duration ratio 1.205, female 0.829× and male 0.833×.

`qa_audio.py` reads the rate back out of the manifest and fails if it disagrees
with `SPEECH_RATE`, so a manifest generated before a rate change is obvious
rather than merely wrong. Its duration bounds are stated at conversational pace
and divided by the rate, so slowing the voices down does not quietly widen the
"too short" test into uselessness.

## Encoding

24 kHz mono MP3 at 32 kbit/s, normalised to EBU R128 −16 LUFS with a −1.5 dBTP
ceiling, silence trimmed from both ends.

Speech, not music: above about 32 kbit/s at this sample rate a listener cannot
tell the difference, and the difference is the whole download — two voices
across a three-thousand-word curriculum is where an app's size goes. The
loudness target means a learner is not reaching for the volume control between a
letter and a word. The silence trim matters more than it sounds: synthesised
speech arrives with a quarter-second of nothing at the front, and on a speaker
button that reads as lag.

## QA, in three layers that are not the same thing

The build that shipped before this cycle passed its audio QA with zero errors
and shipped the male voice reading **마디** as [마지]. The check was not broken;
it was answering a different question from the one anybody assumed it answered.
So the three questions are now separated, named, and claimed only as far as they
go.

| Layer | Question | How | Gates the release |
| --- | --- | --- | --- |
| A. Asset integrity | Is this a real, well-formed recording? | `npm run audio:qa` | yes |
| B. Utterance mapping | Is it filed under the right item, synthesised from exactly the text that item displays, and does its pronunciation note match? | `npm run audio:pronunciation` | yes |
| C. Linguistic pronunciation | Does it *sound* like correct Korean? | `npm run audio:listen`, plus a person | fixtures only |

Only A and B are proofs. C is a screen: it runs a speech recogniser over the
clips and reports the ones whose transcript disagrees with the word. A
recogniser is not a Korean teacher — it mishears isolated words, it writes
homophones, and it normalises tense consonants away — so a disagreement is
something to listen to, never a verdict. What it *does* gate is the fixture set
in `qa_pronunciation.py`: a curated list of words whose correct spoken form is
written down, including every word ever found wrong. 마디 is in it permanently.

### A. Asset integrity

`npm run audio:qa` checks all 10,550 voice slots, which is 10,454 distinct files — a
shared recording is checked under each id that points at it:

* it exists, is not empty, and actually decodes;
* its duration is plausible for the number of syllables it should contain;
* it is not silent, and its loudness landed near the target;
* the female and male clips of the same text are genuinely different audio;
* two ids sharing one recording are **homophones** — 있다, 잇다 and 잊다 are all
  said [itda], so one recording for all three is correct, while two
  different-sounding texts on one file means an id collided upstream;
* the manifest says the same text the speech plan asked for;
* every planned clip has both voices.

Synthesis fails quietly, which is why this exists. A provider under load returns
a valid MP3 containing silence; a retry loop writes the same clip twice under
two voice names; a truncated download still has an ID3 header. None of that is
visible in a directory listing, and all of it reaches a paying customer as "the
speaker button does nothing".

What it cannot see is whether the sounds in the file are the right sounds. Every
one of those checks passed on the 마디 clip.

### B. Utterance mapping

`npm run audio:pronunciation` walks the curriculum rather than the directory,
and checks the chain end to end for every word:

```
the word on screen → its derived clip id → the speech plan's text
                   → the manifest entry → the file on disk
```

It fails on: an id that does not derive from its own text; a plan and a manifest
that disagree; one file serving two different texts; a voice missing; a
pronunciation note that the sound-change rules do not produce; a note identical
to the spelling; an example clip belonging to another word. It also refuses a
word whose synthesis text is anything other than the spelling the learner is
looking at — the engine is never handed a respelling.

Two more things it holds:

* **Compound boundaries.** Two Korean rules need to know where morphemes divide,
  which a string of syllables does not record: a 받침 neutralises before a
  following *word* but not before an *ending* (맛없다 is [마덥따]), and a compound
  inserts an ㄴ before 이/야/여/요/유 (나뭇잎 is [나문닙]). The five words in this
  vocabulary where that changes the answer are listed in `pronunciation.py`, and
  the check walks every word that could possibly need to be there.
* **Delivery.** A clip is named after the word it says, so a corrected recording
  arrives under the broken one's name. The service worker's audio cache is keyed
  to the audio build's version and the web build stamps it, so a fix cannot be
  answered out of an old cache. The check fails if that stamp is missing or
  stale.

### C. Listening

```
npm run audio:listen                      # the whole word corpus, both voices
npm run audio:listen:fixtures             # the curated set — this one gates
```

Needs `faster-whisper` and an offline model, and neither is a build dependency:
the deterministic layers run on a machine that has neither. Clips are packed
into 30-second windows and cut back apart on the recogniser's word timings,
because whisper costs the same for a 600 ms word as for thirty of them.

A transcript counts as agreement if it matches the spelling, the spoken form, or
either of those after tense consonants are folded onto their plain partners, an
inaudible 받침 ㅎ is dropped, and the three sets of vowels modern Korean has
merged are folded together — and a transcript that is a *homophone* of the word
also counts, because 같다 and 갔다 are both [갇따] and a recogniser picking the
wrong spelling of the right sounds is not a defect.

### From a disagreement to a decision

A raw screen over five thousand clips produces a few hundred disagreements, and
reading them in the order they happened is how a screen gets abandoned. Two
steps turn them into a queue:

```
qa_pronunciation.py --listen   →  triage_listening.py  →  adjudicate_listening.py
   what disagreed                  what kind of              which of the three
                                   disagreement it is        causes it actually is
```

**Triage** re-applies the current acceptability rules — so tightening a rule does
not mean re-running hours of compute — and groups what is left by *where* the
difference is. The slot matters more than the letter: a coda is barely released
and Korean neutralises seven of them into three sounds, so a recogniser swapping
one for another says almost nothing, while an **onset** consonant is fully
articulated and is the position 마디 was wrong in. It also marks words flagged in
only one of the two voices, which is the shape the 마디 defect had.

**Adjudication** then measures three things per finding: it re-listens with the
larger model and with known-good clips packed around the flagged one; it
re-synthesises the text and compares it to the file, which settles whether the
file is that text at all; and it measures how far apart the expected word and
the heard word are *in each voice*. That last number is the closest thing to a
machine signal for an engine that mispronounces: the male voice renders 마디 and
마지 0.029 apart where the female voice renders the same pair 0.073 apart. It is
also what clears the false alarms — 년 heard as 면 looks alarming until the two
are measured 0.019 apart in that voice, which means the recogniser was guessing
between two things that genuinely sound alike.

Findings that survive all three are the 마디 class, and they are handed to a
person in order of how badly the voice separates them. Nothing in this pipeline
decides that a recording sounds wrong. An engine compared against itself cannot
hear its own mistake.

### What the layers found

Four recordings and five notes, out of 5,162 word clips listened to and 1,006
note-to-recording measurements:

| Recording | Should be | Was |
| --- | --- | --- |
| 마디 (male) | [마디] | [마지] |
| 닿다 (both) | [다타] | [닫따] — the word 닫다 |
| 젊다 (both) | [점따] | [절따] |
| 옮다 (both) | [옴따] | [옴다] |

| Note | Said | Says now |
| --- | --- | --- |
| 밟다 | 발따 | 밥따 |
| 옮기다 | 옴끼다 | 옴기다 |
| 굶주리다 | 굼쭈리다 | 굼주리다 |
| 맛있다 | 마싣따 | 마딛따 |
| 멋있다 | 머싣따 | 머딛따 |

The first of them is the one a customer found, and it is worth the detail
because everything else in this file was built to find the others.

The male voice reads the isolated word **마디** as [마지]. That is a real Korean
rule — ㄷ before 이 palatalises — applied to a word it does not apply to, because
마디 is one morpheme and the rule crosses morpheme boundaries: 굳이 is [구지],
마디 is [마디]. It reproduced at every speaking rate, and no respelling fixed it
without breaking the prosody. Every other 디 word in the curriculum — 어디,
라디오, 비디오, 드디어, 견디다, 디디다 — was correct from the same voice, so it is
one lexicon entry rather than a rule.

The repair is in the pipeline, not in the file: `scripts/content/speech_repairs.py`
records the word, the voice, the reason, and what was heard before and after,
and the build synthesises that one clip with the provider's alternate male
voice. Every provider defines one. A repaired word must also be a permanent
fixture, which is what stops a later voice change from quietly undoing it.

## At runtime

One `PronunciationPlayer` for the whole app. Not because a singleton is elegant,
but because each screen creating its own `Audio` produces the three bugs that
make an audio feature feel cheap: two clips playing over each other, a clip that
keeps playing after the learner navigates away, and a first tap that does
nothing while the browser opens a decoder.

* **Preloading.** A lesson warms the next three items' clips while the learner
  is still on the current one. Never the whole curriculum — prefetching two
  thousand files to save a hundred milliseconds is how an app earns a reputation
  for eating data.
* **A missing clip is not a missing feature.** If the chosen voice has no file
  for an item, the other voice plays and the substitution is reported. Audible
  Korean in the wrong voice beats silence.
* **A blocked autoplay is not an error.** Browsers refuse playback the learner
  did not initiate; the button beside the glyph is always the real way in.
* **A missing manifest disables audio and nothing else.** Every caller already
  handles `missing`, so the lesson still runs.
