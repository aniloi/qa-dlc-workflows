#!/usr/bin/env bun
// qadlc-sensor-step-existence.ts — verify every step in a .feature resolves to
// a known step definition. The oracle is a step catalog the step-inventory stage
// writes to .qadlc/step-catalog.json. If the catalog is absent the
// sensor exits 127 (tool-unavailable → advisory pass) rather than false-flagging
// — honest determinism, mirroring a linter with no config.
//
//   bun qadlc-sensor-step-existence.ts --stage <slug> --file-path <path>
//
// Catalog format: { "steps": ["I am logged in", "I have {int} items", ...] }
// Entries may use Cucumber {int}/{string}/{word}/{float} placeholders; they are
// compiled to a permissive regex for matching.

import { existsSync, readFileSync } from "node:fs";
import { resolveProjectRoot, stepCatalogPath } from "./qadlc-lib.ts";
import { parseArgs, printJson, type Finding } from "./qadlc-sensor-lib.ts";
import { parseFeature, realScenarios } from "./qadlc-gherkin.ts";

// The catalog lives at .qadlc/step-catalog.json. Resolved through the shared
// project-root resolver rather than a second bespoke walk-up: this file used to
// hunt for aidlc-docs/.qadlc/ on its own, which was a third way of answering
// "where is the project" and would have drifted from the other two.
function findCatalog(): string | null {
  try {
    const cand = stepCatalogPath(resolveProjectRoot(import.meta.url));
    return existsSync(cand) ? cand : null;
  } catch {
    return null;
  }
}

function compilePattern(entry: string): RegExp {
  const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withParams = escaped
    .replace(/\\\{int\\\}/g, "-?\\d+")
    .replace(/\\\{float\\\}/g, "-?\\d+(?:\\.\\d+)?")
    .replace(/\\\{string\\\}/g, '"[^"]*"')
    .replace(/\\\{word\\\}/g, "\\S+")
    .replace(/<[^>]+>/g, ".+"); // outline placeholders
  return new RegExp(`^${withParams}$`);
}

function main(): void {
  const { filePath } = parseArgs(process.argv.slice(2), "qadlc-sensor-step-existence");
  if (!filePath.endsWith(".feature")) process.exit(127);
  if (!existsSync(filePath)) {
    process.stderr.write(`file not found: ${filePath}\n`);
    process.exit(1);
  }
  const catalogPath = findCatalog();
  if (!catalogPath) {
    process.stderr.write("no-step-catalog\n");
    process.exit(127); // advisory pass — no oracle available
  }
  let patterns: RegExp[];
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf-8")) as { steps?: string[] };
    patterns = (catalog.steps ?? []).map(compilePattern);
  } catch {
    process.stderr.write("step-catalog-unreadable\n");
    process.exit(127);
  }

  const f = parseFeature(readFileSync(filePath, "utf-8"));
  const findings: Finding[] = [];
  for (const s of realScenarios(f)) {
    for (const st of s.steps) {
      const known = patterns.some((re) => re.test(st.text));
      if (!known) {
        findings.push({ line: st.line, rule: "unknown-step", message: `no step definition matches: ${st.keyword} ${st.text}` });
      }
    }
  }

  printJson({ pass: findings.length === 0, findings, findings_count: findings.length });
}

if (import.meta.main) main();
