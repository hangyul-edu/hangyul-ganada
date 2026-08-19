"""Letter readiness — can the learner write this word yet?

Deliberately separate from `difficulty.py`, and deliberately small.

A word's *difficulty* is a fact about the word: how common it is, how many
senses it has, whether a picture can carry it. A word's *readiness* is a fact
about the learner: whether the alphabet curriculum has introduced every letter
it contains. 맛있다 is an easy word and needs ㅆ, which is taught in unit 9.
Both statements are true and neither should change the other.

## What the app does with this

It says so, and then gets out of the way:

> You know every letter in this word.
> This word uses 2 letters you haven't learned yet.

It never locks anything. Every word in the product is open from first launch,
and readiness is a note on the card rather than a gate in front of it.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from hangul import CURRICULUM_ORDER, required_letters  # noqa: E402


@dataclass(frozen=True)
class Readiness:
    #: The letters this word needs, in curriculum order.
    letters: tuple[str, ...]
    #: The position in `CURRICULUM_ORDER` of the last letter the word needs.
    #: A learner who has reached this point can write the whole word.
    ready_after: int
    #: Letters that are not in the curriculum at all. Should always be empty;
    #: the build fails if it is not.
    unknown: tuple[str, ...]


def measure(word: str) -> Readiness:
    letters = required_letters(word)
    order = {letter: index for index, letter in enumerate(CURRICULUM_ORDER)}
    unknown = tuple(letter for letter in letters if letter not in order)
    known = [order[letter] for letter in letters if letter in order]
    ordered = tuple(sorted((letter for letter in letters if letter in order), key=order.get))
    return Readiness(ordered, max(known) + 1 if known else 0, unknown)
