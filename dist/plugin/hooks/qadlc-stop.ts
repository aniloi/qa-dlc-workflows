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
  isClaudeCodeHookInput,
  planPath,
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

function block(reason: string): never {
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
  process.exit(0);
}

// THE STOP-HOOK CONTRACT. `stop_hook_active` is true when a Stop hook is already
// running or has recently blocked. The platform requires that we allow the stop in
// that case:
//
//   "if your hook sees "stop_hook_active": true, it should either allow the stop
//    or take a different action such as logging, rather than blocking again."
//
// This hook previously never read its stdin at all, so it re-blocked on every
// turn-end until Claude Code force-overrode it. Observed live: nine consecutive
// blocks, nine identical GATE_VIOLATION rows appended to an append-only trail, and
// a session with no clean exit — because the gate condition (a .feature exists
// before approval) is permanent once true, so re-evaluating it always re-blocks.
//
// The pressure that creates is the real damage: the only advertised remedy is
// `report --stage gherkin-plan --approved`, so an agent optimizing for a completed
// turn is pushed toward fabricating a human approval in the audit trail. Blocking
// ONCE states the violation; blocking forever corrupts the incentive.
let stopHookActive = false;
if (!process.stdin.isTTY) {
  try {
    const raw: unknown = JSON.parse(await Bun.stdin.text());
    if (isClaudeCodeHookInput(raw)) stopHookActive = raw.stop_hook_active === true;
  } catch {
    /* no or unparseable input — treat as a first stop attempt */
  }
}
if (stopHookActive) process.exit(0);

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

  // Record a violation at most ONCE per session. The gate condition is permanent
  // (an ARTIFACT_CREATED row can never be withdrawn from an append-only trail), so
  // an unguarded append writes an identical row on every turn-end.
  const recordViolation = (detail: string): void => {
    if (audit.includes(`**Detail**: ${detail}`)) return;
    appendAuditEntry("GATE_VIOLATION", { Gate: "plan-approval", Detail: detail }, projectDir);
  };

  if (!planApproved && (featureCreatedIdx >= 0 || state.feature_files_written > 0)) {
    recordViolation("a .feature was created before gherkin_plan.md was approved");
    block(
      "QADLC plan gate: a .feature file was created before the Gherkin Plan was " +
        "approved. Present gherkin_plan.md, get explicit approval, and report it " +
        `(${entryCommand(engineRootFromTool(import.meta.url))} report --stage gherkin-plan --approved) before ` +
        "writing feature files.",
    );
  }

  // ORDERING ANOMALY — advisory, never blocking.
  //
  // This is only reachable once the plan IS approved (the check above owns the
  // unapproved case), so it means "a feature was written, and the plan was
  // approved afterwards". That is worth recording, but it must not block: the
  // condition is permanent and unfixable, because the fix the gate advertises —
  // approve the plan — is the very thing that got us here. Blocking left the
  // session with NO honest exit, and the only advertised escape was for the agent
  // to report an approval the human never gave. A gate that can only be cleared by
  // forging its own precondition is worse than no gate.
  if (featureBeforeApproval) {
    recordViolation("feature artifact precedes approval in audit order");
    process.stdout.write(
      "QADLC plan-gate notice: a feature file appears in the audit before plan " +
        "approval. The plan is approved now, so work continues — but the ordering " +
        "is recorded in the audit trail.\n",
    );
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
