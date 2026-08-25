# Hangyul ganada (한귤 가나다) — project guide for Claude Code

Hangul letter-learning and handwriting practice app. **Standalone, paid, offline** —
no account, no login, no subscription, no network at runtime; every lesson and
recording ships inside the app.

> This file was created 2026-08-25 as a navigation index so that project context
> survives a crashed or compacted session. It deliberately records only what is
> verifiable from the repo — extend it with the decisions and rules you want
> enforced permanently.

## Read these before changing code

`README.md` is the product overview. The authoritative documents live in `docs/`:

| Document | What it holds |
|:---|:---|
| `docs/ARCHITECTURE.md` | System architecture |
| `docs/CLAUDE_ENVIRONMENT_STABILITY.md` | **Why long sessions were dying, and the WSL/host settings that fix it. Read before touching `.wslconfig`, memory or build concurrency.** |
| `docs/AUDIO.md` | Pronunciation corpus and audio pipeline |
| `docs/HANDWRITING_EVALUATION.md` | Stroke/handwriting scoring |
| `docs/VOCABULARY_DATA.md`, `docs/VOCABULARY_LEVEL_CALIBRATION.md` | Vocabulary dataset and levelling |
| `docs/DEPLOYMENT.md` | Release/deploy process |
| `docs/BEGINNER_TEST_PROTOCOL.md` | How the product is tested with real beginners |
| `docs/DESIGN_AUDIT.md`, `docs/i18n-quality-review.md`, `docs/LOCALIZATION_NATIVE_REVIEW.md` | Design and language quality reviews |

## Layout

npm workspaces: `apps/web`, `apps/mobile`, `apps/common_assets`, and
`packages/{design-tokens,handwriting-core,korean-morphology,shared-types}`.
Node >= 20.

## Commands

```bash
npm run dev          # web dev server (apps/web)
npm run build        # production build
npm run lint         # all workspaces
npm run typecheck    # all workspaces
npm test             # all workspaces
npm run test:e2e     # Playwright (apps/web)
```

Content/QA generators follow a `<area>:qa` / `<area>:qa:check` convention — the
`:check` form validates without rewriting (`tokens:check`, `curriculum:check`,
`strokes:qa:check`, `vocabulary:qa:check`, `screens:audit:check`, and others; see
`package.json` for the full list). Use the `:check` variants in verification passes.

## Environment stability — do not relearn this the hard way

Long sessions were ending because **the WSL VM was torn down from the Windows side
under host memory exhaustion**, not because Claude Code crashed. The host holds
~12 GB of its 16 GB in ordinary desktop apps, so the WSL memory ceiling decides the
host's worst case.

- `%UserProfile%\.wslconfig` is tuned deliberately: `memory=6GB`, `processors=8`,
  `swap=8GB`, `autoMemoryReclaim=gradual`, `sparseVhd=true`. **Raising `memory`
  toward the 8 GB default re-creates the crash.** Rationale for each value is in
  `docs/CLAUDE_ENVIRONMENT_STABILITY.md`.
- **One heavy pipeline at a time.** Playwright, Chromium, Gradle, Android builds,
  Vite production builds and PDF rendering are not run concurrently.
- **Shut down Android emulators when finished** (`adb -s emulator-5554 emu kill`).
  A forgotten headless emulator holds ~2.4 GB and pushes the VM into swap.
- Run long sessions under `npm run claude:resilient` (tmux + crash supervisor that
  resumes with `claude --continue`); `npm run claude:status` reports recent crashes.
- Applying a `.wslconfig` change requires a VM restart:
  `powershell -ExecutionPolicy Bypass -File scripts\windows\restart-wsl-and-resume.ps1`

## Working habits that survive a crash

Keep architecture decisions in `docs/`, not only in a conversation. Commit
meaningfully as you go, but never commit unfinished or broken code just to create a
checkpoint. When a task spans many steps, leave a short current-status note in the
relevant document so the next session can pick it up.
