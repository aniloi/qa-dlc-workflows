# QA-DLC Workflow Overview

**Purpose**: Technical reference for the AI model to understand the complete QA-DLC workflow structure and stage sequencing.

## The Two-Phase Lifecycle

QA-DLC has two phases that always execute in order:

- **DISCOVERY PHASE**: Plan before writing — read inputs, extract conventions, build step inventory, produce `gherkin_plan.md`, wait for user approval
- **EXECUTION PHASE**: Write after approval — generate feature files one at a time, mark checkboxes, run cross-feature consistency check

## Stage Execution Model

```
User Request ("Using QA-DLC, ..." OR BDD/Gherkin/feature-file keywords)
    |
    v
+--------------------------------------------------+
|  DISCOVERY PHASE                                 |
+--------------------------------------------------+
|  1. Workspace Detection         (ALWAYS)         |
|     - Detect repo root                           |
|     - Verify user stories dir                    |
|     - Verify step definitions dir                |
|     - Auto-select style reference feature file   |
|     - Check for resume (qa-state.md)             |
|                                                  |
|  2. Story Analysis              (ALWAYS)         |
|     - Read every user story file                 |
|     - Extract acceptance criteria                |
|     - Flag ambiguities as Open Questions         |
|                                                  |
|  3. Convention Extraction       (ALWAYS)         |
|     - Read style reference feature file          |
|     - Extract step patterns, tags, structure     |
|                                                  |
|  4. Step Inventory              (ALWAYS)         |
|     - Read all step definition classes           |
|     - Build Given/When/Then inventory by domain  |
|                                                  |
|  5. Gherkin Plan                (ALWAYS)         |
|     - Produce story-to-scenario mapping          |
|     - Write gherkin_plan.md to workspace root    |
|     - Present Open Questions to user             |
|     --> STOP AND WAIT FOR USER APPROVAL <--      |
+--------------------------------------------------+
    |
    | [User approves plan + resolves Open Questions]
    |
    v
+--------------------------------------------------+
|  EXECUTION PHASE                                 |
+--------------------------------------------------+
|  6. Feature File Generation     (per file)       |
|     - Write one .feature file at a time          |
|     - Mark checkbox [x] in gherkin_plan.md       |
|     - Repeat for each file in checklist          |
|                                                  |
|  7. Cross-Feature Consistency Check  (ALWAYS)    |
|     - No duplicate scenario names                |
|     - No conflicting step wordings               |
|     - Consistent tagging across all files        |
|     - camelCase.feature naming verified          |
|     - Declarative abstraction level verified     |
+--------------------------------------------------+
    |
    v
  Complete — present final summary to user
```

## Key Invariants

| Rule | Detail |
|---|---|
| No feature files before plan approval | `gherkin_plan.md` must be approved before any `.feature` file is written |
| One file at a time | Never batch-write feature files; write, checkbox, proceed |
| Checkbox immediately | Mark `[x]` in the same interaction the file is written |
| Reuse before invention | Step inventory must be consulted before proposing any new step |
| Ask vs. decide | Ambiguities go to Open Questions; structural/naming choices are made independently and documented |
| Audit everything | Every user input and AI action is logged with ISO 8601 timestamp in `aidlc-docs/audit.md` |

## Artifacts Produced

| Artifact | Location | Stage |
|---|---|---|
| `aidlc-docs/audit.md` | `aidlc-docs/` | Throughout — append only |
| `aidlc-docs/qa-state.md` | `aidlc-docs/` | Workspace Detection — updated each stage |
| `gherkin_plan.md` | workspace root | Gherkin Plan stage |
| `*.feature` files | `<framework-root>/src/test/.../features/[component]/` | Feature File Generation |

## Read-Only Assets (Never Modify)

- `aidlc-docs/inception/user-stories/` — input user stories
- `<framework-root>/src/test/.../steps/` — step definition classes
- `<framework-root>/src/test/.../features/components/` — style reference feature files
