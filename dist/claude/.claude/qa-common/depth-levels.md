# Depth Levels — Gherkin Coverage Exhaustiveness

Depth is set by the active scope (see `.claude/scopes/`) and controls
**how exhaustively** each acceptance criterion is covered in the generated
`.feature` files. It does not change *which* stages run — that is the scope's
membership — only how much the Feature File Generation stage produces per
criterion.

The user may override the scope's default depth at the Gherkin Plan gate.

## The three levels

### Minimal
- One **happy-path** scenario per acceptance criterion.
- No negative, boundary, or data-driven variations.
- Tags: `@smoke` (or `@exploratory` for the exploratory scope) + one component tag.
- Used by: `smoke`, `bugfix-repro`, `exploratory`.

### Standard
- Happy path **plus** the primary negative/error case each criterion implies.
- Boundary cases only where a criterion names an explicit limit.
- `Scenario Outline` only when a criterion already enumerates ≥3 input variations.
- Tags: `@smoke` on the core happy path, `@regression` on the rest, + component tag.
- Used by: `single-story`.

### Comprehensive
- Happy path, **all** implied negative/error cases, boundary conditions, and
  `Scenario Outline` data-driven coverage wherever ≥3 rows exercise one flow.
- Edge cases and cross-cutting concerns (auth, permissions, empty/limit states).
- Tags: full `@regression` coverage; `@smoke` on the core happy paths; `@e2e` on
  multi-component flows; `@negative` on error scenarios; + component tags.
- Used by: `regression`.

## Depth vs. scenario-vs-outline threshold

Depth interacts with the standing rule from the writing guide: use a
`Scenario Outline` when **three or more** data variations test the same logical
flow; for one or two, write separate named `Scenario`s. Comprehensive depth
raises the number of variations you look for; it never lowers the 3-row
threshold for choosing an outline.
