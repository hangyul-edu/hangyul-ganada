#!/usr/bin/env python3
"""Downloads the raw source data the vocabulary build reads.

Separate from the build on purpose: fetching hits somebody else's servers and
takes minutes, while the build is a pure function over what was fetched. That
split is what lets the curriculum be re-tuned twenty times without re-fetching
anything, and what makes the build reproducible.

Everything lands in ``content-cache/`` at the repository root, which is
git-ignored. The cache is disposable; the built dataset is committed.

    python3 scripts/content/fetch_dictionary.py
    python3 scripts/content/fetch_dictionary.py --token-limit 4000   # quicker
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from hangul import is_hangul_word  # noqa: E402
from wiktionary import USER_AGENT, fetch_wikitext  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content-cache"

FREQUENCY_URL = (
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ko/ko_50k.txt"
)

#: Wiktionary categories that list headwords the corpus cannot supply.
#:
#: A subtitle corpus counts *conjugated* forms — 먹었어, 먹습니다, 먹고 — and
#: almost never the dictionary form 먹다. Ranking verbs by token frequency would
#: therefore teach a beginner 있습니다 before 먹다, which is backwards. So verbs
#: and adjectives come from the dictionary's own lemma lists and are ranked by
#: stem frequency instead; see `build_vocabulary.stem_frequency`.
LEMMA_CATEGORIES = ["Category:Korean verbs", "Category:Korean adjectives"]


def fetch_frequency(force: bool = False) -> Path:
    target = CACHE / "ko_50k.txt"
    if target.exists() and not force:
        print(f"frequency list already cached ({target.stat().st_size:,} bytes)")
        return target
    print("downloading frequency list …")
    request = urllib.request.Request(FREQUENCY_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        target.write_bytes(response.read())
    print(f"  → {target} ({target.stat().st_size:,} bytes)")
    return target


def category_members(category: str) -> list[str]:
    """Every page in a category, following continuation."""
    members: list[str] = []
    cont: dict[str, str] = {}
    while True:
        query = {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "list": "categorymembers",
            "cmtitle": category,
            "cmlimit": "500",
            "cmnamespace": "0",
            **cont,
        }
        url = "https://en.wiktionary.org/w/api.php?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.load(response)
        members.extend(m["title"] for m in payload["query"]["categorymembers"])
        if "continue" not in payload:
            return members
        cont = payload["continue"]
        time.sleep(0.2)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--token-limit",
        type=int,
        default=9000,
        help="How many of the most frequent corpus tokens to look up (default 9000)",
    )
    parser.add_argument("--force", action="store_true", help="Re-download everything")
    args = parser.parse_args()

    CACHE.mkdir(exist_ok=True)
    frequency_path = fetch_frequency(args.force)

    tokens: list[str] = []
    for line in frequency_path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        word = parts[0]
        # One syllable is a real word (물, 밥, 집) but also most of Korean's
        # grammatical particles; five is where compounds stop being beginner
        # vocabulary. Both ends are filtered again by the build.
        if is_hangul_word(word) and 1 <= len(word) <= 5:
            tokens.append(word)
        if len(tokens) >= args.token_limit:
            break
    print(f"{len(tokens):,} corpus tokens selected for lookup")

    lemmas: list[str] = []
    for category in LEMMA_CATEGORIES:
        cached = CACHE / f"{category.replace(':', '_').replace(' ', '_')}.json"
        if cached.exists() and not args.force:
            members = json.loads(cached.read_text(encoding="utf-8"))
        else:
            print(f"listing {category} …")
            members = category_members(category)
            cached.write_text(json.dumps(members, ensure_ascii=False), encoding="utf-8")
        members = [m for m in members if is_hangul_word(m) and 2 <= len(m) <= 6]
        print(f"  {category}: {len(members):,} usable headwords")
        lemmas.extend(members)

    titles = list(dict.fromkeys(tokens + lemmas))
    store = CACHE / "wikitext.jsonl"
    have: set[str] = set()
    if store.exists() and not args.force:
        for line in store.open(encoding="utf-8"):
            try:
                have.add(json.loads(line)["title"])
            except (json.JSONDecodeError, KeyError):
                continue
        print(f"{len(have):,} pages already cached")

    missing = [t for t in titles if t not in have]
    print(f"fetching {len(missing):,} pages …")
    mode = "a" if store.exists() and not args.force else "w"
    with store.open(mode, encoding="utf-8") as handle:
        for start in range(0, len(missing), 50):
            chunk = missing[start : start + 50]
            pages = fetch_wikitext(chunk)
            for title, wikitext in pages.items():
                handle.write(json.dumps({"title": title, "wikitext": wikitext}, ensure_ascii=False))
                handle.write("\n")
            # Titles with no page at all are recorded as empty, so a re-run does
            # not ask Wiktionary about them again.
            for title in chunk:
                if title not in pages:
                    handle.write(json.dumps({"title": title, "wikitext": ""}, ensure_ascii=False))
                    handle.write("\n")
            handle.flush()
            done = min(start + 50, len(missing))
            print(f"  {done:,}/{len(missing):,}", end="\r", flush=True)

    print(f"\ncache written to {store}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
