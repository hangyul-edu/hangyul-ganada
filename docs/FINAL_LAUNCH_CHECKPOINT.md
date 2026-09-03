# Final launch checkpoint

A resumable ledger for the v1.0.2 final-launch pass. One section per workstream,
with the commit that closed it. Written because this pass has already been
interrupted three times: a session that dies mid-pass must be able to tell
finished work from work that merely started, without redoing either.

Narrative belongs in `docs/report.md`. This file stays a checklist.

**Verdict held:** `RELEASE CANDIDATE — NOT YET RELEASABLE FROM THIS TREE`.

---

## State at resume (4 September 2026, fourth pass)

| | |
| --- | --- |
| Branch | `main`, upstream `origin/main` |
| Remote | `git@github.com:hangyul-edu/hangyul-ganada.git` |
| Resumed from | `306dde1a`, tree clean, no task-owned processes |
| Highest versionCode used | 9 at resume |

Two screenshots were named in the brief — a notched ㅌ and a malformed 꽃 — and
neither the files nor the images were on this machine or attached to the
session. Both were reproduced from their written descriptions, which turned out
to be precise enough to find the geometry at fault in each case; the
reproductions are recorded in §20O.1 and §20O.2 with the measurements that
confirmed them. The same applies to `report(20260903-120755).pdf`: not present
anywhere on this filesystem, and `docs/report.pdf` (later than that timestamp)
was used as the newest report instead.

## Completed and committed, this pass

| Workstream | Commit | Verification |
| --- | --- | --- |
| Back navigation as one route table | `1a7d75fb` | `route:policy:check` 23/23, 17 e2e cases, 3 negative tests |
| ㅌ and 꽃, and the structural gate | `9ded6810` | `glyph:structure` 73 items / 86 junctions / 0 exceptions, 5 negative tests, contact sheets reviewed |
| Level-appropriate Today's Vocabulary | `a560b1d3` | `dailyplan:level` 4,500 plans, 0 outside the band, 2 negative tests |
| Exactly-once crediting | `9fb5ee5f` | store case fails against the old rule by timing out on a counter that never reaches 1 |
| Home row, backup copy, Numbers feedback and teaching | `c51370db` | `copy:generated` 29,248, `numbers:qa`, `numbers:copy`, `scroll:audit`, i18n |

## Deliberately not landed, and why

**I-133 — usefulness as a level ceiling.** Measured this pass: 85 words an
editor marked maximally useful sit above level 6, including every day of the
week at 9. The fix is written into the issue. It re-levels the corpus, which
regenerates the level-test bank, the anchors and the editorial QA — not a change
to make and verify in the hours before a release build. The measurement is
recorded so the next pass starts from it rather than from another eighteen
hand-written overrides. See §20O.12.

## Known blockers (external, not fixable from this repository)

- No macOS or Xcode: no iOS archive. The project is verified, the binary is not
  built.
- No physical Android device on this machine.
- No native speaker has reviewed any locale. Every locale row in the copy ledger
  was read by the model that wrote it, which is the same pair of eyes twice, and
  the ledger records that rather than upgrading it.
- No Korean teacher has reviewed the Numbers pedagogy, including the visual
  explanation model introduced this pass.
- No learner usability study of the Numbers course.
- I-03: the Hangyul hand-off has no destination. A business-owned value; not
  guessed.
