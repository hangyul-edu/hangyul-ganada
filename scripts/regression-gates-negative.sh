#!/usr/bin/env bash
#
# Six sabotage runs against the gates added for this cycle.
#
#   bash scripts/regression-gates-negative.sh            all six
#   bash scripts/regression-gates-negative.sh --fast     skip the two that rebuild
#
# ## Why a gate needs this
#
# A gate that has only ever been seen passing is a gate nobody has evidence
# about — the standing argument in `scripts/numbers-qa-negative.sh`, which does
# the same job for the ten rules that predate this cycle. Each case here puts
# back the defect a gate was written for, asserts the gate exits non-zero, and
# restores the fix. The last step re-runs everything clean, so a run that leaves
# the tree broken says so rather than ending quietly.
#
# | | |
# | --- | --- |
# | **G1** | The empty 20 px icon column at the head of every Numbers lesson row. |
# | **G2** | A badge bounded by its fill rather than by the ring it is drawn with. |
# | **G3** | A blank whose option list holds two words that fit it. |
# | **G4** | 둘 개 — the plain numeral in front of a counter. |
# | **G5** | A `completed_at` with no evidence behind it, kept rather than cleared. |
# | **G6** | 밥을 먹고 ____을 드세요, with 물 back among its four options. |
# | **G7** | 일곱 시에 ____ — the photographed item, put straight back in the bank. |
# | **G8** | ____이 문을 열었어요 with 학생 and 형 back among its options. |
#
# G1 rebuilds the web bundle twice and drives a browser over 45 cases, so it is
# the slow one; `--fast` leaves it out for a quick pass and the full run is what
# a release does.
set -u
cd "$(dirname "$0")/.."

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

PAGE=apps/web/src/pages/NumbersPage.tsx
PAGECSS=apps/web/src/pages/NumbersPage.module.css
MARKERS=apps/web/src/ui/strokeMarkers.ts
NUMBERS=apps/web/src/data/numbers.ts
PROGRESS=apps/web/src/domain/numbersProgress.ts
EXERCISES=apps/web/src/features/numbers/exercises.ts

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
slot() { echo "$WORK/$(echo "$1" | tr '/' '_')"; }
backup() { cp "$1" "$(slot "$1")"; }
restore() { cp "$(slot "$1")" "$1"; }
for f in "$PAGE" "$PAGECSS" "$MARKERS" "$NUMBERS" "$PROGRESS" "$EXERCISES"; do backup "$f"; done

pass=0
fail=0

sabotage() { python3 -c "
import io, sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
text = io.open(path, encoding='utf-8').read()
assert old in text, 'the sabotage no longer applies: ' + old[:60]
io.open(path, 'w', encoding='utf-8').write(text.replace(old, new, 1))
" "$@"; }

expect_fail() {
  local name="$1"; shift
  if "$@" >"$WORK/out" 2>&1; then
    echo "$name: GATE DID NOT FIRE   <<<< PROBLEM"
    fail=$((fail + 1))
  else
    echo "$name: caught — $(grep -m1 -E '✗|problem|reserves|paints|outside|two right answers|swallowed|only when|are both people' "$WORK/out" | sed 's/^ *//' | cut -c1-130)"
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
    fail=$((fail + 1))
  fi
}

layout_gate() { npm run --silent build >/dev/null 2>&1 && npx tsx scripts/numbers-layout-qa.mjs --check; }
marker_gate() { npx tsx scripts/marker-placement-qa.mjs --check; }
numbers_gate() { npx tsx scripts/numbers-qa.mjs --check; }
ambiguity_gate() { npx tsx scripts/level-test-ambiguity-qa.mjs --check; }

if [ "$FAST" -eq 0 ]; then
  echo "G1  the empty icon column at the head of every lesson row"
  sabotage "$PAGE" '                      <span className={styles.lessonBody}>' \
'                      <span className={styles.lessonIcon} aria-hidden="true">
                        {ticked ? <CheckIcon size={14} /> : null}
                      </span>
                      <span className={styles.lessonBody}>'
  printf '\n.lessonIcon {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 20px;\n}\n' >>"$PAGECSS"
  expect_fail G1 layout_gate
  restore "$PAGE"; restore "$PAGECSS"
else
  echo "G1  skipped (--fast)"
fi

echo "G2  a badge bounded by its fill rather than by its ring"
sabotage "$MARKERS" '  const outer = paintedRadius(radius) + EDGE_MARGIN;' \
'  const outer = radius;'
expect_fail G2 marker_gate
restore "$MARKERS"

# Giving two items the same gloss key is *not* the sabotage to use here: the
# builder already drops an option whose text equals the answer's, so the
# question quietly loses a button instead of gaining an answer. The way a second
# right answer actually reaches a learner is a blank that two words fit, and the
# guard against that is `slot_group` — 맥주 한 병 beside 맥주 한 잔.
echo "G3  a blank whose option list holds two words that fit it"
sabotage "$EXERCISES" "    // A sibling that fits the same slot is not a distractor — see \`slot_group\`.
    siblingsDistinct(
      item,
      ctx.siblings.filter((s) => !(item.slot_group && s.slot_group === item.slot_group))," \
"    siblingsDistinct(
      item,
      ctx.siblings,"
expect_fail G3 numbers_gate
restore "$EXERCISES"

echo "G4  둘 개 — the plain numeral in front of a counter"
# Anchored on the example line alone. The original sabotage quoted the whole
# `n(...)` call and stopped matching the moment a `domain:` field was added to
# it, so G4 spent that time asserting nothing and reporting itself as a problem
# only because the assertion in `sabotage` is loud. A negative case pinned to
# more source than it needs is a negative case with an expiry date.
sabotage "$NUMBERS" "    example: '두 개', note: 'note.countingForm'," \
"    example: '둘 개', note: 'note.countingForm',"
expect_fail G4 numbers_gate
restore "$NUMBERS"

echo "G5  a completed_at with no evidence behind it, kept"
sabotage "$PROGRESS" '  // The claim must be backed by the evidence, or the claim goes.
  if (repaired.completed_at !== null) {
    const probe = { ...repaired, completed_at: null };
    if (!isComplete(probe, lesson)) repaired.completed_at = null;
  }' \
'  // sabotaged'
expect_fail G5 numbers_gate
restore "$PROGRESS"

# The question a reader photographed. 물 and 약 are both ordinary answers to
# "take ___ after eating", and the item shipped with both — the class guard only
# fires when *both* words are classified and 약 carried no class at all. The
# sabotage is the shipped artefact rather than the source, because the bank is
# what a learner is served and what the gate reads.
echo "G6  밥을 먹고 ____을 드세요, with 물 back among its options"
BANK="apps/web/public/level-test/$(python3 -c "
import json;print(json.load(open('apps/web/public/level-test/manifest.json',encoding='utf-8'))['bank'])")"
backup "$BANK"
python3 -c "
import json,sys
p=sys.argv[1]
d=json.load(open(p,encoding='utf-8'))
for item in d['items']:
    if item['id']=='word_yak:context':
        item['options']=sorted(['다음','물','산','약'])
        item['distractorIds']=['word_daeum','word_mul','word_san']
        break
else:
    raise SystemExit('word_yak:context is not in the bank')
json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False)
" "$BANK"
expect_fail G6 ambiguity_gate
restore "$BANK"

# G7 and G8 edit the built bank rather than the editorial pack, for the same
# reason G6 does: rebuilding from the pack redraws every distractor in the file
# and the run would then be asserting against a bank nobody has read. What is
# put back is exactly the item a reader photographed.
echo "G7  일곱 시에 ____ — a sentence that says only when"
backup "$BANK"
python3 -c "
import json,sys
p=sys.argv[1]
d=json.load(open(p,encoding='utf-8'))
for item in d['items']:
    if item['id']=='word_ireonada:context':
        item['prompt']='일곱 시에 ____.'
        item['options']=['도와요','연습해요','일어나요','잘해요']
        item['answer']='일어나요'
        item['form']='presentPolite'
        break
else:
    raise SystemExit('word_ireonada:context is not in the bank')
json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False)
" "$BANK"
expect_fail G7 ambiguity_gate
restore "$BANK"

echo "G8  ____이 문을 열었어요, with two people among its options"
python3 -c "
import json,sys
p=sys.argv[1]
d=json.load(open(p,encoding='utf-8'))
for item in d['items']:
    if item['id']=='word_eunhaeng:context':
        item['options']=sorted(['얼음','은행','학생','형'])
        break
else:
    raise SystemExit('word_eunhaeng:context is not in the bank')
json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False)
" "$BANK"
expect_fail G8 ambiguity_gate
restore "$BANK"

echo
expect_pass "restored: level-test ambiguity" ambiguity_gate
expect_pass "restored: strokes:markers" marker_gate
expect_pass "restored: numbers:qa" numbers_gate
if [ "$FAST" -eq 0 ]; then
  expect_pass "restored: numbers:layout" layout_gate
fi

echo
echo "negative tests: $pass ok, $fail problem(s)"
exit "$fail"
