# QADLC as a Claude Code Plugin — Implementation Plan

> Plan for [#2](https://github.com/aniloi/qa-dlc-workflows/issues/2). Written
> against `v2` @ `ced21e9`. No code yet — this document is the deliverable that
> precedes it.
>
> [Harness Engineer Guide](00-overview.md) · [Developer Reference](../reference/00-overview.md)

## 1. The one invariant

Everything below follows from a single rule:

> **The install tree is read-only. All mutable state lives under the project's
> `.qadlc/`.**

Today the engine violates this in one place (`hooksHealthDir` writes into
`.claude/tools/data/health/`) and gets away with it because the install tree *is*
the project. A plugin breaks that identity: `~/.claude/plugins/cache/<plugin>/<version>/`
is shared across every project and replaced on upgrade, with the old version
directory orphaned and deleted 14 days later. Stating the invariant up front turns
a scattered set of path fixes into one mechanical audit.

The corollary is the design's spine: **the code already models `engineRoot` and
`projectRoot` separately, then derives one from the other.** Cut that derivation
and the plugin target mostly falls out.

## 2. Corrections to the issue's premises

Three things in [#2](https://github.com/aniloi/qa-dlc-workflows/issues/2) are
wrong or incomplete in ways that change the design. Verified against
`code.claude.com/docs/en/plugins-reference`, `/docs/en/hooks`, and
`/docs/en/plugin-marketplaces`.

### 2.1 Plugin hooks never deduplicate against settings hooks — command strings are irrelevant

The issue says a plugin hook and a vendored `settings.json` hook "are different
command strings, so they do not deduplicate." The actual rule is stronger:

> "All matching hooks run in parallel. If you define the same handler in more than
> one settings file, it runs once. **A plugin's or skill's copy of the same handler
> stays separate.**"

So double-firing is unconditional — it would happen even if we contrived
byte-identical commands. This kills "make the command strings match" as a
mitigation and makes §8's cede-to-vendored rule load-bearing rather than nice to
have.

### 2.2 `${CLAUDE_PLUGIN_ROOT}` is not available to the Bash tool

The issue treats `${CLAUDE_PLUGIN_ROOT}` as generally available. It is not:

> "All three are exported as environment variables **to hook processes and to MCP
> and LSP server subprocesses**."

Inline substitution is per-component:

| Component | Placeholders resolve in |
|---|---|
| Skill and agent content | anywhere the placeholder appears |
| Hook and monitor commands | anywhere the placeholder appears |
| MCP / LSP configs | specific fields only |

Nothing exports it to the Bash tool. This matters because `orchestrateCmd()`
emits a command string **for the model to run in Bash**. A directive reading
`bun ${CLAUDE_PLUGIN_ROOT}/tools/qadlc-orchestrate.ts next` would have the shell
expand the unset variable to empty and run `bun /tools/qadlc-orchestrate.ts` —
a confusing failure, not a clean one.

Two consequences:

- Stage files, `qa-common/`, `scopes/`, and `sensors/` are **not** skill content.
  Placeholders in them are literal text. Never put `${CLAUDE_PLUGIN_ROOT}` there.
- `SKILL.md` and `agents/*.md` **are** skill/agent content, so the placeholder
  works there and only there.

### 2.3 `bin/` solves the entry-path problem outright

Not mentioned in the issue, and it collapses most of §5:

> **Executables** | `bin/` | "Executables added to the Bash tool's `PATH`. Files
> here are invokable as bare commands in any Bash tool call while the plugin is
> enabled"

This is the "single stable entry command" the issue asked us to consider, provided
by the platform. See §5.

## 3. Verified facts the plan relies on

| Fact | Consequence |
|---|---|
| Marketplace plugins are copied to `~/.claude/plugins/cache`; each version is its own directory; orphans deleted after 14 days | Install tree is ephemeral and shared → §1 |
| `${CLAUDE_PLUGIN_DATA}` is a persistent per-plugin dir surviving updates | Considered and rejected for health state — see §6.3 |
| Plugin `settings.json` supports **only** `agent` and `subagentStatusLine` | Hook config must be `hooks/hooks.json`; we cannot ship the current `settings.json` shape |
| A hook's `if` field uses permission-rule syntax and **skips the process spawn** when false | The real fix for the ~360 ms/edit cost — §7.2 |
| `if` holds exactly one rule; no `&&`, `||`, or lists | One handler per pattern; can't express "feature-or-plan" in a single `if` |
| Exec form (`args` present) skips the shell entirely | Use it for all plugin hooks |
| `SessionEnd` hooks share a **1.5 s** budget across all sources | `qadlc-session-end.ts` at ~180 ms is fine but not free — §7.2 |
| Plugin agents may not set `hooks`, `mcpServers`, `permissionMode` | Audited: all three QADLC agents declare only `name`, `description`, `model` — **no change needed** |
| Declaring `agents` in the manifest *replaces* the default scan | Leave `agents` undeclared |
| `skills` *adds* to the default `skills/` scan (except at a marketplace root) | Leave `skills` undeclared for the self-hosted shape |
| Relative subdirectory sources work: `"source": "./dist/plugin"` | Publish generated output; repo root is the marketplace — §9 |
| `version` in `plugin.json` **pins**; omit it and each commit is a new version | Omit during development, pin at release — §9.2 |
| Org-wide distribution via admin settings requires a **private or internal** marketplace repo | Direct input to the governance decision — §9.3 |
| Installed plugins cannot reference files outside their directory (`../` fails post-install) | No escape hatch back to project files except via resolved project root |

## 4. Path resolution redesign

### 4.1 Three roots, named explicitly

| Root | Meaning | Resolution |
|---|---|---|
| `ENGINE_ROOT` | read-only install tree | `dirname(dirname(fileURLToPath(url)))` — **unchanged** |
| `PROJECT_ROOT` | the user's repo | `resolveProjectRoot()` (below) |
| `STATE_ROOT` | mutable QADLC artifacts | `join(PROJECT_ROOT, ".qadlc")` |

`harnessDirFromTool` survives verbatim; it simply returns the plugin root instead
of `.claude`. Rename it `engineRootFromTool` for honesty, keeping a deprecated
alias for one release.

### 4.2 Delete `projectRootFromTool`

Do not fix its seven call sites individually — **delete the function**. The
compiler then enumerates every site, which turns a judgment call per file into a
mechanical migration with a definite end. Sites:

| File | Replacement |
|---|---|
| `core/tools/qadlc-lib.ts` (self-reference in `resolveProjectDirFromHook`) | inline into `resolveProjectRoot()` |
| `core/tools/qadlc-orchestrate.ts` L78 | `resolveProjectRoot()` |
| `core/tools/qadlc-sensor.ts` L29 | `resolveProjectRoot()` |
| `core/tools/qadlc-state.ts` L128 | `resolveProjectRoot()` |
| `core/tools/qadlc-audit.ts` L45 | `resolveProjectRoot()` |
| `core/tools/qadlc-sensor-tag-policy.ts` L26 | `resolveProjectRoot()` |
| `core/hooks/qadlc-validate-state.ts` L16 | `resolveProjectRoot()` |

`resolveProjectDirFromHook` also collapses into `resolveProjectRoot()` — there is
no longer any reason for hooks and tools to resolve the project differently.

### 4.3 `resolveProjectRoot()`

As implemented:

```
1. $QADLC_PROJECT_ROOT            — explicit override (tests, CI, scripts)
2. $CLAUDE_PROJECT_DIR / $KIRO_PROJECT_DIR
                                  — set for hook processes
3. vendored mode ONLY: dirname(ENGINE_ROOT)
4. walk up from cwd, whole ancestry per marker, in order:
     a. a directory containing .qadlc/     (initialized QADLC project)
     b. a directory containing .git/       (repo root)
5. cwd
```

Step 2 alone is not enough. Tools like `qadlc next` are run by the **model via
Bash**, where `$CLAUDE_PROJECT_DIR` is not exported. Relying on bare cwd would
write state to the wrong place the moment the model `cd`s into a subdirectory —
a silent, data-losing failure. The walk-up is what makes Bash-invoked tools as
reliable as hooks.

**Step 3 is a refinement the implementation forced, and it is load-bearing.** The
original four-step ladder sent vendored installs through the walk-up too, which
would have changed their behavior: a vendored project that happens to sit inside
a larger git repo would resolve to the outer repo rather than to the directory
holding its own `.claude/`. Ranking parent-of-engine above the walk-up in
vendored mode keeps `dist/claude` and `dist/kiro` bit-identical in behavior —
Phase 1 then provably changes nothing for existing users, which is what makes it
safe to land ahead of the plugin target. Plugin mode skips step 3 entirely, so it
gets the walk-up it needs.

The `.qadlc/`-before-`.git/` ordering scans the **whole ancestry for each marker**
rather than checking both at each level. An initialized QADLC project therefore
wins over any enclosing repo, however far up the `.git/` sits.

**Guardrail.** After resolving, hard-fail if the result is inside a plugin cache
(`~/.claude/plugins/cache`) or equals `ENGINE_ROOT`:

```
QADLC could not determine your project root; it resolved to the plugin
install directory. Run from inside your project, or set QADLC_PROJECT_ROOT.
```

Cheap, and it makes the exact class of bug being fixed here impossible to
reintroduce silently.

Tools raise this; hooks must not. `resolveProjectRootOrExit()` wraps the same
resolver and `exit(0)`s instead, because a hook that cannot locate the project
has to be a silent no-op — raising there would surface a QADLC error in an
unrelated repo, and for the `Stop` hook a nonzero exit is close to the blocking
path we must not touch by accident.

### 4.4 Mode flag

`tools/data/harness.json` gains two fields, reusing the existing `harnessData()`
seam rather than inventing a mechanism:

```json
{
  "harnessDir": ".claude",
  "rulesSubdir": "rules",
  "version": "2.1.0",
  "mode": "vendored",
  "entryCmd": "bun .claude/tools/qadlc-orchestrate.ts"
}
```

The plugin target emits `"mode": "plugin"`, `"entryCmd": "qadlc"`, and
`"harnessDir": ""`. `mode` gates exactly two behaviors: whether the legacy
parent-of-engine fallback is permitted in `resolveProjectRoot()` (vendored only),
and whether hooks cede to a vendored install (§8.2).

## 5. The entry command

### 5.1 `bin/qadlc`

Ship one executable at the plugin root:

```
bin/qadlc          # #!/usr/bin/env bun
```

It resolves its own location and dispatches subcommands:

| Command | Backing module |
|---|---|
| `qadlc next …` / `qadlc report …` | `tools/qadlc-orchestrate.ts` |
| `qadlc state …` | `tools/qadlc-state.ts` |
| `qadlc sensor …` | `tools/qadlc-sensor.ts` |
| `qadlc doctor` | orchestrate `--doctor` |
| `qadlc validate` | `hooks/qadlc-validate-state.ts` |
| `qadlc init` | scaffolds project `.qadlc/` — §6.4 |
| `qadlc migrate` | §8.3 |

`bin/qadlc` lives at `<plugin>/bin/qadlc`, so `dirname(dirname(import.meta.url))`
is the plugin root — the same two-levels-up shape `engineRootFromTool` already
implements. No new resolution logic.

Why a single binary rather than several: one PATH entry, one name to document, and
the audit trail records a stable command string rather than an absolute path that
changes on every plugin upgrade.

**Packaging detail:** the executable bit. `emitFile` uses `writeFileSync`, which
does not set mode. `emit()` must `chmodSync(0o755)` on `bin/qadlc`, and
`--check` must compare modes as well as bytes, or the exec bit will silently drift
and the plugin will fail with a permission error that the drift guard didn't catch.

### 5.2 Vendored mode keeps working

Vendored installs have no `bin/` on PATH, so the command string stays a
build-time decision read from `harness.json`:

- plugin → `qadlc`
- vendored → `bun .claude/tools/qadlc-orchestrate.ts`

`orchestrateCmd()` already reads `harnessData(HARNESS_ROOT).harnessDir`; it
becomes `harnessData(ENGINE_ROOT).entryCmd`. Same seam, one field over.

## 6. Docs and token migration

### 6.1 Actual scope

Measured on `v2`:

| Location | Count |
|---|---|
| `{{HARNESS_DIR}}` in `core/**/*.md` | **30** occurrences across **20** files |
| — of which engine-scoped | 24 |
| — of which project-scoped (`memory/`) | 6 |
| Hardcoded `.claude/` in `harness/claude/*.md` | 8 (5 in `skills/qadlc/SKILL.md`, 3 in `rules-qadlc.md`) |

`core/` contains **zero** hardcoded `.claude/`. The 30 tokens already substitute
at package time, so they flow to a new target for free. The 8 hardcoded refs live
in target-specific authored files that a `harness/plugin/` target replaces
anyway. The docs migration is therefore small — but the token itself is wrong.

### 6.2 The token conflates the two roots

Of the 24 engine-scoped refs, the overwhelming majority (9 of them) point at
`{{HARNESS_DIR}}/tools/qadlc-orchestrate.ts` — the entry command. The rest name
engine files the model is told to read: `qa-common/conductor.md`,
`agents/<lead_agent>.md`, `knowledge/<agent>/`, `scopes/`, `sensors/`. And 6
point at `memory/`, which is **project**-owned.

The resolution, in priority order:

1. **`{{QADLC_CMD}}`** replaces all 17 command refs. Substitutes to `qadlc`
   (plugin) or `bun .claude/tools/qadlc.ts` (vendored). The single biggest
   reduction.

   **This forced a design addition the plan had not anticipated.** The 17 refs
   name *five different tools* (orchestrate, state, graph, and five sensors), so
   one command token only works if every target exposes a uniform subcommand
   surface. `core/tools/qadlc.ts` is that dispatcher, and it is shared, not
   plugin-only: vendored installs get `bun .claude/tools/qadlc.ts state show`
   where they previously had `bun .claude/tools/qadlc-state.ts show`. The plugin's
   `bin/qadlc` is a byte-identical copy of the same file — the engine root is
   `dirname(dirname(url))` from both `<root>/tools/qadlc.ts` and `<root>/bin/qadlc`,
   so one source serves both locations with no extra process hop.

   Without the dispatcher this phase would have needed a token per tool
   (`{{QADLC_STATE_CMD}}`, `{{QADLC_SENSOR_CMD}}`, …), which is the shape the
   "one stable entry command" idea exists to avoid.
2. **Prose stops naming engine paths entirely.** The engine already inlines
   `conductor.md` content into the first directive via `readPersona()` and already
   emits `stage_file`. Extend the directive payload with resolved absolute
   `persona_file`, `knowledge_dir`, and `sensor_files[]`, and change the prose
   from "read `{{HARNESS_DIR}}/knowledge/<agent>/`" to "read the `knowledge_dir`
   the directive names."

   This is the right call independent of plugins: the engine knows `ENGINE_ROOT`
   at runtime and can emit a correct absolute path; prose cannot. Implemented as
   `agent_file`, `knowledge_dir` and `sensor_files[]` on the `run-stage` payload,
   resolved through one `enginePath()` helper that returns an absolute path in
   plugin mode and the familiar project-relative form when vendored.

   The "add a sensor" prose needed a different fix, not a directive field. Three
   refs told the model to author a manifest *into the install tree*. Under a
   plugin that tree is read-only and replaced on upgrade, so the instruction was
   not merely unportable but wrong. Those now point at the QADLC **source repo**
   (`core/sensors/…`) and say plainly that sensors reach projects through a
   release, with team memory as the place to record the rule meanwhile.
3. **No `{{PROJECT_MEMORY_DIR}}` token after all.** Memory is project-owned in
   *every* install mode, so it simply lives at `.qadlc/memory/` everywhere and
   prose names that literal path. All three targets now ship `templates/memory/`
   and materialize it with `qadlc init`; `qadlc migrate` moves an existing
   `.claude/memory/` across. One less token, one less divergence — and vendored
   installs stop treating team vocabulary as engine content that an upgrade would
   overwrite.

After this, `{{HARNESS_DIR}}` has no remaining uses in `core/` outside
`core/templates/onboarding.md`, the vendored-only onboarding skeleton where a
project-relative engine path is correct. The packager now fails the build on any
surviving `{{…}}` token in built `.md` output — verified by planting one.

### 6.2.1 Correction: "byte-identical prose" was not achievable

An earlier draft of §6.2 claimed this work makes `core/` prose **byte-identical
across all three targets**. It does not, and could not: the entry command itself
must differ, because a plugin is invoked as `qadlc` and a vendored tree as
`bun .claude/tools/qadlc.ts`.

What is achievable, and what now holds, is the property that actually matters:

> **Prose encodes the invocation, never the install layout.**

Measured after the rewrite: 16 `core/` markdown files still differ between
`dist/claude` and `dist/plugin`, and **all 16 differ only in the entry command** —
asserted by a test that normalizes both spellings and requires the remainder to
match exactly. Zero engine paths remain in shared prose.

The same rule had to be extended to engine *messages*, which the plan missed
entirely: `detect-scope`, the plan-gate block message, and the session-start
resume note each hardcoded `qadlc-orchestrate.ts …`. Those strings are read by the
model and would be unrunnable under a plugin, so they now route through a shared
`entryCommand()` helper.

### 6.3 `rules/qadlc.md` collapses into the skill

Confirmed there is no plugin equivalent:

> "A `CLAUDE.md` file at the plugin root is not loaded as project context. …To
> ship instructions that load into Claude's context, put them in a skill."

`harness/claude/rules-qadlc.md` contributes two things — the trigger, and
`@`-imports of `SKILL.md` + `conductor.md`. Under a plugin the skill *is* the
entry point, so the file has no counterpart and its content merges into
`harness/plugin/skills/qadlc/SKILL.md`. The `@`-imports disappear: the skill body
already is the instruction, and the conductor persona arrives inlined in the
first directive.

`SKILL.md` is skill content, so `${CLAUDE_PLUGIN_ROOT}` resolves there if needed.
It should rarely be needed once §6.2 lands.

Keep `rules-qadlc.md` in the `claude` (vendored) target unchanged. It is not dead
code; it is that target's ambient-context mechanism.

### 6.4 Fix the unsubstituted token in shipped TypeScript

Pre-existing bug, in scope because it is the same conflation. `transform()`
substitutes only on `.md`, but `core/hooks/qadlc-validate-state.ts:3` contains
`{{HARNESS_DIR}}` in a comment, so `dist/claude/.claude/hooks/qadlc-validate-state.ts`
ships the literal token:

```
// (bun {{HARNESS_DIR}}/hooks/qadlc-validate-state.ts) or wired as a hook. Reports
```

Rewrite the comment to use `{{QADLC_CMD}} validate` and either extend
substitution to `.ts` comments or — preferably — assert that no source file
contains the token outside `.md`. Extending the transform to `.ts` widens the
"ONE transform class" the packager deliberately keeps narrow; an assertion keeps
it narrow.

## 7. Plugin target packaging

### 7.1 `harness/plugin/manifest.ts`

The generator already has the needed abstraction. `HarnessManifest` carries
`harnessDir`, `coreDirs`, `harnessFiles`, `onboarding`, and an optional `emit()`
documented for precisely this case:

> "structural divergence that no declarative row can express (e.g. a shell's
> native config file or hook registration format)"

```
harness/plugin/
├── manifest.ts              # harnessDir: "", mode: "plugin", entryCmd: "qadlc"
├── emit.ts                  # .claude-plugin/plugin.json, hooks/hooks.json, bin/qadlc
├── skills/qadlc/SKILL.md    # absorbs rules-qadlc.md content (§6.3)
├── onboarding.fills.ts
└── bin-qadlc.ts             # source for bin/qadlc
```

`harnessDir: ""` makes the plugin root the tree root. Verified against Node's
`path` semantics, which is what `package.ts` uses throughout:

```
join("/tmp/out", "")                              → "/tmp/out"
relative(join("/tmp/out", ""), "/tmp/out/tools/a.ts") → "tools/a.ts"
```

So `harnessDirRoot` collapses to `outRoot` and the orphan scan's `authoredExempt`
patterns see paths relative to the tree root — exactly what a plugin wants. No
special-casing needed.

**One trap it creates:** `substituteToken` would turn `{{HARNESS_DIR}}/tools` into
`/tools` — an absolute path pointing at the filesystem root. Harmless only because
§6.2 removes the token entirely; the packager assertion there is what keeps it
harmless. Do not ship a plugin target that still substitutes the token.

`coreDirs` mostly carries over. Two changes:

- **Drop `memory`.** It is project-owned. It moves to `templates/memory/` in the
  plugin tree and is materialized into the project by `qadlc init` (§7.4).
- **No `settings.json` `harnessFile`.** Plugin `settings.json` supports only
  `agent` and `subagentStatusLine`; hooks go in `hooks/hooks.json`, written by
  `emit()`.

`emit()` writes:

| File | Notes |
|---|---|
| `.claude-plugin/plugin.json` | `name`, `displayName`, `description`, `author`, `repository`, `license`, `keywords`. **No `agents`/`skills` keys** — declaring them replaces the default scan. `version` omitted during development (§9.2) |
| `hooks/hooks.json` | exec form, `${CLAUDE_PLUGIN_ROOT}`, narrowed matchers (§7.2) |
| `bin/qadlc` | chmod `0o755` |

### 7.2 Hook configuration and the per-edit cost

**Measured in Phase 6, and the issue's numbers were wrong.** The brief claimed
~180 ms per hook spawn and ~360 ms per file edit. Actual, 20 runs each against
`dist/plugin` on this machine (bun 1.3.14):

| Case | ms/run |
|---|---|
| bare `bun` no-op — the floor | **41.6** |
| `qadlc-audit-logger.ts`, unrelated file | 61.4 |
| `qadlc-sensor-fire.ts`, unrelated file | 58.1 |
| `qadlc-audit-logger.ts`, a real `.feature` | 59.7 |
| `qadlc-stop.ts` | 56.8 |

(The non-floor rows include ~8 ms of `bash -c` harness overhead, so the true
per-hook figure is ~50–53 ms.)

So it is **~55 ms per hook and ~110 ms per file edit**, not 180/360. Roughly
**three quarters of that is bun's own startup**, and only ~11 ms is QADLC's logic.

That ratio is the important part, and it confirms the issue's instinct while
changing the reason: no amount of early-exit *inside* the TypeScript can help,
because the cost is paid before our first line runs. Only not spawning the process
helps.

The `if` field is the real fix because it skips the spawn:

> "If the command had been `npm test`, the `if` check would fail and
> `block-rm.sh` would never run, avoiding the process spawn overhead."

What the hooks actually care about:

- `qadlc-sensor-fire.ts`: `gherkin_plan.md` and `*.feature` only (L42–49).
- `qadlc-audit-logger.ts`: anything under the docs root, the plan, or `*.feature`
  (L58–59).

Since `if` takes exactly one rule and rules name a tool, this means separate
`matcher: "Write"` and `matcher: "Edit"` groups with one handler per pattern.
That is more JSON but it is generated, not hand-maintained.

**Deliberately NOT shipped — the patch is ready and gated on live verification.**
The exact change, for `harness/plugin/emit.ts`:

```js
// replace the single matcher "Write|Edit" group with, per tool ∈ {Write, Edit}:
{ matcher: tool, if: `${tool}(**/*.feature)`,       hooks: [auditLogger, sensorFire] }
{ matcher: tool, if: `${tool}(**/gherkin_plan.md)`, hooks: [auditLogger, sensorFire] }
{ matcher: tool, if: `${tool}(**/.qadlc/**)`,       hooks: [auditLogger] }
```

Why it is not in yet: the docs describe the rule syntax (`"Edit(*.ts)"` matching
TypeScript files) but there is **no way to verify the glob's matching semantics
without a live Claude Code session**, and the failure mode is silent. A pattern
that does not match means the audit trail stops being written and the sensors stop
firing, with nothing to indicate it — the same class of failure this phase refused
in Phase 3 for the same reason. Hedging by shipping both a narrowed and an
un-narrowed handler is not available either: both would match and the hook would
run twice.

Blocked on one manual check: install with `--plugin-dir`, edit an unrelated file
(expect no audit entry and no spawn), then write a `.feature` (expect an
`ARTIFACT_CREATED` entry and sensor output). Once confirmed, the win is the full
~110 ms on every non-QADLC edit, which is most edits.

A verifiable alternative was considered and set aside: merging `qadlc-audit-logger`
and `qadlc-sensor-fire` into one `PostToolUse` process halves the cost to ~55 ms
with no reliance on unverified semantics, and removes a duplicate `readState()` per
edit. It was not taken because it couples two concerns into one file for a smaller
win than the `if` narrowing already promises. Reconsider if live verification of
`if` fails.

Two fixes that pay off regardless of how far `if` gets us:

1. **Move the health heartbeat after the no-op checks.** `qadlc-audit-logger.ts`
   writes its heartbeat at L33–35, *before* parsing input, before the
   is-this-an-artifact test (L61), and before the state guard (L71). Every
   unrelated edit in every repo currently boots bun and writes a file.

   Phase 0 surfaced a second reason this must move, and it is not about
   performance: once §7.5 relocates the health dir into the project, a hook that
   otherwise correctly no-ops on a v1 project would still create `.qadlc/health/`
   there — a v2 directory appearing in a repo that has no v2 session. **The
   reorder must land with or before the health-dir move**, not after it.
2. **Set explicit `timeout`s.** Particularly `SessionEnd`, which shares a 1.5 s
   budget across all hook sources.

Do not narrow the `Stop` hook. It is the only enforcing one, and §7.3 applies.

### 7.3 The plan gate must survive

`core/hooks/qadlc-stop.ts` is the only hook that blocks. It reads
`auditPath(projectDir)` and `planPath(projectDir)` — both already
`projectRoot`-parameterized, so it needs no path change beyond §4.2. But it is
the component whose silent loss is worst, so it gets explicit coverage: a test
that installs the plugin target into a scratch project, writes a `.feature`
before plan approval, and asserts `{"decision":"block"}` on stdout. That test is
the phase-gate for §10 Phase 3.

### 7.4 Project memory discovery

Memory is **not read by any TypeScript** — `grep -rn memory core/tools core/hooks`
returns nothing. It is read by the *model*, at a path the prose names. So this is
a prose-and-scaffold problem, not a code problem, which is why §6.2's
`{{PROJECT_MEMORY_DIR}}` is most of the answer.

The remaining half is getting the files there. `qadlc init` copies
`templates/memory/{team,project}.md` to `<project>/.qadlc/memory/` if absent,
never overwriting. `SessionStart` checks for the directory and, if missing, emits
a note pointing at `qadlc init` — it must not create files itself, since
`SessionStart` fires in every repo the user opens and silently scattering
`.qadlc/` directories across unrelated projects is exactly the over-reach a
user-scope install invites.

Rejected: `userConfig` with `type: "directory"`. It is user-scoped and
`pluginConfigs` deliberately ignores project settings, so it cannot express a
per-project value. Convention-over-configuration is not just simpler here, it is
the only option the platform allows.

### 7.5 `hooksHealthDir` moves to the project

```
hooksHealthDir(projectRoot)  →  <projectRoot>/.qadlc/health/
```

Signature changes from `harnessDir` to `projectRoot`; `hookHarnessDirName` is
deleted (its only caller was `recordHookDrop`, which already receives
`projectRoot`). Add `.qadlc/health/` to the shipped `.gitignore`.

Rejected: `${CLAUDE_PLUGIN_DATA}`. It survives upgrades, which is the right
property, but it is only exported to hook processes — and `qadlc doctor`
**reads** the drop log (`qadlc-orchestrate.ts:468`) from a Bash-invoked tool where
the variable is unset. A state location that the writer can find and the reader
cannot is worse than a project-local file. Revisit only if cross-project health
aggregation becomes a requirement, and then via an explicit resolver rather than
the env var.

### 7.6 Found while packaging: the `/qadlc` skill frontmatter has never parsed

`claude plugin validate` rejected the new plugin's `SKILL.md`:

> `frontmatter: YAML frontmatter failed to parse … At runtime this skill loads
> with empty metadata (all frontmatter fields silently dropped).`

Checking the other targets showed the same failure in
`harness/claude/skills/qadlc/SKILL.md` **and** `harness/kiro/skills/qadlc/SKILL.md`
— shipped, at v2.0.0. The cause is one unquoted scalar:

```yaml
description: … deterministic engine-driven. Supports flags: --resume, …
```

A plain YAML scalar cannot contain `": "`. So `name:` and `description:` were both
being dropped at load time. The skill still resolved by directory basename, which
is why nobody noticed — but the `description` is the **entire trigger surface**,
so the model was matching `/qadlc` on an empty description. Fixed in all three
targets by single-quoting and replacing the inner colon with an em dash.

Two things worth taking from this beyond the fix:

- The vendored targets had no equivalent gate. `bun scripts/package.ts --check`
  guards *drift* between `core/` and `dist/`, not *validity* of what is shipped.
  `claude plugin validate --strict` is the first tool in this repo that reads the
  frontmatter at all, and it found a live bug within a minute of being pointed at
  the tree. It now runs as a test (skipping cleanly if the CLI is absent) and as
  `bun run plugin:validate`.
- **Confirmed fixed in a live session.** Loading `dist/plugin` with
  `--plugin-dir` lists `/qadlc:qadlc` with its complete description text. Before
  the fix that field was dropped at load time, so the skill's entire trigger
  surface was empty — the model had nothing to match `/qadlc` against beyond the
  directory name. Anyone on vendored v2.0.0 still has that bug.
- It is an argument for the plugin target beyond distribution: it subjects the
  shared `core/` surfaces to a schema checker the vendored path never had.

## 8. v1 and vendored coexistence

### 8.1 Namespace runtime artifacts

Abandon the v1 path-compatibility choice (`qadlc-lib.ts:147`, "Kept as
`aidlc-docs/` to match QADLC v1"). New layout:

| Artifact | Was | Becomes |
|---|---|---|
| state | `aidlc-docs/qa-state.md` | `.qadlc/qa-state.md` |
| audit | `aidlc-docs/audit.md` | `.qadlc/audit.md` |
| sensor details | `aidlc-docs/.qadlc-sensors/<slug>/` | `.qadlc/sensors/<slug>/` |
| stage diaries | `aidlc-docs/.qadlc-memory/<slug>/memory.md` | `.qadlc/diaries/<slug>/memory.md` |
| step catalog | `aidlc-docs/.qadlc/step-catalog.json` | `.qadlc/step-catalog.json` |
| hook health | `.claude/tools/data/health/` | `.qadlc/health/` (Phase 1) |
| plan | `gherkin_plan.md` | unchanged — a human-reviewed deliverable, belongs in the open |
| **story input** | `aidlc-docs/inception/user-stories/` | **unchanged — not ours** |

**Two rows this table was missing, and one that must not move.** The original
version listed only state, audit, sensors and health. Grepping the prose for the
migration turned up two more v2 namespaces — the per-stage conductor diaries and
the step catalog — that exist only in prose and in one sensor's bespoke path
walk, which is why a code-only survey missed them.

More important: `aidlc-docs/` is **not** a QADLC-owned directory to rename.
`aidlc-docs/inception/user-stories/` is an AIDLC **input** path that QADLC only
ever reads. So this is not "rename `aidlc-docs/` to `.qadlc/`" — it is "move
everything QADLC *writes* into its own namespace and leave the input path alone."
The distinction is called out in `workspace-detection.md` so a later reader does
not tidy it away.

**Diaries are `.qadlc/diaries/`, not `.qadlc/memory/`.** The obvious translation
of `.qadlc-memory/` would have collided head-on with §7.4, where the project's
hand-authored `team.md` / `project.md` land in `.qadlc/memory/`. Two unrelated
concepts, one directory — caught here rather than in Phase 3. "Diary" is already
the word the stage prose uses.

This is structural, not defensive: v2 no longer touches any path v1 owns, so
collisions 1 (state clobber) and 2 (mixed-format audit) cease to exist rather
than being guarded against. `DOCS_DIR` and `docsRoot()` remain the single place
this is expressed.

Keep the refuse-rather-than-clobber guard anyway, now on `.qadlc/qa-state.md`:
if the file exists without the `<!-- qa-state:machine` marker, error with a
migration message instead of overwriting. Belt and braces, and it costs four
lines.

**The safety property was only two-thirds true — Phase 0 established it.**

The issue (and an earlier draft of this section) claimed "every v2 hook opens with
`if (!state || !state.scope) exit(0)`, so no v2 hook acts on v1 data." Writing the
regression test disproved that for two of the five hooks, reproduced against
packaged v2.0.0:

| Hook | Guard before Phase 0 |
|---|---|
| `qadlc-stop.ts` | yes (L35) |
| `qadlc-session-start.ts` | yes (L18) |
| `qadlc-session-end.ts` | yes (L17) |
| `qadlc-audit-logger.ts` | **none** — it never imported `readState`. Its "session is active" proxy was `existsSync(auditPath)`, which a v1 project satisfies, so a `.feature` write appended a v2 `ARTIFACT_CREATED` block into v1's `audit.md` |
| `qadlc-sensor-fire.ts` | **partial** — state was read only on the `.feature` branch. `gherkin_plan.md` (a name v1 also produces) routed straight to the dispatcher, which appended `SENSOR_FAILED` to v1's `audit.md` and created `aidlc-docs/.qadlc-sensors/` |

So collision 2 (shared audit log, two formats) was not a latent risk awaiting the
plugin — it was live in the vendored tree. Both hooks now carry the standard
guard, and `tests/coexistence.test.ts` pins all five.

`readState()` requiring the machine marker remains the mechanism that
distinguishes v1 from v2, and §4 touches every one of those call sites — which is
exactly why the guard needed to be a test rather than an observation.

The dispatcher (`qadlc-sensor.ts`) is deliberately left unguarded: it appends
audit entries unconditionally, but it is only reachable from the hook or from
explicit invocation, where running it *is* the user's intent.

### 8.2 Cede to a vendored install

A user-scope plugin is live in every repo the user opens, including the ones with
a vendored `.claude/` tree — and per §2.1, plugin hooks never dedup against
settings hooks. Warning is not enough; the plugin must stand down.

Add to `qadlc-lib.ts`:

```
vendoredInstallPresent(projectRoot): boolean
  — any of .claude/hooks/qadlc-*.ts, .kiro/hooks/qadlc-*.ts
```

Every plugin hook calls it first and exits 0 when true. The vendored copy wins
while it exists, so a half-migrated repo behaves like a pre-migration repo rather
than a doubled one. The plugin's `SessionStart` also emits a one-line notice
naming the exact cleanup, so ceding is visible rather than mysterious:

```
QADLC: a vendored .claude/ harness is present; the plugin is standing down
for this project. To switch: rm -rf .claude/hooks/qadlc-*.ts .claude/tools
.claude/qa-common … and remove the QADLC hooks block from .claude/settings.json.
Then run: qadlc migrate
```

Detection is on a `qadlc-*.ts` **hook** in a harness dir, not on the tools dir:
hooks are what a `settings.json` registers and hooks are what would double-fire.
And only plugin-mode hooks cede — a vendored hook obviously must not stand down on
finding its own tree, which is why `shouldCedeToVendored()` checks
`harnessData(engineRoot).mode` first.

`SessionStart` explains the stand-down instead of going quiet, and `doctor`
reports it. A plugin that silently does nothing is harder to diagnose than one
that says why; the other four hooks exit without comment, since `PostToolUse`
would otherwise repeat the notice on every edit.

**Correction: do NOT extend ceding to v1.** An earlier draft of this section said
"the same mechanism answers the v1 case — extend detection to
`.qa-dlc-rule-details/` and defer there too." That is wrong, and would have been a
self-inflicted wound:

- v1 is **prose-only** — `.qa-dlc-rule-details/` plus a `QA-CLAUDE.md`. It ships no
  hooks and registers nothing in `settings.json`, so there is nothing to
  double-fire and no reason to stand down.
- v1 is committed on `main` in `DriveWealth/qa_automation`, so it is present on
  **every branch**. Ceding on v1 detection would make the plugin permanently inert
  in precisely the repository it exists to serve — the rollout would fail closed
  and look like the plugin was broken.

v1's real overlap with v2 is the **trigger vocabulary**, which §8.3 handles. So
the plugin stays fully active alongside v1 and `SessionStart` adds one line naming
which version is running.

### 8.3 Trigger disambiguation

With `rules/qadlc.md` gone, the skill's `description` frontmatter is the **entire**
trigger surface. v1's `QA-CLAUDE.md` claims "BDD, Gherkin, feature file"; the
current v2 skill claims the same words. While v1 is deployed, the plugin's
description must not.

Proposed: trigger on `QADLC`, `qa-dlc`, `/qadlc`, and multi-word phrasings v1 does
not claim ("gherkin plan", "feature file suite", "BDD workflow"). Bare "feature
file" is surrendered until v1 retires.

This is a deliberate, temporary loss of discoverability in exchange for
determinism, and it should be reverted in Phase 6 — record it in the skill as a
comment tied to the retirement task so it does not become permanent by neglect.

### 8.4 `qadlc migrate`

Real v2 state exists on the vendored copy (`DriveWealth/qa_automation`
@ `qa-dlc-v2`, `b1ef78343`), and real v1 state exists on
`quarantine-reporting` (41 tracked files under `aidlc-docs/`, `qa-state.md`
dated 2026-07-22, `audit.md` back to 2026-07-17). `migrate` must handle both:

1. If `aidlc-docs/qa-state.md` has the machine marker → v2 state. Move
   `qa-state.md`, `audit.md`, `.qadlc-sensors/` into `.qadlc/`. Report what moved.
2. If it lacks the marker → v1 state. **Leave it alone**, print that it was left
   in place and that v1 and v2 artifacts now live side by side without conflict.
3. Never delete. Removing `.qa-dlc-rule-details/` and the old `QA-CLAUDE.md` from
   `qa_automation` `main` is a reviewed commit in that repo, not something a
   migration script does behind the user's back.

### 8.5 v1 retirement is a separate, explicit deliverable

Phase 6. Until it lands, both live side by side — which the namespacing in §8.1
makes survivable indefinitely, so there is no deadline pressure to rush it.

## 9. Publishing and governance

### 9.1 Self-host first

Add `.claude-plugin/marketplace.json` at the repo root with
`"source": "./dist/plugin"` — confirmed to work, since relative paths resolve
against the marketplace root (the directory containing `.claude-plugin/`) and
resolve from a local clone of the marketplace.

Rationale unchanged from the issue: packaging can iterate without touching
`dw-agent-skills`, which the whole org depends on and whose current
`"source": "./"` shape would need restructuring into `plugins/<name>/` to host a
second plugin. Fold in later; `metadata.pluginRoot` makes that mechanical when
the time comes.

One caveat to document for teammates: a marketplace added by **direct URL to
`marketplace.json`** cannot resolve relative paths, because only that one file is
downloaded. Installation instructions must use the git source form — the README
and `INSTALL.md` both say so explicitly.

Shipped in Phase 6 and validated (`claude plugin validate . --strict`, exit 0):

```json
{
  "name": "qa-dlc-workflows",
  "owner": { "name": "aniloi", "url": "https://github.com/aniloi" },
  "plugins": [
    { "name": "qadlc", "source": "./dist/plugin", "category": "testing", "tags": [...] }
  ]
}
```

Note what is **absent**: no `version` on the entry. `plugin.json`'s value always
wins and does so silently, so setting both is how a stale manifest version masks
the one you meant to publish. A test asserts the entry carries no `version` and
that its `name` matches `plugin.json`'s — they are authored in separate files and
would otherwise drift.

`marketplace.json` is hand-authored at the repo root rather than generated: it
describes the repository *as* a marketplace, which is not a projection of `core/`
and does not belong to any target's manifest.

### 9.2 Version handling — a trap worth avoiding

> "Setting `version` pins the plugin. If `plugin.json` declares `"version": "1.0.0"`,
> pushing new commits without changing that string does nothing for existing
> users."

The packager already bakes `VERSION` into `harness.json`. If it also writes
`version` into `plugin.json`, then forgetting to bump `VERSION` means teammates
silently never receive updates — the worst failure mode for a tool being actively
developed.

**Decided the other way in Phase 3, and the reason matters.** `plugin.json` now
carries `version` from the `VERSION` file, from the start. Omitting it costs
`claude plugin validate --strict`, which warns on a missing version — and §7.6 is
the argument for keeping that gate: it caught a shipped bug the moment it was
wired up. Local development uses `--plugin-dir`, which bypasses versioning
entirely, so the every-commit-is-an-update convenience would only have applied to
teammates installing from the marketplace mid-development, a narrow window.

The trap is therefore live and must be handled by process: **bumping `VERSION` is
a release step.** Push commits without bumping it and existing users receive
nothing, silently. Never set `version` in both `plugin.json` and the marketplace
entry either — `plugin.json` wins, silently.

### 9.3 Governance: the org move has a technical trigger now

The issue frames the public-personal-repo problem as bus factor and access
control. There is a concrete mechanism too:

> "The marketplace repository must be **private or internal**. …To include private
> plugins, place the plugin folders inside the marketplace repository and
> reference them with a relative path."

Distributing QADLC through **Organization settings → Plugins** on a Team or
Enterprise plan therefore *requires* a private/internal repo in the DriveWealth
org. The current public personal repo cannot be distributed that way at all. So
the ownership move is not only hygiene — it gates the only zero-touch rollout
path. Resolve it before teammates install, as the issue says, and note that a
public repo can still be self-hosted per §9.1 in the interim (each user adds the
marketplace by hand).

The plugin/project split helps keep the public repo clean **by design**:
DriveWealth-specific vocabulary lives in the consuming repo's `.qadlc/memory/`,
never in `core/`. Guard it: a CI check that greps `core/` and `harness/` for
`allure.label.jira`, internal hostnames, and Confluence URLs.

## 10. Phasing

Each phase is independently committable and leaves `dist/claude` and `dist/kiro`
green (`bun scripts/package.ts --check`).

| Phase | Work | Exit criterion |
|---|---|---|
| **0. Guards** ✅ | `tests/coexistence.test.ts`: v1-safety property (§8.1), a path inventory of today's artifact locations, `$CLAUDE_PROJECT_DIR` precedence. Fixed the two missing hook guards the tests exposed | **Done.** `bun run check` green: typecheck, no drift, 47 pass / 3 skip |
| **1. Path resolution** ✅ | §4 in full: three roots, `projectRootFromTool` and `resolveProjectDirFromHook` deleted, `resolveProjectRoot()` + `…OrExit()` + guardrail, `mode`/`entryCmd` in `harness.json`, `orchestrateCmd()` reads `entryCmd`, `hooksHealthDir` → `.qadlc/health/`, heartbeat moved after the guards, `hookHarnessDirName` deleted | **Done.** `bun run check` green: no drift, 53 pass / 1 skip. Vendored `orchestrateCmd` output byte-identical; `--doctor` now reports mode + both roots |
| **2. Namespacing** ✅ | §8.1 `.qadlc/` move (state, audit, sensors, diaries, step catalog), refuse-not-clobber in `writeState`, both `.gitignore`s, `core/tools/qadlc-migrate.ts` with `--dry-run`, 30 prose paths rewritten, the step-existence sensor's bespoke walk-up folded into the shared resolver | **Done.** `bun run check` green: no drift, 60 pass / 0 skip. Migration verified against mixed v1+v2+`inception/` fixtures; a migrated session resumes correctly |
| **3. Plugin target** ✅ | §7: `harness/plugin/` (manifest, `emit`, `bin-qadlc.ts`, SKILL.md, INSTALL.md), `plugin.json` + `hooks/hooks.json` + `bin/qadlc` @ 0o755, `core/tools/qadlc-init.ts`, mode comparison in `--check`, memory shipped as `templates/memory/` | **Done.** `claude plugin validate --strict` passes (exit 0; verified it exits 1 on a broken tree); plan gate blocks under a plugin install; `bun run check` green across 3 targets, 71 pass. **Not verified: a live `claude --plugin-dir` session** — see §11 |
| **4. Docs/token** ✅ | §6: shared `core/tools/qadlc.ts` dispatcher + `{{QADLC_CMD}}` (17 refs), engine paths moved onto the `run-stage` payload (`agent_file`/`knowledge_dir`/`sensor_files`), memory unified at `.qadlc/memory/` in all targets, sensor-authoring prose repointed at the source repo, `entryCommand()` for model-facing messages, leftover-token build assertion | **Done.** `bun run check` green, 80 pass; validate --strict passes. 16 files still differ across targets and **all 16 differ only in the entry command** (asserted). `{{PROJECT_MEMORY_DIR}}` proved unnecessary; "byte-identical" was not achievable — see §6.2.1 |
| **5. Coexistence** ✅ | §8.2 `shouldCedeToVendored()` wired into all five hooks (plugin mode only), `SessionStart` stand-down notice with the exact cleanup, `doctor` reports it, §8.3 trigger narrowing documented in the skill with a retirement marker, v1-present note | **Done.** Gate met **as an automated test, not a manual one**: with plugin + vendored both live, the plugin's audit-logger/sensor-fire/session-end write nothing, the plugin's Stop stays silent, and the vendored Stop still blocks — exactly one `ARTIFACT_` entry per edit. Plus: v1 alone does not trigger ceding (§8.2 correction). `bun run check` green, 87 pass |
| **6. Publish** ◐ | §9.1 `.claude-plugin/marketplace.json` (validates `--strict`), README rewritten around plugin-first install with the vendored path kept, `harness/plugin/INSTALL.md` for migration/upgrade/v1 coexistence, marketplace↔plugin.json consistency tests, §7.2 measured | **Mostly done.** `bun run check` green, 92 pass. **Two items outstanding:** the `if` narrowing is deliberately deferred (patch written, gated on a live session — §7.2), and the exit criterion itself is unmet: nobody has installed from a clean machine following only the written steps |
| **7. Retirement** | Remove `.qa-dlc-rule-details/` + old `QA-CLAUDE.md` from `qa_automation` `main`; revert §8.3 narrowing | Separate PR in `qa_automation`, reviewed there |

Phases 1–2 are pure refactors of the existing engine and are worth landing even
if the plugin work stalls: they fix a real bug (state clobber) and remove writes
to the install tree.

## 11. Open risks

| Risk | Handling |
|---|---|
| **Live-session verification: mostly closed.** Confirmed by hand with `claude --plugin-dir ./dist/plugin` — see §11.1. Remaining: whether `hooks/hooks.json` actually fires, and agent registration | The session-less test cannot settle hook firing (see §11.1); it needs an **active** session so the state guard stops masking the answer. Same check unblocks the `if` patch in §7.2 |
| `if`-narrowed hook matchers not shipped | Deliberate. `hooks.json` mirrors `settings.json`'s matcher exactly; the `if` pass is Phase 6 where it can be measured. A non-matching `if` would silently stop the audit-logger and sensors, which is worse than being slow |
| `harnessDir: ""` interacting badly with the orphan scan | Checked — `join`/`relative` behave correctly (§7.1). Residual risk is the token-substitution trap, covered by the Phase 4 assertion |
| Whether `if` can express a tool-agnostic rule (docs only show tool-scoped forms like `Edit(*.ts)`) | Assume tool-scoped; generate per-matcher groups. The §7.2 heartbeat fix is the unconditional win |
| Exec bit survival through the plugin cache copy | Assert in the Phase 3 install test, not by inspection |
| Walk-up project resolution picks a parent repo in nested-git or monorepo layouts | `.qadlc/` is checked before `.git/`, so an initialized project always wins. `$QADLC_PROJECT_ROOT` is the escape hatch |
| Plugin upgrade mid-session keeps the old `${CLAUDE_PLUGIN_ROOT}`; `/reload-plugins` is required | Document; `qadlc doctor` reports the running engine path and version |
| bun as a prerequisite | Unchanged in substance, but now a one-time install-side requirement. `SessionStart` should fail loudly and once, not per hook |

### 11.1 Live-session findings

Run by hand: `claude --plugin-dir ./dist/plugin` in a scratch directory.

**Confirmed:**

| Claim | Evidence |
|---|---|
| Skills register, namespaced by plugin name | `/qadlc:qadlc`, `/qadlc:qadlc-replay`, `/qadlc:qadlc-session-cost` all listed |
| Invocation name comes from frontmatter `name` | listed as `qadlc`, not the directory basename |
| **§7.6 frontmatter fix works** | the full trigger description renders; before the fix every field was dropped |
| **`bin/` lands on the Bash tool's PATH** | `qadlc --version` → `QADLC 2.0.0` as a bare command |
| The engine's read-only directives round-trip | the `--version` reply carried `readonly: true` and the model reported it as such |
| Skill content actually steers the model | unprompted, it noted the plan gate applies to `.feature` writes and said it would report if the hook disagreed |
| **The Phase 1 heartbeat reorder works** | two file writes in a session-less repo created **no** `.qadlc/` at all. Before the reorder the audit-logger wrote its heartbeat ahead of the no-op checks, so any edit in any repo would have created `.qadlc/health/` |

`bin/` on PATH was the single largest design risk in this plan. Had it failed,
`entryCmd: "qadlc"` and the whole §6.2 token rewrite would have needed rethinking
in favour of engine-emitted absolute paths.

### 11.2 Hooks fire — confirmed, and two defects found doing it

The active-session test closed the last Phase 3 gap and found two real bugs in the
one hook that matters most.

**Confirmed live**, with a session started and a `.feature` written before approval:

| Claim | Evidence |
|---|---|
| `PostToolUse` fires from `hooks/hooks.json` | `ARTIFACT_CREATED` appended to `.qadlc/audit.md` |
| The sensor dispatcher fires | three sensor events recorded, including a `tag-policy` failure with 2 findings |
| The `Stop` hook fires and blocks | plan-gate block, repeatedly |
| §6.2's `entryCommand()` rewrite works | the block message reads `qadlc report --stage gherkin-plan --approved`, not a tool path |
| Detection is by extension, not directory | a `.feature` written to `scratch/` was caught |
| Sensors are advisory | `tag-policy` failed and the write still landed — as designed |

**Defect 1 — the hook ignored `stop_hook_active`.** `qadlc-stop.ts` never read its
stdin at all, so it re-blocked on every turn-end. Observed: nine consecutive
blocks before Claude Code force-overrode, and an identical `GATE_VIOLATION` row
appended each time to an append-only trail. The platform contract is explicit:

> "if your hook sees `"stop_hook_active": true`, it should either allow the stop
> or take a different action such as logging, rather than blocking again."

**Defect 2 — the advertised remedy did not work, which is the serious one.** The
block message tells you to approve the plan. Doing exactly that did **not** clear
the gate: the second check (`featureBeforeApproval`) stays true forever once a
feature precedes approval in the trail, so it kept blocking after approval.

That combination left a session with no honest exit, and it pointed the way out at
the one action that must never be automated — reporting an approval the human
never gave. A gate whose only escape is forging its own precondition is worse than
no gate, because it manufactures pressure to fake the evidence. The ordering check
is now **advisory**: it records the anomaly and lets work continue, since by the
time it is reachable the plan genuinely is approved.

Both defects are **pre-existing in vendored v2.0.0**, not introduced by the plugin
work. Neither was reachable by the existing tests, because both need a *sequence*
of turn-ends to manifest. Five regression tests now cover block-once, the
`stop_hook_active` contract, gate clearing after approval, single-row recording,
and a clean session never blocking.

**Still open** (recommendations from the live test, not yet built):

- `report --stage gherkin-plan --approved` is self-supplyable by the agent. Gating
  it behind something an agent cannot forge is a design question worth its own
  issue.
- There is no `qadlc abort`. A botched session has no clean reset short of
  `rm -rf .qadlc`.
- The gate is detective, not preventive: the file lands and the audit row commits
  before anything blocks. A `PreToolUse` hook would prevent instead — a real
  change in character, worth deciding deliberately.

**Superseded — the note below applied to the session-less test only.** With no active session,
the audit-logger's state guard exits 0, so "the hook fired and correctly no-op'd"
and "the hook never fired" produce identical observations: no audit entry, no
`.qadlc/`. Distinguishing them needs an **active** session, where a `.feature`
write must produce an `ARTIFACT_CREATED` entry *and* trip the plan gate:

```
qadlc report --scope smoke      # creates .qadlc/qa-state.md + audit trail
# then write any .feature and end the turn
```

Pass condition: `.qadlc/audit.md` gains an `ARTIFACT_CREATED` row **and** the Stop
hook blocks with the plan-gate message. That single test exercises the audit-logger
(PostToolUse) and the only enforcing hook at once. A block here is the *success*
signal, not a failure.

## 12. What this plan does not change

- The stage graph, scopes, sensors, conductor prose, and the two-phase method.
- `dist/claude` and `dist/kiro` behavior, except the §8.1 artifact paths (a
  breaking change for both, hence `qadlc migrate`).
- The generator's architecture. One core, N targets, `--check` as the drift
  guard, `emit()` for structural divergence — the plugin is the third row, which
  is the shape the packager was built for.
