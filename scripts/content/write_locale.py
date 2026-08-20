#!/usr/bin/env python3
"""Writes one interface locale from a single authored file, and checks it.

    python3 scripts/content/write_locale.py <code> <authored.json>

## Why this exists

An interface locale is 555 keys across nine namespace files, and three of the
things that can be wrong with one are invisible to a reader and fatal to a
build: a key that does not exist in English, a plural set missing a category the
language actually uses, and a `{{placeholder}}` dropped in translation. All
three are caught by ``npm run i18n:check`` — *after* the files are written, one
locale at a time, by name. Finding them there means editing nine files and
running the check again.

So a locale is authored as one flat map of ``namespace:dotted.key`` and written
through here, which validates against the English bundles before anything lands
on disk and refuses to write a locale that would fail the gate. The nine-file
layout is a fact about how the app loads bundles, not something a translator
should have to hold in their head.

## Plurals

The categories come from ``Intl.PluralRules`` for the locale, which is the same
source ``i18n-report.mjs`` checks against. Russian needs *one/few/many/other*
where English needs two, Korean and Thai need only *other*, and Arabic needs
all six. The authored file gives whichever the language uses; this fails if any
are missing rather than filling them in, because a plural form invented by a
script is a sentence nobody has read.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCALES = ROOT / "apps" / "web" / "src" / "locales"
NAMESPACES = (
    "common",
    "navigation",
    "home",
    "learning",
    "handwriting",
    "vocabulary",
    "activity",
    "settings",
    "errors",
)
PLURAL_SUFFIX = re.compile(r"^(.*)_(zero|one|two|few|many|other)$")


def flatten(node: dict, prefix: str = "") -> dict:
    out: dict = {}
    for key, value in node.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            out.update(flatten(value, path + "."))
        else:
            out[path] = value
    return out


def unflatten(flat: dict) -> dict:
    out: dict = {}
    for path, value in flat.items():
        node = out
        parts = path.split(".")
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = value
    return out


def plural_categories(code: str) -> list[str]:
    """The plural categories the language uses, from the platform's own CLDR.

    Shelled out to Node rather than reimplemented, because the app's check reads
    them from ``Intl.PluralRules`` and two implementations of CLDR plural rules
    is one more than this repository should contain.
    """
    script = f"process.stdout.write(new Intl.PluralRules({code!r}).resolvedOptions().pluralCategories.join(','))"
    return subprocess.run(
        ["node", "-e", script], capture_output=True, text=True, check=True
    ).stdout.split(",")


def english() -> dict[str, dict]:
    return {ns: json.loads((LOCALES / "en" / f"{ns}.json").read_text("utf-8")) for ns in NAMESPACES}


def main() -> int:
    code, source = sys.argv[1], Path(sys.argv[2])
    authored: dict[str, object] = json.loads(source.read_text("utf-8"))
    categories = plural_categories(code)

    en = english()
    en_flat = {ns: flatten(bundle) for ns, bundle in en.items()}

    # What this locale must supply: every non-plural key as itself, and every
    # plural base once per category the *language* uses — not once per category
    # English uses.
    required: set[str] = set()
    bases: dict[str, str] = {}
    for ns, flat in en_flat.items():
        for key in flat:
            match = PLURAL_SUFFIX.match(key)
            if match:
                base = f"{ns}:{match.group(1)}"
                bases[base] = ns
                continue
            required.add(f"{ns}:{key}")
    for base, ns in bases.items():
        for category in categories:
            required.add(f"{base}_{category}")

    supplied = set(authored)
    missing = sorted(required - supplied)
    extra = sorted(supplied - required)

    problems: list[str] = []
    if missing:
        problems.append(f"{len(missing)} missing key(s): {', '.join(missing[:12])}")
    if extra:
        problems.append(f"{len(extra)} key(s) English does not have: {', '.join(extra[:12])}")

    # Placeholders. A translation that drops `{{count}}` renders a sentence with
    # a hole in it, and it is the single most common way a hand-written bundle
    # breaks.
    def placeholders(value: object) -> set[str]:
        if isinstance(value, str):
            return set(re.findall(r"\{\{\s*([\w.]+)", value))
        if isinstance(value, list):
            return set().union(*(placeholders(v) for v in value)) if value else set()
        return set()

    for key in sorted(supplied & required):
        # Plural forms are exempt, and so are they in `i18n-report.mjs`.
        # A singular form legitimately spells the number out — English's own
        # `startBlurb_one` is "One word today.", with no `{{count}}` in it — and
        # in Arabic the dual form names two things without a numeral at all.
        # Demanding the placeholder in every category would force "1 word" on
        # languages that do not write it that way.
        if PLURAL_SUFFIX.match(key):
            continue
        ns, _, path = key.partition(":")
        want = placeholders(en_flat[ns].get(path))
        got = placeholders(authored[key])
        lost = want - got
        if lost:
            problems.append(f"{key}: lost placeholder(s) {', '.join(sorted(lost))}")

    # Lists have to stay lists and stay the same length: they are rendered as
    # bullet points, and a locale with three where English has two silently
    # invents a teaching point.
    for key in sorted(supplied & required):
        ns, _, path = key.partition(":")
        reference = en_flat[ns].get(path)
        if isinstance(reference, list):
            value = authored[key]
            if not isinstance(value, list) or len(value) != len(reference):
                problems.append(f"{key}: expected a list of {len(reference)} items")

    if problems:
        print(f"{code}: not written —")
        for problem in problems:
            print(f"  {problem}")
        return 1

    out_dir = LOCALES / code
    out_dir.mkdir(parents=True, exist_ok=True)
    for ns in NAMESPACES:
        flat = {
            key.partition(":")[2]: value
            for key, value in authored.items()
            if key.startswith(f"{ns}:")
        }
        # Emitted in English's own key order, so two locales diff against each
        # other line for line.
        order = list(en_flat[ns])
        def rank(path: str) -> tuple[int, str]:
            match = PLURAL_SUFFIX.match(path)
            stem = match.group(1) if match else path
            for index, reference in enumerate(order):
                reference_stem = PLURAL_SUFFIX.match(reference)
                if (reference_stem.group(1) if reference_stem else reference) == stem:
                    return (index, path)
            return (len(order), path)

        ordered = {key: flat[key] for key in sorted(flat, key=rank)}
        (out_dir / f"{ns}.json").write_text(
            json.dumps(unflatten(ordered), ensure_ascii=False, indent=2) + "\n", "utf-8"
        )
    print(f"{code}: {len(authored)} keys → {out_dir.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
