# Step Inventory

## Purpose
Read every step definition class and build a comprehensive, queryable inventory of all available Given/When/Then steps. This inventory is the primary tool for maximizing step reuse during Gherkin Plan production and Feature File Generation.

---

## Steps to Execute

### 1. Log Stage Start
Append to `aidlc-docs/audit.md`:

```markdown
## Step Inventory
**Timestamp**: [ISO timestamp]
**User Input**: "[Any user input during this stage, or 'None — automatic continuation from Convention Extraction']"
**AI Response**: "Starting Step Inventory"
**Context**: Reading all step definition classes

---
```

### 2. Read All Step Definition Classes
- Read **every** step definition file in `<framework-root>/src/test/.../steps/`
  > **Note**: The exact path depends on your framework's layout. For a standard Maven/Gradle project it is typically `src/test/java/<your-package>/steps/`. Auto-detect or confirm this path from the workspace structure.
- Include all subdirectories — do not skip any file
- For each class, identify:
  - The class name and domain it belongs to (inferred from name or package)
  - Every method annotated with `@Given`, `@When`, `@Then`, `@And`, or `@But`
  - The Cucumber expression or regex pattern in the annotation
  - The parameter types (from method signature)

### 3. Build the Step Inventory

For each step found, record:

| Step Type | Pattern / Expression | Parameters | Class | Domain |
|---|---|---|---|---|
| Given | `I am logged in as a registered user` | — | `AuthSteps` | auth |
| When | `I submit a deposit request for {string} {string}` | amount (String), currency (String) | `DepositSteps` | deposit |
| Then | `the deposit status should be {string}` | status (String) | `DepositSteps` | deposit |

**Domain grouping** — group steps by domain based on class name or package:
- `auth` — authentication and session steps
- `account` — account creation, type, status steps
- `deposit` / `funding` — deposit and funding flow steps
- `schema` — schema validation steps (e.g., Avro, JSON Schema)
- `common` / `shared` — reusable utility steps
- Add any other domains present in the codebase

### 4. Note Parameterization Details
For each step, record:
- **Fixed text**: exact match required (e.g., `I am logged in`)
- **String parameter** `{string}`: quoted value (e.g., `"100.00"`)
- **Int/Long parameter** `{int}` / `{long}`: numeric value
- **Data table**: step accepts a Cucumber `DataTable`
- **Regex capture group**: if step uses raw regex, note the capture pattern

### 5. Identify Coverage Gaps
After building the inventory, assess coverage against the user stories from Story Analysis:
- Which acceptance criteria have matching steps (full or partial coverage)?
- Which acceptance criteria have **no** matching step?
- Which steps are **close** but not exact (would require minor wording change or a new step)?

Record gaps in this format:
```
Gap: [Story ID / Criterion] — No matching step for "[proposed step wording]"
Close match: [existing step pattern] — differs by [what]
Recommendation: [reuse with param | flag as new step | raise Open Question]
```

### 6. Flag Steps Needing New Definitions
For each gap where a new step is clearly needed:
- Propose the step wording (declarative, matching extracted conventions)
- Identify which existing class it belongs in (or note that a new class may be needed)
- Add it to the "New Step Definitions Required" list for `gherkin_plan.md`

For each gap where it's unclear:
- Add it to Open Questions for user resolution

### 7. Ask Open Questions (If Any)
If any gaps cannot be resolved independently (e.g., step needed that doesn't fit any existing class, or behavior requires a class restructuring):
- Create `aidlc-docs/step-inventory-questions.md` following `common/question-format-guide.md`
- Inform the user and wait for answers
- Once answered, log responses in `aidlc-docs/audit.md`

If no Open Questions, proceed automatically.

### 8. Log Findings
Append to `aidlc-docs/audit.md`:

```markdown
## Step Inventory — Findings
**Timestamp**: [ISO timestamp]
**Classes Read**: [N]
**Total Steps Found**: [N]
**Domain Groups**: [list]
**Coverage Gaps**: [N]
**New Steps Required**: [N]
**Open Questions**: [N]
**AI Response**: "Step Inventory complete. Proceeding to Gherkin Plan."
**Context**: Step Inventory complete

---
```

---

## Completion Message

After Step Inventory is complete (all Open Questions resolved if any), present:

```
✅ Step Inventory complete.

- Step definition classes read: [N]
- Total steps catalogued: [N]
- Domains covered: [list]
- Coverage gaps: [N]
- New steps needed: [N]

Proceeding automatically to Gherkin Plan...
```

Then immediately begin Gherkin Plan — no user input required to advance.

---

## Step Reuse Priority Rules

**Always apply in this order:**

1. **Exact match** — use the step as-is; no action needed
2. **Parameterized match** — existing step covers the case with a different parameter value; use it with the correct value
3. **Close match** — step is similar but differs in wording; flag in Open Questions, do NOT modify the step or create a near-duplicate
4. **No match** — propose a new step, assign to a class, add to New Step Definitions Required in the plan

**NEVER**:
- Modify an existing step definition's wording to force a fit
- Create a step that is a near-duplicate of an existing one
- Skip the inventory check and assume a new step is needed

---

## Rules

| Rule | Detail |
|---|---|
| Read ALL classes | Never skip a class, even if its domain seems unrelated |
| Exact expression matters | Copy the Cucumber expression or regex exactly — don't paraphrase |
| Group by domain | Makes step reuse lookup fast during Feature File Generation |
| Inventory is read-only output | This stage never modifies any step definition file |
| Close matches are Open Questions | Do not resolve close-match ambiguity unilaterally |
