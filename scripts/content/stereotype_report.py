#!/usr/bin/env python3
"""Who does what, counted, in the Korean and in every written translation.

    npm run examples:stereotypes
    npm run examples:stereotypes -- --json docs/stereotype-report.json

Why a report and not a gate
---------------------------

`examples_qa` already refuses a translation that invents a person the Korean
does not have, and that rule is decidable: the Korean either names somebody or
it does not.  Everything this file counts is the other kind of question.  When
the Korean *does* name somebody — 아버지는 회사에 가요, 엄마가 요리해요 — no
single sentence is wrong.  A curriculum in which the father goes to the office
and the mother cooks, forty times, teaches something anyway, and no per-sentence
check can see it because the fault is in the distribution.

So this counts the distribution and prints it.  A number that looks wrong here
is an instruction to go and read those sentences, not a build failure: deciding
that 열두 개의 엄마-요리 문장 is too many is an editorial judgement and belongs
to a person.

What it counts
--------------

1.  **Korean.**  Every example naming a gendered person, filed under the
    predicate's domain — cooking and cleaning, care, work and study, money,
    appearance, strength and violence, feeling.  Printed as a table of male and
    female counts per domain, with the ratio.
2.  **Translations.**  Every example whose Korean names nobody, counted by the
    third-person markers its translations carry.  The English pass drove this to
    zero and the French and German rewrite finished it; the row exists so that
    it stays zero, and so the next language added has somewhere to be counted.
3.  **The words themselves.**  How often each gendered headword is the subject
    of the corpus, because 남자 appearing three times as often as 여자 is a
    finding even when every one of the sentences is unobjectionable.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "apps/web/src/data/generated/vocabulary.json"

#: Gendered person words, and which way they lean.
MALE = [
    "아버지", "아빠", "형", "오빠", "남편", "아들", "삼촌", "할아버지", "소년",
    "남자", "아저씨", "신사", "왕", "왕자", "남자친구", "신랑", "남성", "장군",
]
FEMALE = [
    "어머니", "엄마", "언니", "누나", "아내", "딸", "할머니", "소녀", "여자",
    "아줌마", "아주머니", "아가씨", "숙녀", "여왕", "공주", "여자친구", "신부",
    "여성", "이모", "여동생", "그녀",
]

#: The domain a sentence is about, by the words in it. First match wins, so the
#: order is the order of interest: a sentence with both 요리 and 회사 in it is
#: counted as a sentence about cooking.
DOMAINS = [
    ("home & cooking", "요리|밥|반찬|국|설거지|청소|빨래|부엌|살림|김치|장을 보|시장"),
    ("care", "돌보|보살피|키우|안|업|재우|먹이|간호|모시"),
    ("appearance", "예쁘|아름답|귀엽|멋있|멋지|잘생|화장|옷|치마|드레스|우아|화려"),
    ("work & study", "회사|일해|일하|공부|학교|출근|퇴근|사무실|직장|가르치|배우|연구"),
    ("money", "돈|월급|값|사요|팔아|계산|벌어|비싸|싸요"),
    ("strength & violence", "힘|싸우|때리|주먹|군대|군인|무기|싸움|이기|지키"),
    ("feeling", "울|웃|기뻐|슬퍼|사랑|화나|외로|무서|걱정"),
]

#: A third person in a translation, split by gender.
#:
#: The *markers* are this file's, because the gate does not care which gender a
#: translation invented and this file's whole subject is that it cares. The
#: *guards* are the gate's, imported rather than copied: `_KOREAN_HAS_A_PERSON`,
#: `_ANTECEDENT` and `_FRENCH_IMPERSONAL` decide what counts as an invention,
#: and a second opinion about that in a second file is how a report ends up
#: contradicting the gate it sits next to. The first draft of this file did copy
#: them, disagreed within the hour, and printed twenty-two inventions into a
#: corpus the gate had just certified as having none.
MARKERS = {
    "en": [("m", r"\b(He|he|his|His|him|Him)\b"), ("f", r"\b(She|she|her|Her|hers)\b")],
    "es": [("m", r"\b(Él|él)\b"), ("f", r"\b(Ella|ella)\b")],
    "pt": [("m", r"\b(Ele|ele|dele)\b"), ("f", r"\b(Ela|ela|dela)\b")],
    "fr": [("m", r"\b(Il|il|[Ss]on|[Ss]a|[Ss]es)\b"), ("f", r"\b(Elle|elle)\b")],
    "de": [("m", r"\b(Er|er|ihn|ihm|seine[nmrs]?|Seine[nmrs]?)\b"), ("f", r"\b(sie|ihre[nmrs]?)\b")],
    "zh": [("m", r"(?<![吉其])他(?!们)"), ("f", r"她(?!们)")],
}

sys.path.insert(0, str(Path(__file__).resolve().parent))
from examples_qa import (  # noqa: E402
    _ANTECEDENT as ANTECEDENT,
    _FRENCH_IMPERSONAL as FRENCH_IMPERSONAL,
    _KOREAN_HAS_A_PERSON as KOREAN_HAS_A_PERSON,
)

#: Korean has no spaces inside a word, so a substring test is not a word test.
#: 못 알아들었어요 contains 아들 and is about hearing; 받아들였어요 contains it
#: and is about accepting. Both were counted as sentences about somebody's son
#: by the first draft of this report. A gendered word is present when nothing
#: Hangul precedes it and what follows is a particle or the end of the word.
_PARTICLE = "은|는|이|가|을|를|의|에|와|과|도|만|께|한테|에게|보다|처럼|랑|이랑|께서|씨|님"


def _names(term: str, sentence: str) -> bool:
    return re.search(f"(^|[^가-힣]){term}({_PARTICLE})?([^가-힣]|$)", sentence) is not None


def domain_of(sentence: str) -> str:
    for name, pattern in DOMAINS:
        if re.search(pattern, sentence):
            return name
    return "other"


def main() -> int:
    pack = json.loads(PACK.read_text(encoding="utf-8"))
    words = pack["words"]

    by_domain: dict[str, Counter] = defaultdict(Counter)
    headword_subject = Counter()
    invented = defaultdict(Counter)
    examples_with_person = 0

    for word in words:
        example = word.get("example") or ""
        if not example:
            continue
        male = [term for term in MALE if _names(term, example)]
        female = [term for term in FEMALE if _names(term, example)]
        if male or female:
            examples_with_person += 1
            domain = domain_of(example)
            if male:
                by_domain[domain]["m"] += 1
            if female:
                by_domain[domain]["f"] += 1
            for term in male + female:
                headword_subject[term] += 1

    # The translations are in the authored packs, not in the built one.
    for path in sorted((ROOT / "content/vocabulary/entries").glob("*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            example = entry.get("ex") or ""
            if not example or KOREAN_HAS_A_PERSON.search(example):
                continue
            for locale, markers in MARKERS.items():
                text = (entry.get("t") or {}).get(locale, "")
                if not text:
                    continue
                for gender, pattern in markers:
                    match = re.search(pattern, text)
                    if not match:
                        continue
                    if locale == "fr" and FRENCH_IMPERSONAL.search(
                        text[max(0, match.start() - 8) : match.end() + 44]
                    ):
                        continue
                    guard = ANTECEDENT.get(locale)
                    if guard and guard.search(text[: match.start()]):
                        continue
                    invented[locale][gender] += 1

    total_m = sum(counts["m"] for counts in by_domain.values())
    total_f = sum(counts["f"] for counts in by_domain.values())

    print("Who does what — the corpus counted, not judged\n")
    print(f"  {len(words):,} examples, {examples_with_person} of them naming a gendered person\n")
    print(f"  {'domain':<22}{'male':>6}{'female':>8}   balance")
    for name, _ in DOMAINS + [("other", "")]:
        counts = by_domain.get(name)
        if not counts:
            continue
        m, f = counts["m"], counts["f"]
        bar = "▏" * 0
        if m + f:
            share = round(20 * m / (m + f))
            bar = "M" * share + "·" * (20 - share)
        print(f"  {name:<22}{m:>6}{f:>8}   {bar}")
    print(f"  {'TOTAL':<22}{total_m:>6}{total_f:>8}")

    print("\n  gendered headwords, by how often an example uses them")
    for term, count in headword_subject.most_common(18):
        side = "m" if term in MALE else "f"
        print(f"    {term:<8} {side}  {count}")

    print("\n  a third person in a translation where the Korean has none")
    if not invented:
        print("    none, in any of the six languages checked")
    for locale in sorted(invented):
        counts = invented[locale]
        print(f"    {locale}   male {counts['m']}   female {counts['f']}")

    print(
        "\n  Counted, not judged. A ratio is a reason to go and read those\n"
        "  sentences; it is not a build failure, and nothing here has been read\n"
        "  by a Korean native speaker. See docs/LEVEL_TEST_KOREAN_REVIEW.md."
    )

    if "--json" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--json") + 1])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps(
                {
                    "examples": len(words),
                    "with_person": examples_with_person,
                    "by_domain": {k: dict(v) for k, v in by_domain.items()},
                    "headwords": dict(headword_subject),
                    "invented": {k: dict(v) for k, v in invented.items()},
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"\n  wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
