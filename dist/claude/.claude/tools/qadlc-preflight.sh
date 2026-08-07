#!/bin/sh
# qadlc-preflight.sh — the bun runtime gate.
#
# Every deterministic part of QADLC runs on bun: the engine that routes stages,
# the hooks that enforce the plan gate and write the audit trail, and the
# sensors. With bun absent all of them fail identically — `command not found`,
# exit 127 — and NOTHING STOPS. The harness treats a 127 as a non-blocking hook
# error, so the stop hook's plan-approval gate silently fails OPEN while the
# conductor still holds every stage file in context and can improvise the
# workflow from prose. The user gets .feature files, no gate, and no audit
# trail, with nothing in the transcript saying the framework was never running.
#
# This script is the one QADLC entry point that does not itself need bun, so it
# is the only thing that can say so out loud. POSIX sh, no exec bit assumed —
# always invoke it as `sh <path>`.
#
# Usage:
#   sh <harness-dir>/tools/qadlc-preflight.sh                  probe only
#   sh <harness-dir>/tools/qadlc-preflight.sh cmd [args…]      probe, then exec cmd
#   sh <harness-dir>/tools/qadlc-preflight.sh --brief cmd …    one-line notice, exit 0
#   sh <harness-dir>/tools/qadlc-preflight.sh --quiet cmd …    say nothing, exit 0
#
# Three verbosity modes, because the call sites want different things from the
# same probe. When bun IS present all three are identical: exec the wrapped
# command, passing its stdout and exit status through untouched (so the stop
# hook's decision:block still reaches the harness). They differ only on a
# missing bun:
#
#   default  full diagnosis, exit 1. The deliberate probe — a human or the
#            conductor asked, so give them everything.
#   --brief  one-line notice, exit 0. SessionStart: enough to explain the
#            situation once per session without a wall of text in a session
#            that may have nothing to do with QADLC.
#   --quiet  nothing at all, exit 0. The per-turn and per-edit hooks, where the
#            alternative is four `command not found` errors on every edit in a
#            repo whose owner may not be running QADLC at all. This hides no
#            enforcement: a hook that cannot start fails open whether it exits
#            127 loudly or 0 silently. --brief already carried the news.

mode=full
case "$1" in
  --brief) mode=brief; shift ;;
  --quiet) mode=quiet; shift ;;
esac

if command -v bun >/dev/null 2>&1; then
  [ "$#" -eq 0 ] && exit 0
  exec "$@"
fi

case "$mode" in
  quiet)
    exit 0
    ;;
  brief)
    printf 'QADLC is inactive — bun is not on PATH, so the engine and the plan-approval gate it enforces cannot run. Install bun (https://bun.sh), or run "sh %s" for the full diagnosis.\n' "$0"
    exit 0
    ;;
esac

cat <<'EOF'
QADLC PREFLIGHT FAILED — bun is not on PATH.

QADLC cannot run. Without bun:
  - the engine cannot route stages, so there is no workflow to drive
  - the stop hook cannot enforce the plan-approval gate — it fails OPEN
  - no audit trail is written and no sensor fires

DO NOT run the QADLC workflow from the stage markdown instead. Feature files
produced that way carry no plan gate and no audit trail, which is the one
outcome QADLC exists to prevent.

Fix — install bun (https://bun.sh):
  curl -fsSL https://bun.sh/install | bash
  # or: brew install oven-sh/bun/bun

Already installed? Then your interactive shell has bun and this one does not.
Hooks and tool calls run in a NON-INTERACTIVE shell that never reads ~/.zshrc or
~/.bashrc, so a version manager (fnm, asdf, nvm, mise) or a hand-edited PATH
line is invisible here. Put bun somewhere always on PATH:
  sudo ln -s "$(command -v bun)" /usr/local/bin/bun
EOF

printf '\nRe-run this check:\n  sh %s\n' "$0"
exit 1
