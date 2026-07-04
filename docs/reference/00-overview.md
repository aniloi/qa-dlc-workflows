# QA-DLC v2 — Developer Reference

> [User Guide](../guide/00-introduction.md) · [Harness Engineer Guide](../harness-engineering/00-overview.md) · **Developer Reference**

For contributors changing QA-DLC's **code** — the engine, the compiler, hooks,
tools, the packager, the test suite.

## Path conventions

- **`core/…`** — hand-authored, harness-neutral source of truth. Edit here.
- **`dist/<harness>/…`** — generated, committed, drift-guarded. Never hand-edit.
- **`<harnessDir>/…`** (`.claude/`, `.kiro/`) — the runtime location in an
  installed project, where tools run and read/write state.

The only sanctioned text transform at build time is the `{{HARNESS_DIR}}` token
(+ the kiro `rules/`→`steering/` rename) applied to `.md` prose.

## The packager (`scripts/package.ts`)

Per harness, in order: copy `coreDirs` (token-substituted) → copy `harnessFiles`
(`projectRoot` files land at the dist root) → render the onboarding doc → write
`tools/data/harness.json` → **compile the stage graph** into `tools/data/` →
`emit()` (optional) → orphan scan. `--check` builds into a temp dir and
byte-diffs the committed `dist/`, exit 1 on any drift. Harnesses are discovered
from `harness/*/manifest.ts`.

## Tools (`core/tools/`, run on bun)

| Tool | Role |
|---|---|
| `qa-dlc-lib.ts` | zero-dep frontmatter parsing, path/harness resolution, hook-input helpers |
| `qa-dlc-stage-schema.ts` / `-scope-schema.ts` / `-sensor-schema.ts` | parse + validate the three declarative file types |
| `qa-dlc-graph.ts` | `compileGraph(root)` → `stage-graph.json` + `scope-grid.json`; cross-checks; `compile [--check]` CLI |
| `qa-dlc-state.ts` | tool-owned `qa-state.md` (human render + canonical `<!-- qa-state:machine -->` JSON) |
| `qa-dlc-audit.ts` | append-only `audit.md`; `appendAuditEntry()` |
| `qa-dlc-orchestrate.ts` | the **engine**: `next` (emit directive) / `report` (record outcome) |
| `qa-dlc-gherkin.ts` | dep-free `.feature` parser shared by sensors |
| `qa-dlc-sensor-*.ts` | per-sensor scripts (`--stage`/`--file-path` → JSON) |
| `qa-dlc-sensor.ts` | dispatcher: resolve a stage's sensors, filter by `matches`, run, write detail, audit |

## The directive contract

`next` prints one JSON directive:

```jsonc
{
  "type": "detect-scope" | "run-stage" | "gate" | "done",
  "conductor_persona": "…",   // only while nothing is completed (first move)
  "scope": "smoke", "depth": "Minimal",
  "stage": { "slug", "phase", "mode", "lead_agent", "support_agents",
             "gate", "foreach", "produces", "consumes", "sensors",
             "stage_file", "feature_files_total?", "feature_files_written?" }
}
```

`report` mutates `qa-state.md` + audit: `--scope` (init), `--stage <slug>`
(`--status` | `--approved --feature-count N` for the gate | `--file` / `--done`
for the foreach stage).

## Plan-gate invariant

Two enforcement points, both deterministic:
1. **Engine** — `next` never emits an Execution-phase `run-stage` while
   `plan_approved !== "YES"`; it re-emits the `gherkin-plan` gate instead.
   `gherkin-plan` only completes with `--approved`.
2. **Stop hook** (`qa-dlc-stop.ts`) — blocks the turn (`{"decision":"block"}`) if
   a `.feature` artifact appears in the audit with no preceding `PLAN_APPROVED`.

## Hooks (`core/hooks/`)

PostToolUse `qa-dlc-audit-logger` (artifact events) + `qa-dlc-sensor-fire`
(dispatch sensors on `.feature` writes); SessionStart/End; the Stop enforcer;
`qa-dlc-validate-state` (integrity vs. the scope grid). Hook imports use
`../tools/…` (hooks and tools are sibling dirs in every tree). Kiro reaches the
core hooks through `harness/kiro/hooks/qa-dlc-kiro-adapter.ts`.

## Tests (`tests/`, `bun test`)

`unit.test.ts` — schema parse/validate, gherkin parser, graph determinism +
cross-checks. `integration.test.ts` — engine flow + plan gate, sensors,
stop-hook block, and the packaging drift guard, all against a temp `dist/kiro`
copy.

## Adding an audit event or directive field

Update the emitter (`qa-dlc-audit.ts` / `qa-dlc-orchestrate.ts`), then extend the
relevant test in `tests/` — the suite is the contract.
