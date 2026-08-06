---
id: step-existence
kind: deterministic
command: qadlc sensor-run step-existence
default_severity: advisory
description: Verifies every step in a .feature resolves to a known step definition, using the step catalog the step-inventory stage writes
category: step-reuse
matches: "**/*.feature"
timeout_seconds: 15
---

# step-existence sensor

Checks each `Given`/`When`/`Then` step against a step catalog at
`.qadlc/step-catalog.json` (written by the Step Inventory stage;
entries may use Cucumber `{int}`/`{string}`/`{word}`/`{float}` placeholders). A
step that matches no catalog entry is flagged — the deterministic enforcement of
the "reuse over invention" tenet.

If no catalog is present, the sensor exits 127 (tool-unavailable → advisory
pass), rather than false-flagging every step. Author the catalog in Step
Inventory to turn the check on.

## Failure mode

Emits `SENSOR_FAILED` and writes detail to
`.qadlc/sensors/<stage>/step-existence-<ts>.md` listing each step
with no matching definition.
