# Changelog

All notable changes to QA-DLC Workflows will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **bun preflight (`tools/qadlc-preflight.sh`)** — a plain POSIX `sh` runtime
  gate, the one QADLC entry point that does not itself need bun and can
  therefore report bun missing. The conductor runs it before its first `next`
  and **stops** the session if it fails. Closes a silent-degradation hole:
  without bun every hook exited 127, which the harness treats as a non-blocking
  error, so the stop hook's plan-approval gate failed **open** while the
  conductor still held enough markdown to improvise ungated `.feature` files.
  `--doctor` cannot cover this case — it runs on bun.
- **Every Claude Code hook now runs behind the preflight.** With bun present the
  wrapper execs straight through, passing stdout and exit status untouched (the
  Stop hook's `decision:block` still reaches the harness). With bun missing,
  `SessionStart` reports it once per session in one line (`--brief`) and the
  per-turn hooks stay silent (`--quiet`), instead of four bare `command not
  found` errors on every edit in a repo whose owner may not be running QADLC at
  all. This hides no enforcement: a hook that cannot start fails open whether it
  exits 127 loudly or 0 silently.
- **Requirements + Verify sections** in the onboarding skeleton, so the bun
  prerequisite reaches the user's project (`QA-CLAUDE.md` / `QA-AGENTS.md`)
  rather than living only in the repo README. Both call out the
  non-interactive-shell PATH case, where `bun --version` works in the user's
  terminal but hooks and tool calls still cannot find it.
- **`/qadlc` flag surface** — the conductor forwards everything after `/qadlc` to
  the engine's `next` unchanged: `--resume` (resume with a choice menu),
  `--scope <name>` / `--depth <level>` (set or, mid-flight, change scope and
  coverage depth), `--stage <slug>` / `--phase <name>` (jump the stage pointer —
  refused into the execution phase until the plan is approved), `--doctor` (setup
  check), and `--version`. `next` stays read-only: a state-changing flag resolves
  to a `print` directive naming the exact `report` command to run.
- **Engine** — new `print` and `resume` directive types; `report` gains
  `--depth <level>` (depth config change) and `--jump <slug>` (recompute
  `completed[]` so the target runs next). The framework version is baked into
  `harness.json` so `--version` can report it.

---

## [v2.0.0] — 2026-07-03

Complete re-architecture. This branch (`v2`) replaces the pure-markdown rule
workflow with a deterministic, engine-driven implementation ported from the
AI-DLC v2 architecture. The v1 rule workflow is preserved on the `main` branch.

### Added

- **Build model** — author once in `core/`, generate per-harness trees
  (`dist/{claude,kiro}`) via `bun scripts/package.ts`, byte-for-byte drift-guarded
  with `--check`. Adding a harness is one `harness/<name>/` dir + manifest.
- **Engine/conductor split** — a deterministic engine (`qa-dlc-orchestrate.ts`
  `next`/`report`) drives a compiled stage graph; the conductor executes.
- **Scopes × depth** — smoke, single-story, regression, bugfix-repro, exploratory
  × Minimal/Standard/Comprehensive.
- **Sensors** — deterministic Gherkin checks (gherkin-lint, tag-policy,
  duplicate-scenario-name, step-existence) with a dispatcher.
- **Hooks** — auto-audit logging, sensor-fire, session start/end, and a **stop
  hook that blocks a `.feature` written before plan approval**.
- **Two-tier knowledge + team/project memory + a learning loop**, and
  `qa-dlc-session-cost` / `qa-dlc-replay` runner skills.
- **Test suite** — `bun test` covering schema, graph determinism, engine + plan
  gate, sensors, the stop-hook, and the packaging drift guard.

### Changed

- Repository root now holds the v2 workflow (`core/`, `harness/`, `scripts/`,
  `dist/`, `tests/`). The v1 `qa-dlc-rules/` tree is removed on this branch.

### Removed

- The v1 pure-markdown rule tree (`qa-dlc-rules/`) and v1 docs — preserved on `main`.

---

## [v1.0.0] — 2026-04-08

### Added

- **Core workflow** (`qa-dlc-rules/qa-dlc-core/core-workflow.md`) — full two-phase QA-DLC Gherkin authoring workflow
- **Common rule details**:
  - `welcome-message.md` — standardized welcome message displayed at workflow start
  - `process-overview.md` — high-level workflow overview and phase descriptions
  - `content-validation.md` — rules for validating all content before file creation
  - `question-format-guide.md` — formatting rules for questions asked during any phase
  - `session-continuity.md` — guidance for resuming interrupted sessions via `qa-state.md`
- **Discovery phase rule details**:
  - `workspace-detection.md` — repo structure detection, story input source detection (Jira/folder/default), style reference selection
  - `story-analysis.md` — acceptance criteria extraction, ambiguity flagging, open question generation
  - `convention-extraction.md` — Gherkin style convention extraction from existing feature files
  - `step-inventory.md` — step definition cataloging and domain grouping
  - `gherkin-plan.md` — `gherkin_plan.md` structure, story-to-scenario mapping table, plan approval gate
- **Execution phase rule details**:
  - `feature-file-generation.md` — Gherkin writing rules, per-file generation loop, checkbox enforcement
  - `cross-feature-check.md` — post-generation consistency validation across all newly written files
- **Documentation**:
  - `README.md` — Quick Start, per-agent setup (Claude Code, GitHub Copilot, AGENTS.md, Cursor, Cline), usage, workflow overview, tenets, troubleshooting, attribution
  - `docs/SETUP_GUIDE.md` — detailed setup walkthrough with framework layout requirements
  - `CONTRIBUTING.md` — contribution guidelines
  - `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
  - `LICENSE` — MIT
  - `VERSION` — v1.0.0

[v1.0.0]: https://github.com/aniloi/qa-dlc-workflows/releases/tag/v1.0.0
