#!/usr/bin/env bun
// qadlc-audit.ts — the append-only audit trail. Every user input and every
// engine/hook event lands here as a timestamped block. NEVER overwrites; only
// appends. Mirrors QADLC v1's audit.md format.
//
// CLI:
//   bun qadlc-audit.ts append --event <TYPE> [--field K=V ...]
//   bun qadlc-audit.ts init                    create the audit file if absent
//
// Importable: appendAuditEntry(eventType, fields, projectRoot).

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  auditPath,
  stateRoot,
  isoTimestamp,
  resolveProjectRoot,
} from "./qadlc-lib.ts";

const HEADER = "# QADLC Audit Trail\n\n> Append-only. Every user input is captured verbatim; every engine/hook\n> event is timestamped. Never edit prior entries.\n\n";

export function ensureAudit(projectRoot: string): string {
  const dir = stateRoot(projectRoot);
  mkdirSync(dir, { recursive: true });
  const path = auditPath(projectRoot);
  if (!existsSync(path)) writeFileSync(path, HEADER, "utf-8");
  return path;
}

export function appendAuditEntry(
  eventType: string,
  fields: Record<string, string>,
  projectRoot: string,
): void {
  const path = ensureAudit(projectRoot);
  const lines = [`## ${eventType}`, `**Timestamp**: ${isoTimestamp()}`];
  for (const [k, v] of Object.entries(fields)) lines.push(`**${k}**: ${v}`);
  lines.push("", "---", "");
  appendFileSync(path, `${lines.join("\n")}\n`, "utf-8");
}

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const projectRoot = resolveProjectRoot(import.meta.url);

  if (cmd === "init") {
    ensureAudit(projectRoot);
    process.stdout.write(`${auditPath(projectRoot)}\n`);
    return;
  }
  if (cmd === "append") {
    let event = "EVENT";
    const fields: Record<string, string> = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--event") event = args[++i] ?? event;
      else if (args[i] === "--field") {
        const kv = args[++i] ?? "";
        const eq = kv.indexOf("=");
        if (eq > 0) fields[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    }
    appendAuditEntry(event, fields, projectRoot);
    return;
  }
  process.stderr.write("usage: qadlc-audit.ts <init|append> [--event T] [--field K=V ...]\n");
  process.exit(2);
}

if (import.meta.main) main();
