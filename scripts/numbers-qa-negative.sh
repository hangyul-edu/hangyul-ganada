#!/usr/bin/env bash
#
# Ten sabotage runs against `numbers:qa`.
#
#   bash scripts/numbers-qa-negative.sh
#
# ## Why a gate needs this
#
# A gate that has only ever been seen passing is a gate nobody has evidence
# about. Every rule in `scripts/numbers-qa.mjs` §7-§10 was written against a
# defect that had already shipped, and the way to know a rule catches its defect
# is to put the defect back.
#
# Each case restores one of them, asserts the gate exits non-zero, and restores
# the fix. The last step re-runs the gate clean, so a run that leaves the tree
# broken says so rather than ending quietly.
#
# ## Two of them are deliberately not checked against the declaration
#
# N6 (the context-free blank) and N7/N9 (the same-meaning and same-slot options)
# remove a *declaration* — `hasContextAnchor`, `gloss_group`, `slot_group`. A
# gate that read those declarations back would go green on their absence, which
# is the shape of a check that proves nothing. So `numbers-qa` states those
# three facts independently — it recomputes the anchor, and it holds its own
# short list of gloss keys and expressions that name the same thing — and these
# three cases are what proves it does.
set -u
cd "$(dirname "$0")/.."

NUMBERS=apps/web/src/data/numbers.ts
KO=apps/web/src/locales/ko/numbers.json
EX=apps/web/src/features/numbers/exercises.ts
VI=apps/web/src/locales/vi/numbers.json

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
# Keyed on the whole path, not the basename: two of these files are called
# numbers.json, and a backup keyed on the basename restored the Vietnamese
# bundle over the Korean one.
slot() { echo "$WORK/$(echo "$1" | tr '/' '_')"; }
backup() { cp "$1" "$(slot "$1")"; }
restore() { cp "$(slot "$1")" "$1"; }
for f in "$NUMBERS" "$KO" "$EX" "$VI"; do backup "$f"; done

pass=0
fail=0
gate() { npx tsx scripts/numbers-qa.mjs --check; }

expect_fail() {
  local name="$1"
  if gate >"$WORK/out" 2>&1; then
    echo "N-$name: GATE DID NOT FIRE   <<<< PROBLEM"
    fail=$((fail + 1))
  else
    echo "N-$name: caught — $(grep -m1 '✗' "$WORK/out" | sed 's/^ *//' | cut -c1-120)"
    pass=$((pass + 1))
  fi
}

sabotage() { python3 -c "
import io, sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
text = io.open(path, encoding='utf-8').read()
assert old in text, 'the sabotage no longer applies: ' + old[:40]
io.open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
" "$@"; }

echo "N1  the instruction that asked the opposite question"
sabotage "$KO" '"findIncorrectExpression": "다음 중 틀린 표현을 고르세요."' '"findIncorrectExpression": "어느 쪽이 맞을까요?"'
expect_fail 1; restore "$KO"

echo "N2  an explanation gloss stops declaring itself one"
sabotage "$NUMBERS" "    gloss_kind: 'explanation',
    example: '한 개 (✓)  ·  한개 (✗)'," "    example: '한 개 (✓)  ·  한개 (✗)',"
expect_fail 2; restore "$NUMBERS"

echo "N3  삼월 일 일 comes back in the curriculum data"
sabotage "$NUMBERS" "n('num-ch-date', '삼월 일일', 'samwol iril'" "n('num-ch-date', '삼월 일 일', 'samwol il il'"
expect_fail 3; restore "$NUMBERS"

echo "N4  유월 육 일 comes back in a locale bundle"
sabotage "$KO" '삼월 일일' '유월 육 일'
expect_fail 4; restore "$KO"

echo "N5  a pronunciation card is headed 이렇게 써요"
sabotage "$NUMBERS" "    example: '유월 육일',
    example_kind: 'pronunciation'," "    example: '유월 육일',
    example_kind: 'writing',"
expect_fail 5; restore "$NUMBERS"

echo "N6  the blank with nothing in the sentence to decide it"
sabotage "$EX" "  if (!hasContextAnchor(sentence)) return null;
" ""
expect_fail 6; restore "$EX"

echo "N7  두 glosses that name the same thing, offered together"
sabotage "$NUMBERS" "    gloss_group: 'people',
    example: '세 명', counter_system: 'native'," "    example: '세 명', counter_system: 'native',"
expect_fail 7; restore "$NUMBERS"

echo "N8  a language loses one of the ten question-type prompts"
sabotage "$VI" '"chooseCorrectExplanation": "Chọn lời giải thích đúng.",' ''
expect_fail 8; restore "$VI"

echo "N9  a word that fits the same hole becomes a distractor"
sabotage "$NUMBERS" "    slot_group: 'vessel',
    example: '커피 두 잔', counter_system: 'native'," "    example: '커피 두 잔', counter_system: 'native',"
expect_fail 9; restore "$NUMBERS"

echo "N10 a locale keeps a retired prompt key"
sabotage "$VI" '"listenAndChoose"' '"listen"'
expect_fail 10; restore "$VI"

echo
if gate >"$WORK/out" 2>&1; then
  echo "restored: numbers:qa green"
  pass=$((pass + 1))
else
  echo "restored: STILL FAILING   <<<< PROBLEM"
  tail -20 "$WORK/out"
  fail=$((fail + 1))
fi

echo
echo "negative tests: $pass ok, $fail problem(s)"
exit "$fail"
