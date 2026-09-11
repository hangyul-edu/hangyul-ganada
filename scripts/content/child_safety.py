#!/usr/bin/env python3
"""The child-safe content policy, for the Python half of the pipeline.

    python3 scripts/content/child_safety.py --self-test

A port of `packages/content-safety/src/evaluate.ts`, reading the same
`packages/content-safety/policy/child-safe-content-policy.json`. The two are
held together by the shared fixtures: `--self-test` runs
`packages/content-safety/fixtures/{negative,positive}.json` and fails on any row
whose verdict differs from the expectation the TypeScript suite also asserts.

Why a port and not a subprocess: `build_vocabulary.py` evaluates every pack row
and `build_dictionary.py` every one of thirty thousand Wiktionary entries, and a
process per row is not a gate anybody keeps. The port is small, the policy is
data, and the fixtures are the contract.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLICY_PATH = ROOT / "packages" / "content-safety" / "policy" / "child-safe-content-policy.json"
FIXTURES = ROOT / "packages" / "content-safety" / "fixtures"

HANGUL = "가-힣ㄱ-ㅎㅏ-ㅣ\u1100-\u11ff\u3130-\u318f"
_INVISIBLE = re.compile(
    "[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD\uFE00-\uFE0F\u180E\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]"
)
_MASK = set("*#.-_·•~^+")
_LETTER_CATS = ("L", "N", "M")


def _is_word_char(ch: str) -> bool:
    return unicodedata.category(ch)[0] in _LETTER_CATS


def _is_letter(ch: str) -> bool:
    return unicodedata.category(ch)[0] == "L"


def _mark_class() -> str:
    """A character class of combining marks — Python's `\\w` treats a Thai
    vowel or a Devanagari matra as a boundary, and the evaluator must not."""
    ranges: list[str] = []
    start = None
    prev = None
    for cp in list(range(0x0300, 0x3100)) + list(range(0xFE00, 0xFE30)):
        ch = chr(cp)
        is_mark = unicodedata.category(ch).startswith("M")
        if is_mark and start is None:
            start = cp
        if not is_mark and start is not None:
            ranges.append(f"\\u{start:04x}-\\u{prev:04x}" if prev != start else f"\\u{start:04x}")
            start = None
        prev = cp
    if start is not None:
        ranges.append(f"\\u{start:04x}-\\u{prev:04x}")
    return "".join(ranges)


MARKS = _mark_class()
WORD = f"[\\w{MARKS}]"
ROMANIZED_ENDINGS = "hada|haeyo|haesseoyo|hae|han|hal|hamnida|reul|eul|eun|neun|do|ro|euro|eseo|ege|hante|deul|ga"


def is_hangul_term(term: str) -> bool:
    return re.search(f"[{HANGUL}]", term) is not None


@dataclass
class Policy:
    raw: dict
    leet: dict[str, str]
    particles: str
    allow_exact: set[str]
    allow_headwords: set[str]
    concepts: list["Compiled"] = field(default_factory=list)
    context_rules: list[tuple[dict, re.Pattern]] = field(default_factory=list)
    gloss: dict[str, tuple[list[tuple[str, re.Pattern]], re.Pattern | None]] = field(default_factory=dict)


@dataclass
class Compiled:
    concept: dict
    allow_headwords: set[str]
    allow_sense_ids: set[str]
    exceptions: dict[str, tuple[re.Pattern, re.Pattern, re.Pattern]]
    matchers: dict[str, dict[str, list[re.Pattern]]]
    flat_matchers: dict[str, re.Pattern]
    romanized: re.Pattern | None


@dataclass
class Finding:
    concept_id: str
    category: str
    severity: str
    lang: str
    term: str
    mode: str
    field: str | None
    excerpt: str

    def as_dict(self) -> dict:
        return {
            "conceptId": self.concept_id,
            "category": self.category,
            "severity": self.severity,
            "lang": self.lang,
            "term": self.term,
            "mode": self.mode,
            "field": self.field,
            "excerpt": self.excerpt,
        }


_policy: Policy | None = None


def _deobfuscate(token: str, leet: dict[str, str]) -> str:
    if not any(_is_letter(ch) for ch in token):
        return token
    i, j = 0, len(token)
    while i < j and not _is_word_char(token[i]):
        i += 1
    while j > i and not _is_word_char(token[j - 1]):
        j -= 1
    core = "".join(leet.get(ch, ch) for ch in token[i:j] if ch not in _MASK)
    return token[:i] + core + token[j:]


_SPELLED = re.compile(r"(?:^|(?<=\s))((?:[a-z]\s){2,}[a-z])(?=\s|$)")


def _flat(text: str) -> str:
    return "".join(ch for ch in text if _is_word_char(ch))


def _compact(text: str) -> str:
    """Punctuation gone, word spaces kept, runs of single-syllable Hangul tokens joined."""
    tokens = [t for t in (_flat(tok) for tok in text.split(" ")) if t]
    out: list[str] = []
    run: list[str] = []

    def flush() -> None:
        if len(run) >= 2:
            out.append("".join(run))
        else:
            out.extend(run)
        run.clear()

    for tok in tokens:
        if len(tok) == 1 and is_hangul_term(tok):
            run.append(tok)
            continue
        flush()
        out.append(tok)
    flush()
    return " ".join(out)


def normalize(text: str, leet: dict[str, str] | None = None) -> tuple[str, str, str]:
    """`(norm, compact, flat)` — exactly `normalize()` in normalize.ts."""
    leet = leet if leet is not None else policy().leet
    out = unicodedata.normalize("NFKC", text)
    out = _INVISIBLE.sub("", out)
    out = out.lower()
    out = " ".join(out.split())
    out = " ".join(_deobfuscate(tok, leet) for tok in out.split(" "))
    out = _SPELLED.sub(lambda m: m.group(0).replace(" ", ""), out)
    return out, _compact(out), _flat(out)


def compact_term(term: str) -> tuple[str, str]:
    lowered = " ".join(unicodedata.normalize("NFKC", term).lower().split())
    return _compact(lowered), _flat(lowered)


def _token_regex(terms: list[str], hangul: bool, particles: str) -> re.Pattern:
    body = "|".join("\\s+".join(re.escape(part) for part in t.split()) for t in terms)
    if hangul:
        return re.compile(f"(?<![{HANGUL}])(?:{body})(?:{particles})?(?![{HANGUL}])")
    return re.compile(f"(?<!{WORD})(?:{body})(?!{WORD})")


def _default_mode(raw: dict, lang: str, term: str) -> str:
    base = raw["languageDefaults"].get(lang) or raw["languageDefaults"].get("*") or "token"
    if base == "token" and re.search(r"\s", term):
        return "phrase"
    return base


def _gloss_regex(term: str) -> tuple[str, re.Pattern]:
    """Whole word; a trailing `*` makes it a stem. See `glossRegex` in evaluate.ts."""
    stem = term.endswith("*")
    body = "\\s+".join(re.escape(part) for part in (term[:-1] if stem else term).split())
    return term, re.compile(f"(?<!{WORD}){body}" + ("" if stem else f"(?!{WORD})"))


def policy() -> Policy:
    global _policy
    if _policy is not None:
        return _policy
    raw = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    leet = raw["leet"]
    particles = "|".join(re.escape(p) for p in raw["koreanParticles"])
    pol = Policy(
        raw=raw,
        leet=leet,
        particles=particles,
        allow_exact={normalize(s, leet)[0] for s in raw["allow"]["exact"]},
        allow_headwords={normalize(s, leet)[0] for s in raw["allow"]["headwords"]},
    )
    for concept in raw["concepts"]:
        exceptions: dict[str, tuple[re.Pattern, re.Pattern, re.Pattern]] = {}
        for lang, items in (concept.get("exceptions") or {}).items():
            norms = [normalize(s, leet)[0] for s in items]
            norms = [n for n in norms if n]
            compacts = [c for c in (compact_term(s)[0] for s in items) if c]
            flats = [c for c in (compact_term(s)[1] for s in items) if c]
            if not norms:
                continue
            exceptions[lang] = (
                re.compile("|".join(re.escape(n) for n in norms)),
                re.compile("|".join(re.escape(c) for c in compacts)),
                re.compile("|".join(re.escape(c) for c in flats)),
            )
        matchers: dict[str, dict[str, list[re.Pattern]]] = {}
        flat_matchers: dict[str, re.Pattern] = {}
        for lang, items in (concept.get("surfaces") or {}).items():
            by_mode: dict[str, list[str]] = {}
            flats_for_lang: list[str] = []
            for surface in items:
                mode = (concept.get("match") or {}).get(lang, {}).get(surface) or _default_mode(raw, lang, surface)
                term = compact_term(surface)[0] if mode == "substring" else normalize(surface, leet)[0]
                if not term:
                    continue
                by_mode.setdefault(mode, []).append(term)
                if mode == "substring":
                    flat = compact_term(surface)[1]
                    if len(flat) >= 3 and flat != term:
                        flats_for_lang.append(flat)
            if flats_for_lang:
                flat_matchers[lang] = re.compile("|".join(re.escape(t) for t in flats_for_lang))
            regexes: dict[str, list[re.Pattern]] = {}
            for mode, terms in by_mode.items():
                if mode == "substring":
                    regexes[mode] = [re.compile("|".join(re.escape(t) for t in terms))]
                elif mode == "headword":
                    regexes[mode] = [re.compile("^(?:" + "|".join(re.escape(t) for t in terms) + ")$")]
                else:
                    hangul = [t for t in terms if is_hangul_term(t)]
                    other = [t for t in terms if not is_hangul_term(t)]
                    lst: list[re.Pattern] = []
                    if hangul:
                        lst.append(_token_regex(hangul, True, particles))
                    if other:
                        lst.append(_token_regex(other, False, particles))
                    regexes[mode] = lst
            matchers[lang] = regexes
        romanized = None
        if concept.get("romanized"):
            romanized = re.compile(
                f"(?<!{WORD})(?:" + "|".join(re.escape(normalize(r, leet)[0]) for r in concept["romanized"]) + f")(?:{ROMANIZED_ENDINGS})?(?!{WORD})"
            )
        pol.concepts.append(
            Compiled(
                concept=concept,
                allow_headwords={normalize(s, leet)[0] for s in (concept.get("allow") or {}).get("headwords", [])},
                allow_sense_ids=set((concept.get("allow") or {}).get("senseIds", [])),
                exceptions=exceptions,
                matchers=matchers,
                flat_matchers=flat_matchers,
                romanized=romanized,
            )
        )
    pol.context_rules = [(rule, re.compile(rule["pattern"])) for rule in raw["contextRules"]]
    for category, spec in raw["glossIndicators"].items():
        if category == "_comment" or isinstance(spec, str):
            continue
        terms = [_gloss_regex(t.lower()) for t in spec["terms"] if t]
        excepts = [e.lower() for e in spec["except"] if e]
        pol.gloss[category] = (
            terms,
            re.compile("|".join(re.escape(e) for e in excepts)) if excepts else None,
        )
    _policy = pol
    return pol


def _excerpt(text: str) -> str:
    return text if len(text) <= 80 else text[:77] + "…"


def _strip_one_particle(norm: str, particles: str) -> str:
    if not is_hangul_term(norm):
        return norm
    return re.sub(f"(?:{particles})$", "", norm)


def classify_gloss(gloss: str, headword: str | None = None, fld: str | None = None) -> list[Finding]:
    pol = policy()
    head_norm = normalize(headword)[0] if headword else None
    lower = gloss.lower()
    out: list[Finding] = []
    for category, (terms, except_re) in pol.gloss.items():
        if head_norm and any(
            c.concept["category"] == category and head_norm in c.allow_headwords for c in pol.concepts
        ):
            continue
        text = except_re.sub(lambda m: " " * len(m.group(0)), lower) if except_re else lower
        hit = next((t for t, regex in terms if regex.search(text)), None)
        if hit:
            out.append(
                Finding(
                    f"gloss.{category}",
                    category,
                    "CONTEXT_BLOCK" if category == "mortality" else "HARD_BLOCK",
                    "en",
                    hit,
                    "gloss",
                    fld,
                    _excerpt(gloss),
                )
            )
    return out


def evaluate_surface(
    text: str,
    lang: str,
    role: str,
    headword: str | None = None,
    sense_id: str | None = None,
    fld: str | None = None,
) -> list[Finding]:
    pol = policy()
    norm, compact, flat = normalize(text)
    if not norm:
        return []
    blanked_by_category: dict[str, str] = {}
    if norm in pol.allow_exact:
        return []
    if role == "headword" and norm in pol.allow_headwords:
        return []
    is_head = role in ("headword", "option")
    head_norm = normalize(headword)[0] if headword else None
    findings: list[Finding] = []
    langs = (lang, "*")
    romanization_only = role == "romanization"
    for entry in pol.concepts:
        concept = entry.concept
        if head_norm and head_norm in entry.allow_headwords:
            continue
        if sense_id and sense_id in entry.allow_sense_ids:
            continue
        if role == "headword" and norm in entry.allow_headwords:
            continue
        subject_norm, subject_compact, subject_flat = norm, compact, flat
        for lg in langs:
            ex = entry.exceptions.get(lg)
            if not ex:
                continue
            subject_norm = ex[0].sub(lambda m: " " * len(m.group(0)), subject_norm)
            subject_compact = ex[1].sub(" ", subject_compact)
            subject_flat = ex[2].sub("", subject_flat)
        blanked_by_category[concept["category"]] = subject_norm
        for lg in () if romanization_only else langs:
            regexes = entry.matchers.get(lg)
            if not regexes:
                continue
            for mode, lst in regexes.items():
                if mode == "headword" and not is_head:
                    continue
                if mode == "substring":
                    subjects = [subject_compact]
                elif mode == "headword":
                    subjects = [subject_norm, _strip_one_particle(subject_norm, pol.particles)]
                else:
                    subjects = [subject_norm]
                for regex in lst:
                    m = next((mm for mm in (regex.search(s) for s in subjects) if mm), None)
                    if m is None and mode == "substring" and lg in entry.flat_matchers:
                        m = entry.flat_matchers[lg].search(subject_flat)
                    if m:
                        findings.append(
                            Finding(concept["id"], concept["category"], concept["severity"], lang, m.group(0), mode, fld, _excerpt(text))
                        )
                        break
        if entry.romanized and (lang == "en" or romanization_only):
            m = entry.romanized.search(subject_norm)
            if m:
                findings.append(
                    Finding(concept["id"], concept["category"], concept["severity"], lang, m.group(0), "romanized", fld, _excerpt(text))
                )
    for rule, regex in () if romanization_only else pol.context_rules:
        if rule["lang"] not in (lang, "*"):
            continue
        if head_norm:
            owner = next((c for c in pol.concepts if c.concept["category"] == rule["category"]), None)
            if owner and head_norm in owner.allow_headwords:
                continue
        m = regex.search(blanked_by_category.get(rule["category"], norm))
        if m:
            findings.append(Finding(rule["id"], rule["category"], rule["severity"], lang, m.group(0), "pattern", fld, _excerpt(text)))
    if role == "gloss" and lang == "en":
        findings.extend(classify_gloss(text, headword, fld))
    seen: set[tuple] = set()
    unique: list[Finding] = []
    for f in findings:
        key = (f.concept_id, f.term, f.field)
        if key in seen:
            continue
        seen.add(key)
        unique.append(f)
    return unique


def verdict_of(findings: list[Finding], random: bool = False) -> str:
    verdict = "ok"
    for f in findings:
        if f.severity == "HARD_BLOCK":
            return "blocked"
        if f.severity == "CONTEXT_BLOCK":
            verdict = "blocked" if random else "review"
    return verdict


def evaluate_item(surfaces: list[dict], headword: str | None = None, sense_id: str | None = None, random: bool = False) -> tuple[str, list[Finding]]:
    """`surfaces` are dicts with text, lang, role and an optional field."""
    findings: list[Finding] = []
    for s in surfaces:
        findings.extend(evaluate_surface(s["text"], s["lang"], s["role"], headword, sense_id, s.get("field")))
    return verdict_of(findings, random), findings


def is_blocked(text: str, lang: str = "ko", role: str = "sentence", headword: str | None = None, random: bool = False) -> bool:
    return verdict_of(evaluate_surface(text, lang, role, headword), random) == "blocked"


def policy_version() -> str:
    return policy().raw["version"]


def self_test() -> int:
    failures = 0
    total = 0
    for name in ("negative.json", "positive.json"):
        cases = json.loads((FIXTURES / name).read_text(encoding="utf-8"))["cases"]
        for case in cases:
            total += 1
            findings = evaluate_surface(case["text"], case["lang"], case["role"], case.get("headword"))
            verdict = verdict_of(findings, bool(case.get("random")))
            expected = "ok" if name == "positive.json" else case["expect"]
            ok = verdict == expected
            if ok and case.get("category") and expected != "ok":
                ok = case["category"] in {f.category for f in findings}
            if not ok:
                failures += 1
                print(f"  FAIL {name} {case['id']}: {case['text']!r} → {verdict} (expected {expected}) {[f.term for f in findings]}")
    print(f"child_safety self-test: {total - failures}/{total} fixtures agree with the TypeScript evaluator (policy {policy_version()})")
    return 1 if failures else 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    for arg in sys.argv[1:]:
        fs = evaluate_surface(arg, "ko", "sentence")
        print(arg, verdict_of(fs), [f.as_dict() for f in fs])
