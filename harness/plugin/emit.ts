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
  // Every handler runs behind qadlc-preflight.sh, the port of the same wrapping
  // harness/claude/settings.json uses. `sh` becomes the spawned binary and the
  // script its first arg, so this stays exec form — no shell, nothing to quote.
  //
  // With bun present the wrapper execs through, passing stdout and exit status
  // untouched, so Stop's decision:block still reaches Claude Code. With bun
  // missing, SessionStart says so once (--brief) and the per-turn hooks stay
  // silent (--quiet) instead of emitting `command not found` on every edit in a
  // project that may not be running QADLC at all. Silence costs no enforcement:
  // a hook that cannot start fails open however loudly it exits.
  const handler = (hook: string, timeout: number, verbosity: "--brief" | "--quiet"): unknown => ({
    type: "command",
    command: "sh",
    args: [
      "${CLAUDE_PLUGIN_ROOT}/tools/qadlc-preflight.sh",
      verbosity,
      "bun",
      `\${CLAUDE_PLUGIN_ROOT}/hooks/${hook}`,
    ],
    timeout,
  });

  return {
    $comment:
      "QADLC plugin hooks. Advisory except Stop, which enforces the plan-approval gate " +
      "and checkbox discipline. Exec form (args present) means no shell. Every handler " +
      "runs behind qadlc-preflight.sh, which execs straight through when bun is present " +
      "(stdout and exit status pass untouched, so Stop's decision:block still lands) and, " +
      "when bun is missing, reports once at SessionStart (--brief) while the per-turn " +
      "hooks stay silent (--quiet).",
    hooks: {
      SessionStart: [{ hooks: [handler("qadlc-session-start.ts", 20, "--brief")] }],
      PostToolUse: [
        {
          matcher: "Write|Edit",
          hooks: [
            handler("qadlc-audit-logger.ts", 20, "--quiet"),
            handler("qadlc-sensor-fire.ts", 90, "--quiet"),
          ],
        },
      ],
      Stop: [{ hooks: [handler("qadlc-stop.ts", 30, "--quiet")] }],
      // SessionEnd hooks share a 1.5s budget across ALL sources; a longer
      // per-hook timeout raises that budget, so keep this small on purpose.
      SessionEnd: [{ hooks: [handler("qadlc-session-end.ts", 5, "--quiet")] }],
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

  // bin/qadlc is a byte-identical copy of core/tools/qadlc.ts. The dispatcher
  // resolves the engine root as dirname(dirname(import.meta.url)), which is the
  // plugin root from BOTH <root>/tools/qadlc.ts and <root>/bin/qadlc — so one
  // source serves both locations with no extra process hop.
  //
  // The exec bit is load-bearing: Claude Code puts bin/ on the Bash tool's PATH,
  // and writeFileSync sets no mode. package.ts --check compares modes for exactly
  // this reason.
  try {
    const src = readFileSync(join(ctx.coreRoot, "tools", "qadlc.ts"), "utf-8");
    write("bin/qadlc", src, 0o755);
  } catch (e) {
    problems.push(`bin/qadlc: ${e instanceof Error ? e.message : String(e)}`);
  }

  // bin/qadlc-preflight — the same trick for the same reason, one level simpler.
  // The conductor must be able to run the preflight from the Bash tool, and the
  // Bash tool cannot expand ${CLAUDE_PLUGIN_ROOT}, so the only reachable place
  // is bin/ (which Claude Code puts on that PATH). The manifest's preflightCmd
  // names it, so prose and this emission cannot drift apart.
  //
  // It is a byte-identical copy of tools/qadlc-preflight.sh, which also ships —
  // hooks reference the tools/ copy, since ${CLAUDE_PLUGIN_ROOT} DOES resolve
  // for them. Unlike bin/qadlc this needs no path self-location: it only probes
  // for bun and, when present, execs the argv it was handed.
  try {
    const src = readFileSync(join(ctx.coreRoot, "tools", "qadlc-preflight.sh"), "utf-8");
    write("bin/qadlc-preflight", src, 0o755);
  } catch (e) {
    problems.push(`bin/qadlc-preflight: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { written, problems };
}

export default emit;
