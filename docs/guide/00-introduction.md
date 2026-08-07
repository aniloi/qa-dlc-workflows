# QADLC v2 — User Guide

> **User Guide** · [Harness Engineer Guide](../harness-engineering/00-overview.md) · [Developer Reference](../reference/00-overview.md)

This guide is for anyone **using** QADLC to author Gherkin feature files.

## What it does

You invoke QADLC with a story source and a scope; it runs a two-phase workflow —
Discovery then Execution — and never writes a `.feature` file before you approve
the plan.

```
Using QADLC, write feature files for CLM-123
```

## The two phases and seven stages

**Discovery** (plan before writing):
1. **Workspace Detection** — repo layout, steps dir, features dir, style reference
2. **Story Analysis** — acceptance criteria + open questions
3. **Convention Extraction** — your house tagging/naming/abstraction style
4. **Step Inventory** — catalog of reusable steps
5. **Gherkin Plan** — `gherkin_plan.md` + **approval gate** (the workflow stops here)

**Execution** (write after approval):
6. **Feature File Generation** — one `.feature` at a time, checkbox after each
7. **Cross-Feature Consistency Check** — no duplicate names, consistent tagging

## Scopes and depth

The **scope** decides which stages run and how deep:

| Scope | Depth | Stages | Use for |
|---|---|---|---|
| `smoke` | Minimal | all 7 | happy-path deploy-gate set |
| `single-story` | Standard | all 7 | one story, primary + negative cases |
| `regression` | Comprehensive | all 7 | epic / release, exhaustive |
| `bugfix-repro` | Minimal | 5 (no convention-extraction, no cross-feature-check) | reproduce a defect |
| `exploratory` | Minimal | 5 | quick draft scenarios |

**Depth** (Minimal / Standard / Comprehensive) controls coverage exhaustiveness —
see [depth-levels](../../core/qa-common/depth-levels.md). You can override the
scope's default depth at the plan gate.

## The plan gate

QADLC will not write a single `.feature` line until you approve `gherkin_plan.md`.
This is enforced by the engine and the stop hook — not left to the model's memory.

## Sensors (automatic quality checks)

On every `.feature` write, deterministic sensors fire: structural `gherkin-lint`,
`tag-policy`, `step-existence` (against your step catalog), and
`duplicate-scenario-name`. They are advisory — findings surface at the next gate
in `aidlc-docs/.qadlc-sensors/`, they never silently block you.

## State, audit, resume

- Progress lives in `aidlc-docs/qa-state.md` (tool-owned).
- Every input and event is logged to `aidlc-docs/audit.md`.
- Interrupted? Just invoke again, or run `/qadlc --resume` — the engine resumes
  from state and offers a continue / review / redo / jump / start-fresh choice.
  See [session continuity](../../core/qa-common/session-continuity.md).

## Flags

Pass flags after `/qadlc`; the conductor forwards them to the engine unchanged:

- `--resume` — resume an in-progress session with a choice menu
- `--scope <name>` — start, or mid-flight change, the scope (smoke, single-story,
  regression, bugfix-repro, exploratory)
- `--depth <level>` — override coverage depth (Minimal, Standard, Comprehensive)
- `--stage <slug>` / `--phase <name>` — jump the stage pointer (jumps into the
  execution phase are refused until the plan is approved)
- `--doctor` — check the setup (bun, compiled data, state, hook health)
- `--version` — print the framework version

`--doctor` runs *on* bun, so it cannot report bun missing. That case is covered
by the preflight, which is plain `sh`:

```bash
sh .claude/tools/qadlc-preflight.sh   # or .kiro/
```

The conductor runs it before its first `next` and stops the session if it fails,
rather than quietly falling back to running the stage markdown by hand — a
fallback that would produce feature files with the plan gate switched off.

## Runner commands

- `qadlc-session-cost` — a compact status report of the current session
- `qadlc-replay` — reconstruct the session timeline from the audit trail
