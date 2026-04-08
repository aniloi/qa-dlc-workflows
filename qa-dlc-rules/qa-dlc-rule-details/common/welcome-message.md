# QA-DLC Welcome Message

**Purpose**: This file contains the user-facing welcome message that should be displayed ONCE at the start of any QA-DLC workflow.

---

# 👋 Welcome to QA-DLC (QA-Driven Development Life Cycle)! 👋

I'll guide you through a structured BDD workflow that translates your approved user stories into high-quality, executable Gherkin feature files.

## What is QA-DLC?

QA-DLC is a structured yet adaptive QA engineering process that ensures your Gherkin feature files are:

- **Grounded in user stories** — every scenario traces back to an acceptance criterion
- **Consistent with established conventions** — style, tags, and step wording match your existing feature files
- **Built on existing step definitions** — reuse over invention; new steps are flagged and approved first
- **Declarative and readable** — describes *what* the system does, not *how* to click through it
- **Reviewed before execution** — a full plan is produced and approved before a single `.feature` file is written

## The Two-Phase Lifecycle

```
                         User Request
                              |
                              v
        +-----------------------------------------------+
        |           DISCOVERY PHASE                     |
        |   Planning & Convention Extraction            |
        +-----------------------------------------------+
        | * Workspace Detection        (ALWAYS)         |
        | * Story Analysis             (ALWAYS)         |
        | * Convention Extraction      (ALWAYS)         |
        | * Step Inventory             (ALWAYS)         |
        | * Gherkin Plan               (ALWAYS)         |
        |   --> Produces gherkin_plan.md                |
        |   --> WAITS for your approval                 |
        +-----------------------------------------------+
                              |
                    [Your Approval Required]
                              |
                              v
        +-----------------------------------------------+
        |           EXECUTION PHASE                     |
        |   Feature File Generation & Validation        |
        +-----------------------------------------------+
        | * Feature File Generation  (per file)         |
        |   --> One file at a time                      |
        |   --> Checkbox marked after each file         |
        | * Cross-Feature Consistency Check  (ALWAYS)   |
        +-----------------------------------------------+
                              |
                              v
                          Complete
```

### Phase Breakdown:

**DISCOVERY PHASE** - *Planning & Convention Extraction*
- **Purpose**: Determine WHAT to test and HOW to express it in Gherkin
- **Activities**: Reading user stories, extracting style conventions, inventorying step definitions, drafting scenario mappings
- **Output**: `gherkin_plan.md` — a complete plan with story-to-scenario mapping, step reuse decisions, and open questions
- **Your Role**: Review the plan, answer open questions, approve before execution begins

**EXECUTION PHASE** - *Feature File Generation & Validation*
- **Purpose**: Produce complete, ready-to-run `.feature` files per the approved plan
- **Activities**: Writing one feature file at a time, marking checklist checkboxes, running a cross-feature consistency check
- **Output**: New `.feature` files in `<framework-root>/src/test/.../features/`
- **Your Role**: Review output; flag any issues found during consistency check

## Key Principles:

- 📋 **Plan First**: `gherkin_plan.md` is approved before any `.feature` file is written
- ♻️ **Reuse Over Invention**: Existing steps are always preferred over new ones
- 🗣️ **Declarative Always**: Gherkin describes behavior, not UI interactions
- 📂 **One File at a Time**: Write, mark checkbox, then proceed — no batching
- ✅ **Every Scenario Tagged**: At least one scope tag (`@smoke` or `@regression`) AND one component tag
- 📝 **Complete Audit Trail**: All inputs and decisions logged in `aidlc-docs/audit.md`

## What Happens Next:

1. **I'll scan your workspace** — verify user stories, step definitions, and sample feature file are in place
2. **I'll read every user story** and extract acceptance criteria
3. **I'll extract conventions** from `<style-reference>.feature` — your project's style guide
4. **I'll inventory all existing step definitions** so I know exactly what's available to reuse
5. **I'll produce `gherkin_plan.md`** — the full scenario mapping, reuse decisions, and any open questions
6. **You'll review and approve** the plan (or ask me to revise it)
7. **I'll write the feature files** one at a time, marking each checkbox as I go
8. **I'll run a consistency check** across all new files before we close out

Let's begin!
