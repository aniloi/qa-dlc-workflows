# QA-DLC Setup Guide

This guide walks you through a complete setup of QA-DLC Workflows in your automation framework.

---

## Prerequisites

Before you begin, ensure you have:

- An AI coding assistant with support for instruction/rules files:
  - [Kiro](https://kiro.dev/) — uses `.kiro/steering/`
  - [Claude Code](https://claude.ai/code) — uses `CLAUDE.md`
  - [GitHub Copilot](https://github.com/features/copilot) — uses `.github/copilot-instructions.md`
  - [Cursor](https://www.cursor.com/) — uses `.cursor/rules/`
  - [Cline](https://github.com/cline/cline) — uses `.clinerules/`
  - Any agent supporting `AGENTS.md`
- A BDD automation framework with:
  - Cucumber step definition classes (Java or equivalent)
  - At least one existing `.feature` file (used as a style reference)
- User stories available as:
  - Markdown files in `aidlc-docs/inception/user-stories/`, **or**
  - A Jira project key (requires **MCP Atlassian** configured and active in your assistant — see [Jira Integration Setup](#jira-integration-setup) below), **or**
  - A folder path you'll specify at runtime

---

## Step 1 — Download and Extract

Download the latest release zip from [GitHub Releases](https://github.com/aniloi/qa-dlc-workflows/releases):

```bash
unzip qa-dlc-workflows-v1.0.0.zip
cd qa-dlc-workflows-v1.0.0
```

---

## Step 2 — Copy Rule Details to Your Project

This step is **required for all agents**:

```bash
cp -r qa-dlc-rules/qa-dlc-rule-details/ <your-project-root>/.qa-dlc-rule-details/
```

Verify the result:

```
<your-project-root>/
└── .qa-dlc-rule-details/
    ├── common/
    │   ├── welcome-message.md
    │   ├── process-overview.md
    │   ├── content-validation.md
    │   ├── question-format-guide.md
    │   └── session-continuity.md
    ├── discovery/
    │   ├── workspace-detection.md
    │   ├── story-analysis.md
    │   ├── convention-extraction.md
    │   ├── step-inventory.md
    │   └── gherkin-plan.md
    └── execution/
        ├── feature-file-generation.md
        └── cross-feature-check.md
```

---

## Step 3 — Install for Your Agent

### Kiro

Kiro uses [Steering Files](https://kiro.dev/docs/steering/). The core workflow goes in `.kiro/steering/` and the rule details go under `.kiro/` directly — **not** in `.qa-dlc-rule-details/` at the project root.

**macOS/Linux:**
```bash
mkdir -p <your-project-root>/.kiro/steering
cp -R qa-dlc-rules/qa-dlc-core <your-project-root>/.kiro/steering/
cp -R qa-dlc-rules/qa-dlc-rule-details <your-project-root>/.kiro/
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "<your-project-root>\.kiro\steering"
Copy-Item -Recurse "qa-dlc-rules\qa-dlc-core" "<your-project-root>\.kiro\steering\"
Copy-Item -Recurse "qa-dlc-rules\qa-dlc-rule-details" "<your-project-root>\.kiro\"
```

**Windows (CMD):**
```cmd
mkdir <your-project-root>\.kiro\steering
xcopy qa-dlc-rules\qa-dlc-core <your-project-root>\.kiro\steering\qa-dlc-core\ /E /I
xcopy qa-dlc-rules\qa-dlc-rule-details <your-project-root>\.kiro\qa-dlc-rule-details\ /E /I
```

Verify the layout:
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

> Open the Steering Files panel in Kiro IDE and confirm `core-workflow` appears under **Workspace**. Run Kiro in **Vibe mode** — if nudged to switch to spec mode, select **No**.

> For Kiro CLI: run `kiro-cli`, then `/context show`, and confirm entries for `.kiro/steering/qa-dlc-core`.

---

### Claude Code

```bash
cat qa-dlc-rules/qa-dlc-core/core-workflow.md >> <your-project-root>/CLAUDE.md
```

Or if you don't have a `CLAUDE.md` yet:

```bash
cp qa-dlc-rules/qa-dlc-core/core-workflow.md <your-project-root>/CLAUDE.md
```

### GitHub Copilot

```bash
mkdir -p <your-project-root>/.github
cat qa-dlc-rules/qa-dlc-core/core-workflow.md >> <your-project-root>/.github/copilot-instructions.md
```

### AGENTS.md (Generic)

```bash
cat qa-dlc-rules/qa-dlc-core/core-workflow.md >> <your-project-root>/AGENTS.md
```

### Cursor

```bash
mkdir -p <your-project-root>/.cursor/rules
```

Create `<your-project-root>/.cursor/rules/qa-dlc-workflow.mdc`:

```markdown
---
description: QA-DLC Gherkin workflow — activated when user mentions BDD, Gherkin, feature file, or starts request with "Using QA-DLC"
globs:
  - "**/*.feature"
  - "aidlc-docs/**"
  - "gherkin_plan.md"
alwaysApply: false
---

```

Then append the core workflow:

```bash
cat qa-dlc-rules/qa-dlc-core/core-workflow.md >> <your-project-root>/.cursor/rules/qa-dlc-workflow.mdc
```

### Cline

```bash
mkdir -p <your-project-root>/.clinerules
cp qa-dlc-rules/qa-dlc-core/core-workflow.md <your-project-root>/.clinerules/core-workflow.md
```

---

## Step 4 — Prepare Your User Stories

Place your user story files in:

```
<your-project-root>/aidlc-docs/inception/user-stories/
```

Each file should be a `.md` file with a user story and acceptance criteria. Example:

```markdown
# Story: User can deposit funds

As a registered user,
I want to deposit funds into my account,
So that I can start trading.

## Acceptance Criteria
- Given a verified account, when the user submits a deposit with a valid amount, the deposit is accepted
- When an invalid amount is provided, the system returns an appropriate error
- Deposit history is updated immediately after a successful deposit
```

> **Jira mode**: If your stories are in Jira, skip this step. Just provide the Jira key when triggering the workflow (e.g., `CLM-123`). Requires MCP Atlassian configured in your assistant.

---

## Step 5 — Verify Your Framework Layout

QA-DLC needs to find two things in your framework:

1. **Step definitions** — your Cucumber step classes
2. **Existing feature files** — at least one, used as a style reference

The AI will auto-detect these at runtime during Workspace Detection. If it can't find them, it will ask you to confirm the paths.

Typical layout:
```
<framework-root>/
└── src/test/
    ├── java/.../steps/          ← step definitions (READ ONLY — QA-DLC never modifies these)
    └── resources/.../features/  ← existing + new feature files
        └── components/          ← style reference feature files
```

---

## Step 6 — Trigger the Workflow

Open your AI assistant and run:

```
Using QA-DLC, write feature files for CLM-123
```

or

```
Using QA-DLC, write Gherkin scenarios for the stories in aidlc-docs/inception/user-stories/
```

The assistant will:
1. Display the QA-DLC welcome message
2. Run through all Discovery stages automatically
3. Present `gherkin_plan.md` for your review
4. Wait for your explicit approval
5. Write `.feature` files one at a time
6. Run a cross-file consistency check and report results

---

## Jira Integration Setup

To use Jira mode (provide a Jira issue key instead of story files), your AI assistant must have the MCP Atlassian server configured.

### Claude Code

Add to your `claude_desktop_config.json` (or equivalent MCP config):

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-atlassian"],
      "env": {
        "JIRA_URL": "https://yourcompany.atlassian.net",
        "JIRA_EMAIL": "you@yourcompany.com",
        "JIRA_API_TOKEN": "<your-api-token>"
      }
    }
  }
}
```

Refer to your AI assistant's documentation for the exact MCP configuration format.

---

## Session Resumption

If a QA-DLC session is interrupted, the workflow saves state to `aidlc-docs/qa-state.md`. To resume:

```
Resume the QA-DLC session from qa-state.md
```

The assistant will pick up from where it left off.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| AI ignores the workflow | Confirm `core-workflow.md` contents are fully loaded in your agent's instruction/steering file |
| AI writes files without showing a plan | Confirm rule details directory is present with all subdirectories (`common/`, `discovery/`, `execution/`) |
| Step definitions not found | Confirm they exist under your `src/test/` tree; on first run the AI will ask to confirm the path |
| Jira key not resolving | Confirm MCP Atlassian is configured and the key format is valid (e.g., `PROJ-123`) |
| Session lost after restart | Run: `Resume the QA-DLC session from qa-state.md` |
| **Kiro**: workflow not activating | Open Steering Files panel and confirm `core-workflow` appears under **Workspace**; verify `.kiro/steering/qa-dlc-core/core-workflow.md` exists |
| **Kiro**: rule details not loading | Confirm `qa-dlc-rule-details/` is directly under `.kiro/` (not at project root) |
| **Kiro CLI**: rules not visible | Run `kiro-cli` → `/context show` and confirm `.kiro/steering/qa-dlc-core` entries |

---

## File Reference

| File | Purpose |
|---|---|
| `qa-dlc-rules/qa-dlc-core/core-workflow.md` | Main workflow instructions — paste into agent instruction file |
| `.qa-dlc-rule-details/common/` | Shared rules loaded at workflow start |
| `.qa-dlc-rule-details/discovery/` | Discovery phase detail rules |
| `.qa-dlc-rule-details/execution/` | Execution phase detail rules |
| `aidlc-docs/inception/user-stories/` | Input: your user story `.md` files |
| `aidlc-docs/qa-state.md` | Session state (auto-created, used for resumption) |
| `aidlc-docs/audit.md` | Complete audit trail (auto-created) |
| `gherkin_plan.md` | The generated plan — review and approve this before execution begins |
