#!/usr/bin/env bash
#
# Sabotage runs against the content gates added in the v1.0.5 content pass.
#
#   bash scripts/content-gates-negative.sh            all cases
#   bash scripts/content-gates-negative.sh --fast     skip the two that rebuild the pack
#
# A gate that has only ever been seen passing is a gate nobody has evidence
# about. Each case here plants the defect the gate was written for, asserts the
# gate exits non-zero, restores the tree, and the last step re-runs everything
# clean. Results are written to docs/content-gates-negative.json so the report
# can cite them.
#
# | | |
# | --- | --- |
# | **N1** | The content inventory says 3,370 words when the packs hold more — the stale-figure class the report suffered from. |
# | **N2** | A Korean sentence copied into the Thai pack as its "translation". |
# | **N3** | A Korean sentence left in the English pack (Hangul in a translation). |
# | **N4** | A placeholder `TODO` left in a Vietnamese meaning. |
# | **N5** | The first-render line pulled under what band 1 costs. |
# | **N6** | The English runtime-safety supplement stripped of its gloss indicators (the gap the per-language supplements closed). |
# | **N7** | The level model reading only subtitle frequency again, ignoring the learner list (rebuilds). |
# | **N8** | A retired slur put back into a shipped English meaning (rebuilds nothing; reads the pack). |
# | **N9** | The normaliser's forward join removed, so 섹 스하다 (a two-character term split once with its ending attached) reads as two words again. |
# | **N10** | The script-change boundary removed from the token rule, so `sex를` with a Hangul particle attached is a whole word again. |
# | **N11** | The per-locale audit table's input changed under it without regeneration. |
#
# Generated packs are restored by copying the backup back, never with
# `git checkout` — the working tree is ahead of HEAD and a checkout would put a
# stale pack under every other gate.
set -u
cd "$(dirname "$0")/.."

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

INV=docs/content-inventory.json
TH=apps/web/src/data/generated/vocabulary.th.json
EN=apps/web/src/data/generated/vocabulary.en.json
VI=apps/web/src/data/generated/vocabulary.vi.json
SCAL=scripts/content-scalability.mjs
SUPP=packages/content-safety/policy/runtime/en.json
LEVEL=scripts/content/level.py
NORM=packages/content-safety/src/normalize.ts
EVAL=packages/content-safety/src/evaluate.ts
LOCIN=docs/locale-audit-v105-input.json

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
slot() { echo "$WORK/$(echo "$1" | tr '/' '_')"; }
backup() { cp "$1" "$(slot "$1")"; }
restore() { cp "$(slot "$1")" "$1"; }
for f in "$INV" "$TH" "$EN" "$VI" "$SCAL" "$SUPP" "$LEVEL" "$NORM" "$EVAL" "$LOCIN"; do backup "$f"; done

pass=0
fail=0
RESULTS="$WORK/results"
: >"$RESULTS"

sabotage() { python3 -c "
import io, sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
text = io.open(path, encoding='utf-8').read()
assert old in text, 'the sabotage no longer applies: ' + old[:60]
io.open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
" "$@"; }

record() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >>"$RESULTS"; }

expect_fail() {
  local name="$1"; local desc="$2"; shift 2
  if "$@" >"$WORK/out" 2>&1; then
    echo "$name: GATE DID NOT FIRE   <<<< PROBLEM"
    record "$name" "GATE DID NOT FIRE" "$desc"
    fail=$((fail + 1))
  else
    local line
    line=$(grep -m1 -E 'blocked|blocking|exceeds|refus|slipped|outside|✗|FAIL|failed|stale|problem|Error|error|drift|expected|anchor' "$WORK/out" | sed 's/^ *//' | cut -c1-140)
    echo "$name: caught — $line"
    record "$name" "caught" "$desc — $line"
    pass=$((pass + 1))
  fi
}

expect_pass() {
  local name="$1"; shift
  if "$@" >"$WORK/out" 2>&1; then
    echo "$name: green"
    pass=$((pass + 1))
  else
    echo "$name: STILL FAILING   <<<< PROBLEM"
    tail -20 "$WORK/out"
    record "$name" "STILL FAILING" "clean re-run"
    fail=$((fail + 1))
  fi
}

# The Korean sentence the Thai row for the first word will be replaced with.
FIRST_KO=$(python3 -c "import json;print(json.load(open('apps/web/src/data/generated/vocabulary.json'))['words'][0]['example'])")
plant_row() { python3 -c "
import json, sys
path, field, value = sys.argv[1], int(sys.argv[2]), sys.argv[3]
d = json.load(open(path, encoding='utf-8'))
d['words'][0][field] = value
json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
" "$@"; }

echo "N1  the inventory says 3,370 taught words"
sabotage "$INV" '"taught_entries": ' '"taught_entries": 3370, "_planted": '
expect_fail N1 "inventory figure out of date" npx tsx scripts/content-inventory.mjs --check
restore "$INV"

echo "N2  a Korean sentence copied into the Thai pack"
plant_row "$TH" 1 "$FIRST_KO"
expect_fail N2 "Korean copied into th example" node scripts/content-translation-audit.mjs --check
restore "$TH"

echo "N3  Hangul left inside an English translation"
plant_row "$EN" 1 "I bought the 것 I needed."
expect_fail N3 "Hangul in en example" node scripts/content-translation-audit.mjs --check
restore "$EN"

echo "N4  a TODO placeholder in a Vietnamese meaning"
plant_row "$VI" 0 "TODO"
expect_fail N4 "placeholder in vi meaning" node scripts/content-translation-audit.mjs --check
restore "$VI"

echo "N5  the first-render line pulled under band 1"
sabotage "$SCAL" 'const FIRST_RENDER_LINE_KB = 120;' 'const FIRST_RENDER_LINE_KB = 10;'
expect_fail N5 "first render over its line" node scripts/content-scalability.mjs --check
restore "$SCAL"

echo "N6  the English safety supplement without its gloss indicators"
python3 -c "
import json
p='$SUPP'; d=json.load(open(p, encoding='utf-8')); d['glossIndicators']=[]; json.dump(d, open(p,'w',encoding='utf-8'), ensure_ascii=False, indent=2)"
expect_fail N6 "runtime supplement weaker than the full policy" npx vitest run packages/content-safety/src/runtime.test.ts
restore "$SUPP"

echo "N8  a retired slur back inside a shipped English meaning"
plant_row "$EN" 0 "a retard"
expect_fail N8 "slur in shipped meaning" npx tsx scripts/content-safety-qa.mjs --check
restore "$EN"

echo "N9  the normaliser without its forward join (섹 스하다 reads as two words)"
sabotage "$NORM" "if (run.length && !closed && /^[가-힣]/.test(token.flat)" "if (false && run.length && !closed && /^[가-힣]/.test(token.flat)"
expect_fail N9 "split-once evasion passes the fixtures" npx vitest run packages/content-safety/src/fixtures.test.ts
restore "$NORM"

echo "N10 the token rule without the script-change boundary (sex를 is a whole word)"
sabotage "$EVAL" '(?:(?![${HANGUL}])[' '(?:['
expect_fail N10 "particle-attached Latin term passes the fixtures" npx vitest run packages/content-safety/src/fixtures.test.ts
restore "$EVAL"

echo "N11 the per-locale audit input changed without regenerating the table"
sabotage "$LOCIN" '"date": "' '"date": "1999-01-01", "_planted": "'
expect_fail N11 "stale per-locale audit table" node scripts/build-locale-audit-v105.mjs --check
restore "$LOCIN"

if [ "$FAST" -eq 0 ]; then
  echo "N7  the level model ignoring the learner list (rebuilds the pack twice)"
  sabotage "$LEVEL" '    return round(min(subtitles, learner), 6)' '    return round(subtitles, 6)'
  npm run --silent content:vocabulary >/dev/null 2>&1 || true
  expect_fail N7 "learner-list evidence dropped from the level model" node scripts/vocabulary-level-qa.mjs --check
  restore "$LEVEL"
  npm run --silent content:vocabulary >/dev/null 2>&1
else
  echo "N7  skipped (--fast)"
fi

echo
echo "clean re-run"
expect_pass "inventory" npx tsx scripts/content-inventory.mjs --check
expect_pass "translation audit" node scripts/content-translation-audit.mjs --check
expect_pass "scalability" node scripts/content-scalability.mjs --check
expect_pass "runtime supplement tests" npx vitest run packages/content-safety/src/runtime.test.ts
expect_pass "content safety" npx tsx scripts/content-safety-qa.mjs --check
[ "$FAST" -eq 0 ] && expect_pass "levels" node scripts/vocabulary-level-qa.mjs --check

python3 - "$RESULTS" <<'EOF'
import json, sys, datetime
rows = [l.rstrip('\n').split('\t') for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
out = {
  "_comment": "GENERATED by scripts/content-gates-negative.sh: each case plants a known defect and requires the gate to fail; the tree is restored and re-run clean afterwards.",
  "run_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
  "cases": [{"case": r[0], "result": r[1], "detail": r[2]} for r in rows],
}
json.dump(out, open("docs/content-gates-negative.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
EOF

echo
echo "negative tests: $pass passed, $fail problem(s)"
[ "$fail" -eq 0 ]
