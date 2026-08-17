// tests/unit.test.ts — schema parsing/validation, the Gherkin parser, and graph
// compile determinism + cross-checks. Pure-function unit coverage (no spawning).

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseStage, validateStage, validateCompartments } from "../core/tools/qadlc-stage-schema.ts";
import { parseScope, validateScope } from "../core/tools/qadlc-scope-schema.ts";
import { parseSensorManifest, validateSensorManifest } from "../core/tools/qadlc-sensor-schema.ts";
import { expandOutlineStep, parseFeature, realScenarios } from "../core/tools/qadlc-gherkin.ts";
import { compilePattern, stepIsKnown } from "../core/tools/qadlc-sensor-step-existence.ts";
import {
  expandCucumberVariants,
  extractExpressions,
  normalizeExpression,
  regexToExpressions,
} from "../core/tools/qadlc-build-step-catalog.ts";
import { compileGraph } from "../core/tools/qadlc-graph.ts";
import { scalarField, listField } from "../core/tools/qadlc-lib.ts";
import { parseNextFlags } from "../core/tools/qadlc-orchestrate.ts";

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

  test("captures Examples headers and rows for outline substitution", () => {
    const f = parseFeature(`Feature: F

  Scenario Outline: many
    Given I deposit <amount> into row <row>
  Examples:
    | amount | row |
    | 100.50 | 2   |
    | 250    | 3   |
`);
    const s = realScenarios(f)[0];
    expect(s.examples.length).toBe(1);
    expect(s.examples[0].headers).toEqual(["amount", "row"]);
    expect(s.examples[0].rows).toEqual([["100.50", "2"], ["250", "3"]]);
    expect(expandOutlineStep(s.steps[0].text, s.examples).sort()).toEqual([
      "I deposit 100.50 into row 2",
      "I deposit 250 into row 3",
    ]);
  });

  test("expandOutlineStep leaves a step with no placeholder (or no table) alone", () => {
    expect(expandOutlineStep("I log in", [])).toEqual(["I log in"]);
    expect(expandOutlineStep("I log in as <role>", [])).toEqual(["I log in as <role>"]);
    // a placeholder with no matching column stays put, for the relaxed fallback
    expect(expandOutlineStep("I log in as <role>", [{ headers: ["other"], rows: [["x"]] }])).toEqual([
      "I log in as <role>",
    ]);
  });
});

describe("step-existence matching", () => {
  const catalog = [
    "I am logged in",
    "I have {int} items",
    "I deposit {double} {string} into my account",
    "the looked-up transaction type id should be {long}",
    "I select the {account} profile", // project-defined parameter type
    "I retrieve all withdrawals with query parameter(s):",
  ];
  const patterns = catalog.map(compilePattern);
  const known = (text: string) => stepIsKnown(text, patterns);

  test("matches literal and Cucumber-placeholder steps", () => {
    expect(known("I am logged in")).toBe(true);
    expect(known("I have 3 items")).toBe(true);
    expect(known("I have -3 items")).toBe(true);
    expect(known("I have three items")).toBe(false);
    expect(known("I am logged out")).toBe(false);
  });

  test("knows the numeric built-ins beyond {int}/{float}", () => {
    expect(known('I deposit 100.50 "USD" into my account')).toBe(true);
    expect(known("the looked-up transaction type id should be 4201")).toBe(true);
  });

  test("a project-defined parameter type is not evidence of an invented step", () => {
    expect(known("I select the retirement profile")).toBe(true);
  });

  test("literal parentheses in an entry stay literal", () => {
    expect(known("I retrieve all withdrawals with query parameter(s):")).toBe(true);
    expect(known("I retrieve all withdrawals with query parameters:")).toBe(false);
  });

  test("an outline placeholder in a typed slot matches (relaxed fallback)", () => {
    // The regression: <count> in an {int} slot used to be flagged unknown-step.
    expect(known("I have <count> items")).toBe(true);
    expect(known('I deposit <amount> "USD" into my account')).toBe(true);
    expect(known("I have <count> widgets")).toBe(false); // still catches a real miss
  });

  test("substituted outline rows match the concrete definition", () => {
    const examples = [{ headers: ["amount"], rows: [["100.50"]] }];
    const forms = expandOutlineStep('I deposit <amount> "USD" into my account', examples);
    expect(forms.every(known)).toBe(true);
  });
});

describe("step-catalog builder", () => {
  test("extracts JVM annotations, including value = form", () => {
    const src = `
      @Given("I am logged in")
      @When(value = "I have {int} items")
      @Then("^I see \\\\d+ rows$")
      public void x() {}
    `;
    const raws = extractExpressions(src, ".java");
    expect(raws.map((r) => r.expr)).toEqual([
      "I am logged in",
      "I have {int} items",
      "^I see \\d+ rows$",
    ]);
  });

  test("extracts JS quoted and regex-literal forms", () => {
    const src = `Given("I am logged in", fn);\nThen(/^I see (\\d+) rows$/, fn);\n`;
    const raws = extractExpressions(src, ".ts");
    expect(raws[0]).toEqual({ expr: "I am logged in", dialect: "cucumber" });
    expect(raws[1].dialect).toBe("regex");
  });

  test("normalizes legacy regex into the placeholder vocabulary", () => {
    expect(regexToExpressions("^I have (\\d+) items$")).toEqual(["I have {int} items"]);
    expect(regexToExpressions('^I select "([^"]*)" from the list$')).toEqual([
      "I select {string} from the list",
    ]);
    expect(regexToExpressions("^I wait (\\d+\\.\\d+) seconds$")).toEqual(["I wait {float} seconds"]);
    expect(regexToExpressions("^user verifies (\\w+) for symbol (.*)$")).toEqual([
      "user verifies {word} for symbol {}",
    ]);
    expect(regexToExpressions("^I go to the (?:blotter|grid)$").sort()).toEqual([
      "I go to the blotter",
      "I go to the grid",
    ]);
    expect(regexToExpressions("^I have (\\d+) items?$").sort()).toEqual([
      "I have {int} item",
      "I have {int} items",
    ]);
    // an unanchored legacy pattern is still recognised as a regex
    expect(normalizeExpression({ expr: 'I select "([^"]*)"', dialect: "cucumber" })).toEqual([
      "I select {string}",
    ]);
  });

  test("expands Cucumber optional text and alternation into concrete entries", () => {
    expect(expandCucumberVariants("I have {int} cucumber(s)").sort()).toEqual([
      "I have {int} cucumber",
      "I have {int} cucumbers",
    ]);
    expect(expandCucumberVariants("I have a cat/dog").sort()).toEqual([
      "I have a cat",
      "I have a dog",
    ]);
  });

  test("escaped parentheses and slashes stay literal", () => {
    // Java source: "…query parameter\\(s\\):" → a literal (s), NOT optional text
    expect(normalizeExpression({ expr: "with query parameter\\(s\\):", dialect: "cucumber" })).toEqual([
      "with query parameter(s):",
    ]);
    expect(normalizeExpression({ expr: "I POST to \\/orders", dialect: "cucumber" })).toEqual([
      "I POST to /orders",
    ]);
  });

  test("behave format types map onto Cucumber placeholders", () => {
    expect(normalizeExpression({ expr: "I have {count:d} items", dialect: "behave" })).toEqual([
      "I have {int} items",
    ]);
    expect(normalizeExpression({ expr: "I wait {secs:f} seconds", dialect: "behave" })).toEqual([
      "I wait {float} seconds",
    ]);
  });

  test("the generated entries compile back into matchers", () => {
    const steps = normalizeExpression({ expr: "^I have (\\d+) items?$", dialect: "cucumber" });
    const patterns = steps.map(compilePattern);
    expect(stepIsKnown("I have 4 items", patterns)).toBe(true);
    expect(stepIsKnown("I have 4 item", patterns)).toBe(true);
    expect(stepIsKnown("I have 4 boxes", patterns)).toBe(false);
  });
});

describe("next flag parsing", () => {
  test("parses boolean flags", () => {
    expect(parseNextFlags(["--version"])).toEqual({ version: true });
    expect(parseNextFlags(["--doctor"])).toEqual({ doctor: true });
    expect(parseNextFlags(["--resume"])).toEqual({ resume: true });
  });
  test("valued flags consume the next token", () => {
    expect(parseNextFlags(["--scope", "smoke"])).toEqual({ scope: "smoke" });
    expect(parseNextFlags(["--depth", "Standard"])).toEqual({ depth: "Standard" });
    expect(parseNextFlags(["--stage", "story-analysis"])).toEqual({ stage: "story-analysis" });
    expect(parseNextFlags(["--phase", "execution"])).toEqual({ phase: "execution" });
  });
  test("combines flags and ignores freeform / unknown tokens", () => {
    expect(parseNextFlags(["--scope", "smoke", "--depth", "Comprehensive"])).toEqual({
      scope: "smoke",
      depth: "Comprehensive",
    });
    expect(parseNextFlags(["write", "features", "for", "CLM-123"])).toEqual({});
    expect(parseNextFlags(["--stage", "x", "--phase", "y"])).toEqual({ stage: "x", phase: "y" });
  });
  test("a valued flag with no following token is dropped", () => {
    expect(parseNextFlags(["--scope"])).toEqual({});
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
