---
id: tag-policy
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/qadlc-sensor-tag-policy.ts
default_severity: advisory
description: Every scenario carries at least one scope tag (@smoke/@regression/@e2e/@exploratory) and one component tag; in Jira mode, also @allure.label.jira=<KEY>
category: gherkin-tags
matches: "**/*.feature"
timeout_seconds: 10
---

# tag-policy sensor

Checks that every concrete scenario's effective tag set (its own tags plus the
Feature's tags) contains at least one scope tag from
`@smoke`, `@regression`, `@e2e`, `@exploratory` **and** at least one component
tag (any other tag). Enforces the tagging strategy from `gherkin-writing-rules.md`.

When the session was started from a Jira key (qa-state.md `story_source` is Jira
mode), the sensor additionally requires an `@allure.label.jira=<ISSUE-KEY>` tag on
every scenario (e.g. `@allure.label.jira=CLM-5515`). For file/folder input the tag
is optional and is treated as a component tag if present.

## Failure mode

Emits `SENSOR_FAILED` and writes detail to
`aidlc-docs/.qadlc-sensors/<stage>/tag-policy-<ts>.md` naming each scenario
missing a required tag class.
