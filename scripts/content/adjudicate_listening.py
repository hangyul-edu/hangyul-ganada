#!/usr/bin/env python3
"""Settles what a listening finding actually is.

    python3 scripts/content/triage_listening.py content-cache/listen/w?.json --json triage.json
    python3 scripts/content/adjudicate_listening.py triage.json --json verdicts.json

A disagreement between a clip and its word has exactly three causes, and they
need three different fixes:

| Cause | What it looks like | Fix |
| --- | --- | --- |
| The recogniser misheard | a better model, or the same clip among neighbours, agrees with the word | nothing — close it |
| The file is not the right file | the clip does not match a fresh synthesis of its own text | the mapping or the build |
| The engine says the word wrongly | the clip *does* match a fresh synthesis, and a recogniser still hears something else | a repair in `speech_repairs.py`, after a person listens |

Three measurements are taken, and none of them is a judgement:

* **Re-listening**, with the larger model and with three known-good clips packed
  around the flagged one. A 200 ms word alone in thirty seconds of silence is the
  hardest thing a recogniser is ever given, and most findings do not survive
  being asked properly.
* **Acoustic identity.** The text is re-synthesised and compared to the file
  (log-mel, cepstral mean normalised, dynamic time warping). This provider is
  deterministic: a correct clip scores 0.000–0.015 against a fresh rendering of
  its own text. Anything above :data:`verify_acoustic.LIMIT` is not that text.

* **Separation.** The expected word and the word the recogniser heard are both
  synthesised, in this voice and in the other one, and the distance between them
  is measured. This is the closest thing to a machine signal for the third row:
  the male voice renders 마디 and 마지 0.029 apart where the female voice renders
  the same pair 0.073 apart, which is what "this voice does not distinguish these
  two words" looks like as a number. It is also why 년 heard as 면 is *not* that:
  those two are 0.019 apart in the voice that was flagged, so a recogniser
  mishearing them says nothing about the recording.

The third row is the one that needs a person, and it is the row 마디 was in. This
script orders those findings by how suspicious the separation is; it does not
decide them. A machine comparing an engine against itself cannot hear that a
rendering is wrong, and this file will not pretend otherwise.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from qa_pronunciation import acceptable  # noqa: E402
from speech_repairs import repair_for  # noqa: E402
from tts import get_provider, normalise  # noqa: E402
from verify_acoustic import LIMIT, distance, features  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "apps" / "web" / "public"
MANIFEST = PUBLIC / "audio" / "manifest.json"

#: Clips packed around a flagged one so the recogniser has something to hold on
#: to. Ordinary words, correct in both voices, verified acoustically.
NEIGHBOURS = ("사람", "학교", "시간", "오늘")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("triage", type=Path)
    parser.add_argument("--model", default="medium")
    parser.add_argument("--limit", type=int, default=0, help="Only the first N findings")
    parser.add_argument("--json", type=Path, default=None)
    args = parser.parse_args()

    from listening import transcribe_batch

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_text = {entry["text"]: entry for entry in manifest["entries"]}

    findings = json.loads(args.triage.read_text(encoding="utf-8"))["findings"]
    if args.limit:
        findings = findings[: args.limit]

    provider = get_provider()
    verdicts: list[dict] = []
    counts = {"recogniser": 0, "wrong file": 0, "needs a person": 0, "unheard": 0}

    with tempfile.TemporaryDirectory() as scratch:
        for finding in findings:
            text, voice = finding["text"], finding["voice"]
            entry = by_text.get(text)
            if not entry or not entry.get(voice):
                continue
            clip = PUBLIC / entry[voice]["src"]

            # Re-listen, with company.
            batch = [clip] + [
                PUBLIC / by_text[name][voice]["src"] for name in NEIGHBOURS if name in by_text
            ]
            heard = transcribe_batch(batch, size=args.model)[0]

            # Is it a rendering of its own text at all?
            repair = repair_for(text, voice)
            raw = Path(scratch) / "raw.mp3"
            cooked = Path(scratch) / "cooked.mp3"
            provider.synthesize(
                (repair.text_override if repair else None) or text,
                provider.voice_for(voice, alternate=bool(repair and repair.use_alternate_voice)),
                raw,
            )
            normalise(raw, cooked)
            gap = distance(features(clip), features(cooked))

            separation: dict[str, float] = {}
            if gap <= LIMIT and heard.strip() and not acceptable(text, heard):
                # Only for the findings that survive both other measurements:
                # four more syntheses per finding is not worth spending on a
                # finding that is already explained.
                for other in ("female", "male"):
                    pair = []
                    for candidate, tag in ((text, "want"), (heard, "got")):
                        one = Path(scratch) / f"{other}-{tag}.raw.mp3"
                        two = Path(scratch) / f"{other}-{tag}.mp3"
                        provider.synthesize(candidate, provider.voice_for(other), one)
                        normalise(one, two)
                        pair.append(features(two))
                    separation[other] = round(distance(*pair), 4)

            if gap > LIMIT:
                verdict = "wrong file"
            elif acceptable(text, heard):
                verdict = "recogniser"
            elif not heard.strip():
                verdict = "unheard"
            else:
                verdict = "needs a person"
            counts[verdict] += 1
            verdicts.append(
                {
                    **finding,
                    "reheard": heard,
                    "identity": round(gap, 4),
                    "separation": separation,
                    "verdict": verdict,
                }
            )
            gap_note = ""
            if separation:
                mine = separation.get(voice, 0.0)
                theirs = separation.get("male" if voice == "female" else "female", 0.0)
                gap_note = f", separation {mine:.4f} here vs {theirs:.4f} in the other voice"
            print(
                f"  [{verdict:14}] {text:10} [{voice:6}] first {finding['heard']!r} → "
                f"again {heard!r}, identity {gap:.4f}{gap_note}",
                flush=True,
            )

    print()
    for name, count in counts.items():
        print(f"  {count:4}  {name}")
    people = [v for v in verdicts if v["verdict"] == "needs a person"]
    people.sort(key=lambda v: v["separation"].get(v["voice"], 1.0))
    if people:
        print("\n  listen to these first — least separated in the flagged voice:")
        for verdict in people[:12]:
            mine = verdict["separation"].get(verdict["voice"], 0.0)
            other = "male" if verdict["voice"] == "female" else "female"
            print(
                f"    {verdict['text']:10} [{verdict['voice']:6}] heard {verdict['reheard']!r} — "
                f"{mine:.4f} here, {verdict['separation'].get(other, 0.0):.4f} in {other}"
            )
    print(
        "\n'needs a person' is the 마디 class: the file is a faithful rendering of its own\n"
        "text and a recogniser still hears something else. Listen to those."
    )
    if args.json:
        args.json.write_text(
            json.dumps({"counts": counts, "verdicts": verdicts}, ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
