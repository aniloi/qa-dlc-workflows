#!/usr/bin/env bun
// qadlc-sensor-duplicate-scenario-name.ts — detect scenario names that collide
// across the .feature files in the written file's directory (recursively).
// Fires on any one write but reasons across the sibling set — the cross-feature
// consistency backbone.
//
//   bun qadlc-sensor-duplicate-scenario-name.ts --stage <slug> --file-path <path>

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs, printJson, type Finding } from "./qadlc-sensor-lib.ts";
import { parseFeature, realScenarios } from "./qadlc-gherkin.ts";

function walkFeatures(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFeatures(full));
    else if (entry.endsWith(".feature")) out.push(full);
  }
  return out;
}

function main(): void {
  const { filePath } = parseArgs(process.argv.slice(2), "qadlc-sensor-duplicate-scenario-name");
  if (!filePath.endsWith(".feature")) process.exit(127);
  if (!existsSync(filePath)) {
    process.stderr.write(`file not found: ${filePath}\n`);
    process.exit(1);
  }
  const dir = dirname(filePath);
  const seen = new Map<string, string[]>(); // scenario name -> files containing it

  for (const feat of walkFeatures(dir)) {
    const f = parseFeature(readFileSync(feat, "utf-8"));
    for (const s of realScenarios(f)) {
      if (s.name === "") continue;
      const files = seen.get(s.name) ?? [];
      if (!files.includes(feat)) files.push(feat);
      seen.set(s.name, files);
    }
  }

  const findings: Finding[] = [];
  for (const [name, files] of seen) {
    if (files.length > 1) {
      findings.push({ line: 0, rule: "duplicate-scenario-name", message: `"${name}" appears in ${files.length} files: ${files.map((p) => p.split("/").pop()).join(", ")}` });
    }
  }

  printJson({ pass: findings.length === 0, findings, findings_count: findings.length });
}

if (import.meta.main) main();
