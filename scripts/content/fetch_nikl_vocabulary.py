#!/usr/bin/env python3
"""Fetches the National Institute of Korean Language's graded learner vocabulary.

    python3 scripts/content/fetch_nikl_vocabulary.py            # download and convert
    python3 scripts/content/fetch_nikl_vocabulary.py --check    # fail if the JSON is stale

## What it is

「한국어 학습용 어휘 목록」 (2003) — 5,965 headwords chosen for learners of
Korean, each with a part of speech, a corpus frequency rank and a grade:
**A** (초급, 982 words), **B** (중급, 2,111) and **C** (고급, 2,872). It is
published by the National Institute of Korean Language at
https://www.korean.go.kr/front/etcData/etcDataView.do?mn_id=46&etc_seq=71
under 공공누리 제1유형 (KOGL Type 1: free use with attribution), and the
attribution is rendered in the app's Legal & Licences screen through
`sources.NIKL_LEARNER_VOCABULARY`.

## Why the pipeline reads it

The 1–30 Vocabulary Level is a model over four costs, and until this file
arrived two of them came from evidence that the corpus itself showed to be
partial. Frequency was read from subtitle corpora alone, which underrepresent
the words of an office, a form or a school (문의, 접수, 야근); and usefulness
was an editorial mark set per authoring batch rather than per word — 맛 was
marked 5, *advanced*, in a batch authored against the top of the scale, and
shipped at level 23 beside 맛있다 at level 3. This list is an independent,
expert-graded answer to both questions for 2,464 of the taught words, and
`level.py` reads it as evidence beside the two it already had.

## The output

`content/vocabulary/nikl-learner-vocabulary-2003.json`: the list, converted
to JSON so the build needs no spreadsheet reader. It is committed, because a
fresh checkout must build the same levels; this script is how it is refreshed.
The conversion needs `xlrd` (the source is a legacy `.xls`), which is not a
runtime dependency of anything else and is only needed here.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "content" / "vocabulary" / "nikl-learner-vocabulary-2003.json"
PAGE = "https://www.korean.go.kr/front/etcData/etcDataView.do?mn_id=46&etc_seq=71"
FILE = (
    "https://www.korean.go.kr/common/download.do?file_path=etcData"
    "&c_file_name=5a4a2f5c-66c9-425d-88fb-854289ea2521_0.xls&o_file_name=vocabulary.xls"
)

#: The list's part-of-speech abbreviations, mapped to the pipeline's names.
POS = {
    "명": "noun",
    "동": "verb",
    "형": "adjective",
    "부": "adverb",
    "대": "pronoun",
    "수": "numeral",
    "관": "determiner",
    "감": "interjection",
    "의": "bound noun",
    "고": "proper noun",
    "보": "auxiliary",
    "불": "irregular",
}


def convert(xls_bytes: bytes) -> dict:
    try:
        import xlrd  # type: ignore
    except ImportError as error:  # pragma: no cover - environment
        raise SystemExit("converting the .xls needs xlrd: pip install xlrd") from error
    book = xlrd.open_workbook(file_contents=xls_bytes)
    sheet = book.sheets()[0]
    header = [str(c).strip() for c in sheet.row_values(0)]
    if header[:5] != ["순위", "단어", "품사", "풀이", "등급"]:
        raise SystemExit(f"unexpected columns: {header}")
    words: list[dict] = []
    for row in range(1, sheet.nrows):
        rank, raw, pos, hanja, grade = sheet.row_values(row)[:5]
        # A homograph carries a two-digit suffix (가격03, 가구04); the bare
        # headword is what the pipeline joins on, the suffix is kept so two
        # rows for one spelling stay distinguishable.
        headword = re.sub(r"\d+$", "", str(raw)).strip()
        words.append(
            {
                "word": headword,
                "entry": str(raw).strip(),
                "pos": POS.get(str(pos).strip(), str(pos).strip()),
                "hanja": str(hanja).strip() or None,
                "rank": int(rank) if rank not in ("", None) else None,
                "grade": str(grade).strip(),
            }
        )
    grades = {g: sum(1 for w in words if w["grade"] == g) for g in ("A", "B", "C")}
    return {
        "_comment": [
            "국립국어원 「한국어 학습용 어휘 목록」 (2003), converted by scripts/content/fetch_nikl_vocabulary.py.",
            "Source page: " + PAGE,
            "Licence: 공공누리 제1유형 (KOGL Type 1) — free use with attribution; the attribution is rendered",
            "in the app's Legal & Licences screen (scripts/content/sources.py, NIKL_LEARNER_VOCABULARY).",
            "grade A = 초급, B = 중급, C = 고급; rank = the list's own corpus frequency rank.",
            "Read by scripts/content/learner_grade.py as evidence for the 1-30 Vocabulary Level.",
        ],
        "source": "National Institute of Korean Language — 한국어 학습용 어휘 목록 (2003)",
        "source_url": PAGE,
        "license": "KOGL Type 1",
        "retrieved": date.today().isoformat(),
        "grades": grades,
        "words": words,
    }


def render(document: dict) -> str:
    """One word per line, so a diff of the list reads as a list."""
    head = {k: v for k, v in document.items() if k != "words"}
    body = "\n".join(json.dumps(w, ensure_ascii=False, separators=(",", ":")) for w in document["words"])
    text = json.dumps(head, ensure_ascii=False, indent=1)
    # `text` ends in "\n}" — the closing brace of the head object.
    return text[:-1].rstrip() + ',\n "words": [\n' + body.replace("\n", ",\n") + "\n ]\n}\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the committed JSON differs")
    parser.add_argument("--xls", type=Path, help="convert a downloaded .xls instead of fetching")
    args = parser.parse_args()
    if args.xls:
        payload = args.xls.read_bytes()
    else:
        with urllib.request.urlopen(FILE, timeout=60) as response:  # noqa: S310 - fixed URL
            payload = response.read()
    document = convert(payload)
    if args.check:
        current = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
        if current.get("words") != document["words"]:
            print(f"{OUT.name} differs from the published list — rerun without --check")
            return 1
        print(f"{OUT.name} matches the published list ({len(document['words']):,} words)")
        return 0
    OUT.write_text(render(document), encoding="utf-8")
    print(f"wrote {OUT} — {len(document['words']):,} words, grades {document['grades']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
