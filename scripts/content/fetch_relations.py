#!/usr/bin/env python3
"""Downloads the raw lexical-relation data for the shipping vocabulary.

Separate from ``build_relations.py`` for the same reason ``fetch_dictionary.py``
is separate from ``build_vocabulary.py``: fetching hits somebody else's servers
and takes minutes, while the build is a pure function over what was fetched.

    python3 scripts/content/fetch_relations.py
    python3 scripts/content/fetch_relations.py --force

Everything lands in ``content-cache/relations-wikitext.jsonl``, which is
git-ignored and disposable. The *built* relation set is committed.

## Why the Korean Wiktionary and not NAVER

NAVER's Korean dictionary is the reference the product brief names, and it is
the right one on the merits — it is the dictionary a Korean learner is told to
use. It is not the one this pipeline can read. ``ko.dict.naver.com`` serves
``서비스에 접속할 수 없습니다`` to every request from the build environment, has
no published relation API, and its terms do not grant redistribution of
extracted relation metadata. A build step that cannot run is not a source.

The Korean Wiktionary publishes the same two relations as explicit, typed,
per-headword metadata — ``*유의어:`` and ``*반의어:`` lines under the Korean
section — under CC BY-SA 4.0, which this project already carries for the
part-of-speech and gloss data (see ``wiktionary.py``). That is what is taken
here: the relation *type* and the *target headword*, and nothing else. No
definitions are copied.

What this does not do is invent. A word whose page has no ``유의어`` line
produces no synonyms, and that is the shipped answer.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "content-cache"
TARGET = CACHE / "relations-wikitext.jsonl"
VOCABULARY = ROOT / "apps" / "web" / "src" / "data" / "generated" / "vocabulary.json"

API = "https://ko.wiktionary.org/w/api.php"
PAGE_BASE = "https://ko.wiktionary.org/wiki/"
USER_AGENT = "Hangyul ganada-content-pipeline/1.0 (build tooling; contact: hangyul.com)"

SOURCE_ID = "ko-wiktionary"
SOURCE_NAME = "Korean Wiktionary (한국어 위키낱말사전)"
LICENSE = "CC BY-SA 4.0"
LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"

#: MediaWiki caps a multi-title query at 50 for anonymous clients.
BATCH = 50


def headwords() -> list[str]:
    """Every distinct Korean headword in the shipping corpus."""
    data = json.loads(VOCABULARY.read_text(encoding="utf-8"))
    seen: dict[str, None] = {}
    for word in data["words"]:
        seen.setdefault(word["word"], None)
    return list(seen)


def cached_words() -> set[str]:
    """Headwords already in the cache, so a re-run only fetches the gaps.

    The wiki rate-limits anonymous clients, and a run that loses a dozen
    batches to a 429 should be finishable by running it again rather than by
    re-downloading five megabytes.
    """
    if not TARGET.exists():
        return set()
    words: set[str] = set()
    for line in TARGET.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        words.add(json.loads(line)["w"])
    return words


def fetch_batch(titles: list[str]) -> dict[str, str]:
    """Wikitext for up to `BATCH` titles, keyed by title. Missing pages absent."""
    query = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "titles": "|".join(titles),
        }
    )
    request = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)

    out: dict[str, str] = {}
    pages = payload.get("query", {}).get("pages", [])
    # `normalized` maps the title we asked for onto the one the wiki answered
    # with. Without it a normalised title silently drops its word.
    back = {n["to"]: n["from"] for n in payload.get("query", {}).get("normalized", [])}
    for page in pages:
        if page.get("missing"):
            continue
        revisions = page.get("revisions") or []
        if not revisions:
            continue
        text = revisions[0].get("slots", {}).get("main", {}).get("content", "")
        title = page.get("title", "")
        out[back.get(title, title)] = text
    return out


def fetch_with_backoff(chunk: list[str]) -> dict[str, str] | None:
    """One batch, with the wiki's rate limit respected rather than fought.

    Returns None when the batch could not be fetched at all. The caller writes
    nothing for those words, and the next run picks them up — an absent page
    and an unfetched page must never look the same, because the first means
    "this word has no relations" and shipping that for the second would quietly
    delete real data.
    """
    for attempt in range(5):
        try:
            return fetch_batch(chunk)
        except urllib.error.HTTPError as error:
            if error.code not in (429, 503):
                print(f"  ! {error}", file=sys.stderr)
                return None
            wait = float(error.headers.get("Retry-After") or 0) or 5 * (2**attempt)
            print(f"  … rate limited, waiting {wait:.0f}s", file=sys.stderr)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as error:
            print(f"  … {error}, retrying", file=sys.stderr)
            time.sleep(2 * (attempt + 1))
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-fetch even if cached")
    parser.add_argument("--limit", type=int, default=0, help="stop after N headwords")
    args = parser.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    if args.force:
        TARGET.unlink(missing_ok=True)

    words = headwords()
    if args.limit:
        words = words[: args.limit]

    # Resume rather than restart. A word already in the cache is skipped, so a
    # run interrupted by rate limiting is finished by running it again — and a
    # complete cache makes the whole script a no-op.
    done = cached_words()
    todo = [w for w in words if w not in done]
    if not todo:
        print(f"relations already cached for all {len(words):,} headwords")
        return 0
    print(f"fetching relation pages for {len(todo):,} headwords ({len(done):,} cached) …")

    found = 0
    failed = 0
    with TARGET.open("a", encoding="utf-8") as handle:
        for start in range(0, len(todo), BATCH):
            chunk = todo[start : start + BATCH]
            pages = fetch_with_backoff(chunk)
            if pages is None:
                failed += len(chunk)
                pages = {}
            for word in chunk:
                text = pages.get(word)
                if text is None:
                    continue
                found += 1
                handle.write(
                    json.dumps(
                        {"w": word, "url": PAGE_BASE + urllib.parse.quote(word), "wikitext": text},
                        ensure_ascii=False,
                    )
                    + "\n"
                )
            handle.flush()
            print(f"  {min(start + BATCH, len(todo)):,}/{len(todo):,} — {found:,} pages")
            # Courtesy rate limit. The API allows more; there is no hurry.
            time.sleep(1.0)

    print(f"  → {TARGET} ({TARGET.stat().st_size:,} bytes, {found:,} new pages)")
    if failed:
        print(f"  ! {failed:,} headwords unfetched — run again to pick them up", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
