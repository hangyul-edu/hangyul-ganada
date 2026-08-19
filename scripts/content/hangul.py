"""Hangul mechanics shared by every step of the content pipeline.

Decomposition and romanisation are pure functions over Unicode, so they belong
in one module rather than being re-derived by each script that needs them. The
TypeScript app has its own copy of the decomposition rules in
``apps/web/src/data/difficulty.ts``; ``build_vocabulary.py`` asserts the two
agree on every word it emits, which is what stops the pipeline and the app from
disagreeing about which letters a word needs.
"""

from __future__ import annotations

SYLLABLE_BASE = 0xAC00
SYLLABLE_COUNT = 11172
MEDIALS = 21
FINALS = 28

INITIAL_JAMO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
MEDIAL_JAMO = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
FINAL_JAMO = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"

#: Compound jamo, and the basic letters they are written from.
#:
#: The curriculum teaches ㄳ as "ㄱ then ㅅ", never as a new letter, so a word
#: containing it requires both of those and not a nineteenth consonant.
COMPOUND_PARTS = {
    "ㄳ": ("ㄱ", "ㅅ"),
    "ㄵ": ("ㄴ", "ㅈ"),
    "ㄶ": ("ㄴ", "ㅎ"),
    "ㄺ": ("ㄹ", "ㄱ"),
    "ㄻ": ("ㄹ", "ㅁ"),
    "ㄼ": ("ㄹ", "ㅂ"),
    "ㄽ": ("ㄹ", "ㅅ"),
    "ㄾ": ("ㄹ", "ㅌ"),
    "ㄿ": ("ㄹ", "ㅍ"),
    "ㅀ": ("ㄹ", "ㅎ"),
    "ㅄ": ("ㅂ", "ㅅ"),
}

#: Vowels written by combining two simpler vowels. Same reasoning as above.
COMPOUND_VOWELS = {
    "ㅘ": ("ㅗ", "ㅏ"),
    "ㅙ": ("ㅗ", "ㅐ"),
    "ㅚ": ("ㅗ", "ㅣ"),
    "ㅝ": ("ㅜ", "ㅓ"),
    "ㅞ": ("ㅜ", "ㅔ"),
    "ㅟ": ("ㅜ", "ㅣ"),
    "ㅢ": ("ㅡ", "ㅣ"),
    "ㅐ": ("ㅏ", "ㅣ"),
    "ㅔ": ("ㅓ", "ㅣ"),
    "ㅒ": ("ㅑ", "ㅣ"),
    "ㅖ": ("ㅕ", "ㅣ"),
}


def is_syllable(ch: str) -> bool:
    return 0 <= ord(ch) - SYLLABLE_BASE < SYLLABLE_COUNT


def is_hangul_word(text: str) -> bool:
    """True when every character is a precomposed syllable block.

    Bare jamo, hanja, Latin letters and digits all fail. A vocabulary entry has
    to be writable in the practice canvas one syllable at a time, and none of
    those are.
    """
    return bool(text) and all(is_syllable(ch) for ch in text)


def decompose(ch: str) -> tuple[str, str, str | None]:
    """Splits one syllable into (initial, medial, final)."""
    index = ord(ch) - SYLLABLE_BASE
    if not 0 <= index < SYLLABLE_COUNT:
        raise ValueError(f"not a Hangul syllable: {ch!r}")
    initial = index // (MEDIALS * FINALS)
    medial = (index % (MEDIALS * FINALS)) // FINALS
    final = index % FINALS
    return (
        INITIAL_JAMO[initial],
        MEDIAL_JAMO[medial],
        FINAL_JAMO[final - 1] if final else None,
    )


def compose_syllable(initial: str, medial: str, final: str | None) -> str:
    """The inverse of `decompose`. Raises on a combination Hangul cannot write."""
    return chr(
        SYLLABLE_BASE
        + (INITIAL_JAMO.index(initial) * MEDIALS + MEDIAL_JAMO.index(medial)) * FINALS
        + (FINAL_JAMO.index(final) + 1 if final else 0)
    )


def to_jamo(text: str) -> list[str]:
    """Every jamo in the text, in writing order, compounds left intact."""
    out: list[str] = []
    for ch in text:
        if not is_syllable(ch):
            out.append(ch)
            continue
        initial, medial, final = decompose(ch)
        out.append(initial)
        out.append(medial)
        if final:
            out.append(final)
    return out


def required_letters(text: str) -> list[str]:
    """The distinct basic letters a learner must know to write this text.

    Compounds are expanded, because the curriculum teaches ㅘ as ㅗ + ㅏ and a
    learner who knows both can write it. Returned in curriculum order so the
    output is stable across runs.
    """
    letters: set[str] = set()
    for jamo in to_jamo(text):
        if jamo in COMPOUND_PARTS:
            letters.update(COMPOUND_PARTS[jamo])
        elif jamo in COMPOUND_VOWELS:
            letters.update(COMPOUND_VOWELS[jamo])
        else:
            letters.add(jamo)
    return sorted(letters, key=lambda j: CURRICULUM_ORDER.index(j) if j in CURRICULUM_ORDER else 99)


def has_final(ch: str) -> bool:
    return is_syllable(ch) and (ord(ch) - SYLLABLE_BASE) % FINALS != 0


def syllables(text: str) -> list[str]:
    return [ch for ch in text if ch.strip()]


#: The order Hangyul ganada introduces letters in. Mirrors LETTER_LESSONS in
#: ``apps/web/src/data/characters.ts``; ``build_vocabulary.py`` fails if the two
#: drift, because gating vocabulary on a stale order would offer a learner a
#: word made of letters they have not been taught.
CURRICULUM_ORDER = [
    # Unit 1 — the vowels every syllable needs
    "ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ",
    # Unit 2 — the first consonants
    "ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ",
    # Unit 3 — the rest of the plain consonants
    "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅎ",
    # Unit 4 — iotised vowels
    "ㅑ", "ㅕ", "ㅛ", "ㅠ",
    # Unit 5 — aspirated consonants
    "ㅊ", "ㅋ", "ㅌ", "ㅍ",
    # Unit 6 — compound vowels
    "ㅐ", "ㅔ", "ㅒ", "ㅖ",
    # Unit 7 — tense consonants
    "ㄲ", "ㄸ", "ㅃ", "ㅆ", "ㅉ",
]


# --- Revised Romanisation ---------------------------------------------------
#
# 국어의 로마자 표기법 (Ministry of Culture, Sports and Tourism, 2000), the
# transcription variant: what the word *sounds* like, not a letter-for-letter
# transliteration. A learner reading `좋다` needs to know it is said *jota*;
# telling them *johda* teaches a pronunciation no Korean speaker uses.
#
# The rules implemented are the ones the standard requires to be reflected in
# spelling — resyllabification, ㅎ aspiration, nasalisation, lateralisation and
# palatalisation. Tensification is deliberately not marked, because the standard
# says not to: 먹다 is *meokda*, never *meoktta*.
#
# What is *not* implemented is the sound change that depends on knowing whether
# a compound has a morpheme boundary in it (사이시옷 cases like 냇가). Those
# need a pronunciation dictionary rather than a rule, and guessing produces a
# confident wrong answer. `apply_sound_changes` leaves them alone.

_INITIAL_ROMAN = {
    "ㄱ": "g", "ㄲ": "kk", "ㄴ": "n", "ㄷ": "d", "ㄸ": "tt", "ㄹ": "r",
    "ㅁ": "m", "ㅂ": "b", "ㅃ": "pp", "ㅅ": "s", "ㅆ": "ss", "ㅇ": "",
    "ㅈ": "j", "ㅉ": "jj", "ㅊ": "ch", "ㅋ": "k", "ㅌ": "t", "ㅍ": "p", "ㅎ": "h",
}

_MEDIAL_ROMAN = {
    "ㅏ": "a", "ㅐ": "ae", "ㅑ": "ya", "ㅒ": "yae", "ㅓ": "eo", "ㅔ": "e",
    "ㅕ": "yeo", "ㅖ": "ye", "ㅗ": "o", "ㅘ": "wa", "ㅙ": "wae", "ㅚ": "oe",
    "ㅛ": "yo", "ㅜ": "u", "ㅝ": "wo", "ㅞ": "we", "ㅟ": "wi", "ㅠ": "yu",
    "ㅡ": "eu", "ㅢ": "ui", "ㅣ": "i",
}

#: A final consonant at the end of a word, or before another consonant.
_FINAL_ROMAN = {
    "ㄱ": "k", "ㄲ": "k", "ㄳ": "k", "ㄴ": "n", "ㄵ": "n", "ㄶ": "n",
    "ㄷ": "t", "ㄹ": "l", "ㄺ": "k", "ㄻ": "m", "ㄼ": "l", "ㄽ": "l",
    "ㄾ": "l", "ㄿ": "p", "ㅀ": "l", "ㅁ": "m", "ㅂ": "p", "ㅄ": "p",
    "ㅅ": "t", "ㅆ": "t", "ㅇ": "ng", "ㅈ": "t", "ㅊ": "t", "ㅋ": "k",
    "ㅌ": "t", "ㅍ": "p", "ㅎ": "t",
}

#: The same final carried onto the next syllable, which begins with ㅇ. 밥이 is
#: *babi*, not *bapi*: the ㅂ moves and recovers its initial value.
_FINAL_LINKED = {
    "ㄱ": "g", "ㄲ": "kk", "ㄳ": "ks", "ㄴ": "n", "ㄵ": "nj", "ㄶ": "nh",
    "ㄷ": "d", "ㄹ": "r", "ㄺ": "lg", "ㄻ": "lm", "ㄼ": "lb", "ㄽ": "ls",
    "ㄾ": "lt", "ㄿ": "lp", "ㅀ": "lh", "ㅁ": "m", "ㅂ": "b", "ㅄ": "bs",
    "ㅅ": "s", "ㅆ": "ss", "ㅇ": "ng", "ㅈ": "j", "ㅊ": "ch", "ㅋ": "k",
    "ㅌ": "t", "ㅍ": "p", "ㅎ": "h",
}


#: ㅎ meeting a plain stop, in either order, produces the aspirated stop.
_ASPIRATED = {"ㄱ": "ㅋ", "ㄷ": "ㅌ", "ㅂ": "ㅍ", "ㅈ": "ㅊ"}

#: A final that is really two letters, and what is left behind when the second
#: one is consumed by the following syllable.
_CLUSTER_REMAINDER = {"ㄶ": "ㄴ", "ㅀ": "ㄹ", "ㄵ": "ㄴ", "ㄺ": "ㄹ", "ㄼ": "ㄹ"}

#: Finals that nasalise before ㄴ or ㅁ, and what they become.
_NASALISE = {
    **{f: "ㅇ" for f in "ㄱㄲㅋㄳㄺ"},
    **{f: "ㄴ" for f in "ㄷㅅㅆㅈㅊㅌㅎ"},
    **{f: "ㅁ" for f in "ㅂㅍㄼㄿㅄ"},
}


def apply_sound_changes(text: str) -> list[list[str | None]]:
    """Turns a written word into the syllables it is actually pronounced as.

    Returns a list of ``[initial, medial, final]`` triples. Working on triples
    rather than on a flat jamo list is what makes the rules readable: every one
    of them is a statement about the boundary between two syllables.
    """
    parts: list[list[str | None]] = []
    for ch in text:
        if is_syllable(ch):
            initial, medial, final = decompose(ch)
            parts.append([initial, medial, final])
        else:
            parts.append([ch, None, None])

    for i in range(len(parts) - 1):
        cur, nxt = parts[i], parts[i + 1]
        final, initial = cur[2], nxt[0]
        if final is None or nxt[1] is None or initial is None:
            continue

        # ㅎ before a plain stop aspirates it: 좋다 → 조타, 많다 → 만타.
        if final in ("ㅎ", "ㄶ", "ㅀ") and initial in _ASPIRATED:
            cur[2] = _CLUSTER_REMAINDER.get(final)
            nxt[0] = _ASPIRATED[initial]
            continue
        if final in ("ㅎ", "ㄶ", "ㅀ") and initial == "ㅅ":
            cur[2] = _CLUSTER_REMAINDER.get(final)
            nxt[0] = "ㅆ"
            continue

        # A plain stop before ㅎ aspirates too: 축하 → 추카, 입학 → 이팍.
        # ㄵ is here for the same reason ㄺ and ㄼ are: the cluster's *second*
        # letter is the one that meets the ㅎ. 앉히다 is [안치다]. No word in the
        # current vocabulary needs it, which is exactly why it is easy to leave
        # out and expensive to notice later.
        if initial == "ㅎ" and final in ("ㄱ", "ㄷ", "ㅂ", "ㅈ", "ㄺ", "ㄼ", "ㄵ"):
            base = {"ㄺ": "ㄱ", "ㄼ": "ㅂ", "ㄵ": "ㅈ"}.get(final, final)
            cur[2] = _CLUSTER_REMAINDER.get(final)
            # …and the ㅌ that a ㄷ turns into is then palatalised if the vowel
            # is 이: 갇히다 is [가치다], not [가티다]. Two rules in a row, and
            # leaving the second one out put a sound nobody makes on a word
            # card. Revised Romanisation writes it the same way — *guchida* —
            # so this belongs here rather than in the transcription layer.
            nxt[0] = "ㅊ" if base == "ㄷ" and nxt[1] == "ㅣ" else _ASPIRATED[base]
            continue

        # Palatalisation: a final ㄷ/ㅌ before 이 is said ji/chi — 같이 → 가치.
        if final in ("ㄷ", "ㅌ") and initial == "ㅇ" and nxt[1] == "ㅣ":
            cur[2] = None
            nxt[0] = "ㅈ" if final == "ㄷ" else "ㅊ"
            continue

        # Everything else is a consonant meeting a consonant.
        if initial == "ㅇ":
            continue

        # Nasalisation: 먹는 → 멍는, 입니다 → 임니다.
        if initial in ("ㄴ", "ㅁ") and final in _NASALISE:
            cur[2] = _NASALISE[final]
            continue

        # ㄹ after a nasal becomes ㄴ: 종로 → 종노.
        if initial == "ㄹ" and final in ("ㅁ", "ㅇ"):
            nxt[0] = "ㄴ"
            continue

        # Lateralisation, both directions: 신라 → 실라, 설날 → 설랄.
        if initial == "ㄹ" and final == "ㄴ":
            cur[2] = "ㄹ"
            continue
        if initial == "ㄴ" and final in ("ㄹ", "ㅀ", "ㄾ"):
            nxt[0] = "ㄹ"
            continue

        # ㄱ/ㄷ/ㅂ before ㄹ nasalise the stop and turn the ㄹ into ㄴ:
        # 국립 → 궁닙, 십리 → 심니.
        if initial == "ㄹ" and final in _NASALISE:
            cur[2] = _NASALISE[final]
            nxt[0] = "ㄴ"
            continue

    return parts


def romanize(text: str, *, transcribe: bool = True) -> str:
    """Revised Romanisation of a Korean word.

    With ``transcribe`` (the default) the sound changes above are applied first,
    which is what the standard prescribes and what a learner needs. Pass
    ``transcribe=False`` for a letter-for-letter reading — useful when checking
    that the pipeline decomposed a word the way the app does.

    Non-Hangul characters pass through unchanged, so a phrase with a space or a
    question mark romanises without being mangled.
    """
    parts = (
        apply_sound_changes(text)
        if transcribe
        else [
            list(decompose(ch)) if is_syllable(ch) else [ch, None, None]  # type: ignore[list-item]
            for ch in text
        ]
    )

    out: list[str] = []
    for i, (initial, medial, final) in enumerate(parts):
        if medial is None:
            out.append(initial or "")
            continue
        previous_final = parts[i - 1][2] if i > 0 else None
        # ㄹㄹ is written *ll*, not *lr* — 설날 is *seollal*.
        if initial == "ㄹ" and previous_final == "ㄹ":
            out.append("l")
        else:
            out.append(_INITIAL_ROMAN[initial])  # type: ignore[index]
        out.append(_MEDIAL_ROMAN[medial])
        if not final:
            continue
        nxt = parts[i + 1] if i + 1 < len(parts) else None
        # A final consonant before a vowel moves onto it and recovers its
        # initial value: 밥이 is *babi*, not *bapi*.
        links = nxt is not None and nxt[1] is not None and nxt[0] == "ㅇ"
        out.append(_FINAL_LINKED[final] if links else _FINAL_ROMAN[final])
    return "".join(out)
