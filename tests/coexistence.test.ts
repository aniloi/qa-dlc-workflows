// tests/coexistence.test.ts — Phase 0 guards for the plugin-target work
// (docs/harness-engineering/01-plugin-target.md, issue #2).
//
// These tests pin behavior that the plugin refactor must not break. Two groups:
//
//   1. "v1 coexistence" — properties that MUST hold. QADLC v1 is deployed in
//      DriveWealth/qa_automation (.qa-dlc-rule-details/ + a v1-form QA-CLAUDE.md
//      on main), so any v2 rollout lands on top of a live v1 install. v2 must
//      neither act on v1 state nor mutate v1's files. §8.1 of the plan.
//
//   2. "path inventory" — a deliberate lockfile of WHERE runtime artifacts land
//      today. Phase 1 moves the hook-health dir out of the install tree and
//      Phase 2 moves state/audit/sensors to .qadlc/, so these assertions are
//      EXPECTED TO CHANGE. Updating them is the visible diff that proves the
//      move happened; a surprise failure here means an accidental relocation.
//
// Runs against dist/claude (not dist/kiro like integration.test.ts): the tree the
// plugin must cede to is a vendored .claude/, so that is the collision surface.

import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const DIST_CLAUDE = join(REPO, "dist", "claude", ".claude");

// --- v1 fixtures -----------------------------------------------------------
// v1's qa-state.md is plain markdown headings with NO `<!-- qa-state:machine`
// block. That absence is precisely what makes readState() return null, which is
// what keeps every v2 hook inert on a v1 project.
const V1_STATE = `# QA-DLC Session State

## Phase & Stage

- **Current Stage**: Feature Generation
- **Phase**: Execution

## Progress

- [x] Workspace Detection
- [x] Story Analysis
`;

// v1's audit.md format: "## <Stage Name>" + **Timestamp** + **User Input**.
// v2 writes "## PLAN_APPROVED" / "## ARTIFACT_CREATED" instead, so appending
// v2 entries here produces a file that parses cleanly under neither.
const V1_AUDIT = `# QA-DLC Audit Trail

## Workspace Detection
**Timestamp**: 2026-07-17T10:04:11Z
**User Input**: Using QA-DLC, write feature files for CLM-1

---
`;

const FEATURE = "@smoke\nFeature: X\n  @account\n  Scenario: y\n    Given a\n    Then b\n";

function tree(p: string): string {
  return join(p, ".claude");
}
function hook(p: string, h: string): string {
  return join(tree(p), "hooks", h);
}
function tool(p: string, t: string): string {
  return join(tree(p), "tools", t);
}

/** A project carrying a v1 install's leftovers and no v2 session. */
function v1Project(): string {
  const p = mkdtempSync(join(tmpdir(), "qadlc-v1-"));
  cpSync(DIST_CLAUDE, tree(p), { recursive: true });
  mkdirSync(join(p, "aidlc-docs"), { recursive: true });
  mkdirSync(join(p, "features"), { recursive: true });
  writeFileSync(join(p, "aidlc-docs", "qa-state.md"), V1_STATE, "utf-8");
  writeFileSync(join(p, "aidlc-docs", "audit.md"), V1_AUDIT, "utf-8");
  return p;
}

/** A project with a live v2 session. */
function v2Project(): string {
  const p = mkdtempSync(join(tmpdir(), "qadlc-v2-"));
  cpSync(DIST_CLAUDE, tree(p), { recursive: true });
  mkdirSync(join(p, "features"), { recursive: true });
  spawnSync("bun", [tool(p, "qadlc-orchestrate.ts"), "report", "--scope", "smoke"], { cwd: p });
  return p;
}

function runHook(p: string, h: string, input: unknown, env?: Record<string, string>) {
  const r = spawnSync("bun", [hook(p, h)], {
    cwd: p,
    encoding: "utf-8",
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, ...env },
  });
  return { out: r.stdout ?? "", err: r.stderr ?? "", code: r.status ?? 0 };
}

function writeEvent(p: string, rel: string, toolName = "Write") {
  return { tool_name: toolName, tool_input: { file_path: join(p, rel) } };
}

// ---------------------------------------------------------------------------
// 1. v1 coexistence — these properties must hold
// ---------------------------------------------------------------------------
describe("v1 coexistence: v2 does not act on v1 state", () => {
  test("readState returns null for a marker-less v1 qa-state.md", () => {
    const p = v1Project();
    const r = spawnSync("bun", [tool(p, "qadlc-state.ts"), "show"], { cwd: p, encoding: "utf-8" });
    expect(JSON.parse(r.stdout ?? "{}")).toEqual({});
  });

  test("the plan gate does NOT block a v1 user who writes a .feature", () => {
    // The nightmare case: a v1 user installs v2 and the only enforcing hook
    // starts blocking their turns on state it cannot even parse.
    const p = v1Project();
    writeFileSync(join(p, "features", "x.feature"), FEATURE, "utf-8");
    const r = runHook(p, "qadlc-stop.ts", {});
    expect(r.out).not.toContain("decision");
    expect(r.code).toBe(0);
  });

  test("session-start stays silent on a v1 project", () => {
    const p = v1Project();
    const r = runHook(p, "qadlc-session-start.ts", { hook_event_name: "SessionStart" });
    expect(r.out.trim()).toBe("");
    expect(r.code).toBe(0);
  });

  test("session-end does not append to v1's audit.md", () => {
    const p = v1Project();
    runHook(p, "qadlc-session-end.ts", { hook_event_name: "SessionEnd" });
    expect(readFileSync(join(p, "aidlc-docs", "audit.md"), "utf-8")).toBe(V1_AUDIT);
  });

  test("the audit-logger does not append to v1's audit.md", () => {
    const p = v1Project();
    writeFileSync(join(p, "features", "x.feature"), FEATURE, "utf-8");
    runHook(p, "qadlc-audit-logger.ts", writeEvent(p, "features/x.feature"));
    expect(readFileSync(join(p, "aidlc-docs", "audit.md"), "utf-8")).toBe(V1_AUDIT);
  });

  test("sensor-fire does not touch v1 artifacts when a plan is written", () => {
    // gherkin_plan.md is a name v1 also produces, so this is a live collision
    // path, not a hypothetical one.
    const p = v1Project();
    writeFileSync(join(p, "gherkin_plan.md"), "# Plan\n\n## Story-to-Scenario Mapping\nx\n", "utf-8");
    runHook(p, "qadlc-sensor-fire.ts", writeEvent(p, "gherkin_plan.md"));
    expect(readFileSync(join(p, "aidlc-docs", "audit.md"), "utf-8")).toBe(V1_AUDIT);
    expect(existsSync(join(p, "aidlc-docs", ".qadlc-sensors"))).toBe(false);
  });

  test("v1's qa-state.md is byte-identical after every hook has run", () => {
    const p = v1Project();
    writeFileSync(join(p, "features", "x.feature"), FEATURE, "utf-8");
    for (const h of [
      "qadlc-session-start.ts",
      "qadlc-audit-logger.ts",
      "qadlc-sensor-fire.ts",
      "qadlc-stop.ts",
      "qadlc-session-end.ts",
    ]) {
      runHook(p, h, writeEvent(p, "features/x.feature"));
    }
    expect(readFileSync(join(p, "aidlc-docs", "qa-state.md"), "utf-8")).toBe(V1_STATE);
  });

  // Phase 2: writeState() is an unconditional overwrite, so the first v2 session
  // in a repo with v1 history destroys it. The fix is to refuse when the machine
  // marker is absent. Asserted once that guard exists.
  test.skip("PHASE 2: the engine refuses to overwrite a marker-less qa-state.md", () => {});
});

// ---------------------------------------------------------------------------
// 2. Path inventory — EXPECTED to change in Phases 1 and 2
// ---------------------------------------------------------------------------
describe("path inventory: where runtime artifacts land today", () => {
  test("state and audit live under aidlc-docs/ (Phase 2 moves these to .qadlc/)", () => {
    const p = v2Project();
    expect(existsSync(join(p, "aidlc-docs", "qa-state.md"))).toBe(true);
    expect(existsSync(join(p, "aidlc-docs", "audit.md"))).toBe(true);
  });

  test("sensor details land under aidlc-docs/.qadlc-sensors/<slug>/ (Phase 2 moves these)", () => {
    const p = v2Project();
    writeFileSync(join(p, "features", "bad.feature"), "Feature: B\n\n  Scenario: x\n    And nope\n    Then y\n", "utf-8");
    spawnSync("bun", [tool(p, "qadlc-sensor.ts"), "--stage", "feature-generation", "--file-path", "features/bad.feature"], { cwd: p });
    const dir = join(p, "aidlc-docs", ".qadlc-sensors", "feature-generation");
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
  });

  test("hook health writes INSIDE the install tree (the §1 violation Phase 1 fixes)", () => {
    // This is the one place the engine writes to its own install directory. A
    // plugin cache is shared across projects and replaced on upgrade, so this
    // location is invalid for a plugin. Pinned here so the move is visible.
    const p = v2Project();
    writeFileSync(join(p, "features", "x.feature"), FEATURE, "utf-8");
    runHook(p, "qadlc-audit-logger.ts", writeEvent(p, "features/x.feature"));
    expect(existsSync(join(tree(p), "tools", "data", "health", "audit-logger.last"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Project-root resolution — what Phase 1 generalizes
// ---------------------------------------------------------------------------
describe("project-root resolution", () => {
  test("hooks honor $CLAUDE_PROJECT_DIR over the harness's parent directory", () => {
    // Already correct via resolveProjectDirFromHook(). Phase 1 extends the same
    // precedence to every tool, so pin it before touching the resolver.
    const host = v1Project(); // supplies the hook file; has no v2 session
    const target = v2Project(); // the real project, with a live session
    runHook(host, "qadlc-session-end.ts", { hook_event_name: "SessionEnd" }, {
      CLAUDE_PROJECT_DIR: target,
    });
    expect(readFileSync(join(target, "aidlc-docs", "audit.md"), "utf-8")).toContain("SESSION_ENDED");
    // and the host project's v1 audit was left alone
    expect(readFileSync(join(host, "aidlc-docs", "audit.md"), "utf-8")).toBe(V1_AUDIT);
  });

  // Phase 1: tools are invoked by the model via Bash, where $CLAUDE_PROJECT_DIR
  // is NOT exported, so they must walk up from cwd (.qadlc/ before .git/).
  test.skip("PHASE 1: tools resolve the project root by walking up from cwd", () => {});
  test.skip("PHASE 1: resolution refuses to return a path inside the plugin cache", () => {});
});
