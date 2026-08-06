# Rules and the Learning Loop

QADLC gets better at *your* Gherkin over time by promoting recurring corrections
into standing rules and new deterministic checks. The loop is deliberately small
and file-driven — no hidden state.

## The loop

```
stage runs → conductor keeps a diary (.qadlc/diaries/<stage>/memory.md)
           → before the gate, surfaces candidates
           → user keeps some
           → each kept item is written to ONE of:
                • team/project memory   (a standing rule)
                • a new sensor manifest (a deterministic check)
           → next run loads the rule / fires the sensor automatically
```

## Where a learning goes

| The learning is… | Write it to… | Effect |
|---|---|---|
| A standing preference ("always tag API scenarios `@api`") | `.qadlc/memory/team.md` (or `project.md` if repo-specific) | Loaded before every stage; wins over repo-derived conventions |
| A repeatable check ("no scenario may exceed 12 steps") | a new sensor in the QADLC **source repo** (`core/sensors/qadlc-<id>.md` + `core/tools/qadlc-sensor-<id>.ts` + the `<id>` on a stage's `sensors:` list). The install tree is read-only, so record the rule in team memory now and open an issue against QADLC | Fires automatically on matching file writes, once released |

## Conflict rule

Before writing a learning to memory, compare it against the existing layers
(project → team). A narrower rule that contradicts a broader standing rule is
rejected at the gate; resolve the contradiction with the user first. The most
specific non-empty statement wins at load time.

## Immutability

Stage files are framework artefacts — the loop never edits them. It writes into
the *harness* (memory + sensors). After adding a sensor, recompile the graph
(`bun .claude/tools/qadlc.ts graph compile`) so the new binding takes
effect and the cross-check validates the id.

## Promoting a memory diary to team memory

The per-stage diary uses the four canonical headings
(Interpretations / Deviations / Tradeoffs / Open questions). Only *Interpretations*
and *Deviations* that recur are good promotion candidates — a one-off
interpretation is noise, a repeated one is a rule.
