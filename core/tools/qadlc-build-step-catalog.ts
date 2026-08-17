#!/usr/bin/env bun
// qadlc-build-step-catalog.ts — generate the step-existence sensor's oracle from
// the repo's own step definitions. The Step Inventory stage runs this; without it
// the catalog is hand-rolled (or absent, which makes step-existence advisory-pass
// on every file — a check that looks green because it never ran).
//
//   bun qadlc-build-step-catalog.ts --steps-dir src/test/java/com/acme/steps
//   bun qadlc-build-step-catalog.ts --steps-dir a --steps-dir b --out <path>
//   bun qadlc-build-step-catalog.ts --steps-dir a --check    (drift guard, no write)
//
// Default --out is aidlc-docs/.qadlc/step-catalog.json (where the sensor looks).
//
// WHAT IT READS  Cucumber step definitions in Java/Kotlin (`@Given("…")`),
// JS/TS (`Given("…")`, `Given(/…/)`), Python/behave (`@given("…")`), and Ruby
// (`Given(/…/)`).
//
// WHAT IT WRITES  A catalog of *concrete* expressions: every entry is literal
// text plus Cucumber parameter placeholders ({int}/{string}/{word}/{double}/…).
// Legacy Java regex (`^…$`, `"([^"]*)"`, `(\d+)`) is normalized into that same
// vocabulary, and Cucumber optional text (`item(s)`) and alternation (`a/b`) are
// expanded into one entry per concrete form. The sensor therefore never has to
// guess which dialect an entry is written in.
//
// It fails loudly — missing dir, no definitions found — rather than writing an
// empty catalog, because an empty catalog is indistinguishable from a passing one.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const OUT_DEFAULT = join("aidlc-docs", ".qadlc", "step-catalog.json");
const TOOL = "qadlc-build-step-catalog";
/** Cap on concrete forms one expression may expand into (optional × alternation). */
const MAX_VARIANTS = 32;

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** A step expression as written in a definition file, with its dialect. */
export interface RawExpression {
  expr: string;
  /** cucumber = {int}-style; regex = anchored/legacy regex; behave = {name:d}. */
  dialect: "cucumber" | "regex" | "behave";
}

const SOURCE_EXTS = new Set([".java", ".kt", ".kts", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".rb"]);

// Java/Kotlin: @Given("…") / @Then(value = "…")
const JVM_ANNOTATION = /@(?:Given|When|Then|And|But)\s*\(\s*(?:value\s*=\s*)?"((?:[^"\\]|\\.)*)"/g;
// JS/TS: Given("…") / When('…') / Then(`…`) / Given(/…/)  (also defineStep)
const JS_CALL =
  /(?:^|[^\w$.])(?:Given|When|Then|defineStep)\s*\(\s*(?:(['"`])((?:[^\\]|\\.)*?)\1|\/((?:[^/\\\n]|\\.)+)\/[a-z]*)/g;
// Python/behave: @given("…") / @step(u'…')
const PY_DECORATOR = /@(?:given|when|then|step)\s*\(\s*[uUrRbB]*(['"])((?:[^\\]|\\.)*?)\1/g;
// Ruby: Given(/…/) / Given "…"
const RB_STEP =
  /(?:^|[^\w.])(?:Given|When|Then|And|But)\s*\(?\s*(?:\/((?:[^/\\\n]|\\.)+)\/|(['"])((?:[^\\]|\\.)*?)\2)/g;

/** Undo source-level string escaping (\" → ", \\ → \). */
function unescapeStringLiteral(s: string): string {
  return s.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

/** Step expressions declared in one source file, in file order. */
export function extractExpressions(source: string, ext: string): RawExpression[] {
  const out: RawExpression[] = [];
  const push = (expr: string, dialect: RawExpression["dialect"]): void => {
    const trimmed = expr.trim();
    if (trimmed !== "") out.push({ expr: trimmed, dialect });
  };

  if (ext === ".java" || ext === ".kt" || ext === ".kts") {
    for (const m of source.matchAll(JVM_ANNOTATION)) push(unescapeStringLiteral(m[1]), "cucumber");
    return out;
  }
  if (ext === ".py") {
    for (const m of source.matchAll(PY_DECORATOR)) push(unescapeStringLiteral(m[2]), "behave");
    return out;
  }
  if (ext === ".rb") {
    for (const m of source.matchAll(RB_STEP)) {
      if (m[1] !== undefined) push(m[1], "regex");
      else push(unescapeStringLiteral(m[3]), "cucumber");
    }
    return out;
  }
  for (const m of source.matchAll(JS_CALL)) {
    if (m[3] !== undefined) push(m[3], "regex");
    else push(unescapeStringLiteral(m[2]), "cucumber");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalization — any dialect → concrete Cucumber-placeholder expressions
// ---------------------------------------------------------------------------

// Regex capture-group bodies that map onto a Cucumber parameter type.
const GROUP_INT = new Set(["\\d+", "\\d*", "[0-9]+", "-?\\d+", "[+-]?\\d+", "[-+]?\\d+"]);
const GROUP_FLOAT = new Set([
  "\\d+\\.\\d+",
  "\\d*\\.?\\d+",
  "-?\\d+\\.\\d+",
  "-?\\d*\\.?\\d+",
  "\\d+(?:\\.\\d+)?",
  "[0-9]*\\.?[0-9]+",
]);
const GROUP_WORD = new Set(["\\w+", "\\S+", "[^\\s]+", "[a-zA-Z]+", "[A-Za-z]+", "[a-zA-Z_]+", "\\w*"]);

// Unmistakably-regex fragments, for legacy definitions that omit the anchors.
const REGEX_TOKENS = [/\(\[\^/, /\(\\[dwsSWD]/, /\(\.[*+]/, /\(\?:/, /\\\\[dwsSWD]/];

function looksLikeRegex(expr: string): boolean {
  if (expr.startsWith("^") || /(?<!\\)\$$/.test(expr)) return true;
  if (/^\/.*\/[a-z]*$/.test(expr)) return true;
  return REGEX_TOKENS.some((re) => re.test(expr));
}

/** Undo Cucumber-expression escaping: \{ \} \( \) \/ \\ → literal. */
function unescapeCucumber(expr: string): string {
  return expr.replace(/\\([{}()/\\])/g, "$1");
}

/** Undo regex escaping of punctuation, leaving class shorthands (\d, \w) alone. */
function unescapeRegexLiterals(expr: string): string {
  return expr.replace(/\\([^A-Za-z0-9])/g, "$1");
}

/** Split `s` on an unescaped occurrence of `ch`, honouring backslash escapes. */
function splitUnescaped(s: string, ch: string): string[] {
  const parts: string[] = [];
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      buf += s[i] + s[i + 1];
      i++;
      continue;
    }
    if (s[i] === ch) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += s[i];
  }
  parts.push(buf);
  return parts;
}

/** Cartesian product of per-token alternatives, capped at MAX_VARIANTS. */
function combine(parts: string[][], joiner: string): string[] {
  let acc = [""];
  for (const alts of parts) {
    const next: string[] = [];
    for (const prefix of acc) {
      for (const alt of alts) {
        next.push(prefix === "" ? alt : `${prefix}${joiner}${alt}`);
        if (next.length >= MAX_VARIANTS) break;
      }
      if (next.length >= MAX_VARIANTS) break;
    }
    acc = next;
  }
  return acc;
}

/**
 * Expand Cucumber optional text and alternation into concrete forms:
 * `I have {int} cucumber(s)` → both singular and plural; `a cat/dog` → both
 * animals. Escaped `\(` and `\/` are literals and are left alone.
 */
export function expandCucumberVariants(expr: string): string[] {
  const perToken = expr.split(/(\s+)/).map((token) => {
    if (/^\s*$/.test(token)) return [token];
    // Optional text: one variant with the parenthesised text, one without.
    const optional = token.match(/^(.*?)(?<!\\)\(([^()]+)\)(.*)$/);
    let forms = [token];
    if (optional) forms = [`${optional[1]}${optional[2]}${optional[3]}`, `${optional[1]}${optional[3]}`];
    // Alternation: split each form on unescaped `/`.
    const out: string[] = [];
    for (const form of forms) {
      const alts = splitUnescaped(form, "/");
      if (alts.length > 1 && alts.every((a) => a !== "")) out.push(...alts);
      else out.push(form);
    }
    return [...new Set(out)];
  });
  return combine(perToken, "").map((s) => s.trim());
}

/** Find the body of the group starting at `open` (index of `(`), or null. */
function groupBody(expr: string, open: number): { body: string; end: number } | null {
  let depth = 0;
  let inClass = false;
  for (let i = open; i < expr.length; i++) {
    const c = expr[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return { body: expr.slice(open + 1, i), end: i };
    }
  }
  return null;
}

function groupToPlaceholder(body: string): string {
  const inner = body.replace(/^\?:/, "").replace(/^\?<[^>]*>/, "");
  if (GROUP_INT.has(inner)) return "{int}";
  if (GROUP_FLOAT.has(inner)) return "{float}";
  if (GROUP_WORD.has(inner)) return "{word}";
  return "{}"; // anything else: an anonymous slot, matched permissively
}

/**
 * A legacy regex step pattern → the placeholder vocabulary. Literal-optional
 * (`item(s)?`, `(?:s)?`) and literal alternation (`(?:cat|dog)`) expand into
 * concrete forms first; the remaining capture groups become placeholders.
 */
export function regexToExpressions(pattern: string): string[] {
  let body = pattern.replace(/^\/(.*)\/[a-z]*$/, "$1");
  body = body.replace(/^\^/, "").replace(/(?<!\\)\$$/, "");
  const expanded = expandRegexChoices(body);
  const out = new Set<string>();
  for (const variant of expanded) {
    let s = variant.replace(/\\s([*+])/g, " ").replace(/\\s/g, " ");
    let acc = "";
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\") {
        acc += s.slice(i, i + 2);
        i++;
        continue;
      }
      if (s[i] === "(") {
        const g = groupBody(s, i);
        if (g) {
          acc += groupToPlaceholder(g.body);
          i = g.end;
          continue;
        }
      }
      acc += s[i];
    }
    acc = unescapeRegexLiterals(acc)
      .replace(/"\{\}"/g, "{string}")
      .replace(/'\{\}'/g, "{string}")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (acc !== "") out.add(acc);
  }
  return [...out];
}

/**
 * Expand a regex's literal-optional and literal-alternation constructs:
 * `item(s)?` / `(?:s)?` → with and without; `(?:cat|dog)` → each alternative.
 * Groups that are not pure literals are left for the placeholder pass.
 */
function expandRegexChoices(body: string): string[] {
  const frontier = [body];
  const done: string[] = [];
  while (frontier.length > 0 && done.length + frontier.length <= MAX_VARIANTS) {
    const cur = frontier.pop() as string;
    const choice = findLiteralChoice(cur);
    if (!choice) {
      done.push(cur);
      continue;
    }
    for (const alt of choice.alternatives) {
      frontier.push(cur.slice(0, choice.start) + alt + cur.slice(choice.end));
    }
  }
  return [...done, ...frontier];
}

const LITERAL_ONLY = /^[^\\()[\]{}*+?^$|]*$/;

function findLiteralChoice(
  s: string,
): { start: number; end: number; alternatives: string[] } | null {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] !== "(") continue;
    const g = groupBody(s, i);
    if (!g) continue;
    const inner = g.body.replace(/^\?:/, "");
    const optional = s[g.end + 1] === "?";
    const end = optional ? g.end + 2 : g.end + 1;
    const alts = splitUnescaped(inner, "|");
    if (!alts.every((a) => LITERAL_ONLY.test(a))) continue; // leave for the placeholder pass
    if (alts.length > 1) return { start: i, end, alternatives: optional ? [...alts, ""] : alts };
    if (optional) return { start: i, end, alternatives: [inner, ""] };
    continue; // a plain literal group: nothing to choose
  }
  // A bare optional character: `items?`
  const bare = s.match(/(?<!\\)([A-Za-z0-9])\?/);
  if (bare && bare.index !== undefined) {
    return { start: bare.index, end: bare.index + 2, alternatives: [bare[1], ""] };
  }
  return null;
}

/** behave's parse-format types → Cucumber placeholders. */
function behaveToCucumber(expr: string): string {
  return expr.replace(/\{([^{}:]*)(?::([^{}]*))?\}/g, (_all, _name, type) => {
    if (type === undefined) return "{}";
    if (/^\d*d$/.test(type)) return "{int}";
    if (/^[.\d]*[fge]$/.test(type)) return "{float}";
    if (type === "w") return "{word}";
    return "{}";
  });
}

/** One raw expression → every concrete catalog entry it yields. */
export function normalizeExpression(raw: RawExpression): string[] {
  if (raw.dialect === "regex") return regexToExpressions(raw.expr);
  if (raw.dialect === "behave") {
    if (looksLikeRegex(raw.expr)) return regexToExpressions(raw.expr);
    return expandCucumberVariants(behaveToCucumber(raw.expr)).filter((s) => s !== "");
  }
  if (looksLikeRegex(raw.expr)) return regexToExpressions(raw.expr);
  return expandCucumberVariants(raw.expr)
    .map((s) => unescapeCucumber(s))
    .filter((s) => s !== "");
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface CatalogBuild {
  steps: string[];
  /** Step-definition annotations found (before optional/alternation expansion). */
  definitions: number;
  /** Source files that contributed at least one definition. */
  files: number;
}

function walkSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkSources(full));
    else if (SOURCE_EXTS.has(extname(entry))) out.push(full);
  }
  return out;
}

export function buildCatalog(dirs: string[]): CatalogBuild {
  const steps = new Set<string>();
  let definitions = 0;
  let files = 0;
  for (const dir of dirs) {
    for (const file of walkSources(dir)) {
      const raws = extractExpressions(readFileSync(file, "utf-8"), extname(file));
      if (raws.length === 0) continue;
      files++;
      definitions += raws.length;
      for (const raw of raws) for (const step of normalizeExpression(raw)) steps.add(step);
    }
  }
  return { steps: [...steps].sort(), definitions, files };
}

/** The catalog file body. Deterministic — no timestamp, so --check is meaningful. */
function catalogJson(build: CatalogBuild, sources: string[]): string {
  return `${JSON.stringify(
    {
      generated_by: TOOL,
      sources,
      definitions: build.definitions,
      steps: build.steps,
    },
    null,
    2,
  )}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage: ${TOOL} --steps-dir <dir> [--steps-dir <dir>…] [--out <path>] [--check]

  --steps-dir  directory of step definitions (repeatable, required)
  --out        catalog path (default ${OUT_DEFAULT})
  --check      verify the committed catalog is current; write nothing
`;

function main(): void {
  const argv = process.argv.slice(2);
  const dirs: string[] = [];
  let out = OUT_DEFAULT;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--steps-dir") dirs.push(argv[++i] ?? "");
    else if (argv[i] === "--out") out = argv[++i] ?? out;
    else if (argv[i] === "--check") check = true;
    else if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      process.stderr.write(`${TOOL}: unknown argument "${argv[i]}"\n${USAGE}`);
      process.exit(1);
    }
  }

  if (dirs.filter((d) => d !== "").length === 0) {
    process.stderr.write(`${TOOL}: missing required flag: --steps-dir\n${USAGE}`);
    process.exit(1);
  }
  for (const d of dirs) {
    if (!existsSync(d)) {
      process.stderr.write(`${TOOL}: steps dir not found: ${d}\n`);
      process.exit(1);
    }
  }

  const build = buildCatalog(dirs);
  if (build.steps.length === 0) {
    // An empty catalog would make step-existence advisory-pass on everything —
    // a green check that never ran. Fail instead.
    process.stderr.write(
      `${TOOL}: no step definitions found under ${dirs.join(", ")} — ` +
        `is this the steps directory?\n`,
    );
    process.exit(1);
  }

  const sources = dirs.map((d) => relative(process.cwd(), resolve(d)).replace(/\\/g, "/") || ".");
  const body = catalogJson(build, sources);

  if (check) {
    const current = existsSync(out) ? readFileSync(out, "utf-8") : null;
    if (current === null) {
      process.stderr.write(`${TOOL}: no catalog at ${out} (run without --check to write it)\n`);
      process.exit(1);
    }
    if (current !== body) {
      process.stderr.write(`${TOOL}: ${out} is stale — regenerate it\n`);
      process.exit(1);
    }
  } else {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, body, "utf-8");
  }

  process.stdout.write(
    `${JSON.stringify({
      out,
      steps: build.steps.length,
      definitions: build.definitions,
      files: build.files,
      checked: check,
    })}\n`,
  );
}

if (import.meta.main) main();
