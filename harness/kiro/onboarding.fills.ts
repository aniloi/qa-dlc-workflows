// harness/kiro/onboarding.fills.ts — Kiro's fills for the shared onboarding
// skeleton (core/templates/onboarding.md), rendered into dist/kiro/QA-AGENTS.md.

import type { OnboardingFills } from "../../scripts/onboarding.ts";

const fills: OnboardingFills = {
  invoke: "Using QA-DLC",
  slots: {
    install: [
      "## Installation (Kiro)",
      "",
      "Copy the generated tree into your project:",
      "",
      "```bash",
      "cp -R dist/kiro/.kiro/ your-project/.kiro/",
      "cp dist/kiro/QA-AGENTS.md your-project/QA-AGENTS.md",
      "```",
      "",
      "Kiro auto-loads `.kiro/steering/`. Confirm `qa-dlc` appears in the Steering",
      "Files panel. Use Kiro in Vibe mode.",
    ].join("\n"),
    mcp: [
      "## Jira integration (optional)",
      "",
      "Jira story input (`CLM-123`) requires the MCP Atlassian server configured",
      "and active in Kiro. Without it, use folder or `user-stories/` input modes.",
    ].join("\n"),
  },
};

export default fills;
