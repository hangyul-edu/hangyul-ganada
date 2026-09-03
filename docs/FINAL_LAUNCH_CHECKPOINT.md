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
| Learning-history export and recovery (I-12); Reset clearing six of eight stores (I-127) | `f731bd43` | 966 web unit tests; `verify:release` green end to end at that tree |
| Report §13.3/§13.4, issue ledger, versionCode 5 delivery | `e3b4aaee` | `docs:consistency`, `issues:check`, `release:current` green |
| Backup gates: native key/value pairing, real-IndexedDB end-to-end spec | `b74e1543` | 12 native tests; 2 e2e × 2 projects; negative-tested by reversing the zip |

## In progress

Nothing is half-applied in the working tree. The uncommitted files are the
versionCode 6 artefacts and the report figures that describe them.

## Remaining requirements

Numbered against the current brief.

- [ ] §2 Canonical metrics manifest; report figures generated, not typed; consistency gate widened
- [ ] §3 Home has no visible Back; every other production route has exactly one
- [ ] §4 Global scrolling and reachable bottom actions, audited route by route
- [ ] §5 Numbers availability badges removed
- [ ] §6 Numbers rewritten around usage; ambiguous questions replaced
- [ ] §7 Numbers lesson introduction rewritten
- [ ] §8 Review-complete modal simplified; all result modals audited
- [ ] §9 App-wide Korean editorial audit in rendered context
- [ ] §10 Previous fixes reverified
- [ ] §11 Ambiguity gate strengthened and negative-tested
- [ ] §12 Rendered UI and scroll matrix
- [ ] §13 I-126 difficulty model; levels 1–30 content
- [ ] §14 Version, builds, artefacts
- [ ] §15 Commits and push
- [ ] §16 Report regenerated and inspected page by page

## Known blockers (external, not fixable from this repository)

- No macOS or Xcode: no iOS archive. The project is verified, the binary is not built.
- No physical Android device on this machine.
- No native speaker has reviewed any locale.
- No Korean teacher has reviewed the Numbers pedagogy.
- No learner usability study of the Numbers course.
