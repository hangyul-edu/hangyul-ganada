#!/usr/bin/env python3
"""Generates the bundled pronunciation audio.

    npm run audio:plan                          # list what needs saying
    python3 scripts/content/generate_audio.py   # say it, both voices
    python3 scripts/content/qa_audio.py         # check what came back

Reads ``content-cache/speech-plan.json`` and writes one normalised MP3 per clip
per voice into ``apps/web/public/audio/``, plus the manifest the app loads.

Existing clips are left alone unless ``--force`` is passed, so adding twenty
words to the curriculum costs twenty seconds rather than an hour. That also
means a run interrupted halfway resumes rather than restarting.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from speech_repairs import REPAIRS, repair_for  # noqa: E402
from tts import (  # noqa: E402
    PROVIDERS,
    SPEECH_RATE,
    TtsProvider,
    get_provider,
    normalise,
    probe_duration_ms,
    rate_percent,
)

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "content-cache" / "speech-plan.json"
AUDIO_ROOT = ROOT / "apps" / "web" / "public" / "audio"
MANIFEST = AUDIO_ROOT / "manifest.json"

#: Where this run writes.
#:
#: Normally the shipped directory. `--out` points it somewhere else, which is
#: what a *voice change* needs: the old corpus keeps working while the new one
#: is generated and checked beside it, and the switch is one directory move
#: after both voices have passed. Replacing 10,550 files in place and then
#: finding a problem would leave the product with no audio at all.
_out_root = AUDIO_ROOT


def audio_root() -> Path:
    return _out_root

VOICES = ("female", "male")

#: Where each kind of clip lives. Splitting by kind keeps a directory listing
#: readable and lets a future build ship, say, sentences as a separate download.
KIND_DIRS = {
    "letter_name": "letters",
    "letter_sound": "letters",
    "syllable": "syllables",
    "word": "vocabulary",
    "sentence": "sentences",
}


def destination(kind: str, voice: str, clip_id: str) -> Path:
    return audio_root() / KIND_DIRS[kind] / voice / f"{clip_id}.mp3"


def relative_src(path: Path) -> str:
    """The path the app asks for: always `audio/...`, whatever `--out` was."""
    return f"audio/{path.relative_to(audio_root()).as_posix()}"


def synthesize_one(
    provider: TtsProvider,
    entry: dict,
    voice: str,
    *,
    force: bool,
    attempts: int = 3,
) -> tuple[str, str, dict | None, str | None]:
    """Returns (id, voice, asset-or-None, error-or-None)."""
    target = destination(entry["kind"], voice, entry["id"])
    if target.exists() and target.stat().st_size > 0 and not force:
        return entry["id"], voice, describe(target), None

    # A word this voice is known to say wrongly is synthesised differently —
    # a different voice of the same gender, or different text handed to the
    # engine. The clip's id, its file and the word on screen are unchanged; only
    # the way the sound was obtained is. See `speech_repairs.py`.
    repair = repair_for(entry["text"], voice)
    spoken_text = (repair.text_override if repair else None) or entry["text"]
    voice_name = provider.voice_for(voice, alternate=bool(repair and repair.use_alternate_voice))

    target.parent.mkdir(parents=True, exist_ok=True)
    last_error: str | None = None
    for attempt in range(attempts):
        try:
            with tempfile.TemporaryDirectory() as scratch:
                raw = Path(scratch) / "raw.mp3"
                provider.synthesize(spoken_text, voice_name, raw)
                if not raw.exists() or raw.stat().st_size == 0:
                    raise RuntimeError("provider returned an empty file")
                # Normalise into a temporary path, then move: a crash mid-encode
                # must not leave a truncated clip that looks generated.
                cooked = Path(scratch) / "cooked.mp3"
                normalise(raw, cooked)
                shutil.move(str(cooked), str(target))
            return entry["id"], voice, describe(target), None
        except Exception as error:  # noqa: BLE001 — one bad clip must not stop the run
            last_error = f"{type(error).__name__}: {error}"
            time.sleep(1.5 * (attempt + 1))
    return entry["id"], voice, None, last_error


def build_version(assets: dict) -> str:
    """The identity of this audio build: the date, and what it contains.

    The date alone was the version, and the date alone is not enough. The web
    build stamps this string into the service worker's audio cache key, so two
    builds on the same day — which is exactly what happens when a defect is
    found and repaired — produced the same key, and an installed app would have
    gone on serving the recording that was replaced. That is the bug the cache
    key exists to prevent, one level up.

    So the suffix is a digest of every file the manifest names, with its size
    and duration. Repair one clip and the version changes; rebuild without
    changing anything and it does not, which keeps a rebuild from invalidating
    fifty megabytes of correctly-cached audio for nothing.
    """
    digest = hashlib.sha256()
    for clip_id, voices in sorted(assets.items()):
        for voice in VOICES:
            asset = voices.get(voice)
            if asset:
                digest.update(
                    f"{clip_id}:{voice}:{asset['src']}:{asset['bytes']}:{asset['duration_ms']}".encode()
                )
    return f"{datetime.now(timezone.utc).strftime('%Y%m%d')}-{digest.hexdigest()[:8]}"


def describe(path: Path) -> dict:
    return {
        "src": relative_src(path),
        "duration_ms": probe_duration_ms(path),
        "bytes": path.stat().st_size,
    }


def prune(assets: dict) -> int:
    """Delete recordings the current plan no longer asks for.

    Curation removes words, and without this every word ever cut would keep
    shipping its two MP3s inside the offline bundle — invisible in the app and
    counted against the download. Only files under the audio root are touched,
    and only ones the manifest we are about to write does not name.
    """
    root = audio_root()
    wanted = {
        (root / asset["src"].removeprefix("audio/")).resolve()
        for voices in assets.values()
        for asset in voices.values()
    }
    removed = 0
    for path in sorted(root.rglob("*.mp3")):
        if path.resolve() not in wanted:
            path.unlink()
            removed += 1
    for directory in sorted(root.rglob("*"), reverse=True):
        if directory.is_dir() and not any(directory.iterdir()):
            directory.rmdir()
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", default=None, help="edge | azure | google")
    parser.add_argument(
        "--out",
        default=None,
        help="Write here instead of apps/web/public/audio (for a voice change)",
    )
    parser.add_argument(
        "--only",
        default=None,
        help="Comma-separated texts to generate, for a pronunciation check before the full run",
    )
    parser.add_argument("--force", action="store_true", help="Regenerate clips that exist")
    parser.add_argument("--limit", type=int, default=0, help="Only the first N clips (for a smoke run)")
    parser.add_argument("--workers", type=int, default=6, help="Concurrent syntheses")
    args = parser.parse_args()

    if not PLAN.exists():
        raise SystemExit(f"{PLAN} is missing — run `npm run audio:plan` first")

    global _out_root
    if args.out:
        _out_root = Path(args.out).resolve()

    entries = json.loads(PLAN.read_text(encoding="utf-8"))["entries"]
    if args.only:
        wanted = {text.strip() for text in args.only.split(",") if text.strip()}
        entries = [entry for entry in entries if entry["text"] in wanted]
        missing = wanted - {entry["text"] for entry in entries}
        if missing:
            # Synthesised anyway, under an id derived the same way the plan
            # derives one, so a pronunciation fixture can name a word the
            # curriculum does not teach.
            for text in sorted(missing):
                digest = "".join(f"{ord(ch):x}" for ch in text)
                entries.append({"id": f"probe_{digest}", "text": text, "kind": "word"})
    if args.limit:
        entries = entries[: args.limit]

    provider = get_provider(args.provider)

    """
    A rebuild may not quietly change who recorded the product.

    `get_provider` falls back to `edge` when nothing names one, which is the
    right default for somebody trying the pipeline out and the wrong one for a
    rebuild of the shipping audio. Run without the environment variable, this
    script re-walked 10,454 existing clips, regenerated none of them — they were
    already on disk — and rewrote the manifest to say the recordings came from
    an engine that had not touched them, at a speaking rate they were not made
    at. Nothing failed. The audio was correct and its provenance was fiction,
    which is worse than a crash because it is the half nobody plays.

    So: if a manifest is already there and it names a different provider, say so
    and stop. `--provider` is the way to mean it, and it is a deliberate act.
    """
    existing = audio_root() / "manifest.json"
    if existing.exists() and not args.provider:
        was = json.loads(existing.read_text(encoding="utf-8")).get("provider", {}).get("id")
        if was and was != provider.id:
            # Names the *registry key*, not the provider id, because the key is
            # what the flag and the environment variable take: the id of the
            # edge provider is `microsoft-edge-tts` and its key is `edge`, and a
            # message telling somebody to pass an argument that does not parse
            # is a message that wastes a minute of their time.
            # `cls.id`, not `cls().id`: constructing a provider is where it
            # checks for its credential, and building this lookup instantiated
            # every registered engine — so the message about the *wrong
            # provider* came out as "AZURE_SPEECH_KEY is not set".
            keys = {cls.id: key for key, cls in PROVIDERS.items()}
            raise SystemExit(
                f"the manifest at {existing} was built by {was!r} and this run would "
                f"rewrite it as {provider.id!r}.\n"
                f"The clips on disk are {was!r}'s. Either set "
                f"HANGYUL_TTS_PROVIDER={keys.get(was, was)} to rebuild as it is, or pass "
                f"--provider {keys.get(provider.id, provider.id)} to change engines on "
                "purpose (which regenerates every clip)."
            )

    print(f"provider: {provider.id}  female={provider.voices.female}  male={provider.voices.male}")
    if provider.spoken_rate == SPEECH_RATE:
        print(f"speaking rate: {SPEECH_RATE:g}× ({rate_percent()})")
    else:
        print(f"speaking rate: {provider.spoken_rate:g}× — this engine takes no rate parameter")
    print(f"{len(entries):,} clips × {len(VOICES)} voices")

    # One recording per distinct utterance.
    #
    # A vowel's name and its sound are the same word — ㅏ is called 아 and
    # sounds like 아 — and the syllable 가 is the same 가 whether a letter
    # lesson or a word lesson asks for it. Synthesising each id separately
    # would produce ninety byte-identical files, pay for them twice, and give
    # QA a hundred false alarms about duplicate audio.
    canonical: dict[str, str] = {}
    aliases: dict[str, str] = {}
    unique: list[dict] = []
    for entry in entries:
        # Keyed on the text alone, not on the kind: 가 is the same recording
        # whether it is filed as a letter's sound example or as a syllable.
        if entry["text"] in canonical:
            aliases[entry["id"]] = canonical[entry["text"]]
            continue
        canonical[entry["text"]] = entry["id"]
        unique.append(entry)
    if aliases:
        print(f"  {len(aliases)} clip(s) reuse an identical recording")

    jobs = [(entry, voice) for entry in unique for voice in VOICES]
    assets: dict[str, dict[str, dict]] = {}
    failures: list[tuple[str, str, str]] = []
    done = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(synthesize_one, provider, entry, voice, force=args.force)
            for entry, voice in jobs
        ]
        for future in futures:
            clip_id, voice, asset, error = future.result()
            done += 1
            if asset is None:
                failures.append((clip_id, voice, error or "unknown"))
            else:
                assets.setdefault(clip_id, {})[voice] = asset
            if done % 50 == 0 or done == len(jobs):
                print(f"  {done:,}/{len(jobs):,}", end="\r", flush=True)

    print()
    for alias, target in aliases.items():
        if target in assets:
            assets[alias] = assets[target]

    by_id = {e["id"]: e for e in entries}
    manifest = {
        "version": build_version(assets),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "provider": {
            "id": provider.id,
            "female_voice": provider.voices.female,
            "male_voice": provider.voices.male,
            "format": "audio/mpeg, 24 kHz mono, 32 kbit/s, EBU R128 −16 LUFS",
            # Recorded, not assumed: QA checks its duration bounds against this,
            # and a manifest that predates a rate change is then obvious rather
            # than merely wrong.
            "speech_rate": provider.spoken_rate,
            "notes": provider.notes,
            # Named in the manifest rather than only in the source, so that a
            # clip which does not match the provider's headline voice is
            # explainable from the artefact a reviewer has in front of them.
            "repairs": [
                {
                    "text": text,
                    "voice": voice_name,
                    "alternate_voice": repair.use_alternate_voice,
                    "text_override": repair.text_override,
                    "reason": repair.reason,
                }
                for (text, voice_name), repair in sorted(REPAIRS.items())
            ],
        },
        "entries": [
            {
                "id": clip_id,
                "text": by_id[clip_id]["text"],
                "kind": by_id[clip_id]["kind"],
                "female": voices.get("female"),
                "male": voices.get("male"),
            }
            for clip_id, voices in sorted(assets.items())
        ],
    }

    manifest_path = audio_root() / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # After the manifest, never before: a crash mid-run must not delete clips
    # the previous manifest still points at. --limit writes a partial manifest,
    # so pruning against it would throw away good recordings.
    stale = 0 if (args.limit or args.only) else prune(assets)

    # Counted over distinct files, so a shared recording is not billed twice.
    distinct = {
        asset["src"]: asset["bytes"]
        for voices in assets.values()
        for asset in voices.values()
    }
    total_bytes = sum(distinct.values())
    print(f"wrote {manifest_path}")
    print(f"  {len(manifest['entries']):,} entries, {total_bytes / 1_048_576:.1f} MB of audio")
    if stale:
        print(f"  removed {stale:,} recording(s) no longer in the plan")
    if failures:
        print(f"  {len(failures)} clip(s) failed:")
        for clip_id, voice, error in failures[:20]:
            print(f"    {clip_id} [{voice}] {error}")
        # A missing clip is a real defect, and the app degrades gracefully
        # around it — but the build should not pretend the run succeeded.
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
