---
slug: cross-feature-check
phase: execution
execution: ALWAYS
condition: Runs for smoke, single-story, regression; skipped for bugfix-repro and exploratory
lead_agent: qa-reviewer-agent
support_agents: []
mode: inline
reviewer: ""
reviewer_max_iterations: 0
gate: false
foreach: false
order: 2
produces:
  - consistency-report
consumes:
  - feature-files
  - conventions
requires_stage:
  - feature-generation
sensors:
  - duplicate-scenario-name
  - tag-policy
scopes:
  - smoke
  - single-story
  - regression
inputs: All newly written .feature files, conventions
outputs: consistency-report (issues found + resolutions) and the final completion summary
---

# Cross-Feature Consistency Check

MANDATORY: Follow `stage-protocol.md`. This is the final stage — it ends the
workflow.

## Steps

### Step 1 — Check across all new files
Validate across **all** newly written `.feature` files:
- No duplicate scenario names across files
- No conflicting or near-duplicate step wordings
- Consistent tagging: every scenario has ≥1 scope tag and ≥1 component tag
- Feature file names follow the `kebab-case.feature` convention (no ticket numbers)
- Abstraction level is consistently declarative

### Step 2 — Resolve or flag
Resolve issues where the fix is unambiguous; flag for the user where resolution
needs a decision. Re-run affected sensors after any edit.

### Step 3 — Final summary + advance
Present the final completion summary, then
`bun .claude/tools/qa-dlc-orchestrate.ts report --stage cross-feature-check`.
The engine emits `done`.

## Sensors

Bound in Phase 4 (`duplicate-scenario-name`, `tag-policy`). These deterministic
checks are the machine backbone of this stage: they turn the consistency review
from AI-remembered prose into a repeatable check across the written suite.

## Learn

Diary at `aidlc-docs/.qa-dlc-memory/cross-feature-check/memory.md`. A class of
consistency problem you keep catching by hand is a candidate for a new sensor
(author a manifest under `.claude/sensors/` and add its id to this
stage's `sensors:` list per `stage-protocol.md` §Learn).
