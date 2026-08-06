# Tagging Taxonomy (shared knowledge)

> Tier-1 knowledge. The machine-checkable subset is enforced by the `tag-policy`
> sensor; team overrides live in `/memory/team.md`.

## Scope tags (exactly one class required per shipping scenario)

| Tag | Meaning |
|---|---|
| `@smoke` | Core happy-path; runs on every deploy. Keep the set small. |
| `@regression` | Edge, error, boundary, and data-driven coverage. |
| `@e2e` | Flows spanning multiple components/services. |
| `@exploratory` | Draft scenarios (never shipping coverage). |

## Component tags (at least one required)

Match the component tags already used in the repo's existing feature files —
e.g. `@account`, `@deposit`, `@auth`, `@schema`. The project's vocabulary is
recorded in `/memory/project.md`.

## Optional modifiers

`@negative` (error/invalid-input scenarios), plus any team-defined modifiers.

## Jira / Allure traceability

When a session is started from a Jira key (Jira mode), every scenario must carry
`@allure.label.jira=<ISSUE-KEY>` (e.g. `@allure.label.jira=CLM-5515`) so results
trace back to the ticket in Allure. The `tag-policy` sensor enforces this
automatically in Jira mode (it reads `story_source` from `qa-state.md`); for
file/folder input the tag is optional.
