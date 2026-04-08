# Content Validation Rules

## MANDATORY: Validate Before Writing Any File

**CRITICAL**: All generated content MUST be validated before writing to files to prevent parsing errors and malformed Gherkin.

---

## Gherkin Content Validation

### Pre-Creation Checklist for `.feature` Files

Before writing any `.feature` file, verify:

- [ ] `Feature:` keyword present exactly once at the top of the file
- [ ] Every `Scenario:` or `Scenario Outline:` has a unique name within the file
- [ ] Every scenario has at least one `Given`, one `When`, and one `Then` step
- [ ] Every `Scenario Outline:` has a corresponding `Examples:` table with a header row and at least one data row
- [ ] `Examples:` column headers exactly match `<placeholder>` tokens used in the scenario steps
- [ ] `Background:` (if present) contains only `Given` steps
- [ ] Tags appear on the line immediately above `Feature:` or `Scenario:`/`Scenario Outline:` — never inline
- [ ] Every scenario has at least one scope tag (`@smoke` or `@regression`) AND at least one component tag
- [ ] Feature file name is `camelCase.feature` with no spaces or underscores
- [ ] Step wording matches an existing step definition exactly (or is listed under "New Step Definitions Required" in the approved plan)
- [ ] No procedural UI language (e.g., "click", "navigate to", "enter text in field") — Gherkin must be declarative

### Scenario Outline Validation

When writing a `Scenario Outline`:
- Count data rows in `Examples:` table (excluding header)
- **If fewer than 3 rows**: convert to separate named `Scenario` blocks instead
- **If 3 or more rows**: `Scenario Outline` is appropriate

### Step Wording Validation

Before using any step:
1. Check the step inventory built during Step Inventory stage
2. If the step exists: use the **exact** wording from the inventory (including parameter tokens)
3. If no exact match: check for close matches — flag in Open Questions, do NOT modify wording or create a near-duplicate
4. If no match at all: add to "New Step Definitions Required" in `gherkin_plan.md` and await approval

---

## Markdown Content Validation

### Pre-Creation Checklist for `.md` Files

Before writing any markdown file (`gherkin_plan.md`, `aidlc-docs/audit.md`, etc.):

- [ ] Markdown tables have consistent column counts per row
- [ ] Code blocks are properly fenced with triple backticks and language tag where appropriate
- [ ] Checkboxes use `- [ ]` (unchecked) or `- [x]` (checked) format
- [ ] No unmatched backticks or unclosed code blocks
- [ ] ISO 8601 timestamps used in audit entries

---

## Validation Failure Handling

### When Gherkin Validation Fails
1. **Do not write the file** — fix the issue first
2. Log the validation failure and correction in `aidlc-docs/audit.md`
3. If the fix requires a user decision (e.g., ambiguous step match), add to Open Questions and pause

### When Markdown Validation Fails
1. Fix formatting before writing
2. Use plain text alternatives if table or code block formatting cannot be resolved
3. Continue workflow — do not block on minor markdown formatting issues

---

## Error Prevention Rules

1. **Never write unvalidated Gherkin** — always run the pre-creation checklist first
2. **Exact step matching** — copy step wording character-for-character from the inventory; do not paraphrase
3. **Tag completeness** — reject any scenario missing a scope tag or component tag before writing
4. **Outline threshold** — enforce the 3-row minimum for `Scenario Outline`; convert below-threshold outlines to separate scenarios
