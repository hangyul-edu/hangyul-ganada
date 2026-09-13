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
    if tail[2] and FINALS[tail[2]] == "ㄹ":
        # An ㄹ-final stem drops its ㄹ before ㄴ, ㅂ and ㅅ, and the ending
        # fuses into the syllable: 길 + ㄴ → 긴, 살 + 는 → 사는, 알 + ㅂ니다 →
        # 압니다, 멀 + 세요 → 머세요. None of these end in a strippable ending
        # that leaves a form the word has — 긴 minus nothing is 긴 — so the
        # suffix fold never reached them, and 긴, 먼, 힘든, 사는 and 아는, which
        # are how these words appear in front of a noun (most of the time, for
        # an adjective), were counted for nobody. 길다 ranked below 800 and
        # landed at level 12 on that evidence; I-126.
        dropped = compose(tail[0], tail[1], 0)
        head = stem[:-1] + dropped
        forms.append(stem[:-1] + compose(tail[0], tail[1], FINALS.index("ㄴ")))  # 긴, 먼, 산
        forms.append(head + "는")  # 사는, 아는, 만드는
        forms.append(stem[:-1] + compose(tail[0], tail[1], FINALS.index("ㅂ")) + "니다")  # 깁니다
        forms += [head + "세요", head + "신", head + "셨어요", head + "니까"]
        # The future adnominal is the stem itself (길 거예요) and is a bare
        # token, which the fold refuses on purpose; it is not claimed here.
    elif tail[2]:  # consonant-final stem
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


# --- Forms for counting, as opposed to forms for recognising --------------------
#
# `surface_forms` is a recogniser: it returns every string that *could* be this
# word so that `appears_in` never misses a headword in a sentence, and it is
# right to be generous. Read as a counter it is wrong in both directions. It
# returns the irregular alternants as if they were finished forms — 잇다 gives 이,
# and 이 + ㅆ gives 있, so 있어요 counted for 잇다; 살다 gives 사, so 사고 and
# 사요 counted for 살다 — and it omits the ㄹ-drop forms 긴, 사는 and 삽니다 that
# never end in anything strippable. Frequency is a claim about how often a
# learner will meet the word, so it gets its own, narrower model here.
#
# A stem is paired with the classes of ending it can take *in that shape*:
#
#   V  vowel-initial endings  — 아요 어요 아서 어서 았어 었어 았다 었다 (and 아/어)
#   C  consonant-initial ones that never change the stem — 고 지 게 면 죠 지만 …
#   N  ㄴ/ㅅ-initial ones an ㄹ-final stem drops its ㄹ before — 니까 세요 네요 는데
#   E  으-initial ones only a consonant-final stem takes — 으니까 은데 습니다
#
# 걷다 walks as 걷 {C N E} and 걸 {V}; 걸다 hangs as 걸 {V C N}. The one string
# they share is 걸 before a vowel, which is the honest extent of the ambiguity.
# `frequency.measure` folds the corpus once per class and divides the shared
# strings between their owners in proportion to what each owns alone.

FREQUENCY_CLASSES = ("V", "C", "N", "E")

#: Which class each fold suffix belongs to. "" is not a suffix: the fold never
#: credits a bare token to a verb (a bare 우리 is the pronoun, not 우리다).
SUFFIX_CLASS: dict[str, str] = {
    **dict.fromkeys(("아", "어", "아요", "어요", "아서", "어서", "았어", "었어", "았다", "었다"), "V"),
    **dict.fromkeys(("다", "고", "지", "게", "서", "면", "죠", "지만", "자", "려고", "러", "던", "겠다", "겠어", "잖아", "더라"), "C"),
    **dict.fromkeys(("니까", "세요", "십니다", "십시오", "네요", "는데"), "N"),
    **dict.fromkeys(("으니까", "은데", "습니다"), "E"),
}


def _ae_finished(stem: str) -> list[str]:
    """The finished 아/어 forms of a stem — never the bare alternant.

    `infinitive_forms` returns the alternant stems (걸 for 걷다, 이 for 잇다,
    사 for 살다) beside the finished forms because a recogniser wants both. A
    finished form is one a speaker can end a clause on: the contraction (봐,
    써, 몰라, 해, 추워, 그래) or the stem plus 아/어 (먹어, 살아). When the
    contraction collapses onto the stem itself — 가 + 아 → 가, 서 + 어 → 서 —
    the stem *is* the finished form, and 가요, 갔어요 and 사요 are built on it.
    """
    if not stem:
        return []
    alternants = set(_alternants(stem))
    forms = [f for f in infinitive_forms(stem) if f != stem and f not in alternants]
    tail = decompose(stem[-1])
    if (
        stem not in IRREGULAR
        and tail is not None
        and tail[2] == 0
        and VOWELS[tail[1]] in ("ㅏ", "ㅓ")
    ):
        forms.append(stem)
    return list(dict.fromkeys(forms))


def _alternants(stem: str) -> list[str]:
    """The stem as it stands before a vowel (or before ㄴ/ㅅ, for ㄹ), if it changes."""
    if not stem or stem in IRREGULAR:
        return []
    head, last = stem[:-1], stem[-1]
    parts = decompose(last)
    if parts is None:
        return []
    initial, medial, final = parts
    if final == 0:
        return []
    consonant = FINALS[final]
    if consonant == "ㄷ":
        return [head + compose(initial, medial, FINALS.index("ㄹ"))]
    if consonant == "ㅂ":
        return [head + compose(initial, medial, 0) + "우"]
    if consonant == "ㅎ" and stem in H_IRREGULAR:
        return [head + compose(initial, medial, 0)]
    if consonant == "ㅅ":
        return [head + compose(initial, medial, 0)]
    if consonant == "ㄹ":
        return [head + compose(initial, medial, 0)]
    return []


def frequency_forms(
    word: str, *, lemmas: frozenset[str] = frozenset(), claimed: frozenset[str] = frozenset()
) -> tuple[dict[str, frozenset[str]], list[str]]:
    """What to count for `word`: fold bases with their ending classes, and whole tokens.

    Returns `({base: classes}, tokens)`. A base is looked up in the corpus
    folded by each of its classes; a token is matched exactly. Nothing here is
    for recognising a word in a sentence — see `surface_forms` for that.

    `lemmas` is every Korean lemma the dictionary knows and `claimed` every
    headword this corpus teaches; both are used to refuse strings the language
    does not disambiguate:

    * a stem that is itself a headword noun takes no ㄴ/는 or honorific forms —
      우린 and 우리는 are the pronoun, not 우리다 (to steep); 말은 is 말 (words),
      not 말다;
    * an ㄹ-dropped alternant that is a dictionary word of its own takes no
      forms — 걸다 drops to 거, and 겁니다, 거니까 and 거는 are 것 (thing)
      contracted, not "I hang"; 살다 drops to 사, which is also 사다's stem;
    * a one-syllable ㄴ-adnominal that is a dictionary word is not counted —
      한 (하다) is *one*, 간 (가다) is *liver*, 건 (걸다) is *thing*, 산 is a
      mountain. 긴, 먼, 큰 and 힘든 are nobody else's and are counted.
    """
    stem = _stem_of(word)
    if stem is None:
        return {}, []
    bases: dict[str, set[str]] = {}
    tokens: list[str] = []
    stem_is_word = stem in claimed

    def add(base: str, *classes: str) -> None:
        if base:
            bases.setdefault(base, set()).update(classes)

    def adnominal(token: str, *, stem_guard: bool = True) -> None:
        # The fused ㄴ form, guarded: one syllable that is a word of its own is
        # somebody else's far more often than it is this verb's.
        if (stem_guard and stem_is_word) or token in claimed:
            return
        if len(token) == 1 and token in lemmas:
            return
        tokens.append(token)

    head, last = stem[:-1], stem[-1]
    parts = decompose(last)
    consonant = FINALS[parts[2]] if parts and parts[2] else ""
    vowel_final = stem in IRREGULAR or consonant == "" or (stem.endswith("하") and len(stem) > 1) or (
        stem.endswith("시") and len(stem) > 1
    )

    if vowel_final:
        # A vowel-final stem takes everything as it stands: 가고, 가니까, 가면.
        # The 아/어 form is a contraction (가, 봐, 해, 써, 몰라) and takes 서/도
        # and the past; the 으-forms do not exist.
        add(stem, "C")
        if not stem_is_word:
            add(stem, "N")
        if stem in ("있", "없"):
            add(stem, "V", "E")  # 있어요, 있습니다
        if stem in ("이", "아니"):
            add(stem, "V")  # 이어서, 아니어서 — the copula before a vowel
    elif consonant == "ㄹ":
        add(stem, "V", "C")  # 살아요, 살고, 살면
        for alt in _alternants(stem):
            # An alternant that is a taught word (나 for 날다 — 나는 is the
            # pronoun) or a dictionary word of its own (거 for 걸다, which
            # makes 겁니다 and 거니까 the contraction of 것) takes nothing —
            # unless it is the stem of another taught verb (사 for 살다 is
            # 사다's stem): then both own 사는 and 사세요, and
            # `frequency.measure` divides them by the evidence each has alone.
            if alt in claimed or (alt in lemmas and (alt + "다") not in claimed):
                continue
            add(alt, "N")  # 힘드세요, 힘드니까, 힘드네요, 힘드는데
            tokens.append(alt + "는")  # 사는, 힘드는, 만드는
            tokens.append(stem[:-1] + compose(parts[0], parts[1], FINALS.index("ㅂ")) + "니다")
            tokens += [alt + "세요", alt + "신", alt + "셨어요"]
        # 긴, 먼, 힘든 — the adnominal, guarded by the token alone: 길 is also a
        # noun (road), and 긴 is nobody's but 길다's.
        adnominal(stem[:-1] + compose(parts[0], parts[1], FINALS.index("ㄴ")), stem_guard=False)
    elif consonant in ("ㄷ", "ㅂ", "ㅅ"):
        # Regular or irregular is a fact the spelling does not give: 닫다 and
        # 받다 keep their ㄷ (닫아요), 걷다 and 듣다 lose it (걸어요); 입다 and
        # 잡다 keep their ㅂ (입어요), 춥다 loses it (추워요); 웃다 and 씻다 keep
        # their ㅅ (웃어요), 짓다 loses it (지어요). So the stem takes every
        # class, and the irregular alternant takes the vowel class beside it.
        # Neither reading invents a token the other class of verb could have
        # produced — 춥어요 and 닫어요 are not Korean and occur nowhere.
        add(stem, "V", "C", "N", "E")  # 닫아요·걷고, 입어요·춥고, 웃어요·짓고
        for alt in _alternants(stem):
            add(alt, "V")  # 걸어요, 지어요 (추워 is a contracted whole token)
    elif consonant == "ㅎ" and stem in H_IRREGULAR:
        add(stem, "C", "E")  # 그렇고, 그렇습니다
        # 그래 (the vowel form) and 그런 (the adnominal) are tokens.
    else:
        add(stem, "V", "C", "N", "E")  # 먹어요, 먹고, 먹네요, 먹습니다

    # Finished 아/어 forms: as fold bases for 서/도-type endings, and as whole
    # tokens with 요 and the past.
    for form in _ae_finished(stem):
        if form != stem:
            add(form, "C")
            tokens.append(form)
        tokens.append(form + "요")
        tail = decompose(form[-1])
        if tail is not None and tail[2] == 0:
            past = form[:-1] + compose(tail[0], tail[1], FINALS.index("ㅆ"))
            tokens += [past + "어요", past + "습니다", past + "다", past + "고", past + "지"]
    if stem.endswith("하") and len(stem) > 1:
        tokens += [stem[:-1] + "했어요", stem[:-1] + "했다", stem[:-1] + "합니다"]

    # Whole-token forms no fold can reach: the fused ㅂ니다, the adnominals, the
    # 으-honorifics.
    if vowel_final and parts is not None and parts[2] == 0 and not stem_is_word:
        tokens.append(head + compose(parts[0], parts[1], FINALS.index("ㅂ")) + "니다")  # 갑니다
        tokens.append(stem + "는")  # 가는
        adnominal(head + compose(parts[0], parts[1], FINALS.index("ㄴ")))  # 큰; 간 refused
    elif consonant and consonant != "ㄹ":
        # 는 after a consonant is only ever the verb: a noun takes 은 there, so
        # 입는 is 입다 (wear) even though 입 is also a noun (mouth). 은 and 을
        # are the noun's, and stay guarded.
        if not (consonant == "ㅎ" and stem in H_IRREGULAR):
            tokens.append(stem + "는")  # 먹는, 걷는, 없는, 입는
        if not stem_is_word:
            tokens += [t for t in derived_forms(word) if not (len(t) == 1 and t in lemmas)]

    frozen = {base: frozenset(classes) for base, classes in bases.items()}
    return frozen, [t for t in dict.fromkeys(tokens) if t != word and t not in claimed]
