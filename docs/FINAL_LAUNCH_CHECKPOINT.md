# Final launch checkpoint

A resumable ledger for the v1.0.2 final-launch pass. One section per workstream,
with the commit that closed it. Written because this pass has already been
interrupted twice: a session that dies mid-pass must be able to tell finished
work from work that merely started, without redoing either.

Narrative belongs in `docs/report.md`. This file stays a checklist.

**Verdict held:** `RELEASE CANDIDATE — NOT YET RELEASABLE FROM THIS TREE`.

---

## State at resume (3 September 2026)

| | |
| --- | --- |
| Branch | `main` |
| Remote | `git@github.com:hangyul-edu/hangyul-ganada.git` |
| Local HEAD | `b74e1543` |
| Remote `origin/main` | `e3b4aaee` — one commit behind local |
| Working tree | dirty in `docs/`, `result/`, `app_result/` only (the versionCode 6 rebuild) |
| Background work | none. A `verify:release` against `b74e1543` was stopped deliberately: this pass changes product code, so its result would have described a tree that no longer exists |
| Stale processes cleared | Gradle daemon (3.5 GB), Kotlin daemon, a 33-minute-old `vite preview` on 4477 |

## Completed and committed

| Workstream | Commit | Verification |
| --- | --- | --- |
| Learning-history export and recovery (I-12); Reset clearing six of eight stores (I-128) | `f731bd43` | 966 web unit tests; `verify:release` green at that tree |
| Report §13.3/§13.4, issue ledger, versionCode 5 delivery | `e3b4aaee` | `docs:consistency`, `issues:check`, `release:current` |
| Backup gates: native key/value pairing, real-IndexedDB end-to-end spec | `b74e1543` | 12 native tests; 2 e2e × 2 projects; negative-tested |
| §3 Home draws no Back; the gate checks both directions | `75bd04d5` | `back:coverage` 22 routes; 25 rendered cases; negative-tested |
| §5–§7, §11 Numbers: usage-first copy, badges removed, ambiguous item removed | `4b0745d6` | `numbers:qa` 0 problems; `numbers:copy` clean; 8 + 12 e2e |
| §4 Reachable actions and the counted scroll lock | `bb0e9825` | `scroll:audit` 199 measurements; negative-tested; 4 lock tests |
| §8 Result screens say what happened, once | `0d874efa` | 976 unit tests; 4 new dialog tests |
| §2 Report figures generated; four cross-artefact rules | `eea2fcd2` | found a duplicated issue id on its first run |
| §9 Every Korean string read; 14 rewritten; ledger gate | `84f1387b` | `copy:ledger` 834 strings; negative-tested |
| §13 I-126 difficulty model; 45 words re-levelled | `7e9fd334` | level shape, 1–30 audit, recommendation, daily plan, 118 journeys |

## In progress

The release cycle: versionCode 7, artefacts, `verify:release`, the report PDF,
and the push.

## Remaining requirements

- [x] §2 canonical metrics manifest and consistency gate
- [x] §3 Home Back policy
- [x] §4 scrolling and reachable actions
- [x] §5 Numbers availability badges
- [x] §6 Numbers pedagogy and ambiguous questions
- [x] §7 Numbers lesson introduction
- [x] §8 result modals
- [x] §9 app-wide Korean editorial audit
- [x] §11 ambiguity gate strengthened and negative-tested
- [x] §12 rendered UI and scroll matrix
- [x] §13 I-126 difficulty model
- [ ] §10 previous fixes reverified — `verify:release` end to end
- [ ] §14 version, builds, artefacts at versionCode 7
- [ ] §15 push and remote SHA verified
- [ ] §16 report regenerated and inspected page by page

## Known blockers (external, not fixable from this repository)

- No macOS or Xcode: no iOS archive. The project is verified, the binary is not built.
- No physical Android device on this machine.
- No native speaker has reviewed any locale.
- No Korean teacher has reviewed the Numbers pedagogy.
- No learner usability study of the Numbers course.
