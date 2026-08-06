---
slug: gherkin-plan
phase: discovery
execution: ALWAYS
condition: Always executes — the approval GATE between Discovery and Execution
lead_agent: gherkin-author-agent
support_agents:
  - qa-reviewer-agent
mode: inline
reviewer: qa-reviewer-agent
reviewer_max_iterations: 2
gate: true
foreach: false
order: 5
produces:
  - gherkin-plan
consumes:
  - story-analysis
  - conventions
  - step-inventory
requires_stage:
  - story-analysis
  - step-inventory
sensors:
  - plan-sections
scopes:
  - smoke
  - single-story
  - regression
  - bugfix-repro
  - exploratory
inputs: story-analysis, conventions (if extracted), step-inventory
outputs: gherkin_plan.md at the workspace root (story→scenario mapping, reuse inventory, checklist, new steps, open questions)
---

# Gherkin Plan (GATE)

MANDATORY: Follow `stage-protocol.md`. This stage BLOCKS the workflow until the
user explicitly approves the plan. The engine will not emit any Execution-phase
directive until `report --stage gherkin-plan --approved` is called.

## Steps

### Step 1 — Build the story→scenario mapping
Produce the mapping table: User Story · Acceptance Criterion · Proposed
Scenario(s) · Reusable Steps (from inventory) · New Steps Needed · Target Feature
File. Scale scenario count to the active depth (`depth-levels.md`).

### Step 2 — Write gherkin_plan.md
Write `gherkin_plan.md` to the **workspace root** with: User Story Inventory,
Conventions, Step Reuse Inventory, Story-to-Scenario Mapping, a **Stories Without
Requirements or Insufficient Acceptance Criteria** gap report (see Step 3), an
**Implementation Checklist** (one `- [ ]` per feature file), New Step Definitions
Required, and Open Questions.

### Step 3 — Requirements gap report
After the Story-to-Scenario Mapping and before Open Questions, include a
`## Stories Without Requirements or Insufficient Acceptance Criteria` section
covering three categories:
1. **No description at all** — the story field is empty or restates the title.
2. **Description but no acceptance criteria** — context exists, no testable AC.
3. **Ambiguous or contradictory** — AC exist but are unclear or conflicting.

Report each with story key, summary, and what is missing, plus an "Implications
for Testing" note (how many stories lacked requirements, out of the total) and
recommendations. If every story had sufficient requirements, state that
explicitly — never omit the section. The `plan-sections` sensor checks it is
present.

### Step 4 — Present + WAIT
Present the plan and all Open Questions. **Do not proceed.** Wait for explicit
approval and resolution of every Open Question.

### Step 5 — Report the gate outcome
- Approved → `report --stage gherkin-plan --approved --feature-count <N>` where
  `<N>` is the number of checklist items. The engine flips the plan gate open and
  advances to the Execution phase.
- Changes requested → iterate (up to `reviewer_max_iterations`), then re-present.
  Until approved, the engine keeps the gate closed.

## Sensors

- **`plan-sections`** fires on writes to `gherkin_plan.md` and verifies the plan
  carries the required H2 sections — Story-to-Scenario Mapping, the Stories
  Without Requirements gap report, Implementation Checklist, and Open Questions.
  Advisory: findings surface at the approval gate.

## Learn

Diary at `.qadlc/diaries/gherkin-plan/memory.md`. Record planning
decisions (why a criterion mapped to N scenarios, why an outline vs. separate
scenarios) that could become standing rules.
