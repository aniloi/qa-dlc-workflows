#!/usr/bin/env bun
// qadlc-migrate.ts — move a project's QADLC v2 runtime artefacts out of
// aidlc-docs/ and into .qadlc/.
//
//   bun qadlc-migrate.ts [--dry-run]
//
// WHY THIS EXISTS
// v2 originally wrote qa-state.md and audit.md into aidlc-docs/ "to match QADLC
// v1". That made v1 and v2 fight over two files with incompatible formats: v2's
// writeState() overwrote v1 state wholesale, and both appended to one audit.md.
// Namespacing under .qadlc/ removes the collision structurally. This tool moves
// existing v2 artefacts across.
//
// WHAT IT WILL NOT DO
//   - It never deletes anything. Every move is a rename; conflicts are skipped.
//   - It never touches v1 artefacts. A qa-state.md with no machine block belongs
//     to v1, and gets reported and left exactly where it is: after this migration
//     v2 no longer writes to aidlc-docs/ at all, so v1 keeps working untouched.
//   - It never touches aidlc-docs/inception/. That is an AIDLC INPUT directory
//     which QADLC only reads.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import {
  legacyDocsRoot,
  resolveProjectRoot,
  stateRoot,
} from "./qadlc-lib.ts";

const MACHINE_OPEN = "<!-- qa-state:machine";

interface Move {
  from: string;
  to: string;
  label: string;
}

/** v2 artefacts under the legacy root, in their new homes. */
function plannedMoves(projectRoot: string): Move[] {
  const legacy = legacyDocsRoot(projectRoot);
  const next = stateRoot(projectRoot);
  return [
    { from: join(legacy, "qa-state.md"), to: join(next, "qa-state.md"), label: "session state" },
    { from: join(legacy, "audit.md"), to: join(next, "audit.md"), label: "audit trail" },
    { from: join(legacy, ".qadlc-sensors"), to: join(next, "sensors"), label: "sensor details" },
    { from: join(legacy, ".qadlc-memory"), to: join(next, "diaries"), label: "stage diaries" },
    {
      from: join(legacy, ".qadlc", "step-catalog.json"),
      to: join(next, "step-catalog.json"),
      label: "step catalog",
    },
  ];
}

/**
 * A qa-state.md carrying no machine block was written by QADLC v1. It is not ours
 * to move, and leaving it is now harmless because v2 writes elsewhere.
 */
function isV1State(path: string): boolean {
  try {
    return !readFileSync(path, "utf-8").includes(MACHINE_OPEN);
  } catch {
    return false;
  }
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const projectRoot = resolveProjectRoot(import.meta.url);
  const out: string[] = [];
  /** Paths are reported relative to the project — absolute plugin-cache and
   *  tmpdir paths make the report unreadable. */
  const rel = (p2: string): string => relative(projectRoot, p2) || ".";
  const say = (s: string): void => {
    out.push(s);
  };

  say(`QADLC migration — ${projectRoot}`);
  say(dryRun ? "(dry run: nothing will be written)\n" : "");

  let moved = 0;
  let skipped = 0;

  for (const { from, to, label } of plannedMoves(projectRoot)) {
    if (!existsSync(from)) continue;

    if (from.endsWith("qa-state.md") && isV1State(from)) {
      say(`  left in place  ${label}: ${rel(from)}`);
      say("                 (QADLC v1 state — no machine block. v2 writes to .qadlc/ now,");
      say("                  so both can coexist. Remove it yourself when v1 is retired.)");
      skipped++;
      continue;
    }

    if (existsSync(to)) {
      say(`  SKIPPED        ${label}: ${rel(to)} already exists`);
      skipped++;
      continue;
    }

    if (!dryRun) {
      mkdirSync(stateRoot(projectRoot), { recursive: true });
      renameSync(from, to);
    }
    say(`  ${dryRun ? "would move" : "moved"}      ${label}: ${rel(from)} → ${rel(to)}`);
    moved++;
  }

  // The Phase 1 health dir also moved (out of the install tree). Clean up the
  // stale one so `doctor` does not read a log nothing writes to any more.
  for (const stale of [
    join(projectRoot, ".claude", "tools", "data", "health"),
    join(projectRoot, ".kiro", "tools", "data", "health"),
  ]) {
    if (!existsSync(stale)) continue;
    if (!dryRun) rmSync(stale, { recursive: true, force: true });
    say(`  ${dryRun ? "would remove" : "removed"}    stale hook-health dir: ${rel(stale)}`);
    moved++;
  }

  // Prune the legacy containers we just emptied (the step catalog's .qadlc/ dir,
  // and the sensor/memory dirs if a partial move left them behind). Only ever
  // when empty — a leftover file means something we did not plan for.
  const legacy = legacyDocsRoot(projectRoot);
  for (const name of [".qadlc", ".qadlc-sensors", ".qadlc-memory"]) {
    const dir = join(legacy, name);
    if (!existsSync(dir)) continue;
    if (readdirSync(dir).length > 0) continue;
    if (!dryRun) rmSync(dir, { recursive: true, force: true });
    say(`  ${dryRun ? "would remove" : "removed"}    empty ${rel(dir)}`);
  }

  // Drop the legacy root only when it is genuinely empty. inception/ and anything
  // else a project keeps there must survive.
  if (existsSync(legacy)) {
    const left = readdirSync(legacy);
    if (left.length === 0) {
      if (!dryRun) rmSync(legacy, { recursive: true, force: true });
      say(`  ${dryRun ? "would remove" : "removed"}    empty ${rel(legacy)}`);
    } else {
      say(`  kept           ${rel(legacy)} (still holds: ${left.sort().join(", ")})`);
    }
  }

  if (moved === 0 && skipped === 0) say("  nothing to migrate.");
  say("");
  say(`${moved} change(s), ${skipped} skipped.`);
  if (!dryRun && moved > 0) {
    say("Add .qadlc/health/ to .gitignore if it is not there already.");
  }
  process.stdout.write(`${out.filter((l) => l !== "").join("\n")}\n`);
}

if (import.meta.main) main();
