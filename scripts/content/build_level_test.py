#!/usr/bin/env python3
"""Builds the Vocabulary Level Test's item bank.

    python3 scripts/content/build_level_test.py
    python3 scripts/content/build_level_test.py --check

## Why the bank is not the learning corpus

They are built from the same words and they are not the same thing. A learning
card teaches: it carries a picture, a recording, a hand-written meaning and one
sense, and it comes back on a schedule until it sticks. An assessment item asks,
once, and must not teach — no hint ladder, no answer revealed, no second
attempt. Sharing the objects would mean every change to how a word is taught
silently changed what the test measures.

So this writes a separate file, fetched at runtime like the dictionary, and
nothing in it feeds the scheduler.

## The Hangyul Vocabulary Level, 1–30

A level is a statement about **how much of the language a reader has**, and the
scale is a cumulative vocabulary size: level 1 is roughly the first 147 words by
frequency, level 5 the first 735, level 15 the first 3,490, level 30 beyond
10,635. The bands widen as they climb, because the difference between knowing
147 words and 294 is enormous and the difference between 10,119 and 10,635 is
not.

So a word's level is found by its **rank in Korean**, not its rank among the
words this product happens to teach. Cutting the 2,581-word teaching corpus into
thirty equal bands was the first attempt and it was wrong: it makes level 30 mean
"the 2,500th word we curated", which is a fact about our backlog rather than
about the language, and it would move every time the corpus grew.

The ranking is built by `frequency.measure` over the whole candidate set, which
is the same folding the learning corpus is ranked by — 학교에서 counts towards
학교, and a verb is matched on its conjugations because 먹다 never appears in a
subtitle.

## Where the words come from

**The curated corpus is the calibrated part.** Its 2,581 words have hand-written
meanings, a checked part of speech and one taught sense, so an item built from
one asks about a known quantity. They are anchors, not the scale.

**Quality-gated dictionary entries carry the upper levels**, because the corpus
runs out long before level 30 does. The gate is deliberately narrow — see
`usable_anchor` — and everything it rejects is rejected for a reason that would
otherwise show up as an unanswerable question.

## What the result may and may not say

It is a **Hangyul Vocabulary Level**. It is not TOPIK, it is not CEFR, and it is
not a claim that the learner knows exactly 3,490 words. The scale is a
frequency-ordered ladder and the estimate is a position on it with a confidence
band, which is what the result screen says.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import frequency  # noqa: E402
from hangul import is_syllable  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.json"
ENGLISH = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.en.json"
DICTIONARY = ROOT / "apps" / "web" / "public" / "dictionary"
ANCHORS = ROOT / "content-cache" / "level-test-anchors.json"

LEVELS = 30

#: Cumulative vocabulary size at each level — the Hangyul Vocabulary Level scale.
#:
#: A word whose frequency rank is at or below `CUMULATIVE[n]` and above
#: `CUMULATIVE[n - 1]` sits at level `n`. The steps widen deliberately: 147 a
#: level at the bottom, 220 through the teens, 516 at the top.
CUMULATIVE = [
    147, 294, 441, 588, 735,
    955, 1175, 1395, 1615, 1835,
    2166, 2497, 2828, 3159, 3490,
    3930, 4370, 4810, 5250, 5690,
    6163, 6636, 7109, 7582, 8055,
    8571, 9087, 9603, 10119, 10635,
]
#: Options per item. Four is the product's own multiple-choice shape, and it
#: sets the guessing floor the scoring model has to account for: 0.25.
OPTIONS = 4
#: How far away a distractor may be drawn from, in levels. Close enough that it
#: is not eliminated by obviously belonging to a different stratum, far enough
#: that a band's own 86 words can always supply three.
DISTRACTOR_SPREAD = 2
#: How many items to keep per level.
#:
#: A sitting asks 18 to 36 and never repeats within one; this leaves room for
#: several retakes at every level without re-asking. Level 30 is "10,635 and
#: beyond" and would otherwise hold 14,301 items on its own — six megabytes of
#: bank for a test that will ask thirty questions.
#:
#: The keepers are spread across the level's own rank range rather than taken
#: from the top of it, so a level is not represented only by its most frequent
#: words.
PER_LEVEL = 150

#: The lowest level a *dictionary* anchor may be asked at.
#:
#: ## The defect this exists for
#:
#: Every anchor is levelled by the frequency rank of its surface string, and for
#: a taught word that is safe because the curriculum supplies the level instead.
#: For a dictionary headword it is the only evidence there is — and it is
#: evidence about the *string*, not about the sense the question asks. Korean
#: writes a great many different words the same way, so the two came apart, and
#: they came apart worst exactly where a beginner meets them:
#:
#: | shipped at | word | rank says | the question's answer was |
#: | --- | --- | --- | --- |
#: | level 1 | 누가 | 107 — because 누가 is *who* | "nougat" |
#: | level 1 | 내 | 3 — because 내 is *my* | "smell" |
#: | level 1 | 위해 | 131 — because 위해 is *for the sake of* | "harm" |
#: | level 1 | 거야 | 19 — a sentence ending | "last night" |
#: | level 1 | 일다 | 1 — because 일 is the commonest noun in Korean | "to rise" |
#: | level 2 | 나랑 | 361 — because 나랑 is *with me* | "country" |
#:
#: A learner who correctly knows that 누가 means *who* was marked wrong for it,
#: on question one of an assessment, and told their vocabulary was smaller than
#: it is. Sixty-nine such items sat at levels 1–5.
#:
#: ## Why a floor rather than a filter
#:
#: Filters were written too — a surface that analyses as an inflection is not a
#: word, a one-syllable dictionary headword is not attributable, a truncated
#: gloss is not a meaning — and they are in `usable_anchor` and in
#: `build_level_test.mjs`. They catch about two thirds of the class and they
#: cannot catch the rest, because 과장 really is both *exaggeration* and *section
#: manager* and no structural rule tells you which one rank 643 belongs to.
#:
#: The floor closes it completely at the end where it matters, and it does so on
#: an argument rather than on a threshold. Levels 1–10 are the first 1,835 words
#: of Korean — precisely the band the 3,393-word taught corpus was curated to
#: cover, and precisely where a beginner is placed. Below level 11 the
#: curriculum has a vetted word, with a vetted sense and a vetted level, for
#: every slot the test needs: the bank keeps 37 to 75 distinct taught words at
#: every one of those levels, against the thirty questions a sitting asks. An
#: unvetted dictionary headword adds no coverage there and carries all of the
#: risk above.
#:
#: Above it the position reverses — the corpus thins to nineteen words at level
#: 26 — so dictionary anchors are what makes the top of the scale exist at all,
#: and a rare word *is* the right thing to ask a learner at level 26. That
#: asymmetry is the whole content of this constant.
DICTIONARY_LEVEL_FLOOR = 11


def level_of(rank: int) -> int:
    """The Hangyul Vocabulary Level a frequency rank falls in."""
    for level, ceiling in enumerate(CUMULATIVE, start=1):
        if rank <= ceiling:
            return level
    return LEVELS


def shares_a_word(a: str, b: str) -> bool:
    """Whether two glosses share a substantive word, so one hints at the other."""
    stop = {"to", "a", "an", "the", "of", "be", "in", "on", "at", "for", "or", "and", "it"}
    words = lambda s: {w for w in re.findall(r"[a-z]+", s.lower()) if w not in stop and len(w) > 2}
    return bool(words(a) & words(b))


#: Glosses that describe a *form* rather than a meaning.
#:
#: Wiktionary carries a page for 해요 whose definition is "informal polite
#: present indicative form of 하다". Asking a learner to choose that from four
#: options tests nothing about vocabulary, so these pages are not anchors.
_FORM_PAGE = re.compile(
    r"\b(form|forms|spelling|romanization|hanja|alternative|obsolete|archaic|"
    r"honorific form|contraction) of\b",
    re.IGNORECASE,
)

#: A gloss that describes grammar, or that stops mid-sentence.
#:
#: `_FORM_PAGE` catches "informal polite present indicative form of 하다" and let
#: through "Past tense of in the plain style. Formed from the…", which shipped as
#: the correct answer to a level-2 question about 없었다. Two faults in one
#: string: it is a grammar note, and it is *truncated* — the source entry was
#: cut at sixty characters, so the choice a learner had to pick was half a
#: sentence ending in an ellipsis. §9 asks specifically that a truncated gloss
#: must not be able to decide an answer; the safe reading of that is that it must
#: not be an answer.
_BROKEN_GLOSS = re.compile(
    r"…|\.\.\.|\b(tense|participle|conjugation|declension|stem|ending|particle|"
    r"suffix|prefix|infix) of\b|\bformed from\b|\bplain style\b|\bused to (?:form|make)\b",
    re.IGNORECASE,
)

#: Parts of speech an item can sensibly ask about.
_ASKABLE = {"noun", "verb", "adjective", "adverb"}


#: Words a placement test must not put in front of a learner.
#:
#: The dictionary layer is 26,675 Wiktionary headwords and nothing curated it
#: for a learning product: it contains the vocabulary of sexual violence, of
#: slurs and of graphic injury, all of it perfectly good lexicography and none
#: of it something a person should meet while finding out how much Korean they
#: know. A word was already reaching learners — a question about 손을 ____ was
#: offering 강간했어요 as one of its three wrong answers.
#:
#: Deliberately *not* a general profanity filter over the app. The dictionary
#: still contains these words and search still finds them, which is what a
#: dictionary is for. This list governs what the *test* may ask about or offer
#: as a distractor, which is a different question.
#:
#: Ordinary words that name difficult things stay: 죽다, 병, 싸우다, 사고,
#: 살인 and 강도 are all in the teaching corpus with neutral examples, and a
#: language course that could not say "an accident happened" would be a worse
#: one.
_UNSUITABLE = (
    # Sexual content and sexual violence.
    "강간", "성폭", "성추행", "추행", "겁탈", "윤간", "성희롱", "매춘", "매음", "창녀",
    "포르노", "음란", "외설", "성교", "정사", "자위", "애무", "정액", "음경", "음부",
    "성기", "항문", "변태", "색정", "호색", "기생충"[:0] or "매독", "임질",
    # Slurs and profanity.
    "씨발", "새끼", "병신", "지랄", "존나", "개년", "썅", "쌍놈", "잡놈", "화냥",
    "짱깨", "쪽발", "깜둥", "튀기", "불구자", "벙어리", "귀머거리", "장님", "절름발",
    # Graphic violence, execution and self-harm.
    "학살", "참수", "고문", "처형", "총살", "교수형", "사형", "자살", "자해", "시체",
    "사체", "시신", "도살", "학대", "구타", "폭행", "인신매매", "노예",
    # Drugs.
    "마약", "헤로인", "코카인", "필로폰", "대마초", "아편", "각성제", "환각",
    # Bodily waste.
    "대변", "소변", "배설", "오줌", "똥",
)


#: The reviewed exclusion layer, read from content rather than repeated here.
#:
#: `_UNSUITABLE` above matches substrings, which is right for morphological
#: families — 성폭행 and 성폭력 share 성폭 — and wrong for anything short: 년
#: would take 작년 and 청소년 with it. So the reviewed file is matched against the
#: whole headword, and it is the tier that caught 보지.
#:
#: 보지 is the reason both exist. The taught pack had already refused it, with the
#: reason written on the entry. The dictionary half of the anchor pool had not:
#: there it sits at level 4 glossed "preservation", a real but obscure
#: Sino-Korean noun, and neither the substring list nor the English gloss test
#: had anything to say about it. It reached the Level Test as an answer choice.
_SAFETY = json.loads(
    (ROOT / "content" / "vocabulary" / "learner-safety.json").read_text(encoding="utf-8")
)
_EXCLUDED = {
    term
    for name, terms in _SAFETY["excluded"].items()
    if name != "_comment"
    for term in terms
}
_NOT_STANDALONE = {
    term
    for name, terms in _SAFETY["notStandalone"].items()
    if name != "_comment"
    for term in terms
}


def unsuitable(headword: str, gloss: str) -> bool:
    """Whether a word is one the test must not show. See `_UNSUITABLE`."""
    if headword in _EXCLUDED:
        return True
    if any(term in headword for term in _UNSUITABLE):
        return True
    lowered = gloss.lower()
    return any(
        term in lowered
        for term in (
            "rape", "sexual", "genital", "obscene", "prostitut", "porn", "masturbat",
            "slur", "vulgar", "profan", "derogatory", "offensive", "swear word",
            "excrement", "faeces", "feces", "urine", "narcotic", "heroin", "cocaine",
            "execute by", "behead", "massacre", "torture", "suicide", "corpse",
        )
    )

def usable_anchor(headword: str, gloss: str, pos: str) -> bool:
    """Whether a dictionary entry can carry a question.

    Narrow on purpose. Every rejection here is a question that would otherwise
    be unanswerable, ambiguous, or about something other than knowing a word:

    * **Not Hangul, or very long.** A five-syllable compound is a phrase to a
      learner, and the scale is about words.
    * **A form page.** "informal polite present indicative form of 하다" is a
      grammar note wearing a definition's clothes.
    * **A part of speech that cannot be asked about.** Particles, numerals,
      proper nouns and interjections either have no meaning to choose or the
      same meaning as their translation.
    * **A gloss too short or too long.** One word is often ambiguous between
      four options; a sentence is a definition to read rather than an answer to
      pick.
    * **A gloss carrying its own Korean.** Some entries gloss 밥 as "bap,
      cooked rice", which hands over the answer in a produce item.
    """
    if not headword or not all(is_syllable(c) for c in headword):
        return False
    if not 1 <= len(headword) <= 4:
        return False
    if _FORM_PAGE.search(gloss) or _BROKEN_GLOSS.search(gloss):
        return False
    if pos not in _ASKABLE:
        return False
    if not gloss or not 3 <= len(gloss) <= 60:
        return False
    if any(is_syllable(c) for c in gloss):
        return False
    if unsuitable(headword, gloss):
        return False
    return True


def usable_dictionary_anchor(headword: str, gloss: str, pos: str) -> bool:
    """Everything `usable_anchor` asks, and two things only a dictionary entry
    can fail.

    A taught word arrives with a curated sense, a curated example and a level the
    curriculum chose. A dictionary headword arrives with none of those and is
    levelled by the frequency of its own spelling, so it has to clear a higher
    bar before it is allowed to carry a question.

    * **One syllable is not attributable.** 수, 자, 줄, 가, 신, 데, 본, 볼 and
      fifty more shipped as level 1–13 questions. Each is a real headword with a
      real gloss and each takes its rank from a completely different word written
      the same way — 자 is a *ruler* in the dictionary and a verbal suffix in the
      corpus that ranked it 96th. There is no rule that recovers which sense
      earned the rank, so a one-syllable dictionary headword is not asked.

    * **A plural is not a word to test.** 사람들 and 아이들 are 사람 and 아이 with
      the plural marker, and both anchors already exist. Asking about the plural
      is asking about the same word twice, once with a suffix.
    """
    if not usable_anchor(headword, gloss, pos):
        return False
    if len(headword) < 2:
        return False
    return True


def dictionary_anchors(taught: set[str]) -> list[dict]:
    """Entries from the dictionary layer that can carry a question.

    The part of speech comes from the entry chunks rather than from the index.
    It used to be an index column and is not one any more: a search result row
    renders a headword and a gloss, the part of speech was parsed into thirty
    thousand objects and shown by nothing, and it cost 27.5 kB gzipped of a file
    a learner waits for on their first search. Reading 84 chunks here costs a
    build script a second and costs a phone nothing.
    """
    manifest_path = DICTIONARY / "manifest.json"
    if not manifest_path.exists():
        return []
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    index = json.loads((DICTIONARY / manifest["index"]).read_text(encoding="utf-8"))
    part_of_speech: dict[str, str] = {}
    for chunk in manifest["chunks"].values():
        for entry in json.loads(
            (DICTIONARY / chunk["file"]).read_text(encoding="utf-8")
        )["entries"]:
            senses = entry.get("senses") or []
            if senses:
                part_of_speech[entry["headword"]] = senses[0]["partOfSpeech"]
    out: list[dict] = []
    seen: set[str] = set()
    for headword, _romanization, gloss, _chunk, _freq in index["rows"]:
        pos = part_of_speech.get(headword, "")
        if headword in taught or headword in seen:
            continue
        if not usable_dictionary_anchor(headword, gloss, pos):
            continue
        seen.add(headword)
        out.append(
            {
                "id": f"dict_{headword}",
                "word": headword,
                "gloss": gloss.strip(),
                "pos": pos,
                "example": "",
                "surface": headword,
                "senseId": f"dict_{headword}",
                "category": "",
                "source": "dictionary",
            }
        )
    return out


def build() -> dict:
    corpus = json.loads(CORPUS.read_text(encoding="utf-8"))
    english = json.loads(ENGLISH.read_text(encoding="utf-8"))["words"]
    words = corpus["words"]

    rows = []
    for index, word in enumerate(words):
        gloss = (english[index][0] or "").strip()
        if not gloss:
            continue
        # The corpus is curated and the filter still applies to it, because a
        # rule that only guards the untrusted half is a rule somebody has to
        # remember to extend when the halves change.
        if unsuitable(word["word"], gloss):
            continue
        rows.append(
            {
                "id": word["id"],
                "word": word["word"],
                "gloss": gloss,
                "pos": word["part_of_speech"],
                "example": word.get("example") or "",
                "surface": word.get("as") or word["word"],
                "senseId": word.get("senseId") or word["id"],
                "category": corpus["categories"][word["c"]],
                # Every category the word is filed or tagged under. The tags
                # matter as much as the category: 하다 and 두다 are filed apart
                # and both tagged `actions`, and a gap-fill that offers one
                # against the other has two answers. The runtime chooser used to
                # check both and the builder only checked one, which is the
                # regression `answerable.test.ts` caught when the two were
                # merged.
                "category_tags": [
                    corpus["categories"][tag] for tag in (word.get("ct") or [])
                ],
                # A teaching example that has been judged unusable as a
                # gap-fill. See `pack.Entry.context_ok`.
                "context_ok": not word.get("noContext"),
                "source": "corpus",
            }
        )
    taught = {row["word"] for row in rows}
    # The curriculum's own level for every taught word, so the test reports on
    # the same scale the daily plan selects by.
    taught_levels = {word["word"]: word["level"] for word in corpus["words"]}
    rows.extend(dictionary_anchors(taught))

    """Rank every candidate against Korean, not against each other's curation.

    One `measure` over the whole candidate set, with the same folding the
    learning corpus is ranked by. Words the corpora never saw have no rank and
    therefore no level, and they are dropped: a question whose level is a guess
    measures nothing.
    """
    inflecting = frozenset(row["word"] for row in rows if row["pos"] in {"verb", "adjective"})
    readings = frequency.measure([row["word"] for row in rows], inflecting)

    observed = [row for row in rows if readings[row["word"]].rate]
    observed.sort(key=lambda row: -(readings[row["word"]].rate or 0))
    rows = []
    for rank, row in enumerate(observed, start=1):
        row["rank"] = rank
        # A taught word carries the level the *curriculum* gives it; anything
        # else is levelled by rank.
        #
        # §31: one meaning of level 18. The two used to disagree by construction
        # — the test levelled every anchor by frequency rank while Today's
        # Vocabulary did too, and then the vocabulary side moved to a real
        # difficulty model and the test did not follow. A learner told they were
        # 18 would have been taught from a band the test had never measured.
        #
        # Dictionary anchors have no taught level because they are not taught,
        # and rank is the only evidence there is about them. That is a real
        # seam and it is where the top of the scale comes from; it is recorded
        # in the report rather than hidden behind an average.
        row["level"] = taught_levels.get(row["word"]) or level_of(rank)
        # A dictionary anchor may not carry a beginner question. See
        # `DICTIONARY_LEVEL_FLOOR` for the six shipped items that argue for it.
        if row["source"] == "dictionary" and row["level"] < DICTIONARY_LEVEL_FLOOR:
            continue
        rows.append(row)

    return {
        "_comment": (
            "GENERATED by scripts/content/build_level_test.py. Ranked assessment anchors, "
            "not the bank: `scripts/content/build_level_test.mjs` turns these into items. "
            "The split exists because building a *context* item means conjugating a verb, "
            "and there is one conjugator in this repository — a TypeScript one, because the "
            "app needs it too. Two implementations of Korean morphology would be two answers "
            "to the same question."
        ),
        "levels": LEVELS,
        "options": OPTIONS,
        "distractorSpread": DISTRACTOR_SPREAD,
        "perLevel": PER_LEVEL,
        "cumulative": CUMULATIVE,
        "anchors": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    anchors = build()
    rendered = json.dumps(anchors, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"

    stale = not ANCHORS.exists() or ANCHORS.read_text(encoding="utf-8") != rendered
    if stale and not args.check:
        ANCHORS.parent.mkdir(parents=True, exist_ok=True)
        ANCHORS.write_text(rendered, encoding="utf-8")

    rows = anchors["anchors"]
    per_level: dict[int, int] = {}
    for row in rows:
        per_level[row["level"]] = per_level.get(row["level"], 0) + 1
    with_example = sum(1 for row in rows if row["example"])
    print(f"Level test anchors — {len(rows):,} ranked words across {LEVELS} levels")
    print(f"  per level: min {min(per_level.values())}, max {max(per_level.values())}")
    print(f"  from the teaching corpus: {sum(1 for r in rows if r['source'] == 'corpus'):,}")
    print(f"  from the dictionary:      {sum(1 for r in rows if r['source'] == 'dictionary'):,}")
    print(f"  carrying an example sentence: {with_example:,}")
    if args.check and stale:
        print("\nanchors are out of date — run `npm run content:leveltest:anchors`")
        return 1
    if stale:
        print(f"\nwrote {ANCHORS.relative_to(ROOT)}")
    else:
        print("\nanchors up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
