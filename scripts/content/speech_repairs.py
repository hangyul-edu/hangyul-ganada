"""Words a voice says wrongly, and what is done about them.

## Why a file like this has to exist

The audio is synthesised, and a neural voice is a model with a lexicon. Most of
that lexicon is excellent and some of it is wrong, and when it is wrong it is
wrong *confidently*: a clean, well-formed, correctly-mapped recording of the
wrong word. No amount of checking files finds that, which is why the check that
does find it listens (`qa_pronunciation.py --listen`).

The first entry here is the one that started it. The male voice reads the
isolated word **마디** as [마지]. That is a real Korean rule — ㄷ before 이
palatalises — applied to a word it does not apply to, because 마디 is a single
morpheme and the rule only crosses a morpheme boundary. 굳이 is [구지]; 마디 is
[마디]. Every other 디 word in this vocabulary — 어디, 라디오, 비디오, 드디어,
견디다, 디디다 — came back correct from the same voice, so the fault is one
lexicon entry rather than a systematic rule.

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
            f"Both ko-KR voices misread the ㄻ cluster of {word}: the recording measures as "
            f"[{heard}] rather than [{spoken}] ({distances}). The cluster itself is not the "
            "problem — 삶다, 닮다, 굶다 and 젊은이 are all correct from the same voices — so this "
            f"is a lexicon entry. The engine is handed the spoken form [{spoken}] instead of "
            "the spelling; the word on the card, its id and its file are unchanged."
        ),
        heard_before=heard,
        heard_after=spoken,
        text_override=spoken,
    )


REPAIRS: dict[tuple[str, str], Repair] = {
    ("마디", "male"): Repair(
        reason=(
            "ko-KR-InJoonNeural palatalises the 디 of the isolated word 마디 and says "
            "[마지]. Korean palatalisation applies across a morpheme boundary (굳이 → "
            "구지) and not inside one, so 마디 is [마디]. Reproduced at every speaking "
            "rate from +0% to -25%; the other 디 words in the curriculum are correct "
            "from the same voice, so this is one lexicon entry rather than a rule. "
            "ko-KR-HyunsuMultilingualNeural reads it correctly."
        ),
        heard_before="마지",
        heard_after="마디",
        use_alternate_voice=True,
    ),
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
            "Both ko-KR voices read 닿다 as [닫따] — the word 닫다 — instead of [다타]. "
            "Measured 0.0005 from a rendering of 닫따 and 0.0430 from one of 다타; the rest "
            "of the ㅎ-final family (낳다, 넣다, 쌓다) is correct from the same voices."
        ),
        heard_before="닫따",
        heard_after="다타",
        text_override="다타",
    ),
    ("닿다", "male"): Repair(
        reason=(
            "The same defect in the male voice: 0.0007 from 닫따, 0.0287 from 다타."
        ),
        heard_before="닫따",
        heard_after="다타",
        text_override="다타",
    ),
}


def repair_for(text: str, voice: str) -> Repair | None:
    return REPAIRS.get((text, voice))
