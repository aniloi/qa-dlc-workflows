#!/usr/bin/env bun
// qadlc-audit-logger.ts — PostToolUse hook. Emits ARTIFACT_CREATED /
// ARTIFACT_UPDATED to the audit trail when a workflow file (a .feature, the
// plan, or anything under .qadlc/) is written or edited. This is the
// determinism that replaces QADLC v1's "MANDATORY: log in audit.md" prose —
// the log happens whether or not the model remembers to.
//
// No-op unless an audit trail already exists (i.e. a session is active) and the
// write is a workflow artifact.

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendAuditEntry, ensureAudit } from "../tools/qadlc-audit.ts";
import {
  auditPath,
  stateRoot,
  errorMessage,
  hooksHealthDir,
  isClaudeCodeHookInput,
  isoTimestamp,
  planPath,
  recordHookDrop,
  resolveProjectRootOrExit,
  type ClaudeCodeHookInput,
} from "../tools/qadlc-lib.ts";
import { readState } from "../tools/qadlc-state.ts";

const projectDir = resolveProjectRootOrExit(import.meta.url);

if (process.stdin.isTTY) process.exit(0);

const input = await Bun.stdin.text();
let parsed: ClaudeCodeHookInput;
try {
  const raw: unknown = JSON.parse(input);
  if (!isClaudeCodeHookInput(raw)) process.exit(0);
  parsed = raw;
} catch {
  process.exit(0);
}

const tool = parsed.tool_name ?? "";
const file = (parsed.tool_input?.file_path ?? "").replace(/\\/g, "/");
if (file === "") process.exit(0);

// Only log workflow artifacts: anything under .qadlc/, the plan, or a .feature.
const state_ = stateRoot(projectDir).replace(/\\/g, "/");
const plan = planPath(projectDir).replace(/\\/g, "/");
const isArtifact =
  file.startsWith(`${state_}/`) || file === plan || file.endsWith(".feature");
if (!isArtifact) process.exit(0);

// Never log writes to the audit file itself (avoid recursion).
if (file.endsWith("/audit.md")) process.exit(0);

// Only log when a v2 session is active. The audit file existing is not enough on
// its own: before .qadlc/ namespacing, v1's aidlc-docs/audit.md satisfied that
// check and got v2-format blocks appended into it. The paths no longer overlap,
// but the state read is still the correct gate — a hook must not write anything
// when there is no session — and it keeps the guard independent of the layout.
const state = readState(projectDir);
if (!state || !state.scope) process.exit(0);
if (!existsSync(auditPath(projectDir))) process.exit(0);
ensureAudit(projectDir);

// Health heartbeat. Deliberately AFTER every no-op check: the health dir now
// lives in the project (.qadlc/health/), so writing it first would create a
// .qadlc/ directory in repos that have no QADLC session at all — including
// every v1 project the user opens with the plugin installed. It also means an
// unrelated file edit no longer costs a bun boot plus a write.
try {
  const healthDir = hooksHealthDir(projectDir);
  mkdirSync(healthDir, { recursive: true });
  writeFileSync(join(healthDir, "audit-logger.last"), isoTimestamp(), "utf-8");
} catch {
  /* best-effort */
}

// CREATE vs UPDATE: Edit is always UPDATE; Write is CREATE if the file is
// net-new (mtime ≈ birthtime), else UPDATE.
let eventType = "ARTIFACT_UPDATED";
if (tool !== "Edit") {
  try {
    const st = statSync(file);
    eventType = Math.abs(st.mtimeMs - st.birthtimeMs) < 10 ? "ARTIFACT_CREATED" : "ARTIFACT_UPDATED";
  } catch {
    eventType = "ARTIFACT_CREATED";
  }
}

try {
  appendAuditEntry(eventType, { Tool: tool, File: file }, projectDir);
} catch (e) {
  recordHookDrop(projectDir, "audit-logger", errorMessage(e));
  process.exit(0);
}
