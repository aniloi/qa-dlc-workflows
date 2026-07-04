// harness/claude/manifest.ts — the Claude Code distribution row.
//
// Projects the harness-neutral core/ tree into dist/claude/.claude/:
//   - token {{HARNESS_DIR}} → .claude
//   - Claude renames no core dir
//   - authored surfaces: the orchestrator skill, the QA-DLC rules @-stub,
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
    { src: "memory", dst: "memory" },
    { src: "skills/qa-dlc-session-cost", dst: "skills/qa-dlc-session-cost" },
    { src: "skills/qa-dlc-replay", dst: "skills/qa-dlc-replay" },
  ],

  harnessFiles: [
    { src: "skills/qa-dlc/SKILL.md", dst: "skills/qa-dlc/SKILL.md" },
    // The QA-DLC method @-import stub: .claude/rules/qa-dlc.md pulls the
    // conductor + method into Claude's ambient context by reference.
    { src: "rules-qa-dlc.md", dst: "rules/qa-dlc.md" },
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
