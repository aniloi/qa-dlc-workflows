// tests/integration.test.ts — end-to-end coverage against a temp copy of the
// generated dist/kiro tree: the engine's next/report loop and plan gate, the
// sensors, the stop-hook enforcement, and the packaging drift guard.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const DIST_KIRO = join(REPO, "dist", "kiro", ".kiro");

let proj = "";
const H = () => join(proj, ".kiro");
const tool = (t: string) => join(H(), "tools", t);
const hook = (h: string) => join(H(), "hooks", h);

function run(bin: string, args: string[], input?: string) {
  const r = spawnSync("bun", [bin, ...args], { encoding: "utf-8", cwd: proj, input });
  return { out: r.stdout ?? "", err: r.stderr ?? "", code: r.status ?? 0 };
}

beforeAll(() => {
  proj = mkdtempSync(join(tmpdir(), "qadlc-it-"));
  cpSync(DIST_KIRO, H(), { recursive: true });
  mkdirSync(join(proj, "features"), { recursive: true });
});
afterAll(() => rmSync(proj, { recursive: true, force: true }));

describe("engine next/report + plan gate", () => {
  test("detect-scope when no session", () => {
    const { out } = run(tool("qadlc-orchestrate.ts"), ["next"]);
    expect(out).toContain('"type": "detect-scope"');
  });

  test("init + first move carries persona and workspace-detection", () => {
    run(tool("qadlc-orchestrate.ts"), ["report", "--scope", "smoke"]);
    const { out } = run(tool("qadlc-orchestrate.ts"), ["next"]);
    expect(out).toContain('"type": "run-stage"');
    expect(out).toContain("workspace-detection");
    expect(out).toContain("conductor_persona");
  });

  test("execution is gated until the plan is approved", () => {
    for (const s of ["workspace-detection", "story-analysis", "convention-extraction", "step-inventory"]) {
      run(tool("qadlc-orchestrate.ts"), ["report", "--stage", s]);
    }
    // completing the gate WITHOUT approval keeps it closed
    run(tool("qadlc-orchestrate.ts"), ["report", "--stage", "gherkin-plan"]);
    const gated = run(tool("qadlc-orchestrate.ts"), ["next"]);
    expect(gated.out).toContain('"type": "gate"');

    // approve → advances into execution
    run(tool("qadlc-orchestrate.ts"), ["report", "--stage", "gherkin-plan", "--approved", "--feature-count", "2"]);
    const after = run(tool("qadlc-orchestrate.ts"), ["next"]);
    expect(after.out).toContain("feature-generation");
    expect(after.out).toContain('"foreach": true');
  });

  test("foreach completes and workflow reaches done", () => {
    run(tool("qadlc-orchestrate.ts"), ["report", "--stage", "feature-generation", "--file", "features/a.feature"]);
    run(tool("qadlc-orchestrate.ts"), ["report", "--stage", "feature-generation", "--file", "features/b.feature"]);
    run(tool("qadlc-orchestrate.ts"), ["next"]); // cross-feature-check
    run(tool("qadlc-orchestrate.ts"), ["report", "--stage", "cross-feature-check"]);
    const done = run(tool("qadlc-orchestrate.ts"), ["next"]);
    expect(done.out).toContain('"type": "done"');
  });
});

describe("sensors", () => {
  test("gherkin-lint flags a leading-conjunction scenario", () => {
    writeFileSync(join(proj, "features", "bad.feature"), "Feature: B\n\n  Scenario: x\n    And nope\n    Then y\n");
    const { out } = run(tool("qadlc-sensor-gherkin-lint.ts"), ["--stage", "feature-generation", "--file-path", "features/bad.feature"]);
    const res = JSON.parse(out);
    expect(res.pass).toBe(false);
    expect(res.findings.some((f: { rule: string }) => f.rule === "leading-conjunction")).toBe(true);
  });

  test("gherkin-lint flags a non-kebab-case filename", () => {
    writeFileSync(join(proj, "features", "loginSmoke.feature"), "@smoke\nFeature: L\n\n  @auth\n  Scenario: s\n    Given a\n    Then b\n");
    const { out } = run(tool("qadlc-sensor-gherkin-lint.ts"), ["--stage", "feature-generation", "--file-path", "features/loginSmoke.feature"]);
    expect(JSON.parse(out).findings.some((f: { rule: string }) => f.rule === "naming-convention")).toBe(true);
  });

  test("tag-policy flags a scenario with no tags", () => {
    const { out } = run(tool("qadlc-sensor-tag-policy.ts"), ["--stage", "feature-generation", "--file-path", "features/bad.feature"]);
    expect(JSON.parse(out).pass).toBe(false);
  });

  test("dispatcher runs bound sensors and reports statuses", () => {
    const { out } = run(tool("qadlc-sensor.ts"), ["--stage", "feature-generation", "--file-path", "features/bad.feature"]);
    const res = JSON.parse(out);
    const ids = res.ran.map((r: { id: string }) => r.id);
    expect(ids).toContain("gherkin-lint");
    expect(ids).toContain("tag-policy");
  });

  test("plan-sections flags a plan missing the gap report, passes a complete one", () => {
    writeFileSync(join(proj, "gherkin_plan.md"), "# Plan\n\n## Story-to-Scenario Mapping\nx\n\n## Implementation Checklist\n- [ ] a-b.feature\n\n## Open Questions\nnone\n");
    const bad = JSON.parse(run(tool("qadlc-sensor-plan-sections.ts"), ["--stage", "gherkin-plan", "--file-path", "gherkin_plan.md"]).out);
    expect(bad.findings.some((f: { rule: string }) => f.rule === "missing-plan-section")).toBe(true);
    writeFileSync(join(proj, "gherkin_plan.md"), "# Plan\n\n## Story-to-Scenario Mapping\nx\n\n## Stories Without Requirements or Insufficient Acceptance Criteria\nAll stories had sufficient requirements.\n\n## Implementation Checklist\n- [ ] a-b.feature\n\n## Open Questions\nnone\n");
    const good = JSON.parse(run(tool("qadlc-sensor-plan-sections.ts"), ["--stage", "gherkin-plan", "--file-path", "gherkin_plan.md"]).out);
    expect(good.pass).toBe(true);
  });
});

describe("stop-hook enforcement", () => {
  test("blocks when a feature precedes plan approval", () => {
    const p2 = mkdtempSync(join(tmpdir(), "qadlc-stop-"));
    cpSync(DIST_KIRO, join(p2, ".kiro"), { recursive: true });
    mkdirSync(join(p2, "features"), { recursive: true });
    const orch = join(p2, ".kiro", "tools", "qadlc-orchestrate.ts");
    const stop = join(p2, ".kiro", "hooks", "qadlc-stop.ts");
    spawnSync("bun", [orch, "report", "--scope", "smoke"], { cwd: p2 });
    // log a feature artifact before approval via the audit-logger
    writeFileSync(join(p2, "features", "x.feature"), "Feature: X\n  @smoke\n  Scenario: y\n    Given a\n    Then b\n");
    spawnSync("bun", [join(p2, ".kiro", "hooks", "qadlc-audit-logger.ts")], {
      cwd: p2,
      input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(p2, "features", "x.feature") } }),
    });
    const r = spawnSync("bun", [stop], { cwd: p2, input: "{}", encoding: "utf-8" });
    expect(r.stdout).toContain('"decision":"block"');
    rmSync(p2, { recursive: true, force: true });
  });
});

describe("tag-policy Jira mode", () => {
  function scaffold(storySource: string): string {
    const p = mkdtempSync(join(tmpdir(), "qadlc-jira-"));
    cpSync(DIST_KIRO, join(p, ".kiro"), { recursive: true });
    mkdirSync(join(p, "features"), { recursive: true });
    spawnSync("bun", [join(p, ".kiro", "tools", "qadlc-orchestrate.ts"), "report", "--scope", "smoke", "--story-source", storySource], { cwd: p });
    return p;
  }
  function tagPolicy(p: string, rel: string) {
    const r = spawnSync("bun", [join(p, ".kiro", "tools", "qadlc-sensor-tag-policy.ts"), "--stage", "feature-generation", "--file-path", rel], { cwd: p, encoding: "utf-8" });
    return JSON.parse(r.stdout ?? "{}");
  }
  const noJira = "@smoke\nFeature: X\n  @account\n  Scenario: y\n    Given a\n    Then b\n";
  const withJira = "@smoke\nFeature: X\n  @account @allure.label.jira=CLM-1\n  Scenario: y\n    Given a\n    Then b\n";

  test("Jira mode flags a scenario missing @allure.label.jira", () => {
    const p = scaffold("jira");
    writeFileSync(join(p, "features", "x.feature"), noJira);
    const res = tagPolicy(p, "features/x.feature");
    expect(res.findings.some((f: { rule: string }) => f.rule === "missing-jira-tag")).toBe(true);
    writeFileSync(join(p, "features", "x.feature"), withJira);
    const ok = tagPolicy(p, "features/x.feature");
    expect(ok.findings.some((f: { rule: string }) => f.rule === "missing-jira-tag")).toBe(false);
    rmSync(p, { recursive: true, force: true });
  });

  test("folder mode does NOT require the Jira tag", () => {
    const p = scaffold("folder");
    writeFileSync(join(p, "features", "x.feature"), noJira);
    const res = tagPolicy(p, "features/x.feature");
    expect(res.findings.some((f: { rule: string }) => f.rule === "missing-jira-tag")).toBe(false);
    rmSync(p, { recursive: true, force: true });
  });
});

describe("packaging drift guard", () => {
  test("package --check reports no drift", () => {
    const r = spawnSync("bun", [join(REPO, "scripts", "package.ts"), "--check"], { encoding: "utf-8", cwd: REPO });
    expect(r.status).toBe(0);
  });
});
