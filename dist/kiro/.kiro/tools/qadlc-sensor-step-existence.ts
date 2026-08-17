#!/usr/bin/env bun
// qadlc-sensor-step-existence.ts — verify every step in a .feature resolves to
// a known step definition. The oracle is the step catalog the step-inventory
// stage generates with qadlc-build-step-catalog.ts into
// aidlc-docs/.qadlc/step-catalog.json. If the catalog is absent the sensor exits
// 127 (tool-unavailable → advisory pass) rather than false-flagging — honest
// determinism, mirroring a linter with no config.
//
//   bun qadlc-sensor-step-existence.ts --stage <slug> --file-path <path>
//
// Catalog format: { "steps": ["I am logged in", "I have {int} items", ...] }
// Entries carry Cucumber parameter placeholders ({int}/{string}/{word}/{double}/…)
// and are otherwise literal — the generator expands optional text and
// alternation into concrete entries, so nothing here has to guess. Each slot
// compiles to a permissive regex for matching.
//
// Scenario Outline steps are matched the way Cucumber matches them: the
// Examples rows are substituted first, so `<placeholder>` never reaches the
// pattern. A placeholder with no matching Examples column falls back to a
// relaxed match (the slot also accepts a bare `<name>`) so a malformed table
// costs one finding, not one per step.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs, printJson, type Finding } from "./qadlc-sensor-lib.ts";
import { expandOutlineStep, parseFeature } from "./qadlc-gherkin.ts";

// Walk up from the feature file to find aidlc-docs/.qadlc/step-catalog.json.
function findCatalog(fromFile: string): string | null {
  let dir = dirname(fromFile);
  for (let i = 0; i < 12; i++) {
    const cand = join(dir, "aidlc-docs", ".qadlc", "step-catalog.json");
    if (existsSync(cand)) return cand;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Cucumber's built-in parameter types. Unlisted names (project-defined types
// like {account}) compile permissively — a custom type is not evidence of an
// invented step.
const PARAM_PATTERNS: Record<string, string> = {
  "": ".+", // anonymous {}
  int: "[+-]?\\d+",
  byte: "[+-]?\\d+",
  short: "[+-]?\\d+",
  long: "[+-]?\\d+",
  biginteger: "[+-]?\\d+",
  float: "[+-]?\\d*[.,]?\\d+",
  double: "[+-]?\\d*[.,]?\\d+",
  bigdecimal: "[+-]?\\d*[.,]?\\d+",
  string: "\"[^\"]*\"|'[^']*'",
  word: "\\S+",
};
const PARAM_FALLBACK = ".+";
// An unresolved outline placeholder, accepted in any slot (relaxed fallback).
const OUTLINE_PLACEHOLDER = "<[^<>]*>";
const PARAM_SLOT = /\{([A-Za-z_][A-Za-z0-9_]*)?\}/g;

function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a catalog entry into a matcher. Only `{param}` slots are special;
 * every other character is literal. Each slot also accepts a bare `<name>` so an
 * outline step whose Examples column is missing degrades to one relaxed match
 * instead of a false `unknown-step`.
 */
export function compilePattern(entry: string): RegExp {
  let out = "";
  let last = 0;
  for (const m of entry.matchAll(PARAM_SLOT)) {
    const at = m.index ?? 0;
    out += escapeLiteral(entry.slice(last, at));
    const body = PARAM_PATTERNS[(m[1] ?? "").toLowerCase()] ?? PARAM_FALLBACK;
    out += `(?:${body}|${OUTLINE_PLACEHOLDER})`;
    last = at + m[0].length;
  }
  out += escapeLiteral(entry.slice(last));
  return new RegExp(`^${out}$`);
}

/** True when some catalog entry matches the step text. */
export function stepIsKnown(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

function main(): void {
  const { filePath } = parseArgs(process.argv.slice(2), "qadlc-sensor-step-existence");
  if (!filePath.endsWith(".feature")) process.exit(127);
  if (!existsSync(filePath)) {
    process.stderr.write(`file not found: ${filePath}\n`);
    process.exit(1);
  }
  const catalogPath = findCatalog(filePath);
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
  const resolved = new Map<string, boolean>(); // memo across scenarios
  // Background steps count: an invented step there breaks every scenario in the
  // file, so this walks all scenarios, not just the concrete ones.
  for (const s of f.scenarios) {
    for (const st of s.steps) {
      const forms = expandOutlineStep(st.text, s.examples);
      const known = forms.some((text) => {
        const memo = resolved.get(text);
        if (memo !== undefined) return memo;
        const hit = stepIsKnown(text, patterns);
        resolved.set(text, hit);
        return hit;
      });
      if (!known) {
        findings.push({ line: st.line, rule: "unknown-step", message: `no step definition matches: ${st.keyword} ${st.text}` });
      }
    }
  }

  printJson({ pass: findings.length === 0, findings, findings_count: findings.length });
}

if (import.meta.main) main();
