# Team Memory — Standing QADLC Conventions

> Team-owned, hand-editable. Loaded before every stage (see
> `stage-protocol.md` §5). A team rule here **wins on conflict** over a
> convention derived from the repo. The learning loop (`rules-and-learning.md`)
> promotes recurring corrections into this file so future runs load them instead
> of re-deriving them.

## Tagging policy

- Every shipping scenario carries ≥1 scope tag (`@smoke` / `@regression` /
  `@e2e`) and ≥1 component tag.
- `@smoke` = the minimal deploy-gate set; keep it small and fast.
- Draft scenarios from the `exploratory` scope are tagged `@exploratory` and are
  never counted as shipping coverage.
- **Jira mode**: when the workflow is started from a Jira key, every scenario must
  also carry `@allure.label.jira=<ISSUE-KEY>` (enforced by the `tag-policy`
  sensor). Optional for file/folder input.

## Naming

- Feature files: `kebab-case.feature` (no ticket numbers).
- Scenario names: specific behavior, unique across the suite, not the story title.

## Structure

- `Background` only for setup shared by every scenario in the file.
- `Scenario Outline` at ≥3 data variations; separate `Scenario`s for one or two.
- Declarative abstraction — behavior, not UI mechanics.

## Preferred step phrasings

<!-- Add reusable, house-standard step wordings here as the team converges on
them, e.g. "Given I am authenticated as a {word}". The step-existence sensor's
catalog is the machine-checkable companion to this human list. -->

## Additions from the learning loop

<!-- The conductor appends promoted rules here (dated). Keep this section append-only. -->
