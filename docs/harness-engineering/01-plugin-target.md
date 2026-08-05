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

```
1. $QADLC_PROJECT_ROOT            — explicit override (tests, CI, --project-root)
2. $CLAUDE_PROJECT_DIR / $KIRO_PROJECT_DIR
                                  — set for hook processes
3. walk up from cwd, first match wins:
     a. a directory containing .qadlc/     (initialized QADLC project)
     b. a directory containing .git/       (repo root)
4. cwd
```

Step 2 alone is not enough. Tools like `qadlc next` are run by the **model via
Bash**, where `$CLAUDE_PROJECT_DIR` is not exported. Relying on bare cwd would
write state to the wrong place the moment the model `cd`s into a subdirectory —
a silent, data-losing failure. The walk-up is what makes Bash-invoked tools as
reliable as hooks.

**Guardrail.** After resolving, hard-fail if the result is inside a plugin cache
(`~/.claude/plugins/cache`) or equals `ENGINE_ROOT`:

```
QADLC could not determine your project root; it resolved to the plugin
install directory. Run from inside your project, or set QADLC_PROJECT_ROOT.
```

Cheap, and it makes the exact class of bug being fixed here impossible to
reintroduce silently.

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

1. **`{{QADLC_CMD}}`** replaces all 9 orchestrate refs plus the state/graph/sensor
   tool refs. Substitutes to `qadlc` or `bun .claude/tools/qadlc-orchestrate.ts`.
   This is the single biggest reduction.
2. **Prose stops naming engine paths entirely.** The engine already inlines
   `conductor.md` content into the first directive via `readPersona()` and already
   emits `stage_file`. Extend the directive payload with resolved absolute
   `persona_file`, `knowledge_dir`, and `sensor_files[]`, and change the prose
   from "read `{{HARNESS_DIR}}/knowledge/<agent>/`" to "read the `knowledge_dir`
   the directive names."

   This is the right call independent of plugins: the engine knows `ENGINE_ROOT`
   at runtime and can emit a correct absolute path; prose cannot. It also means
   `core/` prose becomes **byte-identical across all three targets**, which is
   exactly the "one generator, two targets" property the issue is protecting.
3. **`{{PROJECT_MEMORY_DIR}}`** for the 6 memory refs → `.claude/memory`
   (vendored) or `.qadlc/memory` (plugin).

After this, `{{HARNESS_DIR}}` should have no remaining uses in `core/`. Assert
that in the packager: fail the build if the token survives in a plugin-target
output. Cheap regression guard, same spirit as §4.3.

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

Current shape: `PostToolUse` matcher `Write|Edit` with two handlers → two bun
boots (~360 ms) on **every** file edit, whether or not QADLC is active.

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

## 8. v1 and vendored coexistence

### 8.1 Namespace runtime artifacts

Abandon the v1 path-compatibility choice (`qadlc-lib.ts:147`, "Kept as
`aidlc-docs/` to match QADLC v1"). New layout:

| Artifact | Was | Becomes |
|---|---|---|
| state | `aidlc-docs/qa-state.md` | `.qadlc/qa-state.md` |
| audit | `aidlc-docs/audit.md` | `.qadlc/audit.md` |
| sensor details | `aidlc-docs/.qadlc-sensors/<slug>/` | `.qadlc/sensors/<slug>/` |
| hook health | `.claude/tools/data/health/` | `.qadlc/health/` |
| plan | `gherkin_plan.md` | unchanged — a human-reviewed deliverable, belongs in the open |

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

The same mechanism answers the v1 case. Extend detection to
`.qa-dlc-rule-details/` and defer there too.

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
downloaded. Installation instructions must use the git source form.

### 9.2 Version handling — a trap worth avoiding

> "Setting `version` pins the plugin. If `plugin.json` declares `"version": "1.0.0"`,
> pushing new commits without changing that string does nothing for existing
> users."

The packager already bakes `VERSION` into `harness.json`. If it also writes
`version` into `plugin.json`, then forgetting to bump `VERSION` means teammates
silently never receive updates — the worst failure mode for a tool being actively
developed.

- **During development:** omit `version` from `plugin.json`. Every commit is a new
  version. `harness.json` keeps carrying `VERSION` for `qadlc --version`.
- **At release:** write `version`, and add the bump to a release checklist.

Never set it in both `plugin.json` and the marketplace entry — `plugin.json`
always wins, silently.

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
| **1. Path resolution** | §4 in full: three roots, delete `projectRootFromTool`, `resolveProjectRoot()` + guardrail, `mode`/`entryCmd` in `harness.json`, `hooksHealthDir` → project | `--check` clean; existing tests green; no target-specific behavior yet |
| **2. Namespacing** | §8.1 `.qadlc/` move, refuse-not-clobber guard, `.gitignore`, `qadlc migrate` | Migration tested against a fixture of both v1 and v2 `aidlc-docs/` |
| **3. Plugin target** | §7: `harness/plugin/`, `emit()`, `bin/qadlc`, `hooks/hooks.json`, exec bit + mode checking in `--check` | `claude plugin validate ./dist/plugin --strict` passes; **plan-gate test (§7.3) passes against a plugin install** |
| **4. Docs/token** | §6: `{{QADLC_CMD}}`, `{{PROJECT_MEMORY_DIR}}`, engine paths out of prose, `SKILL.md` absorbs `rules-qadlc.md`, fix the `.ts` token | Packager asserts no surviving `{{HARNESS_DIR}}` in the plugin target; `core/` prose byte-identical across targets |
| **5. Coexistence** | §8.2 cede-to-vendored, §8.3 trigger narrowing, `SessionStart` notice | Manual test: plugin installed + vendored tree present → each hook fires exactly once |
| **6. Publish** | §9.1 `marketplace.json`, install/upgrade docs, perf work from §7.2 | A teammate installs from a clean machine following only the written steps |
| **7. Retirement** | Remove `.qa-dlc-rule-details/` + old `QA-CLAUDE.md` from `qa_automation` `main`; revert §8.3 narrowing | Separate PR in `qa_automation`, reviewed there |

Phases 1–2 are pure refactors of the existing engine and are worth landing even
if the plugin work stalls: they fix a real bug (state clobber) and remove writes
to the install tree.

## 11. Open risks

| Risk | Handling |
|---|---|
| `harnessDir: ""` interacting badly with the orphan scan | Checked — `join`/`relative` behave correctly (§7.1). Residual risk is the token-substitution trap, covered by the Phase 4 assertion |
| Whether `if` can express a tool-agnostic rule (docs only show tool-scoped forms like `Edit(*.ts)`) | Assume tool-scoped; generate per-matcher groups. The §7.2 heartbeat fix is the unconditional win |
| Exec bit survival through the plugin cache copy | Assert in the Phase 3 install test, not by inspection |
| Walk-up project resolution picks a parent repo in nested-git or monorepo layouts | `.qadlc/` is checked before `.git/`, so an initialized project always wins. `$QADLC_PROJECT_ROOT` is the escape hatch |
| Plugin upgrade mid-session keeps the old `${CLAUDE_PLUGIN_ROOT}`; `/reload-plugins` is required | Document; `qadlc doctor` reports the running engine path and version |
| bun as a prerequisite | Unchanged in substance, but now a one-time install-side requirement. `SessionStart` should fail loudly and once, not per hook |

## 12. What this plan does not change

- The stage graph, scopes, sensors, conductor prose, and the two-phase method.
- `dist/claude` and `dist/kiro` behavior, except the §8.1 artifact paths (a
  breaking change for both, hence `qadlc migrate`).
- The generator's architecture. One core, N targets, `--check` as the drift
  guard, `emit()` for structural divergence — the plugin is the third row, which
  is the shape the packager was built for.
