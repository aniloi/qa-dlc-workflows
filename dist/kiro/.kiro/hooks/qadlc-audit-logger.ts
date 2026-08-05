#!/usr/bin/env bun
// qadlc-audit-logger.ts — PostToolUse hook. Emits ARTIFACT_CREATED /
// ARTIFACT_UPDATED to the audit trail when a workflow file (a .feature, the
// plan, or anything under aidlc-docs/) is written or edited. This is the
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
  docsRoot,
  errorMessage,
  harnessDirFromTool,
  hooksHealthDir,
  isClaudeCodeHookInput,
  isoTimestamp,
  planPath,
  recordHookDrop,
  resolveProjectDirFromHook,
  type ClaudeCodeHookInput,
} from "../tools/qadlc-lib.ts";
import { readState } from "../tools/qadlc-state.ts";

const projectDir = resolveProjectDirFromHook(import.meta.url);

// Health heartbeat.
try {
  const healthDir = hooksHealthDir(harnessDirFromTool(import.meta.url));
  mkdirSync(healthDir, { recursive: true });
  writeFileSync(join(healthDir, "audit-logger.last"), isoTimestamp(), "utf-8");
} catch {
  /* best-effort */
}

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

// Only log workflow artifacts: anything under aidlc-docs/, the plan, or a .feature.
const docs = docsRoot(projectDir).replace(/\\/g, "/");
const plan = planPath(projectDir).replace(/\\/g, "/");
const isArtifact =
  file.startsWith(`${docs}/`) || file === plan || file.endsWith(".feature");
if (!isArtifact) process.exit(0);

// Never log writes to the audit file itself (avoid recursion).
if (file.endsWith("/audit.md")) process.exit(0);

// Only log when a v2 session is active. The audit file existing is not enough:
// QADLC v1 owns aidlc-docs/audit.md too and writes it in a different format, so
// a v1 project satisfies the file check and would have v2 blocks appended into
// its v1 trail. readState() returns null without the machine marker, which is
// what distinguishes the two.
const state = readState(projectDir);
if (!state || !state.scope) process.exit(0);
if (!existsSync(auditPath(projectDir))) process.exit(0);
ensureAudit(projectDir);

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
