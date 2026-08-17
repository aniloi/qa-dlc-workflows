---
id: step-existence
kind: deterministic
command: bun .claude/tools/qadlc-sensor-step-existence.ts
default_severity: advisory
description: Verifies every step in a .feature resolves to a known step definition, using the step catalog the step-inventory stage generates from the repo's step definitions
category: step-reuse
matches: "**/*.feature"
timeout_seconds: 15
---

# step-existence sensor

Checks every step — `Background` included — against the step catalog at
`aidlc-docs/.qadlc/step-catalog.json`, which Step Inventory generates from the
repo's own step definitions with `qadlc-build-step-catalog.ts`. Catalog entries
are literal text plus Cucumber parameter placeholders (`{int}`, `{string}`,
`{word}`, `{double}`, `{long}`, a project-defined `{account}`, …); the generator
has already expanded optional text and alternation, so the sensor never guesses
at a dialect. A step that matches no entry is flagged — the deterministic
enforcement of the "reuse over invention" tenet.

`Scenario Outline` steps are matched the way Cucumber matches them: the Examples
rows are substituted first, so `<placeholder>` never reaches the pattern. A
placeholder whose column is missing from the table falls back to a relaxed match
(any parameter slot also accepts a bare `<name>`), so a malformed table costs one
finding rather than one per step.

If no catalog is present the sensor exits 127 (tool-unavailable → advisory pass)
rather than false-flagging every step. That is a real hole, not a pass: **an
absent catalog means this check never ran.** Step Inventory generates it on every
run for exactly this reason.

## Failure mode

Emits `SENSOR_FAILED` and writes detail to
`aidlc-docs/.qadlc-sensors/<stage>/step-existence-<ts>.md` listing each step
with no matching definition.
