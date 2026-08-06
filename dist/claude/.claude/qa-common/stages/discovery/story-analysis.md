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

### Step 2 — Load the project knowledge base (if present)
If the project ships a knowledge base (a `kb/` directory or the location named in
`.qadlc/memory/project.md`), load *only the relevant slices* — never the whole KB:

1. Read the KB's root index (e.g. `kb/index.md`) — the consumption guide.
2. If the story key has a project prefix, use the index's **prefix → sections**
   map to pre-load the matching files.
3. Scan the stories for domain keywords and use the index's **domain → category**
   map to find additional relevant categories; read each category index, then the
   specific concept files it links.
4. Always read the KB's glossary / agent-notes file — it carries interpretation
   guidance that applies regardless of domain.

Use the loaded knowledge to resolve ambiguous terminology, surface **implied**
acceptance criteria the author did not write (business rules, prerequisite
states, error conditions), and understand the prior state a scenario needs (which
feeds the `Given` steps in the plan). This is the project's tier-2 knowledge (see
`stage-protocol.md` §5).

### Step 3 — Extract acceptance criteria
For each story, extract all explicit and implied acceptance criteria. Produce a
one-line summary per story.

### Step 4 — Flag ambiguities
Flag stories that are ambiguous, out-of-scope, or contradictory as **Open
Questions**. Use the `[Answer]:` A–E + X format from `stage-protocol.md`. Do not
guess where interpretations would meaningfully diverge — ask.

Also classify each story's requirement quality for the plan's gap report (see the
Gherkin Plan stage): **no description**, **description but no acceptance
criteria**, or **ambiguous/contradictory**. Carry these classifications forward —
they populate the "Stories Without Requirements or Insufficient Acceptance
Criteria" section of `gherkin_plan.md`.

### Step 5 — Scale to depth
Scale the analysis to the active depth (`depth-levels.md`): Minimal focuses on
the happy path per criterion; Comprehensive enumerates negative, boundary, and
data-driven cases the criteria imply.

### Step 6 — Advance
Report completion:
`bun .claude/tools/qadlc.ts report --stage story-analysis`.

## Sensors

None bound. Story Analysis produces notes, not `.feature` output.

## Learn

Diary at `.qadlc/diaries/story-analysis/memory.md`. Record
interpretations of ambiguous criteria and any recurring story-shape conventions
worth promoting to team memory.
