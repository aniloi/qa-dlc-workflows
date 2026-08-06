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
//   2. "path inventory" — a deliberate lockfile of WHERE runtime artifacts land.
//      Phase 1 moved the hook-health dir out of the install tree; Phase 2 moved
//      state, audit, sensor details, diaries and the step catalog to .qadlc/.
//      Both moves showed up here as a required diff, which is the point: a
//      surprise failure means an accidental relocation.
//
//   3. "migration" — qadlc-migrate.ts against fixtures of both a v1 and a v2
//      aidlc-docs/, since a real rollout meets both.
//
// Runs against dist/claude (not dist/kiro like integration.test.ts): the tree the
// plugin must cede to is a vendored .claude/, so that is the collision surface.

import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
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

/**
 * The environment a tool sees when the MODEL runs it through the Bash tool:
 * $CLAUDE_PROJECT_DIR is not exported there, which is the whole reason the
 * resolver needs a cwd walk-up.
 */
function withoutProjectEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  delete env.KIRO_PROJECT_DIR;
  delete env.QADLC_PROJECT_ROOT;
  return env;
}

/** Sorted relative paths of every file under a directory. */
function treeSnapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, "");
  return out;
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
    expect(existsSync(join(p, ".qadlc"))).toBe(false);
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

  // The clobber this used to guard against is now structurally impossible: v2
  // writes .qadlc/qa-state.md and never touches aidlc-docs/. The refuse-not-
  // clobber guard is asserted directly under "state ownership" below.
});

// ---------------------------------------------------------------------------
// 2. Path inventory — EXPECTED to change in Phases 1 and 2
// ---------------------------------------------------------------------------
describe("path inventory: where runtime artifacts land today", () => {
  test("state and audit live under .qadlc/", () => {
    const p = v2Project();
    expect(existsSync(join(p, ".qadlc", "qa-state.md"))).toBe(true);
    expect(existsSync(join(p, ".qadlc", "audit.md"))).toBe(true);
    // and nothing was left in the namespace QADLC v1 owns
    expect(existsSync(join(p, "aidlc-docs"))).toBe(false);
  });

  test("sensor details land under .qadlc/sensors/<slug>/", () => {
    const p = v2Project();
    writeFileSync(join(p, "features", "bad.feature"), "Feature: B\n\n  Scenario: x\n    And nope\n    Then y\n", "utf-8");
    spawnSync("bun", [tool(p, "qadlc-sensor.ts"), "--stage", "feature-generation", "--file-path", "features/bad.feature"], { cwd: p });
    const dir = join(p, ".qadlc", "sensors", "feature-generation");
    expect(existsSync(dir)).toBe(true);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
  });

  // Phase 1 moved this. It used to write <engineRoot>/tools/data/health/ — the one
  // place the engine wrote into its own install tree, which is invalid for a
  // plugin whose cache is shared across projects and replaced on upgrade.
  test("hook health writes to the project, never into the install tree", () => {
    const p = v2Project();
    writeFileSync(join(p, "features", "x.feature"), FEATURE, "utf-8");
    runHook(p, "qadlc-audit-logger.ts", writeEvent(p, "features/x.feature"));
    expect(existsSync(join(p, ".qadlc", "health", "audit-logger.last"))).toBe(true);
    expect(existsSync(join(tree(p), "tools", "data", "health"))).toBe(false);
  });

  test("the install tree is untouched by a full session", () => {
    // The §1 invariant, asserted directly: compare the engine tree's file list
    // before and after real work. Any write into it fails here.
    const p = v2Project();
    const before = treeSnapshot(tree(p));
    writeFileSync(join(p, "features", "x.feature"), FEATURE, "utf-8");
    runHook(p, "qadlc-audit-logger.ts", writeEvent(p, "features/x.feature"));
    runHook(p, "qadlc-sensor-fire.ts", writeEvent(p, "features/x.feature"));
    runHook(p, "qadlc-stop.ts", {});
    runHook(p, "qadlc-session-end.ts", { hook_event_name: "SessionEnd" });
    expect(treeSnapshot(tree(p))).toEqual(before);
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
    expect(readFileSync(join(target, ".qadlc", "audit.md"), "utf-8")).toContain("SESSION_ENDED");
    // and the host project's v1 audit was left alone
    expect(readFileSync(join(host, "aidlc-docs", "audit.md"), "utf-8")).toBe(V1_AUDIT);
  });

  test("$QADLC_PROJECT_ROOT overrides everything, for tools as well as hooks", () => {
    const host = v2Project();
    const target = v2Project();
    const r = spawnSync("bun", [tool(host, "qadlc-state.ts"), "show"], {
      cwd: host,
      encoding: "utf-8",
      env: { ...process.env, QADLC_PROJECT_ROOT: target },
    });
    // Reads target's state, not host's — both are live, so a wrong resolution
    // would still return a valid-looking object. Distinguish by started time.
    const viaEnv = JSON.parse(r.stdout ?? "{}");
    const targetState = JSON.parse(
      readFileSync(join(target, ".qadlc", "qa-state.md"), "utf-8").split("<!-- qa-state:machine")[1].split("-->")[0],
    );
    expect(viaEnv.started).toBe(targetState.started);
  });

  // Plugin mode: the engine tree lives outside the project, so the resolver must
  // walk up from cwd. Simulated by flipping harness.json's mode and running from
  // a subdirectory — the case bare cwd would get wrong.
  describe("plugin mode", () => {
    function pluginProject(): { proj: string; engine: string } {
      const engine = mkdtempSync(join(tmpdir(), "qadlc-engine-"));
      cpSync(DIST_CLAUDE, engine, { recursive: true });
      const hj = join(engine, "tools", "data", "harness.json");
      const data = JSON.parse(readFileSync(hj, "utf-8"));
      writeFileSync(hj, JSON.stringify({ ...data, mode: "plugin", entryCmd: "qadlc" }, null, 2), "utf-8");
      const proj = mkdtempSync(join(tmpdir(), "qadlc-proj-"));
      mkdirSync(join(proj, ".git"), { recursive: true });
      mkdirSync(join(proj, "src", "deep"), { recursive: true });
      return { proj, engine };
    }

    test("tools walk up from cwd to find the project root", () => {
      const { proj, engine } = pluginProject();
      // cwd is two levels down, exactly where bare cwd would misresolve.
      const r = spawnSync("bun", [join(engine, "tools", "qadlc-orchestrate.ts"), "report", "--scope", "smoke"], {
        cwd: join(proj, "src", "deep"),
        encoding: "utf-8",
        env: withoutProjectEnv(),
      });
      expect(r.status).toBe(0);
      expect(existsSync(join(proj, ".qadlc", "qa-state.md"))).toBe(true);
      expect(existsSync(join(proj, "src", "deep", ".qadlc"))).toBe(false);
    });

    test("an initialized .qadlc/ outranks an enclosing .git/", () => {
      const { proj, engine } = pluginProject();
      const inner = join(proj, "src", "deep");
      mkdirSync(join(inner, ".qadlc"), { recursive: true });
      spawnSync("bun", [join(engine, "tools", "qadlc-orchestrate.ts"), "report", "--scope", "smoke"], {
        cwd: inner,
        env: withoutProjectEnv(),
      });
      expect(existsSync(join(inner, ".qadlc", "qa-state.md"))).toBe(true);
      expect(existsSync(join(proj, ".qadlc"))).toBe(false);
    });

    test("resolution refuses a project root inside the engine tree", () => {
      const { engine } = pluginProject();
      const r = spawnSync("bun", [join(engine, "tools", "qadlc-orchestrate.ts"), "next"], {
        cwd: join(engine, "tools"),
        encoding: "utf-8",
        env: withoutProjectEnv(),
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr ?? "").toContain("could not determine your project root");
    });

    test("a hook is a silent no-op when the project root is unusable", () => {
      const { engine } = pluginProject();
      const r = spawnSync("bun", [join(engine, "hooks", "qadlc-stop.ts")], {
        cwd: join(engine, "tools"),
        encoding: "utf-8",
        input: "{}",
        env: withoutProjectEnv(),
      });
      expect(r.status).toBe(0);
      expect(r.stdout ?? "").toBe("");
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Refuse-not-clobber + migration
// ---------------------------------------------------------------------------
describe("state ownership", () => {
  test("the engine refuses to overwrite a qa-state.md it does not own", () => {
    // writeState is a full-file overwrite. Anything without the machine block —
    // a v1 trail, a hand-edit, a merge artefact — must stop it, not be replaced.
    const p = mkdtempSync(join(tmpdir(), "qadlc-own-"));
    cpSync(DIST_CLAUDE, tree(p), { recursive: true });
    mkdirSync(join(p, ".qadlc"), { recursive: true });
    const foreign = "# Not ours\n\nhand-written\n";
    writeFileSync(join(p, ".qadlc", "qa-state.md"), foreign, "utf-8");
    const r = spawnSync("bun", [tool(p, "qadlc-orchestrate.ts"), "report", "--scope", "smoke"], {
      cwd: p,
      encoding: "utf-8",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr ?? "").toContain("no QADLC machine block");
    expect(readFileSync(join(p, ".qadlc", "qa-state.md"), "utf-8")).toBe(foreign);
  });
});

describe("migration from aidlc-docs/", () => {
  const migrate = (p: string, ...args: string[]) =>
    spawnSync("bun", [tool(p, "qadlc-migrate.ts"), ...args], { cwd: p, encoding: "utf-8" });

  test("moves v2 artefacts and leaves the legacy root only if empty", () => {
    const p = mkdtempSync(join(tmpdir(), "qadlc-mig2-"));
    cpSync(DIST_CLAUDE, tree(p), { recursive: true });
    // A v2-format session laid out the old way.
    const legacy = join(p, "aidlc-docs");
    mkdirSync(join(legacy, ".qadlc-sensors", "feature-generation"), { recursive: true });
    mkdirSync(join(legacy, ".qadlc-memory", "story-analysis"), { recursive: true });
    mkdirSync(join(legacy, ".qadlc"), { recursive: true });
    writeFileSync(join(legacy, "qa-state.md"), `x\n<!-- qa-state:machine\n{"scope":"smoke"}\n-->\n`, "utf-8");
    writeFileSync(join(legacy, "audit.md"), "# QADLC Audit Trail\n\n## PLAN_APPROVED\n", "utf-8");
    writeFileSync(join(legacy, ".qadlc-sensors", "feature-generation", "gherkin-lint-1.md"), "d\n", "utf-8");
    writeFileSync(join(legacy, ".qadlc-memory", "story-analysis", "memory.md"), "diary\n", "utf-8");
    writeFileSync(join(legacy, ".qadlc", "step-catalog.json"), '{"steps":[]}\n', "utf-8");

    const r = migrate(p);
    expect(r.status).toBe(0);
    expect(existsSync(join(p, ".qadlc", "qa-state.md"))).toBe(true);
    expect(existsSync(join(p, ".qadlc", "audit.md"))).toBe(true);
    expect(existsSync(join(p, ".qadlc", "sensors", "feature-generation", "gherkin-lint-1.md"))).toBe(true);
    expect(existsSync(join(p, ".qadlc", "diaries", "story-analysis", "memory.md"))).toBe(true);
    expect(existsSync(join(p, ".qadlc", "step-catalog.json"))).toBe(true);
    // The engine reads the moved state, so the session survives the move.
    const shown = spawnSync("bun", [tool(p, "qadlc-state.ts"), "show"], { cwd: p, encoding: "utf-8" });
    expect(JSON.parse(shown.stdout ?? "{}").scope).toBe("smoke");
  });

  test("leaves v1 state in place and never deletes it", () => {
    const p = v1Project();
    const r = migrate(p);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("left in place");
    // v1's files are untouched, and v2 claimed nothing in their namespace.
    expect(readFileSync(join(p, "aidlc-docs", "qa-state.md"), "utf-8")).toBe(V1_STATE);
    expect(existsSync(join(p, ".qadlc", "qa-state.md"))).toBe(false);
  });

  test("never touches aidlc-docs/inception/, an AIDLC input directory", () => {
    const p = mkdtempSync(join(tmpdir(), "qadlc-mig3-"));
    cpSync(DIST_CLAUDE, tree(p), { recursive: true });
    const stories = join(p, "aidlc-docs", "inception", "user-stories");
    mkdirSync(stories, { recursive: true });
    writeFileSync(join(stories, "CLM-1.md"), "story\n", "utf-8");
    writeFileSync(join(p, "aidlc-docs", "audit.md"), "# QADLC Audit Trail\n", "utf-8");

    expect(migrate(p).status).toBe(0);
    expect(existsSync(join(stories, "CLM-1.md"))).toBe(true);
    expect(existsSync(join(p, ".qadlc", "audit.md"))).toBe(true);
    // legacy root survives because inception/ still lives there
    expect(existsSync(join(p, "aidlc-docs"))).toBe(true);
  });

  test("--dry-run reports without moving anything", () => {
    const p = mkdtempSync(join(tmpdir(), "qadlc-mig4-"));
    cpSync(DIST_CLAUDE, tree(p), { recursive: true });
    mkdirSync(join(p, "aidlc-docs"), { recursive: true });
    writeFileSync(join(p, "aidlc-docs", "audit.md"), "# QADLC Audit Trail\n", "utf-8");
    const r = migrate(p, "--dry-run");
    expect(r.stdout).toContain("would move");
    expect(existsSync(join(p, "aidlc-docs", "audit.md"))).toBe(true);
    expect(existsSync(join(p, ".qadlc", "audit.md"))).toBe(false);
  });

  test("skips rather than overwrites when the destination exists", () => {
    const p = mkdtempSync(join(tmpdir(), "qadlc-mig5-"));
    cpSync(DIST_CLAUDE, tree(p), { recursive: true });
    mkdirSync(join(p, "aidlc-docs"), { recursive: true });
    mkdirSync(join(p, ".qadlc"), { recursive: true });
    writeFileSync(join(p, "aidlc-docs", "audit.md"), "OLD\n", "utf-8");
    writeFileSync(join(p, ".qadlc", "audit.md"), "NEW\n", "utf-8");
    const r = migrate(p);
    expect(r.stdout).toContain("SKIPPED");
    expect(readFileSync(join(p, ".qadlc", "audit.md"), "utf-8")).toBe("NEW\n");
    expect(readFileSync(join(p, "aidlc-docs", "audit.md"), "utf-8")).toBe("OLD\n");
  });

  test("removes the stale hook-health dir Phase 1 orphaned", () => {
    const p = mkdtempSync(join(tmpdir(), "qadlc-mig6-"));
    cpSync(DIST_CLAUDE, tree(p), { recursive: true });
    const stale = join(tree(p), "tools", "data", "health");
    mkdirSync(stale, { recursive: true });
    writeFileSync(join(stale, "audit-logger.last"), "2026-01-01T00:00:00Z", "utf-8");
    expect(migrate(p).status).toBe(0);
    expect(existsSync(stale)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. The plugin target (Phase 3)
// ---------------------------------------------------------------------------
const DIST_PLUGIN = join(REPO, "dist", "plugin");

describe("plugin target", () => {
  /** A plugin install: engine tree OUTSIDE the project, reached via bin/qadlc. */
  function install(): { proj: string; engine: string } {
    // realpathSync: on macOS mkdtemp hands back /var/... while the child process
    // sees /private/var/..., and doctor reports what the engine actually resolved.
    const engine = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-plug-")));
    cpSync(DIST_PLUGIN, engine, { recursive: true, preserveTimestamps: true });
    // cpSync preserves mode, but assert rather than assume — see the exec-bit test.
    const proj = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-pproj-")));
    mkdirSync(join(proj, ".git"), { recursive: true });
    mkdirSync(join(proj, "features"), { recursive: true });
    return { proj, engine };
  }
  const qadlc = (e: string) => join(e, "bin", "qadlc");
  function runQadlc(engine: string, proj: string, args: string[], input?: string) {
    const r = spawnSync(qadlc(engine), args, {
      cwd: proj,
      encoding: "utf-8",
      input,
      env: withoutProjectEnv(),
    });
    return { out: r.stdout ?? "", err: r.stderr ?? "", code: r.status ?? 0 };
  }

  test("bin/qadlc is executable and runs as a bare command", () => {
    const { proj, engine } = install();
    expect(statSync(qadlc(engine)).mode & 0o111).not.toBe(0);
    const r = runQadlc(engine, proj, ["--version"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("QADLC");
  });

  test("the engine resolves the PROJECT, never the plugin dir", () => {
    const { proj, engine } = install();
    expect(runQadlc(engine, proj, ["report", "--scope", "smoke"]).code).toBe(0);
    expect(existsSync(join(proj, ".qadlc", "qa-state.md"))).toBe(true);
    // nothing written into the install tree
    expect(existsSync(join(engine, ".qadlc"))).toBe(false);
    expect(existsSync(join(engine, "aidlc-docs"))).toBe(false);
  });

  test("doctor reports plugin mode and both roots", () => {
    const { proj, engine } = install();
    const d = JSON.parse(runQadlc(engine, proj, ["doctor"]).out);
    expect(d.message).toContain("install mode: plugin");
    expect(d.message).toContain(`project root: ${proj}`);
    expect(d.message).toContain(`engine root: ${engine}`);
  });

  test("emitted commands name `qadlc`, not a path into the plugin cache", () => {
    const { proj, engine } = install();
    const d = JSON.parse(runQadlc(engine, proj, ["next", "--scope", "smoke"]).out);
    expect(d.command).toBe("qadlc report --scope smoke");
    expect(d.command).not.toContain(engine);
  });

  // §7.3: the Stop hook is the only ENFORCING hook. A QADLC user who silently
  // loses it is worse off than one who never installed. This is the phase gate.
  test("the plan gate still blocks under a plugin install", () => {
    const { proj, engine } = install();
    runQadlc(engine, proj, ["report", "--scope", "smoke"]);
    writeFileSync(join(proj, "features", "x.feature"), FEATURE, "utf-8");
    // the audit-logger records the artifact, as the real PostToolUse hook would
    const logger = spawnSync("bun", [join(engine, "hooks", "qadlc-audit-logger.ts")], {
      cwd: proj,
      input: JSON.stringify(writeEvent(proj, "features/x.feature")),
      env: { ...withoutProjectEnv(), CLAUDE_PROJECT_DIR: proj },
    });
    expect(logger.status).toBe(0);
    const stop = spawnSync("bun", [join(engine, "hooks", "qadlc-stop.ts")], {
      cwd: proj,
      encoding: "utf-8",
      input: "{}",
      env: { ...withoutProjectEnv(), CLAUDE_PROJECT_DIR: proj },
    });
    expect(stop.stdout ?? "").toContain('"decision":"block"');
  });

  test("qadlc init materializes project memory and never overwrites it", () => {
    const { proj, engine } = install();
    expect(runQadlc(engine, proj, ["init"]).code).toBe(0);
    const team = join(proj, ".qadlc", "memory", "team.md");
    expect(existsSync(team)).toBe(true);
    expect(existsSync(join(proj, ".qadlc", "memory", "project.md"))).toBe(true);
    // a hand-edited memory file survives a re-run, with and without --force
    writeFileSync(team, "MINE\n", "utf-8");
    expect(runQadlc(engine, proj, ["init"]).out).toContain("kept");
    expect(readFileSync(team, "utf-8")).toBe("MINE\n");
    expect(runQadlc(engine, proj, ["init", "--force"]).out).toContain("REFUSED");
    expect(readFileSync(team, "utf-8")).toBe("MINE\n");
  });

  test("memory ships as a template, not as engine content", () => {
    // The plugin/project split: machinery in the plugin, vocabulary in the repo.
    expect(existsSync(join(DIST_PLUGIN, "templates", "memory", "team.md"))).toBe(true);
    expect(existsSync(join(DIST_PLUGIN, "memory"))).toBe(false);
  });

  test("hooks.json uses exec form and the plugin-root placeholder", () => {
    const cfg = JSON.parse(readFileSync(join(DIST_PLUGIN, "hooks", "hooks.json"), "utf-8"));
    const handlers = Object.values(cfg.hooks)
      .flat()
      .flatMap((g: any) => g.hooks as any[]);
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) {
      expect(h.command).toBe("bun");
      expect(Array.isArray(h.args)).toBe(true);
      expect(h.args[0]).toStartWith("${CLAUDE_PLUGIN_ROOT}/hooks/");
      expect(typeof h.timeout).toBe("number");
    }
    // every event the vendored settings.json wires must survive the move
    expect(Object.keys(cfg.hooks).sort()).toEqual([
      "PostToolUse", "SessionEnd", "SessionStart", "Stop",
    ]);
  });

  test("ships no settings.json and no rules/ stub", () => {
    // Plugin settings.json supports only `agent`/`subagentStatusLine`, and a
    // plugin cannot contribute ambient rules context at all.
    expect(existsSync(join(DIST_PLUGIN, "settings.json"))).toBe(false);
    expect(existsSync(join(DIST_PLUGIN, "rules"))).toBe(false);
  });

  test("plugin agents declare no field a plugin forbids", () => {
    // hooks / mcpServers / permissionMode are rejected for plugin-shipped agents.
    for (const f of readdirSync(join(DIST_PLUGIN, "agents"))) {
      const fm = readFileSync(join(DIST_PLUGIN, "agents", f), "utf-8").split("---")[1] ?? "";
      for (const banned of ["hooks:", "mcpServers:", "permissionMode:"]) {
        expect(fm).not.toContain(banned);
      }
    }
  });

  test("claude plugin validate --strict passes", () => {
    const r = spawnSync("claude", ["plugin", "validate", DIST_PLUGIN, "--strict"], {
      encoding: "utf-8",
    });
    if (r.error) return; // CLI unavailable in this environment — skip silently
    expect(r.stdout ?? "").toContain("Validation passed");
    expect(r.status).toBe(0);
  });
});
