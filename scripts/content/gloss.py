"""What an English meaning has to look like before a beginner sees it.

The other seven languages are hand-written in the editorial pack. English was
not: it fell through to the first Wiktionary sense, because English is the
dictionary's own language and the gloss is right there. That is how the default
interface language ended up with the *worst* meanings in the product — 저
glossed "written by...", 그녀 glossed "girlfriend; crush", 나 glossed "I, me;
the first-person singular plain (non-polite) pronoun".

A dictionary gloss and a beginner's meaning are different objects. A gloss is
written for someone who already knows the word and wants its senses enumerated;
a meaning is written for someone meeting it for the first time and needs exactly
one. This module is the line between them, and `build_vocabulary.py` refuses to
build a word that is on the wrong side of it — so an English meaning can only
ship by being written, the same as the other seven.

The rules are all shape rules. Shape cannot catch a meaning that is simply the
wrong sense, and no rule here would have caught 그녀 → "girlfriend"; that came
out of reading them. What shape *can* do is stop the class of gloss that is
recognisably a dictionary entry rather than a meaning, which is most of them.
"""

from __future__ import annotations

import re

#: A meaning longer than this is a definition. The card gives it one line under
#: the picture, and a beginner reads the first clause anyway.
MAX_CHARS = 45

#: Terms that only appear when a dictionary is talking about the word rather
#: than saying what it means. A learner in week one does not know what an
#: adnominal is, and does not need to in order to learn 크다.
JARGON = re.compile(
    r"(first-person|second-person|third-person|non-polite|honorific"
    r"|plain form|alternative (form|spelling)|synonym of|obsolete|archaic"
    r"|a surname|chinese character|hanja|sino-korean|romani[sz]ation"
    r"|counter for|prefix|suffix|particle used|literally|abbreviation of"
    r"|see also|\bcf\b|attributive|adnominal|copula|classifier)",
    re.I,
)

#: The one parenthetical that earns its place: English has no bare adjective
#: form for 좋다, and "(to be) good" is how every Korean textbook writes it.
_ALLOWED_PAREN = re.compile(r"\((to be)\)", re.I)
_PAREN = re.compile(r"\([^)]*\)")


def problems(word: str, part_of_speech: str, meaning: str) -> list[str]:
    """Everything wrong with this meaning, named. Empty means it can ship."""
    found: list[str] = []
    text = meaning.strip()

    if not text:
        found.append("empty")
        return found
    if len(text) > MAX_CHARS:
        found.append(f"{len(text)} characters, limit {MAX_CHARS}")
    if ";" in text:
        # A semicolon is a dictionary enumerating senses. Pick one.
        found.append("more than one sense")
    if text.count(",") > 1:
        found.append("a list of synonyms")
    if JARGON.search(text):
        found.append("grammatical jargon")
    if text.rstrip().endswith(("...", "…")):
        found.append("trails off")
    if _PAREN.sub("", _ALLOWED_PAREN.sub("", text)) != _ALLOWED_PAREN.sub("", text):
        found.append("a parenthetical aside")
    if part_of_speech in ("verb", "adjective") and word.endswith("다"):
        # Every Korean dictionary headword is an infinitive, and the meaning
        # should read as one — "to go", not "go" and not "going". Adjectives use
        # the "(to be) X" convention, which starts with "to be" too.
        if not text.lower().startswith("to "):
            found.append("a -다 headword whose meaning is not an infinitive")

    return found
