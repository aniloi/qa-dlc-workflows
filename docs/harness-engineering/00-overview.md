# QADLC v2 — Harness Engineer Guide

> [User Guide](../guide/00-introduction.md) · **Harness Engineer Guide** · [Developer Reference](../reference/00-overview.md)

For the person **reshaping** how QADLC behaves for their team — without writing
code. Everything here is a Markdown file with YAML frontmatter that the engine
reads at runtime.

## The mental model

- A **stage** is *what* happens (a node of the graph). It declares its lead
  agent, what it consumes/produces, its scopes, and its sensors.
- An **agent** is *who* does it (a persona). A stage names its agent; an agent
  never names its stages.
- A **scope** decides *which* stages run and at what depth.
- A **sensor** is a deterministic check bound to a stage's file writes.
- **Memory** is your team's standing rules, loaded before every stage.

## The build loop (always)

```bash
# 1. edit the source in core/ (never dist/)
$EDITOR core/qa-common/stages/execution/feature-generation.md

# 2. regenerate every harness tree
bun scripts/package.ts

# 3. confirm no drift before committing
bun scripts/package.ts --check
```

Commit the `core/` edit and the regenerated `dist/` together.

## What you can change without code

| Change | Where |
|---|---|
| Edit what a stage does | `core/qa-common/stages/<phase>/<slug>.md` |
| Add/modify an agent | `core/agents/<name>-agent.md` |
| Tune a scope's stages/depth | `core/scopes/qadlc-<name>.md` + each stage's `scopes:` list |
| Teach a standing rule | `core/memory/team.md` or `project.md` |
| Wire a deterministic check | a manifest `core/sensors/qadlc-<id>.md` + a `core/tools/qadlc-sensor-<id>.ts` + the `<id>` on a stage's `sensors:` |
| Add agent domain knowledge | `core/knowledge/<agent>-agent/` (tier-2) or `core/knowledge/qadlc-shared/` (tier-1) |

## Adding a stage (sketch)

1. Create `core/qa-common/stages/<phase>/<slug>.md` with the full frontmatter and
   the three body compartments (`## Steps`, `## Sensors`, `## Learn`).
2. List the `scopes:` it belongs to and any `requires_stage:` edges.
3. `bun scripts/package.ts` — the graph compiler validates it and wires it into
   every scope grid. Cross-checks fail the build on an unknown scope/sensor/agent.

## Adding a scope

1. `core/scopes/qadlc-<name>.md` with `name`, `depth`, `keywords`, `description`.
2. Add `<name>` to the `scopes:` list of each stage that should run in it.
3. Regenerate. The compiler transposes stage membership into the scope grid.

## The learning loop

Corrections captured in a stage's memory diary get promoted — a standing rule to
`memory/team.md`, a repeatable check to a new sensor. See
[rules-and-learning](../../core/qa-common/rules-and-learning.md).

## Adding a harness

One `harness/<name>/` directory with `manifest.ts` + `onboarding.fills.ts` (and
any authored surfaces). The packager discovers it automatically — no edits to
`scripts/` or `core/`. See the [Developer Reference](../reference/00-overview.md).

## In progress

- [Plugin target](01-plugin-target.md) — plan for shipping QADLC as a Claude Code
  plugin installed once at user scope, alongside `dist/claude` and `dist/kiro`
  ([#2](https://github.com/aniloi/qa-dlc-workflows/issues/2)).
