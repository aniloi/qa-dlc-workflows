---
name: qadlc
description: 'QADLC Gherkin feature-file workflow. Trigger on "Using QADLC", or on keywords BDD, Gherkin, feature file. Plan-first, two-phase, deterministic engine-driven. Supported flags — --resume, --scope, --depth, --stage, --phase, --doctor, --version.'
---

# QADLC Conductor (Kiro)

This skill is the **conductor's forwarding loop**. The deterministic engine owns
routing; you carry out one directive at a time.

## The loop

1. **Preflight the runtime.** Once per session, before your first `next`, run
   `sh .kiro/tools/qadlc-preflight.sh`. If it exits non-zero, **STOP**: show
   its message and end the turn. Do NOT fall back to running the stage markdown
   by hand — without bun the engine cannot route and the stop hook cannot
   enforce the plan gate, so improvising produces `.feature` files with the
   gate silently disabled. That is the one outcome QADLC exists to prevent.
2. **Forward the user's flags.** Take everything the user typed after `/qadlc`
   and append it **unchanged** to your first `next` call. The flags ARE the
   user's intent — dropping them routes the workflow to the wrong place.
   - `/qadlc` → `bun .kiro/tools/qadlc.ts next`
   - `/qadlc --resume` → `bun .kiro/tools/qadlc.ts next --resume`
   - `/qadlc --scope smoke --depth Standard` → `next --scope smoke --depth Standard`
   - `/qadlc --stage story-analysis` → `next --stage story-analysis`
   - `/qadlc --doctor` / `--version` → `next --doctor` / `next --version`
3. The first directive of a session carries the `conductor_persona` — that is the
   content of `.kiro/qa-common/conductor.md`. Adopt it for the whole run.
4. Do exactly the one move the directive names (see the directive table below).
5. Call `bun .kiro/tools/qadlc.ts report …` with the outcome.
6. Repeat until the engine emits a `done` directive.

## Directives

| `type` | What you do |
|---|---|
| `detect-scope` | Detect + confirm the scope from the user's request, then run the named `report --scope …`. |
| `run-stage` | Read the stage file and run its `## Steps` as the named `lead_agent`. |
| `gate` | Produce/finish `gherkin_plan.md`, present it, and WAIT for approval. |
| `print` | Show `message`. If it carries a `command`, that command is your IMMEDIATE next tool call — run it, then resume the loop. If `readonly: true` (`--version`, `--doctor`, errors), just show the message and stop; no state changed. |
| `resume` | Present the `state_summary` and the numbered `options` as prose choices, then act on the user's pick — do NOT assume "continue". |
| `done` | The workflow is complete. Stop. |

## Flag forwarding is non-negotiable

The engine is the sole authority on routing. When a `print` directive names a
`command` (a `report --scope …`, `report --depth …`, or `report --jump …`), run
THAT EXACT command as your next tool call before doing anything else — do not
re-run `next`, re-derive the move, or start a stage first. Re-running the engine
before the named command silently skips the move.

## Rules

- Never write a `.feature` file before `gherkin_plan.md` is approved — the engine
  and the stop hook enforce this gate. The engine refuses `--stage`/`--phase`
  jumps into the execution phase until the plan is approved.
- Log every user input verbatim; the audit-logger hook appends artifact events
  automatically.
- Read the stage file the directive points at
  (`.kiro/qa-common/stages/<phase>/<slug>.md`) and follow its `## Steps`.
