#!/usr/bin/env bun
// qadlc-sensor-plan-sections.ts — verifies gherkin_plan.md carries the required
// H2 sections, including the "Stories Without Requirements or Insufficient
// Acceptance Criteria" gap report. Turns the requirements-gap-reporting
// convention into a deterministic gate on the plan artifact.
//
//   bun qadlc-sensor-plan-sections.ts --stage <slug> --file-path <path>
//
// Fires (via the sensor-fire hook) on writes to gherkin_plan.md. Advisory.

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs, printJson, type Finding } from "./qadlc-sensor-lib.ts";

// Required H2 headings (matched case-insensitively, prefix-tolerant so wording
// like "Stories Without Requirements or Insufficient Acceptance Criteria" is
// accepted from its stable prefix).
const REQUIRED: { label: string; test: (headings: string[]) => boolean }[] = [
  { label: "Story-to-Scenario Mapping", test: (h) => h.some((x) => x.includes("story-to-scenario")) },
  { label: "Implementation Checklist", test: (h) => h.some((x) => x.includes("implementation checklist")) },
  { label: "Stories Without Requirements (gap report)", test: (h) => h.some((x) => x.includes("without requirements") || x.includes("insufficient")) },
  { label: "Open Questions", test: (h) => h.some((x) => x.includes("open questions")) },
];

function main(): void {
  const { filePath } = parseArgs(process.argv.slice(2), "qadlc-sensor-plan-sections");
  if (basename(filePath) !== "gherkin_plan.md") process.exit(127);
  if (!existsSync(filePath)) {
    process.stderr.write(`file not found: ${filePath}\n`);
    process.exit(1);
  }
  const raw = readFileSync(filePath, "utf-8");
  const headings = raw
    .split(/\r?\n/)
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.replace(/^##\s+/, "").trim().toLowerCase());

  const findings: Finding[] = [];
  for (const req of REQUIRED) {
    if (!req.test(headings)) {
      findings.push({ line: 1, rule: "missing-plan-section", message: `gherkin_plan.md is missing the "${req.label}" section` });
    }
  }
  printJson({ pass: findings.length === 0, findings, findings_count: findings.length });
}

if (import.meta.main) main();
