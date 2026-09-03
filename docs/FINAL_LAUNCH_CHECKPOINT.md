# Final launch checkpoint

A resumable ledger for the v1.0.2 final-launch pass. One section per workstream,
with the commit that closed it. Written because this pass has already been
interrupted twice: a session that dies mid-pass must be able to tell finished
work from work that merely started, without redoing either.

Narrative belongs in `docs/report.md`. This file stays a checklist.

**Verdict held:** `RELEASE CANDIDATE — NOT YET RELEASABLE FROM THIS TREE`.

---

## State at resume (3 September 2026, third pass)

| | |
| --- | --- |
| Branch | `main`, upstream `origin/main` |
| Remote | `git@github.com:hangyul-edu/hangyul-ganada.git` |
| Task-owned processes at resume | none. The previous footer's *1 shell still running* was the harness's own shell; `ps` showed only `unattended-upgrade-shutdown`, a system process from before this task |
| Highest versionCode used | 7 at resume, **9** now |

## Completed and committed, this pass

| Workstream | Commit | Verification |
| --- | --- | --- |
| Numbers feedback architecture — 사는 4예요 removed | `29d84ad9` | `copy:generated` 43,744 strings; negative-tested (7,927 findings) |
| Scroll ownership, tab bar, section alignment, Privacy stability | `4af4d928` | 31 + 108 + 240 rendered measurements; three negative tests |
| Report contradictions and the PDF name tokens | `92b4a469` | `docs:consistency` 58 figures; four parsers silent |
| versionCode 8 | `2ce5bd20` | `version:check` |
| Build-8 delivery | `304ecc71` | `release:current` |
| The 118-journey report follows its run | `ecbb18ae` | `synthetic:users:qa` |
| The seven new Korean notes on the ledger | `7f0dbb1a` | `copy:ledger` 839 strings |
| Blank ground measured against the app frame | `126e27ab` | both suites green on mobile and desktop |
| Build-8 delivery rebuilt at the passing tests | `66c21b24` | `release:current` |
| False completion on a slow band load | `034d67ff` | three consecutive level-change runs |
| versionCode 9 | `22b048aa` | `version:check` |
| Build-9 delivery | `890d0359` | `verify:release` green end to end |

## The delivered build

| | |
| --- | --- |
| Built from | `22b048aa` |
| versionName · versionCode | 1.0.2 · **9** |
| APK | 87,763,942 bytes · `7777b402acb2097313714215b747f1422556bee7af1812ccfbca8419f7914da0` |
| AAB | 85,973,157 bytes · `86b00c972940ab810d5f39bfe5c457e197f68a925e7ff7d7cfe5cfbe28bab619` |
| Signature schemes | v2 + v3 |
| Certificate | `157a2bb133f6aa3d…` — the existing production identity |
| iOS | **not built.** No macOS or Xcode here; the project is verified at build 9 |

## Suites at the final tree

| | |
| --- | --- |
| Unit, three packages | **1,289** — 977 web, 216 morphology, 96 handwriting |
| End-to-end | **516**, 258 × 2 projects |
| Generated feedback strings rendered and read | **43,744** across 32 languages |
| Reachable-action measurements | **199** over 25 route/states × 7 sizes |
| Tab-bar measurements | **31** cases |
| Privacy entries | **108**, measured twice each |
| Section-alignment lines, measured as ink | **240** over 60 groups |
| Korean strings read | **839**, 14 rewritten |
| Gates negative-tested | **17** |

## Known blockers (external, not fixable from this repository)

- No macOS or Xcode: no iOS archive. The project is verified, the binary is not built.
- No physical Android device on this machine.
- No native speaker has reviewed any locale.
- No Korean teacher has reviewed the Numbers pedagogy.
- No learner usability study of the Numbers course.
