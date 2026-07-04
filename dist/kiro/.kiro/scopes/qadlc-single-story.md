---
name: single-story
depth: Standard
keywords:
  - single story
  - one story
  - this story
  - single ticket
description: One user story, full standard coverage
---

# single-story scope

Standard depth, narrowed to a single user story or ticket. The default when a
user points QADLC at one story: happy path plus the primary negative and error
cases the acceptance criteria imply, without the exhaustive boundary/data-driven
matrix a full regression pass builds.

## Why these stages, why skip those

All discovery stages run — a single story still needs conventions and a step
inventory to reuse steps and match style. The Gherkin Plan gate runs. Feature
File Generation typically writes one or a few files. The Cross-Feature
Consistency Check runs so new scenarios stay consistent with the existing suite.

## Membership

Keyword triggers: `single story`, `one story`, `this story`, `single ticket`.
Runs all seven stages at **Standard** depth. Promote to `regression` when the
story is high-risk and needs edge/boundary coverage.
