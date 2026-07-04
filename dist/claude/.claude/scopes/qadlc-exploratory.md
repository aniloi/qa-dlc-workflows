---
name: exploratory
depth: Minimal
keywords:
  - exploratory
  - draft
  - spike
  - rough
  - prototype scenarios
description: Fast, rough scenario drafts to explore a feature area
---

# exploratory scope

Minimal depth, lowest ceremony. For quickly sketching candidate scenarios to
explore a feature area or seed a later regression pass — draft quality, not
release quality. Scenarios are tagged `@exploratory` so they never masquerade as
shipping coverage.

## Why these stages, why skip those

Workspace Detection, Story Analysis, Step Inventory, the Gherkin Plan gate, and
Feature File Generation run — even a draft reuses existing steps and passes the
plan gate (the plan-first tenet is never skipped). **Convention Extraction** and
the **Cross-Feature Consistency Check** are skipped: exploratory drafts are not
held to house style or cross-file consistency until they are promoted.

## Membership

Keyword triggers: `exploratory`, `draft`, `spike`, `rough`,
`prototype scenarios`. Runs five of seven stages at **Minimal** depth. Promote to
`single-story` or `regression` to turn drafts into shipping coverage.
