---
id: gherkin-lint
kind: deterministic
command: bun {{HARNESS_DIR}}/tools/qa-dlc-sensor-gherkin-lint.ts
default_severity: advisory
description: Structural lint of a .feature file — Feature/scenario/step shape, outline Examples, no empty or leading-conjunction scenarios
category: gherkin-shape
matches: "**/*.feature"
timeout_seconds: 10
---

# gherkin-lint sensor

Parses a `.feature` file (dependency-free) and checks structural validity:
Feature declaration present, at least one scenario, every scenario has steps and
opens with `Given`/`When`/`Then` (not `And`/`But`), `Scenario Outline` carries an
`Examples` table with data rows and uses `<placeholders>`, and no duplicate
scenario names within the file.

## Failure mode

Emits `SENSOR_FAILED` and writes detail to
`aidlc-docs/.qa-dlc-sensors/<stage>/gherkin-lint-<ts>.md` listing each finding
(line, rule, message). Advisory — surfaced at the next gate, never blocks.
