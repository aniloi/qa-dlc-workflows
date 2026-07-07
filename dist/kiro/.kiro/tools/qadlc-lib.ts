// qadlc-lib.ts — shared, zero-dependency helpers for the QADLC engine, graph
// compiler, state/audit tools, hooks, and sensors. Hand-rolled YAML-frontmatter
// primitives (no external YAML dep) plus path resolution for the workflow's
// runtime artefacts (state, audit, sensor detail files).
//
// Runs under bun from inside a harness dir (.claude/tools/, .kiro/tools/, …).

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Frontmatter parsing (zero-dep)
// ---------------------------------------------------------------------------

export interface Frontmatter {
  /** The raw YAML block between the --- fences. */
  yaml: string;
  /** The markdown body after the closing fence. */
  body: string;
}

/** Split a markdown file into its YAML frontmatter + body. Throws if absent. */
export function parseFrontmatter(raw: string): Frontmatter {
  const cleaned = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const m = cleaned.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error("missing YAML frontmatter (---...---)");
  return { yaml: m[1], body: m[2] ?? "" };
}

/** Read a scalar `key: value` from a YAML block. Returns "" when absent. */
export function scalarField(yaml: string, key: string): string {
  const re = new RegExp(`^${escapeKey(key)}:[ \\t]*(.*)$`, "m");
  const m = yaml.match(re);
  if (!m) return "";
  const v = m[1].trim();
  if (v === "" || v.startsWith("[")) return ""; // empty or an inline list, not a scalar
  return stripQuotes(v);
}

/**
 * Read a list field. Supports both block form:
 *   key:
 *     - a
 *     - b
 * and inline form: `key: [a, b]`. Returns [] when absent or empty.
 */
export function listField(yaml: string, key: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const k = escapeKey(key);
  const headRe = new RegExp(`^${k}:[ \\t]*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headRe);
    if (!m) continue;
    const inline = m[1].trim();
    if (inline.startsWith("[")) return parseInlineList(inline);
    if (inline !== "" && inline !== "[]") return []; // scalar, not a list
    // block form: collect following `  - item` lines
    const out: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const item = lines[j].match(/^[ \t]+-[ \t]*(.*)$/);
      if (item) {
        out.push(stripQuotes(item[1].trim()));
        continue;
      }
      if (/^\S/.test(lines[j])) break; // next top-level key
      if (lines[j].trim() === "") continue;
      break;
    }
    return out;
  }
  return [];
}

function parseInlineList(s: string): string[] {
  const inner = s.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (inner === "") return [];
  return inner.split(",").map((x) => stripQuotes(x.trim())).filter((x) => x !== "");
}

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function escapeKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** ISO 8601 seconds-precision UTC timestamp, e.g. 2026-07-03T20:14:32Z. */
export function isoTimestamp(d: Date = new Date()): string {
  return `${d.toISOString().replace(/\.\d{3}Z$/, "Z")}`;
}

// ---------------------------------------------------------------------------
// Harness + path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the harness directory root (…/.claude, …/.kiro) that a tool is
 * running from. Tools live at <harnessDir>/tools/<tool>.ts, so the harness dir
 * is two levels up from the tool file.
 */
export function harnessDirFromTool(toolUrl: string): string {
  return dirname(dirname(fileURLToPath(toolUrl)));
}

/** The project root (parent of the harness dir). */
export function projectRootFromTool(toolUrl: string): string {
  return dirname(harnessDirFromTool(toolUrl));
}

/** The runtime harness descriptor written by scripts/package.ts. */
export interface HarnessData {
  harnessDir: string;
  rulesSubdir: string;
  /** Framework version, baked from the repo-root VERSION file at package time. */
  version: string;
}

/** Read tools/data/harness.json for this harness (harnessDir, rulesSubdir, version). */
export function harnessData(harnessDir: string): HarnessData {
  const p = join(harnessDir, "tools", "data", "harness.json");
  if (existsSync(p)) {
    try {
      return { version: "0.0.0", ...JSON.parse(readFileSync(p, "utf-8")) };
    } catch {
      /* fall through */
    }
  }
  return { harnessDir: "", rulesSubdir: "rules", version: "0.0.0" };
}

// The workflow's runtime doc root. Kept as aidlc-docs/ to match QADLC v1
// (qa-state.md, audit.md live here).
export const DOCS_DIR = "aidlc-docs";

export function docsRoot(projectRoot: string): string {
  return join(projectRoot, DOCS_DIR);
}
export function statePath(projectRoot: string): string {
  return join(docsRoot(projectRoot), "qa-state.md");
}
export function auditPath(projectRoot: string): string {
  return join(docsRoot(projectRoot), "audit.md");
}
export function planPath(projectRoot: string): string {
  return join(projectRoot, "gherkin_plan.md");
}
/** Per-stage sensor detail-file directory: aidlc-docs/.qadlc-sensors/<slug>/. */
export function sensorsDir(projectRoot: string, stageSlug: string): string {
  return join(docsRoot(projectRoot), ".qadlc-sensors", stageSlug);
}
/** Hook health-heartbeat dir. */
export function hooksHealthDir(harnessDir: string): string {
  return join(harnessDir, "tools", "data", "health");
}

// ---------------------------------------------------------------------------
// Compiled-data loading
// ---------------------------------------------------------------------------

export function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** List *.md files (non-recursive) under a dir, sorted. [] if dir absent. */
export function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => join(dir, f));
}

/** Recursively list *.md files under a dir, sorted. */
export function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Hook input (Claude Code / Kiro adapter shape)
// ---------------------------------------------------------------------------

export interface ClaudeCodeHookInput {
  tool_name?: string;
  tool_input?: { file_path?: string; [k: string]: unknown };
  hook_event_name?: string;
  cwd?: string;
}

export function isClaudeCodeHookInput(x: unknown): x is ClaudeCodeHookInput {
  return typeof x === "object" && x !== null;
}

/**
 * Resolve the project root for a running hook. Prefers the harness's project-dir
 * env var (Claude Code sets $CLAUDE_PROJECT_DIR), else derives it from the hook
 * file location (hooks live at <harnessDir>/hooks/<hook>.ts, so project root is
 * the harness dir's parent).
 */
export function resolveProjectDirFromHook(hookUrl: string): string {
  const env = process.env.CLAUDE_PROJECT_DIR || process.env.KIRO_PROJECT_DIR;
  if (env && env.length > 0) return env;
  return projectRootFromTool(hookUrl);
}

/**
 * Record a hook failure to the health dir so a doctor command can surface it.
 * Never throws — a hook must be a no-op on its own failure.
 */
export function recordHookDrop(projectRoot: string, hook: string, message: string): void {
  try {
    const harness = join(projectRoot, hookHarnessDirName(projectRoot));
    const dir = hooksHealthDir(harness);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "hook-drops.log"), `${isoTimestamp()} ${hook}: ${message}\n`, "utf-8");
  } catch {
    /* swallow — health logging is best-effort */
  }
}

// The harness dir name under the project root. We ship exactly one harness tree
// per install, so pick the first of the known set that exists.
function hookHarnessDirName(projectRoot: string): string {
  for (const name of [".claude", ".kiro", ".codex"]) {
    if (existsSync(join(projectRoot, name))) return name;
  }
  return ".claude";
}
