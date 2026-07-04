---
slug: story-analysis
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
order: 2
produces:
  - story-analysis
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
inputs: User story files (or the bug report, for bugfix-repro)
outputs: story-analysis notes (per-story summary, acceptance criteria, open questions)
---

# Story Analysis

MANDATORY: Follow `stage-protocol.md` for question format and completion messages.

## Steps

### Step 1 — Read every story
Read **every** file in the user-stories source. For bugfix-repro, the bug report
is the story: extract the observed behavior and the expected behavior.

### Step 2 — Extract acceptance criteria
For each story, extract all explicit and implied acceptance criteria. Produce a
one-line summary per story.

### Step 3 — Flag ambiguities
Flag stories that are ambiguous, out-of-scope, or contradictory as **Open
Questions**. Use the `[Answer]:` A–E + X format from `stage-protocol.md`. Do not
guess where interpretations would meaningfully diverge — ask.

Also classify each story's requirement quality for the plan's gap report (see the
Gherkin Plan stage): **no description**, **description but no acceptance
criteria**, or **ambiguous/contradictory**. Carry these classifications forward —
they populate the "Stories Without Requirements or Insufficient Acceptance
Criteria" section of `gherkin_plan.md`.

### Step 4 — Scale to depth
Scale the analysis to the active depth (`depth-levels.md`): Minimal focuses on
the happy path per criterion; Comprehensive enumerates negative, boundary, and
data-driven cases the criteria imply.

### Step 5 — Advance
Report completion:
`bun {{HARNESS_DIR}}/tools/qa-dlc-orchestrate.ts report --stage story-analysis`.

## Sensors

None bound. Story Analysis produces notes, not `.feature` output.

## Learn

Diary at `aidlc-docs/.qa-dlc-memory/story-analysis/memory.md`. Record
interpretations of ambiguous criteria and any recurring story-shape conventions
worth promoting to team memory.
