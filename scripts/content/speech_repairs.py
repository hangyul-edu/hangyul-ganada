"""Words a voice says wrongly, and what is done about them.

## Why a file like this has to exist

The audio is synthesised, and a neural voice is a model with a lexicon. Most of
that lexicon is excellent and some of it is wrong, and when it is wrong it is
wrong *confidently*: a clean, well-formed, correctly-mapped recording of the
wrong word. No amount of checking files finds that, which is why the check that
does find it listens (`qa_pronunciation.py --listen`).

The entry that started it is no longer here, and the reason is worth reading
before adding one. Microsoft's male voice read the isolated word **마디** as
[마지] — a real Korean rule (ㄷ before 이 palatalises) applied to a word it does
not apply to, because 마디 is a single morpheme and the rule only crosses a
morpheme boundary. When the product changed synthesis engines, that repair was
**re-tested rather than carried across**: the unrepaired spelling was
synthesised with the new voice and came back 마디. The defect belonged to the old
model, so the repair was deleted.

That is the rule for this file. A repair is evidence about *a specific voice*,
and when the voice changes every entry has to earn its place again. The four
words below did — synthesised unrepaired on the current voices, the recogniser
returned 나다 and 닥터 for 닿다, 정답 for 젊다 in both voices, and nothing
readable for 옮다.

## What a repair is allowed to be

Two things, in this order of preference:

1. **A different voice of the same gender.** The learner hears correct Korean in
   a voice of the gender they chose. This is what 마디 needed: no respelling
   produced a correct reading from the original voice, because the ones that
   did — 마 디 with a space, 마디? with a question mark — fixed the phoneme by
   breaking the prosody, and a vocabulary card that reads its word as a question
   is a different defect.
2. **Different text handed to the engine**, where a respelling is genuinely the
   same utterance. Nothing needs this yet, and the field exists so that the day
   something does, it is recorded rather than hidden in a build script.

## What a repair may never be

A hand-edited MP3. The pipeline has to produce the correct clip, or the next
build undoes the fix and nobody notices until a customer does.

## The evidence

Every entry records what was heard before and after, from the recogniser screen.
`qa_pronunciation.check_repairs` fails the build if an entry has no reason or no
evidence, and if the repaired word is not also a permanent fixture — which is
what stops a future voice change from quietly reintroducing the defect.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Repair:
    """One word, one voice, and the correction applied when it is synthesised."""

    #: Why this word needs help. Written for whoever reads it in two years.
    reason: str
    #: What the recogniser heard from the default voice.
    heard_before: str
    #: What it heard after the repair.
    heard_after: str
    #: Use the provider's alternate voice of the same gender.
    use_alternate_voice: bool = False
    #: Hand this text to the engine instead. The *displayed* word never changes.
    text_override: str | None = None


def _cluster(word: str, spoken: str, heard: str, distances: str) -> Repair:
    """One of the two ㄻ words both voices get wrong. Same shape, same evidence."""
    return Repair(
        reason=(
            f"Both shipping voices misread the ㄻ cluster of {word}: the recording measures as "
            f"[{heard}] rather than [{spoken}] ({distances}). The cluster itself is not the "
            "problem — 삶다, 닮다, 굶다 and 젊은이 are all correct from the same voices — so this "
            f"is a lexicon entry. The engine is handed the spoken form [{spoken}] instead of "
            "the spelling; the word on the card, its id and its file are unchanged."
        ),
        heard_before=heard,
        heard_after=spoken,
        text_override=spoken,
    )


# 마디 was the first entry in this table and it is no longer here.
#
# ko-KR-InJoonNeural — Microsoft's male voice, which this product no longer uses
# — palatalised the 디 of the isolated word 마디 and said [마지]. That is a real
# Korean rule (굳이 → 구지) applied to a word it does not apply to, because 마디
# is a single morpheme and the rule only crosses a morpheme boundary. The repair
# was to synthesise it with the other male voice.
#
# The voices changed, so the repair was re-tested rather than carried over. The
# *unrepaired* spelling was synthesised with the shipping ElevenLabs male voice
# and put through the same recogniser: it came back **마디**, exactly. The defect
# was in the retired model's lexicon and does not exist in this one.
#
# It is deleted rather than left in place as a no-op. These voices have no
# alternate — see `ElevenLabsProvider` — so `use_alternate_voice` would have
# selected the same voice and changed nothing, while the manifest went on
# telling a reader that the product corrects a mispronunciation it does not
# have. 마디 stays a permanent fixture in `qa_pronunciation.py`, which is what
# catches the defect if a future voice change reintroduces it.
REPAIRS: dict[tuple[str, str], Repair] = {
    # 젊다 is [점:따]; both voices said [절따] — the cluster read as ㄹ.
    ("젊다", "female"): _cluster("젊다", "점따", "절따", "0.002 from 절따, 0.037 from 점따"),
    ("젊다", "male"): _cluster("젊다", "점따", "절따", "0.002 from 절따, 0.041 from 점따"),
    # 옮다 is [옴:따]; both voices said [옴다] — the cluster right, the tensing missing.
    ("옮다", "female"): _cluster("옮다", "옴따", "옴다", "0.004 from 옴다, 0.098 from 옴따"),
    ("옮다", "male"): _cluster("옮다", "옴따", "옴다", "0.006 from 옴다, 0.085 from 옴따"),
    # 닿다 is [다:타]. Both voices said [닫따], which is not a mispronunciation of
    # 닿다 — it is the word 닫다, "to close". The ㅎ never aspirated the ㄷ; it was
    # neutralised into one instead. Its whole family is correct from the same
    # voices (낳다 → 나타 at 0.001, 넣다 → 너타 at 0.002, 쌓다 → 싸타 at 0.001),
    # which is what makes this a lexicon entry rather than a rule.
    ("닿다", "female"): Repair(
        reason=(
            "Both shipping voices read 닿다 as something other than [다타]. "
            "Measured 0.0005 from a rendering of 닫따 and 0.0430 from one of 다타 on the "
            "previous engine; re-tested unrepaired on the current voices, where the "
            "recogniser heard 나다. The rest of the ㅎ-final family (낳다, 넣다, 쌓다) is "
            "correct from the same voices, which is what makes this a lexicon entry."
        ),
        heard_before="닫따",
        heard_after="다타",
        text_override="다타",
    ),
    ("닿다", "male"): Repair(
        reason=(
            "The same defect in the male voice: 0.0007 from 닫따, 0.0287 from 다타 on the "
            "previous engine, and 닥터 from the current one, unrepaired."
        ),
        heard_before="닫따",
        heard_after="다타",
        text_override="다타",
    ),
}


def repair_for(text: str, voice: str) -> Repair | None:
    return REPAIRS.get((text, voice))
