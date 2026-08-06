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
import { join, relative, sep } from "node:path";

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

  // Spawns the full Claude Code CLI, so give it room: ~0.5s warm, but slower under
  // load, and bun's default per-test timeout is 5s.
  test("claude plugin validate --strict passes", () => {
    const r = spawnSync("claude", ["plugin", "validate", DIST_PLUGIN, "--strict"], {
      encoding: "utf-8",
      timeout: 60_000,
    });
    if (r.error) return; // CLI unavailable in this environment — skip silently
    expect(r.stdout ?? "").toContain("Validation passed");
    expect(r.status).toBe(0);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 6. Prose portability (Phase 4)
// ---------------------------------------------------------------------------
describe("prose names one command and no engine paths", () => {
  const CORE_MD = (() => {
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.name.endsWith(".md")) out.push(join(d, e.name));
      }
    };
    walk(join(REPO, "core"));
    // core/templates/ holds the onboarding skeleton, rendered only for vendored
    // targets (QA-CLAUDE.md / QA-AGENTS.md). A project-relative engine path is
    // correct there — those installs really do put the tree in the project — and
    // it never reaches the plugin, which ships no onboarding doc.
    return out.filter((f) => !f.includes(`${sep}templates${sep}`));
  })();

  test("no core prose names a tool by path", () => {
    // The whole point of {{QADLC_CMD}}: a stage file must not encode the install
    // layout, because a plugin's engine has no project-relative path at all.
    const offenders: string[] = [];
    for (const f of CORE_MD) {
      const body = readFileSync(f, "utf-8");
      if (/\{\{HARNESS_DIR\}\}\/tools\/|\.claude\/tools\/|\.kiro\/tools\//.test(body)) {
        offenders.push(relative(REPO, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("no core prose points at engine content inside the install tree", () => {
    // agents/, knowledge/, sensors/, scopes/ and stage files are all reachable
    // only through directive fields now.
    const offenders: string[] = [];
    for (const f of CORE_MD) {
      const body = readFileSync(f, "utf-8");
      if (/\{\{HARNESS_DIR\}\}\/(agents|knowledge|sensors|scopes|qa-common)\//.test(body)) {
        offenders.push(relative(REPO, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("built trees carry no unsubstituted token", () => {
    for (const t of ["dist/claude/.claude", "dist/kiro/.kiro", "dist/plugin"]) {
      const out: string[] = [];
      const walk = (d: string): void => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(join(d, e.name));
          else if (e.name.endsWith(".md")) out.push(join(d, e.name));
        }
      };
      walk(join(REPO, t));
      for (const f of out) {
        expect(readFileSync(f, "utf-8")).not.toMatch(/\{\{[A-Z_]+\}\}/);
      }
    }
  });

  test("the entry command is the ONLY difference between vendored and plugin prose", () => {
    // Not byte-identical — that was never reachable, since the invocation itself
    // must differ. This is the achievable property: prose encodes the command,
    // never the layout.
    const A = join(REPO, "dist", "claude", ".claude");
    const B = join(REPO, "dist", "plugin");
    // Both entry-command spellings collapse to one marker. `qadlc` appears bare
    // inside backticks as well as followed by a subcommand, so match the longer
    // form first and then the word boundary — not a naive "qadlc " replace.
    const norm = (s: string) =>
      s
        .replaceAll("bun .claude/tools/qadlc.ts", "@CMD@")
        .replace(/(^|[^-\w])qadlc(?![-\w])/g, "$1@CMD@");
    const unexplained: string[] = [];
    const walk = (d: string, base: string, out: string[] = []): string[] => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name), base, out);
        else if (e.name.endsWith(".md")) out.push(relative(base, join(d, e.name)));
      }
      return out;
    };
    for (const rel of walk(join(A, "qa-common"), A)) {
      const a = readFileSync(join(A, rel), "utf-8");
      let b: string;
      try {
        b = readFileSync(join(B, rel), "utf-8");
      } catch {
        continue;
      }
      if (a !== b && norm(a) !== norm(b)) unexplained.push(rel);
    }
    expect(unexplained).toEqual([]);
  });
});

describe("directive-carried engine paths", () => {
  test("run-stage carries agent_file, knowledge_dir and sensor_files", () => {
    const p = v2Project();
    const d = JSON.parse(
      spawnSync("bun", [tool(p, "qadlc-orchestrate.ts"), "next"], { cwd: p, encoding: "utf-8" }).stdout ?? "{}",
    );
    expect(d.type).toBe("run-stage");
    expect(d.stage.agent_file).toContain(d.stage.lead_agent);
    expect(typeof d.stage.knowledge_dir).toBe("string");
    expect(Array.isArray(d.stage.sensor_files)).toBe(true);
    expect(d.stage.sensor_files.length).toBe(d.stage.sensors.length);
  });

  test("a plugin install emits ABSOLUTE engine paths the model can actually read", () => {
    // Vendored prose could say `.claude/agents/x.md` because the tree is in the
    // project. A plugin's is not, so the path has to be absolute or unusable.
    const engine = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-dp-")));
    cpSync(join(REPO, "dist", "plugin"), engine, { recursive: true });
    const proj = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-dpp-")));
    mkdirSync(join(proj, ".git"), { recursive: true });
    const run = (args: string[]) =>
      spawnSync(join(engine, "bin", "qadlc"), args, {
        cwd: proj,
        encoding: "utf-8",
        env: withoutProjectEnv(),
      });
    run(["report", "--scope", "smoke"]);
    const d = JSON.parse(run(["next"]).stdout ?? "{}");
    for (const key of ["stage_file", "agent_file"]) {
      expect(d.stage[key]).toStartWith(engine);
      expect(existsSync(d.stage[key])).toBe(true);
    }
    for (const f of d.stage.sensor_files) expect(existsSync(f)).toBe(true);
    if (d.stage.knowledge_dir) expect(existsSync(d.stage.knowledge_dir)).toBe(true);
  });
});

describe("model-facing messages name the entry command", () => {
  // A hardcoded `qadlc-orchestrate.ts …` in a message is unrunnable under a
  // plugin install. These are the three messages that tell the model what to run.
  function pluginInstall(): { proj: string; engine: string } {
    const engine = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-msg-")));
    cpSync(join(REPO, "dist", "plugin"), engine, { recursive: true });
    const proj = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-msgp-")));
    mkdirSync(join(proj, ".git"), { recursive: true });
    mkdirSync(join(proj, "features"), { recursive: true });
    return { proj, engine };
  }

  test("detect-scope names `qadlc`, not a tool filename", () => {
    const { proj, engine } = pluginInstall();
    const d = JSON.parse(
      spawnSync(join(engine, "bin", "qadlc"), ["next"], {
        cwd: proj, encoding: "utf-8", env: withoutProjectEnv(),
      }).stdout ?? "{}",
    );
    expect(d.message).toContain("qadlc report --scope");
    expect(d.message).not.toContain("qadlc-orchestrate.ts");
  });

  test("the plan-gate block message names a runnable command", () => {
    const { proj, engine } = pluginInstall();
    const env = { ...withoutProjectEnv(), CLAUDE_PROJECT_DIR: proj };
    spawnSync(join(engine, "bin", "qadlc"), ["report", "--scope", "smoke"], { cwd: proj, env });
    writeFileSync(join(proj, "features", "x.feature"), FEATURE, "utf-8");
    spawnSync("bun", [join(engine, "hooks", "qadlc-audit-logger.ts")], {
      cwd: proj, env, input: JSON.stringify(writeEvent(proj, "features/x.feature")),
    });
    const out = spawnSync("bun", [join(engine, "hooks", "qadlc-stop.ts")], {
      cwd: proj, env, input: "{}", encoding: "utf-8",
    }).stdout ?? "";
    expect(out).toContain('"decision":"block"');
    expect(out).toContain("qadlc report --stage gherkin-plan --approved");
    expect(out).not.toContain("qadlc-orchestrate.ts");
  });

  test("the session-start resume note names a runnable command", () => {
    const { proj, engine } = pluginInstall();
    const env = { ...withoutProjectEnv(), CLAUDE_PROJECT_DIR: proj };
    spawnSync(join(engine, "bin", "qadlc"), ["report", "--scope", "smoke"], { cwd: proj, env });
    const out = spawnSync("bun", [join(engine, "hooks", "qadlc-session-start.ts")], {
      cwd: proj, env, input: JSON.stringify({ hook_event_name: "SessionStart" }), encoding: "utf-8",
    }).stdout ?? "";
    expect(out).toContain("qadlc next");
    expect(out).not.toContain("qadlc-orchestrate.ts");
  });
});

// ---------------------------------------------------------------------------
// 7. Ceding to a vendored install (Phase 5)
// ---------------------------------------------------------------------------
describe("cede to vendored", () => {
  /** A project with BOTH a vendored .claude/ tree and a plugin installed. */
  function bothInstalled(): { proj: string; engine: string } {
    const engine = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-cede-")));
    cpSync(join(REPO, "dist", "plugin"), engine, { recursive: true });
    const proj = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-cedep-")));
    cpSync(DIST_CLAUDE, tree(proj), { recursive: true });
    mkdirSync(join(proj, "features"), { recursive: true });
    // an active v2 session, so nothing else can explain a hook no-op
    spawnSync("bun", [tool(proj, "qadlc-orchestrate.ts"), "report", "--scope", "smoke"], { cwd: proj });
    return { proj, engine };
  }
  const env = (proj: string) => ({ ...withoutProjectEnv(), CLAUDE_PROJECT_DIR: proj });

  test("plugin hooks stand down; the vendored copy still works", () => {
    const { proj, engine } = bothInstalled();
    const before = readFileSync(join(proj, ".qadlc", "audit.md"), "utf-8");
    const ev = JSON.stringify(writeEvent(proj, "features/x.feature"));
    writeFileSync(join(proj, "features", "x.feature"), FEATURE, "utf-8");

    // the PLUGIN's audit-logger must write nothing
    spawnSync("bun", [join(engine, "hooks", "qadlc-audit-logger.ts")], {
      cwd: proj, env: env(proj), input: ev,
    });
    expect(readFileSync(join(proj, ".qadlc", "audit.md"), "utf-8")).toBe(before);

    // the VENDORED audit-logger must still write — ceding is plugin-only
    spawnSync("bun", [hook(proj, "qadlc-audit-logger.ts")], {
      cwd: proj, env: env(proj), input: ev,
    });
    const after = readFileSync(join(proj, ".qadlc", "audit.md"), "utf-8");
    expect(after).not.toBe(before);
    expect(after.match(/## ARTIFACT_/g) ?? []).toHaveLength(1); // exactly once
  });

  test("the plan gate is evaluated once, by the vendored hook only", () => {
    const { proj, engine } = bothInstalled();
    writeFileSync(join(proj, "features", "x.feature"), FEATURE, "utf-8");
    spawnSync("bun", [hook(proj, "qadlc-audit-logger.ts")], {
      cwd: proj, env: env(proj), input: JSON.stringify(writeEvent(proj, "features/x.feature")),
    });
    const pluginStop = spawnSync("bun", [join(engine, "hooks", "qadlc-stop.ts")], {
      cwd: proj, env: env(proj), input: "{}", encoding: "utf-8",
    });
    const vendoredStop = spawnSync("bun", [hook(proj, "qadlc-stop.ts")], {
      cwd: proj, env: env(proj), input: "{}", encoding: "utf-8",
    });
    expect(pluginStop.stdout ?? "").toBe("");                       // ceded
    expect(vendoredStop.stdout ?? "").toContain('"decision":"block"'); // still enforced
  });

  test("sensor-fire and session-end also cede", () => {
    const { proj, engine } = bothInstalled();
    writeFileSync(join(proj, "gherkin_plan.md"), "# Plan\n\n## Story-to-Scenario Mapping\nx\n", "utf-8");
    const before = readFileSync(join(proj, ".qadlc", "audit.md"), "utf-8");
    spawnSync("bun", [join(engine, "hooks", "qadlc-sensor-fire.ts")], {
      cwd: proj, env: env(proj), input: JSON.stringify(writeEvent(proj, "gherkin_plan.md")),
    });
    spawnSync("bun", [join(engine, "hooks", "qadlc-session-end.ts")], {
      cwd: proj, env: env(proj), input: JSON.stringify({ hook_event_name: "SessionEnd" }),
    });
    expect(readFileSync(join(proj, ".qadlc", "audit.md"), "utf-8")).toBe(before);
    expect(existsSync(join(proj, ".qadlc", "sensors"))).toBe(false);
  });

  test("session-start explains the stand-down instead of going quiet", () => {
    const { proj, engine } = bothInstalled();
    const r = spawnSync("bun", [join(engine, "hooks", "qadlc-session-start.ts")], {
      cwd: proj, env: env(proj), input: JSON.stringify({ hook_event_name: "SessionStart" }),
      encoding: "utf-8",
    });
    expect(r.stdout ?? "").toContain("standing down");
    expect(r.stdout ?? "").toContain("qadlc migrate");
    expect(r.status).toBe(0);
  });

  test("doctor reports the stand-down", () => {
    const { proj, engine } = bothInstalled();
    const d = JSON.parse(
      spawnSync(join(engine, "bin", "qadlc"), ["doctor"], {
        cwd: proj, encoding: "utf-8", env: withoutProjectEnv(),
      }).stdout ?? "{}",
    );
    expect(d.message).toContain("STANDING DOWN");
  });

  test("a plugin in a project with NO vendored tree does not cede", () => {
    const engine = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-nocede-")));
    cpSync(join(REPO, "dist", "plugin"), engine, { recursive: true });
    const proj = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-nocedep-")));
    mkdirSync(join(proj, ".git"), { recursive: true });
    mkdirSync(join(proj, "features"), { recursive: true });
    const e = { ...withoutProjectEnv(), CLAUDE_PROJECT_DIR: proj };
    spawnSync(join(engine, "bin", "qadlc"), ["report", "--scope", "smoke"], { cwd: proj, env: e });
    writeFileSync(join(proj, "features", "x.feature"), FEATURE, "utf-8");
    spawnSync("bun", [join(engine, "hooks", "qadlc-audit-logger.ts")], {
      cwd: proj, env: e, input: JSON.stringify(writeEvent(proj, "features/x.feature")),
    });
    expect(readFileSync(join(proj, ".qadlc", "audit.md"), "utf-8")).toContain("ARTIFACT_");
  });

  test("v1 alone does NOT make the plugin cede", () => {
    // v1 is prose-only: no hooks, so nothing can double-fire. Ceding on v1 would
    // make the plugin inert in the very repo it exists to serve, since v1 is
    // committed on main there and therefore present on every branch.
    const engine = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-v1c-")));
    cpSync(join(REPO, "dist", "plugin"), engine, { recursive: true });
    const proj = realpathSync(mkdtempSync(join(tmpdir(), "qadlc-v1cp-")));
    mkdirSync(join(proj, ".git"), { recursive: true });
    mkdirSync(join(proj, ".qa-dlc-rule-details"), { recursive: true });
    mkdirSync(join(proj, "features"), { recursive: true });
    writeFileSync(join(proj, "QA-CLAUDE.md"), "# QA-DLC v1\n", "utf-8");
    const e = { ...withoutProjectEnv(), CLAUDE_PROJECT_DIR: proj };
    spawnSync(join(engine, "bin", "qadlc"), ["report", "--scope", "smoke"], { cwd: proj, env: e });
    const r = spawnSync("bun", [join(engine, "hooks", "qadlc-session-start.ts")], {
      cwd: proj, env: e, input: JSON.stringify({ hook_event_name: "SessionStart" }), encoding: "utf-8",
    });
    expect(r.stdout ?? "").not.toContain("standing down");
    expect(r.stdout ?? "").toContain("v1");   // named, so the user knows which is running
    expect(r.stdout ?? "").toContain("Welcome back");
  });
});

// ---------------------------------------------------------------------------
// 8. Marketplace (Phase 6)
// ---------------------------------------------------------------------------
describe("marketplace", () => {
  const market = JSON.parse(
    readFileSync(join(REPO, ".claude-plugin", "marketplace.json"), "utf-8"),
  );
  const manifest = JSON.parse(
    readFileSync(join(REPO, "dist", "plugin", ".claude-plugin", "plugin.json"), "utf-8"),
  );

  test("the entry name matches the plugin's own name", () => {
    // The marketplace entry name is what `enabledPlugins` keys and what users
    // type; plugin.json's name is what components are namespaced under. They are
    // authored in different places, so pin them together.
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0].name).toBe(manifest.name);
  });

  test("the entry source resolves to the built plugin", () => {
    expect(market.plugins[0].source).toBe("./dist/plugin");
    expect(existsSync(join(REPO, "dist", "plugin", ".claude-plugin", "plugin.json"))).toBe(true);
  });

  test("the entry does NOT set version", () => {
    // plugin.json's version always wins, silently. Setting it in both is how a
    // stale manifest version masks the one you meant to publish.
    expect(market.plugins[0].version).toBeUndefined();
    expect(manifest.version).toBeTruthy();
  });

  test("the marketplace name is not an Anthropic-reserved one", () => {
    const reserved = [
      "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official",
      "claude-plugins-community", "claude-community", "anthropic-marketplace",
      "anthropic-plugins", "agent-skills", "anthropic-agent-skills",
      "knowledge-work-plugins", "life-sciences", "claude-for-legal",
      "claude-for-financial-services", "financial-services-plugins",
      "first-party-plugins", "healthcare",
    ];
    expect(reserved).not.toContain(market.name);
  });

  test("claude plugin validate accepts the marketplace", () => {
    const r = spawnSync("claude", ["plugin", "validate", REPO, "--strict"], {
      encoding: "utf-8",
      timeout: 60_000,
    });
    if (r.error) return; // CLI unavailable — skip silently
    expect(r.stdout ?? "").toContain("Validation passed");
    expect(r.status).toBe(0);
  }, 60_000);
});
