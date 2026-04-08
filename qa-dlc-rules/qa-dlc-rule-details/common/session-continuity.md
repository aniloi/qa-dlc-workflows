# Session Continuity

## Purpose
When a user returns to an in-progress QA-DLC session, the AI must restore full context from the previous session before doing any work. This prevents re-doing completed stages and ensures consistent output.

---

## Detection: Is This a Resume?

At workflow start, check for the existence of `aidlc-docs/qa-state.md`:

- **Found** → This is a resume. Load state and present the Welcome Back prompt below.
- **Not found** → This is a fresh start. Proceed with Workspace Detection normally.

---

## Welcome Back Prompt Template

When resuming, present the following to the user:

```markdown
**Welcome back! I can see you have an existing QA-DLC session in progress.**

Based on your qa-state.md, here's where we left off:
- **Repo**: [auto-detected repo root]
- **Current Phase**: [DISCOVERY / EXECUTION]
- **Current Stage**: [Stage Name]
- **Last Completed**: [Last completed step or file]
- **Next Step**: [Next action to take]

**What would you like to do?**

A) Continue where we left off ([Next step description])
B) Review a previous stage before continuing

[Answer]: 
```

Ask this question by placing it in `aidlc-docs/session-resume-questions.md` — do NOT ask inline in chat.

---

## MANDATORY: Context Loading on Resume

Before resuming any stage, load all relevant artifacts from prior stages. Never assume context from a previous session is still in memory.

### Context Loading by Stage

| Resuming At | Artifacts to Load |
|---|---|
| **Story Analysis** | `aidlc-docs/audit.md`, user story files |
| **Convention Extraction** | All of the above + Story Analysis findings from audit |
| **Step Inventory** | All of the above + Convention Extraction findings from audit |
| **Gherkin Plan** | All of the above + `gherkin_plan.md` (if partially written) |
| **Feature File Generation** | `gherkin_plan.md` (full), all previously written `.feature` files, all audit entries |
| **Cross-Feature Consistency Check** | All written `.feature` files, full `gherkin_plan.md`, audit |

### What to Load for Each Artifact

| Artifact | What to Extract |
|---|---|
| `aidlc-docs/audit.md` | Last stage completed, last user inputs, any Open Questions recorded |
| `gherkin_plan.md` | Implementation checklist (which files are `[x]` vs `[ ]`), New Steps Required, Open Questions |
| `.feature` files | Already-written scenarios — used for consistency check and step deduplication |
| User story files | Re-read any stories that are referenced in unchecked plan items |

---

## State File: `aidlc-docs/qa-state.md`

Maintain this file throughout the session. Update it at the end of each stage.

### Format

```markdown
# QA-DLC Session State

## Session Info
- **Repo Root**: [auto-detected repo name]
- **Started**: [ISO timestamp]
- **Last Updated**: [ISO timestamp]

## Phase & Stage
- **Current Phase**: DISCOVERY | EXECUTION
- **Current Stage**: [Stage Name]
- **Stage Status**: IN_PROGRESS | WAITING_FOR_APPROVAL | COMPLETE

## Completed Stages
- [x] Workspace Detection
- [x] Story Analysis
- [ ] Convention Extraction
- [ ] Step Inventory
- [ ] Gherkin Plan
- [ ] Feature File Generation
- [ ] Cross-Feature Consistency Check

## Gherkin Plan Status
- **Plan Approved**: YES | NO | PENDING
- **Feature Files Written**: [N] of [Total]

## Open Questions
<!-- List any unresolved Open Questions from any stage -->
- [Stage]: [Question summary]

## Style Reference File
- **File Used**: [filename.feature]
- **Reason Selected**: [brief rationale]

## Notes
<!-- Any other context needed to resume cleanly -->
```

---

## Error Handling on Resume

### Missing `qa-state.md` After Work Has Started
If artifacts exist (e.g., `gherkin_plan.md`, feature files) but `qa-state.md` is missing:

1. Scan `aidlc-docs/audit.md` for the last recorded stage
2. Check `gherkin_plan.md` for checkbox state
3. Reconstruct state to the best of ability
4. Inform user:

```
"I couldn't find qa-state.md, but I reconstructed your session state from audit.md and gherkin_plan.md.
Here's what I found: [summary]. Does this look correct before I continue?"
```

### Missing or Corrupted `audit.md`
If `audit.md` is missing or unreadable:
```
"I cannot find aidlc-docs/audit.md. Without the audit log, I cannot safely resume.
Please clarify what stage you were at so I can pick up from the right point."
```

### Missing `gherkin_plan.md` During Execution Phase
If the plan file is gone but feature files exist:
```
"I found written .feature files but gherkin_plan.md is missing.
I cannot safely continue without the plan. Please restore gherkin_plan.md or restart the DISCOVERY phase."
```

---

## Best Practices

1. **Update `qa-state.md` at the end of every stage** — never let it fall behind
2. **Log everything in `audit.md`** — it is the primary recovery artifact
3. **Mark plan checkboxes immediately** — `gherkin_plan.md` is the single source of truth for execution progress
4. **Never re-run a completed stage** — check `qa-state.md` before doing any work
5. **Provide a context summary after loading** — briefly tell the user what was loaded so they can catch any discrepancy
