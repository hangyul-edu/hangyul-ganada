"""Transcribes generated clips, for the pronunciation screen.

Separate from `qa_pronunciation.py` because it is the one part of that check
with a heavy optional dependency: `faster-whisper` and a downloaded model. The
deterministic half of the check must run on a machine that has neither.

## Why clips are transcribed in batches

Whisper always processes a 30-second window, so asking it about a 600 ms word
costs the same as asking it about thirty of them. The corpus is 10,454 clips of
about a fifth of a second each; one at a time that is a day of compute, and
packed into windows it is a couple of hours.

Clips are concatenated with 800 ms of silence between them and the transcript
is cut back apart on the recogniser's own word timings. The silence is not
decoration: without it the recogniser runs the tail of one word into the head of
the next and invents a word that neither clip contains.

## Why a padded single clip is a worse test than a packed window

A 600 ms clip alone in a 30-second window of digital silence is the hardest
thing to give a recogniser — there is no prosody around it, and it returns
whatever short word is closest. The same clip in a run of neighbours is
recognised correctly. That is why the screen batches even when it does not have
to, and why a disagreement is re-listened in a batch before it is believed.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import wave
from pathlib import Path

SR = 16_000
GAP_MS = 800

_MODELS: dict[str, object] = {}


def model(size: str = "medium", threads: int | None = None):
    if size not in _MODELS:
        from faster_whisper import WhisperModel

        _MODELS[size] = WhisperModel(
            size,
            device="cpu",
            compute_type="int8",
            cpu_threads=threads or int(os.environ.get("HANGYUL_ASR_THREADS", "8")),
        )
    return _MODELS[size]


def decode(path: Path | str) -> bytes:
    """16 kHz mono PCM, via ffmpeg."""
    return subprocess.run(
        ["ffmpeg", "-v", "quiet", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True,
        check=True,
    ).stdout


def transcribe_batch(paths, size: str = "medium", threads: int | None = None) -> list[str]:
    """One transcript per path, in order."""
    if not paths:
        return []
    gap = b"\x00\x00" * int(SR * GAP_MS / 1000)
    blob = bytearray(gap)
    spans: list[tuple[float, float]] = []
    clock = GAP_MS / 1000
    for path in paths:
        pcm = decode(path)
        seconds = len(pcm) / 2 / SR
        spans.append((clock, clock + seconds))
        blob += pcm + gap
        clock += seconds + GAP_MS / 1000

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        name = handle.name
    try:
        with wave.open(name, "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(SR)
            out.writeframes(bytes(blob))
        segments, _ = model(size, threads).transcribe(
            name,
            language="ko",
            beam_size=5,
            temperature=0,
            condition_on_previous_text=False,
            word_timestamps=True,
        )
        heard: list[tuple[float, float, str]] = []
        for segment in segments:
            for word in segment.words or []:
                heard.append((word.start, word.end, word.word))
        # Each recognised word belongs to the clip its midpoint lands in. A
        # tolerance rather than strict containment, because the recogniser's
        # timings drift by a frame or two either side of the silence.
        return [
            "".join(w for (start, end, w) in heard if a - 0.25 <= (start + end) / 2 <= b + 0.25).strip()
            for a, b in spans
        ]
    finally:
        os.unlink(name)
