#!/usr/bin/env bun
// qadlc-sensor-fire.ts — PostToolUse hook. When a .feature file is written, run
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
} from "../tools/qadlc-lib.ts";
import { readState } from "../tools/qadlc-state.ts";

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
const base = file.split("/").pop() ?? "";

// Route the write to the stage whose sensors should fire:
//   - gherkin_plan.md → the plan gate stage (plan-sections)
//   - *.feature       → feature-generation, or cross-feature-check once that
//                       foreach stage is complete
let stage: string;
if (base === "gherkin_plan.md") {
  stage = "gherkin-plan";
} else if (file.endsWith(".feature")) {
  const state = readState(projectDir);
  stage = state && state.completed.includes("feature-generation") ? "cross-feature-check" : "feature-generation";
} else {
  process.exit(0);
}

try {
  const dispatcher = join(harness, "tools", "qadlc-sensor.ts");
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
