---
id: duplicate-scenario-name
kind: deterministic
command: bun .kiro/tools/qa-dlc-sensor-duplicate-scenario-name.ts
default_severity: advisory
description: Detects scenario names that collide across the .feature files in the written file's directory tree
category: cross-feature
matches: "**/*.feature"
timeout_seconds: 15
---

# duplicate-scenario-name sensor

Scans every `.feature` file under the written file's directory (recursively) and
reports scenario names that appear in more than one file. This is the machine
backbone of the Cross-Feature Consistency Check — it turns "no duplicate scenario
names across files" from an AI-remembered rule into a repeatable check.

## Failure mode

Emits `SENSOR_FAILED` and writes detail to
`aidlc-docs/.qa-dlc-sensors/<stage>/duplicate-scenario-name-<ts>.md` listing each
duplicated name and the files it appears in.
