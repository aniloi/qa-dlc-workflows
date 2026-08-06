// qadlc-scope-schema.ts — the scope-file frontmatter contract. A scope decides
// WHICH stages run and at what default depth. Pull authoring: the scope names
// nothing; each stage lists the scopes it belongs to via `scopes:` frontmatter,
// and the compiler transposes that into the scope→stages grid.

import { parseFrontmatter, scalarField, listField } from "./qadlc-lib.ts";

export type Depth = "Minimal" | "Standard" | "Comprehensive";

export interface ScopeDefinition {
  name: string;
  depth: Depth;
  keywords: string[];
  description: string;
}

const DEPTHS: Depth[] = ["Minimal", "Standard", "Comprehensive"];

export function parseScope(raw: string): ScopeDefinition {
  const { yaml } = parseFrontmatter(raw);
  return {
    name: scalarField(yaml, "name"),
    depth: scalarField(yaml, "depth") as Depth,
    keywords: listField(yaml, "keywords"),
    description: scalarField(yaml, "description"),
  };
}

export function validateScope(s: ScopeDefinition, file: string, filenameName: string): void {
  if (s.name.length === 0) throw new Error(`${file}: missing required field: name`);
  if (s.name !== filenameName) {
    throw new Error(`${file}: name "${s.name}" must match filename stem "${filenameName}" ` +
      `(file should be qadlc-${s.name}.md)`);
  }
  if (!DEPTHS.includes(s.depth)) {
    throw new Error(`${file}: depth must be one of ${DEPTHS.join("|")} (got "${s.depth}")`);
  }
  if (s.keywords.length === 0) throw new Error(`${file}: at least one keyword required`);
  if (s.description.length === 0) throw new Error(`${file}: missing required field: description`);
}
