# Stage Protocol

The behavioral contract every QA-DLC stage follows. Stage files reference this
file rather than repeating it.

## 1. Approval gates

The workflow has one hard gate: **Gherkin Plan**. The engine will not emit an
Execution-phase directive until `report --stage gherkin-plan --approved` is
called. No `.feature` file is written before the plan is approved — this is
enforced by the engine and the stop hook (Phase 5), not by goodwill.

Other stages present a completion summary and advance automatically; the user may
interject at any point (Keep / Modify / Redo the current stage).

## 2. Question format

Questions are written to a markdown file, never asked only inline:

```markdown
### Q1. <question>
A. <option>
B. <option>
C. <option>
X. Other (please specify)

[Answer]:
```

- Every question ends with `X. Other (please specify)`.
- Leave `[Answer]:` blank for the user to fill.
- Confirm ALL `[Answer]:` tags are filled before proceeding. Never proceed on
  partial answers.

## 3. Interaction modes

Offer the user three ways to answer, all converging on the filled file:
- **Guided** — walk through each question interactively.
- **Self-guided** — the user edits the question file directly.
- **Chat** — freeform discussion, which you transcribe back into the file.

## 4. Completion messages

End each stage with a short, standardized summary: what was produced, the review
path, and the approval prompt (for the gate) or an automatic advance note (for
non-gate stages). No emergent free-form endings — keep them predictable.

## 5. Knowledge loading order

Before running a stage, load in order: (1) the lead agent's file, (2) the agent's
knowledge dir under `{{HARNESS_DIR}}/knowledge/<agent>/` if present, (3) team
memory under `{{HARNESS_DIR}}/memory/` (team rule wins on conflict). The most
specific non-empty statement wins.

## 6. Sensors

Sensors declared in a stage's `sensors:` frontmatter fire automatically on that
stage's file writes (via the sensor-fire hook, Phase 5). They are **advisory**:
findings are written to `aidlc-docs/.qa-dlc-sensors/<stage>/` and surfaced at the
next gate. A failing sensor does not silently block, but you must address or
consciously accept each finding.

## §Learn — the learning ritual

Each stage keeps a diary (`aidlc-docs/.qa-dlc-memory/<stage>/memory.md`). Before a
gate, read it and surface candidates:

- **Prescriptive rule** → write to team memory (`{{HARNESS_DIR}}/memory/team.md`
  or `project.md`). Next run loads it automatically.
- **Verification check** → author a new sensor manifest at
  `{{HARNESS_DIR}}/sensors/qa-dlc-<id>.md` and add `<id>` to the relevant stage's
  `sensors:` list.

Stage files are immutable framework artefacts — the ritual writes into the
harness (memory, sensors), never into the stage file. Recompile the graph
(`qa-dlc-graph.ts compile`) after wiring a new sensor.
