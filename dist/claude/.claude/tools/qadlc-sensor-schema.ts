// qadlc-sensor-schema.ts — sensor manifest schema (capability descriptor only).
// Consumed by qadlc-graph.ts (compile) and validated per manifest. Pull
// authoring: manifests describe what the sensor IS, not which stages use it —
// the relationship lives on the stage side via `sensors: [<id>]`.

import { parseFrontmatter, scalarField } from "./qadlc-lib.ts";

export interface SensorManifest {
  id: string;
  kind: "deterministic";
  command: string;
  default_severity: "advisory";
  description: string;
  category?: string;
  matches?: string;
  timeout_seconds?: number;
}

const REQUIRED = ["id", "kind", "command", "default_severity", "description"] as const;

export function parseSensorManifest(raw: string): SensorManifest {
  const { yaml } = parseFrontmatter(raw);
  const obj: Partial<SensorManifest> = {};
  const id = scalarField(yaml, "id");
  if (id) obj.id = id;
  const kind = scalarField(yaml, "kind");
  if (kind) obj.kind = kind as "deterministic";
  const command = scalarField(yaml, "command");
  if (command) obj.command = command;
  const sev = scalarField(yaml, "default_severity");
  if (sev) obj.default_severity = sev as "advisory";
  const desc = scalarField(yaml, "description");
  if (desc) obj.description = desc;
  const cat = scalarField(yaml, "category");
  if (cat) obj.category = cat;
  const matches = scalarField(yaml, "matches");
  if (matches) obj.matches = matches;
  const timeout = scalarField(yaml, "timeout_seconds");
  if (timeout) {
    const n = parseInt(timeout, 10);
    if (!Number.isNaN(n)) obj.timeout_seconds = n;
  }
  return obj as SensorManifest;
}

export function validateSensorManifest(m: SensorManifest, file: string, filenameId: string): void {
  const rec = m as unknown as Record<string, unknown>;
  for (const f of REQUIRED) {
    if (rec[f] === undefined || rec[f] === "") throw new Error(`${file}: missing required field: ${f}`);
  }
  if (m.id !== filenameId) {
    throw new Error(`${file}: id "${m.id}" must match filename stem "${filenameId}" ` +
      `(file should be qadlc-${m.id}.md)`);
  }
  if (m.kind !== "deterministic") {
    throw new Error(`${file}: kind must be "deterministic" (got "${m.kind}")`);
  }
  if (m.default_severity !== "advisory") {
    throw new Error(`${file}: default_severity must be "advisory" (got "${m.default_severity}")`);
  }
}
