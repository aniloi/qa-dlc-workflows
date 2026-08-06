// harness/plugin/manifest.ts — the Claude Code PLUGIN distribution row.
//
// The third target, alongside dist/claude (vendored .claude/) and dist/kiro.
// Same core/, same engine, different install shape:
//
//   vendored   the tree lives in the project; the project root is its parent
//   plugin     the tree lives in ~/.claude/plugins/cache/<name>/<version>/,
//              shared across every project and replaced on upgrade
//
// Consequences that shape this file:
//   - harnessDir is "" — the plugin root IS the tree root. Nothing nests under
//     a .claude/ dir, so join(outRoot, "") collapses to outRoot.
//   - mode "plugin" tells the engine never to derive the project root from its
//     own location; entryCmd is a bare `qadlc` (a bin/ executable that Claude
//     Code puts on the Bash tool's PATH).
//   - memory/ is NOT shipped as engine content. It is project-owned: the
//     templates land in templates/memory/ and `qadlc init` materializes them
//     into <project>/.qadlc/memory/. This split is the point of the whole
//     exercise — machinery in the plugin, team vocabulary in the repo.
//   - no settings.json. A plugin's settings.json supports only `agent` and
//     `subagentStatusLine`; hooks must go in hooks/hooks.json, which emit()
//     writes.
//   - no rules/ stub. A plugin cannot contribute ambient context that way; the
//     trigger lives in the skill's frontmatter description instead.
//   - no onboarding doc. QA-CLAUDE.md is a PROJECT-root file and a plugin
//     cannot place files in a project it has not been run in. The skill is the
//     entry point; INSTALL.md documents installation for humans.

import type { HarnessManifest } from "../../scripts/manifest-types.ts";
import emit from "./emit.ts";

const manifest: HarnessManifest = {
  name: "plugin",
  harnessDir: "",
  mode: "plugin",
  entryCmd: "qadlc",

  coreDirs: [
    { src: "tools", dst: "tools" },
    { src: "qa-common", dst: "qa-common" },
    { src: "knowledge", dst: "knowledge" },
    { src: "sensors", dst: "sensors" },
    { src: "scopes", dst: "scopes" },
    { src: "agents", dst: "agents" },
    { src: "hooks", dst: "hooks" },
    // Project-owned. Shipped as a template, materialized by `qadlc init`.
    { src: "memory", dst: "templates/memory" },
    { src: "skills/qadlc-session-cost", dst: "skills/qadlc-session-cost" },
    { src: "skills/qadlc-replay", dst: "skills/qadlc-replay" },
  ],

  harnessFiles: [
    { src: "skills/qadlc/SKILL.md", dst: "skills/qadlc/SKILL.md" },
    { src: "INSTALL.md", dst: "INSTALL.md" },
  ],

  // A plugin cannot write to the project root, so there is no onboarding doc.
  onboarding: null,

  rulesRename: null,

  // emit() owns these three; they are structural, not declarative rows.
  authoredExempt: [],

  emit,
};

export default manifest;
