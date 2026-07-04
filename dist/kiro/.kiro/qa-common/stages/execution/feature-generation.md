---
slug: feature-generation
phase: execution
execution: ALWAYS
condition: Runs after plan approval — one .feature file at a time per the checklist
lead_agent: gherkin-author-agent
support_agents: []
mode: inline
reviewer: ""
reviewer_max_iterations: 0
gate: false
foreach: true
order: 1
produces:
  - feature-files
consumes:
  - gherkin-plan
  - step-inventory
  - conventions
requires_stage:
  - gherkin-plan
sensors:
  - gherkin-lint
  - tag-policy
  - step-existence
scopes:
  - smoke
  - single-story
  - regression
  - bugfix-repro
  - exploratory
inputs: Approved gherkin_plan.md (Implementation Checklist), step-inventory, conventions
outputs: One .feature file per checklist item, written under the features directory
---

# Feature File Generation

MANDATORY: Follow `stage-protocol.md`. Runs ONLY after the plan gate is open.

## Steps

**For each feature file in the approved checklist, in order:**

### Step 1 — Write one file
Write a single `.feature` file to the appropriate subdirectory under the features
directory, following the existing folder structure. Apply all Gherkin Writing
Rules (`gherkin-writing-rules.md`): declarative style, `Background` only for
setup shared by every scenario, `Scenario Outline` at the ≥3-variation threshold,
step reuse over invention, correct tagging for the depth.

### Step 2 — Mark the checkbox
Immediately mark that file `[x]` in `gherkin_plan.md`, in the same interaction.

### Step 3 — Report the file
`bun .kiro/tools/qa-dlc-orchestrate.ts report --stage feature-generation --file <path>`.
This increments the written count and appends a FEATURE_FILE_WRITTEN audit row.
When the last file is written, add `--done` (or the engine auto-completes once
written == total). Then it advances to the Cross-Feature Consistency Check.

## Sensors

Bound in Phase 4 (`gherkin-lint`, `step-existence`, `tag-policy`). Each fires on
every `.feature` write via the sensor-fire hook and writes advisory detail to
`aidlc-docs/.qa-dlc-sensors/feature-generation/`. Advisory: findings surface at
the gate; they do not silently block.

## Learn

Diary at `aidlc-docs/.qa-dlc-memory/feature-generation/memory.md`. Record any new
step definition you had to request and why no existing step fit — a repeated
pattern is a candidate new standing step or a gap to raise with the team.
