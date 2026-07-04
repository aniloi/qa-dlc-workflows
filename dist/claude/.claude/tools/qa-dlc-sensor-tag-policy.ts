#!/usr/bin/env bun
// qa-dlc-sensor-tag-policy.ts — every shipping scenario must carry ≥1 scope tag
// AND ≥1 component tag (effective tags = scenario tags ∪ feature tags).
//
//   bun qa-dlc-sensor-tag-policy.ts --stage <slug> --file-path <path>

import { existsSync, readFileSync } from "node:fs";
import { parseArgs, printJson, type Finding } from "./qa-dlc-sensor-lib.ts";
import { parseFeature, realScenarios } from "./qa-dlc-gherkin.ts";

const SCOPE_TAGS = new Set(["@smoke", "@regression", "@e2e", "@exploratory"]);

function main(): void {
  const { filePath } = parseArgs(process.argv.slice(2), "qa-dlc-sensor-tag-policy");
  if (!filePath.endsWith(".feature")) process.exit(127);
  if (!existsSync(filePath)) {
    process.stderr.write(`file not found: ${filePath}\n`);
    process.exit(1);
  }
  const f = parseFeature(readFileSync(filePath, "utf-8"));
  const findings: Finding[] = [];

  for (const s of realScenarios(f)) {
    const tags = new Set<string>([...f.tags, ...s.tags]);
    const scopeTags = [...tags].filter((t) => SCOPE_TAGS.has(t));
    const componentTags = [...tags].filter((t) => !SCOPE_TAGS.has(t));
    if (scopeTags.length === 0) {
      findings.push({ line: s.line, rule: "missing-scope-tag", message: `"${s.name}" has no scope tag (${[...SCOPE_TAGS].join(", ")})` });
    }
    if (componentTags.length === 0) {
      findings.push({ line: s.line, rule: "missing-component-tag", message: `"${s.name}" has no component tag` });
    }
  }

  printJson({ pass: findings.length === 0, findings, findings_count: findings.length });
}

if (import.meta.main) main();
