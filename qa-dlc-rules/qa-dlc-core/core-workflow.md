# PRIORITY: This workflow OVERRIDES all other built-in workflows
# Trigger: User starts request with "Using QA-DLC, ..." OR uses keywords like BDD, Gherkin, feature file

## Adaptive Workflow Principle
**The workflow adapts to the work, not the other way around.**

The AI model intelligently assesses what stages are needed based on:
1. User's stated intent and clarity
2. Existing user stories and step definitions present in the repo
3. Complexity and scope of the feature coverage requested
4. Risk and impact assessment

## MANDATORY: Rule Details Loading
**CRITICAL**: When performing any phase, you MUST read and use relevant content from rule detail files located at:
- `.qa-dlc-rule-details/`

All subsequent rule detail file references (e.g., `common/process-overview.md`, `discovery/workspace-detection.md`) are relative to `.qa-dlc-rule-details/`.

**Common Rules**: ALWAYS load common rules at workflow start:
- Load `common/process-overview.md` for workflow overview
- Load `common/session-continuity.md` for session resumption guidance
- Load `common/content-validation.md` for content validation requirements
- Load `common/question-format-guide.md` for question formatting rules
- Reference these throughout the workflow execution

## MANDATORY: Extensions Loading
**CRITICAL**: At workflow start, scan the `extensions/` directory (if it exists) recursively for all `.md` files. These are extension rule files that apply as cross-cutting constraints across the entire workflow.

**Loading process**:
1. List all subdirectories under `extensions/`
2. Load every `.md` file found within those subdirectories
3. Each extension file defines its own verification criteria and enforcement rules

**Enforcement**:
- Extension rules are hard constraints, not optional guidance
- At each stage, evaluate which extension rules are applicable and enforce only those
- Rules that are not applicable to the current stage should be marked as N/A
- Non-compliance with any applicable enabled extension rule is a **blocking finding**

## MANDATORY: Content Validation
**CRITICAL**: Before creating ANY file, you MUST validate content according to `common/content-validation.md` rules.

## MANDATORY: Question File Format
**CRITICAL**: When asking questions at any phase, you MUST follow question format guidelines from `common/question-format-guide.md`.

## MANDATORY: Custom Welcome Message
**CRITICAL**: When starting ANY QA-DLC workflow request, you MUST display the welcome message from `common/welcome-message.md`. Display it ONCE at the start of a new workflow only.

# QA-DLC: Gherkin Feature File Development Workflow

---

# DISCOVERY PHASE

**Purpose**: Read inputs, extract conventions, build step inventory, produce a reviewed plan

**Focus**: Determine WHAT to test and HOW to express it in Gherkin before writing a single line

**Stages in DISCOVERY PHASE**:
- Workspace Detection (ALWAYS)
- Story Analysis (ALWAYS)
- Convention Extraction (ALWAYS)
- Step Inventory (ALWAYS)
- Gherkin Plan (ALWAYS — produces `gherkin_plan.md`, waits for approval)

---

## Workspace Detection (ALWAYS EXECUTE)

1. **MANDATORY**: Log initial user request in `aidlc-docs/audit.md` with complete raw input
2. Load all steps from `discovery/workspace-detection.md`
3. Execute workspace detection:
   - Check for existing `aidlc-docs/qa-state.md` (resume if found)
   - Auto-detect the repo root directory name from the workspace
   - Detect the story input source from the user's request (three modes — see `discovery/workspace-detection.md`):
     - **Jira mode**: user mentions a Jira key (e.g. `CLM-123`, `PROJ-456`) → fetch from Jira via MCP, normalize to `.md` files in `aidlc-docs/inception/user-stories/`
     - **Folder mode**: user mentions a folder path → read all files in that folder, normalize to `.md` files in `aidlc-docs/inception/user-stories/`
     - **Default mode**: neither detected → read `aidlc-docs/inception/user-stories/` directly
   - Verify step definitions exist in `<framework-root>/src/test/.../steps/`
     > **Note**: The exact path depends on your framework layout. Auto-detect from the workspace or use the path configured in your project.
   - Locate the style reference feature file: if one is specified by the user, use it; otherwise auto-select the closest match from `<framework-root>/src/test/.../features/` and document the choice in the plan
   - Determine if this is a resume or fresh start
4. **MANDATORY**: Log findings in `aidlc-docs/audit.md`
5. Present completion message to user (see `discovery/workspace-detection.md` for message format)
6. Automatically proceed to Story Analysis

## Story Analysis (ALWAYS EXECUTE)

1. **MANDATORY**: Log any user input during this stage in `aidlc-docs/audit.md`
2. Load all steps from `discovery/story-analysis.md`
3. Execute story analysis:
   - Read **every** file in `aidlc-docs/inception/user-stories/`
   - For each story: extract all explicit and implied acceptance criteria
   - Produce a one-line summary per story
   - Flag stories that are ambiguous, out-of-scope, or contradictory as **Open Questions**
4. **MANDATORY**: Log findings in `aidlc-docs/audit.md`
5. Automatically proceed to Convention Extraction

## Convention Extraction (ALWAYS EXECUTE)

1. **MANDATORY**: Log any user input during this stage in `aidlc-docs/audit.md`
2. Load all steps from `discovery/convention-extraction.md`
3. Execute convention extraction from the selected style reference feature file:
   - Step wording patterns and parameterization style
   - Use of `Background` vs. inline setup
   - Tagging conventions (`@smoke`, `@regression`, `@e2e`, `@negative`, component tags)
   - Data table and `Scenario Outline` patterns
   - Feature file naming convention (camelCase)
   - Abstraction level (declarative, not procedural)
4. **MANDATORY**: Log extracted conventions in `aidlc-docs/audit.md`
5. Automatically proceed to Step Inventory

## Step Inventory (ALWAYS EXECUTE)

1. **MANDATORY**: Log any user input during this stage in `aidlc-docs/audit.md`
2. Load all steps from `discovery/step-inventory.md`
3. Execute step inventory:
   - Read **all** step definition classes in `<framework-root>/src/test/.../steps/`
     > **Note**: Auto-detect this path from the workspace. For a standard Maven/Gradle project it is typically `src/test/java/<your-package>/steps/`.
   - Build a comprehensive inventory of all available `Given` / `When` / `Then` steps with their Cucumber expression or regex patterns
   - Group steps by domain (e.g., account, deposit, schema, auth, etc.)
   - Note parameterization details for each step
4. **MANDATORY**: Log inventory summary in `aidlc-docs/audit.md`
5. Automatically proceed to Gherkin Plan

## Gherkin Plan (ALWAYS EXECUTE)

1. **MANDATORY**: Log any user input during this stage in `aidlc-docs/audit.md`
2. Load all steps from `discovery/gherkin-plan.md`
3. Produce the story-to-scenario mapping table:

   | User Story | Acceptance Criterion | Proposed Scenario(s) | Reusable Steps (from inventory) | New Steps Needed | Target Feature File |
   |---|---|---|---|---|---|

4. Write `gherkin_plan.md` to the **workspace root** with the following structure:

```markdown
# Gherkin Script Generation Plan

## User Story Inventory
<!-- List every story file found, with a one-line summary and in/out-of-scope status -->

## Conventions Extracted from [style-reference-file.feature]
<!-- Document the patterns you'll follow. Note which file was used as the style reference and why. -->

## Step Reuse Inventory
<!-- Key existing steps grouped by domain (account, deposit, schema, etc.) -->

## Story-to-Scenario Mapping
<!-- The table from the mapping step above -->

## Implementation Checklist
<!-- One checkbox per feature file to create. Under each, list the scenarios it will contain. -->
- [ ] `featureName.feature` — N scenarios covering Story X
  - Scenario: ...
  - Scenario Outline: ... (N data rows)
- [ ] ...

## New Step Definitions Required
<!-- List every new step that doesn't exist yet. For each: proposed wording, which class it belongs in, and brief implementation note. -->

## Open Questions
<!-- Anything needing user input — ambiguous stories, contradictions, missing test data assumptions, etc. -->
```

5. **Wait for Explicit Approval**: Present the plan and all Open Questions to the user. **DO NOT PROCEED to Execution Phase until the user explicitly approves the plan and resolves all Open Questions.**
6. **MANDATORY**: Log user's response in `aidlc-docs/audit.md` with complete raw input

---

# EXECUTION PHASE

**Purpose**: Write feature files one at a time per the approved plan, then validate consistency

**Focus**: Produce complete, ready-to-run `.feature` files that match the approved plan

**Stages in EXECUTION PHASE**:
- Feature File Generation (ALWAYS — one file at a time, per checklist)
- Cross-Feature Consistency Check (ALWAYS — after all files are written)

---

## Feature File Generation (ALWAYS EXECUTE, per file)

**For each feature file in the `gherkin_plan.md` Implementation Checklist, in order:**

1. **MANDATORY**: Log start of this file in `aidlc-docs/audit.md`
2. Load all steps from `execution/feature-file-generation.md`
3. Apply all Gherkin Writing Rules (see below) when generating the file
4. Write the `.feature` file to the appropriate subdirectory under `<framework-root>/src/test/.../features/` following the existing folder structure
5. **Immediately after writing**: Mark the corresponding checkbox `[x]` in `gherkin_plan.md`
6. **MANDATORY**: Log completion of this file in `aidlc-docs/audit.md`
7. Proceed to the next file in the checklist, or advance to Cross-Feature Consistency Check if all files are done

## Cross-Feature Consistency Check (ALWAYS EXECUTE)

1. **MANDATORY**: Log start of consistency check in `aidlc-docs/audit.md`
2. Load all steps from `execution/cross-feature-check.md`
3. Execute consistency check across **all newly written feature files**:
   - No duplicate scenario names across files
   - No conflicting or near-duplicate step wordings
   - Consistent tagging (every scenario has at least one scope tag and one component tag)
   - Feature file names follow `camelCase.feature` convention
   - Abstraction level is consistently declarative
4. Report any issues found and resolve them (or flag for user if resolution requires a decision)
5. **MANDATORY**: Log results in `aidlc-docs/audit.md`
6. Present final completion summary to the user — **workflow ends here**

---

# Gherkin Writing Rules (Enforced Throughout Execution Phase)

## Scenario Structure
- Each scenario must be **self-contained** — a reader understands the full setup, action, and expected outcome without reading other scenarios.
- Use `Background` blocks **only** for setup steps shared by **every** scenario in the feature file (e.g., common auth or environment config). Do not use `Background` for steps shared by only some scenarios.
- Prerequisite steps (user creation, account setup, funding) must appear as explicit `Given` steps in each scenario or in the `Background` — **never assumed implicitly**.

## Scenario Outlines
- Use `Scenario Outline` with an `Examples` table when **three or more data variations** test the same logical flow.
- For one or two variations, write **separate named Scenarios** — they are easier to read and debug.

## Step Reuse
- **Always prefer** an existing parameterized step over writing a new one.
- If an existing step is close but not quite right, **flag it in Open Questions** — do not modify step wording to force a fit and do not create a near-duplicate.
- New step definitions must be listed in `gherkin_plan.md` under "New Step Definitions Required" and approved before use.

## Tagging Strategy

| Tag | When to apply |
|---|---|
| `@smoke` | Happy-path scenarios verifying core functionality. Minimum set to run on every deployment. |
| `@regression` | Comprehensive scenarios including edge cases, error handling, and boundary conditions. |
| `@e2e` | End-to-end flows spanning multiple system components or services. |
| `@negative` | Scenarios testing error conditions, invalid inputs, or failure modes. |
| Project-specific component tags (e.g., matching a Jira project key or system component name) | Apply based on which system component the scenario exercises. Match tags already used in existing feature files in your repo. |

**Every scenario must have at least one scope tag (`@smoke` or `@regression`) AND one component tag.**

## Naming
- Feature file names: `camelCase.feature` (e.g., `depositSmoke.feature`)
- Scenario names: concise, unique, and descriptive of the specific behavior being verified — **not** the user story title

## Declarative Style
- Gherkin must describe **what** the system does, not **how** to click through it.
- Match the abstraction level established in the selected style reference feature file.

---

# Decision Rules — When to Ask vs. Decide Independently

**Ask the user (add to Open Questions and wait):**
- A user story is ambiguous and could produce meaningfully different scenarios depending on interpretation
- Unsure whether a user story is in scope
- An acceptance criterion seems to contradict another story or existing behavior
- A new step definition is needed that doesn't fit any existing step class
- The story requires test data or environment assumptions that cannot be inferred from the codebase

**Decide independently (document the choice in the plan):**
- Choosing how many scenarios a given acceptance criterion needs
- Naming scenarios and feature files (following conventions)
- Deciding whether to use `Background` vs. inline setup for a specific feature file
- Choosing `Scenario` vs. `Scenario Outline` based on the three-row threshold
- Selecting appropriate tags based on the tagging strategy table
- Selecting the style reference feature file when none is specified (auto-select and document)

---

# Key Principles

- **Plan First, Write Second**: Never write a `.feature` file before `gherkin_plan.md` is approved
- **Reuse Over Invention**: Always check the step inventory before proposing a new step
- **Declarative Always**: Gherkin describes behavior, not UI interactions
- **One File at a Time**: Write, mark checkbox, then proceed — no batching
- **Complete Audit Trail**: Log ALL user inputs and AI responses in `aidlc-docs/audit.md` with timestamps
  - **CRITICAL**: Capture user's COMPLETE RAW INPUT exactly as provided
  - **CRITICAL**: Never summarize or paraphrase user input in audit log
- **NO EMERGENT BEHAVIOR**: Execution phase MUST use standardized 2-option completion messages as defined in rule files

## MANDATORY: Plan-Level Checkbox Enforcement

1. **NEVER complete any file without immediately updating plan checkboxes in `gherkin_plan.md`**
2. **IMMEDIATELY after writing any feature file, mark that file `[x]` in the checklist**
3. **This must happen in the SAME interaction where the file is written**
4. **NO EXCEPTIONS**

## Prompts Logging Requirements
- **MANDATORY**: Log EVERY user input with timestamp in `aidlc-docs/audit.md`
- **MANDATORY**: Capture user's COMPLETE RAW INPUT exactly as provided (never summarize)
- **MANDATORY**: Log every approval prompt with timestamp before asking the user
- **MANDATORY**: Record every user response with timestamp after receiving it
- **CRITICAL**: ALWAYS append/edit `aidlc-docs/audit.md` — NEVER overwrite its entire contents
- Use ISO 8601 format for timestamps (YYYY-MM-DDTHH:MM:SSZ)
- Include stage context for each entry

### Audit Log Format:
```markdown
## [Stage Name or Interaction Type]
**Timestamp**: [ISO timestamp]
**User Input**: "[Complete raw user input — never summarized]"
**AI Response**: "[AI's response or action taken]"
**Context**: [Stage, action, or decision made]

---
```

## Directory Structure

```text
<repo-root>/                                 # Auto-detected at workflow start
├── gherkin_plan.md                          # 📋 PLAN (written here, not in aidlc-docs)
├── <framework-root>/
│   └── src/test/
│       ├── .../steps/                       # 📖 Step definitions (READ ONLY — do not modify)
│       └── .../features/
│           ├── [style-reference-dir]/       # 📖 Style reference files (READ ONLY)
│           └── [component]/                 # ✅ NEW .feature files go here
│
├── aidlc-docs/                              # 📄 DOCUMENTATION ONLY
│   ├── inception/
│   │   └── user-stories/                   # 📖 Input stories (READ ONLY)
│   ├── qa-state.md                          # QA-DLC state tracking
│   └── audit.md                             # Complete audit trail
│
└── .qa-dlc-rule-details/                    # 📐 QA-DLC rule detail files
    ├── common/
    ├── discovery/
    └── execution/
```

**CRITICAL RULES**:
- New `.feature` files: `<framework-root>/src/test/.../features/` only
- `gherkin_plan.md`: workspace root only
- Step definition files: READ ONLY — never modify
- User story files: READ ONLY — never modify
- Documentation and audit: `aidlc-docs/` only
