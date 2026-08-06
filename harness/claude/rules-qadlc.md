# QADLC

When the user invokes QADLC (says "Using QADLC", or asks for BDD / Gherkin /
feature files), read and follow the conductor and its skill:

@.claude/skills/qadlc/SKILL.md
@.claude/qa-common/conductor.md

The conductor drives the deterministic engine at
`bun .claude/tools/qadlc.ts`. Do not author `.feature` files before
`gherkin_plan.md` is approved.
