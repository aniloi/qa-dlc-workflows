# Cross-Feature Consistency Check

## Purpose
After all feature files are written, perform a final review across all newly created `.feature` files to catch inconsistencies, naming conflicts, tagging gaps, and abstraction-level violations before the workflow closes.

---

## Steps to Execute

### 1. Log Stage Start
Append to `aidlc-docs/audit.md`:

```markdown
## Cross-Feature Consistency Check
**Timestamp**: [ISO timestamp]
**User Input**: "[Any user input, or 'None — automatic continuation after all files written']"
**AI Response**: "Starting Cross-Feature Consistency Check"
**Context**: Reviewing [N] newly written feature files

---
```

### 2. Collect All Newly Written Feature Files
- Identify all `.feature` files written in this session (from the `[x]` checkboxes in `gherkin_plan.md`)
- Read every one of them in full

### 3. Run Each Consistency Check

#### A. Duplicate Scenario Names
- Extract every `Scenario:` and `Scenario Outline:` name across all files
- Flag any name that appears more than once — even across different feature files

**Finding format**:
```
DUPLICATE SCENARIO NAME: "[name]" appears in [file1.feature] AND [file2.feature]
Resolution required: rename one to make it unique and descriptive
```

#### B. Conflicting or Near-Duplicate Step Wordings
- Look for steps across files that express the same intent with slightly different wording
- These indicate one was accidentally invented when an existing step should have been reused

**Finding format**:
```
NEAR-DUPLICATE STEPS:
  "[step wording A]" in [file1.feature]
  "[step wording B]" in [file2.feature]
These appear to express the same intent. One should use the canonical step from the inventory.
```

#### C. Tagging Completeness
- Every `Scenario:` and `Scenario Outline:` must have:
  - At least one scope tag: `@smoke` OR `@regression`
  - At least one component tag matching your project's tagging conventions
    > **Note**: Component tags are project-specific (e.g., a payment service might use `@payments`, a reporting service might use `@reports`). Use the tags established in your existing feature files — do not invent new ones unless agreed.
- Flag any scenario missing either

**Finding format**:
```
MISSING TAG: "[scenario name]" in [filename.feature]
  Missing: scope tag (needs @smoke or @regression)
  Missing: component tag (needs a project-specific component tag)
```

#### D. Feature File Naming Convention
- All newly written files must follow `camelCase.feature`
- Flag any file that uses snake_case, PascalCase, kebab-case, or spaces

**Finding format**:
```
NAMING VIOLATION: "[filename.feature]" does not follow camelCase convention
```

#### E. Abstraction Level Consistency
- Verify no scenario contains procedural steps (UI clicks, navigation actions, form field references)
- All steps must be declarative — describing what the system does, not how to interact with it

**Finding format**:
```
PROCEDURAL STEP DETECTED: "[step wording]" in "[scenario name]" in [filename.feature]
This step describes a UI interaction, not system behavior. Replace with a declarative equivalent.
```

#### F. Background Scope Correctness
- For each feature file that uses `Background`:
  - Verify that every step in the `Background` is actually used in every scenario in the file
  - If a `Background` step applies to only some scenarios, it should be moved inline

**Finding format**:
```
BACKGROUND SCOPE VIOLATION: "[step]" in Background of [filename.feature]
This step is not used in scenarios: [list of scenario names]
Move it inline to the scenarios that need it.
```

### 4. Resolve Findings

For each finding:
- **Can be resolved unilaterally** (naming fix, missing tag, moving a Background step) → fix it and note the change
- **Requires user input** (near-duplicate step where the correct canonical version is unclear, scenario rename that may conflict with a known test ID) → flag for user

If any findings require user input:
1. Create `aidlc-docs/consistency-check-questions.md` following `common/question-format-guide.md`
2. Inform the user and wait for answers
3. Apply fixes based on answers
4. Log all changes in `aidlc-docs/audit.md`

### 5. Log Results
Append to `aidlc-docs/audit.md`:

```markdown
## Cross-Feature Consistency Check — Results
**Timestamp**: [ISO timestamp]
**Files Checked**: [N]
**Findings**:
- Duplicate scenario names: [N]
- Near-duplicate steps: [N]
- Tagging gaps: [N]
- Naming violations: [N]
- Procedural steps: [N]
- Background scope violations: [N]
**Resolutions**: [describe each fix applied or question raised]
**Final Status**: PASS | PASS WITH FIXES | BLOCKED (user input needed)
**AI Response**: "[final message]"
**Context**: Cross-Feature Consistency Check complete

---
```

### 6. Update `aidlc-docs/qa-state.md`
- Current Stage → `Cross-Feature Consistency Check`
- Stage Status → `COMPLETE`
- Mark final stage `[x]` in Completed Stages list

---

## Final Completion Message

After all findings are resolved (or none were found), present the final workflow summary to the user:

```
✅ QA-DLC Workflow Complete.

Summary:
- Feature files written: [N]
- Scenarios written: [N total across all files]
- New step definitions required (for developer implementation): [N]
- Consistency check: [PASS | PASS WITH FIXES]

Files written:
- [path/to/file1.feature] ([N] scenarios)
- [path/to/file2.feature] ([N] scenarios)
[...]

If new step definitions were required, they are listed in gherkin_plan.md under "New Step Definitions Required".
A developer must implement those steps before the new scenarios can run.

Audit trail: aidlc-docs/audit.md
Session state: aidlc-docs/qa-state.md
```

**Workflow ends here. Do not begin any new stage or take further action without a new user request.**

---

## Rules

| Rule | Detail |
|---|---|
| Check ALL newly written files | Never skip a file from this session |
| Fix unilateral issues directly | Naming, tags, Background scope — no need to ask |
| Flag ambiguous issues | Near-duplicates, scenario renames — ask user |
| No emergent behavior | Use the standardized completion message above verbatim |
| Workflow ends here | Do not auto-start any new phase or task after the final message |
