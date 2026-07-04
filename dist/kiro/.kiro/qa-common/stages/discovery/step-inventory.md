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
outputs: step-inventory grouped by domain, with Cucumber expressions / regex and parameterization
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

### Step 3 — Feed reuse
This inventory is the backbone of the "reuse over invention" tenet: the Gherkin
Plan must map each proposed scenario's steps to entries here before proposing any
new step.

### Step 4 — Advance
`bun .kiro/tools/qa-dlc-orchestrate.ts report --stage step-inventory`.

## Sensors

None bound at this stage. The `step-existence` sensor (bound to Feature File
Generation) uses this inventory as its oracle when it fires on written `.feature`
files.

## Learn

Diary at `aidlc-docs/.qa-dlc-memory/step-inventory/memory.md`. Note domains with
sparse coverage (likely sources of new-step requests) for later attention.
