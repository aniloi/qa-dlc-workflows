#!/usr/bin/env bun
// qadlc-state.ts — the tool-owned session state (aidlc-docs/qa-state.md).
//
// State is machine-owned: the file carries a canonical JSON block (the single
// source of truth) plus a human-readable render generated from it, so the two
// never drift. The engine (qadlc-orchestrate.ts) reads/writes it; the conductor
// never hand-edits the machine fields.
//
// CLI:
//   bun qadlc-state.ts show                    print the JSON state (or {} if none)
//   bun qadlc-state.ts init --scope <s> --depth <d> [--story-source <m>]
//   bun qadlc-state.ts set --field K=V ...     patch scalar fields
//   bun qadlc-state.ts complete --stage <slug> mark a stage done
//
// Importable: readState / writeState / initState.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  docsRoot,
  isoTimestamp,
  projectRootFromTool,
  statePath,
} from "./qadlc-lib.ts";

export type StageStatus = "IN_PROGRESS" | "WAITING_FOR_APPROVAL" | "COMPLETE";
export type PlanApproval = "YES" | "NO" | "PENDING";

export interface QaState {
  scope: string;
  depth: string;
  phase: string;
  current_stage: string;
  stage_status: StageStatus;
  plan_approved: PlanApproval;
  story_source: string;
  completed: string[];
  feature_files_total: number;
  feature_files_written: number;
  started: string;
  last_updated: string;
}

const MACHINE_OPEN = "<!-- qa-state:machine";
const MACHINE_CLOSE = "-->";

export function defaultState(): QaState {
  const now = isoTimestamp();
  return {
    scope: "",
    depth: "",
    phase: "discovery",
    current_stage: "",
    stage_status: "IN_PROGRESS",
    plan_approved: "NO",
    story_source: "",
    completed: [],
    feature_files_total: 0,
    feature_files_written: 0,
    started: now,
    last_updated: now,
  };
}

export function readState(projectRoot: string): QaState | null {
  const path = statePath(projectRoot);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  const start = raw.indexOf(MACHINE_OPEN);
  if (start < 0) return null;
  const jsonStart = start + MACHINE_OPEN.length;
  const end = raw.indexOf(MACHINE_CLOSE, jsonStart);
  if (end < 0) return null;
  try {
    return { ...defaultState(), ...JSON.parse(raw.slice(jsonStart, end).trim()) };
  } catch {
    return null;
  }
}

function render(s: QaState): string {
  const box = (slug: string): string => (s.completed.includes(slug) ? "[x]" : "[ ]");
  const lines = [
    "# QADLC Session State",
    "",
    "> Tool-owned. The machine block at the bottom is the source of truth.",
    "",
    `- **Scope**: ${s.scope || "(unset)"}${s.depth ? ` (${s.depth})` : ""}`,
    `- **Phase**: ${s.phase}`,
    `- **Current Stage**: ${s.current_stage || "(none)"}`,
    `- **Stage Status**: ${s.stage_status}`,
    `- **Plan Approved**: ${s.plan_approved}`,
    `- **Story Source**: ${s.story_source || "(unset)"}`,
    `- **Feature Files**: ${s.feature_files_written} / ${s.feature_files_total}`,
    `- **Started**: ${s.started}`,
    `- **Last Updated**: ${s.last_updated}`,
    "",
    "## Completed Stages",
    ...(s.completed.length > 0
      ? s.completed.map((c) => `- ${box(c)} ${c}`)
      : ["- (none yet)"]),
    "",
    `${MACHINE_OPEN}`,
    JSON.stringify(s, null, 2),
    `${MACHINE_CLOSE}`,
    "",
  ];
  return `${lines.join("\n")}`;
}

export function writeState(projectRoot: string, s: QaState): void {
  mkdirSync(docsRoot(projectRoot), { recursive: true });
  s.last_updated = isoTimestamp();
  writeFileSync(statePath(projectRoot), render(s), "utf-8");
}

export function initState(projectRoot: string, patch: Partial<QaState>): QaState {
  const s = { ...defaultState(), ...patch };
  writeState(projectRoot, s);
  return s;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const projectRoot = projectRootFromTool(import.meta.url);
  const flag = (name: string): string => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] ?? "" : "";
  };

  if (cmd === "show") {
    const s = readState(projectRoot);
    process.stdout.write(`${JSON.stringify(s ?? {}, null, 2)}\n`);
    return;
  }
  if (cmd === "init") {
    const s = initState(projectRoot, {
      scope: flag("--scope"),
      depth: flag("--depth"),
      story_source: flag("--story-source"),
    });
    process.stdout.write(`${JSON.stringify(s, null, 2)}\n`);
    return;
  }
  if (cmd === "set") {
    const s = readState(projectRoot) ?? defaultState();
    const rec = s as unknown as Record<string, unknown>;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--field") {
        const kv = args[++i] ?? "";
        const eq = kv.indexOf("=");
        if (eq <= 0) continue;
        const key = kv.slice(0, eq);
        const val = kv.slice(eq + 1);
        const n = Number(val);
        rec[key] = /^\d+$/.test(val) ? n : val;
      }
    }
    writeState(projectRoot, s);
    process.stdout.write(`${JSON.stringify(s, null, 2)}\n`);
    return;
  }
  if (cmd === "complete") {
    const s = readState(projectRoot) ?? defaultState();
    const slug = flag("--stage");
    if (slug && !s.completed.includes(slug)) s.completed.push(slug);
    writeState(projectRoot, s);
    process.stdout.write(`${JSON.stringify(s, null, 2)}\n`);
    return;
  }
  process.stderr.write("usage: qadlc-state.ts <show|init|set|complete> [flags]\n");
  process.exit(2);
}

if (import.meta.main) main();
