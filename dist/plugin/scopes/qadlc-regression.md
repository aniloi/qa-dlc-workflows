---
name: regression
depth: Comprehensive
keywords:
  - regression
  - full coverage
  - exhaustive
  - epic
  - release
description: Exhaustive coverage — happy, negative, boundary, and data-driven
---

# regression scope

Comprehensive depth. The full pass across a set of stories or an epic: happy
path, negative and error cases, boundary conditions, and `Scenario Outline`
data-driven variations wherever three or more input rows exercise the same flow.
Tagged `@regression` (plus `@smoke` on the core happy paths).

## Why these stages, why skip those

Every stage runs at full rigor. The Cross-Feature Consistency Check is
load-bearing here: a comprehensive pass writes many files, so duplicate scenario
names, conflicting step wordings, and inconsistent tagging are the real risks it
exists to catch.

## Membership

Keyword triggers: `regression`, `full coverage`, `exhaustive`, `epic`,
`release`. Runs all seven stages at **Comprehensive** depth. This is the widest
scope; there is nothing to promote to.
