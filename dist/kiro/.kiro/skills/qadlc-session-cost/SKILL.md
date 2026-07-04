---
name: qadlc-session-cost
description: Report the current QADLC session — scope, phase, stages completed, plan approval, feature-file progress, and sensor findings — from state and audit.
---

# QADLC Session Cost / Status

A read-only runner that summarizes the active session. It reads tool-owned state
and the audit trail; it never mutates anything.

## What to do

1. Read state: `bun .kiro/tools/qadlc-state.ts show`.
2. Read the audit trail at `aidlc-docs/audit.md` and count event types
   (STAGE_COMPLETED, FEATURE_FILE_WRITTEN, SENSOR_FAILED, GATE_VIOLATION).
3. List any sensor detail files under `aidlc-docs/.qadlc-sensors/`.
4. Present a compact report:

```
QADLC session
- Scope / Depth: <scope> (<depth>)
- Phase: <phase>   Plan approved: <yes/no>
- Stages completed: <n>/<total-in-scope>
- Feature files: <written>/<total>
- Sensor findings: <count>  (open detail files: <list>)
- Gate violations: <count>
```

Use this to decide whether the session is healthy to resume or needs attention.
