---
slug: step-inventory
phase: discovery
execution: ALWAYS
condition: Always executes
lead_agent: qa-analyst-agent
support_agents: []
mode: inline
reviewer: ""
reviewer_max_iterations: 0
gate: false
foreach: false
order: 4
produces:
  - step-inventory
  - step-catalog
consumes:
  - workspace-record
requires_stage:
  - workspace-detection
sensors: []
scopes:
  - smoke
  - single-story
  - regression
  - bugfix-repro
  - exploratory
inputs: All step-definition classes under the steps directory (READ ONLY)
outputs: step-inventory grouped by domain, with Cucumber expressions / regex and parameterization; the machine-readable step catalog at aidlc-docs/.qadlc/step-catalog.json
---

# Step Inventory

MANDATORY: Follow `stage-protocol.md`.

## Steps

### Step 1 — Read all step definitions
Read **all** step-definition classes under the steps directory (READ ONLY — never
modify them). This directory is the authoritative source of reusable steps.

### Step 2 — Build the inventory
Catalogue every `Given` / `When` / `Then` with its Cucumber expression or regex
pattern. Group by domain (account, deposit, schema, auth, …). Note the
parameterization for each step.

### Step 3 — Generate the machine-readable catalog
MANDATORY, not optional: the `step-existence` sensor's oracle is a generated
file, never a hand-written one. Run

```
bun .kiro/tools/qadlc-build-step-catalog.ts --steps-dir <steps dir>
```

(one `--steps-dir` per directory recorded in the workspace-record) which writes
`aidlc-docs/.qadlc/step-catalog.json`. It prints a JSON summary — record the
`definitions` and `steps` counts in the diary.

**Do not hand-author or hand-patch this file.** A hand-rolled catalog drifts from
the suite, and an entry that no step definition backs lets an invented step pass
the sensor. If the tool exits non-zero, fix the input (usually the wrong
`--steps-dir`) — do not fall back to writing the JSON yourself. If it cannot be
run at all, say so plainly in the completion message: the `step-existence` sensor
will advisory-pass every file for the rest of the session, so reuse is enforced by
reading alone.

### Step 4 — Feed reuse
This inventory is the backbone of the "reuse over invention" tenet: the Gherkin
Plan must map each proposed scenario's steps to entries here before proposing any
new step.

### Step 5 — Advance
`bun .kiro/tools/qadlc-orchestrate.ts report --stage step-inventory`.

## Sensors

None bound at this stage. The `step-existence` sensor (bound to Feature File
Generation) uses the catalog from Step 3 as its oracle when it fires on written
`.feature` files — so skipping Step 3 silently disarms that sensor.

## Learn

Diary at `aidlc-docs/.qadlc-memory/step-inventory/memory.md`. Note domains with
sparse coverage (likely sources of new-step requests) for later attention, and
record the catalog counts from Step 3 so drift between runs is visible.
