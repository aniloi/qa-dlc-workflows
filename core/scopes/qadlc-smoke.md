---
name: smoke
depth: Minimal
keywords:
  - smoke
  - happy path
  - sanity
  - quick check
description: Happy-path only — the minimum set that runs on every deployment
---

# smoke scope

Minimal depth. Produces the smallest useful set of `.feature` scenarios: the
happy path for each in-scope acceptance criterion, tagged `@smoke`. No negative,
boundary, or data-driven coverage — those belong to `regression`.

## Why these stages, why skip those

Workspace Detection, Story Analysis, Step Inventory, and the Gherkin Plan gate
always run — even a smoke pass needs a reviewed plan and step reuse. Convention
Extraction runs so the smoke scenarios match house style. The Cross-Feature
Consistency Check runs because smoke suites still ship multiple files and must
not collide on scenario names or tags.

## Membership

Keyword triggers: `smoke`, `happy path`, `sanity`, `quick check`. Runs all seven
stages at **Minimal** depth: one happy-path scenario per criterion, `@smoke` plus
one component tag, declarative style. Promote to `regression` when you need edge
and negative coverage.
