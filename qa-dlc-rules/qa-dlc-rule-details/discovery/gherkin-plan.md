# Gherkin Plan

## Purpose
Produce `gherkin_plan.md` — the single approved document that defines every feature file to be written, every scenario it will contain, and every new step definition required. **No feature file may be written before this plan is approved by the user.**

---

## Steps to Execute

### 1. Log Stage Start
Append to `aidlc-docs/audit.md`:

```markdown
## Gherkin Plan
**Timestamp**: [ISO timestamp]
**User Input**: "[Any user input during this stage, or 'None — automatic continuation from Step Inventory']"
**AI Response**: "Starting Gherkin Plan production"
**Context**: Producing story-to-scenario mapping and plan document

---
```

### 2. Build the Story-to-Scenario Mapping Table

Using the output of Story Analysis (acceptance criteria) and Step Inventory (available steps), produce the mapping table:

| User Story | Acceptance Criterion | Proposed Scenario(s) | Reusable Steps (from inventory) | New Steps Needed | Target Feature File |
|---|---|---|---|---|---|

**Guidance for each column:**

| Column | What to write |
|---|---|
| User Story | Story ID or filename |
| Acceptance Criterion | One criterion per row (explicit or implied) |
| Proposed Scenario(s) | Scenario name(s) — concise, unique, declarative |
| Reusable Steps | Exact step patterns from Step Inventory that will be used |
| New Steps Needed | Step wording for any step not in the inventory |
| Target Feature File | `camelCase.feature` filename where this scenario will live |

### 3. Determine Feature File Grouping

Decide how to group scenarios into feature files:
- Group by system component or domain (e.g., all deposit scenarios in one file)
- Group by scope where it makes sense (e.g., smoke vs. regression if they test distinctly different things)
- Follow the existing folder structure under `<framework-root>/src/test/.../features/`
  > **Note**: Adjust this path to match your framework's feature file root.
- Each file should have a coherent, single responsibility

**Decide independently** — feature file grouping is a structural choice, not an Open Question.

### 4. Determine Scenario vs. Scenario Outline

For each group of related scenarios:
- **3 or more data variations** of the same logical flow → use `Scenario Outline` with `Examples` table
- **1 or 2 variations** → write separate named `Scenario`s

**Decide independently** — this follows the threshold rule from the core workflow.

### 5. Collect All Open Questions

Gather all Open Questions from:
- Story Analysis (ambiguous stories, contradictory criteria)
- Step Inventory (close-match steps, unknown class assignments)
- Any new ambiguities discovered while building the mapping table

Each Open Question must block the plan from being approved. **Do not write the plan without listing all Open Questions.**

### 6. Write `gherkin_plan.md` to the Workspace Root

Write the plan file at `gherkin_plan.md` (workspace root — NOT inside `aidlc-docs/`).

Use this exact structure:

```markdown
# Gherkin Script Generation Plan

## User Story Inventory
<!-- List every story file found, with a one-line summary and in/out-of-scope status -->
| Story File | Summary | In Scope? |
|---|---|---|
| US-01-deposit.md | User can initiate a bank deposit via the payment integration | ✅ Yes |
| US-02-confirmation.md | User receives confirmation after deposit | ✅ Yes |

## Conventions Extracted from [style-reference-file.feature]
<!-- Document the patterns you'll follow. Note which file was used and why. -->

**Style Reference**: `[filename.feature]` — [reason selected]

- **Step wording**: [summary]
- **Background**: [yes/no, scope]
- **Tagging**: [pattern]
- **Scenario Outline**: [threshold]
- **Abstraction**: Declarative

## Step Reuse Inventory
<!-- Key existing steps grouped by domain -->

### Auth
- `I am logged in as a registered user`

### Account
- `I have a funded {string} account`

### Deposit
- `I submit a deposit request for {string} {string}`
- `the deposit status should be {string}`

[...continue by domain...]

## Story-to-Scenario Mapping
| User Story | Acceptance Criterion | Proposed Scenario(s) | Reusable Steps | New Steps Needed | Target Feature File |
|---|---|---|---|---|---|

## Implementation Checklist
<!-- One checkbox per feature file. Under each, list the scenarios it will contain. -->
- [ ] `featureName.feature` — N scenarios covering Story X
  - Scenario: [scenario name]
  - Scenario Outline: [outline name] ([N] data rows)
- [ ] ...

## New Step Definitions Required
<!-- Every new step not yet in the inventory. For each: wording, class, implementation note. -->
| Proposed Step | Class | Implementation Note |
|---|---|---|
| `I submit a withdrawal request for {string}` | `DepositSteps` | Similar to deposit submit; use withdrawal endpoint |

## Open Questions
<!-- Anything requiring user input before the plan can be approved. -->
- **[Story ID]**: [question] — [why it can't be decided independently]
```

### 7. Present Plan and Open Questions to User

After writing `gherkin_plan.md`:

1. Summarize the plan for the user:
   ```
   📋 Gherkin Plan written to gherkin_plan.md.

   Summary:
   - Stories in scope: [N]
   - Scenarios planned: [N] across [N] feature files
   - New steps required: [N]
   - Open Questions: [N] (must be resolved before approval)

   Please review gherkin_plan.md and resolve the Open Questions listed at the bottom.
   Reply with "approved" when the plan is ready, or provide feedback/answers.
   ```

2. If there are Open Questions: create `aidlc-docs/gherkin-plan-questions.md` following `common/question-format-guide.md` and inform the user.

3. **STOP. Wait for explicit user approval.**

### 8. Handle User Feedback

The user may:
- **Approve** → proceed to Execution Phase (Feature File Generation)
- **Provide answers to Open Questions** → update `gherkin_plan.md`, re-present for approval
- **Request changes** → update `gherkin_plan.md` accordingly, re-present for approval

**Do not begin writing feature files until the user explicitly says "approved" or equivalent.**

### 9. Log Approval
Once the user approves, log in `aidlc-docs/audit.md`:

```markdown
## Gherkin Plan — Approved
**Timestamp**: [ISO timestamp]
**User Input**: "[Complete raw user input — approval message]"
**AI Response**: "Plan approved. Beginning Execution Phase — Feature File Generation."
**Context**: Plan approved; Execution Phase begins

---
```

Update `aidlc-docs/qa-state.md`:
- Stage Status → `COMPLETE` for Gherkin Plan
- Plan Approved → `YES`
- Feature Files Written → `0 of [N]`
- Current Stage → `Feature File Generation`

---

## Rules

| Rule | Detail |
|---|---|
| Write plan BEFORE any feature file | Absolute requirement — no exceptions |
| Stop and wait for approval | Never auto-proceed past this stage |
| All Open Questions must appear in plan | Never hide ambiguities |
| Use workspace root for plan file | `gherkin_plan.md` at repo root, NOT in `aidlc-docs/` |
| Never modify step definitions | New steps are listed in the plan and require developer implementation |
| Update plan on feedback | Re-present updated plan for re-approval after any changes |
