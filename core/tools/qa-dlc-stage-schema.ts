// qa-dlc-stage-schema.ts — the stage-file frontmatter contract. Sibling of
// qa-dlc-scope-schema.ts and qa-dlc-sensor-schema.ts. Consumed by
// qa-dlc-graph.ts (compile). Hand-rolled, zero-dep — reuses the frontmatter
// primitives from qa-dlc-lib.ts.
//
// A stage is a node of the workflow graph: what happens, who leads it, what it
// consumes/produces, which scopes include it, which sensors fire on its outputs.

import { listField, parseFrontmatter, scalarField } from "./qa-dlc-lib.ts";

export type Execution = "ALWAYS" | "CONDITIONAL" | "SKIP";
export type Mode = "inline" | "subagent";
export type Phase = "discovery" | "execution";

export interface StageDefinition {
  slug: string;
  phase: Phase;
  execution: Execution;
  condition: string;
  lead_agent: string;
  support_agents: string[];
  mode: Mode;
  reviewer: string;
  reviewer_max_iterations: number;
  /** This stage is an approval GATE (the workflow blocks here until approved). */
  gate: boolean;
  /** This stage iterates once per unit (per feature file). */
  foreach: boolean;
  produces: string[];
  consumes: string[];
  requires_stage: string[];
  sensors: string[];
  scopes: string[];
  inputs: string;
  outputs: string;
  /** Ordering hint within the phase (lower runs first). */
  order: number;
}

const PHASES: Phase[] = ["discovery", "execution"];
const EXECUTIONS: Execution[] = ["ALWAYS", "CONDITIONAL", "SKIP"];
const MODES: Mode[] = ["inline", "subagent"];

export function parseStage(raw: string): StageDefinition {
  const { yaml } = parseFrontmatter(raw);
  const num = (k: string, dflt: number): number => {
    const v = scalarField(yaml, k);
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? dflt : n;
  };
  const bool = (k: string): boolean => scalarField(yaml, k).toLowerCase() === "true";

  return {
    slug: scalarField(yaml, "slug"),
    phase: scalarField(yaml, "phase") as Phase,
    execution: (scalarField(yaml, "execution") || "ALWAYS") as Execution,
    condition: scalarField(yaml, "condition"),
    lead_agent: scalarField(yaml, "lead_agent"),
    support_agents: listField(yaml, "support_agents"),
    mode: (scalarField(yaml, "mode") || "inline") as Mode,
    reviewer: scalarField(yaml, "reviewer"),
    reviewer_max_iterations: num("reviewer_max_iterations", 0),
    gate: bool("gate"),
    foreach: bool("foreach"),
    produces: listField(yaml, "produces"),
    consumes: listField(yaml, "consumes"),
    requires_stage: listField(yaml, "requires_stage"),
    sensors: listField(yaml, "sensors"),
    scopes: listField(yaml, "scopes"),
    inputs: scalarField(yaml, "inputs"),
    outputs: scalarField(yaml, "outputs"),
    order: num("order", 0),
  };
}

/** Throw "<file>: <message>" on the first schema violation. */
export function validateStage(s: StageDefinition, file: string, filenameSlug: string): void {
  const req = (v: string, field: string): void => {
    if (v.length === 0) throw new Error(`${file}: missing required field: ${field}`);
  };
  req(s.slug, "slug");
  if (s.slug !== filenameSlug) {
    throw new Error(`${file}: slug "${s.slug}" must match filename stem "${filenameSlug}"`);
  }
  req(s.phase, "phase");
  if (!PHASES.includes(s.phase)) {
    throw new Error(`${file}: phase must be one of ${PHASES.join("|")} (got "${s.phase}")`);
  }
  if (!EXECUTIONS.includes(s.execution)) {
    throw new Error(`${file}: execution must be one of ${EXECUTIONS.join("|")}`);
  }
  if (!MODES.includes(s.mode)) {
    throw new Error(`${file}: mode must be one of ${MODES.join("|")}`);
  }
  req(s.lead_agent, "lead_agent");
  if (s.scopes.length === 0) {
    throw new Error(`${file}: at least one scope required in scopes:`);
  }
  if (s.produces.length === 0) {
    throw new Error(`${file}: at least one artifact required in produces:`);
  }
}

/** The three body compartments every stage file must carry. */
export const REQUIRED_COMPARTMENTS = ["## Steps", "## Sensors", "## Learn"] as const;

export function validateCompartments(body: string, file: string): void {
  for (const heading of REQUIRED_COMPARTMENTS) {
    if (!body.includes(`\n${heading}`) && !body.startsWith(heading)) {
      throw new Error(`${file}: missing required body compartment: ${heading}`);
    }
  }
}
