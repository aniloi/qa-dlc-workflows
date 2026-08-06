#!/usr/bin/env bun
// bin/qadlc — the plugin's single stable entry point.
//
// Claude Code adds a plugin's bin/ to the Bash tool's PATH, so the conductor
// runs `qadlc next` regardless of where the plugin is installed. That matters
// because there is no other portable way to name the engine from inside a Bash
// command: ${CLAUDE_PLUGIN_ROOT} is exported to hook processes and MCP/LSP
// subprocesses, NOT to the Bash tool, and the cache path changes on every
// upgrade. One bare command also keeps absolute cache paths out of the audit
// trail and out of the stage prose.
//
//   qadlc next|report [flags]   the engine (qadlc-orchestrate.ts)
//   qadlc state <sub>           session state
//   qadlc audit <sub>           audit trail
//   qadlc sensor [flags]        sensor dispatcher
//   qadlc init                  materialize <project>/.qadlc/memory/ templates
//   qadlc migrate [--dry-run]   move legacy aidlc-docs/ artefacts
//   qadlc validate              state-integrity check
//   qadlc doctor | --version    shorthands for `next --doctor` / `next --version`
//
// This file sits at <pluginRoot>/bin/qadlc, so the plugin root is two levels up
// — the same shape engineRootFromTool() already resolves for tools and hooks.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Subcommand → the module that implements it, relative to the plugin root. */
const ROUTES: Record<string, string> = {
  next: "tools/qadlc-orchestrate.ts",
  report: "tools/qadlc-orchestrate.ts",
  state: "tools/qadlc-state.ts",
  audit: "tools/qadlc-audit.ts",
  sensor: "tools/qadlc-sensor.ts",
  init: "tools/qadlc-init.ts",
  migrate: "tools/qadlc-migrate.ts",
  validate: "hooks/qadlc-validate-state.ts",
};

const USAGE = `qadlc — QADLC engine

  qadlc next [flags]              ask the engine for the next directive
  qadlc report <flags>            record a stage/gate outcome
  qadlc state <show|init|set|complete>
  qadlc audit <init|append>
  qadlc sensor --stage <s> --file-path <p>
  qadlc init                      set up .qadlc/memory/ in this project
  qadlc migrate [--dry-run]       move legacy aidlc-docs/ artefacts
  qadlc validate                  check state against the compiled graph
  qadlc doctor                    environment & setup check
  qadlc --version
`;

function run(rel: string, args: string[]): never {
  const r = spawnSync("bun", [join(PLUGIN_ROOT, rel), ...args], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

const argv = process.argv.slice(2);
const sub = argv[0] ?? "";

// Shorthands: `qadlc doctor` and `qadlc --version` are the two things a user
// reaches for before they know the directive vocabulary.
if (sub === "doctor") run(ROUTES.next, ["next", "--doctor"]);
if (sub === "--version" || sub === "-v" || sub === "version") {
  run(ROUTES.next, ["next", "--version"]);
}
if (sub === "" || sub === "--help" || sub === "-h" || sub === "help") {
  process.stdout.write(USAGE);
  process.exit(0);
}

const route = ROUTES[sub];
if (!route) {
  process.stderr.write(`qadlc: unknown subcommand "${sub}"\n\n${USAGE}`);
  process.exit(2);
}

// next/report are subcommands OF the engine, so they keep their own name in the
// forwarded argv; everything else is a distinct tool and drops it.
run(route, sub === "next" || sub === "report" ? argv : argv.slice(1));
