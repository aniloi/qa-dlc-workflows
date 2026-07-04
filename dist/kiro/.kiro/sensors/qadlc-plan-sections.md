---
id: plan-sections
kind: deterministic
command: bun .kiro/tools/qadlc-sensor-plan-sections.ts
default_severity: advisory
description: Verifies gherkin_plan.md contains the required H2 sections, including the "Stories Without Requirements" gap report
category: plan-shape
matches: "**/gherkin_plan.md"
timeout_seconds: 5
---

# plan-sections sensor

Checks that `gherkin_plan.md` carries the required H2 sections: Story-to-Scenario
Mapping, Implementation Checklist, the **Stories Without Requirements or
Insufficient Acceptance Criteria** gap report, and Open Questions. Enforces the
requirements-gap-reporting convention as a deterministic check on the plan
artifact rather than a remembered rule.

## Failure mode

Emits `SENSOR_FAILED` and writes detail to
`aidlc-docs/.qadlc-sensors/gherkin-plan/plan-sections-<ts>.md` naming each missing
section. Advisory — surfaced at the plan-approval gate.
