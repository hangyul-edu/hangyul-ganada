#!/usr/bin/env python3
"""Turns a listening screen's raw disagreements into a list worth reading.

    python3 scripts/content/triage_listening.py content-cache/listen/*.json

The screen (`qa_pronunciation.py --listen`) reports every clip whose transcript
is not what the item claims. Most of those are the recogniser rather than the
recording: it writes homophones, it normalises tense consonants, it drops an
inaudible ㅎ, and on a short isolated word it will offer a real Korean word that
sounds nothing like the clip.

So the raw output is a *candidate* list, and this is the pass that makes it a
*review* list. Two things happen here:

* the current acceptability rules are re-applied, so a screen that ran before a
  rule was tightened does not have to be run again;
* what is left is grouped by how it differs, because the differences that matter
  are not evenly distributed. A single consonant swapped for another consonant
  — ㄷ for ㅈ — is the shape of the 마디 defect. A word coming back with a
  different number of syllables is almost always the recogniser guessing at a
  clip it could not hear.

Nothing here decides anything. It orders the queue for the person who listens.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from hangul import decompose, is_syllable  # noqa: E402
from qa_pronunciation import acceptable, difference, normalise_heard  # noqa: E402

def _positions(text: str) -> list[tuple[str, str]]:
    """Every jamo with the slot it sits in — onset, vowel or coda."""
    out: list[tuple[str, str]] = []
    for ch in text:
        if not is_syllable(ch):
            continue
        initial, medial, final = decompose(ch)
        out.append(("onset", initial or ""))
        out.append(("vowel", medial or ""))
        if final:
            out.append(("coda", final))
    return out


def kind(expected: str, heard: str) -> str:
    """A short name for how these two differ. Ordering, not diagnosis.

    The slot matters more than the letter. A coda is released weakly or not at
    all — Korean neutralises seven of them into three sounds — so a recogniser
    swapping one for another says almost nothing about the recording. An
    **onset** consonant is fully articulated and is the position 마디 was wrong
    in, so a swap there goes to the front of the queue.
    """
    heard = normalise_heard(heard)
    if not heard:
        return "nothing heard"
    a, b = _positions(expected), _positions(heard)
    if len(a) != len(b) or [slot for slot, _ in a] != [slot for slot, _ in b]:
        return "different shape"
    changed = [(slot, x, y) for (slot, x), (_, y) in zip(a, b) if x != y]
    if not changed:
        return "spelling only"
    if len(changed) == 1:
        slot, x, y = changed[0]
        if slot == "onset":
            return "ONSET consonant"
        if slot == "coda":
            return "coda consonant"
        return "one vowel"
    return f"{len(changed)} letters"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--json", type=Path, default=None)
    args = parser.parse_args()

    raw: list[dict] = []
    listened = 0
    total = 0
    for path in args.reports:
        report = json.loads(path.read_text(encoding="utf-8"))
        raw += report["findings"]
        listened += report.get("listened", 0)
        total += report.get("total", 0)

    survivors = [f for f in raw if not acceptable(f["text"], f["heard"])]

    # Which words were flagged in only one of the two voices.
    #
    # This is the signature the 마디 defect had, and it is the most informative
    # thing in the whole screen. Both voices read the same text through the same
    # front end, so a word that comes back wrong in *one* of them is a fact
    # about that voice's lexicon rather than about a hard-to-hear clip; a word
    # that comes back wrong in both is usually a recogniser struggling with two
    # hundred milliseconds of isolated Korean.
    # Only meaningful once both voices have actually been listened to: the
    # screen finishes one voice before it starts the other, so a partial run
    # would mark every finding "this voice only" and mean nothing by it.
    complete = total > 0 and listened >= total
    flagged_voices: dict[str, set[str]] = {}
    for finding in survivors:
        flagged_voices.setdefault(finding["text"], set()).add(finding["voice"])

    for finding in survivors:
        finding["kind"] = kind(finding["text"], finding["heard"])
        finding["difference"] = difference(finding["text"], finding["heard"])
        finding["one_voice_only"] = complete and len(flagged_voices[finding["text"]]) == 1

    order = [
        "ONSET consonant",
        "2 letters",
        "3 letters",
        "coda consonant",
        "one vowel",
        "different shape",
        "spelling only",
        "nothing heard",
    ]
    survivors.sort(key=lambda f: (order.index(f["kind"]) if f["kind"] in order else 99, f["text"]))

    print(f"{listened:,} of {total:,} clip(s) listened to")
    if not complete:
        print("  (partial run — the one-voice-only marker needs both voices)")
    print(f"{len(raw):,} disagreed; {len(survivors):,} survive the current rules\n")
    for name, count in Counter(f["kind"] for f in survivors).most_common():
        print(f"  {count:4}  {name}")
    print()
    for finding in survivors:
        mark = "  ← this voice only" if finding["one_voice_only"] else ""
        print(
            f"  [{finding['kind']:15}] {finding['text']:10} [{finding['voice']:6}] "
            f"heard {finding['heard']!r} ({finding['difference']}){mark}"
        )

    if args.json:
        args.json.write_text(
            json.dumps(
                {"listened": listened, "total": total, "raw": len(raw), "findings": survivors},
                ensure_ascii=False,
                indent=1,
            )
            + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
