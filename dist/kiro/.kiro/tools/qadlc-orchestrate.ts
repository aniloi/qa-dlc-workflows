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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  harnessData,
  harnessDirFromTool,
  hooksHealthDir,
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
  type: "detect-scope" | "run-stage" | "gate" | "done" | "print" | "resume";
  message: string;
  conductor_persona?: string;
  scope?: string;
  depth?: string;
  scopes_available?: { name: string; depth: string; keywords: string[] }[];
  /** print: the exact command the conductor must run next (empty = terminal/read-only). */
  command?: string;
  /** print: this directive is read-only output (version/doctor/error) — no state change, no follow-up. */
  readonly?: boolean;
  /** resume: a compact snapshot of the session the user is re-entering. */
  state_summary?: {
    scope: string;
    depth: string;
    phase: string;
    current_stage: string;
    stage_status: string;
    plan_approved: string;
    feature_files_written: number;
    feature_files_total: number;
  };
  /** resume: the numbered choices the conductor presents. */
  options?: string[];
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
// Flag parsing — the `/qadlc <args>` surface the conductor forwards to `next`.
// `next` never mutates state: any flag that implies a state change resolves to a
// `print` directive naming the exact `report` command for the conductor to run.
// ---------------------------------------------------------------------------
const VALID_DEPTHS = ["Minimal", "Standard", "Comprehensive"];

export interface NextFlags {
  version?: boolean;
  doctor?: boolean;
  resume?: boolean;
  scope?: string;
  depth?: string;
  stage?: string;
  phase?: string;
}

/**
 * Extract the flags `next` consumes from the args the conductor forwards after
 * `/qadlc`. Valued flags (`--scope`/`--depth`/`--stage`/`--phase`) take the next
 * token; boolean flags (`--version`/`--doctor`/`--resume`) stand alone. Unknown
 * tokens and freeform text are ignored (scope detection is the conductor's job).
 */
export function parseNextFlags(args: string[]): NextFlags {
  const flags: NextFlags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--version") flags.version = true;
    else if (a === "--doctor") flags.doctor = true;
    else if (a === "--resume") flags.resume = true;
    else if (a === "--scope" && i + 1 < args.length) flags.scope = args[++i];
    else if (a === "--depth" && i + 1 < args.length) flags.depth = args[++i];
    else if (a === "--stage" && i + 1 < args.length) flags.stage = args[++i];
    else if (a === "--phase" && i + 1 < args.length) flags.phase = args[++i];
  }
  return flags;
}

/** Build the exact command string the conductor should run next. */
function orchestrateCmd(sub: string): string {
  const hd = harnessData(HARNESS_ROOT).harnessDir || ".claude";
  return `bun ${hd}/tools/qadlc-orchestrate.ts ${sub}`;
}

/** A read-only print directive (version/doctor/errors) — no follow-up command. */
function printReadonly(message: string): Directive {
  return { type: "print", message, readonly: true };
}

/** A print directive that names the exact command the conductor must run next. */
function printCommand(message: string, command: string): Directive {
  return { type: "print", message, command };
}

function scopeList(grid: ScopeGrid): { name: string; depth: string; keywords: string[] }[] {
  return Object.entries(grid.scopes).map(([name, v]) => ({
    name,
    depth: v.depth,
    keywords: v.keywords,
  }));
}

// ---------------------------------------------------------------------------
// next — emit the single next directive
// ---------------------------------------------------------------------------
function next(args: string[] = []): Directive {
  const flags = parseNextFlags(args);

  // Read-only utility flags run before we touch the data plane or state, so they
  // work even on a broken or brand-new workspace.
  if (flags.version) return printReadonly(`QADLC ${harnessData(HARNESS_ROOT).version}`);
  if (flags.doctor) return doctorDirective();

  const graph = loadGraph();
  const grid = loadScopeGrid();
  const state = readState(PROJECT_ROOT);

  // Flag surface (resume / scope / depth / stage|phase jump). `next` stays
  // read-only: any implied state change resolves to a `print` directive naming
  // the exact `report` command for the conductor to run.
  const flagDirective = handleFlags(flags, state, graph, grid);
  if (flagDirective) return flagDirective;

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
// handleFlags — resolve the `/qadlc` flag surface into a directive, or null to
// let `next` fall through to its default (state-derived) routing.
// ---------------------------------------------------------------------------
function handleFlags(
  flags: NextFlags,
  state: QaState | null,
  graph: StageGraph,
  grid: ScopeGrid,
): Directive | null {
  const hasJump = Boolean(flags.stage || flags.phase);

  // Mutual exclusions.
  if (flags.stage && flags.phase) {
    return printReadonly("Cannot use --stage and --phase together. Use one or the other.");
  }
  if (hasJump && (flags.scope || flags.depth)) {
    return printReadonly(
      "Cannot combine a scope/depth change with a --stage/--phase jump. Run them separately.",
    );
  }

  // --resume: re-enter an existing session via a choice menu. No session → fall
  // through so the default detect-scope (fresh start) fires.
  if (flags.resume) {
    if (!state || !state.scope) return null;
    return {
      type: "resume",
      message:
        "Resuming an existing QADLC session. Present the summary and the numbered " +
        "options below, then act on the user's choice — do not assume \"continue\".",
      scope: state.scope,
      depth: state.depth,
      state_summary: {
        scope: state.scope,
        depth: state.depth,
        phase: state.phase,
        current_stage: state.current_stage,
        stage_status: state.stage_status,
        plan_approved: state.plan_approved,
        feature_files_written: state.feature_files_written,
        feature_files_total: state.feature_files_total,
      },
      options: [
        "Continue where we left off — run `next`",
        "Review a previous stage before continuing",
        `Redo the current stage — \`next --stage ${state.current_stage || "<slug>"}\``,
        "Jump to a different stage — `next --stage <slug>`",
        "Start fresh — re-detect scope with `report --scope <name>`",
      ],
    };
  }

  // --scope: pin (fresh), change (mid-flight), or confirm (same → fall through).
  if (flags.scope) {
    if (!grid.scopes[flags.scope]) {
      return printReadonly(
        `Unknown scope "${flags.scope}". Valid scopes: ${Object.keys(grid.scopes).join(", ")}.`,
      );
    }
    if (flags.depth && !VALID_DEPTHS.includes(flags.depth)) {
      return printReadonly(`Unknown depth "${flags.depth}". Valid depths: ${VALID_DEPTHS.join(", ")}.`);
    }
    const depthPart = flags.depth ? ` --depth ${flags.depth}` : "";
    if (!state || !state.scope) {
      return printCommand(
        `Initialize a new QADLC session at scope "${flags.scope}"` +
          `${flags.depth ? ` (${flags.depth} depth)` : ""}. Run the command below, ` +
          "adding --story-source <jira|folder|inline> if the story origin is known.",
        orchestrateCmd(`report --scope ${flags.scope}${depthPart}`),
      );
    }
    if (state.scope !== flags.scope) {
      return printCommand(
        `Changing scope from "${state.scope}" to "${flags.scope}" re-initializes the ` +
          "workflow and RESETS stage progress, plan approval, and feature-file counts. " +
          "Confirm with the user, then run the command below.",
        orchestrateCmd(`report --scope ${flags.scope}${depthPart}`),
      );
    }
    // same scope → fall through to depth / default handling
  }

  // --depth: standalone config change (reached when no --scope, or --scope equals
  // the active scope and fell through above).
  if (flags.depth) {
    if (!VALID_DEPTHS.includes(flags.depth)) {
      return printReadonly(`Unknown depth "${flags.depth}". Valid depths: ${VALID_DEPTHS.join(", ")}.`);
    }
    if (!state || !state.scope) {
      return {
        type: "detect-scope",
        message:
          `Depth "${flags.depth}" noted, but there is no active session yet. Detect and ` +
          "confirm the scope first; the depth applies at init " +
          `(report --scope <name> --depth ${flags.depth}).`,
        conductor_persona: readPersona(),
        scopes_available: scopeList(grid),
      };
    }
    return printCommand(
      `Override the session depth to "${flags.depth}". Run the command below.`,
      orchestrateCmd(`report --depth ${flags.depth}`),
    );
  }

  // --stage / --phase: jump the stage pointer within the active scope.
  if (hasJump) {
    if (!state || !state.scope) {
      return printReadonly(
        "No active QADLC session to jump within. Start one first — describe the story, " +
          "or set a scope with `next --scope <name>`.",
      );
    }
    const scopeEntry = grid.scopes[state.scope];
    if (!scopeEntry) return null; // unknown scope in state → let default next() surface it

    let target = flags.stage ?? "";
    if (flags.phase) {
      const ph = flags.phase.toLowerCase();
      if (ph !== "discovery" && ph !== "execution") {
        return printReadonly(`Unknown phase "${flags.phase}". Valid phases: discovery, execution.`);
      }
      const first = scopeEntry.stages.find((slug) => stageBySlug(graph, slug)?.phase === ph);
      if (!first) return printReadonly(`No "${ph}" stage in scope "${state.scope}".`);
      target = first;
    }

    const targetStage = stageBySlug(graph, target);
    if (!targetStage) return printReadonly(`Unknown stage "${target}".`);
    if (!scopeEntry.stages.includes(target)) {
      return printReadonly(
        `Stage "${target}" is not part of scope "${state.scope}". ` +
          `In-scope stages: ${scopeEntry.stages.join(", ")}.`,
      );
    }
    if (targetStage.phase === "execution" && state.plan_approved !== "YES") {
      return printReadonly(
        `Cannot jump to "${target}": the execution phase is gated until the Gherkin Plan ` +
          "is approved. Approve it first — report --stage gherkin-plan --approved --feature-count <N>.",
      );
    }
    return printCommand(
      `Jump to stage "${target}" (${targetStage.phase}). This resets the stage pointer so ` +
        `"${target}" runs next. Run the command below.`,
      orchestrateCmd(`report --jump ${target}`),
    );
  }

  return null;
}

// doctorDirective — a read-only environment/setup check. Never throws: each probe
// degrades to a reported problem so `--doctor` works on a broken workspace.
function doctorDirective(): Directive {
  const hd = harnessData(HARNESS_ROOT);
  const lines: string[] = ["QADLC doctor — environment & setup check", ""];
  lines.push(`- bun: ${process.versions.bun ? `v${process.versions.bun}` : "NOT DETECTED (required)"}`);
  lines.push(`- harness dir: ${hd.harnessDir || "(unknown)"}`);
  lines.push(`- version: ${hd.version}`);
  for (const [label, file] of [
    ["stage-graph", join(DATA_DIR, "stage-graph.json")],
    ["scope-grid", join(DATA_DIR, "scope-grid.json")],
  ] as const) {
    try {
      loadJson(file);
      lines.push(`- ${label}.json: OK`);
    } catch {
      lines.push(`- ${label}.json: MISSING or unparseable (regenerate: bun scripts/package.ts)`);
    }
  }
  try {
    const s = readState(PROJECT_ROOT);
    lines.push(
      s
        ? `- session state: OK (scope "${s.scope}", stage "${s.current_stage || "(none)"}", plan ${s.plan_approved})`
        : "- session state: none (fresh workspace)",
    );
  } catch {
    lines.push("- session state: UNREADABLE");
  }
  try {
    const dropLog = join(hooksHealthDir(HARNESS_ROOT), "hook-drops.log");
    if (existsSync(dropLog)) {
      const n = readFileSync(dropLog, "utf-8").split("\n").filter((l) => l.trim()).length;
      lines.push(`- hook health: ${n} recorded drop(s) — see ${dropLog}`);
    } else {
      lines.push("- hook health: clean (no drops recorded)");
    }
  } catch {
    lines.push("- hook health: unknown");
  }
  return printReadonly(lines.join("\n"));
}

// applyJump — move the stage pointer to `slug` by recomputing completed[]: every
// in-scope stage ordered before the target becomes complete; the target and all
// that follow become pending, so the next `next` returns the target. A backward
// jump into discovery re-opens the plan gate and resets feature-file progress.
function applyJump(state: QaState, slug: string, grid: ScopeGrid): QaState {
  const graph = loadGraph();
  const scopeEntry = grid.scopes[state.scope];
  if (!scopeEntry) throw new Error(`unknown scope "${state.scope}" in state`);
  const idx = scopeEntry.stages.indexOf(slug);
  if (idx < 0) throw new Error(`stage "${slug}" is not in scope "${state.scope}"`);
  const targetPhase = stageBySlug(graph, slug)?.phase ?? "discovery";
  if (targetPhase === "execution" && state.plan_approved !== "YES") {
    throw new Error(`cannot jump to "${slug}": execution is gated until the plan is approved`);
  }
  state.completed = scopeEntry.stages.slice(0, idx);
  state.current_stage = slug;
  state.stage_status = "IN_PROGRESS";
  state.phase = targetPhase;
  if (targetPhase === "discovery") {
    state.plan_approved = "NO";
    state.feature_files_written = 0;
  }
  appendAuditEntry("STAGE_JUMP", { Stage: slug, Phase: targetPhase }, PROJECT_ROOT);
  writeState(PROJECT_ROOT, state);
  return state;
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

  // Pointer jump: report --jump <slug> — recompute completed[] so <slug> is next.
  const jumpArg = flag("--jump");
  if (jumpArg) return applyJump(state, jumpArg, grid);

  // Standalone depth override: report --depth <level> (no --stage).
  const depthArg = flag("--depth");
  if (depthArg && !flag("--stage")) {
    if (!VALID_DEPTHS.includes(depthArg)) throw new Error(`unknown depth "${depthArg}"`);
    state.depth = depthArg;
    appendAuditEntry("DEPTH_CHANGED", { Depth: depthArg }, PROJECT_ROOT);
    writeState(PROJECT_ROOT, state);
    return state;
  }

  const stage = flag("--stage");
  if (!stage) {
    throw new Error(
      "report requires --stage <slug> (or --scope for init, --jump <slug> to move the pointer, --depth to re-set depth)",
    );
  }

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
    process.stdout.write(`${JSON.stringify(next(args.slice(1)), null, 2)}\n`);
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
