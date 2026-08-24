"""Enough Korean conjugation to recognise a word in a sentence.

The content checker has to answer one question: *does this example sentence
actually contain the word it is supposed to teach?* For a noun that is string
containment. For a verb or adjective it is not, because Korean never writes the
dictionary form in a sentence — 먹다's sentence says 먹어요, 걷다's says 걸어요,
그리고 하다's says 해요.

This module generates the surface forms a 해요체 sentence would use. It is not a
general morphological analyser and does not try to be: it covers the stem plus
아/어 contraction, the regular irregulars, and the handful of endings the
example sentences in this product are written in.

Everything here is standard 한글 맞춤법; `test_conjugate.py` pins the forms that
matter against a table written from the grammar rather than from the code.
"""

from __future__ import annotations

BASE = 0xAC00
LAST = 0xD7A3
JUNG_COUNT = 21
JONG_COUNT = 28

VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
FINALS = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"
INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"


def decompose(char: str) -> tuple[int, int, int] | None:
    code = ord(char) - BASE
    if not 0 <= code <= LAST - BASE:
        return None
    return code // (JUNG_COUNT * JONG_COUNT), (code // JONG_COUNT) % JUNG_COUNT, code % JONG_COUNT


def compose(initial: int, medial: int, final: int = 0) -> str:
    return chr(BASE + (initial * JUNG_COUNT + medial) * JONG_COUNT + final)


#: 아 is used after a bright vowel (ㅏ, ㅗ), 어 after everything else.
BRIGHT = {VOWELS.index("ㅏ"), VOWELS.index("ㅗ")}

#: How a stem-final vowel merges with the 아/어 that follows it.
#: `(stem vowel, ending vowel) -> merged vowel`, by index into VOWELS.
_CONTRACTIONS = {
    ("ㅏ", "ㅏ"): "ㅏ",  # 가 + 아 → 가
    ("ㅓ", "ㅓ"): "ㅓ",  # 서 + 어 → 서
    ("ㅗ", "ㅏ"): "ㅘ",  # 보 + 아 → 봐
    ("ㅜ", "ㅓ"): "ㅝ",  # 주 + 어 → 줘
    ("ㅣ", "ㅓ"): "ㅕ",  # 마시 + 어 → 마셔
    ("ㅐ", "ㅓ"): "ㅐ",  # 내 + 어 → 내
    ("ㅔ", "ㅓ"): "ㅔ",  # 세 + 어 → 세
    ("ㅚ", "ㅓ"): "ㅙ",  # 되 + 어 → 돼
}

#: Stems whose conjugation the regular rules cannot derive.
IRREGULAR: dict[str, list[str]] = {
    "하": ["해", "하"],
    # 푸다 is the only ㅜ-irregular verb in the language: 푸 + 어 → 퍼.
    "푸": ["푸", "퍼"],
    "이": ["예", "이", "야"],
    "아니": ["아니", "아녜"],
    "있": ["있"],
    "없": ["없"],
    "그렇": ["그래", "그렇"],
    "이렇": ["이래", "이렇"],
    "저렇": ["저래", "저렇"],
    "어떻": ["어때", "어떻"],
    "푸르": ["푸르", "푸를"],
    "이르": ["이르", "일러"],
    "누렇": ["누레", "누렇"],
}


#: The ㅎ-irregular adjectives, in full. Standard Korean orthography treats
#: this as a closed class: every other ㅎ-final stem conjugates regularly.
H_IRREGULAR = {
    "그렇", "이렇", "저렇", "어떻", "까맣", "꺼멓", "노랗", "누렇", "빨갛", "뻘겋",
    "파랗", "퍼렇", "하얗", "허옇", "동그랗", "조그맣", "커다랗", "뿌옇", "발갛",
    "새까맣", "새하얗", "샛노랗", "시뻘겋", "거멓",
}


def _stem_of(word: str) -> str | None:
    return word[:-1] if len(word) > 1 and word.endswith("다") else None


def infinitive_forms(stem: str) -> list[str]:
    """The 아/어 forms of a stem — what 해요체 is built on.

    Returns every plausible surface form rather than one, because several of
    the irregular classes are only distinguishable with information the
    dictionary does not give us (걷다 'walk' is ㄷ-irregular, 걷다 'roll up' is
    regular, and they are spelled identically). Offering both and accepting
    either is right for a *recogniser*; it would be wrong for a generator, and
    this is not one.
    """
    if not stem:
        return []
    if stem in IRREGULAR:
        return IRREGULAR[stem]
    # A 하다-compound conjugates on its 하, and the contraction is irregular:
    # 도착하 + 아 → 도착해, not 도착하. Without this every one of the several
    # hundred X하다 verbs in the language is unrecognisable in the past tense,
    # because 했 is derived from 해 and 해 was never generated.
    if stem.endswith("하") and len(stem) > 1:
        return [stem, stem[:-1] + "해"]
    # The honorific -(으)시- contracts with the following 어요 to -세요, not to
    # -시어요: 계시다 → 계세요, 주무시다 → 주무세요.
    if stem.endswith("시") and len(stem) > 1:
        return [stem, stem[:-1] + "세", stem[:-1] + "셔"]
    head, last = stem[:-1], stem[-1]
    parts = decompose(last)
    if parts is None:
        return [stem]
    initial, medial, final = parts
    vowel = VOWELS[medial]
    forms: list[str] = [stem]
    ending = "ㅏ" if medial in BRIGHT else "ㅓ"

    if final == 0:
        # ㅡ drops before a vowel: 쓰 + 어 → 써, 예쁘 + 어 → 예뻐, 바쁘 + 아 → 바빠.
        if vowel == "ㅡ":
            if head:
                previous = decompose(head[-1])
                bright = previous is not None and previous[1] in BRIGHT
                merged = "ㅏ" if bright else "ㅓ"
            else:
                merged = "ㅓ"
            forms.append(head + compose(initial, VOWELS.index(merged), 0))
            # 르-irregular: 모르 + 아 → 몰라. The ㄹ doubles onto the previous
            # syllable, which is why 몰라 and not 모라.
            if head and last in ("르",):
                previous = decompose(head[-1])
                if previous is not None:
                    doubled = compose(previous[0], previous[1], FINALS.index("ㄹ"))
                    bright = previous[1] in BRIGHT
                    forms.append(
                        head[:-1]
                        + doubled
                        + compose(INITIALS.index("ㄹ"), VOWELS.index("ㅏ" if bright else "ㅓ"))
                    )
        else:
            merged = _CONTRACTIONS.get((vowel, ending))
            if merged:
                forms.append(head + compose(initial, VOWELS.index(merged), 0))
            # The uncontracted form as well, and not only when there is no
            # contraction. Several of the contractions are optional in writing:
            # 세다 is written both 세요 and 세어요, 되다 both 돼요 and 되어요.
            # A recogniser that only knows the contracted spelling misses the
            # other half of the sentences that use them.
            forms.append(stem + ("아" if ending == "ㅏ" else "어"))
    else:
        consonant = FINALS[final]
        if consonant == "ㄷ":
            # ㄷ-irregular: 듣 + 어 → 들어, 걷 + 어 → 걸어.
            forms.append(head + compose(initial, medial, FINALS.index("ㄹ")))
        elif consonant == "ㅂ":
            # ㅂ-irregular: 춥 + 어 → 추워, 덥 + 어 → 더워, 곱 + 아 → 고와.
            dropped = compose(initial, medial, 0)
            merged = "ㅘ" if (medial in BRIGHT and len(stem) == 1) else "ㅝ"
            forms.append(head + dropped + compose(INITIALS.index("ㅇ"), VOWELS.index(merged)))
            forms.append(head + dropped + "우")
            # The adnominal drops ㅂ and adds 운: 흥미롭 + 은 → 흥미로운,
            # 춥 + 은 → 추운. Sentences use this form as often as the 아/어 one.
            forms.append(head + dropped + "운")
        elif consonant == "ㅎ" and stem in H_IRREGULAR:
            # ㅎ-irregular: the ㅎ drops and the vowel fronts — 하얗 + 아 → 하얘,
            # 그렇 + 어 → 그래, 파랗 + 아 → 파래. It is a closed class of
            # adjectives, and applying it by spelling alone would be wrong:
            # 낳다, 넣다, 놓다 and 좋다 all end in ㅎ and are perfectly regular,
            # and dropping their ㅎ would make 낳 conjugate as 나 — which is
            # the pronoun 'I'.
            fronted = {"ㅏ": "ㅐ", "ㅓ": "ㅔ", "ㅑ": "ㅒ", "ㅕ": "ㅖ"}.get(vowel)
            forms.append(head + compose(initial, medial, 0))
            if fronted:
                forms.append(head + compose(initial, VOWELS.index(fronted), 0))
            # The adnominal also drops the ㅎ and takes ㄴ as the final:
            # 커다랗 + ㄴ → 커다란, 그렇 + ㄴ → 그런, 하얗 + ㄴ → 하얀.
            forms.append(head + compose(initial, medial, FINALS.index("ㄴ")))
        elif consonant == "ㅅ":
            # ㅅ-irregular: 낫 + 아 → 나아, 짓 + 어 → 지어.
            forms.append(head + compose(initial, medial, 0))
        elif consonant == "ㄹ":
            # ㄹ drops before ㄴ/ㅂ/ㅅ endings: 살 + ㅂ니다 → 삽니다, 알 + 아 → 알아.
            forms.append(head + compose(initial, medial, 0))
        forms.append(stem + ("아" if ending == "ㅏ" else "어"))
    return forms


def surface_forms(word: str) -> list[str]:
    """Every string that would count as this word appearing in a sentence."""
    stem = _stem_of(word)
    if stem is None:
        return [word]
    forms = [word, stem, *infinitive_forms(stem)]
    # The plain adnominal adds ㄴ to a vowel-final stem: 이르 + ㄴ → 이른,
    # 크 + ㄴ → 큰. It is how an adjective appears in front of a noun, which is
    # where sentences put adjectives most often.
    head_a = decompose(stem[-1])
    if head_a is not None and head_a[2] == 0:
        forms.append(stem[:-1] + compose(head_a[0], head_a[1], FINALS.index("ㄴ")))

    # The past tense fuses ㅆ onto the 아/어 form: 두 + 어 → 둬 → 뒀어요,
    # 따 + 아 → 따 → 땄어요. Without this the recogniser misses every sentence
    # written in the past, which is most of the natural ones.
    for form in list(forms):
        tail_past = decompose(form[-1]) if form else None
        if tail_past is not None and tail_past[2] == 0:
            forms.append(form[:-1] + compose(tail_past[0], tail_past[1], FINALS.index("ㅆ")))

    # The ~ㄹ게요 / ~ㄹ 거예요 future attaches ㄹ to a vowel-final stem:
    # 내 + ㄹ게요 → 낼게요, 가 + ㄹ 거예요 → 갈 거예요.
    tail = decompose(stem[-1])
    if tail is not None and tail[2] == 0:
        forms.append(stem[:-1] + compose(tail[0], tail[1], FINALS.index("ㄹ")))

    # 하다-compounds are written apart as often as together: 공부하다 appears as
    # 공부를 해요 just as readily as 공부해요.
    if stem.endswith("하") and len(stem) > 1:
        forms.append(stem[:-1])
    seen: list[str] = []
    for form in forms:
        if form and form not in seen:
            seen.append(form)
    return seen


def stem_of(word: str) -> str | None:
    """The stem of a 다-form, or None if the word does not inflect."""
    return _stem_of(word)


def written_forms(word: str) -> list[str]:
    """Complete tokens a speaker writes that no suffix can be stripped off.

    The frequency reader folds a corpus by removing an ending from each token —
    먹었어 gives its count to 먹 — and that works for every ending that is a
    string sitting on the end of one. Two of the commonest are not.

    **The formal ㅂ니다 fuses into the last syllable.** 감사하 + ㅂ니다 is
    감사합니다, where the ㅂ is the final consonant of 합 rather than a character
    of its own, so `"감사합니다".endswith("ㅂ니다")` is false and always was.
    감사합니다 is one of the first sentences anybody learns in Korean and it was
    contributing nothing to 감사하다, which is why the word scored as rare and
    came out at level 11.

    **요 attaches to an already-contracted form.** 감사해요 is 감사해 plus 요,
    and neither 해요 nor 어요 can be stripped off it — 해 is not 어. The bare
    ending 요 cannot go in the fold's list because it is also a case particle
    (책이요), so the only way to count these is to generate the finished token
    and match it whole.

    Bare 아/어 forms are here for a third reason: the fold deliberately refuses
    to count a token with no ending at all, because a bare 우리 is the pronoun
    and not the stem of 우리다. 감사해 and 먹어 are not stems and carry no such
    risk, and a subtitle corpus is full of them.

    Everything here is matched exactly, against the raw counts, and the caller
    drops any form the fold could already have reached — see `measure`. Nothing
    is counted twice.
    """
    stem = _stem_of(word)
    if stem is None:
        return []
    forms: list[str] = []
    for form in infinitive_forms(stem):
        if form == stem:
            continue
        forms.append(form)
        forms.append(form + "\uc694")
        tail = decompose(form[-1])
        if tail is not None and tail[2] == 0:
            past = form[:-1] + compose(tail[0], tail[1], FINALS.index("\u3146"))
            forms.append(past + "\uc5b4\uc694")
            forms.append(past + "\uc2b5\ub2c8\ub2e4")
    head = decompose(stem[-1])
    if head is not None and head[2] == 0:
        forms.append(stem[:-1] + compose(head[0], head[1], FINALS.index("\u3142")) + "\ub2c8\ub2e4")
    return list(dict.fromkeys(forms))


def derived_forms(word: str) -> list[str]:
    """Complete word-forms that are the *only* way some adjectives are written.

    These are whole tokens, not stem-plus-ending pairs, and they are looked up
    against the corpus by exact match rather than by stripping a suffix. That
    matters because the endings involved — 은, 이, 을 — are also case particles,
    so folding them off every token in the corpus would credit 신다 with every
    'the shoe (topic)' and quietly inflate it. Matching the finished string
    cannot do that.

    Without this a word like 수많다 reads as unobserved, because 수많다 is never
    written: the language only ever produces 수많은. Same for 끊임없이,
    한없이, 악착같이 and the honorific 편찮으세요.
    """
    stem = _stem_of(word)
    if stem is None:
        return []
    tail = decompose(stem[-1])
    if tail is None:
        return []
    forms: list[str] = []
    if tail[2]:  # consonant-final stem
        # 많 + 은 → 많은, 같 + 은 → 같은. 없-final stems take 는 instead:
        # 없은 is not Korean, 없는 is.
        forms.append(stem + ("는" if FINALS[tail[2]] == "ㅄ" else "은"))
        forms.append(stem + "을")
        # The honorific inserts 으: 편찮 + 으세요 → 편찮으세요, which for a few
        # verbs is the only register they are ever spoken in.
        forms += [stem + "으세요", stem + "으신", stem + "으셨어요"]
    else:
        forms.append(stem + "는")
    # The -이 adverb is a fixed derivation, not an inflection: 끊임없다 gives
    # 끊임없이, 악착같다 gives 악착같이. It is productive only for this closed
    # set of endings, so it is not applied to every stem.
    if stem[-1] in "없같많":
        forms.append(stem + "이")
    return [f for f in dict.fromkeys(forms) if f != word]


def appears_in(word: str, sentence: str) -> str | None:
    """The longest surface form of `word` found in `sentence`, or None.

    Longest first, so 걸어요 matches 걸어 rather than the bare stem 걷 that
    happens to share a syllable with something else.
    """
    for form in sorted(surface_forms(word), key=len, reverse=True):
        if form in sentence:
            return form
    return None
