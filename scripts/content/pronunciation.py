"""Where a Korean word is not said the way it is spelled, and why.

Korean spelling is morphophonemic: it writes the *pieces* a word is made of and
leaves the reader to apply the sound changes that happen where those pieces
meet. 학교 is written with ㄱ and said with ㄲ. 좋다 is written with ㅎ+ㄷ and
said 조타. 한국어 is written in three blocks and said in three different ones.

A beginner reading 학교 aloud as *hak-gyo* is doing exactly what they were
taught and getting it wrong, and no amount of listening to the clip tells them
*why* — they will make the same mistake on 학생 and 식당 and every other word
with the same boundary in it. So the app shows a short note, on the words where
it earns its place, and names the pattern rather than the instance.

## What this module produces

For each word: the spelling it is actually pronounced as, and which of a closed
list of patterns caused the difference. Nothing else — the *explanation* is
copy, lives in the translation bundles, and is written once per pattern in eight
languages rather than once per word.

## What it deliberately does not produce

A note for every word. Liaison alone — the 받침 sliding onto the next syllable's
empty ㅇ — affects most multi-syllable words with a final consonant, and a note
on all of them would be a note nobody reads. See ``NOTEWORTHY``.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from hangul import apply_sound_changes, compose_syllable, decompose, is_syllable  # noqa: E402

#: The patterns the app can explain, in the order they are tested.
#:
#: Each is `(id, description)`. The id is the translation key suffix; the
#: description is for whoever reads this file, not for a learner.
PATTERNS: tuple[tuple[str, str], ...] = (
    ("tensing", "a plain consonant becomes tense after a stop: 학교 → 학꾜"),
    ("aspiration", "ㅎ meets a plain stop and they fuse: 좋다 → 조타"),
    ("nasal", "a stop before ㄴ or ㅁ becomes a nasal: 국물 → 궁물"),
    ("lateral", "ㄴ and ㄹ meeting become ㄹㄹ: 신라 → 실라"),
    ("palatal", "ㄷ or ㅌ before 이 is said ji or chi: 같이 → 가치"),
    ("liaison", "the final consonant moves onto the next syllable: 한국어 → 한구거"),
)

#: Which patterns are worth a note on a word card.
#:
#: Liaison is excluded, and that is the whole editorial judgement in this file.
#: It is real, it is the first thing a Korean teacher explains, and it applies
#: to so many words that flagging it individually would put a panel on half the
#: vocabulary — at which point the panel stops meaning "look at this one" and
#: starts meaning "ignore me". It is taught once, in the sound-change lesson,
#: where it belongs.
NOTEWORTHY = frozenset({"tensing", "aspiration", "nasal", "lateral", "palatal"})

#: Finals that make a following plain consonant tense. 받침 ㄱ/ㄷ/ㅂ and the
#: clusters that reduce to them.
#: ㄵ, ㄻ, ㄾ and ㅀ are here for the verb stems that end in them — 앉다 is
#: [안따], 삶다 is [삼따], 핥다 is [할따]. They are not stops, so this is the
#: morphological tensing rule rather than the phonological one; the closed set
#: of stems it applies to is small enough that including the clusters is right
#: more often than excluding them.
_TENSING_FINALS = frozenset("ㄱㄲㅋㄳㄺㄷㅅㅆㅈㅊㅌㅂㅍㄼㄿㅄㄵㄻㄾㅀ")
_TENSABLE = {"ㄱ": "ㄲ", "ㄷ": "ㄸ", "ㅂ": "ㅃ", "ㅅ": "ㅆ", "ㅈ": "ㅉ"}

#: Clusters that leave a *sonorant* behind, where tensing is a rule about
#: grammar rather than about sound.
#:
#: After ㄱ, ㄷ or ㅂ a following plain consonant tenses because of what the
#: mouth is doing: 학교 is [학꾜] and 읽기 is [익끼], ending or not. After ㄴ, ㅁ
#: or ㄹ nothing forces it, and Korean tenses only across the boundary between a
#: **verb stem and its ending** — 앉다 is [안따], 삶다 is [삼따]. A causative or a
#: compound is not an ending, so 옮기다 is [옴기다] and 굶주리다 is [굼주리다], and
#: this file used to say 옴끼다 and 굼쭈리다 on both of their word cards.
_SONORANT_CLUSTERS = frozenset("ㄵㄻㄼㄾㅀ")

#: The syllables a verb ending starts with. Not a grammar — a list, kept short
#: on purpose, because the alternative is a morphological analyser for a
#: two-word problem. Every affected word in the corpus is checked against it by
#: `qa_pronunciation.py`.
_ENDING_SYLLABLES = frozenset("다지고게자소습더도든네니구")

#: What a two-letter final is actually said as when a consonant follows it.
_CLUSTER_SIMPLIFIED = {
    "ㄳ": "ㄱ", "ㄵ": "ㄴ", "ㄶ": "ㄴ", "ㄺ": "ㄱ", "ㄻ": "ㅁ",
    "ㄼ": "ㄹ", "ㄽ": "ㄹ", "ㄾ": "ㄹ", "ㄿ": "ㅂ", "ㅀ": "ㄹ", "ㅄ": "ㅂ",
}

#: 평파열음화 — the seven sounds a 받침 can actually have.
#:
#: A syllable-final consonant that is still a syllable-final consonant after
#: everything else has run is released as one of ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅇ, and this is
#: the letter that survives. 늦다 is [늗따] and not [늦따]: there is no such
#: sound as a released ㅈ at the end of a Korean syllable, and writing one in a
#: pronunciation note asks a beginner to make a sound that does not exist —
#: on the very screen that has just taught them the seven-sound rule.
_NEUTRALISED = {
    "ㄲ": "ㄱ", "ㅋ": "ㄱ", "ㄳ": "ㄱ", "ㄺ": "ㄱ",
    "ㅅ": "ㄷ", "ㅆ": "ㄷ", "ㅈ": "ㄷ", "ㅊ": "ㄷ", "ㅌ": "ㄷ", "ㅎ": "ㄷ",
    "ㅍ": "ㅂ", "ㅄ": "ㅂ", "ㄿ": "ㅂ",
    "ㄵ": "ㄴ", "ㄶ": "ㄴ", "ㄻ": "ㅁ",
    "ㄼ": "ㄹ", "ㄽ": "ㄹ", "ㄾ": "ㄹ", "ㅀ": "ㄹ",
}

#: A two-letter final meeting a vowel: which letter stays behind, and which one
#: moves onto the next syllable. 앉아 is [안자] — the ㄴ stays and the ㅈ moves.
#: The moved ㅅ of ㄳ, ㄽ and ㅄ arrives tense: 값이 is [갑씨], not [갑시].
#:
#: ㄶ and ㅀ are the two that leave nothing behind, because the letter that
#: would stay is the one that moves: the ㅎ is simply not pronounced before a
#: vowel, so 많아 is [마나] and 싫어 is [시러].
_CLUSTER_LIAISON = {
    "ㄳ": ("ㄱ", "ㅆ"), "ㄵ": ("ㄴ", "ㅈ"), "ㄶ": (None, "ㄴ"),
    "ㄺ": ("ㄹ", "ㄱ"), "ㄻ": ("ㄹ", "ㅁ"), "ㄼ": ("ㄹ", "ㅂ"),
    "ㄽ": ("ㄹ", "ㅆ"), "ㄾ": ("ㄹ", "ㅌ"), "ㄿ": ("ㄹ", "ㅍ"),
    "ㅀ": (None, "ㄹ"), "ㅄ": ("ㅂ", "ㅆ"),
}


#: Words the rules above get wrong, and what they actually sound like.
#:
#: Every one of them is a **compound**, and that is the whole reason: the rules
#: in this file work on syllable boundaries, and Korean's remaining two
#: transcription rules work on *morpheme* boundaries, which a string of
#: syllables does not record.
#:
#: * 맛없다 is [마덥따] and not [마섭따]. Where the vowel that follows begins a
#:   word of its own rather than an ending, the 받침 is neutralised **before**
#:   it moves — 맛 is [맏], and it is the ㄷ that lands on 없. Its near-twin
#:   맛있다 is not here: the standard admits both [마싣따] and [마딛따], and the
#:   first is what people say.
#: * 나뭇잎, 큰일 and 별일 gain an ㄴ that is written nowhere: a compound whose
#:   second half starts 이/야/여/요/유 inserts one, and then the ordinary rules
#:   run on top of it — [나묻닙] → [나문닙], [별닐] → [별릴].
#:
#: Deriving these would need a morpheme dictionary for a five-word problem. The
#: list is short because the vocabulary was searched for every word that could
#: possibly need it: see `qa_pronunciation.py`, which walks the same candidates
#: and fails if one of them is unaccounted for.
_IRREGULAR: dict[str, tuple[str, str | None]] = {
    "맛없다": ("마덥따", "tensing"),
    "끝없다": ("끄덥따", "tensing"),
    "나뭇잎": ("나문닙", "nasal"),
    "큰일": ("큰닐", None),
    "별일": ("별릴", None),
    # 표준발음법 §10, the 밟- exception: a ㄼ before a consonant is said [ㄹ] in
    # every word except this stem, where it is [ㅂ]. 넓다 is [널따] and 밟다 is
    # [밥따], and the rule that gets the first one right gets the second wrong.
    # The shipped recording says [밥따]; the note used to say 발따.
    "밟다": ("밥따", "tensing"),
    # 맛있다 and 멋있다 have two standard pronunciations each. The rules derive
    # the liaison form, 마싣따; the voices both say the neutralised one, 마딛따,
    # which 표준발음법 §15 붙임 allows and which is the older standard. The note
    # is what a learner reads while listening to the clip, so it follows the
    # clip rather than the derivation.
    "맛있다": ("마딛따", "tensing"),
    "멋있다": ("머딛따", "tensing"),
}


def spoken_form(word: str) -> str:
    """The word as it is actually said, written in Hangul.

    Runs the shared sound-change rules and then re-composes syllables, so the
    result is readable Korean rather than a jamo list — which matters, because
    this string is shown to a learner beside the spelling.
    """
    if word in _IRREGULAR:
        return _IRREGULAR[word][0]
    parts = _with_tensing(word)
    out: list[str] = []
    for initial, medial, final in parts:
        if medial is None:
            out.append(initial or "")
            continue
        out.append(compose_syllable(initial, medial, final))
    return "".join(out)


def pattern_of(word: str) -> str | None:
    """Which sound-change pattern this word demonstrates, if any.

    The first one that fires, in `PATTERNS` order — a word can involve two, and
    naming both would be a grammar lesson on a vocabulary card. The order puts
    the patterns a beginner meets earliest first, and liaison last, because a
    word that does both is better shown as the one a learner would otherwise
    get wrong.

    Returns None for a word whose only difference is 받침 neutralisation. That
    is a rule, but it is not one of these six, and this used to answer
    `liaison` for it — see the comment at the bottom.
    """
    if word in _IRREGULAR:
        return _IRREGULAR[word][1] or "liaison"
    if spoken_form(word) == word:
        return None
    for name in ("tensing", "aspiration", "nasal", "lateral", "palatal", "liaison"):
        if _fires(word, name):
            return name
    # Nothing named fired, and the word is still said differently: what is
    # left is 받침 neutralisation on its own — 옷 is [옫], 꽃 is [꼳]. That is a
    # real rule and it is *not* one of the six this page teaches, so returning
    # a pattern for it was returning the wrong one. `liaison` used to be the
    # catch-all here, which meant the sound-change lesson, had it ever shown a
    # liaison card, would have led with 옷 → 옫 under a heading that says the
    # final consonant moves onto the next syllable. Nothing moves in 옷.
    return None


def sound_for(word: str) -> tuple[str, str] | None:
    """`(spoken form, pattern)` for every word a named rule changes.

    This is what the *lesson* is built from, and it includes liaison. The
    editorial judgement in `NOTEWORTHY` is about a note on a word card, which
    is a different question with a different answer: see `note_for`.
    """
    pattern = pattern_of(word)
    if pattern is None:
        return None
    return spoken_form(word), pattern


def note_for(word: str) -> tuple[str, str] | None:
    """`(spoken form, pattern)` where a *card* should tell the learner."""
    found = sound_for(word)
    if found is None or found[1] not in NOTEWORTHY:
        return None
    return found


# --- The rules ----------------------------------------------------------------


def _with_tensing(word: str) -> list[list[str | None]]:
    """`apply_sound_changes`, plus the three rules that finish a transcription.

    Tensing, liaison and 받침 neutralisation live here rather than in
    `hangul.py` because they are *transcription* rules and that module's output
    feeds romanisation, which deliberately does not write them: 학교 is
    romanised *hakgyo*, not *hakkyo*. A learner being shown the Korean they will
    hear does need all three, so they are added on this side of the line.

    They run in the order Korean applies them. Tensing looks at the final as it
    is written, because that is what conditions it — 옷장 is [옫짱], tensed by an
    ㅅ that is itself about to become ㄷ. Liaison then moves whatever is left
    onto a following vowel, and only what is still sitting in a 받침 afterwards
    is neutralised.
    """
    parts = apply_sound_changes(word)
    for i in range(len(parts) - 1):
        final, nxt = parts[i][2], parts[i + 1]
        # A sonorant cluster tenses only before an ending: see above.
        if final in _SONORANT_CLUSTERS and (
            i + 1 >= len(word) or word[i + 1] not in _ENDING_SYLLABLES
        ):
            continue
        if final in _TENSING_FINALS and nxt[0] in _TENSABLE and nxt[1] is not None:
            nxt[0] = _TENSABLE[nxt[0]]
            # 자음군 단순화: a two-letter final before a consonant is said as one
            # of its two letters. Without it the spoken form of 앉다 renders as
            # 앉따, which is not a word and not what anybody says.
            if final in _CLUSTER_SIMPLIFIED:
                parts[i][2] = _CLUSTER_SIMPLIFIED[final]
    _liaise(parts)
    _neutralise(parts)
    return parts


def _liaise(parts: list[list[str | None]]) -> None:
    """연음 — a final consonant slides onto a following empty ㅇ.

    한국어 is [한구거]. This is the first thing a Korean teacher explains and the
    single most common reason a beginner's reading sounds wrong, and until this
    cycle the transcription did not do it: a note on 맛있다 read 맛있따, which is
    a spelling nobody says and which quietly asked the learner to apply the rule
    themselves — on the one line in the app whose entire job is to tell them
    what the word sounds like.
    """
    for i in range(len(parts) - 1):
        final, nxt = parts[i][2], parts[i + 1]
        if final is None or final == "ㅇ" or nxt[0] != "ㅇ" or nxt[1] is None:
            continue
        if final in _CLUSTER_LIAISON:
            parts[i][2], nxt[0] = _CLUSTER_LIAISON[final]
            continue
        if final == "ㅎ":
            # A lone ㅎ before a vowel is not pronounced: 좋아 is [조아].
            parts[i][2] = None
            continue
        parts[i][2] = None
        nxt[0] = final


def _neutralise(parts: list[list[str | None]]) -> None:
    """평파열음화 — what is left in a 받침 is said as one of seven sounds."""
    for part in parts:
        final = part[2]
        if final in _NEUTRALISED:
            part[2] = _NEUTRALISED[final]


def _fires(word: str, pattern: str) -> bool:
    """Whether this pattern is present at any syllable boundary in `word`."""
    for i in range(len(word) - 1):
        here, then = word[i], word[i + 1]
        if not (is_syllable(here) and is_syllable(then)):
            continue
        final = decompose(here)[2]
        initial, medial, _ = decompose(then)
        if final is None:
            continue

        if pattern == "tensing":
            if final in _TENSING_FINALS and initial in _TENSABLE:
                return True
        elif pattern == "aspiration":
            if final in ("ㅎ", "ㄶ", "ㅀ") and initial in ("ㄱ", "ㄷ", "ㅂ", "ㅈ"):
                return True
            if initial == "ㅎ" and final in ("ㄱ", "ㄷ", "ㅂ", "ㅈ", "ㄺ", "ㄼ"):
                return True
        elif pattern == "nasal":
            if initial in ("ㄴ", "ㅁ") and final in "ㄱㄲㅋㄳㄺㄷㅅㅆㅈㅊㅌㅎㅂㅍㄼㄿㅄ":
                return True
            if initial == "ㄹ" and final in "ㄱㄲㅋㄷㅂㅍ":
                return True
        elif pattern == "lateral":
            if (initial == "ㄹ" and final == "ㄴ") or (initial == "ㄴ" and final in ("ㄹ", "ㅀ", "ㄾ")):
                return True
        elif pattern == "palatal":
            if final in ("ㄷ", "ㅌ") and initial == "ㅇ" and medial == "ㅣ":
                return True
        elif pattern == "liaison":
            # A 받침 with a vowel behind it, which is the whole rule: the
            # consonant leaves the block it is written in and starts the next
            # one. 음악 → 으막. ㅇ is the silent initial, so a following block
            # that begins with it begins with a vowel.
            if initial == "ㅇ":
                return True
    return False
