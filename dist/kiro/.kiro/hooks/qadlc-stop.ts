#!/usr/bin/env bun
// qadlc-stop.ts — Stop hook. The ENFORCEMENT hook: it turns QADLC's two hard
// invariants from prose into a deterministic gate at the end of a turn.
//
//   1. PLAN GATE — no .feature may be created before the Gherkin Plan is
//      approved. If the audit trail shows a .feature ARTIFACT_CREATED with no
//      preceding PLAN_APPROVED, the hook BLOCKS (decision:block) and tells the
//      conductor to get the plan approved.
//   2. CHECKBOX DISCIPLINE — every written feature file must be marked [x] in
//      gherkin_plan.md. Lagging checkboxes are flagged (advisory).
//
// Blocking uses the Claude Code Stop-hook contract: print
// {"decision":"block","reason":"…"} to stdout. Everything else is advisory.

import { existsSync, readFileSync } from "node:fs";
import {
  auditPath,
  engineRootFromTool,
  entryCommand,
  errorMessage,
  planPath,
  recordHookDrop,
  resolveProjectRootOrExit,
} from "../tools/qadlc-lib.ts";
import { appendAuditEntry } from "../tools/qadlc-audit.ts";
import { readState } from "../tools/qadlc-state.ts";

const projectDir = resolveProjectRootOrExit(import.meta.url);

function block(reason: string): never {
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
  process.exit(0);
}

try {
  const state = readState(projectDir);
  if (!state || !state.scope) process.exit(0); // no active session

  const auditFile = auditPath(projectDir);
  const audit = existsSync(auditFile) ? readFileSync(auditFile, "utf-8") : "";

  // --- 1. Plan gate ---
  // A .feature artifact recorded before PLAN_APPROVED (or with no approval at
  // all) is a gate violation.
  const approvedIdx = audit.indexOf("## PLAN_APPROVED");
  const featureCreatedIdx = firstFeatureArtifactIndex(audit);
  const planApproved = state.plan_approved === "YES";
  const featureBeforeApproval =
    featureCreatedIdx >= 0 && (approvedIdx < 0 || featureCreatedIdx < approvedIdx);

  if (!planApproved && (featureCreatedIdx >= 0 || state.feature_files_written > 0)) {
    appendAuditEntry("GATE_VIOLATION", {
      Gate: "plan-approval",
      Detail: "a .feature was created before gherkin_plan.md was approved",
    }, projectDir);
    block(
      "QADLC plan gate: a .feature file was created before the Gherkin Plan was " +
        "approved. Present gherkin_plan.md, get explicit approval, and report it " +
        `(${entryCommand(engineRootFromTool(import.meta.url))} report --stage gherkin-plan --approved) before ` +
        "writing feature files.",
    );
  }
  if (featureBeforeApproval) {
    appendAuditEntry("GATE_VIOLATION", { Gate: "plan-approval", Detail: "feature artifact precedes approval in audit order" }, projectDir);
    block("QADLC plan gate: a feature file appears in the audit before plan approval. Review the order of operations.");
  }

  // --- 2. Checkbox discipline (advisory) ---
  const plan = planPath(projectDir);
  if (existsSync(plan) && state.feature_files_written > 0) {
    const text = readFileSync(plan, "utf-8");
    const checked = (text.match(/^- \[x\]/gim) ?? []).length;
    if (checked < state.feature_files_written) {
      process.stdout.write(
        `QADLC checkbox notice: ${state.feature_files_written} feature file(s) written but only ` +
          `${checked} marked [x] in gherkin_plan.md. Mark each file's checkbox as you write it.\n`,
      );
    }
  }
} catch (e) {
  recordHookDrop(projectDir, "stop", errorMessage(e));
}
process.exit(0);

// Index of the first audit block that records a .feature ARTIFACT_CREATED or a
// FEATURE_FILE_WRITTEN. -1 if none.
function firstFeatureArtifactIndex(audit: string): number {
  const blocks = audit.split(/^## /m);
  let offset = 0;
  for (const b of blocks) {
    const header = `## ${b}`;
    const isFeatureCreate =
      (b.startsWith("ARTIFACT_CREATED") || b.startsWith("FEATURE_FILE_WRITTEN")) &&
      /\.feature/.test(b);
    if (isFeatureCreate) return audit.indexOf(header, Math.max(0, offset - 3));
    offset += header.length;
  }
  return -1;
}
