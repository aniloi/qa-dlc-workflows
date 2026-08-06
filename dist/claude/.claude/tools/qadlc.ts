#!/usr/bin/env bun
// qadlc.ts — the single entry point for every QADLC command.
//
// WHY THIS EXISTS
// Prose has to tell the model what to run. Before this dispatcher, each stage
// file named a tool by path — `bun .claude/tools/qadlc-orchestrate.ts next` —
// which encodes the install layout into 17 places across 20 documents. A plugin
// install has no project-relative path to the engine at all: the tree lives in a
// cache whose location changes on every upgrade, and ${CLAUDE_PLUGIN_ROOT} is
// exported to hook processes but NOT to the Bash tool the model runs commands in.
//
// So prose names ONE command and the packager substitutes it per target:
//   plugin    qadlc                        (bin/qadlc, on the Bash tool's PATH)
//   vendored  bun .claude/tools/qadlc.ts   (or .kiro/…)
//
// THIS FILE RUNS FROM TWO LOCATIONS. The plugin target emits a byte-identical
// copy at bin/qadlc, because the engine root is dirname(dirname(url)) from both
// <root>/tools/qadlc.ts and <root>/bin/qadlc — the same two-levels-up shape
// engineRootFromTool() already relies on. One source, no extra process hop.
//
//   qadlc next|report [flags]      the engine (qadlc-orchestrate.ts)
//   qadlc state <sub>              session state
//   qadlc audit <sub>              audit trail
//   qadlc sensor --stage --file-path
//                                  run every sensor bound to a stage
//   qadlc sensor-run <id> …        run one sensor by id
//   qadlc graph <sub>              recompile the stage graph (harness authors)
//   qadlc init                     materialize .qadlc/memory/ in this project
//   qadlc migrate [--dry-run]      move legacy aidlc-docs/ artefacts
//   qadlc validate                 state-integrity check
//   qadlc doctor | --version       shorthands for `next --doctor` / `--version`

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Subcommand → the module that implements it, relative to the engine root. */
const ROUTES: Record<string, string> = {
  next: "tools/qadlc-orchestrate.ts",
  report: "tools/qadlc-orchestrate.ts",
  state: "tools/qadlc-state.ts",
  audit: "tools/qadlc-audit.ts",
  sensor: "tools/qadlc-sensor.ts",
  graph: "tools/qadlc-graph.ts",
  init: "tools/qadlc-init.ts",
  migrate: "tools/qadlc-migrate.ts",
  validate: "hooks/qadlc-validate-state.ts",
};

const USAGE = `qadlc — QADLC engine

  qadlc next [flags]              ask the engine for the next directive
  qadlc report <flags>            record a stage/gate outcome
  qadlc state <show|init|set|complete>
  qadlc audit <init|append>
  qadlc sensor --stage <s> --file-path <p>      all sensors bound to a stage
  qadlc sensor-run <id> --stage <s> --file-path <p>   one sensor
  qadlc graph compile             recompile the stage graph
  qadlc init                      set up .qadlc/memory/ in this project
  qadlc migrate [--dry-run]       move legacy aidlc-docs/ artefacts
  qadlc validate                  check state against the compiled graph
  qadlc doctor                    environment & setup check
  qadlc --version
`;

function run(rel: string, args: string[]): never {
  const r = spawnSync("bun", [join(ENGINE_ROOT, rel), ...args], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

const argv = process.argv.slice(2);
const sub = argv[0] ?? "";

// Shorthands: the two things a user reaches for before learning the vocabulary.
if (sub === "doctor") run(ROUTES.next, ["next", "--doctor"]);
if (sub === "--version" || sub === "-v" || sub === "version") {
  run(ROUTES.next, ["next", "--version"]);
}
if (sub === "" || sub === "--help" || sub === "-h" || sub === "help") {
  process.stdout.write(USAGE);
  process.exit(0);
}

// One sensor by id. The sensor manifests document themselves with this form, so
// it has to work in both install modes.
if (sub === "sensor-run") {
  const id = argv[1] ?? "";
  if (!id || id.startsWith("-")) {
    process.stderr.write("qadlc sensor-run: expected a sensor id\n");
    process.exit(2);
  }
  run(`tools/qadlc-sensor-${id}.ts`, argv.slice(2));
}

const route = ROUTES[sub];
if (!route) {
  process.stderr.write(`qadlc: unknown subcommand "${sub}"\n\n${USAGE}`);
  process.exit(2);
}

// next/report are subcommands OF the engine, so they keep their own name in the
// forwarded argv; everything else is a distinct tool and drops it.
run(route, sub === "next" || sub === "report" ? argv : argv.slice(1));
