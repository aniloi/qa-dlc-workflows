# QADLC — Gherkin Feature File Development Workflow

> This file is generated from `core/templates/onboarding.md`. Do not hand-edit a
> distributed copy — edit the skeleton and run `bun scripts/package.ts`.

QADLC (Quality Assurance Development Lifecycle) is a plan-first, two-phase
workflow that turns user stories into production-ready `.feature` files. The AI
never writes a single line of Gherkin until a plan is explicitly approved.

## How to start

Invoke the workflow with:

```
Using QADLC, write feature files for <Jira key or story path>
```

When invoked, read and follow the conductor at
`.claude/qa-common/conductor.md`, which drives the deterministic engine
(`.claude/tools/qadlc-orchestrate.ts`). The engine decides which stage
runs next based on the detected scope; the conductor executes each stage well.

You can also pass flags after the trigger — forwarded to the engine unchanged:
`--resume` (resume a session), `--scope <name>` / `--depth <level>`,
`--stage <slug>` / `--phase <name>` (jump the pointer), `--doctor`, `--version`.

## Installation (Claude Code)

Copy the generated tree into your project:

```bash
cp -R dist/claude/.claude/ your-project/.claude/
cp dist/claude/QA-CLAUDE.md your-project/QA-CLAUDE.md
```

`QA-CLAUDE.md` is kept separate from any existing `CLAUDE.md`. The
`.claude/rules/qadlc.md` stub pulls the conductor into ambient context.

## What it does

1. **Workspace Detection** — detects repo layout, step-definition location, and a style-reference `.feature`
2. **Story Analysis** — reads every user story, extracts acceptance criteria, flags ambiguities
3. **Convention Extraction** — learns your team's tagging, naming, and abstraction style
4. **Step Inventory** — catalogs existing step definitions by domain
5. **Gherkin Plan** — produces `gherkin_plan.md` and **waits for your approval**
6. **Feature File Generation** — writes one `.feature` at a time per the approved plan
7. **Cross-Feature Consistency Check** — validates naming, tagging, and abstraction across files

## Tenets

- **Plan first, write second** — no `.feature` before `gherkin_plan.md` is approved
- **Reuse over invention** — check the step inventory before proposing a new step
- **Declarative always** — Gherkin describes behavior, not UI click-through
- **One file at a time** — write, mark the checkbox, then proceed
- **Complete audit trail** — every user input logged verbatim with a timestamp

## Jira integration (optional)

Jira story input (`CLM-123`) requires the MCP Atlassian server configured
and active in Claude Code. Without it, use folder or `user-stories/` modes.
