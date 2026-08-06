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
#   sh <harness-dir>/tools/qadlc-preflight.sh                    probe only
#   sh <harness-dir>/tools/qadlc-preflight.sh cmd [args…]        probe, then exec cmd
#   sh <harness-dir>/tools/qadlc-preflight.sh --advisory cmd …   never fail (hook use)
#
# Exit: 0 when bun is present (or the exec'd command's own status); 1 when bun
# is missing. With --advisory a missing bun still reports but exits 0, for hook
# call sites that must not turn a warning into a harness error.

advisory=0
if [ "$1" = "--advisory" ]; then
  advisory=1
  shift
fi

if command -v bun >/dev/null 2>&1; then
  [ "$#" -eq 0 ] && exit 0
  exec "$@"
fi

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

[ "$advisory" -eq 1 ] && exit 0
exit 1
