#!/usr/bin/env bun
// scripts/package.ts — THE build entry for the one-core-N-harnesses layout.
//
//   bun scripts/package.ts             regenerate dist/{claude,kiro,...}
//   bun scripts/package.ts --check     total drift guard (exit 1 on any drift)
//   bun scripts/package.ts <name>      regenerate just one harness
//   bun scripts/package.ts <name> --check
//
// PIPELINE PER HARNESS:
//   1. COPY core/<src> → dist/<name>/<harnessDir>/<dst>, substituting
//      {{HARNESS_DIR}} → harnessDir in .md prose (the ONE transform class) and
//      applying the manifest's rules-dir rename.
//   2. COPY harness/<name>/<src> → dist/<name>/<harnessDir>/<dst> (authored
//      surfaces: orchestrator skill, QA-CLAUDE.md/QA-AGENTS.md, settings), same
//      token substitution on .md. projectRoot files land at the dist tree ROOT.
//   3. RENDER the onboarding doc from core/templates/onboarding.md + fills.
//   4. WRITE tools/data/harness.json (the runtime harness descriptor).
//   5. COMPILE the stage graph if core/tools/qadlc-graph.ts exists (Phase 3+).
//   6. EMIT via harness/<name>/emit.ts if the manifest declares one.
//   7. ORPHAN SCAN: reject any file in dist/<name> not produced above.
//
// --check builds each tree into a temp dir, diffs byte-for-byte against the
// committed dist/, and exits 1 with the offending paths on any drift. dist/
// stays committed; this guard fails CI when someone hand-edits a dist or forgets
// to regenerate.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { EmitContext, HarnessManifest } from "./manifest-types.ts";
import { renderOnboarding } from "./onboarding.ts";
import { compileGraph } from "../core/tools/qadlc-graph.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_ROOT = join(REPO_ROOT, "core");
const HARNESS_ROOT = join(REPO_ROOT, "harness");
const DIST_ROOT = join(REPO_ROOT, "dist");
const ONBOARDING_SKELETON = join(CORE_ROOT, "templates", "onboarding.md");
const HARNESS_TOKEN = /\{\{HARNESS_DIR\}\}/g;
// {{QADLC_CMD}} — the ONE command prose is allowed to name. Substituted from the
// manifest's entryCmd so a stage file never encodes the install layout: a plugin
// has no project-relative path to its engine, and the model cannot expand
// ${CLAUDE_PLUGIN_ROOT} in a Bash command. See core/tools/qadlc.ts.
const CMD_TOKEN = /\{\{QADLC_CMD\}\}/g;
const HARNESS_DATA = "tools/data/harness.json";
/** Any token that must not survive into a built tree. */
const LEFTOVER_TOKEN = /\{\{[A-Z_]+(?::[a-z_]+)?\}\}/g;

// The framework version, read once from the repo-root VERSION file and baked
// into each harness's runtime descriptor (harness.json) so the engine can
// surface it via `next --version` without shipping the VERSION file itself.
function readVersion(): string {
  const p = join(REPO_ROOT, "VERSION");
  return existsSync(p) ? readFileSync(p, "utf-8").trim() || "0.0.0" : "0.0.0";
}

// ---------------------------------------------------------------------------
// Harness discovery: every harness/<name>/ that carries a manifest.ts. Adding a
// harness is one dir + manifest row, zero edits here.
// ---------------------------------------------------------------------------
function discoverHarnessNames(): string[] {
  if (!existsSync(HARNESS_ROOT)) return [];
  return readdirSync(HARNESS_ROOT)
    .filter((n) => existsSync(join(HARNESS_ROOT, n, "manifest.ts")))
    .sort();
}

// ---------------------------------------------------------------------------
// Transform: the ONE class. Token substitution on .md prose; other files copied
// verbatim.
// ---------------------------------------------------------------------------
function substituteToken(s: string, harnessDir: string, entryCmd = ""): string {
  return s.replace(HARNESS_TOKEN, harnessDir).replace(CMD_TOKEN, entryCmd);
}

function applyRulesRename(s: string, harnessDir: string, rulesRename: string | null): string {
  if (!rulesRename) return s;
  return s.replaceAll(`${harnessDir}/rules/`, `${harnessDir}/${rulesRename}/`);
}

function transform(
  srcPath: string,
  content: Buffer,
  harnessDir: string,
  rulesRename: string | null,
  entryCmd = "",
): Buffer {
  if (srcPath.endsWith(".md")) {
    let s = substituteToken(content.toString("utf-8"), harnessDir, entryCmd);
    s = applyRulesRename(s, harnessDir, rulesRename);
    return Buffer.from(s, "utf-8");
  }
  return content;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

// The rules-dir rename also applies to the destination PATH, not just prose: a
// core dir mapped to "rules" lands under the renamed subdir.
function renameDst(dst: string, rulesRename: string | null): string {
  if (!rulesRename) return dst;
  if (dst === "rules") return rulesRename;
  if (dst.startsWith("rules/")) return `${rulesRename}/${dst.slice("rules/".length)}`;
  return dst;
}

// ---------------------------------------------------------------------------
// Build one harness tree into `outRoot`. Returns the set of absolute paths it
// wrote (for the orphan scan + --check byte-diff).
// ---------------------------------------------------------------------------
function buildHarness(m: HarnessManifest, outRoot: string, check: boolean): string[] {
  const written: string[] = [];
  const harnessDirRoot = join(outRoot, m.harnessDir);
  // One definition, used for both the {{QADLC_CMD}} prose substitution and the
  // entryCmd the engine reads back out of harness.json, so prose and runtime can
  // never name different commands.
  const entryCmd = m.entryCmd ?? `bun ${m.harnessDir}/tools/qadlc.ts`;

  // A token that survives into a built tree is a silent bug: the model would be
  // told to run a literal `{{QADLC_CMD}}` or read `{{HARNESS_DIR}}/…`. Worse for
  // the plugin target, where harnessDir is "" — an unsubstituted path token would
  // become an absolute `/tools/…` pointing at the filesystem root. Fail the build
  // instead. {{SLOT:…}}/{{INVOKE}} in the onboarding SKELETON are consumed by the
  // renderer before this sees them.
  const leftovers: string[] = [];
  const emitFile = (absPath: string, content: Buffer): void => {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content);
    written.push(absPath);
    if (absPath.endsWith(".md")) {
      const found = content.toString("utf-8").match(LEFTOVER_TOKEN);
      if (found) {
        leftovers.push(`${relative(outRoot, absPath)}: ${[...new Set(found)].join(", ")}`);
      }
    }
  };

  // 1. core dirs → <harnessDir>/<dst> (renamed for rules).
  for (const { src, dst } of m.coreDirs) {
    const srcDir = join(CORE_ROOT, src);
    if (!existsSync(srcDir)) continue;
    const dstRel = renameDst(dst, m.rulesRename);
    for (const file of walk(srcDir)) {
      const rel = relative(srcDir, file);
      const outPath = join(harnessDirRoot, dstRel, rel);
      emitFile(outPath, transform(file, readFileSync(file), m.harnessDir, m.rulesRename, entryCmd));
    }
  }

  // 2. authored harness files.
  const harnessSrcRoot = join(HARNESS_ROOT, m.name);
  for (const { src, dst, projectRoot } of m.harnessFiles) {
    const srcPath = join(harnessSrcRoot, src);
    if (!existsSync(srcPath)) {
      throw new Error(`[${m.name}] harnessFile missing: harness/${m.name}/${src}`);
    }
    const dstRel = projectRoot ? dst : join(m.harnessDir, renameDst(dst, m.rulesRename));
    const outPath = join(outRoot, dstRel);
    emitFile(outPath, transform(srcPath, readFileSync(srcPath), m.harnessDir, m.rulesRename, entryCmd));
  }

  // 3. onboarding doc.
  if (m.onboarding) {
    const skeleton = readFileSync(ONBOARDING_SKELETON, "utf-8");
    let rendered = renderOnboarding(skeleton, m.onboarding.fills);
    rendered = substituteToken(rendered, m.harnessDir, entryCmd);
    rendered = applyRulesRename(rendered, m.harnessDir, m.rulesRename);
    const dstRel = m.onboarding.projectRoot
      ? m.onboarding.dst
      : join(m.harnessDir, m.onboarding.dst);
    emitFile(join(outRoot, dstRel), Buffer.from(rendered, "utf-8"));
  }

  // 4. harness.json runtime descriptor.
  const harnessData = {
    harnessDir: m.harnessDir,
    rulesSubdir: m.rulesRename ?? "rules",
    version: readVersion(),
    mode: m.mode ?? "vendored",
    entryCmd,
  };
  emitFile(
    join(harnessDirRoot, HARNESS_DATA),
    Buffer.from(`${JSON.stringify(harnessData, null, 2)}\n`, "utf-8"),
  );

  // 5. compile the stage graph into the assembled tree (data-plane mirror).
  //    Runs only once the stage files exist (Phase 3+); a bare tree skips it.
  if (existsSync(join(harnessDirRoot, "qa-common", "stages"))) {
    const { stageGraph, scopeGrid } = compileGraph(harnessDirRoot);
    emitFile(
      join(harnessDirRoot, "tools", "data", "stage-graph.json"),
      Buffer.from(`${JSON.stringify(stageGraph, null, 2)}\n`, "utf-8"),
    );
    emitFile(
      join(harnessDirRoot, "tools", "data", "scope-grid.json"),
      Buffer.from(`${JSON.stringify(scopeGrid, null, 2)}\n`, "utf-8"),
    );
  }

  // 6. emit() plugin (optional, structural divergence).
  if (m.emit) {
    const ctx: EmitContext = {
      repoRoot: REPO_ROOT,
      coreRoot: CORE_ROOT,
      harnessRoot: harnessSrcRoot,
      distRoot: outRoot,
      harnessDir: m.harnessDir,
      substituteToken: (s) => substituteToken(s, m.harnessDir, entryCmd),
      check,
    };
    const result = m.emit(ctx);
    written.push(...result.written);
    // Fatal in BOTH modes. Gated on `check` before, which meant a regenerate
    // could silently ship a tree missing whatever emit() failed to write — the
    // plugin's entry point, for instance.
    if (result.problems.length > 0) {
      throw new Error(`[${m.name}] emit problems:\n  ${result.problems.join("\n  ")}`);
    }
  }

  if (leftovers.length > 0) {
    throw new Error(
      `[${m.name}] unsubstituted token(s) in built output:\n  ${leftovers.join("\n  ")}`,
    );
  }

  return written;
}

// ---------------------------------------------------------------------------
// Orphan scan: every file under a committed dist/<name> must have been produced
// by the build, except files matching the manifest's authoredExempt patterns.
// ---------------------------------------------------------------------------
function orphanScan(m: HarnessManifest, distTree: string, written: Set<string>): string[] {
  if (!existsSync(distTree)) return [];
  const orphans: string[] = [];
  for (const file of walk(distTree)) {
    if (written.has(file)) continue;
    const rel = relative(join(distTree, m.harnessDir), file).replace(/\\/g, "/");
    if (m.authoredExempt.some((re) => re.test(rel))) continue;
    orphans.push(relative(distTree, file).replace(/\\/g, "/"));
  }
  return orphans;
}

// ---------------------------------------------------------------------------
// Regenerate: build directly into dist/<name>.
// ---------------------------------------------------------------------------
function regenerate(m: HarnessManifest): void {
  const outRoot = join(DIST_ROOT, m.name);
  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
  buildHarness(m, outRoot, false);
  process.stdout.write(`  ✓ ${m.name} → dist/${m.name}/\n`);
}

// ---------------------------------------------------------------------------
// Check: build into a temp dir, byte-diff against committed dist/<name>.
// ---------------------------------------------------------------------------
function checkHarness(m: HarnessManifest): string[] {
  const committed = join(DIST_ROOT, m.name);
  const problems: string[] = [];
  const tmp = mkdtempSync(join(tmpdir(), `qadlc-pkg-${m.name}-`));
  try {
    const written = buildHarness(m, tmp, true);
    const writtenRel = new Set(written.map((p) => relative(tmp, p)));

    // Every produced file must exist + match in the committed tree.
    for (const rel of writtenRel) {
      const committedPath = join(committed, rel);
      if (!existsSync(committedPath)) {
        problems.push(`MISSING in dist/${m.name}: ${rel}`);
        continue;
      }
      const a = readFileSync(join(tmp, rel));
      const b = readFileSync(committedPath);
      if (!a.equals(b)) problems.push(`DIFFERS: dist/${m.name}/${rel}`);
      // Modes matter, not just bytes: bin/qadlc is useless without its exec bit,
      // and writeFileSync does not set one. A chmod lost in emit() would ship a
      // plugin whose entry point cannot run, and a byte-only diff would call it
      // clean.
      const modeA = statSync(join(tmp, rel)).mode & 0o777;
      const modeB = statSync(committedPath).mode & 0o777;
      if (modeA !== modeB) {
        problems.push(
          `MODE DIFFERS: dist/${m.name}/${rel} (${modeB.toString(8)} != ${modeA.toString(8)})`,
        );
      }
    }

    // Orphan scan against the committed tree.
    const committedWritten = new Set([...writtenRel].map((rel) => join(committed, rel)));
    for (const orphan of orphanScan(m, committed, committedWritten)) {
      problems.push(`ORPHAN in dist/${m.name}: ${orphan}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
async function loadManifest(name: string): Promise<HarnessManifest> {
  const mod = await import(join(HARNESS_ROOT, name, "manifest.ts"));
  return mod.default as HarnessManifest;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const named = args.filter((a) => !a.startsWith("--"));
  const names = named.length > 0 ? named : discoverHarnessNames();

  if (names.length === 0) {
    process.stderr.write("No harnesses found under harness/*/manifest.ts\n");
    process.exit(1);
  }

  if (check) {
    process.stdout.write(`Checking ${names.length} harness(es) for drift…\n`);
    const allProblems: string[] = [];
    for (const name of names) {
      const m = await loadManifest(name);
      const problems = checkHarness(m);
      if (problems.length === 0) process.stdout.write(`  ✓ ${name} clean\n`);
      else allProblems.push(...problems.map((p) => `[${name}] ${p}`));
    }
    if (allProblems.length > 0) {
      process.stderr.write(`\nDRIFT DETECTED (${allProblems.length}):\n`);
      for (const p of allProblems) process.stderr.write(`  ${p}\n`);
      process.stderr.write(`\nRun \`bun scripts/package.ts\` to regenerate.\n`);
      process.exit(1);
    }
    process.stdout.write("\nNo drift. dist/ is in sync with core/ + harness/.\n");
    return;
  }

  process.stdout.write(`Packaging ${names.length} harness(es)…\n`);
  for (const name of names) {
    const m = await loadManifest(name);
    regenerate(m);
  }
  process.stdout.write("Done.\n");
}

if (import.meta.main) {
  main().catch((e) => {
    process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    process.exit(1);
  });
}
