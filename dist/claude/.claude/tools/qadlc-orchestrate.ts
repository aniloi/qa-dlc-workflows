#!/usr/bin/env bun
// qadlc-orchestrate.ts — the deterministic ENGINE.
//
// The engine owns ROUTING: which stage runs next, under which scope/depth, when
// the plan gate blocks, and when the workflow is done. The conductor (SKILL.md)
// owns EXECUTION quality. The two talk through a typed directive:
//
//   bun qadlc-orchestrate.ts next
//       → prints one JSON directive (detect-scope | run-stage | gate | done)
//   bun qadlc-orchestrate.ts report <flags>
//       → records an outcome into qa-state.md, appends audit, prints new state
//
// Reads the compiled data plane (tools/data/stage-graph.json, scope-grid.json)
// and the session state (aidlc-docs/qa-state.md). Never guesses — every routing
// decision is derived from the graph + state.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  harnessData,
  harnessDirFromTool,
  loadJson,
  projectRootFromTool,
} from "./qadlc-lib.ts";
import type { StageGraph, ScopeGrid } from "./qadlc-graph.ts";
import type { StageDefinition } from "./qadlc-stage-schema.ts";
import { appendAuditEntry } from "./qadlc-audit.ts";
import {
  defaultState,
  readState,
  writeState,
  type QaState,
} from "./qadlc-state.ts";

interface Directive {
  type: "detect-scope" | "run-stage" | "gate" | "done";
  message: string;
  conductor_persona?: string;
  scope?: string;
  depth?: string;
  scopes_available?: { name: string; depth: string; keywords: string[] }[];
  stage?: {
    slug: string;
    phase: string;
    mode: string;
    lead_agent: string;
    support_agents: string[];
    gate: boolean;
    foreach: boolean;
    produces: string[];
    consumes: string[];
    sensors: string[];
    stage_file: string;
    feature_files_total?: number;
    feature_files_written?: number;
  };
}

const HARNESS_ROOT = harnessDirFromTool(import.meta.url);
const PROJECT_ROOT = projectRootFromTool(import.meta.url);
const DATA_DIR = join(HARNESS_ROOT, "tools", "data");

function loadGraph(): StageGraph {
  return loadJson<StageGraph>(join(DATA_DIR, "stage-graph.json"));
}
function loadScopeGrid(): ScopeGrid {
  return loadJson<ScopeGrid>(join(DATA_DIR, "scope-grid.json"));
}
function stageBySlug(graph: StageGraph, slug: string): StageDefinition | undefined {
  return graph.stages.find((s) => s.slug === slug);
}

function readPersona(): string {
  const hd = harnessData(HARNESS_ROOT).harnessDir || ".claude";
  try {
    return readFileSync(join(HARNESS_ROOT, "qa-common", "conductor.md"), "utf-8");
  } catch {
    return `See ${hd}/qa-common/conductor.md`;
  }
}

function stageFilePath(s: StageDefinition): string {
  const hd = harnessData(HARNESS_ROOT).harnessDir || ".claude";
  return `${hd}/qa-common/stages/${s.phase}/${s.slug}.md`;
}

// ---------------------------------------------------------------------------
// next — emit the single next directive
// ---------------------------------------------------------------------------
function next(): Directive {
  const graph = loadGraph();
  const grid = loadScopeGrid();
  const state = readState(PROJECT_ROOT);

  // No session yet → ask the conductor to detect + confirm the scope.
  if (!state || !state.scope) {
    return {
      type: "detect-scope",
      message:
        "No active QADLC session. Detect the scope from the user's request " +
        "(match keywords), confirm it, then run: " +
        "qadlc-orchestrate.ts report --scope <name> [--depth <d>] [--story-source <mode>].",
      conductor_persona: readPersona(),
      scopes_available: Object.entries(grid.scopes).map(([name, v]) => ({
        name,
        depth: v.depth,
        keywords: v.keywords,
      })),
    };
  }

  const scopeEntry = grid.scopes[state.scope];
  if (!scopeEntry) {
    return {
      type: "detect-scope",
      message: `Unknown scope "${state.scope}" in state. Re-run report --scope with a valid scope.`,
      scopes_available: Object.entries(grid.scopes).map(([name, v]) => ({
        name,
        depth: v.depth,
        keywords: v.keywords,
      })),
    };
  }

  const firstMove = state.completed.length === 0;

  // The next uncompleted stage in this scope's ordered stage list.
  const remaining = scopeEntry.stages.filter((slug) => !state.completed.includes(slug));
  if (remaining.length === 0) {
    return { type: "done", message: `QADLC complete for scope "${state.scope}". All stages done.` };
  }

  const nextSlug = remaining[0];
  const s = stageBySlug(graph, nextSlug);
  if (!s) {
    return { type: "done", message: `Stage "${nextSlug}" missing from graph — nothing to run.` };
  }

  // Plan gate: never advance into the execution phase until the plan is approved.
  if (s.phase === "execution" && state.plan_approved !== "YES") {
    const gate = stageBySlug(graph, "gherkin-plan");
    return {
      type: "gate",
      message:
        "Plan-approval gate: the Gherkin Plan must be approved before any " +
        ".feature file is written. Present gherkin_plan.md and wait for approval, " +
        "then report --stage gherkin-plan --approved --feature-count <N>.",
      scope: state.scope,
      depth: state.depth,
      ...(gate
        ? {
            stage: buildStagePayload(gate, state),
          }
        : {}),
    };
  }

  const directive: Directive = {
    type: s.gate ? "gate" : "run-stage",
    message: s.gate
      ? `Run the Gherkin Plan gate stage. Produce gherkin_plan.md, present it, and WAIT for approval.`
      : `Run stage "${s.slug}" (${s.phase}) at ${state.depth} depth as ${s.lead_agent}.`,
    scope: state.scope,
    depth: state.depth,
    stage: buildStagePayload(s, state),
  };
  if (firstMove) directive.conductor_persona = readPersona();
  return directive;
}

function buildStagePayload(s: StageDefinition, state: QaState): NonNullable<Directive["stage"]> {
  return {
    slug: s.slug,
    phase: s.phase,
    mode: s.mode,
    lead_agent: s.lead_agent,
    support_agents: s.support_agents,
    gate: s.gate,
    foreach: s.foreach,
    produces: s.produces,
    consumes: s.consumes,
    sensors: s.sensors,
    stage_file: stageFilePath(s),
    ...(s.foreach
      ? {
          feature_files_total: state.feature_files_total,
          feature_files_written: state.feature_files_written,
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// report — record an outcome
// ---------------------------------------------------------------------------
function report(args: string[]): QaState {
  const grid = loadScopeGrid();
  const flag = (name: string): string => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] ?? "" : "";
  };
  const has = (name: string): boolean => args.includes(name);

  const scopeArg = flag("--scope");

  // Fresh init: report --scope <name> [--depth d] [--story-source m]
  if (scopeArg) {
    const scopeEntry = grid.scopes[scopeArg];
    if (!scopeEntry) throw new Error(`unknown scope "${scopeArg}"`);
    const depth = flag("--depth") || scopeEntry.depth;
    const s: QaState = {
      ...defaultState(),
      scope: scopeArg,
      depth,
      story_source: flag("--story-source"),
      phase: "discovery",
      current_stage: scopeEntry.stages[0] ?? "",
      stage_status: "IN_PROGRESS",
    };
    writeState(PROJECT_ROOT, s);
    appendAuditEntry("SESSION_STARTED", { Scope: scopeArg, Depth: depth, StorySource: s.story_source || "(unset)" }, PROJECT_ROOT);
    return s;
  }

  const state = readState(PROJECT_ROOT);
  if (!state) throw new Error("no active session; run report --scope <name> first");

  const stage = flag("--stage");
  if (!stage) throw new Error("report requires --stage <slug> (or --scope for init)");

  // The gate stage: approval is explicit.
  if (stage === "gherkin-plan") {
    if (has("--approved")) {
      state.plan_approved = "YES";
      const n = parseInt(flag("--feature-count"), 10);
      if (!Number.isNaN(n)) state.feature_files_total = n;
      if (!state.completed.includes(stage)) state.completed.push(stage);
      state.stage_status = "COMPLETE";
      state.phase = "execution";
      appendAuditEntry("PLAN_APPROVED", { FeatureFiles: String(state.feature_files_total) }, PROJECT_ROOT);
    } else {
      state.plan_approved = "PENDING";
      state.stage_status = "WAITING_FOR_APPROVAL";
      state.current_stage = stage;
      appendAuditEntry("PLAN_PRESENTED", { Status: "awaiting approval" }, PROJECT_ROOT);
    }
    writeState(PROJECT_ROOT, state);
    return state;
  }

  // foreach stage: one file at a time.
  if (stage === "feature-generation") {
    const file = flag("--file");
    if (file) {
      state.feature_files_written += 1;
      appendAuditEntry("FEATURE_FILE_WRITTEN", {
        File: file,
        Progress: `${state.feature_files_written}/${state.feature_files_total}`,
      }, PROJECT_ROOT);
    }
    const done = has("--done") ||
      (state.feature_files_total > 0 && state.feature_files_written >= state.feature_files_total);
    if (done && !state.completed.includes(stage)) {
      state.completed.push(stage);
      state.stage_status = "COMPLETE";
      appendAuditEntry("STAGE_COMPLETED", { Stage: stage }, PROJECT_ROOT);
    } else {
      state.current_stage = stage;
      state.stage_status = "IN_PROGRESS";
    }
    writeState(PROJECT_ROOT, state);
    return state;
  }

  // Ordinary stage.
  const status = flag("--status") || "complete";
  if (status === "complete") {
    if (!state.completed.includes(stage)) state.completed.push(stage);
    state.stage_status = "COMPLETE";
    appendAuditEntry("STAGE_COMPLETED", { Stage: stage }, PROJECT_ROOT);
  } else {
    state.current_stage = stage;
    state.stage_status = status === "waiting" ? "WAITING_FOR_APPROVAL" : "IN_PROGRESS";
    appendAuditEntry("STAGE_STATUS", { Stage: stage, Status: state.stage_status }, PROJECT_ROOT);
  }
  writeState(PROJECT_ROOT, state);
  return state;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === "next") {
    process.stdout.write(`${JSON.stringify(next(), null, 2)}\n`);
    return;
  }
  if (cmd === "report") {
    const s = report(args.slice(1));
    process.stdout.write(`${JSON.stringify(s, null, 2)}\n`);
    return;
  }
  process.stderr.write("usage: qadlc-orchestrate.ts <next|report> [flags]\n");
  process.exit(2);
}

if (import.meta.main) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}
