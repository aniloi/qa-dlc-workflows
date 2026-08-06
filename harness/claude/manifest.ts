// harness/claude/manifest.ts — the Claude Code distribution row.
//
// Projects the harness-neutral core/ tree into dist/claude/.claude/:
//   - token {{HARNESS_DIR}} → .claude
//   - Claude renames no core dir
//   - authored surfaces: the orchestrator skill, the QADLC rules @-stub,
//     settings.json, project-root install files
//   - QA-CLAUDE.md renders from the shared skeleton at the project root

import type { HarnessManifest } from "../../scripts/manifest-types.ts";
import onboardingFills from "./onboarding.fills.ts";

const manifest: HarnessManifest = {
  name: "claude",
  harnessDir: ".claude",

  coreDirs: [
    { src: "tools", dst: "tools" },
    { src: "qa-common", dst: "qa-common" },
    { src: "knowledge", dst: "knowledge" },
    { src: "sensors", dst: "sensors" },
    { src: "scopes", dst: "scopes" },
    { src: "agents", dst: "agents" },
    { src: "hooks", dst: "hooks" },
    // Project-owned; `qadlc init` materializes it into .qadlc/memory/.
    { src: "memory", dst: "templates/memory" },
    { src: "skills/qadlc-session-cost", dst: "skills/qadlc-session-cost" },
    { src: "skills/qadlc-replay", dst: "skills/qadlc-replay" },
  ],

  harnessFiles: [
    { src: "skills/qadlc/SKILL.md", dst: "skills/qadlc/SKILL.md" },
    // The QADLC method @-import stub: .claude/rules/qadlc.md pulls the
    // conductor + method into Claude's ambient context by reference.
    { src: "rules-qadlc.md", dst: "rules/qadlc.md" },
    { src: "settings.json", dst: "settings.json" },
    { src: "dot-gitignore", dst: ".gitignore", projectRoot: true },
  ],

  // QA-CLAUDE.md renders at the project root (kept separate from any existing
  // CLAUDE.md), from the shared skeleton + Claude's fills.
  onboarding: { dst: "QA-CLAUDE.md", projectRoot: true, fills: onboardingFills },

  rulesRename: null,

  authoredExempt: [],

  emit: null,
};

export default manifest;
