// harness/plugin/emit.ts — the plugin target's structural emissions.
//
// Three files no declarative manifest row can express:
//   .claude-plugin/plugin.json   the plugin manifest
//   hooks/hooks.json             hook registration (settings.json's shape, but
//                                with ${CLAUDE_PLUGIN_ROOT} and exec form)
//   bin/qadlc                    the PATH entry point, mode 0o755
//
// This is exactly the divergence EmitContext was documented for: "a shell's
// native config file or hook registration format".

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EmitContext, EmitResult } from "../../scripts/manifest-types.ts";

/**
 * plugin.json.
 *
 * `version` comes from the repo-root VERSION file, the same source harness.json
 * already uses, so the two can never disagree.
 *
 * THE TRAP THIS CREATES: setting `version` PINS the plugin. Claude Code sees the
 * same string and keeps the cached copy, so pushing commits WITHOUT bumping
 * VERSION ships nothing to existing users. Bumping VERSION is therefore a release
 * step, not an afterthought. The alternative — omitting `version` so the commit
 * SHA becomes the version and every commit is an update — was rejected because it
 * costs `claude plugin validate --strict`, which warns on a missing version and
 * is the CI gate for this target. Local development uses `--plugin-dir`, which
 * bypasses versioning entirely, so the auto-update convenience would only have
 * mattered in a narrow window.
 *
 * Never also set `version` in the marketplace entry: plugin.json wins, silently.
 *
 * Omits `agents` and `skills`. Declaring a path REPLACES the default scan for
 * agents; the default agents/ and skills/ folders are what we ship, so naming
 * them would only create a way to get it wrong.
 */
const PLUGIN_JSON = {
  $schema: "https://json.schemastore.org/claude-code-plugin-manifest.json",
  name: "qadlc",
  displayName: "QADLC",
  description:
    "Plan-first Gherkin/BDD feature-file workflow driven by a deterministic engine. " +
    "Stages, scopes, sensors and a plan-approval gate; team conventions stay in your repo.",
  author: { name: "aniloi" },
  repository: "https://github.com/aniloi/qa-dlc-workflows",
  homepage: "https://github.com/aniloi/qa-dlc-workflows",
  license: "MIT",
  keywords: ["qa", "bdd", "gherkin", "cucumber", "testing", "test-automation"],
};

/**
 * hooks.json — a faithful port of harness/claude/settings.json.
 *
 * Same events, same matcher, same handler order. Two mechanical differences:
 *
 * 1. EXEC FORM. `args` is set on every handler, so Claude Code resolves `bun` on
 *    PATH and spawns it directly with no shell. Path placeholders are substituted
 *    into each arg as plain strings, so nothing needs quoting and no shell
 *    tokenization happens on any platform.
 *
 * 2. ${CLAUDE_PLUGIN_ROOT} instead of a project-relative .claude/ path. This
 *    placeholder DOES resolve in hook commands (it is exported to hook
 *    processes) — unlike in the Bash tool, which is why the conductor's commands
 *    go through bin/qadlc instead.
 *
 * NOT narrowed with per-handler `if` rules yet. That is the real fix for the
 * measured ~180ms-per-hook spawn and it belongs to the perf pass (plan §7.2,
 * Phase 6), where it can be measured: an `if` pattern that fails to match would
 * silently stop the audit-logger and sensors from ever firing, and "silently
 * stopped working" is the one failure mode worth being slow to risk. Phase 1
 * already took the cheap win by moving the health heartbeat behind the no-op
 * checks.
 */
function hooksJson(): unknown {
  const handler = (hook: string, timeout: number): unknown => ({
    type: "command",
    command: "bun",
    args: [`\${CLAUDE_PLUGIN_ROOT}/hooks/${hook}`],
    timeout,
  });

  return {
    $comment:
      "QADLC plugin hooks. Advisory except Stop, which enforces the plan-approval gate " +
      "and checkbox discipline. Exec form (args present) means no shell.",
    hooks: {
      SessionStart: [{ hooks: [handler("qadlc-session-start.ts", 20)] }],
      PostToolUse: [
        {
          matcher: "Write|Edit",
          hooks: [
            handler("qadlc-audit-logger.ts", 20),
            handler("qadlc-sensor-fire.ts", 90),
          ],
        },
      ],
      Stop: [{ hooks: [handler("qadlc-stop.ts", 30)] }],
      // SessionEnd hooks share a 1.5s budget across ALL sources; a longer
      // per-hook timeout raises that budget, so keep this small on purpose.
      SessionEnd: [{ hooks: [handler("qadlc-session-end.ts", 5)] }],
    },
  };
}

function emit(ctx: EmitContext): EmitResult {
  const written: string[] = [];
  const problems: string[] = [];

  const write = (rel: string, body: string, mode?: number): void => {
    const abs = join(ctx.distRoot, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    if (mode !== undefined) chmodSync(abs, mode);
    written.push(abs);
  };

  // VERSION is the single source; harness.json reads the same file.
  let version = "0.0.0";
  try {
    version = readFileSync(join(ctx.repoRoot, "VERSION"), "utf-8").trim() || "0.0.0";
  } catch {
    problems.push("VERSION file unreadable — plugin.json would ship 0.0.0");
  }
  const manifest = { ...PLUGIN_JSON, version };
  write(".claude-plugin/plugin.json", `${JSON.stringify(manifest, null, 2)}\n`);
  write("hooks/hooks.json", `${JSON.stringify(hooksJson(), null, 2)}\n`);

  // bin/qadlc must be executable or Claude Code cannot run it from PATH.
  // writeFileSync does not set a mode, so this chmod is load-bearing — and it is
  // why package.ts --check compares file modes, not just bytes.
  try {
    const src = readFileSync(join(ctx.harnessRoot, "bin-qadlc.ts"), "utf-8");
    write("bin/qadlc", src, 0o755);
  } catch (e) {
    problems.push(`bin/qadlc: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { written, problems };
}

export default emit;
