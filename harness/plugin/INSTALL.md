# QADLC — install & upgrade

QADLC as a Claude Code plugin: installed once at user scope, available in every
project including ones that do not exist yet.

## Prerequisite

[bun](https://bun.sh) must be on your PATH. The engine, hooks and sensors all run
under it. As a plugin this is a one-time install-side requirement rather than a
tax on every repo that vendors the tree.

```bash
curl -fsSL https://bun.sh/install | bash   # or: brew install oven-sh/bun/bun
bun --version
```

## Install

```bash
/plugin marketplace add aniloi/qa-dlc-workflows
/plugin install qadlc@qa-dlc-workflows
```

Add the marketplace from its **git source**, as above. A marketplace added by
direct URL to `marketplace.json` cannot resolve the relative plugin path, because
only that one file gets downloaded.

## Per-project setup

Once, in each repo where you use QADLC:

```bash
qadlc init
```

That creates `.qadlc/memory/team.md` and `.qadlc/memory/project.md`. Fill them in
and commit them — they are the half of QADLC that is yours:

| Lives in the plugin (same everywhere) | Lives in your repo (differs per project) |
|---|---|
| stages, scopes, sensors, conductor, agents, engine | tagging vocabulary, step-definition paths, style-reference feature, house rules |

Everything QADLC writes at runtime goes under `.qadlc/`. Suggested `.gitignore`:

```gitignore
.qadlc/qa-state.md
.qadlc/audit.md
.qadlc/sensors/
.qadlc/diaries/
.qadlc/step-catalog.json
.qadlc/health/
# commit .qadlc/memory/ — it is your team's conventions
```

## Use

```
/qadlc                      start or continue; the engine routes
/qadlc --resume             re-enter an interrupted session
/qadlc --scope smoke        name the scope up front
qadlc doctor                environment & setup check
qadlc --version
```

## Migrating from a vendored copy

If a repo already has QADLC copied into `.claude/`, do this **in order**. The
first step is not optional:

1. **Remove the vendored hooks and the QADLC block from
   `.claude/settings.json`.** Plugin hooks and settings hooks do not deduplicate
   against each other — not even byte-identical ones — so leaving both in place
   fires every QADLC hook twice per event: duplicate audit entries, duplicate
   sensor findings, the plan gate evaluated twice.

   ```bash
   rm -rf .claude/tools .claude/hooks .claude/qa-common .claude/scopes \
          .claude/sensors .claude/agents .claude/knowledge .claude/skills/qadlc \
          .claude/rules/qadlc.md
   # then edit .claude/settings.json and delete the "hooks" entries naming qadlc-*
   ```

2. **Move runtime artefacts into `.qadlc/`.** Earlier versions wrote state and
   audit into `aidlc-docs/`:

   ```bash
   qadlc migrate --dry-run   # see what would move
   qadlc migrate
   ```

   It never deletes anything, skips rather than overwrites, and leaves a QADLC v1
   `qa-state.md` (one with no machine block) exactly where it is.

3. `rm QA-CLAUDE.md` if present — the skill replaces it.

4. Restart Claude Code, then `qadlc doctor` to confirm the engine, mode and
   project root.

## Coexisting with QADLC v1

v1 (`.qa-dlc-rule-details/` plus a v1-form `QA-CLAUDE.md`) can stay installed. v2
writes only under `.qadlc/` and cannot read v1 state, so the two do not collide
on disk.

They do overlap on **trigger words**, which is why this plugin's skill requires
an explicit "QADLC" / `/qadlc` rather than claiming bare "BDD" or "feature file".
Say "QADLC" when you want v2.

## Upgrade

```bash
/plugin marketplace update qa-dlc-workflows
```

A plugin that updates mid-session keeps using the previous version's path until
you run `/reload-plugins`. `qadlc doctor` prints the engine root actually in use.
