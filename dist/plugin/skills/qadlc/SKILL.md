---
name: qadlc
description: 'Plan-first Gherkin authoring workflow. Trigger ONLY on an explicit QADLC invocation — "QADLC", "qa-dlc", /qadlc — or on "gherkin plan", "feature file suite", "BDD workflow". Deterministic engine-driven, two-phase, with a plan-approval gate. Supported flags — --resume, --scope, --depth, --stage, --phase, --doctor, --version.'
---

# QADLC Conductor (plugin)

This skill is the **conductor's forwarding loop**. The deterministic engine owns
routing; you carry out one directive at a time.

The engine is on your PATH as `qadlc` while this plugin is enabled. Do not try to
locate the plugin directory or use `${CLAUDE_PLUGIN_ROOT}` in a Bash command —
that variable is not set for the Bash tool. Just run `qadlc`.

## Before anything else

If `.qadlc/memory/` does not exist in this project, run `qadlc init` once. It
creates `.qadlc/memory/team.md` and `project.md`, which hold the team's tagging
vocabulary, step-definition paths and style reference. The engine ships the
machinery; those two files are what make it match *this* repo. Never overwrite
them — they are hand-authored.

## The loop

1. **Forward the user's flags.** Take everything the user typed after `/qadlc`
   and append it **unchanged** to your first `next` call. The flags ARE the
   user's intent — dropping them routes the workflow to the wrong place.
   - `/qadlc` → `qadlc next`
   - `/qadlc --resume` → `qadlc next --resume`
   - `/qadlc --scope smoke --depth Standard` → `qadlc next --scope smoke --depth Standard`
   - `/qadlc --stage story-analysis` → `qadlc next --stage story-analysis`
   - `/qadlc --doctor` / `--version` → `qadlc doctor` / `qadlc --version`
2. The first directive of a session carries the `conductor_persona` — the full
   conductor text, inlined. Adopt it for the whole run.
3. Do exactly the one move the directive names (see the directive table below).
4. Call `qadlc report …` with the outcome.
5. Repeat until the engine emits a `done` directive.

## Directives

| `type` | What you do |
|---|---|
| `detect-scope` | Detect + confirm the scope from the user's request, then run the named `report --scope …`. |
| `run-stage` | Read the stage file the directive names in `stage_file` and run its `## Steps` as the named `lead_agent`. |
| `gate` | Produce/finish `gherkin_plan.md`, present it, and WAIT for approval. |
| `print` | Show `message`. If it carries a `command`, that command is your IMMEDIATE next tool call — run it, then resume the loop. If `readonly: true` (`--version`, `--doctor`, errors), just show the message and stop; no state changed. |
| `resume` | Present the `state_summary` and the numbered `options` as prose choices, then act on the user's pick — do NOT assume "continue". |
| `done` | The workflow is complete. Stop. |

## Flag forwarding is non-negotiable

The engine is the sole authority on routing. When a `print` directive names a
`command` (a `report --scope …`, `report --depth …`, or `report --jump …`), run
THAT EXACT command as your next tool call before doing anything else — do not
re-run `next`, re-derive the move, or start a stage first. Re-running the engine
before the named command silently skips the move.

## Rules

- Never write a `.feature` file before `gherkin_plan.md` is approved — the engine
  and the Stop hook enforce this gate. The engine refuses `--stage`/`--phase`
  jumps into the execution phase until the plan is approved.
- Log every user input verbatim; the audit-logger hook appends artifact events
  automatically.
- Read the stage file at the absolute path the directive gives you in
  `stage_file`, and follow its `## Steps`.
- All session artifacts live under `.qadlc/` in this project. The plugin's own
  directory is read-only; never write into it.

## If this project has a vendored QADLC

If you see a `.claude/hooks/qadlc-*.ts` tree, this project vendors its own copy of
QADLC and that copy is authoritative. Use its commands
(`bun .claude/tools/qadlc.ts …`), not `qadlc`.

The plugin's hooks detect this and stand down, so nothing fires twice — the
`SessionStart` notice explains the switch-over steps. Relay them rather than
proceeding quietly, because until the vendored tree is removed the plugin
contributes nothing here.

## While QADLC v1 is still deployed

v1 (`.qa-dlc-rule-details/` + a v1-form `QA-CLAUDE.md`) is prose-only: it ships no
hooks, so it cannot conflict on disk, and v2 writes only under `.qadlc/`. The
overlap is the trigger vocabulary — v1 claims bare "BDD", "Gherkin" and "feature
file".

<!-- TEMPORARY, tied to plan §8.3 / Phase 7 (v1 retirement).
     This skill's `description` deliberately does NOT claim bare "BDD" / "Gherkin"
     / "feature file", so that a user in a v1 repo who types "write me a feature
     file" is not silently routed into two contradictory playbooks. That is a real
     loss of discoverability, accepted on purpose while v1 remains committed on
     main in DriveWealth/qa_automation.
     WHEN v1 IS REMOVED: widen the description back to the natural keywords. Do
     not leave this narrowed by neglect. -->

If the user clearly wants BDD work but has not said "QADLC", offer it rather than
assuming: "this repo has QADLC v2 available — want me to run it?"
