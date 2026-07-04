---
name: qa-dlc-session-cost
description: Report the current QA-DLC session — scope, phase, stages completed, plan approval, feature-file progress, and sensor findings — from state and audit.
---

# QA-DLC Session Cost / Status

A read-only runner that summarizes the active session. It reads tool-owned state
and the audit trail; it never mutates anything.

## What to do

1. Read state: `bun .claude/tools/qa-dlc-state.ts show`.
2. Read the audit trail at `aidlc-docs/audit.md` and count event types
   (STAGE_COMPLETED, FEATURE_FILE_WRITTEN, SENSOR_FAILED, GATE_VIOLATION).
3. List any sensor detail files under `aidlc-docs/.qa-dlc-sensors/`.
4. Present a compact report:

```
QA-DLC session
- Scope / Depth: <scope> (<depth>)
- Phase: <phase>   Plan approved: <yes/no>
- Stages completed: <n>/<total-in-scope>
- Feature files: <written>/<total>
- Sensor findings: <count>  (open detail files: <list>)
- Gate violations: <count>
```

Use this to decide whether the session is healthy to resume or needs attention.
