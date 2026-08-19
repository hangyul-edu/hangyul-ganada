#!/usr/bin/env python3
"""Audits the bundled practice typefaces before they ship.

    python3 scripts/content/audit_fonts.py
    python3 scripts/content/audit_fonts.py --json report.json

Hangyul ganada is sold through the App Store and Google Play, which means every
font file inside the binary has to be one we are *allowed to redistribute* —
a stricter test than "free to download", and the one that a font found on a
search results page will usually fail. This checks it, rather than trusting the
comment next to the import:

* every face declares a licence, a licence URL, a source and a source URL
* the licence is one that permits bundling in a commercial application
* the file the app actually bundles exists, and is the file the metadata names
* the file's character map covers every Korean character the app will ever
  render in a practice face — because a face that is missing one renders a tofu
  box in the writing lesson, which is the worst place in the product for it

The last check is the one that cannot be done by reading: a typeface can be
perfectly licensed, well known, and still carry only the 2,350 syllables of
KS X 1001 rather than all 11,172.

Reads the generated curriculum (`npm run curriculum:build`) so the font list and
the character list both come from the same place the app does.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover - environment guard
    # The metadata half of this audit needs nothing but the standard library,
    # and it is the half that catches a licence nobody checked. Losing it
    # because the glyph reader is not installed would be the wrong trade — so
    # the coverage check is skipped, loudly, and `--strict` refuses to.
    TTFont = None

ROOT = Path(__file__).resolve().parents[2]
CURRICULUM = ROOT / "content" / "curriculum.json"
MODULES = ROOT / "node_modules"

#: Licences that permit bundling the font inside a commercial application.
#:
#: An allowlist, not a blocklist. "Free for personal use", "free for
#: non-commercial use" and the several Korean foundry licences that permit
#: embedding but not redistribution all fail by not being on it, which is the
#: correct outcome — each of those needs a human decision, not a regex.
REDISTRIBUTABLE = {
    "SIL Open Font License 1.1",
    "Apache License 2.0",
    "Ubuntu Font Licence 1.0",
}

#: Where each face's files live, keyed by the id in `apps/web/src/data/fonts.ts`.
#:
#: Explicit rather than derived from `font_family`: the point of the check is to
#: look at the bytes that ship, and a path guessed from a CSS family name is a
#: guess. A face added to the app without a line here fails the audit.
FILES = {
    "pretendard": "pretendard/dist/web/static/woff2/Pretendard-Medium.woff2",
    "nanum-gothic": "@fontsource/nanum-gothic/files/nanum-gothic-korean-400-normal.woff2",
    "nanum-myeongjo": "@fontsource/nanum-myeongjo/files/nanum-myeongjo-korean-400-normal.woff2",
    "gowun-batang": "@fontsource/gowun-batang/files/gowun-batang-korean-400-normal.woff2",
    "gaegu": "@fontsource/gaegu/files/gaegu-korean-400-normal.woff2",
    "gowun-dodum": "@fontsource/gowun-dodum/files/gowun-dodum-korean-400-normal.woff2",
}


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    fonts: list[dict] = field(default_factory=list)


def practice_characters(curriculum: dict) -> list[str]:
    """Every Korean character the app renders in the learner's chosen face.

    The letters and syllables of the letter curriculum, and the words and
    syllables of the vocabulary. Not the explanatory prose: that is set in the
    interface face, which is a different question.
    """
    characters: set[str] = set()
    for row in curriculum["characters"]:
        characters.add(row["character"])
        characters.update(row.get("syllables") or [])
    for word in curriculum["words"]:
        characters.update(word["word"])
        characters.update("".join(word.get("syllables") or []))
    return sorted(ch for ch in characters if is_korean(ch))


def is_korean(ch: str) -> bool:
    code = ord(ch)
    return (
        0xAC00 <= code <= 0xD7A3  # syllable blocks
        or 0x3130 <= code <= 0x318F  # compatibility jamo — ㄱ, ㅏ, what lessons teach
        or 0x1100 <= code <= 0x11FF  # conjoining jamo
    )


def audit(curriculum: dict, report: Report) -> None:
    characters = practice_characters(curriculum)
    print(f"{len(characters):,} Korean characters are rendered in a practice face")

    for font in curriculum["fonts"]:
        font_id = font["id"]
        label = f"{font_id} ({font.get('family_name', '?')})"

        for required in ("license", "license_url", "source", "source_url"):
            if not font.get(required):
                report.errors.append(f"{label}: no {required} recorded")

        if font.get("license") not in REDISTRIBUTABLE:
            report.errors.append(
                f"{label}: licence {font.get('license')!r} is not on the "
                f"redistributable allowlist — it may not be bundled without a "
                f"documented decision"
            )

        if not font.get("bundled"):
            report.warnings.append(f"{label}: not marked as bundled; nothing to check on disk")
            continue

        relative = FILES.get(font_id)
        if relative is None:
            report.errors.append(
                f"{label}: no file mapping in audit_fonts.py — a bundled face must "
                f"name the file it ships"
            )
            continue

        path = MODULES / relative
        if not path.exists():
            report.errors.append(f"{label}: {relative} does not exist — run `npm install`")
            continue

        if TTFont is None:
            report.warnings.append(f"{label}: glyph coverage not checked")
            continue

        cmap = set(TTFont(str(path), lazy=True).getBestCmap())
        missing = [ch for ch in characters if ord(ch) not in cmap]
        if missing:
            shown = "".join(missing[:20])
            report.errors.append(
                f"{label}: missing {len(missing)} character(s) the app renders "
                f"in this face — {shown}"
            )

        report.fonts.append(
            {
                "id": font_id,
                "family": font.get("family_name"),
                "license": font.get("license"),
                "source": font.get("source"),
                "file": relative,
                "bytes": path.stat().st_size,
                "glyphs": len(cmap),
                "missing": len(missing),
            }
        )
        print(
            f"  {font_id:18} {len(cmap):6,} glyphs  "
            f"{path.stat().st_size / 1024:6.0f} KiB  {font.get('license')}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", type=Path, default=None, help="Write the report as JSON")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail rather than skip when the glyph reader is unavailable. For release builds.",
    )
    args = parser.parse_args()

    if TTFont is None:
        message = (
            "fontTools is not installed, so glyph coverage was not checked. "
            "`pip install 'fonttools[woff]'` to check it."
        )
        if args.strict:
            print(f"ERROR {message}", file=sys.stderr)
            return 1
        print(f"  warn  {message}")

    if not CURRICULUM.exists():
        raise SystemExit(f"{CURRICULUM} is missing — run `npm run curriculum:build` first")

    curriculum = json.loads(CURRICULUM.read_text(encoding="utf-8"))
    report = Report()
    audit(curriculum, report)

    print(f"{len(report.fonts)} bundled face(s), {len(report.errors)} error(s), "
          f"{len(report.warnings)} warning(s)")
    for message in report.warnings:
        print(f"  warn  {message}")
    for message in report.errors:
        print(f"  ERROR {message}")

    if args.json:
        args.json.write_text(
            json.dumps(
                {"fonts": report.fonts, "errors": report.errors, "warnings": report.warnings},
                ensure_ascii=False,
                indent=1,
            )
            + "\n",
            encoding="utf-8",
        )

    return 1 if report.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
