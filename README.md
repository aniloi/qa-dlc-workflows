# QA-DLC Workflows

> **AI-driven Gherkin feature file authoring** — a structured, two-phase workflow that turns user stories into production-ready `.feature` files using any AI coding assistant.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-v1.0.0-blue.svg)](VERSION)

---

## What Is This?

**QA-DLC** (Quality Assurance Development Lifecycle) is a rule-based workflow for AI coding assistants that enforces a disciplined, plan-first approach to BDD Gherkin test authoring.

Instead of asking an AI to "just write some tests," QA-DLC guides the AI through:

1. **Discovery** — reading your user stories, extracting your team's conventions, inventorying existing step definitions, and producing a reviewed plan
2. **Execution** — writing feature files one at a time per the approved plan, then validating cross-file consistency

The AI never writes a single `.feature` line until the plan is explicitly approved by you.

---

## Quick Start

### 1. Download the latest release

Go to [Releases](https://github.com/aniloi/qa-dlc-workflows/releases) and download the latest `qa-dlc-workflows-vX.X.X.zip`.

### 2. Extract

```bash
unzip qa-dlc-workflows-vX.X.X.zip
```

The archive contains:
```
qa-dlc-rules/
├── qa-dlc-core/
│   └── core-workflow.md          ← the main workflow instruction file
└── qa-dlc-rule-details/
    ├── common/                   ← shared rules (welcome, validation, session continuity, etc.)
    ├── discovery/                ← discovery phase rules (workspace detection, story analysis, etc.)
    └── execution/                ← execution phase rules (feature generation, consistency check)
```

### 3. Follow the agent-specific setup below

---

## Platform-Specific Setup

- [Kiro](#kiro-kirosteering)
- [Claude Code](#claude-code-qa-claudemd)
- [GitHub Copilot](#github-copilot-githubqa-copilot-instructionsmd)
- [AGENTS.md](#agentsmd-qa-agentsmd-generic--cursor--cline-fallback)
- [Cursor](#cursor-cursorrulesca-dlc-workflowmdc)
- [Cline](#cline-clinerulesca-dlc-workflowmd)

> **All agents except Kiro**: After completing agent-specific setup, also copy the rule details directory:
> ```bash
> cp -r qa-dlc-rules/qa-dlc-rule-details/ <your-project-root>/.qa-dlc-rule-details/
> ```
> Kiro uses a different placement — see the Kiro section below.

---

### Kiro (`.kiro/steering/`)

QA-DLC uses [Kiro Steering Files](https://kiro.dev/docs/steering/) to load the workflow. The core workflow goes in `.kiro/steering/` and the rule details go directly under `.kiro/` (not `.qa-dlc-rule-details/`).

**macOS/Linux:**
```bash
mkdir -p .kiro/steering
cp -R qa-dlc-rules/qa-dlc-core .kiro/steering/
cp -R qa-dlc-rules/qa-dlc-rule-details .kiro/
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path ".kiro\steering"
Copy-Item -Recurse "qa-dlc-rules\qa-dlc-core" ".kiro\steering\"
Copy-Item -Recurse "qa-dlc-rules\qa-dlc-rule-details" ".kiro\"
```

**Windows (CMD):**
```cmd
mkdir .kiro\steering
xcopy qa-dlc-rules\qa-dlc-core .kiro\steering\qa-dlc-core\ /E /I
xcopy qa-dlc-rules\qa-dlc-rule-details .kiro\qa-dlc-rule-details\ /E /I
```

Your project should look like:
```
<your-project-root>/
└── .kiro/
    ├── steering/
    │   └── qa-dlc-core/
    │       └── core-workflow.md
    └── qa-dlc-rule-details/
        ├── common/
        ├── discovery/
        └── execution/
```

> **Note**: Kiro reads steering files automatically. Open the Steering Files panel in Kiro IDE and confirm you see `core-workflow` listed under Workspace. Use Kiro in **Vibe mode** — if Kiro nudges you to switch to spec mode, select `No`.

---

### Claude Code (`QA-CLAUDE.md`)

1. Copy `qa-dlc-rules/qa-dlc-core/core-workflow.md` to your project root as `QA-CLAUDE.md`:
   ```bash
   cp qa-dlc-rules/qa-dlc-core/core-workflow.md <your-project-root>/QA-CLAUDE.md
   ```
   > This keeps QA-DLC separate from any existing `CLAUDE.md` (e.g., from aidlc-workflows).
2. Copy the rule details:
   ```bash
   cp -r qa-dlc-rules/qa-dlc-rule-details/ <your-project-root>/.qa-dlc-rule-details/
   ```
3. Start Claude Code in your project root. Trigger the workflow with:
   ```
   Using QA-DLC, write feature files for <Jira key or story path>
   ```

---

### GitHub Copilot (`.github/qa-copilot-instructions.md`)

1. Create the directory if it doesn't exist:
   ```bash
   mkdir -p <your-project-root>/.github
   ```
2. Copy `qa-dlc-rules/qa-dlc-core/core-workflow.md` as `qa-copilot-instructions.md`:
   ```bash
   cp qa-dlc-rules/qa-dlc-core/core-workflow.md <your-project-root>/.github/qa-copilot-instructions.md
   ```
   > This keeps QA-DLC separate from any existing `.github/copilot-instructions.md` (e.g., from aidlc-workflows).
3. Copy the rule details:
   ```bash
   cp -r qa-dlc-rules/qa-dlc-rule-details/ <your-project-root>/.qa-dlc-rule-details/
   ```
4. In GitHub Copilot Chat, trigger with:
   ```
   Using QA-DLC, write feature files for <story or Jira key>
   ```

---

### AGENTS.md (`QA-AGENTS.md` Generic / Cursor / Cline fallback)

1. Copy `qa-dlc-rules/qa-dlc-core/core-workflow.md` to your project root as `QA-AGENTS.md`:
   ```bash
   cp qa-dlc-rules/qa-dlc-core/core-workflow.md <your-project-root>/QA-AGENTS.md
   ```
   > This keeps QA-DLC separate from any existing `AGENTS.md` (e.g., from aidlc-workflows).
2. Copy the rule details:
   ```bash
   cp -r qa-dlc-rules/qa-dlc-rule-details/ <your-project-root>/.qa-dlc-rule-details/
   ```
3. Trigger with:
   ```
   Using QA-DLC, write feature files for <story or Jira key>
   ```

---

### Cursor (`.cursor/rules/qa-dlc-workflow.mdc`)

1. Create the directory if it doesn't exist:
   ```bash
   mkdir -p <your-project-root>/.cursor/rules
   ```
2. Create `<your-project-root>/.cursor/rules/qa-dlc-workflow.mdc` with the following frontmatter, then append the contents of `qa-dlc-rules/qa-dlc-core/core-workflow.md`:

   ```markdown
   ---
   description: QA-DLC Gherkin workflow — activated when user mentions BDD, Gherkin, feature file, or starts request with "Using QA-DLC"
   globs:
     - "**/*.feature"
     - "aidlc-docs/**"
     - "gherkin_plan.md"
   alwaysApply: false
   ---

   <!-- paste core-workflow.md contents here -->
   ```

3. Copy the rule details:
   ```bash
   cp -r qa-dlc-rules/qa-dlc-rule-details/ <your-project-root>/.qa-dlc-rule-details/
   ```

---

### Cline (`.clinerules/qa-dlc-workflow.md`)

1. Create the directory if it doesn't exist:
   ```bash
   mkdir -p <your-project-root>/.clinerules
   ```
2. Copy `qa-dlc-rules/qa-dlc-core/core-workflow.md` as `qa-dlc-workflow.md`:
   ```bash
   cp qa-dlc-rules/qa-dlc-core/core-workflow.md <your-project-root>/.clinerules/qa-dlc-workflow.md
   ```
   > This keeps QA-DLC separate from any existing `.clinerules/core-workflow.md` (e.g., from aidlc-workflows).
3. Copy the rule details:
   ```bash
   cp -r qa-dlc-rules/qa-dlc-rule-details/ <your-project-root>/.qa-dlc-rule-details/
   ```

---

## Usage

Once installed, trigger the workflow in your AI assistant's chat interface:

```
Using QA-DLC, write feature files for CLM-123
```

```
Using QA-DLC, write Gherkin scenarios for the stories in aidlc-docs/inception/user-stories/
```

The assistant will automatically:
1. Detect your framework layout
2. Read your user stories
3. Extract your team's Gherkin conventions from existing feature files
4. Inventory your existing step definitions
5. Produce a `gherkin_plan.md` for your review
6. Wait for your explicit approval before writing any `.feature` files
7. Write each file one at a time, validating consistency at the end

---

## Two-Phase Workflow

### Phase 1: Discovery

| Stage | What Happens |
|---|---|
| Workspace Detection | Detects your repo structure, step definitions location, and style reference feature file |
| Story Analysis | Reads every user story, extracts acceptance criteria, flags ambiguities |
| Convention Extraction | Learns your team's tagging, naming, and abstraction style from existing feature files |
| Step Inventory | Catalogs all existing step definitions grouped by domain |
| Gherkin Plan | Produces `gherkin_plan.md` with story→scenario mapping, reuse inventory, and open questions |

**The plan must be explicitly approved before anything is written.**

### Phase 2: Execution

| Stage | What Happens |
|---|---|
| Feature File Generation | Writes one `.feature` file at a time per the approved checklist |
| Cross-Feature Consistency Check | Validates no duplicate names, consistent tagging, uniform abstraction level |

---

## Key Features

- **Plan-first discipline** — no code is written before the plan is reviewed and approved
- **Step reuse over invention** — always checks the existing step inventory before proposing new steps
- **Convention-aware** — learns your team's naming, tagging, and abstraction style from your own codebase
- **Declarative Gherkin** — enforces behavior-level descriptions, not UI click-through procedures
- **Complete audit trail** — every user input and AI action logged in `aidlc-docs/audit.md` with timestamps
- **Session continuity** — resumes from `aidlc-docs/qa-state.md` if a session is interrupted
- **Multi-agent** — works with Kiro, Claude Code, GitHub Copilot, Cursor, Cline, and any AGENTS.md-compatible assistant

---

## Tenets

1. **Plan first, write second.** The AI never authors a `.feature` file before `gherkin_plan.md` is approved.
2. **Reuse over invention.** Every new step definition is a last resort, not a first instinct.
3. **Declarative always.** Gherkin describes what the system does — not how to operate the UI.
4. **One file at a time.** Feature files are written sequentially with a checkbox marked after each.
5. **Complete audit trail.** Every user input is captured verbatim in `aidlc-docs/audit.md`.
6. **Ask when ambiguous, decide when clear.** The AI flags genuine ambiguities; it doesn't ask about things it can determine from conventions.

---

## Prerequisites

- An AI coding assistant (Kiro, Claude Code, GitHub Copilot, Cursor, Cline, or compatible)
- A BDD automation framework with:
  - Cucumber step definition Java classes (or equivalent)
  - At least one existing `.feature` file to use as a style reference
  - A `aidlc-docs/inception/user-stories/` directory (or a Jira project key)
- **Jira mode only**: the MCP Atlassian server must be configured in your AI assistant (see [MCP Connections](#mcp-connections) below)

---

## MCP Connections

Certain QA-DLC features require MCP (Model Context Protocol) servers to be active in your AI assistant:

| Feature | Required MCP | Notes |
|---|---|---|
| Jira story input mode (`CLM-123`, `PROJ-456`, etc.) | **MCP Atlassian** | The assistant calls Jira via MCP to fetch issue content. Without it, Jira mode silently fails — use the folder or `user-stories/` input modes instead. |

> **How to configure**: MCP setup varies by assistant. See your assistant's documentation for how to add and enable MCP servers. For a working Jira MCP config example, see the [Setup Guide](docs/SETUP_GUIDE.md#jira-integration-setup).

---

## Expected Directory Structure

After installation, your project root should contain:

**Claude Code / Copilot / AGENTS.md / Cursor / Cline:**
```
<your-project-root>/
├── QA-CLAUDE.md              (Claude Code)
├── QA-AGENTS.md              (AGENTS.md / generic fallback)
├── .github/
│   └── qa-copilot-instructions.md   (GitHub Copilot)
├── .cursor/rules/
│   └── qa-dlc-workflow.mdc  (Cursor)
├── .clinerules/
│   └── qa-dlc-workflow.md   (Cline)
├── .qa-dlc-rule-details/
│   ├── common/
│   ├── discovery/
│   └── execution/
├── aidlc-docs/
│   └── inception/
│       └── user-stories/        ← place your story .md files here
└── <framework-root>/
    └── src/test/
        ├── .../steps/           ← your existing step definitions (READ ONLY)
        └── .../features/        ← new .feature files will be written here
```

**Kiro:**
```
<your-project-root>/
├── .kiro/
│   ├── steering/
│   │   └── qa-dlc-core/
│   │       └── core-workflow.md
│   └── qa-dlc-rule-details/
│       ├── common/
│       ├── discovery/
│       └── execution/
├── aidlc-docs/
│   └── inception/
│       └── user-stories/
└── <framework-root>/
    └── src/test/
        ├── .../steps/
        └── .../features/
```

---

## Troubleshooting

**The AI isn't following the workflow.**
Make sure the full `core-workflow.md` contents are present in the correct instruction file for your agent (not just a reference to it — the full text must be pasted).

**The AI is writing feature files without showing a plan first.**
The workflow should block on plan approval. Check that `.qa-dlc-rule-details/` is present at your project root and that the `common/`, `discovery/`, and `execution/` subdirectories are all present.

**The AI can't find step definitions.**
Verify that your step definitions path is discoverable from the repo root. On first run, the AI will ask you to confirm the paths during Workspace Detection.

**Session was interrupted mid-workflow.**
The AI will check for `aidlc-docs/qa-state.md` at startup and offer to resume. If it doesn't, manually say: `Resume the QA-DLC session from qa-state.md`.

**Jira integration isn't working.**
Jira mode requires the MCP Atlassian server to be configured and active in your AI assistant. Confirm the server is running, your credentials are valid, and the Jira key format is correct (e.g., `PROJ-123`). See [MCP Connections](#mcp-connections) and the [Jira Integration Setup](docs/SETUP_GUIDE.md#jira-integration-setup) section of the Setup Guide.

---

## Version Control Recommendations

Add the following to your `.gitignore` to avoid committing AI session artifacts:

```gitignore
# QA-DLC session artifacts (optional — commit if you want audit history)
aidlc-docs/qa-state.md
aidlc-docs/audit.md

# Commit these — they are the deliverables
# gherkin_plan.md
# **/*.feature
```

---

## Attribution

QA-DLC Workflows is inspired by and modeled on the architecture of [**awslabs/aidlc-workflows**](https://github.com/awslabs/aidlc-workflows) — the AI-Driven Development Lifecycle framework from AWS Labs. The two-phase workflow structure, rule detail file organization, and agent-instruction pattern are all derived from that project.

---

## License

[MIT](LICENSE) © 2026 aniloi
