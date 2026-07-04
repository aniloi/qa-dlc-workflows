#!/usr/bin/env bun
// qa-dlc-kiro-adapter.ts — the Kiro hook seam.
//
// Kiro's hook invocation differs from Claude Code's stdin-JSON contract, so the
// core hooks (authored once, harness-neutral) are reached through this thin
// adapter rather than being wired directly. It normalizes whatever Kiro provides
// (stdin JSON and/or env vars) into the ClaudeCodeHookInput shape the core hooks
// expect, then execs the named core hook with that JSON on stdin.
//
//   bun .kiro/hooks/qa-dlc-kiro-adapter.ts --hook <core-hook-name>
//
// e.g. --hook qa-dlc-audit-logger. Keeps the "one core, N harnesses" promise:
// the hook logic lives in .kiro/hooks/qa-dlc-*.ts (copied from core); only this
// payload translation is Kiro-specific.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const hookIdx = args.indexOf("--hook");
const hook = hookIdx >= 0 ? args[hookIdx + 1] ?? "" : "";
if (!hook) {
  process.stderr.write("usage: qa-dlc-kiro-adapter.ts --hook <core-hook-name>\n");
  process.exit(2);
}

const hooksDir = dirname(fileURLToPath(import.meta.url));
const target = join(hooksDir, `${hook}.ts`);

// Build a ClaudeCodeHookInput from Kiro's payload. Kiro passes tool + file via
// env vars in many hook types; if stdin already carries JSON, prefer it.
let payload = "";
if (!process.stdin.isTTY) {
  payload = await Bun.stdin.text();
}
if (payload.trim() === "") {
  const normalized = {
    tool_name: process.env.KIRO_TOOL_NAME ?? process.env.TOOL_NAME ?? "",
    tool_input: { file_path: process.env.KIRO_FILE_PATH ?? process.env.FILE_PATH ?? "" },
    hook_event_name: process.env.KIRO_HOOK_EVENT ?? hook,
  };
  payload = JSON.stringify(normalized);
}

const r = spawnSync("bun", [target], { input: payload, encoding: "utf-8" });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 0);
