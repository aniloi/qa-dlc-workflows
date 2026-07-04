# Gherkin Writing Rules

Enforced throughout Feature File Generation. The `gherkin-lint`, `step-existence`,
and `tag-policy` sensors (Phase 4) check the machine-checkable subset of these.

## Scenario structure
- Each scenario is **self-contained** — a reader understands setup, action, and
  expected outcome without reading other scenarios.
- Use `Background` **only** for setup shared by **every** scenario in the file.
  Never for steps shared by only some scenarios.
- Prerequisite steps (user/account/data setup) appear as explicit `Given` steps
  or in `Background` — never assumed implicitly.

## Scenario outlines
- Use `Scenario Outline` + `Examples` when **three or more** data variations test
  the same logical flow.
- For one or two variations, write separate named `Scenario`s — easier to read
  and debug.

## Step reuse
- **Always prefer** an existing parameterized step over a new one.
- If an existing step is close but not right, **flag it in Open Questions** — do
  not modify wording to force-fit and do not create a near-duplicate.
- New steps are listed in `gherkin_plan.md` under "New Step Definitions Required"
  and approved before use.

## Tagging strategy

| Tag | When |
|---|---|
| `@smoke` | Happy-path core-functionality scenarios; the minimum deploy set |
| `@regression` | Edge cases, error handling, boundary conditions |
| `@e2e` | Flows spanning multiple components/services |
| `@negative` | Error conditions, invalid input, failure modes |
| `@exploratory` | Draft scenarios from the exploratory scope (never shipping coverage) |
| Component tags | Match tags already used in the repo's existing feature files |

**Every shipping scenario has ≥1 scope tag (`@smoke`/`@regression`) AND ≥1
component tag.** Depth (`depth-levels.md`) sets how much negative/boundary/
data-driven coverage to include.

## Naming
- Feature files: `camelCase.feature` (e.g. `depositSmoke.feature`).
- Scenario names: concise, unique, descriptive of the specific behavior — not the
  user-story title.

## Declarative style
- Gherkin describes **what** the system does, not **how** to click through a UI.
- Match the abstraction level of the selected style reference.
