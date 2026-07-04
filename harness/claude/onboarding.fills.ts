// harness/claude/onboarding.fills.ts — Claude Code's fills for the shared
// onboarding skeleton, rendered into dist/claude/QA-CLAUDE.md.

import type { OnboardingFills } from "../../scripts/onboarding.ts";

const fills: OnboardingFills = {
  invoke: "Using QA-DLC",
  slots: {
    install: [
      "## Installation (Claude Code)",
      "",
      "Copy the generated tree into your project:",
      "",
      "```bash",
      "cp -R dist/claude/.claude/ your-project/.claude/",
      "cp dist/claude/QA-CLAUDE.md your-project/QA-CLAUDE.md",
      "```",
      "",
      "`QA-CLAUDE.md` is kept separate from any existing `CLAUDE.md`. The",
      "`.claude/rules/qa-dlc.md` stub pulls the conductor into ambient context.",
    ].join("\n"),
    mcp: [
      "## Jira integration (optional)",
      "",
      "Jira story input (`CLM-123`) requires the MCP Atlassian server configured",
      "and active in Claude Code. Without it, use folder or `user-stories/` modes.",
    ].join("\n"),
  },
};

export default fills;
