# Story Analysis

## Purpose
Read every user story and extract all explicit and implied acceptance criteria. Produce a structured summary that feeds directly into the Gherkin Plan mapping table. Flag any ambiguities, contradictions, or scope questions as Open Questions for user resolution.

---

## Steps to Execute

### 1. Log Stage Start
Append to `aidlc-docs/audit.md`:

```markdown
## Story Analysis
**Timestamp**: [ISO timestamp]
**User Input**: "[Any user input provided during this stage, or 'None — automatic continuation from Workspace Detection']"
**AI Response**: "Starting Story Analysis"
**Context**: Reading all user story files

---
```

### 2. Read Every User Story File
- Read **every** `.md` file in `aidlc-docs/inception/user-stories/`
- Do not skip any file, even if the filename suggests it may be out of scope
- For each file, extract:
  - Story ID (if present)
  - Story title or summary
  - Acceptance criteria (explicit bullet points, numbered lists, or implied by the narrative)
  - Any preconditions mentioned
  - Any data or environment assumptions mentioned

### 3. Produce One-Line Summary Per Story
For each story file, write a one-line summary in the format:
```
[Story ID or filename] — [one sentence describing what the story enables or verifies]
```

Example:
```
US-01-deposit-flow.md — User can initiate a bank deposit to their account via the payment integration
```

### 4. Extract Acceptance Criteria
For each story, list all acceptance criteria — both **explicit** (stated directly) and **implied** (logically required but not written):

| Story | Criterion Type | Acceptance Criterion |
|---|---|---|
| US-01 | Explicit | Deposit request is submitted with valid routing and account number |
| US-01 | Implied | Deposit request fails gracefully when routing number is invalid |
| US-02 | Explicit | User receives confirmation after successful deposit |

**Implied criteria guidance** — look for:
- Happy path stated but no corresponding failure/negative path
- Preconditions mentioned but not formally listed as criteria
- System behavior on boundary values (e.g., minimum/maximum amounts)
- Notifications or confirmation steps implied but not written

### 5. Determine In-Scope vs. Out-of-Scope
For each story, assess whether it is in scope for this workflow run:
- **In scope**: Has acceptance criteria that can be expressed in Gherkin using existing or new steps
- **Out of scope**: Pure infrastructure, data migration, or non-testable acceptance criteria
- **Ambiguous**: Cannot determine without user input

### 6. Identify Open Questions
Flag any story or criterion that:
- Is **ambiguous** — could produce meaningfully different scenarios depending on interpretation
- **Contradicts** another story or existing behavior
- Has **missing context** (e.g., references a flow or entity not defined in the codebase)
- Has **unclear scope** — unsure if it's meant to be tested at this layer

Record each open question in this format:
```
[Story ID]: [Question] — [Why it can't be decided independently]
```

### 7. Ask Open Questions (If Any)
If there are Open Questions from this stage:
- Create `aidlc-docs/story-analysis-questions.md` following the format in `common/question-format-guide.md`
- Inform the user and wait for answers before proceeding
- Once answered, log responses in `aidlc-docs/audit.md` and resolve each question

If there are no Open Questions, proceed automatically.

### 8. Log Findings
Append to `aidlc-docs/audit.md`:

```markdown
## Story Analysis — Findings
**Timestamp**: [ISO timestamp]
**Stories Analyzed**: [N]
**Stories In Scope**: [N]
**Stories Out of Scope**: [N]
**Stories Ambiguous**: [N]
**Total Acceptance Criteria Extracted**: [N]
**Open Questions**: [N]
**AI Response**: "Story Analysis complete. Proceeding to Convention Extraction."
**Context**: Story Analysis complete

---
```

---

## Completion Message

After Story Analysis is complete (all Open Questions resolved if any), present:

```
✅ Story Analysis complete.

- Stories analyzed: [N]
- In scope: [N] | Out of scope: [N] | Ambiguous (resolved): [N]
- Acceptance criteria extracted: [N] (explicit: [N], implied: [N])

Proceeding automatically to Convention Extraction...
```

Then immediately begin Convention Extraction — no user input required to advance.

---

## Output Used By
- **Gherkin Plan**: Story-to-Scenario Mapping table is built directly from this stage's output
- **Feature File Generation**: Implied acceptance criteria become negative/edge-case scenarios

---

## Rules

| Rule | Detail |
|---|---|
| Read ALL stories | Never skip a file, even if filename looks out of scope |
| Surface implied criteria | Don't wait for the user to spell out every negative case |
| Flag early | Better to raise an Open Question now than discover an ambiguity during Execution |
| Never write Gherkin here | This stage produces analysis only — no `.feature` content |
