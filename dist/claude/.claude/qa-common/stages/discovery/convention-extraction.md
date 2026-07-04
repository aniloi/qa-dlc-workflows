---
slug: convention-extraction
phase: discovery
execution: ALWAYS
condition: Runs for smoke, single-story, regression; skipped for bugfix-repro and exploratory
lead_agent: qa-reviewer-agent
support_agents: []
mode: inline
reviewer: ""
reviewer_max_iterations: 0
gate: false
foreach: false
order: 3
produces:
  - conventions
consumes:
  - workspace-record
requires_stage:
  - workspace-detection
sensors: []
scopes:
  - smoke
  - single-story
  - regression
inputs: The selected style-reference .feature file + existing feature files
outputs: conventions notes (tagging, naming, Background usage, abstraction level)
---

# Convention Extraction

MANDATORY: Follow `stage-protocol.md`.

## Steps

### Step 1 — Read the style reference
Read the style-reference `.feature` selected in Workspace Detection, plus a
sample of existing feature files.

### Step 2 — Extract the house style
Capture:
- Step wording patterns and parameterization style
- `Background` vs. inline setup usage
- Tagging conventions (`@smoke`, `@regression`, `@e2e`, `@negative`, component tags)
- Data-table and `Scenario Outline` patterns
- Feature file naming convention (`kebab-case.feature` — no ticket numbers)
- Abstraction level — declarative, not procedural

### Step 3 — Reconcile with team memory
If team convention memory exists (`.claude/memory/` / space memory),
reconcile the extracted style with the standing team rules; the team rule wins on
conflict and the divergence is noted as an Open Question.

### Step 4 — Advance
`bun .claude/tools/qadlc-orchestrate.ts report --stage convention-extraction`.

## Sensors

None bound. Convention Extraction produces notes.

## Learn

Diary at `aidlc-docs/.qadlc-memory/convention-extraction/memory.md`. A stable,
repeated convention (e.g. "every API scenario is tagged `@api`") is a strong
candidate to promote into team memory so future runs load it instead of
re-deriving it.
