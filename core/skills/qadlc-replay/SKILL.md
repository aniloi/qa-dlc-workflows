---
name: qadlc-replay
description: Replay a QADLC session from the audit trail — reconstruct the sequence of stages, approvals, feature writes, and sensor findings for review or recovery.
---

# QADLC Replay

A read-only runner that reconstructs what happened in a session from the
append-only audit trail. Useful for review, debugging a stalled session, or
recovering state after an interruption.

## What to do

1. Read `.qadlc/audit.md` top to bottom.
2. Render the timeline in order — one line per event block:

```
<timestamp>  <EVENT_TYPE>  <key fields>
```

   Highlight the decision points: SESSION_STARTED, PLAN_PRESENTED,
   PLAN_APPROVED, each FEATURE_FILE_WRITTEN, SENSOR_FAILED, GATE_VIOLATION,
   SESSION_ENDED.

3. Cross-check against current state
   (`{{QADLC_CMD}} state show`) and flag any divergence
   (e.g. the audit shows an approval the state doesn't reflect).

4. If the state file was lost, use the replay to propose a reconstructed state
   and confirm it with the user before continuing (see `session-continuity.md`).

This never writes; it only reads the trail and reports.
