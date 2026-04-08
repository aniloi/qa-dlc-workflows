# Feature File Generation

## Purpose
Write one complete, ready-to-run `.feature` file at a time, in the order specified by the approved `gherkin_plan.md` Implementation Checklist. After each file is written, immediately mark its checkbox done in the plan. Do not batch or skip ahead.

---

## Steps to Execute (Repeat Per File)

### 1. Log Start of This File
Append to `aidlc-docs/audit.md`:

```markdown
## Feature File Generation — [filename.feature]
**Timestamp**: [ISO timestamp]
**User Input**: "[Any user input, or 'None — continuing from approved plan']"
**AI Response**: "Writing [filename.feature]"
**Context**: Execution Phase — Feature File [N] of [Total]

---
```

### 2. Read the Approved Plan
Before writing each file:
- Re-read the relevant checklist item in `gherkin_plan.md`
- Confirm the scenarios listed, their scope tags, component tags, and which steps (reused or new) each requires
- Re-read the Conventions section to refresh style rules

### 3. Apply All Gherkin Writing Rules

Every feature file must comply with the following. These rules are non-negotiable.

#### Self-Contained Scenarios
- Every scenario must stand alone — Given (setup), When (action), Then (outcome) — all in one scenario
- Never reference state from another scenario
- Prerequisite steps (authentication, account creation, funding) must appear as explicit `Given` steps or in `Background`

#### Background Usage
- Use `Background` **only** when the same setup steps apply to **every** scenario in the file
- If only some scenarios share a setup step, keep it inline — do not put it in `Background`

#### Scenario Outline Threshold
- `Scenario Outline` with `Examples` table: **only when 3 or more data variations** exist
- 1–2 variations: write separate named `Scenario`s

#### Step Reuse
- For every step in every scenario: check the Step Inventory in `gherkin_plan.md` first
- Use exact step wording from the inventory — do not paraphrase
- If a step was listed as "New Step Required" in the plan: use the proposed wording exactly as approved
- If a new step need is discovered during writing that was not in the plan: **stop, flag it, and ask the user** before continuing

#### Tagging
- Every scenario must have at least one scope tag (`@smoke` OR `@regression`) and at least one component tag
- Apply `@e2e` for flows spanning multiple services or systems
- Apply `@negative` for error conditions, invalid inputs, or failure modes
- Match component tags to those already used in existing feature files in your repo (e.g., project-specific system or domain tags)
- Scenarios may have multiple tags

#### Naming
- Feature file name: `camelCase.feature` (e.g., `depositSmoke.feature`)
- Scenario names: concise, unique, and specific to the behavior being tested — not the user story title
- Scenario Outline column names: `camelCase` (e.g., `<amount>`, `<currency>`)

#### Abstraction Level
- All steps must be declarative — describe **what** the system does, not **how** to interact with it
- Match the abstraction level observed in the style reference feature file
- ❌ Bad: `I click the "Submit" button in the deposit modal`
- ✅ Good: `I submit a deposit request for "100.00" "USD"`

#### Feature File Placement
- Write the file to the correct subdirectory under your framework's features root:
  `<framework-root>/src/test/.../features/`
  > **Note**: Follow the existing folder structure in your repo (e.g., by component, domain, or feature area). Match the target path from the approved plan.

### 4. Write the Feature File

Produce the complete `.feature` file. The file must be:
- Syntactically valid Gherkin (parseable by Cucumber)
- Complete — all scenarios from the checklist item are included
- No placeholder text, TODOs, or incomplete steps

### 5. Immediately Mark Checkbox in `gherkin_plan.md`
**This must happen in the same interaction where the file is written — no exceptions.**

Change:
```markdown
- [ ] `featureName.feature`
```
To:
```markdown
- [x] `featureName.feature`
```

### 6. Log Completion
Append to `aidlc-docs/audit.md`:

```markdown
## Feature File Generation — [filename.feature] — COMPLETE
**Timestamp**: [ISO timestamp]
**File Written**: [full path]
**Scenarios Written**: [N]
**AI Response**: "Wrote [filename.feature]. Checkbox marked. Proceeding to next file."
**Context**: [N] of [Total] files complete

---
```

Update `aidlc-docs/qa-state.md`:
- Feature Files Written → `[N] of [Total]`

### 7. Proceed to Next File or Advance Phase

- **More files in checklist** → repeat all steps above for the next unchecked file
- **All files checked** → proceed to Cross-Feature Consistency Check

---

## Unplanned Discoveries During Writing

If during writing you discover:
- A step is needed that was not listed in "New Step Definitions Required"
- An acceptance criterion cannot be expressed with available steps
- A scenario would require modifying an existing step definition

**Stop immediately.** Do NOT write a workaround. Present the issue to the user:

```
"While writing [filename.feature], I found that [specific scenario] requires a step that was not in the approved plan:

Proposed step: "[step wording]"
Closest existing step: "[existing step]" — differs by [what]

How would you like to proceed?
A) Add this as a new step in the plan and continue
B) Reuse the closest existing step with a modified scenario description
C) Skip this scenario for now and flag it for later
```

Place this question in `aidlc-docs/feature-generation-questions.md` — do NOT ask inline.

---

## Completion Message (After All Files Written)

After the last checkbox is marked:

```
✅ All [N] feature files written and plan checkboxes marked.

Proceeding to Cross-Feature Consistency Check...
```

---

## Rules

| Rule | Detail |
|---|---|
| One file at a time | Write, mark, proceed — no batching |
| Mark checkbox immediately | Same interaction — no exceptions |
| Use inventory steps exactly | Copy step wording from the plan verbatim |
| Never modify step definitions | Step definition files are READ ONLY |
| Declarative only | Procedural steps are a blocking violation |
| Stop on unplanned gaps | Flag and ask — never self-resolve undiscovered step gaps |
