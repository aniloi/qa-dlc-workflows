---
name: qa-dlc
description: QA-DLC Gherkin feature-file workflow. Trigger on "Using QA-DLC", or on keywords BDD, Gherkin, feature file. Plan-first, two-phase, deterministic engine-driven.
---

# QA-DLC Conductor (Claude Code)

This skill is the **conductor's forwarding loop**. The deterministic engine owns
routing; you carry out one directive at a time.

## The loop

1. Call `bun .claude/tools/qa-dlc-orchestrate.ts next` to get the next directive.
2. The first directive of a session carries the `conductor_persona` — that is the
   content of `.claude/qa-common/conductor.md`. Adopt it for the whole run.
3. Do exactly the one move the directive names (run a stage, ask a question,
   present a gate).
4. Call `bun .claude/tools/qa-dlc-orchestrate.ts report …` with the outcome.
5. Repeat until the engine emits a `done` directive.

## Rules

- Never write a `.feature` file before `gherkin_plan.md` is approved — the engine
  and the stop hook enforce this gate.
- Log every user input verbatim; the audit-logger hook appends artifact events
  automatically.
- Read the stage file the directive points at
  (`.claude/qa-common/stages/<phase>/<slug>.md`) and follow its `## Steps`.

> Phase 1 scaffold: the engine (`qa-dlc-orchestrate.ts`) and stage files are
> authored in Phase 3. Until then this skill documents the intended loop.
