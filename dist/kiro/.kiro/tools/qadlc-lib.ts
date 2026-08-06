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
import { dirname, join, resolve, sep } from "node:path";
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
// The three roots
// ---------------------------------------------------------------------------
// ENGINE_ROOT   the install tree the code is running from (…/.claude, …/.kiro,
//               or a plugin directory under ~/.claude/plugins/cache/).
// PROJECT_ROOT  the user's repository. NEVER derived from the engine's location
//               in plugin mode — a plugin's parent directory is the cache, not
//               a project.
// STATE_ROOT    <PROJECT_ROOT>/.qadlc — every mutable artefact.
//
// THE INVARIANT: the install tree is READ-ONLY. A plugin cache is shared across
// every project and replaced on upgrade (old version dirs are deleted ~14 days
// later), so anything written there is both leaky and ephemeral.

/**
 * Resolve the engine root that a tool or hook is running from. Tools live at
 * <engineRoot>/tools/<tool>.ts and hooks at <engineRoot>/hooks/<hook>.ts, so the
 * engine root is two levels up either way. Identical under a vendored install
 * and a plugin install — only what it points AT changes.
 */
export function engineRootFromTool(toolUrl: string): string {
  return dirname(dirname(fileURLToPath(toolUrl)));
}

/** @deprecated Renamed to engineRootFromTool. Kept for one release. */
export const harnessDirFromTool = engineRootFromTool;

/** The mutable-state root. Everything QADLC writes lives under here. */
export const STATE_DIR = ".qadlc";

export function stateRoot(projectRoot: string): string {
  return join(projectRoot, STATE_DIR);
}

/** The runtime harness descriptor written by scripts/package.ts. */
export interface HarnessData {
  harnessDir: string;
  rulesSubdir: string;
  /** Framework version, baked from the repo-root VERSION file at package time. */
  version: string;
  /**
   * "vendored" — the engine tree lives inside the project (.claude/, .kiro/).
   * "plugin"   — the engine tree is a shared, read-only plugin install.
   * Gates exactly one thing: whether the project root may be derived from the
   * engine's own location.
   */
  mode: "vendored" | "plugin";
  /** The command string the engine tells the conductor to run. */
  entryCmd: string;
}

/** Read tools/data/harness.json for this engine tree. */
export function harnessData(engineRoot: string): HarnessData {
  const p = join(engineRoot, "tools", "data", "harness.json");
  if (existsSync(p)) {
    try {
      return {
        version: "0.0.0",
        mode: "vendored",
        entryCmd: "",
        ...JSON.parse(readFileSync(p, "utf-8")),
      };
    } catch {
      /* fall through */
    }
  }
  return {
    harnessDir: "",
    rulesSubdir: "rules",
    version: "0.0.0",
    mode: "vendored",
    entryCmd: "",
  };
}

/**
 * The command string to put in front of the model. Every message that tells the
 * model what to run must go through this: a hardcoded `qadlc-orchestrate.ts …`
 * is unrunnable under a plugin install, where the engine has no
 * project-relative path and the Bash tool cannot expand ${CLAUDE_PLUGIN_ROOT}.
 */
export function entryCommand(engineRoot: string): string {
  const hd = harnessData(engineRoot);
  return hd.entryCmd || `bun ${hd.harnessDir || ".claude"}/tools/qadlc.ts`;
}

// ---------------------------------------------------------------------------
// Project-root resolution
// ---------------------------------------------------------------------------

/** Marketplace plugins are copied here; nothing under it is ever a project. */
const PLUGIN_CACHE = "/.claude/plugins/cache/";

/**
 * Resolve the project root for a tool or a hook. One function for both: there is
 * no reason they should disagree, and the old split (projectRootFromTool for
 * tools, an env-first path for hooks) is exactly what broke under a plugin.
 *
 * Ladder, first hit wins:
 *   1. $QADLC_PROJECT_ROOT              explicit override (tests, CI, scripts)
 *   2. $CLAUDE_PROJECT_DIR / $KIRO_PROJECT_DIR
 *                                       set for hook processes
 *   3. vendored mode only: the engine's parent directory
 *   4. walk up from cwd for .qadlc/, then for .git/
 *   5. cwd
 *
 * Step 4 is what makes plugin mode work. Tools are invoked by the model through
 * the Bash tool, where $CLAUDE_PROJECT_DIR is NOT exported, so bare cwd would
 * silently write state to the wrong place the moment the model cd's into a
 * subdirectory. .qadlc/ is checked across the whole ancestry before .git/ so an
 * initialized QADLC project always beats an enclosing repo.
 *
 * Throws when the result cannot be a project (see assertUsableProjectRoot).
 */
export function resolveProjectRoot(toolUrl: string): string {
  const engineRoot = engineRootFromTool(toolUrl);
  const candidate = projectRootCandidate(engineRoot);
  assertUsableProjectRoot(candidate, engineRoot);
  return candidate;
}

/**
 * resolveProjectRoot for hooks: a hook must never fail loudly on its own
 * inability to locate the project, so an unusable root is a silent no-op.
 */
export function resolveProjectRootOrExit(toolUrl: string): string {
  try {
    return resolveProjectRoot(toolUrl);
  } catch {
    process.exit(0);
  }
}

function projectRootCandidate(engineRoot: string): string {
  const explicit = process.env.QADLC_PROJECT_ROOT;
  if (explicit && explicit.length > 0) return resolve(explicit);

  const env = process.env.CLAUDE_PROJECT_DIR || process.env.KIRO_PROJECT_DIR;
  if (env && env.length > 0) return resolve(env);

  if (harnessData(engineRoot).mode !== "plugin") return dirname(engineRoot);

  return walkUpForProject(process.cwd());
}

function walkUpForProject(start: string): string {
  for (const marker of [STATE_DIR, ".git"]) {
    let dir = resolve(start);
    for (;;) {
      if (existsSync(join(dir, marker))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return resolve(start);
}

/**
 * Reject a "project root" that is really the install tree. This is the guardrail
 * against the exact class of bug this resolver exists to fix: cheap, and it makes
 * a silent regression impossible.
 */
export function assertUsableProjectRoot(projectRoot: string, engineRoot: string): void {
  const r = resolve(projectRoot);
  const e = resolve(engineRoot);
  const posix = `${r.replace(/\\/g, "/")}/`;
  const inEngine = r === e || r.startsWith(`${e}${sep}`);
  if (inEngine || posix.includes(PLUGIN_CACHE)) {
    throw new Error(
      "QADLC could not determine your project root; it resolved to the engine " +
        `install directory (${r}). Run from inside your project, or set ` +
        "QADLC_PROJECT_ROOT.",
    );
  }
}

// ---------------------------------------------------------------------------
// Runtime artefact paths — all under .qadlc/ (see STATE_DIR above)
// ---------------------------------------------------------------------------
// These used to live in aidlc-docs/, a directory QADLC v1 also owns and writes
// differently. That compatibility choice made v1 and v2 fight over qa-state.md
// and audit.md; namespacing under .qadlc/ removes the collision structurally
// rather than guarding against it.
//
// NOT moved: aidlc-docs/inception/user-stories/ is an AIDLC INPUT directory that
// QADLC only ever reads. It is someone else's namespace and stays where it is.

/** The legacy root. Retained only so `qadlc-migrate.ts` can find what to move. */
export const LEGACY_DOCS_DIR = "aidlc-docs";

export function legacyDocsRoot(projectRoot: string): string {
  return join(projectRoot, LEGACY_DOCS_DIR);
}

export function statePath(projectRoot: string): string {
  return join(stateRoot(projectRoot), "qa-state.md");
}
export function auditPath(projectRoot: string): string {
  return join(stateRoot(projectRoot), "audit.md");
}
/** The plan stays at the project root: it is a human-reviewed deliverable. */
export function planPath(projectRoot: string): string {
  return join(projectRoot, "gherkin_plan.md");
}
/** Per-stage sensor detail-file directory: .qadlc/sensors/<slug>/. */
export function sensorsDir(projectRoot: string, stageSlug: string): string {
  return join(stateRoot(projectRoot), "sensors", stageSlug);
}
/**
 * Per-stage conductor diary: .qadlc/diaries/<slug>/memory.md.
 *
 * Named "diaries", not "memory": .qadlc/memory/ is reserved for the project's
 * hand-authored team.md / project.md, which a plugin install materializes there.
 * The old path (.qadlc-memory/) would have collided with it.
 */
export function diaryDir(projectRoot: string, stageSlug: string): string {
  return join(stateRoot(projectRoot), "diaries", stageSlug);
}
/** The step-inventory oracle consumed by the step-existence sensor. */
export function stepCatalogPath(projectRoot: string): string {
  return join(stateRoot(projectRoot), "step-catalog.json");
}
/**
 * Hook health-heartbeat dir. Takes the PROJECT root, not the engine root: this
 * used to write to <engineRoot>/tools/data/health/, the one place the engine
 * wrote into its own install tree. Under a plugin that tree is shared across
 * projects and replaced on upgrade.
 */
export function hooksHealthDir(projectRoot: string): string {
  return join(stateRoot(projectRoot), "health");
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

// ---------------------------------------------------------------------------
// Ceding to a vendored install
// ---------------------------------------------------------------------------

/** Harness dirs that can hold a vendored QADLC tree. */
const VENDOR_DIRS = [".claude", ".kiro", ".codex"];

/**
 * True when this project carries its own vendored QADLC engine.
 *
 * Detected by the presence of a qadlc-*.ts HOOK in a harness dir, not by the
 * tools dir: hooks are what a project's settings.json registers, and hooks are
 * what would double-fire.
 */
export function vendoredInstallPresent(projectRoot: string): boolean {
  for (const dir of VENDOR_DIRS) {
    const hooks = join(projectRoot, dir, "hooks");
    if (!existsSync(hooks)) continue;
    try {
      if (readdirSync(hooks).some((f) => f.startsWith("qadlc-") && f.endsWith(".ts"))) return true;
    } catch {
      /* unreadable — treat as absent */
    }
  }
  return false;
}

/** True when QADLC v1 is installed in this project (prose-only: no hooks). */
export function v1InstallPresent(projectRoot: string): boolean {
  return existsSync(join(projectRoot, ".qa-dlc-rule-details"));
}

/**
 * Should a PLUGIN hook stand down for this project?
 *
 * Plugin hooks and a project's own settings.json hooks do NOT deduplicate — not
 * even byte-identical ones; the platform keeps a plugin's copy separate on
 * purpose. So with a user-scope plugin installed and a vendored tree still in the
 * repo, every QADLC hook fires twice per event: duplicate audit entries,
 * duplicate sensor findings, the plan gate evaluated twice. The vendored copy
 * wins while it exists, which makes a half-migrated repo behave like a
 * pre-migration one rather than a doubled one.
 *
 * Only plugin-mode hooks cede. A vendored hook obviously must not stand down on
 * finding its own tree.
 *
 * DELIBERATELY NOT EXTENDED TO v1, though an earlier draft of the plan said to.
 * v1 ships `.qa-dlc-rule-details/` and a QA-CLAUDE.md — prose, no hooks — so it
 * cannot double-fire anything. Ceding on v1 detection would instead make the
 * plugin inert in precisely the repo it exists to serve: v1 is committed on
 * `main` in the target repo, so it is present on every branch. v1's real overlap
 * with v2 is the TRIGGER, which the skill's description handles.
 */
export function shouldCedeToVendored(engineRoot: string, projectRoot: string): boolean {
  if (harnessData(engineRoot).mode !== "plugin") return false;
  return vendoredInstallPresent(projectRoot);
}

/**
 * Record a hook failure to the health dir so a doctor command can surface it.
 * Never throws — a hook must be a no-op on its own failure.
 */
export function recordHookDrop(projectRoot: string, hook: string, message: string): void {
  try {
    const dir = hooksHealthDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "hook-drops.log"), `${isoTimestamp()} ${hook}: ${message}\n`, "utf-8");
  } catch {
    /* swallow — health logging is best-effort */
  }
}
