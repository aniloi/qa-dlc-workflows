#!/usr/bin/env bun
// qa-dlc-sensor.ts — the sensor DISPATCHER. Given a stage and a written file, it
// resolves the stage's bound sensors from the compiled graph, filters them by
// each manifest's `matches` glob, runs each sensor script, writes advisory detail
// files, and appends audit rows. Invoked by the sensor-fire hook (Phase 5) or by
// hand:
//
//   bun qa-dlc-sensor.ts --stage <slug> --file-path <path>
//
// Advisory by contract: a failing sensor never blocks the write; it records a
// SENSOR_FAILED audit row + a detail file the conductor reads at the next gate.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  harnessData,
  harnessDirFromTool,
  isoTimestamp,
  loadJson,
  projectRootFromTool,
  sensorsDir,
} from "./qa-dlc-lib.ts";
import { parseSensorManifest } from "./qa-dlc-sensor-schema.ts";
import { appendAuditEntry } from "./qa-dlc-audit.ts";
import type { StageGraph } from "./qa-dlc-graph.ts";

const HARNESS = harnessDirFromTool(import.meta.url);
const PROJECT_ROOT = projectRootFromTool(import.meta.url);

function globToRegExp(glob: string): RegExp {
  // Single left-to-right scan so emitted regex fragments are never re-processed
  // by a later replace (the cascade bug). Supports **/, **, *, ?.
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += ".";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

interface SensorResult {
  id: string;
  status: "pass" | "fail" | "unavailable" | "error";
  findings_count: number;
  raw: string;
}

function runSensor(id: string, stage: string, filePath: string): SensorResult {
  const tool = join(HARNESS, "tools", `qa-dlc-sensor-${id}.ts`);
  const r = spawnSync("bun", [tool, "--stage", stage, "--file-path", filePath], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  if (r.status === 127) return { id, status: "unavailable", findings_count: 0, raw: r.stderr ?? "" };
  if (r.status !== 0) return { id, status: "error", findings_count: 0, raw: r.stderr ?? "" };
  try {
    const out = JSON.parse(r.stdout ?? "{}") as { pass: boolean; findings_count: number };
    return { id, status: out.pass ? "pass" : "fail", findings_count: out.findings_count ?? 0, raw: r.stdout ?? "" };
  } catch {
    return { id, status: "error", findings_count: 0, raw: r.stdout ?? "" };
  }
}

function writeDetail(stage: string, res: SensorResult, filePath: string): void {
  const dir = sensorsDir(PROJECT_ROOT, stage);
  mkdirSync(dir, { recursive: true });
  const ts = isoTimestamp().replace(/[:]/g, "");
  const path = join(dir, `${res.id}-${ts}.md`);
  const body = [
    `# Sensor: ${res.id}`,
    `- Stage: ${stage}`,
    `- File: ${filePath}`,
    `- Status: ${res.status}`,
    `- Findings: ${res.findings_count}`,
    `- Timestamp: ${isoTimestamp()}`,
    "",
    "## Raw output",
    "```json",
    res.raw.trim(),
    "```",
    "",
  ].join("\n");
  writeFileSync(path, body, "utf-8");
}

function main(): void {
  const args = process.argv.slice(2);
  const flag = (n: string): string => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] ?? "" : "";
  };
  const stage = flag("--stage");
  const filePath = flag("--file-path");
  if (!stage || !filePath) {
    process.stderr.write("usage: qa-dlc-sensor.ts --stage <slug> --file-path <path>\n");
    process.exit(2);
  }

  const graph = loadJson<StageGraph>(join(HARNESS, "tools", "data", "stage-graph.json"));
  const stageDef = graph.stages.find((s) => s.slug === stage);
  if (!stageDef || stageDef.sensors.length === 0) {
    process.stdout.write(JSON.stringify({ stage, ran: [], skipped: [] }) + "\n");
    return;
  }

  const ran: SensorResult[] = [];
  const skipped: string[] = [];
  const norm = filePath.replace(/\\/g, "/");
  for (const id of stageDef.sensors) {
    // matches filter from the manifest
    let matches = "";
    try {
      const raw = readFileSync(join(HARNESS, "sensors", `qa-dlc-${id}.md`), "utf-8");
      matches = parseSensorManifest(raw).matches ?? "";
    } catch {
      /* manifest missing — run anyway */
    }
    if (matches && !globToRegExp(matches).test(norm)) {
      skipped.push(id);
      continue;
    }
    const res = runSensor(id, stage, filePath);
    ran.push(res);
    if (res.status === "fail" || res.status === "error") writeDetail(stage, res, filePath);
    const event = res.status === "fail" ? "SENSOR_FAILED" : "SENSOR_FIRED";
    appendAuditEntry(event, {
      Sensor: id,
      Stage: stage,
      File: norm,
      Status: res.status,
      Findings: String(res.findings_count),
    }, PROJECT_ROOT);
  }

  process.stdout.write(JSON.stringify({
    stage,
    ran: ran.map((r) => ({ id: r.id, status: r.status, findings_count: r.findings_count })),
    skipped,
  }, null, 2) + "\n");
}

if (import.meta.main) main();
