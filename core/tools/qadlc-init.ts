#!/usr/bin/env bun
// qadlc-init.ts — set up the PROJECT-owned half of a QADLC install.
//
//   bun qadlc-init.ts [--force]
//
// The plugin/project split is the core of the design: the engine (stages,
// scopes, sensors, conductor, agents) is identical in every repo and lives in
// the install tree; the team's vocabulary is not, and lives in the repo:
//
//   .qadlc/memory/team.md      tagging policy, naming, structure conventions
//   .qadlc/memory/project.md   step-definition paths, style reference, kb/
//
// The engine never reads these — the model does, at a path the stage prose
// names. So "discovery" is convention, not configuration: there is no setting to
// point at them, deliberately. A plugin's userConfig is user-scoped and
// pluginConfigs ignores project settings, so a per-project value could not be
// expressed there even if we wanted one.
//
// Copies templates only when the destination is absent. A team's memory is
// hand-authored and is never clobbered by a re-run; --force is opt-in and still
// refuses to overwrite silently.

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { engineRootFromTool, resolveProjectRoot, stateRoot } from "./qadlc-lib.ts";

const MEMORY_FILES = ["team.md", "project.md"];

function templateDir(engineRoot: string): string | null {
  // Plugin layout ships templates/memory/; a vendored tree ships memory/ as
  // engine content, so accept either and let the caller report a miss.
  for (const rel of [join("templates", "memory"), "memory"]) {
    const cand = join(engineRoot, rel);
    if (existsSync(cand)) return cand;
  }
  return null;
}

function main(): void {
  const force = process.argv.includes("--force");
  const engineRoot = engineRootFromTool(import.meta.url);
  const projectRoot = resolveProjectRoot(import.meta.url);
  const out: string[] = [`QADLC init — ${projectRoot}`];
  const rel = (p: string): string => relative(projectRoot, p) || ".";

  const src = templateDir(engineRoot);
  if (!src) {
    process.stderr.write(
      `qadlc init: no memory templates found under ${engineRoot} (looked in templates/memory/ and memory/)\n`,
    );
    process.exit(1);
  }

  const dst = join(stateRoot(projectRoot), "memory");
  mkdirSync(dst, { recursive: true });

  let created = 0;
  let kept = 0;
  const available = readdirSync(src).filter((f) => f.endsWith(".md"));
  for (const name of MEMORY_FILES) {
    if (!available.includes(name)) continue;
    const to = join(dst, name);
    if (existsSync(to) && !force) {
      out.push(`  kept     ${rel(to)} (already yours — not overwritten)`);
      kept++;
      continue;
    }
    if (existsSync(to) && force) {
      out.push(`  REFUSED  ${rel(to)} exists; --force will not silently replace hand-authored memory.`);
      out.push("           Move it aside first if you really want the template back.");
      kept++;
      continue;
    }
    copyFileSync(join(src, name), to);
    out.push(`  created  ${rel(to)}`);
    created++;
  }

  out.push("");
  out.push(`${created} created, ${kept} left alone.`);
  if (created > 0) {
    out.push("Edit these to teach QADLC your team's conventions, then commit them.");
    out.push("A rule in project.md wins over the same rule in team.md.");
  }
  process.stdout.write(`${out.join("\n")}\n`);
}

if (import.meta.main) main();
