#!/usr/bin/env bun
// qa-dlc-sensor-gherkin-lint.ts — structural lint of one .feature file.
//
//   bun qa-dlc-sensor-gherkin-lint.ts --stage <slug> --file-path <path>
//
// Prints {pass, findings[], findings_count}. Exit 0 (pass/fail carried in JSON),
// 1 on tool error, 127 if the file is not a .feature (tool-unavailable → the
// dispatcher treats it as an advisory pass).

import { existsSync, readFileSync } from "node:fs";
import { parseArgs, printJson, type Finding } from "./qa-dlc-sensor-lib.ts";
import { parseFeature, realScenarios } from "./qa-dlc-gherkin.ts";

function main(): void {
  const { filePath } = parseArgs(process.argv.slice(2), "qa-dlc-sensor-gherkin-lint");
  if (!filePath.endsWith(".feature")) process.exit(127);
  if (!existsSync(filePath)) {
    process.stderr.write(`file not found: ${filePath}\n`);
    process.exit(1);
  }
  const raw = readFileSync(filePath, "utf-8");
  const f = parseFeature(raw);
  const findings: Finding[] = [];

  if (f.name === "") findings.push({ line: 1, rule: "feature-required", message: "no Feature: declaration" });

  const scenarios = realScenarios(f);
  if (scenarios.length === 0) {
    findings.push({ line: 1, rule: "scenario-required", message: "no scenarios in feature" });
  }

  const seenNames = new Set<string>();
  for (const s of scenarios) {
    if (s.name === "") findings.push({ line: s.line, rule: "scenario-name", message: "scenario has no name" });
    if (seenNames.has(s.name) && s.name !== "") {
      findings.push({ line: s.line, rule: "duplicate-name-in-file", message: `duplicate scenario name "${s.name}"` });
    }
    seenNames.add(s.name);

    if (s.steps.length === 0) {
      findings.push({ line: s.line, rule: "empty-scenario", message: `"${s.name}" has no steps` });
    } else {
      const first = s.steps[0].keyword;
      if (first === "And" || first === "But") {
        findings.push({ line: s.steps[0].line, rule: "leading-conjunction", message: `"${s.name}" starts with ${first}; a scenario must open with Given/When/Then` });
      }
    }

    if (s.type === "Scenario Outline") {
      if (s.examplesRows === 0) {
        findings.push({ line: s.line, rule: "outline-examples", message: `Scenario Outline "${s.name}" has no Examples data rows` });
      }
      const usesPlaceholder = s.steps.some((st) => /<[^>]+>/.test(st.text));
      if (!usesPlaceholder) {
        findings.push({ line: s.line, rule: "outline-placeholder", message: `Scenario Outline "${s.name}" has no <placeholder> in any step` });
      }
    }
  }

  printJson({ pass: findings.length === 0, findings, findings_count: findings.length });
}

if (import.meta.main) main();
