#!/usr/bin/env bun
// qadlc-validate-state.ts — a state integrity check. Runnable by hand
// (see the engine's entryCmd in tools/data/harness.json) or wired as a hook. Reports
// inconsistencies between qa-state.md and the compiled graph without mutating
// anything. Exit 0 = valid, 1 = problems found.

import { join } from "node:path";
import {
  engineRootFromTool,
  loadJson,
  resolveProjectRoot,
} from "../tools/qadlc-lib.ts";
import { readState } from "../tools/qadlc-state.ts";
import type { ScopeGrid } from "../tools/qadlc-graph.ts";

const projectDir = resolveProjectRoot(import.meta.url);
const engineRoot = engineRootFromTool(import.meta.url);

const problems: string[] = [];
const state = readState(projectDir);

if (!state) {
  process.stdout.write("no active session (qa-state.md absent) — nothing to validate\n");
  process.exit(0);
}

try {
  const grid = loadJson<ScopeGrid>(join(engineRoot, "tools", "data", "scope-grid.json"));
  const scope = grid.scopes[state.scope];
  if (!scope) {
    problems.push(`scope "${state.scope}" is not in the compiled scope grid`);
  } else {
    for (const c of state.completed) {
      if (!scope.stages.includes(c)) {
        problems.push(`completed stage "${c}" is not a member of scope "${state.scope}"`);
      }
    }
    if (state.phase === "execution" && state.plan_approved !== "YES") {
      problems.push("phase is execution but plan is not approved (gate inconsistency)");
    }
    if (state.feature_files_written > state.feature_files_total && state.feature_files_total > 0) {
      problems.push(`feature_files_written (${state.feature_files_written}) exceeds total (${state.feature_files_total})`);
    }
  }
} catch (e) {
  problems.push(`could not load scope grid: ${e instanceof Error ? e.message : String(e)}`);
}

if (problems.length === 0) {
  process.stdout.write("qa-state.md is consistent with the compiled graph\n");
  process.exit(0);
}
process.stderr.write(`state validation problems:\n  ${problems.join("\n  ")}\n`);
process.exit(1);
