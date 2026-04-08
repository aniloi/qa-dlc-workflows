# Convention Extraction

## Purpose
Read the selected style reference feature file and extract the exact patterns that all new feature files must follow. This stage produces the Conventions section of `gherkin_plan.md` and establishes the writing rules for the Execution phase.

---

## Steps to Execute

### 1. Log Stage Start
Append to `aidlc-docs/audit.md`:

```markdown
## Convention Extraction
**Timestamp**: [ISO timestamp]
**User Input**: "[Any user input provided during this stage, or 'None — automatic continuation from Story Analysis']"
**AI Response**: "Starting Convention Extraction"
**Context**: Reading style reference file: [filename.feature]

---
```

### 2. Read the Style Reference Feature File
- Read the full content of the selected style reference `.feature` file
- The selected file was determined during Workspace Detection and recorded in `qa-state.md`
- Read it completely — do not skim

### 3. Extract Each Convention Category

#### A. Step Wording Patterns
- Identify how step text is phrased: imperative, declarative, or passive voice
- Identify how parameters are embedded (quoted strings, angle brackets, bare values)
- Note whether steps use domain-specific terminology (e.g., "I submit a deposit request" vs. "I click Submit")
- Note consistency in subject (e.g., always "I", always "the user", always "the system")

Example extraction:
```
Step wording: Declarative, first-person ("I"), domain language ("submit a deposit", "have a funded account")
Parameters: Quoted string literals for amounts and IDs (e.g., "100.00", "USD")
```

#### B. Background Usage
- Is a `Background` block present?
- If yes: what steps are in it and what do they set up?
- Note: `Background` is only used when setup applies to **every** scenario in the file

Example extraction:
```
Background: Yes — used for authentication ("I am logged in as a registered user")
Scope: Applies to all scenarios in the file
```

#### C. Tagging Conventions
- List all tags present on features and scenarios
- Note which tags appear at the feature level vs. scenario level
- Note any groupings (e.g., all scenarios in a file share one component tag at the feature level)

Example extraction:
```
Feature-level tags: @ComponentA @ComponentB
Scenario-level tags: @smoke or @regression (one per scenario) + @negative where applicable
Pattern: scope tag + component tag on every scenario
```

#### D. Scenario Outline and Data Table Patterns
- Are `Scenario Outline` / `Examples` tables used? If yes, what determines when they're used vs. separate Scenarios?
- Are inline data tables (DocString or table format) used within steps?
- Note the column naming style in Examples tables

Example extraction:
```
Scenario Outline: Used for 3+ data variations; columns use camelCase (<amount>, <currency>)
Separate Scenarios: Used for 1-2 variations — clearer for debugging
Data tables: Not used in this file
```

#### E. Feature File Naming
- Note the naming convention of the reference file itself (e.g., `pasE2E.feature`, `depositSmoke.feature`)
- Confirm: `camelCase.feature`

#### F. Abstraction Level
- Is the Gherkin procedural (click-by-click) or declarative (intent-based)?
- Note the level of technical detail visible in the steps
- This is the single most important convention — all new files must match this level

Example extraction:
```
Abstraction: Fully declarative — steps describe intent ("I submit a deposit request for <amount>"),
not UI actions ("I click the 'Submit' button in the deposit modal")
```

### 4. Summarize Extracted Conventions
Produce a clean conventions summary to be written into the `gherkin_plan.md` Conventions section:

```markdown
## Conventions Extracted from [filename.feature]

**Style Reference**: [filename.feature] — [reason it was selected]

### Step Wording
- [summary of wording patterns]

### Background
- [whether used and under what conditions]

### Tagging
- [tag patterns at feature and scenario level]

### Scenario Outline Usage
- [threshold and column naming style]

### Feature File Naming
- camelCase.feature (e.g., `depositSmoke.feature`)

### Abstraction Level
- [declarative / procedural assessment with example]
```

### 5. Log Findings
Append to `aidlc-docs/audit.md`:

```markdown
## Convention Extraction — Findings
**Timestamp**: [ISO timestamp]
**Style Reference File**: [filename.feature]
**Key Conventions**:
- Step wording: [summary]
- Background: [yes/no and scope]
- Tags: [pattern]
- Scenario Outline: [threshold]
- Abstraction: [declarative/procedural]
**AI Response**: "Convention Extraction complete. Proceeding to Step Inventory."
**Context**: Convention Extraction complete

---
```

---

## Completion Message

After extraction is complete, present:

```
✅ Convention Extraction complete.

Style reference: [filename.feature]
Key conventions:
- Step wording: [one-line summary]
- Tags: [pattern]
- Abstraction: Declarative

Proceeding automatically to Step Inventory...
```

Then immediately begin Step Inventory — no user input required to advance.

---

## Rules

| Rule | Detail |
|---|---|
| Read the full file | Do not skim — every line is a data point for conventions |
| Never invent conventions | Only document patterns actually present in the reference file |
| Abstraction level is highest priority | If the reference file is declarative, all new files must be declarative |
| Document, don't enforce yet | This stage produces a reference — enforcement happens in Feature File Generation |
| Never write Gherkin here | This stage produces extraction only — no `.feature` content |
