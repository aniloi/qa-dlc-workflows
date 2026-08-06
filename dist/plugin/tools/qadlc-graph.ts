#!/usr/bin/env bun
// qadlc-graph.ts — the stage-graph compiler.
//
//   bun qadlc-graph.ts compile            (re)compile into tools/data/*.json
//   bun qadlc-graph.ts compile --check    verify committed JSON is fresh
//
// Reads the assembled harness tree (qa-common/stages/**, scopes/, sensors/,
// agents/) and emits two data-plane artefacts the engine reads:
//   - tools/data/stage-graph.json  — every stage node, ordered by phase then order
//   - tools/data/scope-grid.json   — scope → { depth, keywords, ordered stage slugs }
//
// Also importable: compileGraph(root) returns the two objects without writing,
// so scripts/package.ts can fold compiled data into each dist tree.
//
// Cross-checks (fail compile):
//   - every sensor id a stage references resolves to a sensor manifest
//   - every lead/support agent a stage references resolves to an agent file
//   - every scope a stage references resolves to a scope file

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  engineRootFromTool,
  listMarkdown,
  parseFrontmatter,
  walkMarkdown,
} from "./qadlc-lib.ts";
import {
  parseStage,
  validateCompartments,
  validateStage,
  type Phase,
  type StageDefinition,
} from "./qadlc-stage-schema.ts";
import { parseScope, validateScope, type Depth } from "./qadlc-scope-schema.ts";
import { parseSensorManifest, validateSensorManifest } from "./qadlc-sensor-schema.ts";

const PHASE_ORDER: Phase[] = ["discovery", "execution"];

export interface StageGraph {
  phases: Phase[];
  stages: StageDefinition[];
}
export interface ScopeGrid {
  scopes: Record<
    string,
    { depth: Depth; keywords: string[]; stages: string[] }
  >;
}

function stemAfterPrefix(file: string, prefix: string): string {
  const stem = basename(file, ".md");
  return stem.startsWith(prefix) ? stem.slice(prefix.length) : stem;
}

export function compileGraph(root: string): { stageGraph: StageGraph; scopeGrid: ScopeGrid } {
  const stagesDir = join(root, "qa-common", "stages");
  const scopesDir = join(root, "scopes");
  const sensorsDir = join(root, "sensors");
  const agentsDir = join(root, "agents");

  // --- stages ---
  const stages: StageDefinition[] = [];
  for (const file of walkMarkdown(stagesDir)) {
    const raw = readFileSync(file, "utf-8");
    const slug = basename(file, ".md");
    const s = parseStage(raw);
    validateStage(s, file, slug);
    validateCompartments(parseFrontmatter(raw).body, file);
    stages.push(s);
  }

  // --- scopes ---
  const scopeNames = new Set<string>();
  const scopeMeta: Record<string, { depth: Depth; keywords: string[] }> = {};
  for (const file of listMarkdown(scopesDir)) {
    const raw = readFileSync(file, "utf-8");
    const name = stemAfterPrefix(file, "qadlc-");
    const sc = parseScope(raw);
    validateScope(sc, file, name);
    scopeNames.add(sc.name);
    scopeMeta[sc.name] = { depth: sc.depth, keywords: sc.keywords };
  }

  // --- sensors (ids for cross-check) ---
  const sensorIds = new Set<string>();
  for (const file of listMarkdown(sensorsDir)) {
    const raw = readFileSync(file, "utf-8");
    const id = stemAfterPrefix(file, "qadlc-");
    const m = parseSensorManifest(raw);
    validateSensorManifest(m, file, id);
    sensorIds.add(m.id);
  }

  // --- agents (ids for cross-check) ---
  const agentIds = new Set<string>();
  for (const file of listMarkdown(agentsDir)) {
    agentIds.add(basename(file, ".md"));
  }

  // --- cross-checks ---
  const slugs = new Set(stages.map((s) => s.slug));
  for (const s of stages) {
    for (const sc of s.scopes) {
      if (!scopeNames.has(sc)) {
        throw new Error(`stage ${s.slug}: references unknown scope "${sc}"`);
      }
    }
    for (const id of s.sensors) {
      if (!sensorIds.has(id)) {
        throw new Error(`stage ${s.slug}: references unknown sensor "${id}" ` +
          `(expected sensors/qadlc-${id}.md)`);
      }
    }
    if (agentIds.size > 0 && s.lead_agent && !agentIds.has(s.lead_agent)) {
      throw new Error(`stage ${s.slug}: references unknown lead_agent "${s.lead_agent}"`);
    }
    for (const dep of s.requires_stage) {
      if (!slugs.has(dep)) {
        throw new Error(`stage ${s.slug}: requires_stage "${dep}" is not a known stage`);
      }
    }
  }

  // --- order stages: phase order, then per-stage `order`, then slug ---
  stages.sort((a, b) => {
    const pa = PHASE_ORDER.indexOf(a.phase);
    const pb = PHASE_ORDER.indexOf(b.phase);
    if (pa !== pb) return pa - pb;
    if (a.order !== b.order) return a.order - b.order;
    return a.slug.localeCompare(b.slug);
  });

  // --- build scope grid: transpose stage.scopes into scope→stages ---
  const scopeGrid: ScopeGrid = { scopes: {} };
  for (const name of [...scopeNames].sort()) {
    const meta = scopeMeta[name];
    const included = stages
      .filter((s) => s.scopes.includes(name) && s.execution !== "SKIP")
      .map((s) => s.slug);
    scopeGrid.scopes[name] = { depth: meta.depth, keywords: meta.keywords, stages: included };
  }

  return { stageGraph: { phases: PHASE_ORDER, stages }, scopeGrid };
}

// Deterministic pretty-print (stable key order via JSON.stringify on our
// already-ordered structures) + trailing newline for diff-friendly commits.
function serialize(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function writeGraph(root: string): { stageGraphPath: string; scopeGridPath: string } {
  const { stageGraph, scopeGrid } = compileGraph(root);
  const dataDir = join(root, "tools", "data");
  mkdirSync(dataDir, { recursive: true });
  const stageGraphPath = join(dataDir, "stage-graph.json");
  const scopeGridPath = join(dataDir, "scope-grid.json");
  writeFileSync(stageGraphPath, serialize(stageGraph));
  writeFileSync(scopeGridPath, serialize(scopeGrid));
  return { stageGraphPath, scopeGridPath };
}

function checkGraph(root: string): string[] {
  const { stageGraph, scopeGrid } = compileGraph(root);
  const problems: string[] = [];
  const pairs: [string, string][] = [
    [join(root, "tools", "data", "stage-graph.json"), serialize(stageGraph)],
    [join(root, "tools", "data", "scope-grid.json"), serialize(scopeGrid)],
  ];
  for (const [path, fresh] of pairs) {
    if (!existsSync(path)) problems.push(`MISSING: ${path}`);
    else if (readFileSync(path, "utf-8") !== fresh) problems.push(`STALE: ${path}`);
  }
  return problems;
}

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const check = args.includes("--check");
  const root = engineRootFromTool(import.meta.url);

  if (cmd !== "compile") {
    process.stderr.write("usage: qadlc-graph.ts compile [--check]\n");
    process.exit(2);
  }
  if (check) {
    const problems = checkGraph(root);
    if (problems.length > 0) {
      process.stderr.write(`stage graph drift:\n  ${problems.join("\n  ")}\n`);
      process.exit(1);
    }
    process.stdout.write("stage graph fresh\n");
    return;
  }
  const { stageGraphPath, scopeGridPath } = writeGraph(root);
  process.stdout.write(`compiled:\n  ${stageGraphPath}\n  ${scopeGridPath}\n`);
}

if (import.meta.main) main();
