---
id: tag-policy
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/qa-dlc-sensor-tag-policy.ts
default_severity: advisory
description: Every scenario carries at least one scope tag (@smoke/@regression/@e2e/@exploratory) and one component tag
category: gherkin-tags
matches: "**/*.feature"
timeout_seconds: 10
---

# tag-policy sensor

Checks that every concrete scenario's effective tag set (its own tags plus the
Feature's tags) contains at least one scope tag from
`@smoke`, `@regression`, `@e2e`, `@exploratory` **and** at least one component
tag (any other tag). Enforces the tagging strategy from `gherkin-writing-rules.md`.

## Failure mode

Emits `SENSOR_FAILED` and writes detail to
`aidlc-docs/.qa-dlc-sensors/<stage>/tag-policy-<ts>.md` naming each scenario
missing a required tag class.
