---
slug: workspace-detection
phase: discovery
execution: ALWAYS
condition: Always executes — the first move of every session
lead_agent: qa-analyst-agent
support_agents: []
mode: inline
reviewer: ""
reviewer_max_iterations: 0
gate: false
foreach: false
order: 1
produces:
  - workspace-record
consumes: []
requires_stage: []
sensors: []
scopes:
  - smoke
  - single-story
  - regression
  - bugfix-repro
  - exploratory
inputs: The user's request (story source, optional style-reference hint)
outputs: workspace-record in qa-state.md (repo root, steps dir, features dir, style reference, story source)
---

# Workspace Detection

MANDATORY: Follow `stage-protocol.md` for approval gates, question format, and completion messages.

## Steps

### Step 1 — Detect resume
Check for an existing `aidlc-docs/qa-state.md`. If present, this is a resume:
load state and present the Welcome Back summary (see `session-continuity.md`),
then hand control back to the engine (`report --stage workspace-detection`).

### Step 2 — Detect the repo layout
- Auto-detect the repo root directory name.
- Locate step definitions (e.g. `<framework-root>/src/test/.../steps/`). Confirm
  the path with the user if it cannot be determined.
- Locate the features directory where new `.feature` files will be written.

### Step 3 — Detect the story input source
Determine the input mode from the user's request:
- **Jira mode** — a Jira key (`CLM-123`): fetch via MCP Atlassian, normalize to
  `.md` under `aidlc-docs/inception/user-stories/`.
- **Folder mode** — a folder path: read and normalize its files.
- **Default mode** — read `aidlc-docs/inception/user-stories/` directly.

### Step 4 — Select the style reference
If the user names a style-reference `.feature`, use it. Otherwise auto-select the
closest match from the features directory and record the rationale.

### Step 5 — Record + advance
Record the findings, then report completion:
`bun .claude/tools/qadlc-orchestrate.ts report --stage workspace-detection`.
The engine advances to Story Analysis.

## Sensors

None bound. Workspace Detection writes no `.feature` output; its record lives in
`qa-state.md` (tool-owned).

## Learn

Maintain a diary at `aidlc-docs/.qadlc-memory/workspace-detection/memory.md`
(create on stage start if absent). Append ISO-timestamped bullets under
**Interpretations**, **Deviations**, **Tradeoffs**, **Open questions**. Before
completing, surface any candidate standing rule (e.g. a fixed steps-dir path for
this repo) for promotion into team memory per `stage-protocol.md` §Learn.
