# Session Continuity

When a user returns to an in-progress QADLC session, restore full context before
doing any work. The engine makes this deterministic: state lives in the tool-owned
`.qadlc/qa-state.md`, so resume is a state read, not a guess.

## Detection

At workflow start, `bun {{HARNESS_DIR}}/tools/qadlc-orchestrate.ts next`:
- If `qa-state.md` exists with a scope, the engine emits the next unfinished stage
  (or the plan gate) directly — this **is** the resume.
- If no state exists, the engine emits `detect-scope` (a fresh start).

## Welcome-back summary

On resume, read the state and present:

```markdown
**Welcome back — resuming your QADLC session.**
- Scope / Depth: <scope> (<depth>)
- Phase: <phase>
- Current Stage: <current_stage>  (Status: <stage_status>)
- Plan Approved: <plan_approved>
- Feature Files: <written> / <total>

A) Continue where we left off
B) Review a previous stage first
```

## Context loading on resume

Load the artefacts the resumed stage consumes before running it:

| Resuming at | Load |
|---|---|
| story-analysis | user stories, workspace record |
| convention-extraction | style reference + existing features |
| step-inventory | step-definition classes |
| gherkin-plan | story-analysis, conventions, step-inventory, partial `gherkin_plan.md` |
| feature-generation | full `gherkin_plan.md`, already-written `.feature` files |
| cross-feature-check | all written `.feature` files, conventions |

## Recovery

- **Missing `qa-state.md` but artefacts exist** — reconstruct from `audit.md` +
  `gherkin_plan.md` checkbox state, then confirm the reconstructed state with the
  user before continuing.
- **Missing `audit.md`** — cannot safely resume; ask the user what stage they were
  at.
- **Missing `gherkin_plan.md` during Execution** — cannot continue; restore the
  plan or restart Discovery.
