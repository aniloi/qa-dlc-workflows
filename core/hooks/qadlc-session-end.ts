#!/usr/bin/env bun
// qadlc-session-end.ts — SessionEnd hook. Records a SESSION_ENDED audit row with
// a snapshot of progress, so the trail closes cleanly. Non-blocking.

import {
  engineRootFromTool,
  errorMessage,
  recordHookDrop,
  resolveProjectRootOrExit,
  shouldCedeToVendored,
} from "../tools/qadlc-lib.ts";
import { appendAuditEntry } from "../tools/qadlc-audit.ts";
import { readState } from "../tools/qadlc-state.ts";

const projectDir = resolveProjectRootOrExit(import.meta.url);

// Stand down when this project vendors its own QADLC engine. Plugin hooks do not
// deduplicate against a project's settings.json hooks, so without this every
// QADLC hook would fire twice per event in a half-migrated repo.
if (shouldCedeToVendored(engineRootFromTool(import.meta.url), projectDir)) process.exit(0);

try {
  const state = readState(projectDir);
  if (!state || !state.scope) process.exit(0);
  appendAuditEntry("SESSION_ENDED", {
    Scope: state.scope,
    Phase: state.phase,
    Completed: state.completed.join(", ") || "(none)",
    PlanApproved: state.plan_approved,
    FeatureFiles: `${state.feature_files_written}/${state.feature_files_total}`,
  }, projectDir);
} catch (e) {
  recordHookDrop(projectDir, "session-end", errorMessage(e));
}
process.exit(0);
