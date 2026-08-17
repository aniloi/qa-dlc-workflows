// tests/integration.test.ts — end-to-end coverage against a temp copy of the
// generated dist/kiro tree: the engine's next/report loop and plan gate, the
// sensors, the stop-hook enforcement, and the packaging drift guard.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("step catalog → step-existence", () => {
  const STEPS_JAVA = `package steps;
public class AccountSteps {
  @Given("I am logged in as {string}")
  public void a() {}
  @When("I deposit {double} {string} into my account")
  public void b() {}
  @Then("^I see (\\\\d+) item(s)?$")
  public void c() {}
}
`;
  // Uses the {double} slot, an outline placeholder, and the pluralised regex
  // step — all three false-flagged before the catalog generator existed.
  const GOOD = `@smoke
Feature: Deposits

  @account @smoke
  Scenario Outline: deposit lands
    Given I am logged in as "trader"
    When I deposit <amount> "USD" into my account
    Then I see 1 item
  Examples:
    | amount |
    | 100.50 |
`;
  const BAD = GOOD.replace("Then I see 1 item", "Then I teleport the account sideways");

  function scaffold(): string {
    const p = mkdtempSync(join(tmpdir(), "qadlc-catalog-"));
    cpSync(DIST_KIRO, join(p, ".kiro"), { recursive: true });
    mkdirSync(join(p, "features"), { recursive: true });
    mkdirSync(join(p, "src", "test", "java", "steps"), { recursive: true });
    writeFileSync(join(p, "src", "test", "java", "steps", "AccountSteps.java"), STEPS_JAVA);
    return p;
  }
  const inProj = (p: string, t: string, args: string[]) => {
    const r = spawnSync("bun", [join(p, ".kiro", "tools", t), ...args], { cwd: p, encoding: "utf-8" });
    return { out: r.stdout ?? "", err: r.stderr ?? "", code: r.status ?? 0 };
  };

  test("generated catalog turns the sensor on: conforming file passes, invented step flagged", () => {
    const p = scaffold();
    const build = inProj(p, "qadlc-build-step-catalog.ts", ["--steps-dir", "src/test/java/steps"]);
    expect(build.code).toBe(0);
    const summary = JSON.parse(build.out);
    expect(summary.definitions).toBe(3);
    expect(summary.steps).toBe(4); // item / items expanded from `item(s)?`
    expect(existsSync(join(p, "aidlc-docs", ".qadlc", "step-catalog.json"))).toBe(true);

    writeFileSync(join(p, "features", "deposits.feature"), GOOD);
    const ok = inProj(p, "qadlc-sensor-step-existence.ts", ["--stage", "feature-generation", "--file-path", "features/deposits.feature"]);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.out).pass).toBe(true);

    writeFileSync(join(p, "features", "deposits.feature"), BAD);
    const flagged = JSON.parse(
      inProj(p, "qadlc-sensor-step-existence.ts", ["--stage", "feature-generation", "--file-path", "features/deposits.feature"]).out,
    );
    expect(flagged.findings_count).toBe(1);
    expect(flagged.findings[0].rule).toBe("unknown-step");
    rmSync(p, { recursive: true, force: true });
  });

  test("without a catalog the sensor exits 127 (advisory pass, no false flags)", () => {
    const p = scaffold();
    writeFileSync(join(p, "features", "deposits.feature"), BAD);
    const r = inProj(p, "qadlc-sensor-step-existence.ts", ["--stage", "feature-generation", "--file-path", "features/deposits.feature"]);
    expect(r.code).toBe(127);
    expect(r.err).toContain("no-step-catalog");
    rmSync(p, { recursive: true, force: true });
  });

  test("finding no definitions fails instead of writing an empty catalog", () => {
    const p = scaffold();
    mkdirSync(join(p, "empty"), { recursive: true });
    const r = inProj(p, "qadlc-build-step-catalog.ts", ["--steps-dir", "empty"]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("no step definitions found");
    expect(existsSync(join(p, "aidlc-docs", ".qadlc", "step-catalog.json"))).toBe(false);
    // and a missing steps dir is an error, not an empty catalog
    expect(inProj(p, "qadlc-build-step-catalog.ts", ["--steps-dir", "nope"]).code).toBe(1);
    expect(inProj(p, "qadlc-build-step-catalog.ts", []).code).toBe(1);
    rmSync(p, { recursive: true, force: true });
  });

  test("--check reports a stale catalog", () => {
    const p = scaffold();
    const args = ["--steps-dir", "src/test/java/steps"];
    inProj(p, "qadlc-build-step-catalog.ts", args);
    expect(inProj(p, "qadlc-build-step-catalog.ts", [...args, "--check"]).code).toBe(0);
    writeFileSync(
      join(p, "src", "test", "java", "steps", "MoreSteps.java"),
      '@Given("I have a new step")\npublic void d() {}\n',
    );
    const stale = inProj(p, "qadlc-build-step-catalog.ts", [...args, "--check"]);
    expect(stale.code).toBe(1);
    expect(stale.err).toContain("stale");
    rmSync(p, { recursive: true, force: true });
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

describe("flag surface (/qadlc forwarded to next)", () => {
  function fresh(): string {
    const p = mkdtempSync(join(tmpdir(), "qadlc-flags-"));
    cpSync(DIST_KIRO, join(p, ".kiro"), { recursive: true });
    mkdirSync(join(p, "features"), { recursive: true });
    return p;
  }
  const orch = (p: string) => join(p, ".kiro", "tools", "qadlc-orchestrate.ts");
  function runIn(p: string, args: string[]) {
    const r = spawnSync("bun", [orch(p), ...args], { encoding: "utf-8", cwd: p });
    return { out: r.stdout ?? "", err: r.stderr ?? "", code: r.status ?? 0 };
  }
  function state(p: string) {
    const r = spawnSync("bun", [join(p, ".kiro", "tools", "qadlc-state.ts"), "show"], {
      encoding: "utf-8",
      cwd: p,
    });
    return JSON.parse(r.stdout ?? "{}");
  }

  test("--version prints the framework version (read-only)", () => {
    const p = fresh();
    const d = JSON.parse(runIn(p, ["next", "--version"]).out);
    expect(d.type).toBe("print");
    expect(d.readonly).toBe(true);
    expect(d.message).toContain("2.0.0");
    rmSync(p, { recursive: true, force: true });
  });

  test("--doctor reports a read-only setup check", () => {
    const p = fresh();
    const d = JSON.parse(runIn(p, ["next", "--doctor"]).out);
    expect(d.type).toBe("print");
    expect(d.readonly).toBe(true);
    expect(d.message).toContain("doctor");
    expect(d.message).toContain("stage-graph.json: OK");
    rmSync(p, { recursive: true, force: true });
  });

  test("--resume with no session falls through to detect-scope", () => {
    const p = fresh();
    expect(runIn(p, ["next", "--resume"]).out).toContain('"type": "detect-scope"');
    rmSync(p, { recursive: true, force: true });
  });

  test("--scope on a fresh workspace names the init command", () => {
    const p = fresh();
    const d = JSON.parse(runIn(p, ["next", "--scope", "smoke"]).out);
    expect(d.type).toBe("print");
    expect(d.command).toContain("report --scope smoke");
    rmSync(p, { recursive: true, force: true });
  });

  test("an unknown --scope is a read-only error", () => {
    const p = fresh();
    const d = JSON.parse(runIn(p, ["next", "--scope", "bogus"]).out);
    expect(d.type).toBe("print");
    expect(d.readonly).toBe(true);
    expect(d.message).toContain("Unknown scope");
    rmSync(p, { recursive: true, force: true });
  });

  test("--resume on an active session emits a resume menu", () => {
    const p = fresh();
    runIn(p, ["report", "--scope", "smoke"]);
    const d = JSON.parse(runIn(p, ["next", "--resume"]).out);
    expect(d.type).toBe("resume");
    expect(d.state_summary.current_stage).toBe("workspace-detection");
    expect(d.options.length).toBeGreaterThan(1);
    rmSync(p, { recursive: true, force: true });
  });

  test("--depth on an active session names the depth-change command and report applies it", () => {
    const p = fresh();
    runIn(p, ["report", "--scope", "smoke"]);
    const d = JSON.parse(runIn(p, ["next", "--depth", "Comprehensive"]).out);
    expect(d.type).toBe("print");
    expect(d.command).toContain("report --depth Comprehensive");
    runIn(p, ["report", "--depth", "Comprehensive"]);
    expect(state(p).depth).toBe("Comprehensive");
    rmSync(p, { recursive: true, force: true });
  });

  test("--stage into execution is refused until the plan is approved", () => {
    const p = fresh();
    runIn(p, ["report", "--scope", "smoke"]);
    const d = JSON.parse(runIn(p, ["next", "--stage", "feature-generation"]).out);
    expect(d.type).toBe("print");
    expect(d.readonly).toBe(true);
    expect(d.message).toContain("gated");
    rmSync(p, { recursive: true, force: true });
  });

  test("--stage jump names report --jump, which recomputes the pointer", () => {
    const p = fresh();
    runIn(p, ["report", "--scope", "regression"]);
    const d = JSON.parse(runIn(p, ["next", "--stage", "step-inventory"]).out);
    expect(d.command).toContain("report --jump step-inventory");
    runIn(p, ["report", "--jump", "step-inventory"]);
    const s = state(p);
    expect(s.current_stage).toBe("step-inventory");
    // earlier discovery stages are marked complete so step-inventory runs next
    expect(s.completed).toContain("story-analysis");
    expect(JSON.parse(runIn(p, ["next"]).out).stage.slug).toBe("step-inventory");
    rmSync(p, { recursive: true, force: true });
  });

  test("an unknown --stage and a --stage/--phase combo are read-only errors", () => {
    const p = fresh();
    runIn(p, ["report", "--scope", "smoke"]);
    expect(JSON.parse(runIn(p, ["next", "--stage", "bogus"]).out).message).toContain("Unknown stage");
    const combo = JSON.parse(runIn(p, ["next", "--stage", "x", "--phase", "discovery"]).out);
    expect(combo.message).toContain("together");
    rmSync(p, { recursive: true, force: true });
  });
});

describe("bun preflight", () => {
  // A PATH with no bun on it, to simulate the machine this guard exists for.
  // /bin and /usr/bin carry sh and the coreutils the script uses, never bun.
  const NO_BUN = { ...process.env, PATH: "/usr/bin:/bin" };
  const sh = (args: string[], env: typeof process.env) =>
    spawnSync("sh", [tool("qadlc-preflight.sh"), ...args], { encoding: "utf-8", cwd: proj, env });

  test("ships into every harness tree", () => {
    for (const h of ["claude", "kiro"] as const) {
      expect(existsSync(join(REPO, "dist", h, `.${h}`, "tools", "qadlc-preflight.sh"))).toBe(true);
    }
  });

  test("passes silently when bun is on PATH", () => {
    const r = sh([], process.env);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("execs through to the wrapped command when bun is present", () => {
    const r = sh(["bun", "--version"], process.env);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+/);
  });

  test("fails loudly when bun is missing", () => {
    const r = sh([], NO_BUN);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("QADLC PREFLIGHT FAILED");
    // The message must name the silent-degradation trap, not just the missing
    // binary — the whole point is stopping the conductor from carrying on.
    expect(r.stdout).toContain("fails OPEN");
    expect(r.stdout).toContain("DO NOT run the QADLC workflow from the stage markdown");
  });

  test("--brief reports a missing bun in one line, without failing the hook", () => {
    const r = sh(["--brief", "bun", "--version"], NO_BUN);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("QADLC is inactive");
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
  });

  test("--quiet says nothing at all when bun is missing", () => {
    const r = sh(["--quiet", "bun", "--version"], NO_BUN);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });

  test("every hook is wired through it, at the right verbosity", () => {
    const settings = JSON.parse(
      readFileSync(join(REPO, "dist", "claude", ".claude", "settings.json"), "utf-8"),
    );
    const cmds: string[] = Object.values(settings.hooks as Record<string, { hooks: { command: string }[] }[]>)
      .flat()
      .flatMap((g) => g.hooks.map((h) => h.command));
    expect(cmds.length).toBe(5);
    // No hook may invoke bun directly — that is the bare `command not found`
    // path this wrapper exists to remove.
    for (const c of cmds) expect(c.startsWith("sh .claude/tools/qadlc-preflight.sh ")).toBe(true);
    expect(cmds.filter((c) => c.includes(" --brief "))).toEqual([
      "sh .claude/tools/qadlc-preflight.sh --brief bun .claude/hooks/qadlc-session-start.ts",
    ]);
    expect(cmds.filter((c) => c.includes(" --quiet ")).length).toBe(4);
  });

  test("wrapping does not weaken the stop hook: decision:block passes through", () => {
    // The enforcement hook now runs behind the wrapper. With bun present the
    // wrapper must exec straight through, leaving stdout and exit status
    // untouched — otherwise the plan gate would be wrapped into silence.
    const p2 = mkdtempSync(join(tmpdir(), "qadlc-wrap-"));
    cpSync(DIST_KIRO, join(p2, ".kiro"), { recursive: true });
    mkdirSync(join(p2, "features"), { recursive: true });
    spawnSync("bun", [join(p2, ".kiro", "tools", "qadlc-orchestrate.ts"), "report", "--scope", "smoke"], { cwd: p2 });
    writeFileSync(join(p2, "features", "x.feature"), "Feature: X\n  @smoke\n  Scenario: y\n    Given a\n    Then b\n");
    spawnSync("bun", [join(p2, ".kiro", "hooks", "qadlc-audit-logger.ts")], {
      cwd: p2,
      input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(p2, "features", "x.feature") } }),
    });
    const r = spawnSync(
      "sh",
      [join(p2, ".kiro", "tools", "qadlc-preflight.sh"), "--quiet", "bun", join(p2, ".kiro", "hooks", "qadlc-stop.ts")],
      { cwd: p2, input: "{}", encoding: "utf-8" },
    );
    expect(r.stdout).toContain('"decision":"block"');
    rmSync(p2, { recursive: true, force: true });
  });
});

describe("packaging drift guard", () => {
  test("package --check reports no drift", () => {
    const r = spawnSync("bun", [join(REPO, "scripts", "package.ts"), "--check"], { encoding: "utf-8", cwd: REPO });
    expect(r.status).toBe(0);
  });
});
