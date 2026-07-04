#!/usr/bin/env bun
// qa-dlc-sensor-fire.ts — PostToolUse hook. When a .feature file is written, run
// the sensors bound to the CURRENT stage (read from qa-state.md) via the
// dispatcher. Advisory: findings are recorded, never block the write.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  errorMessage,
  harnessDirFromTool,
  isClaudeCodeHookInput,
  recordHookDrop,
  resolveProjectDirFromHook,
  type ClaudeCodeHookInput,
} from "../tools/qa-dlc-lib.ts";
import { readState } from "../tools/qa-dlc-state.ts";

const projectDir = resolveProjectDirFromHook(import.meta.url);
const harness = harnessDirFromTool(import.meta.url);

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

const file = (parsed.tool_input?.file_path ?? "").replace(/\\/g, "/");
if (!file.endsWith(".feature")) process.exit(0);

// Determine the active stage. In the execution phase this is feature-generation;
// fall back to it if state is unreadable.
const state = readState(projectDir);
const stage =
  state && state.completed.includes("feature-generation") ? "cross-feature-check" : "feature-generation";

try {
  const dispatcher = join(harness, "tools", "qa-dlc-sensor.ts");
  if (!existsSync(dispatcher)) process.exit(0);
  spawnSync("bun", [dispatcher, "--stage", stage, "--file-path", file], {
    encoding: "utf-8",
    timeout: 60_000,
    stdio: ["ignore", "ignore", "ignore"],
  });
} catch (e) {
  recordHookDrop(projectDir, "sensor-fire", errorMessage(e));
}
process.exit(0);
