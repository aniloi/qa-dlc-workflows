#!/usr/bin/env bun
// qadlc-session-start.ts — SessionStart hook. Ensures the audit trail exists and,
// if a session is already in progress, prints a resume summary the conductor can
// present. Non-blocking.

import {
  engineRootFromTool,
  entryCommand,
  errorMessage,
  recordHookDrop,
  resolveProjectRootOrExit,
  shouldCedeToVendored,
  v1InstallPresent,
} from "../tools/qadlc-lib.ts";
import { ensureAudit } from "../tools/qadlc-audit.ts";
import { readState } from "../tools/qadlc-state.ts";

const ENGINE_ROOT = engineRootFromTool(import.meta.url);
const projectDir = resolveProjectRootOrExit(import.meta.url);

// Ceding is a real behaviour change, so say so once per session rather than going
// quiet: a plugin that silently does nothing is harder to diagnose than one that
// explains itself. The other four hooks exit without comment — one notice is
// enough, and PostToolUse would repeat it on every edit.
if (shouldCedeToVendored(ENGINE_ROOT, projectDir)) {
  process.stdout.write(
    [
      "**QADLC plugin is standing down for this project.**",
      "",
      "This repo vendors its own QADLC engine (`.claude/hooks/qadlc-*.ts`), and plugin",
      "hooks do not deduplicate against a project's own — leaving both active fires every",
      "QADLC hook twice per event. The vendored copy is authoritative here; use its",
      "commands (`bun .claude/tools/qadlc.ts …`), not `qadlc`.",
      "",
      "To switch this project to the plugin:",
      "  1. rm -rf .claude/tools .claude/hooks .claude/qa-common .claude/scopes \\",
      "            .claude/sensors .claude/agents .claude/knowledge .claude/skills/qadlc \\",
      "            .claude/rules/qadlc.md",
      "  2. remove the qadlc-* entries from .claude/settings.json",
      "  3. qadlc migrate      # moves state/audit/memory into .qadlc/",
      "  4. rm QA-CLAUDE.md    # the skill replaces it",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

try {
  const state = readState(projectDir);
  if (!state || !state.scope) {
    // Fresh — do not create an audit trail yet (the engine does that at init).
    process.exit(0);
  }
  ensureAudit(projectDir);
  const summary = [
    "**Welcome back — resuming your QADLC session.**",
    `- Scope / Depth: ${state.scope} (${state.depth})`,
    `- Phase: ${state.phase}`,
    `- Current Stage: ${state.current_stage || "(none)"} (Status: ${state.stage_status})`,
    `- Plan Approved: ${state.plan_approved}`,
    `- Feature Files: ${state.feature_files_written} / ${state.feature_files_total}`,
    "",
    `Run the conductor loop (${entryCommand(ENGINE_ROOT)} next) to continue.`,
  ].join("\n");
  process.stdout.write(`${summary}\n`);

  // QADLC v1 is prose-only, so it cannot double-fire and the plugin does NOT cede
  // to it. But both claim overlapping trigger words, so name which one is running.
  if (v1InstallPresent(projectDir)) {
    process.stdout.write(
      "\nNote: QADLC v1 (`.qa-dlc-rule-details/`) is also present in this repo. " +
        "This session is v2 — say \"QADLC\" to reach it, and ignore v1's QA-CLAUDE.md.\n",
    );
  }
} catch (e) {
  recordHookDrop(projectDir, "session-start", errorMessage(e));
}
process.exit(0);
