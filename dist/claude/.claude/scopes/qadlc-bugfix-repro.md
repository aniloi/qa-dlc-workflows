---
name: bugfix-repro
depth: Minimal
keywords:
  - bug
  - bugfix
  - regression bug
  - reproduce
  - repro
  - defect
description: Reproduce a specific defect as a failing scenario, plus its fix guard
---

# bugfix-repro scope

Minimal depth, aimed at a single defect. Produces the scenario that reproduces
the bug (the failing case) and, where the acceptance criteria state the correct
behavior, the guard scenario that must pass once the fix lands. Tagged
`@regression` and a defect/component tag so it joins the permanent suite.

## Why these stages, why skip those

Workspace Detection, Story Analysis (the bug report *is* the story), Step
Inventory, the Gherkin Plan gate, and Feature File Generation run. **Convention
Extraction is skipped** — a repro targets an existing feature area whose style is
already established and reused directly. The **Cross-Feature Consistency Check is
skipped** — a repro touches one file; there is no cross-file surface to reconcile.

## Membership

Keyword triggers: `bug`, `bugfix`, `regression bug`, `reproduce`, `repro`,
`defect`. Runs five of seven stages at **Minimal** depth (skips Convention
Extraction and Cross-Feature Consistency Check). Promote to `regression` if the
defect reveals a whole class of missing coverage.
