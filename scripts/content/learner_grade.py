"""The National Institute of Korean Language's learner grade, per taught word.

Reads `content/vocabulary/nikl-learner-vocabulary-2003.json` (see
`fetch_nikl_vocabulary.py` for what it is and the licence it is used under)
and answers, for a headword and its part of speech, what an independent panel
of Korean-language educators decided about it: the grade **A** (초급),
**B** (중급) or **C** (고급), and the list's own corpus frequency rank.

## How a taught word is matched

The list distinguishes homographs (모양 the noun and 모양 the bound noun; 배
three times) and the pack teaches one sense per card without saying which of
the list's rows it is. The match is therefore by headword and part of speech,
and where several rows still fit — two nouns spelled alike — the *most
frequent* is taken, on the reasoning that the sense a beginner's card
demonstrates is the sense the language uses most. Where no row has the same
part of speech the word is matched by headword alone: the list files 것 and
권 as bound nouns where the pack says noun and counter, and 미국 as a proper
noun where the pack agrees, and none of those is a different word.

A word the list does not hold gets `None`, which the level model reads as
*no evidence* — never as *rare*. The list stops at 5,965 words and this corpus
teaches 3,370, so a taught word it lacks is usually a loanword, a compound or
an expression outside its 2003 horizon (휴대폰, 이메일, 회식) rather than an
advanced one.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIST = ROOT / "content" / "vocabulary" / "nikl-learner-vocabulary-2003.json"

#: The pipeline's parts of speech, mapped to the list's. A counter is a bound
#: noun there; a proper noun is its own class in both.
POS_ALIASES = {
    "counter": ("bound noun", "noun"),
    "noun": ("noun", "bound noun"),
    "proper noun": ("proper noun", "noun"),
}


@dataclass(frozen=True)
class LearnerGrade:
    grade: str
    rank: int | None
    pos: str
    entry: str

    @property
    def usefulness(self) -> int:
        """The grade on the pack's 1–5 usefulness scale.

        A (초급) is 2, not 1: usefulness 1 is *needed in the first week* — 363
        words in the pack — and the 982-word beginner grade is wider than that.
        B is 3, C is 4. Nothing in the list is 5; the words the pack marks 5
        are, almost all, words the list does not hold.
        """
        return {"A": 2, "B": 3, "C": 4}[self.grade]


@lru_cache(maxsize=1)
def _index() -> dict[str, list[dict]]:
    document = json.loads(LIST.read_text(encoding="utf-8"))
    by_word: dict[str, list[dict]] = {}
    for row in document["words"]:
        by_word.setdefault(row["word"], []).append(row)
    return by_word


def total_ranked() -> int:
    """How many rows carry a rank — the scale the list's ranks are read against."""
    return sum(1 for rows in _index().values() for row in rows if row["rank"] is not None)


def max_rank() -> int:
    return max(row["rank"] for rows in _index().values() for row in rows if row["rank"] is not None)


def lookup(word: str, part_of_speech: str) -> LearnerGrade | None:
    rows = _index().get(word)
    if not rows:
        return None
    wanted = POS_ALIASES.get(part_of_speech, (part_of_speech,))
    same = [row for row in rows if row["pos"] in wanted]
    candidates = same or rows
    # The most frequent row; an unranked row sorts last.
    best = min(candidates, key=lambda row: (row["rank"] is None, row["rank"] or 0))
    return LearnerGrade(grade=best["grade"], rank=best["rank"], pos=best["pos"], entry=best["entry"])
