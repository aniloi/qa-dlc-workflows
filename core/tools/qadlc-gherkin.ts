// qadlc-gherkin.ts — a small, dependency-free Gherkin parser sufficient for the
// QADLC sensors (lint, tag-policy, duplicate-name, step-existence). Not a full
// Cucumber-compliant parser: it handles Feature, Background, Scenario, Scenario
// Outline, tags, steps (Given/When/Then/And/But/*), and Examples tables — the
// surface the sensors reason about.

export interface Step {
  keyword: string; // Given | When | Then | And | But | *
  text: string;
  line: number;
}

/** One `Examples:` table — its header cells and its data rows. */
export interface ExamplesBlock {
  headers: string[];
  rows: string[][];
}

export interface Scenario {
  type: "Scenario" | "Scenario Outline" | "Background";
  name: string;
  tags: string[];
  steps: Step[];
  examplesRows: number; // data rows under Examples (0 if none / not an outline)
  examples: ExamplesBlock[]; // the tables themselves — step-existence substitutes them
  line: number;
}

export interface Feature {
  name: string;
  tags: string[];
  line: number | null;
  scenarios: Scenario[];
}

const STEP_KEYWORDS = ["Given", "When", "Then", "And", "But", "*"];

export function parseFeature(raw: string): Feature {
  const lines = raw.split(/\r?\n/);
  const feature: Feature = { name: "", tags: [], line: null, scenarios: [] };
  let pendingTags: string[] = [];
  let current: Scenario | null = null;
  let inExamples = false;
  let currentExamples: ExamplesBlock | null = null;

  const pushCurrent = (): void => {
    if (current) feature.scenarios.push(current);
    current = null;
    currentExamples = null;
    inExamples = false;
  };

  // `| a | b |` → ["a", "b"]. Escaped pipes (\|) stay inside their cell.
  const cells = (row: string): string[] =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, "|"));

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    const lineNo = i + 1;

    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("@")) {
      pendingTags.push(...line.split(/\s+/).filter((t) => t.startsWith("@")));
      continue;
    }

    const featureMatch = line.match(/^Feature:\s*(.*)$/);
    if (featureMatch) {
      feature.name = featureMatch[1].trim();
      feature.tags = pendingTags;
      feature.line = lineNo;
      pendingTags = [];
      inExamples = false;
      continue;
    }

    const bgMatch = line.match(/^Background:\s*(.*)$/);
    if (bgMatch) {
      pushCurrent();
      current = { type: "Background", name: bgMatch[1].trim(), tags: [], steps: [], examplesRows: 0, examples: [], line: lineNo };
      pendingTags = [];
      continue;
    }

    const outlineMatch = line.match(/^Scenario Outline:\s*(.*)$/);
    if (outlineMatch) {
      pushCurrent();
      current = { type: "Scenario Outline", name: outlineMatch[1].trim(), tags: pendingTags, steps: [], examplesRows: 0, examples: [], line: lineNo };
      pendingTags = [];
      continue;
    }

    const scenarioMatch = line.match(/^Scenario:\s*(.*)$/);
    if (scenarioMatch) {
      pushCurrent();
      current = { type: "Scenario", name: scenarioMatch[1].trim(), tags: pendingTags, steps: [], examplesRows: 0, examples: [], line: lineNo };
      pendingTags = [];
      continue;
    }

    if (/^Examples:/.test(line)) {
      inExamples = true;
      currentExamples = null; // the next table row is this block's header
      continue;
    }

    // Table rows (Examples data or data tables).
    if (line.startsWith("|")) {
      if (inExamples && current) {
        if (!currentExamples) {
          currentExamples = { headers: cells(line), rows: [] }; // first row = header
          current.examples.push(currentExamples);
        } else {
          currentExamples.rows.push(cells(line)); // subsequent rows = data
          current.examplesRows += 1;
        }
      }
      continue;
    }

    const stepKw = STEP_KEYWORDS.find((k) => line === k || line.startsWith(`${k} `));
    if (stepKw && current) {
      current.steps.push({ keyword: stepKw, text: line.slice(stepKw.length).trim(), line: lineNo });
      inExamples = false;
      currentExamples = null;
      continue;
    }
    // Anything else (docstrings, free text) is ignored by these sensors.
  }
  pushCurrent();
  return feature;
}

/** Concrete (non-Background) scenarios only. */
export function realScenarios(f: Feature): Scenario[] {
  return f.scenarios.filter((s) => s.type !== "Background");
}

/**
 * Every concrete form a step text takes once an outline's Examples rows are
 * substituted for its `<placeholder>`s — what Cucumber actually matches against
 * step definitions. Returns the text unchanged when it carries no placeholder or
 * when no table supplies its columns; a placeholder with no matching header is
 * left in place so callers can fall back to a relaxed match.
 */
export function expandOutlineStep(text: string, examples: ExamplesBlock[]): string[] {
  if (!text.includes("<") || examples.length === 0) return [text];
  const out = new Set<string>();
  for (const block of examples) {
    for (const row of block.rows) {
      let t = text;
      block.headers.forEach((h, i) => {
        if (i < row.length) t = t.split(`<${h}>`).join(row[i]);
      });
      out.add(t);
    }
  }
  return out.size > 0 ? [...out] : [text];
}
