#!/usr/bin/env bun
// qadlc-session-start.ts — SessionStart hook. Ensures the audit trail exists and,
// if a session is already in progress, prints a resume summary the conductor can
// present. Non-blocking.

import {
  errorMessage,
  recordHookDrop,
  resolveProjectDirFromHook,
} from "../tools/qadlc-lib.ts";
import { ensureAudit } from "../tools/qadlc-audit.ts";
import { readState } from "../tools/qadlc-state.ts";

const projectDir = resolveProjectDirFromHook(import.meta.url);

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
    "Run the conductor loop (qadlc-orchestrate.ts next) to continue.",
  ].join("\n");
  process.stdout.write(`${summary}\n`);
} catch (e) {
  recordHookDrop(projectDir, "session-start", errorMessage(e));
}
process.exit(0);
