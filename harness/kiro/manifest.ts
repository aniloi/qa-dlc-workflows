// harness/kiro/manifest.ts — the Kiro CLI/IDE distribution row.
//
// Projects the harness-neutral core/ tree into dist/kiro/.kiro/, plus Kiro's
// authored surfaces (orchestrator skill, the stdin adapter hook once Phase 5
// lands, QA-AGENTS.md at the project root).
//
// Kiro specifics vs Claude:
//   - token → .kiro
//   - rules/ → steering/ (Kiro auto-loads steering; rules ARE the always-on layer)
//   - the orchestrator skill is per-harness (authored here, NOT core)
//   - QA-AGENTS.md lands at the PROJECT ROOT (dist/kiro/QA-AGENTS.md), outside .kiro/

import type { HarnessManifest } from "../../scripts/manifest-types.ts";
import onboardingFills from "./onboarding.fills.ts";

const manifest: HarnessManifest = {
  name: "kiro",
  harnessDir: ".kiro",

  // core/<src> → <harnessDir>/<dst>. Dirs that do not yet exist in core/ are
  // skipped by the packager, so this list is future-proof across phases.
  coreDirs: [
    { src: "tools", dst: "tools" },
    { src: "qa-common", dst: "qa-common" },
    { src: "knowledge", dst: "knowledge" },
    { src: "sensors", dst: "sensors" },
    { src: "scopes", dst: "scopes" },
    { src: "agents", dst: "agents" },
    { src: "hooks", dst: "hooks" },
    { src: "memory", dst: "memory" },
    { src: "skills/qadlc-session-cost", dst: "skills/qadlc-session-cost" },
    { src: "skills/qadlc-replay", dst: "skills/qadlc-replay" },
  ],

  harnessFiles: [
    { src: "skills/qadlc/SKILL.md", dst: "skills/qadlc/SKILL.md" },
    { src: "hooks/qadlc-kiro-adapter.ts", dst: "hooks/qadlc-kiro-adapter.ts" },
    { src: "dot-gitignore", dst: ".gitignore", projectRoot: true },
  ],

  // QA-AGENTS.md renders from the shared skeleton with Kiro's fills, at the
  // project root (outside .kiro/).
  onboarding: { dst: "QA-AGENTS.md", projectRoot: true, fills: onboardingFills },

  // rules/ → steering/ (Kiro auto-loads steering files).
  rulesRename: "steering",

  // The authored orchestrator skill lives inside skills/ alongside any core
  // session skills; exempt Kiro-native agent JSON + adapter hooks from the
  // orphan scan for when Phase 3/5 add them.
  authoredExempt: [/^agents\/[^/]+\.json$/, /^hooks\/qadlc-kiro-[^/]+\.ts$/],

  emit: null,
};

export default manifest;
