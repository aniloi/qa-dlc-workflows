# QADLC Workflows

> A deterministic, engine-driven workflow for **Gherkin feature-file authoring**,
> ported from the [AI-DLC v2 architecture](../aidlc-workflows). This is the v2
> line and the sole workflow on this branch; the original pure-markdown rule
> workflow (v1) is preserved on the `main` branch.

QADLC turns user stories into production-ready `.feature` files through a
plan-first, two-phase workflow. It stops *trusting the model to remember* the
rules: a deterministic engine owns routing, sensors validate the Gherkin, and
hooks enforce the plan gate — as code, not prose.

## What this adds over the v1 rule workflow

| Capability | v1 | v2 |
|---|---|---|
| Install | manual copy-paste, six duplicated docs | author once in `core/`, generate per-harness trees, drift-guarded — or install once as a **Claude Code plugin** and get it in every repo |
| Routing | the model follows markdown | a deterministic **engine** (`next`/`report`) drives a compiled stage graph |
| Adaptivity | one fixed flow | **scopes** (smoke / single-story / regression / bugfix-repro / exploratory) × **depth** (Minimal/Standard/Comprehensive) |
| Validation | the model re-reads rules | **sensors**: real Gherkin lint, tag-policy, duplicate-name, step-existence |
| Discipline | "MANDATORY: log…" prose | **hooks**: auto-audit, and a stop hook that *blocks* a feature written before plan approval |
| Learning | none | two-tier **knowledge** + team/project **memory** + a promotion **loop** |

## Architecture

```
.                               # repo root (this branch)
├── core/                       # harness-neutral source of truth (author here)
│   ├── qa-common/              # conductor, stage-protocol, stages/, writing rules
│   ├── agents/                 # qa-analyst / gherkin-author / qa-reviewer personas
│   ├── scopes/                 # smoke, single-story, regression, bugfix-repro, exploratory
│   ├── sensors/                # deterministic-check manifests
│   ├── hooks/                  # session-start/stop/end, audit-logger, sensor-fire, validate-state
│   ├── tools/                  # engine, graph compiler, state, audit, sensors (bun/TS)
│   ├── knowledge/              # tier-1 shared + tier-2 per-agent
│   ├── memory/                 # team + project standing rules
│   ├── skills/                 # qadlc-session-cost, qadlc-replay runners
│   └── templates/              # onboarding skeleton, memory template
├── harness/<name>/             # per-harness surface (manifest + fills + authored files)
│   ├── kiro/  claude/          # (codex/cline are one dir + manifest away)
├── scripts/                    # package.ts (build), onboarding.ts, manifest-types.ts
├── dist/<name>/                # GENERATED, committed, drift-guarded (never hand-edit)
└── tests/                      # bun test: schema, graph, engine, sensors, hooks, drift
```

### The engine/conductor split

A deterministic **engine** (`core/tools/qadlc-orchestrate.ts`, subcommands
`next` and `report`) reads `aidlc-docs/qa-state.md` + the compiled
`stage-graph.json`/`scope-grid.json` and emits one typed **directive**
(`detect-scope` | `run-stage` | `gate` | `done` | `print` | `resume`). The **conductor**
(`core/qa-common/conductor.md`, carried by each harness's `SKILL.md`) executes
that one move well, then reports the outcome. Routing is the engine's; execution
quality is the conductor's.

### The plan gate is enforced, not requested

The engine refuses to emit any Execution-phase directive until
`report --stage gherkin-plan --approved` is called, and the **stop hook** blocks a
turn if a `.feature` was created before that approval appears in the audit. No
`.feature` before the plan is approved — as a mechanism.

## Build model — author in `core/`, regenerate the harnesses

```bash
bun install                    # dev deps (bun-types, typescript) — tools run on plain bun
bun scripts/package.ts         # regenerate dist/{claude,kiro}
bun scripts/package.ts --check # drift guard (CI): fails if dist/ is stale or hand-edited
bun run typecheck              # tsc --noEmit
bun test tests/                # the suite
bun run check                  # all of the above
```

Adding a harness (codex, cline, …) is one `harness/<name>/` dir + a `manifest.ts`
row + an `onboarding.fills.ts` — zero edits to `scripts/` or `core/`.

## Install (end user)

### Claude Code plugin — recommended

Installed once at **user scope**, so QADLC is available in every project,
including ones that do not exist yet. No per-repo tree to re-import.

```bash
/plugin marketplace add aniloi/qa-dlc-workflows
/plugin install qadlc@qa-dlc-workflows
```

Add the marketplace from its **git source**, as above. A marketplace added by
direct URL to `marketplace.json` cannot resolve the relative plugin path, because
only that one file gets downloaded.

Then once per project:

```bash
qadlc init     # creates .qadlc/memory/{team,project}.md — commit these
```

That is the split: the engine is identical everywhere and lives in the plugin;
your tagging vocabulary, step-definition paths and style reference live in your
repo under `.qadlc/memory/`. See [INSTALL.md](harness/plugin/INSTALL.md) for
migration from a vendored copy, upgrades, and coexistence with QADLC v1.

### Vendored copy

Still supported, and still the only option for Kiro. Copy the generated tree in:

```bash
# Claude Code
cp -R dist/claude/.claude/ your-project/.claude/
cp    dist/claude/QA-CLAUDE.md your-project/QA-CLAUDE.md

# Kiro
cp -R dist/kiro/.kiro/ your-project/.kiro/
cp    dist/kiro/QA-AGENTS.md your-project/QA-AGENTS.md
```

Then `bun .claude/tools/qadlc.ts init` in the project.

> Do **not** run both. If a project vendors the tree and you also have the plugin
> installed, the plugin's hooks detect it and stand down — plugin and project
> hooks do not deduplicate, so without that they would each fire twice per edit.
> `qadlc doctor` reports which one is live.

### Using it

```
Using QADLC, write feature files for CLM-123
```

Pass flags after `/qadlc` to drive the engine directly: `--resume`,
`--scope <name>`, `--depth <level>`, `--stage <slug>` / `--phase <name>` (jump),
`--doctor`, `--version`.

Everything QADLC writes at runtime lives under `.qadlc/` in your project.

## Runtime requirement

The tools, hooks, and sensors run on **bun**. Verify an install with the one
QADLC command that does not itself need bun:

```bash
sh your-project/.claude/tools/qadlc-preflight.sh   # or .kiro/
```

The conductor runs this before its first `next` and stops on failure. That stop
is deliberate: without bun the framework does not degrade gracefully, it
degrades *silently* — every hook exits 127, which the harness treats as a
non-blocking error, so the stop hook's plan gate fails open while the conductor
still holds enough markdown to improvise feature files that nothing gated.

Harnesses without shell/hook support (Cursor-rules, Copilot) can still load the
markdown (conductor, stages, scopes) as a degraded, non-deterministic tier —
but that is a tier you *choose*, not one you fall into. The engine and sensors
need bun.

## Docs

- [User Guide](docs/guide/00-introduction.md) — using QADLC
- [Harness Engineer Guide](docs/harness-engineering/00-overview.md) — reshaping it (data, no code)
- [Developer Reference](docs/reference/00-overview.md) — the code and contracts
