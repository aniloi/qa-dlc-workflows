// tests/unit.test.ts — schema parsing/validation, the Gherkin parser, and graph
// compile determinism + cross-checks. Pure-function unit coverage (no spawning).

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseStage, validateStage, validateCompartments } from "../core/tools/qa-dlc-stage-schema.ts";
import { parseScope, validateScope } from "../core/tools/qa-dlc-scope-schema.ts";
import { parseSensorManifest, validateSensorManifest } from "../core/tools/qa-dlc-sensor-schema.ts";
import { parseFeature, realScenarios } from "../core/tools/qa-dlc-gherkin.ts";
import { compileGraph } from "../core/tools/qa-dlc-graph.ts";
import { scalarField, listField } from "../core/tools/qa-dlc-lib.ts";

const CORE = join(import.meta.dir, "..", "core");

describe("frontmatter primitives", () => {
  const yaml = `slug: demo\nscopes:\n  - smoke\n  - regression\ninline: [a, b]`;
  test("scalarField reads scalars, ignores lists", () => {
    expect(scalarField(yaml, "slug")).toBe("demo");
    expect(scalarField(yaml, "inline")).toBe("");
  });
  test("listField reads block and inline lists", () => {
    expect(listField(yaml, "scopes")).toEqual(["smoke", "regression"]);
    expect(listField(yaml, "inline")).toEqual(["a", "b"]);
  });
});

describe("stage schema", () => {
  const raw = `---
slug: gherkin-plan
phase: discovery
execution: ALWAYS
lead_agent: gherkin-author-agent
mode: inline
gate: true
order: 5
produces:
  - gherkin-plan
scopes:
  - smoke
---
## Steps
x
## Sensors
y
## Learn
z`;
  test("parses gate + scopes + produces", () => {
    const s = parseStage(raw);
    expect(s.slug).toBe("gherkin-plan");
    expect(s.gate).toBe(true);
    expect(s.scopes).toContain("smoke");
    expect(() => validateStage(s, "f.md", "gherkin-plan")).not.toThrow();
  });
  test("rejects slug/filename mismatch", () => {
    const s = parseStage(raw);
    expect(() => validateStage(s, "f.md", "other")).toThrow();
  });
  test("requires the three compartments", () => {
    expect(() => validateCompartments("## Steps\n## Sensors", "f.md")).toThrow();
    expect(() => validateCompartments("## Steps\n## Sensors\n## Learn", "f.md")).not.toThrow();
  });
});

describe("scope + sensor schema", () => {
  test("scope name must match filename stem", () => {
    const s = parseScope(`---\nname: smoke\ndepth: Minimal\nkeywords:\n  - smoke\ndescription: d\n---`);
    expect(() => validateScope(s, "f.md", "smoke")).not.toThrow();
    expect(() => validateScope(s, "f.md", "nope")).toThrow();
  });
  test("sensor kind must be deterministic", () => {
    const bad = parseSensorManifest(`---\nid: x\nkind: fuzzy\ncommand: c\ndefault_severity: advisory\ndescription: d\n---`);
    expect(() => validateSensorManifest(bad, "f.md", "x")).toThrow();
  });
});

describe("gherkin parser", () => {
  test("parses feature, tags, scenarios, outline example rows", () => {
    const f = parseFeature(`@auth
Feature: Login

  @smoke
  Scenario: ok
    Given a
    When b
    Then c

  Scenario Outline: many
    Given <x>
  Examples:
    | x |
    | 1 |
    | 2 |
`);
    expect(f.name).toBe("Login");
    expect(f.tags).toEqual(["@auth"]);
    const rs = realScenarios(f);
    expect(rs.length).toBe(2);
    expect(rs[0].tags).toEqual(["@smoke"]);
    expect(rs[0].steps.length).toBe(3);
    expect(rs[1].examplesRows).toBe(2);
  });
});

describe("graph compile", () => {
  test("compiles core, transposes scope grid, is deterministic", () => {
    const a = compileGraph(CORE);
    const b = compileGraph(CORE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // determinism
    // 7 stages
    expect(a.stageGraph.stages.length).toBe(7);
    // bugfix-repro excludes convention-extraction + cross-feature-check
    const bug = a.scopeGrid.scopes["bugfix-repro"].stages;
    expect(bug).not.toContain("convention-extraction");
    expect(bug).not.toContain("cross-feature-check");
    expect(bug).toContain("gherkin-plan");
    // regression includes all 7
    expect(a.scopeGrid.scopes["regression"].stages.length).toBe(7);
    // sensors resolve (no throw already implies cross-check passed)
    const fg = a.stageGraph.stages.find((s) => s.slug === "feature-generation");
    expect(fg?.sensors).toContain("gherkin-lint");
  });
});
