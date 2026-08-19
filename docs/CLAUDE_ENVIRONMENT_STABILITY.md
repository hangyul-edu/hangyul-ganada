# Claude Code environment stability

Why long Hangyul ganada sessions were ending unexpectedly, what the evidence
actually said, and what changed. Measured 2026-08-18 on this machine.

## The environment

| | |
| --- | --- |
| Host | Windows 11 Pro 10.0.26200.9168 |
| Host CPU | 12th Gen Intel Core i7-1260P, 16 logical processors |
| Host RAM | 16,099 MB |
| Host pagefile | `C:\pagefile.sys`, 16,098 MB allocated, 4,071 MB peak |
| `C:` free | 29.3 GB of 230.4 GB |
| WSL | 2.6.1.0, kernel 6.6.87.2-1, WSLg 1.0.66 — current, not updated |
| Distro | Ubuntu 24.04.4 LTS (`Ubuntu-24.04`), **WSL 2** |
| Claude Code | 2.1.234, commit 7215ba60b06d, linux-x64 |
| Install method | npm global — `/usr/lib/node_modules/@anthropic-ai/claude-code` |

## CONFIRMED CAUSE

**The WSL virtual machine was being terminated from the Windows side under host
memory exhaustion. Claude Code was a passenger, not the fault.**

Four independent pieces of evidence, and the order matters — the third is what
rules out the explanation everybody reaches for first.

### 1. The host has no memory to spare

```
host physical RAM ......... 16,099 MB
host free physical ........ 733 MB  (first sample)
                            1,722 MB (second sample, minutes later)
vmmemWSL on the host ...... 2,292 MB while Linux itself reported ~900 MB used
```

The rest was ordinary desktop software that was not going to close: Chrome
across many processes (~2.1 GB), Telegram, Notion, Channel, Defender,
Explorer. Windows and its applications alone hold roughly 12 GB of the 16 GB.

### 2. WSL was allowed to ask for 8 GB on top of that

There was **no `.wslconfig` at all**, so WSL ran on its defaults:

```
memory  = 50% of host RAM  = 8 GB     (kernel confirms: hv_balloon: Max. dynamic memory size: 8048 MB)
swap    = 25% of that      = 2 GB     (confirmed: /dev/sdc, 2G)
processors = all           = 16
```

12 GB already committed plus an 8 GB ceiling does not fit in 16 GB. A heavy
pipeline — Gradle plus the Kotlin daemon, or Vite, or Chromium under Playwright
— walks the VM toward that ceiling, and the host runs out of physical memory
before Linux ever feels pressure.

### 3. Linux never ran out of memory — which is the point

The persisted journal covers 20 boots back to 2025-12-08. Searching every one
of them:

```
journalctl --no-pager | grep -Ei 'out of memory|oom-kill|Killed process|segfault'
→ no matches
```

There is no oom-killer entry, no `Killed process`, no segfault, for Claude or
for anything else, in any boot. Had this been a guest-side OOM the kernel would
have logged the kill. Had it been a native Claude crash there would be a
segfault. The absence of both is what moves the diagnosis outside the VM.

### 4. The VM was being killed, not shut down

The current boot's log opens with:

```
systemd-journald[53]: File /var/log/journal/.../system.journal
                      corrupted or uncleanly shut down, renaming and replacing.
```

A journal is only left dirty when the machine stops without journald flushing —
i.e. the VM vanished rather than exited. The boot table shows the pattern:

```
-2  2026-08-17 09:01:51 → 2026-08-18 07:48:33
-1  2026-08-18 11:10:19 → 2026-08-18 12:08:46   (58 minutes)
 0  2026-08-18 12:25:30 → …
```

Short, abruptly-ended boots with no shutdown sequence in them.

Put together: the host runs out of physical memory, the WSL VM is torn down
from outside, and every process inside it disappears at once. From the terminal
that looks like Claude Code exiting with a signal status, which is why it reads
as a Claude crash.

## What was ruled out

| Suspected | Verdict | Evidence |
| --- | --- | --- |
| Guest (Linux) OOM kill | **No** | No oom-killer entry in 20 boots |
| Claude native crash / segfault | **No** | No segfault in any boot; binary runs clean |
| Corrupted Claude installation | **No** | `claude doctor` → "No installation issues found" |
| Duplicate/conflicting installs | **No** | `/bin` is a symlink to `/usr/bin`; both `claude` entries are one file |
| Unstable Claude release | **No** | 2.1.234, auto-update to it succeeded 2026-08-17 |
| Outdated WSL | **No** | 2.6.1.0 is current; no upgrade performed |
| Disk exhaustion | **No** | `/` 3% used (934 GB free) |
| Inode exhaustion | **No** | `/` 1% inodes used (66.8 M free) |
| Excessive Gradle memory | Contributing | `-Xmx1536m` was modest, but workers were uncapped at 16 |
| Playwright worker fan-out | **No** | Config already pinned to `workers: 1` |
| Host memory pressure | **Yes** | Section above |

Note `claude.exe` under `bin/` is not a Windows executable — `file` reports an
ELF 64-bit Linux binary. The name is how the npm package ships its native
binary on every platform, and it is not a sign of a broken install.

## Protective changes

### `%UserProfile%\.wslconfig` — created

There was no previous file, so nothing was overwritten and no backup was
needed. **These values require a WSL restart to take effect** (see below).

| Setting | Value | Why |
| --- | --- | --- |
| `memory` | `6GB` | Below the 8 GB default on purpose. The cap decides the host's worst case, and the host cannot survive 8 GB. Leaves ~10 GB to Windows. |
| `swap` | `8GB` | Build spikes go to swap inside the VM instead of into host paging. Lives in its own sparse VHD, so it costs `C:` space, not host RAM. 8 GB rather than more because `C:` has only 29.3 GB free. |
| `processors` | `8` | Gradle, vitest and esbuild all size worker pools from the visible CPU count. 16 vCPUs meant 16 concurrent workers, each with a heap. |
| `autoMemoryReclaim` | `gradual` | Returns memory freed inside Linux back to Windows. Without it `vmmem` ratchets upward across a session and never comes down. |
| `sparseVhd` | `true` | Lets the ext4 VHD shrink when build caches are deleted. |

Total addressable memory inside the VM goes from 10 GB (8 + 2) to 14 GB
(6 + 8), while the host's guaranteed floor improves by 2 GB. That is the trade:
more room for builds, less risk to the host.

### `apps/mobile/android/gradle.properties`

```properties
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
kotlin.daemon.jvmargs=-Xmx1024m
org.gradle.workers.max=3
org.gradle.parallel=false
```

The heap went up slightly because 1536m was tight for a release build. The
metaspace cap matters more than the heap: metaspace is not part of `-Xmx`, and
an unbounded one is the usual way a Gradle daemon exhausts a machine. The
Kotlin daemon is a second JVM and needed its own ceiling.

### Concurrency policy

**One heavy pipeline at a time.** Playwright, Chromium, Gradle, an Android
build, a Vite production build and PDF rendering are not run concurrently.
Playwright is already pinned to `workers: 1` in `apps/web/playwright.config.ts`
and stays there.

Node heap was left alone. `NODE_OPTIONS=--max-old-space-size` was not set,
because nothing measured showed a Node heap failure — the web production build
completes well inside the default heap, and raising it globally would add host
pressure to fix a problem that is not there.

## `npm run claude:resilient`

`scripts/claude-resilient.sh`. Two layers, because a closed terminal and a
crashed process are different failures:

- **tmux** — Claude runs in a named session (`hangyul`), never as a child of
  the terminal. Closing the window, dropping the connection or restarting
  Windows Terminal leaves it running. Reattach by running the command again.
- **supervisor** — on abnormal termination it writes a diagnostic snapshot,
  waits 5 seconds and reopens the conversation with `claude --continue`.

Claude Code's own session store is what gets resumed; there is no second
session database.

```bash
npm run claude:resilient    # start, or reattach to a running session
npm run claude:status       # is it running, and what crashed recently
bash scripts/claude-resilient.sh --kill
```

Detach with `Ctrl-b d`.

### Normal exit is respected

| Exit status | Treated as | Action |
| --- | --- | --- |
| `0` | clean exit | stop |
| `130` | Ctrl-C | stop |
| `143` | SIGTERM | stop |
| `137` | SIGKILL — killed from outside | diagnose, resume |
| `139` | SIGSEGV — native crash | diagnose, resume |
| anything else | abnormal | diagnose, resume |

Quitting Claude ends the session. It does not restart.

### Crash-loop protection

At most **3 automatic restarts in 10 minutes**. On the fourth abnormal
termination the supervisor stops and leaves the diagnostics, rather than
looping against a machine that is not going to recover on its own. The window
resets once 10 minutes pass without a crash.

Both behaviours were tested with a stub binary before this document was
written: exit 137 produced exactly 1 initial launch + 3 restarts and then
stopped; exits 0, 130 and 143 each produced exactly 1 launch and no restart.

### Crash diagnostics

`~/.claude/stability/crash-<timestamp>.log`, capped at the 20 most recent —
small finite snapshots, never a continuous log. Each records timestamp, exit
status with its signal meaning, Claude version and binary path, load average,
`free -h`, `swapon --show`, disk and inode usage, the top 12 processes by RSS,
and any recent OOM/segfault kernel messages.

An empty kernel-message section is itself informative here: it means Linux did
not kill the process, which points back at the host.

## Applying the `.wslconfig` — and resuming afterwards

`.wslconfig` is read when the VM starts, so the memory, swap and processor
changes do nothing until WSL is restarted. `wsl --shutdown` stops every
distribution immediately, including whatever session is running in it, so it
was **not** run as part of this work.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\restart-wsl-and-resume.ps1
```

`scripts/windows/restart-wsl-and-resume.ps1` shows the pending config, asks for
confirmation, shuts WSL down, restarts the distro, verifies the memory and swap
the VM came back with, checks the project and Claude are reachable, and reopens
Claude on the previous conversation inside tmux.

Verify afterwards:

```bash
free -h          # expect ~6 GB total
swapon --show    # expect 8 GB
nproc            # expect 8
```

## Recovering after an unexpected exit

```bash
cd ~/hangyul_ganada
npm run claude:resilient     # reattaches, or resumes the last conversation
```

If the launcher was not in use:

```bash
claude --continue            # most recent conversation in this directory
claude --resume              # pick from a list
```

Then check what happened:

```bash
npm run claude:status
cat ~/.claude/stability/crash-*.log | tail -60
```

Read the crash report before assuming it was memory. If the kernel section is
empty and `free -h` looked healthy, the VM was killed from the Windows side —
check what else was open on the host.

## If it happens again

1. `npm run claude:status` — how many crash reports, and when.
2. Read the newest report. Empty kernel section plus healthy `free -h` means
   host-side, not guest-side.
3. On Windows, check free physical memory while it is happening:
   `Get-CimInstance Win32_OperatingSystem | Select FreePhysicalMemory`.
   Under ~1 GB is the condition described above.
4. If the host is genuinely short, lower `memory` in `.wslconfig` further and
   restart, or close some of what is resident on the host.
5. Only if the report shows a segfault (139) with memory healthy is Claude
   Code itself implicated — then `claude doctor`, and reinstall through the
   official installer if it reports a problem.
