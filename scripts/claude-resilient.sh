#!/usr/bin/env bash
#
# Keeps a long Hangyul ganada development session alive.
#
# Two layers, and they solve two different problems:
#
#   tmux          the session survives the *terminal* going away — a closed
#                 window, a dropped SSH connection, a Windows Terminal restart.
#                 The Claude process is never a child of the terminal.
#
#   supervisor    the session survives *Claude itself* going away — a crash,
#                 a signal, a host-side VM stall. Diagnostics are captured and
#                 the previous conversation is resumed with `claude --continue`.
#
# tmux alone does not fix a crash and the supervisor alone does not fix a closed
# terminal, so both are here.
#
# Usage:
#   scripts/claude-resilient.sh            attach (or create) the session
#   scripts/claude-resilient.sh --status   report without attaching
#   scripts/claude-resilient.sh --kill     end the session
#   npm run claude:resilient               same as the first form
#
# Anything else is passed through to `claude` on the first launch.

set -uo pipefail

readonly SESSION="${HG_CLAUDE_SESSION:-hangyul}"
readonly PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly STABILITY_DIR="${HOME}/.claude/stability"
readonly MAX_RESTARTS=3
readonly RESTART_WINDOW=600   # seconds — 3 crash restarts per 10 minutes
readonly COOLDOWN=5           # seconds between a crash and the resume
readonly KEEP_REPORTS=20      # bounded: only the most recent crash snapshots

# --- entry point -------------------------------------------------------------

main() {
  case "${1:-}" in
    --status) status; exit $? ;;
    --kill)   tmux kill-session -t "$SESSION" 2>/dev/null && echo "ended '$SESSION'" || echo "no session '$SESSION'"; exit 0 ;;
    --supervise) shift; supervise "$@"; exit $? ;;
  esac

  require_tmux

  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "Attaching to the running '$SESSION' session."
    echo "Detach with Ctrl-b d — Claude keeps running."
    exec tmux attach-session -t "$SESSION"
  fi

  mkdir -p "$STABILITY_DIR"
  echo "Starting Claude in tmux session '$SESSION'."
  echo "Detach with Ctrl-b d — Claude keeps running."

  # The supervisor runs *inside* tmux, so detaching leaves both alive.
  local self="${BASH_SOURCE[0]}"
  tmux new-session -s "$SESSION" -c "$PROJECT_DIR" \
    "'$self' --supervise $(printf '%q ' "$@")"
}

status() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "session '$SESSION': running"
    tmux list-panes -t "$SESSION" -F '  pane #{pane_index}: #{pane_current_command}' 2>/dev/null
  else
    echo "session '$SESSION': not running"
  fi
  local n
  n=$(find "$STABILITY_DIR" -maxdepth 1 -name 'crash-*.log' 2>/dev/null | wc -l)
  echo "crash reports in $STABILITY_DIR: $n"
  [ "$n" -gt 0 ] && echo "most recent: $(ls -t "$STABILITY_DIR"/crash-*.log 2>/dev/null | head -1)"
  return 0
}

require_tmux() {
  command -v tmux >/dev/null 2>&1 && return 0
  echo "tmux is not installed. Install it with:" >&2
  echo "  sudo apt-get install -y tmux" >&2
  exit 1
}

# --- the supervisor ----------------------------------------------------------

supervise() {
  cd "$PROJECT_DIR" || exit 1
  mkdir -p "$STABILITY_DIR"

  local restarts=0
  local window_start=$SECONDS
  local first=1

  while true; do
    if [ "$first" = 1 ]; then
      claude "$@"
    else
      # --continue reopens the most recent conversation in this directory,
      # which is Claude Code's own session store. No second database here.
      claude --continue
    fi
    local code=$?
    first=0

    if is_normal_exit "$code"; then
      echo
      echo "Claude exited normally (status $code). Not restarting."
      echo "Run 'npm run claude:resilient' to start again."
      return "$code"
    fi

    capture_diagnostics "$code"

    # Reset the counter once the window has rolled over, so a crash today and
    # a crash in an hour are not treated as a loop.
    if (( SECONDS - window_start > RESTART_WINDOW )); then
      restarts=0
      window_start=$SECONDS
    fi

    restarts=$((restarts + 1))
    if (( restarts > MAX_RESTARTS )); then
      echo
      echo "Claude has terminated abnormally $MAX_RESTARTS times in under" \
           "$((RESTART_WINDOW / 60)) minutes. Stopping rather than looping."
      echo "Diagnostics: $STABILITY_DIR"
      echo "Resume by hand once the cause is understood:  claude --continue"
      return "$code"
    fi

    echo
    echo "Claude terminated abnormally (status $code)."
    echo "Diagnostics written to $STABILITY_DIR."
    echo "Resuming in ${COOLDOWN}s — attempt $restarts of $MAX_RESTARTS."
    sleep "$COOLDOWN"
  done
}

# 0 is a clean exit. 130 is Ctrl-C and 143 is a polite SIGTERM: both are the
# user asking to stop, so neither restarts. 137 (SIGKILL) and 139 (SIGSEGV) are
# the ones this script exists for.
is_normal_exit() {
  case "$1" in
    0|130|143) return 0 ;;
    *) return 1 ;;
  esac
}

# --- diagnostics -------------------------------------------------------------

capture_diagnostics() {
  local code="$1"
  local stamp report
  stamp=$(date +%Y%m%d-%H%M%S)
  report="$STABILITY_DIR/crash-$stamp.log"

  {
    echo "# Claude Code abnormal termination"
    echo "timestamp:      $(date -Is)"
    echo "exit status:    $code$(signal_note "$code")"
    echo "claude version: $(claude --version 2>&1 | head -1)"
    echo "claude binary:  $(readlink -f "$(command -v claude)" 2>/dev/null)"
    echo "uptime:         $(uptime -p 2>/dev/null)"
    echo "load average:   $(cut -d' ' -f1-3 /proc/loadavg)"
    echo
    echo "## Memory"
    free -h
    echo
    echo "## Swap"
    swapon --show || echo "(no swap)"
    echo
    echo "## Disk"
    df -h / /mnt/c 2>/dev/null
    echo
    echo "## Inodes"
    df -i / 2>/dev/null
    echo
    echo "## Top memory consumers"
    ps -eo pid,ppid,rss,pcpu,comm --sort=-rss 2>/dev/null | head -12
    echo
    echo "## Recent kernel messages (OOM / segfault / kill)"
    dmesg -T 2>/dev/null \
      | grep -Ei 'out of memory|oom|killed process|segfault|sigkill|sigsegv' \
      | tail -20 \
      || echo "(none — an empty section here means the kernel did not kill it,"
    echo "#  which usually points at the Windows host rather than at Linux)"
    echo
    echo "## Last kernel messages"
    dmesg -T 2>/dev/null | tail -15
  } > "$report" 2>&1

  prune_reports
  echo "$report"
}

# Exit statuses above 128 are 128 + signal number.
signal_note() {
  case "$1" in
    137) echo "  (SIGKILL — killed from outside; check host memory, not just Linux)" ;;
    139) echo "  (SIGSEGV — a native crash inside Claude; check 'claude doctor')" ;;
    143) echo "  (SIGTERM)" ;;
    134) echo "  (SIGABRT)" ;;
    *)   echo "" ;;
  esac
}

# Bounded on purpose: crash snapshots are small and finite, never a growing log.
prune_reports() {
  local excess
  excess=$(ls -t "$STABILITY_DIR"/crash-*.log 2>/dev/null | tail -n "+$((KEEP_REPORTS + 1))")
  [ -n "$excess" ] && echo "$excess" | xargs -r rm -f
  return 0
}

main "$@"
