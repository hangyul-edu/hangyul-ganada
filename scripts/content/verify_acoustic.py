#!/usr/bin/env python3
"""Checks that a shipped clip is a rendering of its own text, by re-making it.

    python3 scripts/content/verify_acoustic.py --kind letter_name,letter_sound,syllable
    python3 scripts/content/verify_acoustic.py --kind word --sample 200

## What this answers that nothing else does

`qa_pronunciation.py`'s mapping layer proves the *bookkeeping* is right: this id
derives from this text, the plan and the manifest agree, one file serves one
text. What it cannot see is the inside of the file. If a clip were hand-edited,
copied from the wrong place, or left behind by an older build under a name that
has since been reused, every deterministic check would still pass.

So this re-synthesises the text with the same provider and voice and compares
the result to the file on disk — log-mel features, cepstral mean normalised,
aligned with dynamic time warping. Two renderings of the same words by the same
neural voice land around 0.010–0.015 on that measure; two *different* words land
three to eight times further apart. 마디 against a fresh 마디 measured 0.012, and
against 마지 0.079.

## What it is not

It is not a pronunciation check. Both sides come from the same engine, so an
engine that says a word wrongly says it wrongly twice and agrees with itself.
That is what `--listen` and a person are for. This one catches the file being
the wrong file.

It needs a network and the same TTS provider the clips were built with, so it is
an audit that is run and recorded rather than a gate that runs on every build.
"""

from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from speech_repairs import repair_for  # noqa: E402
from tts import get_provider, normalise  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "apps" / "web" / "public"
MANIFEST = PUBLIC / "audio" / "manifest.json"

SR = 16_000
#: Above this, two clips are not the same utterance by the same voice.
#:
#: Chosen from measurement, not from taste: re-synthesising the same text twice
#: lands at 0.010–0.015, and the closest genuinely different pair in the letter
#: set — 왜 against 외, which are the same sound in modern Korean — is 0.019.
#: 0.030 sits above every same-text pair and below every different-word pair
#: that is not a homophone.
LIMIT = 0.030


def features(path: Path):
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-v", "quiet", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True,
        check=True,
    ).stdout
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if x.size:
        envelope = np.abs(x)
        loud = np.where(envelope > max(envelope.max() * 0.02, 1e-4))[0]
        if loud.size:
            x = x[max(0, loud[0] - 160) : loud[-1] + 160]
    n_fft, hop, n_mels = 512, 160, 26
    if x.size < n_fft:
        return np.zeros((0, 13), np.float32)

    def hz_to_mel(f):
        return 2595 * np.log10(1 + f / 700)

    def mel_to_hz(m):
        return 700 * (10 ** (m / 2595) - 1)

    points = mel_to_hz(np.linspace(hz_to_mel(50), hz_to_mel(SR / 2), n_mels + 2))
    bins = np.floor((n_fft + 1) * points / SR).astype(int)
    bank = np.zeros((n_mels, n_fft // 2 + 1), np.float32)
    for m in range(1, n_mels + 1):
        left, centre, right = bins[m - 1], max(bins[m], bins[m - 1] + 1), bins[m + 1]
        right = max(right, centre + 1)
        bank[m - 1, left:centre] = (np.arange(left, centre) - left) / max(centre - left, 1)
        bank[m - 1, centre:right] = (right - np.arange(centre, right)) / max(right - centre, 1)

    window = np.hanning(n_fft).astype(np.float32)
    frames = np.lib.stride_tricks.sliding_window_view(x, n_fft)[::hop]
    power = np.abs(np.fft.rfft(frames * window, axis=1)) ** 2
    mel = np.log(power @ bank.T + 1e-10)
    k = np.arange(13)[:, None]
    j = np.arange(n_mels)[None, :]
    cepstra = mel @ np.cos(np.pi * k * (2 * j + 1) / (2 * n_mels)).astype(np.float32).T
    cepstra -= cepstra.mean(axis=0, keepdims=True)
    return cepstra / (np.linalg.norm(cepstra, axis=1, keepdims=True) + 1e-8)


def distance(a, b) -> float:
    import numpy as np

    if a.shape[0] == 0 or b.shape[0] == 0:
        return float("inf")
    cost = 1.0 - a @ b.T
    n, m = cost.shape
    acc = np.full((n + 1, m + 1), np.inf, np.float32)
    acc[0, 0] = 0
    for i in range(1, n + 1):
        acc[i, 1:] = cost[i - 1]
        row, previous = acc[i], acc[i - 1]
        for j in range(1, m + 1):
            row[j] += min(previous[j], row[j - 1], previous[j - 1])
    return float(acc[n, m] / (n + m))


def notes_mode(provider, args) -> int:
    """Do the words with a pronunciation note actually *sound* like the note?

    This is the one question a recogniser cannot answer. A note says 학교 is
    said [학꾜]; a transcript comes back as 학교 either way, because that is how
    the word is spelled and a recogniser writes words. So the clip is compared
    against a synthesis of the **spoken form** instead: if the engine applied the
    sound change, the shipped 학교 recording and a fresh 학꾜 recording are the
    same sounds and land at zero. If it read the spelling literally — which is
    the mistake the note exists to prevent — they do not.

    It is the sharpest check in this file precisely because it is asymmetric: it
    compares the clip against a text it was *not* synthesised from, and expects
    them to agree.
    """
    import json as _json

    vocabulary = _json.loads(
        (ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.json").read_text(
            encoding="utf-8"
        )
    )
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_text = {entry["text"]: entry for entry in manifest["entries"]}
    noted = [word for word in vocabulary["words"] if word.get("say")]
    if args.sample:
        random.Random(args.seed).shuffle(noted)
        noted = noted[: args.sample]

    findings: list[dict] = []
    checked = 0
    with tempfile.TemporaryDirectory() as scratch:
        for word in noted:
            entry = by_text.get(word["word"])
            if not entry:
                continue
            for voice in ("female", "male"):
                asset = entry.get(voice)
                if not asset:
                    continue
                checked += 1
                raw = Path(scratch) / "raw.mp3"
                cooked = Path(scratch) / "cooked.mp3"
                # The note's spoken form, synthesised as if it were the word.
                provider.synthesize(word["say"], provider.voice_for(voice), raw)
                normalise(raw, cooked)
                gap = distance(features(PUBLIC / asset["src"]), features(cooked))
                if gap > LIMIT:
                    findings.append(
                        {
                            "word": word["word"],
                            "say": word["say"],
                            "why": word.get("sayWhy"),
                            "voice": voice,
                            "distance": round(gap, 4),
                        }
                    )
                    print(
                        f"  {word['word']} [{voice}] does not sound like its note "
                        f"{word['say']}: {gap:.4f}"
                    )
                if checked % 25 == 0:
                    print(f"  {checked}/{len(noted) * 2}", flush=True)

    print(f"checked {checked} clip(s) against their pronunciation note; {len(findings)} differ")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            _json.dumps({"limit": LIMIT, "checked": checked, "findings": findings}, ensure_ascii=False, indent=1)
            + "\n",
            encoding="utf-8",
        )
    return 1 if findings else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--notes", action="store_true", help="Check clips against their pronunciation note")
    parser.add_argument("--kind", default="letter_name,letter_sound,syllable")
    parser.add_argument("--sample", type=int, default=0, help="Check N random clips of that kind")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--provider", default=None)
    parser.add_argument("--json", type=Path, default=None)
    args = parser.parse_args()

    provider = get_provider(args.provider)
    if args.notes:
        return notes_mode(provider, args)

    kinds = set(args.kind.split(","))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = [entry for entry in manifest["entries"] if entry["kind"] in kinds]
    if args.sample:
        random.Random(args.seed).shuffle(entries)
        entries = entries[: args.sample]

    findings: list[dict] = []
    checked = 0
    with tempfile.TemporaryDirectory() as scratch:
        for entry in entries:
            for voice in ("female", "male"):
                asset = entry.get(voice)
                if not asset:
                    continue
                checked += 1
                repair = repair_for(entry["text"], voice)
                raw = Path(scratch) / "raw.mp3"
                cooked = Path(scratch) / "cooked.mp3"
                provider.synthesize(
                    (repair.text_override if repair else None) or entry["text"],
                    provider.voice_for(voice, alternate=bool(repair and repair.use_alternate_voice)),
                    raw,
                )
                normalise(raw, cooked)
                gap = distance(features(PUBLIC / asset["src"]), features(cooked))
                if gap > LIMIT:
                    findings.append(
                        {"id": entry["id"], "text": entry["text"], "voice": voice, "distance": round(gap, 4)}
                    )
                    print(f"  {entry['text']} [{voice}] differs from a fresh rendering: {gap:.4f}")
                if checked % 25 == 0:
                    print(f"  {checked}/{len(entries) * 2}", flush=True)

    print(f"checked {checked} clip(s); {len(findings)} differ from a fresh rendering")
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps({"limit": LIMIT, "checked": checked, "findings": findings}, ensure_ascii=False, indent=1)
            + "\n",
            encoding="utf-8",
        )
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
